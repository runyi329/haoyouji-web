-- 创建扫描器心跳记录表
CREATE TABLE IF NOT EXISTS scanner_heartbeat (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scanner_type VARCHAR(50) NOT NULL COMMENT '扫描器类型：blockchain',
  last_scan_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后一次扫描时间',
  scan_count INT DEFAULT 0 COMMENT '扫描次数',
  success_count INT DEFAULT 0 COMMENT '成功次数',
  error_count INT DEFAULT 0 COMMENT '错误次数',
  last_error TEXT COMMENT '最后一次错误信息',
  scanned_addresses INT DEFAULT 0 COMMENT '扫描的地址数',
  found_transactions INT DEFAULT 0 COMMENT '发现的交易数',
  matched_orders INT DEFAULT 0 COMMENT '匹配的订单数',
  unmatched_transactions INT DEFAULT 0 COMMENT '未匹配的交易数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_scanner_type (scanner_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描器心跳记录';

-- 插入初始记录
INSERT INTO scanner_heartbeat (scanner_type, last_scan_at) 
VALUES ('blockchain', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE scanner_type = scanner_type;
