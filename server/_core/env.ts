export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  // 主数据库（腾讯云）- 用于人脉和生产环境的账本
  mainDatabaseUrl: process.env.ORIGINAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
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
console.log('[ENV] DEEPSEEK_API_KEY 检查:', {
  defined: ENV.deepseekApiKey ? 'yes' : 'no',
  length: ENV.deepseekApiKey ? ENV.deepseekApiKey.length : 0,
  prefix: ENV.deepseekApiKey ? ENV.deepseekApiKey.substring(0, 10) : 'undefined',
});
