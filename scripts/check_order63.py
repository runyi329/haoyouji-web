"""
查询订单 #63 的所有关键字段，排查为何不出现在订单管理列表
"""
import sys
import pymysql
from urllib.parse import urlparse, unquote

DATABASE_URL = sys.argv[1]

def parse_url(url):
    url = url.strip()
    if url.startswith('mysql+pymysql://'):
        url = 'mysql://' + url[len('mysql+pymysql://'):]
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or 3306
    user = unquote(parsed.username or '')
    pwd = unquote(parsed.password or '')
    db = parsed.path.lstrip('/').split('?')[0]
    return host, port, user, pwd, db

DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME = parse_url(DATABASE_URL)
print("连接: {}:{}/{}".format(DB_HOST, DB_PORT, DB_NAME))

conn = pymysql.connect(
    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
    database=DB_NAME, charset='utf8mb4', connect_timeout=30
)
print("数据库连接成功\n")

with conn.cursor(pymysql.cursors.DictCursor) as cur:
    # 查询订单63的关键字段
    cur.execute("""
        SELECT id, ledger_id, user_id, coin, side, limit_price, amount, quantity,
               status, is_gift, source_order_id, source_user_id,
               sell_status, confirmed_at, created_at
        FROM af_orders WHERE id = 63
    """)
    row = cur.fetchone()
    if row:
        print("=== 订单 #63 字段 ===")
        for k, v in row.items():
            print("  {}: {}".format(k, v))
    else:
        print("未找到订单 #63！")

    # 查询同一账本最新50条订单的 id 范围，看63是否在范围内
    if row:
        ledger_id = row['ledger_id']
        cur.execute("""
            SELECT COUNT(*) as total, MIN(id) as min_id, MAX(id) as max_id
            FROM af_orders
            WHERE ledger_id = %s AND side = 'buy'
        """, (ledger_id,))
        stats = cur.fetchone()
        print("\n=== 账本 {} 订单统计 ===".format(ledger_id))
        print("  总数: {}, 最小ID: {}, 最大ID: {}".format(
            stats['total'], stats['min_id'], stats['max_id']))

        # 查询前10条（最旧的）
        cur.execute("""
            SELECT id, is_gift, source_order_id, status, sell_status, created_at
            FROM af_orders
            WHERE ledger_id = %s AND side = 'buy'
            ORDER BY created_at ASC LIMIT 10
        """, (ledger_id,))
        oldest = cur.fetchall()
        print("\n=== 最旧的10条订单 ===")
        for o in oldest:
            print("  id={} is_gift={} source_order_id={} status={} sell_status={} created_at={}".format(
                o['id'], o['is_gift'], o['source_order_id'], o['status'], o['sell_status'], o['created_at']))

conn.close()
print("\n查询完成！")
