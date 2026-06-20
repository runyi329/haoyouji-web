#!/bin/bash

# 账本备份功能快速部署脚本
# 使用方法：./scripts/deploy-backup-feature.sh

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  好友记 - 账本备份功能部署脚本"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录下运行此脚本"
    exit 1
fi

# 1. 拉取最新代码
echo "📥 步骤 1/7: 拉取最新代码..."
git pull origin main
echo "✅ 代码已更新"
echo ""

# 2. 检查环境变量
echo "🔍 步骤 2/7: 检查环境变量..."
if [ ! -f ".env" ]; then
    echo "❌ 错误：.env 文件不存在"
    exit 1
fi

if ! grep -q "SMTP_HOST" .env; then
    echo "⚠️  警告：未找到 SMTP 配置，请手动添加以下内容到 .env 文件："
    echo ""
    echo "SMTP_HOST=smtp.qq.com"
    echo "SMTP_PORT=465"
    echo "SMTP_SECURE=true"
    echo "SMTP_USER=tina_u@qq.com"
    echo "SMTP_PASS=wqettalptfmebgdf"
    echo ""
    read -p "是否已手动添加？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 部署中止"
        exit 1
    fi
else
    echo "✅ SMTP 配置已存在"
fi
echo ""

# 3. 安装依赖
echo "📦 步骤 3/7: 安装依赖..."
pnpm install
echo "✅ 依赖安装完成"
echo ""

# 4. 构建项目
echo "🔨 步骤 4/7: 构建项目..."
pnpm run build
echo "✅ 项目构建完成"
echo ""

# 5. 重启应用
echo "🔄 步骤 5/7: 重启应用..."
if command -v pm2 &> /dev/null; then
    pm2 restart haoyouji-web || pm2 restart all
    echo "✅ 应用已重启"
else
    echo "⚠️  警告：未找到 pm2，请手动重启应用"
fi
echo ""

# 6. 配置定时任务
echo "⏰ 步骤 6/7: 配置定时任务..."
PROJECT_DIR=$(pwd)
NODE_PATH=$(which node)

# 检查是否已配置cron
if crontab -l 2>/dev/null | grep -q "cron-backup.ts"; then
    echo "✅ Cron 任务已存在"
else
    echo "⚠️  需要配置 Cron 任务"
    echo ""
    echo "请执行以下命令："
    echo "  crontab -e"
    echo ""
    echo "然后添加以下行："
    echo "  0 * * * * cd $PROJECT_DIR && $NODE_PATH --loader ts-node/esm server/cron-backup.ts >> /var/log/haoyouji-backup.log 2>&1"
    echo ""
    read -p "是否现在配置？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 创建临时cron文件
        crontab -l 2>/dev/null > /tmp/mycron || true
        echo "0 * * * * cd $PROJECT_DIR && $NODE_PATH --loader ts-node/esm server/cron-backup.ts >> /var/log/haoyouji-backup.log 2>&1" >> /tmp/mycron
        crontab /tmp/mycron
        rm /tmp/mycron
        echo "✅ Cron 任务已配置"
    else
        echo "⚠️  请稍后手动配置 Cron 任务"
    fi
fi
echo ""

# 7. 测试定时任务
echo "🧪 步骤 7/7: 测试定时任务..."
read -p "是否运行测试？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "运行测试..."
    node --loader ts-node/esm server/cron-backup.ts
    echo "✅ 测试完成"
else
    echo "⏭️  跳过测试"
fi
echo ""

# 完成
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "📋 下一步操作："
echo "  1. 登录应用并进入账本设置"
echo "  2. 配置定期自动备份"
echo "  3. 点击'立即发送测试邮件'验证功能"
echo ""
echo "📝 查看日志："
echo "  tail -f /var/log/haoyouji-backup.log"
echo ""
echo "🔍 查看 Cron 任务："
echo "  crontab -l"
echo ""
