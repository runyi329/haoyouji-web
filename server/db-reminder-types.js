"use strict";
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
exports.createReminderType = createReminderType;
exports.getReminderTypesByUserId = getReminderTypesByUserId;
exports.updateReminderType = updateReminderType;
exports.deleteReminderType = deleteReminderType;
exports.getReminderTypeById = getReminderTypeById;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 创建提醒类型
 */
function createReminderType(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertId, newType;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.reminderTypes).values(data)];
                case 2:
                    result = _a.sent();
                    insertId = result[0].insertId;
                    return [4 /*yield*/, db.select().from(schema_1.reminderTypes).where((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, insertId))];
                case 3:
                    newType = (_a.sent())[0];
                    return [2 /*return*/, newType];
            }
        });
    });
}
/**
 * 获取用户的所有提醒类型（包括默认类型）
 */
function getReminderTypesByUserId(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.reminderTypes)
                            .where((0, drizzle_orm_1.eq)(schema_1.reminderTypes.userId, userId))];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results];
            }
        });
    });
}
/**
 * 更新提醒类型
 */
function updateReminderType(id, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .update(schema_1.reminderTypes)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.reminderTypes.userId, userId)))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.reminderTypes).where((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, id))];
                case 3:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result || null];
            }
        });
    });
}
/**
 * 删除提醒类型（不能删除默认类型）
 */
function deleteReminderType(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, type;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.reminderTypes)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.reminderTypes.userId, userId)))];
                case 2:
                    type = (_a.sent())[0];
                    if (!type || type.isDefault) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, db.delete(schema_1.reminderTypes).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.reminderTypes.userId, userId)))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 获取单个提醒类型
 */
function getReminderTypeById(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.reminderTypes)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminderTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.reminderTypes.userId, userId)))];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result || null];
            }
        });
    });
}
