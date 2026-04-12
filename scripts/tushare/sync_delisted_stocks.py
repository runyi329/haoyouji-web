"""
同步退市股票（list_status='D'）到 ts_stock_basic 表
退市股票纳入全生命周期统计，必然破发，提升数据说服力
"""
import tushare as ts
import pymysql
import time

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
DB_CONFIG = dict(
    host='127.0.0.1',
    user='root',
    password='Miao@20190603',
    database='crm_db',
    charset='utf8mb4',
    connect_timeout=10,
    read_timeout=60,
    write_timeout=60
)

ts.set_token(TOKEN)
pro = ts.pro_api()

def get_conn():
    return pymysql.connect(**DB_CONFIG)

def main():
    print("=== 同步退市股票到 ts_stock_basic ===")
    
    # 1. 从 Tushare 获取退市股票
    print("从 Tushare 获取退市股票（list_status='D'）...")
    df = pro.stock_basic(
        list_status='D',
        fields='ts_code,symbol,name,area,industry,fullname,enname,cnspell,market,exchange,curr_type,list_status,list_date,delist_date,is_hs'
    )
    print(f"获取到 {len(df)} 只退市股票")
    
    # 2. 写入数据库（UPSERT）
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 先查现有数量
            cur.execute("SELECT COUNT(*) FROM ts_stock_basic")
            before_count = cur.fetchone()[0]
            print(f"写入前 ts_stock_basic 共 {before_count} 条")
            
            # UPSERT
            cols = list(df.columns)
            placeholders = ', '.join(['%s'] * len(cols))
            update_clause = ', '.join([f"`{c}` = VALUES(`{c}`)" for c in cols if c != 'ts_code'])
            sql = f"""
                INSERT INTO ts_stock_basic ({', '.join([f'`{c}`' for c in cols])})
                VALUES ({placeholders})
                ON DUPLICATE KEY UPDATE {update_clause}
            """
            rows = []
            for _, row in df.iterrows():
                rows.append(tuple(None if (hasattr(v, '__class__') and v.__class__.__name__ == 'float' and str(v) == 'nan') else v for v in row))
            
            cur.executemany(sql, rows)
            conn.commit()
            
            # 查写入后数量
            cur.execute("SELECT COUNT(*) FROM ts_stock_basic")
            after_count = cur.fetchone()[0]
            print(f"写入后 ts_stock_basic 共 {after_count} 条（新增 {after_count - before_count} 条）")
            
            # 验证退市股票
            cur.execute("SELECT list_status, COUNT(*) AS cnt FROM ts_stock_basic GROUP BY list_status")
            rows_status = cur.fetchall()
            print("\n按状态分布：")
            for r in rows_status:
                status_name = {'L': '在市', 'D': '退市', 'P': '暂停'}.get(r[0], r[0])
                print(f"  {status_name}（{r[0]}）: {r[1]} 只")
    finally:
        conn.close()
    
    print("\n=== 同步完成 ===")

if __name__ == '__main__':
    main()
