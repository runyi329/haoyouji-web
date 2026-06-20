#!/bin/bash
# 数据库迁移脚本 - 添加balance字段和充值相关表
# 使用方法: ./run-migration.sh

echo "======================================"
echo "数据库迁移: 添加余额功能"
echo "======================================"
echo ""

# 检查.env文件是否存在
if [ ! -f .env ]; then
    echo "错误: .env文件不存在"
    echo "请确保在项目根目录运行此脚本"
    exit 1
fi

# 从.env文件读取数据库连接信息
source .env

if [ -z "$DATABASE_URL" ]; then
    echo "错误: DATABASE_URL未设置"
    exit 1
fi

echo "正在连接数据库..."
echo ""

# 执行迁移SQL
mysql --defaults-extra-file=<(cat <<EOF
[client]
$(echo "$DATABASE_URL" | sed 's/mysql:\/\/\([^:]*\):\([^@]*\)@\([^:]*\):\([^/]*\)\/\(.*\)/user=\1\npassword=\2\nhost=\3\nport=\4\ndatabase=\5/')
EOF
) < migrations/add_balance_field.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "迁移成功完成！"
    echo "======================================"
    echo ""
    echo "已添加的内容:"
    echo "1. users表的balance字段"
    echo "2. recharge_orders表（充值订单）"
    echo "3. balance_history表（余额变动记录）"
    echo ""
else
    echo ""
    echo "======================================"
    echo "迁移失败！"
    echo "======================================"
    echo "请检查错误信息并手动执行SQL"
    exit 1
fi
