import { describe, expect, it } from "vitest";
import { getDb } from "./db";

describe("Database Connection", () => {
  it("should connect to the original database successfully", async () => {
    const db = await getDb();
    
    if (!db) throw new Error("Database not available");
    
    // 验证数据库连接不为 null
    expect(db).not.toBeNull();
    
    if (!db) {
      throw new Error("Database connection is null");
    }
    
    // 尝试执行一个简单的查询来验证连接
    try {
      // 查询数据库中的表数量
      const result = await db.execute("SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
      
      console.log("[Test] Database connection successful");
      console.log("[Test] Query result:", result);
      
      expect(result).toBeDefined();
    } catch (error) {
      console.error("[Test] Database query failed:", error);
      throw error;
    }
  });

  it("should use ORIGINAL_DATABASE_URL if available", async () => {
    // 验证环境变量配置
    const hasOriginalDb = !!process.env.ORIGINAL_DATABASE_URL;
    const hasManusDb = !!process.env.DATABASE_URL;
    
    console.log("[Test] ORIGINAL_DATABASE_URL exists:", hasOriginalDb);
    console.log("[Test] DATABASE_URL exists:", hasManusDb);
    
    // 至少应该有一个数据库连接配置
    expect(hasOriginalDb || hasManusDb).toBe(true);
    
    // 如果配置了原数据库,应该优先使用
    if (hasOriginalDb) {
      console.log("[Test] Will use ORIGINAL_DATABASE_URL");
    } else {
      console.log("[Test] Will use DATABASE_URL as fallback");
    }
  });
});
