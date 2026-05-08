/**
 * AD型定制账本 - 永忆
 * 支持多分类：快递地址、账号密码、银行账号、网站登录、其他
 * 每条记录有多个字段，支持一键复制单字段或整条
 */
import { getLedgerDb } from "./db";
import { sql } from "drizzle-orm";

let _tableEnsured = false;

export async function ensureMemoTables() {
  if (_tableEnsured) return;
  const db = await getLedgerDb();
  if (!db) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS memo_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledgerId INT NOT NULL,
        userId INT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'other',
        title VARCHAR(200) NOT NULL,
        fields JSON NOT NULL,
        note TEXT,
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deletedAt TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_ledger (ledgerId),
        INDEX idx_ledger_category (ledgerId, category)
      )
    `);
    console.log('[memo] memo_items 表已就绪');
    _tableEnsured = true;
  } catch (e: any) {
    console.warn('[memo] ensureMemoTables:', e?.message);
    _tableEnsured = true; // 即使失败也标记，避免重复尝试
  }
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

function parseRows(result: any): any[] {
  // drizzle mysql2 execute 返回 [rows, fields] 格式
  if (Array.isArray(result) && result.length >= 1) {
    const first = result[0];
    if (Array.isArray(first)) {
      // [rows[], fields[]] 格式
      return first;
    }
    if (first && typeof first === 'object' && Array.isArray((first as any).rows)) {
      return (first as any).rows;
    }
    // 直接是行数组
    return result;
  }
  return [];
}

function mapRow(r: any): MemoItem {
  return {
    ...r,
    fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : (r.fields ?? []),
  };
}

// 获取账本所有备忘录条目
export async function getMemoItems(ledgerId: number, userId?: number, category?: string): Promise<MemoItem[]> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) return [];

  let result: any;
  if (category && category !== 'all') {
    result = await db.execute(sql`
      SELECT * FROM memo_items 
      WHERE ledgerId = ${ledgerId} AND category = ${category} AND deletedAt IS NULL 
      ORDER BY sortOrder ASC, createdAt DESC
    `);
  } else {
    result = await db.execute(sql`
      SELECT * FROM memo_items 
      WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL 
      ORDER BY category ASC, sortOrder ASC, createdAt DESC
    `);
  }

  const rows = parseRows(result);
  console.log(`[memo] getMemoItems ledgerId=${ledgerId} 查到 ${rows.length} 条`);
  
  return rows
    .map(mapRow)
    .filter((r: any) => r.title && r.title.trim() !== '');
}

// 搜索备忘录条目
export async function searchMemoItems(ledgerId: number, keyword: string): Promise<MemoItem[]> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) return [];

  const like = `%${keyword}%`;
  const result = await db.execute(sql`
    SELECT * FROM memo_items
    WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL
      AND (title LIKE ${like} OR note LIKE ${like})
    ORDER BY createdAt DESC
  `);

  const rows = parseRows(result);
  return rows
    .map(mapRow)
    .filter((r: any) => r.title && r.title.trim() !== '');
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
  const insertId = (result as any)?.[0]?.insertId ?? (result as any)?.insertId ?? 0;
  console.log(`[memo] createMemoItem 成功 id=${insertId} title="${data.title}"`);
  return insertId;
}

// 更新备忘录条目
export async function updateMemoItem(id: number, ledgerId: number, data: {
  category?: string;
  title?: string;
  fields?: MemoField[];
  note?: string;
}): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  const fieldsJson = data.fields !== undefined ? JSON.stringify(data.fields) : undefined;
  
  // 使用 ledgerId 做权限校验（共享账本内所有成员均可编辑）
  if (data.category !== undefined && data.title !== undefined && fieldsJson !== undefined) {
    await db.execute(sql`
      UPDATE memo_items 
      SET category = ${data.category}, title = ${data.title}, fields = ${fieldsJson}, note = ${data.note ?? null}
      WHERE id = ${id} AND ledgerId = ${ledgerId}
    `);
  } else if (data.title !== undefined && fieldsJson !== undefined) {
    await db.execute(sql`
      UPDATE memo_items SET title = ${data.title}, fields = ${fieldsJson} WHERE id = ${id} AND ledgerId = ${ledgerId}
    `);
  } else if (fieldsJson !== undefined) {
    await db.execute(sql`
      UPDATE memo_items SET fields = ${fieldsJson} WHERE id = ${id} AND ledgerId = ${ledgerId}
    `);
  } else if (data.title !== undefined) {
    await db.execute(sql`
      UPDATE memo_items SET title = ${data.title} WHERE id = ${id} AND ledgerId = ${ledgerId}
    `);
  }
}

// 软删除备忘录条目
export async function deleteMemoItem(id: number, ledgerId: number): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  // 使用 ledgerId 做权限校验（共享账本内所有成员均可删除）
  await db.execute(sql`UPDATE memo_items SET deletedAt = NOW() WHERE id = ${id} AND ledgerId = ${ledgerId}`);
  console.log(`[memo] deleteMemoItem id=${id}`);
}

// ===== 提示词库 =====
let _promptTableEnsured = false;

export async function ensurePromptTables() {
  if (_promptTableEnsured) return;
  const db = await getLedgerDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS memo_prompts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledgerId INT NOT NULL,
        userId INT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'image',
        content TEXT NOT NULL,
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deletedAt TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_prompt_ledger (ledgerId),
        INDEX idx_prompt_ledger_cat (ledgerId, category)
      )
    `);
    console.log('[memo] memo_prompts 表已就绪');
    _promptTableEnsured = true;
  } catch (e: any) {
    console.warn('[memo] ensurePromptTables:', e?.message);
    _promptTableEnsured = true;
  }
}

export interface PromptItem {
  id: number;
  ledgerId: number;
  userId: number;
  category: string;
  content: string;
  sortOrder: number;
  createdAt: string;
}

function parsePromptRows(result: any): any[] {
  if (Array.isArray(result) && result.length >= 1) {
    const first = result[0];
    if (Array.isArray(first)) return first;
    if (first && typeof first === 'object' && Array.isArray((first as any).rows)) return (first as any).rows;
    return result;
  }
  return [];
}

export async function getPrompts(ledgerId: number, category?: string): Promise<PromptItem[]> {
  await ensurePromptTables();
  const db = await getLedgerDb();
  if (!db) return [];
  let result: any;
  if (category && category !== 'all') {
    result = await db.execute(sql`
      SELECT * FROM memo_prompts
      WHERE ledgerId = ${ledgerId} AND category = ${category} AND deletedAt IS NULL
      ORDER BY sortOrder ASC, createdAt DESC
    `);
  } else {
    result = await db.execute(sql`
      SELECT * FROM memo_prompts
      WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL
      ORDER BY category ASC, sortOrder ASC, createdAt DESC
    `);
  }
  return parsePromptRows(result);
}

export async function createPrompts(data: {
  ledgerId: number;
  userId: number;
  category: string;
  contents: string[];
}): Promise<void> {
  await ensurePromptTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');
  for (const content of data.contents) {
    const trimmed = content.trim();
    if (!trimmed) continue;
    await db.execute(sql`
      INSERT INTO memo_prompts (ledgerId, userId, category, content)
      VALUES (${data.ledgerId}, ${data.userId}, ${data.category}, ${trimmed})
    `);
  }
}

export async function deletePrompt(id: number, userId: number): Promise<void> {
  await ensurePromptTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');
  await db.execute(sql`UPDATE memo_prompts SET deletedAt = NOW() WHERE id = ${id} AND userId = ${userId}`);
}
