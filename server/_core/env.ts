export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
};

// 启动时调试日志
console.log('[ENV] DEEPSEEK_API_KEY 检查:', {
  defined: ENV.deepseekApiKey ? 'yes' : 'no',
  length: ENV.deepseekApiKey ? ENV.deepseekApiKey.length : 0,
  prefix: ENV.deepseekApiKey ? ENV.deepseekApiKey.substring(0, 10) : 'undefined',
});
