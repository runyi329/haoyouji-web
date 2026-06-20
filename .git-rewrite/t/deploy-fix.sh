#!/bin/bash
# 一键部署脚本 - 自动清理冲突并部署

set -e

echo "🚀 开始部署..."

# 进入项目目录
cd /root/haoyouji-web

# 清理未跟踪的文件（包括冲突的SQL文件）
echo "🧹 清理冲突文件..."
git clean -fd

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 安装依赖
echo "📦 安装依赖..."
pnpm install

# 构建项目
echo "🔨 构建项目..."
pnpm run build

# 重启服务
echo "🔄 重启服务..."
pm2 restart haoyouji-web

echo "✅ 部署完成！"
