import express from "express";
import multer from "multer";
import { getDb } from "./db";
import { users, userProfiles, shippingAddresses } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { uploadImageToCOS } from "./cos-upload";

const router = express.Router();

// 配置文件上传（使用内存存储，然后上传到COS）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
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

    // 获取用户扩展资料
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    // 获取收件地址
    const addresses = await db
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
      addresses: addresses || [],
    });
  } catch (error) {
    console.error("[获取用户资料] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 更新基本信息
router.post("/profile/basic", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { displayName, email, phone } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 更新users表
    await db
      .update(users)
      .set({ displayName, email })
      .where(eq(users.id, userId));

    // 更新或创建userProfiles表
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    if (existing) {
      await db
        .update(userProfiles)
        .set({ phone })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        userId,
        phone,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[更新基本信息] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 更新实名认证
router.post("/profile/verification", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { realName, idNumber } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 检查是否已认证
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    if (existing && existing.verificationStatus === "approved") {
      return res.status(400).json({ error: "已通过实名认证，无法修改" });
    }

    // 更新或创建userProfiles表
    if (existing) {
      await db
        .update(userProfiles)
        .set({
          realName,
          idNumber,
          verificationStatus: "pending",
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        userId,
        realName,
        idNumber,
        verificationStatus: "pending",
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[更新实名认证] 错误:", error);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 更新支付账号（支持文件上传）
router.post(
  "/profile/payment",
  upload.fields([
    { name: "walletQrCode", maxCount: 1 },
    { name: "alipayQrCode", maxCount: 1 },
    { name: "wechatQrCode", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: "未登录" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "数据库连接失败" });
      }

      // 解析表单数据
      const data = JSON.parse(req.body.data || "{}");
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      // 上传图片到COS
      let walletQrCodeUrl: string | undefined;
      let alipayQrCodeUrl: string | undefined;
      let wechatQrCodeUrl: string | undefined;

      if (files.walletQrCode && files.walletQrCode[0]) {
        walletQrCodeUrl = await uploadImageToCOS(
          files.walletQrCode[0].buffer,
          "payment-qrcodes"
        );
      }

      if (files.alipayQrCode && files.alipayQrCode[0]) {
        alipayQrCodeUrl = await uploadImageToCOS(
          files.alipayQrCode[0].buffer,
          "payment-qrcodes"
        );
      }

      if (files.wechatQrCode && files.wechatQrCode[0]) {
        wechatQrCodeUrl = await uploadImageToCOS(
          files.wechatQrCode[0].buffer,
          "payment-qrcodes"
        );
      }

      // 准备更新数据
      const updateData: any = {
        paymentMethod: data.paymentMethod,
      };

      // 根据支付方式添加对应字段
      if (data.paymentMethod === "bank_card") {
        updateData.bankName = data.bankName;
        updateData.bankCardNumber = data.bankCardNumber;
        updateData.bankAccountName = data.bankAccountName;
      } else if (data.paymentMethod === "digital_wallet") {
        updateData.walletNetwork = data.walletNetwork;
        updateData.digitalWalletAddress = data.digitalWalletAddress;
        if (walletQrCodeUrl) {
          updateData.walletQrCodeUrl = walletQrCodeUrl;
        }
      } else if (data.paymentMethod === "alipay") {
        updateData.alipayAccount = data.alipayAccount;
        updateData.alipayAccountName = data.alipayAccountName;
        if (alipayQrCodeUrl) {
          updateData.alipayQrCodeUrl = alipayQrCodeUrl;
        }
      } else if (data.paymentMethod === "wechat") {
        updateData.wechatAccountName = data.wechatAccountName;
        if (wechatQrCodeUrl) {
          updateData.wechatQrCodeUrl = wechatQrCodeUrl;
        }
      }

      // 更新或创建userProfiles表
      const [existing] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId));

      if (existing) {
        await db
          .update(userProfiles)
          .set(updateData)
          .where(eq(userProfiles.userId, userId));
      } else {
        await db.insert(userProfiles).values({
          userId,
          ...updateData,
        });
      }

      res.json({ 
        success: true,
        urls: {
          walletQrCodeUrl,
          alipayQrCodeUrl,
          wechatQrCodeUrl,
        }
      });
    } catch (error) {
      console.error("[更新支付账号] 错误:", error);
      res.status(500).json({ error: "服务器错误" });
    }
  }
);

// 添加收件地址
router.post("/profile/address", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { recipientName, phone, province, city, district, detailAddress, postalCode, label, isDefault } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 如果设置为默认地址，先取消其他默认地址
    if (isDefault) {
      await db
        .update(shippingAddresses)
        .set({ isDefault: false })
        .where(eq(shippingAddresses.userId, userId));
    }

    // 添加新地址
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

// 更新收件地址
router.put("/profile/address/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const addressId = parseInt(req.params.id);
    const { recipientName, phone, province, city, district, detailAddress, postalCode, label, isDefault } = req.body;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 如果设置为默认地址，先取消其他默认地址
    if (isDefault) {
      await db
        .update(shippingAddresses)
        .set({ isDefault: false })
        .where(eq(shippingAddresses.userId, userId));
    }

    // 更新地址
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

// 删除收件地址
router.delete("/profile/address/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const addressId = parseInt(req.params.id);

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }

    // 删除地址
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
