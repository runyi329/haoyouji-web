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
exports.executeBackup = executeBackup;
exports.checkAndExecuteBackups = checkAndExecuteBackups;
var email_service_1 = require("./email-service");
var dbLedger = require("./db-ledger");
var db_1 = require("./db");
var exceljs_1 = require("exceljs");
/**
 * 执行单个账本的备份并发送邮件
 *
 * 直接复用 dbLedger 中已有的函数获取数据，
 * 复用 routers.ts 中 exportToExcel 的模式生成 Excel。
 */
function executeBackup(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var ledgerInfo, db, users, eq, userRows, userEmail, transactions, workbook, worksheet, rowCount, totalIncome, totalExpense, earliestDate, latestDate, buffer, balance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[executeBackup] 开始执行备份:', { ledgerId: ledgerId, userId: userId });
                    return [4 /*yield*/, dbLedger.getLedgerById(ledgerId, userId)];
                case 1:
                    ledgerInfo = _a.sent();
                    console.log('[executeBackup] 获取账本信息成功:', { name: ledgerInfo.name });
                    return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
                case 3:
                    users = (_a.sent()).users;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                case 4:
                    eq = (_a.sent()).eq;
                    return [4 /*yield*/, db
                            .select({ id: users.id, email: users.email })
                            .from(users)
                            .where(eq(users.id, userId))
                            .limit(1)];
                case 5:
                    userRows = _a.sent();
                    if (userRows.length === 0 || !userRows[0].email) {
                        throw new Error('用户邮箱未设置，请先在个人资料中填写邮箱地址');
                    }
                    userEmail = userRows[0].email;
                    console.log('[executeBackup] 用户邮箱:', userEmail);
                    return [4 /*yield*/, dbLedger.getTransactionsList(ledgerId, userId, { limit: 10000 })];
                case 6:
                    transactions = _a.sent();
                    console.log('[executeBackup] 获取到账目数据:', { dayGroups: transactions.length });
                    workbook = new exceljs_1.default.Workbook();
                    worksheet = workbook.addWorksheet('账目明细');
                    // 设置列（与 exportToExcel 完全一致）
                    worksheet.columns = [
                        { header: '日期', key: 'date', width: 15 },
                        { header: '类型', key: 'type', width: 10 },
                        { header: '分类', key: 'category', width: 15 },
                        { header: '金额', key: 'amount', width: 15 },
                        { header: '备注', key: 'description', width: 30 },
                        { header: '创建人', key: 'creator', width: 15 },
                    ];
                    rowCount = 0;
                    totalIncome = 0;
                    totalExpense = 0;
                    earliestDate = '';
                    latestDate = '';
                    transactions.forEach(function (dayGroup) {
                        // 记录日期范围
                        if (!earliestDate || dayGroup.date < earliestDate) {
                            earliestDate = dayGroup.date;
                        }
                        if (!latestDate || dayGroup.date > latestDate) {
                            latestDate = dayGroup.date;
                        }
                        dayGroup.records.forEach(function (record) {
                            var _a;
                            worksheet.addRow({
                                date: dayGroup.date,
                                type: record.type === 'income' ? '收入' : '支出',
                                category: record.category || '未分类',
                                amount: record.amount,
                                description: record.description || '',
                                creator: ((_a = record.member) === null || _a === void 0 ? void 0 : _a.username) || '',
                            });
                            rowCount++;
                            // 统计收支
                            var amount = Number(record.amount);
                            if (record.type === 'income') {
                                totalIncome += amount;
                            }
                            else {
                                totalExpense += amount;
                            }
                        });
                    });
                    console.log('[executeBackup] 添加了', rowCount, '条记录');
                    // 设置表头样式
                    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    worksheet.getRow(1).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFD32F2F' },
                    };
                    return [4 /*yield*/, workbook.xlsx.writeBuffer()];
                case 7:
                    buffer = _a.sent();
                    balance = totalIncome - totalExpense;
                    // 5. 发送邮件
                    return [4 /*yield*/, (0, email_service_1.sendBackupEmail)({
                            to: userEmail,
                            ledgerName: ledgerInfo.name,
                            excelBuffer: Buffer.from(buffer),
                            stats: {
                                totalRecords: rowCount,
                                earliestDate: earliestDate || '无记录',
                                latestDate: latestDate || '无记录',
                                totalIncome: totalIncome,
                                totalExpense: totalExpense,
                                balance: balance,
                            },
                        })];
                case 8:
                    // 5. 发送邮件
                    _a.sent();
                    console.log("[executeBackup] \u5907\u4EFD\u90AE\u4EF6\u5DF2\u53D1\u9001: \u8D26\u672C=".concat(ledgerInfo.name, ", \u7528\u6237=").concat(userEmail, ", \u8BB0\u5F55\u6570=").concat(rowCount));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查并执行所有到期的备份任务
 */
function checkAndExecuteBackups() {
    return __awaiter(this, void 0, void 0, function () {
        var db, ledgerBackupSettings, _a, lte, eq, and, sql, now, pad, toMySQL, dueBackups, _i, dueBackups_1, backup, nextBackupAt, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getLedgerDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
                case 2:
                    ledgerBackupSettings = (_b.sent()).ledgerBackupSettings;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                case 3:
                    _a = _b.sent(), lte = _a.lte, eq = _a.eq, and = _a.and, sql = _a.sql;
                    now = new Date();
                    pad = function (n) { return String(n).padStart(2, '0'); };
                    toMySQL = function (d) { return "".concat(d.getFullYear(), "-").concat(pad(d.getMonth() + 1), "-").concat(pad(d.getDate()), " ").concat(pad(d.getHours()), ":").concat(pad(d.getMinutes()), ":").concat(pad(d.getSeconds())); };
                    return [4 /*yield*/, db
                            .select()
                            .from(ledgerBackupSettings)
                            .where(and(eq(ledgerBackupSettings.enabled, 1), lte(ledgerBackupSettings.nextBackupAt, toMySQL(now))))];
                case 4:
                    dueBackups = _b.sent();
                    console.log("[checkAndExecuteBackups] \u627E\u5230 ".concat(dueBackups.length, " \u4E2A\u5230\u671F\u7684\u5907\u4EFD\u4EFB\u52A1"));
                    _i = 0, dueBackups_1 = dueBackups;
                    _b.label = 5;
                case 5:
                    if (!(_i < dueBackups_1.length)) return [3 /*break*/, 11];
                    backup = dueBackups_1[_i];
                    _b.label = 6;
                case 6:
                    _b.trys.push([6, 9, , 10]);
                    return [4 /*yield*/, executeBackup(backup.ledgerId, backup.userId)];
                case 7:
                    _b.sent();
                    nextBackupAt = new Date(now);
                    if (backup.frequency === 'weekly') {
                        nextBackupAt.setDate(now.getDate() + 7);
                    }
                    else if (backup.frequency === 'monthly') {
                        nextBackupAt.setMonth(now.getMonth() + 1);
                    }
                    else if (backup.frequency === 'quarterly') {
                        nextBackupAt.setMonth(now.getMonth() + 3);
                    }
                    // 更新备份记录
                    return [4 /*yield*/, db
                            .update(ledgerBackupSettings)
                            .set({
                            backupCount: sql(templateObject_1 || (templateObject_1 = __makeTemplateObject(["backup_count + 1"], ["backup_count + 1"]))),
                            lastBackupAt: toMySQL(now),
                            nextBackupAt: toMySQL(nextBackupAt),
                        })
                            .where(eq(ledgerBackupSettings.id, backup.id))];
                case 8:
                    // 更新备份记录
                    _b.sent();
                    console.log("[checkAndExecuteBackups] \u5907\u4EFD\u4EFB\u52A1\u5B8C\u6210: ID=".concat(backup.id));
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _b.sent();
                    console.error("[checkAndExecuteBackups] \u5907\u4EFD\u4EFB\u52A1\u5931\u8D25: ID=".concat(backup.id), error_1);
                    return [3 /*break*/, 10];
                case 10:
                    _i++;
                    return [3 /*break*/, 5];
                case 11: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
