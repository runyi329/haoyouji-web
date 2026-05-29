"""
查询订单 #62、#64 的 gift_multiplier 字段值，
以及 af_payout_ratios 中对应的拨比配置
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
conn = pymysql.connect(
    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
    database=DB_NAME, charset='utf8mb4', connect_timeout=30
)
print("数据库连接成功\n")

with conn.cursor(pymysql.cursors.DictCursor) as cur:
    # 查询赠与单 #62 和 #64 的字段
    cur.execute("""
        SELECT o.id, o.is_gift, o.gift_multiplier, o.source_order_id, o.source_user_id,
               o.user_id, o.amount, o.quantity, o.limit_price, o.coin,
               u.name as user_name, u.username
        FROM af_orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.id IN (62, 64)
    """)
    rows = cur.fetchall()
    print("=== 赠与单 #62 和 #64 ===")
    for r in rows:
        print("  id={} coin={} gift_multiplier={} source_order_id={} source_user_id={} user_id={} ({}) amount={} qty={}".format(
            r['id'], r['coin'], r['gift_multiplier'], r['source_order_id'],
            r['source_user_id'], r['user_id'], r['user_name'] or r['username'],
            r['amount'], r['quantity']))

    # 查询 af_payout_ratios 中涉及这些用户的配置
    print("\n=== af_payout_ratios 中 source_user_id 为这些订单的下单人 ===")
    # 先获取正单 #61 和 #63 的 user_id
    cur.execute("SELECT id, user_id, coin FROM af_orders WHERE id IN (61, 63)")
    normal_orders = cur.fetchall()
    user_ids = [r['user_id'] for r in normal_orders]
    print("正单 user_ids:", user_ids)
    
    if user_ids:
        placeholders = ','.join(['%s'] * len(user_ids))
        cur.execute("""
            SELECT r.id, r.source_user_id, r.beneficiary_user_id, r.ratio,
                   us.name as source_name, ub.name as beneficiary_name
            FROM af_payout_ratios r
            LEFT JOIN users us ON us.id = r.source_user_id
            LEFT JOIN users ub ON ub.id = r.beneficiary_user_id
            WHERE r.source_user_id IN ({})
        """.format(placeholders), user_ids)
        ratios = cur.fetchall()
        for r in ratios:
            print("  source={} ({}) -> beneficiary={} ({}) ratio={}".format(
                r['source_user_id'], r['source_name'],
                r['beneficiary_user_id'], r['beneficiary_name'],
                r['ratio']))

conn.close()
print("\n查询完成！")
