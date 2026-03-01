"use strict";
/**
 * 数据加密管理模块
 *
 * 提供加密配置的增删改查、数据迁移（加密/解密已有数据）等功能。
 */
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
exports.initEncryptionConfig = initEncryptionConfig;
exports.getEncryptionConfigList = getEncryptionConfigList;
exports.toggleFieldEncryption = toggleFieldEncryption;
exports.isEncryptionKeyConfigured = isEncryptionKeyConfigured;
exports.getEncryptionStats = getEncryptionStats;
var db_1 = require("./db");
var encryption_1 = require("./encryption");
/**
 * 初始化加密配置表（如果不存在则创建并填充默认数据）
 */
function initEncryptionConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, count, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 7, , 8]);
                    // 创建表
                    return [4 /*yield*/, db.execute("\n      CREATE TABLE IF NOT EXISTS encryption_config (\n        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,\n        table_name VARCHAR(100) NOT NULL,\n        field_name VARCHAR(100) NOT NULL,\n        field_label VARCHAR(100) NOT NULL,\n        field_group VARCHAR(50) NOT NULL,\n        is_enabled TINYINT DEFAULT 0 NOT NULL,\n        encrypted_at TIMESTAMP NULL,\n        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,\n        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,\n        INDEX idx_table_field (table_name, field_name)\n      )\n    ")];
                case 3:
                    // 创建表
                    _c.sent();
                    return [4 /*yield*/, db.execute("SELECT COUNT(*) as cnt FROM encryption_config")];
                case 4:
                    existing = _c.sent();
                    count = ((_b = (_a = existing === null || existing === void 0 ? void 0 : existing[0]) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.cnt) || 0;
                    if (!(count === 0)) return [3 /*break*/, 6];
                    // 插入默认配置
                    return [4 /*yield*/, db.execute("\n        INSERT INTO encryption_config (table_name, field_name, field_label, field_group, is_enabled) VALUES\n        ('contacts', 'name', '\u8054\u7CFB\u4EBA\u59D3\u540D', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contacts', 'phone', '\u624B\u673A\u53F7', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contacts', 'wechat', '\u5FAE\u4FE1\u53F7', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contacts', 'address', '\u5730\u5740', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contacts', 'occupation', '\u804C\u4E1A', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contacts', 'title', '\u5934\u8854', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contact_field_values', 'value', '\u81EA\u5B9A\u4E49\u5B57\u6BB5\u503C', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('contact_interactions', 'note', '\u4E92\u52A8\u5907\u6CE8', '\u8054\u7CFB\u4EBA\u6570\u636E', 0),\n        ('ledger_records', 'description', '\u8D26\u76EE\u5907\u6CE8', '\u8D26\u76EE\u6570\u636E', 0),\n        ('reimbursement_history', 'notes', '\u62A5\u9500\u5907\u6CE8', '\u8D26\u76EE\u6570\u636E', 0),\n        ('users', 'name', '\u7528\u6237\u6635\u79F0', '\u7528\u6237\u6570\u636E', 0),\n        ('users', 'email', '\u7528\u6237\u90AE\u7BB1', '\u7528\u6237\u6570\u636E', 0)\n      ")];
                case 5:
                    // 插入默认配置
                    _c.sent();
                    _c.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_1 = _c.sent();
                    console.error('初始化加密配置表失败:', error_1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有加密配置
 */
function getEncryptionConfigList() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rows, error_2, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 7]);
                    return [4 /*yield*/, db.execute("SELECT id, table_name as tableName, field_name as fieldName, field_label as fieldLabel, field_group as fieldGroup, is_enabled as isEnabled, encrypted_at as encryptedAt FROM encryption_config ORDER BY field_group, id")];
                case 3:
                    rows = _a.sent();
                    return [2 /*return*/, ((rows === null || rows === void 0 ? void 0 : rows[0]) || [])];
                case 4:
                    error_2 = _a.sent();
                    // 表不存在，先初始化
                    return [4 /*yield*/, initEncryptionConfig()];
                case 5:
                    // 表不存在，先初始化
                    _a.sent();
                    return [4 /*yield*/, db.execute("SELECT id, table_name as tableName, field_name as fieldName, field_label as fieldLabel, field_group as fieldGroup, is_enabled as isEnabled, encrypted_at as encryptedAt FROM encryption_config ORDER BY field_group, id")];
                case 6:
                    rows = _a.sent();
                    return [2 /*return*/, ((rows === null || rows === void 0 ? void 0 : rows[0]) || [])];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 切换某个字段的加密开关
 * 开启时：将该字段所有明文数据加密
 * 关闭时：将该字段所有密文数据解密还原
 */
function toggleFieldEncryption(configId, enable) {
    return __awaiter(this, void 0, void 0, function () {
        var db, keyHex, configRows, config, tableName, fieldName, processedCount, rows, dataRows, _i, dataRows_1, row, encrypted, rows, dataRows, _a, dataRows_2, row, decrypted, error_3;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/, { success: false, processedCount: 0, error: '数据库不可用' }];
                    keyHex = process.env.ENCRYPTION_KEY;
                    if (!keyHex || keyHex.length < 64) {
                        return [2 /*return*/, { success: false, processedCount: 0, error: '未配置加密密钥（ENCRYPTION_KEY），请联系系统管理员' }];
                    }
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 18, , 19]);
                    return [4 /*yield*/, db.execute("SELECT table_name, field_name FROM encryption_config WHERE id = ?", [configId])];
                case 3:
                    configRows = _c.sent();
                    config = (_b = configRows === null || configRows === void 0 ? void 0 : configRows[0]) === null || _b === void 0 ? void 0 : _b[0];
                    if (!config) {
                        return [2 /*return*/, { success: false, processedCount: 0, error: '配置项不存在' }];
                    }
                    tableName = config.table_name, fieldName = config.field_name;
                    processedCount = 0;
                    if (!enable) return [3 /*break*/, 10];
                    return [4 /*yield*/, db.execute("SELECT id, `".concat(fieldName, "` as val FROM `").concat(tableName, "` WHERE `").concat(fieldName, "` IS NOT NULL AND `").concat(fieldName, "` != ''"))];
                case 4:
                    rows = _c.sent();
                    dataRows = (rows === null || rows === void 0 ? void 0 : rows[0]) || [];
                    _i = 0, dataRows_1 = dataRows;
                    _c.label = 5;
                case 5:
                    if (!(_i < dataRows_1.length)) return [3 /*break*/, 8];
                    row = dataRows_1[_i];
                    if (!(row.val && !(0, encryption_1.isEncrypted)(row.val))) return [3 /*break*/, 7];
                    encrypted = (0, encryption_1.encryptValue)(row.val);
                    if (!(encrypted !== row.val)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db.execute("UPDATE `".concat(tableName, "` SET `").concat(fieldName, "` = ? WHERE id = ?"), [encrypted, row.id])];
                case 6:
                    _c.sent();
                    processedCount++;
                    _c.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: 
                // 更新配置状态
                return [4 /*yield*/, db.execute("UPDATE encryption_config SET is_enabled = 1, encrypted_at = NOW() WHERE id = ?", [configId])];
                case 9:
                    // 更新配置状态
                    _c.sent();
                    return [3 /*break*/, 17];
                case 10: return [4 /*yield*/, db.execute("SELECT id, `".concat(fieldName, "` as val FROM `").concat(tableName, "` WHERE `").concat(fieldName, "` IS NOT NULL AND `").concat(fieldName, "` LIKE 'enc:v1:%'"))];
                case 11:
                    rows = _c.sent();
                    dataRows = (rows === null || rows === void 0 ? void 0 : rows[0]) || [];
                    _a = 0, dataRows_2 = dataRows;
                    _c.label = 12;
                case 12:
                    if (!(_a < dataRows_2.length)) return [3 /*break*/, 15];
                    row = dataRows_2[_a];
                    if (!(row.val && (0, encryption_1.isEncrypted)(row.val))) return [3 /*break*/, 14];
                    decrypted = (0, encryption_1.decryptValue)(row.val);
                    if (!(decrypted !== row.val)) return [3 /*break*/, 14];
                    return [4 /*yield*/, db.execute("UPDATE `".concat(tableName, "` SET `").concat(fieldName, "` = ? WHERE id = ?"), [decrypted, row.id])];
                case 13:
                    _c.sent();
                    processedCount++;
                    _c.label = 14;
                case 14:
                    _a++;
                    return [3 /*break*/, 12];
                case 15: 
                // 更新配置状态
                return [4 /*yield*/, db.execute("UPDATE encryption_config SET is_enabled = 0, encrypted_at = NULL WHERE id = ?", [configId])];
                case 16:
                    // 更新配置状态
                    _c.sent();
                    _c.label = 17;
                case 17:
                    // 清除缓存
                    (0, encryption_1.clearEncryptionConfigCache)();
                    return [2 /*return*/, { success: true, processedCount: processedCount }];
                case 18:
                    error_3 = _c.sent();
                    console.error('切换加密状态失败:', error_3);
                    return [2 /*return*/, { success: false, processedCount: 0, error: error_3.message || '操作失败' }];
                case 19: return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查加密密钥是否已配置
 */
function isEncryptionKeyConfigured() {
    var keyHex = process.env.ENCRYPTION_KEY;
    return !!(keyHex && keyHex.length >= 64);
}
/**
 * 获取各字段的加密数据统计
 */
function getEncryptionStats() {
    return __awaiter(this, void 0, void 0, function () {
        var db, stats, configs, _i, configs_1, config, totalRows, encRows, total, encrypted, _a;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _f.sent();
                    if (!db)
                        return [2 /*return*/, {}];
                    stats = {};
                    return [4 /*yield*/, getEncryptionConfigList()];
                case 2:
                    configs = _f.sent();
                    _i = 0, configs_1 = configs;
                    _f.label = 3;
                case 3:
                    if (!(_i < configs_1.length)) return [3 /*break*/, 9];
                    config = configs_1[_i];
                    _f.label = 4;
                case 4:
                    _f.trys.push([4, 7, , 8]);
                    return [4 /*yield*/, db.execute("SELECT COUNT(*) as cnt FROM `".concat(config.tableName, "` WHERE `").concat(config.fieldName, "` IS NOT NULL AND `").concat(config.fieldName, "` != ''"))];
                case 5:
                    totalRows = _f.sent();
                    return [4 /*yield*/, db.execute("SELECT COUNT(*) as cnt FROM `".concat(config.tableName, "` WHERE `").concat(config.fieldName, "` LIKE 'enc:v1:%'"))];
                case 6:
                    encRows = _f.sent();
                    total = ((_c = (_b = totalRows === null || totalRows === void 0 ? void 0 : totalRows[0]) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.cnt) || 0;
                    encrypted = ((_e = (_d = encRows === null || encRows === void 0 ? void 0 : encRows[0]) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.cnt) || 0;
                    stats["".concat(config.tableName, ".").concat(config.fieldName)] = { total: total, encrypted: encrypted };
                    return [3 /*break*/, 8];
                case 7:
                    _a = _f.sent();
                    stats["".concat(config.tableName, ".").concat(config.fieldName)] = { total: 0, encrypted: 0 };
                    return [3 /*break*/, 8];
                case 8:
                    _i++;
                    return [3 /*break*/, 3];
                case 9: return [2 /*return*/, stats];
            }
        });
    });
}
