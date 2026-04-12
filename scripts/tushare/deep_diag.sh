#!/bin/bash
cd /home/ubuntu/haoyouji-web

echo "=== 1. dist/index.js 文件信息 ==="
ls -lh dist/index.js
md5sum dist/index.js

echo ""
echo "=== 2. dist/index.js 中 aiDashboard 出现次数和上下文 ==="
grep -c "aiDashboard" dist/index.js
grep -o "aiDashboard[A-Za-z]*" dist/index.js | sort | uniq -c

echo ""
echo "=== 3. 检查 appRouter 中是否包含 aiDashboard（在构建产物中） ==="
# 搜索 appRouter 定义附近是否有 aiDashboard
grep -n "appRouter" dist/index.js | head -5
# 搜索 tRPC 路由注册模式
grep -c "aiDashboardMarketCount" dist/index.js
grep -c "aiDashboardSurvival" dist/index.js

echo ""
echo "=== 4. 检查 PM2 实际运行的文件 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 describe haoyouji-web' 2>/dev/null | grep -E "script|exec_cwd|pm_exec_path|node_args"

echo ""
echo "=== 5. 检查 ecosystem.config.cjs ==="
cat /home/ubuntu/haoyouji-web/ecosystem.config.cjs

echo ""
echo "=== 6. 直接用 node 测试路由注册 ==="
node -e "
const fs = require('fs');
// 检查 dist/index.js 中是否有 aiDashboardMarketCount 字符串
const content = fs.readFileSync('/home/ubuntu/haoyouji-web/dist/index.js', 'utf8');
const idx = content.indexOf('aiDashboardMarketCount');
if (idx >= 0) {
  console.log('找到 aiDashboardMarketCount 在位置:', idx);
  console.log('上下文:', content.substring(Math.max(0, idx-100), idx+100));
} else {
  console.log('❌ dist/index.js 中没有 aiDashboardMarketCount');
}
"

echo ""
echo "=== 7. 检查是否有多个 dist/index.js ==="
find / -name "index.js" -path "*/haoyouji-web/dist/*" 2>/dev/null

echo ""
echo "=== 8. 检查 node 进程实际加载的文件 ==="
WORKER_PID=$(sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 pid haoyouji-web' 2>/dev/null)
echo "Worker PID: $WORKER_PID"
if [ -n "$WORKER_PID" ] && [ "$WORKER_PID" != "0" ]; then
  ls -l /proc/$WORKER_PID/cwd 2>/dev/null
  cat /proc/$WORKER_PID/cmdline 2>/dev/null | tr '\0' ' '
  echo ""
fi

echo ""
echo "=== 9. 列出所有已注册的 tRPC 路由（通过请求空路径） ==="
timeout 10 curl -s "http://127.0.0.1:3001/api/trpc" 2>&1 | head -c 500

echo ""
echo "=== 10. 尝试一个已知存在的路由 ==="
timeout 10 curl -s "http://127.0.0.1:3001/api/trpc/auth.me" 2>&1 | head -c 300

echo ""
echo "=== 完成 ==="
