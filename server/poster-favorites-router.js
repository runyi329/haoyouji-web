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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.posterFavoritesRouter = void 0;
var trpc_1 = require("./_core/trpc");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var dbPosterFavorites = require("./db-poster-favorites");
var cos_upload_1 = require("./cos-upload");
var poster_compose_1 = require("./poster-compose");
// 海报模板配置（硬编码，后续可以改为数据库管理）
// templateUrl 会在第一次上传后更新
var POSTER_TEMPLATES = {
    'invite-ledger': {
        title: '共享账本邀请海报',
        description: '脉动共享账本试用版正式上线',
        category: 'invite',
        series: '邀请好友',
        templateUrl: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/posters/templates/invite-ledger-template-v2.jpg',
        qrConfig: {
            x: 557, // 品红色占位符自动检测，此为降级坐标
            y: 1135,
            size: 121,
        },
    },
};
/**
 * 海报收藏 tRPC 路由
 */
exports.posterFavoritesRouter = (0, trpc_1.router)({
    // 获取用户的所有海报收藏
    getMyPosters: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        category: zod_1.z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']).optional(),
    }).optional())
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, posters;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, dbPosterFavorites.getUserPosterFavorites(userId, input === null || input === void 0 ? void 0 : input.category)];
                case 1:
                    posters = _c.sent();
                    return [2 /*return*/, { posters: posters }];
            }
        });
    }); }),
    // 获取单个海报详情
    getPosterById: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, poster;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, dbPosterFavorites.getPosterFavoriteById(input.id, userId)];
                case 1:
                    poster = _c.sent();
                    if (!poster) {
                        throw new server_1.TRPCError({
                            code: 'NOT_FOUND',
                            message: '海报不存在',
                        });
                    }
                    return [2 /*return*/, { poster: poster }];
            }
        });
    }); }),
    // 创建海报收藏（上传图片到COS）
    createPoster: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        title: zod_1.z.string().min(1).max(255),
        description: zod_1.z.string().optional(),
        category: zod_1.z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']),
        seriesName: zod_1.z.string().optional(),
        thumbnailData: zod_1.z.string(), // base64图片数据
        fullData: zod_1.z.string(), // base64图片数据
        tags: zod_1.z.array(zod_1.z.string()).optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, thumbnailUrl, fullUrl, posterId, error_1;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 5, , 6]);
                    // 上传缩略图到COS
                    console.log('[海报收藏] 开始上传缩略图...');
                    return [4 /*yield*/, (0, cos_upload_1.uploadImageToCOS)(input.thumbnailData, 'posters')];
                case 2:
                    thumbnailUrl = _c.sent();
                    // 上传原图到COS
                    console.log('[海报收藏] 开始上传原图...');
                    return [4 /*yield*/, (0, cos_upload_1.uploadImageToCOS)(input.fullData, 'posters')];
                case 3:
                    fullUrl = _c.sent();
                    return [4 /*yield*/, dbPosterFavorites.createPosterFavorite({
                            userId: userId,
                            title: input.title,
                            description: input.description,
                            category: input.category,
                            seriesName: input.seriesName,
                            thumbnailUrl: thumbnailUrl,
                            fullUrl: fullUrl,
                            tags: input.tags,
                        })];
                case 4:
                    posterId = _c.sent();
                    console.log("[\u6D77\u62A5\u6536\u85CF] \u521B\u5EFA\u6210\u529F\uFF0CID: ".concat(posterId));
                    return [2 /*return*/, {
                            success: true,
                            posterId: posterId,
                            thumbnailUrl: thumbnailUrl,
                            fullUrl: fullUrl,
                        }];
                case 5:
                    error_1 = _c.sent();
                    console.error('[海报收藏] 创建失败:', error_1);
                    throw new server_1.TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: "\u521B\u5EFA\u5931\u8D25: ".concat(error_1 instanceof Error ? error_1.message : '未知错误'),
                    });
                case 6: return [2 /*return*/];
            }
        });
    }); }),
    // 上传海报模板到COS（管理员功能）
    uploadTemplate: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        imageData: zod_1.z.string(), // base64图片数据
        filename: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var url, error_2;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    console.log('[海报模板] 开始上传模板...');
                    return [4 /*yield*/, (0, cos_upload_1.uploadImageToCOS)(input.imageData, 'posters', input.filename ? "posters/templates/".concat(input.filename) : undefined)];
                case 1:
                    url = _c.sent();
                    console.log('[海报模板] 上传成功:', url);
                    return [2 /*return*/, { success: true, url: url }];
                case 2:
                    error_2 = _c.sent();
                    console.error('[海报模板] 上传失败:', error_2);
                    throw new server_1.TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: "\u4E0A\u4F20\u5931\u8D25: ".concat(error_2 instanceof Error ? error_2.message : '未知错误'),
                    });
                case 3: return [2 /*return*/];
            }
        });
    }); }),
    // 获取用户的合成海报（带二维码）
    // 前端调用此API获取已合成好的海报URL
    getComposedPoster: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        templateId: zod_1.z.string(),
        templateUrl: zod_1.z.string(), // 模板图片URL
        qrX: zod_1.z.number(),
        qrY: zod_1.z.number(),
        qrSize: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, username, getDb, users, eq, db, user, displayName, composedUrl, error_3;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    username = ctx.user.username;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db'); })];
                case 2:
                    getDb = (_c.sent()).getDb;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 3:
                    users = (_c.sent()).users;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('drizzle-orm'); })];
                case 4:
                    eq = (_c.sent()).eq;
                    return [4 /*yield*/, getDb()];
                case 5:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({ inviteCode: users.inviteCode, name: users.name })
                            .from(users)
                            .where(eq(users.id, userId))];
                case 6:
                    user = (_c.sent())[0];
                    if (!(user === null || user === void 0 ? void 0 : user.inviteCode)) {
                        throw new server_1.TRPCError({
                            code: 'BAD_REQUEST',
                            message: '用户没有邀请码',
                        });
                    }
                    displayName = user.name || username;
                    return [4 /*yield*/, (0, poster_compose_1.composePosterWithQR)(input.templateUrl, user.inviteCode, { x: input.qrX, y: input.qrY, size: input.qrSize }, displayName)];
                case 7:
                    composedUrl = _c.sent();
                    return [2 /*return*/, {
                            success: true,
                            composedUrl: composedUrl,
                            inviteCode: user.inviteCode,
                        }];
                case 8:
                    error_3 = _c.sent();
                    console.error('[合成海报] 失败:', error_3);
                    throw new server_1.TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: "\u5408\u6210\u5931\u8D25: ".concat(error_3 instanceof Error ? error_3.message : '未知错误'),
                    });
                case 9: return [2 /*return*/];
            }
        });
    }); }),
    // 更新海报信息
    updatePoster: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        title: zod_1.z.string().min(1).max(255).optional(),
        description: zod_1.z.string().optional(),
        category: zod_1.z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']).optional(),
        seriesName: zod_1.z.string().optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
        sortOrder: zod_1.z.number().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, id, updateData, success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    id = input.id, updateData = __rest(input, ["id"]);
                    return [4 /*yield*/, dbPosterFavorites.updatePosterFavorite(id, userId, updateData)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({
                            code: 'NOT_FOUND',
                            message: '海报不存在或无权限修改',
                        });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 删除海报
    deletePoster: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, dbPosterFavorites.deletePosterFavorite(input.id, userId)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({
                            code: 'NOT_FOUND',
                            message: '海报不存在或无权限删除',
                        });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 获取分类统计
    getCategoryStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, stats;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = ctx.user.id;
                    return [4 /*yield*/, dbPosterFavorites.getPosterCategoryStats(userId)];
                case 1:
                    stats = _c.sent();
                    return [2 /*return*/, { stats: stats }];
            }
        });
    }); }),
});
