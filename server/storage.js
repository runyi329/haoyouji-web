"use strict";
// Preconfigured storage helpers for Manus WebDev templates
// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)
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
exports.storagePut = storagePut;
exports.storageGet = storageGet;
var env_1 = require("./_core/env");
function getStorageConfig() {
    var baseUrl = env_1.ENV.forgeApiUrl;
    var apiKey = env_1.ENV.forgeApiKey;
    if (!baseUrl || !apiKey) {
        throw new Error("Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
    var url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
    url.searchParams.set("path", normalizeKey(relKey));
    return url;
}
function buildDownloadUrl(baseUrl, relKey, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var downloadApiUrl, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
                    downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
                    return [4 /*yield*/, fetch(downloadApiUrl, {
                            method: "GET",
                            headers: buildAuthHeaders(apiKey),
                        })];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 2: return [2 /*return*/, (_a.sent()).url];
            }
        });
    });
}
function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : "".concat(value, "/");
}
function normalizeKey(relKey) {
    return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
    var blob = typeof data === "string"
        ? new Blob([data], { type: contentType })
        : new Blob([data], { type: contentType });
    var form = new FormData();
    form.append("file", blob, fileName || "file");
    return form;
}
function buildAuthHeaders(apiKey) {
    return { Authorization: "Bearer ".concat(apiKey) };
}
function storagePut(relKey_1, data_1) {
    return __awaiter(this, arguments, void 0, function (relKey, data, contentType) {
        var _a, baseUrl, apiKey, key, uploadUrl, formData, response, message, url;
        var _b;
        if (contentType === void 0) { contentType = "application/octet-stream"; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = getStorageConfig(), baseUrl = _a.baseUrl, apiKey = _a.apiKey;
                    key = normalizeKey(relKey);
                    uploadUrl = buildUploadUrl(baseUrl, key);
                    formData = toFormData(data, contentType, (_b = key.split("/").pop()) !== null && _b !== void 0 ? _b : key);
                    return [4 /*yield*/, fetch(uploadUrl, {
                            method: "POST",
                            headers: buildAuthHeaders(apiKey),
                            body: formData,
                        })];
                case 1:
                    response = _c.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text().catch(function () { return response.statusText; })];
                case 2:
                    message = _c.sent();
                    throw new Error("Storage upload failed (".concat(response.status, " ").concat(response.statusText, "): ").concat(message));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    url = (_c.sent()).url;
                    return [2 /*return*/, { key: key, url: url }];
            }
        });
    });
}
function storageGet(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, baseUrl, apiKey, key;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = getStorageConfig(), baseUrl = _a.baseUrl, apiKey = _a.apiKey;
                    key = normalizeKey(relKey);
                    _b = {
                        key: key
                    };
                    return [4 /*yield*/, buildDownloadUrl(baseUrl, key, apiKey)];
                case 1: return [2 /*return*/, (_b.url = _c.sent(),
                        _b)];
            }
        });
    });
}
