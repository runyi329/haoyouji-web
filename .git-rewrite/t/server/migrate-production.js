"use strict";
/**
 * 生产环境数据库迁移脚本
 * 通过 API 端点触发：/api/admin/migrate-pending-type
 */
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
exports.migratePendingType = migratePendingType;
var fs_1 = require("fs");
var path_1 = require("path");
function migratePendingType(db) {
    return __awaiter(this, void 0, void 0, function () {
        var migrationPath, sql, statements, i, statement, error_1, error_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('[Migration] Starting pending_type migration...');
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 8, , 9]);
                    migrationPath = (0, path_1.join)(process.cwd(), 'migrations', 'add-ledger-features.sql');
                    sql = (0, fs_1.readFileSync)(migrationPath, 'utf-8');
                    statements = sql
                        .split(';')
                        .map(function (s) { return s.trim(); })
                        .filter(function (s) { return s && !s.startsWith('--'); });
                    console.log("[Migration] Found ".concat(statements.length, " statements"));
                    i = 0;
                    _c.label = 2;
                case 2:
                    if (!(i < statements.length)) return [3 /*break*/, 7];
                    statement = statements[i];
                    if (!statement)
                        return [3 /*break*/, 6];
                    console.log("[Migration] Executing statement ".concat(i + 1, "/").concat(statements.length));
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, db.execute(statement)];
                case 4:
                    _c.sent();
                    console.log("[Migration] \u2713 Statement ".concat(i + 1, " executed successfully"));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _c.sent();
                    // 忽略"字段已存在"错误
                    if (((_a = error_1.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column name')) ||
                        ((_b = error_1.message) === null || _b === void 0 ? void 0 : _b.includes('Duplicate key name'))) {
                        console.log("[Migration] \u26A0 Statement ".concat(i + 1, " skipped (already exists)"));
                    }
                    else {
                        console.error("[Migration] \u2717 Statement ".concat(i + 1, " failed:"), error_1.message);
                        throw error_1;
                    }
                    return [3 /*break*/, 6];
                case 6:
                    i++;
                    return [3 /*break*/, 2];
                case 7:
                    console.log('[Migration] ✅ Migration completed successfully');
                    return [2 /*return*/, { success: true, message: 'Migration completed' }];
                case 8:
                    error_2 = _c.sent();
                    console.error('[Migration] ❌ Migration failed:', error_2);
                    return [2 /*return*/, { success: false, error: error_2.message }];
                case 9: return [2 /*return*/];
            }
        });
    });
}
