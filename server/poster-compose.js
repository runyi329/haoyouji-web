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
exports.composePosterWithQR = composePosterWithQR;
/**
 * 海报合成模块
 * 在服务器端使用sharp将二维码叠加到海报模板上，
 * 并将"邀请人：[username]"动态替换为实际用户名。
 *
 * 方案：自动检测海报中的品红色(#FF00FF)占位符区域，
 * 精确替换为用户专属二维码。
 *
 * 以后所有海报只需要在设计时放一个品红色方块作为二维码占位符，
 * 系统就能自动找到位置并精确替换，不需要手动配置坐标。
 *
 * 如果没有品红色占位符，则使用白色方块检测作为降级方案。
 */
var sharp_1 = require("sharp");
var qrcode_1 = require("qrcode");
var cos_upload_1 = require("./cos-upload");
/**
 * 在图片中检测特定颜色的矩形占位符区域
 * @param imageBuffer 图片Buffer
 * @param targetColor 目标颜色 {r, g, b}
 * @param tolerance 颜色容差（0-255）
 * @returns 占位符区域 {x, y, width, height} 或 null
 */
function detectPlaceholder(imageBuffer_1, targetColor_1) {
    return __awaiter(this, arguments, void 0, function (imageBuffer, targetColor, tolerance) {
        var _a, data, info, width, height, channels, minX, minY, maxX, maxY, matchCount, y, x, idx, r, g, b, regionWidth, regionHeight, error_1;
        if (tolerance === void 0) { tolerance = 30; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, sharp_1.default)(imageBuffer)
                            .raw()
                            .toBuffer({ resolveWithObject: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, info = _a.info;
                    width = info.width, height = info.height, channels = info.channels;
                    console.log("[\u5360\u4F4D\u7B26\u68C0\u6D4B] \u56FE\u7247\u5C3A\u5BF8: ".concat(width, "x").concat(height, ", \u901A\u9053\u6570: ").concat(channels));
                    minX = width, minY = height, maxX = 0, maxY = 0;
                    matchCount = 0;
                    for (y = 0; y < height; y++) {
                        for (x = 0; x < width; x++) {
                            idx = (y * width + x) * channels;
                            r = data[idx];
                            g = data[idx + 1];
                            b = data[idx + 2];
                            // 检查是否匹配目标颜色
                            if (Math.abs(r - targetColor.r) <= tolerance &&
                                Math.abs(g - targetColor.g) <= tolerance &&
                                Math.abs(b - targetColor.b) <= tolerance) {
                                matchCount++;
                                if (x < minX)
                                    minX = x;
                                if (y < minY)
                                    minY = y;
                                if (x > maxX)
                                    maxX = x;
                                if (y > maxY)
                                    maxY = y;
                            }
                        }
                    }
                    if (matchCount < 100) {
                        console.log("[\u5360\u4F4D\u7B26\u68C0\u6D4B] \u5339\u914D\u50CF\u7D20\u6570\u592A\u5C11: ".concat(matchCount, "\uFF0C\u672A\u627E\u5230\u5360\u4F4D\u7B26"));
                        return [2 /*return*/, null];
                    }
                    regionWidth = maxX - minX + 1;
                    regionHeight = maxY - minY + 1;
                    console.log("[\u5360\u4F4D\u7B26\u68C0\u6D4B] \u627E\u5230\u5360\u4F4D\u7B26\u533A\u57DF: x=".concat(minX, ", y=").concat(minY, ", ").concat(regionWidth, "x").concat(regionHeight, ", \u5339\u914D\u50CF\u7D20: ").concat(matchCount));
                    return [2 /*return*/, {
                            x: minX,
                            y: minY,
                            width: regionWidth,
                            height: regionHeight,
                        }];
                case 2:
                    error_1 = _b.sent();
                    console.error('[占位符检测] 失败:', error_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 采样图片某一行的背景颜色（取指定区域两侧的像素平均值）
 */
function sampleRowBackground(rawData, width, channels, y, leftX, rightX, sampleWidth) {
    if (sampleWidth === void 0) { sampleWidth = 5; }
    var lr = 0, lg = 0, lb = 0, rr = 0, rg = 0, rb = 0;
    for (var i = 0; i < sampleWidth; i++) {
        var lIdx = (y * width + Math.max(0, leftX - sampleWidth + i)) * channels;
        lr += rawData[lIdx];
        lg += rawData[lIdx + 1];
        lb += rawData[lIdx + 2];
        var rIdx = (y * width + Math.min(width - 1, rightX + 1 + i)) * channels;
        rr += rawData[rIdx];
        rg += rawData[rIdx + 1];
        rb += rawData[rIdx + 2];
    }
    return {
        leftBg: { r: Math.round(lr / sampleWidth), g: Math.round(lg / sampleWidth), b: Math.round(lb / sampleWidth) },
        rightBg: { r: Math.round(rr / sampleWidth), g: Math.round(rg / sampleWidth), b: Math.round(rb / sampleWidth) },
    };
}
/**
 * 生成背景覆盖层：用渐变背景色覆盖原有文字区域
 * 通过采样原图两侧背景色并线性插值，实现自然的覆盖效果
 */
function generateBackgroundCover(templateBuffer, coverArea) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, rawData, info, width, channels, coverWidth, coverHeight, coverData, dy, imgY, _b, leftBg, rightBg, dx, t, idx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, sharp_1.default)(templateBuffer)
                        .raw()
                        .toBuffer({ resolveWithObject: true })];
                case 1:
                    _a = _c.sent(), rawData = _a.data, info = _a.info;
                    width = info.width, channels = info.channels;
                    coverWidth = coverArea.width;
                    coverHeight = coverArea.height;
                    coverData = Buffer.alloc(coverWidth * coverHeight * 3);
                    for (dy = 0; dy < coverHeight; dy++) {
                        imgY = coverArea.y + dy;
                        _b = sampleRowBackground(rawData, width, channels, imgY, coverArea.x, coverArea.x + coverWidth), leftBg = _b.leftBg, rightBg = _b.rightBg;
                        for (dx = 0; dx < coverWidth; dx++) {
                            t = dx / coverWidth;
                            idx = (dy * coverWidth + dx) * 3;
                            coverData[idx] = Math.round(leftBg.r * (1 - t) + rightBg.r * t);
                            coverData[idx + 1] = Math.round(leftBg.g * (1 - t) + rightBg.g * t);
                            coverData[idx + 2] = Math.round(leftBg.b * (1 - t) + rightBg.b * t);
                        }
                    }
                    return [2 /*return*/, (0, sharp_1.default)(coverData, {
                            raw: { width: coverWidth, height: coverHeight, channels: 3 }
                        }).png().toBuffer()];
            }
        });
    });
}
/**
 * 生成邀请人文字的SVG图片
 * 使用SVG渲染中文文字，确保跨平台兼容
 */
function generateInviterTextImage(username_1, width_1, height_1) {
    return __awaiter(this, arguments, void 0, function (username, width, height, fontSize) {
        var text, svgText;
        if (fontSize === void 0) { fontSize = 16; }
        return __generator(this, function (_a) {
            text = "\u9080\u8BF7\u4EBA\uFF1A".concat(username);
            svgText = "\n    <svg width=\"".concat(width, "\" height=\"").concat(height, "\" xmlns=\"http://www.w3.org/2000/svg\">\n      <style>\n        .inviter-text {\n          fill: #e6afa0;\n          font-size: ").concat(fontSize, "px;\n          font-family: \"Noto Sans CJK SC\", \"PingFang SC\", \"Microsoft YaHei\", \"Hiragino Sans GB\", sans-serif;\n          dominant-baseline: central;\n          text-anchor: middle;\n        }\n      </style>\n      <text x=\"").concat(width / 2, "\" y=\"").concat(height / 2, "\" class=\"inviter-text\">").concat(text, "</text>\n    </svg>\n  ");
            return [2 /*return*/, (0, sharp_1.default)(Buffer.from(svgText)).png().toBuffer()];
        });
    });
}
/**
 * 为用户合成带二维码和邀请人名称的海报
 * 自动检测海报中的占位符区域并精确替换为二维码，
 * 同时将模板中的"邀请人：[username]"替换为实际用户名。
 *
 * 检测优先级：
 * 1. 品红色(#FF00FF)占位符 - 推荐方式
 * 2. 白色(#FFFFFF)占位符（仅在底部区域搜索）- 降级方案
 * 3. 使用手动配置的坐标 - 最终降级
 *
 * @param templateUrl 海报模板URL（COS上的）
 * @param inviteCode 用户邀请码
 * @param fallbackConfig 降级用的手动坐标配置
 * @param username 用户名（用于显示邀请人）
 * @returns 合成后的海报COS URL
 */
function composePosterWithQR(templateUrl, inviteCode, fallbackConfig, username) {
    return __awaiter(this, void 0, void 0, function () {
        var response, templateBuffer, _a, _b, metadata, imgWidth, imgHeight, placeholder, cropTop, cropRight, bottomRightBuffer, whiteRegion, qrSize, inviteLink, qrPngBuffer, qrResized, compositeInputs, textCoverArea, bgCover, textImage, textError_1, composedBuffer, cosUrl, error_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 17, , 18]);
                    console.log('[海报合成] 开始合成海报...');
                    console.log('[海报合成] 模板URL:', templateUrl);
                    console.log('[海报合成] 邀请码:', inviteCode);
                    console.log('[海报合成] 用户名:', username || '(未提供)');
                    return [4 /*yield*/, fetch(templateUrl)];
                case 1:
                    response = _c.sent();
                    if (!response.ok) {
                        throw new Error("\u4E0B\u8F7D\u6A21\u677F\u5931\u8D25: ".concat(response.status));
                    }
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    templateBuffer = _b.apply(_a, [_c.sent()]);
                    console.log('[海报合成] 模板下载完成, 大小:', templateBuffer.length);
                    return [4 /*yield*/, (0, sharp_1.default)(templateBuffer).metadata()];
                case 3:
                    metadata = _c.sent();
                    imgWidth = metadata.width || 750;
                    imgHeight = metadata.height || 1343;
                    console.log("[\u6D77\u62A5\u5408\u6210] \u6A21\u677F\u5C3A\u5BF8: ".concat(imgWidth, "x").concat(imgHeight));
                    placeholder = null;
                    // 方案1: 检测品红色占位符 (#FF00FF)
                    console.log('[海报合成] 尝试检测品红色占位符...');
                    return [4 /*yield*/, detectPlaceholder(templateBuffer, { r: 255, g: 0, b: 255 }, 30)];
                case 4:
                    placeholder = _c.sent();
                    if (!!placeholder) return [3 /*break*/, 7];
                    // 方案2: 检测白色占位符（仅在图片底部30%区域）
                    console.log('[海报合成] 未找到品红色占位符，尝试检测底部白色区域...');
                    cropTop = Math.floor(imgHeight * 0.7);
                    cropRight = Math.floor(imgWidth * 0.5);
                    return [4 /*yield*/, (0, sharp_1.default)(templateBuffer)
                            .extract({
                            left: cropRight,
                            top: cropTop,
                            width: imgWidth - cropRight,
                            height: imgHeight - cropTop,
                        })
                            .toBuffer()];
                case 5:
                    bottomRightBuffer = _c.sent();
                    return [4 /*yield*/, detectPlaceholder(bottomRightBuffer, { r: 255, g: 255, b: 255 }, 15)];
                case 6:
                    whiteRegion = _c.sent();
                    if (whiteRegion && whiteRegion.width > 50 && whiteRegion.height > 50) {
                        // 转换回原始坐标
                        placeholder = {
                            x: whiteRegion.x + cropRight,
                            y: whiteRegion.y + cropTop,
                            width: whiteRegion.width,
                            height: whiteRegion.height,
                        };
                        console.log("[\u6D77\u62A5\u5408\u6210] \u627E\u5230\u767D\u8272\u5360\u4F4D\u7B26: x=".concat(placeholder.x, ", y=").concat(placeholder.y, ", ").concat(placeholder.width, "x").concat(placeholder.height));
                    }
                    _c.label = 7;
                case 7:
                    // 方案3: 使用降级配置
                    if (!placeholder) {
                        console.log('[海报合成] 未检测到占位符，使用降级坐标配置');
                        placeholder = {
                            x: fallbackConfig.x,
                            y: fallbackConfig.y,
                            width: fallbackConfig.size,
                            height: fallbackConfig.size,
                        };
                    }
                    qrSize = Math.min(placeholder.width, placeholder.height);
                    inviteLink = "https://jiangyuchen.cn/login?invite=".concat(inviteCode);
                    return [4 /*yield*/, qrcode_1.default.toBuffer(inviteLink, {
                            type: 'png',
                            width: qrSize,
                            margin: 1,
                            color: { dark: '#000000', light: '#FFFFFF' },
                            errorCorrectionLevel: 'M',
                        })];
                case 8:
                    qrPngBuffer = _c.sent();
                    console.log("[\u6D77\u62A5\u5408\u6210] \u4E8C\u7EF4\u7801\u751F\u6210\u5B8C\u6210, \u5927\u5C0F: ".concat(qrSize, "x").concat(qrSize));
                    return [4 /*yield*/, (0, sharp_1.default)(qrPngBuffer)
                            .resize(placeholder.width, placeholder.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                            .png()
                            .toBuffer()];
                case 9:
                    qrResized = _c.sent();
                    compositeInputs = [];
                    if (!username) return [3 /*break*/, 14];
                    textCoverArea = {
                        x: 530,
                        y: 1090,
                        width: 190,
                        height: 38,
                    };
                    _c.label = 10;
                case 10:
                    _c.trys.push([10, 13, , 14]);
                    // 生成背景覆盖层（采样原图背景色渐变填充）
                    console.log('[海报合成] 生成邀请人文字背景覆盖...');
                    return [4 /*yield*/, generateBackgroundCover(templateBuffer, textCoverArea)];
                case 11:
                    bgCover = _c.sent();
                    compositeInputs.push({
                        input: bgCover,
                        left: textCoverArea.x,
                        top: textCoverArea.y,
                    });
                    // 生成新的邀请人文字
                    console.log('[海报合成] 生成邀请人文字:', username);
                    return [4 /*yield*/, generateInviterTextImage(username, textCoverArea.width, textCoverArea.height, 16)];
                case 12:
                    textImage = _c.sent();
                    compositeInputs.push({
                        input: textImage,
                        left: textCoverArea.x,
                        top: textCoverArea.y,
                    });
                    console.log('[海报合成] 邀请人文字覆盖准备完成');
                    return [3 /*break*/, 14];
                case 13:
                    textError_1 = _c.sent();
                    console.error('[海报合成] 邀请人文字覆盖失败，跳过:', textError_1);
                    return [3 /*break*/, 14];
                case 14:
                    // 4b. 叠加二维码
                    compositeInputs.push({
                        input: qrResized,
                        left: placeholder.x,
                        top: placeholder.y,
                    });
                    return [4 /*yield*/, (0, sharp_1.default)(templateBuffer)
                            .composite(compositeInputs)
                            .jpeg({ quality: 92 })
                            .toBuffer()];
                case 15:
                    composedBuffer = _c.sent();
                    console.log('[海报合成] 合成完成, 大小:', composedBuffer.length);
                    return [4 /*yield*/, (0, cos_upload_1.uploadImageToCOS)(composedBuffer, 'posters', "posters/composed/invite-".concat(inviteCode, "-").concat(Date.now(), ".jpg"))];
                case 16:
                    cosUrl = _c.sent();
                    console.log('[海报合成] 上传COS成功:', cosUrl);
                    return [2 /*return*/, cosUrl];
                case 17:
                    error_2 = _c.sent();
                    console.error('[海报合成] 失败:', error_2);
                    throw error_2;
                case 18: return [2 /*return*/];
            }
        });
    });
}
