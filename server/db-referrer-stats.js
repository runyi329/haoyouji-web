"use strict";
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
exports.getReferrerStats = getReferrerStats;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 递归查询某个人介绍的所有下级人脉，并计算递减权重贡献分
 * @param contactId 介绍人ID
 * @param parentUserId 家长用户ID
 * @param depth 当前递归深度（1=直接介绍，2=二度，3=三度...）
 * @returns 返回 { direct: 直接介绍数量, indirect: 间接介绍数量, weightedScore: 加权贡献分 }
 */
function countReferrals(contactId_1, parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (contactId, parentUserId, depth) {
        var db, directReferrals, directCount, indirectCount, weightedScore, currentWeight, _i, directReferrals_1, referral, subCounts, _a, directReferrals_2, referral, subCounts;
        if (depth === void 0) { depth = 1; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.referrerId, contactId)))];
                case 2:
                    directReferrals = _b.sent();
                    directCount = 0;
                    indirectCount = 0;
                    weightedScore = 0;
                    currentWeight = Math.pow(0.5, depth - 1);
                    if (!(depth === 1)) return [3 /*break*/, 7];
                    // 第一层：这些是直接介绍的人脉
                    directCount = directReferrals.length;
                    // 第一层的贡献分 = 人数 * 1.0
                    weightedScore = directCount * currentWeight;
                    _i = 0, directReferrals_1 = directReferrals;
                    _b.label = 3;
                case 3:
                    if (!(_i < directReferrals_1.length)) return [3 /*break*/, 6];
                    referral = directReferrals_1[_i];
                    return [4 /*yield*/, countReferrals(referral.id, parentUserId, depth + 1)];
                case 4:
                    subCounts = _b.sent();
                    indirectCount += subCounts.direct + subCounts.indirect;
                    weightedScore += subCounts.weightedScore;
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 11];
                case 7:
                    // 第二层及以上：这些都算作间接介绍
                    indirectCount = directReferrals.length;
                    // 当前层的贡献分 = 人数 * 当前层权重
                    weightedScore = indirectCount * currentWeight;
                    _a = 0, directReferrals_2 = directReferrals;
                    _b.label = 8;
                case 8:
                    if (!(_a < directReferrals_2.length)) return [3 /*break*/, 11];
                    referral = directReferrals_2[_a];
                    return [4 /*yield*/, countReferrals(referral.id, parentUserId, depth + 1)];
                case 9:
                    subCounts = _b.sent();
                    indirectCount += subCounts.direct + subCounts.indirect;
                    weightedScore += subCounts.weightedScore;
                    _b.label = 10;
                case 10:
                    _a++;
                    return [3 /*break*/, 8];
                case 11: return [2 /*return*/, { direct: directCount, indirect: indirectCount, weightedScore: weightedScore }];
            }
        });
    });
}
/**
 * 获取介绍人贡献统计排行榜
 * @param parentUserId 家长用户ID
 * @returns 返回排行榜数据，按总贡献分降序排列
 *
 * 贡献分计算规则（递减权重）：
 * - 第1层（直接推荐）：权重 = 1.0
 * - 第2层（间接推荐）：权重 = 0.5
 * - 第3层：权重 = 0.25
 * - 第N层：权重 = 0.5^(N-1)
 *
 * 示例：张三 → 李四 → 王五 → 赵六
 * 张三的贡献分 = 1.0（李四）+ 0.5（王五）+ 0.25（赵六）= 1.75分
 */
function getReferrerStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allContacts, stats, _i, allContacts_1, contact, counts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 2:
                    allContacts = _a.sent();
                    stats = [];
                    _i = 0, allContacts_1 = allContacts;
                    _a.label = 3;
                case 3:
                    if (!(_i < allContacts_1.length)) return [3 /*break*/, 6];
                    contact = allContacts_1[_i];
                    return [4 /*yield*/, countReferrals(contact.id, parentUserId)];
                case 4:
                    counts = _a.sent();
                    // 只统计有介绍记录的人脉
                    if (counts.direct > 0 || counts.indirect > 0) {
                        stats.push({
                            contactId: contact.id,
                            contactName: contact.name,
                            contactTitle: contact.title,
                            directReferrals: counts.direct,
                            indirectReferrals: counts.indirect,
                            totalScore: Math.round(counts.weightedScore * 10) / 10, // 保留一位小数
                        });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    // 按总贡献分降序排列
                    stats.sort(function (a, b) { return b.totalScore - a.totalScore; });
                    return [2 /*return*/, stats];
            }
        });
    });
}
