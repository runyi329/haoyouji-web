#!/bin/bash
set -e
cd /home/ubuntu/haoyouji-web

echo "=== 1. 拉取最新代码 ==="
git fetch origin main
git reset --hard origin/main
echo "Git HEAD: $(git log --oneline -1)"

echo ""
echo "=== 2. 检查 routers.ts 中 aiDashboard ==="
grep -c "aiDashboard" server/routers.ts || echo "没有 aiDashboard"

echo ""
echo "=== 3. 安装依赖 ==="
npm install 2>&1 | tail -5

echo ""
echo "=== 4. 构建应用 ==="
npm run build 2>&1 | tail -15

echo ""
echo "=== 5. 检查构建产物 ==="
ls -lh dist/index.js 2>/dev/null || echo "dist/index.js 不存在"
grep -c "aiDashboard" dist/index.js 2>/dev/null || echo "dist/index.js 不包含 aiDashboard"

echo ""
echo "=== 6. 检查 .env 数据库密码 ==="
# 确保密码正确
if grep -q "Hu20190603" .env; then
    echo "密码仍是旧的，修复中..."
    sed -i 's|Hu20190603|Miao%4020190603|g' .env
    echo "已修复"
else
    echo "密码已经是正确的"
fi

echo ""
echo "=== 7. 重启 PM2 应用 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 restart haoyouji-web'
sleep 15

echo ""
echo "=== 8. 检查应用状态 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 status'
ss -tlnp | grep ':300'

echo ""
echo "=== 9. 测试 API ==="
for port in 3001 3002 3003; do
    result=$(timeout 15 curl -s "http://127.0.0.1:$port/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1)
    if echo "$result" | grep -q "result"; then
        echo "✅ 端口 $port: $result" | head -c 200
        echo ""
        echo "测试 survival..."
        timeout 30 curl -s "http://127.0.0.1:$port/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 300
        echo ""
        break
    elif echo "$result" | grep -q "NOT_FOUND"; then
        echo "❌ 端口 $port: 路由不存在"
    else
        echo "⚠️ 端口 $port: $result" | head -c 100
    fi
done

echo ""
echo "=== 10. PM2 错误日志 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --err --lines 20 --nostream' 2>/dev/null

echo ""
echo "=== 完成 ==="
