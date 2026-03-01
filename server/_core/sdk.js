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
exports.sdk = void 0;
var const_1 = require("@shared/const");
var errors_1 = require("@shared/_core/errors");
var cookie_1 = require("cookie");
var jose_1 = require("jose");
var db = require("../db");
var env_1 = require("./env");
// Utility function
var isNonEmptyString = function (value) {
    return typeof value === "string" && value.length > 0;
};
var SDKServer = /** @class */ (function () {
    function SDKServer() {
    }
    SDKServer.prototype.parseCookies = function (cookieHeader) {
        if (!cookieHeader) {
            return new Map();
        }
        var parsed = (0, cookie_1.parse)(cookieHeader);
        return new Map(Object.entries(parsed));
    };
    SDKServer.prototype.getSessionSecret = function () {
        var secret = env_1.ENV.cookieSecret;
        return new TextEncoder().encode(secret);
    };
    /**
     * Create a session token for a user openId
     * @example
     * const sessionToken = await sdk.createSessionToken(userInfo.openId);
     */
    SDKServer.prototype.createSessionToken = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.signSession({
                        userId: userId,
                        appId: "local-app",
                        name: options.name || "",
                    }, options)];
            });
        });
    };
    SDKServer.prototype.signSession = function (payload_1) {
        return __awaiter(this, arguments, void 0, function (payload, options) {
            var issuedAt, expiresInMs, expirationSeconds, secretKey;
            var _a;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_b) {
                issuedAt = Date.now();
                expiresInMs = (_a = options.expiresInMs) !== null && _a !== void 0 ? _a : const_1.ONE_YEAR_MS;
                expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
                secretKey = this.getSessionSecret();
                return [2 /*return*/, new jose_1.SignJWT({
                        userId: payload.userId,
                        appId: payload.appId,
                        name: payload.name,
                    })
                        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
                        .setExpirationTime(expirationSeconds)
                        .sign(secretKey)];
            });
        });
    };
    SDKServer.prototype.verifySession = function (cookieValue) {
        return __awaiter(this, void 0, void 0, function () {
            var secretKey, payload, _a, userId, appId, name_1, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!cookieValue) {
                            console.warn("[Auth] Missing session cookie");
                            return [2 /*return*/, null];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        secretKey = this.getSessionSecret();
                        return [4 /*yield*/, (0, jose_1.jwtVerify)(cookieValue, secretKey, {
                                algorithms: ["HS256"],
                            })];
                    case 2:
                        payload = (_b.sent()).payload;
                        _a = payload, userId = _a.userId, appId = _a.appId, name_1 = _a.name;
                        if (!isNonEmptyString(userId) ||
                            !isNonEmptyString(appId) ||
                            typeof name_1 !== 'string') {
                            console.warn("[Auth] Session payload missing required fields", { userId: userId, appId: appId, name: name_1 });
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, {
                                userId: userId,
                                appId: appId,
                                name: name_1,
                            }];
                    case 3:
                        error_1 = _b.sent();
                        console.warn("[Auth] Session verification failed", String(error_1));
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    SDKServer.prototype.authenticateRequest = function (req) {
        return __awaiter(this, void 0, void 0, function () {
            var cookies, sessionCookie, authHeader, session, sessionUserId, signedInAt, user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cookies = this.parseCookies(req.headers.cookie);
                        sessionCookie = cookies.get(const_1.COOKIE_NAME);
                        // 如果 Cookie 中没有 token，尝试从 Authorization header 读取（备用方案）
                        if (!sessionCookie) {
                            authHeader = req.headers.authorization;
                            if (authHeader && authHeader.startsWith('Bearer ')) {
                                sessionCookie = authHeader.substring(7); // 移除 "Bearer " 前缀
                                console.log('[Auth] Using token from Authorization header (Cookie fallback)');
                            }
                        }
                        return [4 /*yield*/, this.verifySession(sessionCookie)];
                    case 1:
                        session = _a.sent();
                        if (!session) {
                            throw (0, errors_1.ForbiddenError)("Invalid session cookie");
                        }
                        sessionUserId = session.userId;
                        signedInAt = new Date();
                        return [4 /*yield*/, db.getUserById(parseInt(sessionUserId))];
                    case 2:
                        user = _a.sent();
                        if (!user) {
                            throw (0, errors_1.ForbiddenError)("User not found");
                        }
                        return [4 /*yield*/, db.updateUserLastSignedIn(user.id, signedInAt)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, user];
                }
            });
        });
    };
    return SDKServer;
}());
exports.sdk = new SDKServer();
