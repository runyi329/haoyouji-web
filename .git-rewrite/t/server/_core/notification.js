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
exports.notifyOwner = notifyOwner;
var server_1 = require("@trpc/server");
var env_1 = require("./env");
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 20000;
var trimValue = function (value) { return value.trim(); };
var isNonEmptyString = function (value) {
    return typeof value === "string" && value.trim().length > 0;
};
var buildEndpointUrl = function (baseUrl) {
    var normalizedBase = baseUrl.endsWith("/")
        ? baseUrl
        : "".concat(baseUrl, "/");
    return new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();
};
var validatePayload = function (input) {
    if (!isNonEmptyString(input.title)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification title is required.",
        });
    }
    if (!isNonEmptyString(input.content)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification content is required.",
        });
    }
    var title = trimValue(input.title);
    var content = trimValue(input.content);
    if (title.length > TITLE_MAX_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification title must be at most ".concat(TITLE_MAX_LENGTH, " characters."),
        });
    }
    if (content.length > CONTENT_MAX_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Notification content must be at most ".concat(CONTENT_MAX_LENGTH, " characters."),
        });
    }
    return { title: title, content: content };
};
/**
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
function notifyOwner(payload) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, title, content, endpoint, response, detail, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = validatePayload(payload), title = _a.title, content = _a.content;
                    if (!env_1.ENV.forgeApiUrl) {
                        throw new server_1.TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: "Notification service URL is not configured.",
                        });
                    }
                    if (!env_1.ENV.forgeApiKey) {
                        throw new server_1.TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: "Notification service API key is not configured.",
                        });
                    }
                    endpoint = buildEndpointUrl(env_1.ENV.forgeApiUrl);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, fetch(endpoint, {
                            method: "POST",
                            headers: {
                                accept: "application/json",
                                authorization: "Bearer ".concat(env_1.ENV.forgeApiKey),
                                "content-type": "application/json",
                                "connect-protocol-version": "1",
                            },
                            body: JSON.stringify({ title: title, content: content }),
                        })];
                case 2:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.text().catch(function () { return ""; })];
                case 3:
                    detail = _b.sent();
                    console.warn("[Notification] Failed to notify owner (".concat(response.status, " ").concat(response.statusText, ")").concat(detail ? ": ".concat(detail) : ""));
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/, true];
                case 5:
                    error_1 = _b.sent();
                    console.warn("[Notification] Error calling notification service:", error_1);
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
