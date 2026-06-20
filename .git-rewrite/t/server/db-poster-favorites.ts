import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * 海报收藏数据库表结构
 * 
 * 功能说明：
 * - 支持用户收藏海报
 * - 海报分类管理（营销类、产品教程类、特定对象类等）
 * - 存储海报图片URL（腾讯云COS）
 * - 支持缩略图和原图
 */

// 海报分类枚举
export const POSTER_CATEGORIES = {
  MARKETING: 'marketing',           // 营销类
  PRODUCT_TUTORIAL: 'product_tutorial',  // 产品教程类
  TARGET_AUDIENCE: 'target_audience',    // 特定对象类
  BRAND: 'brand',                   // 品牌宣传类
  EVENT: 'event',                   // 活动类
  OTHER: 'other',                   // 其他
} as const;

export type PosterCategory = typeof POSTER_CATEGORIES[keyof typeof POSTER_CATEGORIES];

// 创建海报收藏表
export async function createPosterFavoritesTable() {
  const db = await getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS poster_favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL COMMENT '海报标题',
      description TEXT COMMENT '海报描述',
      category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '海报分类',
      series_name VARCHAR(255) COMMENT '系列名称（如：脉动网宣传系列）',
      thumbnail_url VARCHAR(500) NOT NULL COMMENT '缩略图URL',
      full_url VARCHAR(500) NOT NULL COMMENT '原图URL',
      width INT COMMENT '图片宽度',
      height INT COMMENT '图片高度',
      file_size INT COMMENT '文件大小（字节）',
      tags JSON COMMENT '标签数组',
      sort_order INT DEFAULT 0 COMMENT '排序顺序',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_category (category),
      INDEX idx_series (series_name),
      INDEX idx_created_at (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='海报收藏表'
  `);
}

// 海报数据类型
export interface PosterFavorite {
  id: number;
  userId: number;
  title: string;
  description?: string;
  category: PosterCategory;
  seriesName?: string;
  thumbnailUrl: string;
  fullUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  tags?: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// 创建海报收藏
export async function createPosterFavorite(data: {
  userId: number;
  title: string;
  description?: string;
  category: PosterCategory;
  seriesName?: string;
  thumbnailUrl: string;
  fullUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  tags?: string[];
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(sql`
    INSERT INTO poster_favorites (
      user_id, title, description, category, series_name,
      thumbnail_url, full_url, width, height, file_size, tags
    ) VALUES (
      ${data.userId}, ${data.title}, ${data.description || null}, ${data.category},
      ${data.seriesName || null}, ${data.thumbnailUrl}, ${data.fullUrl},
      ${data.width || null}, ${data.height || null}, ${data.fileSize || null},
      ${data.tags ? JSON.stringify(data.tags) : null}
    )
  `);
  return Number(result.insertId);
}

// 获取用户的所有海报收藏
export async function getUserPosterFavorites(userId: number, category?: PosterCategory): Promise<PosterFavorite[]> {
  const db = await getDb();
  let query = sql`
    SELECT 
      id, user_id as userId, title, description, category, series_name as seriesName,
      thumbnail_url as thumbnailUrl, full_url as fullUrl,
      width, height, file_size as fileSize, tags, sort_order as sortOrder,
      created_at as createdAt, updated_at as updatedAt
    FROM poster_favorites
    WHERE user_id = ${userId}
  `;

  if (category) {
    query = sql`${query} AND category = ${category}`;
  }

  query = sql`${query} ORDER BY sort_order DESC, created_at DESC`;

  const results = await db.execute(query);
  return (results.rows as any[]).map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
  }));
}

// 获取单个海报详情
export async function getPosterFavoriteById(id: number, userId: number): Promise<PosterFavorite | null> {
  const db = await getDb();
  const results = await db.execute(sql`
    SELECT 
      id, user_id as userId, title, description, category, series_name as seriesName,
      thumbnail_url as thumbnailUrl, full_url as fullUrl,
      width, height, file_size as fileSize, tags, sort_order as sortOrder,
      created_at as createdAt, updated_at as updatedAt
    FROM poster_favorites
    WHERE id = ${id} AND user_id = ${userId}
  `);

  const row = results.rows[0] as any;
  if (!row) return null;

  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
  };
}

// 更新海报收藏
export async function updatePosterFavorite(
  id: number,
  userId: number,
  data: Partial<{
    title: string;
    description: string;
    category: PosterCategory;
    seriesName: string;
    tags: string[];
    sortOrder: number;
  }>
): Promise<boolean> {
  const db = await getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.category !== undefined) {
    updates.push('category = ?');
    values.push(data.category);
  }
  if (data.seriesName !== undefined) {
    updates.push('series_name = ?');
    values.push(data.seriesName);
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?');
    values.push(JSON.stringify(data.tags));
  }
  if (data.sortOrder !== undefined) {
    updates.push('sort_order = ?');
    values.push(data.sortOrder);
  }

  if (updates.length === 0) return false;

  values.push(id, userId);

  const result = await db.execute(
    sql.raw(`UPDATE poster_favorites SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values)
  );

  return (result as any).rowsAffected > 0;
}

// 删除海报收藏
export async function deletePosterFavorite(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(sql`
    DELETE FROM poster_favorites WHERE id = ${id} AND user_id = ${userId}
  `);
  return (result as any).rowsAffected > 0;
}

// 获取海报分类统计
export async function getPosterCategoryStats(userId: number): Promise<{ category: string; count: number }[]> {
  const db = await getDb();
  const results = await db.execute(sql`
    SELECT category, COUNT(*) as count
    FROM poster_favorites
    WHERE user_id = ${userId}
    GROUP BY category
    ORDER BY count DESC
  `);
  return results.rows as { category: string; count: number }[];
}
