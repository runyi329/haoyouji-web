#!/usr/bin/env python3
"""
重建 ts_bunching_stats 表：存储全历史涨幅分布统计
- 每个 (trade_date, market) 对应一行
- 存储 -11% ~ +11% 范围内，每 0.5% 一个区间的频率分布（JSON 格式）
- 同时存储 at10/near10/atMinus10/nearMinus10 等关键统计量

数据来源：从 Tushare 按日期批量拉取 daily 接口（pct_chg 字段）
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


def ensure_table(conn):
    """确保 ts_bunching_stats 表存在"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ts_bunching_stats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            trade_date VARCHAR(8) NOT NULL,
            market VARCHAR(10) NOT NULL,
            total_count INT NOT NULL DEFAULT 0,
            buckets_json TEXT NOT NULL COMMENT '[-11,+11] 每0.5%区间的count数组，JSON格式',
            at10 INT NOT NULL DEFAULT 0 COMMENT '涨停区间(+10%)数量',
            near10 INT NOT NULL DEFAULT 0 COMMENT '涨停相邻区间(+9.5%)数量',
            at_minus10 INT NOT NULL DEFAULT 0 COMMENT '跌停区间(-10%)数量',
            near_minus10 INT NOT NULL DEFAULT 0 COMMENT '跌停相邻区间(-9.5%)数量',
            up_bunch_ratio FLOAT NOT NULL DEFAULT 0 COMMENT '涨停聚集倍数',
            down_bunch_ratio FLOAT NOT NULL DEFAULT 0 COMMENT '跌停聚集倍数',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_date_market (trade_date, market)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    conn.commit()
    cursor.close()
    print("ts_bunching_stats 表已确认存在")


def compute_buckets(items, fi, market_filter):
    """计算某个板块的涨幅分布"""
    from collections import defaultdict
    bucket_counts = defaultdict(int)
    total = 0
    
    for item in items:
        code = item[fi['ts_code']].split('.')[0]
        if not market_filter(code):
            continue
        pct = item[fi.get('pct_chg', -1)]
        if pct is None:
            continue
        pct = float(pct)
        if pct < -11 or pct > 11:
            continue
        # 归入最近的 0.5% 区间
        bucket = round(pct * 2) / 2
        bucket_counts[bucket] += 1
        total += 1
    
    # 生成完整的 bucket 列表（-11 到 +11，步长 0.5）
    buckets = []
    b = -11.0
    while b <= 11.01:
        cnt = bucket_counts.get(round(b * 2) / 2, 0)
        buckets.append({'bucket': round(b * 2) / 2, 'count': cnt})
        b += 0.5
    
    # 关键统计量
    at10 = bucket_counts.get(10.0, 0)
    near10 = bucket_counts.get(9.5, 0)
    at_minus10 = bucket_counts.get(-10.0, 0)
    near_minus10 = bucket_counts.get(-9.5, 0)
    
    up_bunch_ratio = round(at10 / near10, 2) if near10 > 0 else 0
    down_bunch_ratio = round(at_minus10 / near_minus10, 2) if near_minus10 > 0 else 0
    
    return {
        'total': total,
        'buckets': buckets,
        'at10': at10,
        'near10': near10,
        'at_minus10': at_minus10,
        'near_minus10': near_minus10,
        'up_bunch_ratio': up_bunch_ratio,
        'down_bunch_ratio': down_bunch_ratio,
    }


def process_date(conn, trade_date, items, fi):
    """处理单个交易日：计算并写入 ts_bunching_stats"""
    cursor = conn.cursor()
    try:
        for market, filter_fn in MARKETS.items():
            stats = compute_buckets(items, fi, filter_fn)
            cursor.execute("""
                INSERT INTO ts_bunching_stats 
                    (trade_date, market, total_count, buckets_json, at10, near10, at_minus10, near_minus10, up_bunch_ratio, down_bunch_ratio)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    total_count=VALUES(total_count),
                    buckets_json=VALUES(buckets_json),
                    at10=VALUES(at10),
                    near10=VALUES(near10),
                    at_minus10=VALUES(at_minus10),
                    near_minus10=VALUES(near_minus10),
                    up_bunch_ratio=VALUES(up_bunch_ratio),
                    down_bunch_ratio=VALUES(down_bunch_ratio)
            """, (
                trade_date, market,
                stats['total'],
                json.dumps(stats['buckets']),
                stats['at10'], stats['near10'],
                stats['at_minus10'], stats['near_minus10'],
                stats['up_bunch_ratio'], stats['down_bunch_ratio'],
            ))
        conn.commit()
    except Exception as e:
        print(f"  写入 ts_bunching_stats 失败: {e}")
        conn.rollback()
    finally:
        cursor.close()


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


def main():
    print("=== 重建 ts_bunching_stats 历史数据 ===")
    
    conn = pymysql.connect(**DB_CONFIG)
    ensure_table(conn)
    
    # 查已有最新日期
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(trade_date) FROM ts_bunching_stats WHERE market='all'")
    latest = cursor.fetchone()[0] or '19900101'
    cursor.close()
    
    today = datetime.now().strftime('%Y%m%d')
    print(f"已有最新日期: {latest}, 今天: {today}")
    
    if latest >= today:
        print("数据已最新，无需重建")
        conn.close()
        return
    
    # 获取需要处理的交易日
    next_day = (datetime.strptime(latest, '%Y%m%d') + timedelta(days=1)).strftime('%Y%m%d')
    trade_dates = get_trade_dates(next_day, today)
    trade_dates = [d for d in trade_dates if d < today]  # 排除今天
    
    print(f"需处理 {len(trade_dates)} 个交易日")
    
    success = 0
    for i, td in enumerate(trade_dates):
        print(f"\n[{i+1}/{len(trade_dates)}] {td}")
        
        # 从 Tushare 拉取当日 pct_chg
        data = tushare_call('daily', {'trade_date': td}, 'ts_code,trade_date,pct_chg')
        if not data or not data.get('items'):
            print(f"  无数据，跳过")
            continue
        
        fi = {f: i for i, f in enumerate(data['fields'])}
        items = data['items']
        print(f"  获取到 {len(items)} 条记录")
        
        process_date(conn, td, items, fi)
        success += 1
        print(f"  ts_bunching_stats 写入完成")
        
        time.sleep(0.4)  # 避免频繁请求
    
    conn.close()
    print(f"\n=== 完成：成功处理 {success}/{len(trade_dates)} 个交易日 ===")


if __name__ == '__main__':
    main()
