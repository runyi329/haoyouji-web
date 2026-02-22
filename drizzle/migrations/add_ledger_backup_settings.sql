-- Create ledger_backup_settings table
CREATE TABLE IF NOT EXISTS ledger_backup_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ledger_id INT NOT NULL,
  user_id INT NOT NULL,
  frequency ENUM('weekly', 'monthly', 'quarterly') NOT NULL,
  enabled TINYINT DEFAULT 1 NOT NULL,
  last_backup_at TIMESTAMP NULL,
  next_backup_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY ledger_backup_settings_ledger_id_user_id_unique (ledger_id, user_id),
  INDEX (ledger_id),
  INDEX (user_id),
  INDEX (next_backup_at)
);
