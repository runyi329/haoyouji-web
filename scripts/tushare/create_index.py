#!/usr/bin/env python3
"""在服务器上为 ts_daily 表建立索引，加速生存分析查询"""
import os
import sys

# 从环境文件读取数据库URL
db_url = ""
for env_file in ["/var/www/haoyouji-web/.env", "/root/.env", "/home/ubuntu/.env"]:
    try:
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL=") or line.startswith("EXTERNAL_DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        if db_url:
            print(f"找到数据库URL: {db_url[:60]}...")
            break
    except:
        pass

import pymysql

if db_url:
    from urllib.parse import urlparse
    parsed = urlparse(db_url)
    # 处理带 ? 参数的 path
    db_name = parsed.path.lstrip('/').split('?')[0]
    conn = pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password or '',
        database=db_name,
        connect_timeout=30,
        read_timeout=1800,
        write_timeout=1800,
    )
    print(f"连接成功: {parsed.hostname}:{parsed.port}/{db_name}")
else:
    print("未找到数据库URL，尝试本地连接...")
    # 尝试本地 MySQL
    conn = pymysql.connect(
        host='127.0.0.1', port=3306,
        user='root', password='',
        database='haoyouji',
        connect_timeout=10,
        read_timeout=1800,
        write_timeout=1800,
    )

cur = conn.cursor()

# 检查现有索引
print("检查 ts_daily 现有索引...")
cur.execute("SHOW INDEX FROM ts_daily")
existing = set(row[2] for row in cur.fetchall())
print(f"现有索引: {existing}")

# 建立复合索引 (ts_code, trade_date)
if 'idx_ts_daily_code_date' not in existing:
    print("正在建立索引 idx_ts_daily_code_date (ts_code, trade_date)...")
    print("（数据量大，可能需要5-15分钟，请耐心等待）")
    cur.execute("ALTER TABLE ts_daily ADD INDEX idx_ts_daily_code_date (ts_code, trade_date)")
    conn.commit()
    print("✅ 复合索引建立成功！")
else:
    print("✅ 复合索引已存在，跳过")

# 检查 ts_stock_basic 索引
cur.execute("SHOW INDEX FROM ts_stock_basic")
existing_basic = set(row[2] for row in cur.fetchall())
print(f"ts_stock_basic 现有索引: {existing_basic}")

if 'idx_stock_basic_status' not in existing_basic:
    print("正在建立 ts_stock_basic 索引...")
    cur.execute("ALTER TABLE ts_stock_basic ADD INDEX idx_stock_basic_status (list_status)")
    conn.commit()
    print("✅ ts_stock_basic 索引建立成功！")
else:
    print("✅ ts_stock_basic 索引已存在，跳过")

cur.close()
conn.close()
print("=== 全部索引建立完成 ===")
