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
exports.getUserBankCards = getUserBankCards;
exports.addBankCard = addBankCard;
exports.updateBankCard = updateBankCard;
exports.deleteBankCard = deleteBankCard;
exports.setDefaultBankCard = setDefaultBankCard;
exports.getUserDigitalWallets = getUserDigitalWallets;
exports.addDigitalWallet = addDigitalWallet;
exports.updateDigitalWallet = updateDigitalWallet;
exports.deleteDigitalWallet = deleteDigitalWallet;
exports.setDefaultDigitalWallet = setDefaultDigitalWallet;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var uuid_1 = require("uuid");
// ==================== 银行卡管理函数 ====================
/**
 * 获取用户的银行卡列表
 */
function getUserBankCards(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, cards, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.bankCards)
                            .where((0, drizzle_orm_1.eq)(schema_1.bankCards.userId, userId))];
                case 2:
                    cards = _a.sent();
                    return [2 /*return*/, cards];
                case 3:
                    error_1 = _a.sent();
                    console.error("获取银行卡列表失败:", error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 添加银行卡
 */
function addBankCard(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, id, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    id = (0, uuid_1.v4)();
                    if (!data.isDefault) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .update(schema_1.bankCards)
                            .set({ isDefault: 0 })
                            .where((0, drizzle_orm_1.eq)(schema_1.bankCards.userId, data.userId))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.insert(schema_1.bankCards).values({
                        id: id,
                        userId: data.userId,
                        cardNumber: data.cardNumber,
                        cardHolder: data.cardHolder,
                        bankName: data.bankName,
                        cardType: data.cardType,
                        isDefault: data.isDefault ? 1 : 0,
                        notes: data.notes || null,
                    })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { id: id }];
                case 5:
                    error_2 = _a.sent();
                    console.error("添加银行卡失败:", error_2);
                    throw error_2;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新银行卡
 */
function updateBankCard(cardId, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .update(schema_1.bankCards)
                            .set(data)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bankCards.id, cardId), (0, drizzle_orm_1.eq)(schema_1.bankCards.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_3 = _a.sent();
                    console.error("更新银行卡失败:", error_3);
                    throw error_3;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除银行卡
 */
function deleteBankCard(cardId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .delete(schema_1.bankCards)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bankCards.id, cardId), (0, drizzle_orm_1.eq)(schema_1.bankCards.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_4 = _a.sent();
                    console.error("删除银行卡失败:", error_4);
                    throw error_4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 设置默认银行卡
 */
function setDefaultBankCard(cardId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    // 先取消所有卡的默认状态
                    return [4 /*yield*/, db
                            .update(schema_1.bankCards)
                            .set({ isDefault: 0 })
                            .where((0, drizzle_orm_1.eq)(schema_1.bankCards.userId, userId))];
                case 2:
                    // 先取消所有卡的默认状态
                    _a.sent();
                    // 设置指定卡为默认
                    return [4 /*yield*/, db
                            .update(schema_1.bankCards)
                            .set({ isDefault: 1 })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bankCards.id, cardId), (0, drizzle_orm_1.eq)(schema_1.bankCards.userId, userId)))];
                case 3:
                    // 设置指定卡为默认
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 4:
                    error_5 = _a.sent();
                    console.error("设置默认银行卡失败:", error_5);
                    throw error_5;
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 数字钱包管理函数 ====================
/**
 * 获取用户的数字钱包列表
 */
function getUserDigitalWallets(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, wallets, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.digitalWallets)
                            .where((0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, userId))];
                case 2:
                    wallets = _a.sent();
                    return [2 /*return*/, wallets];
                case 3:
                    error_6 = _a.sent();
                    console.error("获取数字钱包列表失败:", error_6);
                    throw error_6;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 添加数字钱包
 */
function addDigitalWallet(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, id, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    id = (0, uuid_1.v4)();
                    if (!data.isDefault) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .update(schema_1.digitalWallets)
                            .set({ isDefault: 0 })
                            .where((0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, data.userId))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.insert(schema_1.digitalWallets).values({
                        id: id,
                        userId: data.userId,
                        walletType: data.walletType,
                        network: data.network || null,
                        walletAddress: data.walletAddress || null,
                        currency: data.currency || null,
                        account: data.account || null,
                        accountName: data.accountName || null,
                        isDefault: data.isDefault ? 1 : 0,
                        notes: data.notes || null,
                    })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { id: id }];
                case 5:
                    error_7 = _a.sent();
                    console.error("添加数字钱包失败:", error_7);
                    throw error_7;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新数字钱包
 */
function updateDigitalWallet(walletId, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .update(schema_1.digitalWallets)
                            .set(data)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.digitalWallets.id, walletId), (0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_8 = _a.sent();
                    console.error("更新数字钱包失败:", error_8);
                    throw error_8;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除数字钱包
 */
function deleteDigitalWallet(walletId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .delete(schema_1.digitalWallets)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.digitalWallets.id, walletId), (0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 3:
                    error_9 = _a.sent();
                    console.error("删除数字钱包失败:", error_9);
                    throw error_9;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 设置默认数字钱包
 */
function setDefaultDigitalWallet(walletId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    // 先取消所有钱包的默认状态
                    return [4 /*yield*/, db
                            .update(schema_1.digitalWallets)
                            .set({ isDefault: 0 })
                            .where((0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, userId))];
                case 2:
                    // 先取消所有钱包的默认状态
                    _a.sent();
                    // 设置指定钱包为默认
                    return [4 /*yield*/, db
                            .update(schema_1.digitalWallets)
                            .set({ isDefault: 1 })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.digitalWallets.id, walletId), (0, drizzle_orm_1.eq)(schema_1.digitalWallets.userId, userId)))];
                case 3:
                    // 设置指定钱包为默认
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 4:
                    error_10 = _a.sent();
                    console.error("设置默认数字钱包失败:", error_10);
                    throw error_10;
                case 5: return [2 /*return*/];
            }
        });
    });
}
