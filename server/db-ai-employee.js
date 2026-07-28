"use strict";
/**
 * AI分身任务系统 - 独立于AI助理的DeepSeek对接
 *
 * 职责：解析用户自然语言任务描述，生成结构化记账方案
 * 与AI助理的区别：
 *   - AI助理：人脉管理（搜索、添加、修改联系人）
 *   - AI分身：记账任务（解析任务、自动记账、定时执行）
 */
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
exports.parseTaskWithAI = parseTaskWithAI;
exports.createAIEmployeeTask = createAIEmployeeTask;
exports.getAIEmployeeTasks = getAIEmployeeTasks;
exports.updateTaskStatus = updateTaskStatus;
exports.getTaskLogs = getTaskLogs;
exports.stopTaskTimer = stopTaskTimer;
exports.restoreActiveTimers = restoreActiveTimers;
exports.getAIConversationHistory = getAIConversationHistory;
exports.clearAIConversationHistory = clearAIConversationHistory;
exports.chatWithAIEmployee = chatWithAIEmployee;
exports.updateAIEmployeeTask = updateAIEmployeeTask;
exports.getRunningTasksForContext = getRunningTasksForContext;
var db_1 = require("./db");
// ==================== 数据库迁移 ====================
var _aiEmployeeTablesMigrated = false;
function ensureAIEmployeeTables() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, cols, colType, alterErr_1, e_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (_aiEmployeeTablesMigrated)
                        return [2 /*return*/];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 11, , 12]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _c.sent();
                    if (!conn)
                        return [2 /*return*/];
                    // 创建 AI 分身任务表
                    return [4 /*yield*/, conn.execute("\n      CREATE TABLE IF NOT EXISTS ai_employee_tasks (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        ledger_id INT NOT NULL COMMENT '\u8D26\u672CID',\n        user_id INT NOT NULL COMMENT '\u521B\u5EFA\u8005\u7528\u6237ID',\n        task_description TEXT NOT NULL COMMENT '\u7528\u6237\u539F\u59CB\u4EFB\u52A1\u63CF\u8FF0',\n        parsed_plan JSON COMMENT '\u89E3\u6790\u540E\u7684\u4EFB\u52A1\u65B9\u6848',\n        status ENUM('draft','pending','running','paused','stopped','completed') NOT NULL DEFAULT 'pending' COMMENT '\u4EFB\u52A1\u72B6\u6001',\n        schedule_type VARCHAR(30) DEFAULT 'once' COMMENT '\u6267\u884C\u9891\u7387(once/every_minute/every_5_minutes/every_10_minutes/every_30_minutes/every_hour/daily/weekly/monthly)',\n        schedule_detail VARCHAR(255) COMMENT '\u6267\u884C\u65F6\u95F4\u8BE6\u60C5\uFF08\u5982\u6BCF\u5929\u51E0\u70B9\u3001\u6BCF\u6708\u51E0\u53F7\u7B49\uFF09',\n        last_executed_at TIMESTAMP NULL COMMENT '\u4E0A\u6B21\u6267\u884C\u65F6\u95F4',\n        next_execute_at TIMESTAMP NULL COMMENT '\u4E0B\u6B21\u6267\u884C\u65F6\u95F4',\n        execution_count INT DEFAULT 0 COMMENT '\u5DF2\u6267\u884C\u6B21\u6570',\n        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n        INDEX idx_ledger_user (ledger_id, user_id),\n        INDEX idx_status (status),\n        INDEX idx_next_execute (next_execute_at)\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n      COMMENT='AI\u5206\u8EAB\u4EFB\u52A1\u8868'\n    ")];
                case 3:
                    // 创建 AI 分身任务表
                    _c.sent();
                    // 创建 AI 分身任务执行日志表
                    return [4 /*yield*/, conn.execute("\n      CREATE TABLE IF NOT EXISTS ai_employee_task_logs (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        task_id INT NOT NULL COMMENT '\u4EFB\u52A1ID',\n        ledger_id INT NOT NULL COMMENT '\u8D26\u672CID',\n        action_type VARCHAR(50) NOT NULL COMMENT '\u64CD\u4F5C\u7C7B\u578B\uFF08add_transaction\u7B49\uFF09',\n        action_detail JSON COMMENT '\u64CD\u4F5C\u8BE6\u60C5',\n        result_status ENUM('success','failed') NOT NULL COMMENT '\u6267\u884C\u7ED3\u679C',\n        result_message TEXT COMMENT '\u7ED3\u679C\u6D88\u606F',\n        record_id INT COMMENT '\u5173\u8054\u7684\u8BB0\u8D26\u8BB0\u5F55ID',\n        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n        INDEX idx_task_id (task_id),\n        INDEX idx_ledger_id (ledger_id)\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n      COMMENT='AI\u5206\u8EAB\u4EFB\u52A1\u6267\u884C\u65E5\u5FD7'\n    ")];
                case 4:
                    // 创建 AI 分身任务执行日志表
                    _c.sent();
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 9, , 10]);
                    return [4 /*yield*/, conn.execute("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS \n         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_employee_tasks' AND COLUMN_NAME = 'schedule_type'")];
                case 6:
                    cols = (_c.sent())[0];
                    colType = ((_a = cols === null || cols === void 0 ? void 0 : cols[0]) === null || _a === void 0 ? void 0 : _a.COLUMN_TYPE) || '';
                    if (!colType.toLowerCase().startsWith('enum')) return [3 /*break*/, 8];
                    return [4 /*yield*/, conn.execute("ALTER TABLE ai_employee_tasks MODIFY COLUMN schedule_type VARCHAR(30) DEFAULT 'once' COMMENT '\u6267\u884C\u9891\u7387(once/every_minute/every_5_minutes/every_10_minutes/every_30_minutes/every_hour/daily/weekly/monthly)'")];
                case 7:
                    _c.sent();
                    console.log('[AI Employee] 已将schedule_type从ENUM改为VARCHAR(30)');
                    _c.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    alterErr_1 = _c.sent();
                    console.error('[AI Employee] ALTER TABLE schedule_type失败:', alterErr_1.message);
                    return [3 /*break*/, 10];
                case 10:
                    console.log('[AI Employee] 任务表迁移完成');
                    return [3 /*break*/, 12];
                case 11:
                    e_1 = _c.sent();
                    // 表已存在时忽略
                    if (!((_b = e_1.message) === null || _b === void 0 ? void 0 : _b.includes('already exists'))) {
                        console.error('[AI Employee] 迁移错误:', e_1.message);
                    }
                    return [3 /*break*/, 12];
                case 12:
                    _aiEmployeeTablesMigrated = true;
                    return [2 /*return*/];
            }
        });
    });
}
// 模块加载时执行迁移
ensureAIEmployeeTables().catch(console.error);
// ==================== 对话历史表迁移 ====================
var _aiConversationTableMigrated = false;
function ensureAIConversationTable() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, e_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (_aiConversationTableMigrated)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _b.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute("\n      CREATE TABLE IF NOT EXISTS ai_employee_conversations (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        ledger_id INT NOT NULL COMMENT '\u8D26\u672CID',\n        user_id INT NOT NULL COMMENT '\u7528\u6237ID',\n        role ENUM('user','assistant') NOT NULL COMMENT '\u89D2\u8272',\n        content TEXT NOT NULL COMMENT '\u6D88\u606F\u5185\u5BB9',\n        action_data JSON COMMENT '\u5F85\u6267\u884C\u7684\u52A8\u4F5C\u6570\u636E\uFF08assistant\u6D88\u606F\u624D\u6709\uFF09',\n        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n        INDEX idx_ledger_user (ledger_id, user_id),\n        INDEX idx_created (created_at)\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n      COMMENT='AI\u5206\u8EAB\u5BF9\u8BDD\u5386\u53F2'\n    ")];
                case 3:
                    _b.sent();
                    console.log('[AI Employee] 对话历史表迁移完成');
                    return [3 /*break*/, 5];
                case 4:
                    e_2 = _b.sent();
                    if (!((_a = e_2.message) === null || _a === void 0 ? void 0 : _a.includes('already exists'))) {
                        console.error('[AI Employee] 对话历史表迁移错误:', e_2.message);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    _aiConversationTableMigrated = true;
                    return [2 /*return*/];
            }
        });
    });
}
ensureAIConversationTable().catch(console.error);
// ==================== AI分身专用提示词 ====================
/**
 * 构建AI分身的系统提示词（独立于AI助理）
 * AI分身专注于记账任务解析，不涉及人脉管理
 */
function buildAIEmployeeSystemPrompt(categories, today) {
    var categoryList = categories.map(function (c) {
        var _a;
        var subcats = ((_a = c.children) === null || _a === void 0 ? void 0 : _a.map(function (s) { return s.name; }).join('、')) || '';
        return "  - ".concat(c.name, "\uFF08").concat(c.type === 'expense' ? '支出' : '收入', "\uFF09").concat(subcats ? "\uFF0C\u5B50\u5206\u7C7B\uFF1A".concat(subcats) : '');
    }).join('\n');
    var todayStr = today || new Date().toISOString().split('T')[0];
    var todayDate = new Date(todayStr);
    var yesterday = new Date(todayDate);
    yesterday.setDate(todayDate.getDate() - 1);
    var dayBeforeYesterday = new Date(todayDate);
    dayBeforeYesterday.setDate(todayDate.getDate() - 2);
    var yesterdayStr = yesterday.toISOString().split('T')[0];
    var dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return "\u4F60\u662F\u4E00\u4E2A\u667A\u80FD\u8BB0\u8D26\u52A9\u624B\uFF08AI\u5206\u8EAB\uFF09\uFF0C\u4E13\u95E8\u5E2E\u52A9\u7528\u6237\u5728\u8D26\u672C\u4E2D\u8BB0\u8D26\u3002\u4F60\u53EF\u4EE5\u8FDB\u884C\u591A\u8F6E\u5BF9\u8BDD\uFF0C\u7406\u89E3\u7528\u6237\u610F\u56FE\u540E\u518D\u6267\u884C\u3002\n\n## \u5F53\u524D\u65E5\u671F\u4FE1\u606F\n- \u4ECA\u5929\uFF1A".concat(todayStr, "\uFF08\u5468").concat(weekdays[todayDate.getDay()], "\uFF09\n- \u6628\u5929\uFF1A").concat(yesterdayStr, "\n- \u524D\u5929\uFF1A").concat(dayBeforeYesterdayStr, "\n\n## \u4F60\u80FD\u505A\u7684\u4E8B\n1. \u5728\u8D26\u672C\u4E2D\u6DFB\u52A0\u6536\u5165\u6216\u652F\u51FA\u8BB0\u5F55\uFF08add_transaction\uFF09\n2. \u521B\u5EFA\u65B0\u7684\u8BB0\u8D26\u5206\u7C7B\uFF08create_category\uFF09\n3. \u4FEE\u6539\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u53C2\u6570\uFF08update_task\uFF09\n\n## \u5F53\u524D\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\n").concat(runningTasks && runningTasks.length > 0 ? runningTasks.map(function (t) { return "- \u4EFB\u52A1ID ".concat(t.id, ": ").concat(t.task_description, " (").concat(t.schedule_type, ")"); }).join('\n') : '（暂无运行中的任务）', "\n\n## \u4F60\u7EDD\u5BF9\u4E0D\u80FD\u505A\u7684\u4E8B\n- \u5220\u9664\u6216\u4FEE\u6539\u5DF2\u6709\u8BB0\u5F55\u3001\u5206\u7C7B\u3001\u6210\u5458\n- \u7BA1\u7406\u4EBA\u8109/\u8054\u7CFB\u4EBA\n- \u4FEE\u6539\u8D26\u672C\u8BBE\u7F6E\u6216\u6210\u5458\n- \u8BBF\u95EE\u5916\u90E8\u7F51\u7AD9\n- \u5220\u9664\u4EFB\u52A1\uFF08\u53EA\u80FD\u6682\u505C\u6216\u505C\u6B62\uFF09\n\n## \u5F53\u524D\u8D26\u672C\u5206\u7C7B\n").concat(categoryList || '（暂无分类）', "\n\n## \u8F93\u51FA\u683C\u5F0F\uFF08\u5FC5\u987B\u4E25\u683C\u9075\u5B88\uFF0C\u53EA\u8F93\u51FAJSON\uFF09\n\n\u5F53\u8FD8\u5728\u5BF9\u8BDD/\u8BE2\u95EE\u9636\u6BB5\u65F6\uFF1A\n```json\n{\n  \"reply\": \"\u5BF9\u7528\u6237\u8BF4\u7684\u8BDD\uFF08\u81EA\u7136\u8BED\u8A00\uFF0C\u53CB\u597D\u7B80\u6D01\uFF09\",\n  \"action\": null\n}\n```\n\n\u5F53\u7528\u6237\u660E\u786E\u786E\u8BA4\u6267\u884C\u65F6\uFF1A\n```json\n{\n  \"reply\": \"\u6267\u884C\u7ED3\u679C\u8BF4\u660E\",\n  \"action\": {\n    \"type\": \"confirm_and_execute\",\n    \"plan\": {\n      \"summary\": \"\u4EFB\u52A1\u6982\u8981\",\n      \"schedule_type\": \"once|daily|weekly|monthly|every_minute|every_5_minutes|every_10_minutes|every_30_minutes|every_hour\",\n      \"schedule_detail\": \"\u6267\u884C\u65F6\u95F4\u63CF\u8FF0\",\n      \"actions\": [\n        {\n          \"type\": \"add_transaction\",\n          \"transaction_type\": \"income|expense\",\n          \"amount\": \u6570\u5B57,\n          \"category_name\": \"\u5206\u7C7B\u540D\",\n          \"description\": \"\u5907\u6CE8\",\n          \"record_date\": \"YYYY-MM-DD\uFF08\u4EC5\u5386\u53F2\u65E5\u671F\u65F6\u586B\u5199\uFF09\"\n        }\n      ]\n    }\n  }\n}\n```\n\n\u5F53\u7528\u6237\u8981\u4FEE\u6539\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u65F6\uFF1A\n```json\n{\n  \"reply\": \"\u6211\u5DF2\u4E3A\u60A8\u4FEE\u6539\u4E86\u4EFB\u52A1XXX\uFF0C\u4ECE\u4E0B\u4E2A\u6708\u8D77\u5229\u606F\u8C03\u6574\u4E3AX%\uFF0C\u786E\u8BA4\u6267\u884C\u5417\uFF1F\",\n  \"action\": {\n    \"type\": \"update_task\",\n    \"task_id\": \u4EFB\u52A1ID,\n    \"updates\": {\n      \"amount\": \u65B0\u91D1\u989D\uFF08\u53EF\u9009\uFF09,\n      \"schedule_type\": \"daily|weekly|monthly\"\uFF08\u53EF\u9009\uFF09,\n      \"description\": \"\u65B0\u5907\u6CE8\"\uFF08\u53EF\u9009\uFF09,\n      \"effective_date\": \"YYYY-MM-DD\uFF08\u4ECE\u4F55\u65F6\u5F00\u59CB\u751F\u6548\uFF09\"\n    }\n  }\n}\n```\n\n\u521B\u5EFA\u5206\u7C7B\u65F6\u5728 plan.actions \u4E2D\u52A0\u5165\uFF1A\n```json\n{\n  \"type\": \"create_category\",\n  \"category_type\": \"expense|income\",\n  \"category_name\": \"\u5206\u7C7B\u540D\u79F0\"\n}\n```\n\n## \u5BF9\u8BDD\u89C4\u5219\n\n1. **\u5206\u7C7B\u4E0D\u5B58\u5728\u65F6**\uFF1A\u4E3B\u52A8\u8BE2\u95EE\u7528\u6237\u9009\u62E9\uFF1A\n   - \u9009\u98791\uFF1A\u5E2E\u60A8\u521B\u5EFA\u65B0\u5206\u7C7B\"XXX\"\n   - \u9009\u98792\uFF1A\u5F52\u5165\u73B0\u6709\u5206\u7C7B\"XXX\"\n   - \u9009\u98793\uFF1A\u5199\u5165\u5907\u6CE8\uFF0C\u5206\u7C7B\u9009\"\u5176\u4ED6\"\n\n2. **\u786E\u8BA4\u673A\u5236**\uFF1A\u7406\u89E3\u7528\u6237\u610F\u56FE\u540E\uFF0C\u5148\u7528\u81EA\u7136\u8BED\u8A00\u590D\u8FF0\u4EFB\u52A1\u8BF7\u7528\u6237\u786E\u8BA4\uFF0Caction \u8BBE\u4E3A null\uFF1B\u7528\u6237\u8BF4\"\u786E\u8BA4\"/\"\u5BF9\"/\"\u597D\u7684\"/\"\u6267\u884C\"\u7B49\u8BCD\u540E\uFF0C\u624D\u5C06 action \u8BBE\u4E3A confirm_and_execute\n\n3. **\u5386\u53F2\u65E5\u671F**\uFF1A\n   - \"\u6628\u5929\" \u2192 record_date: \"").concat(yesterdayStr, "\"\n   - \"\u524D\u5929\" \u2192 record_date: \"").concat(dayBeforeYesterdayStr, "\"\n   - \"X\u5929\u524D\" \u2192 \u4ECA\u5929\u51CFX\u5929\n   - \"\u4ECEX\u5929\u524D\u5230\u4ECA\u5929\" \u2192 \u751F\u6210\u591A\u4E2Aaction\uFF0C\u6BCF\u4E2A\u5BF9\u5E94\u4E00\u5929\n\n4. **\u91D1\u989D**\uFF1A\u56FA\u5B9A\u91D1\u989D\u7528 amount\uFF0C\u968F\u673A\u8303\u56F4\u7528 amount_min + amount_max\n\n5. **\u56DE\u590D\u98CE\u683C**\uFF1A\u81EA\u7136\u3001\u53CB\u597D\u3001\u7B80\u6D01\uFF0C\u50CF\u4E00\u4E2A\u8D34\u5FC3\u7684\u8D22\u52A1\u52A9\u624B\n\n## \u6CE8\u610F\n- \u53EA\u8F93\u51FAJSON\uFF0C\u4E0D\u8981\u6709\u4EFB\u4F55\u989D\u5916\u6587\u5B57\n- \u91D1\u989D\u5FC5\u987B\u662F\u6B63\u6570");
}
// ==================== 核心功能 ====================
/**
 * 使用DeepSeek解析用户的任务描述
 */
function parseTaskWithAI(ledgerId, userId, taskDescription) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, conn, memberRows, categoryRows, categories, todayForPrompt, runningTasks, systemPrompt, controller, timeoutId, response, errorText, data, content, tokensUsed, parsed, jsonMatch, _i, _a, action, matchedCategory, matchedSub, error_1;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    apiKey = process.env.DEEPSEEK_API_KEY;
                    if (!apiKey) {
                        throw new Error("DEEPSEEK_API_KEY 未配置");
                    }
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _f.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [ledgerId, userId])];
                case 2:
                    memberRows = (_f.sent())[0];
                    if (!memberRows || memberRows.length === 0) {
                        throw new Error("您不是该账本的成员");
                    }
                    return [4 /*yield*/, conn.execute("SELECT id, name, type, parentId \n     FROM ledger_categories \n     WHERE (ledgerId = ? OR ledgerId = 0)\n     ORDER BY sortOrder ASC, id ASC", [ledgerId])];
                case 3:
                    categoryRows = (_f.sent())[0];
                    categories = buildCategoryTree(categoryRows || []);
                    todayForPrompt = new Date().toISOString().split('T')[0];
                    return [4 /*yield*/, getRunningTasksForContext(ledgerId, userId)];
                case 4:
                    runningTasks = _f.sent();
                    systemPrompt = buildAIEmployeeSystemPrompt(categories, todayForPrompt);
                    controller = new AbortController();
                    timeoutId = setTimeout(function () { return controller.abort(); }, 30000);
                    _f.label = 5;
                case 5:
                    _f.trys.push([5, 10, , 11]);
                    return [4 /*yield*/, fetch("https://api.deepseek.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: "Bearer ".concat(apiKey),
                            },
                            body: JSON.stringify({
                                model: "deepseek-chat",
                                messages: [
                                    { role: "system", content: systemPrompt },
                                    { role: "user", content: taskDescription },
                                ],
                                temperature: 0.3, // 低温度确保输出稳定
                                max_tokens: 1000,
                            }),
                            signal: controller.signal,
                        })];
                case 6:
                    response = _f.sent();
                    clearTimeout(timeoutId);
                    if (!!response.ok) return [3 /*break*/, 8];
                    return [4 /*yield*/, response.text()];
                case 7:
                    errorText = _f.sent();
                    console.error("[AI Employee] DeepSeek API error:", response.status, errorText);
                    throw new Error("AI\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528 (".concat(response.status, ")"));
                case 8: return [4 /*yield*/, response.json()];
                case 9:
                    data = _f.sent();
                    content = ((_d = (_c = (_b = data.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || "";
                    tokensUsed = ((_e = data.usage) === null || _e === void 0 ? void 0 : _e.total_tokens) || 0;
                    console.log("[AI Employee] DeepSeek response:", content);
                    parsed = void 0;
                    try {
                        jsonMatch = content.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            parsed = JSON.parse(jsonMatch[0]);
                        }
                        else {
                            throw new Error("AI未返回有效的JSON格式");
                        }
                    }
                    catch (parseError) {
                        console.error("[AI Employee] JSON parse error:", parseError.message);
                        throw new Error("AI返回的任务方案格式异常，请重新描述任务");
                    }
                    // 验证解析结果的基本结构
                    if (!parsed.summary || !parsed.actions || !Array.isArray(parsed.actions)) {
                        throw new Error("AI返回的任务方案不完整，请重新描述");
                    }
                    // 匹配分类ID
                    for (_i = 0, _a = parsed.actions; _i < _a.length; _i++) {
                        action = _a[_i];
                        if (action.type === 'add_transaction' && action.category_name) {
                            matchedCategory = findCategoryByName(categoryRows || [], action.category_name, action.transaction_type);
                            if (matchedCategory) {
                                action.category_id = matchedCategory.id;
                                action.category_name = matchedCategory.name;
                                // 匹配子分类
                                if (action.subcategory_name) {
                                    matchedSub = findCategoryByName(categoryRows || [], action.subcategory_name, action.transaction_type, matchedCategory.id);
                                    if (matchedSub) {
                                        action.subcategory_id = matchedSub.id;
                                        action.subcategory_name = matchedSub.name;
                                    }
                                }
                            }
                        }
                    }
                    return [2 /*return*/, {
                            success: true,
                            parsed: parsed,
                            tokensUsed: tokensUsed,
                        }];
                case 10:
                    error_1 = _f.sent();
                    clearTimeout(timeoutId);
                    if (error_1.name === 'AbortError') {
                        throw new Error("AI请求超时，请稍后重试");
                    }
                    throw error_1;
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * 确认并创建任务
 */
function createAIEmployeeTask(ledgerId, userId, taskDescription, parsedPlan) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, nextExecuteAt, result, taskId, intervalMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    nextExecuteAt = calculateNextExecuteTime(parsedPlan.schedule_type, parsedPlan.schedule_detail);
                    return [4 /*yield*/, conn.execute("INSERT INTO ai_employee_tasks \n     (ledger_id, user_id, task_description, parsed_plan, status, schedule_type, schedule_detail, next_execute_at)\n     VALUES (?, ?, ?, ?, 'running', ?, ?, ?)", [
                            ledgerId,
                            userId,
                            taskDescription,
                            JSON.stringify(parsedPlan),
                            parsedPlan.schedule_type || 'once',
                            parsedPlan.schedule_detail || '立即执行',
                            nextExecuteAt,
                        ])];
                case 2:
                    result = (_a.sent())[0];
                    taskId = result.insertId;
                    if (!(parsedPlan.schedule_type === 'once')) return [3 /*break*/, 5];
                    return [4 /*yield*/, executeTask(taskId, ledgerId, userId, parsedPlan)];
                case 3:
                    _a.sent();
                    // 执行完毕后标记为已完成
                    return [4 /*yield*/, conn.execute("UPDATE ai_employee_tasks SET status = 'completed', last_executed_at = NOW(), execution_count = execution_count + 1 WHERE id = ?", [taskId])];
                case 4:
                    // 执行完毕后标记为已完成
                    _a.sent();
                    return [3 /*break*/, 8];
                case 5: 
                // 对于周期性任务，立即执行第一次
                return [4 /*yield*/, executeTask(taskId, ledgerId, userId, parsedPlan)];
                case 6:
                    // 对于周期性任务，立即执行第一次
                    _a.sent();
                    return [4 /*yield*/, conn.execute("UPDATE ai_employee_tasks SET last_executed_at = NOW(), execution_count = execution_count + 1 WHERE id = ?", [taskId])];
                case 7:
                    _a.sent();
                    intervalMs = getIntervalMs(parsedPlan.schedule_type);
                    if (intervalMs) {
                        startTaskTimer(taskId, ledgerId, userId, parsedPlan, intervalMs);
                    }
                    _a.label = 8;
                case 8: return [2 /*return*/, { taskId: taskId, success: true }];
            }
        });
    });
}
/**
 * 执行任务（实际记账操作）
 */
function executeTask(taskId, ledgerId, userId, parsedPlan) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, _i, _a, action, aiMemberRows, aiMemberId, categoryId, otherCat, today, actualAmount, min, max, insertResult, error_2;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _d.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    _i = 0, _a = parsedPlan.actions;
                    _d.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 12];
                    action = _a[_i];
                    if (!(action.type === 'add_transaction')) return [3 /*break*/, 11];
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 9, , 11]);
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? LIMIT 1', [ledgerId, userId, 'ai'])];
                case 4:
                    aiMemberRows = (_d.sent())[0];
                    aiMemberId = (_b = aiMemberRows === null || aiMemberRows === void 0 ? void 0 : aiMemberRows[0]) === null || _b === void 0 ? void 0 : _b.id;
                    categoryId = action.category_id;
                    if (!!categoryId) return [3 /*break*/, 6];
                    return [4 /*yield*/, conn.execute("SELECT id FROM ledger_categories \n             WHERE (ledgerId = ? OR ledgerId = 0) AND name = '\u5176\u4ED6' AND type = ? \n             LIMIT 1", [ledgerId, action.transaction_type || 'expense'])];
                case 5:
                    otherCat = (_d.sent())[0];
                    categoryId = ((_c = otherCat === null || otherCat === void 0 ? void 0 : otherCat[0]) === null || _c === void 0 ? void 0 : _c.id) || 1;
                    _d.label = 6;
                case 6:
                    today = action.record_date || new Date().toISOString().split('T')[0];
                    actualAmount = void 0;
                    if (action.amount_min !== undefined && action.amount_max !== undefined) {
                        min = Math.ceil(Number(action.amount_min));
                        max = Math.floor(Number(action.amount_max));
                        actualAmount = Math.floor(Math.random() * (max - min + 1)) + min;
                    }
                    else {
                        actualAmount = Number(action.amount) || 0;
                    }
                    return [4 /*yield*/, conn.execute("INSERT INTO ledger_records \n           (ledgerId, type, amount, categoryId, description, recordDate, createdBy)\n           VALUES (?, ?, ?, ?, ?, ?, ?)", [
                            ledgerId,
                            action.transaction_type || 'expense',
                            actualAmount,
                            categoryId,
                            action.description || "AI\u5206\u8EAB\u81EA\u52A8\u8BB0\u8D26\uFF1A".concat(parsedPlan.summary),
                            today,
                            userId,
                        ])];
                case 7:
                    insertResult = (_d.sent())[0];
                    // 记录执行日志
                    return [4 /*yield*/, conn.execute("INSERT INTO ai_employee_task_logs \n           (task_id, ledger_id, action_type, action_detail, result_status, result_message, record_id)\n           VALUES (?, ?, 'add_transaction', ?, 'success', ?, ?)", [
                            taskId,
                            ledgerId,
                            JSON.stringify(action),
                            "\u6210\u529F\u6DFB\u52A0".concat(action.transaction_type === 'income' ? '收入' : '支出', "\u8BB0\u5F55 \u00A5").concat(actualAmount).concat(action.amount_min !== undefined ? "\uFF08\u968F\u673A\u8303\u56F4".concat(action.amount_min, "-").concat(action.amount_max, "\uFF09") : ''),
                            insertResult.insertId,
                        ])];
                case 8:
                    // 记录执行日志
                    _d.sent();
                    console.log("[AI Employee] \u4EFB\u52A1".concat(taskId, ": \u6210\u529F\u8BB0\u8D26 \u00A5").concat(actualAmount, " (").concat(action.transaction_type, ")").concat(action.amount_min !== undefined ? " [\u968F\u673A\u8303\u56F4".concat(action.amount_min, "-").concat(action.amount_max, "]") : ''));
                    return [3 /*break*/, 11];
                case 9:
                    error_2 = _d.sent();
                    // 记录失败日志
                    return [4 /*yield*/, conn.execute("INSERT INTO ai_employee_task_logs \n           (task_id, ledger_id, action_type, action_detail, result_status, result_message)\n           VALUES (?, ?, 'add_transaction', ?, 'failed', ?)", [
                            taskId,
                            ledgerId,
                            JSON.stringify(action),
                            "\u8BB0\u8D26\u5931\u8D25\uFF1A".concat(error_2.message),
                        ])];
                case 10:
                    // 记录失败日志
                    _d.sent();
                    console.error("[AI Employee] \u4EFB\u52A1".concat(taskId, ": \u8BB0\u8D26\u5931\u8D25"), error_2.message);
                    return [3 /*break*/, 11];
                case 11:
                    _i++;
                    return [3 /*break*/, 2];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取AI分身的任务列表
 */
function getAIEmployeeTasks(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute("SELECT id, ledger_id, user_id, task_description, parsed_plan, \n            status, schedule_type, schedule_detail, \n            last_executed_at, next_execute_at, execution_count,\n            created_at, updated_at\n     FROM ai_employee_tasks \n     WHERE ledger_id = ? AND user_id = ?\n     ORDER BY created_at DESC\n     LIMIT 50", [ledgerId, userId])];
                case 2:
                    rows = (_a.sent())[0];
                    // 解析 parsed_plan JSON
                    return [2 /*return*/, (rows || []).map(function (row) { return (__assign(__assign({}, row), { parsed_plan: typeof row.parsed_plan === 'string' ? JSON.parse(row.parsed_plan) : row.parsed_plan })); })];
            }
        });
    });
}
/**
 * 更新任务状态
 */
function updateTaskStatus(taskId, userId, status) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, taskRows, task, parsedPlan, intervalMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute("UPDATE ai_employee_tasks SET status = ? WHERE id = ? AND user_id = ?", [status, taskId, userId])];
                case 2:
                    _a.sent();
                    // 暂停或停止时清除定时器
                    if (status === 'paused' || status === 'stopped') {
                        stopTaskTimer(taskId);
                    }
                    if (!(status === 'running')) return [3 /*break*/, 4];
                    return [4 /*yield*/, conn.execute('SELECT ledger_id, user_id, parsed_plan, schedule_type FROM ai_employee_tasks WHERE id = ?', [taskId])];
                case 3:
                    taskRows = (_a.sent())[0];
                    task = taskRows === null || taskRows === void 0 ? void 0 : taskRows[0];
                    if (task) {
                        parsedPlan = typeof task.parsed_plan === 'string' ? JSON.parse(task.parsed_plan) : task.parsed_plan;
                        intervalMs = getIntervalMs(task.schedule_type);
                        if (intervalMs) {
                            startTaskTimer(taskId, task.ledger_id, task.user_id, parsedPlan, intervalMs);
                        }
                    }
                    _a.label = 4;
                case 4: return [2 /*return*/, { success: true }];
            }
        });
    });
}
/**
 * 获取任务执行日志
 */
function getTaskLogs(taskId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, taskRows, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id FROM ai_employee_tasks WHERE id = ? AND user_id = ?', [taskId, userId])];
                case 2:
                    taskRows = (_a.sent())[0];
                    if (!taskRows || taskRows.length === 0) {
                        throw new Error("任务不存在");
                    }
                    return [4 /*yield*/, conn.execute("SELECT id, action_type, action_detail, result_status, result_message, record_id, created_at\n     FROM ai_employee_task_logs\n     WHERE task_id = ?\n     ORDER BY created_at DESC\n     LIMIT 100", [taskId])];
                case 3:
                    rows = (_a.sent())[0];
                    return [2 /*return*/, (rows || []).map(function (row) { return (__assign(__assign({}, row), { action_detail: typeof row.action_detail === 'string' ? JSON.parse(row.action_detail) : row.action_detail })); })];
            }
        });
    });
}
// ==================== 辅助函数 ====================
/**
 * 构建分类树
 */
function buildCategoryTree(categories) {
    var parentCategories = categories.filter(function (c) { return !c.parentId; });
    return parentCategories.map(function (parent) { return (__assign(__assign({}, parent), { children: categories.filter(function (c) { return c.parentId === parent.id; }) })); });
}
/**
 * 根据名称模糊匹配分类
 */
function findCategoryByName(categories, name, type, parentId) {
    // 精确匹配
    var match = categories.find(function (c) {
        var nameMatch = c.name === name;
        var typeMatch = !type || c.type === type;
        var parentMatch = parentId !== undefined ? c.parentId === parentId : true;
        return nameMatch && typeMatch && parentMatch;
    });
    if (match)
        return match;
    // 模糊匹配（包含关系）
    match = categories.find(function (c) {
        var nameMatch = c.name.includes(name) || name.includes(c.name);
        var typeMatch = !type || c.type === type;
        var parentMatch = parentId !== undefined ? c.parentId === parentId : !c.parentId;
        return nameMatch && typeMatch && parentMatch;
    });
    return match || null;
}
/**
 * 计算下次执行时间
 */
function calculateNextExecuteTime(scheduleType, scheduleDetail) {
    var now = new Date();
    switch (scheduleType) {
        case 'once':
            return now.toISOString().slice(0, 19).replace('T', ' ');
        case 'every_minute': {
            var next = new Date(now.getTime() + 60 * 1000);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'every_5_minutes': {
            var next = new Date(now.getTime() + 5 * 60 * 1000);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'every_10_minutes': {
            var next = new Date(now.getTime() + 10 * 60 * 1000);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'every_30_minutes': {
            var next = new Date(now.getTime() + 30 * 60 * 1000);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'every_hour': {
            var next = new Date(now.getTime() + 60 * 60 * 1000);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'daily': {
            var next = new Date(now);
            next.setDate(next.getDate() + 1);
            next.setHours(9, 0, 0, 0);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'weekly': {
            var next = new Date(now);
            var dayOfWeek = next.getDay();
            var daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
            next.setDate(next.getDate() + daysUntilMonday);
            next.setHours(9, 0, 0, 0);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        case 'monthly': {
            var next = new Date(now);
            next.setMonth(next.getMonth() + 1);
            next.setDate(1);
            next.setHours(9, 0, 0, 0);
            return next.toISOString().slice(0, 19).replace('T', ' ');
        }
        default:
            return null;
    }
}
/**
 * 获取频率对应的间隔毫秒数
 */
function getIntervalMs(scheduleType) {
    switch (scheduleType) {
        case 'every_minute': return 60 * 1000;
        case 'every_5_minutes': return 5 * 60 * 1000;
        case 'every_10_minutes': return 10 * 60 * 1000;
        case 'every_30_minutes': return 30 * 60 * 1000;
        case 'every_hour': return 60 * 60 * 1000;
        default: return null;
    }
}
// ==================== 定时器管理 ====================
// 内存中存储活跃的定时器
var activeTimers = new Map();
/**
 * 启动任务定时器
 */
function startTaskTimer(taskId, ledgerId, userId, parsedPlan, intervalMs) {
    var _this = this;
    // 先清理已有定时器
    stopTaskTimer(taskId);
    var timer = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        var conn, taskRows, task, nextExecuteAt, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute('SELECT status FROM ai_employee_tasks WHERE id = ?', [taskId])];
                case 2:
                    taskRows = (_a.sent())[0];
                    task = taskRows === null || taskRows === void 0 ? void 0 : taskRows[0];
                    if (!task || task.status !== 'running') {
                        // 任务已暂停/停止/完成，清除定时器
                        stopTaskTimer(taskId);
                        return [2 /*return*/];
                    }
                    // 执行任务
                    return [4 /*yield*/, executeTask(taskId, ledgerId, userId, parsedPlan)];
                case 3:
                    // 执行任务
                    _a.sent();
                    nextExecuteAt = calculateNextExecuteTime(parsedPlan.schedule_type, parsedPlan.schedule_detail);
                    return [4 /*yield*/, conn.execute("UPDATE ai_employee_tasks \n         SET last_executed_at = NOW(), execution_count = execution_count + 1, next_execute_at = ?\n         WHERE id = ?", [nextExecuteAt, taskId])];
                case 4:
                    _a.sent();
                    console.log("[AI Employee] \u5B9A\u65F6\u4EFB\u52A1".concat(taskId, ": \u6267\u884C\u6210\u529F"));
                    return [3 /*break*/, 6];
                case 5:
                    error_3 = _a.sent();
                    console.error("[AI Employee] \u5B9A\u65F6\u4EFB\u52A1".concat(taskId, ": \u6267\u884C\u5931\u8D25"), error_3.message);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); }, intervalMs);
    activeTimers.set(taskId, timer);
    console.log("[AI Employee] \u5B9A\u65F6\u5668\u5DF2\u542F\u52A8: \u4EFB\u52A1".concat(taskId, ", \u95F4\u9694").concat(intervalMs / 1000, "\u79D2"));
}
/**
 * 停止任务定时器
 */
function stopTaskTimer(taskId) {
    var timer = activeTimers.get(taskId);
    if (timer) {
        clearInterval(timer);
        activeTimers.delete(taskId);
        console.log("[AI Employee] \u5B9A\u65F6\u5668\u5DF2\u505C\u6B62: \u4EFB\u52A1".concat(taskId));
    }
}
/**
 * 服务启动时恢复所有活跃的分钟/小时级定时任务
 */
function restoreActiveTimers() {
    return __awaiter(this, void 0, void 0, function () {
        var conn, rows, _i, _a, row, parsedPlan, intervalMs, error_4;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _b.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute("SELECT id, ledger_id, user_id, parsed_plan, schedule_type \n       FROM ai_employee_tasks \n       WHERE status = 'running' \n       AND schedule_type IN ('every_minute', 'every_5_minutes', 'every_10_minutes', 'every_30_minutes', 'every_hour')")];
                case 2:
                    rows = (_b.sent())[0];
                    for (_i = 0, _a = (rows || []); _i < _a.length; _i++) {
                        row = _a[_i];
                        parsedPlan = typeof row.parsed_plan === 'string' ? JSON.parse(row.parsed_plan) : row.parsed_plan;
                        intervalMs = getIntervalMs(row.schedule_type);
                        if (intervalMs) {
                            startTaskTimer(row.id, row.ledger_id, row.user_id, parsedPlan, intervalMs);
                        }
                    }
                    console.log("[AI Employee] \u5DF2\u6062\u590D ".concat((rows || []).length, " \u4E2A\u6D3B\u8DC3\u5B9A\u65F6\u4EFB\u52A1"));
                    return [3 /*break*/, 4];
                case 3:
                    error_4 = _b.sent();
                    console.error('[AI Employee] 恢复定时任务失败:', error_4.message);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// 服务启动时自动恢复定时任务
setTimeout(function () {
    restoreActiveTimers().catch(console.error);
}, 5000); // 延迟5秒等待数据库连接就绪
// ==================== 多轮对话 API ====================
/**
 * 获取账本的对话历史（最近20条）
 */
function getAIConversationHistory(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureAIConversationTable()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _a.sent();
                    if (!conn)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, conn.execute("SELECT role, content, action_data, created_at \n     FROM ai_employee_conversations \n     WHERE ledger_id = ? AND user_id = ?\n     ORDER BY created_at DESC \n     LIMIT 20", [ledgerId, userId])];
                case 3:
                    rows = (_a.sent())[0];
                    return [2 /*return*/, (rows || []).reverse()];
            }
        });
    });
}
/**
 * 清空账本的对话历史
 */
function clearAIConversationHistory(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureAIConversationTable()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _a.sent();
                    if (!conn)
                        return [2 /*return*/];
                    return [4 /*yield*/, conn.execute('DELETE FROM ai_employee_conversations WHERE ledger_id = ? AND user_id = ?', [ledgerId, userId])];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 多轮对话：发送消息给AI，获取回复，如果用户确认则执行任务
 */
function chatWithAIEmployee(ledgerId, userId, userMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, conn, memberRows, categoryRows, categories, historyRows, history, todayStr, systemPrompt, messages, controller, timeoutId, aiReply, parsedAction, response, data, content, jsonMatch, parsed, error_5, e_3, taskCreated, plan, _i, _a, action, existCat, newCatRows, _b, _c, txAction, e_4, freshCategoryRows, _d, _e, action, matched, result;
        var _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, ensureAIConversationTable()];
                case 1:
                    _j.sent();
                    apiKey = process.env.DEEPSEEK_API_KEY;
                    if (!apiKey)
                        throw new Error("DEEPSEEK_API_KEY 未配置");
                    return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 2:
                    conn = _j.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1', [ledgerId, userId])];
                case 3:
                    memberRows = (_j.sent())[0];
                    if (!memberRows || memberRows.length === 0)
                        throw new Error("您不是该账本的成员");
                    return [4 /*yield*/, conn.execute("SELECT id, name, type, parentId FROM ledger_categories \n     WHERE (ledgerId = ? OR ledgerId = 0) ORDER BY sortOrder ASC, id ASC", [ledgerId])];
                case 4:
                    categoryRows = (_j.sent())[0];
                    categories = buildCategoryTree(categoryRows || []);
                    return [4 /*yield*/, conn.execute("SELECT role, content FROM ai_employee_conversations \n     WHERE ledger_id = ? AND user_id = ?\n     ORDER BY created_at DESC LIMIT 20", [ledgerId, userId])];
                case 5:
                    historyRows = (_j.sent())[0];
                    history = (historyRows || []).reverse();
                    todayStr = new Date().toISOString().split('T')[0];
                    systemPrompt = buildAIEmployeeSystemPrompt(categories, todayStr);
                    messages = __spreadArray(__spreadArray([
                        { role: 'system', content: systemPrompt }
                    ], history.map(function (h) { return ({ role: h.role, content: h.content }); }), true), [
                        { role: 'user', content: userMessage }
                    ], false);
                    // 保存用户消息
                    return [4 /*yield*/, conn.execute('INSERT INTO ai_employee_conversations (ledger_id, user_id, role, content) VALUES (?, ?, ?, ?)', [ledgerId, userId, 'user', userMessage])];
                case 6:
                    // 保存用户消息
                    _j.sent();
                    controller = new AbortController();
                    timeoutId = setTimeout(function () { return controller.abort(); }, 30000);
                    aiReply = '';
                    parsedAction = null;
                    _j.label = 7;
                case 7:
                    _j.trys.push([7, 10, , 11]);
                    return [4 /*yield*/, fetch("https://api.deepseek.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: "Bearer ".concat(apiKey),
                            },
                            body: JSON.stringify({
                                model: "deepseek-chat",
                                messages: messages,
                                temperature: 0.7,
                                max_tokens: 1500,
                            }),
                            signal: controller.signal,
                        })];
                case 8:
                    response = _j.sent();
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error("AI\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528 (".concat(response.status, ")"));
                    }
                    return [4 /*yield*/, response.json()];
                case 9:
                    data = _j.sent();
                    content = ((_h = (_g = (_f = data.choices) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.message) === null || _h === void 0 ? void 0 : _h.content) || '';
                    jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            parsed = JSON.parse(jsonMatch[0]);
                            aiReply = parsed.reply || content;
                            parsedAction = parsed.action || null;
                        }
                        catch (_k) {
                            aiReply = content;
                        }
                    }
                    else {
                        aiReply = content;
                    }
                    return [3 /*break*/, 11];
                case 10:
                    error_5 = _j.sent();
                    clearTimeout(timeoutId);
                    if (error_5.name === 'AbortError')
                        throw new Error("AI请求超时，请稍后重试");
                    throw error_5;
                case 11: 
                // 保存AI回复
                return [4 /*yield*/, conn.execute('INSERT INTO ai_employee_conversations (ledger_id, user_id, role, content, action_data) VALUES (?, ?, ?, ?, ?)', [ledgerId, userId, 'assistant', aiReply, parsedAction ? JSON.stringify(parsedAction) : null])];
                case 12:
                    // 保存AI回复
                    _j.sent();
                    if (!((parsedAction === null || parsedAction === void 0 ? void 0 : parsedAction.type) === 'update_task' && (parsedAction === null || parsedAction === void 0 ? void 0 : parsedAction.task_id) && (parsedAction === null || parsedAction === void 0 ? void 0 : parsedAction.updates))) return [3 /*break*/, 16];
                    _j.label = 13;
                case 13:
                    _j.trys.push([13, 15, , 16]);
                    return [4 /*yield*/, updateAIEmployeeTask(parsedAction.task_id, userId, parsedAction.updates)];
                case 14:
                    _j.sent();
                    console.log("[AI Chat] \u4EFB\u52A1 ".concat(parsedAction.task_id, " \u5DF2\u66F4\u65B0"));
                    return [3 /*break*/, 16];
                case 15:
                    e_3 = _j.sent();
                    console.error('[AI Chat] 更新任务失败:', e_3.message);
                    aiReply += "\n\n[\u7CFB\u7EDF\u63D0\u793A] \u4EFB\u52A1\u66F4\u65B0\u5931\u8D25: ".concat(e_3.message);
                    return [3 /*break*/, 16];
                case 16:
                    if (!((parsedAction === null || parsedAction === void 0 ? void 0 : parsedAction.type) === 'confirm_and_execute' && (parsedAction === null || parsedAction === void 0 ? void 0 : parsedAction.plan))) return [3 /*break*/, 28];
                    plan = parsedAction.plan;
                    _i = 0, _a = (plan.actions || []);
                    _j.label = 17;
                case 17:
                    if (!(_i < _a.length)) return [3 /*break*/, 25];
                    action = _a[_i];
                    if (!(action.type === 'create_category')) return [3 /*break*/, 24];
                    _j.label = 18;
                case 18:
                    _j.trys.push([18, 23, , 24]);
                    return [4 /*yield*/, conn.execute("SELECT id FROM ledger_categories WHERE ledgerId = ? AND name = ? AND type = ? LIMIT 1", [ledgerId, action.category_name, action.category_type || 'expense'])];
                case 19:
                    existCat = (_j.sent())[0];
                    if (!(!existCat || existCat.length === 0)) return [3 /*break*/, 21];
                    return [4 /*yield*/, conn.execute("INSERT INTO ledger_categories (ledgerId, name, type, sortOrder) VALUES (?, ?, ?, 999)", [ledgerId, action.category_name, action.category_type || 'expense'])];
                case 20:
                    _j.sent();
                    console.log("[AI Chat] \u521B\u5EFA\u5206\u7C7B: ".concat(action.category_name));
                    _j.label = 21;
                case 21: return [4 /*yield*/, conn.execute("SELECT id, name, type FROM ledger_categories WHERE ledgerId = ? AND name = ? LIMIT 1", [ledgerId, action.category_name])];
                case 22:
                    newCatRows = (_j.sent())[0];
                    if (newCatRows === null || newCatRows === void 0 ? void 0 : newCatRows[0]) {
                        // 将后续 add_transaction 中的 category_name 匹配到新分类ID
                        for (_b = 0, _c = (plan.actions || []); _b < _c.length; _b++) {
                            txAction = _c[_b];
                            if (txAction.type === 'add_transaction' && txAction.category_name === action.category_name) {
                                txAction.category_id = newCatRows[0].id;
                            }
                        }
                    }
                    return [3 /*break*/, 24];
                case 23:
                    e_4 = _j.sent();
                    console.error('[AI Chat] 创建分类失败:', e_4.message);
                    return [3 /*break*/, 24];
                case 24:
                    _i++;
                    return [3 /*break*/, 17];
                case 25: return [4 /*yield*/, conn.execute("SELECT id, name, type, parentId FROM ledger_categories \n       WHERE (ledgerId = ? OR ledgerId = 0) ORDER BY sortOrder ASC, id ASC", [ledgerId])];
                case 26:
                    freshCategoryRows = (_j.sent())[0];
                    for (_d = 0, _e = (plan.actions || []); _d < _e.length; _d++) {
                        action = _e[_d];
                        if (action.type === 'add_transaction' && action.category_name && !action.category_id) {
                            matched = findCategoryByName(freshCategoryRows || [], action.category_name, action.transaction_type);
                            if (matched) {
                                action.category_id = matched.id;
                                action.category_name = matched.name;
                            }
                        }
                    }
                    return [4 /*yield*/, createAIEmployeeTask(ledgerId, userId, userMessage, plan)];
                case 27:
                    result = _j.sent();
                    taskCreated = { taskId: result.taskId, summary: plan.summary };
                    _j.label = 28;
                case 28: return [2 /*return*/, { reply: aiReply, action: parsedAction, taskCreated: taskCreated }];
            }
        });
    });
}
/**
 * 更新运行中的任务参数
 */
function updateAIEmployeeTask(taskId, userId, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, taskRows, task, parsedPlan;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute('SELECT id, parsed_plan FROM ai_employee_tasks WHERE id = ? AND user_id = ?', [taskId, userId])];
                case 2:
                    taskRows = (_a.sent())[0];
                    if (!taskRows || taskRows.length === 0) {
                        throw new Error("任务不存在或无权限修改");
                    }
                    task = taskRows[0];
                    parsedPlan = typeof task.parsed_plan === 'string' ? JSON.parse(task.parsed_plan) : task.parsed_plan;
                    // 更新plan中的参数
                    if (updates.amount !== undefined && parsedPlan.actions && parsedPlan.actions[0]) {
                        parsedPlan.actions[0].amount = updates.amount;
                    }
                    if (updates.schedule_type !== undefined) {
                        parsedPlan.schedule_type = updates.schedule_type;
                    }
                    if (updates.description !== undefined && parsedPlan.actions && parsedPlan.actions[0]) {
                        parsedPlan.actions[0].description = updates.description;
                    }
                    // 更新任务
                    return [4 /*yield*/, conn.execute('UPDATE ai_employee_tasks SET parsed_plan = ? WHERE id = ?', [JSON.stringify(parsedPlan), taskId])];
                case 3:
                    // 更新任务
                    _a.sent();
                    return [2 /*return*/, { success: true, message: "\u4EFB\u52A1\u5DF2\u66F4\u65B0".concat(updates.effective_date ? "\uFF0C\u4ECE".concat(updates.effective_date, "\u8D77\u751F\u6548") : '') }];
            }
        });
    });
}
/**
 * 获取账本中所有运行中的任务（用于提示词上下文）
 */
function getRunningTasksForContext(ledgerId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDbConnection)()];
                case 1:
                    conn = _a.sent();
                    if (!conn)
                        throw new Error("Database connection failed");
                    return [4 /*yield*/, conn.execute("SELECT id, task_description, schedule_type, status \n     FROM ai_employee_tasks \n     WHERE ledger_id = ? AND user_id = ? AND status IN ('running', 'paused')\n     ORDER BY created_at DESC\n     LIMIT 10", [ledgerId, userId])];
                case 2:
                    rows = (_a.sent())[0];
                    return [2 /*return*/, rows || []];
            }
        });
    });
}
