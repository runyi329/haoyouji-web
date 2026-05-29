#!/bin/bash
set -e
echo "=== 查询订单 #63 字段 ==="

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

pip3 install pymysql -q 2>/dev/null || true
python3 /tmp/check_order63.py "$DB_URL"
echo "=== 查询完毕 ==="
