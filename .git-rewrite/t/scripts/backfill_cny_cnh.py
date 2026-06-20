"""
CNY/CNH 历史数据回填脚本
- CNY 在岸人民币：Yahoo Finance CNY=X（2001-至今，约6200条）
- CNH 离岸人民币：东方财富 133.USDCNH（2010-至今，约4000条）
"""
import pymysql
import requests
import yfinance as yf
import time

DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': 'Miao@20190603',
    'database': 'crm_db',
    'charset': 'utf8mb4',
}


def get_conn():
    return pymysql.connect(**DB_CONFIG)


def upsert_rows(rows, symbol):
    conn = get_conn()
    try:
        cur = conn.cursor()
        inserted = 0
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            cur.executemany("""
                INSERT INTO crypto_klines
                  (symbol, date, open, high, low, close, volume, quote_volume, change_pct, amplitude_pct)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  open=VALUES(open), high=VALUES(high), low=VALUES(low), close=VALUES(close),
                  change_pct=VALUES(change_pct), amplitude_pct=VALUES(amplitude_pct)
            """, batch)
            conn.commit()
            inserted += len(batch)
            print(f"  [{symbol}] 已写入 {inserted}/{len(rows)}")
        cur.close()
        print(f"[{symbol}] 写入完成，共 {inserted} 条")
    finally:
        conn.close()


def update_meta(symbol):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO crypto_klines_meta (symbol, total, oldest_date, latest_date)
            SELECT symbol, COUNT(*),
                   DATE_FORMAT(MIN(date), '%Y/%m/%d'),
                   DATE_FORMAT(MAX(date), '%Y/%m/%d')
            FROM crypto_klines WHERE symbol = %s
            ON DUPLICATE KEY UPDATE
              total=VALUES(total), oldest_date=VALUES(oldest_date), latest_date=VALUES(latest_date)
        """, (symbol,))
        conn.commit()
        cur.close()
        print(f"[{symbol}] meta 更新完成")
    finally:
        conn.close()


# ===== 1. CNY 在岸人民币（Yahoo Finance CNY=X）=====
print("\n===== 1. 回填 CNY 在岸人民币（Yahoo Finance）=====")
try:
    df = yf.download("CNY=X", period="max", auto_adjust=True, progress=False)
    if df.empty:
        print("[CNY] Yahoo Finance 无数据")
    else:
        print(f"[CNY] 下载完成：{len(df)} 条，{df.index[0].date()} ~ {df.index[-1].date()}")
        rows = []
        prev_close = None
        for date, row in df.iterrows():
            try:
                open_p  = float(row['Open'].item()  if hasattr(row['Open'],  'item') else row['Open'])
                high_p  = float(row['High'].item()  if hasattr(row['High'],  'item') else row['High'])
                low_p   = float(row['Low'].item()   if hasattr(row['Low'],   'item') else row['Low'])
                close_p = float(row['Close'].item() if hasattr(row['Close'], 'item') else row['Close'])
                change_pct    = ((close_p - prev_close) / prev_close * 100) if prev_close else 0.0
                amplitude_pct = ((high_p - low_p) / low_p * 100) if low_p > 0 else 0.0
                rows.append((
                    'CNY', str(date.date()),
                    round(open_p, 6), round(high_p, 6), round(low_p, 6), round(close_p, 6),
                    0.0, 0.0, round(change_pct, 6), round(amplitude_pct, 6)
                ))
                prev_close = close_p
            except Exception as e:
                print(f"  [CNY] 跳过 {date}: {e}")
        print(f"[CNY] 解析完成：{len(rows)} 条")
        upsert_rows(rows, 'CNY')
        update_meta('CNY')
except Exception as e:
    print(f"[CNY] 错误: {e}")

time.sleep(2)

# ===== 2. CNH 离岸人民币（东方财富 133.USDCNH）=====
print("\n===== 2. 回填 CNH 离岸人民币（东方财富）=====")
try:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com'
    }
    url = (
        'https://push2his.eastmoney.com/api/qt/stock/kline/get'
        '?secid=133.USDCNH'
        '&ut=fa5fd1943c7b386f172d6893dbfba10b'
        '&fields1=f1,f2,f3,f4,f5,f6'
        '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
        '&klt=101&fqt=1&beg=20100101&end=20991231&lmt=1000000'
    )
    r = requests.get(url, headers=headers, timeout=30)
    klines = r.json()['data']['klines']
    print(f"[CNH] 下载完成：{len(klines)} 条")

    rows = []
    prev_close = None
    for line in klines:
        parts = line.split(',')
        date    = parts[0]
        open_p  = float(parts[1])
        close_p = float(parts[2])
        high_p  = float(parts[3])
        low_p   = float(parts[4])
        volume  = float(parts[5]) if parts[5] else 0.0
        change_pct    = ((close_p - prev_close) / prev_close * 100) if prev_close else 0.0
        amplitude_pct = ((high_p - low_p) / low_p * 100) if low_p > 0 else 0.0
        rows.append((
            'CNH', date,
            round(open_p, 6), round(high_p, 6), round(low_p, 6), round(close_p, 6),
            volume, volume, round(change_pct, 6), round(amplitude_pct, 6)
        ))
        prev_close = close_p

    print(f"[CNH] 解析完成：{len(rows)} 条，{rows[0][1]} ~ {rows[-1][1]}")
    upsert_rows(rows, 'CNH')
    update_meta('CNH')
except Exception as e:
    print(f"[CNH] 错误: {e}")

# ===== 验证结果 =====
print("\n===== 验证结果 =====")
conn = get_conn()
cur = conn.cursor()
cur.execute("""
    SELECT symbol, COUNT(*) as cnt, MIN(date) as oldest, MAX(date) as latest
    FROM crypto_klines WHERE symbol IN ('CNY','CNH') GROUP BY symbol
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} 条，{r[2]} ~ {r[3]}")
conn.close()
print("===== 回填完成 =====")
