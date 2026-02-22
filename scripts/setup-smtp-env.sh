#!/bin/bash

# 配置SMTP环境变量脚本
# 在服务器上运行此脚本以配置邮件服务所需的环境变量

set -e

PROJECT_DIR="/root/haoyouji-web"
ENV_FILE="$PROJECT_DIR/.env"

echo "=========================================="
echo "  配置SMTP环境变量"
echo "=========================================="
echo ""

# 检查项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 错误：项目目录不存在 $PROJECT_DIR"
    exit 1
fi

# 检查.env文件
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 错误：.env文件不存在"
    exit 1
fi

# 检查SMTP配置是否已存在
if grep -q "SMTP_HOST" "$ENV_FILE"; then
    echo "✅ SMTP配置已存在"
    echo ""
    echo "当前配置："
    grep "SMTP_" "$ENV_FILE"
    echo ""
    read -p "是否覆盖现有配置？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "取消配置"
        exit 0
    fi
    # 删除现有SMTP配置
    sed -i '/SMTP_/d' "$ENV_FILE"
fi

# 添加SMTP配置
echo "" >> "$ENV_FILE"
echo "# SMTP邮件配置 (自动添加于 $(date))" >> "$ENV_FILE"
echo "SMTP_HOST=smtp.qq.com" >> "$ENV_FILE"
echo "SMTP_PORT=465" >> "$ENV_FILE"
echo "SMTP_SECURE=true" >> "$ENV_FILE"
echo "SMTP_USER=tina_u@qq.com" >> "$ENV_FILE"
echo "SMTP_PASS=wqettalptfmebgdf" >> "$ENV_FILE"

echo "✅ SMTP配置已添加到 $ENV_FILE"
echo ""
echo "配置内容："
grep "SMTP_" "$ENV_FILE"
echo ""
echo "=========================================="
echo "  配置完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 重启应用: pm2 restart haoyouji-web"
echo "  2. 在应用中测试备份功能"
echo ""
