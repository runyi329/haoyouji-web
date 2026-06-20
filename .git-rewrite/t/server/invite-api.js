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
exports.inviteRouter = void 0;
// 邀请系统API
var trpc_1 = require("./_core/trpc");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var qrcode_1 = require("qrcode");
// 生成6位随机邀请码
function generateInviteCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆的字符 (0,O,1,I,L)
    var code = '';
    for (var i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
exports.inviteRouter = (0, trpc_1.router)({
    // 获取当前用户的邀请信息
    getMyInviteInfo: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, userId, user, newCode, newLink;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    userId = ctx.user.id;
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            inviteCode: schema_1.users.inviteCode,
                            inviteLink: schema_1.users.inviteLink,
                            inviteCount: schema_1.users.inviteCount,
                            invitedByUserId: schema_1.users.invitedByUserId,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 2:
                    user = (_c.sent())[0];
                    if (!user) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
                    }
                    if (!!user.inviteCode) return [3 /*break*/, 4];
                    newCode = generateInviteCode();
                    newLink = "https://jiangyuchen.cn/login?invite=".concat(newCode);
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteCode: newCode,
                            inviteLink: newLink,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 3:
                    _c.sent();
                    user.inviteCode = newCode;
                    user.inviteLink = newLink;
                    _c.label = 4;
                case 4: return [2 /*return*/, {
                        inviteCode: user.inviteCode,
                        inviteLink: user.inviteLink,
                        inviteCount: user.inviteCount || 0,
                        invitedByUserId: user.invitedByUserId,
                    }];
            }
        });
    }); }),
    // 生成邀请二维码
    generateQRCode: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        inviteCode: zod_1.z.string(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var inviteLink, qrCodeDataUrl, error_1;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    inviteLink = "https://jiangyuchen.cn/login?invite=".concat(input.inviteCode);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, qrcode_1.default.toDataURL(inviteLink, {
                            width: 300,
                            margin: 2,
                            color: {
                                dark: '#000000',
                                light: '#FFFFFF',
                            },
                        })];
                case 2:
                    qrCodeDataUrl = _c.sent();
                    return [2 /*return*/, {
                            qrCodeDataUrl: qrCodeDataUrl,
                            inviteLink: inviteLink,
                        }];
                case 3:
                    error_1 = _c.sent();
                    throw new server_1.TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "生成二维码失败",
                    });
                case 4: return [2 /*return*/];
            }
        });
    }); }),
    // 验证邀请码
    validateInviteCode: trpc_1.publicProcedure
        .input(zod_1.z.object({
        inviteCode: zod_1.z.string(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, inviter;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.inviteCode, input.inviteCode))];
                case 2:
                    inviter = (_c.sent())[0];
                    if (!inviter) {
                        return [2 /*return*/, {
                                valid: false,
                                message: "邀请码不存在",
                            }];
                    }
                    return [2 /*return*/, {
                            valid: true,
                            inviter: {
                                id: inviter.id,
                                name: inviter.name || inviter.username,
                            },
                        }];
            }
        });
    }); }),
    // 获取我邀请的用户列表
    getMyInvitedUsers: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, userId, invitedUsers;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    userId = ctx.user.id;
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            avatar: schema_1.users.avatar,
                            invitedAt: schema_1.users.invitedAt,
                            createdAt: schema_1.users.createdAt,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.invitedByUserId, userId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.users.invitedAt))];
                case 2:
                    invitedUsers = _c.sent();
                    return [2 /*return*/, invitedUsers];
            }
        });
    }); }),
    // 重新生成邀请码 (管理员功能)
    regenerateInviteCode: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number().optional(), // 如果不提供,则为当前用户
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, targetUserId, attempts, maxAttempts, newCode, newLink, error_2;
        var _c;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    targetUserId = input.userId || ctx.user.id;
                    // 如果是为其他用户生成,需要管理员权限
                    if (input.userId && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以为其他用户重新生成邀请码",
                        });
                    }
                    attempts = 0;
                    maxAttempts = 10;
                    _d.label = 2;
                case 2:
                    if (!(attempts < maxAttempts)) return [3 /*break*/, 7];
                    newCode = generateInviteCode();
                    newLink = "https://jiangyuchen.cn/login?invite=".concat(newCode);
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteCode: newCode,
                            inviteLink: newLink,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, targetUserId))];
                case 4:
                    _d.sent();
                    return [2 /*return*/, {
                            success: true,
                            inviteCode: newCode,
                            inviteLink: newLink,
                        }];
                case 5:
                    error_2 = _d.sent();
                    if ((_c = error_2.message) === null || _c === void 0 ? void 0 : _c.includes('Duplicate entry')) {
                        attempts++;
                        return [3 /*break*/, 2];
                    }
                    throw error_2;
                case 6: return [3 /*break*/, 2];
                case 7: throw new server_1.TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "生成邀请码失败,请重试",
                });
            }
        });
    }); }),
    // 获取我邀请的好友列表及其人脉统计
    getMyInvitedFriends: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, userId, invitedUsers, friendsWithStats;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    userId = ctx.user.id;
                    console.log('[getMyInvitedFriends] 开始查询，当前用户ID:', userId);
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            avatar: schema_1.users.avatar,
                            invitedAt: schema_1.users.invitedAt,
                            createdAt: schema_1.users.createdAt,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.invitedByUserId, userId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.users.invitedAt))];
                case 2:
                    invitedUsers = _c.sent();
                    console.log('[getMyInvitedFriends] 查询到邀请用户数:', invitedUsers.length);
                    if (invitedUsers.length === 0) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, Promise.all(invitedUsers.map(function (friend) { return __awaiter(void 0, void 0, void 0, function () {
                            var mineResult, ownCount, sharingConnections, sharedCount, sharerIds, sharedResult, totalCount, globalTagsResult, globalTagsCount, personalTagsResult, personalTagsCount, totalTagsCount, userContactIds, interactionsCount, contactIds, interactionsResult;
                            var _a, _b, _c, _d, _e;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0: return [4 /*yield*/, db
                                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                            .from(schema_1.contacts)
                                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, friend.id))];
                                    case 1:
                                        mineResult = _f.sent();
                                        ownCount = ((_a = mineResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                                        return [4 /*yield*/, db
                                                .select({ sharerId: schema_1.contactSharingConnections.sharerId })
                                                .from(schema_1.contactSharingConnections)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, friend.id), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                                    case 2:
                                        sharingConnections = _f.sent();
                                        sharedCount = 0;
                                        if (!(sharingConnections.length > 0)) return [3 /*break*/, 4];
                                        sharerIds = sharingConnections.map(function (conn) { return conn.sharerId; });
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contacts)
                                                .where((0, drizzle_orm_1.inArray)(schema_1.contacts.parentUserId, sharerIds))];
                                    case 3:
                                        sharedResult = _f.sent();
                                        sharedCount = ((_b = sharedResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                                        _f.label = 4;
                                    case 4:
                                        totalCount = ownCount + sharedCount;
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactTags)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, friend.id))];
                                    case 5:
                                        globalTagsResult = _f.sent();
                                        globalTagsCount = ((_c = globalTagsResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.personalContactTags)
                                                .where((0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, friend.id))];
                                    case 6:
                                        personalTagsResult = _f.sent();
                                        personalTagsCount = ((_d = personalTagsResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0;
                                        totalTagsCount = globalTagsCount + personalTagsCount;
                                        return [4 /*yield*/, db
                                                .select({ id: schema_1.contacts.id })
                                                .from(schema_1.contacts)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, friend.id))];
                                    case 7:
                                        userContactIds = _f.sent();
                                        interactionsCount = 0;
                                        if (!(userContactIds.length > 0)) return [3 /*break*/, 9];
                                        contactIds = userContactIds.map(function (c) { return c.id; });
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactInteractions)
                                                .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, contactIds))];
                                    case 8:
                                        interactionsResult = _f.sent();
                                        interactionsCount = ((_e = interactionsResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0;
                                        _f.label = 9;
                                    case 9:
                                        console.log("[getMyInvitedFriends] \u7528\u6237 ".concat(friend.username, "(").concat(friend.id, "): \u81EA\u5DF1=").concat(ownCount, ", \u5171\u4EAB=").concat(sharedCount, ", \u5168\u90E8=").concat(totalCount, ", \u6807\u7B7E=").concat(totalTagsCount, ", \u8054\u7EDC=").concat(interactionsCount));
                                        return [2 /*return*/, {
                                                id: friend.id,
                                                username: friend.username,
                                                name: friend.name,
                                                avatar: friend.avatar,
                                                invitedAt: friend.invitedAt,
                                                createdAt: friend.createdAt,
                                                ownContactsCount: ownCount,
                                                sharedContactsCount: sharedCount,
                                                totalContactsCount: totalCount,
                                                tagsCount: totalTagsCount,
                                                interactionsCount: interactionsCount,
                                            }];
                                }
                            });
                        }); }))];
                case 3:
                    friendsWithStats = _c.sent();
                    console.log('[getMyInvitedFriends] 查询完成，返回数据:', friendsWithStats.length, '条');
                    return [2 /*return*/, friendsWithStats];
            }
        });
    }); }),
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7;
