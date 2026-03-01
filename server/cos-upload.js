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
exports.uploadImageToCOS = uploadImageToCOS;
exports.deleteImageFromCOS = deleteImageFromCOS;
exports.batchUploadImagesToCOS = batchUploadImagesToCOS;
var cos_nodejs_sdk_v5_1 = require("cos-nodejs-sdk-v5");
var crypto_1 = require("crypto");
var cos = new cos_nodejs_sdk_v5_1.default({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY,
});
var BUCKET = process.env.COS_BUCKET;
var REGION = process.env.COS_REGION;
/**
 * 上传图片到腾讯云COS
 * @param imageData base64编码的图片数据或Buffer
 * @param folder 存储文件夹 (avatars, ledger-photos等)
 * @param filename 可选的文件名,不提供则自动生成
 * @returns 上传后的公网URL
 */
function uploadImageToCOS(imageData_1) {
    return __awaiter(this, arguments, void 0, function (imageData, folder, filename) {
        var buffer, contentType, matches, hash, timestamp, ext, key, result, url, error_1;
        if (folder === void 0) { folder = 'avatars'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    buffer = void 0;
                    contentType = 'image/jpeg';
                    if (typeof imageData === 'string') {
                        matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
                        if (matches) {
                            contentType = "image/".concat(matches[1]);
                            buffer = Buffer.from(matches[2], 'base64');
                        }
                        else if (imageData.startsWith('data:')) {
                            throw new Error('不支持的图片格式');
                        }
                        else {
                            // 纯base64字符串
                            buffer = Buffer.from(imageData, 'base64');
                        }
                    }
                    else {
                        buffer = imageData;
                    }
                    hash = crypto_1.default.createHash('md5').update(buffer).digest('hex');
                    timestamp = Date.now();
                    ext = contentType.split('/')[1] || 'jpg';
                    key = filename || "".concat(folder, "/").concat(timestamp, "-").concat(hash, ".").concat(ext);
                    return [4 /*yield*/, cos.putObject({
                            Bucket: BUCKET,
                            Region: REGION,
                            Key: key,
                            Body: buffer,
                            ContentType: contentType,
                        })];
                case 1:
                    result = _a.sent();
                    url = "https://".concat(BUCKET, ".cos.").concat(REGION, ".myqcloud.com/").concat(key);
                    console.log('[COS] 上传成功:', url);
                    return [2 /*return*/, url];
                case 2:
                    error_1 = _a.sent();
                    console.error('[COS] 上传失败:', error_1);
                    throw new Error("\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ".concat(error_1 instanceof Error ? error_1.message : '未知错误'));
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 从COS删除文件
 * @param url 完整的COS URL
 */
function deleteImageFromCOS(url) {
    return __awaiter(this, void 0, void 0, function () {
        var urlObj, key, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    urlObj = new URL(url);
                    key = urlObj.pathname.substring(1);
                    return [4 /*yield*/, cos.deleteObject({
                            Bucket: BUCKET,
                            Region: REGION,
                            Key: key,
                        })];
                case 1:
                    _a.sent();
                    console.log('[COS] 删除成功:', key);
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error('[COS] 删除失败:', error_2);
                    throw new Error("\u56FE\u7247\u5220\u9664\u5931\u8D25: ".concat(error_2 instanceof Error ? error_2.message : '未知错误'));
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量上传图片
 * @param images 图片数据数组
 * @param folder 存储文件夹
 * @returns 上传后的URL数组
 */
function batchUploadImagesToCOS(images_1) {
    return __awaiter(this, arguments, void 0, function (images, folder) {
        var results;
        if (folder === void 0) { folder = 'avatars'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.all(images.map(function (img) { return uploadImageToCOS(img.data, folder, img.filename); }))];
                case 1:
                    results = _a.sent();
                    return [2 /*return*/, results];
            }
        });
    });
}
