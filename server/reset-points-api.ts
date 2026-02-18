import { Express } from "express";
import { getDb } from "./db";
import { users, childProfiles } from "../drizzle/schema";
import { sql } from "drizzle-orm";

export function registerResetPointsApi(app: Express) {
  // 临时API：清零所有用户积分
  // 注意：这是一个危险操作，仅用于一次性执行
  app.post("/api/admin/reset-all-points", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "数据库连接失败" });
      }

      // 查询更新前的统计
      const beforeUsersResult = await db.execute(
        sql`SELECT COUNT(*) as total, COALESCE(SUM(points), 0) as total_points, COALESCE(MAX(points), 0) as max_points FROM users`
      );
      const beforeUsers = beforeUsersResult[0][0];

      const beforeChildrenResult = await db.execute(
        sql`SELECT COUNT(*) as total, COALESCE(SUM(points), 0) as total_points, COALESCE(MAX(points), 0) as max_points FROM child_profiles`
      );
      const beforeChildren = beforeChildrenResult[0][0];

      // 执行清零操作
      await db.execute(sql`UPDATE users SET points = 0`);
      await db.execute(sql`UPDATE child_profiles SET points = 0`);

      // 查询更新后的统计
      const afterUsersResult = await db.execute(
        sql`SELECT COUNT(*) as total, COALESCE(SUM(points), 0) as total_points, COALESCE(MAX(points), 0) as max_points FROM users`
      );
      const afterUsers = afterUsersResult[0][0];

      const afterChildrenResult = await db.execute(
        sql`SELECT COUNT(*) as total, COALESCE(SUM(points), 0) as total_points, COALESCE(MAX(points), 0) as max_points FROM child_profiles`
      );
      const afterChildren = afterChildrenResult[0][0];

      res.json({
        success: true,
        message: "所有用户积分已清零",
        before: {
          users: beforeUsers,
          children: beforeChildren,
        },
        after: {
          users: afterUsers,
          children: afterChildren,
        },
      });
    } catch (error) {
      console.error("清零积分失败:", error);
      res.status(500).json({ 
        error: "清零积分失败", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
