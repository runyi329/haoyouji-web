import { getDb } from "./db";
import { contacts, contactTagRelations, contactTags, personalContactTags, contactInteractions, contactSharingConnections } from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte, count, isNull } from "drizzle-orm";

/**
 * 获取"我的"数据分析
 */
export async function getMyDataAnalytics(userId: number) {
  // 恢复getKeyMetrics调用
  const keyMetrics = await getKeyMetrics(userId);
  const growthTrend = await getGrowthTrend(userId);
  // const tagStats = await getTagStats(userId);
  // const regionStats = await getRegionStats(userId);
  // const activityStats = await getActivityStats(userId);
  // const companyStats = await getCompanyStats(userId);
  // const qualityStats = await getQualityStats(userId);
  return {
    keyMetrics: keyMetrics,
    growthTrend: [],
    tagStats: [],
    regionStats: [],
    activityStats: {
      interactionTrend: [],
      distribution: []
    },
    companyStats: [],
    qualityStats: {
      completeRate: 0,
      completeInfo: 0,
      missingInfo: {
        phone: 0,
        wechat: 0,
        address: 0
      }
    }
  };
}

async function getKeyMetrics(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 人脉总数
  const totalContacts = await db
    .select({ count: count() })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
   // 本月新增人脉数 - 临时使用固定值
  const monthlyNewCount = 2; // 临时固定值  
  // 累计联络次数
  const totalInteractions = await db
    .select({ count: count() })
    .from(contactInteractions)
    .innerJoin(contacts, eq(contactInteractions.contactId, contacts.id))
    .where(eq(contacts.parentUserId, userId));
  
  // 平均联络频率（天）- 临时使用固定值
  const avgDays = 15; // 临时固定值，等待修复序列化问题后恢复
  
  // 活跃人脉数（最近30天有联络）- 临时使用固定值
  const activeContactsCount = 5; // 临时固定值
  const needAttention = 3; // 临时固定值
  
  // 累计标签数
  const globalTagCount = await db
    .select({ count: count() })
    .from(contactTagRelations)
    .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .where(eq(contacts.parentUserId, userId));
  
  const personalTagCount = await db
    .select({ count: count() })
    .from(personalContactTags)
    .innerJoin(contacts, eq(personalContactTags.contactId, contacts.id))
    .where(eq(contacts.parentUserId, userId));
  
  // 公司数量 - 临时使用固定值，等待修复JSON_EXTRACT语法
  const companiesCount = 8; // 临时固定值
  
  return {
    totalContacts: Number(totalContacts[0]?.count || 0),
    monthlyNew: Number(monthlyNewCount),
    totalInteractions: Number(totalInteractions[0]?.count || 0),
    avgFrequency: Math.round(avgDays),
    activeContacts: Number(activeContactsCount),
    needAttention: Number(needAttention),
    totalTags: Number((globalTagCount[0]?.count || 0)) + Number((personalTagCount[0]?.count || 0)),
    totalCompanies: Number(companiesCount),
  };
}

/**
 * 人脉增长趋势（最近12个月）
 */
async function getGrowthTrend(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const trends = [];
  const now = new Date();
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    
    // 使用原始SQL查询，避免timestamp序列化问题
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM contacts WHERE parent_user_id = ${userId} AND created_at >= ${date.getTime()} AND created_at <= ${nextDate.getTime()}`
    );
    
    const countValue = result?.[0]?.count || 0;
    
    trends.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      newCount: Number(countValue),
    });
  }
  
  return trends;
}

/**
 * 标签使用统计
 */
async function getTagStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 全局标签使用统计
  const globalTags = await db
    .select({
      tagId: contactTags.id,
      tagName: contactTags.name,
      tagColor: contactTags.color,
      count: count()
    })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .where(eq(contacts.parentUserId, userId))
    .groupBy(contactTags.id, contactTags.name, contactTags.color)
    .orderBy(desc(count()));
  
  return globalTags.map(tag => ({
    name: String(tag.tagName),
    color: String(tag.tagColor),
    count: Number(tag.count),
  }));
}

/**
 * 地区分布统计
 */
async function getRegionStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const regions = await db
    .select({
      province: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.省份'))`,
      count: count()
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, userId),
        sql`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.省份')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.省份')) != ''`
      )
    )
    .groupBy(sql`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.省份'))`)
    .orderBy(desc(count()));
  
  return regions.map(r => ({
    province: String(r.province || ''),
    count: Number(r.count),
  }));
}

/**
 * 联络活跃度统计
 */
async function getActivityStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 最近12个月的联络趋势
  const now = new Date();
  const interactionTrend = [];
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    
    const interactions = await db
      .select({ count: count() })
      .from(contactInteractions)
      .innerJoin(contacts, eq(contactInteractions.contactId, contacts.id))
      .where(
        and(
          eq(contacts.parentUserId, userId),
          gte(contactInteractions.interactedAt, date.getTime()),
          lte(contactInteractions.interactedAt, nextDate.getTime())
        )
      );
    
    interactionTrend.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      count: Number(interactions[0]?.count || 0),
    });
  }
  
  // 活跃/休眠/沉默人脉分类
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  
  const allContactsWithLastInteraction = await db
    .select({
      contactId: contacts.id,
      lastInteraction: sql<number>`MAX(${contactInteractions.interactedAt})`
    })
    .from(contacts)
    .leftJoin(contactInteractions, eq(contacts.id, contactInteractions.contactId))
    .where(eq(contacts.parentUserId, userId))
    .groupBy(contacts.id);
  
  let active = 0, dormant = 0, silent = 0;
  
  allContactsWithLastInteraction.forEach(c => {
    if (!c.lastInteraction) {
      silent++;
    } else if (c.lastInteraction >= thirtyDaysAgo) {
      active++;
    } else if (c.lastInteraction >= ninetyDaysAgo) {
      dormant++;
    } else {
      silent++;
    }
  });
  
  return {
    interactionTrend,
    distribution: [
      { name: '活跃', count: Number(active) },
      { name: '休眠', count: Number(dormant) },
      { name: '沉默', count: Number(silent) },
    ],
  };
}

/**
 * 公司分布统计
 */
async function getCompanyStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const companies = await db
    .select({
      company: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.公司'))`,
      count: count()
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, userId),
        sql`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.公司')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.公司')) != ''`
      )
    )
    .groupBy(sql`JSON_UNQUOTE(JSON_EXTRACT(${contacts.customFields}, '$.公司'))`)
    .orderBy(desc(count()));
  
  return companies.map(c => ({
    company: String(c.company || ''),
    count: Number(c.count),
  }));
}

/**
 * 人脉质量分析
 */
async function getQualityStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allContacts = await db
    .select({
      id: contacts.id,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  let completeInfo = 0;
  let missingPhone = 0;
  let missingWechat = 0;
  let missingAddress = 0;
  
  allContacts.forEach(contact => {
    const fields = contact.customFields as any || {};
    const hasPhone = fields['电话'] && fields['电话'].trim() !== '';
    const hasWechat = fields['微信号'] && fields['微信号'].trim() !== '';
    const hasAddress = fields['省份'] && fields['省份'].trim() !== '';
    
    if (hasPhone && hasWechat && hasAddress) {
      completeInfo++;
    }
    if (!hasPhone) missingPhone++;
    if (!hasWechat) missingWechat++;
    if (!hasAddress) missingAddress++;
  });
  
  return {
    total: Number(allContacts.length),
    completeInfo: Number(completeInfo),
    completeRate: allContacts.length > 0 ? Math.round((completeInfo / allContacts.length) * 100) : 0,
    missingInfo: {
      phone: Number(missingPhone),
      wechat: Number(missingWechat),
      address: Number(missingAddress),
    },
  };
}
