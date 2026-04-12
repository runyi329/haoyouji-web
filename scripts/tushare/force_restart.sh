#!/bin/bash
cd /home/ubuntu/haoyouji-web

echo "=== 1. 确认 dist/index.js 包含 aiDashboard ==="
ls -lh dist/index.js
grep -c "aiDashboard" dist/index.js && echo "✅ 路由代码存在"

echo ""
echo "=== 2. 强制删除并重新启动 PM2 进程 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 delete haoyouji-web' 2>/dev/null || true
sleep 2
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 start /home/ubuntu/haoyouji-web/ecosystem.config.cjs'
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 save'
sleep 15

echo ""
echo "=== 3. 检查状态 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 status'
ss -tlnp | grep ':300'

echo ""
echo "=== 4. 查看启动日志（输出日志最后30行） ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --out --lines 30 --nostream' 2>/dev/null

echo ""
echo "=== 5. 查看错误日志 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --err --lines 30 --nostream' 2>/dev/null

echo ""
echo "=== 6. 测试 API（端口3001） ==="
echo "--- marketCount ---"
timeout 20 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -c 300
echo ""
echo "--- survival ---"
timeout 60 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 500
echo ""

echo ""
echo "=== 完成 ==="
