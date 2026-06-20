#!/bin/bash

# 部署后自动配置脚本
# 在服务器上git pull后自动运行此脚本

set -e

echo "🔧 开始部署后配置..."

# 检查.env文件是否存在
if [ -f ".env" ]; then
    echo "✅ .env文件已存在"
else
    echo "📝 创建.env文件..."
    cat > .env << 'EOF'
DEEPSEEK_API_KEY=sk-82bd31e2b19d49b4a5521da40df6582c
QICHACHA_APP_KEY=152b7fd199d145579398ac5203aa77e1
QICHACHA_SECRET_KEY=F158CC5678656B62B985E75D5A3DFB82
EOF
    echo "✅ 环境变量配置完成！"
fi

echo "✅ 部署后配置完成！"
