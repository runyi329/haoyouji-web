#!/bin/bash
set -e

echo "=== 1. 在 root 目录拉取最新代码 ==="
cd /root/haoyouji-web
git fetch origin
git reset --hard origin/main
git clean -fd
echo "当前 commit: $(git log --oneline -1)"

echo ""
echo "=== 2. 安装依赖 ==="
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo ""
echo "=== 3. 重新构建（前端+后端）==="
rm -rf dist/
pnpm run build
echo "后端构建产物: $(ls -lh dist/index.js)"
echo "前端JS文件数: $(ls dist/public/assets/*.js 2>/dev/null | wc -l)"
echo "包含 aiDashboard: $(grep -c 'aiDashboard' dist/index.js || echo 0)"

echo ""
echo "=== 4. 清空并同步到 ubuntu 目录（先删除旧文件！）==="
# 先完全清空旧的 dist
rm -rf /home/ubuntu/haoyouji-web/dist/
# 再复制新的 dist
cp -r /root/haoyouji-web/dist/. /home/ubuntu/haoyouji-web/dist/
chown -R ubuntu:ubuntu /home/ubuntu/haoyouji-web/dist
echo "✅ dist 已清空并重新同步"
echo "ubuntu dist/public/assets JS文件数: $(ls /home/ubuntu/haoyouji-web/dist/public/assets/*.js | wc -l)"
echo "ubuntu index.html 引用: $(grep -o 'src=\"[^\"]*\.js\"' /home/ubuntu/haoyouji-web/dist/public/index.html | head -2)"
grep -rl "数据截至" /home/ubuntu/haoyouji-web/dist/public/assets/ && echo "✅ 前端包含'数据截至'" || echo "❌ 前端不包含'数据截至'"

echo ""
echo "=== 5. 强制 delete + start PM2 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 delete haoyouji-web 2>/dev/null || true'
sleep 2
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 start /home/ubuntu/haoyouji-web/ecosystem.config.cjs'
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 save'
echo "等待应用启动..."
sleep 15

echo ""
echo "=== 6. 测试 API ==="
echo "--- auth.me ---"
timeout 10 curl -s "http://127.0.0.1:3001/api/trpc/auth.me" 2>&1 | head -c 100
echo ""
echo "--- aiDashboardSurvival (total) ---"
timeout 60 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 200
echo ""

echo ""
echo "=== 完成 ==="
