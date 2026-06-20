"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.POSTER_CATEGORIES = void 0;
exports.createPosterFavoritesTable = createPosterFavoritesTable;
exports.createPosterFavorite = createPosterFavorite;
exports.getUserPosterFavorites = getUserPosterFavorites;
exports.getPosterFavoriteById = getPosterFavoriteById;
exports.updatePosterFavorite = updatePosterFavorite;
exports.deletePosterFavorite = deletePosterFavorite;
exports.getPosterCategoryStats = getPosterCategoryStats;
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 海报收藏数据库表结构
 *
 * 功能说明：
 * - 支持用户收藏海报
 * - 海报分类管理（营销类、产品教程类、特定对象类等）
 * - 存储海报图片URL（腾讯云COS）
 * - 支持缩略图和原图
 */
// 海报分类枚举
exports.POSTER_CATEGORIES = {
    MARKETING: 'marketing', // 营销类
    PRODUCT_TUTORIAL: 'product_tutorial', // 产品教程类
    TARGET_AUDIENCE: 'target_audience', // 特定对象类
    BRAND: 'brand', // 品牌宣传类
    EVENT: 'event', // 活动类
    OTHER: 'other', // 其他
};
// 创建海报收藏表
function createPosterFavoritesTable() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    CREATE TABLE IF NOT EXISTS poster_favorites (\n      id INT AUTO_INCREMENT PRIMARY KEY,\n      user_id INT NOT NULL,\n      title VARCHAR(255) NOT NULL COMMENT '\u6D77\u62A5\u6807\u9898',\n      description TEXT COMMENT '\u6D77\u62A5\u63CF\u8FF0',\n      category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '\u6D77\u62A5\u5206\u7C7B',\n      series_name VARCHAR(255) COMMENT '\u7CFB\u5217\u540D\u79F0\uFF08\u5982\uFF1A\u8109\u52A8\u7F51\u5BA3\u4F20\u7CFB\u5217\uFF09',\n      thumbnail_url VARCHAR(500) NOT NULL COMMENT '\u7F29\u7565\u56FEURL',\n      full_url VARCHAR(500) NOT NULL COMMENT '\u539F\u56FEURL',\n      width INT COMMENT '\u56FE\u7247\u5BBD\u5EA6',\n      height INT COMMENT '\u56FE\u7247\u9AD8\u5EA6',\n      file_size INT COMMENT '\u6587\u4EF6\u5927\u5C0F\uFF08\u5B57\u8282\uFF09',\n      tags JSON COMMENT '\u6807\u7B7E\u6570\u7EC4',\n      sort_order INT DEFAULT 0 COMMENT '\u6392\u5E8F\u987A\u5E8F',\n      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n      INDEX idx_user_id (user_id),\n      INDEX idx_category (category),\n      INDEX idx_series (series_name),\n      INDEX idx_created_at (created_at),\n      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='\u6D77\u62A5\u6536\u85CF\u8868'\n  "], ["\n    CREATE TABLE IF NOT EXISTS poster_favorites (\n      id INT AUTO_INCREMENT PRIMARY KEY,\n      user_id INT NOT NULL,\n      title VARCHAR(255) NOT NULL COMMENT '\u6D77\u62A5\u6807\u9898',\n      description TEXT COMMENT '\u6D77\u62A5\u63CF\u8FF0',\n      category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '\u6D77\u62A5\u5206\u7C7B',\n      series_name VARCHAR(255) COMMENT '\u7CFB\u5217\u540D\u79F0\uFF08\u5982\uFF1A\u8109\u52A8\u7F51\u5BA3\u4F20\u7CFB\u5217\uFF09',\n      thumbnail_url VARCHAR(500) NOT NULL COMMENT '\u7F29\u7565\u56FEURL',\n      full_url VARCHAR(500) NOT NULL COMMENT '\u539F\u56FEURL',\n      width INT COMMENT '\u56FE\u7247\u5BBD\u5EA6',\n      height INT COMMENT '\u56FE\u7247\u9AD8\u5EA6',\n      file_size INT COMMENT '\u6587\u4EF6\u5927\u5C0F\uFF08\u5B57\u8282\uFF09',\n      tags JSON COMMENT '\u6807\u7B7E\u6570\u7EC4',\n      sort_order INT DEFAULT 0 COMMENT '\u6392\u5E8F\u987A\u5E8F',\n      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n      INDEX idx_user_id (user_id),\n      INDEX idx_category (category),\n      INDEX idx_series (series_name),\n      INDEX idx_created_at (created_at),\n      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='\u6D77\u62A5\u6536\u85CF\u8868'\n  "]))))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// 创建海报收藏
function createPosterFavorite(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n    INSERT INTO poster_favorites (\n      user_id, title, description, category, series_name,\n      thumbnail_url, full_url, width, height, file_size, tags\n    ) VALUES (\n      ", ", ", ", ", ", ", ",\n      ", ", ", ", ", ",\n      ", ", ", ", ", ",\n      ", "\n    )\n  "], ["\n    INSERT INTO poster_favorites (\n      user_id, title, description, category, series_name,\n      thumbnail_url, full_url, width, height, file_size, tags\n    ) VALUES (\n      ", ", ", ", ", ", ", ",\n      ", ", ", ", ", ",\n      ", ", ", ", ", ",\n      ", "\n    )\n  "])), data.userId, data.title, data.description || null, data.category, data.seriesName || null, data.thumbnailUrl, data.fullUrl, data.width || null, data.height || null, data.fileSize || null, data.tags ? JSON.stringify(data.tags) : null))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, Number(result.insertId)];
            }
        });
    });
}
// 获取用户的所有海报收藏
function getUserPosterFavorites(userId, category) {
    return __awaiter(this, void 0, void 0, function () {
        var db, query, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    query = (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n    SELECT \n      id, user_id as userId, title, description, category, series_name as seriesName,\n      thumbnail_url as thumbnailUrl, full_url as fullUrl,\n      width, height, file_size as fileSize, tags, sort_order as sortOrder,\n      created_at as createdAt, updated_at as updatedAt\n    FROM poster_favorites\n    WHERE user_id = ", "\n  "], ["\n    SELECT \n      id, user_id as userId, title, description, category, series_name as seriesName,\n      thumbnail_url as thumbnailUrl, full_url as fullUrl,\n      width, height, file_size as fileSize, tags, sort_order as sortOrder,\n      created_at as createdAt, updated_at as updatedAt\n    FROM poster_favorites\n    WHERE user_id = ", "\n  "])), userId);
                    if (category) {
                        query = (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " AND category = ", ""], ["", " AND category = ", ""])), query, category);
                    }
                    query = (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["", " ORDER BY sort_order DESC, created_at DESC"], ["", " ORDER BY sort_order DESC, created_at DESC"])), query);
                    return [4 /*yield*/, db.execute(query)];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results.rows.map(function (row) { return (__assign(__assign({}, row), { tags: row.tags ? JSON.parse(row.tags) : [] })); })];
            }
        });
    });
}
// 获取单个海报详情
function getPosterFavoriteById(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n    SELECT \n      id, user_id as userId, title, description, category, series_name as seriesName,\n      thumbnail_url as thumbnailUrl, full_url as fullUrl,\n      width, height, file_size as fileSize, tags, sort_order as sortOrder,\n      created_at as createdAt, updated_at as updatedAt\n    FROM poster_favorites\n    WHERE id = ", " AND user_id = ", "\n  "], ["\n    SELECT \n      id, user_id as userId, title, description, category, series_name as seriesName,\n      thumbnail_url as thumbnailUrl, full_url as fullUrl,\n      width, height, file_size as fileSize, tags, sort_order as sortOrder,\n      created_at as createdAt, updated_at as updatedAt\n    FROM poster_favorites\n    WHERE id = ", " AND user_id = ", "\n  "])), id, userId))];
                case 2:
                    results = _a.sent();
                    row = results.rows[0];
                    if (!row)
                        return [2 /*return*/, null];
                    return [2 /*return*/, __assign(__assign({}, row), { tags: row.tags ? JSON.parse(row.tags) : [] })];
            }
        });
    });
}
// 更新海报收藏
function updatePosterFavorite(id, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updates, values, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    updates = [];
                    values = [];
                    if (data.title !== undefined) {
                        updates.push('title = ?');
                        values.push(data.title);
                    }
                    if (data.description !== undefined) {
                        updates.push('description = ?');
                        values.push(data.description);
                    }
                    if (data.category !== undefined) {
                        updates.push('category = ?');
                        values.push(data.category);
                    }
                    if (data.seriesName !== undefined) {
                        updates.push('series_name = ?');
                        values.push(data.seriesName);
                    }
                    if (data.tags !== undefined) {
                        updates.push('tags = ?');
                        values.push(JSON.stringify(data.tags));
                    }
                    if (data.sortOrder !== undefined) {
                        updates.push('sort_order = ?');
                        values.push(data.sortOrder);
                    }
                    if (updates.length === 0)
                        return [2 /*return*/, false];
                    values.push(id, userId);
                    return [4 /*yield*/, db.execute(drizzle_orm_1.sql.raw("UPDATE poster_favorites SET ".concat(updates.join(', '), " WHERE id = ? AND user_id = ?"), values))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.rowsAffected > 0];
            }
        });
    });
}
// 删除海报收藏
function deletePosterFavorite(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n    DELETE FROM poster_favorites WHERE id = ", " AND user_id = ", "\n  "], ["\n    DELETE FROM poster_favorites WHERE id = ", " AND user_id = ", "\n  "])), id, userId))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.rowsAffected > 0];
            }
        });
    });
}
// 获取海报分类统计
function getPosterCategoryStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n    SELECT category, COUNT(*) as count\n    FROM poster_favorites\n    WHERE user_id = ", "\n    GROUP BY category\n    ORDER BY count DESC\n  "], ["\n    SELECT category, COUNT(*) as count\n    FROM poster_favorites\n    WHERE user_id = ", "\n    GROUP BY category\n    ORDER BY count DESC\n  "])), userId))];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results.rows];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8;
