/**
 * AD型定制账本 - 私人备忘录
 * 支持多分类：快递地址、账号密码、银行账号、网站登录、其他
 * 每条记录有多个字段，支持一键复制单字段或整条
 */
import { getLedgerDb } from "./db";
import { sql } from "drizzle-orm";

let _tablesCreated = false;

export async function ensureMemoTables() {
  if (_tablesCreated) return;
  const db = await getLedgerDb();
  if (!db) return;

  // 备忘录条目表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memo_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '分类：address/account/bank/website/other',
      title VARCHAR(100) NOT NULL COMMENT '标题/名称，如"工商银行"、"淘宝账号"',
      fields JSON NOT NULL COMMENT '字段数组 [{label, value, sensitive}]',
      note TEXT COMMENT '备注',
      sortOrder INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedAt TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_ledger_user (ledgerId, userId),
      INDEX idx_ledger_category (ledgerId, category)
    )
  `);

  _tablesCreated = true;
}

export interface MemoField {
  label: string;   // 字段名，如"账号"、"密码"、"银行名"
  value: string;   // 字段值
  sensitive?: boolean; // 是否敏感（密码类，默认隐藏）
}

export interface MemoItem {
  id: number;
  ledgerId: number;
  userId: number;
  category: string;
  title: string;
  fields: MemoField[];
  note?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 获取账本所有备忘录条目
export async function getMemoItems(ledgerId: number, userId?: number, category?: string): Promise<MemoItem[]> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) return [];

  let query = `SELECT * FROM memo_items WHERE ledgerId = ? AND deletedAt IS NULL`;
  const params: any[] = [ledgerId];
  if (userId) {
    query += ` AND userId = ?`;
    params.push(userId);
  }
  if (category && category !== 'all') {
    query += ` AND category = ?`;
    params.push(category);
  }
  query += ` ORDER BY category, sortOrder, createdAt DESC`;

  const [rows] = await (db as any).execute(query, params) as any;
  return (rows as any[]).map(r => ({
    ...r,
    fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : r.fields,
  }));
}

// 搜索备忘录条目（全文搜索标题和字段值）
export async function searchMemoItems(ledgerId: number, keyword: string): Promise<MemoItem[]> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) return [];

  const like = `%${keyword}%`;
  const [rows] = await (db as any).execute(
    `SELECT * FROM memo_items WHERE ledgerId = ? AND deletedAt IS NULL AND (title LIKE ? OR note LIKE ? OR JSON_SEARCH(fields, 'one', ?) IS NOT NULL) ORDER BY createdAt DESC`,
    [ledgerId, like, like, like]
  ) as any;
  return (rows as any[]).map(r => ({
    ...r,
    fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : r.fields,
  }));
}

// 创建备忘录条目
export async function createMemoItem(data: {
  ledgerId: number;
  userId: number;
  category: string;
  title: string;
  fields: MemoField[];
  note?: string;
}): Promise<number> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  const [result] = await (db as any).execute(
    `INSERT INTO memo_items (ledgerId, userId, category, title, fields, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [data.ledgerId, data.userId, data.category, data.title, JSON.stringify(data.fields), data.note || null]
  ) as any;
  return (result as any).insertId;
}

// 更新备忘录条目
export async function updateMemoItem(id: number, userId: number, data: {
  category?: string;
  title?: string;
  fields?: MemoField[];
  note?: string;
}): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  const sets: string[] = [];
  const params: any[] = [];
  if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category); }
  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
  if (data.fields !== undefined) { sets.push('fields = ?'); params.push(JSON.stringify(data.fields)); }
  if (data.note !== undefined) { sets.push('note = ?'); params.push(data.note); }
  if (sets.length === 0) return;

  params.push(id, userId);
  await (db as any).execute(
    `UPDATE memo_items SET ${sets.join(', ')} WHERE id = ? AND userId = ?`,
    params
  );
}

// 软删除备忘录条目
export async function deleteMemoItem(id: number, userId: number): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  await (db as any).execute(
    `UPDATE memo_items SET deletedAt = NOW() WHERE id = ? AND userId = ?`,
    [id, userId]
  );
}
