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
exports.workGroupsRouter = void 0;
var trpc_1 = require("./_core/trpc");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var db_work_groups_1 = require("./db-work-groups");
/**
 * 脉动节点合作平台 - 工作群tRPC路由
 */
exports.workGroupsRouter = (0, trpc_1.router)({
    // 创建工作群
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, '工作群名称不能为空'),
        description: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, result;
        var _c;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.createWorkGroup)({
                            name: input.name.trim(),
                            description: (_c = input.description) === null || _c === void 0 ? void 0 : _c.trim(),
                            icon: input.icon,
                            createdBy: userId,
                            ownerId: userId,
                        })];
                case 1:
                    result = _d.sent();
                    return [2 /*return*/, { success: true, data: result }];
            }
        });
    }); }),
    // 获取用户的所有工作群
    list: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, groups;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.getUserWorkGroups)(userId)];
                case 1:
                    groups = _c.sent();
                    return [2 /*return*/, { success: true, data: groups }];
            }
        });
    }); }),
    // 获取工作群详情
    getById: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, hasPermission, group;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.checkWorkGroupPermission)(input.id, userId)];
                case 1:
                    hasPermission = _c.sent();
                    if (!hasPermission) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权访问此工作群' });
                    }
                    return [4 /*yield*/, (0, db_work_groups_1.getWorkGroupById)(input.id)];
                case 2:
                    group = _c.sent();
                    if (!group) {
                        throw new server_1.TRPCError({ code: 'NOT_FOUND', message: '工作群不存在' });
                    }
                    return [2 /*return*/, { success: true, data: group }];
            }
        });
    }); }),
    // 更新工作群信息
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, hasPermission, result;
        var _c, _d;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.checkWorkGroupPermission)(input.id, userId)];
                case 1:
                    hasPermission = _e.sent();
                    if (!hasPermission) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权修改此工作群' });
                    }
                    return [4 /*yield*/, (0, db_work_groups_1.updateWorkGroup)(input.id, {
                            name: (_c = input.name) === null || _c === void 0 ? void 0 : _c.trim(),
                            description: (_d = input.description) === null || _d === void 0 ? void 0 : _d.trim(),
                            icon: input.icon,
                        })];
                case 2:
                    result = _e.sent();
                    return [2 /*return*/, { success: true, data: result }];
            }
        });
    }); }),
    // 删除（归档）工作群
    delete: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, hasPermission, result;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.checkWorkGroupPermission)(input.id, userId)];
                case 1:
                    hasPermission = _c.sent();
                    if (!hasPermission) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权删除此工作群' });
                    }
                    return [4 /*yield*/, (0, db_work_groups_1.archiveWorkGroup)(input.id)];
                case 2:
                    result = _c.sent();
                    return [2 /*return*/, { success: true, data: result }];
            }
        });
    }); }),
    // 获取工作群中的所有人员
    getMembers: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, hasPermission, members;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.checkWorkGroupPermission)(input.id, userId)];
                case 1:
                    hasPermission = _c.sent();
                    if (!hasPermission) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权访问此工作群' });
                    }
                    return [4 /*yield*/, (0, db_work_groups_1.getWorkGroupMembers)(input.id)];
                case 2:
                    members = _c.sent();
                    return [2 /*return*/, { success: true, data: members }];
            }
        });
    }); }),
    // 在工作群中添加人员（创建账本）
    addMember: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        groupId: zod_1.z.number(),
        name: zod_1.z.string().min(1, '人员名称不能为空'),
        description: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, hasPermission, result;
        var _c;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, (0, db_work_groups_1.checkWorkGroupPermission)(input.groupId, userId)];
                case 1:
                    hasPermission = _d.sent();
                    if (!hasPermission) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权在此工作群中添加人员' });
                    }
                    return [4 /*yield*/, (0, db_work_groups_1.createWorkGroupMember)({
                            groupId: input.groupId,
                            name: input.name.trim(),
                            description: (_c = input.description) === null || _c === void 0 ? void 0 : _c.trim(),
                            icon: input.icon,
                            createdBy: userId,
                            ownerId: userId,
                        })];
                case 2:
                    result = _d.sent();
                    return [2 /*return*/, { success: true, data: result }];
            }
        });
    }); }),
});
