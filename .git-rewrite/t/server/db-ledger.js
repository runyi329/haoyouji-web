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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserLedgers = getUserLedgers;
exports.createLedger = createLedger;
exports.copyLedger = copyLedger;
exports.getLedgerById = getLedgerById;
exports.archiveLedger = archiveLedger;
exports.deleteLedger = deleteLedger;
exports.inviteMemberByUsername = inviteMemberByUsername;
exports.joinLedger = joinLedger;
exports.getLedgerCategories = getLedgerCategories;
exports.addLedgerCategory = addLedgerCategory;
exports.updateCategorySortOrder = updateCategorySortOrder;
exports.batchUpdateCategorySortOrder = batchUpdateCategorySortOrder;
exports.deleteLedgerCategory = deleteLedgerCategory;
exports.getCategoryUsageCount = getCategoryUsageCount;
exports.replaceLedgerCategory = replaceLedgerCategory;
exports.updateLedgerCategory = updateLedgerCategory;
exports.getLedgerMembers = getLedgerMembers;
exports.generateInviteToken = generateInviteToken;
exports.joinLedgerByToken = joinLedgerByToken;
exports.removeLedgerMember = removeLedgerMember;
exports.getMemberPermissions = getMemberPermissions;
exports.updateMemberPermission = updateMemberPermission;
exports.updateDefaultPermission = updateDefaultPermission;
exports.getAIEmployees = getAIEmployees;
exports.addAIEmployee = addAIEmployee;
exports.toggleAIEmployee = toggleAIEmployee;
exports.removeAIEmployee = removeAIEmployee;
exports.updateLedger = updateLedger;
exports.updateMemberNickname = updateMemberNickname;
exports.getLedgerReport = getLedgerReport;
exports.getCalendarData = getCalendarData;
exports.getDayRecords = getDayRecords;
exports.addTransaction = addTransaction;
exports.getTransactionsList = getTransactionsList;
exports.getTransactionDetail = getTransactionDetail;
exports.deleteTransaction = deleteTransaction;
exports.getDeletedTransactions = getDeletedTransactions;
exports.restoreTransaction = restoreTransaction;
exports.purgeExpiredDeletedRecords = purgeExpiredDeletedRecords;
exports.updateTransaction = updateTransaction;
exports.getApprovalRules = getApprovalRules;
exports.saveApprovalRules = saveApprovalRules;
exports.deleteApprovalRule = deleteApprovalRule;
exports.checkNeedApproval = checkNeedApproval;
exports.createApprovalRecords = createApprovalRecords;
exports.approveTransaction = approveTransaction;
exports.getPendingApprovals = getPendingApprovals;
exports.setMemberRole = setMemberRole;
exports.manageReimbursement = manageReimbursement;
exports.getReimbursementHistory = getReimbursementHistory;
exports.getReimbursementStats = getReimbursementStats;
exports.getLedgerImages = getLedgerImages;
exports.getLedgerExportStats = getLedgerExportStats;
exports.transferOwnership = transferOwnership;
exports.getLedgerSecretKey = getLedgerSecretKey;
exports.joinLedgerBySecretKey = joinLedgerBySecretKey;
exports.checkBackupPermission = checkBackupPermission;
exports.updateLedgerFeatures = updateLedgerFeatures;
exports.getAllPendingTransactions = getAllPendingTransactions;
exports.insertRecordLog = insertRecordLog;
exports.getRecordLogs = getRecordLogs;
exports.getRecordLogCount = getRecordLogCount;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var encryption_1 = require("./encryption");
// 账目记录需要加密的字段
var LEDGER_RECORD_ENCRYPT_FIELDS = ['description'];
// 报销历史需要加密的字段
var REIMBURSEMENT_ENCRYPT_FIELDS = ['notes'];
// ========== 软删除自动迁移 ==========
var _softDeleteMigrated = false;
function ensureSoftDeleteColumns() {
    return __awaiter(this, void 0, void 0, function () {
        var db, e_1, db, e_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (_softDeleteMigrated)
                        return [2 /*return*/];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 尝试添加列，如果已存在则忽略
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["ALTER TABLE ledger_records ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL"], ["ALTER TABLE ledger_records ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL"]))))];
                case 3:
                    // 尝试添加列，如果已存在则忽略
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _c.sent();
                    // 列已存在时忽略错误
                    if (!((_a = e_1.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column'))) {
                        console.error('[ensureSoftDeleteColumns] deleted_at error:', e_1.message);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    _c.trys.push([5, 8, , 9]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 6:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["ALTER TABLE ledger_records ADD COLUMN deleted_by INT NULL DEFAULT NULL"], ["ALTER TABLE ledger_records ADD COLUMN deleted_by INT NULL DEFAULT NULL"]))))];
                case 7:
                    _c.sent();
                    return [3 /*break*/, 9];
                case 8:
                    e_2 = _c.sent();
                    if (!((_b = e_2.message) === null || _b === void 0 ? void 0 : _b.includes('Duplicate column'))) {
                        console.error('[ensureSoftDeleteColumns] deleted_by error:', e_2.message);
                    }
                    return [3 /*break*/, 9];
                case 9:
                    _softDeleteMigrated = true;
                    return [2 /*return*/];
            }
        });
    });
}
// 在模块加载时执行迁移
ensureSoftDeleteColumns().catch(console.error);
// ========== 备份权限字段迁移 ==========
var _backupPermissionMigrated = false;
function ensureBackupPermissionColumn() {
    return __awaiter(this, void 0, void 0, function () {
        var db, e_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (_backupPermissionMigrated)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _b.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 permission_backup 字段
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["ALTER TABLE ledger_members ADD COLUMN permission_backup ENUM('allow','none') NOT NULL DEFAULT 'allow'"], ["ALTER TABLE ledger_members ADD COLUMN permission_backup ENUM('allow','none') NOT NULL DEFAULT 'allow'"]))))];
                case 3:
                    // 添加 permission_backup 字段
                    _b.sent();
                    console.log('[ensureBackupPermissionColumn] permission_backup 字段添加成功');
                    return [3 /*break*/, 5];
                case 4:
                    e_3 = _b.sent();
                    if (!((_a = e_3.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column'))) {
                        console.error('[ensureBackupPermissionColumn] error:', e_3.message);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    _backupPermissionMigrated = true;
                    return [2 /*return*/];
            }
        });
    });
}
// 在模块加载时执行迁移
ensureBackupPermissionColumn().catch(console.error);
// ========== 删除ledger_members的UNIQUE KEY约束（支持同一用户拥有real和ai两条记录） ==========
var _uniqueKeyDropped = false;
function dropUniqueKeyConstraint() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, e_4;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (_uniqueKeyDropped)
                        return [2 /*return*/];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _c.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute('ALTER TABLE ledger_members DROP INDEX unique_ledger_user')];
                case 3:
                    _c.sent();
                    console.log('[dropUniqueKeyConstraint] unique_ledger_user 索引已删除');
                    return [3 /*break*/, 5];
                case 4:
                    e_4 = _c.sent();
                    // 索引不存在时忽略错误
                    if (!((_a = e_4.message) === null || _a === void 0 ? void 0 : _a.includes("check that it exists")) && !((_b = e_4.message) === null || _b === void 0 ? void 0 : _b.includes("Can't DROP"))) {
                        console.error('[dropUniqueKeyConstraint] error:', e_4.message);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    _uniqueKeyDropped = true;
                    return [2 /*return*/];
            }
        });
    });
}
// 在模块加载时执行迁移
dropUniqueKeyConstraint().catch(console.error);
// ========== 清理重复AI分身记录 ==========
var _duplicateAICleaned = false;
function cleanDuplicateAIMembers() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, duplicates, _i, duplicates_1, dup, legacyAI, legacyIds, e_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (_duplicateAICleaned)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, , 12]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _a.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute("SELECT ledgerId, userId, COUNT(*) as cnt, MIN(id) as keepId \n       FROM ledger_members \n       WHERE member_type = 'ai' \n       GROUP BY ledgerId, userId \n       HAVING cnt > 1")];
                case 3:
                    duplicates = (_a.sent())[0];
                    if (!(duplicates && duplicates.length > 0)) return [3 /*break*/, 7];
                    _i = 0, duplicates_1 = duplicates;
                    _a.label = 4;
                case 4:
                    if (!(_i < duplicates_1.length)) return [3 /*break*/, 7];
                    dup = duplicates_1[_i];
                    return [4 /*yield*/, conn.execute('DELETE FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? AND id != ?', [dup.ledgerId, dup.userId, 'ai', dup.keepId])];
                case 5:
                    _a.sent();
                    console.log("[cleanDuplicateAI] \u6E05\u7406\u8D26\u672C".concat(dup.ledgerId, "\u7528\u6237").concat(dup.userId, "\u7684").concat(dup.cnt - 1, "\u6761\u91CD\u590DAI\u5206\u8EAB"));
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [4 /*yield*/, conn.execute("SELECT id, ledgerId FROM ledger_members WHERE member_type = 'ai' AND userId = 0")];
                case 8:
                    legacyAI = (_a.sent())[0];
                    if (!(legacyAI && legacyAI.length > 0)) return [3 /*break*/, 10];
                    legacyIds = legacyAI.map(function (r) { return r.id; });
                    return [4 /*yield*/, conn.execute("DELETE FROM ledger_members WHERE id IN (".concat(legacyIds.join(','), ")"))];
                case 9:
                    _a.sent();
                    console.log("[cleanDuplicateAI] \u6E05\u7406".concat(legacyAI.length, "\u6761userId=0\u7684\u65E7\u7248AI\u5206\u8EAB"));
                    _a.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    e_5 = _a.sent();
                    console.error('[cleanDuplicateAI] error:', e_5.message);
                    return [3 /*break*/, 12];
                case 12:
                    _duplicateAICleaned = true;
                    return [2 /*return*/];
            }
        });
    });
}
cleanDuplicateAIMembers().catch(console.error);
// ========== 账本功能字段迁移 ==========
var _ledgerFeaturesMigrated = false;
function ensureLedgerFeaturesColumns() {
    return __awaiter(this, void 0, void 0, function () {
        var db, e_6, db, e_7, db, e_8, db, e_9, db, e_10, db, e_11;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    if (_ledgerFeaturesMigrated)
                        return [2 /*return*/];
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 enable_reimbursement 字段
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["ALTER TABLE ledgers ADD COLUMN enable_reimbursement TINYINT DEFAULT 1 NOT NULL COMMENT '\u662F\u5426\u542F\u7528\u62A5\u9500\u529F\u80FD\uFF081=\u542F\u7528\uFF0C0=\u7981\u7528\uFF09'"], ["ALTER TABLE ledgers ADD COLUMN enable_reimbursement TINYINT DEFAULT 1 NOT NULL COMMENT '\u662F\u5426\u542F\u7528\u62A5\u9500\u529F\u80FD\uFF081=\u542F\u7528\uFF0C0=\u7981\u7528\uFF09'"]))))];
                case 3:
                    // 添加 enable_reimbursement 字段
                    _g.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_6 = _g.sent();
                    if (!((_a = e_6.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column'))) {
                        console.error('[ensureLedgerFeaturesColumns] enable_reimbursement error:', e_6.message);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    _g.trys.push([5, 8, , 9]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 6:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 enable_pending 字段
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["ALTER TABLE ledgers ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '\u662F\u5426\u542F\u7528\u5F85\u7ED3\u529F\u80FD\uFF081=\u542F\u7528\uFF0C0=\u7981\u7528\uFF09'"], ["ALTER TABLE ledgers ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '\u662F\u5426\u542F\u7528\u5F85\u7ED3\u529F\u80FD\uFF081=\u542F\u7528\uFF0C0=\u7981\u7528\uFF09'"]))))];
                case 7:
                    // 添加 enable_pending 字段
                    _g.sent();
                    return [3 /*break*/, 9];
                case 8:
                    e_7 = _g.sent();
                    if (!((_b = e_7.message) === null || _b === void 0 ? void 0 : _b.includes('Duplicate column'))) {
                        console.error('[ensureLedgerFeaturesColumns] enable_pending error:', e_7.message);
                    }
                    return [3 /*break*/, 9];
                case 9:
                    _g.trys.push([9, 12, , 13]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 10:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 pending_type 字段
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["ALTER TABLE ledger_records ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '\u5F85\u7ED3\u7C7B\u578B\uFF08receivable=\u4EE3\u6536\uFF0Cpayable=\u4EE3\u4ED8\uFF0CNULL=\u65E0\uFF09'"], ["ALTER TABLE ledger_records ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '\u5F85\u7ED3\u7C7B\u578B\uFF08receivable=\u4EE3\u6536\uFF0Cpayable=\u4EE3\u4ED8\uFF0CNULL=\u65E0\uFF09'"]))))];
                case 11:
                    // 添加 pending_type 字段
                    _g.sent();
                    return [3 /*break*/, 13];
                case 12:
                    e_8 = _g.sent();
                    if (!((_c = e_8.message) === null || _c === void 0 ? void 0 : _c.includes('Duplicate column'))) {
                        console.error('[ensureLedgerFeaturesColumns] pending_type error:', e_8.message);
                    }
                    return [3 /*break*/, 13];
                case 13:
                    _g.trys.push([13, 16, , 17]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 14:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 pending_include_stats 字段
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["ALTER TABLE ledger_records ADD COLUMN pending_include_stats TINYINT DEFAULT 1 COMMENT '\u5F85\u7ED3\u8D26\u76EE\u662F\u5426\u8BA1\u5165\u7EDF\u8BA1\uFF080=\u4EC5\u663E\u793A\u4E0D\u8BA1\u5165\uFF0C1=\u663E\u793A\u5E76\u8BA1\u5165\uFF09'"], ["ALTER TABLE ledger_records ADD COLUMN pending_include_stats TINYINT DEFAULT 1 COMMENT '\u5F85\u7ED3\u8D26\u76EE\u662F\u5426\u8BA1\u5165\u7EDF\u8BA1\uFF080=\u4EC5\u663E\u793A\u4E0D\u8BA1\u5165\uFF0C1=\u663E\u793A\u5E76\u8BA1\u5165\uFF09'"]))))];
                case 15:
                    // 添加 pending_include_stats 字段
                    _g.sent();
                    return [3 /*break*/, 17];
                case 16:
                    e_9 = _g.sent();
                    if (!((_d = e_9.message) === null || _d === void 0 ? void 0 : _d.includes('Duplicate column'))) {
                        console.error('[ensureLedgerFeaturesColumns] pending_include_stats error:', e_9.message);
                    }
                    return [3 /*break*/, 17];
                case 17:
                    _g.trys.push([17, 20, , 21]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 18:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 添加 pending_default_include_stats 字段（账本级别默认统计模式）
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["ALTER TABLE ledgers ADD COLUMN pending_default_include_stats TINYINT DEFAULT 1 NOT NULL COMMENT '\u5F85\u7ED3\u9ED8\u8BA4\u7EDF\u8BA1\u6A21\u5F0F\uFF080=\u4EC5\u663E\u793A\u4E0D\u8BA1\u5165\uFF0C1=\u663E\u793A\u5E76\u8BA1\u5165\uFF09'"], ["ALTER TABLE ledgers ADD COLUMN pending_default_include_stats TINYINT DEFAULT 1 NOT NULL COMMENT '\u5F85\u7ED3\u9ED8\u8BA4\u7EDF\u8BA1\u6A21\u5F0F\uFF080=\u4EC5\u663E\u793A\u4E0D\u8BA1\u5165\uFF0C1=\u663E\u793A\u5E76\u8BA1\u5165\uFF09'"]))))];
                case 19:
                    // 添加 pending_default_include_stats 字段（账本级别默认统计模式）
                    _g.sent();
                    return [3 /*break*/, 21];
                case 20:
                    e_10 = _g.sent();
                    if (!((_e = e_10.message) === null || _e === void 0 ? void 0 : _e.includes('Duplicate column'))) {
                        console.error('[ensureLedgerFeaturesColumns] pending_default_include_stats error:', e_10.message);
                    }
                    return [3 /*break*/, 21];
                case 21:
                    _g.trys.push([21, 24, , 25]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 22:
                    db = _g.sent();
                    if (!db)
                        return [2 /*return*/];
                    // 创建索引
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["CREATE INDEX idx_pending_type ON ledger_records(pending_type)"], ["CREATE INDEX idx_pending_type ON ledger_records(pending_type)"]))))];
                case 23:
                    // 创建索引
                    _g.sent();
                    return [3 /*break*/, 25];
                case 24:
                    e_11 = _g.sent();
                    if (!((_f = e_11.message) === null || _f === void 0 ? void 0 : _f.includes('Duplicate key'))) {
                        console.error('[ensureLedgerFeaturesColumns] idx_pending_type error:', e_11.message);
                    }
                    return [3 /*break*/, 25];
                case 25:
                    _ledgerFeaturesMigrated = true;
                    console.log('[ensureLedgerFeaturesColumns] 账本功能字段迁移完成');
                    return [2 /*return*/];
            }
        });
    });
}
// 在模块加载时执行迁移
ensureLedgerFeaturesColumns().catch(console.error);
/**
 * 获取用户的所有账本（包括自己创建的和参与的）
 */
function getUserLedgers(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, isArchived) {
        var db, memberRecords, ledgerIds, ledgerList, result;
        var _this = this;
        if (isArchived === void 0) { isArchived = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({ ledgerId: schema_1.ledgerMembers.ledgerId, role: schema_1.ledgerMembers.role })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId))];
                case 2:
                    memberRecords = _a.sent();
                    ledgerIds = memberRecords.map(function (m) { return m.ledgerId; });
                    if (ledgerIds.length === 0) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgers.id, drizzle_orm_1.sql.join(ledgerIds, (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject([", "], [", "]))))), (0, drizzle_orm_1.eq)(schema_1.ledgers.isArchived, isArchived)))];
                case 3:
                    ledgerList = _a.sent();
                    return [4 /*yield*/, Promise.all(ledgerList.map(function (ledger) { return __awaiter(_this, void 0, void 0, function () {
                            var membersRaw, hasLegacyAI, currentUserAvatarForLedger, currentUserUsernameForLedger, currentUserInfo, mappedMembers, realMembersForLedger, aiMembersForLedger, sortedMembersForLedger, _loop_1, _i, realMembersForLedger_1, real, _a, aiMembersForLedger_1, ai, members, memberCount, recordCount, latestRecord, userRole, lastActivityAt;
                            var _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, db
                                            .select({
                                            userId: schema_1.ledgerMembers.userId,
                                            role: schema_1.ledgerMembers.role,
                                            memberType: schema_1.ledgerMembers.memberType,
                                            username: schema_1.users.username,
                                            avatar: schema_1.users.avatar,
                                        })
                                            .from(schema_1.ledgerMembers)
                                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, schema_1.users.id))
                                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledger.id))];
                                    case 1:
                                        membersRaw = _c.sent();
                                        hasLegacyAI = membersRaw.some(function (m) { return m.memberType === 'ai' && m.userId === 0; });
                                        currentUserAvatarForLedger = null;
                                        currentUserUsernameForLedger = null;
                                        if (!hasLegacyAI) return [3 /*break*/, 3];
                                        return [4 /*yield*/, db
                                                .select({ avatar: schema_1.users.avatar, username: schema_1.users.username })
                                                .from(schema_1.users)
                                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                                                .limit(1)];
                                    case 2:
                                        currentUserInfo = _c.sent();
                                        if (currentUserInfo.length > 0) {
                                            currentUserAvatarForLedger = currentUserInfo[0].avatar;
                                            currentUserUsernameForLedger = currentUserInfo[0].username;
                                        }
                                        _c.label = 3;
                                    case 3:
                                        mappedMembers = membersRaw.map(function (m) { return (__assign(__assign({}, m), { avatar: (m.memberType === 'ai' && m.userId === 0) ? currentUserAvatarForLedger : m.avatar, username: (m.memberType === 'ai' && m.userId === 0) ? currentUserUsernameForLedger : m.username })); });
                                        realMembersForLedger = mappedMembers.filter(function (m) { return m.memberType !== 'ai'; });
                                        aiMembersForLedger = mappedMembers.filter(function (m) { return m.memberType === 'ai'; });
                                        // 真人按当前用户优先排序
                                        realMembersForLedger.sort(function (a, b) {
                                            if (a.userId === userId)
                                                return -1;
                                            if (b.userId === userId)
                                                return 1;
                                            return 0;
                                        });
                                        sortedMembersForLedger = [];
                                        _loop_1 = function (real) {
                                            sortedMembersForLedger.push(real);
                                            var correspondingAI = aiMembersForLedger.find(function (ai) { return ai.userId === real.userId; });
                                            if (correspondingAI) {
                                                sortedMembersForLedger.push(correspondingAI);
                                            }
                                        };
                                        for (_i = 0, realMembersForLedger_1 = realMembersForLedger; _i < realMembersForLedger_1.length; _i++) {
                                            real = realMembersForLedger_1[_i];
                                            _loop_1(real);
                                        }
                                        // 孤立的AI分身追加到末尾
                                        for (_a = 0, aiMembersForLedger_1 = aiMembersForLedger; _a < aiMembersForLedger_1.length; _a++) {
                                            ai = aiMembersForLedger_1[_a];
                                            if (!sortedMembersForLedger.includes(ai)) {
                                                sortedMembersForLedger.push(ai);
                                            }
                                        }
                                        members = sortedMembersForLedger.slice(0, 4);
                                        memberCount = membersRaw.filter(function (m) { return m.memberType !== 'ai'; }).length;
                                        return [4 /*yield*/, db
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.ledgerRecords)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledger.id), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                                                .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0; })];
                                    case 4:
                                        recordCount = _c.sent();
                                        return [4 /*yield*/, db
                                                .select({ latestAt: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.ledgerRecords.createdAt) })
                                                .from(schema_1.ledgerRecords)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledger.id), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                                                .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.latestAt) || null; })];
                                    case 5:
                                        latestRecord = _c.sent();
                                        userRole = ((_b = memberRecords.find(function (m) { return m.ledgerId === ledger.id; })) === null || _b === void 0 ? void 0 : _b.role) || "member";
                                        lastActivityAt = latestRecord
                                            ? new Date(Math.max(new Date(latestRecord).getTime(), new Date(ledger.updatedAt).getTime()))
                                            : new Date(ledger.updatedAt);
                                        return [2 /*return*/, __assign(__assign({}, ledger), { members: members, memberCount: memberCount, recordCount: recordCount, userRole: userRole, lastActivityAt: lastActivityAt.toISOString() })];
                                }
                            });
                        }); }))];
                case 4:
                    result = _a.sent();
                    // 按最近活动时间降序排列（最近使用的排最前）
                    result.sort(function (a, b) { return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(); });
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 创建新账本
 */
function createLedger(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, finalNickname, getDb, mainDb, userResult, newLedgerId, result, error_1;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _j.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    finalNickname = data.memberNickname;
                    if (!(!finalNickname || !finalNickname.trim())) return [3 /*break*/, 5];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                case 2:
                    getDb = (_j.sent()).getDb;
                    return [4 /*yield*/, getDb()];
                case 3:
                    mainDb = _j.sent();
                    return [4 /*yield*/, mainDb
                            .select({ username: schema_1.users.username })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, data.createdBy))
                            .limit(1)];
                case 4:
                    userResult = _j.sent();
                    finalNickname = ((_a = userResult[0]) === null || _a === void 0 ? void 0 : _a.username) || null;
                    _j.label = 5;
                case 5:
                    _j.trys.push([5, 7, , 8]);
                    console.log("[createLedger] 开始插入账本，数据:", {
                        name: data.name,
                        description: (_b = data.description) !== null && _b !== void 0 ? _b : null,
                        type: (_c = data.type) !== null && _c !== void 0 ? _c : "personal",
                        currency: (_d = data.currency) !== null && _d !== void 0 ? _d : "CNY",
                        createdBy: data.createdBy
                    });
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["\n      INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)\n      VALUES (", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ")\n    "], ["\n      INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)\n      VALUES (", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ")\n    "])), data.name, (_e = data.description) !== null && _e !== void 0 ? _e : null, (_f = data.type) !== null && _f !== void 0 ? _f : "personal", (_g = data.currency) !== null && _g !== void 0 ? _g : "CNY", null, data.createdBy, data.createdBy, 0, 0))];
                case 6:
                    result = _j.sent();
                    console.log("[createLedger] result 结构:", JSON.stringify(result, null, 2));
                    // TiDB 返回的是数组，需要从第一个元素获取 insertId
                    newLedgerId = Number(((_h = result[0]) === null || _h === void 0 ? void 0 : _h.insertId) || result.insertId);
                    console.log("[createLedger] 账本插入成功， ID:", newLedgerId);
                    return [3 /*break*/, 8];
                case 7:
                    error_1 = _j.sent();
                    console.error("[createLedger] 插入账本失败:", error_1);
                    throw error_1;
                case 8: 
                // 将创建者添加为账本所有者
                return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                        ledgerId: newLedgerId,
                        userId: data.createdBy,
                        role: "owner",
                        memberType: "real",
                        nickname: finalNickname,
                        permissionView: "all",
                        permissionAdd: "all",
                        permissionEdit: "all",
                        permissionDelete: "all",
                        canEdit: 1,
                        canDelete: 1,
                        canInvite: 1,
                    })];
                case 9:
                    // 将创建者添加为账本所有者
                    _j.sent();
                    // 不再创建默认分类，用户可以自己添加或使用全局预设分类（ledgerId=0）
                    return [2 /*return*/, { id: newLedgerId, name: data.name }];
            }
        });
    });
}
/**
 * 复制账本（复制分类和成员）
 */
function copyLedger(sourceLedgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, sourceLedger, source, newLedgerName, result, newLedgerId, categories, _i, categories_1, category;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, sourceLedgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    member = _b.sent();
                    if (member.length === 0) {
                        throw new Error("您不是该账本的成员，无法复制");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, sourceLedgerId))
                            .limit(1)];
                case 3:
                    sourceLedger = _b.sent();
                    if (sourceLedger.length === 0) {
                        throw new Error("源账本不存在");
                    }
                    source = sourceLedger[0];
                    newLedgerName = "\u590D\u5236-".concat(source.name);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["\n    INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)\n    VALUES (", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ")\n  "], ["\n    INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)\n    VALUES (", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ", ")\n  "])), newLedgerName, source.description, source.type, source.currency, source.icon, userId, userId, 0, 0))];
                case 4:
                    result = _b.sent();
                    newLedgerId = Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.insertId) || result.insertId);
                    // 将创建者添加为账本所有者
                    return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                            ledgerId: newLedgerId,
                            userId: userId,
                            role: "owner",
                            memberType: "real",
                            nickname: null,
                            permissionView: "all",
                            permissionAdd: "all",
                            permissionEdit: "all",
                            permissionDelete: "all",
                            canEdit: 1,
                            canDelete: 1,
                            canInvite: 1,
                        })];
                case 5:
                    // 将创建者添加为账本所有者
                    _b.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.ledgerId, sourceLedgerId))];
                case 6:
                    categories = _b.sent();
                    _i = 0, categories_1 = categories;
                    _b.label = 7;
                case 7:
                    if (!(_i < categories_1.length)) return [3 /*break*/, 10];
                    category = categories_1[_i];
                    return [4 /*yield*/, db.insert(schema_1.ledgerCategories).values({
                            ledgerId: newLedgerId,
                            name: category.name,
                            type: category.type,
                            icon: category.icon,
                            color: category.color,
                            isDefault: category.isDefault,
                            sortOrder: category.sortOrder,
                        })];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 7];
                case 10: return [2 /*return*/, { id: newLedgerId, name: newLedgerName }];
            }
        });
    });
}
/**
 * 获取单个账本详情
 */
function getLedgerById(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, ledger, members, result, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[getLedgerById] 调用，参数:', { ledgerId: ledgerId, userId: userId });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, , 7]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _a.sent();
                    if (!db) {
                        console.error('[getLedgerById] 数据库连接失败');
                        throw new Error("Ledger database connection failed");
                    }
                    console.log('[getLedgerById] 数据库连接成功');
                    // 检查用户是否是账本成员
                    console.log('[getLedgerById] 开始检查成员权限...');
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 3:
                    member = _a.sent();
                    console.log('[getLedgerById] 成员检查结果:', member);
                    if (member.length === 0) {
                        console.log('[getLedgerById] 用户不是账本成员');
                        throw new Error("您不是该账本的成员");
                    }
                    // 获取账本信息
                    console.log('[getLedgerById] 开始查询账本信息...');
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 4:
                    ledger = _a.sent();
                    console.log('[getLedgerById] 账本查询结果:', ledger);
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    // 获取所有成员，关联users表获取username和avatar
                    console.log('[getLedgerById] 开始查询成员列表...');
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.ledgerMembers.userId,
                            role: schema_1.ledgerMembers.role,
                            nickname: schema_1.ledgerMembers.nickname,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.ledgerMembers)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId))];
                case 5:
                    members = _a.sent();
                    console.log('[getLedgerById] 成员列表:', members);
                    result = __assign(__assign({}, ledger[0]), { members: members, userRole: member[0].role });
                    console.log('[getLedgerById] 返回结果:', result);
                    return [2 /*return*/, result];
                case 6:
                    error_2 = _a.sent();
                    console.error('[getLedgerById] 错误:', error_2);
                    throw error_2;
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 存档/取消存档账本
 */
function archiveLedger(ledgerId, userId, isArchived) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    member = _a.sent();
                    if (!member || (member.role !== "owner" && member.role !== "admin")) {
                        throw new Error("没有权限存档此账本");
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.ledgers)
                            .set({ isArchived: isArchived, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 删除账本
 */
function deleteLedger(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    member = _a.sent();
                    if (!member || member.role !== "owner") {
                        throw new Error("只有账本所有者可以删除账本");
                    }
                    // 删除所有相关数据
                    return [4 /*yield*/, db.delete(schema_1.ledgerRecords).where((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId))];
                case 3:
                    // 删除所有相关数据
                    _a.sent();
                    return [4 /*yield*/, db.delete(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.ledgerId, ledgerId))];
                case 4:
                    _a.sent();
                    // TODO: 删除预算数据（待实现）
                    // await db.delete(ledgerBudgets).where(eq(ledgerBudgets.ledgerId, ledgerId));
                    return [4 /*yield*/, db.delete(schema_1.ledgerMembers).where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId))];
                case 5:
                    // TODO: 删除预算数据（待实现）
                    // await db.delete(ledgerBudgets).where(eq(ledgerBudgets.ledgerId, ledgerId));
                    _a.sent();
                    return [4 /*yield*/, db.delete(schema_1.ledgers).where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))];
                case 6:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 邀请用户加入账本（通过用户名）
 */
function inviteMemberByUsername(ledgerId, inviterUserId, inviteeUsername) {
    return __awaiter(this, void 0, void 0, function () {
        var db, inviterMember, getDb, mainDb, inviteeUser, existingMember;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, inviterUserId)))
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    inviterMember = _a.sent();
                    if (!inviterMember) {
                        throw new Error("您不是该账本的成员");
                    }
                    if (!inviterMember.canInvite && inviterMember.role !== "owner" && inviterMember.role !== "admin") {
                        throw new Error("您没有权限邀请成员");
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                case 3:
                    getDb = (_a.sent()).getDb;
                    return [4 /*yield*/, getDb()];
                case 4:
                    mainDb = _a.sent();
                    if (!mainDb)
                        throw new Error("Main database connection failed");
                    return [4 /*yield*/, mainDb
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.username, inviteeUsername))
                            .then(function (rows) { return rows[0]; })];
                case 5:
                    inviteeUser = _a.sent();
                    if (!inviteeUser) {
                        throw new Error("用户不存在");
                    }
                    // 不能邀请自己
                    if (inviteeUser.id === inviterUserId) {
                        throw new Error("不能邀请自己");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, inviteeUser.id)))
                            .then(function (rows) { return rows[0]; })];
                case 6:
                    existingMember = _a.sent();
                    if (existingMember) {
                        throw new Error("该用户已经是账本成员");
                    }
                    // 添加为成员
                    return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                            ledgerId: ledgerId,
                            userId: inviteeUser.id,
                            role: "member",
                            memberType: "real",
                            permissionView: "all",
                            permissionAdd: "all",
                            permissionEdit: "own",
                            permissionDelete: "own",
                            canEdit: true,
                            canDelete: false,
                            canInvite: false,
                            invitedBy: inviterUserId,
                        })];
                case 7:
                    // 添加为成员
                    _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            member: {
                                userId: inviteeUser.id,
                                username: inviteeUser.username,
                                name: inviteeUser.name,
                                avatar: inviteeUser.avatar,
                            },
                        }];
            }
        });
    });
}
/**
 * 加入账本（通过邀请码）
 */
function joinLedger(ledgerId, userId, invitedBy) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger, existingMember;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    ledger = _a.sent();
                    if (!ledger) {
                        throw new Error("账本不存在");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .then(function (rows) { return rows[0]; })];
                case 3:
                    existingMember = _a.sent();
                    if (existingMember) {
                        throw new Error("您已经是此账本的成员");
                    }
                    // 添加为成员
                    return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                            ledgerId: ledgerId,
                            userId: userId,
                            role: "member",
                            memberType: "real",
                            permissionView: "all",
                            permissionAdd: "all",
                            permissionEdit: "own",
                            permissionDelete: "own",
                            canEdit: true,
                            canDelete: false,
                            canInvite: false,
                            invitedBy: invitedBy,
                        })];
                case 4:
                    // 添加为成员
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 获取账本的所有分类（包括子分类）
 */
function getLedgerCategories(ledgerId, userId, type, parentId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledgerConditions, defaultConditions, defaultCategories, customCategories;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    ledgerConditions = [(0, drizzle_orm_1.eq)(schema_1.ledgerCategories.ledgerId, ledgerId)];
                    defaultConditions = [(0, drizzle_orm_1.eq)(schema_1.ledgerCategories.ledgerId, 0)];
                    if (type) {
                        ledgerConditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.type, type));
                        defaultConditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.type, type));
                    }
                    // 处理parentId查询：undefined表示查所有，null表示查顶级分类，number表示查指定父分类的子分类
                    if (parentId === null) {
                        ledgerConditions.push((0, drizzle_orm_1.isNull)(schema_1.ledgerCategories.parentId));
                        defaultConditions.push((0, drizzle_orm_1.isNull)(schema_1.ledgerCategories.parentId));
                    }
                    else if (parentId !== undefined) {
                        ledgerConditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.parentId, parentId));
                        defaultConditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.parentId, parentId));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where(drizzle_orm_1.and.apply(void 0, defaultConditions))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.ledgerCategories.sortOrder), (0, drizzle_orm_1.asc)(schema_1.ledgerCategories.id))];
                case 2:
                    defaultCategories = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where(drizzle_orm_1.and.apply(void 0, ledgerConditions))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.ledgerCategories.sortOrder), (0, drizzle_orm_1.asc)(schema_1.ledgerCategories.id))];
                case 3:
                    customCategories = _a.sent();
                    // 合并预设分类和自定义分类，预设分类在前
                    return [2 /*return*/, __spreadArray(__spreadArray([], defaultCategories, true), customCategories, true)];
            }
        });
    });
}
/**
 * 添加自定义分类
 */
function addLedgerCategory(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sortOrder, maxSortOrder, newCategory;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    sortOrder = data.sortOrder;
                    if (!(sortOrder === undefined)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select({ max: (0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.ledgerCategories.sortOrder) })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.ledgerId, data.ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerCategories.type, data.type), data.parentId ? (0, drizzle_orm_1.eq)(schema_1.ledgerCategories.parentId, data.parentId) : (0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["", " IS NULL"], ["", " IS NULL"])), schema_1.ledgerCategories.parentId)))
                            .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.max) || 0; })];
                case 2:
                    maxSortOrder = _a.sent();
                    sortOrder = maxSortOrder + 1;
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.insert(schema_1.ledgerCategories).values({
                        ledgerId: data.ledgerId,
                        name: data.name,
                        type: data.type,
                        parentId: data.parentId || null,
                        icon: data.icon || "📝",
                        color: data.color || (data.type === "income" ? "#10b981" : "#ef4444"),
                        sortOrder: sortOrder,
                        isDefault: false,
                        createdBy: data.createdBy,
                    }).$returningId()];
                case 4:
                    newCategory = (_a.sent())[0];
                    return [2 /*return*/, newCategory];
            }
        });
    });
}
/**
 * 更新分类排序
 */
function updateCategorySortOrder(categoryId, sortOrder) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerCategories)
                            .set({ sortOrder: sortOrder, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, categoryId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 批量更新分类排序
 */
function batchUpdateCategorySortOrder(updates) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    // 使用事务批量更新
                    return [4 /*yield*/, Promise.all(updates.map(function (_a) {
                            var id = _a.id, sortOrder = _a.sortOrder;
                            return db
                                .update(schema_1.ledgerCategories)
                                .set({ sortOrder: sortOrder, updatedAt: new Date() })
                                .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, id));
                        }))];
                case 2:
                    // 使用事务批量更新
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 递归获取所有子分类ID
 */
function getAllChildCategoryIds(db, parentId) {
    return __awaiter(this, void 0, void 0, function () {
        var children, allIds, _i, children_1, child, grandChildren;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({ id: schema_1.ledgerCategories.id })
                        .from(schema_1.ledgerCategories)
                        .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.parentId, parentId))];
                case 1:
                    children = _a.sent();
                    allIds = [];
                    _i = 0, children_1 = children;
                    _a.label = 2;
                case 2:
                    if (!(_i < children_1.length)) return [3 /*break*/, 5];
                    child = children_1[_i];
                    allIds.push(child.id);
                    return [4 /*yield*/, getAllChildCategoryIds(db, child.id)];
                case 3:
                    grandChildren = _a.sent();
                    allIds = allIds.concat(grandChildren);
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, allIds];
            }
        });
    });
}
/**
 * 删除分类(支持级联删除)
 */
function deleteLedgerCategory(categoryId_1, userId_1) {
    return __awaiter(this, arguments, void 0, function (categoryId, userId, cascade) {
        var db, category, childIds, allIdsToDelete, _i, allIdsToDelete_1, id, hasRecords, _a, _b, id;
        if (cascade === void 0) { cascade = false; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, categoryId))
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    category = _c.sent();
                    if (!category) {
                        throw new Error("分类不存在");
                    }
                    // 检查是否为默认分类
                    if (category.isDefault) {
                        throw new Error("默认分类不能删除");
                    }
                    return [4 /*yield*/, getAllChildCategoryIds(db, categoryId)];
                case 3:
                    childIds = _c.sent();
                    // 如果有子分类且不是级联删除,抛出错误
                    if (childIds.length > 0 && !cascade) {
                        throw new Error("此分类下有子分类，请确认是否级联删除");
                    }
                    allIdsToDelete = __spreadArray([categoryId], childIds, true);
                    _i = 0, allIdsToDelete_1 = allIdsToDelete;
                    _c.label = 4;
                case 4:
                    if (!(_i < allIdsToDelete_1.length)) return [3 /*break*/, 7];
                    id = allIdsToDelete_1[_i];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, id), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0; })];
                case 5:
                    hasRecords = _c.sent();
                    if (hasRecords > 0) {
                        throw new Error("此分类或其子分类下有记录，不能删除");
                    }
                    _c.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    _a = 0, _b = childIds.reverse();
                    _c.label = 8;
                case 8:
                    if (!(_a < _b.length)) return [3 /*break*/, 11];
                    id = _b[_a];
                    return [4 /*yield*/, db.delete(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, id))];
                case 9:
                    _c.sent();
                    _c.label = 10;
                case 10:
                    _a++;
                    return [3 /*break*/, 8];
                case 11: 
                // 删除当前分类
                return [4 /*yield*/, db.delete(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, categoryId))];
                case 12:
                    // 删除当前分类
                    _c.sent();
                    return [2 /*return*/, { success: true, deletedCount: allIdsToDelete.length }];
            }
        });
    });
}
/**
 * 获取分类使用数量
 */
function getCategoryUsageCount(ledgerId, categoryId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, count;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    member = _a.sent();
                    if (member.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, categoryId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0; })];
                case 3:
                    count = _a.sent();
                    return [2 /*return*/, { count: count }];
            }
        });
    });
}
/**
 * 批量替换分类
 */
function replaceLedgerCategory(ledgerId, sourceCategoryId, targetCategoryId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member2, sourceCategory, targetCategory, result, affectedCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    member2 = _a.sent();
                    if (member2.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, sourceCategoryId))
                            .then(function (rows) { return rows[0]; })];
                case 3:
                    sourceCategory = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, targetCategoryId))
                            .then(function (rows) { return rows[0]; })];
                case 4:
                    targetCategory = _a.sent();
                    if (!sourceCategory || !targetCategory) {
                        throw new Error("分类不存在");
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerRecords)
                            .set({ categoryId: targetCategoryId, updatedAt: (0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["NOW()"], ["NOW()"]))) })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, sourceCategoryId)))];
                case 5:
                    result = _a.sent();
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, targetCategoryId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .then(function (rows) { var _a; return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0; })];
                case 6:
                    affectedCount = _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            affectedCount: affectedCount,
                            sourceCategoryName: sourceCategory.name,
                            targetCategoryName: targetCategory.name
                        }];
            }
        });
    });
}
/**
 * 更新分类信息
 */
function updateLedgerCategory(categoryId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerCategories)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, categoryId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 获取账本成员列表
 */
function getLedgerMembers(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, members, currentUserAvatar, currentUserUsername, hasLegacyAI, currentUserInfo, membersWithCurrentFlag, realMembers, aiMembers, sortedMembers, _loop_2, _i, realMembers_1, real, _a, aiMembers_1, ai;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    console.log("[getLedgerMembers] 开始获取成员列表，参数:", { ledgerId: ledgerId, userId: userId });
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _b.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是此账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerMembers.id,
                            userId: schema_1.ledgerMembers.userId,
                            role: schema_1.ledgerMembers.role,
                            nickname: schema_1.ledgerMembers.nickname,
                            canEdit: schema_1.ledgerMembers.canEdit,
                            canDelete: schema_1.ledgerMembers.canDelete,
                            canInvite: schema_1.ledgerMembers.canInvite,
                            createdAt: schema_1.ledgerMembers.createdAt,
                            memberType: schema_1.ledgerMembers.memberType,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.ledgerMembers)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId))
                            .orderBy(schema_1.ledgerMembers.createdAt)];
                case 3:
                    members = _b.sent();
                    console.log("[getLedgerMembers] 成员列表:", members);
                    currentUserAvatar = null;
                    currentUserUsername = null;
                    hasLegacyAI = members.some(function (m) { return m.memberType === 'ai' && m.userId === 0; });
                    if (!hasLegacyAI) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ avatar: schema_1.users.avatar, username: schema_1.users.username })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 4:
                    currentUserInfo = _b.sent();
                    if (currentUserInfo.length > 0) {
                        currentUserAvatar = currentUserInfo[0].avatar;
                        currentUserUsername = currentUserInfo[0].username;
                    }
                    _b.label = 5;
                case 5:
                    membersWithCurrentFlag = members.map(function (member) { return (__assign(__assign({}, member), { 
                        // AI分身且userId=0时，用请求者的头像和用户名补唇
                        avatar: (member.memberType === 'ai' && member.userId === 0) ? currentUserAvatar : member.avatar, username: (member.memberType === 'ai' && member.userId === 0) ? currentUserUsername : member.username, isCurrentUser: member.userId === userId })); });
                    realMembers = membersWithCurrentFlag.filter(function (m) { return m.memberType !== 'ai'; });
                    aiMembers = membersWithCurrentFlag.filter(function (m) { return m.memberType === 'ai'; });
                    // 真人按「当前用户优先」排序
                    realMembers.sort(function (a, b) {
                        if (a.isCurrentUser)
                            return -1;
                        if (b.isCurrentUser)
                            return 1;
                        return 0;
                    });
                    sortedMembers = [];
                    _loop_2 = function (real) {
                        sortedMembers.push(real);
                        // 找到该真人对应的AI分身（同userId，memberType='ai'）
                        var correspondingAI = aiMembers.find(function (ai) { return ai.userId === real.userId; });
                        if (correspondingAI) {
                            sortedMembers.push(correspondingAI);
                        }
                    };
                    for (_i = 0, realMembers_1 = realMembers; _i < realMembers_1.length; _i++) {
                        real = realMembers_1[_i];
                        _loop_2(real);
                    }
                    // 如果有孤立的AI分身（找不到对应真人），追加到末尾
                    for (_a = 0, aiMembers_1 = aiMembers; _a < aiMembers_1.length; _a++) {
                        ai = aiMembers_1[_a];
                        if (!sortedMembers.includes(ai)) {
                            sortedMembers.push(ai);
                        }
                    }
                    return [2 /*return*/, sortedMembers];
            }
        });
    });
}
/**
 * 生成邀请token
 */
function generateInviteToken(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger, nanoid, token;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    if (ledger[0].createdBy !== userId) {
                        throw new Error("只有账本创建人可以生成邀请链接");
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("nanoid"); })];
                case 3:
                    nanoid = (_a.sent()).nanoid;
                    token = "".concat(ledgerId, "-").concat(nanoid(16));
                    return [2 /*return*/, token];
            }
        });
    });
}
/**
 * 通过邀请token加入账本
 */
function joinLedgerByToken(token, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, parts, ledgerId, ledger, existingMember;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    parts = token.split("-");
                    if (parts.length < 2) {
                        throw new Error("无效的邀请链接");
                    }
                    ledgerId = parseInt(parts[0]);
                    if (isNaN(ledgerId)) {
                        throw new Error("无效的邀请链接");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 3:
                    existingMember = _a.sent();
                    if (existingMember.length > 0) {
                        throw new Error("您已经是该账本的成员");
                    }
                    // 添加用户为账本成员
                    return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                            ledgerId: ledgerId,
                            userId: userId,
                            role: "member",
                            memberType: "real",
                            permissionView: "all",
                            permissionAdd: "all",
                            permissionEdit: "own",
                            permissionDelete: "own",
                        })];
                case 4:
                    // 添加用户为账本成员
                    _a.sent();
                    return [2 /*return*/, ledger[0]];
            }
        });
    });
}
/**
 * 移除账本成员
 */
function removeLedgerMember(ledgerId, operatorId, targetUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    if (ledger[0].createdBy !== operatorId) {
                        throw new Error("只有账本创建人可以移除成员");
                    }
                    // 不能移除创建者自己
                    if (targetUserId === ledger[0].createdBy) {
                        throw new Error("不能移除账本创建人");
                    }
                    // 移除成员
                    return [4 /*yield*/, db
                            .delete(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, targetUserId)))];
                case 3:
                    // 移除成员
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取账本成员权限列表
 */
function getMemberPermissions(ledgerId, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger, currentMember, currentUserRole, isOwner, members, sortedMembers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 3:
                    currentMember = _a.sent();
                    if (currentMember.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    currentUserRole = currentMember[0].role;
                    isOwner = ledger[0].createdBy === requestUserId;
                    if (!isOwner) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerMembers.id,
                            userId: schema_1.ledgerMembers.userId,
                            role: schema_1.ledgerMembers.role,
                            permissionView: schema_1.ledgerMembers.permissionView,
                            permissionAdd: schema_1.ledgerMembers.permissionAdd,
                            permissionEdit: schema_1.ledgerMembers.permissionEdit,
                            permissionDelete: schema_1.ledgerMembers.permissionDelete,
                            permissionBackup: schema_1.ledgerMembers.permissionBackup,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId))];
                case 4:
                    // 创建人可以看到所有成员
                    members = _a.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, db
                        .select({
                        id: schema_1.ledgerMembers.id,
                        userId: schema_1.ledgerMembers.userId,
                        role: schema_1.ledgerMembers.role,
                        permissionView: schema_1.ledgerMembers.permissionView,
                        permissionAdd: schema_1.ledgerMembers.permissionAdd,
                        permissionEdit: schema_1.ledgerMembers.permissionEdit,
                        permissionDelete: schema_1.ledgerMembers.permissionDelete,
                        permissionBackup: schema_1.ledgerMembers.permissionBackup,
                    })
                        .from(schema_1.ledgerMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))];
                case 6:
                    // 普通成员只能看到自己
                    members = _a.sent();
                    _a.label = 7;
                case 7:
                    sortedMembers = members.sort(function (a, b) {
                        if (a.userId === requestUserId)
                            return -1;
                        if (b.userId === requestUserId)
                            return 1;
                        return 0;
                    });
                    return [2 /*return*/, {
                            ledgerName: ledger[0].name,
                            currentUserRole: currentUserRole,
                            isOwner: isOwner,
                            members: sortedMembers,
                            defaultPermissions: {
                                view: ledger[0].defaultPermissionView,
                                add: ledger[0].defaultPermissionAdd,
                                edit: ledger[0].defaultPermissionEdit,
                                delete: ledger[0].defaultPermissionDelete,
                                backup: ledger[0].defaultPermissionBackup || 'allow',
                            },
                        }];
            }
        });
    });
}
/**
 * 更新成员权限
 */
function updateMemberPermission(ledgerId, memberId, permissionType, permissionValue, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger, member, valueStr, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    if (ledger[0].createdBy !== requestUserId) {
                        throw new Error("只有账本创建者可以修改权限设置");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, memberId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId)))
                            .limit(1)];
                case 3:
                    member = _a.sent();
                    if (member.length === 0) {
                        throw new Error("成员不存在");
                    }
                    // 不能修改创建者的权限
                    if (member[0].role === "owner") {
                        throw new Error("不能修改创建者的权限");
                    }
                    // 根据权限类型更新对应字段
                    console.log('[updateMemberPermission] Input:', { ledgerId: ledgerId, memberId: memberId, permissionType: permissionType, permissionValue: permissionValue });
                    valueStr = String(permissionValue);
                    console.log('[updateMemberPermission] Value as string:', valueStr);
                    updateData = {};
                    switch (permissionType) {
                        case "view":
                            updateData.permissionView = valueStr;
                            break;
                        case "add":
                            updateData.permissionAdd = valueStr;
                            break;
                        case "edit":
                            updateData.permissionEdit = valueStr;
                            break;
                        case "delete":
                            updateData.permissionDelete = valueStr;
                            break;
                        case "backup":
                            updateData.permissionBackup = valueStr;
                            break;
                    }
                    console.log('[updateMemberPermission] Update data:', updateData);
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerMembers)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, memberId))];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 更新默认成员权限
 */
function updateDefaultPermission(ledgerId, permissionType, permissionValue, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledger, valueStr, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 2:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    if (ledger[0].createdBy !== requestUserId) {
                        throw new Error("只有账本创建者可以修改默认权限设置");
                    }
                    // 根据权限类型更新对应字段
                    console.log('[updateDefaultPermission] Input:', { ledgerId: ledgerId, permissionType: permissionType, permissionValue: permissionValue });
                    valueStr = String(permissionValue);
                    console.log('[updateDefaultPermission] Value as string:', valueStr);
                    updateData = {};
                    switch (permissionType) {
                        case "view":
                            updateData.defaultPermissionView = valueStr;
                            break;
                        case "add":
                            updateData.defaultPermissionAdd = valueStr;
                            break;
                        case "edit":
                            updateData.defaultPermissionEdit = valueStr;
                            break;
                        case "delete":
                            updateData.defaultPermissionDelete = valueStr;
                            break;
                        case "backup":
                            updateData.defaultPermissionBackup = valueStr;
                            break;
                        default:
                            throw new Error("\u65E0\u6548\u7684\u6743\u9650\u7C7B\u578B: ".concat(permissionType));
                    }
                    console.log('[updateDefaultPermission] Update data:', updateData);
                    // 防御性检查：确保 updateData 不为空
                    if (Object.keys(updateData).length === 0) {
                        throw new Error("\u672A\u80FD\u751F\u6210\u66F4\u65B0\u6570\u636E\uFF0CpermissionType: ".concat(permissionType, ", permissionValue: ").concat(permissionValue));
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.ledgers)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取账本的AI雇员列表
 */
function getAIEmployees(ledgerId, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, memberRows, aiRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [ledgerId, requestUserId])];
                case 2:
                    memberRows = (_a.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, conn.execute("SELECT m.id, m.ledgerId, m.userId, m.role, m.nickname, \n            m.member_type as memberType, m.avatar_type as avatarType, m.createdAt,\n            u.avatar as avatarUrl, u.username\n     FROM ledger_members m\n     LEFT JOIN users u ON m.userId = u.id\n     WHERE m.ledgerId = ? AND m.member_type = 'ai'", [ledgerId])];
                case 3:
                    aiRows = (_a.sent())[0];
                    return [2 /*return*/, aiRows || []];
            }
        });
    });
}
/**
 * 添加AI雇员到账本
 */
function addAIEmployee(ledgerId, avatarType, nickname, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, existing, conn;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.memberType, 'ai'), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.avatarType, avatarType)))
                            .limit(1)];
                case 3:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        throw new Error("该虚拟成员已添加");
                    }
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 4:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute("INSERT INTO ledger_members \n     (ledgerId, userId, role, nickname, member_type, avatar_type, \n      permission_view, permission_add, permission_edit, permission_delete, \n      canEdit, canDelete, canInvite) \n     VALUES (?, ?, 'member', ?, 'ai', ?, 'all', 'all', 'own', 'own', 1, 0, 0)", [ledgerId, requestUserId, nickname, avatarType])];
                case 5:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 开关AI分身：开启则自动创建，关闭则删除
 * 使用原生SQL绕过Drizzle ORM的列映射问题和UNIQUE KEY约束
 */
function toggleAIEmployee(ledgerId, enabled, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, memberRows, aiRows, hasAI, userRows, nickname, allAiRows, idsToDelete;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _b.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? LIMIT 1', [ledgerId, requestUserId, 'real'])];
                case 2:
                    memberRows = (_b.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? LIMIT 1', [ledgerId, requestUserId, 'ai'])];
                case 3:
                    aiRows = (_b.sent())[0];
                    hasAI = aiRows && aiRows.length > 0;
                    if (!enabled) return [3 /*break*/, 11];
                    if (!!hasAI) return [3 /*break*/, 7];
                    return [4 /*yield*/, conn.execute('SELECT username FROM users WHERE id = ? LIMIT 1', [requestUserId])];
                case 4:
                    userRows = (_b.sent())[0];
                    nickname = ((_a = userRows === null || userRows === void 0 ? void 0 : userRows[0]) === null || _a === void 0 ? void 0 : _a.username) || 'AI分身';
                    // 先清理可能存在的所有旧AI分身记录（防止重复，同时清理userId=0的旧数据）
                    return [4 /*yield*/, conn.execute('DELETE FROM ledger_members WHERE ledgerId = ? AND member_type = ? AND (userId = ? OR userId = 0)', [ledgerId, 'ai', requestUserId])];
                case 5:
                    // 先清理可能存在的所有旧AI分身记录（防止重复，同时清理userId=0的旧数据）
                    _b.sent();
                    // 使用原生SQL插入，只包含数据库实际存在的列
                    return [4 /*yield*/, conn.execute("INSERT INTO ledger_members \n         (ledgerId, userId, role, nickname, member_type, avatar_type, \n          permission_view, permission_add, permission_edit, permission_delete, \n          canEdit, canDelete, canInvite) \n         VALUES (?, ?, 'member', ?, 'ai', 'user', 'all', 'all', 'own', 'own', 1, 0, 0)", [ledgerId, requestUserId, nickname])];
                case 6:
                    // 使用原生SQL插入，只包含数据库实际存在的列
                    _b.sent();
                    return [3 /*break*/, 10];
                case 7: return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? ORDER BY id ASC', [ledgerId, requestUserId, 'ai'])];
                case 8:
                    allAiRows = (_b.sent())[0];
                    if (!(allAiRows && allAiRows.length > 1)) return [3 /*break*/, 10];
                    idsToDelete = allAiRows.slice(1).map(function (r) { return r.id; });
                    return [4 /*yield*/, conn.execute("DELETE FROM ledger_members WHERE id IN (".concat(idsToDelete.join(','), ")"))];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10: return [2 /*return*/, { success: true, enabled: true }];
                case 11: 
                // 关闭：删除该用户在该账本的所有AI分身（确保彻底清理）
                // 同时清理userId=requestUserId和userId=0的旧数据
                return [4 /*yield*/, conn.execute('DELETE FROM ledger_members WHERE ledgerId = ? AND member_type = ? AND (userId = ? OR userId = 0)', [ledgerId, 'ai', requestUserId])];
                case 12:
                    // 关闭：删除该用户在该账本的所有AI分身（确保彻底清理）
                    // 同时清理userId=requestUserId和userId=0的旧数据
                    _b.sent();
                    return [2 /*return*/, { success: true, enabled: false }];
            }
        });
    });
}
/**
 * 删除账本中的AI雇员
 */
function removeAIEmployee(ledgerId, employeeId, requestUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, employee;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, employeeId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.memberType, 'ai')))
                            .limit(1)];
                case 3:
                    employee = _a.sent();
                    if (employee.length === 0) {
                        throw new Error("AI雇员不存在");
                    }
                    // 删除AI雇员
                    return [4 /*yield*/, db
                            .delete(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, employeeId))];
                case 4:
                    // 删除AI雇员
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 更新账本信息
 */
function updateLedger(ledgerId, requestUserId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    updateData = {};
                    if (data.name !== undefined)
                        updateData.name = data.name;
                    if (data.description !== undefined)
                        updateData.description = data.description;
                    if (!(Object.keys(updateData).length > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .update(schema_1.ledgers)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 更新成员昵称
 */
function updateMemberNickname(ledgerId, requestUserId, nickname) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    // 更新成员昵称
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerMembers)
                            .set({ nickname: nickname })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))];
                case 3:
                    // 更新成员昵称
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取账本报表数据
 */
function getLedgerReport(ledgerId, requestUserId, year, startDate, endDate) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, userPermission, permissionCondition, yearStart, yearEnd, yearlyStats, income, expense, memberStatsRaw, members, memberInfoMap, memberStats, monthlyStatsRaw, monthlyStats, categoryStatsRaw, categoryIds, categories, categoryNameMap, expenseCategories, incomeCategories, recentStartDate, recentEndDate, daysPassed, start, end, today, thirtyDaysAgo, recentStats, recentIncome, recentExpense, dailyStatsRaw, dailyStats, startDateObj, _loop_3, i, recentCategoryStatsRaw, recentCategoryIds, recentCategories, recentCategoryNameMap, recentExpenseCategories, recentIncomeCategories;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _e.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            permissionView: schema_1.ledgerMembers.permissionView,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _e.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = membership[0].permissionView;
                    // 检查查看权限
                    if (userPermission === 'none') {
                        // 不允许查看，返回空数据
                        return [2 /*return*/, {
                                income: 0,
                                expense: 0,
                                memberStats: [],
                                monthlyStats: Array.from({ length: 12 }, function (_, i) { return ({
                                    month: i + 1,
                                    income: 0,
                                    expense: 0,
                                }); }),
                                dailyStats: [],
                                categoryStats: { income: [], expense: [] },
                            }];
                    }
                    permissionCondition = userPermission === 'own'
                        ? (0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.ledgerRecords.createdBy, requestUserId) : undefined;
                    yearStart = "".concat(year, "-01-01");
                    yearEnd = "".concat(year, "-12-31");
                    return [4 /*yield*/, db
                            .select({
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, yearStart), (0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, yearEnd), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt), permissionCondition))];
                case 3:
                    yearlyStats = _e.sent();
                    income = Number(((_a = yearlyStats[0]) === null || _a === void 0 ? void 0 : _a.totalIncome) || 0);
                    expense = Number(((_b = yearlyStats[0]) === null || _b === void 0 ? void 0 : _b.totalExpense) || 0);
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.ledgerRecords.createdBy,
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, yearStart), (0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, yearEnd), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt), permissionCondition))
                            .groupBy(schema_1.ledgerRecords.createdBy)];
                case 4:
                    memberStatsRaw = _e.sent();
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.ledgerMembers.userId,
                            nickname: schema_1.ledgerMembers.nickname,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.ledgerMembers)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId))];
                case 5:
                    members = _e.sent();
                    memberInfoMap = new Map(members.map(function (m) { return [m.userId, m]; }));
                    memberStats = memberStatsRaw.map(function (stat) {
                        var memberInfo = memberInfoMap.get(stat.userId);
                        return {
                            userId: stat.userId,
                            nickname: memberInfo === null || memberInfo === void 0 ? void 0 : memberInfo.nickname,
                            username: memberInfo === null || memberInfo === void 0 ? void 0 : memberInfo.username,
                            avatar: memberInfo === null || memberInfo === void 0 ? void 0 : memberInfo.avatar,
                            income: Number(stat.totalIncome || 0),
                            expense: Number(stat.totalExpense || 0),
                        };
                    });
                    return [4 /*yield*/, db
                            .select({
                            month: (0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["MONTH(", ")"], ["MONTH(", ")"])), schema_1.ledgerRecords.recordDate),
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, yearStart), (0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, yearEnd), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt), permissionCondition))
                            .groupBy((0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["MONTH(", ")"], ["MONTH(", ")"])), schema_1.ledgerRecords.recordDate))];
                case 6:
                    monthlyStatsRaw = _e.sent();
                    monthlyStats = Array.from({ length: 12 }, function (_, i) {
                        var monthData = monthlyStatsRaw.find(function (m) { return Number(m.month) === i + 1; });
                        return {
                            month: i + 1,
                            income: Number((monthData === null || monthData === void 0 ? void 0 : monthData.totalIncome) || 0),
                            expense: Number((monthData === null || monthData === void 0 ? void 0 : monthData.totalExpense) || 0),
                        };
                    });
                    return [4 /*yield*/, db
                            .select({
                            categoryId: schema_1.ledgerRecords.categoryId,
                            type: schema_1.ledgerRecords.type,
                            totalAmount: (0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["COALESCE(SUM(", "), 0)"], ["COALESCE(SUM(", "), 0)"])), schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, yearStart), (0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, yearEnd), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt), permissionCondition))
                            .groupBy(schema_1.ledgerRecords.categoryId, schema_1.ledgerRecords.type)];
                case 7:
                    categoryStatsRaw = _e.sent();
                    categoryIds = categoryStatsRaw.map(function (c) { return c.categoryId; });
                    categories = [];
                    if (!(categoryIds.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(categoryIds, (0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject([", "], [", "]))))))];
                case 8:
                    categories = _e.sent();
                    _e.label = 9;
                case 9:
                    categoryNameMap = new Map(categories.map(function (c) { return [c.id, c.name]; }));
                    expenseCategories = categoryStatsRaw
                        .filter(function (c) { return c.type === 'expense'; })
                        .map(function (c) { return ({
                        category: categoryNameMap.get(c.categoryId) || '未分类',
                        amount: Number(c.totalAmount || 0),
                    }); })
                        .sort(function (a, b) { return b.amount - a.amount; });
                    incomeCategories = categoryStatsRaw
                        .filter(function (c) { return c.type === 'income'; })
                        .map(function (c) { return ({
                        category: categoryNameMap.get(c.categoryId) || '未分类',
                        amount: Number(c.totalAmount || 0),
                    }); })
                        .sort(function (a, b) { return b.amount - a.amount; });
                    if (startDate && endDate) {
                        recentStartDate = startDate;
                        recentEndDate = endDate;
                        start = new Date(startDate);
                        end = new Date(endDate);
                        daysPassed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    }
                    else {
                        today = new Date();
                        thirtyDaysAgo = new Date(today);
                        thirtyDaysAgo.setDate(today.getDate() - 29); // 包含当天共30天
                        recentStartDate = thirtyDaysAgo.toISOString().split('T')[0];
                        recentEndDate = today.toISOString().split('T')[0];
                        daysPassed = 30;
                    }
                    return [4 /*yield*/, db
                            .select({
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, recentStartDate), (0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, recentEndDate), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))];
                case 10:
                    recentStats = _e.sent();
                    recentIncome = Number(((_c = recentStats[0]) === null || _c === void 0 ? void 0 : _c.totalIncome) || 0);
                    recentExpense = Number(((_d = recentStats[0]) === null || _d === void 0 ? void 0 : _d.totalExpense) || 0);
                    return [4 /*yield*/, db
                            .select({
                            date: schema_1.ledgerRecords.recordDate,
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, recentStartDate), (0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, recentEndDate), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .groupBy(schema_1.ledgerRecords.recordDate)
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.ledgerRecords.recordDate))];
                case 11:
                    dailyStatsRaw = _e.sent();
                    dailyStats = [];
                    startDateObj = new Date(recentStartDate);
                    _loop_3 = function (i) {
                        var currentDate = new Date(startDateObj);
                        currentDate.setDate(startDateObj.getDate() + i);
                        var dateStr = currentDate.toISOString().split('T')[0];
                        var dayData = dailyStatsRaw.find(function (d) { return d.date === dateStr; });
                        dailyStats.push({
                            date: dateStr,
                            income: Number((dayData === null || dayData === void 0 ? void 0 : dayData.totalIncome) || 0),
                            expense: Number((dayData === null || dayData === void 0 ? void 0 : dayData.totalExpense) || 0),
                        });
                    };
                    for (i = 0; i < daysPassed; i++) {
                        _loop_3(i);
                    }
                    return [4 /*yield*/, db
                            .select({
                            categoryId: schema_1.ledgerRecords.categoryId,
                            type: schema_1.ledgerRecords.type,
                            totalAmount: (0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject(["COALESCE(SUM(", "), 0)"], ["COALESCE(SUM(", "), 0)"])), schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, recentStartDate), (0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, recentEndDate), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .groupBy(schema_1.ledgerRecords.categoryId, schema_1.ledgerRecords.type)];
                case 12:
                    recentCategoryStatsRaw = _e.sent();
                    recentCategoryIds = recentCategoryStatsRaw.map(function (c) { return c.categoryId; });
                    recentCategories = [];
                    if (!(recentCategoryIds.length > 0)) return [3 /*break*/, 14];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(recentCategoryIds, (0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject([", "], [", "]))))))];
                case 13:
                    recentCategories = _e.sent();
                    _e.label = 14;
                case 14:
                    recentCategoryNameMap = new Map(recentCategories.map(function (c) { return [c.id, c.name]; }));
                    recentExpenseCategories = recentCategoryStatsRaw
                        .filter(function (c) { return c.type === 'expense'; })
                        .map(function (c) { return ({
                        category: recentCategoryNameMap.get(c.categoryId) || '未分类',
                        amount: Number(c.totalAmount || 0),
                    }); })
                        .sort(function (a, b) { return b.amount - a.amount; });
                    recentIncomeCategories = recentCategoryStatsRaw
                        .filter(function (c) { return c.type === 'income'; })
                        .map(function (c) { return ({
                        category: recentCategoryNameMap.get(c.categoryId) || '未分类',
                        amount: Number(c.totalAmount || 0),
                    }); })
                        .sort(function (a, b) { return b.amount - a.amount; });
                    return [2 /*return*/, {
                            yearlyStats: {
                                income: income,
                                expense: expense,
                            },
                            recentStats: {
                                income: recentIncome,
                                expense: recentExpense,
                                days: daysPassed,
                            },
                            dailyStats: dailyStats,
                            memberStats: memberStats,
                            monthlyStats: monthlyStats,
                            categoryStats: {
                                expense: expenseCategories,
                                income: incomeCategories,
                            },
                            recentCategoryStats: {
                                expense: recentExpenseCategories,
                                income: recentIncomeCategories,
                            },
                        }];
            }
        });
    });
}
/**
 * 获取日历数据（指定月份的每日收支统计）
 */
function getCalendarData(ledgerId, requestUserId, year, month, memberIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, userPermission, monthStr, monthStart, lastDay, monthEnd, memberCondition, memberUserIds, userIds, monthlyStatsRaw, monthlyStats, dailyStatsRaw, dailyStats;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            permissionView: schema_1.ledgerMembers.permissionView,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _c.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = membership[0].permissionView;
                    // 检查查看权限
                    if (userPermission === 'none') {
                        // 不允许查看，返回空数据
                        return [2 /*return*/, {
                                monthlyStats: { income: 0, expense: 0 },
                                dailyStats: [],
                            }];
                    }
                    monthStr = String(month).padStart(2, '0');
                    monthStart = "".concat(year, "-").concat(monthStr, "-01");
                    lastDay = new Date(year, month, 0).getDate();
                    monthEnd = "".concat(year, "-").concat(monthStr, "-").concat(lastDay);
                    if (!(userPermission === 'own')) return [3 /*break*/, 3];
                    // 如果权限是"仅自己"，强制只查看自己创建的记录
                    memberCondition = (0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.ledgerRecords.createdBy, requestUserId);
                    return [3 /*break*/, 5];
                case 3:
                    if (!(userPermission === 'all' && memberIds && memberIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.ledgerMembers.userId })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerMembers.id, drizzle_orm_1.sql.join(memberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject([", "], [", "])))))))];
                case 4:
                    memberUserIds = _c.sent();
                    if (memberUserIds.length > 0) {
                        userIds = memberUserIds.map(function (m) { return m.userId; });
                        memberCondition = (0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerRecords.createdBy, drizzle_orm_1.sql.join(userIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject([", "], [", "])))));
                    }
                    else {
                        memberCondition = (0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["1 = 0"], ["1 = 0"])));
                    }
                    _c.label = 5;
                case 5: return [4 /*yield*/, db
                        .select({
                        totalIncome: (0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        totalExpense: (0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                    })
                        .from(schema_1.ledgerRecords)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, monthStart), (0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, monthEnd), memberCondition, (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))];
                case 6:
                    monthlyStatsRaw = _c.sent();
                    monthlyStats = {
                        income: Number(((_a = monthlyStatsRaw[0]) === null || _a === void 0 ? void 0 : _a.totalIncome) || 0),
                        expense: Number(((_b = monthlyStatsRaw[0]) === null || _b === void 0 ? void 0 : _b.totalExpense) || 0),
                    };
                    return [4 /*yield*/, db
                            .select({
                            recordDate: schema_1.ledgerRecords.recordDate,
                            totalIncome: (0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'income' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                            totalExpense: (0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject(["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"], ["COALESCE(SUM(CASE WHEN ", " = 'expense' THEN ", " ELSE 0 END), 0)"])), schema_1.ledgerRecords.type, schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, monthStart), (0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, monthEnd), memberCondition, (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .groupBy(schema_1.ledgerRecords.recordDate)];
                case 7:
                    dailyStatsRaw = _c.sent();
                    dailyStats = dailyStatsRaw.map(function (day) {
                        // 从日期字符串中提取天数
                        var dateStr = String(day.recordDate);
                        var dayNum = parseInt(dateStr.split('-')[2], 10);
                        return {
                            day: dayNum,
                            income: Number(day.totalIncome || 0),
                            expense: Number(day.totalExpense || 0),
                        };
                    });
                    return [2 /*return*/, {
                            monthlyStats: monthlyStats,
                            dailyStats: dailyStats,
                        }];
            }
        });
    });
}
/**
 * 获取指定日期的记账记录
 */
function getDayRecords(ledgerId, requestUserId, date, memberIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, userPermission, userRole, memberCondition, memberUserIds, userIds, records, categoryIds, categories, categoryNameMap;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            permissionView: schema_1.ledgerMembers.permissionView,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, requestUserId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = membership[0].permissionView;
                    userRole = membership[0].role;
                    // 检查查看权限
                    if (userPermission === 'none') {
                        // 不允许查看任何账目
                        return [2 /*return*/, []];
                    }
                    if (!(userPermission === 'own')) return [3 /*break*/, 3];
                    // 如果权限是"仅自己"，强制只查看自己创建的记录，忽略 memberIds 参数
                    memberCondition = (0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.ledgerRecords.createdBy, requestUserId);
                    return [3 /*break*/, 5];
                case 3:
                    if (!(userPermission === 'all')) return [3 /*break*/, 5];
                    if (!(memberIds && memberIds.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.ledgerMembers.userId })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerMembers.id, drizzle_orm_1.sql.join(memberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject([", "], [", "])))))))];
                case 4:
                    memberUserIds = _a.sent();
                    if (memberUserIds.length > 0) {
                        userIds = memberUserIds.map(function (m) { return m.userId; });
                        memberCondition = (0, drizzle_orm_1.sql)(templateObject_77 || (templateObject_77 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerRecords.createdBy, drizzle_orm_1.sql.join(userIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject([", "], [", "])))));
                    }
                    else {
                        // 如果没有找到对应的成员，返回空结果
                        memberCondition = (0, drizzle_orm_1.sql)(templateObject_78 || (templateObject_78 = __makeTemplateObject(["1 = 0"], ["1 = 0"])));
                    }
                    _a.label = 5;
                case 5: return [4 /*yield*/, db
                        .select({
                        id: schema_1.ledgerRecords.id,
                        type: schema_1.ledgerRecords.type,
                        amount: schema_1.ledgerRecords.amount,
                        categoryId: schema_1.ledgerRecords.categoryId,
                        description: schema_1.ledgerRecords.description,
                        date: schema_1.ledgerRecords.recordDate,
                        createdBy: schema_1.ledgerRecords.createdBy,
                    })
                        .from(schema_1.ledgerRecords)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.sql)(templateObject_79 || (templateObject_79 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.ledgerRecords.recordDate, date), memberCondition, (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerRecords.createdAt))];
                case 6:
                    records = _a.sent();
                    categoryIds = records.map(function (r) { return r.categoryId; }).filter(function (id) { return id; });
                    categories = [];
                    if (!(categoryIds.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_81 || (templateObject_81 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(categoryIds, (0, drizzle_orm_1.sql)(templateObject_80 || (templateObject_80 = __makeTemplateObject([", "], [", "]))))))];
                case 7:
                    categories = _a.sent();
                    _a.label = 8;
                case 8:
                    categoryNameMap = new Map(categories.map(function (c) { return [c.id, c.name]; }));
                    return [2 /*return*/, records.map(function (record) { return (__assign(__assign({}, record), { amount: Number(record.amount), categoryName: categoryNameMap.get(record.categoryId) || '未分类' })); })];
            }
        });
    });
}
/**
 * 添加记账记录
 */
function addTransaction(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, approvalCheck, approvalStatus, approverIds, allMembers, approverIdsJson, recordData, encryptedRecordData, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, data.ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, data.userId)))
                            .limit(1)];
                case 2:
                    membership = _b.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, checkNeedApproval(data.ledgerId, data.userId)];
                case 3:
                    approvalCheck = _b.sent();
                    approvalStatus = 'not_required';
                    approverIds = [];
                    if (!(approvalCheck.needApproval && approvalCheck.rule)) return [3 /*break*/, 6];
                    approvalStatus = 'pending';
                    if (!(approvalCheck.rule.approverType === 'all')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.ledgerMembers.userId })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, data.ledgerId))];
                case 4:
                    allMembers = _b.sent();
                    approverIds = allMembers
                        .map(function (m) { return m.userId; })
                        .filter(function (id) { return id !== data.userId; });
                    return [3 /*break*/, 6];
                case 5:
                    if (approvalCheck.rule.approverType === 'specific') {
                        approverIdsJson = approvalCheck.rule.approverIds;
                        approverIds = typeof approverIdsJson === 'string'
                            ? JSON.parse(approverIdsJson)
                            : approverIdsJson || [];
                    }
                    _b.label = 6;
                case 6:
                    recordData = {
                        ledgerId: data.ledgerId,
                        type: data.type,
                        amount: data.amount.toString(),
                        categoryId: data.categoryId,
                        description: data.description || null,
                        imageUrl: data.images && data.images.length > 0 ? data.images[0] : null,
                        recordDate: data.transactionDate,
                        createdBy: data.userId,
                        reimbursementStatus: data.reimbursementStatus || 'none',
                        pendingType: data.pendingType || null,
                        pendingIncludeStats: data.pendingType ? ((_a = data.pendingIncludeStats) !== null && _a !== void 0 ? _a : 1) : null,
                    };
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'ledger_records', recordData, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 7:
                    encryptedRecordData = _b.sent();
                    return [4 /*yield*/, db.insert(schema_1.ledgerRecords).values(encryptedRecordData)];
                case 8:
                    result = _b.sent();
                    if (!(approvalStatus === 'pending' && approverIds.length > 0)) return [3 /*break*/, 10];
                    return [4 /*yield*/, createApprovalRecords(data.ledgerId, result.insertId, approverIds)];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10: return [2 /*return*/, {
                        id: result.insertId,
                        success: true,
                        needApproval: approvalStatus === 'pending',
                        approverIds: approverIds,
                    }];
            }
        });
    });
}
/**
 * 获取账本的记账记录列表（按日期分组）
 */
function getTransactionsList(ledgerId, userId, options) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, userPermission, conditions, records, categoryIds, categories, parentIds_1, parentCategories, grandParentIds_1, grandParentCategories, categoryMap, buildCategoryPath, creatorIds, creators, creatorMap, decryptedRecords, groupedRecords, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            permissionView: schema_1.ledgerMembers.permissionView,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = membership[0].permissionView;
                    // 检查查看权限
                    if (userPermission === 'none') {
                        return [2 /*return*/, []];
                    }
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId)];
                    // 如果权限是"仅自己"，强制只查看自己创建的记录
                    if (userPermission === 'own') {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_82 || (templateObject_82 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.ledgerRecords.createdBy, userId));
                    }
                    if (options === null || options === void 0 ? void 0 : options.startDate) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_83 || (templateObject_83 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.recordDate, options.startDate));
                    }
                    if (options === null || options === void 0 ? void 0 : options.endDate) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_84 || (templateObject_84 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.recordDate, options.endDate));
                    }
                    if (options === null || options === void 0 ? void 0 : options.type) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.type, options.type));
                    }
                    if (options === null || options === void 0 ? void 0 : options.categoryId) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, options.categoryId));
                    }
                    if (options === null || options === void 0 ? void 0 : options.amountMin) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_85 || (templateObject_85 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.ledgerRecords.amount, options.amountMin));
                    }
                    if (options === null || options === void 0 ? void 0 : options.amountMax) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_86 || (templateObject_86 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.ledgerRecords.amount, options.amountMax));
                    }
                    if (options === null || options === void 0 ? void 0 : options.memberId) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.createdBy, options.memberId));
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerRecords.id,
                            type: schema_1.ledgerRecords.type,
                            amount: schema_1.ledgerRecords.amount,
                            categoryId: schema_1.ledgerRecords.categoryId,
                            description: schema_1.ledgerRecords.description,
                            date: schema_1.ledgerRecords.recordDate,
                            createdBy: schema_1.ledgerRecords.createdBy,
                            createdAt: schema_1.ledgerRecords.createdAt,
                            imageUrl: schema_1.ledgerRecords.imageUrl,
                            reimbursementStatus: schema_1.ledgerRecords.reimbursementStatus,
                            pendingType: schema_1.ledgerRecords.pendingType,
                            pendingIncludeStats: schema_1.ledgerRecords.pendingIncludeStats,
                        })
                            .from(schema_1.ledgerRecords)
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray([], conditions, false), [(0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)], false)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerRecords.recordDate), (0, drizzle_orm_1.desc)(schema_1.ledgerRecords.createdAt))
                            .limit((options === null || options === void 0 ? void 0 : options.limit) || 100)
                            .offset((options === null || options === void 0 ? void 0 : options.offset) || 0)];
                case 3:
                    records = _a.sent();
                    categoryIds = new Set();
                    records.forEach(function (r) {
                        if (r.categoryId)
                            categoryIds.add(r.categoryId);
                    });
                    categories = [];
                    if (!(categoryIds.size > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                            icon: schema_1.ledgerCategories.icon,
                            parentId: schema_1.ledgerCategories.parentId,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_89 || (templateObject_89 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(Array.from(categoryIds).map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_87 || (templateObject_87 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_88 || (templateObject_88 = __makeTemplateObject([", "], [", "]))))))];
                case 4:
                    // 首先获取当前分类
                    categories = _a.sent();
                    parentIds_1 = new Set();
                    categories.forEach(function (c) {
                        if (c.parentId)
                            parentIds_1.add(c.parentId);
                    });
                    if (!(parentIds_1.size > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                            icon: schema_1.ledgerCategories.icon,
                            parentId: schema_1.ledgerCategories.parentId,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_92 || (templateObject_92 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(Array.from(parentIds_1).map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_90 || (templateObject_90 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_91 || (templateObject_91 = __makeTemplateObject([", "], [", "]))))))];
                case 5:
                    parentCategories = _a.sent();
                    categories = __spreadArray(__spreadArray([], categories, true), parentCategories, true);
                    grandParentIds_1 = new Set();
                    parentCategories.forEach(function (c) {
                        if (c.parentId)
                            grandParentIds_1.add(c.parentId);
                    });
                    if (!(grandParentIds_1.size > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                            icon: schema_1.ledgerCategories.icon,
                            parentId: schema_1.ledgerCategories.parentId,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_95 || (templateObject_95 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(Array.from(grandParentIds_1).map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_93 || (templateObject_93 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_94 || (templateObject_94 = __makeTemplateObject([", "], [", "]))))))];
                case 6:
                    grandParentCategories = _a.sent();
                    categories = __spreadArray(__spreadArray([], categories, true), grandParentCategories, true);
                    _a.label = 7;
                case 7:
                    categoryMap = new Map(categories.map(function (c) { return [c.id, c]; }));
                    buildCategoryPath = function (categoryId) {
                        if (!categoryId)
                            return '未分类';
                        var path = [];
                        var currentId = categoryId;
                        // 最多遍历3层，防止无限循环
                        for (var i = 0; i < 3 && currentId; i++) {
                            var cat = categoryMap.get(currentId);
                            if (!cat)
                                break;
                            path.unshift(cat.name); // 在前面插入，保证顺序是 一级 > 二级 > 三级
                            currentId = cat.parentId;
                        }
                        return path.length > 0 ? path.join('-') : '未分类';
                    };
                    creatorIds = new Set();
                    records.forEach(function (r) {
                        if (r.createdBy)
                            creatorIds.add(r.createdBy);
                    });
                    creators = [];
                    if (!(creatorIds.size > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            avatar: schema_1.users.avatar,
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.sql)(templateObject_98 || (templateObject_98 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.users.id, drizzle_orm_1.sql.join(Array.from(creatorIds).map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_96 || (templateObject_96 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_97 || (templateObject_97 = __makeTemplateObject([", "], [", "]))))))];
                case 8:
                    creators = _a.sent();
                    _a.label = 9;
                case 9:
                    creatorMap = new Map(creators.map(function (c) { return [c.id, c]; }));
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'ledger_records', records, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 10:
                    decryptedRecords = _a.sent();
                    groupedRecords = {};
                    decryptedRecords.forEach(function (record) {
                        var date = record.date;
                        if (!groupedRecords[date]) {
                            groupedRecords[date] = {
                                date: date,
                                records: [],
                                income: 0,
                                expense: 0,
                            };
                        }
                        var category = categoryMap.get(record.categoryId);
                        var creator = creatorMap.get(record.createdBy);
                        var amount = Number(record.amount);
                        groupedRecords[date].records.push({
                            id: record.id,
                            type: record.type,
                            amount: amount,
                            category: buildCategoryPath(record.categoryId),
                            categoryIcon: category === null || category === void 0 ? void 0 : category.icon,
                            description: record.description,
                            createdAt: record.createdAt,
                            imageUrl: record.imageUrl,
                            reimbursementStatus: record.reimbursementStatus,
                            pendingType: record.pendingType,
                            pendingIncludeStats: record.pendingIncludeStats,
                            member: creator ? {
                                username: creator.username,
                                avatar: creator.avatar,
                            } : null,
                        });
                        // 待结账目且 pendingIncludeStats === 0 时不计入统计
                        var shouldIncludeInStats = !(record.pendingType && record.pendingIncludeStats === 0);
                        if (shouldIncludeInStats) {
                            if (record.type === 'income') {
                                groupedRecords[date].income += amount;
                            }
                            else {
                                groupedRecords[date].expense += amount;
                            }
                        }
                    });
                    result = Object.values(groupedRecords).map(function (day) { return (__assign(__assign({}, day), { balance: day.income - day.expense })); });
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取单条记账详情
 */
function getTransactionDetail(ledgerId, transactionId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, userPermission, record, transaction, category, categoryName, subcategoryName, parentCategory, memberResult, memberWithAvatar, categoryPath, decryptedTransaction, result, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 10, , 11]);
                    console.log('[getTransactionDetail] 开始查询:', { ledgerId: ledgerId, transactionId: transactionId, userId: userId });
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            permissionView: schema_1.ledgerMembers.permissionView,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _b.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = membership[0].permissionView;
                    // 检查查看权限
                    if (userPermission === 'none') {
                        throw new Error("您没有查看账目的权限");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerRecords.id,
                            ledgerId: schema_1.ledgerRecords.ledgerId,
                            categoryId: schema_1.ledgerRecords.categoryId,
                            amount: schema_1.ledgerRecords.amount,
                            type: schema_1.ledgerRecords.type,
                            date: schema_1.ledgerRecords.recordDate,
                            description: schema_1.ledgerRecords.description,
                            createdBy: schema_1.ledgerRecords.createdBy,
                            createdAt: schema_1.ledgerRecords.createdAt,
                            updatedAt: schema_1.ledgerRecords.updatedAt,
                            imageUrl: schema_1.ledgerRecords.imageUrl,
                            reimbursementStatus: schema_1.ledgerRecords.reimbursementStatus,
                            reimbursementNotes: schema_1.ledgerRecords.reimbursementNotes,
                            reimbursementVoucherUrl: schema_1.ledgerRecords.reimbursementVoucherUrl,
                            reimbursedAt: schema_1.ledgerRecords.reimbursedAt,
                            reimbursedBy: schema_1.ledgerRecords.reimbursedBy,
                            pendingType: schema_1.ledgerRecords.pendingType,
                            pendingIncludeStats: schema_1.ledgerRecords.pendingIncludeStats,
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, transactionId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)];
                case 3:
                    record = _b.sent();
                    console.log('[getTransactionDetail] 查询结果:', { recordLength: record.length, record: record[0] });
                    if (record.length === 0) {
                        throw new Error("记账不存在");
                    }
                    transaction = record[0];
                    // 如果权限是"仅自己"，检查该记录是否是自己创建的
                    if (userPermission === 'own' && transaction.createdBy !== userId) {
                        throw new Error("您没有查看该账目的权限");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                            parentId: schema_1.ledgerCategories.parentId,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, transaction.categoryId))
                            .limit(1)];
                case 4:
                    category = _b.sent();
                    categoryName = '';
                    subcategoryName = '';
                    if (!(category.length > 0)) return [3 /*break*/, 7];
                    if (!category[0].parentId) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({ name: schema_1.ledgerCategories.name })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, category[0].parentId))
                            .limit(1)];
                case 5:
                    parentCategory = _b.sent();
                    if (parentCategory.length > 0) {
                        categoryName = parentCategory[0].name;
                        subcategoryName = category[0].name;
                    }
                    return [3 /*break*/, 7];
                case 6:
                    // 这是一级分类
                    categoryName = category[0].name;
                    _b.label = 7;
                case 7: return [4 /*yield*/, db
                        .select({
                        userId: schema_1.ledgerMembers.userId,
                        nickname: schema_1.ledgerMembers.nickname,
                        role: schema_1.ledgerMembers.role,
                        username: schema_1.users.username,
                        avatar: schema_1.users.avatar,
                    })
                        .from(schema_1.ledgerMembers)
                        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, schema_1.users.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, transaction.createdBy)))
                        .limit(1)];
                case 8:
                    memberResult = _b.sent();
                    memberWithAvatar = memberResult.length > 0 ? memberResult[0] : null;
                    categoryPath = [];
                    if (category.length > 0) {
                        if (category[0].parentId) {
                            // 有父分类，添加父分类 ID
                            categoryPath.push(category[0].parentId);
                        }
                        // 添加当前分类 ID
                        categoryPath.push(category[0].id);
                    }
                    return [4 /*yield*/, (0, encryption_1.decryptFields)(db, 'ledger_records', transaction, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 9:
                    decryptedTransaction = _b.sent();
                    result = {
                        id: decryptedTransaction.id,
                        ledgerId: decryptedTransaction.ledgerId,
                        amount: decryptedTransaction.amount,
                        type: decryptedTransaction.type,
                        date: decryptedTransaction.date,
                        description: decryptedTransaction.description,
                        categoryId: transaction.categoryId,
                        categoryPath: categoryPath,
                        category: categoryName,
                        subcategory: subcategoryName,
                        createdBy: transaction.createdBy,
                        createdAt: transaction.createdAt,
                        updatedAt: transaction.updatedAt,
                        member: memberWithAvatar,
                        recordDate: transaction.date,
                        approvalStatus: 'not_required', // 默认不需要审批
                        images: transaction.imageUrl ? [transaction.imageUrl] : [],
                        reimbursementStatus: transaction.reimbursementStatus || 'none',
                        reimbursementNotes: transaction.reimbursementNotes || null,
                        reimbursementVoucherUrl: transaction.reimbursementVoucherUrl || null,
                        reimbursedAt: transaction.reimbursedAt || null,
                        reimbursedBy: transaction.reimbursedBy || null,
                        pendingType: transaction.pendingType || null,
                        pendingIncludeStats: (_a = transaction.pendingIncludeStats) !== null && _a !== void 0 ? _a : null,
                    };
                    console.log('[getTransactionDetail] 返回结果:', result);
                    return [2 /*return*/, result];
                case 10:
                    error_3 = _b.sent();
                    console.error('[getTransactionDetail] 错误:', error_3);
                    throw error_3;
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除记账记录
 */
function deleteTransaction(recordId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, recordRows, record, ledgerId, memberRows, verifyRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id, ledgerId, createdBy FROM ledger_records WHERE id = ? AND deleted_at IS NULL LIMIT 1', [recordId])];
                case 2:
                    recordRows = (_a.sent())[0];
                    if (!recordRows || recordRows.length === 0) {
                        throw new Error("记录不存在");
                    }
                    record = recordRows[0];
                    ledgerId = record.ledgerId;
                    console.log('[deleteTransaction] 找到记录:', { recordId: recordId, ledgerId: ledgerId, createdBy: record.createdBy });
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [ledgerId, userId])];
                case 3:
                    memberRows = (_a.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    // 软删除：使用原始SQL直接更新 deleted_at 和 deleted_by
                    console.log('[deleteTransaction] 执行软删除:', { recordId: recordId, userId: userId });
                    return [4 /*yield*/, conn.execute('UPDATE ledger_records SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [userId, recordId])];
                case 4:
                    _a.sent();
                    console.log('[deleteTransaction] 软删除成功');
                    return [4 /*yield*/, conn.execute('SELECT id, deleted_at, deleted_by FROM ledger_records WHERE id = ?', [recordId])];
                case 5:
                    verifyRows = (_a.sent())[0];
                    console.log('[deleteTransaction] 验证结果:', verifyRows === null || verifyRows === void 0 ? void 0 : verifyRows[0]);
                    // 写入修改日志
                    return [4 /*yield*/, insertRecordLog({
                            recordId: recordId,
                            ledgerId: ledgerId,
                            operatorId: userId,
                            action: 'delete',
                            note: '删除账目',
                        })];
                case 6:
                    // 写入修改日志
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取已删除的账目记录（60天内）
 */
function getDeletedTransactions(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, db, memberRows, userPermission, records, rows, rows, categoryIds, categoriesMap, catIdArr, placeholders, catRows, userIdSet, usersMap, avatarsMap, userIdArr, placeholders, userRows, toStr, toDateStr, formattedRecords, decryptedRecords;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _a.sent();
                    console.log('[getDeletedTransactions] 开始查询:', { ledgerId: ledgerId, userId: userId });
                    return [4 /*yield*/, conn.execute('SELECT permission_view, role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [ledgerId, userId])];
                case 3:
                    memberRows = (_a.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    userPermission = memberRows[0].permission_view;
                    console.log('[getDeletedTransactions] 用户权限:', userPermission);
                    // 检查查看权限
                    if (userPermission === 'none') {
                        return [2 /*return*/, []];
                    }
                    if (!(userPermission === 'own')) return [3 /*break*/, 5];
                    return [4 /*yield*/, conn.execute('SELECT id, type, amount, categoryId, description, recordDate, createdBy, createdAt, imageUrl, deleted_at, deleted_by, reimbursement_status, pending_type, pending_include_stats FROM ledger_records WHERE ledgerId = ? AND deleted_at IS NOT NULL AND deleted_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND (deleted_by = ? OR createdBy = ?) ORDER BY deleted_at DESC', [ledgerId, userId, userId])];
                case 4:
                    rows = (_a.sent())[0];
                    records = rows || [];
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, conn.execute('SELECT id, type, amount, categoryId, description, recordDate, createdBy, createdAt, imageUrl, deleted_at, deleted_by, reimbursement_status, pending_type, pending_include_stats FROM ledger_records WHERE ledgerId = ? AND deleted_at IS NOT NULL AND deleted_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) ORDER BY deleted_at DESC', [ledgerId])];
                case 6:
                    rows = (_a.sent())[0];
                    records = rows || [];
                    _a.label = 7;
                case 7:
                    console.log('[getDeletedTransactions] 查询结果:', { recordCount: (records === null || records === void 0 ? void 0 : records.length) || 0 });
                    if (!records || records.length === 0) {
                        return [2 /*return*/, []];
                    }
                    categoryIds = new Set();
                    records.forEach(function (r) {
                        if (r.categoryId)
                            categoryIds.add(r.categoryId);
                    });
                    categoriesMap = {};
                    if (!(categoryIds.size > 0)) return [3 /*break*/, 9];
                    catIdArr = __spreadArray([], categoryIds, true);
                    placeholders = catIdArr.map(function () { return '?'; }).join(',');
                    return [4 /*yield*/, conn.execute("SELECT id, name FROM ledger_categories WHERE id IN (".concat(placeholders, ")"), catIdArr)];
                case 8:
                    catRows = (_a.sent())[0];
                    (catRows || []).forEach(function (c) {
                        categoriesMap[c.id] = c.name;
                    });
                    _a.label = 9;
                case 9:
                    userIdSet = new Set();
                    records.forEach(function (r) {
                        if (r.deleted_by)
                            userIdSet.add(r.deleted_by);
                        if (r.createdBy)
                            userIdSet.add(r.createdBy);
                    });
                    usersMap = {};
                    avatarsMap = {};
                    if (!(userIdSet.size > 0)) return [3 /*break*/, 11];
                    userIdArr = __spreadArray([], userIdSet, true);
                    placeholders = userIdArr.map(function () { return '?'; }).join(',');
                    return [4 /*yield*/, conn.execute("SELECT id, username, name, avatar FROM users WHERE id IN (".concat(placeholders, ")"), userIdArr)];
                case 10:
                    userRows = (_a.sent())[0];
                    (userRows || []).forEach(function (u) {
                        usersMap[u.id] = u.name || u.username || '未知';
                        avatarsMap[u.id] = u.avatar || null;
                    });
                    _a.label = 11;
                case 11:
                    toStr = function (v) {
                        if (!v)
                            return null;
                        if (v instanceof Date)
                            return v.toISOString();
                        return String(v);
                    };
                    toDateStr = function (v) {
                        if (!v)
                            return null;
                        if (v instanceof Date) {
                            var y = v.getFullYear();
                            var m = String(v.getMonth() + 1).padStart(2, '0');
                            var d = String(v.getDate()).padStart(2, '0');
                            return "".concat(y, "-").concat(m, "-").concat(d);
                        }
                        // 如果已经是字符串，截取前10位（YYYY-MM-DD）
                        return String(v).substring(0, 10);
                    };
                    formattedRecords = records.map(function (r) {
                        var _a;
                        return ({
                            id: r.id,
                            type: r.type,
                            amount: r.amount ? String(r.amount) : '0',
                            categoryId: r.categoryId,
                            description: r.description || '',
                            date: toDateStr(r.recordDate),
                            createdBy: r.createdBy,
                            createdAt: toStr(r.createdAt),
                            imageUrl: r.imageUrl || null,
                            deletedAt: toDateStr(r.deleted_at),
                            deletedBy: r.deleted_by,
                            categoryName: r.categoryId ? (categoriesMap[r.categoryId] || '未分类') : '未分类',
                            createdByName: usersMap[r.createdBy] || '未知',
                            createdByAvatar: avatarsMap[r.createdBy] || null,
                            deletedByName: r.deleted_by ? (usersMap[r.deleted_by] || '未知') : '未知',
                            reimbursementStatus: r.reimbursement_status || 'none',
                            pendingType: r.pending_type || null,
                            pendingIncludeStats: (_a = r.pending_include_stats) !== null && _a !== void 0 ? _a : 1,
                        });
                    });
                    if (!db) return [3 /*break*/, 13];
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'ledger_records', formattedRecords, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 12:
                    decryptedRecords = _a.sent();
                    return [2 /*return*/, decryptedRecords];
                case 13: return [2 /*return*/, formattedRecords];
            }
        });
    });
}
/**
 * 恢复已删除的账目记录
 */
function restoreTransaction(recordId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, recordRows, record, deletedDate, now, diffDays, memberRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id, ledgerId, deleted_at FROM ledger_records WHERE id = ? LIMIT 1', [recordId])];
                case 2:
                    recordRows = (_a.sent())[0];
                    if (!recordRows || recordRows.length === 0) {
                        throw new Error("记录不存在");
                    }
                    record = recordRows[0];
                    if (!record.deleted_at) {
                        throw new Error("该记录未被删除");
                    }
                    deletedDate = new Date(record.deleted_at);
                    now = new Date();
                    diffDays = (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (diffDays > 60) {
                        throw new Error("该记录已超过60天，无法恢复");
                    }
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [record.ledgerId, userId])];
                case 3:
                    memberRows = (_a.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    // 恢复记录：清除 deleted_at 和 deleted_by
                    return [4 /*yield*/, conn.execute('UPDATE ledger_records SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [recordId])];
                case 4:
                    // 恢复记录：清除 deleted_at 和 deleted_by
                    _a.sent();
                    console.log('[restoreTransaction] 恢复成功:', { recordId: recordId });
                    // 写入修改日志
                    return [4 /*yield*/, insertRecordLog({
                            recordId: recordId,
                            ledgerId: record.ledgerId,
                            operatorId: userId,
                            action: 'restore',
                            note: '恢复已删除账目',
                        })];
                case 5:
                    // 写入修改日志
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 清理超过60天的已删除记录（永久删除）
 */
function purgeExpiredDeletedRecords() {
    return __awaiter(this, void 0, void 0, function () {
        var conn;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('DELETE FROM ledger_records WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 60 DAY)')];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 更新记账记录
 */
function updateTransaction(recordId, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, oldRecords, oldRecord, decryptedOldRecord, membership, updateData, logChanges, typeLabel, reimbursementLabel, pendingLabel, oldCategoryName, newCategoryName, oldCat, parentCat, newCat, parentCat, e_12, oldPending, newPending, encryptedUpdateData, _i, logChanges_1, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, recordId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)];
                case 2:
                    oldRecords = _a.sent();
                    if (oldRecords.length === 0) {
                        throw new Error("记录不存在");
                    }
                    oldRecord = oldRecords[0];
                    return [4 /*yield*/, (0, encryption_1.decryptFields)(db, 'ledger_records', oldRecord, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 3:
                    decryptedOldRecord = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, oldRecord.ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 4:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    updateData = {};
                    logChanges = [];
                    typeLabel = function (t) { return t === 'income' ? '收入' : '支出'; };
                    reimbursementLabel = function (s) { return ({ none: '无报销', pending: '待报销', completed: '已报销' }[s] || s); };
                    pendingLabel = function (t) { return t === 'receivable' ? '代收' : t === 'payable' ? '代付' : '无'; };
                    if (data.type && data.type !== decryptedOldRecord.type) {
                        updateData.type = data.type;
                        logChanges.push({ fieldName: '类型', oldValue: typeLabel(decryptedOldRecord.type), newValue: typeLabel(data.type) });
                    }
                    else if (data.type) {
                        updateData.type = data.type; // 仍然更新，但不记录日志
                    }
                    if (data.amount !== undefined && String(data.amount) !== String(parseFloat(decryptedOldRecord.amount))) {
                        updateData.amount = data.amount.toString();
                        logChanges.push({ fieldName: '金额', oldValue: String(parseFloat(decryptedOldRecord.amount)), newValue: String(data.amount) });
                    }
                    else if (data.amount !== undefined) {
                        updateData.amount = data.amount.toString();
                    }
                    if (!(data.categoryId && data.categoryId !== decryptedOldRecord.categoryId)) return [3 /*break*/, 16];
                    updateData.categoryId = data.categoryId;
                    oldCategoryName = String(decryptedOldRecord.categoryId);
                    newCategoryName = String(data.categoryId);
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 14, , 15]);
                    if (!decryptedOldRecord.categoryId) return [3 /*break*/, 9];
                    return [4 /*yield*/, db.select({ name: schema_1.ledgerCategories.name, parentId: schema_1.ledgerCategories.parentId })
                            .from(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, decryptedOldRecord.categoryId)).limit(1)];
                case 6:
                    oldCat = _a.sent();
                    if (!(oldCat.length > 0)) return [3 /*break*/, 9];
                    if (!oldCat[0].parentId) return [3 /*break*/, 8];
                    return [4 /*yield*/, db.select({ name: schema_1.ledgerCategories.name })
                            .from(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, oldCat[0].parentId)).limit(1)];
                case 7:
                    parentCat = _a.sent();
                    oldCategoryName = parentCat.length > 0 ? "".concat(parentCat[0].name, "/").concat(oldCat[0].name) : oldCat[0].name;
                    return [3 /*break*/, 9];
                case 8:
                    oldCategoryName = oldCat[0].name;
                    _a.label = 9;
                case 9: return [4 /*yield*/, db.select({ name: schema_1.ledgerCategories.name, parentId: schema_1.ledgerCategories.parentId })
                        .from(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, data.categoryId)).limit(1)];
                case 10:
                    newCat = _a.sent();
                    if (!(newCat.length > 0)) return [3 /*break*/, 13];
                    if (!newCat[0].parentId) return [3 /*break*/, 12];
                    return [4 /*yield*/, db.select({ name: schema_1.ledgerCategories.name })
                            .from(schema_1.ledgerCategories).where((0, drizzle_orm_1.eq)(schema_1.ledgerCategories.id, newCat[0].parentId)).limit(1)];
                case 11:
                    parentCat = _a.sent();
                    newCategoryName = parentCat.length > 0 ? "".concat(parentCat[0].name, "/").concat(newCat[0].name) : newCat[0].name;
                    return [3 /*break*/, 13];
                case 12:
                    newCategoryName = newCat[0].name;
                    _a.label = 13;
                case 13: return [3 /*break*/, 15];
                case 14:
                    e_12 = _a.sent();
                    console.error('[updateTransaction] 查询分类名称失败:', e_12);
                    return [3 /*break*/, 15];
                case 15:
                    logChanges.push({ fieldName: '分类', oldValue: oldCategoryName, newValue: newCategoryName });
                    return [3 /*break*/, 17];
                case 16:
                    if (data.categoryId) {
                        updateData.categoryId = data.categoryId;
                    }
                    _a.label = 17;
                case 17:
                    if (data.subcategoryId !== undefined) {
                        updateData.subcategoryId = data.subcategoryId;
                    }
                    if (data.description !== undefined && (data.description || '') !== (decryptedOldRecord.description || '')) {
                        updateData.description = data.description;
                        logChanges.push({ fieldName: '备注', oldValue: decryptedOldRecord.description || '无', newValue: data.description || '无' });
                    }
                    else if (data.description !== undefined) {
                        updateData.description = data.description;
                    }
                    if (data.transactionDate && data.transactionDate !== decryptedOldRecord.recordDate) {
                        updateData.recordDate = data.transactionDate;
                        logChanges.push({ fieldName: '日期', oldValue: decryptedOldRecord.recordDate, newValue: data.transactionDate });
                    }
                    else if (data.transactionDate) {
                        updateData.recordDate = data.transactionDate;
                    }
                    if (data.images && data.images.length > 0 && data.images[0] !== decryptedOldRecord.imageUrl) {
                        updateData.imageUrl = data.images[0];
                        logChanges.push({ fieldName: '凭证图片', oldValue: decryptedOldRecord.imageUrl ? '有' : '无', newValue: '已更新' });
                    }
                    else if (data.images && data.images.length > 0) {
                        updateData.imageUrl = data.images[0];
                    }
                    if (data.memberId && data.memberId !== decryptedOldRecord.memberId) {
                        updateData.memberId = data.memberId;
                        logChanges.push({ fieldName: '支出人', oldValue: String(decryptedOldRecord.memberId || '无'), newValue: String(data.memberId) });
                    }
                    else if (data.memberId) {
                        updateData.memberId = data.memberId;
                    }
                    if (data.accountId !== undefined && data.accountId !== decryptedOldRecord.accountId) {
                        updateData.accountId = data.accountId;
                        logChanges.push({ fieldName: '账户', oldValue: decryptedOldRecord.accountId ? String(decryptedOldRecord.accountId) : '无', newValue: data.accountId ? String(data.accountId) : '无' });
                    }
                    else if (data.accountId !== undefined) {
                        updateData.accountId = data.accountId;
                    }
                    if (data.reimbursementStatus !== undefined && data.reimbursementStatus !== decryptedOldRecord.reimbursementStatus) {
                        updateData.reimbursementStatus = data.reimbursementStatus;
                        logChanges.push({ fieldName: '报销状态', oldValue: reimbursementLabel(decryptedOldRecord.reimbursementStatus), newValue: reimbursementLabel(data.reimbursementStatus) });
                    }
                    else if (data.reimbursementStatus !== undefined) {
                        updateData.reimbursementStatus = data.reimbursementStatus;
                    }
                    if (data.pendingType !== undefined) {
                        oldPending = decryptedOldRecord.pendingType || null;
                        newPending = data.pendingType || null;
                        if (newPending !== oldPending) {
                            updateData.pendingType = data.pendingType;
                            if (data.pendingType === null) {
                                updateData.pendingIncludeStats = null;
                            }
                            logChanges.push({ fieldName: '待结状态', oldValue: pendingLabel(oldPending), newValue: pendingLabel(newPending) });
                        }
                        else {
                            updateData.pendingType = data.pendingType;
                        }
                    }
                    if (data.pendingIncludeStats !== undefined)
                        updateData.pendingIncludeStats = data.pendingIncludeStats;
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'ledger_records', updateData, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 18:
                    encryptedUpdateData = _a.sent();
                    // 更新记录
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerRecords)
                            .set(encryptedUpdateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, recordId))];
                case 19:
                    // 更新记录
                    _a.sent();
                    if (!(logChanges.length > 0)) return [3 /*break*/, 24];
                    console.log('[updateTransaction] 准备写入日志, logChanges数量:', logChanges.length, 'recordId:', recordId, 'ledgerId:', oldRecord.ledgerId, 'userId:', userId);
                    _i = 0, logChanges_1 = logChanges;
                    _a.label = 20;
                case 20:
                    if (!(_i < logChanges_1.length)) return [3 /*break*/, 23];
                    change = logChanges_1[_i];
                    return [4 /*yield*/, insertRecordLog({
                            recordId: recordId,
                            ledgerId: oldRecord.ledgerId,
                            operatorId: userId,
                            action: 'edit',
                            fieldName: change.fieldName,
                            oldValue: change.oldValue,
                            newValue: change.newValue,
                        })];
                case 21:
                    _a.sent();
                    _a.label = 22;
                case 22:
                    _i++;
                    return [3 /*break*/, 20];
                case 23: return [3 /*break*/, 25];
                case 24:
                    console.log('[updateTransaction] 没有字段变化，不写入日志');
                    _a.label = 25;
                case 25: return [2 /*return*/, { success: true }];
            }
        });
    });
}
// ==================== 审批相关函数 ====================
/**
 * 获取账本的审批规则列表
 */
function getApprovalRules(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, ledgerApprovalRules, ledgerMembers, ledgers, member, rules;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    _a = _b.sent(), ledgerApprovalRules = _a.ledgerApprovalRules, ledgerMembers = _a.ledgerMembers, ledgers = _a.ledgers;
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(ledgerMembers.userId, userId)))
                            .limit(1)];
                case 3:
                    member = _b.sent();
                    if (member.length === 0 || (member[0].role !== 'owner' && member[0].role !== 'admin')) {
                        throw new Error("只有账本创建人和管理员可以查看审批规则");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.eq)(ledgerApprovalRules.ledgerId, ledgerId))];
                case 4:
                    rules = _b.sent();
                    return [2 /*return*/, rules];
            }
        });
    });
}
/**
 * 保存审批规则
 */
function saveApprovalRules(ledgerId, userId, rules) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, ledgerApprovalRules, ledgerMembers, member, _i, rules_1, rule;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    _a = _b.sent(), ledgerApprovalRules = _a.ledgerApprovalRules, ledgerMembers = _a.ledgerMembers;
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(ledgerMembers.userId, userId)))
                            .limit(1)];
                case 3:
                    member = _b.sent();
                    if (member.length === 0 || (member[0].role !== 'owner' && member[0].role !== 'admin')) {
                        throw new Error("只有账本创建人和管理员可以设置审批规则");
                    }
                    // 删除旧规则
                    return [4 /*yield*/, db
                            .delete(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.eq)(ledgerApprovalRules.ledgerId, ledgerId))];
                case 4:
                    // 删除旧规则
                    _b.sent();
                    _i = 0, rules_1 = rules;
                    _b.label = 5;
                case 5:
                    if (!(_i < rules_1.length)) return [3 /*break*/, 8];
                    rule = rules_1[_i];
                    return [4 /*yield*/, db.insert(ledgerApprovalRules).values({
                            ledgerId: ledgerId,
                            recorderId: rule.recorderId,
                            approverType: rule.approverType,
                            approverIds: rule.approverIds ? JSON.stringify(rule.approverIds) : null,
                            isEnabled: 1,
                            createdBy: userId,
                        })];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 删除审批规则
 */
function deleteApprovalRule(ruleId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, ledgerApprovalRules, ledgers, rule, ledger;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    _a = _b.sent(), ledgerApprovalRules = _a.ledgerApprovalRules, ledgers = _a.ledgers;
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.eq)(ledgerApprovalRules.id, ruleId))
                            .limit(1)];
                case 3:
                    rule = _b.sent();
                    if (rule.length === 0) {
                        throw new Error("规则不存在");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgers)
                            .where((0, drizzle_orm_1.eq)(ledgers.id, rule[0].ledgerId))
                            .limit(1)];
                case 4:
                    ledger = _b.sent();
                    if (ledger.length === 0 || ledger[0].ownerId !== userId) {
                        throw new Error("只有账本创建者可以删除审批规则");
                    }
                    // 删除规则
                    return [4 /*yield*/, db
                            .delete(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.eq)(ledgerApprovalRules.id, ruleId))];
                case 5:
                    // 删除规则
                    _b.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 检查记账是否需要审批
 */
function checkNeedApproval(ledgerId, recorderId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledgerApprovalRules, specificRule, defaultRule;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    ledgerApprovalRules = (_a.sent()).ledgerApprovalRules;
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerApprovalRules.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(ledgerApprovalRules.recorderId, recorderId), (0, drizzle_orm_1.eq)(ledgerApprovalRules.isEnabled, 1)))
                            .limit(1)];
                case 3:
                    specificRule = _a.sent();
                    if (specificRule.length > 0) {
                        return [2 /*return*/, {
                                needApproval: true,
                                rule: specificRule[0],
                            }];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerApprovalRules)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerApprovalRules.ledgerId, ledgerId), (0, drizzle_orm_1.isNull)(ledgerApprovalRules.recorderId), (0, drizzle_orm_1.eq)(ledgerApprovalRules.isEnabled, 1)))
                            .limit(1)];
                case 4:
                    defaultRule = _a.sent();
                    if (defaultRule.length > 0) {
                        return [2 /*return*/, {
                                needApproval: true,
                                rule: defaultRule[0],
                            }];
                    }
                    return [2 /*return*/, {
                            needApproval: false,
                            rule: null,
                        }];
            }
        });
    });
}
/**
 * 创建审批记录
 */
function createApprovalRecords(ledgerId, transactionId, approverIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledgerApprovalRecords, _i, approverIds_1, approverId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    ledgerApprovalRecords = (_a.sent()).ledgerApprovalRecords;
                    _i = 0, approverIds_1 = approverIds;
                    _a.label = 3;
                case 3:
                    if (!(_i < approverIds_1.length)) return [3 /*break*/, 6];
                    approverId = approverIds_1[_i];
                    return [4 /*yield*/, db.insert(ledgerApprovalRecords).values({
                            ledgerId: ledgerId,
                            transactionId: transactionId,
                            approverId: approverId,
                            status: 'pending',
                        })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 审批记账
 */
function approveTransaction(transactionId, userId, action, comment) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, ledgerApprovalRecords, transactions, allRecords, allApproved, anyRejected;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    _a = _b.sent(), ledgerApprovalRecords = _a.ledgerApprovalRecords, transactions = _a.transactions;
                    // 更新审批记录
                    return [4 /*yield*/, db
                            .update(ledgerApprovalRecords)
                            .set({
                            status: action,
                            comment: comment || null,
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerApprovalRecords.transactionId, transactionId), (0, drizzle_orm_1.eq)(ledgerApprovalRecords.approverId, userId)))];
                case 3:
                    // 更新审批记录
                    _b.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerApprovalRecords)
                            .where((0, drizzle_orm_1.eq)(ledgerApprovalRecords.transactionId, transactionId))];
                case 4:
                    allRecords = _b.sent();
                    allApproved = allRecords.every(function (r) { return r.status === 'approved'; });
                    anyRejected = allRecords.some(function (r) { return r.status === 'rejected'; });
                    if (!allApproved) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .update(transactions)
                            .set({ approvalStatus: 'approved' })
                            .where((0, drizzle_orm_1.eq)(transactions.id, transactionId))];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 6:
                    if (!anyRejected) return [3 /*break*/, 8];
                    return [4 /*yield*/, db
                            .update(transactions)
                            .set({ approvalStatus: 'rejected' })
                            .where((0, drizzle_orm_1.eq)(transactions.id, transactionId))];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8: return [2 /*return*/, { success: true, allApproved: allApproved, anyRejected: anyRejected }];
            }
        });
    });
}
/**
 * 获取待审批的记账列表
 */
function getPendingApprovals(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, ledgerApprovalRecords, transactions, records;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 2:
                    _a = _b.sent(), ledgerApprovalRecords = _a.ledgerApprovalRecords, transactions = _a.transactions;
                    return [4 /*yield*/, db
                            .select({
                            id: ledgerApprovalRecords.id,
                            transactionId: ledgerApprovalRecords.transactionId,
                            status: ledgerApprovalRecords.status,
                            comment: ledgerApprovalRecords.comment,
                            createdAt: ledgerApprovalRecords.createdAt,
                            transaction: transactions,
                        })
                            .from(ledgerApprovalRecords)
                            .leftJoin(transactions, (0, drizzle_orm_1.eq)(ledgerApprovalRecords.transactionId, transactions.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerApprovalRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(ledgerApprovalRecords.approverId, userId), (0, drizzle_orm_1.eq)(ledgerApprovalRecords.status, 'pending')))];
                case 3:
                    records = _b.sent();
                    return [2 /*return*/, records];
            }
        });
    });
}
/**
 * 设置成员角色（仅owner可操作）
 * 重写版本：使用targetUserId而不是memberId来标识目标成员
 */
function setMemberRole(ledgerId, operatorUserId, targetUserId, role) {
    return __awaiter(this, void 0, void 0, function () {
        var db, operatorRows, targetRows, targetMember;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    console.log('[setMemberRole] 调用参数:', { ledgerId: ledgerId, operatorUserId: operatorUserId, targetUserId: targetUserId, role: role });
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, operatorUserId)))
                            .limit(1)];
                case 2:
                    operatorRows = _a.sent();
                    console.log('[setMemberRole] 操作者查询结果:', operatorRows);
                    if (operatorRows.length === 0 || operatorRows[0].role !== 'owner') {
                        throw new Error('只有账本所有者可以设置管理员');
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, targetUserId)))
                            .limit(1)];
                case 3:
                    targetRows = _a.sent();
                    console.log('[setMemberRole] 目标成员查询结果:', targetRows);
                    if (targetRows.length === 0) {
                        throw new Error('目标成员不存在于该账本中');
                    }
                    targetMember = targetRows[0];
                    // 第3步：不能修改owner的角色
                    if (targetMember.role === 'owner') {
                        throw new Error('不能修改所有者的角色');
                    }
                    // 第4步：更新角色（通过记录的主键id更新）
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerMembers)
                            .set({ role: role })
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, targetMember.id))];
                case 4:
                    // 第4步：更新角色（通过记录的主键id更新）
                    _a.sent();
                    console.log('[setMemberRole] 角色更新成功:', { targetMemberId: targetMember.id, newRole: role });
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 管理报销（管理员/owner操作）
 */
function manageReimbursement(recordId, userId, status, notes, voucherImage) {
    return __awaiter(this, void 0, void 0, function () {
        var db, record, member, voucherUrl, uploadImageToCOS, oldStatus, updateData, historyData, encryptedHistoryData, reimbursementHistory;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[manageReimbursement] 开始执行', { recordId: recordId, userId: userId, status: status, notes: notes, hasVoucherImage: !!voucherImage });
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, recordId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    record = _a.sent();
                    if (!record) {
                        console.log('[manageReimbursement] 账目不存在', recordId);
                        throw new Error('账目不存在');
                    }
                    console.log('[manageReimbursement] 找到账目', { recordId: recordId, ledgerId: record.ledgerId, currentStatus: record.reimbursementStatus });
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, record.ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 3:
                    member = _a.sent();
                    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
                        console.log('[manageReimbursement] 权限不足', { userId: userId, memberRole: member === null || member === void 0 ? void 0 : member.role });
                        throw new Error('只有管理员和所有者可以管理报销');
                    }
                    console.log('[manageReimbursement] 权限验证通过', { userId: userId, role: member.role });
                    voucherUrl = record.reimbursementVoucherUrl;
                    if (!voucherImage) return [3 /*break*/, 6];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./cos-upload'); })];
                case 4:
                    uploadImageToCOS = (_a.sent()).uploadImageToCOS;
                    return [4 /*yield*/, uploadImageToCOS(voucherImage, 'reimbursement-vouchers')];
                case 5:
                    voucherUrl = _a.sent();
                    _a.label = 6;
                case 6:
                    oldStatus = record.reimbursementStatus;
                    updateData = {
                        reimbursementStatus: status,
                        reimbursementNotes: notes || record.reimbursementNotes,
                    };
                    if (voucherUrl) {
                        updateData.reimbursementVoucherUrl = voucherUrl;
                    }
                    if (status === 'completed') {
                        updateData.reimbursedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        updateData.reimbursedBy = userId;
                    }
                    console.log('[manageReimbursement] 准备更新数据库', { recordId: recordId, updateData: updateData });
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerRecords)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, recordId))];
                case 7:
                    _a.sent();
                    console.log('[manageReimbursement] 数据库更新成功');
                    historyData = {
                        recordId: recordId,
                        ledgerId: record.ledgerId,
                        operatedBy: userId,
                        action: status === 'completed' ? 'mark_completed' : (status === 'pending' ? 'mark_pending' : 'update'),
                        oldStatus: oldStatus,
                        newStatus: status,
                        notes: notes || null,
                        voucherUrl: voucherUrl || null,
                    };
                    return [4 /*yield*/, (0, encryption_1.encryptFields)(db, 'reimbursement_history', historyData, REIMBURSEMENT_ENCRYPT_FIELDS)];
                case 8:
                    encryptedHistoryData = _a.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 9:
                    reimbursementHistory = (_a.sent()).reimbursementHistory;
                    return [4 /*yield*/, db.insert(reimbursementHistory).values(encryptedHistoryData)];
                case 10:
                    _a.sent();
                    console.log('[manageReimbursement] 完成所有操作', { recordId: recordId, newStatus: status });
                    return [2 /*return*/, {
                            success: true,
                            voucherUrl: voucherUrl || undefined
                        }];
            }
        });
    });
}
/**
 * 获取报销历史
 */
function getReimbursementHistory(recordId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, record, member, reimbursementHistory, history, decryptedHistory;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.id, recordId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    record = _a.sent();
                    if (!record) {
                        throw new Error('账目不存在');
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, record.ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 3:
                    member = _a.sent();
                    if (!member) {
                        throw new Error('无权查看此账目');
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema.js"); })];
                case 4:
                    reimbursementHistory = (_a.sent()).reimbursementHistory;
                    return [4 /*yield*/, db
                            .select({
                            id: reimbursementHistory.id,
                            operatedBy: reimbursementHistory.operatedBy,
                            action: reimbursementHistory.action,
                            oldStatus: reimbursementHistory.oldStatus,
                            newStatus: reimbursementHistory.newStatus,
                            notes: reimbursementHistory.notes,
                            voucherUrl: reimbursementHistory.voucherUrl,
                            createdAt: reimbursementHistory.createdAt,
                            operatorName: schema_1.users.username,
                            operatorNickname: schema_1.ledgerMembers.nickname,
                        })
                            .from(reimbursementHistory)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(reimbursementHistory.operatedBy, schema_1.users.id))
                            .leftJoin(schema_1.ledgerMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, reimbursementHistory.operatedBy), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, record.ledgerId)))
                            .where((0, drizzle_orm_1.eq)(reimbursementHistory.recordId, recordId))
                            .orderBy((0, drizzle_orm_1.desc)(reimbursementHistory.createdAt))];
                case 5:
                    history = _a.sent();
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'reimbursement_history', history, REIMBURSEMENT_ENCRYPT_FIELDS)];
                case 6:
                    decryptedHistory = _a.sent();
                    // 格式化返回数据
                    return [2 /*return*/, decryptedHistory.map(function (h) { return ({
                            id: h.id,
                            operatedBy: h.operatorNickname || h.operatorName || '未知',
                            action: h.action,
                            oldStatus: h.oldStatus,
                            newStatus: h.newStatus,
                            notes: h.notes,
                            voucherUrl: h.voucherUrl,
                            createdAt: h.createdAt,
                        }); })];
            }
        });
    });
}
/**
 * 获取报销统计
 */
function getReimbursementStats(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, pendingStats, completedStats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)
                            .then(function (rows) { return rows[0]; })];
                case 2:
                    member = _a.sent();
                    if (!member) {
                        throw new Error('无权查看此账本');
                    }
                    return [4 /*yield*/, db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_99 || (templateObject_99 = __makeTemplateObject(["count(*)"], ["count(*)"]))),
                            amount: (0, drizzle_orm_1.sql)(templateObject_100 || (templateObject_100 = __makeTemplateObject(["sum(", ")"], ["sum(", ")"])), schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.reimbursementStatus, 'pending'), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .then(function (rows) { return rows[0]; })];
                case 3:
                    pendingStats = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_101 || (templateObject_101 = __makeTemplateObject(["count(*)"], ["count(*)"]))),
                            amount: (0, drizzle_orm_1.sql)(templateObject_102 || (templateObject_102 = __makeTemplateObject(["sum(", ")"], ["sum(", ")"])), schema_1.ledgerRecords.amount),
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.reimbursementStatus, 'completed'), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .then(function (rows) { return rows[0]; })];
                case 4:
                    completedStats = _a.sent();
                    return [2 /*return*/, {
                            pending: {
                                count: (pendingStats === null || pendingStats === void 0 ? void 0 : pendingStats.count) || 0,
                                amount: Number((pendingStats === null || pendingStats === void 0 ? void 0 : pendingStats.amount) || 0),
                            },
                            completed: {
                                count: (completedStats === null || completedStats === void 0 ? void 0 : completedStats.count) || 0,
                                amount: Number((completedStats === null || completedStats === void 0 ? void 0 : completedStats.amount) || 0),
                            },
                        }];
            }
        });
    });
}
/**
 * 获取账本所有带图片的记录
 * 完全参照 getTransactionsList 的实现方式
 */
function getLedgerImages(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, records, decryptedRecords, recordsWithImages, categoryIds, categories, categoryNameMap;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerRecords.id,
                            type: schema_1.ledgerRecords.type,
                            amount: schema_1.ledgerRecords.amount,
                            categoryId: schema_1.ledgerRecords.categoryId,
                            description: schema_1.ledgerRecords.description,
                            date: schema_1.ledgerRecords.recordDate,
                            createdBy: schema_1.ledgerRecords.createdBy,
                            createdAt: schema_1.ledgerRecords.createdAt,
                            imageUrl: schema_1.ledgerRecords.imageUrl,
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerRecords.recordDate), (0, drizzle_orm_1.desc)(schema_1.ledgerRecords.createdAt))
                            .limit(500)];
                case 3:
                    records = _a.sent();
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'ledger_records', records, LEDGER_RECORD_ENCRYPT_FIELDS)];
                case 4:
                    decryptedRecords = _a.sent();
                    recordsWithImages = decryptedRecords.filter(function (record) {
                        return record.imageUrl && String(record.imageUrl).trim() !== '';
                    });
                    categoryIds = new Set();
                    recordsWithImages.forEach(function (r) {
                        if (r.categoryId)
                            categoryIds.add(r.categoryId);
                    });
                    categories = [];
                    if (!(categoryIds.size > 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerCategories.id,
                            name: schema_1.ledgerCategories.name,
                        })
                            .from(schema_1.ledgerCategories)
                            .where((0, drizzle_orm_1.sql)(templateObject_105 || (templateObject_105 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), schema_1.ledgerCategories.id, drizzle_orm_1.sql.join(Array.from(categoryIds).map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_103 || (templateObject_103 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_104 || (templateObject_104 = __makeTemplateObject([", "], [", "]))))))];
                case 5:
                    categories = _a.sent();
                    _a.label = 6;
                case 6:
                    categoryNameMap = new Map(categories.map(function (c) { return [c.id, c.name]; }));
                    return [2 /*return*/, recordsWithImages.map(function (record) { return ({
                            id: record.id,
                            amount: Number(record.amount),
                            type: record.type,
                            category: categoryNameMap.get(record.categoryId) || '未分类',
                            description: record.description,
                            imageUrl: record.imageUrl,
                            date: record.date,
                        }); })];
            }
        });
    });
}
/**
 * 获取账本导出统计信息
 */
function getLedgerExportStats(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, ledger, records, decryptedRecords, totalRecords, totalIncome, totalExpense, earliestDate, latestDate;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 3:
                    ledger = _a.sent();
                    if (ledger.length === 0) {
                        throw new Error("账本不存在");
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerRecords.id,
                            type: schema_1.ledgerRecords.type,
                            amount: schema_1.ledgerRecords.amount,
                            recordDate: schema_1.ledgerRecords.recordDate,
                        })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                        // 解密金额字段
                    ];
                case 4:
                    records = _a.sent();
                    return [4 /*yield*/, (0, encryption_1.decryptFieldsArray)(db, 'ledger_records', records, ['amount'])];
                case 5:
                    decryptedRecords = _a.sent();
                    totalRecords = decryptedRecords.length;
                    totalIncome = 0;
                    totalExpense = 0;
                    earliestDate = null;
                    latestDate = null;
                    decryptedRecords.forEach(function (record) {
                        var amount = parseFloat(record.amount || '0');
                        if (record.type === 'income') {
                            totalIncome += amount;
                        }
                        else if (record.type === 'expense') {
                            totalExpense += amount;
                        }
                        var recordDate = record.recordDate;
                        if (recordDate) {
                            if (!earliestDate || recordDate < earliestDate) {
                                earliestDate = recordDate;
                            }
                            if (!latestDate || recordDate > latestDate) {
                                latestDate = recordDate;
                            }
                        }
                    });
                    return [2 /*return*/, {
                            ledgerName: ledger[0].name,
                            totalRecords: totalRecords,
                            totalIncome: totalIncome.toFixed(2),
                            totalExpense: totalExpense.toFixed(2),
                            balance: (totalIncome - totalExpense).toFixed(2),
                            earliestDate: earliestDate,
                            latestDate: latestDate,
                        }];
            }
        });
    });
}
/**
 * 转移账本创建人（所有权转移）
 * 将当前owner的角色降为admin，将目标成员提升为owner
 * 同时更新ledgers表的ownerId和createdBy
 */
function transferOwnership(ledgerId, currentOwnerId, newOwnerId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownerRows, targetRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, currentOwnerId)))
                            .limit(1)];
                case 2:
                    ownerRows = _a.sent();
                    if (ownerRows.length === 0 || ownerRows[0].role !== 'owner') {
                        throw new Error('只有账本创建人才能转移所有权');
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, newOwnerId)))
                            .limit(1)];
                case 3:
                    targetRows = _a.sent();
                    if (targetRows.length === 0) {
                        throw new Error('目标用户不是该账本的成员');
                    }
                    if (targetRows[0].userId === currentOwnerId) {
                        throw new Error('不能转移给自己');
                    }
                    // 将当前owner降为admin
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerMembers)
                            .set({ role: 'admin' })
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, ownerRows[0].id))];
                case 4:
                    // 将当前owner降为admin
                    _a.sent();
                    // 将目标成员提升为owner，并赋予全部权限
                    return [4 /*yield*/, db
                            .update(schema_1.ledgerMembers)
                            .set({
                            role: 'owner',
                            permissionView: 'all',
                            permissionAdd: 'all',
                            permissionEdit: 'all',
                            permissionDelete: 'all',
                            canEdit: 1,
                            canDelete: 1,
                            canInvite: 1,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.id, targetRows[0].id))];
                case 5:
                    // 将目标成员提升为owner，并赋予全部权限
                    _a.sent();
                    // 更新ledgers表的ownerId
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_106 || (templateObject_106 = __makeTemplateObject(["UPDATE ledgers SET ownerId = ", " WHERE id = ", ""], ["UPDATE ledgers SET ownerId = ", " WHERE id = ", ""])), newOwnerId, ledgerId))];
                case 6:
                    // 更新ledgers表的ownerId
                    _a.sent();
                    console.log('[transferOwnership] 所有权转移成功:', {
                        ledgerId: ledgerId,
                        from: currentOwnerId,
                        to: newOwnerId,
                    });
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取或生成账本密钥（Web3风格的长密钥）
 * 密钥存储在数据库中，如果不存在则自动生成
 */
function getLedgerSecretKey(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, memberRows, e_13, result, rows, existingKey, crypto, randomBytes, secretKey;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    memberRows = _c.sent();
                    if (memberRows.length === 0) {
                        throw new Error('您不是该账本的成员');
                    }
                    if (memberRows[0].role !== 'owner' && memberRows[0].role !== 'admin') {
                        throw new Error('只有管理员或创建人可以查看账本密钥');
                    }
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_107 || (templateObject_107 = __makeTemplateObject(["ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL"], ["ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL"]))))];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    e_13 = _c.sent();
                    if (!((_a = e_13.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column'))) {
                        console.error('[getLedgerSecretKey] add column error:', e_13.message);
                    }
                    return [3 /*break*/, 6];
                case 6: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_108 || (templateObject_108 = __makeTemplateObject(["SELECT secret_key FROM ledgers WHERE id = ", ""], ["SELECT secret_key FROM ledgers WHERE id = ", ""])), ledgerId))];
                case 7:
                    result = _c.sent();
                    rows = result[0] || result;
                    existingKey = Array.isArray(rows) ? (_b = rows[0]) === null || _b === void 0 ? void 0 : _b.secret_key : null;
                    if (existingKey) {
                        return [2 /*return*/, { secretKey: existingKey }];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('crypto'); })];
                case 8:
                    crypto = _c.sent();
                    randomBytes = crypto.randomBytes(32);
                    secretKey = '0x' + randomBytes.toString('hex');
                    // 保存到数据库
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_109 || (templateObject_109 = __makeTemplateObject(["UPDATE ledgers SET secret_key = ", " WHERE id = ", ""], ["UPDATE ledgers SET secret_key = ", " WHERE id = ", ""])), secretKey, ledgerId))];
                case 9:
                    // 保存到数据库
                    _c.sent();
                    console.log('[getLedgerSecretKey] 生成新密钥:', { ledgerId: ledgerId });
                    return [2 /*return*/, { secretKey: secretKey }];
            }
        });
    });
}
/**
 * 通过密钥加入账本
 */
function joinLedgerBySecretKey(secretKey, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, e_14, result, rows, ledgerRow, ledgerId, existingMember, ledger;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_110 || (templateObject_110 = __makeTemplateObject(["ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL"], ["ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL"]))))];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_14 = _b.sent();
                    if (!((_a = e_14.message) === null || _a === void 0 ? void 0 : _a.includes('Duplicate column'))) {
                        // ignore
                    }
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_111 || (templateObject_111 = __makeTemplateObject(["SELECT id, name FROM ledgers WHERE secret_key = ", ""], ["SELECT id, name FROM ledgers WHERE secret_key = ", ""])), secretKey))];
                case 6:
                    result = _b.sent();
                    rows = result[0] || result;
                    ledgerRow = Array.isArray(rows) ? rows[0] : null;
                    if (!ledgerRow) {
                        throw new Error('无效的账本密钥，请检查后重试');
                    }
                    ledgerId = ledgerRow.id;
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 7:
                    existingMember = _b.sent();
                    if (existingMember.length > 0) {
                        throw new Error('您已经是该账本的成员');
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgers)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))
                            .limit(1)];
                case 8:
                    ledger = _b.sent();
                    if (ledger.length > 0 && ledger[0].isArchived) {
                        throw new Error('该账本已封存，无法加入');
                    }
                    // 添加用户为账本成员
                    return [4 /*yield*/, db.insert(schema_1.ledgerMembers).values({
                            ledgerId: ledgerId,
                            userId: userId,
                            role: "member",
                            memberType: "real",
                            permissionView: "all",
                            permissionAdd: "all",
                            permissionEdit: "own",
                            permissionDelete: "own",
                        })];
                case 9:
                    // 添加用户为账本成员
                    _b.sent();
                    console.log('[joinLedgerBySecretKey] 用户通过密钥加入账本:', { userId: userId, ledgerId: ledgerId });
                    return [2 /*return*/, { ledgerId: ledgerId, ledgerName: ledgerRow.name }];
            }
        });
    });
}
/**
 * 检查用户是否有备份账本的权限
 */
function checkBackupPermission(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, db
                            .select({
                            permissionBackup: schema_1.ledgerMembers.permissionBackup,
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _a.sent();
                    if (membership.length === 0) {
                        return [2 /*return*/, false]; // 不是账本成员
                    }
                    // owner 始终有备份权限
                    if (membership[0].role === 'owner') {
                        return [2 /*return*/, true];
                    }
                    // 检查备份权限字段
                    return [2 /*return*/, membership[0].permissionBackup === 'allow'];
            }
        });
    });
}
/**
 * 更新账本功能设置
 */
function updateLedgerFeatures(ledgerId, userId, features) {
    return __awaiter(this, void 0, void 0, function () {
        var db, membership, updateData, reimbursementRecords, countResult, count, pendingRecords, countResult, count;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("数据库连接失败");
                    return [4 /*yield*/, db
                            .select({
                            role: schema_1.ledgerMembers.role,
                        })
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    membership = _c.sent();
                    if (membership.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    if (membership[0].role !== 'owner' && membership[0].role !== 'admin') {
                        throw new Error("只有账本创建人或管理员才能修改功能设置");
                    }
                    updateData = {};
                    if (!(features.enableReimbursement !== undefined)) return [3 /*break*/, 6];
                    if (!(features.enableReimbursement === false)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.ledgerRecords.id })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.reimbursementStatus, 'pending'), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)];
                case 3:
                    reimbursementRecords = _c.sent();
                    if (!(reimbursementRecords.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_112 || (templateObject_112 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.reimbursementStatus, 'pending'), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))];
                case 4:
                    countResult = _c.sent();
                    count = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    throw new Error("\u5F53\u524D\u8D26\u672C\u4E2D\u8FD8\u6709 ".concat(count, " \u7B14\u5F85\u62A5\u9500\u8D26\u76EE\uFF0C\u8BF7\u5148\u5904\u7406\u5B8C\u6BD5\u540E\u518D\u5173\u95ED\u62A5\u9500\u529F\u80FD"));
                case 5:
                    updateData.enableReimbursement = features.enableReimbursement ? 1 : 0;
                    _c.label = 6;
                case 6:
                    if (!(features.enablePending !== undefined)) return [3 /*break*/, 10];
                    if (!(features.enablePending === false)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.ledgerRecords.id })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.isNotNull)(schema_1.ledgerRecords.pendingType), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .limit(1)];
                case 7:
                    pendingRecords = _c.sent();
                    if (!(pendingRecords.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_113 || (templateObject_113 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.ledgerRecords)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledgerId), (0, drizzle_orm_1.isNotNull)(schema_1.ledgerRecords.pendingType), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))];
                case 8:
                    countResult = _c.sent();
                    count = ((_b = countResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
                    throw new Error("\u5F53\u524D\u8D26\u672C\u4E2D\u8FD8\u6709 ".concat(count, " \u7B14\u5F85\u7ED3\u8D26\u76EE\uFF0C\u8BF7\u5148\u5904\u7406\u5B8C\u6BD5\u540E\u518D\u5173\u95ED\u5F85\u7ED3\u529F\u80FD"));
                case 9:
                    updateData.enablePending = features.enablePending ? 1 : 0;
                    _c.label = 10;
                case 10:
                    if (features.pendingDefaultIncludeStats !== undefined) {
                        updateData.pendingDefaultIncludeStats = features.pendingDefaultIncludeStats;
                    }
                    if (features.requireImage !== undefined) {
                        updateData.requireImage = features.requireImage ? 1 : 0;
                    }
                    // 更新账本功能设置
                    return [4 /*yield*/, db
                            .update(schema_1.ledgers)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.ledgers.id, ledgerId))];
                case 11:
                    // 更新账本功能设置
                    _c.sent();
                    console.log('[updateLedgerFeatures] 账本功能设置已更新:', { ledgerId: ledgerId, features: features });
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户所有账本中的待结账目（按账本分组）
 */
function getAllPendingTransactions(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, userLedgers, result, _i, userLedgers_1, ledger, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select({
                            ledgerId: schema_1.ledgerMembers.ledgerId,
                            ledgerName: schema_1.ledgers.name,
                        })
                            .from(schema_1.ledgerMembers)
                            .innerJoin(schema_1.ledgers, (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, schema_1.ledgers.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId), (0, drizzle_orm_1.eq)(schema_1.ledgers.isArchived, 0)))];
                case 2:
                    userLedgers = _a.sent();
                    if (userLedgers.length === 0) {
                        return [2 /*return*/, []];
                    }
                    result = [];
                    _i = 0, userLedgers_1 = userLedgers;
                    _a.label = 3;
                case 3:
                    if (!(_i < userLedgers_1.length)) return [3 /*break*/, 6];
                    ledger = userLedgers_1[_i];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.ledgerRecords.id,
                            description: schema_1.ledgerRecords.description,
                            amount: schema_1.ledgerRecords.amount,
                            type: schema_1.ledgerRecords.type,
                            pendingType: schema_1.ledgerRecords.pendingType,
                            pendingIncludeStats: schema_1.ledgerRecords.pendingIncludeStats,
                            recordDate: schema_1.ledgerRecords.recordDate,
                            categoryId: schema_1.ledgerRecords.categoryId,
                            categoryName: schema_1.ledgerCategories.name,
                            categoryIcon: schema_1.ledgerCategories.icon,
                            createdBy: schema_1.ledgerRecords.createdBy,
                            creatorName: schema_1.users.username,
                            creatorAvatar: schema_1.users.avatar,
                        })
                            .from(schema_1.ledgerRecords)
                            .leftJoin(schema_1.ledgerCategories, (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.categoryId, schema_1.ledgerCategories.id))
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.createdBy, schema_1.users.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, ledger.ledgerId), (0, drizzle_orm_1.isNotNull)(schema_1.ledgerRecords.pendingType), (0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerRecords.recordDate))];
                case 4:
                    rows = _a.sent();
                    if (rows.length > 0) {
                        result.push({
                            ledgerId: ledger.ledgerId,
                            ledgerName: ledger.ledgerName,
                            transactions: rows.map(function (r) {
                                var _a, _b, _c, _d, _e;
                                return ({
                                    id: r.id,
                                    description: r.description || "",
                                    amount: Number(r.amount),
                                    type: r.type,
                                    pendingType: r.pendingType,
                                    pendingIncludeStats: (_a = r.pendingIncludeStats) !== null && _a !== void 0 ? _a : 1,
                                    recordDate: r.recordDate,
                                    categoryId: r.categoryId,
                                    categoryName: (_b = r.categoryName) !== null && _b !== void 0 ? _b : null,
                                    categoryIcon: (_c = r.categoryIcon) !== null && _c !== void 0 ? _c : null,
                                    createdBy: r.createdBy,
                                    creatorName: (_d = r.creatorName) !== null && _d !== void 0 ? _d : null,
                                    creatorAvatar: (_e = r.creatorAvatar) !== null && _e !== void 0 ? _e : null,
                                });
                            }),
                        });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, result];
            }
        });
    });
}
// ==================== 账目修改记录日志 ====================
/**
 * 写入账目修改日志（单条字段变更）
 */
function insertRecordLog(params) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, e_15;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 3, , 4]);
                    console.log('[insertRecordLog] 开始写入日志:', JSON.stringify(params));
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _e.sent();
                    if (!conn) {
                        console.error('[insertRecordLog] 数据库连接失败');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, conn.execute("INSERT INTO ledger_record_logs (record_id, ledger_id, operator_id, action, field_name, old_value, new_value, note, created_at)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+08:00'))", [
                            params.recordId,
                            params.ledgerId,
                            params.operatorId,
                            params.action,
                            (_a = params.fieldName) !== null && _a !== void 0 ? _a : null,
                            (_b = params.oldValue) !== null && _b !== void 0 ? _b : null,
                            (_c = params.newValue) !== null && _c !== void 0 ? _c : null,
                            (_d = params.note) !== null && _d !== void 0 ? _d : null,
                        ])];
                case 2:
                    _e.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_15 = _e.sent();
                    console.error('[insertRecordLog] 写入日志失败:', e_15.message);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 查询账目的修改记录日志
 */
function getRecordLogs(recordId, ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, conn, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Ledger database connection failed");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    member = _a.sent();
                    if (member.length === 0)
                        throw new Error("您不是该账本的成员");
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 3:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("数据库连接失败");
                    return [4 /*yield*/, conn.execute("SELECT l.id, l.record_id, l.ledger_id, l.operator_id, l.action, l.field_name, l.old_value, l.new_value, l.note, l.created_at,\n            u.username as operator_name, u.avatar as operator_avatar\n     FROM ledger_record_logs l\n     LEFT JOIN users u ON l.operator_id = u.id\n     WHERE l.record_id = ? AND l.ledger_id = ?\n     ORDER BY l.created_at DESC", [recordId, ledgerId])];
                case 4:
                    rows = (_a.sent())[0];
                    return [2 /*return*/, rows.map(function (r) {
                            // created_at 已经是北京时间，直接格式化为字符串，不要用 toISOString()（会转换为UTC）
                            var createdAtStr = '';
                            if (r.created_at instanceof Date) {
                                var d = r.created_at;
                                // 数据库返回的Date对象可能被mysql2解析为本地时间，直接取各分量
                                createdAtStr = "".concat(d.getFullYear(), "-").concat(String(d.getMonth() + 1).padStart(2, '0'), "-").concat(String(d.getDate()).padStart(2, '0'), " ").concat(String(d.getHours()).padStart(2, '0'), ":").concat(String(d.getMinutes()).padStart(2, '0'), ":").concat(String(d.getSeconds()).padStart(2, '0'));
                            }
                            else {
                                createdAtStr = String(r.created_at);
                            }
                            return {
                                id: r.id,
                                recordId: r.record_id,
                                ledgerId: r.ledger_id,
                                operatorId: r.operator_id,
                                operatorName: r.operator_name || '未知用户',
                                operatorAvatar: r.operator_avatar || null,
                                action: r.action,
                                fieldName: r.field_name,
                                oldValue: r.old_value,
                                newValue: r.new_value,
                                note: r.note,
                                createdAt: createdAtStr,
                            };
                        })];
            }
        });
    });
}
/**
 * 获取账目的修改记录条数
 */
function getRecordLogCount(recordId, ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, member, conn, rows, e_16;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.ledgerMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ledgerMembers.ledgerId, ledgerId), (0, drizzle_orm_1.eq)(schema_1.ledgerMembers.userId, userId)))
                            .limit(1)];
                case 2:
                    member = _c.sent();
                    if (member.length === 0)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 3:
                    conn = _c.sent();
                    if (!conn)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, conn.execute("SELECT COUNT(*) as cnt FROM ledger_record_logs WHERE record_id = ? AND ledger_id = ?", [recordId, ledgerId])];
                case 4:
                    rows = (_c.sent())[0];
                    return [2 /*return*/, Number((_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.cnt) !== null && _b !== void 0 ? _b : 0)];
                case 5:
                    e_16 = _c.sent();
                    console.error('[getRecordLogCount] 错误:', e_16.message);
                    return [2 /*return*/, 0];
                case 6: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76, templateObject_77, templateObject_78, templateObject_79, templateObject_80, templateObject_81, templateObject_82, templateObject_83, templateObject_84, templateObject_85, templateObject_86, templateObject_87, templateObject_88, templateObject_89, templateObject_90, templateObject_91, templateObject_92, templateObject_93, templateObject_94, templateObject_95, templateObject_96, templateObject_97, templateObject_98, templateObject_99, templateObject_100, templateObject_101, templateObject_102, templateObject_103, templateObject_104, templateObject_105, templateObject_106, templateObject_107, templateObject_108, templateObject_109, templateObject_110, templateObject_111, templateObject_112, templateObject_113;
