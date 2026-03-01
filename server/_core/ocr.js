"use strict";
/**
 * OCR文字识别服务
 * 使用Manus内置的LLM视觉能力进行文字识别
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
exports.recognizeText = recognizeText;
exports.extractWords = extractWords;
exports.extractWordsWithLLM = extractWordsWithLLM;
var llm_1 = require("./llm");
/**
 * 从图片中识别文字
 * @param imageUrl 图片URL（支持公网URL或base64）
 * @param contentType 内容类型（character=单字, word=词语, english=英文单词）
 * @returns 识别结果
 */
function recognizeText(imageUrl, contentType) {
    return __awaiter(this, void 0, void 0, function () {
        var response, recognizedText, hasChinese, hasEnglish, language, words, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, llm_1.invokeLLM)({
                            messages: [
                                {
                                    role: "system",
                                    content: "你是一个专业的OCR文字识别助手。请识别图片中的所有文字内容，保持原有格式和顺序。",
                                },
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "text",
                                            text: "请识别这张图片中的所有文字内容，按原有顺序输出。",
                                        },
                                        {
                                            type: "image_url",
                                            image_url: {
                                                url: imageUrl,
                                                detail: "high",
                                            },
                                        },
                                    ],
                                },
                            ],
                        })];
                case 1:
                    response = _c.sent();
                    recognizedText = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "";
                    hasChinese = /[\u4e00-\u9fa5]/.test(recognizedText);
                    hasEnglish = /[a-zA-Z]/.test(recognizedText);
                    language = "chinese";
                    if (hasChinese && hasEnglish) {
                        language = "mixed";
                    }
                    else if (hasEnglish && !hasChinese) {
                        language = "english";
                    }
                    words = extractWords(recognizedText, language);
                    // 根据contentType过滤结果
                    if (contentType) {
                        words = filterWordsByType(words, contentType);
                    }
                    return [2 /*return*/, {
                            text: recognizedText,
                            language: language,
                            words: words,
                        }];
                case 2:
                    error_1 = _c.sent();
                    console.error("[OCR] Failed to recognize text:", error_1);
                    throw new Error("文字识别失败，请重试");
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 从文本中提取词汇
 * @param text 文本内容
 * @param language 语言类型
 * @returns 词汇列表
 */
function extractWords(text, language) {
    var words = [];
    if (language === "english") {
        // 英文：按空格和标点分词
        var englishWords = text
            .split(/[\s,，.。!！?？;；:：\n]+/)
            .map(function (w) { return w.trim(); })
            .filter(function (w) { return w.length > 0 && /^[a-zA-Z]+$/.test(w); });
        words.push.apply(words, englishWords);
    }
    else if (language === "chinese") {
        // 中文：智能提取词汇
        // 步骤1：先按行和标点分割，提取已分隔的词汇
        var segments = text
            .split(/[\s\n,，.。!！?？;；:：、]+/)
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0 && /^[\u4e00-\u9fa5]+$/.test(s); });
        var chineseWords = [];
        // 步骤2：对每个片段进行处理
        for (var _i = 0, segments_1 = segments; _i < segments_1.length; _i++) {
            var segment = segments_1[_i];
            if (segment.length === 1) {
                // 单字：直接添加
                chineseWords.push(segment);
            }
            else if (segment.length >= 2 && segment.length <= 4) {
                // 2-4字：可能是完整词汇，直接添加
                chineseWords.push(segment);
            }
            else if (segment.length > 4) {
                // 长片段：使用滑动窗口提取2-4字组合
                for (var len = 2; len <= 4; len++) {
                    for (var i = 0; i <= segment.length - len; i++) {
                        var word = segment.substring(i, i + len);
                        chineseWords.push(word);
                    }
                }
            }
        }
        // 去重
        words.push.apply(words, Array.from(new Set(chineseWords)));
    }
    else {
        // 混合：分别提取中英文
        var englishWords = text
            .split(/[\s,，.。!！?？;；:：\n]+/)
            .map(function (w) { return w.trim(); })
            .filter(function (w) { return w.length > 0 && /^[a-zA-Z]+$/.test(w); });
        // 中文部分也使用智能提取
        var segments = text
            .replace(/[a-zA-Z]/g, ' ') // 移除英文字母
            .split(/[\s\n,，.。!！?？;；:：、]+/)
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0 && /^[\u4e00-\u9fa5]+$/.test(s); });
        var chineseWords = [];
        for (var _a = 0, segments_2 = segments; _a < segments_2.length; _a++) {
            var segment = segments_2[_a];
            if (segment.length === 1) {
                chineseWords.push(segment);
            }
            else if (segment.length >= 2 && segment.length <= 4) {
                chineseWords.push(segment);
            }
            else if (segment.length > 4) {
                for (var len = 2; len <= 4; len++) {
                    for (var i = 0; i <= segment.length - len; i++) {
                        var word = segment.substring(i, i + len);
                        chineseWords.push(word);
                    }
                }
            }
        }
        words.push.apply(words, __spreadArray(__spreadArray([], englishWords, false), Array.from(new Set(chineseWords)), false));
    }
    // 去重并限制数量
    return Array.from(new Set(words)).slice(0, 50);
}
/**
 * 使用LLM智能提取词汇（更准确但较慢）
 * @param text 文本内容
 * @returns 词汇列表
 */
function extractWordsWithLLM(text) {
    return __awaiter(this, void 0, void 0, function () {
        var response, content, result, error_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, llm_1.invokeLLM)({
                            messages: [
                                {
                                    role: "system",
                                    content: "你是一个词汇提取专家。从给定文本中提取适合儿童学习的词汇，包括名词、动词、形容词等。",
                                },
                                {
                                    role: "user",
                                    content: "\u8BF7\u4ECE\u4EE5\u4E0B\u6587\u672C\u4E2D\u63D0\u53D6\u9002\u5408\u513F\u7AE5\u5B66\u4E60\u7684\u8BCD\u6C47\uFF08\u4E2D\u65872-4\u5B57\uFF0C\u82F1\u6587\u5355\u8BCD\uFF09\uFF0C\u4EE5JSON\u6570\u7EC4\u683C\u5F0F\u8FD4\u56DE\uFF1A\n\n".concat(text),
                                },
                            ],
                            response_format: {
                                type: "json_schema",
                                json_schema: {
                                    name: "vocabulary_list",
                                    strict: true,
                                    schema: {
                                        type: "object",
                                        properties: {
                                            words: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "提取的词汇列表",
                                            },
                                        },
                                        required: ["words"],
                                        additionalProperties: false,
                                    },
                                },
                            },
                        })];
                case 1:
                    response = _c.sent();
                    content = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
                    if (!content)
                        return [2 /*return*/, []];
                    result = JSON.parse(content);
                    return [2 /*return*/, result.words || []];
                case 2:
                    error_2 = _c.sent();
                    console.error("[OCR] Failed to extract words with LLM:", error_2);
                    // 降级到简单提取
                    return [2 /*return*/, extractWords(text, "mixed")];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据内容类型过滤词汇
 * @param words 原始词汇列表
 * @param contentType 内容类型
 * @returns 过滤后的词汇列表
 */
function filterWordsByType(words, contentType) {
    // 拼音字符正则：包括基本拉丁字母和带声调的拼音字符
    // Unicode范围：
    // - a-z, A-Z: 基本拉丁字母
    // - \u0100-\u017F: 拉丁文扩展-A（包含 ā ē ī ō ū 等）
    // - \u01CD-\u01DC: 拉丁文扩展-B（包含 ǎ ě ǐ ǒ ǔ 等）
    // - \u0300-\u036F: 组合变音符号
    var pinyinRegex = /[a-zA-Z\u0100-\u017F\u01CD-\u01DC\u0300-\u036F]/;
    // 先过滤掉所有包含拼音字符的词汇
    var noPinyinWords = words.filter(function (word) { return !pinyinRegex.test(word); });
    if (contentType === "character") {
        // 只保留单个汉字，排除词语和英文
        return noPinyinWords.filter(function (word) {
            return /^[\u4e00-\u9fa5]$/.test(word);
        } // 单个汉字
        );
    }
    else if (contentType === "word") {
        // 只保留中文词语（2个字以上），排除单字和英文
        return noPinyinWords.filter(function (word) {
            return /^[\u4e00-\u9fa5]{2,}$/.test(word);
        } // 2个或以上汉字
        );
    }
    else if (contentType === "english") {
        // 英文类型：不过滤拼音，因为英文本身就包含这些字符
        return words.filter(function (word) {
            return /^[a-zA-Z]+$/.test(word);
        } // 纯英文单词
        );
    }
    return noPinyinWords;
}
