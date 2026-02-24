import { getDb } from "./db";
import { bankCards, digitalWallets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ==================== 银行卡管理函数 ====================

/**
 * 获取用户的银行卡列表
 */
export async function getUserBankCards(userId: string) {
  try {
    const db = await getDb();
    const cards = await db
      .select()
      .from(bankCards)
      .where(eq(bankCards.userId, userId));
    
    return cards;
  } catch (error) {
    console.error("获取银行卡列表失败:", error);
    throw error;
  }
}

/**
 * 添加银行卡
 */
export async function addBankCard(data: {
  userId: string;
  cardNumber: string;
  cardHolder: string;
  bankName: string;
  cardType: 'debit' | 'credit';
  isDefault?: boolean;
  notes?: string;
}) {
  try {
    const db = await getDb();
    const id = uuidv4();
    
    // 如果设置为默认卡，先取消其他卡的默认状态
    if (data.isDefault) {
      await db
        .update(bankCards)
        .set({ isDefault: 0 })
        .where(eq(bankCards.userId, data.userId));
    }
    
    await db.insert(bankCards).values({
      id,
      userId: data.userId,
      cardNumber: data.cardNumber,
      cardHolder: data.cardHolder,
      bankName: data.bankName,
      cardType: data.cardType,
      isDefault: data.isDefault ? 1 : 0,
      notes: data.notes || null,
    });
    
    return { id };
  } catch (error) {
    console.error("添加银行卡失败:", error);
    throw error;
  }
}

/**
 * 更新银行卡
 */
export async function updateBankCard(
  cardId: string,
  userId: string,
  data: {
    cardNumber?: string;
    cardHolder?: string;
    bankName?: string;
    cardType?: 'debit' | 'credit';
    notes?: string;
  }
) {
  try {
    const db = await getDb();
    await db
      .update(bankCards)
      .set(data)
      .where(and(eq(bankCards.id, cardId), eq(bankCards.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("更新银行卡失败:", error);
    throw error;
  }
}

/**
 * 删除银行卡
 */
export async function deleteBankCard(cardId: string, userId: string) {
  try {
    const db = await getDb();
    await db
      .delete(bankCards)
      .where(and(eq(bankCards.id, cardId), eq(bankCards.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("删除银行卡失败:", error);
    throw error;
  }
}

/**
 * 设置默认银行卡
 */
export async function setDefaultBankCard(cardId: string, userId: string) {
  try {
    const db = await getDb();
    
    // 先取消所有卡的默认状态
    await db
      .update(bankCards)
      .set({ isDefault: 0 })
      .where(eq(bankCards.userId, userId));
    
    // 设置指定卡为默认
    await db
      .update(bankCards)
      .set({ isDefault: 1 })
      .where(and(eq(bankCards.id, cardId), eq(bankCards.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("设置默认银行卡失败:", error);
    throw error;
  }
}

// ==================== 数字钱包管理函数 ====================

/**
 * 获取用户的数字钱包列表
 */
export async function getUserDigitalWallets(userId: string) {
  try {
    const db = await getDb();
    const wallets = await db
      .select()
      .from(digitalWallets)
      .where(eq(digitalWallets.userId, userId));
    
    return wallets;
  } catch (error) {
    console.error("获取数字钱包列表失败:", error);
    throw error;
  }
}

/**
 * 添加数字钱包
 */
export async function addDigitalWallet(data: {
  userId: string;
  walletType: 'blockchain' | 'alipay' | 'wechat' | 'other';
  // 区块链钱包字段
  network?: string;
  walletAddress?: string;
  currency?: string;
  // 支付宝/微信字段
  account?: string;
  accountName?: string;
  isDefault?: boolean;
  notes?: string;
}) {
  try {
    const db = await getDb();
    const id = uuidv4();
    
    // 如果设置为默认钱包，先取消其他钱包的默认状态
    if (data.isDefault) {
      await db
        .update(digitalWallets)
        .set({ isDefault: 0 })
        .where(eq(digitalWallets.userId, data.userId));
    }
    
    await db.insert(digitalWallets).values({
      id,
      userId: data.userId,
      walletType: data.walletType,
      network: data.network || null,
      walletAddress: data.walletAddress || null,
      currency: data.currency || null,
      account: data.account || null,
      accountName: data.accountName || null,
      isDefault: data.isDefault ? 1 : 0,
      notes: data.notes || null,
    });
    
    return { id };
  } catch (error) {
    console.error("添加数字钱包失败:", error);
    throw error;
  }
}

/**
 * 更新数字钱包
 */
export async function updateDigitalWallet(
  walletId: string,
  userId: string,
  data: {
    walletType?: 'blockchain' | 'alipay' | 'wechat' | 'other';
    network?: string;
    walletAddress?: string;
    currency?: string;
    account?: string;
    accountName?: string;
    notes?: string;
  }
) {
  try {
    const db = await getDb();
    await db
      .update(digitalWallets)
      .set(data)
      .where(and(eq(digitalWallets.id, walletId), eq(digitalWallets.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("更新数字钱包失败:", error);
    throw error;
  }
}

/**
 * 删除数字钱包
 */
export async function deleteDigitalWallet(walletId: string, userId: string) {
  try {
    const db = await getDb();
    await db
      .delete(digitalWallets)
      .where(and(eq(digitalWallets.id, walletId), eq(digitalWallets.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("删除数字钱包失败:", error);
    throw error;
  }
}

/**
 * 设置默认数字钱包
 */
export async function setDefaultDigitalWallet(walletId: string, userId: string) {
  try {
    const db = await getDb();
    
    // 先取消所有钱包的默认状态
    await db
      .update(digitalWallets)
      .set({ isDefault: 0 })
      .where(eq(digitalWallets.userId, userId));
    
    // 设置指定钱包为默认
    await db
      .update(digitalWallets)
      .set({ isDefault: 1 })
      .where(and(eq(digitalWallets.id, walletId), eq(digitalWallets.userId, userId)));
    
    return { success: true };
  } catch (error) {
    console.error("设置默认数字钱包失败:", error);
    throw error;
  }
}
