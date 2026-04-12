"""
A股早期历史数据同步脚本（1990-1995年）
策略：按股票代码逐只拉取，指定起止日期为19900101~19951231
"""
import sys
import time
import logging
import pymysql
import tushare as ts
import pandas as pd
from datetime import datetime

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
LOG_FILE = '/root/sync_early.log'

# 服务器本地 MySQL 配置
DB_CONFIG = dict(
    host='127.0.0.1',
    port=3306,
    user='root',
    password='Runyi@2024',
    database='haoyouji',
    charset='utf8mb4',
    connect_timeout=10,
    read_timeout=300,
    write_timeout=300,
    autocommit=False,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)

pro = ts.pro_api(TOKEN)

UPSERT_SQL = """
INSERT INTO ts_daily
  (ts_code, trade_date, open, high, low, close, pre_close,
   `change`, pct_chg, vol, amount)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE
  open=VALUES(open), high=VALUES(high), low=VALUES(low),
  close=VALUES(close), pre_close=VALUES(pre_close),
  `change`=VALUES(`change`), pct_chg=VALUES(pct_chg),
  vol=VALUES(vol), amount=VALUES(amount)
"""

def ensure_table():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ts_daily (
                    ts_code    VARCHAR(12)  NOT NULL,
                    trade_date VARCHAR(8)   NOT NULL,
                    open       DECIMAL(12,4),
                    high       DECIMAL(12,4),
                    low        DECIMAL(12,4),
                    close      DECIMAL(12,4),
                    pre_close  DECIMAL(12,4),
                    `change`   DECIMAL(12,4),
                    pct_chg    DECIMAL(10,4),
                    vol        DECIMAL(20,4),
                    amount     DECIMAL(20,4),
                    PRIMARY KEY (ts_code, trade_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
        conn.commit()
        log.info("表结构确认完毕")
    finally:
        conn.close()

def upsert_df(df: pd.DataFrame):
    """写入一只股票的数据，遇到 nan 跳过该行"""
    cols = ['ts_code','trade_date','open','high','low','close',
            'pre_close','change','pct_chg','vol','amount']
    rows = []
    for _, r in df[cols].iterrows():
        vals = []
        skip = False
        for v in r:
            if pd.isna(v):
                vals.append(None)
            else:
                vals.append(v)
        rows.append(tuple(vals))

    if not rows:
        return 0

    conn = pymysql.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
        return len(rows)
    finally:
        conn.close()

def get_early_stocks():
    """获取1995年底前上市的所有股票"""
    df = pro.stock_basic(
        exchange='', list_status='L,D,P',
        fields='ts_code,name,list_date,delist_date'
    )
    df = df.dropna(subset=['list_date'])
    early = df[df['list_date'] <= '19951231'].copy()
    early = early.sort_values('list_date')
    return early

def main():
    log.info("=" * 60)
    log.info("开始补充同步 1990-1995 年 A 股历史数据")
    ensure_table()

    stocks = get_early_stocks()
    total = len(stocks)
    log.info(f"共找到 {total} 只在1995年底前上市的股票")

    success = 0
    skip = 0
    total_rows = 0

    for i, (_, row) in enumerate(stocks.iterrows(), 1):
        ts_code = row['ts_code']
        name = row['name']
        list_date = row['list_date']
        # 拉取从上市日到1995年底的数据
        end_date = min('19951231', datetime.today().strftime('%Y%m%d'))
        start_date = list_date

        log.info(f"  [{i}/{total}] {ts_code} {name} ({start_date}~{end_date})")

        for attempt in range(3):
            try:
                df = pro.daily(
                    ts_code=ts_code,
                    start_date=start_date,
                    end_date=end_date
                )
                break
            except Exception as e:
                log.warning(f"    拉取失败(第{attempt+1}次): {e}，等待5s...")
                time.sleep(5)
        else:
            log.error(f"    {ts_code} 拉取失败，跳过")
            skip += 1
            continue

        if df is None or df.empty:
            log.info(f"    无数据，跳过")
            skip += 1
            continue

        for attempt in range(3):
            try:
                n = upsert_df(df)
                total_rows += n
                log.info(f"    写入 {n} 条")
                success += 1
                break
            except Exception as e:
                log.warning(f"    写入失败(第{attempt+1}次): {e}，等待3s...")
                time.sleep(3)
        else:
            log.error(f"    {ts_code} 写入失败，跳过")
            skip += 1

        # Tushare 频率限制：每分钟500次，约120ms/次
        time.sleep(0.15)

        # 每50只输出一次汇总
        if i % 50 == 0:
            log.info(f"  --- 进度 {i}/{total}，已写入 {total_rows} 条 ---")

    log.info("=" * 60)
    log.info(f"早期数据同步完成！成功 {success} 只，跳过 {skip} 只，共写入 {total_rows} 条")

if __name__ == '__main__':
    main()
