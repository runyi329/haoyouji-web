import { getDb } from "./db";
import { contacts, contactSharingConnections } from "../drizzle/schema";
import { eq, and, sql, gte, isNotNull, ne, or, isNull } from "drizzle-orm";

/**
 * 获取地域分布趋势数据
 * @param userId 用户ID
 * @param months 查询最近几个月的数据(默认6个月)
 * @param regions 指定查询的省份列表(可选,为空则查询所有省份)
 * @returns 地域趋势数据
 */
export async function getRegionTrend(
  userId: number,
  months: number = 6,
  regions?: string[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 计算起始日期(N个月前的第一天)
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  // 如果没有指定省份,获取所有有数据的省份
  let targetRegions = regions;
  if (!targetRegions || targetRegions.length === 0) {
    // 获取用户所有人脉的省份(去重)
    const allRegions = await db
      .selectDistinct({ region: contacts.region })
      .from(contacts)
      .where(and(
        eq(contacts.parentUserId, userId),
        isNotNull(contacts.region),
        ne(contacts.region, '')
      ));
    
    targetRegions = allRegions
      .map(r => r.region)
      .filter(r => r) as string[];
    
    // 限制最多返回前10个省份(按人脉数量排序)
    if (targetRegions.length > 10) {
      const regionCounts = await db
        .select({
          region: contacts.region,
          count: sql<number>`COUNT(*)`,
        })
        .from(contacts)
        .where(and(
          eq(contacts.parentUserId, userId),
          isNotNull(contacts.region),
          ne(contacts.region, '')
        ))
        .groupBy(contacts.region)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(10);
      
      targetRegions = regionCounts
        .map(r => r.region)
        .filter(r => r) as string[];
    }
  }

  // 为每个省份查询每月的新增人脉数
  const trendData: {
    month: string;
    [region: string]: number | string;
  }[] = [];

  // 生成月份列表
  const monthsList: string[] = [];
  for (let i = 0; i < months; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - (months - 1 - i));
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthsList.push(monthStr);
  }

  // 为每个月份初始化数据
  for (const month of monthsList) {
    const dataPoint: { month: string; [region: string]: number | string } = {
      month,
    };
    
    // 为每个省份初始化为0
    for (const region of targetRegions) {
      dataPoint[region] = 0;
    }
    
    trendData.push(dataPoint);
  }

  // 查询每个省份在每个月的新增人脉数
  for (const region of targetRegions) {
    for (let i = 0; i < months; i++) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - (months - 1 - i));
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      
      // 查询该月该省份的新增人脉数
      const [result] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(and(
          eq(contacts.parentUserId, userId),
          eq(contacts.region, region),
          gte(contacts.createdAt, monthStart),
          sql`${contacts.createdAt} < ${monthEnd}`
        ));
      
      const count = Number(result?.count) || 0;
      trendData[i]![region] = count;
    }
  }

  return {
    data: trendData,
    regions: targetRegions,
  };
}

/**
 * 获取海外和其他类别的趋势数据
 * @param userId 用户ID
 * @param months 查询最近几个月的数据
 * @returns 海外和其他的趋势数据
 */
export async function getOverseasAndOtherTrend(
  userId: number,
  months: number = 6
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trendData: {
    month: string;
    海外: number;
    其他: number;
  }[] = [];

  // 生成月份列表并查询数据
  for (let i = 0; i < months; i++) {
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - (months - 1 - i));
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    const monthStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
    
    // 查询海外人脉数
    const [overseasResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(
        eq(contacts.parentUserId, userId),
        eq(contacts.region, '海外'),
        gte(contacts.createdAt, monthStart),
        sql`${contacts.createdAt} < ${monthEnd}`
      ));
    
    // 查询其他(未选择地域)人脉数
    const [otherResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(
        eq(contacts.parentUserId, userId),
        or(
          isNull(contacts.region),
          eq(contacts.region, '')
        ),
        gte(contacts.createdAt, monthStart),
        sql`${contacts.createdAt} < ${monthEnd}`
      ));
    
    trendData.push({
      month: monthStr,
      海外: Number(overseasResult?.count) || 0,
      其他: Number(otherResult?.count) || 0,
    });
  }

  return trendData;
}
