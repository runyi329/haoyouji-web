"use strict";
/**
 * 字段级AES-256-GCM加密模块
 *
 * 使用AES-256-GCM算法对敏感字段进行加解密。
 * 密钥通过环境变量 ENCRYPTION_KEY 配置，仅服务器管理员可见。
 * 加密后的数据格式：enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEncrypted = isEncrypted;
exports.encryptValue = encryptValue;
exports.decryptValue = decryptValue;
exports.getEncryptionConfig = getEncryptionConfig;
exports.clearEncryptionConfigCache = clearEncryptionConfigCache;
exports.isFieldEncryptionEnabled = isFieldEncryptionEnabled;
exports.encryptFields = encryptFields;
exports.decryptFields = decryptFields;
exports.decryptFieldsArray = decryptFieldsArray;
var crypto_1 = require("crypto");
var ALGORITHM = 'aes-256-gcm';
var IV_LENGTH = 16;
var AUTH_TAG_LENGTH = 16;
var ENCRYPTION_PREFIX = 'enc:v1:';
/**
 * 获取加密密钥（从环境变量中读取，取前32字节）
 */
function getEncryptionKey() {
    var keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex || keyHex.length < 64) {
        return null;
    }
    return Buffer.from(keyHex.substring(0, 64), 'hex');
}
/**
 * 判断一个值是否已经被加密
 */
function isEncrypted(value) {
    return value.startsWith(ENCRYPTION_PREFIX);
}
/**
 * 加密一个字符串值
 * 如果密钥未配置或值为空，返回原值
 */
function encryptValue(plaintext) {
    if (!plaintext || plaintext.trim() === '')
        return plaintext;
    if (isEncrypted(plaintext))
        return plaintext; // 已加密，不重复加密
    var key = getEncryptionKey();
    if (!key)
        return plaintext; // 密钥未配置，返回原值
    try {
        var iv = crypto_1.default.randomBytes(IV_LENGTH);
        var cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        var encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        var authTag = cipher.getAuthTag().toString('hex');
        return "".concat(ENCRYPTION_PREFIX).concat(iv.toString('hex'), ":").concat(authTag, ":").concat(encrypted);
    }
    catch (error) {
        console.error('Encryption error:', error);
        return plaintext;
    }
}
/**
 * 解密一个加密字符串
 * 如果值未加密或密钥未配置，返回原值
 */
function decryptValue(ciphertext) {
    if (!ciphertext || !isEncrypted(ciphertext))
        return ciphertext;
    var key = getEncryptionKey();
    if (!key)
        return ciphertext; // 密钥未配置，返回密文
    try {
        var parts = ciphertext.substring(ENCRYPTION_PREFIX.length).split(':');
        if (parts.length !== 3)
            return ciphertext;
        var ivHex = parts[0], authTagHex = parts[1], encryptedHex = parts[2];
        var iv = Buffer.from(ivHex, 'hex');
        var authTag = Buffer.from(authTagHex, 'hex');
        var decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);
        var decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Decryption error:', error);
        return ciphertext; // 解密失败返回原值
    }
}
/**
 * 加密配置缓存（避免每次都查数据库）
 */
var encryptionConfigCache = null;
var configCacheTime = 0;
var CACHE_TTL = 60000; // 缓存60秒
/**
 * 获取加密配置（哪些字段启用了加密）
 * 返回 Map<fieldKey, isEnabled>
 * fieldKey 格式为 "tableName.fieldName"
 */
function getEncryptionConfig(dbConn) {
    return __awaiter(this, void 0, void 0, function () {
        var now, rows, config, resultRows, _i, resultRows_1, row, key, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    if (encryptionConfigCache && (now - configCacheTime) < CACHE_TTL) {
                        return [2 /*return*/, encryptionConfigCache];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    rows = void 0;
                    if (!dbConn.execute) return [3 /*break*/, 3];
                    return [4 /*yield*/, dbConn.execute("SELECT table_name, field_name, is_enabled FROM encryption_config")];
                case 2:
                    // mysql2 连接
                    rows = _a.sent();
                    return [3 /*break*/, 4];
                case 3: 
                // drizzle 连接，这里不会进入，因为 getDb() 返回的是 mysql2 连接
                // 但为了安全，这里返回空配置
                return [2 /*return*/, new Map()];
                case 4:
                    config = new Map();
                    resultRows = (rows === null || rows === void 0 ? void 0 : rows[0]) || (rows === null || rows === void 0 ? void 0 : rows.rows) || rows;
                    if (Array.isArray(resultRows)) {
                        for (_i = 0, resultRows_1 = resultRows; _i < resultRows_1.length; _i++) {
                            row = resultRows_1[_i];
                            key = "".concat(row.table_name, ".").concat(row.field_name);
                            config.set(key, row.is_enabled === 1);
                        }
                    }
                    encryptionConfigCache = config;
                    configCacheTime = now;
                    return [2 /*return*/, config];
                case 5:
                    error_1 = _a.sent();
                    // 表可能不存在，返回空配置
                    return [2 /*return*/, new Map()];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 清除加密配置缓存（在管理员修改配置后调用）
 */
function clearEncryptionConfigCache() {
    encryptionConfigCache = null;
    configCacheTime = 0;
}
/**
 * 判断某个字段是否启用了加密
 */
function isFieldEncryptionEnabled(db, tableName, fieldName) {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getEncryptionConfig(db)];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, config.get("".concat(tableName, ".").concat(fieldName)) === true];
            }
        });
    });
}
/**
 * 对一个对象的指定字段进行加密（写入数据库前调用）
 * @param db 数据库连接（drizzle 对象）
 * @param tableName 表名
 * @param data 数据对象
 * @param fields 需要检查的字段列表
 */
function encryptFields(db, tableName, data, fields) {
    return __awaiter(this, void 0, void 0, function () {
        var getDbConnection, conn, config, result, _i, fields_1, field, key;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db'); })];
                case 1:
                    getDbConnection = (_a.sent()).getDbConnection;
                    return [4 /*yield*/, getDbConnection()];
                case 2:
                    conn = _a.sent();
                    if (!conn) {
                        return [2 /*return*/, data]; // 连接不可用，返回原数据
                    }
                    return [4 /*yield*/, getEncryptionConfig(conn)];
                case 3:
                    config = _a.sent();
                    result = __assign({}, data);
                    for (_i = 0, fields_1 = fields; _i < fields_1.length; _i++) {
                        field = fields_1[_i];
                        key = "".concat(tableName, ".").concat(field);
                        if (config.get(key) === true && result[field] && typeof result[field] === 'string') {
                            result[field] = encryptValue(result[field]);
                        }
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 对一个对象的指定字段进行解密（从数据库读取后调用）
 * @param db 数据库连接
 * @param tableName 表名
 * @param data 数据对象
 * @param fields 需要检查的字段列表
 */
function decryptFields(db, tableName, data, fields) {
    return __awaiter(this, void 0, void 0, function () {
        var result, _i, fields_2, field;
        return __generator(this, function (_a) {
            result = __assign({}, data);
            for (_i = 0, fields_2 = fields; _i < fields_2.length; _i++) {
                field = fields_2[_i];
                if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field])) {
                    result[field] = decryptValue(result[field]);
                }
            }
            return [2 /*return*/, result];
        });
    });
}
/**
 * 批量解密数组中每个对象的指定字段
 */
function decryptFieldsArray(db, tableName, dataArray, fields) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, Promise.all(dataArray.map(function (item) { return decryptFields(db, tableName, item, fields); }))];
        });
    });
}
