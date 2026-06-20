#!/bin/bash

# 好友记数据库备份脚本执行包装器
# 此脚本从Manus平台环境变量中读取配置并执行备份

set -e

echo "🔍 检查环境变量配置..."

# 检查DATABASE_URL是否已设置
if [ -z "$DATABASE_URL" ]; then
    echo "❌ 错误: DATABASE_URL 环境变量未设置"
    echo ""
    echo "请在Manus平台项目设置中配置以下环境变量:"
    echo "  DATABASE_URL=mysql://username:password@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/dWfvfUieyVkmVGc44bjad7"
    echo ""
    echo "可选的S3配置(用于备份上传):"
    echo "  AWS_ACCESS_KEY_ID=your_access_key_id"
    echo "  AWS_SECRET_ACCESS_KEY=your_secret_access_key"
    echo "  S3_BUCKET=haoyouji-backups"
    echo "  S3_REGION=us-east-1"
    echo ""
    exit 1
fi

# 显示配置信息(隐藏敏感信息)
MASKED_URL=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
echo "✅ DATABASE_URL: $MASKED_URL"

if [ -n "$AWS_ACCESS_KEY_ID" ]; then
    echo "✅ S3配置: 已设置"
else
    echo "⚠️  S3配置: 未设置(备份将仅保存在本地)"
fi

echo ""

# 切换到项目目录
cd "$(dirname "$0")"

# 安装依赖(如果需要)
if [ ! -d "node_modules" ]; then
    echo "📦 安装项目依赖..."
    pnpm install --prod
    echo ""
fi

# 执行备份脚本
echo "🚀 执行备份脚本..."
node scripts/backup-database.mjs

exit $?
