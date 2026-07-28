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
exports.getAllPointRules = getAllPointRules;
exports.getPointRuleByActionType = getPointRuleByActionType;
exports.updatePointRule = updatePointRule;
exports.createPointLog = createPointLog;
exports.getUserPointLogs = getUserPointLogs;
exports.getAllPointLogs = getAllPointLogs;
exports.getUserPoints = getUserPoints;
exports.addUserPoints = addUserPoints;
exports.subtractUserPoints = subtractUserPoints;
exports.addPointsForAction = addPointsForAction;
exports.adjustUserPointsByAdmin = adjustUserPointsByAdmin;
exports.getAllUsersWithPoints = getAllUsersWithPoints;
exports.searchUsersByUsername = searchUsersByUsername;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ==================== 积分规则 CRUD ====================
/**
 * 获取所有积分规则
 */
function getAllPointRules() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT * FROM point_rules ORDER BY id"], ["SELECT * FROM point_rules ORDER BY id"]))))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Array.isArray(result) ? result : []];
                case 4:
                    error_1 = _a.sent();
                    console.error("[PointSystem] Error fetching point rules:", error_1);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取单个积分规则
 */
function getPointRuleByActionType(actionType) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, rows, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SELECT * FROM point_rules WHERE actionType = ", " LIMIT 1"], ["SELECT * FROM point_rules WHERE actionType = ", " LIMIT 1"])), actionType))];
                case 3:
                    result = _a.sent();
                    rows = Array.isArray(result) ? result : [];
                    return [2 /*return*/, rows[0] || null];
                case 4:
                    error_2 = _a.sent();
                    console.error("[PointSystem] Error fetching point rule:", error_2);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新积分规则
 */
function updatePointRule(actionType, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updates, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 9, , 10]);
                    updates = [];
                    if (!(data.points !== undefined)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["UPDATE point_rules SET points = ", " WHERE actionType = ", ""], ["UPDATE point_rules SET points = ", " WHERE actionType = ", ""])), data.points, actionType))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    if (!(data.isActive !== undefined)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["UPDATE point_rules SET isActive = ", " WHERE actionType = ", ""], ["UPDATE point_rules SET isActive = ", " WHERE actionType = ", ""])), data.isActive, actionType))];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    if (!(data.description !== undefined)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["UPDATE point_rules SET description = ", " WHERE actionType = ", ""], ["UPDATE point_rules SET description = ", " WHERE actionType = ", ""])), data.description, actionType))];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_3 = _a.sent();
                    console.error("[PointSystem] Error updating point rule:", error_3);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// ==================== 积分变动记录 ====================
/**
 * 创建积分变动记录
 */
function createPointLog(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n      INSERT INTO point_logs (userId, actionType, points, description, operatorId, relatedId)\n      VALUES (", ", ", ", ", ", ", ", ", ", ", ")\n    "], ["\n      INSERT INTO point_logs (userId, actionType, points, description, operatorId, relatedId)\n      VALUES (", ", ", ", ", ", ", ", ", ", ", ")\n    "])), data.userId, data.actionType || null, data.points, data.description, data.operatorId || null, data.relatedId || null))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_4 = _a.sent();
                    console.error("[PointSystem] Error creating point log:", error_4);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户的积分变动记录
 */
function getUserPointLogs(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        var db, result, error_5;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n      SELECT * FROM point_logs \n      WHERE userId = ", " \n      ORDER BY createdAt DESC \n      LIMIT ", "\n    "], ["\n      SELECT * FROM point_logs \n      WHERE userId = ", " \n      ORDER BY createdAt DESC \n      LIMIT ", "\n    "])), userId, limit))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Array.isArray(result) ? result : []];
                case 4:
                    error_5 = _a.sent();
                    console.error("[PointSystem] Error fetching user point logs:", error_5);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有积分变动记录（管理员用）
 */
function getAllPointLogs() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var db, result, error_6;
        if (limit === void 0) { limit = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n      SELECT pl.*, u.username, u.name \n      FROM point_logs pl\n      LEFT JOIN users u ON pl.userId = u.id\n      ORDER BY pl.createdAt DESC \n      LIMIT ", "\n    "], ["\n      SELECT pl.*, u.username, u.name \n      FROM point_logs pl\n      LEFT JOIN users u ON pl.userId = u.id\n      ORDER BY pl.createdAt DESC \n      LIMIT ", "\n    "])), limit))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Array.isArray(result) ? result : []];
                case 4:
                    error_6 = _a.sent();
                    console.error("[PointSystem] Error fetching all point logs:", error_6);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 用户积分操作 ====================
/**
 * 获取用户当前积分
 */
function getUserPoints(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_7;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select({ points: schema_1.users.points })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 3:
                    result = _c.sent();
                    return [2 /*return*/, (_b = (_a = result[0]) === null || _a === void 0 ? void 0 : _a.points) !== null && _b !== void 0 ? _b : 0];
                case 4:
                    error_7 = _c.sent();
                    console.error("[PointSystem] Error fetching user points:", error_7);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 增加用户积分
 */
function addUserPoints(userId, points) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["\n      UPDATE users \n      SET points = points + ", " \n      WHERE id = ", "\n    "], ["\n      UPDATE users \n      SET points = points + ", " \n      WHERE id = ", "\n    "])), points, userId))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_8 = _a.sent();
                    console.error("[PointSystem] Error adding user points:", error_8);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 减少用户积分
 */
function subtractUserPoints(userId, points) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["\n      UPDATE users \n      SET points = GREATEST(0, points - ", ")\n      WHERE id = ", "\n    "], ["\n      UPDATE users \n      SET points = GREATEST(0, points - ", ")\n      WHERE id = ", "\n    "])), points, userId))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_9 = _a.sent();
                    console.error("[PointSystem] Error subtracting user points:", error_9);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 核心积分奖励逻辑 ====================
/**
 * 为用户的某个行为添加积分
 * @param userId 用户ID
 * @param actionType 行为类型
 * @param relatedId 关联ID（可选，如联系人ID）
 * @returns 是否成功添加积分
 */
function addPointsForAction(userId, actionType, relatedId) {
    return __awaiter(this, void 0, void 0, function () {
        var rule, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, getPointRuleByActionType(actionType)];
                case 1:
                    rule = _a.sent();
                    if (!rule || !rule.isActive || rule.points <= 0) {
                        return [2 /*return*/, false]; // 规则不存在、未启用或积分为0
                    }
                    // 2. 增加用户积分
                    return [4 /*yield*/, addUserPoints(userId, rule.points)];
                case 2:
                    // 2. 增加用户积分
                    _a.sent();
                    // 3. 记录积分变动
                    return [4 /*yield*/, createPointLog({
                            userId: userId,
                            actionType: actionType,
                            points: rule.points,
                            description: "".concat(rule.actionName, "\uFF1A+").concat(rule.points, "\u5206"),
                            relatedId: relatedId,
                        })];
                case 3:
                    // 3. 记录积分变动
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_10 = _a.sent();
                    console.error("[PointSystem] Error adding points for action:", error_10);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 管理员手动调整用户积分
 * @param userId 用户ID
 * @param points 积分变动值（正数=增加，负数=减少）
 * @param description 变动描述
 * @param operatorId 操作者ID（管理员ID）
 */
function adjustUserPointsByAdmin(userId, points, description, operatorId) {
    return __awaiter(this, void 0, void 0, function () {
        var error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    if (!(points > 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, addUserPoints(userId, points)];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 2:
                    if (!(points < 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, subtractUserPoints(userId, Math.abs(points))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: 
                // 2. 记录积分变动
                return [4 /*yield*/, createPointLog({
                        userId: userId,
                        points: points,
                        description: "\u7BA1\u7406\u5458\u8C03\u6574\uFF1A".concat(description),
                        operatorId: operatorId,
                    })];
                case 5:
                    // 2. 记录积分变动
                    _a.sent();
                    return [3 /*break*/, 7];
                case 6:
                    error_11 = _a.sent();
                    console.error("[PointSystem] Error adjusting user points by admin:", error_11);
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ==================== 批量查询 ====================
/**
 * 获取所有用户及其积分（分页）
 */
function getAllUsersWithPoints() {
    return __awaiter(this, arguments, void 0, function (page, pageSize) {
        var db, offset, result, error_12;
        if (page === void 0) { page = 1; }
        if (pageSize === void 0) { pageSize = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    offset = (page - 1) * pageSize;
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            points: schema_1.users.points,
                            role: schema_1.users.role,
                        })
                            .from(schema_1.users)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.users.points))
                            .limit(pageSize)
                            .offset(offset)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result];
                case 4:
                    error_12 = _a.sent();
                    console.error("[PointSystem] Error fetching all users with points:", error_12);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 搜索用户（按用户名）
 */
function searchUsersByUsername(keyword) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["\n      SELECT id, username, name, points, role \n      FROM users \n      WHERE username LIKE ", " \n      ORDER BY points DESC \n      LIMIT 20\n    "], ["\n      SELECT id, username, name, points, role \n      FROM users \n      WHERE username LIKE ", " \n      ORDER BY points DESC \n      LIMIT 20\n    "])), "%".concat(keyword, "%")))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Array.isArray(result) ? result : []];
                case 4:
                    error_13 = _a.sent();
                    console.error("[PointSystem] Error searching users:", error_13);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11;
