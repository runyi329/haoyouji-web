-- AB 定制账本 - 共享意见本 数据库迁移
-- 应用场景：连锁店/餐厅每张桌子生成二维码，顾客扫码免注册提意见

CREATE TABLE IF NOT EXISTS opinion_books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  store_name VARCHAR(100),
  description TEXT,
  owner_id INT NOT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX opinion_books_owner_idx (owner_id)
);

CREATE TABLE IF NOT EXISTS opinion_tables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  table_code VARCHAR(50) NOT NULL,
  location VARCHAR(100),
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX opinion_tables_book_idx (book_id)
);

CREATE TABLE IF NOT EXISTS opinion_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  table_id INT NOT NULL,
  content TEXT NOT NULL,
  rating TINYINT,
  guest_name VARCHAR(50),
  guest_ip VARCHAR(45),
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX opinion_entries_book_idx (book_id),
  INDEX opinion_entries_table_idx (table_id),
  INDEX opinion_entries_created_idx (created_at)
);
