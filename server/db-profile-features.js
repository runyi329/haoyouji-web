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
exports.getUserFavoriteFeatures = getUserFavoriteFeatures;
exports.saveUserFavoriteFeatures = saveUserFavoriteFeatures;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 获取用户的常用功能列表
 */
function getUserFavoriteFeatures(userId, userRole) {
    return __awaiter(this, void 0, void 0, function () {
        var db, prefs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, db
                            .select({ favoriteFeatures: schema_1.userPreferences.favoriteFeatures })
                            .from(schema_1.userPreferences)
                            .where((0, drizzle_orm_1.eq)(schema_1.userPreferences.userId, userId))
                            .limit(1)];
                case 2:
                    prefs = _a.sent();
                    if (prefs.length === 0 || !prefs[0].favoriteFeatures) {
                        // 根据用户角色返回默认常用功能
                        if (userRole === "super_admin") {
                            return [2 /*return*/, ["admin-panel", "edit-profile"]];
                        }
                        return [2 /*return*/, ["edit-profile"]];
                    }
                    return [2 /*return*/, prefs[0].favoriteFeatures];
            }
        });
    });
}
/**
 * 保存用户的常用功能配置
 */
function saveUserFavoriteFeatures(userId, featureIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, insertData, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database connection failed");
                    console.log('[saveUserFavoriteFeatures] userId:', userId);
                    console.log('[saveUserFavoriteFeatures] featureIds:', featureIds);
                    return [4 /*yield*/, db
                            .select({ id: schema_1.userPreferences.id })
                            .from(schema_1.userPreferences)
                            .where((0, drizzle_orm_1.eq)(schema_1.userPreferences.userId, userId))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    console.log('[saveUserFavoriteFeatures] existing:', existing);
                    if (!(existing.length === 0)) return [3 /*break*/, 4];
                    // 创建新记录
                    console.log('[saveUserFavoriteFeatures] Inserting new record');
                    insertData = {
                        userId: userId,
                        favoriteFeatures: featureIds,
                    };
                    console.log('[saveUserFavoriteFeatures] insertData:', JSON.stringify(insertData));
                    return [4 /*yield*/, db.insert(schema_1.userPreferences).values(insertData)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    // 更新现有记录
                    console.log('[saveUserFavoriteFeatures] Updating existing record');
                    updateData = {
                        favoriteFeatures: featureIds,
                    };
                    console.log('[saveUserFavoriteFeatures] updateData:', JSON.stringify(updateData));
                    return [4 /*yield*/, db
                            .update(schema_1.userPreferences)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.userPreferences.userId, userId))];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    console.log('[saveUserFavoriteFeatures] Save completed');
                    return [2 /*return*/];
            }
        });
    });
}
