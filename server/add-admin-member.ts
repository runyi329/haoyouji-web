/**
 * 一次性脚本：将管理员jiang添加为企业成员
 * 这个文件会在服务器启动时自动执行一次
 */

import { getDb } from "./db";
import { users, partnershipMembers, partnershipWorkGroupMembers, partnershipWorkGroups } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export async function addAdminAsMember() {
  try {
    console.log("🔍 检查管理员jiang是否已是企业成员...");
    
    const db = await getDb();
    
    // 查找用户jiang
    const jiangUser = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, "jiang"))
      .limit(1);
    
    if (jiangUser.length === 0) {
      console.log("⚠️  用户jiang不存在");
      return;
    }
    
    const userId = jiangUser[0].id;
    console.log(`✅ 找到用户jiang，ID: ${userId}`);
    
    // 检查是否已是企业成员
    const existingMember = await db
      .select()
      .from(partnershipMembers)
      .where(
        and(
          eq(partnershipMembers.partnershipId, 1),
          eq(partnershipMembers.userId, userId)
        )
      )
      .limit(1);
    
    if (existingMember.length > 0) {
      console.log("✅ 用户jiang已经是企业成员");
      return;
    }
    
    // 添加为企业成员
    await db.insert(partnershipMembers).values({
      partnershipId: 1,
      userId: userId,
      role: "admin",
    });
    console.log("✅ 已将jiang添加为企业成员（role=admin）");
    
    // 获取所有工作群
    const workGroups = await db
      .select({ id: partnershipWorkGroups.id, name: partnershipWorkGroups.name })
      .from(partnershipWorkGroups)
      .where(eq(partnershipWorkGroups.partnershipId, 1));
    
    console.log(`📋 找到${workGroups.length}个工作群`);
    
    // 添加到所有工作群
    for (const workGroup of workGroups) {
      const existingWorkGroupMember = await db
        .select()
        .from(partnershipWorkGroupMembers)
        .where(
          and(
            eq(partnershipWorkGroupMembers.workGroupId, workGroup.id),
            eq(partnershipWorkGroupMembers.userId, userId)
          )
        )
        .limit(1);
      
      if (existingWorkGroupMember.length === 0) {
        await db.insert(partnershipWorkGroupMembers).values({
          workGroupId: workGroup.id,
          userId: userId,
        });
        console.log(`✅ 已将jiang添加到工作群: ${workGroup.name}`);
      } else {
        console.log(`✅ jiang已在工作群: ${workGroup.name}`);
      }
    }
    
    console.log("🎉 管理员jiang已成功添加为企业成员并加入所有工作群！");
  } catch (error) {
    console.error("❌ 添加管理员失败:", error);
  }
}
