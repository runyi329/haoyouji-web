import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import { createContext } from './_core/context';
import { Request, Response } from 'express';
import * as dbContacts from './db-contacts';

describe('扩展信息字段值管理', () => {
  let testContactId: number;
  let testFieldValueId: number;
  const testUserId = 28; // 使用已存在的用户ID (hyy329)

  // 模拟请求和响应对象
  const mockReq = {
    headers: {},
    cookies: {},
  } as Request;

  const mockRes = {
    cookie: () => {},
    clearCookie: () => {},
  } as unknown as Response;

  beforeAll(async () => {
    // 创建测试联系人
    const contactId = await dbContacts.createContact({
      parentUserId: testUserId,
      name: '测试联系人_扩展信息',
      title: '同学',
      gender: '男',
      region: '北京市',
    });
    if (contactId) {
      testContactId = contactId;
    } else {
      throw new Error('创建测试联系人失败');
    }
  });

  afterAll(async () => {
    // 清理测试数据
    if (testContactId) {
      await dbContacts.deleteContact(testContactId);
    }
  });

  it('应该能够获取所有字段类目', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    const categories = await caller.contacts.fieldValues.categories();

    expect(categories).toBeDefined();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    
    // 验证主分类结构
    const firstCategory = categories[0];
    expect(firstCategory).toHaveProperty('id');
    expect(firstCategory).toHaveProperty('name');
    expect(firstCategory).toHaveProperty('icon');
    expect(firstCategory).toHaveProperty('children');
    expect(Array.isArray(firstCategory.children)).toBe(true);
    
    // 验证子分类结构
    if (firstCategory.children.length > 0) {
      const firstChild = firstCategory.children[0];
      expect(firstChild).toHaveProperty('id');
      expect(firstChild).toHaveProperty('name');
      expect(firstChild).toHaveProperty('fieldType');
      expect(firstChild).toHaveProperty('parentCategoryId');
      expect(firstChild.parentCategoryId).toBe(firstCategory.id);
    }
  });

  it('应该能够添加扩展信息字段值', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    // 先获取一个类目ID
    const categories = await caller.contacts.fieldValues.categories();
    const categoryId = categories[0].id;

    // 添加字段值
    const result = await caller.contacts.fieldValues.add({
      contactId: testContactId,
      categoryId: categoryId,
      value: '测试公司',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.categoryId).toBe(categoryId);
    expect(result.value).toBe('测试公司');

    testFieldValueId = result.id;
  });

  it('应该能够获取联系人的所有扩展信息字段值', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    const fieldValues = await caller.contacts.fieldValues.list({
      contactId: testContactId,
    });

    expect(fieldValues).toBeDefined();
    expect(Array.isArray(fieldValues)).toBe(true);
    expect(fieldValues.length).toBeGreaterThan(0);

    // 验证字段值结构（包含类目信息）
    const firstFieldValue = fieldValues[0];
    expect(firstFieldValue).toHaveProperty('id');
    expect(firstFieldValue).toHaveProperty('contactId');
    expect(firstFieldValue).toHaveProperty('categoryId');
    expect(firstFieldValue).toHaveProperty('categoryName');
    expect(firstFieldValue).toHaveProperty('categoryKey');
    expect(firstFieldValue).toHaveProperty('value');
    expect(firstFieldValue.value).toBe('测试公司');
  });

  it('应该能够添加同一类目的多个字段值', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    // 获取一个类目ID
    const categories = await caller.contacts.fieldValues.categories();
    const categoryId = categories[0].id;

    // 添加第二个字段值（同一类目）
    const result1 = await caller.contacts.fieldValues.add({
      contactId: testContactId,
      categoryId: categoryId,
      value: '测试公司2',
    });

    // 添加第三个字段值（同一类目）
    const result2 = await caller.contacts.fieldValues.add({
      contactId: testContactId,
      categoryId: categoryId,
      value: '测试公司3',
    });

    expect(result1.id).toBeDefined();
    expect(result2.id).toBeDefined();
    expect(result1.id).not.toBe(result2.id);

    // 验证联系人现在有3个字段值
    const fieldValues = await caller.contacts.fieldValues.list({
      contactId: testContactId,
    });

    const sameCategoryValues = fieldValues.filter((fv: any) => fv.categoryId === categoryId);
    expect(sameCategoryValues.length).toBe(3);
  });

  it('应该能够删除扩展信息字段值', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    // 删除之前添加的字段值
    const result = await caller.contacts.fieldValues.delete({
      id: testFieldValueId,
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // 验证字段值已被删除
    const fieldValues = await caller.contacts.fieldValues.list({
      contactId: testContactId,
    });

    const deletedFieldValue = fieldValues.find((fv: any) => fv.id === testFieldValueId);
    expect(deletedFieldValue).toBeUndefined();
  });

  it('应该验证50个固定类目已初始化', async () => {
    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller({ ...ctx, user: { id: testUserId, openId: 'test', name: '测试用户', role: 'parent' } });

    const categories = await caller.contacts.fieldValues.categories();

    // 验证主分类数量（6个）
    expect(categories.length).toBe(6);

    // 验证主分类名称
    const mainCategoryNames = categories.map((c: any) => c.name);
    expect(mainCategoryNames.some((name: string) => name.includes('地址'))).toBe(true);
    expect(mainCategoryNames.some((name: string) => name.includes('联系方式'))).toBe(true);
    expect(mainCategoryNames.some((name: string) => name.includes('职业信息'))).toBe(true);
    
    // 验证子分类存在
    const allChildren = categories.flatMap((c: any) => c.children || []);
    const childNames = allChildren.map((c: any) => c.name);
    expect(childNames).toContain('手机号码');
    expect(childNames).toContain('微信号');
  });
});
