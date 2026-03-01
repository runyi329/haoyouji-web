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
exports.getRegionTrend = getRegionTrend;
exports.getOverseasAndOtherTrend = getOverseasAndOtherTrend;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取地域分布趋势数据
 * @param userId 用户ID
 * @param months 查询最近几个月的数据(默认6个月)
 * @param regions 指定查询的省份列表(可选,为空则查询所有省份)
 * @returns 地域趋势数据
 */
function getRegionTrend(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, months, regions) {
        var db, startDate, targetRegions, allRegions, regionCounts, trendData, monthsList, i, date, monthStr, _i, monthsList_1, month, dataPoint, _a, targetRegions_1, region, _b, targetRegions_2, region, i, monthStart, monthEnd, result, count;
        if (months === void 0) { months = 6; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - months);
                    startDate.setDate(1);
                    startDate.setHours(0, 0, 0, 0);
                    targetRegions = regions;
                    if (!(!targetRegions || targetRegions.length === 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .selectDistinct({ region: schema_1.contacts.region })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.isNotNull)(schema_1.contacts.region), (0, drizzle_orm_1.ne)(schema_1.contacts.region, '')))];
                case 2:
                    allRegions = _c.sent();
                    targetRegions = allRegions
                        .map(function (r) { return r.region; })
                        .filter(function (r) { return r; });
                    if (!(targetRegions.length > 10)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .select({
                            region: schema_1.contacts.region,
                            count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.isNotNull)(schema_1.contacts.region), (0, drizzle_orm_1.ne)(schema_1.contacts.region, '')))
                            .groupBy(schema_1.contacts.region)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["COUNT(*) DESC"], ["COUNT(*) DESC"]))))
                            .limit(10)];
                case 3:
                    regionCounts = _c.sent();
                    targetRegions = regionCounts
                        .map(function (r) { return r.region; })
                        .filter(function (r) { return r; });
                    _c.label = 4;
                case 4:
                    trendData = [];
                    monthsList = [];
                    for (i = 0; i < months; i++) {
                        date = new Date();
                        date.setMonth(date.getMonth() - (months - 1 - i));
                        monthStr = "".concat(date.getFullYear(), "-").concat(String(date.getMonth() + 1).padStart(2, '0'));
                        monthsList.push(monthStr);
                    }
                    // 为每个月份初始化数据
                    for (_i = 0, monthsList_1 = monthsList; _i < monthsList_1.length; _i++) {
                        month = monthsList_1[_i];
                        dataPoint = {
                            month: month,
                        };
                        // 为每个省份初始化为0
                        for (_a = 0, targetRegions_1 = targetRegions; _a < targetRegions_1.length; _a++) {
                            region = targetRegions_1[_a];
                            dataPoint[region] = 0;
                        }
                        trendData.push(dataPoint);
                    }
                    _b = 0, targetRegions_2 = targetRegions;
                    _c.label = 5;
                case 5:
                    if (!(_b < targetRegions_2.length)) return [3 /*break*/, 10];
                    region = targetRegions_2[_b];
                    i = 0;
                    _c.label = 6;
                case 6:
                    if (!(i < months)) return [3 /*break*/, 9];
                    monthStart = new Date();
                    monthStart.setMonth(monthStart.getMonth() - (months - 1 - i));
                    monthStart.setDate(1);
                    monthStart.setHours(0, 0, 0, 0);
                    monthEnd = new Date(monthStart);
                    monthEnd.setMonth(monthEnd.getMonth() + 1);
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, region), (0, drizzle_orm_1.gte)(schema_1.contacts.createdAt, monthStart), (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.contacts.createdAt, monthEnd)))];
                case 7:
                    result = (_c.sent())[0];
                    count = Number(result === null || result === void 0 ? void 0 : result.count) || 0;
                    trendData[i][region] = count;
                    _c.label = 8;
                case 8:
                    i++;
                    return [3 /*break*/, 6];
                case 9:
                    _b++;
                    return [3 /*break*/, 5];
                case 10: return [2 /*return*/, {
                        data: trendData,
                        regions: targetRegions,
                    }];
            }
        });
    });
}
/**
 * 获取海外和其他类别的趋势数据
 * @param userId 用户ID
 * @param months 查询最近几个月的数据
 * @returns 海外和其他的趋势数据
 */
function getOverseasAndOtherTrend(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, months) {
        var db, trendData, i, monthStart, monthEnd, monthStr, overseasResult, otherResult;
        if (months === void 0) { months = 6; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    trendData = [];
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < months)) return [3 /*break*/, 6];
                    monthStart = new Date();
                    monthStart.setMonth(monthStart.getMonth() - (months - 1 - i));
                    monthStart.setDate(1);
                    monthStart.setHours(0, 0, 0, 0);
                    monthEnd = new Date(monthStart);
                    monthEnd.setMonth(monthEnd.getMonth() + 1);
                    monthStr = "".concat(monthStart.getFullYear(), "-").concat(String(monthStart.getMonth() + 1).padStart(2, '0'));
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.eq)(schema_1.contacts.region, '海外'), (0, drizzle_orm_1.gte)(schema_1.contacts.createdAt, monthStart), (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.contacts.createdAt, monthEnd)))];
                case 3:
                    overseasResult = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.contacts.region), (0, drizzle_orm_1.eq)(schema_1.contacts.region, '')), (0, drizzle_orm_1.gte)(schema_1.contacts.createdAt, monthStart), (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.contacts.createdAt, monthEnd)))];
                case 4:
                    otherResult = (_a.sent())[0];
                    trendData.push({
                        month: monthStr,
                        海外: Number(overseasResult === null || overseasResult === void 0 ? void 0 : overseasResult.count) || 0,
                        其他: Number(otherResult === null || otherResult === void 0 ? void 0 : otherResult.count) || 0,
                    });
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/, trendData];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8;
