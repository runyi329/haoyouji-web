#!/bin/bash
# 服务器端部署脚本 - 由 GitHub Actions 通过 SSH 调用
set -e

echo "📂 进入项目目录..."
cd /root/haoyouji-web

echo "📥 拉取最新代码..."
git fetch origin && git reset --hard origin/main && git clean -fd

echo "🧹 清除 Vite 缓存（保留旧 dist 继续服务）..."
rm -rf node_modules/.vite client/.vite

echo "📦 安装依赖..."
pnpm install

echo "🔨 构建项目（旧 dist 在整个构建期间保持可用）..."
pnpm run build || { echo "❌ 构建失败，保留旧版本继续运行"; exit 1; }

echo "📊 执行数据库迁移..."
bash scripts/post-deploy-migration.sh || true

echo "📊 执行数据库结构更新..."
bash scripts/db-migrations.sh || true

echo "💳 注入支付宝环境变量..."
node /root/haoyouji-web/scripts/inject-alipay-env.cjs

echo "🔄 零停机部署（先启动新进程再停旧进程）..."
if pm2 describe haoyouji-web > /dev/null 2>&1; then
  pm2 restart /root/haoyouji-web/ecosystem.config.cjs --env production --update-env
else
  pm2 start /root/haoyouji-web/ecosystem.config.cjs --env production
fi
pm2 save

echo "🔄 同步新代码到实际服务目录..."
cp -r /root/haoyouji-web/dist/. /home/ubuntu/haoyouji-web/dist/
cp /root/haoyouji-web/package.json /home/ubuntu/haoyouji-web/package.json
cp /root/haoyouji-web/pnpm-lock.yaml /home/ubuntu/haoyouji-web/pnpm-lock.yaml
chown -R ubuntu:ubuntu /home/ubuntu/haoyouji-web/dist

echo "🔄 同步node_modules..."
rsync -a --delete /root/haoyouji-web/node_modules/ /home/ubuntu/haoyouji-web/node_modules/
chown -R ubuntu:ubuntu /home/ubuntu/haoyouji-web/node_modules

echo "🔄 重启实际服务进程..."
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 restart haoyouji-web' 2>&1
sleep 5

echo "当前监听端口："
ss -tlnp | grep node || echo '暂无node监听'

echo "✅ 部署完成！"
echo "=== 🔍 临时调试：win_status差异查询 ==="
bash /root/haoyouji-web/scripts/debug-win-status.sh || true
echo "=== 🔍 调试查询完成 ==="
