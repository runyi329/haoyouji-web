/**
 * 字段级AES-256-GCM加密模块
 * 
 * 使用AES-256-GCM算法对敏感字段进行加解密。
 * 密钥通过环境变量 ENCRYPTION_KEY 配置，仅服务器管理员可见。
 * 加密后的数据格式：enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_PREFIX = 'enc:v1:';

/**
 * 获取加密密钥（从环境变量中读取，取前32字节）
 */
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    return null;
  }
  return Buffer.from(keyHex.substring(0, 64), 'hex');
}

/**
 * 判断一个值是否已经被加密
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * 加密一个字符串值
 * 如果密钥未配置或值为空，返回原值
 */
export function encryptValue(plaintext: string): string {
  if (!plaintext || plaintext.trim() === '') return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // 已加密，不重复加密
  
  const key = getEncryptionKey();
  if (!key) return plaintext; // 密钥未配置，返回原值
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return plaintext;
  }
}

/**
 * 解密一个加密字符串
 * 如果值未加密或密钥未配置，返回原值
 */
export function decryptValue(ciphertext: string): string {
  if (!ciphertext || !isEncrypted(ciphertext)) return ciphertext;
  
  const key = getEncryptionKey();
  if (!key) return ciphertext; // 密钥未配置，返回密文
  
  try {
    const parts = ciphertext.substring(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) return ciphertext;
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return ciphertext; // 解密失败返回原值
  }
}

/**
 * 加密配置缓存（避免每次都查数据库）
 */
let encryptionConfigCache: Map<string, boolean> | null = null;
let configCacheTime = 0;
const CACHE_TTL = 60000; // 缓存60秒

/**
 * 获取加密配置（哪些字段启用了加密）
 * 返回 Map<fieldKey, isEnabled>
 * fieldKey 格式为 "tableName.fieldName"
 */
export async function getEncryptionConfig(db: any): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (encryptionConfigCache && (now - configCacheTime) < CACHE_TTL) {
    return encryptionConfigCache;
  }
  
  try {
    const rows = await db.execute(
      `SELECT table_name, field_name, is_enabled FROM encryption_config`
    );
    
    const config = new Map<string, boolean>();
    const resultRows = (rows as any)?.[0] || rows?.rows || rows;
    
    if (Array.isArray(resultRows)) {
      for (const row of resultRows) {
        const key = `${row.table_name}.${row.field_name}`;
        config.set(key, row.is_enabled === 1);
      }
    }
    
    encryptionConfigCache = config;
    configCacheTime = now;
    return config;
  } catch (error) {
    // 表可能不存在，返回空配置
    return new Map();
  }
}

/**
 * 清除加密配置缓存（在管理员修改配置后调用）
 */
export function clearEncryptionConfigCache() {
  encryptionConfigCache = null;
  configCacheTime = 0;
}

/**
 * 判断某个字段是否启用了加密
 */
export async function isFieldEncryptionEnabled(db: any, tableName: string, fieldName: string): Promise<boolean> {
  const config = await getEncryptionConfig(db);
  return config.get(`${tableName}.${fieldName}`) === true;
}

/**
 * 对一个对象的指定字段进行加密（写入数据库前调用）
 * @param db 数据库连接
 * @param tableName 表名
 * @param data 数据对象
 * @param fields 需要检查的字段列表
 */
export async function encryptFields(
  db: any,
  tableName: string,
  data: Record<string, any>,
  fields: string[]
): Promise<Record<string, any>> {
  const config = await getEncryptionConfig(db);
  const result = { ...data };
  
  for (const field of fields) {
    const key = `${tableName}.${field}`;
    if (config.get(key) === true && result[field] && typeof result[field] === 'string') {
      result[field] = encryptValue(result[field]);
    }
  }
  
  return result;
}

/**
 * 对一个对象的指定字段进行解密（从数据库读取后调用）
 * @param db 数据库连接
 * @param tableName 表名
 * @param data 数据对象
 * @param fields 需要检查的字段列表
 */
export async function decryptFields(
  db: any,
  tableName: string,
  data: Record<string, any>,
  fields: string[]
): Promise<Record<string, any>> {
  const result = { ...data };
  
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field])) {
      result[field] = decryptValue(result[field]);
    }
  }
  
  return result;
}

/**
 * 批量解密数组中每个对象的指定字段
 */
export async function decryptFieldsArray(
  db: any,
  tableName: string,
  dataArray: Record<string, any>[],
  fields: string[]
): Promise<Record<string, any>[]> {
  return Promise.all(dataArray.map(item => decryptFields(db, tableName, item, fields)));
}
