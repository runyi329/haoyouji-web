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
exports.getMyDataAnalytics = getMyDataAnalytics;
exports.getContactGrowthStats = getContactGrowthStats;
exports.getContactLayerStats = getContactLayerStats;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取"我的"数据分析
 */
function getMyDataAnalytics(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var keyMetrics, growthTrend;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getKeyMetrics(userId)];
                case 1:
                    keyMetrics = _a.sent();
                    return [4 /*yield*/, getGrowthTrend(userId)];
                case 2:
                    growthTrend = _a.sent();
                    // const tagStats = await getTagStats(userId);
                    // const regionStats = await getRegionStats(userId);
                    // const activityStats = await getActivityStats(userId);
                    // const companyStats = await getCompanyStats(userId);
                    // const qualityStats = await getQualityStats(userId);
                    return [2 /*return*/, {
                            keyMetrics: keyMetrics,
                            growthTrend: [],
                            tagStats: [],
                            regionStats: [],
                            activityStats: {
                                interactionTrend: [],
                                distribution: []
                            },
                            companyStats: [],
                            qualityStats: {
                                completeRate: 0,
                                completeInfo: 0,
                                missingInfo: {
                                    phone: 0,
                                    wechat: 0,
                                    address: 0
                                }
                            }
                        }];
            }
        });
    });
}
function getKeyMetrics(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, totalContacts, monthlyNewCount, totalInteractions, avgDays, activeContactsCount, needAttention, globalTagCount, personalTagCount, companiesCount;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _e.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 2:
                    totalContacts = _e.sent();
                    monthlyNewCount = 2;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.contactInteractions)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 3:
                    totalInteractions = _e.sent();
                    avgDays = 15;
                    activeContactsCount = 5;
                    needAttention = 3;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 4:
                    globalTagCount = _e.sent();
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.personalContactTags)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.personalContactTags.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 5:
                    personalTagCount = _e.sent();
                    companiesCount = 8;
                    return [2 /*return*/, {
                            totalContacts: Number(((_a = totalContacts[0]) === null || _a === void 0 ? void 0 : _a.count) || 0),
                            monthlyNew: Number(monthlyNewCount),
                            totalInteractions: Number(((_b = totalInteractions[0]) === null || _b === void 0 ? void 0 : _b.count) || 0),
                            avgFrequency: Math.round(avgDays),
                            activeContacts: Number(activeContactsCount),
                            needAttention: Number(needAttention),
                            totalTags: Number((((_c = globalTagCount[0]) === null || _c === void 0 ? void 0 : _c.count) || 0)) + Number((((_d = personalTagCount[0]) === null || _d === void 0 ? void 0 : _d.count) || 0)),
                            totalCompanies: Number(companiesCount),
                        }];
            }
        });
    });
}
/**
 * 人脉增长趋势（最近12个月）
 */
function getGrowthTrend(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, trends, now, i, date, nextDate, dateStr, nextDateStr, result, countValue;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    trends = [];
                    now = new Date();
                    i = 11;
                    _b.label = 2;
                case 2:
                    if (!(i >= 0)) return [3 /*break*/, 5];
                    date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                    dateStr = date.toISOString().slice(0, 19).replace('T', ' ');
                    nextDateStr = nextDate.toISOString().slice(0, 19).replace('T', ' ');
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt < ", ""], ["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt < ", ""])), userId, dateStr, nextDateStr))];
                case 3:
                    result = _b.sent();
                    countValue = ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    trends.push({
                        month: "".concat(date.getFullYear(), "-").concat(String(date.getMonth() + 1).padStart(2, '0')),
                        newCount: Number(countValue),
                    });
                    _b.label = 4;
                case 4:
                    i--;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, trends];
            }
        });
    });
}
/**
 * 获取人脉增长统计数据（支持日/周/月维度）
 * @param userId 用户ID
 * @param type 数据类型：'all'=全部, 'my'=我的, 'shared'=共享
 * @param period 时间维度：'day'=日, 'week'=周, 'month'=月
 */
function getContactGrowthStats(userId, type, period) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, stats, startDate, startDateStr, nowDateStr, dateMap, result, rows, _i, rows_1, row, result, rows, _a, rows_2, row, i, date, dateKey, month, day, dayIndex, lastSunday, currentDayOfWeek, daysToLastSunday, i, endDate, startDate, startDateStr, endDateStr, startMonth, startDay, endMonth, endDay, dateRange, count_1, result, rows, firstRow, weekCount, result, rows, firstRow, sharedCount, i, date, nextDate, dateStr, nextDateStr, lastDay, startMonth, startDay, endMonth, endDay, dateRange, count_2, result, rows, firstRow, result, rows, firstRow, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('[getContactGrowthStats] 调用参数:', { userId: userId, type: type, period: period });
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    now = new Date();
                    stats = [];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 23, , 24]);
                    if (!(period === 'day')) return [3 /*break*/, 7];
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 30);
                    startDate.setHours(0, 0, 0, 0);
                    startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
                    nowDateStr = now.toISOString().slice(0, 19).replace('T', ' ');
                    dateMap = new Map();
                    if (!(type === 'all' || type === 'my')) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SELECT DATE(createdAt) as date, COUNT(*) as count \n              FROM contacts \n              WHERE parentUserId = ", " \n              AND createdAt >= ", " \n              AND createdAt < ", "\n              GROUP BY DATE(createdAt)\n              ORDER BY date ASC"], ["SELECT DATE(createdAt) as date, COUNT(*) as count \n              FROM contacts \n              WHERE parentUserId = ", " \n              AND createdAt >= ", " \n              AND createdAt < ", "\n              GROUP BY DATE(createdAt)\n              ORDER BY date ASC"])), userId, startDateStr, nowDateStr))];
                case 3:
                    result = _b.sent();
                    rows = result[0] || [];
                    console.log('[getContactGrowthStats] my rows:', rows);
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        if (row && row.date) {
                            dateMap.set(row.date, (dateMap.get(row.date) || 0) + Number(row.count));
                        }
                    }
                    _b.label = 4;
                case 4:
                    if (!(type === 'all' || type === 'shared')) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["SELECT DATE(c.createdAt) as date, COUNT(*) as count \n              FROM contacts c\n              INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n              WHERE csc.receiverId = ", " \n              AND csc.status = 'active'\n              AND c.createdAt >= ", " \n              AND c.createdAt < ", "\n              GROUP BY DATE(c.createdAt)\n              ORDER BY date ASC"], ["SELECT DATE(c.createdAt) as date, COUNT(*) as count \n              FROM contacts c\n              INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n              WHERE csc.receiverId = ", " \n              AND csc.status = 'active'\n              AND c.createdAt >= ", " \n              AND c.createdAt < ", "\n              GROUP BY DATE(c.createdAt)\n              ORDER BY date ASC"])), userId, startDateStr, nowDateStr))];
                case 5:
                    result = _b.sent();
                    rows = result[0] || [];
                    console.log('[getContactGrowthStats] shared rows:', rows);
                    for (_a = 0, rows_2 = rows; _a < rows_2.length; _a++) {
                        row = rows_2[_a];
                        if (row && row.date) {
                            dateMap.set(row.date, (dateMap.get(row.date) || 0) + Number(row.count));
                        }
                    }
                    _b.label = 6;
                case 6:
                    console.log('[getContactGrowthStats] dateMap:', Array.from(dateMap.entries()));
                    // 生成完整的30天数据
                    for (i = 29; i >= 0; i--) {
                        date = new Date(now);
                        date.setDate(now.getDate() - i - 1);
                        date.setHours(0, 0, 0, 0);
                        dateKey = date.toISOString().slice(0, 10);
                        month = date.getMonth() + 1;
                        day = date.getDate();
                        dayIndex = 29 - i + 1;
                        stats.push({
                            name: "".concat(month, "/").concat(day),
                            displayName: "".concat(dayIndex),
                            value: dateMap.get(dateKey) || 0,
                        });
                    }
                    return [3 /*break*/, 22];
                case 7:
                    if (!(period === 'week')) return [3 /*break*/, 15];
                    lastSunday = new Date(now);
                    currentDayOfWeek = now.getDay();
                    daysToLastSunday = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;
                    lastSunday.setDate(now.getDate() - daysToLastSunday);
                    lastSunday.setHours(23, 59, 59, 999);
                    i = 0;
                    _b.label = 8;
                case 8:
                    if (!(i < 12)) return [3 /*break*/, 14];
                    endDate = new Date(lastSunday);
                    endDate.setDate(lastSunday.getDate() - i * 7);
                    startDate = new Date(endDate);
                    startDate.setDate(startDate.getDate() - 6);
                    startDate.setHours(0, 0, 0, 0);
                    startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
                    endDateStr = endDate.toISOString().slice(0, 19).replace('T', ' ');
                    console.log("[Week ".concat(i + 1, "] startDate: ").concat(startDateStr, ", endDate: ").concat(endDateStr));
                    startMonth = startDate.getMonth() + 1;
                    startDay = startDate.getDate();
                    endMonth = endDate.getMonth() + 1;
                    endDay = endDate.getDate();
                    dateRange = "".concat(startMonth, "/").concat(startDay, "-").concat(endMonth, "/").concat(endDay);
                    count_1 = 0;
                    if (!(type === 'all' || type === 'my')) return [3 /*break*/, 10];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt <= ", ""], ["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt <= ", ""])), userId, startDateStr, endDateStr))];
                case 9:
                    result = _b.sent();
                    rows = Array.isArray(result) ? result[0] : result;
                    firstRow = Array.isArray(rows) ? rows[0] : rows;
                    weekCount = Number((firstRow === null || firstRow === void 0 ? void 0 : firstRow.count) || 0);
                    console.log("[Week ".concat(i + 1, "] my count: ").concat(weekCount));
                    count_1 += weekCount;
                    _b.label = 10;
                case 10:
                    if (!(type === 'all' || type === 'shared')) return [3 /*break*/, 12];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["SELECT COUNT(*) as count \n                FROM contacts c\n                INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n                WHERE csc.receiverId = ", " \n                AND csc.status = 'active'\n                AND c.createdAt >= ", " \n                AND c.createdAt <= ", ""], ["SELECT COUNT(*) as count \n                FROM contacts c\n                INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n                WHERE csc.receiverId = ", " \n                AND csc.status = 'active'\n                AND c.createdAt >= ", " \n                AND c.createdAt <= ", ""])), userId, startDateStr, endDateStr))];
                case 11:
                    result = _b.sent();
                    rows = Array.isArray(result) ? result[0] : result;
                    firstRow = Array.isArray(rows) ? rows[0] : rows;
                    sharedCount = Number((firstRow === null || firstRow === void 0 ? void 0 : firstRow.count) || 0);
                    console.log("[Week ".concat(i + 1, "] shared count: ").concat(sharedCount));
                    count_1 += sharedCount;
                    _b.label = 12;
                case 12:
                    stats.push({
                        name: "".concat(i + 1, "\u5468"),
                        dateRange: dateRange,
                        value: count_1,
                    });
                    _b.label = 13;
                case 13:
                    i++;
                    return [3 /*break*/, 8];
                case 14: return [3 /*break*/, 22];
                case 15:
                    i = 12;
                    _b.label = 16;
                case 16:
                    if (!(i >= 1)) return [3 /*break*/, 22];
                    date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                    dateStr = date.toISOString().slice(0, 19).replace('T', ' ');
                    nextDateStr = nextDate.toISOString().slice(0, 19).replace('T', ' ');
                    lastDay = new Date(nextDate.getTime() - 1);
                    startMonth = date.getMonth() + 1;
                    startDay = date.getDate();
                    endMonth = lastDay.getMonth() + 1;
                    endDay = lastDay.getDate();
                    dateRange = "".concat(startMonth, "/").concat(startDay, "-").concat(endMonth, "/").concat(endDay);
                    count_2 = 0;
                    if (!(type === 'all' || type === 'my')) return [3 /*break*/, 18];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt < ", ""], ["SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ", " AND createdAt >= ", " AND createdAt < ", ""])), userId, dateStr, nextDateStr))];
                case 17:
                    result = _b.sent();
                    rows = Array.isArray(result) ? result[0] : result;
                    firstRow = Array.isArray(rows) ? rows[0] : rows;
                    count_2 += Number((firstRow === null || firstRow === void 0 ? void 0 : firstRow.count) || 0);
                    _b.label = 18;
                case 18:
                    if (!(type === 'all' || type === 'shared')) return [3 /*break*/, 20];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["SELECT COUNT(*) as count \n                FROM contacts c\n                INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n                WHERE csc.receiverId = ", " \n                AND csc.status = 'active'\n                AND c.createdAt >= ", " \n                AND c.createdAt < ", ""], ["SELECT COUNT(*) as count \n                FROM contacts c\n                INNER JOIN contact_sharing_connections csc ON c.parentUserId = csc.sharerId\n                WHERE csc.receiverId = ", " \n                AND csc.status = 'active'\n                AND c.createdAt >= ", " \n                AND c.createdAt < ", ""])), userId, dateStr, nextDateStr))];
                case 19:
                    result = _b.sent();
                    rows = Array.isArray(result) ? result[0] : result;
                    firstRow = Array.isArray(rows) ? rows[0] : rows;
                    count_2 += Number((firstRow === null || firstRow === void 0 ? void 0 : firstRow.count) || 0);
                    _b.label = 20;
                case 20:
                    stats.push({
                        name: "".concat(date.getMonth() + 1, "\u6708"),
                        dateRange: dateRange,
                        value: count_2,
                    });
                    _b.label = 21;
                case 21:
                    i--;
                    return [3 /*break*/, 16];
                case 22:
                    console.log('[getContactGrowthStats] 返回数据:', { count: stats.length, first: stats[0], sample: stats.slice(0, 3) });
                    return [2 /*return*/, stats];
                case 23:
                    error_1 = _b.sent();
                    console.error('[getContactGrowthStats] 错误:', error_1);
                    throw error_1;
                case 24: return [2 /*return*/];
            }
        });
    });
}
/**
 * 标签使用统计
 */
function getTagStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, globalTags;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            tagId: schema_1.contactTags.id,
                            tagName: schema_1.contactTags.name,
                            tagColor: schema_1.contactTags.color,
                            count: (0, drizzle_orm_1.count)()
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))
                            .groupBy(schema_1.contactTags.id, schema_1.contactTags.name, schema_1.contactTags.color)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.count)()))];
                case 2:
                    globalTags = _a.sent();
                    return [2 /*return*/, globalTags.map(function (tag) { return ({
                            name: String(tag.tagName),
                            color: String(tag.tagColor),
                            count: Number(tag.count),
                        }); })];
            }
        });
    });
}
/**
 * 地区分布统计
 */
function getRegionStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, regions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            province: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD'))"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD'))"])), schema_1.contacts.customFields),
                            count: (0, drizzle_orm_1.count)()
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD')) != ''"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD')) != ''"])), schema_1.contacts.customFields, schema_1.contacts.customFields)))
                            .groupBy((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD'))"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u7701\u4EFD'))"])), schema_1.contacts.customFields))
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.count)()))];
                case 2:
                    regions = _a.sent();
                    return [2 /*return*/, regions.map(function (r) { return ({
                            province: String(r.province || ''),
                            count: Number(r.count),
                        }); })];
            }
        });
    });
}
/**
 * 联络活跃度统计
 */
function getActivityStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, interactionTrend, i, date, nextDate, interactions, thirtyDaysAgo, ninetyDaysAgo, allContactsWithLastInteraction, active, dormant, silent;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    now = new Date();
                    interactionTrend = [];
                    i = 11;
                    _b.label = 2;
                case 2:
                    if (!(i >= 0)) return [3 /*break*/, 5];
                    date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)() })
                            .from(schema_1.contactInteractions)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactedAt, date.getTime()), (0, drizzle_orm_1.lte)(schema_1.contactInteractions.interactedAt, nextDate.getTime())))];
                case 3:
                    interactions = _b.sent();
                    interactionTrend.push({
                        month: "".concat(date.getFullYear(), "-").concat(String(date.getMonth() + 1).padStart(2, '0')),
                        count: Number(((_a = interactions[0]) === null || _a === void 0 ? void 0 : _a.count) || 0),
                    });
                    _b.label = 4;
                case 4:
                    i--;
                    return [3 /*break*/, 2];
                case 5:
                    thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contacts.id,
                            lastInteraction: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.contactInteractions.interactedAt)
                        })
                            .from(schema_1.contacts)
                            .leftJoin(schema_1.contactInteractions, (0, drizzle_orm_1.eq)(schema_1.contacts.id, schema_1.contactInteractions.contactId))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))
                            .groupBy(schema_1.contacts.id)];
                case 6:
                    allContactsWithLastInteraction = _b.sent();
                    active = 0, dormant = 0, silent = 0;
                    allContactsWithLastInteraction.forEach(function (c) {
                        if (!c.lastInteraction) {
                            silent++;
                        }
                        else if (c.lastInteraction >= thirtyDaysAgo) {
                            active++;
                        }
                        else if (c.lastInteraction >= ninetyDaysAgo) {
                            dormant++;
                        }
                        else {
                            silent++;
                        }
                    });
                    return [2 /*return*/, {
                            interactionTrend: interactionTrend,
                            distribution: [
                                { name: '活跃', count: Number(active) },
                                { name: '休眠', count: Number(dormant) },
                                { name: '沉默', count: Number(silent) },
                            ],
                        }];
            }
        });
    });
}
/**
 * 公司分布统计
 */
function getCompanyStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, companies;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            company: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8'))"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8'))"])), schema_1.contacts.customFields),
                            count: (0, drizzle_orm_1.count)()
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8')) != ''"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8')) != ''"])), schema_1.contacts.customFields, schema_1.contacts.customFields)))
                            .groupBy((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8'))"], ["JSON_UNQUOTE(JSON_EXTRACT(", ", '$.\u516C\u53F8'))"])), schema_1.contacts.customFields))
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.count)()))];
                case 2:
                    companies = _a.sent();
                    return [2 /*return*/, companies.map(function (c) { return ({
                            company: String(c.company || ''),
                            count: Number(c.count),
                        }); })];
            }
        });
    });
}
/**
 * 人脉质量分析
 */
function getQualityStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allContacts, completeInfo, missingPhone, missingWechat, missingAddress;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.contacts.id,
                            customFields: schema_1.contacts.customFields,
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 2:
                    allContacts = _a.sent();
                    completeInfo = 0;
                    missingPhone = 0;
                    missingWechat = 0;
                    missingAddress = 0;
                    allContacts.forEach(function (contact) {
                        var fields = contact.customFields || {};
                        var hasPhone = fields['电话'] && fields['电话'].trim() !== '';
                        var hasWechat = fields['微信号'] && fields['微信号'].trim() !== '';
                        var hasAddress = fields['省份'] && fields['省份'].trim() !== '';
                        if (hasPhone && hasWechat && hasAddress) {
                            completeInfo++;
                        }
                        if (!hasPhone)
                            missingPhone++;
                        if (!hasWechat)
                            missingWechat++;
                        if (!hasAddress)
                            missingAddress++;
                    });
                    return [2 /*return*/, {
                            total: Number(allContacts.length),
                            completeInfo: Number(completeInfo),
                            completeRate: allContacts.length > 0 ? Math.round((completeInfo / allContacts.length) * 100) : 0,
                            missingInfo: {
                                phone: Number(missingPhone),
                                wechat: Number(missingWechat),
                                address: Number(missingAddress),
                            },
                        }];
            }
        });
    });
}
/**
 * 人脉互动分层统计
 * 根据最后互动时间将人脉分为：活跃层、常温层、低温层、失联层
 */
function getContactLayerStats(userId, type) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sql_1, rows, results, layerMap_1, allLayers, stats, total, totalAvgDays, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[getContactLayerStats] 调用参数:', { userId: userId, type: type });
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    sql_1 = "\n      WITH contact_last_interaction AS (\n        SELECT \n          c.id,\n          c.parentUserId,\n          MAX(ci.interactionDate) AS last_interaction\n        FROM contacts c\n        LEFT JOIN contact_interactions ci ON c.id = ci.contactId\n        WHERE c.isBlacklisted = 0\n    ";
                    // 根据类型添加条件
                    if (type === 'my') {
                        sql_1 += " AND c.parentUserId = ".concat(userId);
                    }
                    else if (type === 'shared') {
                        sql_1 += " AND c.parentUserId != ".concat(userId);
                    }
                    sql_1 += "\n        GROUP BY c.id, c.parentUserId\n      ),\n      layer_stats AS (\n        SELECT \n          CASE \n            WHEN DATEDIFF(CURDATE(), last_interaction) <= 7 THEN '\u6D3B\u8DC3\u5C42'\n            WHEN DATEDIFF(CURDATE(), last_interaction) BETWEEN 8 AND 30 THEN '\u5E38\u6E29\u5C42'\n            WHEN DATEDIFF(CURDATE(), last_interaction) BETWEEN 31 AND 90 THEN '\u4F4E\u6E29\u5C42'\n            WHEN DATEDIFF(CURDATE(), last_interaction) > 180 OR last_interaction IS NULL THEN '\u5931\u8054\u5C42'\n            ELSE '\u5176\u4ED6'\n          END AS layer,\n          COUNT(*) AS count,\n          ROUND(AVG(DATEDIFF(CURDATE(), last_interaction)), 0) AS avg_days\n        FROM contact_last_interaction\n        GROUP BY layer\n      )\n      SELECT \n        layer,\n        count,\n        ROUND(count * 100.0 / (SELECT SUM(count) FROM layer_stats), 0) AS percentage,\n        COALESCE(avg_days, 0) AS avg_days\n      FROM layer_stats\n      ORDER BY \n        CASE layer\n          WHEN '\u6D3B\u8DC3\u5C42' THEN 1\n          WHEN '\u5E38\u6E29\u5C42' THEN 2\n          WHEN '\u4F4E\u6E29\u5C42' THEN 3\n          WHEN '\u5931\u8054\u5C42' THEN 4\n          ELSE 5\n        END;\n    ";
                    return [4 /*yield*/, db.execute(sql_1)];
                case 3:
                    rows = (_a.sent())[0];
                    results = rows;
                    layerMap_1 = new Map();
                    results.forEach(function (row) {
                        layerMap_1.set(row.layer, {
                            layer: row.layer,
                            count: row.count,
                            percentage: row.percentage,
                            avgDays: row.avg_days
                        });
                    });
                    allLayers = ['活跃层', '常温层', '低温层', '失联层'];
                    stats = allLayers.map(function (layer) {
                        if (layerMap_1.has(layer)) {
                            return layerMap_1.get(layer);
                        }
                        else {
                            return {
                                layer: layer,
                                count: 0,
                                percentage: 0,
                                avgDays: 0
                            };
                        }
                    });
                    total = stats.reduce(function (sum, item) { return sum + item.count; }, 0);
                    totalAvgDays = total > 0
                        ? Math.round(stats.reduce(function (sum, item) { return sum + item.count * item.avgDays; }, 0) / total)
                        : 0;
                    console.log('[getContactLayerStats] 返回数据:', { total: total, stats: stats });
                    return [2 /*return*/, {
                            total: total,
                            totalAvgDays: totalAvgDays,
                            layers: stats
                        }];
                case 4:
                    error_2 = _a.sent();
                    console.error('[getContactLayerStats] 错误:', error_2);
                    throw error_2;
                case 5: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14;
