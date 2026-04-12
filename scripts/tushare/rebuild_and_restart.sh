#!/bin/bash
set -e

echo "=== 1. 查找包含最新源代码的目录 ==="
# 自动部署从 root 用户目录构建，找到那个目录
ROOT_DIR=""
for d in /root/haoyouji-web /home/runner/haoyouji-web; do
  if [ -f "$d/server/routers.ts" ]; then
    ROOT_DIR="$d"
    break
  fi
done

# 也检查 ubuntu 目录
UBUNTU_DIR="/home/ubuntu/haoyouji-web"

echo "Root目录: $ROOT_DIR"
echo "Ubuntu目录: $UBUNTU_DIR"

# 检查哪个目录有 aiDashboard
if [ -n "$ROOT_DIR" ]; then
  echo "Root目录 routers.ts 行数: $(wc -l < $ROOT_DIR/server/routers.ts)"
  echo "Root目录 aiDashboard: $(grep -c aiDashboard $ROOT_DIR/server/routers.ts || echo 0)"
fi
echo "Ubuntu目录 routers.ts: $(ls -lh $UBUNTU_DIR/server/routers.ts 2>/dev/null || echo '不存在')"
if [ -f "$UBUNTU_DIR/server/routers.ts" ]; then
  echo "Ubuntu目录 routers.ts 行数: $(wc -l < $UBUNTU_DIR/server/routers.ts)"
  echo "Ubuntu目录 aiDashboard: $(grep -c aiDashboard $UBUNTU_DIR/server/routers.ts || echo 0)"
fi

echo ""
echo "=== 2. 同步最新源代码到 ubuntu 目录 ==="
if [ -n "$ROOT_DIR" ]; then
  # 同步 server 目录（包含路由代码）
  rsync -a --delete "$ROOT_DIR/server/" "$UBUNTU_DIR/server/"
  rsync -a --delete "$ROOT_DIR/shared/" "$UBUNTU_DIR/shared/"
  rsync -a --delete "$ROOT_DIR/drizzle/" "$UBUNTU_DIR/drizzle/"
  # 同步 package.json 和 tsconfig
  cp "$ROOT_DIR/package.json" "$UBUNTU_DIR/package.json"
  cp "$ROOT_DIR/tsconfig.json" "$UBUNTU_DIR/tsconfig.json" 2>/dev/null || true
  chown -R ubuntu:ubuntu "$UBUNTU_DIR/server" "$UBUNTU_DIR/shared" "$UBUNTU_DIR/drizzle"
  echo "✅ 源代码已从 $ROOT_DIR 同步到 $UBUNTU_DIR"
else
  echo "⚠️ 未找到 root 目录，尝试 git pull"
  cd $UBUNTU_DIR && git pull origin main 2>/dev/null || true
fi

echo ""
echo "=== 3. 验证同步后的源代码 ==="
echo "Ubuntu routers.ts 行数: $(wc -l < $UBUNTU_DIR/server/routers.ts)"
echo "Ubuntu aiDashboard: $(grep -c aiDashboard $UBUNTU_DIR/server/routers.ts || echo 0)"

echo ""
echo "=== 4. 在 ubuntu 目录重新构建 ==="
cd $UBUNTU_DIR
npx esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist 2>&1
ls -lh dist/index.js
grep -c "aiDashboardMarketCount" dist/index.js && echo "✅ 构建产物包含 aiDashboard"
chown ubuntu:ubuntu dist/index.js

echo ""
echo "=== 5. 强制 delete + start PM2 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 delete haoyouji-web' 2>/dev/null || true
sleep 3
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 start /home/ubuntu/haoyouji-web/ecosystem.config.cjs'
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 save'
sleep 15

echo ""
echo "=== 6. 测试 API ==="
echo "--- auth.me ---"
timeout 10 curl -s "http://127.0.0.1:3001/api/trpc/auth.me" 2>&1 | head -c 200
echo ""
echo "--- aiDashboardMarketCount ---"
timeout 20 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -c 500
echo ""
echo "--- aiDashboardSurvival ---"
timeout 60 curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22market%22%3A%22all%22%7D%7D" 2>&1 | head -c 500
echo ""

echo ""
echo "=== 完成 ==="
