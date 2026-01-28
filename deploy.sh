#!/bin/bash
# 好友记项目部署脚本
# 用于在腾讯云服务器上部署项目

set -e  # 遇到错误立即退出

echo "=========================================="
echo "好友记项目部署脚本"
echo "=========================================="

# 1. 检查Node.js和pnpm
echo ""
echo "1. 检查环境..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装,请先安装Node.js 22.x"
    exit 1
fi
echo "✅ Node.js版本: $(node -v)"

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm未安装,正在安装..."
    npm install -g pnpm
fi
echo "✅ pnpm版本: $(pnpm -v)"

# 2. 安装依赖
echo ""
echo "2. 安装项目依赖..."
pnpm install

# 3. 检查环境变量
echo ""
echo "3. 检查环境变量..."
if [ ! -f .env.production ]; then
    echo "❌ .env.production文件不存在!"
    echo "请先创建.env.production文件并配置环境变量"
    exit 1
fi
echo "✅ 环境变量文件存在"

# 4. 构建项目
echo ""
echo "4. 构建项目..."
pnpm run build
echo "✅ 构建完成"

# 5. 检查PM2
echo ""
echo "5. 检查PM2进程管理器..."
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2未安装,正在安装..."
    npm install -g pm2
fi
echo "✅ PM2已安装"

# 6. 停止旧进程
echo ""
echo "6. 停止旧进程..."
pm2 stop haoyouji 2>/dev/null || echo "没有运行中的进程"
pm2 delete haoyouji 2>/dev/null || echo "没有需要删除的进程"

# 7. 启动新进程
echo ""
echo "7. 启动新进程..."
pm2 start npm --name haoyouji -- start
pm2 save

echo ""
echo "=========================================="
echo "✅ 部署完成!"
echo "=========================================="
echo ""
echo "📊 查看进程状态: pm2 status"
echo "📝 查看日志: pm2 logs haoyouji"
echo "🔄 重启服务: pm2 restart haoyouji"
echo "🛑 停止服务: pm2 stop haoyouji"
echo ""
echo "🌐 访问地址: http://服务器IP:3000"
echo ""
