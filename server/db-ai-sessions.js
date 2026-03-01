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
exports.createSession = createSession;
exports.getUserSessions = getUserSessions;
exports.getSessionDetail = getSessionDetail;
exports.updateSessionTitle = updateSessionTitle;
exports.deleteSession = deleteSession;
exports.saveMessage = saveMessage;
exports.autoGenerateSessionTitle = autoGenerateSessionTitle;
exports.getSessionHistory = getSessionHistory;
var db_1 = require("./db");
/**
 * AI会话管理模块
 * 负责会话的创建、查询、更新和删除
 */
/**
 * 创建新会话
 * @param userId 用户ID
 * @param title 会话标题（可选）
 * @returns 会话ID
 */
function createSession(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, title) {
        var db, result, insertId;
        if (title === void 0) { title = "新对话"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("INSERT INTO ai_sessions (user_id, title) VALUES (?, ?)", [userId, title])];
                case 2:
                    result = _a.sent();
                    insertId = result.insertId;
                    console.log("[AI Session] Created session ".concat(insertId, " for user ").concat(userId));
                    return [2 /*return*/, insertId];
            }
        });
    });
}
/**
 * 获取用户的会话列表
 * @param userId 用户ID
 * @param page 页码（从1开始）
 * @param limit 每页数量
 * @returns 会话列表和总数
 */
function getUserSessions(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, page, limit) {
        var db, offset, sessions, countResult, total, sessionList;
        var _a;
        if (page === void 0) { page = 1; }
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    offset = (page - 1) * limit;
                    return [4 /*yield*/, db.execute("SELECT id, title, total_tokens, total_cost, message_count, created_at, updated_at\n     FROM ai_sessions\n     WHERE user_id = ?\n     ORDER BY updated_at DESC\n     LIMIT ? OFFSET ?", [userId, limit, offset])];
                case 2:
                    sessions = _b.sent();
                    return [4 /*yield*/, db.execute("SELECT COUNT(*) as total FROM ai_sessions WHERE user_id = ?", [userId])];
                case 3:
                    countResult = _b.sent();
                    total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
                    sessionList = Array.isArray(sessions) ? sessions : (sessions.rows || []);
                    return [2 /*return*/, {
                            sessions: sessionList,
                            total: total,
                            page: page,
                            limit: limit,
                        }];
            }
        });
    });
}
/**
 * 获取会话详情（包含所有消息）
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 * @returns 会话详情和消息列表
 */
function getSessionDetail(sessionId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sessionResult, session, messagesResult, messages;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?", [sessionId, userId])];
                case 2:
                    sessionResult = _b.sent();
                    session = Array.isArray(sessionResult) ? sessionResult[0] : (((_a = sessionResult.rows) === null || _a === void 0 ? void 0 : _a[0]) || null);
                    if (!session) {
                        throw new Error("会话不存在或无权访问");
                    }
                    return [4 /*yield*/, db.execute("SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC", [sessionId])];
                case 3:
                    messagesResult = _b.sent();
                    messages = Array.isArray(messagesResult) ? messagesResult : (messagesResult.rows || []);
                    return [2 /*return*/, {
                            session: session,
                            messages: messages,
                        }];
            }
        });
    });
}
/**
 * 更新会话标题
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 * @param title 新标题
 */
function updateSessionTitle(sessionId, userId, title) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("UPDATE ai_sessions SET title = ?, updated_at = NOW() WHERE id = ? AND user_id = ?", [title, sessionId, userId])];
                case 2:
                    _a.sent();
                    console.log("[AI Session] Updated session ".concat(sessionId, " title to \"").concat(title, "\""));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除会话（级联删除所有消息）
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 */
function deleteSession(sessionId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    // 由于设置了外键级联删除，删除会话会自动删除所有消息
                    return [4 /*yield*/, db.execute("DELETE FROM ai_sessions WHERE id = ? AND user_id = ?", [sessionId, userId])];
                case 2:
                    // 由于设置了外键级联删除，删除会话会自动删除所有消息
                    _a.sent();
                    console.log("[AI Session] Deleted session ".concat(sessionId));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 保存消息到会话
 * @param sessionId 会话ID
 * @param role 消息角色（user/assistant/system）
 * @param content 消息内容
 * @param tokensUsed 消耗的token数（可选）
 * @param cost 费用（可选）
 * @returns 消息ID
 */
function saveMessage(sessionId_1, role_1, content_1) {
    return __awaiter(this, arguments, void 0, function (sessionId, role, content, tokensUsed, cost) {
        var db, result, messageId;
        if (tokensUsed === void 0) { tokensUsed = 0; }
        if (cost === void 0) { cost = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("INSERT INTO ai_messages (session_id, role, content, tokens_used, cost) \n     VALUES (?, ?, ?, ?, ?)", [sessionId, role, content, tokensUsed, cost])];
                case 2:
                    result = _a.sent();
                    messageId = result.insertId;
                    // 更新会话统计
                    return [4 /*yield*/, db.execute("UPDATE ai_sessions \n     SET message_count = message_count + 1,\n         total_tokens = total_tokens + ?,\n         total_cost = total_cost + ?,\n         updated_at = NOW()\n     WHERE id = ?", [tokensUsed, cost, sessionId])];
                case 3:
                    // 更新会话统计
                    _a.sent();
                    console.log("[AI Message] Saved message ".concat(messageId, " to session ").concat(sessionId));
                    return [2 /*return*/, messageId];
            }
        });
    });
}
/**
 * 根据第一条用户消息自动生成会话标题
 * @param sessionId 会话ID
 * @param userId 用户ID
 * @param firstMessage 第一条用户消息
 */
function autoGenerateSessionTitle(sessionId, userId, firstMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var db, title;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    title = firstMessage.substring(0, 20);
                    if (firstMessage.length > 20) {
                        title += "...";
                    }
                    return [4 /*yield*/, updateSessionTitle(sessionId, userId, title)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取会话的消息历史（用于AI上下文）
 * @param sessionId 会话ID
 * @param limit 最多返回多少条消息（默认20条）
 * @returns 消息历史数组
 */
function getSessionHistory(sessionId_1) {
    return __awaiter(this, arguments, void 0, function (sessionId, limit) {
        var db, messagesResult, messages;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("SELECT role, content FROM ai_messages \n     WHERE session_id = ? AND role IN ('user', 'assistant')\n     ORDER BY created_at DESC\n     LIMIT ?", [sessionId, limit])];
                case 2:
                    messagesResult = _a.sent();
                    messages = Array.isArray(messagesResult) ? messagesResult : (messagesResult.rows || []);
                    // 反转顺序（最早的在前）
                    return [2 /*return*/, messages.reverse().map(function (msg) { return ({
                            role: msg.role,
                            content: msg.content,
                        }); })];
            }
        });
    });
}
