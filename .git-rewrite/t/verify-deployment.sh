#!/bin/bash

echo "========================================="
echo "股权功能部署验证脚本"
echo "========================================="
echo ""

# 1. 检查 Git 版本
echo "1. 检查当前 Git 版本："
git log -1 --oneline
echo ""

# 2. 检查关键文件是否存在
echo "2. 检查关键文件是否存在："
files=(
  "client/src/pages/MyEquity.tsx"
  "client/src/pages/admin/EquityManagement.tsx"
  "server/db-equity.ts"
  "server/equity-router.ts"
  "migrations/add_equity_system.sql"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file - 存在"
  else
    echo "❌ $file - 不存在"
  fi
done
echo ""

# 3. 检查 Profile.tsx 中是否有"我的股权"
echo "3. 检查 Profile.tsx 中的'我的股权'按钮："
if grep -q "我的股权" client/src/pages/Profile.tsx; then
  echo "✅ Profile.tsx 包含'我的股权'按钮"
  grep -n "我的股权" client/src/pages/Profile.tsx
else
  echo "❌ Profile.tsx 不包含'我的股权'按钮"
fi
echo ""

# 4. 检查 App.tsx 中的路由
echo "4. 检查 App.tsx 中的股权路由："
if grep -q "my-equity" client/src/App.tsx; then
  echo "✅ App.tsx 包含股权路由"
  grep -n "my-equity\|EquityManagement" client/src/App.tsx
else
  echo "❌ App.tsx 不包含股权路由"
fi
echo ""

# 5. 检查构建产物
echo "5. 检查构建产物（dist目录）："
if [ -d "dist" ]; then
  echo "✅ dist 目录存在"
  echo "最后构建时间："
  ls -lh dist/public/index.html 2>/dev/null || echo "❌ 找不到 dist/public/index.html"
else
  echo "❌ dist 目录不存在，需要运行 pnpm build"
fi
echo ""

# 6. 检查 node_modules
echo "6. 检查依赖安装："
if [ -d "node_modules" ]; then
  echo "✅ node_modules 存在"
else
  echo "❌ node_modules 不存在，需要运行 pnpm install"
fi
echo ""

echo "========================================="
echo "验证完成！"
echo "========================================="
echo ""
echo "如果所有检查都通过，但前端仍然看不到按钮，请尝试："
echo "1. 清除浏览器缓存（Ctrl+Shift+Delete）"
echo "2. 强制刷新页面（Ctrl+Shift+R 或 Cmd+Shift+R）"
echo "3. 重新构建并重启服务："
echo "   pnpm build"
echo "   pm2 restart all  # 或您使用的进程管理器"
