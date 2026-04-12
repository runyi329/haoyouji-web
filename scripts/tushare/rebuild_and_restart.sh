#!/bin/bash
set -e
cd /home/ubuntu/haoyouji-web

echo "=== 1. 当前代码版本 ==="
git log --oneline -1

echo ""
echo "=== 2. 重新构建（在 ubuntu 用户目录直接构建） ==="
export NODE_ENV=production
npx esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist 2>&1
echo "构建完成"
ls -lh dist/index.js
grep -c "aiDashboardMarketCount" dist/index.js && echo "✅ 包含 aiDashboard 路由"

echo ""
echo "=== 3. 强制 delete + start PM2 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 delete haoyouji-web' 2>/dev/null || true
sleep 3
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 start /home/ubuntu/haoyouji-web/ecosystem.config.cjs'
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 save'
sleep 15

echo ""
echo "=== 4. 验证 PM2 状态 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 status'

echo ""
echo "=== 5. 测试 API ==="
echo "--- auth.me (已知可用路由) ---"
timeout 10 curl -s "http://127.0.0.1:3001/api/trpc/auth.me" 2>&1 | head -c 200
echo ""
echo ""
echo "--- aiDashboardMarketCount ---"
timeout 20 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -c 500
echo ""
echo ""
echo "--- aiDashboardSurvival ---"
timeout 60 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 500
echo ""

echo ""
echo "=== 完成 ==="
