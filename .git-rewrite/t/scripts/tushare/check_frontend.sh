#!/bin/bash
echo "=== 检查服务器前端文件 ==="

echo "--- ubuntu dist/public 目录 ---"
ls -lht /home/ubuntu/haoyouji-web/dist/public/assets/*.js 2>/dev/null | head -5
echo "文件总数: $(ls /home/ubuntu/haoyouji-web/dist/public/assets/*.js 2>/dev/null | wc -l)"

echo ""
echo "--- 检查前端JS是否包含新代码 ---"
grep -rl "数据截至" /home/ubuntu/haoyouji-web/dist/public/assets/ 2>/dev/null && echo "✅ 找到'数据截至'" || echo "❌ 未找到'数据截至'"
grep -rl "latestDate" /home/ubuntu/haoyouji-web/dist/public/assets/ 2>/dev/null && echo "✅ 找到'latestDate'" || echo "❌ 未找到'latestDate'"

echo ""
echo "--- root dist/public 目录 ---"
ls -lht /root/haoyouji-web/dist/public/assets/*.js 2>/dev/null | head -5
grep -rl "数据截至" /root/haoyouji-web/dist/public/assets/ 2>/dev/null && echo "✅ root目录找到'数据截至'" || echo "❌ root目录未找到'数据截至'"

echo ""
echo "--- index.html 引用的JS文件 ---"
cat /home/ubuntu/haoyouji-web/dist/public/index.html | grep -o 'src="[^"]*\.js"' | head -5

echo ""
echo "--- Express静态文件服务配置 ---"
grep -n "static\|public\|dist" /home/ubuntu/haoyouji-web/dist/index.js | head -10

echo ""
echo "--- 直接访问前端页面 ---"
curl -s http://127.0.0.1:3001/ | grep -o 'src="[^"]*\.js"' | head -5
