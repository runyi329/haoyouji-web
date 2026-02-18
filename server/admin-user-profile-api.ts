import { Router } from "express";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { users, userProfiles, shippingAddresses } from "../drizzle/schema";

const router = Router();

// 管理员获取用户资料
router.get("/user-profile/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const db = getDb();

    // 获取用户基本信息
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 获取用户扩展资料
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    // 获取收件地址
    const addresses = await db.select().from(shippingAddresses).where(eq(shippingAddresses.userId, userId));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        points: user.points,
      },
      profile: profile || null,
      addresses: addresses || [],
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

export default router;
