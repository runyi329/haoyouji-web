#!/usr/bin/env python3
"""
build_us_lifecycle.py
从 Tushare 拉取美股全历史日线数据，计算每只股票全生命周期涨/跌/平天数
存入 us_stock_lifecycle 表（汇总统计，不存储原始日线数据）

运行: python3 build_us_lifecycle.py
支持断点续传：已处理的股票自动跳过

策略：
1. 从 Tushare us_basic 拉取全部美股列表（约1万只）
2. 对每只股票，调用 us_daily 按时间段分批拉取全历史数据
3. 直接计算涨/跌/平天数，写入 us_stock_lifecycle
4. 频率控制：每次请求后等待 1.2 秒
"""

import time
import json
import logging
import urllib.request
import urllib.error
import pymysql
import sys

# ─── 配置 ────────────────────────────────────────────────────────────────────
TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
TUSHARE_URL = 'http://api.tushare.pro'
DB_CONFIG = {
    'host': '124.223.54.69',
    'port': 3306,
    'user': 'root',
    'password': 'Miao@20190603',
    'database': 'crm_db',
    'charset': 'utf8mb4',
    'connect_timeout': 30,
    'read_timeout': 300,
    'write_timeout': 300,
}
REQUEST_INTERVAL = 1.2  # 每次请求间隔（秒）
LOG_FILE = '/root/us_lifecycle.log'

# ─── 日志 ─────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)

# ─── Tushare 请求 ─────────────────────────────────────────────────────────────
def call_tushare(api_name, params, fields='', retry=3):
    body = json.dumps({
        'api_name': api_name,
        'token': TUSHARE_TOKEN,
        'params': params,
        'fields': fields,
    }).encode('utf-8')
    for attempt in range(retry):
        try:
            req = urllib.request.Request(
                TUSHARE_URL,
                data=body,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode('utf-8'))
            if result.get('code') != 0:
                msg = result.get('msg', 'unknown error')
                if '每分钟' in msg or 'limit' in msg.lower() or '频率' in msg:
                    log.warning(f'[{api_name}] 频率限制，等待65秒后重试...')
                    time.sleep(65)
                    continue
                raise Exception(f'Tushare error: {msg} (code={result.get("code")})')
            return result['data']
        except urllib.error.URLError as e:
            log.warning(f'[{api_name}] 网络错误 (attempt {attempt+1}/{retry}): {e}')
            time.sleep(5)
    raise Exception(f'[{api_name}] 请求失败，已重试 {retry} 次')

# ─── 数据库 ───────────────────────────────────────────────────────────────────
def get_conn():
    return pymysql.connect(**DB_CONFIG)

def init_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS us_stock_lifecycle (
                ts_code     VARCHAR(20)   NOT NULL PRIMARY KEY,
                name        VARCHAR(100),
                enname      VARCHAR(200),
                classify    VARCHAR(10),
                list_date   VARCHAR(8),
                delist_date VARCHAR(8),
                up_days     INT           NOT NULL DEFAULT 0,
                down_days   INT           NOT NULL DEFAULT 0,
                flat_days   INT           NOT NULL DEFAULT 0,
                total_days  INT           NOT NULL DEFAULT 0,
                up_rate     DECIMAL(5,1)  NOT NULL DEFAULT 0.0,
                updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    conn.commit()
    log.info('[init] 表 us_stock_lifecycle 已就绪')

def get_processed_codes(conn):
    """返回已处理的股票代码集合（total_days > 0 或已写入空记录）"""
    with conn.cursor() as cur:
        cur.execute("SELECT ts_code FROM us_stock_lifecycle")
        return {row[0] for row in cur.fetchall()}

def upsert_lifecycle(conn, ts_code, name, enname, classify, list_date, delist_date,
                     up_days, down_days, flat_days, total_days, up_rate):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO us_stock_lifecycle
                (ts_code, name, enname, classify, list_date, delist_date,
                 up_days, down_days, flat_days, total_days, up_rate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name        = VALUES(name),
                enname      = VALUES(enname),
                classify    = VALUES(classify),
                list_date   = VALUES(list_date),
                delist_date = VALUES(delist_date),
                up_days     = VALUES(up_days),
                down_days   = VALUES(down_days),
                flat_days   = VALUES(flat_days),
                total_days  = VALUES(total_days),
                up_rate     = VALUES(up_rate),
                updated_at  = NOW()
        """, (ts_code, name, enname, classify, list_date, delist_date,
              up_days, down_days, flat_days, total_days, up_rate))
    conn.commit()

# ─── 主逻辑 ───────────────────────────────────────────────────────────────────
def fetch_all_us_basic():
    """拉取全部美股列表"""
    log.info('[us_basic] 开始拉取美股列表...')
    all_stocks = []
    offset = 0
    limit = 6000
    while True:
        time.sleep(REQUEST_INTERVAL)
        data = call_tushare('us_basic', {'offset': str(offset), 'limit': str(limit)},
                            'ts_code,name,enname,classify,list_date,delist_date')
        fields = data['fields']
        items = data['items']
        if not items:
            break
        ts_idx = fields.index('ts_code')
        name_idx = fields.index('name')
        enname_idx = fields.index('enname')
        classify_idx = fields.index('classify')
        list_date_idx = fields.index('list_date')
        delist_date_idx = fields.index('delist_date')
        for row in items:
            all_stocks.append({
                'ts_code': str(row[ts_idx] or ''),
                'name': str(row[name_idx]) if row[name_idx] else None,
                'enname': str(row[enname_idx]) if row[enname_idx] else None,
                'classify': str(row[classify_idx]) if row[classify_idx] else None,
                'list_date': str(row[list_date_idx]) if row[list_date_idx] else None,
                'delist_date': str(row[delist_date_idx]) if row[delist_date_idx] else None,
            })
        log.info(f'[us_basic] 已拉取 {len(all_stocks)} 只 (offset={offset})')
        if len(items) < limit:
            break
        offset += limit
    log.info(f'[us_basic] 共 {len(all_stocks)} 只股票')
    return all_stocks

def fetch_stock_history(ts_code, list_date):
    """拉取单只股票全历史日线数据，返回 (up, down, flat, total)"""
    start_year = int(list_date[:4]) if list_date else 1990
    import datetime
    current_year = datetime.datetime.now().year

    up_days = down_days = flat_days = total_days = 0

    for y in range(start_year, current_year + 1, 10):
        start_date = f'{y}0101'
        end_date = f'{min(y + 9, current_year)}1231'
        time.sleep(REQUEST_INTERVAL)
        try:
            data = call_tushare(
                'us_daily',
                {'ts_code': ts_code, 'start_date': start_date, 'end_date': end_date},
                'pct_chg'
            )
            if data and data.get('items'):
                pct_idx = data['fields'].index('pct_chg')
                for row in data['items']:
                    pct = float(row[pct_idx] or 0)
                    total_days += 1
                    if pct > 0:
                        up_days += 1
                    elif pct < 0:
                        down_days += 1
                    else:
                        flat_days += 1
        except Exception as e:
            log.warning(f'[{ts_code}] 拉取 {start_date}-{end_date} 失败: {e}')

    return up_days, down_days, flat_days, total_days

def main():
    log.info('=' * 60)
    log.info('[build_us_lifecycle] 开始美股全生命周期数据回填')
    log.info('=' * 60)
    t0 = time.time()

    conn = get_conn()
    try:
        init_tables(conn)

        # 1. 拉取美股列表
        stocks = fetch_all_us_basic()

        # 2. 获取已处理的股票（断点续传）
        processed_codes = get_processed_codes(conn)
        log.info(f'[断点续传] 已处理 {len(processed_codes)} 只，剩余 {len(stocks) - len(processed_codes)} 只')

        # 3. 逐只处理
        processed = skipped = errors = 0
        for i, stock in enumerate(stocks):
            ts_code = stock['ts_code']
            if not ts_code:
                continue

            if ts_code in processed_codes:
                skipped += 1
                continue

            try:
                up, down, flat, total = fetch_stock_history(ts_code, stock['list_date'])
                up_rate = round(up * 100.0 / total, 1) if total > 0 else 0.0
                upsert_lifecycle(
                    conn, ts_code,
                    stock['name'], stock['enname'], stock['classify'],
                    stock['list_date'], stock['delist_date'],
                    up, down, flat, total, up_rate
                )
                log.info(f'[{i+1}/{len(stocks)}] {ts_code} ({stock["name"] or stock["enname"] or "?"}) '
                         f'涨{up}天 跌{down}天 共{total}天 涨幅{up_rate}%')
                processed += 1
            except Exception as e:
                log.error(f'[{i+1}/{len(stocks)}] {ts_code} 处理失败: {e}')
                # 写入空记录避免重复处理
                try:
                    upsert_lifecycle(conn, ts_code,
                                     stock['name'], stock['enname'], stock['classify'],
                                     stock['list_date'], stock['delist_date'],
                                     0, 0, 0, 0, 0.0)
                except Exception:
                    pass
                errors += 1

            # 每100只输出进度
            if (i + 1) % 100 == 0:
                elapsed = (time.time() - t0) / 60
                remaining_count = len(stocks) - i - 1 - skipped
                est_remaining = remaining_count * REQUEST_INTERVAL * 2 / 60
                log.info(f'\n=== 进度: {i+1}/{len(stocks)} | 处理:{processed} 跳过:{skipped} 错误:{errors} '
                         f'| 已用:{elapsed:.1f}分 预剩:{est_remaining:.0f}分 ===\n')

        elapsed = (time.time() - t0) / 60
        log.info(f'\n[完成] 总计 {len(stocks)} 只 | 处理:{processed} 跳过:{skipped} 错误:{errors} | 耗时:{elapsed:.1f}分')

        # 验证
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt, SUM(total_days) AS total FROM us_stock_lifecycle WHERE total_days > 0")
            row = cur.fetchone()
            log.info(f'[验证] 有效记录: {row[0]} 只, 总交易日数: {row[1]}')
            cur.execute("SELECT ts_code, name, up_days, down_days, total_days, up_rate FROM us_stock_lifecycle ORDER BY up_rate DESC LIMIT 5")
            top = cur.fetchall()
            log.info(f'[验证] 涨幅最高前5: {top}')

    finally:
        conn.close()
        log.info('[build_us_lifecycle] 完成')

if __name__ == '__main__':
    main()

# triggered Wed Apr 29 09:42:03 EDT 2026
