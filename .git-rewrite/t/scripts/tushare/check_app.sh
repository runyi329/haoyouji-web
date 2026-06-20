#!/bin/bash
echo "=== 1. 端口监听状态 ==="
ss -tlnp | grep ':3000\|:3001\|:8080' || echo "没有监听3000/3001/8080"

echo ""
echo "=== 2. PM2 进程详情 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 describe haoyouji-web' 2>/dev/null | head -30

echo ""
echo "=== 3. PM2 错误日志（最近50行） ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --err --lines 50 --nostream' 2>/dev/null

echo ""
echo "=== 4. PM2 输出日志（最近50行） ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --out --lines 50 --nostream' 2>/dev/null

echo ""
echo "=== 5. 直接测试MySQL连接 ==="
mysql -u root -p'Hu20190603' -h 127.0.0.1 -e "SELECT 'MySQL OK'; SELECT COUNT(*) as ts_daily_count FROM ts_daily; SHOW INDEX FROM ts_daily;" crm_db 2>&1 | head -30

echo ""
echo "=== 6. 测试API（等10秒） ==="
timeout 15 curl -sv "http://127.0.0.1:3000/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | tail -20

echo ""
echo "=== 7. 检查.env中DATABASE_URL格式 ==="
grep "DATABASE_URL" /home/ubuntu/haoyouji-web/.env 2>/dev/null | sed 's/Hu[^@]*/Hu***/'

echo ""
echo "=== 8. Node进程 ==="
ps aux | grep -E "node|pm2" | grep -v grep | head -10

echo ""
echo "=== 完成 ==="
