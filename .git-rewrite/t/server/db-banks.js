"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.initializeBanks = initializeBanks;
exports.searchBanks = searchBanks;
exports.addOrUpdateBank = addOrUpdateBank;
exports.getAllBanks = getAllBanks;
var schema_banks_1 = require("../drizzle/schema-banks");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 预置的常用银行列表
 */
var PRESET_BANKS = [
    '中国工商银行',
    '中国农业银行',
    '中国银行',
    '中国建设银行',
    '交通银行',
    '中国邮政储蓄银行',
    '招商银行',
    '浦发银行',
    '中信银行',
    '中国光大银行',
    '华夏银行',
    '中国民生银行',
    '广发银行',
    '平安银行',
    '兴业银行',
    '浙商银行',
    '上海银行',
    '北京银行',
    '江苏银行',
    '宁波银行',
];
/**
 * 初始化银行数据库
 * 如果数据库为空，则插入预置银行列表
 */
function initializeBanks() {
    return __awaiter(this, void 0, void 0, function () {
        var existingBanks, _i, PRESET_BANKS_1, bankName, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    return [4 /*yield*/, db.select().from(schema_banks_1.banks).limit(1)];
                case 1:
                    existingBanks = _a.sent();
                    if (!(existingBanks.length === 0)) return [3 /*break*/, 6];
                    _i = 0, PRESET_BANKS_1 = PRESET_BANKS;
                    _a.label = 2;
                case 2:
                    if (!(_i < PRESET_BANKS_1.length)) return [3 /*break*/, 5];
                    bankName = PRESET_BANKS_1[_i];
                    return [4 /*yield*/, db.insert(schema_banks_1.banks).values({
                            name: bankName,
                            usageCount: 0,
                        }).onConflictDoNothing()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    console.log("[Banks] Initialized with ".concat(PRESET_BANKS.length, " preset banks"));
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_1 = _a.sent();
                    console.error('[Banks] Failed to initialize:', error_1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 搜索银行（模糊匹配）
 */
function searchBanks(query) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(!query || query.trim() === '')) return [3 /*break*/, 2];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_banks_1.banks)
                            .orderBy((0, drizzle_orm_1.desc)(schema_banks_1.banks.usageCount))
                            .limit(20)];
                case 1: 
                // 如果没有查询，返回使用次数最多的前20个
                return [2 /*return*/, _a.sent()];
                case 2: return [4 /*yield*/, db
                        .select()
                        .from(schema_banks_1.banks)
                        .where((0, drizzle_orm_1.ilike)(schema_banks_1.banks.name, "%".concat(query, "%")))
                        .orderBy((0, drizzle_orm_1.desc)(schema_banks_1.banks.usageCount))
                        .limit(10)];
                case 3: 
                // 模糊搜索
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 添加或更新银行
 * 如果银行已存在，增加使用次数；否则创建新银行
 */
function addOrUpdateBank(bankName) {
    return __awaiter(this, void 0, void 0, function () {
        var trimmedName, existing, newBank, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!bankName || bankName.trim() === '') {
                        return [2 /*return*/, null];
                    }
                    trimmedName = bankName.trim();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_banks_1.banks)
                            .where((0, drizzle_orm_1.eq)(schema_banks_1.banks.name, trimmedName))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    // 银行已存在，增加使用次数
                    return [4 /*yield*/, db
                            .update(schema_banks_1.banks)
                            .set({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_banks_1.banks.usageCount),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_banks_1.banks.id, existing[0].id))];
                case 3:
                    // 银行已存在，增加使用次数
                    _a.sent();
                    return [2 /*return*/, existing[0]];
                case 4: return [4 /*yield*/, db
                        .insert(schema_banks_1.banks)
                        .values({
                        name: trimmedName,
                        usageCount: 1,
                    })
                        .returning()];
                case 5:
                    newBank = _a.sent();
                    console.log("[Banks] New bank added: ".concat(trimmedName));
                    return [2 /*return*/, newBank[0]];
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    console.error('[Banks] Failed to add/update bank:', error_2);
                    return [2 /*return*/, null];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有银行（按使用次数排序）
 */
function getAllBanks() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_banks_1.banks)
                        .orderBy((0, drizzle_orm_1.desc)(schema_banks_1.banks.usageCount))];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
var templateObject_1;
