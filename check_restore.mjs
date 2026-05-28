import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

// 读取生产数据库连接
const envContent = readFileSync('/root/haoyouji-web/.env', 'utf8').catch?.() || '';
