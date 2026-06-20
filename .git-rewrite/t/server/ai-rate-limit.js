"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.RATE_LIMITS = void 0;
exports.logAIOperation = logAIOperation;
exports.checkRateLimit = checkRateLimit;
exports.getUserOperationStats = getUserOperationStats;
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * AI操作速率限制配置
 *
 * 修改方法：
 * 1. 找到下面的 RATE_LIMITS 配置对象
 * 2. 修改对应操作的限制数值
 * 3. 重新构建并重启服务器
 */
exports.RATE_LIMITS = {
    // 添加人脉
    add_contact: {
        perMinute: 10, // 每分钟最多10次
        perHour: 50, // 每小时最多50次
        perDay: 200, // 每天最多200次
    },
    // 修改人脉
    update_contact: {
        perMinute: 20, // 每分钟最多20次
        perHour: 100, // 每小时最多100次
        perDay: 500, // 每天最多500次
    },
    // 删除人脉
    delete_contact: {
        perMinute: 5, // 每分钟最多5次（敏感操作）
        perHour: 20, // 每小时最多20次
        perDay: 50, // 每天最多50次
    },
    // 添加联络记录
    add_interaction: {
        perMinute: 15, // 每分钟最多15次
        perHour: 100, // 每小时最多100次
        perDay: 500, // 每天最多500次
    },
    // 标签操作
    tag_operation: {
        perMinute: 20, // 每分钟最多20次
        perHour: 100, // 每小时最多100次
        perDay: 500, // 每天最多500次
    },
    // 扩展字段操作
    field_operation: {
        perMinute: 20, // 每分钟最多20次
        perHour: 100, // 每小时最多100次
        perDay: 500, // 每天最多500次
    },
};
/**
 * 操作日志表结构（如果不存在则自动创建）
 */
function ensureLogTable() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    CREATE TABLE IF NOT EXISTS ai_operation_logs (\n      id INT PRIMARY KEY AUTO_INCREMENT,\n      user_id INT NOT NULL,\n      operation_type VARCHAR(50) NOT NULL,\n      details JSON,\n      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n      INDEX idx_user_operation (user_id, operation_type, created_at)\n    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n  "], ["\n    CREATE TABLE IF NOT EXISTS ai_operation_logs (\n      id INT PRIMARY KEY AUTO_INCREMENT,\n      user_id INT NOT NULL,\n      operation_type VARCHAR(50) NOT NULL,\n      details JSON,\n      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n      INDEX idx_user_operation (user_id, operation_type, created_at)\n    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n  "]))))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 记录操作日志
 */
function logAIOperation(userId_1, operationType_1) {
    return __awaiter(this, arguments, void 0, function (userId, operationType, details) {
        var db, error_1;
        if (details === void 0) { details = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, ensureLogTable()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n      INSERT INTO ai_operation_logs (user_id, operation_type, details)\n      VALUES (", ", ", ", ", ")\n    "], ["\n      INSERT INTO ai_operation_logs (user_id, operation_type, details)\n      VALUES (", ", ", ", ", ")\n    "])), userId, operationType, JSON.stringify(details)))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("[AI Rate Limit] 记录日志失败:", error_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取最近的操作次数
 */
function getRecentOperationCount(userId, operationType, seconds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, ensureLogTable()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _b.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n      SELECT COUNT(*) as count\n      FROM ai_operation_logs\n      WHERE user_id = ", "\n        AND operation_type = ", "\n        AND created_at > DATE_SUB(NOW(), INTERVAL ", " SECOND)\n    "], ["\n      SELECT COUNT(*) as count\n      FROM ai_operation_logs\n      WHERE user_id = ", "\n        AND operation_type = ", "\n        AND created_at > DATE_SUB(NOW(), INTERVAL ", " SECOND)\n    "])), userId, operationType, seconds))];
                case 3:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
                case 4:
                    error_2 = _b.sent();
                    console.error("[AI Rate Limit] 查询操作次数失败:", error_2);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查速率限制
 *
 * @param userId 用户ID
 * @param operationType 操作类型（如 'add_contact'）
 * @throws Error 如果超过限制
 */
function checkRateLimit(userId, operationType) {
    return __awaiter(this, void 0, void 0, function () {
        var limits, countPerMinute, countPerHour, countPerDay;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    limits = exports.RATE_LIMITS[operationType];
                    if (!limits) {
                        console.warn("[AI Rate Limit] \u672A\u5B9A\u4E49\u7684\u64CD\u4F5C\u7C7B\u578B: ".concat(operationType));
                        return [2 /*return*/];
                    }
                    if (!limits.perMinute) return [3 /*break*/, 2];
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 60)];
                case 1:
                    countPerMinute = _a.sent();
                    if (countPerMinute >= limits.perMinute) {
                        throw new Error("\u64CD\u4F5C\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002\u6BCF\u5206\u949F\u6700\u591A ".concat(limits.perMinute, " \u6B21\u3002"));
                    }
                    _a.label = 2;
                case 2:
                    if (!limits.perHour) return [3 /*break*/, 4];
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 3600)];
                case 3:
                    countPerHour = _a.sent();
                    if (countPerHour >= limits.perHour) {
                        throw new Error("\u64CD\u4F5C\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002\u6BCF\u5C0F\u65F6\u6700\u591A ".concat(limits.perHour, " \u6B21\u3002"));
                    }
                    _a.label = 4;
                case 4:
                    if (!limits.perDay) return [3 /*break*/, 6];
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 86400)];
                case 5:
                    countPerDay = _a.sent();
                    if (countPerDay >= limits.perDay) {
                        throw new Error("\u4ECA\u65E5\u64CD\u4F5C\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650\u3002\u6BCF\u5929\u6700\u591A ".concat(limits.perDay, " \u6B21\u3002"));
                    }
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户的操作统计
 */
function getUserOperationStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, stats, _i, _a, _b, operationType, limits, countPerMinute, countPerHour, countPerDay, error_3;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 9, , 10]);
                    return [4 /*yield*/, ensureLogTable()];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/, {}];
                    stats = {};
                    _i = 0, _a = Object.entries(exports.RATE_LIMITS);
                    _c.label = 3;
                case 3:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    _b = _a[_i], operationType = _b[0], limits = _b[1];
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 60)];
                case 4:
                    countPerMinute = _c.sent();
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 3600)];
                case 5:
                    countPerHour = _c.sent();
                    return [4 /*yield*/, getRecentOperationCount(userId, operationType, 86400)];
                case 6:
                    countPerDay = _c.sent();
                    stats[operationType] = {
                        perMinute: {
                            used: countPerMinute,
                            limit: limits.perMinute,
                            remaining: Math.max(0, limits.perMinute - countPerMinute),
                        },
                        perHour: {
                            used: countPerHour,
                            limit: limits.perHour,
                            remaining: Math.max(0, limits.perHour - countPerHour),
                        },
                        perDay: {
                            used: countPerDay,
                            limit: limits.perDay,
                            remaining: Math.max(0, limits.perDay - countPerDay),
                        },
                    };
                    _c.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 3];
                case 8: return [2 /*return*/, stats];
                case 9:
                    error_3 = _c.sent();
                    console.error("[AI Rate Limit] 获取统计失败:", error_3);
                    return [2 /*return*/, {}];
                case 10: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3;
