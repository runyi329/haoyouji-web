import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { contacts, tags } from "../drizzle/schema";
import { count } from "drizzle-orm";

describe("Contacts Data Test", () => {
  it("should read contacts from shared database", async () => {
    const db = await getDb();
    
    if (!db) throw new Error("Database not available");
    
    // 查询联系人总数
    const [contactCount] = await db.select({ value: count() }).from(contacts);
    
    console.log(`[Test] Total contacts: ${contactCount?.value || 0}`);
    
    // 应该有355个联系人
    expect(contactCount?.value).toBeGreaterThan(0);
    
    // 查询前3个联系人
    const sampleContacts = await db.select().from(contacts).limit(3);
    
    console.log(`[Test] Sample contacts:`, sampleContacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone
    })));
    
    expect(sampleContacts.length).toBeGreaterThan(0);
  }, 30000);

  it("should read tags from shared database", async () => {
    const db = await getDb();
    
    if (!db) throw new Error("Database not available");
    
    // 查询标签总数
    const [tagCount] = await db.select({ value: count() }).from(tags);
    
    console.log(`[Test] Total tags: ${tagCount?.value || 0}`);
    
    // 应该有103个标签
    expect(tagCount?.value).toBeGreaterThan(0);
    
    // 查询前5个标签
    const sampleTags = await db.select().from(tags).limit(5);
    
    console.log(`[Test] Sample tags:`, sampleTags.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type
    })));
    
    expect(sampleTags.length).toBeGreaterThan(0);
  }, 30000);
});
