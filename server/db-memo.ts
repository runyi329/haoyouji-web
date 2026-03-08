/**
 * AD型定制账本 - 永忆
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
      category VARCHAR(50) NOT NULL DEFAULT 'other',
      title VARCHAR(100) NOT NULL,
      fields JSON NOT NULL,
      note TEXT,
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
  label: string;
  value: string;
  sensitive?: boolean;
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

  let rows: any[];
  if (userId && category && category !== 'all') {
    const result = await db.execute(sql`SELECT * FROM memo_items WHERE ledgerId = ${ledgerId} AND userId = ${userId} AND category = ${category} AND deletedAt IS NULL ORDER BY sortOrder, createdAt DESC`);
    rows = result as any[];
  } else if (userId) {
    const result = await db.execute(sql`SELECT * FROM memo_items WHERE ledgerId = ${ledgerId} AND userId = ${userId} AND deletedAt IS NULL ORDER BY category, sortOrder, createdAt DESC`);
    rows = result as any[];
  } else if (category && category !== 'all') {
    const result = await db.execute(sql`SELECT * FROM memo_items WHERE ledgerId = ${ledgerId} AND category = ${category} AND deletedAt IS NULL ORDER BY sortOrder, createdAt DESC`);
    rows = result as any[];
  } else {
    const result = await db.execute(sql`SELECT * FROM memo_items WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL ORDER BY category, sortOrder, createdAt DESC`);
    rows = result as any[];
  }

  // drizzle execute 返回 [{rows: [...]}] 或直接 [row, ...]
  const actualRows: any[] = Array.isArray(rows) && rows.length > 0 && Array.isArray((rows[0] as any)?.rows)
    ? (rows[0] as any).rows
    : rows;

  return actualRows.map((r: any) => ({
    ...r,
    fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : (r.fields ?? []),
  }));
}

// 搜索备忘录条目（全文搜索标题和字段值）
export async function searchMemoItems(ledgerId: number, keyword: string): Promise<MemoItem[]> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) return [];

  const like = `%${keyword}%`;
  const result = await db.execute(sql`
    SELECT * FROM memo_items
    WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL
      AND (title LIKE ${like} OR note LIKE ${like} OR JSON_SEARCH(fields, 'one', ${like}) IS NOT NULL)
    ORDER BY createdAt DESC
  `);
  const rows = result as any[];
  const actualRows: any[] = Array.isArray(rows) && rows.length > 0 && Array.isArray((rows[0] as any)?.rows)
    ? (rows[0] as any).rows
    : rows;

  return actualRows.map((r: any) => ({
    ...r,
    fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : (r.fields ?? []),
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

  const fieldsJson = JSON.stringify(data.fields);
  const result = await db.execute(sql`
    INSERT INTO memo_items (ledgerId, userId, category, title, fields, note)
    VALUES (${data.ledgerId}, ${data.userId}, ${data.category}, ${data.title}, ${fieldsJson}, ${data.note ?? null})
  `);
  return (result as any)?.insertId ?? (result as any)?.[0]?.insertId ?? 0;
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

  if (data.category !== undefined && data.title !== undefined && data.fields !== undefined && data.note !== undefined) {
    const fieldsJson = JSON.stringify(data.fields);
    await db.execute(sql`UPDATE memo_items SET category = ${data.category}, title = ${data.title}, fields = ${fieldsJson}, note = ${data.note} WHERE id = ${id} AND userId = ${userId}`);
  } else if (data.category !== undefined && data.title !== undefined && data.fields !== undefined) {
    const fieldsJson = JSON.stringify(data.fields);
    await db.execute(sql`UPDATE memo_items SET category = ${data.category}, title = ${data.title}, fields = ${fieldsJson} WHERE id = ${id} AND userId = ${userId}`);
  } else if (data.title !== undefined && data.fields !== undefined) {
    const fieldsJson = JSON.stringify(data.fields);
    await db.execute(sql`UPDATE memo_items SET title = ${data.title}, fields = ${fieldsJson} WHERE id = ${id} AND userId = ${userId}`);
  } else if (data.fields !== undefined) {
    const fieldsJson = JSON.stringify(data.fields);
    await db.execute(sql`UPDATE memo_items SET fields = ${fieldsJson} WHERE id = ${id} AND userId = ${userId}`);
  } else if (data.title !== undefined) {
    await db.execute(sql`UPDATE memo_items SET title = ${data.title} WHERE id = ${id} AND userId = ${userId}`);
  }
}

// 软删除备忘录条目
export async function deleteMemoItem(id: number, userId: number): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  await db.execute(sql`UPDATE memo_items SET deletedAt = NOW() WHERE id = ${id} AND userId = ${userId}`);
}
