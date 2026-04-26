#!/usr/bin/env python3
"""
rebuild-trend-from-tushare.py
直接从 Tushare 拉取每日行情，计算高于/低于/持平首日开盘价的股票数量，
只把结果写入 ts_trend_cache，不存原始行情数据。

运行方式：python3 rebuild-trend-from-tushare.py [start_date] [end_date]
例如：python3 rebuild-trend-from-tushare.py 19960101 20260424
"""
import sys
import time
import pymysql
import tushare as ts
from datetime import datetime, timedelta

# ── 配置 ──────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = "5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79"
DB_HOST = "124.223.54.69"
DB_PORT = 3306
DB_USER = "root"
DB_PASS = "Miao@20190603"
DB_NAME = "crm_db"

MARKETS = {
    "all":  lambda code: True,
    "SH":   lambda code: code.startswith("6") and not code.startswith("688"),
    "SZ":   lambda code: code.startswith("0"),
    "GEM":  lambda code: code.startswith("3"),
    "STAR": lambda code: code.startswith("688"),
}

# ── 初始化 ────────────────────────────────────────────────────────────────────
pro = ts.pro_api(TUSHARE_TOKEN)

def get_db():
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASS, database=DB_NAME,
        charset="utf8mb4", connect_timeout=30
    )

def ensure_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ts_trend_cache (
                trade_date VARCHAR(8) NOT NULL,
                market VARCHAR(10) NOT NULL,
                above INT NOT NULL DEFAULT 0,
                below INT NOT NULL DEFAULT 0,
                equal_cnt INT NOT NULL DEFAULT 0,
                PRIMARY KEY (trade_date, market)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    conn.commit()

def get_all_trade_dates(start_date, end_date):
    """从 Tushare 获取交易日历"""
    df = pro.trade_cal(exchange='SSE', start_date=start_date, end_date=end_date, is_open='1')
    return sorted(df['cal_date'].tolist())

def get_first_open_prices():
    """从数据库获取已有的首日开盘价，如果没有则从 Tushare 获取"""
    conn = get_db()
    first_open = {}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ts_code, first_open FROM ts_first_open_cache")
            for row in cur.fetchall():
                first_open[row[0]] = float(row[1])
    except Exception:
        pass
    finally:
        conn.close()
    return first_open

def save_first_open_cache(first_open):
    """保存首日开盘价缓存"""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ts_first_open_cache (
                    ts_code VARCHAR(20) NOT NULL PRIMARY KEY,
                    first_open DECIMAL(10,2) NOT NULL,
                    first_date VARCHAR(8) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            for code, price in first_open.items():
                cur.execute("""
                    INSERT INTO ts_first_open_cache (ts_code, first_open, first_date)
                    VALUES (%s, %s, '00000000')
                    ON DUPLICATE KEY UPDATE first_open=VALUES(first_open)
                """, (code, price))
        conn.commit()
    finally:
        conn.close()

def get_cached_dates(market):
    """获取已缓存的交易日"""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT trade_date FROM ts_trend_cache WHERE market=%s", (market,))
            return set(row[0] for row in cur.fetchall())
    finally:
        conn.close()

def save_trend_result(results):
    """批量保存趋势结果"""
    if not results:
        return
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO ts_trend_cache (trade_date, market, above, below, equal_cnt)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal_cnt=VALUES(equal_cnt)
            """, results)
        conn.commit()
    finally:
        conn.close()

def process_day(trade_date, first_open):
    """处理单个交易日：从 Tushare 拉取，计算结果"""
    for attempt in range(3):
        try:
            df = pro.daily(trade_date=trade_date, fields='ts_code,close')
            if df is None or df.empty:
                return None
            break
        except Exception as e:
            if attempt == 2:
                print(f"  [{trade_date}] 拉取失败: {e}")
                return None
            time.sleep(2)

    # 计算各板块结果
    results = []
    stats = {m: {"above": 0, "below": 0, "equal": 0} for m in MARKETS}

    for _, row in df.iterrows():
        code = row['ts_code']
        close = row['close']
        if not close or close != close:  # NaN check
            continue
        fo = first_open.get(code)
        if not fo or fo <= 0:
            continue
        diff = (float(close) - fo) / fo
        if diff > 0.001:
            cat = "above"
        elif diff < -0.001:
            cat = "below"
        else:
            cat = "equal"
        for market, fn in MARKETS.items():
            if fn(code):
                stats[market][cat] += 1

    for market, s in stats.items():
        results.append((trade_date, market, s["above"], s["below"], s["equal"]))

    return results

def build_first_open_from_tushare(all_dates):
    """从 Tushare 逐步构建首日开盘价（按股票上市日期）"""
    print("从 Tushare 获取股票基本信息...")
    stock_basic = pro.stock_basic(fields='ts_code,list_date,list_status')
    # 合并所有状态（上市、退市、暂停）
    all_stocks = {}
    for _, row in stock_basic.iterrows():
        all_stocks[row['ts_code']] = row['list_date']

    print(f"共 {len(all_stocks)} 只股票，开始按上市日期获取首日开盘价...")
    first_open = {}
    
    # 按上市日期分组
    by_date = {}
    for code, list_date in all_stocks.items():
        if list_date not in by_date:
            by_date[list_date] = []
        by_date[list_date].append(code)

    processed = 0
    for list_date in sorted(by_date.keys()):
        codes = by_date[list_date]
        for attempt in range(3):
            try:
                df = pro.daily(trade_date=list_date, ts_code=','.join(codes[:50]), fields='ts_code,open')
                if df is not None and not df.empty:
                    for _, row in df.iterrows():
                        if row['open'] and row['open'] > 0:
                            first_open[row['ts_code']] = float(row['open'])
                # 如果超过50只，分批处理
                for i in range(50, len(codes), 50):
                    batch = codes[i:i+50]
                    df2 = pro.daily(trade_date=list_date, ts_code=','.join(batch), fields='ts_code,open')
                    if df2 is not None and not df2.empty:
                        for _, row in df2.iterrows():
                            if row['open'] and row['open'] > 0:
                                first_open[row['ts_code']] = float(row['open'])
                    time.sleep(0.3)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  [{list_date}] 获取首日开盘价失败: {e}")
                time.sleep(1)
        processed += 1
        if processed % 100 == 0:
            print(f"  首日开盘价进度: {processed}/{len(by_date)} 个上市日期，已获取 {len(first_open)} 只股票")
        time.sleep(0.3)

    return first_open

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    start_date = sys.argv[1] if len(sys.argv) > 1 else "19960101"
    end_date = sys.argv[2] if len(sys.argv) > 2 else datetime.now().strftime("%Y%m%d")

    print(f"=== 趋势缓存重建 {start_date} ~ {end_date} ===")

    # 确保表存在
    conn = get_db()
    ensure_table(conn)
    conn.close()

    # 获取交易日历
    print("获取交易日历...")
    all_dates = get_all_trade_dates(start_date, end_date)
    print(f"共 {len(all_dates)} 个交易日")

    # 获取首日开盘价
    print("加载首日开盘价缓存...")
    first_open = get_first_open_prices()
    if len(first_open) < 1000:
        print(f"缓存不足（{len(first_open)} 只），从 Tushare 重新获取...")
        first_open = build_first_open_from_tushare(all_dates)
        save_first_open_cache(first_open)
    print(f"首日开盘价已加载 {len(first_open)} 只股票")

    # 获取已缓存的日期（以 all 板块为准）
    cached = get_cached_dates("all")
    missing = [d for d in all_dates if d not in cached]
    print(f"需补充 {len(missing)} 个交易日（已有 {len(cached)} 个）")

    # 逐日处理
    total = len(missing)
    for i, trade_date in enumerate(missing):
        results = process_day(trade_date, first_open)
        if results:
            save_trend_result(results)
        if (i + 1) % 50 == 0 or (i + 1) == total:
            print(f"进度: {i+1}/{total} ({trade_date})")
        time.sleep(0.4)  # 避免 Tushare 限流

    print("\n=== 全部完成！===")

if __name__ == "__main__":
    main()
