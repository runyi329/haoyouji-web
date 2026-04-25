import { getLedgerDb } from "./db";
import { ethPositionLevels, ethPositionSettings, ethPositionChangeLogs } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export interface EthPositionLevel {
  price: number;
  plannedQty: number;
  actualQty: number;
}

/**
 * 获取某账本的所有 ETH 持仓档位数据
 */
export async function getEthPositionLevels(ledgerId: number): Promise<EthPositionLevel[]> {
  const db = await getLedgerDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(ethPositionLevels)
    .where(eq(ethPositionLevels.ledgerId, ledgerId));
  return rows.map(r => ({
    price: r.price,
    plannedQty: parseFloat(r.plannedQty as string),
    actualQty: parseFloat(r.actualQty as string),
  }));
}

/**
 * 保存单个档位（upsert：存在则更新，不存在则插入）
 */
export async function upsertEthPositionLevel(
  ledgerId: number,
  price: number,
  plannedQty: number,
  actualQty: number
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .insert(ethPositionLevels)
    .values({
      ledgerId,
      price,
      plannedQty: String(plannedQty),
      actualQty: String(actualQty),
    })
    .onDuplicateKeyUpdate({
      set: {
        plannedQty: String(plannedQty),
        actualQty: String(actualQty),
      },
    });
}

/**
 * 批量保存所有档位（前端每次修改后整体同步）
 */
export async function batchUpsertEthPositionLevels(
  ledgerId: number,
  levels: EthPositionLevel[]
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  if (levels.length === 0) return;
  for (const level of levels) {
    await db
      .insert(ethPositionLevels)
      .values({
        ledgerId,
        price: level.price,
        plannedQty: String(level.plannedQty),
        actualQty: String(level.actualQty),
      })
      .onDuplicateKeyUpdate({
        set: {
          plannedQty: String(level.plannedQty),
          actualQty: String(level.actualQty),
        },
      });
  }
}

// ========== ETH 持仓全局设置 ==========

export interface EthPositionSettingsData {
  targetProfitCny: number;
  cnyRate: number;
  targetEthQty: number;
}

/**
 * 获取某账本的 ETH 持仓全局设置
 */
export async function getEthPositionSettings(ledgerId: number): Promise<EthPositionSettingsData> {
  const db = await getLedgerDb();
  if (!db) return { targetProfitCny: 0, cnyRate: 7.28 };
  const rows = await db
    .select()
    .from(ethPositionSettings)
    .where(eq(ethPositionSettings.ledgerId, ledgerId));
  if (rows.length === 0) return { targetProfitCny: 0, cnyRate: 7.28, targetEthQty: 0 };
  return {
    targetProfitCny: parseFloat(rows[0].targetProfitCny as string),
    cnyRate: parseFloat(rows[0].cnyRate as string),
    targetEthQty: parseFloat((rows[0] as any).targetEthQty as string || '0'),
  };
}

/**
 * 保存某账本的 ETH 持仓全局设置（upsert）
 */
export async function upsertEthPositionSettings(
  ledgerId: number,
  targetProfitCny: number,
  cnyRate: number,
  targetEthQty: number = 0
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .insert(ethPositionSettings)
    .values({
      ledgerId,
      targetProfitCny: String(targetProfitCny),
      cnyRate: String(cnyRate),
      targetEthQty: String(targetEthQty),
    })
    .onDuplicateKeyUpdate({
      set: {
        targetProfitCny: String(targetProfitCny),
        cnyRate: String(cnyRate),
        targetEthQty: String(targetEthQty),
      },
    });
}

// ========== ETH 持仓修改日志 ==========

export interface EthPositionChangeLogEntry {
  id: number;
  ledgerId: number;
  price: number;
  changeType: 'actual' | 'planned';
  oldValue: number;
  newValue: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 新增一条修改日志
 */
export async function addEthPositionChangeLog(
  ledgerId: number,
  price: number,
  changeType: 'actual' | 'planned',
  oldValue: number,
  newValue: number,
  note: string = ''
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db.insert(ethPositionChangeLogs).values({
    ledgerId,
    price,
    changeType,
    oldValue: String(oldValue),
    newValue: String(newValue),
    note,
  });
}

/**
 * 获取某账本某档位的修改日志（按时间倒序）
 */
export async function getEthPositionChangeLogs(
  ledgerId: number,
  price?: number
): Promise<EthPositionChangeLogEntry[]> {
  const db = await getLedgerDb();
  if (!db) return [];
  const conditions = price !== undefined
    ? and(eq(ethPositionChangeLogs.ledgerId, ledgerId), eq(ethPositionChangeLogs.price, price))
    : eq(ethPositionChangeLogs.ledgerId, ledgerId);
  const rows = await db
    .select()
    .from(ethPositionChangeLogs)
    .where(conditions)
    .orderBy(desc(ethPositionChangeLogs.createdAt))
    .limit(100);
  return rows.map(r => ({
    id: r.id,
    ledgerId: r.ledgerId,
    price: r.price,
    changeType: r.changeType as 'actual' | 'planned',
    oldValue: parseFloat(r.oldValue as string),
    newValue: parseFloat(r.newValue as string),
    note: r.note ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * 更新日志备注
 */
export async function updateEthPositionChangeLogNote(
  id: number,
  ledgerId: number,
  note: string
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .update(ethPositionChangeLogs)
    .set({ note })
    .where(and(eq(ethPositionChangeLogs.id, id), eq(ethPositionChangeLogs.ledgerId, ledgerId)));
}

/**
 * 删除一条日志
 */
export async function deleteEthPositionChangeLog(
  id: number,
  ledgerId: number
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .delete(ethPositionChangeLogs)
    .where(and(eq(ethPositionChangeLogs.id, id), eq(ethPositionChangeLogs.ledgerId, ledgerId)));
}
