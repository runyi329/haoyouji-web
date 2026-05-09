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

// 批量更新账目排序
export async function reorderMemoItems(ledgerId: number, orderedIds: number[]): Promise<void> {
  await ensureMemoTables();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  // 逐条更新 sortOrder
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute(sql`
      UPDATE memo_items SET sortOrder = ${i} WHERE id = ${orderedIds[i]} AND ledgerId = ${ledgerId}
    `);
  }
  console.log(`[memo] reorderMemoItems ledgerId=${ledgerId} 更新 ${orderedIds.length} 条顺序`);
}

// ===== 保存历史记录 =====
let _historyTableEnsured = false;

export async function ensureHistoryTable() {
  if (_historyTableEnsured) return;
  const db = await getLedgerDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS memo_save_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledgerId INT NOT NULL,
        userId INT NOT NULL,
        snapshot JSON NOT NULL,
        description VARCHAR(200),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_history_ledger (ledgerId)
      )
    `);
    console.log('[memo] memo_save_history 表已就绪');
    _historyTableEnsured = true;
  } catch (e: any) {
    console.warn('[memo] ensureHistoryTable:', e?.message);
    _historyTableEnsured = true;
  }
}

export interface SaveHistoryEntry {
  id: number;
  ledgerId: number;
  userId: number;
  snapshot: MemoItem[];
  description?: string;
  createdAt: string;
}

// 写入一条历史快照，并保留最近10条（超出的自动删除）
export async function saveMemoHistory(ledgerId: number, userId: number, description?: string): Promise<void> {
  await ensureHistoryTable();
  const db = await getLedgerDb();
  if (!db) return;

  // 获取当前所有账目作为快照
  const items = await getMemoItems(ledgerId);
  const snapshotJson = JSON.stringify(items);

  await db.execute(sql`
    INSERT INTO memo_save_history (ledgerId, userId, snapshot, description)
    VALUES (${ledgerId}, ${userId}, ${snapshotJson}, ${description ?? null})
  `);

  // 保留最近10条，删除多余的
  await db.execute(sql`
    DELETE FROM memo_save_history
    WHERE ledgerId = ${ledgerId}
      AND id NOT IN (
        SELECT id FROM (
          SELECT id FROM memo_save_history
          WHERE ledgerId = ${ledgerId}
          ORDER BY createdAt DESC
          LIMIT 10
        ) AS t
      )
  `);

  console.log(`[memo] saveMemoHistory ledgerId=${ledgerId}`);
}

// 查询历史记录列表（不含 snapshot 内容，减少传输量）
export async function getMemoHistoryList(ledgerId: number): Promise<Omit<SaveHistoryEntry, 'snapshot'>[]> {
  await ensureHistoryTable();
  const db = await getLedgerDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT id, ledgerId, userId, description, createdAt
    FROM memo_save_history
    WHERE ledgerId = ${ledgerId}
    ORDER BY createdAt DESC
    LIMIT 10
  `);

  const rows = parseRows(result);
  return rows;
}

// 获取某条历史的完整快照
export async function getMemoHistorySnapshot(historyId: number, ledgerId: number): Promise<MemoItem[] | null> {
  await ensureHistoryTable();
  const db = await getLedgerDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT snapshot FROM memo_save_history
    WHERE id = ${historyId} AND ledgerId = ${ledgerId}
    LIMIT 1
  `);

  const rows = parseRows(result);
  if (!rows.length) return null;

  const raw = rows[0].snapshot;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

// 恢复到历史快照（软删除现有条目，重新插入快照中的条目）
export async function restoreMemoFromHistory(ledgerId: number, userId: number, historyId: number): Promise<void> {
  await ensureHistoryTable();
  const db = await getLedgerDb();
  if (!db) throw new Error('数据库不可用');

  const snapshot = await getMemoHistorySnapshot(historyId, ledgerId);
  if (!snapshot) throw new Error('历史记录不存在');

  // 先保存当前状态到历史（恢复前备份）
  await saveMemoHistory(ledgerId, userId, '恢复前自动备份');

  // 软删除当前所有条目
  await db.execute(sql`
    UPDATE memo_items SET deletedAt = NOW()
    WHERE ledgerId = ${ledgerId} AND deletedAt IS NULL
  `);

  // 重新插入快照中的条目
  for (const item of snapshot) {
    const fieldsJson = JSON.stringify(item.fields);
    await db.execute(sql`
      INSERT INTO memo_items (ledgerId, userId, category, title, fields, note, sortOrder)
      VALUES (${ledgerId}, ${userId}, ${item.category}, ${item.title}, ${fieldsJson}, ${item.note ?? null}, ${item.sortOrder ?? 0})
    `);
  }

  console.log(`[memo] restoreMemoFromHistory ledgerId=${ledgerId} historyId=${historyId} 恢复 ${snapshot.length} 条`);
}
