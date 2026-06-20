"use strict";
/**
 * 标签数据分析相关数据库查询函数
 */
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
exports.getGlobalTagRanking = getGlobalTagRanking;
exports.getPersonalTagRanking = getPersonalTagRanking;
exports.getTagUserDistribution = getTagUserDistribution;
exports.getTagOverallStats = getTagOverallStats;
exports.getRecentTags = getRecentTags;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取可见联系人ID列表
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
function getVisibleContactIds(parentUserId, scope) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allContacts, ownContacts, ownContactIds, sharingConnections, sharedContactIds, _i, sharingConnections_1, conn, sharerContacts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    if (!(scope === 'global')) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)];
                case 2:
                    allContacts = _a.sent();
                    return [2 /*return*/, allContacts.map(function (c) { return c.id; })];
                case 3: return [4 /*yield*/, db
                        .select({ id: schema_1.contacts.id })
                        .from(schema_1.contacts)
                        .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 4:
                    ownContacts = _a.sent();
                    ownContactIds = ownContacts.map(function (c) { return c.id; });
                    if (scope === 'mine') {
                        // 只看自己
                        return [2 /*return*/, ownContactIds];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 5:
                    sharingConnections = _a.sent();
                    sharedContactIds = [];
                    _i = 0, sharingConnections_1 = sharingConnections;
                    _a.label = 6;
                case 6:
                    if (!(_i < sharingConnections_1.length)) return [3 /*break*/, 9];
                    conn = sharingConnections_1[_i];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, conn.sharerId))];
                case 7:
                    sharerContacts = _a.sent();
                    sharedContactIds.push.apply(sharedContactIds, sharerContacts.map(function (c) { return c.id; }));
                    _a.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9:
                    if (scope === 'shared') {
                        // 只看共享
                        return [2 /*return*/, sharedContactIds];
                    }
                    // scope === 'all': 自己 + 共享
                    return [2 /*return*/, Array.from(new Set(__spreadArray(__spreadArray([], ownContactIds, true), sharedContactIds, true)))];
            }
        });
    });
}
/**
 * 获取可见用户ID列表
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
function getVisibleUserIds(parentUserId, scope) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allUsers, sharingConnections, sharedUserIds;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    if (!(scope === 'global')) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.users.id })
                            .from(schema_1.users)];
                case 2:
                    allUsers = _a.sent();
                    return [2 /*return*/, allUsers.map(function (u) { return u.id; })];
                case 3:
                    if (scope === 'mine') {
                        // 只看自己
                        return [2 /*return*/, [parentUserId]];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 4:
                    sharingConnections = _a.sent();
                    sharedUserIds = sharingConnections.map(function (conn) { return conn.sharerId; });
                    if (scope === 'shared') {
                        // 只看共享
                        return [2 /*return*/, sharedUserIds];
                    }
                    // scope === 'all': 自己 + 共享
                    return [2 /*return*/, Array.from(new Set(__spreadArray([parentUserId], sharedUserIds, true)))];
            }
        });
    });
}
/**
 * 获取全局标签使用排行榜
 * @param parentUserId 用户ID
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
function getGlobalTagRanking(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, scope, limit) {
        var db, visibleContactIds, result;
        if (scope === void 0) { scope = 'all'; }
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getVisibleContactIds(parentUserId, scope)];
                case 2:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select({
                            tagId: schema_1.contactTagRelations.tagId,
                            tagName: schema_1.contactTags.name,
                            tagColor: schema_1.contactTags.color,
                            usageCount: (0, drizzle_orm_1.count)(schema_1.contactTagRelations.contactId).as('usage_count'),
                        })
                            .from(schema_1.contactTagRelations)
                            .leftJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds))
                            .groupBy(schema_1.contactTagRelations.tagId, schema_1.contactTags.name, schema_1.contactTags.color)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["usage_count"], ["usage_count"])))))
                            .limit(limit)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result.map(function (row) { return ({
                            tagId: row.tagId,
                            tagName: row.tagName || '未知标签',
                            tagColor: row.tagColor || '#3b82f6',
                            usageCount: Number(row.usageCount),
                        }); })];
            }
        });
    });
}
/**
 * 获取个人标签使用排行榜
 * @param parentUserId 用户ID
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
function getPersonalTagRanking(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, scope, limit) {
        var db, visibleUserIds, result;
        if (scope === void 0) { scope = 'all'; }
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getVisibleUserIds(parentUserId, scope)];
                case 2:
                    visibleUserIds = _a.sent();
                    if (visibleUserIds.length === 0)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select({
                            tagName: schema_1.personalContactTags.name,
                            tagColor: schema_1.personalContactTags.color,
                            usageCount: (0, drizzle_orm_1.count)(schema_1.personalContactTags.id).as('usage_count'),
                        })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.inArray)(schema_1.personalContactTags.parentUserId, visibleUserIds))
                            .groupBy(schema_1.personalContactTags.name, schema_1.personalContactTags.color)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["usage_count"], ["usage_count"])))))
                            .limit(limit)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result.map(function (row) { return ({
                            tagName: row.tagName,
                            tagColor: row.tagColor || '#A80000',
                            usageCount: Number(row.usageCount),
                        }); })];
            }
        });
    });
}
/**
 * 获取标签使用的用户分布
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
function getTagUserDistribution(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, scope) {
        var db, visibleUserIds, visibleContactIds, globalTagsByUser, personalTagsByUser, userMap;
        if (scope === void 0) { scope = 'all'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getVisibleUserIds(parentUserId, scope)];
                case 2:
                    visibleUserIds = _a.sent();
                    if (visibleUserIds.length === 0)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getVisibleContactIds(parentUserId, scope)];
                case 3:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.contacts.parentUserId,
                            userName: schema_1.users.name,
                            tagCount: (0, drizzle_orm_1.count)(schema_1.contactTagRelations.id).as('tag_count'),
                        })
                            .from(schema_1.contactTagRelations)
                            .leftJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, schema_1.users.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds), (0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, visibleUserIds)))
                            .groupBy(schema_1.contacts.parentUserId, schema_1.users.name)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["tag_count"], ["tag_count"])))))];
                case 4:
                    globalTagsByUser = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.personalContactTags.parentUserId,
                            userName: schema_1.users.name,
                            tagCount: (0, drizzle_orm_1.count)(schema_1.personalContactTags.id).as('tag_count'),
                        })
                            .from(schema_1.personalContactTags)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, schema_1.users.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.personalContactTags.parentUserId, visibleUserIds))
                            .groupBy(schema_1.personalContactTags.parentUserId, schema_1.users.name)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["tag_count"], ["tag_count"])))))];
                case 5:
                    personalTagsByUser = _a.sent();
                    userMap = new Map();
                    globalTagsByUser.forEach(function (row) {
                        if (row.userId) {
                            userMap.set(row.userId, {
                                userId: row.userId,
                                userName: row.userName || '未知用户',
                                globalTags: Number(row.tagCount),
                                personalTags: 0,
                            });
                        }
                    });
                    personalTagsByUser.forEach(function (row) {
                        if (row.userId) {
                            var existing = userMap.get(row.userId);
                            if (existing) {
                                existing.personalTags = Number(row.tagCount);
                            }
                            else {
                                userMap.set(row.userId, {
                                    userId: row.userId,
                                    userName: row.userName || '未知用户',
                                    globalTags: 0,
                                    personalTags: Number(row.tagCount),
                                });
                            }
                        }
                    });
                    return [2 /*return*/, Array.from(userMap.values()).map(function (user) { return (__assign(__assign({}, user), { totalTags: user.globalTags + user.personalTags })); }).sort(function (a, b) { return b.totalTags - a.totalTags; })];
            }
        });
    });
}
/**
 * 获取标签总体统计数据
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
function getTagOverallStats(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, scope) {
        var db, visibleContactIds, visibleUserIds, globalTagsCount, globalTagUsageCount, personalTagsCount, contactsWithGlobalTags, contactsWithPersonalTags;
        if (scope === void 0) { scope = 'all'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, getVisibleContactIds(parentUserId, scope)];
                case 2:
                    visibleContactIds = _a.sent();
                    return [4 /*yield*/, getVisibleUserIds(parentUserId, scope)];
                case 3:
                    visibleUserIds = _a.sent();
                    if (!(scope === 'global')) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)(schema_1.contactTags.id) })
                            .from(schema_1.contactTags)];
                case 4:
                    // 全局模式：统计所有标签
                    globalTagsCount = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)(schema_1.contactTagRelations.id) })
                            .from(schema_1.contactTagRelations)];
                case 5:
                    globalTagUsageCount = (_a.sent())[0];
                    return [3 /*break*/, 10];
                case 6:
                    if (!(visibleContactIds.length === 0)) return [3 /*break*/, 7];
                    globalTagsCount = { count: 0 };
                    globalTagUsageCount = { count: 0 };
                    return [3 /*break*/, 10];
                case 7: return [4 /*yield*/, db
                        .select({ count: (0, drizzle_orm_1.count)((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["DISTINCT ", ""], ["DISTINCT ", ""])), schema_1.contactTagRelations.tagId)) })
                        .from(schema_1.contactTagRelations)
                        .where((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds))];
                case 8:
                    // 统计可见联系人使用的不同标签数量
                    globalTagsCount = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)(schema_1.contactTagRelations.id) })
                            .from(schema_1.contactTagRelations)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds))];
                case 9:
                    globalTagUsageCount = (_a.sent())[0];
                    _a.label = 10;
                case 10:
                    if (!(visibleUserIds.length === 0)) return [3 /*break*/, 11];
                    personalTagsCount = { count: 0 };
                    return [3 /*break*/, 13];
                case 11: return [4 /*yield*/, db
                        .select({ count: (0, drizzle_orm_1.count)(schema_1.personalContactTags.id) })
                        .from(schema_1.personalContactTags)
                        .where((0, drizzle_orm_1.inArray)(schema_1.personalContactTags.parentUserId, visibleUserIds))];
                case 12:
                    personalTagsCount = (_a.sent())[0];
                    _a.label = 13;
                case 13:
                    if (!(visibleContactIds.length === 0)) return [3 /*break*/, 14];
                    contactsWithGlobalTags = { count: 0 };
                    contactsWithPersonalTags = { count: 0 };
                    return [3 /*break*/, 17];
                case 14: return [4 /*yield*/, db
                        .select({ count: (0, drizzle_orm_1.count)((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["DISTINCT ", ""], ["DISTINCT ", ""])), schema_1.contactTagRelations.contactId)) })
                        .from(schema_1.contactTagRelations)
                        .where((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds))];
                case 15:
                    contactsWithGlobalTags = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.count)((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["DISTINCT ", ""], ["DISTINCT ", ""])), schema_1.personalContactTags.contactId)) })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.personalContactTags.parentUserId, visibleUserIds), (0, drizzle_orm_1.inArray)(schema_1.personalContactTags.contactId, visibleContactIds)))];
                case 16:
                    contactsWithPersonalTags = (_a.sent())[0];
                    _a.label = 17;
                case 17: return [2 /*return*/, {
                        globalTags: {
                            totalTags: Number((globalTagsCount === null || globalTagsCount === void 0 ? void 0 : globalTagsCount.count) || 0),
                            totalUsage: Number((globalTagUsageCount === null || globalTagUsageCount === void 0 ? void 0 : globalTagUsageCount.count) || 0),
                            avgUsagePerTag: Number((globalTagsCount === null || globalTagsCount === void 0 ? void 0 : globalTagsCount.count) || 0) > 0
                                ? Number((globalTagUsageCount === null || globalTagUsageCount === void 0 ? void 0 : globalTagUsageCount.count) || 0) / Number((globalTagsCount === null || globalTagsCount === void 0 ? void 0 : globalTagsCount.count) || 0)
                                : 0,
                        },
                        personalTags: {
                            totalTags: Number((personalTagsCount === null || personalTagsCount === void 0 ? void 0 : personalTagsCount.count) || 0),
                        },
                        contacts: {
                            withGlobalTags: Number((contactsWithGlobalTags === null || contactsWithGlobalTags === void 0 ? void 0 : contactsWithGlobalTags.count) || 0),
                            withPersonalTags: Number((contactsWithPersonalTags === null || contactsWithPersonalTags === void 0 ? void 0 : contactsWithPersonalTags.count) || 0),
                        },
                        overall: {
                            totalTags: Number((globalTagsCount === null || globalTagsCount === void 0 ? void 0 : globalTagsCount.count) || 0) + Number((personalTagsCount === null || personalTagsCount === void 0 ? void 0 : personalTagsCount.count) || 0),
                            totalUsage: Number((globalTagUsageCount === null || globalTagUsageCount === void 0 ? void 0 : globalTagUsageCount.count) || 0) + Number((personalTagsCount === null || personalTagsCount === void 0 ? void 0 : personalTagsCount.count) || 0),
                        },
                    }];
            }
        });
    });
}
/**
 * 获取最近创建的标签
 * @param parentUserId 用户ID
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
function getRecentTags(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, scope, limit) {
        var db, visibleUserIds, recentGlobalTags, recentPersonalTags, visibleContactIds, allTags;
        if (scope === void 0) { scope = 'all'; }
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getVisibleUserIds(parentUserId, scope)];
                case 2:
                    visibleUserIds = _a.sent();
                    recentGlobalTags = [];
                    recentPersonalTags = [];
                    if (!(scope === 'global')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.contactTags.id,
                            name: schema_1.contactTags.name,
                            color: schema_1.contactTags.color,
                            type: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["'global'"], ["'global'"]))).as('type'),
                            createdAt: schema_1.contactTags.createdAt,
                        })
                            .from(schema_1.contactTags)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactTags.createdAt))
                            .limit(limit)];
                case 3:
                    // 全局模式：所有标签
                    recentGlobalTags = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.personalContactTags.id,
                            name: schema_1.personalContactTags.name,
                            color: schema_1.personalContactTags.color,
                            type: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["'personal'"], ["'personal'"]))).as('type'),
                            createdAt: schema_1.personalContactTags.createdAt,
                        })
                            .from(schema_1.personalContactTags)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.personalContactTags.createdAt))
                            .limit(limit)];
                case 4:
                    recentPersonalTags = _a.sent();
                    return [3 /*break*/, 12];
                case 5:
                    if (!(visibleUserIds.length === 0)) return [3 /*break*/, 6];
                    recentGlobalTags = [];
                    recentPersonalTags = [];
                    return [3 /*break*/, 12];
                case 6: return [4 /*yield*/, getVisibleContactIds(parentUserId, scope)];
                case 7:
                    visibleContactIds = _a.sent();
                    if (!(visibleContactIds.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.contactTags.id,
                            name: schema_1.contactTags.name,
                            color: schema_1.contactTags.color,
                            type: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["'global'"], ["'global'"]))).as('type'),
                            createdAt: schema_1.contactTags.createdAt,
                        })
                            .from(schema_1.contactTags)
                            .leftJoin(schema_1.contactTagRelations, (0, drizzle_orm_1.eq)(schema_1.contactTags.id, schema_1.contactTagRelations.tagId))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds))
                            .groupBy(schema_1.contactTags.id, schema_1.contactTags.name, schema_1.contactTags.color, schema_1.contactTags.createdAt)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactTags.createdAt))
                            .limit(limit)];
                case 8:
                    recentGlobalTags = _a.sent();
                    return [3 /*break*/, 10];
                case 9:
                    recentGlobalTags = [];
                    _a.label = 10;
                case 10: return [4 /*yield*/, db
                        .select({
                        id: schema_1.personalContactTags.id,
                        name: schema_1.personalContactTags.name,
                        color: schema_1.personalContactTags.color,
                        type: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["'personal'"], ["'personal'"]))).as('type'),
                        createdAt: schema_1.personalContactTags.createdAt,
                    })
                        .from(schema_1.personalContactTags)
                        .where((0, drizzle_orm_1.inArray)(schema_1.personalContactTags.parentUserId, visibleUserIds))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.personalContactTags.createdAt))
                        .limit(limit)];
                case 11:
                    recentPersonalTags = _a.sent();
                    _a.label = 12;
                case 12:
                    allTags = __spreadArray(__spreadArray([], recentGlobalTags, true), recentPersonalTags, true).sort(function (a, b) {
                        var timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        var timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return timeB - timeA;
                    })
                        .slice(0, limit);
                    return [2 /*return*/, allTags];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11;
