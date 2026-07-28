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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableRecipients = getAvailableRecipients;
exports.createCoupon = createCoupon;
exports.getReceivedCoupons = getReceivedCoupons;
exports.getSentCoupons = getSentCoupons;
exports.getCouponDetail = getCouponDetail;
exports.useCoupon = useCoupon;
exports.getCouponUsageRecords = getCouponUsageRecords;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var uuid_1 = require("uuid");
// ==================== 卡券管理函数 ====================
/**
 * 获取用户可以发送卡券的接收者列表（已共享人脉的用户）
 */
function getAvailableRecipients(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, recipients, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.contactSharingConnections.sharedWithId,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(contactShares)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.sharedWithId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.sharerId, userId))
                            .groupBy(schema_1.contactSharingConnections.sharedWithId)];
                case 2:
                    recipients = _a.sent();
                    return [2 /*return*/, recipients];
                case 3:
                    error_1 = _a.sent();
                    console.error("获取可发送卡券的用户列表失败:", error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建卡券并发送给指定用户
 */
function createCoupon(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, couponId_1, recipientIds, availableRecipients, recipientRecords, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    couponId_1 = (0, uuid_1.v4)();
                    // 创建卡券
                    return [4 /*yield*/, db.insert(schema_1.coupons).values({
                            id: couponId_1,
                            creatorId: data.creatorId,
                            title: data.title,
                            description: data.description || '',
                            templateType: 'default',
                            templateData: null,
                            validFrom: data.validFrom,
                            validUntil: data.validUntil,
                        })];
                case 2:
                    // 创建卡券
                    _a.sent();
                    recipientIds = void 0;
                    if (!(data.recipientIds === 'all')) return [3 /*break*/, 4];
                    return [4 /*yield*/, getAvailableRecipients(data.creatorId)];
                case 3:
                    availableRecipients = _a.sent();
                    recipientIds = availableRecipients.map(function (r) { return r.userId; });
                    return [3 /*break*/, 5];
                case 4:
                    recipientIds = data.recipientIds;
                    _a.label = 5;
                case 5:
                    if (!(recipientIds.length > 0)) return [3 /*break*/, 7];
                    recipientRecords = recipientIds.map(function (recipientId) { return ({
                        id: (0, uuid_1.v4)(),
                        couponId: couponId_1,
                        recipientId: recipientId,
                        status: 'unused',
                    }); });
                    return [4 /*yield*/, db.insert(schema_1.couponRecipients).values(recipientRecords)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [2 /*return*/, { couponId: couponId_1, recipientCount: recipientIds.length }];
                case 8:
                    error_2 = _a.sent();
                    console.error("创建卡券失败:", error_2);
                    throw error_2;
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户收到的卡券列表
 */
function getReceivedCoupons(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.coupons.id,
                            title: schema_1.coupons.title,
                            description: schema_1.coupons.description,
                            validFrom: schema_1.coupons.validFrom,
                            validUntil: schema_1.coupons.validUntil,
                            createdAt: schema_1.coupons.createdAt,
                            creatorId: schema_1.coupons.creatorId,
                            creatorName: schema_1.users.username,
                            creatorAvatar: schema_1.users.avatar,
                            recipientRecordId: schema_1.couponRecipients.id,
                            status: schema_1.couponRecipients.status,
                            receivedAt: schema_1.couponRecipients.receivedAt,
                        })
                            .from(schema_1.couponRecipients)
                            .leftJoin(schema_1.coupons, (0, drizzle_orm_1.eq)(schema_1.couponRecipients.couponId, schema_1.coupons.id))
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.coupons.creatorId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.couponRecipients.recipientId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.couponRecipients.receivedAt))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
                case 3:
                    error_3 = _a.sent();
                    console.error("获取收到的卡券列表失败:", error_3);
                    throw error_3;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户发出的卡券列表
 */
function getSentCoupons(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.coupons.id,
                            title: schema_1.coupons.title,
                            description: schema_1.coupons.description,
                            validFrom: schema_1.coupons.validFrom,
                            validUntil: schema_1.coupons.validUntil,
                            createdAt: schema_1.coupons.createdAt,
                            // 统计接收人数和已使用人数
                            totalRecipients: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.couponRecipients.id),
                            usedCount: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SUM(CASE WHEN ", " = 'used' THEN 1 ELSE 0 END)"], ["SUM(CASE WHEN ", " = 'used' THEN 1 ELSE 0 END)"])), schema_1.couponRecipients.status),
                        })
                            .from(schema_1.coupons)
                            .leftJoin(schema_1.couponRecipients, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRecipients.couponId))
                            .where((0, drizzle_orm_1.eq)(schema_1.coupons.creatorId, userId))
                            .groupBy(schema_1.coupons.id)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.coupons.createdAt))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
                case 3:
                    error_4 = _a.sent();
                    console.error("获取发出的卡券列表失败:", error_4);
                    throw error_4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取卡券详情
 */
function getCouponDetail(couponId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, couponInfo, coupon, isCreator, recipientRecord, recipientRecords, creatorInfo, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.coupons)
                            .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, couponId))
                            .limit(1)];
                case 2:
                    couponInfo = _a.sent();
                    if (couponInfo.length === 0) {
                        throw new Error("卡券不存在");
                    }
                    coupon = couponInfo[0];
                    isCreator = coupon.creatorId === userId;
                    recipientRecord = null;
                    if (!!isCreator) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.couponRecipients)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.couponRecipients.couponId, couponId), (0, drizzle_orm_1.eq)(schema_1.couponRecipients.recipientId, userId)))
                            .limit(1)];
                case 3:
                    recipientRecords = _a.sent();
                    if (recipientRecords.length === 0) {
                        throw new Error("无权查看此卡券");
                    }
                    recipientRecord = recipientRecords[0];
                    _a.label = 4;
                case 4: return [4 /*yield*/, db
                        .select({
                        username: schema_1.users.username,
                        avatar: schema_1.users.avatar,
                    })
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, coupon.creatorId))
                        .limit(1)];
                case 5:
                    creatorInfo = _a.sent();
                    return [2 /*return*/, __assign(__assign({}, coupon), { creator: creatorInfo[0], recipientRecord: recipientRecord, isCreator: isCreator })];
                case 6:
                    error_5 = _a.sent();
                    console.error("获取卡券详情失败:", error_5);
                    throw error_5;
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 使用/核销卡券
 */
function useCoupon(recipientRecordId, userId, notes) {
    return __awaiter(this, void 0, void 0, function () {
        var db, recipientRecords, recipientRecord, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.couponRecipients)
                            .where((0, drizzle_orm_1.eq)(schema_1.couponRecipients.id, recipientRecordId))
                            .limit(1)];
                case 2:
                    recipientRecords = _a.sent();
                    if (recipientRecords.length === 0) {
                        throw new Error("卡券接收记录不存在");
                    }
                    recipientRecord = recipientRecords[0];
                    // 验证用户权限
                    if (recipientRecord.recipientId !== userId) {
                        throw new Error("无权使用此卡券");
                    }
                    // 检查是否已使用
                    if (recipientRecord.status === 'used') {
                        throw new Error("卡券已使用");
                    }
                    // 更新接收记录状态
                    return [4 /*yield*/, db
                            .update(schema_1.couponRecipients)
                            .set({ status: 'used' })
                            .where((0, drizzle_orm_1.eq)(schema_1.couponRecipients.id, recipientRecordId))];
                case 3:
                    // 更新接收记录状态
                    _a.sent();
                    // 创建使用记录
                    return [4 /*yield*/, db.insert(schema_1.couponUsage).values({
                            id: (0, uuid_1.v4)(),
                            recipientRecordId: recipientRecordId,
                            couponId: recipientRecord.couponId,
                            userId: userId,
                            notes: notes || '',
                        })];
                case 4:
                    // 创建使用记录
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 5:
                    error_6 = _a.sent();
                    console.error("使用卡券失败:", error_6);
                    throw error_6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取卡券的核销记录（仅创建者可见）
 */
function getCouponUsageRecords(couponId, creatorId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, couponInfo, records, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.coupons)
                            .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, couponId))
                            .limit(1)];
                case 2:
                    couponInfo = _a.sent();
                    if (couponInfo.length === 0) {
                        throw new Error("卡券不存在");
                    }
                    if (couponInfo[0].creatorId !== creatorId) {
                        throw new Error("无权查看核销记录");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.couponUsage.id,
                            usedAt: schema_1.couponUsage.usedAt,
                            notes: schema_1.couponUsage.notes,
                            userId: schema_1.couponUsage.userId,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.couponUsage)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.couponUsage.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.couponUsage.couponId, couponId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.couponUsage.usedAt))];
                case 3:
                    records = _a.sent();
                    return [2 /*return*/, records];
                case 4:
                    error_7 = _a.sent();
                    console.error("获取核销记录失败:", error_7);
                    throw error_7;
                case 5: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2;
