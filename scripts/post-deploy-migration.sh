#!/bin/bash

# 部署后自动执行的数据库迁移脚本

echo "🔍 开始执行数据库迁移..."

# 使用环境变量中的数据库连接信息
# 这个脚本应该在服务器上执行，环境变量已经配置好

cd /root/haoyouji-web

# 定义迁移文件列表（按顺序执行）
MIGRATIONS=(
  "migrations/create_ai_tables.sql"
  "drizzle/migrations/add_work_groups.sql"
  "drizzle/migrations/add_partnership_tables.sql"
)

# 执行每个迁移文件
for migration in "${MIGRATIONS[@]}"; do
  if [ -f "$migration" ]; then
    echo "📊 执行迁移: $migration"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$migration"
    
    if [ $? -eq 0 ]; then
      echo "✅ 迁移成功: $migration"
    else
      echo "⚠️  迁移失败或已执行: $migration"
    fi
  else
    echo "⚠️  迁移文件不存在: $migration"
  fi
done

echo "✅ 所有迁移执行完成！"
