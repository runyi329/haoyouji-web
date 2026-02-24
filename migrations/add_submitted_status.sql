-- 给recharge_orders的status字段添加submitted状态
ALTER TABLE recharge_orders MODIFY COLUMN status ENUM('pending', 'submitted', 'completed', 'expired', 'cancelled') NOT NULL DEFAULT 'pending';
