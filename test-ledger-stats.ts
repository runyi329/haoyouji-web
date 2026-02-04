import { getDb } from "./server/db";
import { ledgerMembers, ledgerRecords, users } from "./drizzle/schema";
import { eq, sql } from "drizzle-orm";

async function testLedgerStats() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  // 1. 查找 jiang 用户的 ID
  const jiangUser = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, 'jiang'));
  
  console.log("jiang 用户信息:", jiangUser);
  
  if (jiangUser.length === 0) {
    console.error("找不到 jiang 用户");
    return;
  }
  
  const userId = jiangUser[0].id;
  console.log("jiang 用户 ID:", userId);
  
  // 2. 查询该用户参与的所有账本
  const userLedgers = await db
    .select({ ledgerId: ledgerMembers.ledgerId, role: ledgerMembers.role, userId: ledgerMembers.userId })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.userId, userId));
  
  console.log("用户参与的账本:", userLedgers);
  
  // 3. 查询所有账本成员（不限用户）
  const allMembers = await db
    .select({ 
      ledgerId: ledgerMembers.ledgerId, 
      userId: ledgerMembers.userId, 
      role: ledgerMembers.role 
    })
    .from(ledgerMembers);
  
  console.log("所有账本成员数量:", allMembers.length);
  console.log("前10条账本成员记录:", allMembers.slice(0, 10));
  
  // 4. 查询所有账目记录数量
  const allRecords = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerRecords);
  
  console.log("所有账目记录总数:", allRecords[0]?.count);
}

testLedgerStats().catch(console.error);
