// 腾讯云生产数据库（硬编码后备，确保生产环境始终连接正确数据库）
const TENCENT_CLOUD_DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  // 主数据库（腾讯云）- 优先使用环境变量，后备使用硬编码腾讯云地址
  mainDatabaseUrl: process.env.ORIGINAL_DATABASE_URL ?? TENCENT_CLOUD_DB_URL,
  // 开发数据库（临时库）- 仅开发环境的账本使用
  devDatabaseUrl: process.env.DATABASE_URL ?? "",
  // 兼容旧代码
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  qichachaAppKey: process.env.QICHACHA_APP_KEY ?? "",
  qichachaSecretKey: process.env.QICHACHA_SECRET_KEY ?? "",
};

// 启动时调试日志
console.log('[ENV] 数据库配置检查:', {
  ORIGINAL_DATABASE_URL: process.env.ORIGINAL_DATABASE_URL ? '已设置' : '未设置（使用硬编码腾讯云地址）',
  mainDatabaseUrl: ENV.mainDatabaseUrl.replace(/\/\/.*:.*@/, '//***:***@'),
});
console.log('[ENV] DEEPSEEK_API_KEY 检查:', {
  defined: ENV.deepseekApiKey ? 'yes' : 'no',
  length: ENV.deepseekApiKey ? ENV.deepseekApiKey.length : 0,
  prefix: ENV.deepseekApiKey ? ENV.deepseekApiKey.substring(0, 10) : 'undefined',
});
