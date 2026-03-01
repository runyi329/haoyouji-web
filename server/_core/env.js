"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
exports.ENV = {
    cookieSecret: (_a = process.env.JWT_SECRET) !== null && _a !== void 0 ? _a : "",
    // 主数据库（腾讯云）- 用于人脉和生产环境的账本
    mainDatabaseUrl: (_c = (_b = process.env.ORIGINAL_DATABASE_URL) !== null && _b !== void 0 ? _b : process.env.DATABASE_URL) !== null && _c !== void 0 ? _c : "",
    // 开发数据库（临时库）- 仅开发环境的账本使用
    devDatabaseUrl: (_d = process.env.DATABASE_URL) !== null && _d !== void 0 ? _d : "",
    // 兼容旧代码
    databaseUrl: (_e = process.env.DATABASE_URL) !== null && _e !== void 0 ? _e : "",
    ownerOpenId: (_f = process.env.OWNER_OPEN_ID) !== null && _f !== void 0 ? _f : "",
    isProduction: process.env.NODE_ENV === "production",
    forgeApiUrl: (_g = process.env.BUILT_IN_FORGE_API_URL) !== null && _g !== void 0 ? _g : "",
    forgeApiKey: (_h = process.env.BUILT_IN_FORGE_API_KEY) !== null && _h !== void 0 ? _h : "",
    deepseekApiKey: (_j = process.env.DEEPSEEK_API_KEY) !== null && _j !== void 0 ? _j : "",
    qichachaAppKey: (_k = process.env.QICHACHA_APP_KEY) !== null && _k !== void 0 ? _k : "",
    qichachaSecretKey: (_l = process.env.QICHACHA_SECRET_KEY) !== null && _l !== void 0 ? _l : "",
};
// 启动时调试日志
console.log('[ENV] DEEPSEEK_API_KEY 检查:', {
    defined: exports.ENV.deepseekApiKey ? 'yes' : 'no',
    length: exports.ENV.deepseekApiKey ? exports.ENV.deepseekApiKey.length : 0,
    prefix: exports.ENV.deepseekApiKey ? exports.ENV.deepseekApiKey.substring(0, 10) : 'undefined',
});
