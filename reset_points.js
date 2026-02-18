// 清零所有用户积分的脚本
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users, childProfiles } from "./drizzle/schema.js";
import { sql } from "drizzle-orm";

async function resetAllPoints() {
  console.log("开始清零所有用户积分...");
  
  // 从环境变量获取数据库URL
  const databaseUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("错误: 未找到数据库连接配置");
    console.error("请设置 DATABASE_URL 或 ORIGINAL_DATABASE_URL 环境变量");
    process.exit(1);
  }
  
  console.log("数据库连接: " + databaseUrl.replace(/:[^:@]+@/, ':****@'));
  
  // 创建数据库连接
  const connection = await mysql.createConnection(databaseUrl);
  const db = drizzle(connection);
  
  try {
    // 查询更新前的统计
    console.log("\n更新前的积分统计:");
    const beforeUsers = await connection.query(
      "SELECT COUNT(*) as total, SUM(points) as total_points, MAX(points) as max_points FROM users"
    );
    console.log("users表:", beforeUsers[0][0]);
    
    const beforeChildren = await connection.query(
      "SELECT COUNT(*) as total, SUM(points) as total_points, MAX(points) as max_points FROM child_profiles"
    );
    console.log("child_profiles表:", beforeChildren[0][0]);
    
    // 执行更新
    console.log("\n执行更新操作...");
    
    // 更新users表
    const usersResult = await connection.query("UPDATE users SET points = 0");
    console.log(`✓ users表已更新，影响行数: ${usersResult[0].affectedRows}`);
    
    // 更新child_profiles表
    const childrenResult = await connection.query("UPDATE child_profiles SET points = 0");
    console.log(`✓ child_profiles表已更新，影响行数: ${childrenResult[0].affectedRows}`);
    
    // 查询更新后的统计
    console.log("\n更新后的积分统计:");
    const afterUsers = await connection.query(
      "SELECT COUNT(*) as total, SUM(points) as total_points, MAX(points) as max_points FROM users"
    );
    console.log("users表:", afterUsers[0][0]);
    
    const afterChildren = await connection.query(
      "SELECT COUNT(*) as total, SUM(points) as total_points, MAX(points) as max_points FROM child_profiles"
    );
    console.log("child_profiles表:", afterChildren[0][0]);
    
    console.log("\n✅ 所有用户积分已成功清零！");
    
  } catch (error) {
    console.error("❌ 执行失败:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

// 执行脚本
resetAllPoints()
  .then(() => {
    console.log("\n脚本执行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n脚本执行失败:", error);
    process.exit(1);
  });
