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
exports.getLatestUserInsight = getLatestUserInsight;
exports.getAdminInsightsSummary = getAdminInsightsSummary;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取用户的最新 AI 洞察
 * @param userId 用户 ID
 */
function getLatestUserInsight(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userInsights)
                            .where((0, drizzle_orm_1.eq)(schema_1.userInsights.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.userInsights.createdAt))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : null];
            }
        });
    });
}
/**
 * 获取全站用户的洞察汇总（管理侧使用）
 * 包含：最热门的标签云、最新的运营建议
 */
function getAdminInsightsSummary() {
    return __awaiter(this, void 0, void 0, function () {
        var db, recentInsights, tagCounts, uniqueInsights;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select({
                            tags: schema_1.userInsights.tags,
                            ownerInsight: schema_1.userInsights.ownerInsight,
                            createdAt: schema_1.userInsights.createdAt,
                        })
                            .from(schema_1.userInsights)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.userInsights.createdAt))
                            .limit(50)];
                case 2:
                    recentInsights = _a.sent();
                    tagCounts = {};
                    recentInsights.forEach(function (insight) {
                        if (Array.isArray(insight.tags)) {
                            insight.tags.forEach(function (tag) {
                                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                            });
                        }
                    });
                    uniqueInsights = recentInsights
                        .filter(function (i) { return i.ownerInsight; })
                        .slice(0, 10);
                    return [2 /*return*/, {
                            topTags: Object.entries(tagCounts)
                                .sort(function (_a, _b) {
                                var a = _a[1];
                                var b = _b[1];
                                return b - a;
                            })
                                .slice(0, 20)
                                .map(function (_a) {
                                var name = _a[0], count = _a[1];
                                return ({ name: name, count: count });
                            }),
                            recentOwnerInsights: uniqueInsights,
                            totalAnalyzed: recentInsights.length,
                        }];
            }
        });
    });
}
