"""
修正订单 #63 和 #64 的 confirmed_at 为实际开仓日期 2025-10-30 00:00:00
（当前错误值为 2026-04-05 21:24:38，是补录时的登记时间）
"""
import sys
import pymysql
from urllib.parse import urlparse, unquote

DATABASE_URL = sys.argv[1]

def parse_url(url):
    url = url.strip()
    if url.startswith('mysql+pymysql://'):
        url = 'mysql://' + url[len('mysql+pymysql://'):]
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or 3306
    user = unquote(parsed.username or '')
    pwd = unquote(parsed.password or '')
    db = parsed.path.lstrip('/').split('?')[0]
    return host, port, user, pwd, db

DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME = parse_url(DATABASE_URL)
print("连接: {}:{}/{}".format(DB_HOST, DB_PORT, DB_NAME))

conn = pymysql.connect(
    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
    database=DB_NAME, charset='utf8mb4', connect_timeout=30
)
print("数据库连接成功\n")

CORRECT_DATE = "2025-10-30 00:00:00"
ORDER_IDS = [63, 64]  # 正单 #63 + 赠与单 #64

with conn.cursor(pymysql.cursors.DictCursor) as cur:
    for order_id in ORDER_IDS:
        # 先查当前值
        cur.execute("SELECT id, confirmed_at, created_at, is_gift FROM af_orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        if not row:
            print("未找到订单 #{}，跳过".format(order_id))
            continue
        print("订单 #{}: confirmed_at={}, created_at={}, is_gift={}".format(
            row['id'], row['confirmed_at'], row['created_at'], row['is_gift']))
        
        # 更新 confirmed_at
        cur.execute(
            "UPDATE af_orders SET confirmed_at = %s WHERE id = %s",
            (CORRECT_DATE, order_id)
        )
        conn.commit()
        print("  → 已更新 confirmed_at 为 {}".format(CORRECT_DATE))

conn.close()
print("\n全部修正完成！")
