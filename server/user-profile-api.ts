import express from "express";
import multer from "multer";
import path from "path";
import { getDb } from "./db";
import { users, userProfiles, shippingAddresses } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads/payment"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "qrcode-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("只允许上传图片文件"));
    }
  },
});

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
      basic: {
        name: user.name || '',
        nickname: profile?.nickname || '',
        email: user.email || '',
        phone: profile?.phone || '',
      },
      verification: {
        realName: profile?.realName || '',
        idCardNumber: profile?.idCardNumber || '',
        verificationStatus: profile?.verificationStatus || 'pending',
      },
      payment: {
        paymentMethod: profile?.paymentMethod || null,
        // 银行卡
        bankName: profile?.bankName || '',
        bankAccountNumber: profile?.bankAccountNumber || '',
        bankAccountName: profile?.bankAccountName || '',
        // 数字钱包
        walletNetwork: profile?.walletNetwork || 'TRC20',
        digitalWalletAddress: profile?.digitalWalletAddress || '',
        walletQrCodeUrl: profile?.walletQrCodeUrl || '',
        // 支付宝
        alipayAccount: profile?.alipayAccount || '',
        alipayAccountName: profile?.alipayAccountName || '',
        alipayQrCodeUrl: profile?.alipayQrCodeUrl || '',
        // 微信
        wechatQrCodeUrl: profile?.wechatQrCodeUrl || '',
        wechatAccountName: profile?.wechatAccountName || '',
      },
    };

    res.json(result);
  } catch (error) {
    console.error("获取用户资料失败:", error);
    res.status(500).json({ error: "获取用户资料失败" });
  }
});

// 更新用户资料（支持文件上传）
router.put("/profile", upload.fields([
  { name: "walletQrCode", maxCount: 1 },
  { name: "alipayQrCode", maxCount: 1 },
  { name: "wechatQrCode", maxCount: 1 },
]), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 解析JSON数据
    const data = JSON.parse(req.body.data || "{}");
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // 更新users表（基本信息）
    if (data.name || data.email) {
      await db.update(users)
        .set({
          name: data.name,
          email: data.email,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userId));
    }

    // 检查是否已有扩展资料
    const [existingProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    // 准备更新数据
    const profileData: any = {
      updatedAt: new Date().toISOString(),
    };

    // 基本信息
    if (data.nickname !== undefined) profileData.nickname = data.nickname;
    if (data.phone !== undefined) profileData.phone = data.phone;

    // 实名认证
    if (data.realName !== undefined) profileData.realName = data.realName;
    if (data.idCardNumber !== undefined) profileData.idCardNumber = data.idCardNumber;

    // 支付方式
    if (data.paymentMethod !== undefined) profileData.paymentMethod = data.paymentMethod;

    // 银行卡
    if (data.bankName !== undefined) profileData.bankName = data.bankName;
    if (data.bankAccountNumber !== undefined) profileData.bankAccountNumber = data.bankAccountNumber;
    if (data.bankAccountName !== undefined) profileData.bankAccountName = data.bankAccountName;

    // 数字钱包
    if (data.walletNetwork !== undefined) profileData.walletNetwork = data.walletNetwork;
    if (data.digitalWalletAddress !== undefined) profileData.digitalWalletAddress = data.digitalWalletAddress;
    if (files?.walletQrCode?.[0]) {
      profileData.walletQrCodeUrl = `/uploads/payment/${files.walletQrCode[0].filename}`;
    }

    // 支付宝
    if (data.alipayAccount !== undefined) profileData.alipayAccount = data.alipayAccount;
    if (data.alipayAccountName !== undefined) profileData.alipayAccountName = data.alipayAccountName;
    if (files?.alipayQrCode?.[0]) {
      profileData.alipayQrCodeUrl = `/uploads/payment/${files.alipayQrCode[0].filename}`;
    }

    // 微信
    if (data.wechatAccountName !== undefined) profileData.wechatAccountName = data.wechatAccountName;
    if (files?.wechatQrCode?.[0]) {
      profileData.wechatQrCodeUrl = `/uploads/payment/${files.wechatQrCode[0].filename}`;
    }

    if (existingProfile) {
      // 更新扩展资料
      await db.update(userProfiles)
        .set(profileData)
        .where(eq(userProfiles.userId, userId));
    } else {
      // 创建扩展资料
      await db.insert(userProfiles).values({
        userId,
        ...profileData,
        createdAt: new Date().toISOString(),
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

    res.json({ addresses });
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
