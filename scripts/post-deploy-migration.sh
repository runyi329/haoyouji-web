#!/bin/bash

# 部署后自动执行的数据库迁移脚本

echo "🔍 检查AI表是否存在..."

# 使用环境变量中的数据库连接信息
# 这个脚本应该在服务器上执行，环境变量已经配置好

cd /root/haoyouji-web

# 执行数据库迁移
echo "📊 执行AI表迁移..."
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < migrations/create_ai_tables.sql

if [ $? -eq 0 ]; then
  echo "✅ AI表迁移成功！"
else
  echo "⚠️  AI表迁移失败或表已存在"
fi
