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
exports.invitePermissionRouter = void 0;
// 邀请功能权限控制API (管理员功能)
var trpc_1 = require("./_core/trpc");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
exports.invitePermissionRouter = (0, trpc_1.router)({
    // 设置用户的邀请功能权限 (仅管理员)
    setUserInvitePermission: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
        enabled: zod_1.z.boolean(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限: 只有super_admin可以操作
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以设置邀请功能权限",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    // 更新用户的邀请功能权限
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteEnabled: input.enabled ? 1 : 0,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 2:
                    // 更新用户的邀请功能权限
                    _c.sent();
                    return [2 /*return*/, {
                            success: true,
                            message: input.enabled ? "已开启邀请功能" : "已关闭邀请功能",
                        }];
            }
        });
    }); }),
    // 批量设置用户的邀请功能权限 (仅管理员)
    batchSetInvitePermission: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userIds: zod_1.z.array(zod_1.z.number()),
        enabled: zod_1.z.boolean(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, _i, _c, userId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    // 检查权限: 只有super_admin可以操作
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以设置邀请功能权限",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    _i = 0, _c = input.userIds;
                    _d.label = 2;
                case 2:
                    if (!(_i < _c.length)) return [3 /*break*/, 5];
                    userId = _c[_i];
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteEnabled: input.enabled ? 1 : 0,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 3:
                    _d.sent();
                    _d.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, {
                        success: true,
                        count: input.userIds.length,
                        message: "\u5DF2".concat(input.enabled ? '开启' : '关闭', " ").concat(input.userIds.length, " \u4E2A\u7528\u6237\u7684\u9080\u8BF7\u529F\u80FD"),
                    }];
            }
        });
    }); }),
    // 获取用户的邀请功能权限状态 (仅管理员)
    getUserInvitePermission: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, user;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限: 只有super_admin可以查询
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以查询邀请功能权限",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            inviteEnabled: schema_1.users.inviteEnabled,
                            inviteCode: schema_1.users.inviteCode,
                            inviteCount: schema_1.users.inviteCount,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 2:
                    user = (_c.sent())[0];
                    if (!user) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "用户不存在",
                        });
                    }
                    return [2 /*return*/, {
                            userId: user.id,
                            username: user.username,
                            name: user.name,
                            inviteEnabled: Boolean(user.inviteEnabled),
                            inviteCode: user.inviteCode,
                            inviteCount: user.inviteCount || 0,
                        }];
            }
        });
    }); }),
    // 获取所有用户的邀请功能权限状态 (仅管理员)
    getAllUsersInvitePermission: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, allUsers;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限: 只有super_admin可以查询
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以查询邀请功能权限",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            role: schema_1.users.role,
                            inviteEnabled: schema_1.users.inviteEnabled,
                            inviteCode: schema_1.users.inviteCode,
                            inviteCount: schema_1.users.inviteCount,
                            invitedByUserId: schema_1.users.invitedByUserId,
                            invitedAt: schema_1.users.invitedAt,
                            createdAt: schema_1.users.createdAt,
                        })
                            .from(schema_1.users)
                            .orderBy(schema_1.users.createdAt)];
                case 2:
                    allUsers = _c.sent();
                    return [2 /*return*/, allUsers.map(function (user) { return ({
                            id: user.id,
                            username: user.username,
                            name: user.name,
                            role: user.role,
                            inviteEnabled: Boolean(user.inviteEnabled),
                            inviteCode: user.inviteCode,
                            inviteCount: user.inviteCount || 0,
                            invitedByUserId: user.invitedByUserId,
                            invitedAt: user.invitedAt,
                            createdAt: user.createdAt,
                        }); })];
            }
        });
    }); }),
    // 更新用户的推荐人 (仅管理员)
    updateUserReferrer: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
        referrerId: zod_1.z.number().nullable(), // null表示清除推荐关系
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, targetUser, referrer, circularCheck;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限: 只有super_admin可以操作
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以修改推荐关系",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({ id: schema_1.users.id, invitedByUserId: schema_1.users.invitedByUserId })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 2:
                    targetUser = (_c.sent())[0];
                    if (!targetUser) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "目标用户不存在",
                        });
                    }
                    if (!(input.referrerId === null)) return [3 /*break*/, 6];
                    if (!targetUser.invitedByUserId) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteCount: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["GREATEST(0, ", " - 1)"], ["GREATEST(0, ", " - 1)"])), schema_1.users.inviteCount),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, targetUser.invitedByUserId))];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: 
                // 清除推荐关系
                return [4 /*yield*/, db
                        .update(schema_1.users)
                        .set({
                        invitedByUserId: null,
                        invitedAt: null,
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 5:
                    // 清除推荐关系
                    _c.sent();
                    return [2 /*return*/, {
                            success: true,
                            message: "已清除推荐关系",
                        }];
                case 6: return [4 /*yield*/, db
                        .select({ id: schema_1.users.id, username: schema_1.users.username, name: schema_1.users.name })
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.referrerId))];
                case 7:
                    referrer = (_c.sent())[0];
                    if (!referrer) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "推荐人不存在",
                        });
                    }
                    // 防止自己推荐自己
                    if (input.userId === input.referrerId) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "不能将自己设置为推荐人",
                        });
                    }
                    return [4 /*yield*/, db
                            .select({ invitedByUserId: schema_1.users.invitedByUserId })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.referrerId))];
                case 8:
                    circularCheck = (_c.sent())[0];
                    if ((circularCheck === null || circularCheck === void 0 ? void 0 : circularCheck.invitedByUserId) === input.userId) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "不能形成循环推荐关系",
                        });
                    }
                    if (!(targetUser.invitedByUserId && targetUser.invitedByUserId !== input.referrerId)) return [3 /*break*/, 10];
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteCount: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["GREATEST(0, ", " - 1)"], ["GREATEST(0, ", " - 1)"])), schema_1.users.inviteCount),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, targetUser.invitedByUserId))];
                case 9:
                    _c.sent();
                    _c.label = 10;
                case 10: 
                // 更新推荐关系
                return [4 /*yield*/, db
                        .update(schema_1.users)
                        .set({
                        invitedByUserId: input.referrerId,
                        invitedAt: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["CURRENT_TIMESTAMP"], ["CURRENT_TIMESTAMP"]))),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 11:
                    // 更新推荐关系
                    _c.sent();
                    if (!(targetUser.invitedByUserId !== input.referrerId)) return [3 /*break*/, 13];
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            inviteCount: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.users.inviteCount),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.referrerId))];
                case 12:
                    _c.sent();
                    _c.label = 13;
                case 13: return [2 /*return*/, {
                        success: true,
                        message: "\u5DF2\u5C06\u63A8\u8350\u4EBA\u8BBE\u7F6E\u4E3A: ".concat(referrer.name || referrer.username),
                        referrer: {
                            id: referrer.id,
                            username: referrer.username,
                            name: referrer.name,
                        },
                    }];
            }
        });
    }); }),
    // 获取用户的推荐人信息 (仅管理员)
    getUserReferrer: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, userWithReferrer, referrerInfo, referrer;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限: 只有super_admin可以查询
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "只有管理员可以查询推荐关系",
                        });
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            invitedByUserId: schema_1.users.invitedByUserId,
                            invitedAt: schema_1.users.invitedAt,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, input.userId))];
                case 2:
                    userWithReferrer = (_c.sent())[0];
                    if (!userWithReferrer) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "用户不存在",
                        });
                    }
                    referrerInfo = null;
                    if (!userWithReferrer.invitedByUserId) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            inviteCode: schema_1.users.inviteCode,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userWithReferrer.invitedByUserId))];
                case 3:
                    referrer = (_c.sent())[0];
                    if (referrer) {
                        referrerInfo = {
                            id: referrer.id,
                            username: referrer.username,
                            name: referrer.name,
                            inviteCode: referrer.inviteCode,
                        };
                    }
                    _c.label = 4;
                case 4: return [2 /*return*/, {
                        userId: userWithReferrer.userId,
                        username: userWithReferrer.username,
                        name: userWithReferrer.name,
                        invitedAt: userWithReferrer.invitedAt,
                        referrer: referrerInfo,
                    }];
            }
        });
    }); }),
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
