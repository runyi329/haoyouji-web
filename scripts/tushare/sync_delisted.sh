#!/bin/bash
set -e
echo "=== 同步退市股票 ==="
pip3 install tushare pymysql pandas -q 2>/dev/null || true
cd /root/haoyouji-web 2>/dev/null || cd /home/ubuntu/haoyouji-web
python3 scripts/tushare/sync_delisted_stocks.py
echo "=== 完成 ==="
