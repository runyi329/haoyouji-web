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
exports.createExerciseType = createExerciseType;
exports.getExerciseTypes = getExerciseTypes;
exports.updateExerciseType = updateExerciseType;
exports.deleteExerciseType = deleteExerciseType;
exports.upsertExerciseRecord = upsertExerciseRecord;
exports.getExerciseRecordsByDateRange = getExerciseRecordsByDateRange;
exports.deleteExerciseRecord = deleteExerciseRecord;
exports.setParentPassword = setParentPassword;
exports.verifyParentPassword = verifyParentPassword;
exports.hasParentPassword = hasParentPassword;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var bcryptjs_1 = require("bcryptjs");
/**
 * 创建锻炼项目
 */
function createExerciseType(userId_1, name_1) {
    return __awaiter(this, arguments, void 0, function (userId, name, icon) {
        var db, maxOrderResult, nextOrder, exerciseType, result;
        if (icon === void 0) { icon = "💪"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select({ maxOrder: schema_1.exerciseTypes.sortOrder })
                            .from(schema_1.exerciseTypes)
                            .where((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.exerciseTypes.sortOrder))
                            .limit(1)];
                case 2:
                    maxOrderResult = _a.sent();
                    nextOrder = maxOrderResult.length > 0 && maxOrderResult[0].maxOrder !== null ? maxOrderResult[0].maxOrder + 1 : 0;
                    return [4 /*yield*/, db.insert(schema_1.exerciseTypes).values({
                            userId: userId,
                            name: name,
                            icon: icon,
                            isActive: true,
                            sortOrder: nextOrder,
                        }).$returningId()];
                case 3:
                    exerciseType = (_a.sent())[0];
                    return [4 /*yield*/, db.select().from(schema_1.exerciseTypes).where((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.id, exerciseType.id))];
                case 4:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取用户的所有锻炼项目
 */
function getExerciseTypes(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.exerciseTypes)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.userId, userId), (0, drizzle_orm_1.eq)(schema_1.exerciseTypes.isActive, true)))
                            .orderBy(schema_1.exerciseTypes.sortOrder, schema_1.exerciseTypes.createdAt)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 更新锻炼项目
 */
function updateExerciseType(id, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.update(schema_1.exerciseTypes).set(data).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.exerciseTypes.userId, userId)))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.exerciseTypes).where((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.id, id))];
                case 3:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result || null];
            }
        });
    });
}
/**
 * 删除锻炼项目
 */
function deleteExerciseType(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.update(schema_1.exerciseTypes)
                            .set({ isActive: false })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseTypes.id, id), (0, drizzle_orm_1.eq)(schema_1.exerciseTypes.userId, userId)))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.rowsAffected > 0];
            }
        });
    });
}
/**
 * 创建或更新锻炼记录
 */
function upsertExerciseRecord(userId, exerciseTypeId, count, recordDate) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, updated, record, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.exerciseRecords).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.userId, userId), (0, drizzle_orm_1.eq)(schema_1.exerciseRecords.exerciseTypeId, exerciseTypeId), (0, drizzle_orm_1.eq)(schema_1.exerciseRecords.recordDate, recordDate)))];
                case 2:
                    existing = (_a.sent())[0];
                    if (!existing) return [3 /*break*/, 5];
                    // 更新现有记录
                    return [4 /*yield*/, db.update(schema_1.exerciseRecords).set({ count: count }).where((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.id, existing.id))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.exerciseRecords).where((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.id, existing.id))];
                case 4:
                    updated = (_a.sent())[0];
                    return [2 /*return*/, updated];
                case 5: return [4 /*yield*/, db.insert(schema_1.exerciseRecords).values({
                        userId: userId,
                        exerciseTypeId: exerciseTypeId,
                        count: count,
                        recordDate: recordDate,
                    }).$returningId()];
                case 6:
                    record = (_a.sent())[0];
                    return [4 /*yield*/, db.select().from(schema_1.exerciseRecords).where((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.id, record.id))];
                case 7:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取指定日期范围的锻炼记录
 */
function getExerciseRecordsByDateRange(userId, exerciseTypeId, startDate, endDate) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.exerciseRecords).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.userId, userId), (0, drizzle_orm_1.eq)(schema_1.exerciseRecords.exerciseTypeId, exerciseTypeId), (0, drizzle_orm_1.gte)(schema_1.exerciseRecords.recordDate, startDate), (0, drizzle_orm_1.lte)(schema_1.exerciseRecords.recordDate, endDate))).orderBy((0, drizzle_orm_1.desc)(schema_1.exerciseRecords.recordDate))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 删除锻炼记录
 */
function deleteExerciseRecord(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.delete(schema_1.exerciseRecords).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.exerciseRecords.id, id), (0, drizzle_orm_1.eq)(schema_1.exerciseRecords.userId, userId)))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.rowsAffected > 0];
            }
        });
    });
}
/**
 * 设置家长密码
 */
function setParentPassword(userId, password) {
    return __awaiter(this, void 0, void 0, function () {
        var db, passwordHash, existing, updated, record, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, bcryptjs_1.default.hash(password, 10)];
                case 2:
                    passwordHash = _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.parentPasswords).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.userId, userId))];
                case 3:
                    existing = (_a.sent())[0];
                    if (!existing) return [3 /*break*/, 6];
                    // 更新现有密码
                    return [4 /*yield*/, db.update(schema_1.parentPasswords).set({ passwordHash: passwordHash }).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.userId, userId))];
                case 4:
                    // 更新现有密码
                    _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.parentPasswords).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.userId, userId))];
                case 5:
                    updated = (_a.sent())[0];
                    return [2 /*return*/, updated];
                case 6: return [4 /*yield*/, db.insert(schema_1.parentPasswords).values({
                        userId: userId,
                        passwordHash: passwordHash,
                    }).$returningId()];
                case 7:
                    record = (_a.sent())[0];
                    return [4 /*yield*/, db.select().from(schema_1.parentPasswords).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.id, record.id))];
                case 8:
                    result = (_a.sent())[0];
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 验证家长密码
 */
function verifyParentPassword(userId, password) {
    return __awaiter(this, void 0, void 0, function () {
        var db, record;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.parentPasswords).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.userId, userId))];
                case 2:
                    record = (_a.sent())[0];
                    if (!record) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, bcryptjs_1.default.compare(password, record.passwordHash)];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 检查用户是否已设置家长密码
 */
function hasParentPassword(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, record;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.parentPasswords).where((0, drizzle_orm_1.eq)(schema_1.parentPasswords.userId, userId))];
                case 2:
                    record = (_a.sent())[0];
                    return [2 /*return*/, !!record];
            }
        });
    });
}
