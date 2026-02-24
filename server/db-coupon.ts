import { db } from "./db";
import { coupons, couponRecipients, couponUsage } from "../drizzle/schema";
import { contactShares, users } from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ==================== 卡券管理函数 ====================

/**
 * 获取用户可以发送卡券的接收者列表（已共享人脉的用户）
 */
export async function getAvailableRecipients(userId: string) {
  try {
    // 查询已共享人脉给其他用户的列表
    const recipients = await db
      .select({
        userId: contactShares.sharedWithId,
        username: users.username,
        avatar: users.avatar,
      })
      .from(contactShares)
      .leftJoin(users, eq(contactShares.sharedWithId, users.id))
      .where(eq(contactShares.sharerId, userId))
      .groupBy(contactShares.sharedWithId);

    return recipients;
  } catch (error) {
    console.error("获取可发送卡券的用户列表失败:", error);
    throw error;
  }
}

/**
 * 创建卡券并发送给指定用户
 */
export async function createCoupon(data: {
  creatorId: string;
  title: string;
  description?: string;
  validFrom: string;
  validUntil: string;
  recipientIds: string[] | 'all';
}) {
  try {
    const couponId = uuidv4();
    
    // 创建卡券
    await db.insert(coupons).values({
      id: couponId,
      creatorId: data.creatorId,
      title: data.title,
      description: data.description || '',
      templateType: 'default',
      templateData: null,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
    });

    // 确定接收者列表
    let recipientIds: string[];
    if (data.recipientIds === 'all') {
      // 获取所有可发送的用户
      const availableRecipients = await getAvailableRecipients(data.creatorId);
      recipientIds = availableRecipients.map(r => r.userId);
    } else {
      recipientIds = data.recipientIds;
    }

    // 创建接收记录
    if (recipientIds.length > 0) {
      const recipientRecords = recipientIds.map(recipientId => ({
        id: uuidv4(),
        couponId,
        recipientId,
        status: 'unused' as const,
      }));

      await db.insert(couponRecipients).values(recipientRecords);
    }

    return { couponId, recipientCount: recipientIds.length };
  } catch (error) {
    console.error("创建卡券失败:", error);
    throw error;
  }
}

/**
 * 获取用户收到的卡券列表
 */
export async function getReceivedCoupons(userId: string) {
  try {
    const result = await db
      .select({
        id: coupons.id,
        title: coupons.title,
        description: coupons.description,
        validFrom: coupons.validFrom,
        validUntil: coupons.validUntil,
        createdAt: coupons.createdAt,
        creatorId: coupons.creatorId,
        creatorName: users.username,
        creatorAvatar: users.avatar,
        recipientRecordId: couponRecipients.id,
        status: couponRecipients.status,
        receivedAt: couponRecipients.receivedAt,
      })
      .from(couponRecipients)
      .leftJoin(coupons, eq(couponRecipients.couponId, coupons.id))
      .leftJoin(users, eq(coupons.creatorId, users.id))
      .where(eq(couponRecipients.recipientId, userId))
      .orderBy(desc(couponRecipients.receivedAt));

    return result;
  } catch (error) {
    console.error("获取收到的卡券列表失败:", error);
    throw error;
  }
}

/**
 * 获取用户发出的卡券列表
 */
export async function getSentCoupons(userId: string) {
  try {
    const result = await db
      .select({
        id: coupons.id,
        title: coupons.title,
        description: coupons.description,
        validFrom: coupons.validFrom,
        validUntil: coupons.validUntil,
        createdAt: coupons.createdAt,
        // 统计接收人数和已使用人数
        totalRecipients: sql<number>`COUNT(DISTINCT ${couponRecipients.id})`,
        usedCount: sql<number>`SUM(CASE WHEN ${couponRecipients.status} = 'used' THEN 1 ELSE 0 END)`,
      })
      .from(coupons)
      .leftJoin(couponRecipients, eq(coupons.id, couponRecipients.couponId))
      .where(eq(coupons.creatorId, userId))
      .groupBy(coupons.id)
      .orderBy(desc(coupons.createdAt));

    return result;
  } catch (error) {
    console.error("获取发出的卡券列表失败:", error);
    throw error;
  }
}

/**
 * 获取卡券详情
 */
export async function getCouponDetail(couponId: string, userId: string) {
  try {
    // 获取卡券基本信息
    const couponInfo = await db
      .select()
      .from(coupons)
      .where(eq(coupons.id, couponId))
      .limit(1);

    if (couponInfo.length === 0) {
      throw new Error("卡券不存在");
    }

    const coupon = couponInfo[0];

    // 检查用户权限（是创建者或接收者）
    const isCreator = coupon.creatorId === userId;
    
    let recipientRecord = null;
    if (!isCreator) {
      const recipientRecords = await db
        .select()
        .from(couponRecipients)
        .where(
          and(
            eq(couponRecipients.couponId, couponId),
            eq(couponRecipients.recipientId, userId)
          )
        )
        .limit(1);

      if (recipientRecords.length === 0) {
        throw new Error("无权查看此卡券");
      }
      recipientRecord = recipientRecords[0];
    }

    // 获取创建者信息
    const creatorInfo = await db
      .select({
        username: users.username,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.id, coupon.creatorId))
      .limit(1);

    return {
      ...coupon,
      creator: creatorInfo[0],
      recipientRecord,
      isCreator,
    };
  } catch (error) {
    console.error("获取卡券详情失败:", error);
    throw error;
  }
}

/**
 * 使用/核销卡券
 */
export async function useCoupon(recipientRecordId: string, userId: string, notes?: string) {
  try {
    // 查询接收记录
    const recipientRecords = await db
      .select()
      .from(couponRecipients)
      .where(eq(couponRecipients.id, recipientRecordId))
      .limit(1);

    if (recipientRecords.length === 0) {
      throw new Error("卡券接收记录不存在");
    }

    const recipientRecord = recipientRecords[0];

    // 验证用户权限
    if (recipientRecord.recipientId !== userId) {
      throw new Error("无权使用此卡券");
    }

    // 检查是否已使用
    if (recipientRecord.status === 'used') {
      throw new Error("卡券已使用");
    }

    // 更新接收记录状态
    await db
      .update(couponRecipients)
      .set({ status: 'used' })
      .where(eq(couponRecipients.id, recipientRecordId));

    // 创建使用记录
    await db.insert(couponUsage).values({
      id: uuidv4(),
      recipientRecordId,
      couponId: recipientRecord.couponId,
      userId,
      notes: notes || '',
    });

    return { success: true };
  } catch (error) {
    console.error("使用卡券失败:", error);
    throw error;
  }
}

/**
 * 获取卡券的核销记录（仅创建者可见）
 */
export async function getCouponUsageRecords(couponId: string, creatorId: string) {
  try {
    // 验证创建者权限
    const couponInfo = await db
      .select()
      .from(coupons)
      .where(eq(coupons.id, couponId))
      .limit(1);

    if (couponInfo.length === 0) {
      throw new Error("卡券不存在");
    }

    if (couponInfo[0].creatorId !== creatorId) {
      throw new Error("无权查看核销记录");
    }

    // 获取核销记录
    const records = await db
      .select({
        id: couponUsage.id,
        usedAt: couponUsage.usedAt,
        notes: couponUsage.notes,
        userId: couponUsage.userId,
        username: users.username,
        avatar: users.avatar,
      })
      .from(couponUsage)
      .leftJoin(users, eq(couponUsage.userId, users.id))
      .where(eq(couponUsage.couponId, couponId))
      .orderBy(desc(couponUsage.usedAt));

    return records;
  } catch (error) {
    console.error("获取核销记录失败:", error);
    throw error;
  }
}
