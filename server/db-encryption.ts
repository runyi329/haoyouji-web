/**
 * 数据加密管理模块
 * 
 * 提供加密配置的增删改查、数据迁移（加密/解密已有数据）等功能。
 */

import { getDb } from "./db";
import { encryptValue, decryptValue, isEncrypted, clearEncryptionConfigCache } from "./encryption";

/**
 * 加密配置项接口
 */
export interface EncryptionConfigItem {
  id: number;
  tableName: string;
  fieldName: string;
  fieldLabel: string;
  fieldGroup: string;
  isEnabled: number;
  encryptedAt: string | null;
}

/**
 * 初始化加密配置表（如果不存在则创建并填充默认数据）
 */
export async function initEncryptionConfig(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // 创建表
    await db.execute(`
      CREATE TABLE IF NOT EXISTS encryption_config (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        table_name VARCHAR(100) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        field_label VARCHAR(100) NOT NULL,
        field_group VARCHAR(50) NOT NULL,
        is_enabled TINYINT DEFAULT 0 NOT NULL,
        encrypted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_table_field (table_name, field_name)
      )
    `);

    // 检查是否已有数据
    const existing = await db.execute(`SELECT COUNT(*) as cnt FROM encryption_config`);
    const count = (existing as any)?.[0]?.[0]?.cnt || 0;
    
    if (count === 0) {
      // 插入默认配置
      await db.execute(`
        INSERT INTO encryption_config (table_name, field_name, field_label, field_group, is_enabled) VALUES
        ('contacts', 'name', '联系人姓名', '联系人数据', 0),
        ('contacts', 'phone', '手机号', '联系人数据', 0),
        ('contacts', 'wechat', '微信号', '联系人数据', 0),
        ('contacts', 'address', '地址', '联系人数据', 0),
        ('contacts', 'occupation', '职业', '联系人数据', 0),
        ('contacts', 'title', '头衔', '联系人数据', 0),
        ('contact_field_values', 'value', '自定义字段值', '联系人数据', 0),
        ('contact_interactions', 'note', '互动备注', '联系人数据', 0),
        ('ledger_records', 'description', '账目备注', '账目数据', 0),
        ('reimbursement_history', 'notes', '报销备注', '账目数据', 0),
        ('users', 'name', '用户昵称', '用户数据', 0),
        ('users', 'email', '用户邮箱', '用户数据', 0)
      `);
    }
  } catch (error) {
    console.error('初始化加密配置表失败:', error);
  }
}

/**
 * 获取所有加密配置
 */
export async function getEncryptionConfigList(): Promise<EncryptionConfigItem[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const rows = await db.execute(
      `SELECT id, table_name as tableName, field_name as fieldName, field_label as fieldLabel, field_group as fieldGroup, is_enabled as isEnabled, encrypted_at as encryptedAt FROM encryption_config ORDER BY field_group, id`
    );
    return ((rows as any)?.[0] || []) as EncryptionConfigItem[];
  } catch (error) {
    // 表不存在，先初始化
    await initEncryptionConfig();
    const rows = await db.execute(
      `SELECT id, table_name as tableName, field_name as fieldName, field_label as fieldLabel, field_group as fieldGroup, is_enabled as isEnabled, encrypted_at as encryptedAt FROM encryption_config ORDER BY field_group, id`
    );
    return ((rows as any)?.[0] || []) as EncryptionConfigItem[];
  }
}

/**
 * 切换某个字段的加密开关
 * 开启时：将该字段所有明文数据加密
 * 关闭时：将该字段所有密文数据解密还原
 */
export async function toggleFieldEncryption(
  configId: number,
  enable: boolean
): Promise<{ success: boolean; processedCount: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, processedCount: 0, error: '数据库不可用' };

  // 检查是否配置了加密密钥
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    return { success: false, processedCount: 0, error: '未配置加密密钥（ENCRYPTION_KEY），请联系系统管理员' };
  }

  try {
    // 获取配置项
    const configRows = await db.execute(
      `SELECT table_name, field_name FROM encryption_config WHERE id = ?`,
      [configId]
    );
    const config = (configRows as any)?.[0]?.[0];
    if (!config) {
      return { success: false, processedCount: 0, error: '配置项不存在' };
    }

    const { table_name: tableName, field_name: fieldName } = config;
    let processedCount = 0;

    if (enable) {
      // 开启加密：读取所有非空、未加密的数据，加密后写回
      const rows = await db.execute(
        `SELECT id, \`${fieldName}\` as val FROM \`${tableName}\` WHERE \`${fieldName}\` IS NOT NULL AND \`${fieldName}\` != ''`
      );
      const dataRows = (rows as any)?.[0] || [];
      
      for (const row of dataRows) {
        if (row.val && !isEncrypted(row.val)) {
          const encrypted = encryptValue(row.val);
          if (encrypted !== row.val) {
            await db.execute(
              `UPDATE \`${tableName}\` SET \`${fieldName}\` = ? WHERE id = ?`,
              [encrypted, row.id]
            );
            processedCount++;
          }
        }
      }

      // 更新配置状态
      await db.execute(
        `UPDATE encryption_config SET is_enabled = 1, encrypted_at = NOW() WHERE id = ?`,
        [configId]
      );
    } else {
      // 关闭加密：读取所有加密数据，解密后写回
      const rows = await db.execute(
        `SELECT id, \`${fieldName}\` as val FROM \`${tableName}\` WHERE \`${fieldName}\` IS NOT NULL AND \`${fieldName}\` LIKE 'enc:v1:%'`
      );
      const dataRows = (rows as any)?.[0] || [];
      
      for (const row of dataRows) {
        if (row.val && isEncrypted(row.val)) {
          const decrypted = decryptValue(row.val);
          if (decrypted !== row.val) {
            await db.execute(
              `UPDATE \`${tableName}\` SET \`${fieldName}\` = ? WHERE id = ?`,
              [decrypted, row.id]
            );
            processedCount++;
          }
        }
      }

      // 更新配置状态
      await db.execute(
        `UPDATE encryption_config SET is_enabled = 0, encrypted_at = NULL WHERE id = ?`,
        [configId]
      );
    }

    // 清除缓存
    clearEncryptionConfigCache();

    return { success: true, processedCount };
  } catch (error: any) {
    console.error('切换加密状态失败:', error);
    return { success: false, processedCount: 0, error: error.message || '操作失败' };
  }
}

/**
 * 检查加密密钥是否已配置
 */
export function isEncryptionKeyConfigured(): boolean {
  const keyHex = process.env.ENCRYPTION_KEY;
  return !!(keyHex && keyHex.length >= 64);
}

/**
 * 获取各字段的加密数据统计
 */
export async function getEncryptionStats(): Promise<Record<string, { total: number; encrypted: number }>> {
  const db = await getDb();
  if (!db) return {};

  const stats: Record<string, { total: number; encrypted: number }> = {};
  
  const configs = await getEncryptionConfigList();
  
  for (const config of configs) {
    try {
      const totalRows = await db.execute(
        `SELECT COUNT(*) as cnt FROM \`${config.tableName}\` WHERE \`${config.fieldName}\` IS NOT NULL AND \`${config.fieldName}\` != ''`
      );
      const encRows = await db.execute(
        `SELECT COUNT(*) as cnt FROM \`${config.tableName}\` WHERE \`${config.fieldName}\` LIKE 'enc:v1:%'`
      );
      
      const total = (totalRows as any)?.[0]?.[0]?.cnt || 0;
      const encrypted = (encRows as any)?.[0]?.[0]?.cnt || 0;
      
      stats[`${config.tableName}.${config.fieldName}`] = { total, encrypted };
    } catch {
      stats[`${config.tableName}.${config.fieldName}`] = { total: 0, encrypted: 0 };
    }
  }

  return stats;
}
