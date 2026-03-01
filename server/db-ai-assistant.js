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
exports.queryWithAI = queryWithAI;
exports.getAssistantPrompts = getAssistantPrompts;
exports.saveAssistantPrompts = saveAssistantPrompts;
exports.getToolsList = getToolsList;
exports.getApiKeysStatus = getApiKeysStatus;
var db_1 = require("./db");
var ai_tools_1 = require("./ai-tools");
// 数据库会话功能已禁用
// import {
//   createSession,
//   saveMessage,
//   autoGenerateSessionTitle,
//   getSessionHistory,
// } from "./db-ai-sessions";
var db_points_1 = require("./db-points");
/**
 * 使用AI查询人脉信息（支持Function Calling）
 * @param userId 用户ID
 * @param query 用户查询
 * @param history 对话历史（可选）
 * @returns AI分析结果
 */
function queryWithAI(userId, query, sessionId, history) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, currentSessionId, systemPrompt, tools, messages, maxIterations, iteration, totalPromptTokens, totalCompletionTokens, totalTokens, _loop_1, state_1, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    apiKey = process.env.DEEPSEEK_API_KEY;
                    if (!apiKey) {
                        throw new Error("DEEPSEEK_API_KEY 环境变量未配置，请联系管理员配置");
                    }
                    currentSessionId = sessionId || Date.now();
                    return [4 /*yield*/, buildSystemPrompt()];
                case 1:
                    systemPrompt = _b.sent();
                    tools = [
                        {
                            type: "function",
                            function: {
                                name: "searchContacts",
                                description: "搜索人脉。可以按姓名、公司、地区、职位等条件搜索。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "姓名（支持模糊搜索）" },
                                        company: { type: "string", description: "公司名称（支持模糊搜索）" },
                                        region: { type: "string", description: "地区（支持模糊搜索）" },
                                        position: { type: "string", description: "职位（支持模糊搜索）" },
                                    },
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "countContacts",
                                description: "统计人脉数量。可以按地区、公司等条件统计。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        region: { type: "string", description: "地区（可选）" },
                                        company: { type: "string", description: "公司（可选）" },
                                    },
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "addContact",
                                description: "添加新的人脉。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "姓名（必填）" },
                                        phone: { type: "string", description: "电话" },
                                        company: { type: "string", description: "公司" },
                                        position: { type: "string", description: "职位" },
                                        region: { type: "string", description: "地区" },
                                        gender: { type: "string", description: "性别" },
                                    },
                                    required: ["name"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "updateContact",
                                description: "修改人脉信息。需要提供人脉ID和要修改的字段。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        name: { type: "string", description: "姓名" },
                                        phone: { type: "string", description: "电话" },
                                        company: { type: "string", description: "公司" },
                                        position: { type: "string", description: "职位" },
                                        region: { type: "string", description: "地区" },
                                        gender: { type: "string", description: "性别" },
                                    },
                                    required: ["contactId"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "deleteContact",
                                description: "删除人脉。需要提供人脉ID。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                    },
                                    required: ["contactId"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "addContactInteraction",
                                description: "为人脉添加联络记录（打卡）。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        note: { type: "string", description: "联络备注" },
                                    },
                                    required: ["contactId", "note"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "getEarliestContactDate",
                                description: "获取最早的人脉创建时间，用于计算使用天数。",
                                parameters: {
                                    type: "object",
                                    properties: {},
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "getContactDetail",
                                description: "获取人脉的详细信息，包括扩展字段和标签。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                    },
                                    required: ["contactId"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "addTagToContact",
                                description: "为人脉添加标签。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        tagName: { type: "string", description: "标签名称" },
                                    },
                                    required: ["contactId", "tagName"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "removeTagFromContact",
                                description: "从人脉移除标签。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        tagName: { type: "string", description: "标签名称" },
                                    },
                                    required: ["contactId", "tagName"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "updateContactField",
                                description: "添加或更新人脉的扩展字段（如银行卡、生日、微信等）。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        categoryName: { type: "string", description: "字段分类名称（如「银行卡」、「生日」、「微信」）" },
                                        value: { type: "string", description: "字段值" },
                                    },
                                    required: ["contactId", "categoryName", "value"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "deleteContactField",
                                description: "删除人脉的扩展字段。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        categoryName: { type: "string", description: "字段分类名称" },
                                    },
                                    required: ["contactId", "categoryName"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "setContactReferrer",
                                description: "设置人脉的推荐人。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        contactId: { type: "number", description: "人脉ID" },
                                        referrerName: { type: "string", description: "推荐人姓名" },
                                    },
                                    required: ["contactId", "referrerName"],
                                },
                            },
                        },
                        {
                            type: "function",
                            function: {
                                name: "queryCompanyInfo",
                                description: "查询企业工商信息，包括公司名称、注册资本、法人代表、成立时间、经营状态等。适用于了解企业背景、验证企业真实性。",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        searchKey: {
                                            type: "string",
                                            description: "搜索关键词，可以是公司名称、统一社会信用代码等"
                                        },
                                    },
                                    required: ["searchKey"],
                                },
                            },
                        },
                    ];
                    messages = [
                        { role: "system", content: systemPrompt },
                    ];
                    // 添加历史对话（如果有）
                    if (history && history.length > 0) {
                        messages.push.apply(messages, history);
                    }
                    // 添加当前用户查询
                    messages.push({ role: "user", content: query });
                    maxIterations = 5;
                    iteration = 0;
                    totalPromptTokens = 0;
                    totalCompletionTokens = 0;
                    totalTokens = 0;
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 6, , 7]);
                    console.log('[AI] Starting query with DeepSeek API');
                    console.log('[AI] API Key configured:', apiKey ? 'yes' : 'no');
                    _loop_1 = function () {
                        var controller, timeoutId, response, retryCount, maxRetries, _loop_2, state_2, errorText, data, assistantMessage, result, cost, balanceAfter, _i, _c, toolCall, functionName, functionArgs, functionResult, _d, error_2;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    iteration++;
                                    console.log("[AI] Iteration ".concat(iteration, "/").concat(maxIterations));
                                    controller = new AbortController();
                                    timeoutId = setTimeout(function () { return controller.abort(); }, 30000);
                                    response = void 0;
                                    retryCount = 0;
                                    maxRetries = 3;
                                    _loop_2 = function () {
                                        var fetchError_1, waitTime_1;
                                        return __generator(this, function (_f) {
                                            switch (_f.label) {
                                                case 0:
                                                    _f.trys.push([0, 2, , 4]);
                                                    console.log("[AI] Attempt ".concat(retryCount + 1, "/").concat(maxRetries + 1, " to call DeepSeek API"));
                                                    return [4 /*yield*/, fetch("https://api.deepseek.com/v1/chat/completions", {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                Authorization: "Bearer ".concat(apiKey),
                                                            },
                                                            body: JSON.stringify({
                                                                model: "deepseek-chat",
                                                                messages: messages,
                                                                tools: tools,
                                                                temperature: 0.7,
                                                                max_tokens: 2000,
                                                            }),
                                                            signal: controller.signal,
                                                        })];
                                                case 1:
                                                    response = _f.sent();
                                                    clearTimeout(timeoutId);
                                                    return [2 /*return*/, "break"];
                                                case 2:
                                                    fetchError_1 = _f.sent();
                                                    clearTimeout(timeoutId);
                                                    console.error("[AI] Fetch attempt ".concat(retryCount + 1, " failed:"), {
                                                        name: fetchError_1.name,
                                                        message: fetchError_1.message,
                                                        cause: fetchError_1.cause,
                                                    });
                                                    if (fetchError_1.name === 'AbortError') {
                                                        throw new Error('AI请求超时，请稍后重试');
                                                    }
                                                    retryCount++;
                                                    if (retryCount > maxRetries) {
                                                        console.error('[AI] All retry attempts failed');
                                                        throw new Error("\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u5DF2\u91CD\u8BD5".concat(maxRetries, "\u6B21\u3002\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u6216\u7A0D\u540E\u518D\u8BD5\u3002"));
                                                    }
                                                    waitTime_1 = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                                                    console.log("[AI] Waiting ".concat(waitTime_1, "ms before retry..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, waitTime_1); })];
                                                case 3:
                                                    _f.sent();
                                                    return [3 /*break*/, 4];
                                                case 4: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _e.label = 1;
                                case 1:
                                    if (!(retryCount <= maxRetries)) return [3 /*break*/, 3];
                                    return [5 /*yield**/, _loop_2()];
                                case 2:
                                    state_2 = _e.sent();
                                    if (state_2 === "break")
                                        return [3 /*break*/, 3];
                                    return [3 /*break*/, 1];
                                case 3:
                                    if (!!response.ok) return [3 /*break*/, 5];
                                    return [4 /*yield*/, response.text()];
                                case 4:
                                    errorText = _e.sent();
                                    console.error("[AI] DeepSeek API error:", {
                                        status: response.status,
                                        statusText: response.statusText,
                                        body: errorText
                                    });
                                    throw new Error("DeepSeek API \u9519\u8BEF (".concat(response.status, "): ").concat(errorText.substring(0, 100)));
                                case 5: return [4 /*yield*/, response.json()];
                                case 6:
                                    data = _e.sent();
                                    assistantMessage = (_a = data.choices[0]) === null || _a === void 0 ? void 0 : _a.message;
                                    if (!assistantMessage) {
                                        throw new Error("AI未能生成有效回复");
                                    }
                                    // 累积token使用量
                                    if (data.usage) {
                                        totalPromptTokens += data.usage.prompt_tokens || 0;
                                        totalCompletionTokens += data.usage.completion_tokens || 0;
                                        totalTokens += data.usage.total_tokens || 0;
                                        console.log("[AI] Iteration ".concat(iteration, " usage:"), data.usage);
                                    }
                                    messages.push(assistantMessage);
                                    // 如果AI没有调用工具，直接返回结果
                                    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                                        result = assistantMessage.content || "AI未能生成有效回复";
                                        cost = (0, db_points_1.calculateAICost)(totalPromptTokens, totalCompletionTokens);
                                        console.log("[AI] Total usage - Prompt: ".concat(totalPromptTokens, ", Completion: ").concat(totalCompletionTokens, ", Total: ").concat(totalTokens, ", Cost: ").concat(cost));
                                        balanceAfter = 0;
                                        return [2 /*return*/, { value: {
                                                    result: result,
                                                    tokensUsed: totalTokens,
                                                    cost: cost,
                                                    balanceAfter: balanceAfter,
                                                    sessionId: currentSessionId,
                                                } }];
                                    }
                                    _i = 0, _c = assistantMessage.tool_calls;
                                    _e.label = 7;
                                case 7:
                                    if (!(_i < _c.length)) return [3 /*break*/, 42];
                                    toolCall = _c[_i];
                                    functionName = toolCall.function.name;
                                    functionArgs = JSON.parse(toolCall.function.arguments);
                                    console.log("[AI Tool Call] ".concat(functionName), functionArgs);
                                    functionResult = void 0;
                                    _e.label = 8;
                                case 8:
                                    _e.trys.push([8, 39, , 40]);
                                    _d = functionName;
                                    switch (_d) {
                                        case "searchContacts": return [3 /*break*/, 9];
                                        case "countContacts": return [3 /*break*/, 11];
                                        case "addContact": return [3 /*break*/, 13];
                                        case "updateContact": return [3 /*break*/, 15];
                                        case "deleteContact": return [3 /*break*/, 17];
                                        case "addContactInteraction": return [3 /*break*/, 19];
                                        case "getEarliestContactDate": return [3 /*break*/, 21];
                                        case "getContactDetail": return [3 /*break*/, 23];
                                        case "addTagToContact": return [3 /*break*/, 25];
                                        case "removeTagFromContact": return [3 /*break*/, 27];
                                        case "updateContactField": return [3 /*break*/, 29];
                                        case "deleteContactField": return [3 /*break*/, 31];
                                        case "setContactReferrer": return [3 /*break*/, 33];
                                        case "queryCompanyInfo": return [3 /*break*/, 35];
                                    }
                                    return [3 /*break*/, 37];
                                case 9: return [4 /*yield*/, (0, ai_tools_1.searchContacts)(userId, functionArgs)];
                                case 10:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 11: return [4 /*yield*/, (0, ai_tools_1.countContacts)(userId, functionArgs)];
                                case 12:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 13: return [4 /*yield*/, (0, ai_tools_1.addContact)(userId, functionArgs)];
                                case 14:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 15: return [4 /*yield*/, (0, ai_tools_1.updateContact)(userId, functionArgs.contactId, functionArgs)];
                                case 16:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 17: return [4 /*yield*/, (0, ai_tools_1.deleteContact)(userId, functionArgs.contactId)];
                                case 18:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 19: return [4 /*yield*/, (0, ai_tools_1.addContactInteraction)(userId, functionArgs.contactId, functionArgs.note)];
                                case 20:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 21: return [4 /*yield*/, (0, ai_tools_1.getEarliestContactDate)(userId)];
                                case 22:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 23: return [4 /*yield*/, (0, ai_tools_1.getContactDetail)(userId, functionArgs.contactId)];
                                case 24:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 25: return [4 /*yield*/, (0, ai_tools_1.addTagToContact)(userId, functionArgs.contactId, functionArgs.tagName)];
                                case 26:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 27: return [4 /*yield*/, (0, ai_tools_1.removeTagFromContact)(userId, functionArgs.contactId, functionArgs.tagName)];
                                case 28:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 29: return [4 /*yield*/, (0, ai_tools_1.updateContactField)(userId, functionArgs.contactId, functionArgs.categoryName, functionArgs.value)];
                                case 30:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 31: return [4 /*yield*/, (0, ai_tools_1.deleteContactField)(userId, functionArgs.contactId, functionArgs.categoryName)];
                                case 32:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 33: return [4 /*yield*/, (0, ai_tools_1.setContactReferrer)(userId, functionArgs.contactId, functionArgs.referrerName)];
                                case 34:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 35: return [4 /*yield*/, (0, ai_tools_1.queryCompanyInfo)(functionArgs.searchKey)];
                                case 36:
                                    functionResult = _e.sent();
                                    return [3 /*break*/, 38];
                                case 37:
                                    functionResult = { error: "未知的函数调用" };
                                    _e.label = 38;
                                case 38: return [3 /*break*/, 40];
                                case 39:
                                    error_2 = _e.sent();
                                    functionResult = { error: error_2.message };
                                    return [3 /*break*/, 40];
                                case 40:
                                    // 将函数执行结果添加到消息历史
                                    messages.push({
                                        role: "tool",
                                        tool_call_id: toolCall.id,
                                        content: JSON.stringify(functionResult),
                                    });
                                    _e.label = 41;
                                case 41:
                                    _i++;
                                    return [3 /*break*/, 7];
                                case 42: return [2 /*return*/];
                            }
                        });
                    };
                    _b.label = 3;
                case 3:
                    if (!(iteration < maxIterations)) return [3 /*break*/, 5];
                    return [5 /*yield**/, _loop_1()];
                case 4:
                    state_1 = _b.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    return [3 /*break*/, 3];
                case 5: 
                // 如果达到最大迭代次数，返回错误
                throw new Error("AI调用次数过多，请简化您的问题");
                case 6:
                    error_1 = _b.sent();
                    console.error("[AI] Query error:", {
                        message: error_1.message,
                        stack: error_1.stack,
                        name: error_1.name
                    });
                    // 返回更友好的错误信息
                    if (error_1.message.includes('DEEPSEEK_API_KEY')) {
                        throw error_1; // 保留原始错误信息
                    }
                    if (error_1.message.includes('超时')) {
                        throw error_1; // 保留超时错误信息
                    }
                    throw new Error("AI\u67E5\u8BE2\u5931\u8D25: ".concat(error_1.message));
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取AI助手的提示词配置
 * @returns 提示词配置对象
 */
function getAssistantPrompts() {
    return __awaiter(this, void 0, void 0, function () {
        var db, prompts, result, rows, _i, _a, row;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.execute("SELECT section, content FROM ai_prompts WHERE type = 'assistant' AND is_active = 1 ORDER BY id")];
                case 2:
                    prompts = _b.sent();
                    result = {
                        segment1: "",
                        segment2: "",
                        segment3: "",
                        segment4: "",
                    };
                    rows = Array.isArray(prompts) ? prompts : (prompts.rows || []);
                    for (_i = 0, _a = rows; _i < _a.length; _i++) {
                        row = _a[_i];
                        result[row.section] = row.content;
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 保存AI助手的提示词配置
 * @param prompts 提示词配置对象
 */
function saveAssistantPrompts(prompts) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, _a, _b, section, content;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    _i = 0, _a = Object.entries(prompts);
                    _c.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    _b = _a[_i], section = _b[0], content = _b[1];
                    return [4 /*yield*/, db.execute("INSERT INTO ai_prompts (type, section, content) \n       VALUES ('assistant', ?, ?) \n       ON DUPLICATE KEY UPDATE content = ?, updated_at = NOW()", [section, content, content])];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 构建完整的系统提示词
 * @returns 完整的系统提示词
 */
function buildSystemPrompt() {
    return __awaiter(this, void 0, void 0, function () {
        var prompts, systemPrompt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAssistantPrompts()];
                case 1:
                    prompts = _a.sent();
                    systemPrompt = "".concat(prompts.segment1, "\n\n").concat(prompts.segment2, "\n\n").concat(prompts.segment3, "\n\n").concat(prompts.segment4);
                    return [2 /*return*/, systemPrompt];
            }
        });
    });
}
/**
 * 获取AI工具列表
 * @returns 工具列表
 */
function getToolsList() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // 返回所有可用的工具定义
            return [2 /*return*/, {
                    tools: [
                        {
                            name: "searchContacts",
                            description: "搜索人脉。可以按姓名、公司、地区、职位等条件搜索。",
                            category: "人脉管理",
                            parameters: [
                                { name: "name", type: "string", description: "姓名（支持模糊搜索）", required: false },
                                { name: "company", type: "string", description: "公司名称（支持模糊搜索）", required: false },
                                { name: "region", type: "string", description: "地区（支持模糊搜索）", required: false },
                                { name: "position", type: "string", description: "职位（支持模糊搜索）", required: false },
                            ]
                        },
                        {
                            name: "countContacts",
                            description: "统计人脉数量。可以按地区、公司等条件统计。",
                            category: "人脉管理",
                            parameters: [
                                { name: "region", type: "string", description: "地区（可选）", required: false },
                                { name: "company", type: "string", description: "公司（可选）", required: false },
                            ]
                        },
                        {
                            name: "addContact",
                            description: "添加新的人脉。",
                            category: "人脉管理",
                            parameters: [
                                { name: "name", type: "string", description: "姓名（必填）", required: true },
                                { name: "phone", type: "string", description: "电话", required: false },
                                { name: "company", type: "string", description: "公司", required: false },
                                { name: "position", type: "string", description: "职位", required: false },
                                { name: "region", type: "string", description: "地区", required: false },
                                { name: "gender", type: "string", description: "性别", required: false },
                            ]
                        },
                        {
                            name: "updateContact",
                            description: "修改人脉信息。需要提供人脉ID和要修改的字段。",
                            category: "人脉管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "name", type: "string", description: "姓名", required: false },
                                { name: "phone", type: "string", description: "电话", required: false },
                                { name: "company", type: "string", description: "公司", required: false },
                                { name: "position", type: "string", description: "职位", required: false },
                                { name: "region", type: "string", description: "地区", required: false },
                                { name: "gender", type: "string", description: "性别", required: false },
                            ]
                        },
                        {
                            name: "deleteContact",
                            description: "删除人脉。需要提供人脉ID。",
                            category: "人脉管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                            ]
                        },
                        {
                            name: "addContactInteraction",
                            description: "为人脉添加联络记录（打卡）。",
                            category: "人脉管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "note", type: "string", description: "联络备注", required: true },
                            ]
                        },
                        {
                            name: "getEarliestContactDate",
                            description: "获取最早的人脉创建时间，用于计算使用天数。",
                            category: "人脉管理",
                            parameters: []
                        },
                        {
                            name: "getContactDetail",
                            description: "获取人脉的详细信息，包括扩展字段和标签。",
                            category: "人脉管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                            ]
                        },
                        {
                            name: "addTagToContact",
                            description: "为人脉添加标签。",
                            category: "标签管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "tagName", type: "string", description: "标签名称", required: true },
                            ]
                        },
                        {
                            name: "removeTagFromContact",
                            description: "从人脉移除标签。",
                            category: "标签管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "tagName", type: "string", description: "标签名称", required: true },
                            ]
                        },
                        {
                            name: "updateContactField",
                            description: "添加或更新人脉的扩展字段（如银行卡、生日、微信等）。",
                            category: "扩展字段",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "categoryName", type: "string", description: "字段分类名称（如「银行卡」、「生日」、「微信」）", required: true },
                                { name: "value", type: "string", description: "字段值", required: true },
                            ]
                        },
                        {
                            name: "deleteContactField",
                            description: "删除人脉的扩展字段。",
                            category: "扩展字段",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "categoryName", type: "string", description: "字段分类名称", required: true },
                            ]
                        },
                        {
                            name: "setContactReferrer",
                            description: "设置人脉的推荐人。",
                            category: "人脉管理",
                            parameters: [
                                { name: "contactId", type: "number", description: "人脉ID", required: true },
                                { name: "referrerName", type: "string", description: "推荐人姓名", required: true },
                            ]
                        },
                        {
                            name: "queryCompanyInfo",
                            description: "查询企业工商信息，包括公司名称、注册资本、法人代表、成立时间、经营状态等。适用于了解企业背景、验证企业真实性。",
                            category: "企业查询",
                            parameters: [
                                { name: "searchKey", type: "string", description: "搜索关键词，可以是公司名称、统一社会信用代码等", required: true },
                            ]
                        },
                    ]
                }];
        });
    });
}
/**
 * 获取API密钥配置状态
 * @returns API密钥状态
 */
function getApiKeysStatus() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, {
                    apiKeys: [
                        {
                            name: "DEEPSEEK_API_KEY",
                            description: "DeepSeek AI API密钥",
                            configured: !!process.env.DEEPSEEK_API_KEY,
                            value: process.env.DEEPSEEK_API_KEY ? "".concat(process.env.DEEPSEEK_API_KEY.substring(0, 10), "...") : null,
                        },
                        {
                            name: "QICHACHA_APP_KEY",
                            description: "企查查 APP KEY",
                            configured: !!process.env.QICHACHA_APP_KEY,
                            value: process.env.QICHACHA_APP_KEY || null,
                        },
                        {
                            name: "QICHACHA_SECRET_KEY",
                            description: "企查查 SECRET KEY",
                            configured: !!process.env.QICHACHA_SECRET_KEY,
                            value: process.env.QICHACHA_SECRET_KEY ? "".concat(process.env.QICHACHA_SECRET_KEY.substring(0, 10), "...") : null,
                        },
                    ]
                }];
        });
    });
}
