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
exports.createWorkGroup = createWorkGroup;
exports.getUserWorkGroups = getUserWorkGroups;
exports.getWorkGroupById = getWorkGroupById;
exports.updateWorkGroup = updateWorkGroup;
exports.archiveWorkGroup = archiveWorkGroup;
exports.getWorkGroupMembers = getWorkGroupMembers;
exports.createWorkGroupMember = createWorkGroupMember;
exports.checkWorkGroupPermission = checkWorkGroupPermission;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 脉动节点合作平台 - 工作群数据库操作
 */
// 创建工作群
function createWorkGroup(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.workGroups).values({
                            name: data.name,
                            description: data.description,
                            icon: data.icon,
                            createdBy: data.createdBy,
                            ownerId: data.ownerId,
                            isArchived: 0,
                        })];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
// 获取用户的所有工作群（包括创建的和参与的）
function getUserWorkGroups(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownedGroups;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.workGroups)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.workGroups.ownerId, userId), (0, drizzle_orm_1.eq)(schema_1.workGroups.createdBy, userId)), (0, drizzle_orm_1.eq)(schema_1.workGroups.isArchived, 0)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.workGroups.updatedAt))];
                case 2:
                    ownedGroups = _a.sent();
                    return [2 /*return*/, ownedGroups];
            }
        });
    });
}
// 获取工作群详情
function getWorkGroupById(groupId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.workGroups)
                            .where((0, drizzle_orm_1.eq)(schema_1.workGroups.id, groupId))];
                case 2:
                    group = (_a.sent())[0];
                    return [2 /*return*/, group];
            }
        });
    });
}
// 更新工作群信息
function updateWorkGroup(groupId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.workGroups)
                            .set(__assign(__assign({}, data), { updatedAt: new Date().toISOString() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.workGroups.id, groupId))];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
// 删除（归档）工作群
function archiveWorkGroup(groupId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.workGroups)
                            .set({
                            isArchived: 1,
                            updatedAt: new Date().toISOString(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.workGroups.id, groupId))];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
// 获取工作群中的所有人员（账本）
function getWorkGroupMembers(groupId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, members;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.and)((0, 
                        // eq(ledgers.groupId, groupId), // 临时注释等待数据库迁移
                        drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["1=0"], ["1=0"]))), // 临时返回空结果
                        (0, drizzle_orm_1.eq)(schema_1.ledgers.isArchived, 0)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgers.updatedAt))];
                case 2:
                    members = _a.sent();
                    return [2 /*return*/, members];
            }
        });
    });
}
// 在工作群中创建人员（账本）
function createWorkGroupMember(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.ledgers).values({
                            // groupId: data.groupId, // 临时注释等待数据库迁移
                            name: data.name,
                            description: data.description,
                            icon: data.icon,
                            type: 'work_node', // 工作节点类型
                            currency: 'CNY',
                            createdBy: data.createdBy,
                            ownerId: data.ownerId,
                            isVip: 0,
                            isArchived: 0,
                            defaultPermissionView: 'all',
                            defaultPermissionAdd: 'all',
                            defaultPermissionEdit: 'own',
                            defaultPermissionDelete: 'own',
                        })];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
// 检查用户是否有权限访问工作群
function checkWorkGroupPermission(groupId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var group;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getWorkGroupById(groupId)];
                case 1:
                    group = _a.sent();
                    if (!group) {
                        return [2 /*return*/, false];
                    }
                    // 检查是否是创建者或所有者
                    if (group.ownerId === userId || group.createdBy === userId) {
                        return [2 /*return*/, true];
                    }
                    // TODO: 后续可以添加更多权限检查逻辑
                    // 例如：检查是否是工作群中某个账本的成员
                    return [2 /*return*/, false];
            }
        });
    });
}
var templateObject_1;
