#!/bin/bash
# 数据库结构迁移脚本 - 幂等执行，可重复运行
# 由 deploy-server.sh 调用

DB_CMD="mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db"

echo "📊 确保opinion表存在并更新结构..."
$DB_CMD -e "
  CREATE TABLE IF NOT EXISTS opinion_books (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT DEFAULT NULL COMMENT '关联ledgers表ID', name VARCHAR(100) NOT NULL, store_name VARCHAR(100), description TEXT, owner_id INT NOT NULL, is_active TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX opinion_books_owner_idx (owner_id), INDEX opinion_books_ledger_idx (ledger_id));
  CREATE TABLE IF NOT EXISTS opinion_tables (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, branch_name VARCHAR(100) DEFAULT NULL COMMENT '分店名称（一级标签）', table_code VARCHAR(50) NOT NULL, location VARCHAR(100), is_active TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX opinion_tables_book_idx (book_id));
  CREATE TABLE IF NOT EXISTS opinion_entries (id INT AUTO_INCREMENT PRIMARY KEY, book_id INT NOT NULL, table_id INT NOT NULL, content TEXT NOT NULL, rating TINYINT, guest_name VARCHAR(50), guest_ip VARCHAR(45), is_read TINYINT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX opinion_entries_book_idx (book_id), INDEX opinion_entries_table_idx (table_id), INDEX opinion_entries_created_idx (created_at));
" || true

$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='opinion_tables' AND COLUMN_NAME='branch_name'; SET @s = IF(@c=0, 'ALTER TABLE opinion_tables ADD COLUMN branch_name VARCHAR(100) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='opinion_books' AND COLUMN_NAME='ledger_id'; SET @s = IF(@c=0, 'ALTER TABLE opinion_books ADD COLUMN ledger_id INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
echo "✅ opinion表结构更新完成"

echo "📊 确保af_orders表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS af_orders (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, user_id INT NOT NULL, coin VARCHAR(10) NOT NULL, side VARCHAR(10) NOT NULL, limit_price VARCHAR(50) NOT NULL, amount VARCHAR(50) NOT NULL, quantity VARCHAR(50) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', order_type VARCHAR(50) NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX af_orders_ledger_idx (ledger_id), INDEX af_orders_user_idx (user_id), INDEX af_orders_coin_idx (coin))" || true

for col in "order_type VARCHAR(50) NOT NULL DEFAULT ''" "is_gift TINYINT NOT NULL DEFAULT 0" "gift_multiplier VARCHAR(10) DEFAULT NULL" "source_order_id INT DEFAULT NULL" "source_user_id INT DEFAULT NULL" "original_limit_price VARCHAR(50) DEFAULT NULL" "source_amount VARCHAR(50) DEFAULT NULL" "sell_price VARCHAR(50) DEFAULT NULL" "sell_quantity VARCHAR(50) DEFAULT NULL" "sell_at DATETIME DEFAULT NULL" "sell_confirmed_at DATETIME DEFAULT NULL" "sell_status VARCHAR(20) DEFAULT NULL"; do
  col_name=$(echo $col | awk '{print $1}')
  $DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='af_orders' AND COLUMN_NAME='$col_name'; SET @s = IF(@c=0, 'ALTER TABLE af_orders ADD COLUMN $col', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
done
echo "✅ af_orders表字段确认完成"

echo "📊 确保af_manual_balances表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS af_manual_balances (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, user_id INT NOT NULL, amount DECIMAL(18,2) NOT NULL DEFAULT 0, note VARCHAR(255) DEFAULT '', created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, INDEX idx_ledger (ledger_id), INDEX idx_user (user_id))" || true
echo "✅ af_manual_balances表确认完成"

echo "📊 确保users表新字段存在..."
$DB_CMD -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL" || true
$DB_CMD -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(100) DEFAULT NULL" || true
$DB_CMD -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS business VARCHAR(200) DEFAULT NULL" || true
$DB_CMD -e "ALTER TABLE users ADD COLUMN IF NOT EXISTS real_name VARCHAR(50) DEFAULT NULL" || true

for col in "invited_by_user_id INT DEFAULT NULL" "invited_at DATETIME DEFAULT NULL" "invite_count INT NOT NULL DEFAULT 0" "invite_enabled TINYINT NOT NULL DEFAULT 0" "invite_code VARCHAR(20) DEFAULT NULL"; do
  col_name=$(echo $col | awk '{print $1}')
  $DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='users' AND COLUMN_NAME='$col_name'; SET @s = IF(@c=0, 'ALTER TABLE users ADD COLUMN $col', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
done
echo "✅ users表字段确认完成"

echo "💳 确保recharge_orders.ledger_id字段存在..."
$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='recharge_orders' AND COLUMN_NAME='ledger_id'; SET @s = IF(@c=0, 'ALTER TABLE recharge_orders ADD COLUMN ledger_id INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
$DB_CMD -e "UPDATE recharge_orders SET ledger_id = 52 WHERE status = 'completed' AND ledger_id IS NULL;" || true

echo "💳 确保snt_withdrawals.ledger_id字段存在..."
$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='snt_withdrawals' AND COLUMN_NAME='ledger_id'; SET @s = IF(@c=0, 'ALTER TABLE snt_withdrawals ADD COLUMN ledger_id INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
$DB_CMD -e "UPDATE snt_withdrawals SET ledger_id = 52 WHERE ledger_id IS NULL;" || true
echo "✅ 充值/提现表字段确认完成"

echo "📊 确保demo_content_blocks表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS demo_content_blocks (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, page_key VARCHAR(50) NOT NULL DEFAULT 'main', block_type VARCHAR(20) NOT NULL, sort_order INT NOT NULL DEFAULT 0, block_data JSON NOT NULL, is_active TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX demo_blocks_ledger_page_idx (ledger_id, page_key), INDEX demo_blocks_sort_idx (ledger_id, page_key, sort_order));" || true
echo "✅ demo_content_blocks表确认完成"

echo "📊 确保PPT对比表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS beauty_ppt_compare_groups (id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, title VARCHAR(100) DEFAULT NULL, titleA VARCHAR(100) DEFAULT NULL, titleB VARCHAR(100) DEFAULT NULL, sortOrder INT NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);" || true
$DB_CMD -e "CREATE TABLE IF NOT EXISTS beauty_ppt_pages (id INT AUTO_INCREMENT PRIMARY KEY, groupId INT NOT NULL, side VARCHAR(1) NOT NULL, pageNum INT NOT NULL, imageUrl TEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_ppt_pages_group (groupId));" || true
echo "✅ PPT对比表确认完成"

echo "📊 确保AI提示词表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS beauty_ai_prompts (id INT AUTO_INCREMENT PRIMARY KEY, content TEXT NOT NULL, sortOrder INT NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);" || true
$DB_CMD -e "CREATE TABLE IF NOT EXISTS beauty_ai_prompt_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, sortOrder INT NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);" || true
$DB_CMD -e "ALTER TABLE beauty_ai_prompts ADD COLUMN IF NOT EXISTS categoryId INT NOT NULL DEFAULT 0;" || true
echo "✅ AI提示词表确认完成"

echo "📊 确保crypto_price_cache表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS crypto_price_cache (id INT AUTO_INCREMENT PRIMARY KEY, coin VARCHAR(20) NOT NULL, price_usdt DECIMAL(20, 8) NOT NULL, price_cny DECIMAL(20, 4) NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY crypto_price_coin_uniq (coin)) CHARACTER SET utf8mb4;" || true
echo "✅ crypto_price_cache表确认完成"

echo "📊 确保分红记录表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS dividend_records (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, user_id INT NOT NULL, tag_name VARCHAR(100) NOT NULL, amount DECIMAL(18,2) NOT NULL, note VARCHAR(255) DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_dividend_ledger (ledger_id), INDEX idx_dividend_user_tag (ledger_id, user_id, tag_name))" || true
echo "✅ 分红记录表确认完成"

echo "📊 确保AI预警状态表存在..."
$DB_CMD -e "CREATE TABLE IF NOT EXISTS funder_order_alert_state (id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, alert_level VARCHAR(20) NOT NULL DEFAULT 'none', last_triggered_state VARCHAR(20) NOT NULL DEFAULT 'none', last_triggered_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uk_order_id (order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;" || true
echo "✅ AI预警状态表确认完成"

# 添加新字段：邮筱/手机独立开关（email_enabled, phone_enabled）
$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='funder_order_alert_state' AND COLUMN_NAME='email_enabled'; SET @s = IF(@c=0, 'ALTER TABLE funder_order_alert_state ADD COLUMN email_enabled TINYINT NOT NULL DEFAULT 1', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
$DB_CMD -e "SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='crm_db' AND TABLE_NAME='funder_order_alert_state' AND COLUMN_NAME='phone_enabled'; SET @s = IF(@c=0, 'ALTER TABLE funder_order_alert_state ADD COLUMN phone_enabled TINYINT NOT NULL DEFAULT 1', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;" || true
echo "✅ AI预警表新字段确认完成"

# 修正历史返佣备注：去掉“竞猜返佣”和“行情评估返佣”前缀
echo "📊 修正YJH返佣备注格式..."
$DB_CMD -e "UPDATE af_manual_balances SET note = REGEXP_REPLACE(note, '^(竞猜返佣|行情评估返佣) ', '') WHERE user_id = 4957151 AND amount > 0 AND (note LIKE '竞猜返佣 %' OR note LIKE '行情评估返佣 %');" || true
echo "✅ 返佣备注修正完成"
echo "📊 查询YJH(4957151)账本52返佣记录:"
$DB_CMD -e "SELECT id, ledger_id, amount, note, created_at FROM af_manual_balances WHERE user_id=4957151 AND amount > 0 ORDER BY created_at DESC LIMIT 10;"
echo "✅ 所有数据库迁移完成"
