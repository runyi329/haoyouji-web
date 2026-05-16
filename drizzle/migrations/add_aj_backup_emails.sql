-- Create aj_backup_emails table for multiple backup recipients per ledger
CREATE TABLE IF NOT EXISTS aj_backup_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ledger_id INT NOT NULL,
  user_id INT NOT NULL,
  email VARCHAR(200) NOT NULL,
  label VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX aj_backup_emails_ledger_user_idx (ledger_id, user_id)
);
