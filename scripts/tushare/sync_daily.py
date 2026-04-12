"""
Tushare 数据同步脚本 v5
核心修复：
- 彻底解决 executemany 内部多次 execute 共享连接导致超时问题
- 改为每条记录独立 execute，每批次独立连接（批次50条）
- 连接超时设置更短，快速失败快速重试
- 断点续传：每月完成后立即保存进度
"""
import tushare as ts
import pymysql
import pandas as pd
import time
import json
import os
import logging
import calendar
from datetime import datetime

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'

# 服务器本地连接（localhost，速度极快）
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
PROGRESS_FILE = '/root/tushare_sync_progress.json'
LOG_FILE = '/root/tushare_sync.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

ts.set_token(TOKEN)
pro = ts.pro_api()


def get_conn():
    return pymysql.connect(**DB_CONFIG)


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {}


def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f, indent=2, ensure_ascii=False)


def call_api(func, **kwargs):
    """带重试的API调用"""
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


def upsert_df_safe(df, table, unique_cols):
    """
    安全的批量写入方式：
    - 每批步500条，每批步独立建立新连接
    - 用 executemany 批量写入，连接超时设置为300秒
    - 每批步完成后立即关闭连接
    """
    if df is None or len(df) == 0:
        return 0

    # 清理NaN
    df = df.where(pd.notnull(df), None)
    # 重命名 change 列（MySQL保留字，已有表用 chg 存储）
    if 'change' in df.columns:
        df = df.rename(columns={'change': 'chg'})

    cols = list(df.columns)
    placeholders = ', '.join(['%s'] * len(cols))
    col_names = ', '.join([f'`{c}`' for c in cols])
    updates = ', '.join([f'`{c}`=VALUES(`{c}`)' for c in cols if c not in unique_cols])
    sql = f"INSERT INTO `{table}` ({col_names}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}"

    rows = [tuple(row) for row in df.itertuples(index=False, name=None)]

    batch_size = 2000  # 服务器本地连接，批步可以更大
    total = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        for attempt in range(5):
            try:
                conn = get_conn()  # 每批步独立新连接
                try:
                    cur = conn.cursor()
                    cur.executemany(sql, batch)  # 批量写入，连接超时300s足够
                    conn.commit()
                    total += len(batch)
                    break  # 成功，跳出重试
                finally:
                    try:
                        conn.close()
                    except Exception:
                        pass
            except Exception as e:
                log.warning(f"    批步写入失败(第{attempt+1}次): {e}，等待{2*(attempt+1)}s后重试...")
                time.sleep(2 * (attempt + 1))
        else:
            log.error(f"    批步写入失败5次，跳过该批步（{len(batch)}条）")

    return total


def gen_months(start_ym, end_ym):
    """生成月份列表，格式 YYYYMM"""
    months = []
    y, m = int(start_ym[:4]), int(start_ym[4:])
    ey, em = int(end_ym[:4]), int(end_ym[4:])
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def get_month_range(ym):
    """返回月份的起止日期字符串"""
    y, m = int(ym[:4]), int(ym[4:])
    start = f"{y}{m:02d}01"
    last_day = calendar.monthrange(y, m)[1]
    end = f"{y}{m:02d}{last_day:02d}"
    return start, end


def sync_daily(progress):
    """同步 ts_daily 日K线数据（按月分批）"""
    log.info("=" * 60)
    log.info("开始同步 ts_daily（日K线）")

    done_months = set(progress.get('daily_months', []))
    all_months = gen_months('199601', datetime.now().strftime('%Y%m'))
    todo = [m for m in all_months if m not in done_months]
    log.info(f"  已完成: {len(done_months)} 个月，待同步: {len(todo)} 个月")

    if not todo:
        log.info("  ts_daily 已全部同步！")
        return

    for i, ym in enumerate(todo):
        start, end = get_month_range(ym)
        log.info(f"  [{i+1}/{len(todo)}] ts_daily {ym} ({start}~{end})")

        df = call_api(pro.daily, start_date=start, end_date=end)
        if len(df) > 0:
            n = upsert_df_safe(df, 'ts_daily', ['ts_code', 'trade_date'])
            log.info(f"    写入 {n} 条（共 {len(df)} 条）")
        else:
            log.info(f"    无数据（非交易月）")

        done_months.add(ym)
        progress['daily_months'] = list(done_months)
        save_progress(progress)
        time.sleep(0.5)  # 控制API频率

    log.info("ts_daily 同步完成！")


def sync_daily_basic(progress):
    """同步 ts_daily_basic PE/PB数据（按月分批）"""
    log.info("=" * 60)
    log.info("开始同步 ts_daily_basic（PE/PB）")

    done_months = set(progress.get('daily_basic_months', []))
    all_months = gen_months('200401', datetime.now().strftime('%Y%m'))
    todo = [m for m in all_months if m not in done_months]
    log.info(f"  已完成: {len(done_months)} 个月，待同步: {len(todo)} 个月")

    if not todo:
        log.info("  ts_daily_basic 已全部同步！")
        return

    for i, ym in enumerate(todo):
        start, end = get_month_range(ym)
        log.info(f"  [{i+1}/{len(todo)}] ts_daily_basic {ym} ({start}~{end})")

        df = call_api(
            pro.daily_basic,
            start_date=start, end_date=end,
            fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,total_share,float_share,free_share,total_mv,circ_mv'
        )
        if len(df) > 0:
            n = upsert_df_safe(df, 'ts_daily_basic', ['ts_code', 'trade_date'])
            log.info(f"    写入 {n} 条（共 {len(df)} 条）")
        else:
            log.info(f"    无数据（非交易月）")

        done_months.add(ym)
        progress['daily_basic_months'] = list(done_months)
        save_progress(progress)
        time.sleep(0.3)

    log.info("ts_daily_basic 同步完成！")


if __name__ == '__main__':
    import argparse
    progress = load_progress()

    parser = argparse.ArgumentParser()
    parser.add_argument('--task', default='all', choices=['all', 'daily', 'daily_basic'])
    args = parser.parse_args()
    task = args.task
    log.info(f"启动同步任务: task={task}")

    if task in ('all', 'daily'):
        sync_daily(progress)

    if task in ('all', 'daily_basic'):
        sync_daily_basic(progress)

    log.info("全部同步完成！")
