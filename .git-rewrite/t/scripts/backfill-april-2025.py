#!/usr/bin/env python3
"""
补拉 4月1日 到今天 的缺失日线数据
- ts_daily（当日行情：open/high/low/close/vol/amount/pct_chg）
- ts_daily_basic（当日基本面：pe_ttm/pb/total_mv/close）
- ts_trend_cache（五个板块趋势统计）
"""
import pymysql
import requests
import json
import time
from datetime import datetime, timedelta

TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
TUSHARE_URL = 'http://api.tushare.pro'

DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': 'Miao@20190603',
    'database': 'crm_db',
    'charset': 'utf8mb4',
}

MARKETS = {
    'all':  lambda code: True,
    'SH':   lambda code: code.startswith('6') and not code.startswith('688'),
    'SZ':   lambda code: code.startswith('0'),
    'GEM':  lambda code: code.startswith('3'),
    'STAR': lambda code: code.startswith('688'),
}

def tushare_call(api_name, params, fields):
    payload = {
        'api_name': api_name,
        'token': TUSHARE_TOKEN,
        'params': params,
        'fields': fields,
    }
    for attempt in range(3):
        try:
            resp = requests.post(TUSHARE_URL, json=payload, timeout=30)
            data = resp.json()
            if data.get('code') == 0:
                return data['data']
            print(f"  Tushare error: {data.get('msg')}")
        except Exception as e:
            print(f"  Request error (attempt {attempt+1}): {e}")
        time.sleep(2)
    return None

def get_trade_dates(start_date, end_date):
    """获取指定范围内的交易日列表"""
    data = tushare_call('trade_cal', {
        'exchange': 'SSE',
        'start_date': start_date,
        'end_date': end_date,
        'is_open': '1',
    }, 'cal_date')
    if not data:
        return []
    fields = data['fields']
    items = data['items']
    idx = fields.index('cal_date')
    return sorted([row[idx] for row in items])

def get_first_open_cache(conn):
    """获取所有股票的首日开盘价"""
    cursor = conn.cursor()
    cursor.execute("SELECT ts_code, first_open FROM ts_first_open_cache")
    result = {row[0]: row[1] for row in cursor.fetchall()}
    cursor.close()
    return result

def process_trade_date(conn, trade_date, first_open_cache):
    """处理单个交易日：写 ts_daily + ts_daily_basic + ts_trend_cache"""
    print(f"\n[{trade_date}] 开始处理...")
    
    # 1. 拉取日线数据
    daily_data = tushare_call('daily', {'trade_date': trade_date}, 
                               'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg,pre_close,change')
    if not daily_data:
        print(f"  [SKIP] 无日线数据")
        return False
    
    fields = daily_data['fields']
    items = daily_data['items']
    if not items:
        print(f"  [SKIP] 空数据（非交易日）")
        return False
    
    print(f"  拉取到 {len(items)} 条日线数据")
    
    # 2. 写入 ts_daily
    cursor = conn.cursor()
    try:
        insert_sql = """
            INSERT INTO ts_daily (ts_code, trade_date, open, high, low, close, vol, amount, pct_chg, pre_close, `change`)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open=VALUES(open), high=VALUES(high), low=VALUES(low), close=VALUES(close),
                vol=VALUES(vol), amount=VALUES(amount), pct_chg=VALUES(pct_chg),
                pre_close=VALUES(pre_close), `change`=VALUES(`change`)
        """
        fi = {f: i for i, f in enumerate(fields)}
        rows = []
        for item in items:
            rows.append((
                item[fi['ts_code']], item[fi['trade_date']],
                item[fi.get('open', -1)], item[fi.get('high', -1)],
                item[fi.get('low', -1)], item[fi.get('close', -1)],
                item[fi.get('vol', -1)], item[fi.get('amount', -1)],
                item[fi.get('pct_chg', 0)], item[fi.get('pre_close', -1)],
                item[fi.get('change', 0)],
            ))
        cursor.executemany(insert_sql, rows)
        conn.commit()
        print(f"  ts_daily 写入 {len(rows)} 条")
    except Exception as e:
        print(f"  ts_daily 写入失败: {e}")
        conn.rollback()
    finally:
        cursor.close()
    
    time.sleep(0.4)
    
    # 3. 拉取并写入 ts_daily_basic
    basic_data = tushare_call('daily_basic', {'trade_date': trade_date},
                               'ts_code,trade_date,pe_ttm,pb,total_mv,close,turnover_rate,volume_ratio')
    if basic_data and basic_data.get('items'):
        cursor = conn.cursor()
        try:
            bf = {f: i for i, f in enumerate(basic_data['fields'])}
            basic_rows = []
            for item in basic_data['items']:
                basic_rows.append((
                    item[bf['ts_code']], item[bf['trade_date']],
                    item[bf.get('pe_ttm', -1)], item[bf.get('pb', -1)],
                    item[bf.get('total_mv', -1)], item[bf.get('close', -1)],
                    item[bf.get('turnover_rate', -1)], item[bf.get('volume_ratio', -1)],
                ))
            cursor.executemany("""
                INSERT INTO ts_daily_basic (ts_code, trade_date, pe_ttm, pb, total_mv, close, turnover_rate, volume_ratio)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    pe_ttm=VALUES(pe_ttm), pb=VALUES(pb), total_mv=VALUES(total_mv),
                    close=VALUES(close), turnover_rate=VALUES(turnover_rate), volume_ratio=VALUES(volume_ratio)
            """, basic_rows)
            conn.commit()
            print(f"  ts_daily_basic 写入 {len(basic_rows)} 条")
        except Exception as e:
            print(f"  ts_daily_basic 写入失败: {e}")
            conn.rollback()
        finally:
            cursor.close()
    
    time.sleep(0.4)
    
    # 4. 计算并写入 ts_trend_cache（五个板块）
    fi = {f: i for i, f in enumerate(fields)}
    cursor = conn.cursor()
    try:
        for market, filter_fn in MARKETS.items():
            market_items = [item for item in items if filter_fn(item[fi['ts_code']].replace('.SH','').replace('.SZ',''))]
            above = below = equal = 0
            for item in market_items:
                code = item[fi['ts_code']]
                close = item[fi.get('close', -1)]
                first_open = first_open_cache.get(code)
                if close is None or first_open is None or first_open <= 0:
                    below += 1
                    continue
                ratio = close / first_open
                if ratio > 1.001:
                    above += 1
                elif ratio < 0.999:
                    below += 1
                else:
                    equal += 1
            cursor.execute("""
                INSERT INTO ts_trend_cache (trade_date, market, above, below, equal)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal=VALUES(equal)
            """, (trade_date, market, above, below, equal))
        conn.commit()
        print(f"  ts_trend_cache 五个板块写入完成")
    except Exception as e:
        print(f"  ts_trend_cache 写入失败: {e}")
        conn.rollback()
    finally:
        cursor.close()
    
    return True

def main():
    print("=== 补拉缺失数据脚本 ===")
    
    # 获取需要补拉的日期范围
    conn = pymysql.connect(**DB_CONFIG)
    
    # 查最新已有数据日期
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(trade_date) FROM ts_trend_cache WHERE market='all'")
    latest = cursor.fetchone()[0] or '20250331'
    cursor.close()
    
    today = datetime.now().strftime('%Y%m%d')
    print(f"最新数据日期: {latest}")
    print(f"今天日期: {today}")
    
    if latest >= today:
        print("数据已是最新，无需补拉")
        conn.close()
        return
    
    # 获取缺失的交易日
    next_day = (datetime.strptime(latest, '%Y%m%d') + timedelta(days=1)).strftime('%Y%m%d')
    trade_dates = get_trade_dates(next_day, today)
    # 排除今天（当天数据可能不完整）
    trade_dates = [d for d in trade_dates if d < today]
    
    print(f"需要补拉 {len(trade_dates)} 个交易日: {trade_dates[:5]}{'...' if len(trade_dates) > 5 else ''}")
    
    # 加载首日开盘价缓存
    first_open_cache = get_first_open_cache(conn)
    print(f"已加载 {len(first_open_cache)} 只股票的首日开盘价")
    
    # 逐日补拉
    success = 0
    for trade_date in trade_dates:
        try:
            if process_trade_date(conn, trade_date, first_open_cache):
                success += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"  [{trade_date}] 处理异常: {e}")
    
    conn.close()
    print(f"\n=== 补拉完成：成功 {success}/{len(trade_dates)} 个交易日 ===")

if __name__ == '__main__':
    main()
