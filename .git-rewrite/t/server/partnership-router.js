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
exports.partnershipRouter = void 0;
var zod_1 = require("zod");
var trpc_1 = require("./_core/trpc");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var mysql_core_1 = require("drizzle-orm/mysql-core");
// Dashboard tables (inline definition to avoid schema regeneration)
var partnershipDashboardActivities = (0, mysql_core_1.mysqlTable)("partnership_dashboard_activities", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull().default(1),
    userName: (0, mysql_core_1.varchar)("user_name", { length: 100 }).notNull(),
    action: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    timeText: (0, mysql_core_1.varchar)("time_text", { length: 100 }).notNull(),
    sortOrder: (0, mysql_core_1.int)("sort_order").notNull().default(0),
});
var partnershipDashboardAlerts = (0, mysql_core_1.mysqlTable)("partnership_dashboard_alerts", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull().default(1),
    type: (0, mysql_core_1.varchar)({ length: 20 }).notNull().default("warning"),
    message: (0, mysql_core_1.text)().notNull(),
    actionText: (0, mysql_core_1.varchar)("action_text", { length: 255 }).notNull().default(""),
    sortOrder: (0, mysql_core_1.int)("sort_order").notNull().default(0),
});
exports.partnershipRouter = (0, trpc_1.router)({
    // 搜索可邀请的用户（排除已是成员的用户）
    searchUsers: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number(),
        query: zod_1.z.string(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var partnershipId, query, db, existingMembers, existingUserIds, allUsers, filteredUsers;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    partnershipId = input.partnershipId, query = input.query;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.partnershipMembers.userId })
                            .from(schema_1.partnershipMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.partnershipMembers.partnershipId, partnershipId))];
                case 2:
                    existingMembers = _c.sent();
                    existingUserIds = existingMembers.map(function (m) { return m.userId; });
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            email: schema_1.users.email,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.users)
                            .where(query.trim()
                            ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.users.username, "%".concat(query, "%")), (0, drizzle_orm_1.like)(schema_1.users.name, "%".concat(query, "%")), (0, drizzle_orm_1.like)(schema_1.users.email, "%".concat(query, "%")))
                            : undefined)
                            .limit(20)];
                case 3:
                    allUsers = _c.sent();
                    filteredUsers = allUsers.filter(function (user) { return !existingUserIds.includes(user.id); });
                    return [2 /*return*/, filteredUsers];
            }
        });
    }); }),
    // 添加成员到企业和工作群
    addMember: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number(),
        userId: zod_1.z.number(),
        workGroupIds: zod_1.z.array(zod_1.z.number()),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var partnershipId, userId, workGroupIds, db, existingMember, workGroupMemberValues;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    partnershipId = input.partnershipId, userId = input.userId, workGroupIds = input.workGroupIds;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.partnershipMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.partnershipMembers.partnershipId, partnershipId), (0, drizzle_orm_1.eq)(schema_1.partnershipMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    existingMember = _c.sent();
                    if (existingMember.length > 0) {
                        throw new Error("该用户已是企业成员");
                    }
                    // 添加成员到企业
                    return [4 /*yield*/, db.insert(schema_1.partnershipMembers).values({
                            partnershipId: partnershipId,
                            userId: userId,
                            role: "member",
                        })];
                case 3:
                    // 添加成员到企业
                    _c.sent();
                    if (!(workGroupIds.length > 0)) return [3 /*break*/, 5];
                    workGroupMemberValues = workGroupIds.map(function (workGroupId) { return ({
                        workGroupId: workGroupId,
                        userId: userId,
                    }); });
                    return [4 /*yield*/, db.insert(schema_1.partnershipWorkGroupMembers).values(workGroupMemberValues)];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5: return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 获取企业成员列表
    getMembers: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var partnershipId, db, members, memberIds, memberWorkGroups, membersWithStats;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    partnershipId = input.partnershipId;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            name: schema_1.users.name,
                            email: schema_1.users.email,
                            avatar: schema_1.users.avatar,
                            role: schema_1.partnershipMembers.role,
                            joinedAt: schema_1.partnershipMembers.joinedAt,
                        })
                            .from(schema_1.partnershipMembers)
                            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.partnershipMembers.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.partnershipMembers.partnershipId, partnershipId))];
                case 2:
                    members = _c.sent();
                    memberIds = members.map(function (m) { return m.id; });
                    if (memberIds.length === 0) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.partnershipWorkGroupMembers.userId,
                            workGroupId: schema_1.partnershipWorkGroupMembers.workGroupId,
                            workGroupName: schema_1.partnershipWorkGroups.name,
                        })
                            .from(schema_1.partnershipWorkGroupMembers)
                            .innerJoin(schema_1.partnershipWorkGroups, (0, drizzle_orm_1.eq)(schema_1.partnershipWorkGroupMembers.workGroupId, schema_1.partnershipWorkGroups.id))
                            .where((0, drizzle_orm_1.inArray)(schema_1.partnershipWorkGroupMembers.userId, memberIds))];
                case 3:
                    memberWorkGroups = _c.sent();
                    return [4 /*yield*/, Promise.all(members.map(function (member) { return __awaiter(void 0, void 0, void 0, function () {
                            var workGroups, ownContactsResult, ownContactsCount, sharedContactsResult, sharedContactsCount, totalContactsCount, globalTagsResult, globalTagsCount, personalTagsResult, uniquePersonalTags, personalTagsCount, tagsCount, myContactIds, interactionsCount, contactIds, interactionsResult;
                            var _a, _b, _c, _d;
                            return __generator(this, function (_e) {
                                switch (_e.label) {
                                    case 0:
                                        workGroups = memberWorkGroups
                                            .filter(function (wg) { return wg.userId === member.id; })
                                            .map(function (wg) { return ({
                                            id: wg.workGroupId,
                                            name: wg.workGroupName,
                                        }); });
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contacts)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, member.id))];
                                    case 1:
                                        ownContactsResult = _e.sent();
                                        ownContactsCount = ((_a = ownContactsResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactSharingConnections)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.receiverId, member.id), (0, drizzle_orm_1.eq)(schema_1.contactSharingConnections.status, 'active')))];
                                    case 2:
                                        sharedContactsResult = _e.sent();
                                        sharedContactsCount = ((_b = sharedContactsResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                                        totalContactsCount = ownContactsCount + sharedContactsCount;
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactTags)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contactTags.parentUserId, member.id))];
                                    case 3:
                                        globalTagsResult = _e.sent();
                                        globalTagsCount = ((_c = globalTagsResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0;
                                        return [4 /*yield*/, db
                                                .select({ name: schema_1.personalContactTags.name })
                                                .from(schema_1.personalContactTags)
                                                .where((0, drizzle_orm_1.eq)(schema_1.personalContactTags.parentUserId, member.id))];
                                    case 4:
                                        personalTagsResult = _e.sent();
                                        uniquePersonalTags = new Set(personalTagsResult.map(function (t) { return t.name; }));
                                        personalTagsCount = uniquePersonalTags.size;
                                        tagsCount = globalTagsCount + personalTagsCount;
                                        return [4 /*yield*/, db
                                                .select({ id: schema_1.contacts.id })
                                                .from(schema_1.contacts)
                                                .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, member.id))];
                                    case 5:
                                        myContactIds = _e.sent();
                                        interactionsCount = 0;
                                        if (!(myContactIds.length > 0)) return [3 /*break*/, 7];
                                        contactIds = myContactIds.map(function (c) { return c.id; });
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.contactInteractions)
                                                .where((0, drizzle_orm_1.inArray)(schema_1.contactInteractions.contactId, contactIds))];
                                    case 6:
                                        interactionsResult = _e.sent();
                                        interactionsCount = ((_d = interactionsResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0;
                                        _e.label = 7;
                                    case 7: return [2 /*return*/, __assign(__assign({}, member), { workGroups: workGroups, ownContactsCount: ownContactsCount, sharedContactsCount: sharedContactsCount, totalContactsCount: totalContactsCount, tagsCount: tagsCount, interactionsCount: interactionsCount })];
                                }
                            });
                        }); }))];
                case 4:
                    membersWithStats = _c.sent();
                    return [2 /*return*/, membersWithStats];
            }
        });
    }); }),
    // 获取工作群列表
    getWorkGroups: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var partnershipId, db, workGroups;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    partnershipId = input.partnershipId;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.partnershipWorkGroups.id,
                            name: schema_1.partnershipWorkGroups.name,
                            description: schema_1.partnershipWorkGroups.description,
                        })
                            .from(schema_1.partnershipWorkGroups)
                            .where((0, drizzle_orm_1.eq)(schema_1.partnershipWorkGroups.partnershipId, partnershipId))];
                case 2:
                    workGroups = _c.sent();
                    return [2 /*return*/, workGroups];
            }
        });
    }); }),
    // 移除成员
    removeMember: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number(),
        userId: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var partnershipId, userId, db, workGroups, workGroupIds;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    partnershipId = input.partnershipId, userId = input.userId;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    // 删除成员-企业关联
                    return [4 /*yield*/, db
                            .delete(schema_1.partnershipMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.partnershipMembers.partnershipId, partnershipId), (0, drizzle_orm_1.eq)(schema_1.partnershipMembers.userId, userId)))];
                case 2:
                    // 删除成员-企业关联
                    _c.sent();
                    return [4 /*yield*/, db
                            .select({ id: schema_1.partnershipWorkGroups.id })
                            .from(schema_1.partnershipWorkGroups)
                            .where((0, drizzle_orm_1.eq)(schema_1.partnershipWorkGroups.partnershipId, partnershipId))];
                case 3:
                    workGroups = _c.sent();
                    workGroupIds = workGroups.map(function (wg) { return wg.id; });
                    if (!(workGroupIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .delete(schema_1.partnershipWorkGroupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.partnershipWorkGroupMembers.workGroupId, workGroupIds), (0, drizzle_orm_1.eq)(schema_1.partnershipWorkGroupMembers.userId, userId)))];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5: return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // ========== Dashboard 管理 API ==========
    // 获取最新动态列表
    getDashboardActivities: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number().default(1),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, activities;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(partnershipDashboardActivities)
                            .where((0, drizzle_orm_1.eq)(partnershipDashboardActivities.partnershipId, input.partnershipId))
                            .orderBy((0, drizzle_orm_1.asc)(partnershipDashboardActivities.sortOrder))];
                case 2:
                    activities = _c.sent();
                    return [2 /*return*/, activities];
            }
        });
    }); }),
    // 保存最新动态（先删后插）
    saveDashboardActivities: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number().default(1),
        activities: zod_1.z.array(zod_1.z.object({
            userName: zod_1.z.string(),
            action: zod_1.z.string(),
            timeText: zod_1.z.string(),
        })),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, values;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    // 先删除旧数据
                    return [4 /*yield*/, db
                            .delete(partnershipDashboardActivities)
                            .where((0, drizzle_orm_1.eq)(partnershipDashboardActivities.partnershipId, input.partnershipId))];
                case 2:
                    // 先删除旧数据
                    _c.sent();
                    if (!(input.activities.length > 0)) return [3 /*break*/, 4];
                    values = input.activities.map(function (a, index) { return ({
                        partnershipId: input.partnershipId,
                        userName: a.userName,
                        action: a.action,
                        timeText: a.timeText,
                        sortOrder: index + 1,
                    }); });
                    return [4 /*yield*/, db.insert(partnershipDashboardActivities).values(values)];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 获取预警雷达列表
    getDashboardAlerts: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number().default(1),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, alerts;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(partnershipDashboardAlerts)
                            .where((0, drizzle_orm_1.eq)(partnershipDashboardAlerts.partnershipId, input.partnershipId))
                            .orderBy((0, drizzle_orm_1.asc)(partnershipDashboardAlerts.sortOrder))];
                case 2:
                    alerts = _c.sent();
                    return [2 /*return*/, alerts];
            }
        });
    }); }),
    // 保存预警雷达（先删后插）
    saveDashboardAlerts: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        partnershipId: zod_1.z.number().default(1),
        alerts: zod_1.z.array(zod_1.z.object({
            type: zod_1.z.string(),
            message: zod_1.z.string(),
            actionText: zod_1.z.string(),
        })),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, values;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    // 先删除旧数据
                    return [4 /*yield*/, db
                            .delete(partnershipDashboardAlerts)
                            .where((0, drizzle_orm_1.eq)(partnershipDashboardAlerts.partnershipId, input.partnershipId))];
                case 2:
                    // 先删除旧数据
                    _c.sent();
                    if (!(input.alerts.length > 0)) return [3 /*break*/, 4];
                    values = input.alerts.map(function (a, index) { return ({
                        partnershipId: input.partnershipId,
                        type: a.type,
                        message: a.message,
                        actionText: a.actionText,
                        sortOrder: index + 1,
                    }); });
                    return [4 /*yield*/, db.insert(partnershipDashboardAlerts).values(values)];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/, { success: true }];
            }
        });
    }); }),
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
