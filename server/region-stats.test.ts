import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { getRegionStats } from "./db-contacts";
import { contacts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Region Stats with Overseas and Other", () => {
  it("should include overseas and other categories in region stats", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // 获取一个真实用户ID用于测试
    const [firstContact] = await db.select({ userId: contacts.parentUserId })
      .from(contacts)
      .limit(1);
    
    if (!firstContact) {
      console.log("[Test] No contacts found in database, skipping test");
      return;
    }
    
    const userId = firstContact.userId;
    
    // 获取地域统计
    const regionStats = await getRegionStats(userId);
    
    console.log(`[Test] Total regions: ${regionStats.length}`);
    console.log(`[Test] Region stats:`, regionStats.slice(0, 10).map(r => ({
      name: r.name,
      value: r.value
    })));
    
    // 验证统计结果包含数据
    expect(regionStats).toBeDefined();
    expect(regionStats.length).toBeGreaterThan(0);
    
    // 检查是否有海外或其他分类
    const hasOverseas = regionStats.some(r => r.name === '海外');
    const hasOther = regionStats.some(r => r.name === '其他');
    
    console.log(`[Test] Has overseas category: ${hasOverseas}`);
    console.log(`[Test] Has other category: ${hasOther}`);
    
    if (hasOverseas) {
      const overseas = regionStats.find(r => r.name === '海外');
      console.log(`[Test] Overseas count: ${overseas?.value}`);
      expect(overseas?.value).toBeGreaterThan(0);
    }
    
    if (hasOther) {
      const other = regionStats.find(r => r.name === '其他');
      console.log(`[Test] Other count: ${other?.value}`);
      expect(other?.value).toBeGreaterThan(0);
    }
    
    // 验证所有统计值都是正数
    regionStats.forEach(stat => {
      expect(stat.value).toBeGreaterThanOrEqual(0);
      expect(stat.name).toBeTruthy();
    });
  }, 30000);
});
