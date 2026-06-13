-- 幂等加字段（MySQL8 无 ADD COLUMN IF NOT EXISTS，用存储过程检测）
DROP PROCEDURE IF EXISTS add_col_if_absent;
DELIMITER $$
CREATE PROCEDURE add_col_if_absent(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl VARCHAR(512))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', ddl);
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_col_if_absent('shop_product','stock','stock INT NOT NULL DEFAULT 0');
CALL add_col_if_absent('shop_product','stock_enabled','stock_enabled TINYINT NOT NULL DEFAULT 0');
CALL add_col_if_absent('shop_product','spec_options','spec_options TEXT NULL');

CALL add_col_if_absent('shop_order','receiver_name','receiver_name VARCHAR(64) NULL');
CALL add_col_if_absent('shop_order','receiver_phone','receiver_phone VARCHAR(20) NULL');
CALL add_col_if_absent('shop_order','receiver_addr','receiver_addr VARCHAR(255) NULL');
CALL add_col_if_absent('shop_order','ship_no','ship_no VARCHAR(64) NULL');
CALL add_col_if_absent('shop_order','ship_company','ship_company VARCHAR(32) NULL');
CALL add_col_if_absent('shop_order','verify_code','verify_code VARCHAR(32) NULL');
CALL add_col_if_absent('shop_order','verify_status','verify_status VARCHAR(16) NOT NULL DEFAULT ''none''');
CALL add_col_if_absent('shop_order','verified_at','verified_at TIMESTAMP NULL');
CALL add_col_if_absent('shop_order','coupon_id','coupon_id INT NULL');
CALL add_col_if_absent('shop_order','discount_amount','discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL add_col_if_absent('shop_order','goods_amount','goods_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');

CALL add_col_if_absent('shop_order_item','spec_text','spec_text VARCHAR(128) NULL');

DROP PROCEDURE IF EXISTS add_col_if_absent;
