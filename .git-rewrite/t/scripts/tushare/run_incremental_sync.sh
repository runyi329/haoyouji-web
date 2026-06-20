#!/bin/bash
set -e

echo "=== ts_daily_basic 增量同步 ==="

# 安装依赖
pip3 install tushare pymysql pandas -q 2>/dev/null || true

# 运行同步脚本
cd /root/haoyouji-web 2>/dev/null || cd /home/ubuntu/haoyouji-web
python3 scripts/tushare/sync_daily_basic_incremental.py

echo "=== 同步完成 ==="
