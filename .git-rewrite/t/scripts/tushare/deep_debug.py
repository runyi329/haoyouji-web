#!/usr/bin/env python3
"""深度诊断：测试数据库连接和SQL查询"""
import os, sys, time

# 从.env文件读取DATABASE_URL
env_path = "/home/ubuntu/haoyouji-web/.env"
db_url = None
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL=") or line.startswith("ORIGINAL_DATABASE_URL="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val and "127.0.0.1" in val:
                    db_url = val
                    break

print(f"=== 1. 数据库连接字符串 ===")
if db_url:
    # 隐藏密码
    safe_url = db_url.split("@")[0].rsplit(":", 1)[0] + ":***@" + db_url.split("@")[1] if "@" in db_url else db_url
    print(f"找到: {safe_url}")
else:
    print("未找到DATABASE_URL，尝试直接连接")

# 解析连接字符串
import re
if db_url:
    m = re.match(r'mysql2?://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
    if m:
        user, password, host, port, database = m.groups()
    else:
        print(f"无法解析URL: {db_url}")
        sys.exit(1)
else:
    user, password, host, port, database = "root", "", "127.0.0.1", "3306", "crm_db"

print(f"用户: {user}, 主机: {host}, 端口: {port}, 数据库: {database}")

# 测试pymysql连接
print(f"\n=== 2. 测试PyMySQL连接 ===")
try:
    import pymysql
    conn = pymysql.connect(
        host=host, port=int(port), user=user, password=password,
        database=database, connect_timeout=10, read_timeout=30
    )
    print("✅ PyMySQL连接成功！")
    cur = conn.cursor()
    
    # 检查表是否存在
    print(f"\n=== 3. 检查数据库表 ===")
    cur.execute("SHOW TABLES LIKE 'ts_%'")
    tables = cur.fetchall()
    print(f"ts_开头的表: {[t[0] for t in tables]}")
    
    # 检查ts_daily数据量
    print(f"\n=== 4. ts_daily 数据量 ===")
    cur.execute("SELECT COUNT(*) FROM ts_daily")
    count = cur.fetchone()[0]
    print(f"ts_daily 总行数: {count}")
    
    # 检查ts_stock_basic数据量
    print(f"\n=== 5. ts_stock_basic 数据量 ===")
    cur.execute("SELECT COUNT(*) FROM ts_stock_basic")
    count = cur.fetchone()[0]
    print(f"ts_stock_basic 总行数: {count}")
    
    # 检查ts_daily字段
    print(f"\n=== 6. ts_daily 表结构 ===")
    cur.execute("DESCRIBE ts_daily")
    cols = cur.fetchall()
    for c in cols:
        print(f"  {c[0]}: {c[1]}")
    
    # 检查样本数据
    print(f"\n=== 7. ts_daily 样本数据（最新5条） ===")
    cur.execute("SELECT ts_code, trade_date, open, close, high, low, vol FROM ts_daily ORDER BY trade_date DESC LIMIT 5")
    rows = cur.fetchall()
    for r in rows:
        print(f"  {r}")
    
    # 测试生存分析SQL
    print(f"\n=== 8. 测试生存分析SQL（简化版） ===")
    t0 = time.time()
    cur.execute("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN latest_close > first_open THEN 1 ELSE 0 END) as above,
            SUM(CASE WHEN latest_close < first_open THEN 1 ELSE 0 END) as below,
            SUM(CASE WHEN latest_close = first_open THEN 1 ELSE 0 END) as equal_count
        FROM (
            SELECT 
                d1.ts_code,
                d1.open as first_open,
                d2.close as latest_close
            FROM ts_daily d1
            INNER JOIN (SELECT ts_code, MIN(trade_date) as min_date, MAX(trade_date) as max_date FROM ts_daily GROUP BY ts_code) agg
                ON d1.ts_code = agg.ts_code AND d1.trade_date = agg.min_date
            INNER JOIN ts_daily d2
                ON d2.ts_code = agg.ts_code AND d2.trade_date = agg.max_date
        ) sub
    """)
    result = cur.fetchone()
    elapsed = time.time() - t0
    print(f"  耗时: {elapsed:.2f}秒")
    print(f"  总数: {result[0]}, 高于首日: {result[1]}, 低于首日: {result[2]}, 持平: {result[3]}")
    
    # 测试索引
    print(f"\n=== 9. 检查索引 ===")
    cur.execute("SHOW INDEX FROM ts_daily")
    indexes = cur.fetchall()
    for idx in indexes:
        print(f"  {idx[2]}: {idx[4]} (unique={not idx[1]})")
    
    conn.close()
    print(f"\n=== 诊断完成 ===")
    
except ImportError:
    print("❌ pymysql未安装")
except Exception as e:
    print(f"❌ 连接失败: {type(e).__name__}: {e}")
