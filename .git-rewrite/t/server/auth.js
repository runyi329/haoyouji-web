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
exports.MAX_FAILED_ATTEMPTS_BEFORE_LOCK = exports.MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.loginWithPassword = loginWithPassword;
exports.registerWithPassword = registerWithPassword;
var bcryptjs_1 = require("bcryptjs");
var db = require("./db");
var SALT_ROUNDS = 10;
var MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA = 3;
exports.MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA = MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA;
var MAX_FAILED_ATTEMPTS_BEFORE_LOCK = 10;
exports.MAX_FAILED_ATTEMPTS_BEFORE_LOCK = MAX_FAILED_ATTEMPTS_BEFORE_LOCK;
function hashPassword(password) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.hash(password, SALT_ROUNDS)];
        });
    });
}
function verifyPassword(password, hash) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.compare(password, hash)];
        });
    });
}
function loginWithPassword(username, password, ipAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var recentAttempts, ipFailedCount, requiresCaptcha, user, isValid, newFailedCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getRecentLoginAttempts(ipAddress, 30)];
                case 1:
                    recentAttempts = _a.sent();
                    ipFailedCount = recentAttempts.length;
                    requiresCaptcha = ipFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA;
                    // 查找用户
                    console.log("[loginWithPassword] \u5F00\u59CB\u67E5\u8BE2\u7528\u6237: ".concat(username));
                    return [4 /*yield*/, db.getUserByUsername(username)];
                case 2:
                    user = _a.sent();
                    console.log("[loginWithPassword] \u67E5\u8BE2\u7ED3\u679C:", user ? "\u627E\u5230\u7528\u6237 ID=".concat(user.id) : '未找到用户');
                    if (!!user) return [3 /*break*/, 4];
                    // 记录失败尝试
                    return [4 /*yield*/, db.recordLoginAttempt({
                            ipAddress: ipAddress,
                            username: username,
                            success: 0,
                        })];
                case 3:
                    // 记录失败尝试
                    _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: "用户名或密码错误",
                            requiresCaptcha: requiresCaptcha,
                            remainingAttempts: MAX_FAILED_ATTEMPTS_BEFORE_LOCK - ipFailedCount - 1,
                        }];
                case 4:
                    // 检查账户是否被锁定
                    if (user.isLocked) {
                        return [2 /*return*/, {
                                success: false,
                                error: "账户已被锁定，请联系管理员解锁",
                                isLocked: true,
                            }];
                    }
                    // 验证密码
                    if (!user.passwordHash) {
                        return [2 /*return*/, {
                                success: false,
                                error: "此账户未设置密码登录",
                            }];
                    }
                    console.log("[loginWithPassword] \u5F00\u59CB\u9A8C\u8BC1\u5BC6\u7801...");
                    return [4 /*yield*/, verifyPassword(password, user.passwordHash)];
                case 5:
                    isValid = _a.sent();
                    console.log("[loginWithPassword] \u5BC6\u7801\u9A8C\u8BC1\u7ED3\u679C:", isValid ? '✅ 成功' : '❌ 失败');
                    if (!!isValid) return [3 /*break*/, 10];
                    newFailedCount = (user.failedLoginAttempts || 0) + 1;
                    return [4 /*yield*/, db.updateUserLoginAttempts(user.id, newFailedCount, new Date())];
                case 6:
                    _a.sent();
                    // 记录失败尝试
                    return [4 /*yield*/, db.recordLoginAttempt({
                            ipAddress: ipAddress,
                            username: username,
                            success: 0,
                        })];
                case 7:
                    // 记录失败尝试
                    _a.sent();
                    if (!(newFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_LOCK)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db.lockUser(user.id)];
                case 8:
                    _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: "登录失败次数过多，账户已被锁定",
                            isLocked: true,
                        }];
                case 9: return [2 /*return*/, {
                        success: false,
                        error: "用户名或密码错误",
                        requiresCaptcha: newFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA,
                        remainingAttempts: MAX_FAILED_ATTEMPTS_BEFORE_LOCK - newFailedCount,
                    }];
                case 10: 
                // 登录成功，重置失败次数
                return [4 /*yield*/, db.updateUserLoginAttempts(user.id, 0)];
                case 11:
                    // 登录成功，重置失败次数
                    _a.sent();
                    // 记录成功登录
                    return [4 /*yield*/, db.recordLoginAttempt({
                            ipAddress: ipAddress,
                            username: username,
                            success: 1,
                        })];
                case 12:
                    // 记录成功登录
                    _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                name: user.name,
                                role: user.role,
                            },
                        }];
            }
        });
    });
}
function registerWithPassword(username, password, name, email) {
    return __awaiter(this, void 0, void 0, function () {
        var existingUser, passwordHash, userId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getUserByUsername(username)];
                case 1:
                    existingUser = _a.sent();
                    if (existingUser) {
                        return [2 /*return*/, {
                                success: false,
                                error: "用户名已存在",
                            }];
                    }
                    // 验证用户名格式
                    if (username.length < 1 || username.length > 20) {
                        return [2 /*return*/, {
                                success: false,
                                error: "用户名长度需要在1-20个字符之间",
                            }];
                    }
                    // 允许汉字、字母、数字和下划线
                    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(username)) {
                        return [2 /*return*/, {
                                success: false,
                                error: "用户名只能包含汉字、字母、数字和下划线",
                            }];
                    }
                    // 验证密码强度
                    if (password.length < 6) {
                        return [2 /*return*/, {
                                success: false,
                                error: "密码长度至少6个字符",
                            }];
                    }
                    return [4 /*yield*/, hashPassword(password)];
                case 2:
                    passwordHash = _a.sent();
                    return [4 /*yield*/, db.createUserWithPassword({
                            username: username,
                            passwordHash: passwordHash,
                            name: name,
                            email: email,
                        })];
                case 3:
                    userId = _a.sent();
                    if (!userId) {
                        return [2 /*return*/, {
                                success: false,
                                error: "创建用户失败",
                            }];
                    }
                    return [2 /*return*/, {
                            success: true,
                            userId: userId,
                        }];
            }
        });
    });
}
