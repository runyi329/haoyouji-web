# 数据库迁移指南 - 添加余额功能

## 问题说明

当前生产数据库的 `users` 表中缺少 `balance` 字段，导致用户登录时查询失败，显示错误：

```
Failed query: select `id`, `openId`, `username`, ... `balance`, ...
```

## 解决方案

需要在生产数据库中执行迁移SQL，添加余额相关的字段和表。

## 方法一：使用自动化脚本（推荐）

在腾讯云服务器上执行：

```bash
cd /root/haoyouji-web
./run-migration.sh
```

## 方法二：手动执行SQL

如果自动化脚本失败，可以手动执行以下步骤：

### 1. 连接到数据库

```bash
# 在服务器上查看数据库连接信息
cat .env | grep DATABASE_URL

# 使用mysql客户端连接
mysql -h <host> -P <port> -u <username> -p <database_name>
```

### 2. 执行迁移SQL

复制并执行 `migrations/add_balance_field.sql` 文件中的所有SQL语句：

```sql
-- 1. 添加balance字段
ALTER TABLE users ADD COLUMN balance DECIMAL(20, 8) DEFAULT 0 NOT NULL COMMENT '用户余额';

-- 2. 创建充值订单表
CREATE TABLE IF NOT EXISTS recharge_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_no VARCHAR(50) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL COMMENT '充值金额（带小数的唯一金额）',
  currency VARCHAR(10) DEFAULT 'USDT' NOT NULL,
  network VARCHAR(20) DEFAULT 'TRC20' NOT NULL,
  status ENUM('pending', 'completed', 'expired', 'cancelled') DEFAULT 'pending' NOT NULL,
  txn_hash VARCHAR(100) COMMENT '交易哈希',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no),
  INDEX idx_amount_status (amount, status),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值订单表';

-- 3. 创建余额变动记录表
CREATE TABLE IF NOT EXISTS balance_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL COMMENT '变动金额（正数为增加，负数为减少）',
  type ENUM('recharge', 'consume', 'refund', 'reward', 'withdraw') NOT NULL,
  related_id INT COMMENT '关联订单ID',
  balance DECIMAL(20, 8) NOT NULL COMMENT '变动后的余额',
  description TEXT COMMENT '描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='余额变动记录表';
```

### 3. 验证迁移结果

```sql
-- 检查balance字段是否已添加
DESCRIBE users;

-- 检查新表是否已创建
SHOW TABLES LIKE '%recharge%';
SHOW TABLES LIKE '%balance%';

-- 查看表结构
DESCRIBE recharge_orders;
DESCRIBE balance_history;
```

## 方法三：使用Drizzle Kit（需要配置）

如果服务器上配置了完整的开发环境：

```bash
cd /root/haoyouji-web
pnpm drizzle-kit push
```

## 迁移后验证

1. 重启应用服务
2. 尝试登录账户
3. 检查个人中心是否能正常访问
4. 查看余额是否显示为 0.00

## 注意事项

- ⚠️ 执行迁移前建议先备份数据库
- ⚠️ 迁移过程中可能需要短暂停机
- ⚠️ 确保有数据库的完整权限（CREATE, ALTER等）
- ✅ 使用 `IF NOT EXISTS` 和 `ADD COLUMN IF NOT EXISTS` 确保幂等性
- ✅ 所有现有用户的balance会自动设置为 0

## 回滚方案

如果需要回滚（不推荐）：

```sql
-- 删除新增的表
DROP TABLE IF EXISTS balance_history;
DROP TABLE IF EXISTS recharge_orders;

-- 删除balance字段
ALTER TABLE users DROP COLUMN balance;
```
