"""
回填订单063和065（ETH）及其赠与单的历史最低价和档位
2026-02-06 ETH 日线最低价：1748.63

订单063：买入价3850，开仓2025-10-30，应触发到第5档（跌50%=1925，1748.63<1925）
订单065：买入价3014，开仓2025-11-28，应触发到第4档（跌40%=1808.4，1748.63<1808.4）
"""
import sys
import re
import pymysql
from datetime import datetime, timezone

DATABASE_URL = sys.argv[1]

def parse_url(url):
    m = re.match(r'mysql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+)', url)
    if not m:
        raise ValueError("无法解析 DATABASE_URL: " + url[:40])
    user, pwd, host, port, db = m.groups()
    return host, int(port or 3306), user, pwd, db

DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME = parse_url(DATABASE_URL)
print("连接: {}:{}/{}".format(DB_HOST, DB_PORT, DB_NAME))

conn = pymysql.connect(
    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
    database=DB_NAME, charset='utf8mb4', connect_timeout=30
)
print("数据库连接成功")

ALL_TIME_LOW = "1748.63"
ALL_TIME_LOW_AT_STR = "2026-02-06 00:00:00"
ALL_TIME_LOW_AT_MS = int(datetime(2026, 2, 6, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)

TARGET_ORDERS = [
    {"buy_price": 3850, "confirmed_from": "2025-10-28", "confirmed_to": "2025-11-05", "label": "订单063"},
    {"buy_price": 3014, "confirmed_from": "2025-11-25", "confirmed_to": "2025-12-01", "label": "订单065"},
]

with conn.cursor(pymysql.cursors.DictCursor) as cur:
    for target in TARGET_ORDERS:
        print("\n========== 处理 {} (买入价{}) ==========".format(target["label"], target["buy_price"]))

        cur.execute(
            "SELECT id, coin, limit_price, confirmed_at FROM af_orders"
            " WHERE coin='ETH' AND status='completed'"
            " AND confirmed_at BETWEEN %s AND %s"
            " AND (is_gift IS NULL OR is_gift=0)"
            " AND (source_order_id IS NULL OR source_order_id=0)"
            " ORDER BY ABS(CAST(limit_price AS DECIMAL(20,8)) - %s) ASC LIMIT 3",
            (target["confirmed_from"], target["confirmed_to"], target["buy_price"])
        )
        candidates = cur.fetchall()
        print("候选正单:", [(o["id"], o["limit_price"], str(o["confirmed_at"])) for o in candidates])

        if not candidates:
            print("未找到 {}，跳过".format(target["label"]))
            continue

        main_order = candidates[0]
        print("选定正单 #{}，买入价 {}".format(main_order["id"], main_order["limit_price"]))

        cur.execute(
            "SELECT id FROM af_orders WHERE source_order_id=%s AND coin='ETH'",
            (main_order["id"],)
        )
        gift_orders = cur.fetchall()
        print("赠与单({} 笔): {}".format(len(gift_orders), [o["id"] for o in gift_orders]))

        all_order_ids = [main_order["id"]] + [o["id"] for o in gift_orders]
        buy_price = float(main_order["limit_price"])

        drop_pct = (buy_price - float(ALL_TIME_LOW)) / buy_price
        max_tier = min(int(drop_pct / 0.1), 9)
        print("跌幅: {:.2f}%，应触发到第{}档".format(drop_pct * 100, max_tier))

        for order_id in all_order_ids:
            cur.execute(
                "SELECT id, all_time_low_price FROM af_order_scan_stats WHERE order_id=%s",
                (order_id,)
            )
            stats = cur.fetchone()

            if stats:
                current_low = float(stats["all_time_low_price"]) if stats["all_time_low_price"] else 999999
                if float(ALL_TIME_LOW) < current_low:
                    cur.execute(
                        "UPDATE af_order_scan_stats SET all_time_low_price=%s, all_time_low_at=%s, updated_at=NOW() WHERE order_id=%s",
                        (ALL_TIME_LOW, ALL_TIME_LOW_AT_STR, order_id)
                    )
                    conn.commit()
                    print("  订单#{} 更新最低价: {} -> {}".format(order_id, current_low, ALL_TIME_LOW))
                else:
                    print("  订单#{} 当前最低价{}已更低，跳过".format(order_id, current_low))
            else:
                cur.execute(
                    "INSERT INTO af_order_scan_stats (order_id, coin, scan_count, last_scan_at, last_low_price, all_time_low_price, all_time_low_at, created_at, updated_at)"
                    " VALUES (%s, 'ETH', 1, %s, %s, %s, %s, NOW(), NOW())",
                    (order_id, ALL_TIME_LOW_AT_STR, ALL_TIME_LOW, ALL_TIME_LOW, ALL_TIME_LOW_AT_STR)
                )
                conn.commit()
                print("  订单#{} 插入新扫描统计记录".format(order_id))

            cur.execute(
                "SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id=%s",
                (order_id,)
            )
            row = cur.fetchone()
            current_max_tier = int(row["maxTier"]) if row else 0
            print("  订单#{} 当前最高档位: {}，需要补录到第{}档".format(order_id, current_max_tier, max_tier))

            if current_max_tier >= max_tier:
                print("  订单#{} 档位已足够，跳过".format(order_id))
                continue

            cur.execute("SELECT ledger_id FROM af_orders WHERE id=%s", (order_id,))
            order_info = cur.fetchone()
            ledger_id = order_info["ledger_id"] if order_info else 0

            for tier in range(current_max_tier + 1, max_tier + 1):
                tier_price = "{:.2f}".format(buy_price * (1 - tier * 0.1))
                cur.execute(
                    "INSERT INTO af_order_tier_triggers (order_id, ledger_id, coin, tier, trigger_price, triggered_at, created_at)"
                    " VALUES (%s, %s, 'ETH', %s, %s, %s, NOW())",
                    (order_id, ledger_id, tier, tier_price, ALL_TIME_LOW_AT_MS)
                )
                conn.commit()
                print("  订单#{} 补录第{}档，触发价 {}".format(order_id, tier, tier_price))

conn.close()
print("\n全部回填完成！")
