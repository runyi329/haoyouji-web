"""
补拉数据量异常的交易日（按天调用 Tushare daily 接口）
原因：按月拉取时 Tushare 单次返回上限 8000 条，月末日期被截断
修复：改为按天调用，每天最多 5500 条，不会超限
"""
import tushare as ts
import pymysql
import pandas as pd
import time
import logging

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'

DB_CONFIG = dict(
    host='124.223.54.69',
    port=3306,
    user='root',
    password='Miao@20190603',
    database='crm_db',
    charset='utf8mb4',
    connect_timeout=30,
    read_timeout=300,
    write_timeout=300
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s'
)
log = logging.getLogger(__name__)

ts.set_token(TOKEN)
pro = ts.pro_api()


def get_conn():
    return pymysql.connect(**DB_CONFIG)


def upsert_df(df):
    """按天 upsert ts_daily 数据"""
    if df is None or len(df) == 0:
        return 0
    df = df.where(pd.notnull(df), None)
    if 'change' in df.columns:
        df = df.rename(columns={'change': 'chg'})
    cols = list(df.columns)
    placeholders = ', '.join(['%s'] * len(cols))
    col_names = ', '.join([f'`{c}`' for c in cols])
    updates = ', '.join([f'`{c}`=VALUES(`{c}`)' for c in cols if c not in ['ts_code', 'trade_date']])
    sql = f"INSERT INTO `ts_daily` ({col_names}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}"
    rows = [tuple(row) for row in df.itertuples(index=False, name=None)]
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.executemany(sql, rows)
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def get_abnormal_dates():
    """查询所有数据量异常的交易日（与前后日期相比少30%以上）"""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT trade_date, COUNT(*) AS cnt FROM ts_daily GROUP BY trade_date ORDER BY trade_date")
        rows = cur.fetchall()
    finally:
        conn.close()

    data = [(r[0], int(r[1])) for r in rows]
    abnormal = []
    for i in range(1, len(data) - 1):
        prev_cnt = data[i-1][1]
        curr_date, curr_cnt = data[i]
        next_cnt = data[i+1][1]
        avg = (prev_cnt + next_cnt) / 2
        if curr_cnt < avg * 0.7:
            abnormal.append((curr_date, curr_cnt, int(avg)))
    return abnormal


def main():
    log.info("=" * 60)
    log.info("开始扫描并补拉数据量异常的交易日")
    
    abnormal = get_abnormal_dates()
    log.info(f"发现 {len(abnormal)} 个异常交易日")
    
    success = 0
    failed = []
    
    for i, (date, curr_cnt, expected) in enumerate(abnormal):
        log.info(f"[{i+1}/{len(abnormal)}] {date}: 当前 {curr_cnt} 条，预期约 {expected} 条")
        
        # 按天调用 Tushare
        for attempt in range(5):
            try:
                df = pro.daily(trade_date=date)
                if df is not None and len(df) > 0:
                    n = upsert_df(df)
                    log.info(f"  ✅ 补拉成功：{n} 条（Tushare返回 {len(df)} 条）")
                    success += 1
                    break
                else:
                    log.warning(f"  ⚠️ Tushare 返回空数据")
                    break
            except Exception as e:
                log.warning(f"  [重试{attempt+1}/5] {e}，等待{3*(attempt+1)}s")
                time.sleep(3 * (attempt + 1))
        else:
            log.error(f"  ❌ 补拉失败：{date}")
            failed.append(date)
        
        # Tushare 频率限制：每分钟最多200次，按天调用安全
        time.sleep(0.4)
    
    log.info("=" * 60)
    log.info(f"补拉完成：成功 {success}/{len(abnormal)} 个日期")
    if failed:
        log.info(f"失败日期：{failed}")
    
    # 补拉完成后重新构建趋势缓存
    log.info("开始重建趋势缓存...")
    import subprocess
    result = subprocess.run(['node', 'scripts/rebuild-trend-cache.mjs'], 
                          capture_output=True, text=True, cwd='/home/ubuntu/haoyouji-full')
    log.info(result.stdout[-500:] if result.stdout else "无输出")
    if result.returncode != 0:
        log.error(result.stderr[-200:] if result.stderr else "无错误信息")


if __name__ == '__main__':
    main()
