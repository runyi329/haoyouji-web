import express from "express";
import multer from "multer";
import { getDb } from "./db";
import { users, userProfiles, shippingAddresses } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { uploadImageToCOS } from "./cos-upload";
import { sdk } from "./_core/sdk";

const router = express.Router();

// 配置文件上传（使用内存存储，然后上传到COS）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error("只允许上传图片文件"));
    }
  },
});

// ==================== 认证辅助函数 ====================

async function getUserId(req: express.Request): Promise<number | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    return user?.id || null;
  } catch (error) {
    console.error("[认证] 获取用户ID失败:", error);
    return null;
  }
}

// 确保 userProfiles 记录存在
async function ensureProfile(db: any, userId: number) {
  const [existing] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  if (!existing) {
    await db.insert(userProfiles).values({ userId });
    const [created] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return created;
  }
  return existing;
}

// ==================== 获取用户资料 ====================

router.get("/profile", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    const addressList = await db
      .select()
      .from(shippingAddresses)
      .where(eq(shippingAddresses.userId, userId));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      },
      profile: profile || null,
      addresses: addressList || [],
    });
  } catch (error) {
    console.error("[获取用户资料] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ==================== 更新基本信息 ====================

router.post("/profile/basic", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { displayName, email, phone } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    await db
      .update(users)
      .set({ displayName, email })
      .where(eq(users.id, userId));

    await ensureProfile(db, userId);
    await db
      .update(userProfiles)
      .set({ phone })
      .where(eq(userProfiles.userId, userId));

    res.json({ success: true });
  } catch (error) {
    console.error("[更新基本信息] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ==================== 更新实名认证 ====================

router.post("/profile/verification", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { realName, idNumber } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const profile = await ensureProfile(db, userId);

    if (profile.verificationStatus === "approved") {
      return res.status(400).json({ error: "已通过实名认证，无法修改" });
    }

    await db
      .update(userProfiles)
      .set({
        realName,
        idCardNumber: idNumber,
        verificationStatus: "pending",
      })
      .where(eq(userProfiles.userId, userId));

    res.json({ success: true });
  } catch (error) {
    console.error("[更新实名认证] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ==================== 支付账号管理 ====================

// 获取所有已绑定的支付方式
router.get("/profile/payment", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    if (!profile) {
      return res.json({ payments: {} });
    }

    // 构建已绑定的支付方式对象
    const payments: any = {};

    // 银行卡
    if (profile.bankAccountNumber) {
      payments.bank_card = {
        bankName: profile.bankName || "",
        bankAccountNumber: profile.bankAccountNumber,
        bankAccountName: profile.bankAccountName || "",
      };
    }

    // 数字钱包
    if (profile.digitalWalletAddress || profile.walletQrCodeUrl) {
      payments.digital_wallet = {
        walletNetwork: profile.walletNetwork || "TRC20",
        digitalWalletAddress: profile.digitalWalletAddress || "",
        walletQrCodeUrl: profile.walletQrCodeUrl || "",
      };
    }

    // 支付宝
    if (profile.alipayAccount || profile.alipayQrCodeUrl) {
      payments.alipay = {
        alipayAccount: profile.alipayAccount || "",
        alipayAccountName: profile.alipayAccountName || "",
        alipayQrCodeUrl: profile.alipayQrCodeUrl || "",
      };
    }

    // 微信
    if (profile.wechatQrCodeUrl || profile.wechatAccountName) {
      payments.wechat = {
        wechatAccountName: profile.wechatAccountName || "",
        wechatQrCodeUrl: profile.wechatQrCodeUrl || "",
      };
    }

    console.log(`[获取支付信息] userId:${userId}, 已绑定:`, Object.keys(payments));

    res.json({ payments });
  } catch (error) {
    console.error("[获取支付信息] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 保存/更新某种支付方式
router.post(
  "/profile/payment/:type",
  upload.single("qrcode"),
  async (req, res) => {
    try {
      const userId = await getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "未登录" });
      }

      const { type } = req.params;
      const validTypes = ["bank_card", "digital_wallet", "alipay", "wechat"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "无效的支付方式" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "数据库连接失败" });
      }

      await ensureProfile(db, userId);

      // 解析表单数据
      const data = JSON.parse(req.body.data || "{}");
      const file = req.file;

      console.log(`[保存支付方式:${type}] userId:${userId}, data:`, data, "hasFile:", !!file);

      // 上传收款码图片
      let qrCodeUrl: string | undefined;
      if (file) {
        qrCodeUrl = await uploadImageToCOS(file.buffer, "payment-qrcodes");
        console.log(`[保存支付方式:${type}] 收款码上传成功:`, qrCodeUrl);
      }

      // 根据支付方式类型准备更新数据
      const updateData: any = {};

      if (type === "bank_card") {
        updateData.bankName = data.bankName || null;
        updateData.bankAccountNumber = data.bankAccountNumber || null;
        updateData.bankAccountName = data.bankAccountName || null;
      } else if (type === "digital_wallet") {
        updateData.walletNetwork = data.walletNetwork || "TRC20";
        updateData.digitalWalletAddress = data.digitalWalletAddress || null;
        if (qrCodeUrl) {
          updateData.walletQrCodeUrl = qrCodeUrl;
        }
      } else if (type === "alipay") {
        updateData.alipayAccount = data.alipayAccount || null;
        updateData.alipayAccountName = data.alipayAccountName || null;
        if (qrCodeUrl) {
          updateData.alipayQrCodeUrl = qrCodeUrl;
        }
      } else if (type === "wechat") {
        updateData.wechatAccountName = data.wechatAccountName || null;
        if (qrCodeUrl) {
          updateData.wechatQrCodeUrl = qrCodeUrl;
        }
      }

      console.log(`[保存支付方式:${type}] 更新数据:`, updateData);

      await db
        .update(userProfiles)
        .set(updateData)
        .where(eq(userProfiles.userId, userId));

      res.json({
        success: true,
        qrCodeUrl: qrCodeUrl || null,
      });
    } catch (error) {
      console.error("[保存支付方式] 错误:", error);
      res.status(500).json({ error: "服务器错误" });
    }
  }
);

// 删除某种支付方式
router.delete("/profile/payment/:type", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { type } = req.params;
    const validTypes = ["bank_card", "digital_wallet", "alipay", "wechat"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "无效的支付方式" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 根据类型清除对应字段
    const clearData: any = {};

    if (type === "bank_card") {
      clearData.bankName = null;
      clearData.bankAccountNumber = null;
      clearData.bankAccountName = null;
    } else if (type === "digital_wallet") {
      clearData.walletNetwork = null;
      clearData.digitalWalletAddress = null;
      clearData.walletQrCodeUrl = null;
    } else if (type === "alipay") {
      clearData.alipayAccount = null;
      clearData.alipayAccountName = null;
      clearData.alipayQrCodeUrl = null;
    } else if (type === "wechat") {
      clearData.wechatAccountName = null;
      clearData.wechatQrCodeUrl = null;
    }

    await db
      .update(userProfiles)
      .set(clearData)
      .where(eq(userProfiles.userId, userId));

    console.log(`[删除支付方式:${type}] userId:${userId}`);

    res.json({ success: true });
  } catch (error) {
    console.error("[删除支付方式] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ==================== 收件地址管理 ====================

router.post("/profile/address", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { recipientName, phone, province, city, district, detailAddress, postalCode, label, isDefault } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    if (isDefault) {
      await db
        .update(shippingAddresses)
        .set({ isDefault: false })
        .where(eq(shippingAddresses.userId, userId));
    }

    await db.insert(shippingAddresses).values({
      userId,
      recipientName,
      phone,
      province,
      city,
      district,
      detailAddress,
      postalCode,
      label,
      isDefault: isDefault || false,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[添加收件地址] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

router.put("/profile/address/:id", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const addressId = parseInt(req.params.id);
    const { recipientName, phone, province, city, district, detailAddress, postalCode, label, isDefault } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    if (isDefault) {
      await db
        .update(shippingAddresses)
        .set({ isDefault: false })
        .where(eq(shippingAddresses.userId, userId));
    }

    await db
      .update(shippingAddresses)
      .set({
        recipientName,
        phone,
        province,
        city,
        district,
        detailAddress,
        postalCode,
        label,
        isDefault: isDefault || false,
      })
      .where(
        and(
          eq(shippingAddresses.id, addressId),
          eq(shippingAddresses.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error("[更新收件地址] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

router.delete("/profile/address/:id", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const addressId = parseInt(req.params.id);

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    await db
      .delete(shippingAddresses)
      .where(
        and(
          eq(shippingAddresses.id, addressId),
          eq(shippingAddresses.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error("[删除收件地址] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

export default router;
