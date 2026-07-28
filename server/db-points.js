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
exports.getPointHistory = getPointHistory;
exports.getPointStats = getPointStats;
exports.getUserPoints = getUserPoints;
exports.deductPoints = deductPoints;
exports.rechargePoints = rechargePoints;
exports.calculateAICost = calculateAICost;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取用户的积分交易历史
 * @param userId 用户ID
 * @param limit 返回记录数量限制
 */
function getPointHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        var db;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.pointTransactions)
                            .where((0, drizzle_orm_1.eq)(schema_1.pointTransactions.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.pointTransactions.createdAt))
                            .limit(limit)];
            }
        });
    });
}
/**
 * 获取用户的积分统计数据
 * @param userId 用户ID
 */
function getPointStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, monthStart, monthEarnedResult, monthSpentResult, totalEarnedResult, totalSpentResult;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _e.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    now = new Date();
                    monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["COALESCE(SUM(", "), 0)"], ["COALESCE(SUM(", "), 0)"])), schema_1.pointTransactions.amount) })
                            .from(schema_1.pointTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointTransactions.userId, userId), (0, drizzle_orm_1.gte)(schema_1.pointTransactions.createdAt, monthStart), (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " > 0"], ["", " > 0"])), schema_1.pointTransactions.amount)))];
                case 2:
                    monthEarnedResult = _e.sent();
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["COALESCE(ABS(SUM(", ")), 0)"], ["COALESCE(ABS(SUM(", ")), 0)"])), schema_1.pointTransactions.amount) })
                            .from(schema_1.pointTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointTransactions.userId, userId), (0, drizzle_orm_1.gte)(schema_1.pointTransactions.createdAt, monthStart), (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " < 0"], ["", " < 0"])), schema_1.pointTransactions.amount)))];
                case 3:
                    monthSpentResult = _e.sent();
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["COALESCE(SUM(", "), 0)"], ["COALESCE(SUM(", "), 0)"])), schema_1.pointTransactions.amount) })
                            .from(schema_1.pointTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointTransactions.userId, userId), (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", " > 0"], ["", " > 0"])), schema_1.pointTransactions.amount)))];
                case 4:
                    totalEarnedResult = _e.sent();
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["COALESCE(ABS(SUM(", ")), 0)"], ["COALESCE(ABS(SUM(", ")), 0)"])), schema_1.pointTransactions.amount) })
                            .from(schema_1.pointTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointTransactions.userId, userId), (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " < 0"], ["", " < 0"])), schema_1.pointTransactions.amount)))];
                case 5:
                    totalSpentResult = _e.sent();
                    return [2 /*return*/, {
                            monthEarned: Number(((_a = monthEarnedResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0),
                            monthSpent: Number(((_b = monthSpentResult[0]) === null || _b === void 0 ? void 0 : _b.total) || 0),
                            totalEarned: Number(((_c = totalEarnedResult[0]) === null || _c === void 0 ? void 0 : _c.total) || 0),
                            totalSpent: Number(((_d = totalSpentResult[0]) === null || _d === void 0 ? void 0 : _d.total) || 0),
                        }];
            }
        });
    });
}
/**
 * 获取用户积分余额
 * @param userId 用户ID
 * @returns 积分余额
 */
function getUserPoints(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, user, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db) {
                        console.warn("Database not available, returning default points: 0");
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, db.execute("SELECT points FROM users WHERE id = ?", [userId])];
                case 2:
                    result = _b.sent();
                    user = Array.isArray(result) ? result[0] : (((_a = result.rows) === null || _a === void 0 ? void 0 : _a[0]) || null);
                    if (!user) {
                        console.warn("User ".concat(userId, " not found, returning default points: 0"));
                        return [2 /*return*/, 0];
                    }
                    return [2 /*return*/, Number(user.points) || 0];
                case 3:
                    error_1 = _b.sent();
                    console.error("Error getting user points:", error_1);
                    // 暂时返回0，等积分系统完善后再启用真实查询
                    return [2 /*return*/, 0];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扣除用户积分（用于AI消费）
 * @param userId 用户ID
 * @param amount 扣除金额（正数）
 * @param relatedType 关联类型（如'ai_message'）
 * @param relatedId 关联ID（如消息ID）
 * @param description 交易描述
 * @returns 扣除后的余额
 */
function deductPoints(userId_1, amount_1) {
    return __awaiter(this, arguments, void 0, function (userId, amount, relatedType, relatedId, description) {
        var db, currentBalance, newBalance, error_2;
        if (relatedType === void 0) { relatedType = "ai_message"; }
        if (relatedId === void 0) { relatedId = null; }
        if (description === void 0) { description = "AI对话消费"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    // 开始事务
                    return [4 /*yield*/, db.execute("START TRANSACTION")];
                case 2:
                    // 开始事务
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 8, , 10]);
                    return [4 /*yield*/, getUserPoints(userId)];
                case 4:
                    currentBalance = _a.sent();
                    if (currentBalance < amount) {
                        throw new Error("\u79EF\u5206\u4E0D\u8DB3\uFF0C\u5F53\u524D\u4F59\u989D\uFF1A".concat(currentBalance.toFixed(2), "\uFF0C\u9700\u8981\uFF1A").concat(amount.toFixed(2)));
                    }
                    // 扣除积分
                    return [4 /*yield*/, db.execute("UPDATE users SET points = points - ? WHERE id = ?", [amount, userId])];
                case 5:
                    // 扣除积分
                    _a.sent();
                    newBalance = currentBalance - amount;
                    // 记录交易
                    return [4 /*yield*/, db.execute("INSERT INTO points_transactions \n       (user_id, type, amount, balance_after, related_type, related_id, description) \n       VALUES (?, 'consume', ?, ?, ?, ?, ?)", [userId, -amount, newBalance, relatedType, relatedId, description])];
                case 6:
                    // 记录交易
                    _a.sent();
                    // 提交事务
                    return [4 /*yield*/, db.execute("COMMIT")];
                case 7:
                    // 提交事务
                    _a.sent();
                    console.log("[Points] Deducted ".concat(amount, " points from user ").concat(userId, ", new balance: ").concat(newBalance));
                    return [2 /*return*/, newBalance];
                case 8:
                    error_2 = _a.sent();
                    // 回滚事务
                    return [4 /*yield*/, db.execute("ROLLBACK")];
                case 9:
                    // 回滚事务
                    _a.sent();
                    throw error_2;
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * 充值用户积分
 * @param userId 用户ID
 * @param amount 充值金额（正数）
 * @param description 交易描述
 * @returns 充值后的余额
 */
function rechargePoints(userId_1, amount_1) {
    return __awaiter(this, arguments, void 0, function (userId, amount, description) {
        var db, newBalance, error_3;
        if (description === void 0) { description = "积分充值"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    // 开始事务
                    return [4 /*yield*/, db.execute("START TRANSACTION")];
                case 2:
                    // 开始事务
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 8, , 10]);
                    // 增加积分
                    return [4 /*yield*/, db.execute("UPDATE users SET points = points + ? WHERE id = ?", [amount, userId])];
                case 4:
                    // 增加积分
                    _a.sent();
                    return [4 /*yield*/, getUserPoints(userId)];
                case 5:
                    newBalance = _a.sent();
                    // 记录交易
                    return [4 /*yield*/, db.execute("INSERT INTO points_transactions \n       (user_id, type, amount, balance_after, description) \n       VALUES (?, 'recharge', ?, ?, ?)", [userId, amount, newBalance, description])];
                case 6:
                    // 记录交易
                    _a.sent();
                    // 提交事务
                    return [4 /*yield*/, db.execute("COMMIT")];
                case 7:
                    // 提交事务
                    _a.sent();
                    console.log("[Points] Recharged ".concat(amount, " points to user ").concat(userId, ", new balance: ").concat(newBalance));
                    return [2 /*return*/, newBalance];
                case 8:
                    error_3 = _a.sent();
                    // 回滚事务
                    return [4 /*yield*/, db.execute("ROLLBACK")];
                case 9:
                    // 回滚事务
                    _a.sent();
                    throw error_3;
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * 计算AI对话的费用
 * @param promptTokens 输入token数
 * @param completionTokens 输出token数
 * @returns 费用（积分）
 */
function calculateAICost(promptTokens, completionTokens) {
    // 计费规则：
    // 输入token: 0.001积分/1K tokens
    // 输出token: 0.002积分/1K tokens
    var inputCost = (promptTokens / 1000) * 0.001;
    var outputCost = (completionTokens / 1000) * 0.002;
    var totalCost = inputCost + outputCost;
    // 保留4位小数
    return Math.round(totalCost * 10000) / 10000;
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8;
