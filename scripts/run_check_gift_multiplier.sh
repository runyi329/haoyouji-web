#!/bin/bash
set -e
echo "=== 查询 gift_multiplier 和拨比配置 ==="
ENV_FILE=""
if [ -f /root/haoyouji-web/.env ]; then ENV_FILE=/root/haoyouji-web/.env
elif [ -f /home/ubuntu/haoyouji-web/.env ]; then ENV_FILE=/home/ubuntu/haoyouji-web/.env
fi
DB_URL=$(grep "^ORIGINAL_DATABASE_URL=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
if [ -z "$DB_URL" ]; then
  DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
fi
pip3 install pymysql -q 2>/dev/null || true
python3 /tmp/check_gift_multiplier.py "$DB_URL"
echo "=== 完毕 ==="
