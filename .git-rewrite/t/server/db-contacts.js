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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.getContactCounts = getContactCounts;
exports.createContact = createContact;
exports.getContactsByParent = getContactsByParent;
exports.getContactById = getContactById;
exports.updateContact = updateContact;
exports.deleteContact = deleteContact;
exports.getContactTags = getContactTags;
exports.searchTags = searchTags;
exports.createContactTag = createContactTag;
exports.updateContactTag = updateContactTag;
exports.deleteContactTag = deleteContactTag;
exports.updateTagsOrder = updateTagsOrder;
exports.getContactTagsByContactId = getContactTagsByContactId;
exports.addTagToContact = addTagToContact;
exports.removeTagFromContact = removeTagFromContact;
exports.getPersonalTagsByContactId = getPersonalTagsByContactId;
exports.createPersonalTag = createPersonalTag;
exports.updatePersonalTag = updatePersonalTag;
exports.deletePersonalTag = deletePersonalTag;
exports.createContactInteraction = createContactInteraction;
exports.deleteContactInteraction = deleteContactInteraction;
exports.updateContactInteraction = updateContactInteraction;
exports.hasTodayInteraction = hasTodayInteraction;
exports.getContactInteractions = getContactInteractions;
exports.getLastInteractionDate = getLastInteractionDate;
exports.getContactInteractionStats = getContactInteractionStats;
exports.addCustomField = addCustomField;
exports.getCustomFieldsByContactId = getCustomFieldsByContactId;
exports.updateCustomField = updateCustomField;
exports.deleteCustomField = deleteCustomField;
exports.addCustomFields = addCustomFields;
exports.getTotalInteractionCount = getTotalInteractionCount;
exports.getTotalTagCount = getTotalTagCount;
exports.getTotalLedgerEntries = getTotalLedgerEntries;
exports.getContactStats = getContactStats;
exports.getFirstContactCreatedAt = getFirstContactCreatedAt;
exports.getContactsOverviewStats = getContactsOverviewStats;
exports.updateContactTags = updateContactTags;
exports.getContactsByTag = getContactsByTag;
exports.getContactCountByTag = getContactCountByTag;
exports.createReminder = createReminder;
exports.getContactReminders = getContactReminders;
exports.updateReminder = updateReminder;
exports.deleteReminder = deleteReminder;
exports.getTodayRemindersCount = getTodayRemindersCount;
exports.getWeekRemindersCount = getWeekRemindersCount;
exports.getMonthRemindersCount = getMonthRemindersCount;
exports.getRegionStats = getRegionStats;
exports.getContactsByRegionPaginated = getContactsByRegionPaginated;
exports.getContactsByRegion = getContactsByRegion;
exports.getDirectReferrals = getDirectReferrals;
exports.getIndirectReferrals = getIndirectReferrals;
exports.getReferralChain = getReferralChain;
exports.getTagsForContacts = getTagsForContacts;
exports.getPersonalTagsForContacts = getPersonalTagsForContacts;
exports.getPersonalTagsStats = getPersonalTagsStats;
exports.getInteractionStatsForContacts = getInteractionStatsForContacts;
exports.getInteractionInfoForContacts = getInteractionInfoForContacts;
exports.getFieldValuesForContacts = getFieldValuesForContacts;
exports.getFieldCategories = getFieldCategories;
exports.addFieldValue = addFieldValue;
exports.deleteFieldValue = deleteFieldValue;
exports.deleteAllFieldValues = deleteAllFieldValues;
exports.getContactFieldValues = getContactFieldValues;
exports.updateFieldValue = updateFieldValue;
exports.getCompanyList = getCompanyList;
exports.createFieldCategory = createFieldCategory;
exports.getHealthStats = getHealthStats;
exports.getContactsByParentPaginated = getContactsByParentPaginated;
exports.getFilteredCounts = getFilteredCounts;
exports.getInteractionOverview = getInteractionOverview;
exports.getInteractionDistribution = getInteractionDistribution;
exports.getInteractionTimeSeries = getInteractionTimeSeries;
exports.getTagInteractionStats = getTagInteractionStats;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var timezone_1 = require("../shared/timezone");
var db_contacts_active_stats_1 = require("./db-contacts-active-stats");
var db_referrer_stats_1 = require("./db-referrer-stats");
var encryption_1 = require("./encryption");
// 联系人表需要加密的字段
var CONTACT_ENCRYPT_FIELDS = ['name', 'phone', 'wechat', 'address', 'occupation', 'title'];
// 联络记录需要加密的字段
var INTERACTION_ENCRYPT_FIELDS = ['note'];
// 字段值需要加密的字段
var FIELD_VALUE_ENCRYPT_FIELDS = ['value'];
// ==================== 工具函数 ====================
// Promise 缓存，避免并发请求重复查询
var visibleContactIdsPromiseCache = new Map();
var contactStatsPromiseCache = new Map();
var CACHE_TTL = 0; // 禁用缓存onst contactCountsCache = new Map<number, { data: { total: number, mine: number, shared: number }, timestamp: number }>();
/**
 * 轻量级获取联系人数量统计（全部、我的、共享）
 * 不需要获取所有联系人 ID，只进行 COUNT 查询
 */
function getContactCounts(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, mineResult, mine, sharingConnections, shared, sharerIds, sharedResult, total, result;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 缓存已禁用
                    console.log('[getContactCounts] 开始查询，用户ID:', parentUserId);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 2:
                    mineResult = _c.sent();
                    mine = ((_a = mineResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    return [4 /*yield*/, db
                            .select({ sharerId: schema_1.contactSharingConnections.sharerId })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 3:
                    sharingConnections = _c.sent();
                    shared = 0;
                    if (!(sharingConnections.length > 0)) return [3 /*break*/, 5];
                    sharerIds = sharingConnections.map(function (conn) { return conn.sharerId; });
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds))];
                case 4:
                    sharedResult = _c.sent();
                    shared = ((_b = sharedResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    _c.label = 5;
                case 5:
                    total = mine + shared;
                    result = { total: total, mine: mine, shared: shared };
                    console.log('[getContactCounts] 查询结果:', result);
                    // 缓存已禁用
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取用户所有可见的人脉ID列表（包括自己的 + 共享给我的）
 * @param parentUserId 用户ID
 * @returns 人脉ID数组
 */
function getAllVisibleContactIds(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var queryPromise;
        var _this = this;
        return __generator(this, function (_a) {
            // 缓存已禁用
            console.log('[getAllVisibleContactIds] 开始获取可见联系人ID，用户ID:', parentUserId);
            queryPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                var db, ownContacts, ownContactIds, contactSharingConnections, sharingConnections, sharedContactIds, sharerIds, sharerContacts, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                        case 1:
                            db = _a.sent();
                            if (!db)
                                throw new Error("Database not available");
                            if (!db)
                                return [2 /*return*/, []];
                            return [4 /*yield*/, db
                                    .select({ id: schema_1.contacts.id })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                        case 2:
                            ownContacts = _a.sent();
                            ownContactIds = ownContacts.map(function (c) { return c.id; });
                            console.log('[getAllVisibleContactIds] 自己的联系人数量:', ownContactIds.length);
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                        case 3:
                            contactSharingConnections = (_a.sent()).contactSharingConnections;
                            return [4 /*yield*/, db
                                    .select({ sharerId: contactSharingConnections.sharerId })
                                    .from(contactSharingConnections)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(contactSharingConnections.status, 'active')))];
                        case 4:
                            sharingConnections = _a.sent();
                            console.log('[getAllVisibleContactIds] 找到的共享连接数:', sharingConnections.length);
                            console.log('[getAllVisibleContactIds] 共享连接详情:', sharingConnections);
                            sharedContactIds = [];
                            sharerIds = sharingConnections.map(function (conn) { return conn.sharerId; });
                            if (!(sharerIds.length > 0)) return [3 /*break*/, 6];
                            return [4 /*yield*/, db
                                    .select({ id: schema_1.contacts.id })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds))];
                        case 5:
                            sharerContacts = _a.sent();
                            sharedContactIds = sharerContacts.map(function (c) { return c.id; });
                            console.log("[getAllVisibleContactIds] \u4E00\u6B21\u6027\u67E5\u8BE2 ".concat(sharerIds.length, " \u4E2A\u5206\u4EAB\u8005\u7684\u8054\u7CFB\u4EBA\uFF0C\u5171 ").concat(sharedContactIds.length, " \u4E2A"));
                            _a.label = 6;
                        case 6:
                            // 合并并去重
                            console.log('[getAllVisibleContactIds] 共享联系人总数:', sharedContactIds.length);
                            result = Array.from(new Set(__spreadArray(__spreadArray([], ownContactIds, true), sharedContactIds, true)));
                            console.log('[getAllVisibleContactIds] 最终可见联系人总数:', result.length);
                            return [2 /*return*/, result];
                    }
                });
            }); })();
            // 立即保存 Promise 到缓存，并发请求会共享同一个 Promise
            visibleContactIdsPromiseCache.set(parentUserId, { promise: queryPromise, timestamp: Date.now() });
            return [2 /*return*/, queryPromise];
        });
    });
}
/**
 * 获取北京时间今天的开始和结束时间戳（毫秒）
 * @returns { startOfDay, endOfDay }
 */
function getTodayRange() {
    // 获取当前 UTC 时间戳
    var now = new Date();
    var utcTimestamp = now.getTime();
    // 北京时间是 UTC+8
    var beijingOffset = 8 * 60 * 60 * 1000;
    // 转换为北京时间戳
    var beijingTimestamp = utcTimestamp + beijingOffset;
    // 计算北京时间的今天开始时刻（毫秒）
    // 方法：将北京时间戳除以一天的毫秒数，然后取整数部分，再乘以一天的毫秒数
    var oneDayMs = 24 * 60 * 60 * 1000;
    var beijingStartOfDay = Math.floor(beijingTimestamp / oneDayMs) * oneDayMs;
    // 北京时间的今天结束时刻（毫秒）
    var beijingEndOfDay = beijingStartOfDay + oneDayMs - 1;
    // 转换回 UTC 时间戳
    return {
        startOfDay: new Date(beijingStartOfDay - beijingOffset),
        endOfDay: new Date(beijingEndOfDay - beijingOffset),
    };
}
/**
 * 按照北京时间的日期差计算天数
 * @param startTimestamp 开始时间戳（毫秒）
 * @param endTimestamp 结束时间戳（毫秒）
 * @returns 天数差
 */
function calculateDaysDifference(startTimestamp, endTimestamp) {
    // 转换为北京时间 (UTC+8)
    var beijingOffset = 8 * 60 * 60 * 1000;
    // 获取开始日期的开始时刻（00:00:00）
    var startDate = new Date(startTimestamp + beijingOffset);
    startDate.setUTCHours(0, 0, 0, 0);
    // 获取结束日期的开始时刻（00:00:00）
    var endDate = new Date(endTimestamp + beijingOffset);
    endDate.setUTCHours(0, 0, 0, 0);
    // 计算日期差
    var daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff;
}
// ==================== 人脉管理 ====================
/**
 * 创建人脉
 */
function createContact(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, encryptedData, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'contacts', data, CONTACT_ENCRYPT_FIELDS)];
                case 2:
                    encryptedData = _a.sent();
                    return [4 /*yield*/, db.insert(schema_1.contacts).values(encryptedData)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 获取家长的所有人脉列表
 */
function getContactsByParent(parentUserId, searchQuery) {
    return __awaiter(this, void 0, void 0, function () {
        var db, baseContacts, searchPattern, basicFieldsContacts, fieldValuesContacts, allContacts, contactIds, linkedUsernames, linkedUsers, _i, linkedUsers_1, row, contactsWithInteractionInfo, decryptedContacts;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    if (!!searchQuery) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 2:
                    baseContacts = _a.sent();
                    return [3 /*break*/, 6];
                case 3:
                    searchPattern = "%".concat(searchQuery, "%");
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.contacts.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.contacts.title, searchPattern), (0, drizzle_orm_1.like)(schema_1.contacts.occupation, searchPattern), (0, drizzle_orm_1.like)(schema_1.contacts.phone, searchPattern))))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 4:
                    basicFieldsContacts = _a.sent();
                    return [4 /*yield*/, db.select({
                            id: schema_1.contacts.id,
                            parentUserId: schema_1.contacts.parentUserId,
                            name: schema_1.contacts.name,
                            title: schema_1.contacts.title,
                            gender: schema_1.contacts.gender,
                            birthDate: schema_1.contacts.birthDate,
                            occupation: schema_1.contacts.occupation,
                            address: schema_1.contacts.address,
                            wechat: schema_1.contacts.wechat,
                            phone: schema_1.contacts.phone,
                            createdAt: schema_1.contacts.createdAt,
                            updatedAt: schema_1.contacts.updatedAt,
                        })
                            .from(schema_1.contacts)
                            .innerJoin(schema_1.contactFieldValues, (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.like)(schema_1.contactFieldValues.value, searchPattern)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 5:
                    fieldValuesContacts = _a.sent();
                    allContacts = __spreadArray(__spreadArray([], basicFieldsContacts, true), fieldValuesContacts, true);
                    baseContacts = Array.from(new Map(allContacts.map(function (c) { return [c.id, c]; })).values());
                    // 按更新时间排序
                    baseContacts.sort(function (a, b) {
                        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                    });
                    _a.label = 6;
                case 6:
                    contactIds = baseContacts.map(function (c) { return c.id; });
                    linkedUsernames = {};
                    if (!(contactIds.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contacts.id,
                            username: schema_1.users.username,
                        })
                            .from(schema_1.contacts)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.contacts.linkedUserId, schema_1.users.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, contactIds))];
                case 7:
                    linkedUsers = _a.sent();
                    for (_i = 0, linkedUsers_1 = linkedUsers; _i < linkedUsers_1.length; _i++) {
                        row = linkedUsers_1[_i];
                        if (row.contactId && row.username) {
                            linkedUsernames[row.contactId] = row.username;
                        }
                    }
                    _a.label = 8;
                case 8: return [4 /*yield*/, Promise.all(baseContacts.map(function (contact) { return __awaiter(_this, void 0, void 0, function () {
                        var lastInteraction, daysSinceLastInteraction;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, getLastInteractionDate(contact.id)];
                                case 1:
                                    lastInteraction = _a.sent();
                                    daysSinceLastInteraction = lastInteraction
                                        ? calculateDaysDifference(lastInteraction, Date.now())
                                        : null;
                                    return [2 /*return*/, __assign(__assign({}, contact), { username: linkedUsernames[contact.id] || null, lastInteractionDate: lastInteraction, daysSinceLastInteraction: daysSinceLastInteraction })];
                            }
                        });
                    }); }))];
                case 9:
                    contactsWithInteractionInfo = _a.sent();
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'contacts', contactsWithInteractionInfo, CONTACT_ENCRYPT_FIELDS)];
                case 10:
                    decryptedContacts = _a.sent();
                    return [2 /*return*/, decryptedContacts];
            }
        });
    });
}
/**
 * 获取单个人脉详情
 */
function getContactById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, contact, fieldValues, referrer, referrerResult, decryptedContact, decryptedFieldValues;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select().from(schema_1.contacts).where((0, drizzle_orm_1.eq)(schema_1.contacts.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    if (result.length === 0)
                        return [2 /*return*/, null];
                    contact = result[0];
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldValues).where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, id))];
                case 3:
                    fieldValues = _a.sent();
                    referrer = null;
                    if (!contact.referrerId) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.select({
                            id: schema_1.contacts.id,
                            name: schema_1.contacts.name,
                            title: schema_1.contacts.title,
                        }).from(schema_1.contacts).where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contact.referrerId)).limit(1)];
                case 4:
                    referrerResult = _a.sent();
                    if (referrerResult.length > 0) {
                        referrer = referrerResult[0];
                    }
                    _a.label = 5;
                case 5: return [4 /*yield*/, (0, encryption_1.decryptFields)(db, 'contacts', contact, CONTACT_ENCRYPT_FIELDS)];
                case 6:
                    decryptedContact = _a.sent();
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'contact_field_values', fieldValues, FIELD_VALUE_ENCRYPT_FIELDS)];
                case 7:
                    decryptedFieldValues = _a.sent();
                    return [2 /*return*/, __assign(__assign({}, decryptedContact), { fieldValues: decryptedFieldValues, referrer: referrer })];
            }
        });
    });
}
/**
 * 更新人脉信息
 */
function updateContact(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, encryptedData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'contacts', data, CONTACT_ENCRYPT_FIELDS)];
                case 2:
                    encryptedData = _a.sent();
                    return [4 /*yield*/, db.update(schema_1.contacts).set(encryptedData).where((0, drizzle_orm_1.eq)(schema_1.contacts.id, id))];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除人脉
 */
function deleteContact(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    // 删除相关的标签关联、联络记录和自定义字段
                    return [4 /*yield*/, db.delete(schema_1.contactTagRelations).where((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, id))];
                case 2:
                    // 删除相关的标签关联、联络记录和自定义字段
                    _a.sent();
                    return [4 /*yield*/, db.delete(schema_1.contactInteractions).where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, id))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.delete(schema_1.contactCustomFields).where((0, drizzle_orm_1.eq)(schema_1.contactCustomFields.contactId, id))];
                case 4:
                    _a.sent();
                    // 删除人脉本身
                    return [4 /*yield*/, db.delete(schema_1.contacts).where((0, drizzle_orm_1.eq)(schema_1.contacts.id, id))];
                case 5:
                    // 删除人脉本身
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 标签管理 ====================
/**
 * 获取所有标签（用户自定义），并统计每个标签的人脉数量
 */
function getContactTags(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tags, tagsWithCount;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.contactTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId))
                            .orderBy(schema_1.contactTags.sortOrder, schema_1.contactTags.id)];
                case 2:
                    tags = _a.sent();
                    return [4 /*yield*/, Promise.all(tags.map(function (tag) { return __awaiter(_this, void 0, void 0, function () {
                            var count;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, db
                                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                            .from(schema_1.contactTagRelations)
                                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tag.id), (0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId)))];
                                    case 1:
                                        count = _b.sent();
                                        return [2 /*return*/, __assign(__assign({}, tag), { contactCount: ((_a = count[0]) === null || _a === void 0 ? void 0 : _a.count) || 0 })];
                                }
                            });
                        }); }))];
                case 3:
                    tagsWithCount = _a.sent();
                    return [2 /*return*/, tagsWithCount];
            }
        });
    });
}
/**
 * 搜索标签（模糊搜索标签名称）
 * 包括自己的标签和共享人脉的标签
 */
function searchTags(parentUserId, keyword) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownTagsQuery, ownTags, sharingConnections, sharerIds, sharedTags, sharedTagsQuery, allTags, uniqueTagsMap, _i, allTags_1, tag, uniqueTags, tagsWithCount;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    ownTagsQuery = db.select({
                        id: schema_1.contactTags.id,
                        name: schema_1.contactTags.name,
                        color: schema_1.contactTags.color,
                        isPreset: schema_1.contactTags.isPreset,
                        parentUserId: schema_1.contactTags.parentUserId,
                    }).from(schema_1.contactTags)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId), keyword ? (0, drizzle_orm_1.like)(schema_1.contactTags.name, "%".concat(keyword, "%")) : (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["1=1"], ["1=1"])))));
                    return [4 /*yield*/, ownTagsQuery];
                case 2:
                    ownTags = _a.sent();
                    return [4 /*yield*/, db.select({ sharerId: schema_1.contactSharingConnections.sharerId })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 3:
                    sharingConnections = _a.sent();
                    sharerIds = sharingConnections.map(function (c) { return c.sharerId; });
                    sharedTags = [];
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 5];
                    sharedTagsQuery = db.select({
                        id: schema_1.contactTags.id,
                        name: schema_1.contactTags.name,
                        color: schema_1.contactTags.color,
                        isPreset: schema_1.contactTags.isPreset,
                        parentUserId: schema_1.contactTags.parentUserId,
                    }).from(schema_1.contactTags)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactTags.parentUserId, sharerIds), keyword ? (0, drizzle_orm_1.like)(schema_1.contactTags.name, "%".concat(keyword, "%")) : (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["1=1"], ["1=1"])))));
                    return [4 /*yield*/, sharedTagsQuery];
                case 4:
                    sharedTags = _a.sent();
                    _a.label = 5;
                case 5:
                    allTags = __spreadArray(__spreadArray([], ownTags, true), sharedTags, true);
                    uniqueTagsMap = new Map();
                    for (_i = 0, allTags_1 = allTags; _i < allTags_1.length; _i++) {
                        tag = allTags_1[_i];
                        if (!uniqueTagsMap.has(tag.id)) {
                            uniqueTagsMap.set(tag.id, tag);
                        }
                    }
                    uniqueTags = Array.from(uniqueTagsMap.values());
                    return [4 /*yield*/, Promise.all(uniqueTags.map(function (tag) { return __awaiter(_this, void 0, void 0, function () {
                            var ownCount, sharedCount, sharedCountResult;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, db
                                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                            .from(schema_1.contactTagRelations)
                                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tag.id), (0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId)))];
                                    case 1:
                                        ownCount = _c.sent();
                                        sharedCount = 0;
                                        if (!(sharerIds.length > 0)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactTagRelations)
                                                .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tag.id), (0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds)))];
                                    case 2:
                                        sharedCountResult = _c.sent();
                                        sharedCount = ((_a = sharedCountResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                                        _c.label = 3;
                                    case 3: return [2 /*return*/, __assign(__assign({}, tag), { contactCount: (((_b = ownCount[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) + sharedCount })];
                                }
                            });
                        }); }))];
                case 6:
                    tagsWithCount = _a.sent();
                    // 5. 按人脉数量降序排序
                    return [2 /*return*/, tagsWithCount.sort(function (a, b) { return b.contactCount - a.contactCount; })];
            }
        });
    });
}
/**
 * 创建自定义标签
 */
function createContactTag(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.contactTags).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 编辑标签
 */
function updateContactTag(id, parentUserId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = {};
                    if (data.name !== undefined)
                        updateData.name = data.name;
                    if (data.color !== undefined)
                        updateData.color = data.color;
                    if (!(Object.keys(updateData).length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.update(schema_1.contactTags)
                            .set(updateData)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.id, id), (0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId)))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除自定义标签
 */
function deleteContactTag(id, parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    // 只能删除自己的标签
                    return [4 /*yield*/, db.delete(schema_1.contactTags).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.id, id), (0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId)))];
                case 2:
                    // 只能删除自己的标签
                    _a.sent();
                    // 删除相关的标签关联
                    return [4 /*yield*/, db.delete(schema_1.contactTagRelations).where((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, id))];
                case 3:
                    // 删除相关的标签关联
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量更新标签排序
 */
function updateTagsOrder(parentUserId, tagOrders) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    // 为每个标签更新sortOrder
                    return [4 /*yield*/, Promise.all(tagOrders.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                            var id = _b.id, sortOrder = _b.sortOrder;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, db.update(schema_1.contactTags)
                                            .set({ sortOrder: sortOrder })
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.id, id), (0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId)))];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    // 为每个标签更新sortOrder
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取人脉的标签列表
 */
function getContactTagsByContactId(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.contactTags.id,
                            name: schema_1.contactTags.name,
                            color: schema_1.contactTags.color,
                            isPreset: schema_1.contactTags.isPreset,
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 为人脉添加标签
 */
function addTagToContact(contactId, tagId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactTagRelations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tagId)))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        return [2 /*return*/, existing[0].id];
                    }
                    return [4 /*yield*/, db.insert(schema_1.contactTagRelations).values({ contactId: contactId, tagId: tagId })];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 移除人脉的标签
 */
function removeTagFromContact(contactId, tagId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.contactTagRelations).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tagId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 个人标签管理 ====================
/**
 * 获取人脉的个人标签列表
 */
function getPersonalTagsByContactId(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.personalContactTags.contactId, contactId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.personalContactTags.createdAt))];
            }
        });
    });
}
/**
 * 创建个人标签
 */
function createPersonalTag(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.personalContactTags).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 更新个人标签
 */
function updatePersonalTag(id, parentUserId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = {};
                    if (data.name !== undefined)
                        updateData.name = data.name;
                    if (data.color !== undefined)
                        updateData.color = data.color;
                    if (!(Object.keys(updateData).length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.update(schema_1.personalContactTags)
                            .set(updateData)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personalContactTags.id, id), (0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, parentUserId)))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除个人标签
 */
function deletePersonalTag(id, parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.personalContactTags).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personalContactTags.id, id), (0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, parentUserId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 联络记录 ====================
/**
 * 记录一次联络
 */
function createContactInteraction(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, encryptedData, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'contact_interactions', data, INTERACTION_ENCRYPT_FIELDS)];
                case 2:
                    encryptedData = _a.sent();
                    return [4 /*yield*/, db.insert(schema_1.contactInteractions).values(encryptedData)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 删除联络记录
 */
function deleteContactInteraction(interactionId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.contactInteractions).where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.id, interactionId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新联络记录
 */
function updateContactInteraction(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = {};
                    if (data.interactionDate !== undefined) {
                        updateData.interactionDate = data.interactionDate;
                    }
                    if (data.note !== undefined) {
                        updateData.note = data.note;
                    }
                    return [4 /*yield*/, db.update(schema_1.contactInteractions)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.id, data.id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查今天是否已经记录过联络
 * @param contactId 人脉ID
 * @returns true 表示今天已记录，false 表示今天未记录
 */
function hasTodayInteraction(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, startOfDay, endOfDay, formatMySQLDatetime, startTimeStr, endTimeStr, result;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a = getTodayRange(), startOfDay = _a.startOfDay, endOfDay = _a.endOfDay;
                    formatMySQLDatetime = function (date) {
                        var year = date.getFullYear();
                        var month = String(date.getMonth() + 1).padStart(2, '0');
                        var day = String(date.getDate()).padStart(2, '0');
                        var hours = String(date.getHours()).padStart(2, '0');
                        var minutes = String(date.getMinutes()).padStart(2, '0');
                        var seconds = String(date.getSeconds()).padStart(2, '0');
                        return "".concat(year, "-").concat(month, "-").concat(day, " ").concat(hours, ":").concat(minutes, ":").concat(seconds);
                    };
                    startTimeStr = formatMySQLDatetime(startOfDay);
                    endTimeStr = formatMySQLDatetime(endOfDay);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contactId), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, startTimeStr), (0, drizzle_orm_1.lt)(schema_1.contactInteractions.interactionDate, endTimeStr)))
                            .limit(1)];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, result.length > 0];
            }
        });
    });
}
/**
 * 获取人脉的联络历史
 */
function getContactInteractions(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contactId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactInteractions.interactionDate))];
            }
        });
    });
}
/**
 * 获取最后一次联络时间
 */
function getLastInteractionDate(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, interactionDate;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contactId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactInteractions.interactionDate))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    if (result.length === 0)
                        return [2 /*return*/, null];
                    interactionDate = result[0].interactionDate;
                    if (interactionDate instanceof Date) {
                        return [2 /*return*/, interactionDate.getTime()];
                    }
                    else if (typeof interactionDate === 'string') {
                        // 如果是字符串格式,转换为Date再获取时间戳
                        return [2 /*return*/, new Date(interactionDate).getTime()];
                    }
                    else if (typeof interactionDate === 'number') {
                        // 如果已经是时间戳,直接返回
                        return [2 /*return*/, interactionDate];
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
/**
 * 获取人脉的联络统计信息
 */
function getContactInteractionStats(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, contact, contactCreatedAt, interactions, totalInteractions, lastInteractionDate, daysSinceLastInteraction, daysSinceCreated, averageInteractionInterval, maxInteractionInterval, i, interval, firstInterval, now, monthStart, monthlyInteractions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))
                            .limit(1)];
                case 2:
                    contact = _a.sent();
                    if (contact.length === 0)
                        return [2 /*return*/, null];
                    contactCreatedAt = contact[0].createdAt;
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contactId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactInteractions.interactionDate))];
                case 3:
                    interactions = _a.sent();
                    totalInteractions = interactions.length;
                    lastInteractionDate = interactions.length > 0 ? interactions[0].interactionDate : null;
                    daysSinceLastInteraction = lastInteractionDate
                        ? calculateDaysDifference(new Date(lastInteractionDate).getTime(), Date.now())
                        : null;
                    daysSinceCreated = Math.floor((Date.now() - new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
                    averageInteractionInterval = totalInteractions > 0
                        ? Math.floor(daysSinceCreated / (totalInteractions + 1)) // +1 是因为包含创建时的"第一次联络"
                        : daysSinceCreated;
                    maxInteractionInterval = 0;
                    if (interactions.length > 1) {
                        for (i = 0; i < interactions.length - 1; i++) {
                            interval = Math.floor((new Date(interactions[i].interactionDate).getTime() -
                                new Date(interactions[i + 1].interactionDate).getTime()) / (1000 * 60 * 60 * 24));
                            maxInteractionInterval = Math.max(maxInteractionInterval, interval);
                        }
                        firstInterval = Math.floor((new Date(interactions[interactions.length - 1].interactionDate).getTime() -
                            new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
                        maxInteractionInterval = Math.max(maxInteractionInterval, firstInterval);
                    }
                    else if (interactions.length === 1) {
                        // 只有一次联络，最长间隔就是从创建到第一次联络
                        maxInteractionInterval = Math.floor((new Date(interactions[0].interactionDate).getTime() -
                            new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
                    }
                    else {
                        // 没有联络记录，最长间隔就是从创建到现在
                        maxInteractionInterval = daysSinceCreated;
                    }
                    now = new Date();
                    monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    monthlyInteractions = interactions.filter(function (interaction) { return new Date(interaction.interactionDate) >= monthStart; }).length;
                    return [2 /*return*/, {
                            totalInteractions: totalInteractions,
                            lastInteractionDate: lastInteractionDate,
                            daysSinceLastInteraction: daysSinceLastInteraction,
                            averageInteractionInterval: averageInteractionInterval,
                            daysSinceAdded: daysSinceCreated,
                            maxInteractionInterval: maxInteractionInterval,
                            monthlyInteractions: monthlyInteractions,
                        }];
            }
        });
    });
}
// ==================== 自定义字段管理 ====================
/**
 * 添加自定义字段
 */
function addCustomField(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.contactCustomFields).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 获取人脉的所有自定义字段
 */
function getCustomFieldsByContactId(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.contactCustomFields)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactCustomFields.contactId, contactId))];
            }
        });
    });
}
/**
 * 更新自定义字段
 */
function updateCustomField(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.contactCustomFields).set(data).where((0, drizzle_orm_1.eq)(schema_1.contactCustomFields.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除自定义字段
 */
function deleteCustomField(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.contactCustomFields).where((0, drizzle_orm_1.eq)(schema_1.contactCustomFields.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量添加自定义字段
 */
function addCustomFields(contactId, fields) {
    return __awaiter(this, void 0, void 0, function () {
        var db, fieldsWithOrder;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    if (fields.length === 0)
                        return [2 /*return*/];
                    fieldsWithOrder = fields.map(function (field, index) { return ({
                        contactId: contactId,
                        fieldName: field.fieldName,
                        fieldValue: field.fieldValue,
                        sortOrder: index,
                    }); });
                    return [4 /*yield*/, db.insert(schema_1.contactCustomFields).values(fieldsWithOrder)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取累计联络次数（自己的 + 共享联系人的联络记录总数）
 */
function getTotalInteractionCount(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _b.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))];
                case 3:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total) || 0];
            }
        });
    });
}
/**
 * 获取累计标签数量（全局标签使用次数 + 所有人脉的个人标签数）
 * 注意：统计的是标签使用次数，不是标签种类数
 * 例如："客户"标签被打给10个人脉，算作10次
 * 包含：自己的人脉标签 + 共享给自己的人脉标签
 */
function getTotalTagCount(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownGlobalTagsResult, ownGlobalTagsCount, ownPersonalTagsResult, ownPersonalTagsCount, sharingConnections, sharerIds, sharedGlobalTagsCount, sharedPersonalTagsCount, sharedGlobalTagsResult, sharedPersonalTagsResult;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _e.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId))];
                case 2:
                    ownGlobalTagsResult = _e.sent();
                    ownGlobalTagsCount = ((_a = ownGlobalTagsResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["", " IN (\n        SELECT ", " FROM ", " \n        WHERE ", " = ", "\n      )"], ["", " IN (\n        SELECT ", " FROM ", " \n        WHERE ", " = ", "\n      )"])), schema_1.personalContactTags.contactId, schema_1.contacts.id, schema_1.contacts, schema_1.contacts.parentUserId, parentUserId))];
                case 3:
                    ownPersonalTagsResult = _e.sent();
                    ownPersonalTagsCount = ((_b = ownPersonalTagsResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    return [4 /*yield*/, db.select({ sharerId: schema_1.contactSharingConnections.sharerId })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 4:
                    sharingConnections = _e.sent();
                    sharerIds = sharingConnections.map(function (c) { return c.sharerId; });
                    sharedGlobalTagsCount = 0;
                    sharedPersonalTagsCount = 0;
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactTags.parentUserId, sharerIds))];
                case 5:
                    sharedGlobalTagsResult = _e.sent();
                    sharedGlobalTagsCount = ((_c = sharedGlobalTagsResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["", " IN (\n          SELECT ", " FROM ", " \n          WHERE ", " IN (", ")\n        )"], ["", " IN (\n          SELECT ", " FROM ", " \n          WHERE ", " IN (", ")\n        )"])), schema_1.personalContactTags.contactId, schema_1.contacts.id, schema_1.contacts, schema_1.contacts.parentUserId, drizzle_orm_1.sql.join(sharerIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject([", "], [", "]))))))];
                case 6:
                    sharedPersonalTagsResult = _e.sent();
                    sharedPersonalTagsCount = ((_d = sharedPersonalTagsResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0;
                    _e.label = 7;
                case 7: return [2 /*return*/, ownGlobalTagsCount + ownPersonalTagsCount + sharedGlobalTagsCount + sharedPersonalTagsCount];
            }
        });
    });
}
/**
 * 获取账目总数（用户参与的所有账本的账目记录总数）
 */
function getTotalLedgerEntries(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, userLedgers, ledgerIds, ledgerEntriesResult, total, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db
                            .select({ ledgerId: schema_1.ledgerMembers.ledgerId })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, parentUserId))];
                case 3:
                    userLedgers = _b.sent();
                    ledgerIds = userLedgers.map(function (l) { return l.ledgerId; });
                    console.log('[getTotalLedgerEntries] 用户参与的账本IDs:', ledgerIds, '用户ID:', parentUserId);
                    if (ledgerIds.length === 0) {
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.inArray)(schema_1.ledgerRecords.ledgerId, ledgerIds))];
                case 4:
                    ledgerEntriesResult = _b.sent();
                    total = Number(((_a = ledgerEntriesResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
                    console.log('[getTotalLedgerEntries] 账目总数:', total, '用户ID:', parentUserId);
                    return [2 /*return*/, total];
                case 5:
                    error_1 = _b.sent();
                    console.error('[getTotalLedgerEntries] 获取账目总数失败:', error_1);
                    return [2 /*return*/, 0];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取人脉统计数据
 */
function getContactStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var queryPromise;
        var _this = this;
        return __generator(this, function (_a) {
            // 缓存已禁用
            console.log('[getContactStats] 开始获取统计数据，用户ID:', parentUserId);
            queryPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                var db, visibleContactIds, totalContacts, thisWeekStartTimestamp, thisWeekStart, newThisWeekResult, newThisWeek, thisMonthStartTimestamp, thisMonthStart, newThisMonthResult, newThisMonth, thisYearStartTimestamp, thisYearStart, newThisYearResult, newThisYear, thirtyDaysAgo, allContacts, needsContact, _i, allContacts_1, contact, lastInteraction, tagDistResult, activeStats, todayActive, weeklyActive, monthlyActive, yearlyActive, blacklistResult, blacklistCount, oneEightyDaysAgo, ownContacts, dormantCount, _a, ownContacts_1, contact, lastInteraction, _b, contactFieldCategories, contactFieldValues, companyCategories, companyCategoryIds, companyCount, uniqueCompanies, companyResultByCategoryId, companyResultByCategoryName, sharingToMeCount, sharingToMeResult, error_2;
                var _c, _d, _e, _f, _g;
                return __generator(this, function (_h) {
                    switch (_h.label) {
                        case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                        case 1:
                            db = _h.sent();
                            if (!db)
                                throw new Error("Database not available");
                            if (!db)
                                return [2 /*return*/, {
                                        totalContacts: 0,
                                        newThisWeek: 0,
                                        newThisMonth: 0,
                                        newThisYear: 0,
                                        needsContact: 0,
                                        tagDistribution: []
                                    }];
                            return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                        case 2:
                            visibleContactIds = _h.sent();
                            // 如果没有任何人脉，直接返回空统计
                            if (visibleContactIds.length === 0) {
                                return [2 /*return*/, {
                                        totalContacts: 0,
                                        newThisWeek: 0,
                                        newThisMonth: 0,
                                        newThisYear: 0,
                                        needsContact: 0,
                                        weeklyActive: 0,
                                        monthlyActive: 0,
                                        yearlyActive: 0,
                                        blacklistCount: 0,
                                        todayActive: 0,
                                        dormantCount: 0,
                                        companyCount: 0,
                                        tagDistribution: []
                                    }];
                            }
                            totalContacts = visibleContactIds.length;
                            thisWeekStartTimestamp = (0, timezone_1.getBeijingThisWeekStart)();
                            thisWeekStart = new Date(thisWeekStartTimestamp);
                            return [4 /*yield*/, db
                                    .select({ count: (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contacts.createdAt, thisWeekStart)))];
                        case 3:
                            newThisWeekResult = _h.sent();
                            newThisWeek = ((_c = newThisWeekResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                            thisMonthStartTimestamp = (0, timezone_1.getBeijingThisMonthStart)();
                            thisMonthStart = new Date(thisMonthStartTimestamp);
                            return [4 /*yield*/, db
                                    .select({ count: (0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contacts.createdAt, thisMonthStart)))];
                        case 4:
                            newThisMonthResult = _h.sent();
                            newThisMonth = ((_d = newThisMonthResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0;
                            thisYearStartTimestamp = (0, timezone_1.getBeijingThisYearStart)();
                            thisYearStart = new Date(thisYearStartTimestamp);
                            return [4 /*yield*/, db
                                    .select({ count: (0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contacts.createdAt, thisYearStart)))];
                        case 5:
                            newThisYearResult = _h.sent();
                            newThisYear = ((_e = newThisYearResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0;
                            thirtyDaysAgo = new Date();
                            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                            return [4 /*yield*/, db
                                    .select({ id: schema_1.contacts.id })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))];
                        case 6:
                            allContacts = _h.sent();
                            needsContact = 0;
                            _i = 0, allContacts_1 = allContacts;
                            _h.label = 7;
                        case 7:
                            if (!(_i < allContacts_1.length)) return [3 /*break*/, 10];
                            contact = allContacts_1[_i];
                            return [4 /*yield*/, getLastInteractionDate(contact.id)];
                        case 8:
                            lastInteraction = _h.sent();
                            if (!lastInteraction || lastInteraction < thirtyDaysAgo) {
                                needsContact++;
                            }
                            _h.label = 9;
                        case 9:
                            _i++;
                            return [3 /*break*/, 7];
                        case 10: return [4 /*yield*/, db
                                .select({
                                tagId: schema_1.contactTags.id,
                                tagName: schema_1.contactTags.name,
                                count: (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["count(", ")"], ["count(", ")"])), schema_1.contactTagRelations.contactId)
                            })
                                .from(schema_1.contactTags)
                                .leftJoin(schema_1.contactTagRelations, (0, drizzle_orm_1.eq)(schema_1.contactTags.id, schema_1.contactTagRelations.tagId))
                                .leftJoin(schema_1.contacts, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id), (0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId)))
                                .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId))
                                .groupBy(schema_1.contactTags.id, schema_1.contactTags.name)];
                        case 11:
                            tagDistResult = _h.sent();
                            // 使用新的活跃统计模块（统计全部人脉：我的+共享）
                            console.log('[获取活跃统计] 开始查询...');
                            console.log('[获取活跃统计] 可见人脉总数:', visibleContactIds.length);
                            return [4 /*yield*/, (0, db_contacts_active_stats_1.getAllActiveStats)(parentUserId)];
                        case 12:
                            activeStats = _h.sent();
                            console.log('[获取活跃统计] 结果:', activeStats);
                            console.log('[获取活跃统计] 今年活跃:', activeStats.yearlyActive, '人（全部人脉）');
                            todayActive = activeStats.todayActive, weeklyActive = activeStats.weeklyActive, monthlyActive = activeStats.monthlyActive, yearlyActive = activeStats.yearlyActive;
                            return [4 /*yield*/, db
                                    .select({ count: (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.isBlacklisted, true)))];
                        case 13:
                            blacklistResult = _h.sent();
                            blacklistCount = ((_f = blacklistResult[0]) === null || _f === void 0 ? void 0 : _f.count) || 0;
                            oneEightyDaysAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
                            return [4 /*yield*/, db
                                    .select({ id: schema_1.contacts.id })
                                    .from(schema_1.contacts)
                                    .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                        case 14:
                            ownContacts = _h.sent();
                            dormantCount = 0;
                            _a = 0, ownContacts_1 = ownContacts;
                            _h.label = 15;
                        case 15:
                            if (!(_a < ownContacts_1.length)) return [3 /*break*/, 18];
                            contact = ownContacts_1[_a];
                            return [4 /*yield*/, getLastInteractionDate(contact.id)];
                        case 16:
                            lastInteraction = _h.sent();
                            if (!lastInteraction || lastInteraction < oneEightyDaysAgo) {
                                dormantCount++;
                            }
                            _h.label = 17;
                        case 17:
                            _a++;
                            return [3 /*break*/, 15];
                        case 18: return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                        case 19:
                            _b = _h.sent(), contactFieldCategories = _b.contactFieldCategories, contactFieldValues = _b.contactFieldValues;
                            return [4 /*yield*/, db
                                    .select({ id: contactFieldCategories.id })
                                    .from(contactFieldCategories)
                                    .where((0, drizzle_orm_1.eq)(contactFieldCategories.name, '公司名称'))];
                        case 20:
                            companyCategories = _h.sent();
                            console.log('[getContactStats] 公司字段分类查询结果:', companyCategories);
                            companyCategoryIds = companyCategories.map(function (c) { return c.id; });
                            console.log('[getContactStats] companyCategoryIds:', companyCategoryIds);
                            companyCount = 0;
                            uniqueCompanies = new Set();
                            if (!(companyCategoryIds.length > 0)) return [3 /*break*/, 22];
                            return [4 /*yield*/, db
                                    .select({
                                    companyName: contactFieldValues.value
                                })
                                    .from(contactFieldValues)
                                    .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(contactFieldValues.contactId, schema_1.contacts.id))
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.inArray)(contactFieldValues.categoryId, companyCategoryIds), (0, drizzle_orm_1.isNotNull)(contactFieldValues.value), (0, drizzle_orm_1.ne)(contactFieldValues.value, '')))];
                        case 21:
                            companyResultByCategoryId = _h.sent();
                            companyResultByCategoryId.forEach(function (r) { return uniqueCompanies.add(r.companyName); });
                            console.log('[getContactStats] 通过categoryId查询到公司数:', companyResultByCategoryId.length);
                            _h.label = 22;
                        case 22: return [4 /*yield*/, db
                                .select({
                                companyName: contactFieldValues.value
                            })
                                .from(contactFieldValues)
                                .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(contactFieldValues.contactId, schema_1.contacts.id))
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.eq)(contactFieldValues.categoryName, '公司名称'), (0, drizzle_orm_1.isNotNull)(contactFieldValues.value), (0, drizzle_orm_1.ne)(contactFieldValues.value, '')))];
                        case 23:
                            companyResultByCategoryName = _h.sent();
                            companyResultByCategoryName.forEach(function (r) { return uniqueCompanies.add(r.companyName); });
                            console.log('[getContactStats] 通过categoryName查询到公司数:', companyResultByCategoryName.length);
                            companyCount = uniqueCompanies.size;
                            console.log('[getContactStats] 公司统计:', {
                                companyCategoryIds: companyCategoryIds,
                                uniqueCompanyCount: companyCount,
                                sampleCompanies: Array.from(uniqueCompanies).slice(0, 5)
                            });
                            console.log('[getContactStats] 统计结果:', { totalContacts: totalContacts, newThisWeek: newThisWeek, newThisMonth: newThisMonth, newThisYear: newThisYear });
                            sharingToMeCount = 0;
                            _h.label = 24;
                        case 24:
                            _h.trys.push([24, 26, , 27]);
                            return [4 /*yield*/, db
                                    .select({ count: (0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["count(distinct ", ")"], ["count(distinct ", ")"])), schema_1.contactSharingConnections.sharerId) })
                                    .from(schema_1.contactSharingConnections)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                        case 25:
                            sharingToMeResult = _h.sent();
                            sharingToMeCount = Number(((_g = sharingToMeResult[0]) === null || _g === void 0 ? void 0 : _g.count) || 0);
                            console.log('[getContactStats] 共享给我的人数:', sharingToMeCount, '用户ID:', parentUserId);
                            return [3 /*break*/, 27];
                        case 26:
                            error_2 = _h.sent();
                            console.error('[获取共享给我的人数失败]', error_2);
                            return [3 /*break*/, 27];
                        case 27: return [2 /*return*/, {
                                totalContacts: totalContacts,
                                newThisWeek: newThisWeek,
                                newThisMonth: newThisMonth,
                                newThisYear: newThisYear,
                                needsContact: needsContact,
                                weeklyActive: weeklyActive,
                                monthlyActive: monthlyActive,
                                yearlyActive: yearlyActive,
                                blacklistCount: blacklistCount,
                                todayActive: todayActive,
                                dormantCount: dormantCount,
                                companyCount: companyCount,
                                sharingToMeCount: sharingToMeCount,
                                tagDistribution: tagDistResult
                            }];
                    }
                });
            }); })();
            // 存储到缓存
            contactStatsPromiseCache.set(parentUserId, {
                promise: queryPromise,
                timestamp: Date.now()
            });
            return [2 /*return*/, queryPromise];
        });
    });
}
/**
 * 获取第一个人脉的创建日期
 */
function getFirstContactCreatedAt(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, firstContact;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select({ createdAt: schema_1.contacts.createdAt })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))
                            .orderBy(schema_1.contacts.createdAt)
                            .limit(1)];
                case 2:
                    firstContact = _a.sent();
                    return [2 /*return*/, firstContact.length > 0 ? firstContact[0].createdAt : null];
            }
        });
    });
}
/**
 * 获取人脉关系健康度汇总统计
 */
function getContactsOverviewStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, allContacts, totalContacts, allInteractions, contactLastInteractionMap, _i, allInteractions_1, interaction, contactTagsResult, contactTagsMap, _a, contactTagsResult_1, row, now, sevenDaysAgo, thirtyDaysAgo, ninetyDaysAgo, oneEightyDaysAgo, needsAttentionCount, _b, allContacts_2, contact, lastInteractionDate, tags, thresholdDate, startOfMonthTimestamp, monthlyActiveContactIds, _c, allInteractions_2, interaction, monthlyActiveCount, totalIntervalDays, contactsWithInteractions, _loop_1, _d, allContacts_3, contact, averageInteractionInterval, weekStartTs, beijingOffset, beijingNow, dayOfWeek, daysPassed, myOwnContacts, myOwnContactIds, dailyContactMap, _e, allInteractions_3, interaction, beijingDate, dateStr, totalDailyContacts, _f, dailyContactMap_1, _g, contactSet, dailyContactFrequency, totalTagCount, _h, contactTagsMap_1, _j, tags, averageTagCount;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _k.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _k.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, {
                                totalContacts: 0,
                                averageInteractionInterval: 0,
                                needsAttentionCount: 0,
                                monthlyActiveCount: 0,
                                dailyContactFrequency: 0,
                                averageTagCount: 0,
                            }];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))];
                case 3:
                    allContacts = _k.sent();
                    totalContacts = allContacts.length;
                    return [4 /*yield*/, db.select({
                            id: schema_1.contactInteractions.id,
                            contactId: schema_1.contactInteractions.contactId,
                            interactionDate: schema_1.contactInteractions.interactionDate,
                            note: schema_1.contactInteractions.note,
                            createdAt: schema_1.contactInteractions.createdAt,
                        }).from(schema_1.contactInteractions)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactInteractions.interactionDate))];
                case 4:
                    allInteractions = _k.sent();
                    contactLastInteractionMap = new Map();
                    for (_i = 0, allInteractions_1 = allInteractions; _i < allInteractions_1.length; _i++) {
                        interaction = allInteractions_1[_i];
                        if (!contactLastInteractionMap.has(interaction.contactId)) {
                            contactLastInteractionMap.set(interaction.contactId, interaction.interactionDate);
                        }
                    }
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contactTagRelations.contactId,
                            tagName: schema_1.contactTags.name,
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))];
                case 5:
                    contactTagsResult = _k.sent();
                    contactTagsMap = new Map();
                    for (_a = 0, contactTagsResult_1 = contactTagsResult; _a < contactTagsResult_1.length; _a++) {
                        row = contactTagsResult_1[_a];
                        if (!contactTagsMap.has(row.contactId)) {
                            contactTagsMap.set(row.contactId, []);
                        }
                        contactTagsMap.get(row.contactId).push(row.tagName);
                    }
                    now = Date.now();
                    sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
                    thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
                    ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
                    oneEightyDaysAgo = now - 180 * 24 * 60 * 60 * 1000;
                    needsAttentionCount = 0;
                    for (_b = 0, allContacts_2 = allContacts; _b < allContacts_2.length; _b++) {
                        contact = allContacts_2[_b];
                        lastInteractionDate = contactLastInteractionMap.get(contact.id);
                        tags = contactTagsMap.get(contact.id) || [];
                        thresholdDate = void 0;
                        if (tags.includes('周关注')) {
                            thresholdDate = sevenDaysAgo;
                        }
                        else if (tags.includes('月关注')) {
                            thresholdDate = thirtyDaysAgo;
                        }
                        else if (tags.includes('季关注')) {
                            thresholdDate = ninetyDaysAgo;
                        }
                        else {
                            thresholdDate = oneEightyDaysAgo;
                        }
                        // 判断是否需要关注
                        if (!lastInteractionDate || lastInteractionDate < thresholdDate) {
                            needsAttentionCount++;
                        }
                    }
                    startOfMonthTimestamp = (0, timezone_1.getBeijingThisMonthStart)();
                    monthlyActiveContactIds = new Set();
                    for (_c = 0, allInteractions_2 = allInteractions; _c < allInteractions_2.length; _c++) {
                        interaction = allInteractions_2[_c];
                        if (interaction.interactionDate >= startOfMonthTimestamp) {
                            monthlyActiveContactIds.add(interaction.contactId);
                        }
                    }
                    monthlyActiveCount = monthlyActiveContactIds.size;
                    totalIntervalDays = 0;
                    contactsWithInteractions = 0;
                    _loop_1 = function (contact) {
                        var contactInteractionsList = allInteractions.filter(function (i) { return i.contactId === contact.id; });
                        if (contactInteractionsList.length >= 2) {
                            // 计算该人脉的平均联络间隔
                            var totalInterval = 0;
                            for (var i = 0; i < contactInteractionsList.length - 1; i++) {
                                var interval = contactInteractionsList[i].interactionDate - contactInteractionsList[i + 1].interactionDate;
                                totalInterval += interval;
                            }
                            var avgInterval = totalInterval / (contactInteractionsList.length - 1);
                            totalIntervalDays += avgInterval / (24 * 60 * 60 * 1000);
                            contactsWithInteractions++;
                        }
                    };
                    for (_d = 0, allContacts_3 = allContacts; _d < allContacts_3.length; _d++) {
                        contact = allContacts_3[_d];
                        _loop_1(contact);
                    }
                    averageInteractionInterval = contactsWithInteractions > 0
                        ? Math.round(totalIntervalDays / contactsWithInteractions)
                        : 0;
                    weekStartTs = (0, timezone_1.getBeijingThisWeekStart)();
                    beijingOffset = 8 * 60 * 60 * 1000;
                    beijingNow = new Date(now + beijingOffset);
                    dayOfWeek = beijingNow.getUTCDay();
                    daysPassed = dayOfWeek === 0 ? 7 : dayOfWeek;
                    return [4 /*yield*/, db.select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 6:
                    myOwnContacts = _k.sent();
                    myOwnContactIds = new Set(myOwnContacts.map(function (c) { return c.id; }));
                    dailyContactMap = new Map();
                    for (_e = 0, allInteractions_3 = allInteractions; _e < allInteractions_3.length; _e++) {
                        interaction = allInteractions_3[_e];
                        // 只统计自己的联系人的联络记录，且在本周内
                        if (interaction.interactionDate >= weekStartTs && myOwnContactIds.has(interaction.contactId)) {
                            beijingDate = new Date(interaction.interactionDate + beijingOffset);
                            dateStr = beijingDate.toISOString().slice(0, 10);
                            if (!dailyContactMap.has(dateStr)) {
                                dailyContactMap.set(dateStr, new Set());
                            }
                            dailyContactMap.get(dateStr).add(interaction.contactId);
                        }
                    }
                    totalDailyContacts = 0;
                    for (_f = 0, dailyContactMap_1 = dailyContactMap; _f < dailyContactMap_1.length; _f++) {
                        _g = dailyContactMap_1[_f], contactSet = _g[1];
                        totalDailyContacts += contactSet.size;
                    }
                    dailyContactFrequency = daysPassed > 0
                        ? Math.round((totalDailyContacts / daysPassed) * 10) / 10 // 保留1位小数
                        : 0;
                    totalTagCount = 0;
                    for (_h = 0, contactTagsMap_1 = contactTagsMap; _h < contactTagsMap_1.length; _h++) {
                        _j = contactTagsMap_1[_h], tags = _j[1];
                        totalTagCount += tags.length;
                    }
                    averageTagCount = totalContacts > 0
                        ? Math.round((totalTagCount / totalContacts) * 10) / 10 // 保留1位小数
                        : 0;
                    return [2 /*return*/, {
                            totalContacts: totalContacts,
                            averageInteractionInterval: averageInteractionInterval,
                            needsAttentionCount: needsAttentionCount,
                            monthlyActiveCount: monthlyActiveCount,
                            dailyContactFrequency: dailyContactFrequency,
                            averageTagCount: averageTagCount,
                        }];
            }
        });
    });
}
// ==================== 人脉标签管理 ====================
/**
 * 更新人脉的标签
 */
function updateContactTags(contactId, tags) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.update(schema_1.contacts)
                            .set({ tags: tags.length > 0 ? tags : null })
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].affectedRows > 0];
            }
        });
    });
}
/**
 * 获取具有特定标签的人脉列表
 */
function getContactsByTag(parentUserId, tag) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["JSON_CONTAINS(", ", JSON_QUOTE(", "))"], ["JSON_CONTAINS(", ", JSON_QUOTE(", "))"])), schema_1.contacts.tags, tag)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取特定标签的人脉数量
 */
function getContactCountByTag(parentUserId, tag) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["JSON_CONTAINS(", ", JSON_QUOTE(", "))"], ["JSON_CONTAINS(", ", JSON_QUOTE(", "))"])), schema_1.contacts.tags, tag)))];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
// ==================== 提醒管理 ====================
/**
 * 创建提醒
 */
function createReminder(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, reminderDate, rest, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    reminderDate = data.reminderDate, rest = __rest(data, ["reminderDate"]);
                    return [4 /*yield*/, db.insert(schema_1.reminders).values(__assign(__assign({}, rest), { reminderTime: reminderDate }))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 获取某个人脉的所有提醒
 */
function getContactReminders(contactId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.reminders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId)))
                            .orderBy(schema_1.reminders.reminderTime)];
            }
        });
    });
}
/**
 * 更新提醒
 */
function updateReminder(id, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.update(schema_1.reminders)
                            .set(data)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.id, id), (0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId)))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].affectedRows > 0];
            }
        });
    });
}
/**
 * 删除提醒
 */
function deleteReminder(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.delete(schema_1.reminders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.id, id), (0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId)))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].affectedRows > 0];
            }
        });
    });
}
/**
 * 获取今日提醒的人数（去重）
 */
function getTodayRemindersCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, today, tomorrow, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    today = new Date((0, timezone_1.getBeijingTodayStart)());
                    tomorrow = new Date((0, timezone_1.getBeijingTodayEnd)() + 1);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.reminders.contactId) })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_1.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_1.gte)(schema_1.reminders.reminderTime, today), (0, drizzle_orm_1.lt)(schema_1.reminders.reminderTime, tomorrow)))];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * 获取本周提醒的人数（去重）
 */
function getWeekRemindersCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, monday, nextMonday, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    monday = new Date((0, timezone_1.getBeijingThisWeekStart)());
                    nextMonday = new Date(monday);
                    nextMonday.setDate(monday.getDate() + 7);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.reminders.contactId) })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_1.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_1.gte)(schema_1.reminders.reminderTime, monday), (0, drizzle_orm_1.lt)(schema_1.reminders.reminderTime, nextMonday)))];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * 获取本月提醒的人数（去重）
 */
function getMonthRemindersCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, firstDayOfMonth, firstDayOfNextMonth, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    firstDayOfMonth = new Date((0, timezone_1.getBeijingThisMonthStart)());
                    firstDayOfNextMonth = new Date(firstDayOfMonth);
                    firstDayOfNextMonth.setMonth(firstDayOfNextMonth.getMonth() + 1);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.reminders.contactId) })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_1.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_1.gte)(schema_1.reminders.reminderTime, firstDayOfMonth), (0, drizzle_orm_1.lt)(schema_1.reminders.reminderTime, firstDayOfNextMonth)))];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * 获取所有省份的人数统计（包含自己的人脉 + 共享给我的人脉）
 */
function getRegionStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownContacts, sharedContacts, ownOverseas, sharedOverseas, ownOther, sharedOther, regionMap, _i, ownContacts_2, r, region, _a, sharedContacts_1, r, region, currentCount, overseasCount, otherCount, allProvinces, normalRegions, finalResults;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select({
                            name: schema_1.contacts.region,
                            value: (0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.isNotNull)(schema_1.contacts.region), (0, drizzle_orm_1.ne)(schema_1.contacts.region, ''), (0, drizzle_orm_1.ne)(schema_1.contacts.region, '海外') // 排除海外人脉
                        ))
                            .groupBy(schema_1.contacts.region)];
                case 2:
                    ownContacts = _b.sent();
                    return [4 /*yield*/, db.select({
                            name: schema_1.contacts.region,
                            value: (0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .innerJoin(schema_1.contactSharingConnections, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.sharerId, schema_1.contacts.parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(schema_1.contacts.region), (0, drizzle_orm_1.ne)(schema_1.contacts.region, ''), (0, drizzle_orm_1.ne)(schema_1.contacts.region, '海外') // 排除海外人脉
                        ))
                            .groupBy(schema_1.contacts.region)];
                case 3:
                    sharedContacts = _b.sent();
                    return [4 /*yield*/, db.select({
                            value: (0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, '海外')))];
                case 4:
                    ownOverseas = (_b.sent())[0];
                    return [4 /*yield*/, db.select({
                            value: (0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .innerJoin(schema_1.contactSharingConnections, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.sharerId, schema_1.contacts.parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.region, '海外'))];
                case 5:
                    sharedOverseas = (_b.sent())[0];
                    return [4 /*yield*/, db.select({
                            value: (0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.contacts.region), (0, drizzle_orm_1.eq)(schema_1.contacts.region, ''))))];
                case 6:
                    ownOther = (_b.sent())[0];
                    return [4 /*yield*/, db.select({
                            value: (0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .innerJoin(schema_1.contactSharingConnections, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.sharerId, schema_1.contacts.parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))
                            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.contacts.region), (0, drizzle_orm_1.eq)(schema_1.contacts.region, '')))];
                case 7:
                    sharedOther = (_b.sent())[0];
                    regionMap = new Map();
                    // 添加自己的人脉
                    for (_i = 0, ownContacts_2 = ownContacts; _i < ownContacts_2.length; _i++) {
                        r = ownContacts_2[_i];
                        region = r.name || '';
                        regionMap.set(region, Number(r.value) || 0);
                    }
                    // 添加共享给我的人脉
                    for (_a = 0, sharedContacts_1 = sharedContacts; _a < sharedContacts_1.length; _a++) {
                        r = sharedContacts_1[_a];
                        region = r.name || '';
                        currentCount = regionMap.get(region) || 0;
                        regionMap.set(region, currentCount + (Number(r.value) || 0));
                    }
                    overseasCount = (Number(ownOverseas === null || ownOverseas === void 0 ? void 0 : ownOverseas.value) || 0) + (Number(sharedOverseas === null || sharedOverseas === void 0 ? void 0 : sharedOverseas.value) || 0);
                    otherCount = (Number(ownOther === null || ownOther === void 0 ? void 0 : ownOther.value) || 0) + (Number(sharedOther === null || sharedOther === void 0 ? void 0 : sharedOther.value) || 0);
                    allProvinces = [
                        '北京', '天津', '上海', '重庆',
                        '河北', '山西', '辽宁', '吉林', '黑龙江',
                        '江苏', '浙江', '安徽', '福建', '江西', '山东',
                        '河南', '湖北', '湖南', '广东', '海南',
                        '四川', '贵州', '云南', '陕西', '甘肃', '青海',
                        '内蒙古', '广西', '西藏', '宁夏', '新疆',
                        '台湾', '香港', '澳门'
                    ];
                    normalRegions = allProvinces.map(function (province) { return ({
                        name: province,
                        value: regionMap.get(province) || 0
                    }); });
                    // 按人脉数量降序排列
                    normalRegions.sort(function (a, b) { return b.value - a.value; });
                    finalResults = __spreadArray([], normalRegions, true);
                    finalResults.push({ name: '海外', value: overseasCount });
                    finalResults.push({ name: '其他', value: otherCount });
                    return [2 /*return*/, finalResults];
            }
        });
    });
}
/**
 * 按区域筛选人脉列表（分页版本）
 */
function getContactsByRegionPaginated(parentUserId_1, region_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, region, page, pageSize) {
        var db, offset, totalOwnResult, totalOwnCount, sharingConnections, sharerIds, totalSharedCount, totalSharedResult, total, ownContacts, sharedContacts, remainingSize, sharedOffset, allContacts, contactsWithFlags, contactIds, _a, allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap, referrerStatsMap, contactsWithDetails, hasMore;
        var _this = this;
        var _b, _c;
        if (page === void 0) { page = 1; }
        if (pageSize === void 0) { pageSize = 50; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db)
                        throw new Error("Database not available");
                    offset = (page - 1) * pageSize;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))];
                case 2:
                    totalOwnResult = _d.sent();
                    totalOwnCount = ((_b = totalOwnResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    return [4 /*yield*/, db.select({
                            sharerId: schema_1.contactSharingConnections.sharerId
                        })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 3:
                    sharingConnections = _d.sent();
                    sharerIds = sharingConnections.map(function (c) { return c.sharerId; });
                    totalSharedCount = 0;
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))];
                case 4:
                    totalSharedResult = _d.sent();
                    totalSharedCount = ((_c = totalSharedResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                    _d.label = 5;
                case 5:
                    total = totalOwnCount + totalSharedCount;
                    return [4 /*yield*/, db.select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))
                            .limit(pageSize)
                            .offset(offset)];
                case 6:
                    ownContacts = _d.sent();
                    sharedContacts = [];
                    remainingSize = pageSize - ownContacts.length;
                    if (!(remainingSize > 0 && sharerIds.length > 0)) return [3 /*break*/, 8];
                    sharedOffset = Math.max(0, offset - totalOwnCount);
                    return [4 /*yield*/, db.select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))
                            .limit(remainingSize)
                            .offset(sharedOffset)];
                case 7:
                    sharedContacts = _d.sent();
                    _d.label = 8;
                case 8:
                    allContacts = __spreadArray(__spreadArray([], ownContacts, true), sharedContacts, true);
                    return [4 /*yield*/, Promise.all(allContacts.map(function (contact) { return __awaiter(_this, void 0, void 0, function () {
                            var isShared, sharer;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        isShared = !ownContacts.find(function (c) { return c.id === contact.id; });
                                        if (!isShared) return [3 /*break*/, 2];
                                        return [4 /*yield*/, db.select({
                                                username: schema_1.users.username
                                            })
                                                .from(schema_1.users)
                                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, contact.parentUserId))
                                                .limit(1)];
                                    case 1:
                                        sharer = _b.sent();
                                        return [2 /*return*/, __assign(__assign({}, contact), { isShared: true, sharerName: ((_a = sharer[0]) === null || _a === void 0 ? void 0 : _a.username) || '未知', sharerUserId: contact.parentUserId })];
                                    case 2: return [2 /*return*/, __assign(__assign({}, contact), { isShared: false, sharerName: null, sharerUserId: null })];
                                }
                            });
                        }); }))];
                case 9:
                    contactsWithFlags = _d.sent();
                    contactIds = contactsWithFlags.map(function (c) { return c.id; });
                    return [4 /*yield*/, Promise.all([
                            (0, db_referrer_stats_1.getReferrerStats)(parentUserId).catch(function () { return []; }),
                            getTagsForContacts(contactIds),
                            getPersonalTagsForContacts(contactIds),
                            getInteractionStatsForContacts(contactIds),
                            getInteractionInfoForContacts(contactIds),
                            getFieldValuesForContacts(contactIds),
                        ])];
                case 10:
                    _a = _d.sent(), allReferrerStats = _a[0], tagsMap = _a[1], personalTagsMap = _a[2], interactionStatsMap = _a[3], interactionInfoMap = _a[4], fieldValuesMap = _a[5];
                    referrerStatsMap = new Map(allReferrerStats.map(function (stat) { return [stat.contactId, stat]; }));
                    contactsWithDetails = contactsWithFlags.map(function (contact) {
                        var tags = tagsMap.get(contact.id) || [];
                        var personalTags = personalTagsMap.get(contact.id) || [];
                        var interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
                        var interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
                        var referrerStats = referrerStatsMap.get(contact.id) || null;
                        var fieldValues = fieldValuesMap.get(contact.id) || [];
                        return __assign(__assign({}, contact), { tags: tags, personalTags: personalTags, fieldValues: fieldValues, lastInteractionDate: interactionInfo.lastInteraction, daysSinceLastInteraction: interactionInfo.lastInteraction
                                ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
                                : null, hasTodayInteraction: interactionInfo.hasTodayInteraction, hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined, totalInteractions: (interactionStats === null || interactionStats === void 0 ? void 0 : interactionStats.totalInteractions) || 0, directReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.directReferrals) || 0, indirectReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.indirectReferrals) || 0 });
                    });
                    hasMore = offset + contactsWithDetails.length < total;
                    return [2 /*return*/, {
                            total: total,
                            contacts: contactsWithDetails,
                            hasMore: hasMore,
                            page: page,
                            pageSize: pageSize,
                        }];
            }
        });
    });
}
/**
 * 按区域筛选人脉列表
 */
function getContactsByRegion(parentUserId, region) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownContacts, sharingConnections, sharerIds, sharedContacts, ownContactsWithFlag, sharedContactsWithFlag, allContacts, contactIds, _a, allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap, referrerStatsMap, contactsWithDetails;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 2:
                    ownContacts = _b.sent();
                    return [4 /*yield*/, db.select({
                            sharerId: schema_1.contactSharingConnections.sharerId
                        })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 3:
                    sharingConnections = _b.sent();
                    sharerIds = sharingConnections.map(function (c) { return c.sharerId; });
                    sharedContacts = [];
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 4:
                    sharedContacts = _b.sent();
                    _b.label = 5;
                case 5:
                    ownContactsWithFlag = ownContacts.map(function (c) { return (__assign(__assign({}, c), { isShared: false, sharerName: null, sharerUserId: null })); });
                    return [4 /*yield*/, Promise.all(sharedContacts.map(function (contact) { return __awaiter(_this, void 0, void 0, function () {
                            var sharer;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, db.select({
                                            username: schema_1.users.username
                                        })
                                            .from(schema_1.users)
                                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, contact.parentUserId))
                                            .limit(1)];
                                    case 1:
                                        sharer = _b.sent();
                                        return [2 /*return*/, __assign(__assign({}, contact), { isShared: true, sharerName: ((_a = sharer[0]) === null || _a === void 0 ? void 0 : _a.username) || '未知', sharerUserId: contact.parentUserId })];
                                }
                            });
                        }); }))];
                case 6:
                    sharedContactsWithFlag = _b.sent();
                    allContacts = __spreadArray(__spreadArray([], ownContactsWithFlag, true), sharedContactsWithFlag, true);
                    contactIds = allContacts.map(function (c) { return c.id; });
                    return [4 /*yield*/, Promise.all([
                            (0, db_referrer_stats_1.getReferrerStats)(parentUserId).catch(function () { return []; }),
                            getTagsForContacts(contactIds),
                            getPersonalTagsForContacts(contactIds),
                            getInteractionStatsForContacts(contactIds),
                            getInteractionInfoForContacts(contactIds),
                            getFieldValuesForContacts(contactIds),
                        ])];
                case 7:
                    _a = _b.sent(), allReferrerStats = _a[0], tagsMap = _a[1], personalTagsMap = _a[2], interactionStatsMap = _a[3], interactionInfoMap = _a[4], fieldValuesMap = _a[5];
                    referrerStatsMap = new Map(allReferrerStats.map(function (stat) { return [stat.contactId, stat]; }));
                    contactsWithDetails = allContacts.map(function (contact) {
                        var tags = tagsMap.get(contact.id) || [];
                        var personalTags = personalTagsMap.get(contact.id) || [];
                        var interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
                        var interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
                        var referrerStats = referrerStatsMap.get(contact.id) || null;
                        var fieldValues = fieldValuesMap.get(contact.id) || [];
                        return __assign(__assign({}, contact), { tags: tags, personalTags: personalTags, fieldValues: fieldValues, lastInteractionDate: interactionInfo.lastInteraction, daysSinceLastInteraction: interactionInfo.lastInteraction
                                ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
                                : null, hasTodayInteraction: interactionInfo.hasTodayInteraction, hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined, totalInteractions: (interactionStats === null || interactionStats === void 0 ? void 0 : interactionStats.totalInteractions) || 0, directReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.directReferrals) || 0, indirectReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.indirectReferrals) || 0 });
                    });
                    return [2 /*return*/, contactsWithDetails];
            }
        });
    });
}
/**
 * 获取直接推荐的人脉列表
 */
function getDirectReferrals(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select({
                            id: schema_1.contacts.id,
                            name: schema_1.contacts.name,
                            title: schema_1.contacts.title,
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.referrerId, contactId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取间接推荐的人脉列表（按层级）
 */
function getIndirectReferrals(contactId_1) {
    return __awaiter(this, arguments, void 0, function (contactId, maxLevel) {
        var db, result, visited, queue, current, directReferrals, _i, directReferrals_1, referral, _a, directReferrals_2, referral;
        if (maxLevel === void 0) { maxLevel = 10; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    result = [];
                    visited = new Set();
                    queue = [
                        { id: contactId, level: 0, referrerName: "" }
                    ];
                    _b.label = 2;
                case 2:
                    if (!(queue.length > 0)) return [3 /*break*/, 4];
                    current = queue.shift();
                    if (!current || current.level >= maxLevel || visited.has(current.id))
                        return [3 /*break*/, 2];
                    visited.add(current.id);
                    return [4 /*yield*/, db.select({
                            id: schema_1.contacts.id,
                            name: schema_1.contacts.name,
                            title: schema_1.contacts.title,
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.referrerId, current.id))];
                case 3:
                    directReferrals = _b.sent();
                    // 如果当前层级 > 0，说明是间接推荐
                    if (current.level > 0) {
                        for (_i = 0, directReferrals_1 = directReferrals; _i < directReferrals_1.length; _i++) {
                            referral = directReferrals_1[_i];
                            result.push({
                                id: referral.id,
                                name: referral.name,
                                title: referral.title,
                                level: current.level + 1,
                                referrerName: current.referrerName,
                            });
                            // 继续遍历下一层
                            queue.push({
                                id: referral.id,
                                level: current.level + 1,
                                referrerName: referral.name,
                            });
                        }
                    }
                    else {
                        // 第一层的直接推荐作为间接推荐的起点
                        for (_a = 0, directReferrals_2 = directReferrals; _a < directReferrals_2.length; _a++) {
                            referral = directReferrals_2[_a];
                            queue.push({
                                id: referral.id,
                                level: 1,
                                referrerName: referral.name,
                            });
                        }
                    }
                    return [3 /*break*/, 2];
                case 4: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取推荐链路数据（树状结构）
 */
function getReferralChain(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        // 递归获取推荐链路
        function buildChain(id_1) {
            return __awaiter(this, arguments, void 0, function (id, level) {
                var current, referrals, children, directReferrals, indirectReferrals, _i, children_1, child;
                if (level === void 0) { level = 0; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, db.query.contacts.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.contacts.id, id),
                            })];
                        case 1:
                            current = _a.sent();
                            if (!current)
                                return [2 /*return*/, null];
                            return [4 /*yield*/, db.query.contacts.findMany({
                                    where: (0, drizzle_orm_1.eq)(schema_1.contacts.referrerId, id),
                                })];
                        case 2:
                            referrals = _a.sent();
                            return [4 /*yield*/, Promise.all(referrals.map(function (ref) { return buildChain(ref.id, level + 1); }))];
                        case 3:
                            children = _a.sent();
                            directReferrals = referrals.length;
                            indirectReferrals = 0;
                            for (_i = 0, children_1 = children; _i < children_1.length; _i++) {
                                child = children_1[_i];
                                if (child) {
                                    indirectReferrals += child.directReferrals + child.indirectReferrals;
                                }
                            }
                            return [2 /*return*/, {
                                    id: current.id,
                                    name: current.name,
                                    title: current.title,
                                    level: level,
                                    directReferrals: directReferrals,
                                    indirectReferrals: indirectReferrals,
                                    children: children.filter(Boolean),
                                }];
                    }
                });
            });
        }
        var db, contact;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.query.contacts.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId),
                        })];
                case 2:
                    contact = _a.sent();
                    if (!contact) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, buildChain(contactId)];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// ==================== 批量查询优化函数 ====================
/**
 * 批量获取多个联系人的标签
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, tags[]>
 */
function getTagsForContacts(contactIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, relations, tagsMap, _i, contactIds_1, contactId, _a, relations_1, relation, tags;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db || contactIds.length === 0)
                        return [2 /*return*/, new Map()];
                    return [4 /*yield*/, db.select({
                            contactId: schema_1.contactTagRelations.contactId,
                            tagId: schema_1.contactTagRelations.tagId,
                            tagName: schema_1.contactTags.name,
                            tagColor: schema_1.contactTags.color,
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.contactTagRelations.contactId, drizzle_orm_1.sql.join(contactIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject([", "], [", "]))))))];
                case 2:
                    relations = _b.sent();
                    tagsMap = new Map();
                    for (_i = 0, contactIds_1 = contactIds; _i < contactIds_1.length; _i++) {
                        contactId = contactIds_1[_i];
                        tagsMap.set(contactId, []);
                    }
                    for (_a = 0, relations_1 = relations; _a < relations_1.length; _a++) {
                        relation = relations_1[_a];
                        tags = tagsMap.get(relation.contactId) || [];
                        tags.push({
                            id: relation.tagId,
                            name: relation.tagName,
                            color: relation.tagColor,
                        });
                        tagsMap.set(relation.contactId, tags);
                    }
                    return [2 /*return*/, tagsMap];
            }
        });
    });
}
/**
 * 批量获取多个联系人的个人标签
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, personalTags[]>
 */
function getPersonalTagsForContacts(contactIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, personalTagsList, personalTagsMap, _i, contactIds_2, contactId, _a, personalTagsList_1, tag, tags;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db || contactIds.length === 0)
                        return [2 /*return*/, new Map()];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.personalContactTags.contactId, drizzle_orm_1.sql.join(contactIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject([", "], [", "]))))))];
                case 2:
                    personalTagsList = _b.sent();
                    personalTagsMap = new Map();
                    for (_i = 0, contactIds_2 = contactIds; _i < contactIds_2.length; _i++) {
                        contactId = contactIds_2[_i];
                        personalTagsMap.set(contactId, []);
                    }
                    for (_a = 0, personalTagsList_1 = personalTagsList; _a < personalTagsList_1.length; _a++) {
                        tag = personalTagsList_1[_a];
                        tags = personalTagsMap.get(tag.contactId) || [];
                        tags.push({
                            id: tag.id,
                            name: tag.name,
                            color: tag.color,
                        });
                        personalTagsMap.set(tag.contactId, tags);
                    }
                    return [2 /*return*/, personalTagsMap];
            }
        });
    });
}
/**
 * 获取用户的所有个人标签使用统计
 * @param parentUserId 用户ID
 * @returns 个人标签使用统计列表
 */
function getPersonalTagsStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, stats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select({
                            name: schema_1.personalContactTags.name,
                            color: schema_1.personalContactTags.color,
                            count: (0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))).as('count'),
                        })
                            .from(schema_1.personalContactTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, parentUserId))
                            .groupBy(schema_1.personalContactTags.name, schema_1.personalContactTags.color)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"])))))];
                case 2:
                    stats = _a.sent();
                    return [2 /*return*/, stats];
            }
        });
    });
}
/**
 * 批量获取多个联系人的联络统计
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, stats>
 */
function getInteractionStatsForContacts(contactIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, stats, statsMap, _i, contactIds_3, contactId, _a, stats_1, stat;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db || contactIds.length === 0)
                        return [2 /*return*/, new Map()];
                    return [4 /*yield*/, db.select({
                            contactId: schema_1.contactInteractions.contactId,
                            totalInteractions: (0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            lastInteractionDate: (0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.contactInteractions.interactionDate),
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.contactInteractions.contactId, drizzle_orm_1.sql.join(contactIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject([", "], [", "]))))))
                            .groupBy(schema_1.contactInteractions.contactId)];
                case 2:
                    stats = _b.sent();
                    statsMap = new Map();
                    for (_i = 0, contactIds_3 = contactIds; _i < contactIds_3.length; _i++) {
                        contactId = contactIds_3[_i];
                        statsMap.set(contactId, { totalInteractions: 0, lastInteractionDate: null });
                    }
                    for (_a = 0, stats_1 = stats; _a < stats_1.length; _a++) {
                        stat = stats_1[_a];
                        statsMap.set(stat.contactId, {
                            totalInteractions: stat.totalInteractions,
                            lastInteractionDate: stat.lastInteractionDate,
                        });
                    }
                    return [2 /*return*/, statsMap];
            }
        });
    });
}
/**
 * 批量获取多个联系人的最后联络时间和活跃时间段标记
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, { lastInteraction, hasTodayInteraction, hasInteractionThisWeek, hasInteractionThisMonth, hasInteractionThisYear }>
 */
function getInteractionInfoForContacts(contactIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, startOfTodayTimestamp, startOfWeekTimestamp, startOfMonthTimestamp, startOfYearTimestamp, infoMap, _i, contactIds_4, contactId, _a, contactIds_5, contactId, lastInteraction, hasToday, hasInteractionToday, hasInteractionThisWeek, hasInteractionThisMonth, hasInteractionThisYear, interactions, _b, interactions_1, interaction, interactionTimestamp;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db || contactIds.length === 0)
                        return [2 /*return*/, new Map()];
                    startOfTodayTimestamp = (0, timezone_1.getBeijingTodayStart)();
                    startOfWeekTimestamp = (0, timezone_1.getBeijingThisWeekStart)();
                    startOfMonthTimestamp = (0, timezone_1.getBeijingThisMonthStart)();
                    startOfYearTimestamp = (0, timezone_1.getBeijingThisYearStart)();
                    infoMap = new Map();
                    for (_i = 0, contactIds_4 = contactIds; _i < contactIds_4.length; _i++) {
                        contactId = contactIds_4[_i];
                        infoMap.set(contactId, {
                            lastInteraction: null,
                            hasTodayInteraction: false,
                            hasInteractionToday: false,
                            hasInteractionThisWeek: false,
                            hasInteractionThisMonth: false,
                            hasInteractionThisYear: false
                        });
                    }
                    _a = 0, contactIds_5 = contactIds;
                    _c.label = 2;
                case 2:
                    if (!(_a < contactIds_5.length)) return [3 /*break*/, 7];
                    contactId = contactIds_5[_a];
                    return [4 /*yield*/, getLastInteractionDate(contactId)];
                case 3:
                    lastInteraction = _c.sent();
                    return [4 /*yield*/, hasTodayInteraction(contactId)];
                case 4:
                    hasToday = _c.sent();
                    hasInteractionToday = false;
                    hasInteractionThisWeek = false;
                    hasInteractionThisMonth = false;
                    hasInteractionThisYear = false;
                    return [4 /*yield*/, db
                            .select({ interactionDate: schema_1.contactInteractions.interactionDate })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contactId))];
                case 5:
                    interactions = _c.sent();
                    // 检查每个联络记录是否在各时间段内
                    for (_b = 0, interactions_1 = interactions; _b < interactions_1.length; _b++) {
                        interaction = interactions_1[_b];
                        interactionTimestamp = typeof interaction.interactionDate === 'number'
                            ? interaction.interactionDate
                            : new Date(interaction.interactionDate).getTime();
                        if (interactionTimestamp >= startOfTodayTimestamp) {
                            hasInteractionToday = true;
                        }
                        if (interactionTimestamp >= startOfWeekTimestamp) {
                            hasInteractionThisWeek = true;
                        }
                        if (interactionTimestamp >= startOfMonthTimestamp) {
                            hasInteractionThisMonth = true;
                        }
                        if (interactionTimestamp >= startOfYearTimestamp) {
                            hasInteractionThisYear = true;
                        }
                    }
                    infoMap.set(contactId, {
                        lastInteraction: lastInteraction || null,
                        hasTodayInteraction: hasToday,
                        hasInteractionToday: hasInteractionToday,
                        hasInteractionThisWeek: hasInteractionThisWeek,
                        hasInteractionThisMonth: hasInteractionThisMonth,
                        hasInteractionThisYear: hasInteractionThisYear
                    });
                    _c.label = 6;
                case 6:
                    _a++;
                    return [3 /*break*/, 2];
                case 7: return [2 /*return*/, infoMap];
            }
        });
    });
}
/**
 * 批量获取多个联系人的字段值（公司、职位等）
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, fieldValues[]>
 */
function getFieldValuesForContacts(contactIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, fieldValues, valuesMap, _i, contactIds_6, contactId, _a, fieldValues_1, fv, values;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db || contactIds.length === 0)
                        return [2 /*return*/, new Map()];
                    return [4 /*yield*/, db.select({
                            contactId: schema_1.contactFieldValues.contactId,
                            categoryId: schema_1.contactFieldValues.categoryId,
                            value: schema_1.contactFieldValues.value,
                        })
                            .from(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.contactFieldValues.contactId, drizzle_orm_1.sql.join(contactIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject([", "], [", "]))))))];
                case 2:
                    fieldValues = _b.sent();
                    valuesMap = new Map();
                    for (_i = 0, contactIds_6 = contactIds; _i < contactIds_6.length; _i++) {
                        contactId = contactIds_6[_i];
                        valuesMap.set(contactId, []);
                    }
                    for (_a = 0, fieldValues_1 = fieldValues; _a < fieldValues_1.length; _a++) {
                        fv = fieldValues_1[_a];
                        values = valuesMap.get(fv.contactId);
                        if (values) {
                            values.push({
                                categoryId: fv.categoryId,
                                value: fv.value,
                            });
                        }
                    }
                    return [2 /*return*/, valuesMap];
            }
        });
    });
}
// ==================== 扩展信息管理 ====================
/**
 * 获取所有扩展信息类目（树状结构）
 * @returns 主分类列表，每个主分类包含 children 字段
 */
function getFieldCategories(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allCategories, mainCategories, subCategories;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactFieldCategories)
                            .where(userId
                            ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.parentUserId, 0), (0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.parentUserId, userId))
                            : (0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.parentUserId, 0))
                            .orderBy(schema_1.contactFieldCategories.sortOrder)];
                case 2:
                    allCategories = _a.sent();
                    mainCategories = allCategories.filter(function (cat) { var _a; return ((_a = cat.parentCategoryId) !== null && _a !== void 0 ? _a : 0) === 0; });
                    subCategories = allCategories.filter(function (cat) { var _a; return ((_a = cat.parentCategoryId) !== null && _a !== void 0 ? _a : 0) !== 0; });
                    // 构建树状结构
                    return [2 /*return*/, mainCategories.map(function (main) { return (__assign(__assign({}, main), { children: subCategories.filter(function (sub) { return sub.parentCategoryId === main.id; }) })); })];
            }
        });
    });
}
/**
 * 添加扩展信息字段值
 * @param contactId 联系人 ID
 * @param categoryId 类目 ID
 * @param categoryName 类目名称（按钮名称）
 * @param value 字段值
 * @returns 新增的字段值记录
 */
function addFieldValue(contactId, categoryId, categoryName, value) {
    return __awaiter(this, void 0, void 0, function () {
        var db, encryptedData, result, insertId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'contact_field_values', { value: value }, FIELD_VALUE_ENCRYPT_FIELDS)];
                case 2:
                    encryptedData = _a.sent();
                    return [4 /*yield*/, db
                            .insert(schema_1.contactFieldValues)
                            .values({
                            contactId: contactId,
                            categoryId: categoryId,
                            categoryName: categoryName,
                            value: encryptedData.value,
                        })];
                case 3:
                    result = _a.sent();
                    insertId = result[0].insertId;
                    // 返回新插入的记录
                    return [2 /*return*/, {
                            id: insertId,
                            contactId: contactId,
                            categoryId: categoryId,
                            value: value,
                            createdAt: new Date(),
                        }];
            }
        });
    });
}
/**
 * 删除扩展信息字段值
 * @param fieldValueId 字段值ID
 * @returns 是否删除成功
 */
function deleteFieldValue(fieldValueId) {
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
                            .delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.id, fieldValueId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 批量删除联系人的所有扩展信息
 * @param contactId 联系人ID
 * @returns 是否删除成功
 */
function deleteAllFieldValues(contactId) {
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
                            .delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contactId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 获取联系人的所有扩展信息字段值（包含类目信息）
 * @param contactId 联系人ID
 * @returns 字段值列表（包含类目名称）
 */
function getContactFieldValues(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, fieldValues, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contactId))
                            .orderBy(schema_1.contactFieldValues.sortOrder, schema_1.contactFieldValues.id)];
                case 2:
                    fieldValues = _a.sent();
                    result = fieldValues.map(function (fv) { return ({
                        id: fv.id,
                        contactId: fv.contactId,
                        categoryId: fv.categoryId,
                        categoryName: fv.categoryName || '', // 直接使用数据库中的categoryName
                        categoryKey: fv.categoryName || '', // 使用 categoryName 作为 key
                        value: fv.value,
                        sortOrder: fv.sortOrder || 0,
                        createdAt: fv.createdAt,
                    }); });
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 更新扩展信息字段值
 * @param fieldValueId 字段值ID
 * @param value 新的字段值
 * @returns 更新后的字段值记录
 */
function updateFieldValue(fieldValueId, value) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updatedFieldValue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.contactFieldValues)
                            .set({ value: value })
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.id, fieldValueId))
                            .returning()];
                case 2:
                    updatedFieldValue = (_a.sent())[0];
                    return [2 /*return*/, updatedFieldValue];
            }
        });
    });
}
/**
 * 获取公司列表（所有有公司名称的联系人，标注重复）
 * @param parentUserId 用户ID
 * @returns 公司列表，包含联系人信息和是否重复的标记
 */
function getCompanyList(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, _a, contactFieldCategories, contactFieldValues, companyCategoryResult, companyCategoryIds, companyContacts, contactsByCategoryId, contactsByCategoryName, seenContactIds, _i, contactsByCategoryName_1, contact, companyMap, companyReports, uniqueCompanyNames, reportsData, _b, hasReportMap;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _c.sent();
                    console.log('[getCompanyList] visibleContactIds.length:', visibleContactIds.length);
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 3:
                    _a = _c.sent(), contactFieldCategories = _a.contactFieldCategories, contactFieldValues = _a.contactFieldValues;
                    return [4 /*yield*/, db
                            .select({ id: contactFieldCategories.id })
                            .from(contactFieldCategories)
                            .where((0, drizzle_orm_1.eq)(contactFieldCategories.name, '公司名称'))];
                case 4:
                    companyCategoryResult = _c.sent();
                    console.log('[getCompanyList] companyCategoryResult:', companyCategoryResult);
                    companyCategoryIds = companyCategoryResult.map(function (r) { return r.id; });
                    console.log('[getCompanyList] companyCategoryIds:', companyCategoryIds);
                    companyContacts = [];
                    if (!(companyCategoryIds.length > 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({
                            contactId: contactFieldValues.contactId,
                            contactName: schema_1.contacts.name,
                            companyName: contactFieldValues.value,
                            createdAt: contactFieldValues.createdAt,
                            parentUserId: schema_1.contacts.parentUserId,
                        })
                            .from(contactFieldValues)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(contactFieldValues.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.inArray)(contactFieldValues.categoryId, companyCategoryIds), (0, drizzle_orm_1.isNotNull)(contactFieldValues.value), (0, drizzle_orm_1.ne)(contactFieldValues.value, '')))
                            .orderBy((0, drizzle_orm_1.desc)(contactFieldValues.createdAt))];
                case 5:
                    contactsByCategoryId = _c.sent();
                    companyContacts = __spreadArray([], contactsByCategoryId, true);
                    console.log('[getCompanyList] 通过categoryId查询到:', contactsByCategoryId.length);
                    _c.label = 6;
                case 6: return [4 /*yield*/, db
                        .select({
                        contactId: contactFieldValues.contactId,
                        contactName: schema_1.contacts.name,
                        companyName: contactFieldValues.value,
                        createdAt: contactFieldValues.createdAt,
                        parentUserId: schema_1.contacts.parentUserId,
                    })
                        .from(contactFieldValues)
                        .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(contactFieldValues.contactId, schema_1.contacts.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds), (0, drizzle_orm_1.eq)(contactFieldValues.categoryName, '公司名称'), (0, drizzle_orm_1.isNotNull)(contactFieldValues.value), (0, drizzle_orm_1.ne)(contactFieldValues.value, '')))
                        .orderBy((0, drizzle_orm_1.desc)(contactFieldValues.createdAt))];
                case 7:
                    contactsByCategoryName = _c.sent();
                    console.log('[getCompanyList] 通过categoryName查询到:', contactsByCategoryName.length);
                    seenContactIds = new Set(companyContacts.map(function (c) { return c.contactId; }));
                    for (_i = 0, contactsByCategoryName_1 = contactsByCategoryName; _i < contactsByCategoryName_1.length; _i++) {
                        contact = contactsByCategoryName_1[_i];
                        if (!seenContactIds.has(contact.contactId)) {
                            companyContacts.push(contact);
                            seenContactIds.add(contact.contactId);
                        }
                    }
                    console.log('[getCompanyList] companyContacts.length:', companyContacts.length);
                    if (companyContacts.length > 0) {
                        console.log('[getCompanyList] companyContacts 示例:', companyContacts.slice(0, 3));
                    }
                    companyMap = new Map();
                    companyContacts.forEach(function (contact) {
                        var existing = companyMap.get(contact.companyName);
                        var isContactShared = contact.parentUserId !== parentUserId;
                        if (existing) {
                            existing.contactIds.push(contact.contactId);
                            existing.contactNames.push(contact.contactName);
                            existing.contactCount++;
                            // 如果有任何一个联系人是共享的，则整个公司标记为共享
                            if (isContactShared) {
                                existing.isShared = true;
                            }
                            // 保留最早的创建时间
                            if (new Date(contact.createdAt) < new Date(existing.createdAt)) {
                                existing.createdAt = contact.createdAt;
                            }
                        }
                        else {
                            companyMap.set(contact.companyName, {
                                companyName: contact.companyName,
                                contactIds: [contact.contactId],
                                contactNames: [contact.contactName],
                                contactCount: 1,
                                createdAt: contact.createdAt,
                                isShared: isContactShared,
                            });
                        }
                    });
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 8:
                    companyReports = (_c.sent()).companyReports;
                    uniqueCompanyNames = Array.from(companyMap.keys());
                    if (!(uniqueCompanyNames.length > 0)) return [3 /*break*/, 10];
                    return [4 /*yield*/, db
                            .select({ companyName: companyReports.companyName })
                            .from(companyReports)
                            .where((0, drizzle_orm_1.inArray)(companyReports.companyName, uniqueCompanyNames))];
                case 9:
                    _b = _c.sent();
                    return [3 /*break*/, 11];
                case 10:
                    _b = [];
                    _c.label = 11;
                case 11:
                    reportsData = _b;
                    hasReportMap = new Map(reportsData.map(function (r) { return [r.companyName, true]; }));
                    // 返回按公司分组的列表，按创建时间倒序排列
                    return [2 /*return*/, Array.from(companyMap.values())
                            .map(function (company) { return (__assign(__assign({}, company), { hasReport: hasReportMap.get(company.companyName) || false })); })
                            .sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); })];
            }
        });
    });
}
/**
 * 创建扩展信息分类
 * @param name 分类名称
 * @param icon 分类图标
 * @param parentCategoryId 父分类ID（null表示一级分类）
 * @returns 新创建的分类记录
 */
function createFieldCategory(name_1) {
    return __awaiter(this, arguments, void 0, function (name, icon, parentCategoryId) {
        var db, result;
        if (icon === void 0) { icon = ''; }
        if (parentCategoryId === void 0) { parentCategoryId = null; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .insert(schema_1.contactFieldCategories)
                            .values({
                            name: name,
                            icon: icon,
                            parentCategoryId: parentCategoryId,
                            parentUserId: 0, // 系统级分类
                            sortOrder: 0,
                        })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, {
                            id: Number(result.insertId),
                            name: name,
                            icon: icon,
                            parentCategoryId: parentCategoryId,
                        }];
            }
        });
    });
}
/**
 * 获取健康度统计数据
 */
function getHealthStats(parentUserId_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, type) {
        var db, visibleContactIds, myContacts, sharingConnections, sharerIds, sharedContactIds, _i, sharerIds_1, sharerId, sharerContacts, allContacts, totalContacts, allInteractions, thirtyDaysAgo, contactsWithRecentInteraction, _a, allInteractions_4, interaction, thirtyDayCount, thirtyDayRate, totalIntervalDays, contactsWithInteractions, _loop_2, _b, allContacts_4, contact, averageInteractionInterval, oneEightyDaysAgo, contactLastInteractionMap, _c, allInteractions_5, interaction, dormantCount, _d, allContacts_5, contact, lastInteractionDate, dormantPercentage, contactTagsResult, contactTagsMap, _e, contactTagsResult_2, row, now, sevenDaysAgo, thirtyDaysAgoTimestamp, ninetyDaysAgo, needsFollowUpCount, _f, allContacts_6, contact, lastInteractionDate, tags, needsFollowUp, highValueCount, totalInteractionCount, _g, allInteractions_6, interaction, note, match, score, highValueRate;
        if (type === void 0) { type = 'all'; }
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _h.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!(type === 'all')) return [3 /*break*/, 3];
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _h.sent();
                    return [3 /*break*/, 11];
                case 3:
                    if (!(type === 'my')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 4:
                    myContacts = _h.sent();
                    visibleContactIds = myContacts.map(function (c) { return c.id; });
                    return [3 /*break*/, 11];
                case 5: return [4 /*yield*/, db.select({ sharerId: schema_1.contactSharingConnections.sharerId })
                        .from(schema_1.contactSharingConnections)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 6:
                    sharingConnections = _h.sent();
                    sharerIds = sharingConnections.map(function (c) { return c.sharerId; });
                    sharedContactIds = [];
                    _i = 0, sharerIds_1 = sharerIds;
                    _h.label = 7;
                case 7:
                    if (!(_i < sharerIds_1.length)) return [3 /*break*/, 10];
                    sharerId = sharerIds_1[_i];
                    return [4 /*yield*/, db.select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, sharerId))];
                case 8:
                    sharerContacts = _h.sent();
                    sharedContactIds.push.apply(sharedContactIds, sharerContacts.map(function (c) { return c.id; }));
                    _h.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 7];
                case 10:
                    visibleContactIds = sharedContactIds;
                    _h.label = 11;
                case 11:
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, {
                                thirtyDayInteractionRate: { value: "0%", detail: "(0/0人)", trend: "0%", status: "待改善" },
                                averageInteractionFrequency: { value: "0天", trend: "0天", status: "待改善" },
                                dormantContactsCount: { value: "0人", percentage: "0%", trend: "0人", status: "良好" },
                                needsFollowUpCount: { value: "0项", trend: "0项", status: "良好" },
                                highValueInteractionRate: { value: "0%", trend: "0%", status: "待改善" },
                            }];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))];
                case 12:
                    allContacts = _h.sent();
                    totalContacts = allContacts.length;
                    return [4 /*yield*/, db.select({
                            id: schema_1.contactInteractions.id,
                            contactId: schema_1.contactInteractions.contactId,
                            interactionDate: schema_1.contactInteractions.interactionDate,
                            note: schema_1.contactInteractions.note,
                        }).from(schema_1.contactInteractions)
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contactInteractions.interactionDate))];
                case 13:
                    allInteractions = _h.sent();
                    thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    contactsWithRecentInteraction = new Set();
                    for (_a = 0, allInteractions_4 = allInteractions; _a < allInteractions_4.length; _a++) {
                        interaction = allInteractions_4[_a];
                        if (interaction.interactionDate >= thirtyDaysAgo) {
                            contactsWithRecentInteraction.add(interaction.contactId);
                        }
                    }
                    thirtyDayCount = contactsWithRecentInteraction.size;
                    thirtyDayRate = totalContacts > 0 ? Math.round((thirtyDayCount / totalContacts) * 100) : 0;
                    totalIntervalDays = 0;
                    contactsWithInteractions = 0;
                    _loop_2 = function (contact) {
                        var contactInteractionsList = allInteractions.filter(function (i) { return i.contactId === contact.id; });
                        if (contactInteractionsList.length >= 2) {
                            var totalInterval = 0;
                            for (var i = 0; i < contactInteractionsList.length - 1; i++) {
                                var interval = contactInteractionsList[i].interactionDate - contactInteractionsList[i + 1].interactionDate;
                                totalInterval += interval;
                            }
                            var avgInterval = totalInterval / (contactInteractionsList.length - 1);
                            totalIntervalDays += avgInterval / (24 * 60 * 60 * 1000);
                            contactsWithInteractions++;
                        }
                    };
                    for (_b = 0, allContacts_4 = allContacts; _b < allContacts_4.length; _b++) {
                        contact = allContacts_4[_b];
                        _loop_2(contact);
                    }
                    averageInteractionInterval = contactsWithInteractions > 0
                        ? Math.round(totalIntervalDays / contactsWithInteractions)
                        : 0;
                    oneEightyDaysAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
                    contactLastInteractionMap = new Map();
                    for (_c = 0, allInteractions_5 = allInteractions; _c < allInteractions_5.length; _c++) {
                        interaction = allInteractions_5[_c];
                        if (!contactLastInteractionMap.has(interaction.contactId)) {
                            contactLastInteractionMap.set(interaction.contactId, interaction.interactionDate);
                        }
                    }
                    dormantCount = 0;
                    for (_d = 0, allContacts_5 = allContacts; _d < allContacts_5.length; _d++) {
                        contact = allContacts_5[_d];
                        lastInteractionDate = contactLastInteractionMap.get(contact.id);
                        if (!lastInteractionDate || lastInteractionDate < oneEightyDaysAgo) {
                            dormantCount++;
                        }
                    }
                    dormantPercentage = totalContacts > 0 ? Math.round((dormantCount / totalContacts) * 100) : 0;
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contactTagRelations.contactId,
                            tagName: schema_1.contactTags.name,
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, schema_1.contacts.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleContactIds))];
                case 14:
                    contactTagsResult = _h.sent();
                    contactTagsMap = new Map();
                    for (_e = 0, contactTagsResult_2 = contactTagsResult; _e < contactTagsResult_2.length; _e++) {
                        row = contactTagsResult_2[_e];
                        if (!contactTagsMap.has(row.contactId)) {
                            contactTagsMap.set(row.contactId, []);
                        }
                        contactTagsMap.get(row.contactId).push(row.tagName);
                    }
                    now = Date.now();
                    sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
                    thirtyDaysAgoTimestamp = now - 30 * 24 * 60 * 60 * 1000;
                    ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
                    needsFollowUpCount = 0;
                    for (_f = 0, allContacts_6 = allContacts; _f < allContacts_6.length; _f++) {
                        contact = allContacts_6[_f];
                        lastInteractionDate = contactLastInteractionMap.get(contact.id);
                        tags = contactTagsMap.get(contact.id) || [];
                        needsFollowUp = false;
                        if (tags.includes('周关注') && (!lastInteractionDate || lastInteractionDate < sevenDaysAgo)) {
                            needsFollowUp = true;
                        }
                        else if (tags.includes('月关注') && (!lastInteractionDate || lastInteractionDate < thirtyDaysAgoTimestamp)) {
                            needsFollowUp = true;
                        }
                        else if (tags.includes('季关注') && (!lastInteractionDate || lastInteractionDate < ninetyDaysAgo)) {
                            needsFollowUp = true;
                        }
                        if (needsFollowUp) {
                            needsFollowUpCount++;
                        }
                    }
                    highValueCount = 0;
                    totalInteractionCount = allInteractions.length;
                    for (_g = 0, allInteractions_6 = allInteractions; _g < allInteractions_6.length; _g++) {
                        interaction = allInteractions_6[_g];
                        note = interaction.note || "";
                        match = note.match(/\[重要性:(\d+)分\]/);
                        if (match) {
                            score = parseInt(match[1]);
                            if (score >= 4) {
                                highValueCount++;
                            }
                        }
                    }
                    highValueRate = totalInteractionCount > 0
                        ? Math.round((highValueCount / totalInteractionCount) * 100)
                        : 0;
                    return [2 /*return*/, {
                            thirtyDayInteractionRate: {
                                value: "".concat(thirtyDayRate, "%"),
                                detail: "(".concat(thirtyDayCount, "/").concat(totalContacts, "\u4EBA)"),
                                trend: "↑ 5%", // TODO: 需要历史数据对比
                                status: thirtyDayRate >= 60 ? "良好" : thirtyDayRate >= 40 ? "注意" : "待改善",
                            },
                            averageInteractionFrequency: {
                                value: "\u6BCF".concat(averageInteractionInterval, "\u5929\u4E00\u6B21"),
                                trend: "↓ 3天", // TODO: 需要历史数据对比
                                status: averageInteractionInterval <= 45 ? "良好" : averageInteractionInterval <= 60 ? "注意" : "待改善",
                            },
                            dormantContactsCount: {
                                value: "".concat(dormantCount, "\u4EBA"),
                                percentage: "(".concat(dormantPercentage, "%)"),
                                trend: "↓ 8人", // TODO: 需要历史数据对比
                                status: dormantPercentage <= 20 ? "良好" : dormantPercentage <= 30 ? "注意" : "待改善",
                            },
                            needsFollowUpCount: {
                                value: "".concat(needsFollowUpCount, "\u9879"),
                                trend: "↑ 12项", // TODO: 需要历史数据对比
                                status: needsFollowUpCount <= 30 ? "良好" : needsFollowUpCount <= 50 ? "预警" : "严重",
                            },
                            highValueInteractionRate: {
                                value: "".concat(highValueRate, "%"),
                                trend: "↑ 8%", // TODO: 需要历史数据对比
                                status: highValueRate >= 30 ? "优秀" : highValueRate >= 20 ? "良好" : "待改善",
                            },
                        }];
            }
        });
    });
}
/**
 * 获取家长的人脉列表（分页版本）
 * @param parentUserId 用户ID
 * @param searchQuery 搜索关键词
 * @param page 页码（从1开始）
 * @param pageSize 每页数量
 * @returns { total: 总数, contacts: 人脉列表, hasMore: 是否还有更多 }
 */
function getContactsByParentPaginated(parentUserId_1, searchQuery_1) {
    return __awaiter(this, arguments, void 0, function (parentUserId, searchQuery, page, pageSize) {
        var db, offset, totalQuery, searchPattern, totalResult, total, baseContacts, searchPattern, result, contactIds, linkedUsernames, linkedUsers, _i, linkedUsers_2, row, startOfTodayTimestamp, startOfWeekTimestamp, startOfMonthTimestamp, startOfYearTimestamp, contactsWithInteractionInfo, hasMore;
        var _this = this;
        var _a, _b, _c;
        if (page === void 0) { page = 1; }
        if (pageSize === void 0) { pageSize = 50; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log('[getContactsByParentPaginated] 开始查询:', { parentUserId: parentUserId, searchQuery: searchQuery, page: page, pageSize: pageSize });
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db)
                        throw new Error("Database not available");
                    offset = (page - 1) * pageSize;
                    if (!searchQuery) {
                        totalQuery = db.select({ count: (0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId));
                    }
                    else {
                        searchPattern = "%".concat(searchQuery, "%");
                        // 使用UNION去重统计，包含标签搜索
                        totalQuery = db.execute((0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["\n      SELECT COUNT(DISTINCT c.id) as count\n      FROM contacts c\n      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId\n      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId\n      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id\n      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId\n      WHERE c.parentUserId = ", "\n      AND (\n        c.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.title COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n      )\n    "], ["\n      SELECT COUNT(DISTINCT c.id) as count\n      FROM contacts c\n      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId\n      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId\n      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id\n      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId\n      WHERE c.parentUserId = ", "\n      AND (\n        c.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.title COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n      )\n    "])), parentUserId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern));
                    }
                    return [4 /*yield*/, totalQuery];
                case 2:
                    totalResult = _d.sent();
                    total = 0;
                    if (Array.isArray(totalResult)) {
                        // 检查是否是 mysql2 的 [rows, fields] 格式
                        if (Array.isArray(totalResult[0])) {
                            // mysql2 execute 返回的格式: [[{count: n}], fields]
                            total = Number(((_a = totalResult[0][0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
                        }
                        else if (((_b = totalResult[0]) === null || _b === void 0 ? void 0 : _b.count) !== undefined) {
                            // drizzle select 返回的格式: [{count: n}]
                            total = Number(totalResult[0].count || 0);
                        }
                    }
                    console.log('[getContactsByParentPaginated] 查询结果总数:', total, 'totalResult结构:', JSON.stringify(totalResult).substring(0, 200));
                    if (!!searchQuery) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.contacts.updatedAt))
                            .limit(pageSize)
                            .offset(offset)];
                case 3:
                    baseContacts = _d.sent();
                    return [3 /*break*/, 6];
                case 4:
                    searchPattern = "%".concat(searchQuery, "%");
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject(["\n      SELECT DISTINCT c.*\n      FROM contacts c\n      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId\n      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId\n      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id\n      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId\n      WHERE c.parentUserId = ", "\n      AND (\n        c.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.title COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n      )\n      ORDER BY \n        CASE \n          WHEN c.name COLLATE utf8mb4_unicode_ci LIKE ", " THEN 1\n          WHEN c.name COLLATE utf8mb4_unicode_ci LIKE ", " THEN 2\n          WHEN c.title COLLATE utf8mb4_unicode_ci LIKE ", " THEN 3\n          WHEN c.title COLLATE utf8mb4_unicode_ci LIKE ", " THEN 4\n          ELSE 5\n        END,\n        c.updatedAt DESC\n      LIMIT ", "\n      OFFSET ", "\n    "], ["\n      SELECT DISTINCT c.*\n      FROM contacts c\n      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId\n      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId\n      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id\n      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId\n      WHERE c.parentUserId = ", "\n      AND (\n        c.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.title COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ", "\n      )\n      ORDER BY \n        CASE \n          WHEN c.name COLLATE utf8mb4_unicode_ci LIKE ", " THEN 1\n          WHEN c.name COLLATE utf8mb4_unicode_ci LIKE ", " THEN 2\n          WHEN c.title COLLATE utf8mb4_unicode_ci LIKE ", " THEN 3\n          WHEN c.title COLLATE utf8mb4_unicode_ci LIKE ", " THEN 4\n          ELSE 5\n        END,\n        c.updatedAt DESC\n      LIMIT ", "\n      OFFSET ", "\n    "])), parentUserId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchQuery + '%', searchPattern, searchQuery + '%', searchPattern, pageSize, offset))];
                case 5:
                    result = _d.sent();
                    // mysql2 的 execute 返回 [rows, fields]，需要取第一个元素
                    console.log('[getContactsByParentPaginated] 原始结果类型:', typeof result, Array.isArray(result));
                    console.log('[getContactsByParentPaginated] 原始结果长度:', Array.isArray(result) ? result.length : 'N/A');
                    if (Array.isArray(result) && result.length > 0) {
                        console.log('[getContactsByParentPaginated] result[0]类型:', typeof result[0], Array.isArray(result[0]));
                        if (Array.isArray(result[0]) && result[0].length > 0) {
                            console.log('[getContactsByParentPaginated] result[0][0]:', JSON.stringify(result[0][0]).substring(0, 200));
                        }
                        else if (!Array.isArray(result[0])) {
                            console.log('[getContactsByParentPaginated] result[0]:', JSON.stringify(result[0]).substring(0, 200));
                        }
                    }
                    baseContacts = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
                    _d.label = 6;
                case 6:
                    console.log('[getContactsByParentPaginated] 查询到的联系人数量:', baseContacts.length);
                    if (baseContacts.length > 0) {
                        console.log('[getContactsByParentPaginated] 第一个联系人:', (_c = baseContacts[0]) === null || _c === void 0 ? void 0 : _c.name, JSON.stringify(baseContacts[0]).substring(0, 200));
                    }
                    contactIds = baseContacts.map(function (c) { return c.id; });
                    linkedUsernames = {};
                    if (!(contactIds.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contacts.id,
                            username: schema_1.users.username,
                        })
                            .from(schema_1.contacts)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.contacts.linkedUserId, schema_1.users.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, contactIds))];
                case 7:
                    linkedUsers = _d.sent();
                    for (_i = 0, linkedUsers_2 = linkedUsers; _i < linkedUsers_2.length; _i++) {
                        row = linkedUsers_2[_i];
                        if (row.contactId && row.username) {
                            linkedUsernames[row.contactId] = row.username;
                        }
                    }
                    _d.label = 8;
                case 8:
                    startOfTodayTimestamp = (0, timezone_1.getBeijingTodayStart)();
                    startOfWeekTimestamp = (0, timezone_1.getBeijingThisWeekStart)();
                    startOfMonthTimestamp = (0, timezone_1.getBeijingThisMonthStart)();
                    startOfYearTimestamp = (0, timezone_1.getBeijingThisYearStart)();
                    return [4 /*yield*/, Promise.all(baseContacts.map(function (contact) { return __awaiter(_this, void 0, void 0, function () {
                            var lastInteraction, daysSinceLastInteraction, hasInteractionToday, hasInteractionThisWeek, hasInteractionThisMonth, hasInteractionThisYear, interactions, _i, interactions_2, interaction, interactionTimestamp;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, getLastInteractionDate(contact.id)];
                                    case 1:
                                        lastInteraction = _a.sent();
                                        daysSinceLastInteraction = lastInteraction
                                            ? calculateDaysDifference(lastInteraction, Date.now())
                                            : null;
                                        hasInteractionToday = false;
                                        hasInteractionThisWeek = false;
                                        hasInteractionThisMonth = false;
                                        hasInteractionThisYear = false;
                                        return [4 /*yield*/, db
                                                .select({ interactionDate: schema_1.contactInteractions.interactionDate })
                                                .from(schema_1.contactInteractions)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contactInteractions.contactId, contact.id))];
                                    case 2:
                                        interactions = _a.sent();
                                        // 检查每个联络记录是否在各时间段内
                                        for (_i = 0, interactions_2 = interactions; _i < interactions_2.length; _i++) {
                                            interaction = interactions_2[_i];
                                            interactionTimestamp = typeof interaction.interactionDate === 'number'
                                                ? interaction.interactionDate
                                                : new Date(interaction.interactionDate).getTime();
                                            if (interactionTimestamp >= startOfTodayTimestamp) {
                                                hasInteractionToday = true;
                                            }
                                            if (interactionTimestamp >= startOfWeekTimestamp) {
                                                hasInteractionThisWeek = true;
                                            }
                                            if (interactionTimestamp >= startOfMonthTimestamp) {
                                                hasInteractionThisMonth = true;
                                            }
                                            if (interactionTimestamp >= startOfYearTimestamp) {
                                                hasInteractionThisYear = true;
                                            }
                                        }
                                        return [2 /*return*/, __assign(__assign({}, contact), { username: linkedUsernames[contact.id] || null, lastInteractionDate: lastInteraction, daysSinceLastInteraction: daysSinceLastInteraction, hasInteractionToday: hasInteractionToday, hasInteractionThisWeek: hasInteractionThisWeek, hasInteractionThisMonth: hasInteractionThisMonth, hasInteractionThisYear: hasInteractionThisYear })];
                                }
                            });
                        }); }))];
                case 9:
                    contactsWithInteractionInfo = _d.sent();
                    console.log('[getContactsByParentPaginated] 分页计算:', {
                        offset: offset,
                        baseContactsLength: baseContacts.length,
                        contactsWithInteractionInfoLength: contactsWithInteractionInfo.length,
                        total: total,
                        calculation: "".concat(offset, " + ").concat(baseContacts.length, " < ").concat(total),
                        hasMore: offset + baseContacts.length < total
                    });
                    hasMore = offset + baseContacts.length < total;
                    return [2 /*return*/, {
                            total: total,
                            contacts: contactsWithInteractionInfo,
                            hasMore: hasMore,
                            page: page,
                            pageSize: pageSize,
                        }];
            }
        });
    });
}
/**
 * 获取按筛选类型分类的统计数量（全部/我的/共享）
 * 用于列表页显示"全部/我的/共享"按钮的数字
 * @param parentUserId 用户ID
 * @param filterType 筛选类型: thisWeek, thisMonth, thisYear, weeklyActive, monthlyActive, yearlyActive, todayActive
 * @returns { total, mine, shared }
 */
function getFilteredCounts(parentUserId, filterType) {
    return __awaiter(this, void 0, void 0, function () {
        var db, thisWeekStart, thisMonthStart, thisYearStart, todayStart, sharingConnections, sharerIds, mine, shared, startDate, mineResult, sharedResult, startDate, startDateStr, myContacts, myContactIds, sharedContactIds, sharerContacts, activeInteractions, myActiveSet, _i, activeInteractions_1, interaction, sharedActiveSet, _a, activeInteractions_2, interaction, total, result;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log('[getFilteredCounts] 开始查询, 用户ID:', parentUserId, '筛选类型:', filterType);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db)
                        throw new Error("Database not available");
                    thisWeekStart = new Date((0, timezone_1.getBeijingThisWeekStart)());
                    thisMonthStart = new Date((0, timezone_1.getBeijingThisMonthStart)());
                    thisYearStart = new Date((0, timezone_1.getBeijingThisYearStart)());
                    todayStart = new Date((0, timezone_1.getBeijingTodayStart)());
                    return [4 /*yield*/, db
                            .select({ sharerId: schema_1.contactSharingConnections.sharerId })
                            .from(schema_1.contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, parentUserId), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                case 2:
                    sharingConnections = _d.sent();
                    sharerIds = sharingConnections.map(function (conn) { return conn.sharerId; });
                    mine = 0;
                    shared = 0;
                    if (!(filterType === 'thisWeek' || filterType === 'thisMonth' || filterType === 'thisYear')) return [3 /*break*/, 6];
                    startDate = void 0;
                    if (filterType === 'thisWeek') {
                        startDate = thisWeekStart;
                    }
                    else if (filterType === 'thisMonth') {
                        startDate = thisMonthStart;
                    }
                    else {
                        startDate = thisYearStart;
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId), (0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contacts.createdAt, startDate)))];
                case 3:
                    mineResult = _d.sent();
                    mine = ((_b = mineResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds), (0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contacts.createdAt, startDate)))];
                case 4:
                    sharedResult = _d.sent();
                    shared = ((_c = sharedResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                    _d.label = 5;
                case 5: return [3 /*break*/, 11];
                case 6:
                    if (!(filterType === 'todayActive' || filterType === 'weeklyActive' || filterType === 'monthlyActive' || filterType === 'yearlyActive')) return [3 /*break*/, 11];
                    startDate = void 0;
                    if (filterType === 'todayActive') {
                        startDate = new Date((0, timezone_1.getBeijingTodayStart)());
                    }
                    else if (filterType === 'weeklyActive') {
                        startDate = new Date((0, timezone_1.getBeijingThisWeekStart)());
                    }
                    else if (filterType === 'monthlyActive') {
                        startDate = new Date((0, timezone_1.getBeijingThisMonthStart)());
                    }
                    else {
                        startDate = new Date((0, timezone_1.getBeijingThisYearStart)());
                    }
                    startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
                    console.log('[getFilteredCounts] 活跃筛选 startDate:', startDate.toISOString(), 'startDateStr:', startDateStr);
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, parentUserId))];
                case 7:
                    myContacts = _d.sent();
                    myContactIds = myContacts.map(function (c) { return c.id; });
                    sharedContactIds = [];
                    if (!(sharerIds.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds))];
                case 8:
                    sharerContacts = _d.sent();
                    sharedContactIds = sharerContacts.map(function (c) { return c.id; });
                    _d.label = 9;
                case 9: return [4 /*yield*/, db
                        .select({ contactId: schema_1.contactInteractions.contactId })
                        .from(schema_1.contactInteractions)
                        .where((0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contactInteractions.interactionDate, startDateStr))];
                case 10:
                    activeInteractions = _d.sent();
                    myActiveSet = new Set();
                    for (_i = 0, activeInteractions_1 = activeInteractions; _i < activeInteractions_1.length; _i++) {
                        interaction = activeInteractions_1[_i];
                        if (myContactIds.includes(interaction.contactId)) {
                            myActiveSet.add(interaction.contactId);
                        }
                    }
                    mine = myActiveSet.size;
                    sharedActiveSet = new Set();
                    for (_a = 0, activeInteractions_2 = activeInteractions; _a < activeInteractions_2.length; _a++) {
                        interaction = activeInteractions_2[_a];
                        if (sharedContactIds.includes(interaction.contactId)) {
                            sharedActiveSet.add(interaction.contactId);
                        }
                    }
                    shared = sharedActiveSet.size;
                    _d.label = 11;
                case 11:
                    total = mine + shared;
                    result = { total: total, mine: mine, shared: shared };
                    console.log('[getFilteredCounts] 查询结果:', result);
                    return [2 /*return*/, result];
            }
        });
    });
}
// ==================== 互动统计分析函数 ====================
/**
 * 获取互动统计总览
 */
function getInteractionOverview(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, totalResult, totalInteractions, activeResult, activeContacts, avgFrequency, coreResult, coreCircle, thisMonthStart, thisMonthResult, lastMonthStart, lastMonthEnd, lastMonthResult, insights, onceOnlyCount, _a, percentage, coreInteractions, percentage;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _h.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _h.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, {
                                totalInteractions: 0,
                                activeContacts: 0,
                                avgFrequency: 0,
                                coreCircle: 0,
                                trends: { thisMonth: { interactions: 0, contacts: 0 }, lastMonth: { interactions: 0, contacts: 0 } },
                                insights: []
                            }];
                    }
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))];
                case 3:
                    totalResult = _h.sent();
                    totalInteractions = ((_b = totalResult[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId) })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))];
                case 4:
                    activeResult = _h.sent();
                    activeContacts = ((_c = activeResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                    avgFrequency = activeContacts > 0 ? +(totalInteractions / activeContacts).toFixed(2) : 0;
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contactInteractions.contactId,
                            count: (0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"])))
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))
                            .groupBy(schema_1.contactInteractions.contactId)
                            .having((0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject(["COUNT(*) >= 8"], ["COUNT(*) >= 8"]))))];
                case 5:
                    coreResult = _h.sent();
                    coreCircle = coreResult.length;
                    thisMonthStart = new Date();
                    thisMonthStart.setDate(1);
                    thisMonthStart.setHours(0, 0, 0, 0);
                    return [4 /*yield*/, db
                            .select({
                            interactions: (0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            contacts: (0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId)
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, thisMonthStart)))];
                case 6:
                    thisMonthResult = _h.sent();
                    lastMonthStart = new Date(thisMonthStart);
                    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
                    lastMonthEnd = new Date(thisMonthStart);
                    return [4 /*yield*/, db
                            .select({
                            interactions: (0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            contacts: (0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId)
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, lastMonthStart), (0, drizzle_orm_1.lt)(schema_1.contactInteractions.interactionDate, lastMonthEnd)))];
                case 7:
                    lastMonthResult = _h.sent();
                    insights = [];
                    if (!(activeContacts > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ contactId: schema_1.contactInteractions.contactId })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))
                            .groupBy(schema_1.contactInteractions.contactId)
                            .having((0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject(["COUNT(*) = 1"], ["COUNT(*) = 1"]))))];
                case 8:
                    _a = (_h.sent()).length;
                    return [3 /*break*/, 10];
                case 9:
                    _a = 0;
                    _h.label = 10;
                case 10:
                    onceOnlyCount = _a;
                    if (onceOnlyCount > 0 && activeContacts > 0) {
                        percentage = Math.round((onceOnlyCount / activeContacts) * 100);
                        insights.push({
                            type: 'longtail',
                            text: "".concat(percentage, "%\u7684\u4EBA\u8109\u4EC5\u67091\u6B21\u4E92\u52A8\uFF0C\u5EFA\u8BAE\u6FC0\u6D3B")
                        });
                    }
                    if (coreCircle > 0 && totalInteractions > 0) {
                        coreInteractions = coreResult.reduce(function (sum, r) { return sum + r.count; }, 0);
                        percentage = Math.round((coreInteractions / totalInteractions) * 100);
                        insights.push({
                            type: 'pareto',
                            text: "".concat(coreCircle, "\u4EBA\u6838\u5FC3\u5708\u8D21\u732E\u4E86").concat(percentage, "%\u7684\u4E92\u52A8")
                        });
                    }
                    return [2 /*return*/, {
                            totalInteractions: totalInteractions,
                            activeContacts: activeContacts,
                            avgFrequency: avgFrequency,
                            coreCircle: coreCircle,
                            trends: {
                                thisMonth: {
                                    interactions: ((_d = thisMonthResult[0]) === null || _d === void 0 ? void 0 : _d.interactions) || 0,
                                    contacts: ((_e = thisMonthResult[0]) === null || _e === void 0 ? void 0 : _e.contacts) || 0
                                },
                                lastMonth: {
                                    interactions: ((_f = lastMonthResult[0]) === null || _f === void 0 ? void 0 : _f.interactions) || 0,
                                    contacts: ((_g = lastMonthResult[0]) === null || _g === void 0 ? void 0 : _g.contacts) || 0
                                }
                            },
                            insights: insights
                        }];
            }
        });
    });
}
/**
 * 获取互动频次分布
 */
function getInteractionDistribution(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, distribution, countMap, histogram, sortedDistribution, totalInteractions, totalContacts, cumulative, cumulativeContacts, pareto, coreCircle, activeCircle, normalCircle, silentCircle, counts, min, max, median, q1, q3, iqr, outliers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, { histogram: [], pareto: [], boxplot: null }];
                    }
                    return [4 /*yield*/, db
                            .select({
                            contactId: schema_1.contactInteractions.contactId,
                            count: (0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"])))
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds))
                            .groupBy(schema_1.contactInteractions.contactId)];
                case 3:
                    distribution = _a.sent();
                    countMap = new Map();
                    distribution.forEach(function (d) {
                        var count = d.count;
                        countMap.set(count, (countMap.get(count) || 0) + 1);
                    });
                    histogram = Array.from(countMap.entries())
                        .map(function (_a) {
                        var count = _a[0], contacts = _a[1];
                        return ({ count: count, contacts: contacts });
                    })
                        .sort(function (a, b) { return a.count - b.count; });
                    sortedDistribution = __spreadArray([], distribution, true).sort(function (a, b) { return b.count - a.count; });
                    totalInteractions = sortedDistribution.reduce(function (sum, d) { return sum + d.count; }, 0);
                    totalContacts = sortedDistribution.length;
                    cumulative = 0;
                    cumulativeContacts = 0;
                    pareto = [];
                    coreCircle = sortedDistribution.filter(function (d) { return d.count >= 8; });
                    if (coreCircle.length > 0) {
                        cumulative += coreCircle.reduce(function (sum, d) { return sum + d.count; }, 0);
                        cumulativeContacts += coreCircle.length;
                        pareto.push({
                            tier: '核心圈',
                            contacts: coreCircle.length,
                            cumulative: cumulativeContacts / totalContacts,
                            interactions: cumulative
                        });
                    }
                    activeCircle = sortedDistribution.filter(function (d) { return d.count >= 4 && d.count < 8; });
                    if (activeCircle.length > 0) {
                        cumulative += activeCircle.reduce(function (sum, d) { return sum + d.count; }, 0);
                        cumulativeContacts += activeCircle.length;
                        pareto.push({
                            tier: '活跃圈',
                            contacts: activeCircle.length,
                            cumulative: cumulativeContacts / totalContacts,
                            interactions: cumulative
                        });
                    }
                    normalCircle = sortedDistribution.filter(function (d) { return d.count >= 2 && d.count < 4; });
                    if (normalCircle.length > 0) {
                        cumulative += normalCircle.reduce(function (sum, d) { return sum + d.count; }, 0);
                        cumulativeContacts += normalCircle.length;
                        pareto.push({
                            tier: '普通圈',
                            contacts: normalCircle.length,
                            cumulative: cumulativeContacts / totalContacts,
                            interactions: cumulative
                        });
                    }
                    silentCircle = sortedDistribution.filter(function (d) { return d.count === 1; });
                    if (silentCircle.length > 0) {
                        cumulative += silentCircle.reduce(function (sum, d) { return sum + d.count; }, 0);
                        cumulativeContacts += silentCircle.length;
                        pareto.push({
                            tier: '沉默圈',
                            contacts: silentCircle.length,
                            cumulative: cumulativeContacts / totalContacts,
                            interactions: cumulative
                        });
                    }
                    counts = sortedDistribution.map(function (d) { return d.count; }).sort(function (a, b) { return a - b; });
                    min = counts[0] || 0;
                    max = counts[counts.length - 1] || 0;
                    median = counts[Math.floor(counts.length / 2)] || 0;
                    q1 = counts[Math.floor(counts.length / 4)] || 0;
                    q3 = counts[Math.floor(counts.length * 3 / 4)] || 0;
                    iqr = q3 - q1;
                    outliers = counts.filter(function (c) { return c > q3 + 1.5 * iqr || c < q1 - 1.5 * iqr; });
                    return [2 /*return*/, {
                            histogram: histogram,
                            pareto: pareto,
                            boxplot: { min: min, q1: q1, median: median, q3: q3, max: max, outliers: outliers }
                        }];
            }
        });
    });
}
/**
 * 获取互动时间序列
 */
function getInteractionTimeSeries(parentUserId, granularity, range) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, endDate, startDate, dateFormat, seriesData, heatmap, heatmapData, weekPatternData, weekPattern;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, { series: [], heatmap: [], weekPattern: {} }];
                    }
                    endDate = new Date();
                    startDate = new Date();
                    startDate.setDate(startDate.getDate() - range);
                    dateFormat = '%Y-%m-%d';
                    if (granularity === 'week')
                        dateFormat = '%Y-%u';
                    if (granularity === 'month')
                        dateFormat = '%Y-%m';
                    return [4 /*yield*/, db
                            .select({
                            date: (0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["DATE_FORMAT(", ", ", ")"], ["DATE_FORMAT(", ", ", ")"])), schema_1.contactInteractions.interactionDate, dateFormat),
                            interactions: (0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            contacts: (0, drizzle_orm_1.sql)(templateObject_77 || (templateObject_77 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId)
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, startDate)))
                            .groupBy((0, drizzle_orm_1.sql)(templateObject_78 || (templateObject_78 = __makeTemplateObject(["DATE_FORMAT(", ", ", ")"], ["DATE_FORMAT(", ", ", ")"])), schema_1.contactInteractions.interactionDate, dateFormat))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_79 || (templateObject_79 = __makeTemplateObject(["DATE_FORMAT(", ", ", ")"], ["DATE_FORMAT(", ", ", ")"])), schema_1.contactInteractions.interactionDate, dateFormat))];
                case 3:
                    seriesData = _a.sent();
                    heatmap = [];
                    if (!(granularity === 'day')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({
                            date: (0, drizzle_orm_1.sql)(templateObject_80 || (templateObject_80 = __makeTemplateObject(["DATE(", ")"], ["DATE(", ")"])), schema_1.contactInteractions.interactionDate),
                            value: (0, drizzle_orm_1.sql)(templateObject_81 || (templateObject_81 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            weekday: (0, drizzle_orm_1.sql)(templateObject_82 || (templateObject_82 = __makeTemplateObject(["DAYOFWEEK(", ")"], ["DAYOFWEEK(", ")"])), schema_1.contactInteractions.interactionDate)
                        })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, startDate)))
                            .groupBy((0, drizzle_orm_1.sql)(templateObject_83 || (templateObject_83 = __makeTemplateObject(["DATE(", ")"], ["DATE(", ")"])), schema_1.contactInteractions.interactionDate))];
                case 4:
                    heatmapData = _a.sent();
                    heatmap = heatmapData.map(function (d) { return ({
                        date: d.date,
                        value: d.value,
                        weekday: d.weekday
                    }); });
                    _a.label = 5;
                case 5: return [4 /*yield*/, db
                        .select({
                        weekday: (0, drizzle_orm_1.sql)(templateObject_84 || (templateObject_84 = __makeTemplateObject(["DAYOFWEEK(", ")"], ["DAYOFWEEK(", ")"])), schema_1.contactInteractions.interactionDate),
                        interactions: (0, drizzle_orm_1.sql)(templateObject_85 || (templateObject_85 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        contacts: (0, drizzle_orm_1.sql)(templateObject_86 || (templateObject_86 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId)
                    })
                        .from(schema_1.contactInteractions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds), (0, drizzle_orm_1.gte)(schema_1.contactInteractions.interactionDate, startDate)))
                        .groupBy((0, drizzle_orm_1.sql)(templateObject_87 || (templateObject_87 = __makeTemplateObject(["DAYOFWEEK(", ")"], ["DAYOFWEEK(", ")"])), schema_1.contactInteractions.interactionDate))];
                case 6:
                    weekPatternData = _a.sent();
                    weekPattern = weekPatternData.map(function (d) { return ({
                        weekday: d.weekday,
                        interactions: d.interactions,
                        contacts: d.contacts
                    }); });
                    return [2 /*return*/, {
                            series: seriesData,
                            heatmap: heatmap,
                            weekPattern: weekPattern
                        }];
            }
        });
    });
}
/**
 * 获取标签互动统计
 */
function getTagInteractionStats(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, tagDistribution, totalContacts, distribution, matrix;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(parentUserId)];
                case 2:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, { distribution: [], matrix: [] }];
                    }
                    return [4 /*yield*/, db
                            .select({
                            tagId: schema_1.contactTagRelations.tagId,
                            tagName: schema_1.contactTags.name,
                            contacts: (0, drizzle_orm_1.sql)(templateObject_88 || (templateObject_88 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactTagRelations.contactId)
                        })
                            .from(schema_1.contactTagRelations)
                            .innerJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds), (0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, parentUserId)))
                            .groupBy(schema_1.contactTagRelations.tagId, schema_1.contactTags.name)
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_89 || (templateObject_89 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactTagRelations.contactId)))
                            .limit(15)];
                case 3:
                    tagDistribution = _a.sent();
                    totalContacts = visibleContactIds.length;
                    distribution = tagDistribution.map(function (t) { return ({
                        tag: t.tagName,
                        contacts: t.contacts,
                        percentage: +((t.contacts / totalContacts) * 100).toFixed(1)
                    }); });
                    return [4 /*yield*/, Promise.all(tagDistribution.map(function (t) { return __awaiter(_this, void 0, void 0, function () {
                            var tagContactIds, tagContactIdList, interactionResult, totalInteractions, activeContacts;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, db
                                            .select({ contactId: schema_1.contactTagRelations.contactId })
                                            .from(schema_1.contactTagRelations)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, t.tagId), (0, drizzle_orm_1.inArray)(schema_1.contactTagRelations.contactId, visibleContactIds)))];
                                    case 1:
                                        tagContactIds = _c.sent();
                                        tagContactIdList = tagContactIds.map(function (c) { return c.contactId; });
                                        if (tagContactIdList.length === 0) {
                                            return [2 /*return*/, {
                                                    tag: t.tagName,
                                                    contacts: t.contacts,
                                                    interactions: 0,
                                                    avgPerContact: 0,
                                                    activeRate: 0
                                                }];
                                        }
                                        return [4 /*yield*/, db
                                                .select({
                                                total: (0, drizzle_orm_1.sql)(templateObject_90 || (templateObject_90 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                                                activeContacts: (0, drizzle_orm_1.sql)(templateObject_91 || (templateObject_91 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.contactInteractions.contactId)
                                            })
                                                .from(schema_1.contactInteractions)
                                                .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, tagContactIdList))];
                                    case 2:
                                        interactionResult = _c.sent();
                                        totalInteractions = ((_a = interactionResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
                                        activeContacts = ((_b = interactionResult[0]) === null || _b === void 0 ? void 0 : _b.activeContacts) || 0;
                                        return [2 /*return*/, {
                                                tag: t.tagName,
                                                contacts: t.contacts,
                                                interactions: totalInteractions,
                                                avgPerContact: +(totalInteractions / t.contacts).toFixed(2),
                                                activeRate: +((activeContacts / t.contacts) * 100).toFixed(1)
                                            }];
                                }
                            });
                        }); }))];
                case 4:
                    matrix = _a.sent();
                    return [2 /*return*/, { distribution: distribution, matrix: matrix }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76, templateObject_77, templateObject_78, templateObject_79, templateObject_80, templateObject_81, templateObject_82, templateObject_83, templateObject_84, templateObject_85, templateObject_86, templateObject_87, templateObject_88, templateObject_89, templateObject_90, templateObject_91;
