#!/bin/bash
echo "=== 1. haoyouji-web 应用路径和代码版本 ==="
cd /home/ubuntu/haoyouji-web
echo "Git HEAD: $(git log --oneline -1)"
echo "当前分支: $(git branch --show-current)"

echo ""
echo "=== 2. 检查 dist/index.js 中是否包含 aiDashboard ==="
grep -c "aiDashboard" dist/index.js 2>/dev/null || echo "dist/index.js 不存在或不包含 aiDashboard"

echo ""
echo "=== 3. 检查 src 中的 aiDashboard 路由 ==="
find src -name "*.ts" -exec grep -l "aiDashboard" {} \; 2>/dev/null

echo ""
echo "=== 4. 检查 server/routers.ts 中的路由注册 ==="
grep -n "aiDashboard\|router\|procedure" src/server/routers/aiDashboard.ts 2>/dev/null | head -20
echo "---"
grep -n "aiDashboard" src/server/routers.ts 2>/dev/null || echo "routers.ts 中没有 aiDashboard"

echo ""
echo "=== 5. PM2 启动配置 ==="
cat ecosystem.config.cjs 2>/dev/null || cat ecosystem.config.js 2>/dev/null || echo "没有 ecosystem 配置"

echo ""
echo "=== 6. package.json 中的 start 脚本 ==="
grep -A2 '"start"' package.json 2>/dev/null

echo ""
echo "=== 7. 检查 haoyouji-web PM2 的启动脚本 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 describe haoyouji-web' 2>/dev/null | grep -E "script|exec_cwd|node_args|pm_exec_path"

echo ""
echo "=== 8. 检查端口3001上的应用 ==="
curl -s "http://127.0.0.1:3001/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -5

echo ""
echo "=== 9. 列出所有tRPC路由（从dist/index.js提取） ==="
grep -oP 'procedure.*?aiDashboard\w+' dist/index.js 2>/dev/null | head -10
echo "---"
grep -oP '"[a-zA-Z]+Dashboard[a-zA-Z]*"' dist/index.js 2>/dev/null | head -10

echo ""
echo "=== 10. 检查 .env 中 DATABASE_URL 是否已修复 ==="
python3 -c "
import pymysql
try:
    conn = pymysql.connect(host='127.0.0.1', user='root', password='Miao@20190603', database='crm_db', port=3306, connect_timeout=5)
    print('✅ 数据库连接正常')
    conn.close()
except Exception as e:
    print(f'❌ {e}')
"

echo ""
echo "=== 11. 重新构建并部署 ==="
cd /home/ubuntu/haoyouji-web
git pull origin main 2>&1 | tail -5
npm run build 2>&1 | tail -10
echo "构建完成，检查 dist/index.js 中 aiDashboard..."
grep -c "aiDashboard" dist/index.js 2>/dev/null || echo "构建后仍不包含 aiDashboard"

echo ""
echo "=== 12. 重启应用 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 restart haoyouji-web'
sleep 10

echo ""
echo "=== 13. 再次测试API ==="
APP_PORT=$(ss -tlnp | grep "haoyouji\|pm2\|PM2" | grep -oP ':\K300[0-9]' | head -1)
echo "PM2应用端口: $APP_PORT"
# 尝试所有可能的端口
for port in 3001 3002 3003; do
    echo "--- 测试端口 $port ---"
    result=$(timeout 10 curl -s "http://127.0.0.1:$port/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1)
    echo "$result" | head -3
done

echo ""
echo "=== 完成 ==="
