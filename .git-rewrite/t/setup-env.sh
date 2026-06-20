#!/bin/bash

# 环境变量一键配置脚本
# 使用方法：在服务器上运行 bash setup-env.sh

set -e

echo "🔧 开始配置环境变量..."

# 检查是否在项目目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 提示输入DeepSeek API密钥
echo ""
echo "请输入DeepSeek API密钥："
read -r DEEPSEEK_API_KEY

if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "❌ 错误：DeepSeek API密钥不能为空"
    exit 1
fi

# 创建.env文件
echo "📝 创建.env文件..."
cat > .env << EOF
# AI助手配置
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY

# 企查查API配置
QICHACHA_APP_KEY=152b7fd199d145579398ac5203aa77e1
QICHACHA_SECRET_KEY=F158CC5678656B62B985E75D5A3DFB82
EOF

echo "✅ 环境变量配置完成！"
echo ""
echo "📋 已配置的环境变量："
echo "  - DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:0:10}..."
echo "  - QICHACHA_APP_KEY: 152b7fd199d145579398ac5203aa77e1"
echo "  - QICHACHA_SECRET_KEY: F158CC5678656B62B985E75D5A3DFB82"
echo ""
echo "🔄 请运行以下命令重启服务："
echo "  pm2 restart haoyouji-web"
echo ""
echo "✅ 配置完成！"
