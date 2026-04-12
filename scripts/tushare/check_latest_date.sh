#!/bin/bash
set -e

echo "=== 查询各表最新日期 ==="

# 读取 .env 中的数据库连接信息
source /home/ubuntu/haoyouji-web/.env 2>/dev/null || true

# 从 DATABASE_URL 提取连接信息
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\(.*\):.*|\1|p' | cut -d'/' -f1)
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\(.*\)|\1|p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\(.*\):.*@.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\(.*\)@.*|\1|p')

echo "--- ts_daily 最新交易日 ---"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT MAX(trade_date) AS latest_date, COUNT(*) AS total_rows FROM ts_daily;"

echo "--- ts_daily_basic 最新交易日 ---"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT MAX(trade_date) AS latest_date, COUNT(*) AS total_rows FROM ts_daily_basic;" 2>/dev/null || echo "(表不存在或无数据)"

echo "--- ts_stock_basic 数据量 ---"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT COUNT(*) AS total_rows FROM ts_stock_basic;"

echo "--- 其他宏观数据表 ---"
for tbl in ts_cn_m2 ts_cn_cpi ts_shibor_lpr ts_hsgt_north ts_index_daily; do
  echo "表 $tbl:"
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT MAX(trade_date) AS latest_date, COUNT(*) AS total_rows FROM $tbl;" 2>/dev/null || echo "  (表不存在)"
done

echo "=== 完成 ==="
