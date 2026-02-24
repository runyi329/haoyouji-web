-- 1. 给recharge_orders表添加txn_hash字段（如果不存在）
ALTER TABLE recharge_orders 
ADD COLUMN IF NOT EXISTS txn_hash VARCHAR(100) DEFAULT NULL COMMENT '区块链交易哈希';

-- 2. 添加索引，防止同一交易被重复使用
ALTER TABLE recharge_orders 
ADD INDEX IF NOT EXISTS idx_txn_hash (txn_hash);

-- 3. 回滚错误匹配的订单（订单号 CHG17719289414087**06，金额 10.32880000）
-- 先获取订单信息，用于后续扣除余额
SET @wrong_order_id = (SELECT id FROM recharge_orders WHERE order_no LIKE 'CHG17719289414087%' AND amount = '10.32880000' AND status = 'completed' LIMIT 1);
SET @wrong_user_id = (SELECT user_id FROM recharge_orders WHERE id = @wrong_order_id);
SET @wrong_amount = 10.2536; -- 实际错误入账的金额（被模糊匹配到的交易金额）

-- 扣除错误入账的余额（如果订单存在）
UPDATE users 
SET balance = balance - @wrong_amount
WHERE id = @wrong_user_id AND @wrong_order_id IS NOT NULL;

-- 记录余额变动（负数，表示扣除）
INSERT INTO balance_transactions (user_id, amount, type, related_id, description, created_at)
SELECT 
  @wrong_user_id,
  -@wrong_amount,
  'adjustment',
  @wrong_order_id,
  '回滚错误充值：订单CHG17719289414087**06被重复匹配',
  NOW()
WHERE @wrong_order_id IS NOT NULL;

-- 将订单状态改回 pending，清除交易哈希和完成时间
UPDATE recharge_orders 
SET 
  status = 'pending',
  txn_hash = NULL,
  completed_at = NULL
WHERE id = @wrong_order_id;
