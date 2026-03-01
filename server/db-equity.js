"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEquityRules = getEquityRules;
exports.updateEquityRule = updateEquityRule;
exports.upsertEquityRule = upsertEquityRule;
exports.deleteEquityRule = deleteEquityRule;
exports.getEquityRulesDetail = getEquityRulesDetail;
exports.getAllInvestments = getAllInvestments;
exports.getUserInvestments = getUserInvestments;
exports.addInvestment = addInvestment;
exports.updateInvestment = updateInvestment;
exports.deleteInvestment = deleteInvestment;
exports.getUserSeatNumber = getUserSeatNumber;
exports.getAllSeatNumbers = getAllSeatNumbers;
exports.calculateDynamicLeverage = calculateDynamicLeverage;
exports.calculateUserEquity = calculateUserEquity;
exports.getAllShareholdersEquity = getAllShareholdersEquity;
exports.getValuationHistory = getValuationHistory;
exports.getShareholderRanking = getShareholderRanking;
exports.getPoolStatus = getPoolStatus;
exports.getRecentActivities = getRecentActivities;
exports.recordActivity = recordActivity;
exports.getUserPromotionStats = getUserPromotionStats;
exports.getMyInvitedUsersStats = getMyInvitedUsersStats;
exports.getUserWeeklyReports = getUserWeeklyReports;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取股权规则配置
 */
function getEquityRules() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rules, rulesMap, _i, rules_1, rule;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.equityRules)];
                case 2:
                    rules = _a.sent();
                    rulesMap = {};
                    for (_i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
                        rule = rules_1[_i];
                        rulesMap[rule.ruleKey] = Number(rule.ruleValue);
                    }
                    return [2 /*return*/, rulesMap];
            }
        });
    });
}
/**
 * 更新股权规则
 */
function updateEquityRule(ruleKey, ruleValue) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.equityRules)
                            .set({ ruleValue: ruleValue.toString() })
                            .where((0, drizzle_orm_1.eq)(schema_1.equityRules.ruleKey, ruleKey))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 插入或更新股权规则（upsert）
 * 使用drizzle ORM的insert + onDuplicateKeyUpdate确保可靠性
 */
function upsertEquityRule(ruleKey, ruleValue, ruleDescription) {
    return __awaiter(this, void 0, void 0, function () {
        var db, desc, valStr, existing, verify, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    desc = ruleDescription || ruleKey;
                    valStr = Number(ruleValue).toFixed(4);
                    console.log("[upsertEquityRule] key=".concat(ruleKey, ", value=").concat(valStr, ", desc=").concat(desc));
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 9, , 10]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.equityRules)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityRules.ruleKey, ruleKey))];
                case 3:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 5];
                    console.log("[upsertEquityRule] Updating existing rule: ".concat(ruleKey));
                    return [4 /*yield*/, db
                            .update(schema_1.equityRules)
                            .set({
                            ruleValue: valStr,
                            ruleDescription: desc,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.equityRules.ruleKey, ruleKey))];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5:
                    console.log("[upsertEquityRule] Inserting new rule: ".concat(ruleKey));
                    return [4 /*yield*/, db
                            .insert(schema_1.equityRules)
                            .values({
                            ruleKey: ruleKey,
                            ruleValue: valStr,
                            ruleDescription: desc,
                        })];
                case 6:
                    _a.sent();
                    console.log("[upsertEquityRule] Insert completed for: ".concat(ruleKey));
                    _a.label = 7;
                case 7: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.equityRules)
                        .where((0, drizzle_orm_1.eq)(schema_1.equityRules.ruleKey, ruleKey))];
                case 8:
                    verify = _a.sent();
                    console.log("[upsertEquityRule] Verify result for ".concat(ruleKey, ":"), verify.length > 0 ? 'EXISTS' : 'NOT FOUND');
                    return [2 /*return*/, { success: true }];
                case 9:
                    error_1 = _a.sent();
                    console.error("[upsertEquityRule] Error for ".concat(ruleKey, ":"), error_1.message);
                    throw error_1;
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除股权规则
 */
function deleteEquityRule(ruleKey) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .delete(schema_1.equityRules)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityRules.ruleKey, ruleKey))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取所有规则详情（包含描述）
 */
function getEquityRulesDetail() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rules;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.equityRules)];
                case 2:
                    rules = _a.sent();
                    return [2 /*return*/, rules.map(function (r) { return ({
                            ruleKey: r.ruleKey,
                            ruleValue: Number(r.ruleValue),
                            ruleDescription: r.ruleDescription,
                        }); })];
            }
        });
    });
}
/**
 * 获取所有投资记录
 */
function getAllInvestments() {
    return __awaiter(this, void 0, void 0, function () {
        var db, investments;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.equityInvestments.id,
                            userId: schema_1.equityInvestments.userId,
                            userName: schema_1.users.name,
                            username: schema_1.users.username,
                            investorName: schema_1.equityInvestments.investorName,
                            investorIdCard: schema_1.equityInvestments.investorIdCard,
                            investmentAmount: schema_1.equityInvestments.investmentAmount,
                            investmentDate: schema_1.equityInvestments.investmentDate,
                            notes: schema_1.equityInvestments.notes,
                        })
                            .from(schema_1.equityInvestments)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.equityInvestments.userId, schema_1.users.id))
                            .orderBy(schema_1.equityInvestments.investmentDate)];
                case 2:
                    investments = _a.sent();
                    return [2 /*return*/, investments];
            }
        });
    });
}
/**
 * 获取用户的投资记录
 */
function getUserInvestments(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, investments;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.equityInvestments)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityInvestments.userId, userId))
                            .orderBy(schema_1.equityInvestments.investmentDate)];
                case 2:
                    investments = _a.sent();
                    return [2 /*return*/, investments];
            }
        });
    });
}
/**
 * 添加投资记录
 */
function addInvestment(userId, investorName, investorIdCard, amount, investmentDate, notes) {
    return __awaiter(this, void 0, void 0, function () {
        var db, dateStr, now, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!amount)
                        throw new Error("Investment amount is required");
                    if (investmentDate) {
                        // 前端传入的是 YYYY-MM-DD 格式，补上时间部分
                        dateStr = "".concat(investmentDate, " 00:00:00");
                    }
                    else {
                        now = new Date();
                        dateStr = "".concat(now.getFullYear(), "-").concat(String(now.getMonth() + 1).padStart(2, '0'), "-").concat(String(now.getDate()).padStart(2, '0'), " ").concat(String(now.getHours()).padStart(2, '0'), ":").concat(String(now.getMinutes()).padStart(2, '0'), ":").concat(String(now.getSeconds()).padStart(2, '0'));
                    }
                    return [4 /*yield*/, db
                            .insert(schema_1.equityInvestments)
                            .values({
                            userId: userId,
                            investorName: investorName || null,
                            investorIdCard: investorIdCard || null,
                            investmentAmount: amount.toFixed(2),
                            investmentDate: dateStr,
                            notes: notes || null,
                        })];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, { success: true, id: result.insertId }];
            }
        });
    });
}
/**
 * 更新投资记录
 */
function updateInvestment(id, amount, investorName, investorIdCard, investmentDate, notes) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    updateData = {
                        investmentAmount: amount.toString(),
                        notes: notes || null,
                        investorName: investorName || null,
                        investorIdCard: investorIdCard || null,
                    };
                    if (investmentDate) {
                        updateData.investmentDate = "".concat(investmentDate, " 00:00:00");
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.equityInvestments)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityInvestments.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 删除投资记录
 */
function deleteInvestment(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .delete(schema_1.equityInvestments)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityInvestments.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取用户的席位编号（按首笔投资时间排序）
 * 每个用户只取第一笔投资的时间来排序
 */
function getUserSeatNumber(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, firstInvestments, rawRows, rows, seatIndex;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at\n    FROM equity_investments\n    GROUP BY user_id\n    ORDER BY first_investment_date ASC, first_created_at ASC\n  "], ["\n    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at\n    FROM equity_investments\n    GROUP BY user_id\n    ORDER BY first_investment_date ASC, first_created_at ASC\n  "]))))];
                case 2:
                    firstInvestments = _a.sent();
                    rawRows = Array.isArray(firstInvestments)
                        ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
                        : (firstInvestments.rows || []);
                    rows = rawRows;
                    seatIndex = rows.findIndex(function (r) { return Number(r.user_id) === userId; });
                    if (seatIndex === -1) {
                        return [2 /*return*/, { seatNumber: 0, totalSeats: rows.length }];
                    }
                    return [2 /*return*/, {
                            seatNumber: seatIndex + 1, // 1-based
                            totalSeats: rows.length,
                        }];
            }
        });
    });
}
/**
 * 获取所有用户的席位编号映射（按首笔投资时间排序）
 */
function getAllSeatNumbers() {
    return __awaiter(this, void 0, void 0, function () {
        var db, firstInvestments, rawRows, rows, seatMap;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at\n    FROM equity_investments\n    GROUP BY user_id\n    ORDER BY first_investment_date ASC, first_created_at ASC\n  "], ["\n    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at\n    FROM equity_investments\n    GROUP BY user_id\n    ORDER BY first_investment_date ASC, first_created_at ASC\n  "]))))];
                case 2:
                    firstInvestments = _a.sent();
                    rawRows = Array.isArray(firstInvestments)
                        ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
                        : (firstInvestments.rows || []);
                    rows = rawRows;
                    seatMap = new Map();
                    rows.forEach(function (row, index) {
                        seatMap.set(Number(row.user_id), index + 1);
                    });
                    return [2 /*return*/, seatMap];
            }
        });
    });
}
/**
 * 计算动态杠杆系数（资本加速系数）
 * 基于席位编号，越早进入系数越高
 * 新公式：1.0 + 2.0 × √((660 - seatNumber) / 659)
 * 第1名：3.0x，第660名：1.0x
 */
function calculateDynamicLeverage(seatNumber, totalSeats) {
    // 新公式：曲线衰减，从 3.0 到 1.0
    var leverage;
    if (seatNumber < 1) {
        leverage = 0.0; // 没有编号
    }
    else if (seatNumber > 660) {
        leverage = 1.0; // 超过660名
    }
    else {
        // 公式：1.0 + 2.0 × √((660 - seatNumber) / 659)
        leverage = 1.0 + 2.0 * Math.sqrt((660 - seatNumber) / 659);
    }
    return {
        leverage: Number(leverage.toFixed(4)),
        seatNumber: seatNumber,
        totalSeats: totalSeats,
        // 保留这些字段以保持API兼容性，但不再使用波次逻辑
        currentRound: null,
        nextRound: null,
        nextRoundLeverage: null,
        hesitationCost: null,
    };
}
/**
 * 计算用户的股权信息
 */
function calculateUserEquity(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, rules, investmentPoolPercentage, invitePerUserPercentage, referralNetworkPer100Percentage, totalInvestmentResult, totalInvestment, userInvestmentResult, userInvestment, investmentEquity, inviteCount, inviteEquity, referralNetworkCount, referralNetworkEquity, user, invitedUsers, invitedUserIds, networkResult, seatInfo, seatNumber, leverageInfo, originalAcceleration, investmentInWan, actualAcceleration, promotionStats, hasInvestment, resourceAcceleration, totalEquity;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getEquityRules()];
                case 2:
                    rules = _a.sent();
                    investmentPoolPercentage = rules['investment_pool_percentage'] || 33.3333;
                    invitePerUserPercentage = rules['invite_per_user_percentage'] || 0.05;
                    referralNetworkPer100Percentage = rules['referral_network_per_100_percentage'] || 0.02;
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sum)(schema_1.equityInvestments.investmentAmount) })
                            .from(schema_1.equityInvestments)];
                case 3:
                    totalInvestmentResult = (_a.sent())[0];
                    totalInvestment = Number((totalInvestmentResult === null || totalInvestmentResult === void 0 ? void 0 : totalInvestmentResult.total) || 0);
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sum)(schema_1.equityInvestments.investmentAmount) })
                            .from(schema_1.equityInvestments)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityInvestments.userId, userId))];
                case 4:
                    userInvestmentResult = (_a.sent())[0];
                    userInvestment = Number((userInvestmentResult === null || userInvestmentResult === void 0 ? void 0 : userInvestmentResult.total) || 0);
                    investmentEquity = 0;
                    if (totalInvestment > 0 && userInvestment > 0) {
                        investmentEquity = (userInvestment / totalInvestment) * investmentPoolPercentage;
                    }
                    inviteCount = 0;
                    inviteEquity = 0;
                    referralNetworkCount = 0;
                    referralNetworkEquity = 0;
                    if (!(userInvestment > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ inviteCount: schema_1.users.inviteCount })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 5:
                    user = (_a.sent())[0];
                    inviteCount = (user === null || user === void 0 ? void 0 : user.inviteCount) || 0;
                    inviteEquity = inviteCount * invitePerUserPercentage;
                    return [4 /*yield*/, db
                            .select({ id: schema_1.users.id })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.invitedByUserId, userId))];
                case 6:
                    invitedUsers = _a.sent();
                    invitedUserIds = invitedUsers.map(function (u) { return u.id; });
                    if (!(invitedUserIds.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, invitedUserIds))];
                case 7:
                    networkResult = (_a.sent())[0];
                    referralNetworkCount = Number((networkResult === null || networkResult === void 0 ? void 0 : networkResult.count) || 0);
                    _a.label = 8;
                case 8:
                    referralNetworkEquity = Math.floor(referralNetworkCount / 100) * referralNetworkPer100Percentage;
                    _a.label = 9;
                case 9: return [4 /*yield*/, getUserSeatNumber(userId)];
                case 10:
                    seatInfo = _a.sent();
                    seatNumber = seatInfo.seatNumber;
                    leverageInfo = calculateDynamicLeverage(seatNumber, 660);
                    originalAcceleration = leverageInfo.leverage;
                    investmentInWan = userInvestment / 10000;
                    actualAcceleration = 0;
                    if (investmentInWan > 0) {
                        if (investmentInWan >= 10) {
                            // 投资额 >= 10万：实际加速 = 原始加速
                            actualAcceleration = originalAcceleration;
                        }
                        else {
                            // 投资额 < 10万：实际加速 = 原始加速 × (投资万数 / 10)
                            actualAcceleration = originalAcceleration * (investmentInWan / 10);
                        }
                    }
                    return [4 /*yield*/, getUserPromotionStats(userId)];
                case 11:
                    promotionStats = _a.sent();
                    hasInvestment = userInvestment > 0;
                    resourceAcceleration = 1.0;
                    if (promotionStats.currentLevel === 'standard' || promotionStats.currentLevel === 'standard_user') {
                        resourceAcceleration = 1.0;
                    }
                    else if (promotionStats.currentLevel === 'advanced' || promotionStats.currentLevel === 'advanced_user') {
                        resourceAcceleration = 2.0;
                    }
                    else if (promotionStats.currentLevel === 'super' || promotionStats.currentLevel === 'super_user') {
                        resourceAcceleration = 3.0;
                    }
                    totalEquity = investmentEquity + inviteEquity + referralNetworkEquity;
                    return [2 /*return*/, {
                            totalEquity: Number(totalEquity.toFixed(4)),
                            investmentEquity: Number(investmentEquity.toFixed(4)),
                            inviteEquity: Number(inviteEquity.toFixed(4)),
                            referralNetworkEquity: Number(referralNetworkEquity.toFixed(4)),
                            capitalAccelerationDetail: {
                                originalAcceleration: Number(originalAcceleration.toFixed(4)),
                                investmentAmount: userInvestment,
                                actualAcceleration: Number(actualAcceleration.toFixed(4)),
                                seatNumber: seatNumber,
                            },
                            resourceAccelerationDetail: {
                                contactCount: promotionStats.contactCount,
                                tagCount: promotionStats.tagCount,
                                interactionCount: promotionStats.interactionCount,
                                currentLevel: promotionStats.currentLevel,
                                levelName: promotionStats.levelName,
                                hasInvestment: hasInvestment,
                                resourceAcceleration: Number(resourceAcceleration.toFixed(4)),
                            },
                            details: {
                                userInvestment: userInvestment,
                                totalInvestment: totalInvestment,
                                inviteCount: inviteCount,
                                referralNetworkCount: referralNetworkCount,
                            },
                        }];
            }
        });
    });
}
/**
 * 获取所有股东的股权信息
 */
function getAllShareholdersEquity() {
    return __awaiter(this, void 0, void 0, function () {
        var db, investors, shareholdersEquity, _i, investors_1, investor, equity;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.equityInvestments.userId,
                            userName: schema_1.users.name,
                            username: schema_1.users.username,
                        })
                            .from(schema_1.equityInvestments)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.equityInvestments.userId, schema_1.users.id))
                            .groupBy(schema_1.equityInvestments.userId, schema_1.users.name, schema_1.users.username)];
                case 2:
                    investors = _a.sent();
                    shareholdersEquity = [];
                    _i = 0, investors_1 = investors;
                    _a.label = 3;
                case 3:
                    if (!(_i < investors_1.length)) return [3 /*break*/, 6];
                    investor = investors_1[_i];
                    if (!investor.userId)
                        return [3 /*break*/, 5];
                    return [4 /*yield*/, calculateUserEquity(investor.userId)];
                case 4:
                    equity = _a.sent();
                    shareholdersEquity.push(__assign({ userId: investor.userId, userName: investor.userName || investor.username || '未知' }, equity));
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    // 按总股份降序排序
                    shareholdersEquity.sort(function (a, b) { return b.totalEquity - a.totalEquity; });
                    return [2 /*return*/, shareholdersEquity];
            }
        });
    });
}
/**
 * 获取估值历史
 */
function getValuationHistory() {
    return __awaiter(this, void 0, void 0, function () {
        var db, history;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n    SELECT valuation, record_date as recordDate\n    FROM equity_valuation_history\n    ORDER BY record_date ASC\n  "], ["\n    SELECT valuation, record_date as recordDate\n    FROM equity_valuation_history\n    ORDER BY record_date ASC\n  "]))))];
                case 2:
                    history = _a.sent();
                    return [2 /*return*/, history.rows];
            }
        });
    });
}
/**
 * 获取股东排名信息
 */
function getShareholderRanking(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allShareholders, sorted, userIndex, gapToNext;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllShareholdersEquity()];
                case 2:
                    allShareholders = _a.sent();
                    sorted = allShareholders
                        .filter(function (s) { return s.totalEquity > 0; })
                        .sort(function (a, b) { return b.totalEquity - a.totalEquity; });
                    userIndex = sorted.findIndex(function (s) { return s.userId === userId; });
                    if (userIndex === -1) {
                        return [2 /*return*/, {
                                rank: sorted.length + 1,
                                total: sorted.length,
                                gapToNext: 0,
                            }];
                    }
                    gapToNext = userIndex > 0 ? sorted[userIndex - 1].totalEquity - sorted[userIndex].totalEquity : 0;
                    return [2 /*return*/, {
                            rank: userIndex + 1,
                            total: sorted.length,
                            gapToNext: gapToNext,
                        }];
            }
        });
    });
}
/**
 * 获取股份池状态（总额、已分配、剩余）
 */
function getPoolStatus() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rules, poolRules, allShareholders, poolStatus;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.equityRules)];
                case 2:
                    rules = _a.sent();
                    poolRules = rules.filter(function (r) { return r.ruleKey.includes('pool') && r.ruleKey.endsWith('_percentage'); });
                    return [4 /*yield*/, getAllShareholdersEquity()];
                case 3:
                    allShareholders = _a.sent();
                    poolStatus = poolRules.map(function (rule) {
                        var poolKey = rule.ruleKey.replace('_percentage', '');
                        var allocated = 0;
                        if (poolKey === 'investment_pool') {
                            allocated = allShareholders.reduce(function (sum, s) { return sum + s.investmentEquity; }, 0);
                        }
                        else if (poolKey === 'contribution_pool') {
                            allocated = allShareholders.reduce(function (sum, s) { return sum + s.inviteEquity + s.referralNetworkEquity; }, 0);
                        }
                        var total = Number(rule.ruleValue);
                        var remaining = Math.max(0, total - allocated);
                        return {
                            poolName: rule.ruleDescription || rule.ruleKey,
                            poolKey: rule.ruleKey,
                            total: total,
                            allocated: allocated,
                            remaining: remaining,
                            allocationRate: total > 0 ? (allocated / total) * 100 : 0,
                        };
                    });
                    return [2 /*return*/, poolStatus];
            }
        });
    });
}
/**
 * 获取最近动态（脱敏处理）
 */
function getRecentActivities() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var db, activities;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n    SELECT \n      ea.activity_type as activityType,\n      ea.value,\n      ea.created_at as createdAt,\n      u.username\n    FROM equity_activities ea\n    LEFT JOIN users u ON ea.user_id = u.id\n    ORDER BY ea.created_at DESC\n    LIMIT ", "\n  "], ["\n    SELECT \n      ea.activity_type as activityType,\n      ea.value,\n      ea.created_at as createdAt,\n      u.username\n    FROM equity_activities ea\n    LEFT JOIN users u ON ea.user_id = u.id\n    ORDER BY ea.created_at DESC\n    LIMIT ", "\n  "])), limit))];
                case 2:
                    activities = _a.sent();
                    // 脱敏处理：隐藏用户名中间字符
                    return [2 /*return*/, activities.rows.map(function (a) {
                            var username = a.username || '匿名用户';
                            var maskedName = username.length > 2
                                ? username[0] + 'X'.repeat(username.length - 2) + username[username.length - 1]
                                : username[0] + 'X';
                            return {
                                activityType: a.activityType,
                                value: Number(a.value),
                                createdAt: a.createdAt,
                                username: maskedName,
                            };
                        })];
            }
        });
    });
}
/**
 * 记录股权动态
 */
function recordActivity(userId, activityType, value) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n    INSERT INTO equity_activities (user_id, activity_type, value)\n    VALUES (", ", ", ", ", ")\n  "], ["\n    INSERT INTO equity_activities (user_id, activity_type, value)\n    VALUES (", ", ", ", ", ")\n  "])), userId, activityType, value))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户晋升数据统计
 * @param userId 用户ID
 * @returns 人脉数、标签数、联络数
 */
function getUserPromotionStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, investmentResult, totalInvestment, hasInvestment, contactsResult, contactCount, globalTagsResult, personalTagsResult, globalTagCount, personalTagCount, totalTagCount, now, dayOfWeek, thisSunday, thirtyDaysAgo, thirtyDaysAgoStr, userContacts, contactIds, interactionCount, interactionsResult, currentLevel, levelName, monday, sunday, formatDate, qualifiedPeriod, levelPriority, userResult, currentHighest, assessmentPeriodStart, assessmentPeriodEnd, daysInPeriod, daysPassed, daysRemaining;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({ totalInvestment: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["SUM(", ")"], ["SUM(", ")"])), schema_1.equityInvestments.investmentAmount) })
                            .from(schema_1.equityInvestments)
                            .where((0, drizzle_orm_1.eq)(schema_1.equityInvestments.userId, userId))];
                case 2:
                    investmentResult = (_a.sent())[0];
                    totalInvestment = Number((investmentResult === null || investmentResult === void 0 ? void 0 : investmentResult.totalInvestment) || 0);
                    hasInvestment = totalInvestment > 0;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 3:
                    contactsResult = (_a.sent())[0];
                    contactCount = Number((contactsResult === null || contactsResult === void 0 ? void 0 : contactsResult.count) || 0);
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contactTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, userId))];
                case 4:
                    globalTagsResult = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, userId))];
                case 5:
                    personalTagsResult = (_a.sent())[0];
                    globalTagCount = Number((globalTagsResult === null || globalTagsResult === void 0 ? void 0 : globalTagsResult.count) || 0);
                    personalTagCount = Number((personalTagsResult === null || personalTagsResult === void 0 ? void 0 : personalTagsResult.count) || 0);
                    totalTagCount = globalTagCount + personalTagCount;
                    now = new Date();
                    dayOfWeek = now.getDay();
                    thisSunday = new Date(now);
                    if (dayOfWeek === 0) {
                        // 如果今天是周日，就是今天
                        thisSunday.setHours(23, 59, 59, 999);
                    }
                    else {
                        // 否则计算本周的周日
                        thisSunday.setDate(now.getDate() + (7 - dayOfWeek));
                        thisSunday.setHours(23, 59, 59, 999);
                    }
                    thirtyDaysAgo = new Date(thisSunday);
                    thirtyDaysAgo.setDate(thisSunday.getDate() - 29); // 包括周日当天，所以是-29
                    thirtyDaysAgo.setHours(0, 0, 0, 0);
                    thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 6:
                    userContacts = _a.sent();
                    contactIds = userContacts.map(function (c) { return c.id; });
                    interactionCount = 0;
                    if (!(contactIds.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, contactIds), (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contactInteractions.interactionDate, thirtyDaysAgoStr)))];
                case 7:
                    interactionsResult = (_a.sent())[0];
                    interactionCount = Number((interactionsResult === null || interactionsResult === void 0 ? void 0 : interactionsResult.count) || 0);
                    _a.label = 8;
                case 8:
                    currentLevel = 'user';
                    levelName = '用户';
                    // 节点层判断（根据投资判断是否加“准”）
                    if (contactCount >= 150 && totalTagCount >= 500 && interactionCount >= 210) {
                        currentLevel = 'super';
                        levelName = hasInvestment ? '超级节点' : '准超级节点';
                    }
                    else if (contactCount >= 100 && totalTagCount >= 300 && interactionCount >= 180) {
                        currentLevel = 'advanced';
                        levelName = hasInvestment ? '高级节点' : '准高级节点';
                    }
                    else if (contactCount >= 50 && totalTagCount >= 100 && interactionCount >= 150) {
                        currentLevel = 'standard';
                        levelName = hasInvestment ? '标准节点' : '准标准节点';
                    }
                    // 用户层判断（不加“准”字）
                    else if (contactCount >= 30 && totalTagCount >= 100 && interactionCount >= 120) {
                        currentLevel = 'super_user';
                        levelName = '超级用户';
                    }
                    else if (contactCount >= 20 && totalTagCount >= 50 && interactionCount >= 60) {
                        currentLevel = 'advanced_user';
                        levelName = '高级用户';
                    }
                    else if (contactCount >= 10 && totalTagCount >= 20 && interactionCount >= 30) {
                        currentLevel = 'standard_user';
                        levelName = '标准用户';
                    }
                    monday = new Date(now);
                    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                    monday.setHours(0, 0, 0, 0);
                    sunday = new Date(monday);
                    sunday.setDate(monday.getDate() + 6);
                    sunday.setHours(23, 59, 59, 999);
                    formatDate = function (date) {
                        var month = date.getMonth() + 1;
                        var day = date.getDate();
                        return "".concat(month, "\u6708").concat(day, "\u65E5");
                    };
                    qualifiedPeriod = "".concat(formatDate(monday), "-").concat(formatDate(sunday));
                    levelPriority = {
                        'partner': 0,
                        'standard_user': 1,
                        'advanced_user': 2,
                        'super_user': 3,
                        'standard': 4,
                        'advanced': 5,
                        'super': 6,
                    };
                    return [4 /*yield*/, db
                            .select({ highestLevelAchieved: schema_1.users.highestLevelAchieved })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 9:
                    userResult = (_a.sent())[0];
                    currentHighest = (userResult === null || userResult === void 0 ? void 0 : userResult.highestLevelAchieved) || 'partner';
                    if (!(levelPriority[currentLevel] > levelPriority[currentHighest])) return [3 /*break*/, 11];
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({ highestLevelAchieved: currentLevel })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11:
                    assessmentPeriodStart = thirtyDaysAgo;
                    assessmentPeriodEnd = thisSunday;
                    daysInPeriod = 30;
                    daysPassed = Math.floor((now.getTime() - assessmentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
                    daysRemaining = daysInPeriod - daysPassed;
                    return [2 /*return*/, {
                            contactCount: contactCount,
                            tagCount: totalTagCount,
                            interactionCount: interactionCount,
                            currentLevel: currentLevel,
                            levelName: levelName,
                            qualifiedPeriod: qualifiedPeriod,
                            // 考核期信息
                            assessmentPeriod: {
                                startDate: assessmentPeriodStart.toISOString().split('T')[0],
                                endDate: assessmentPeriodEnd.toISOString().split('T')[0],
                                totalDays: daysInPeriod,
                                daysPassed: daysPassed,
                                daysRemaining: daysRemaining,
                                currentInteractionCount: interactionCount,
                            },
                        }];
            }
        });
    });
}
/**
 * 获取我邀请的用户统计
 * @param userId 用户ID
 * @returns 已成功分享和分享中的人脉节点统计
 */
function getMyInvitedUsersStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, invitedUsers, usersWithCurrentLevel, totalInvitedCount, achievedStandardUser, achievedAdvancedUser, achievedSuperUser, achievedStandardNode, achievedAdvancedNode, achievedSuperNode, potentialStandardUser, potentialAdvancedUser, potentialSuperUser, potentialStandardNode, potentialAdvancedNode, potentialSuperNode;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            highestLevelAchieved: schema_1.users.highestLevelAchieved,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.invitedByUserId, userId))];
                case 2:
                    invitedUsers = _a.sent();
                    return [4 /*yield*/, Promise.all(invitedUsers.map(function (user) { return __awaiter(_this, void 0, void 0, function () {
                            var stats;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, getUserPromotionStats(user.id)];
                                    case 1:
                                        stats = _a.sent();
                                        return [2 /*return*/, {
                                                id: user.id,
                                                highestLevelAchieved: user.highestLevelAchieved || 'partner',
                                                currentLevel: stats.currentLevel,
                                            }];
                                }
                            });
                        }); }))];
                case 3:
                    usersWithCurrentLevel = _a.sent();
                    totalInvitedCount = usersWithCurrentLevel.length;
                    achievedStandardUser = usersWithCurrentLevel.filter(function (u) {
                        return ['standard_user', 'advanced_user', 'super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    achievedAdvancedUser = usersWithCurrentLevel.filter(function (u) {
                        return ['advanced_user', 'super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    achievedSuperUser = usersWithCurrentLevel.filter(function (u) {
                        return ['super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    achievedStandardNode = usersWithCurrentLevel.filter(function (u) {
                        return ['standard_user', 'advanced_user', 'super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    achievedAdvancedNode = usersWithCurrentLevel.filter(function (u) {
                        return ['advanced_user', 'super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    achievedSuperNode = usersWithCurrentLevel.filter(function (u) {
                        return ['super_user']
                            .includes(u.highestLevelAchieved);
                    }).length;
                    potentialStandardUser = totalInvitedCount;
                    potentialAdvancedUser = usersWithCurrentLevel.filter(function (u) {
                        return ['standard_user', 'advanced_user', 'super_user']
                            .includes(u.currentLevel);
                    }).length;
                    potentialSuperUser = usersWithCurrentLevel.filter(function (u) {
                        return ['advanced_user', 'super_user']
                            .includes(u.currentLevel);
                    }).length;
                    potentialStandardNode = totalInvitedCount;
                    potentialAdvancedNode = usersWithCurrentLevel.filter(function (u) {
                        return ['standard_user', 'advanced_user', 'super_user']
                            .includes(u.currentLevel);
                    }).length;
                    potentialSuperNode = usersWithCurrentLevel.filter(function (u) {
                        return ['advanced_user', 'super_user']
                            .includes(u.currentLevel);
                    }).length;
                    return [2 /*return*/, {
                            // 累计业务资产（曾经达到过）
                            achieved: {
                                standardUser: achievedStandardUser,
                                advancedUser: achievedAdvancedUser,
                                superUser: achievedSuperUser,
                                standardNode: achievedStandardNode,
                                advancedNode: achievedAdvancedNode,
                                superNode: achievedSuperNode,
                            },
                            // 本周业务拓展（当前状态）
                            potential: {
                                standardUser: potentialStandardUser,
                                advancedUser: potentialAdvancedUser,
                                superUser: potentialSuperUser,
                                standardNode: potentialStandardNode,
                                advancedNode: potentialAdvancedNode,
                                superNode: potentialSuperNode,
                            },
                        }];
            }
        });
    });
}
/**
 * 获取用户的历史周报
 * 从用户注册日期开始，按自然周生成周报列表
 */
function getUserWeeklyReports(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, user, seatInfo, seatNumber, registrationDate, now, getWeekStart, getWeekEnd, formatDate, getWeekNumber, reports, currentWeekStart, nowWeekStart, weekEnd, weekNumber, dateRange, overview;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)).limit(1)];
                case 2:
                    user = _a.sent();
                    if (!user || user.length === 0) {
                        throw new Error("User not found");
                    }
                    return [4 /*yield*/, getUserSeatNumber(userId)];
                case 3:
                    seatInfo = _a.sent();
                    seatNumber = seatInfo.seatNumber || 0;
                    registrationDate = new Date(user[0].createdAt);
                    now = new Date();
                    getWeekStart = function (date) {
                        var d = new Date(date);
                        var day = d.getDay();
                        var diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
                        d.setDate(diff);
                        d.setHours(0, 0, 0, 0); // 重置时间为00:00:00
                        return d;
                    };
                    getWeekEnd = function (weekStart) {
                        var d = new Date(weekStart);
                        d.setDate(d.getDate() + 6); // 周日
                        return d;
                    };
                    formatDate = function (date) {
                        var year = date.getFullYear();
                        var month = date.getMonth() + 1;
                        var day = date.getDate();
                        return "".concat(year, "\u5E74").concat(month, "\u6708").concat(day, "\u65E5");
                    };
                    getWeekNumber = function (date) {
                        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                        var dayNum = d.getUTCDay() || 7;
                        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                        var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
                        return "".concat(d.getUTCFullYear(), "-W").concat(weekNo.toString().padStart(2, '0'));
                    };
                    reports = [];
                    currentWeekStart = getWeekStart(registrationDate);
                    nowWeekStart = getWeekStart(now);
                    while (currentWeekStart <= nowWeekStart) {
                        weekEnd = getWeekEnd(currentWeekStart);
                        weekNumber = getWeekNumber(currentWeekStart);
                        dateRange = "".concat(formatDate(currentWeekStart), " - ").concat(formatDate(weekEnd));
                        // TODO: 这里暂时使用默认值，后续需要根据实际数据计算
                        reports.push({
                            weekNumber: weekNumber,
                            dateRange: dateRange,
                            status: 'confirmed',
                            weightGain: 0,
                            equityGain: 0,
                            blockchainHash: "0x".concat(Math.random().toString(16).substring(2, 42)),
                            personalContribution: {
                                networkSize: 0,
                                tagCompleteness: 0,
                                contactFrequency: 0,
                            },
                            sharedContribution: {
                                seniorNodes: 0,
                                advancedNodes: 0,
                                superNodes: 0,
                            },
                            nationalRank: 0,
                        });
                        // 移动到下一周
                        currentWeekStart = new Date(currentWeekStart);
                        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                    }
                    // 反转数组，最新的周报在前面
                    reports.reverse();
                    overview = {
                        archiveId: seatNumber.toString().padStart(4, '0'),
                        totalWeeks: reports.length,
                        highestWeightGain: Math.max.apply(Math, __spreadArray(__spreadArray([], reports.map(function (r) { return r.weightGain; }), false), [0], false)),
                        totalWeightGain: reports.reduce(function (sum, r) { return sum + r.weightGain; }, 0),
                    };
                    return [2 /*return*/, {
                            overview: overview,
                            reports: reports,
                        }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12;
