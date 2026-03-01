"use strict";
/**
 * 活跃人脉统计模块
 *
 * 统计规则:
 * - 统计"全部"人脉(我的+共享的)中的活跃数量
 * - 活跃定义: 在指定时间范围内有联络记录
 * - 同一个人多次联络只算1次
 *
 * 重要: interactionDate 在数据库中是 timestamp 类型，存储的是 ISO 格式字符串
 * 例如: "2026-02-04 08:30:00" 或 "2026-02-04T08:30:00.000Z"
 * 需要使用字符串比较或转换为 Date 对象进行比较
 */
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
exports.getTodayActiveCount = getTodayActiveCount;
exports.getWeeklyActiveCount = getWeeklyActiveCount;
exports.getMonthlyActiveCount = getMonthlyActiveCount;
exports.getYearlyActiveCount = getYearlyActiveCount;
exports.getAllActiveStats = getAllActiveStats;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var timezone_1 = require("../shared/timezone");
// 注意：现在使用 shared/timezone.ts 中的时间函数，保证与其他模块一致
/**
 * 获取用户所有可见的联系人ID(我的+共享的)
 */
function getAllVisibleContactIds(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, myContacts, myContactIds, contactSharingConnections, sharingConnections, sharedContactIds, sharerIds, sharerContacts, allIds;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    console.log("[getAllVisibleContactIds] \u5F00\u59CB\u67E5\u8BE2\u7528\u6237 ".concat(userId, " \u7684\u53EF\u89C1\u4EBA\u8109"));
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 2:
                    myContacts = _a.sent();
                    myContactIds = myContacts.map(function (c) { return c.id; });
                    console.log("[getAllVisibleContactIds] \u6211\u7684\u4EBA\u8109\u6570\u91CF: ".concat(myContactIds.length));
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 3:
                    contactSharingConnections = (_a.sent()).contactSharingConnections;
                    return [4 /*yield*/, db
                            .select({ sharerId: contactSharingConnections.sharerId })
                            .from(contactSharingConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(contactSharingConnections.receiverId, userId), (0, drizzle_orm_1.eq)(contactSharingConnections.status, 'active')))];
                case 4:
                    sharingConnections = _a.sent();
                    console.log("[getAllVisibleContactIds] \u627E\u5230\u7684\u5171\u4EAB\u8FDE\u63A5\u6570: ".concat(sharingConnections.length));
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
                    console.log("[getAllVisibleContactIds] \u5171\u4EAB\u8054\u7CFB\u4EBA\u603B\u6570: ".concat(sharedContactIds.length));
                    allIds = Array.from(new Set(__spreadArray(__spreadArray([], myContactIds, true), sharedContactIds, true)));
                    console.log("[getAllVisibleContactIds] \u6700\u7EC8\u53EF\u89C1\u8054\u7CFB\u4EBA\u603B\u6570: ".concat(allIds.length));
                    return [2 /*return*/, allIds];
            }
        });
    });
}
/**
 * 统计指定时间范围内的活跃人脉数量
 * @param userId 用户ID
 * @param startDate 开始时间（Date对象）
 */
function getActiveCount(userId, startDate) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleContactIds, startDateStr, interactions, activeContactIds;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleContactIds = _a.sent();
                    if (visibleContactIds.length === 0) {
                        return [2 /*return*/, 0];
                    }
                    startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
                    console.log("[getActiveCount] userId=".concat(userId, ", startDate=").concat(startDate.toISOString(), ", startDateStr=").concat(startDateStr));
                    console.log("[getActiveCount] \u53EF\u89C1\u4EBA\u8109\u6570\u91CF: ".concat(visibleContactIds.length));
                    return [4 /*yield*/, db
                            .select({ contactId: schema_1.contactInteractions.contactId, interactionDate: schema_1.contactInteractions.interactionDate })
                            .from(schema_1.contactInteractions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.contactInteractions.interactionDate, startDateStr), (0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, visibleContactIds)))];
                case 3:
                    interactions = _a.sent();
                    console.log("[getActiveCount] \u67E5\u8BE2\u5230 ".concat(interactions.length, " \u6761\u8054\u7EDC\u8BB0\u5F55"));
                    if (interactions.length > 0 && interactions.length <= 5) {
                        console.log("[getActiveCount] \u793A\u4F8B\u8BB0\u5F55:", interactions.map(function (i) { return ({ contactId: i.contactId, date: i.interactionDate }); }));
                    }
                    activeContactIds = new Set(interactions.map(function (i) { return i.contactId; }));
                    console.log("[getActiveCount] \u53BB\u91CD\u540E\u6D3B\u8DC3\u4EBA\u8109\u6570: ".concat(activeContactIds.size));
                    return [2 /*return*/, activeContactIds.size];
            }
        });
    });
}
/**
 * 获取今日活跃人脉数量
 */
function getTodayActiveCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var startTimestamp, startDate;
        return __generator(this, function (_a) {
            startTimestamp = (0, timezone_1.getBeijingTodayStart)();
            startDate = new Date(startTimestamp);
            console.log("[getTodayActiveCount] \u4ECA\u65E5\u5F00\u59CB\u65F6\u95F4: ".concat(startDate.toISOString()));
            return [2 /*return*/, getActiveCount(userId, startDate)];
        });
    });
}
/**
 * 获取本周活跃人脉数量
 */
function getWeeklyActiveCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var startTimestamp, startDate;
        return __generator(this, function (_a) {
            startTimestamp = (0, timezone_1.getBeijingThisWeekStart)();
            startDate = new Date(startTimestamp);
            console.log("[getWeeklyActiveCount] \u672C\u5468\u5F00\u59CB\u65F6\u95F4: ".concat(startDate.toISOString()));
            return [2 /*return*/, getActiveCount(userId, startDate)];
        });
    });
}
/**
 * 获取本月活跃人脉数量
 */
function getMonthlyActiveCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var startTimestamp, startDate;
        return __generator(this, function (_a) {
            startTimestamp = (0, timezone_1.getBeijingThisMonthStart)();
            startDate = new Date(startTimestamp);
            console.log("[getMonthlyActiveCount] \u672C\u6708\u5F00\u59CB\u65F6\u95F4: ".concat(startDate.toISOString()));
            return [2 /*return*/, getActiveCount(userId, startDate)];
        });
    });
}
/**
 * 获取今年活跃人脉数量
 */
function getYearlyActiveCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var startTimestamp, startDate;
        return __generator(this, function (_a) {
            startTimestamp = (0, timezone_1.getBeijingThisYearStart)();
            startDate = new Date(startTimestamp);
            console.log("[getYearlyActiveCount] \u672C\u5E74\u5F00\u59CB\u65F6\u95F4: ".concat(startDate.toISOString()));
            return [2 /*return*/, getActiveCount(userId, startDate)];
        });
    });
}
/**
 * 一次性获取所有活跃统计数据
 */
function getAllActiveStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, todayActive, weeklyActive, monthlyActive, yearlyActive, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    console.log('[getAllActiveStats] 开始查询用户ID:', userId);
                    console.log('[getAllActiveStats] 注意：统计的是全部人脉（我的+共享）');
                    return [4 /*yield*/, Promise.all([
                            getTodayActiveCount(userId),
                            getWeeklyActiveCount(userId),
                            getMonthlyActiveCount(userId),
                            getYearlyActiveCount(userId),
                        ])];
                case 1:
                    _a = _b.sent(), todayActive = _a[0], weeklyActive = _a[1], monthlyActive = _a[2], yearlyActive = _a[3];
                    console.log('[getAllActiveStats] 查询结果（全部人脉）:', { todayActive: todayActive, weeklyActive: weeklyActive, monthlyActive: monthlyActive, yearlyActive: yearlyActive });
                    return [2 /*return*/, {
                            todayActive: todayActive,
                            weeklyActive: weeklyActive,
                            monthlyActive: monthlyActive,
                            yearlyActive: yearlyActive,
                        }];
                case 2:
                    error_1 = _b.sent();
                    console.error('[getAllActiveStats] 查询失败:', error_1);
                    // 返回默认值而不是抛出异常
                    return [2 /*return*/, {
                            todayActive: 0,
                            weeklyActive: 0,
                            monthlyActive: 0,
                            yearlyActive: 0,
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
