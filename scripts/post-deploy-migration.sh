#!/bin/bash

# 部署后自动执行的数据库迁移脚本

echo "🔍 开始执行数据库迁移..."

# 使用环境变量中的数据库连接信息
# 这个脚本应该在服务器上执行，环境变量已经配置好

cd /root/haoyouji-web

# 从 DATABASE_URL 解析数据库连接信息
if [ -z "$DB_HOST" ]; then
  # 如果没有设置 DB_HOST，尝试从 DATABASE_URL 解析
  if [ -n "$DATABASE_URL" ]; then
    # mysql://user:password@host:port/database
    DB_USER=$(echo $DATABASE_URL | sed -n 's|mysql://\([^:]*\):.*|\1|p')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's|mysql://[^@]*@\([^:]*\):.*|\1|p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's|.*/\([^?]*\).*|\1|p')
  else
    # 默认值（从 .env 文件读取）
    DB_HOST="127.0.0.1"
    DB_USER="root"
    DB_PASSWORD="Miao@20190603"
    DB_NAME="crm_db"
  fi
fi

# 定义迁移文件列表（按顺序执行）
# 注意：ALTER TABLE和INSERT分开，避免ALTER失败导致INSERT不执行
MIGRATIONS=(
  "migrations/create_ai_tables.sql"
  "drizzle/migrations/add_work_groups.sql"
  "drizzle/migrations/add_partnership_tables.sql"
  "drizzle/migrations/fix_partnership_add_updated_at.sql"
  "drizzle/migrations/fix_work_groups_add_updated_at.sql"
  "drizzle/migrations/fix_partnership_tables.sql"
  "drizzle/migrations/add_jiang_as_member.sql"
  "drizzle/migrations/add_dashboard_config.sql"
  "drizzle/migrations/clear_dashboard_defaults.sql"
  "drizzle/migrations/add_ledger_backup_settings.sql"
  "scripts/add-backup-count.sql"
  "drizzle/migrations/add_default_permission_backup.sql"
  "drizzle/migrations/create_coupon_tables.sql"
  "drizzle/migrations/create_payment_accounts_tables.sql"
  "migrations/add_balance_field.sql"
  "migrations/create_recharge_tables.sql"
  "migrations/create_unmatched_transactions.sql"
  "migrations/add_submitted_status.sql"
  "migrations/create_wallet_addresses.sql"
  "migrations/fix_wallet_addresses_duplicates.sql"
  "migrations/add_txn_hash_and_fix_duplicate.sql"
  "drizzle/migrations/add_require_image_to_ledgers.sql"
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

# ⚠️ 重要：必须先写入.env，再重启PM2，否则新配置不会生效！

# 第一步：自动追加充值配置到.env文件（如果不存在）
ENV_CHANGED=false
if [ -f ".env" ]; then
  if ! grep -q "RECHARGE_WALLET_ADDRESS_TRC20" .env; then
    echo "" >> .env
    echo "# 充值配置" >> .env
    echo "RECHARGE_WALLET_ADDRESS_TRC20=TTHZ7NvpKSMCyU3JNLLN6zZNruysy5emQJ" >> .env
    echo "RECHARGE_MIN_AMOUNT=1" >> .env
    echo "RECHARGE_ORDER_EXPIRE_MINUTES=30" >> .env
    echo "✅ 已自动添加充值配置到.env"
    ENV_CHANGED=true
  else
    echo "ℹ️  充值配置已存在"
  fi
fi

# 第二步：如果.env有变更，需要在deploy.yml的pm2 restart之前确保配置已写入
# deploy.yml中的pm2 restart会在本脚本之后执行，dotenv会重新读取.env文件
if [ "$ENV_CHANGED" = true ]; then
  echo "📝 .env文件已更新，PM2重启后新配置将自动生效"
fi
