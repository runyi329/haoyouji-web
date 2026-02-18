import express from "express";
import { getDb } from "./db";
import { users, userProfiles, shippingAddresses } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const router = express.Router();

// 获取用户资料
router.get("/profile", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 获取用户基本信息
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    // 获取扩展资料
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    // 合并数据
    const result = {
      name: user.name || '',
      nickname: profile?.nickname || '',
      email: user.email || '',
      phone: profile?.phone || '',
      realName: profile?.realName || '',
      idCardNumber: profile?.idCardNumber || '',
      verificationStatus: profile?.verificationStatus || 'pending',
      bankName: profile?.bankName || '',
      bankAccountNumber: profile?.bankAccountNumber || '',
      bankAccountName: profile?.bankAccountName || '',
      digitalWalletAddress: profile?.digitalWalletAddress || '',
      alipayAccount: profile?.alipayAccount || '',
      wechatAccount: profile?.wechatAccount || '',
    };

    res.json(result);
  } catch (error) {
    console.error("获取用户资料失败:", error);
    res.status(500).json({ error: "获取用户资料失败" });
  }
});

// 更新用户资料
router.put("/profile", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const {
      name,
      nickname,
      email,
      phone,
      realName,
      idCardNumber,
      bankName,
      bankAccountNumber,
      bankAccountName,
      digitalWalletAddress,
      alipayAccount,
      wechatAccount,
    } = req.body;

    // 更新users表
    await db.update(users)
      .set({
        name,
        email,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // 检查是否已有扩展资料
    const [existingProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    if (existingProfile) {
      // 更新扩展资料
      await db.update(userProfiles)
        .set({
          nickname,
          phone,
          realName,
          idCardNumber,
          bankName,
          bankAccountNumber,
          bankAccountName,
          digitalWalletAddress,
          alipayAccount,
          wechatAccount,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      // 创建扩展资料
      await db.insert(userProfiles).values({
        userId,
        nickname,
        phone,
        realName,
        idCardNumber,
        bankName,
        bankAccountNumber,
        bankAccountName,
        digitalWalletAddress,
        alipayAccount,
        wechatAccount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: "保存成功" });
  } catch (error) {
    console.error("更新用户资料失败:", error);
    res.status(500).json({ error: "更新用户资料失败" });
  }
});

// 获取收件地址列表
router.get("/addresses", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const addresses = await db.select().from(shippingAddresses).where(eq(shippingAddresses.userId, userId));

    res.json(addresses);
  } catch (error) {
    console.error("获取收件地址失败:", error);
    res.status(500).json({ error: "获取收件地址失败" });
  }
});

// 添加收件地址
router.post("/addresses", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const {
      recipientName,
      recipientPhone,
      province,
      city,
      district,
      detailedAddress,
      postalCode,
      isDefault,
      label,
    } = req.body;

    // 如果设为默认，先取消其他默认地址
    if (isDefault) {
      await db.update(shippingAddresses)
        .set({ isDefault: 0 })
        .where(eq(shippingAddresses.userId, userId));
    }

    const [result] = await db.insert(shippingAddresses).values({
      userId,
      recipientName,
      recipientPhone,
      province,
      city,
      district,
      detailedAddress,
      postalCode,
      isDefault: isDefault ? 1 : 0,
      label,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error("添加收件地址失败:", error);
    res.status(500).json({ error: "添加收件地址失败" });
  }
});

// 更新收件地址
router.put("/addresses/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const addressId = parseInt(req.params.id);
    const {
      recipientName,
      recipientPhone,
      province,
      city,
      district,
      detailedAddress,
      postalCode,
      isDefault,
      label,
    } = req.body;

    // 如果设为默认，先取消其他默认地址
    if (isDefault) {
      await db.update(shippingAddresses)
        .set({ isDefault: 0 })
        .where(eq(shippingAddresses.userId, userId));
    }

    await db.update(shippingAddresses)
      .set({
        recipientName,
        recipientPhone,
        province,
        city,
        district,
        detailedAddress,
        postalCode,
        isDefault: isDefault ? 1 : 0,
        label,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(shippingAddresses.id, addressId),
        eq(shippingAddresses.userId, userId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("更新收件地址失败:", error);
    res.status(500).json({ error: "更新收件地址失败" });
  }
});

// 删除收件地址
router.delete("/addresses/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const addressId = parseInt(req.params.id);

    await db.delete(shippingAddresses)
      .where(and(
        eq(shippingAddresses.id, addressId),
        eq(shippingAddresses.userId, userId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("删除收件地址失败:", error);
    res.status(500).json({ error: "删除收件地址失败" });
  }
});

export default router;
