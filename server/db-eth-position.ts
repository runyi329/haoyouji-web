import { getLedgerDb } from "./db";
import { ethPositionLevels } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

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
  // 逐条 upsert（MySQL 支持 INSERT ... ON DUPLICATE KEY UPDATE）
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
