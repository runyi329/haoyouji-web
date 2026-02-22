-- Add phone field to users table
ALTER TABLE users ADD COLUMN phone VARCHAR(20) AFTER email;
