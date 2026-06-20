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
exports.getUserPermissions = getUserPermissions;
exports.hasFeaturePermission = hasFeaturePermission;
exports.setFeaturePermission = setFeaturePermission;
exports.setUserPermissions = setUserPermissions;
exports.getAllFeatures = getAllFeatures;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
/**
 * 获取用户的所有功能权限
 */
function getUserPermissions(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userFeaturePermissions)
                            .where((0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.userId, userId))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 检查用户是否有某个功能的权限
 */
function hasFeaturePermission(userId, featureKey) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, defaultOffFeatures;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userFeaturePermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.featureKey, featureKey)))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    // 如果没有记录，根据功能类型决定默认值
                    if (result.length === 0) {
                        defaultOffFeatures = ['my-equity', 'node-growth', 'my-points', 'ai-assistant', 'wallet'];
                        if (defaultOffFeatures.includes(featureKey)) {
                            return [2 /*return*/, false];
                        }
                        // 其他功能默认开启(向后兼容)
                        return [2 /*return*/, true];
                    }
                    return [2 /*return*/, result[0].isEnabled];
            }
        });
    });
}
/**
 * 设置用户的功能权限
 */
function setFeaturePermission(userId, featureKey, isEnabled) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userFeaturePermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.featureKey, featureKey)))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    // 更新
                    return [4 /*yield*/, db
                            .update(schema_1.userFeaturePermissions)
                            .set({ isEnabled: isEnabled, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.userFeaturePermissions.id, existing[0].id))];
                case 3:
                    // 更新
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 插入
                return [4 /*yield*/, db.insert(schema_1.userFeaturePermissions).values({
                        userId: userId,
                        featureKey: featureKey,
                        isEnabled: isEnabled,
                    })];
                case 5:
                    // 插入
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量设置用户的功能权限
 */
function setUserPermissions(userId, permissions) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, permissions_1, perm;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    _i = 0, permissions_1 = permissions;
                    _a.label = 2;
                case 2:
                    if (!(_i < permissions_1.length)) return [3 /*break*/, 5];
                    perm = permissions_1[_i];
                    return [4 /*yield*/, setFeaturePermission(userId, perm.featureKey, perm.isEnabled)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有可用的功能列表
 */
function getAllFeatures() {
    return [
        { key: "games", name: "游戏", description: "各类益智游戏" },
        { key: "knowledge", name: "知识", description: "知识学习模块" },
        { key: "logic", name: "逻辑", description: "逻辑思维训练" },
        { key: "social", name: "社交", description: "社交功能" },
        { key: "exercise", name: "锻炼计数", description: "健康锻炼记录系统" },
        { key: "reading", name: "阅读", description: "阅读故事功能" },
    ];
}
