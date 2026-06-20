import { getLedgerDb } from "./db";
import { ethPositionLevels, ethPositionSettings, ethPositionChangeLogs } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export interface EthPositionLevel {
  price: number;
  plannedQty: number;
  actualQty: number;
  baseQty: number;     // 底仓数量
  tacticalQty: number; // 机动仓数量
  baseNotes?: string;     // 底仓备注（JSON字符串）
  tacticalNotes?: string; // 机动仓备注（JSON字符串）
}

/**
 * 获取某账本某用户的所有 ETH 持仓档位数据
 */
export async function getEthPositionLevels(ledgerId: number, userId: number): Promise<EthPositionLevel[]> {
  const db = await getLedgerDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(ethPositionLevels)
    .where(and(eq(ethPositionLevels.ledgerId, ledgerId), eq(ethPositionLevels.userId, userId)));
  return rows.map(r => {
    const baseQty = parseFloat((r as any).baseQty as string || '0') || 0;
    const tacticalQty = parseFloat((r as any).tacticalQty as string || '0') || 0;
    const actualQty = parseFloat(r.actualQty as string);
    return {
      price: r.price,
      plannedQty: parseFloat(r.plannedQty as string),
      actualQty,
      baseQty,
      tacticalQty,
      baseNotes: (r as any).baseNotes ?? null,
      tacticalNotes: (r as any).tacticalNotes ?? null,
    };
  });
}

/**
 * 保存单个档位（upsert：存在则更新，不存在则插入）
 */
export async function upsertEthPositionLevel(
  ledgerId: number,
  userId: number,
  price: number,
  plannedQty: number,
  actualQty: number,
  baseQty: number = 0,
  tacticalQty: number = 0,
  baseNotes?: string | null,
  tacticalNotes?: string | null
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  // actualQty 始终等于 baseQty + tacticalQty（如果两者都有值），否则用传入的 actualQty
  const finalActual = (baseQty > 0 || tacticalQty > 0) ? baseQty + tacticalQty : actualQty;
  await db
    .insert(ethPositionLevels)
    .values({
      ledgerId,
      userId,
      price,
      plannedQty: String(plannedQty),
      actualQty: String(finalActual),
      baseQty: String(baseQty),
      tacticalQty: String(tacticalQty),
      baseNotes: baseNotes ?? null,
      tacticalNotes: tacticalNotes ?? null,
    } as any)
    .onDuplicateKeyUpdate({
      set: {
        plannedQty: String(plannedQty),
        actualQty: String(finalActual),
        baseQty: String(baseQty),
        tacticalQty: String(tacticalQty),
        baseNotes: baseNotes ?? null,
        tacticalNotes: tacticalNotes ?? null,
      } as any,
    });
}

/**
 * 仅更新某档位的备注（不改变数量）
 */
export async function updateEthPositionLevelNotes(
  ledgerId: number,
  userId: number,
  price: number,
  baseNotes: string | null,
  tacticalNotes: string | null
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .update(ethPositionLevels)
    .set({ baseNotes, tacticalNotes } as any)
    .where(and(
      eq(ethPositionLevels.ledgerId, ledgerId),
      eq(ethPositionLevels.userId, userId),
      eq(ethPositionLevels.price, price)
    ));
}

/**
 * 批量保存所有档位（前端每次修改后整体同步）
 */
export async function batchUpsertEthPositionLevels(
  ledgerId: number,
  userId: number,
  levels: EthPositionLevel[]
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  if (levels.length === 0) return;
  for (const level of levels) {
    const baseQty = level.baseQty ?? 0;
    const tacticalQty = level.tacticalQty ?? 0;
    const finalActual = (baseQty > 0 || tacticalQty > 0) ? baseQty + tacticalQty : level.actualQty;
    await db
      .insert(ethPositionLevels)
      .values({
        ledgerId,
        userId,
        price: level.price,
        plannedQty: String(level.plannedQty),
        actualQty: String(finalActual),
        baseQty: String(baseQty),
        tacticalQty: String(tacticalQty),
        baseNotes: level.baseNotes ?? null,
        tacticalNotes: level.tacticalNotes ?? null,
      } as any)
      .onDuplicateKeyUpdate({
        set: {
          plannedQty: String(level.plannedQty),
          actualQty: String(finalActual),
          baseQty: String(baseQty),
          tacticalQty: String(tacticalQty),
          baseNotes: level.baseNotes ?? null,
          tacticalNotes: level.tacticalNotes ?? null,
        } as any,
      });
  }
}

// ========== ETH 持仓全局设置 ==========

export interface EthPositionSettingsData {
  targetProfitCny: number;
  cnyRate: number;
  targetEthQty: number;
  strategyRatio: number; // 策略持仓占比 0-100，战略持仓 = 100 - strategyRatio
  priceStep: number; // 档位粒度：20/50/100/200，默认50
}

/**
 * 获取某账本某用户的 ETH 持仓全局设置
 */
export async function getEthPositionSettings(ledgerId: number, userId: number): Promise<EthPositionSettingsData> {
  const db = await getLedgerDb();
  if (!db) return { targetProfitCny: 0, cnyRate: 7.28, targetEthQty: 0, strategyRatio: 50, priceStep: 50 };
  const rows = await db
    .select()
    .from(ethPositionSettings)
    .where(and(eq(ethPositionSettings.ledgerId, ledgerId), eq(ethPositionSettings.userId, userId)));
  if (rows.length === 0) return { targetProfitCny: 0, cnyRate: 7.28, targetEthQty: 0, strategyRatio: 50, priceStep: 50 };
  return {
    targetProfitCny: parseFloat(rows[0].targetProfitCny as string),
    cnyRate: parseFloat(rows[0].cnyRate as string),
    targetEthQty: parseFloat((rows[0] as any).targetEthQty as string || '0'),
    strategyRatio: (rows[0] as any).strategyRatio ?? 50,
    priceStep: (rows[0] as any).priceStep ?? 50,
  };
}

/**
 * 保存某账本某用户的 ETH 持仓全局设置（upsert）
 */
export async function upsertEthPositionSettings(
  ledgerId: number,
  userId: number,
  targetProfitCny: number,
  cnyRate: number,
  targetEthQty: number = 0,
  strategyRatio: number = 50,
  priceStep: number = 50
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .insert(ethPositionSettings)
    .values({
      ledgerId,
      userId,
      targetProfitCny: String(targetProfitCny),
      cnyRate: String(cnyRate),
      targetEthQty: String(targetEthQty),
      strategyRatio,
      priceStep,
    } as any)
    .onDuplicateKeyUpdate({
      set: {
        targetProfitCny: String(targetProfitCny),
        cnyRate: String(cnyRate),
        targetEthQty: String(targetEthQty),
        strategyRatio,
        priceStep,
      } as any,
    });
}

// ========== ETH 持仓修改日志 ==========

export interface EthPositionChangeLogEntry {
  id: number;
  ledgerId: number;
  userId: number;
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
  userId: number,
  price: number,
  changeType: 'actual' | 'planned',
  oldValue: number,
  newValue: number,
  note: string = ''
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) {
    console.error('[ETH Log] getLedgerDb() returned null, cannot insert log');
    return;
  }
  try {
    await db.insert(ethPositionChangeLogs).values({
      ledgerId,
      userId,
      price,
      changeType,
      oldValue: String(oldValue),
      newValue: String(newValue),
      note,
    });
    console.log(`[ETH Log] 写入日志成功: ledgerId=${ledgerId}, userId=${userId}, price=${price}, type=${changeType}, ${oldValue}->${newValue}`);
  } catch (e: any) {
    console.error('[ETH Log] 写入日志失败:', e.message, '| SQL:', e.sql ?? '');
    throw e;
  }
}

/**
 * 获取某账本某用户某档位的修改日志（按时间倒序）
 */
export async function getEthPositionChangeLogs(
  ledgerId: number,
  userId: number,
  price?: number
): Promise<EthPositionChangeLogEntry[]> {
  const db = await getLedgerDb();
  if (!db) return [];
  const conditions = price !== undefined
    ? and(eq(ethPositionChangeLogs.ledgerId, ledgerId), eq(ethPositionChangeLogs.userId, userId), eq(ethPositionChangeLogs.price, price))
    : and(eq(ethPositionChangeLogs.ledgerId, ledgerId), eq(ethPositionChangeLogs.userId, userId));
  const rows = await db
    .select()
    .from(ethPositionChangeLogs)
    .where(conditions)
    .orderBy(desc(ethPositionChangeLogs.createdAt))
    .limit(100);
  return rows.map(r => ({
    id: r.id,
    ledgerId: r.ledgerId,
    userId: r.userId,
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
  userId: number,
  note: string
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .update(ethPositionChangeLogs)
    .set({ note })
    .where(and(eq(ethPositionChangeLogs.id, id), eq(ethPositionChangeLogs.ledgerId, ledgerId), eq(ethPositionChangeLogs.userId, userId)));
}

/**
 * 删除一条日志
 */
export async function deleteEthPositionChangeLog(
  id: number,
  ledgerId: number,
  userId: number
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) return;
  await db
    .delete(ethPositionChangeLogs)
    .where(and(eq(ethPositionChangeLogs.id, id), eq(ethPositionChangeLogs.ledgerId, ledgerId), eq(ethPositionChangeLogs.userId, userId)));
}
