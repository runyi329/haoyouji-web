#!/bin/bash
echo "=== 1. 修复两个目录的 .env 密码 ==="

# 修复 ubuntu 用户目录
if grep -q "Hu20190603" /home/ubuntu/haoyouji-web/.env 2>/dev/null; then
    sed -i 's|Hu20190603|Miao%4020190603|g' /home/ubuntu/haoyouji-web/.env
    echo "✅ /home/ubuntu/haoyouji-web/.env 密码已修复"
else
    echo "ℹ️ /home/ubuntu/haoyouji-web/.env 密码已正确"
fi

# 修复 root 用户目录（自动部署源）
for dir in /root/haoyouji-web /home/*/haoyouji-web; do
    if [ -f "$dir/.env" ]; then
        if grep -q "Hu20190603" "$dir/.env" 2>/dev/null; then
            sed -i 's|Hu20190603|Miao%4020190603|g' "$dir/.env"
            echo "✅ $dir/.env 密码已修复"
        else
            echo "ℹ️ $dir/.env 密码已正确"
        fi
    fi
done

echo ""
echo "=== 2. 检查 dist/index.js 大小和 aiDashboard ==="
ls -lh /home/ubuntu/haoyouji-web/dist/index.js
grep -c "aiDashboard" /home/ubuntu/haoyouji-web/dist/index.js && echo "✅ 包含 aiDashboard 路由"

echo ""
echo "=== 3. 重启应用 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 restart haoyouji-web'
sleep 12

echo ""
echo "=== 4. 测试 API ==="
echo "--- aiDashboardMarketCount ---"
timeout 20 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -c 500
echo ""
echo ""
echo "--- aiDashboardSurvival ---"
timeout 60 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 500
echo ""

echo ""
echo "=== 5. PM2 错误日志（最新10行） ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --err --lines 10 --nostream' 2>/dev/null

echo ""
echo "=== 完成 ==="
