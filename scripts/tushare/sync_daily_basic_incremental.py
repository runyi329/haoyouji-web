"""
ts_daily_basic 增量同步脚本
只同步最新日期之后缺失的数据
"""
import tushare as ts
import pymysql
import pandas as pd
import time
import logging
from datetime import datetime, timedelta

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
DB_CONFIG = dict(
    host='127.0.0.1',
    user='root',
    password='Miao@20190603',
    database='crm_db',
    charset='utf8mb4',
    connect_timeout=10,
    read_timeout=300,
    write_timeout=300
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger(__name__)

ts.set_token(TOKEN)
pro = ts.pro_api()

def get_conn():
    return pymysql.connect(**DB_CONFIG)

def call_api(func, **kwargs):
    for i in range(5):
        try:
            df = func(**kwargs)
            if df is not None and len(df) > 0:
                return df
            time.sleep(2)
        except Exception as e:
            log.warning(f"  [重试{i+1}/5] {e}，等待{3*(i+1)}s")
            time.sleep(3 * (i + 1))
    return pd.DataFrame()

def upsert_batch(df, table, unique_cols):
    if df.empty:
        return 0
    cols = list(df.columns)
    placeholders = ', '.join(['%s'] * len(cols))
    update_clause = ', '.join([f"`{c}` = VALUES(`{c}`)" for c in cols if c not in unique_cols])
    sql = f"INSERT INTO `{table}` ({', '.join([f'`{c}`' for c in cols])}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {update_clause}"
    
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            rows = [tuple(None if pd.isna(v) else v for v in row) for row in df.itertuples(index=False)]
            cur.executemany(sql, rows)
        conn.commit()
        return len(rows)
    finally:
        conn.close()

def main():
    # 查询当前最新日期
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(trade_date) FROM ts_daily_basic")
            row = cur.fetchone()
            latest = row[0] if row and row[0] else '20260331'
    finally:
        conn.close()
    
    log.info(f"ts_daily_basic 当前最新日期: {latest}")
    
    # 计算需要同步的日期范围
    latest_dt = datetime.strptime(str(latest), '%Y%m%d')
    start_dt = latest_dt + timedelta(days=1)
    end_dt = datetime.now()
    
    if start_dt > end_dt:
        log.info("数据已是最新，无需同步")
        return
    
    start_str = start_dt.strftime('%Y%m%d')
    end_str = end_dt.strftime('%Y%m%d')
    
    log.info(f"同步范围: {start_str} ~ {end_str}")
    
    # 按周分批同步（避免单次请求数据量过大）
    current = start_dt
    total_inserted = 0
    
    while current <= end_dt:
        batch_end = min(current + timedelta(days=6), end_dt)
        s = current.strftime('%Y%m%d')
        e = batch_end.strftime('%Y%m%d')
        
        log.info(f"  同步 {s} ~ {e} ...")
        df = call_api(
            pro.daily_basic,
            start_date=s, end_date=e,
            fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,total_share,float_share,free_share,total_mv,circ_mv'
        )
        
        if not df.empty:
            n = upsert_batch(df, 'ts_daily_basic', ['ts_code', 'trade_date'])
            total_inserted += n
            log.info(f"    写入 {n} 条")
        else:
            log.info(f"    无数据（非交易日）")
        
        current = batch_end + timedelta(days=1)
        time.sleep(0.5)
    
    log.info(f"同步完成！共写入 {total_inserted} 条")
    
    # 验证最新日期
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(trade_date), COUNT(*) FROM ts_daily_basic")
            row = cur.fetchone()
            log.info(f"同步后最新日期: {row[0]}，总数据量: {row[1]}")
    finally:
        conn.close()

if __name__ == '__main__':
    main()
