import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { getFirstContactCreatedAt } from './db-contacts';
import { contacts, users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('累计使用天数计算', () => {
  let testUserId: number;
  let testContactId: number;
  
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    
    // 创建测试用户
    const [user] = await db.insert(users).values({
      username: `test_user_${Date.now()}`,
      name: '测试用户',
      passwordHash: 'test_hash',
      role: 'user',
      openId: `test_openid_${Date.now()}`
    });
    testUserId = user.insertId;
    
    // 创建测试人脉（13天前）
    const thirteenDaysAgo = new Date();
    thirteenDaysAgo.setDate(thirteenDaysAgo.getDate() - 13);
    
    const [contact] = await db.insert(contacts).values({
      parentUserId: testUserId,
      name: '测试人脉',
      createdAt: thirteenDaysAgo.toISOString().slice(0, 19).replace('T', ' ')
    });
    testContactId = contact.insertId;
  });
  
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    
    // 清理测试数据
    await db.delete(contacts).where(eq(contacts.id, testContactId));
    await db.delete(users).where(eq(users.id, testUserId));
  });
  
  it('应该正确返回第一个人脉的创建时间（字符串格式）', async () => {
    const firstContactCreatedAt = await getFirstContactCreatedAt(testUserId);
    
    expect(firstContactCreatedAt).toBeTruthy();
    expect(typeof firstContactCreatedAt).toBe('string');
    // 验证字符串格式：YYYY-MM-DD HH:MM:SS
    expect(firstContactCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
  
  it('应该正确计算累计使用天数（13天）', async () => {
    const firstContactCreatedAt = await getFirstContactCreatedAt(testUserId);
    
    if (!firstContactCreatedAt) {
      throw new Error('未找到第一个人脉的创建时间');
    }
    
    // 将字符串日期转换为Date对象，然后获取毫秒时间戳
    const firstContactDate = new Date(firstContactCreatedAt).getTime();
    const now = Date.now();
    const diffInMs = now - firstContactDate;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    // 应该是13天（允许±1天的误差，因为测试执行时间可能跨天）
    expect(diffInDays).toBeGreaterThanOrEqual(12);
    expect(diffInDays).toBeLessThanOrEqual(14);
  });
  
  it('当用户没有人脉时应该返回null', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    
    // 创建一个没有人脉的用户
    const [emptyUser] = await db.insert(users).values({
      username: `test_empty_user_${Date.now()}`,
      name: '空用户',
      passwordHash: 'test_hash',
      role: 'user',
      openId: `test_empty_openid_${Date.now()}`
    });
    const emptyUserId = emptyUser.insertId;
    
    const firstContactCreatedAt = await getFirstContactCreatedAt(emptyUserId);
    
    expect(firstContactCreatedAt).toBeNull();
    
    // 清理
    await db.delete(users).where(eq(users.id, emptyUserId));
  });
  
  it('字符串日期转换不应该产生NaN', async () => {
    const testDateString = '2026-01-14 14:23:45';
    const timestamp = new Date(testDateString).getTime();
    
    expect(timestamp).not.toBeNaN();
    expect(timestamp).toBeGreaterThan(0);
    
    // 验证可以正确计算天数差
    const now = Date.now();
    const diffInMs = now - timestamp;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    expect(diffInDays).not.toBeNaN();
    expect(diffInDays).toBeGreaterThanOrEqual(0);
  });
});
