#!/bin/bash
set -e
echo "=== 开始回填订单063/065历史最低价和档位 ==="

ENV_FILE=""
if [ -f /root/haoyouji-web/.env ]; then
  ENV_FILE=/root/haoyouji-web/.env
elif [ -f /home/ubuntu/haoyouji-web/.env ]; then
  ENV_FILE=/home/ubuntu/haoyouji-web/.env
fi
echo "使用env文件: $ENV_FILE"

DB_URL=$(grep "^ORIGINAL_DATABASE_URL=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
if [ -z "$DB_URL" ]; then
  DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
fi

echo "DB_URL前40字符: ${DB_URL:0:40}"
pip3 install pymysql -q 2>/dev/null || true
python3 /tmp/fix_order_tiers.py "$DB_URL"
echo "=== 脚本执行完毕 ==="
