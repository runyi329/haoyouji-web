"use strict";
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
exports.paymentAccountsRouter = void 0;
var trpc_1 = require("./trpc");
var zod_1 = require("zod");
var dbPaymentAccounts = require("../db/paymentAccounts");
exports.paymentAccountsRouter = (0, trpc_1.router)({
    // ========== 银行卡管理 ==========
    // 获取银行卡列表
    getBankCards: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.getUserBankCards(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 添加银行卡
    addBankCard: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        cardNumber: zod_1.z.string().min(1),
        cardHolder: zod_1.z.string().min(1),
        bankName: zod_1.z.string().min(1),
        cardType: zod_1.z.enum(["debit", "credit"]),
        isDefault: zod_1.z.boolean().optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.addBankCard(__assign(__assign({}, input), { userId: ctx.user.id }))];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 更新银行卡
    updateBankCard: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        cardId: zod_1.z.string(),
        cardNumber: zod_1.z.string().optional(),
        cardHolder: zod_1.z.string().optional(),
        bankName: zod_1.z.string().optional(),
        cardType: zod_1.z.enum(["debit", "credit"]).optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var cardId, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cardId = input.cardId, data = __rest(input, ["cardId"]);
                    return [4 /*yield*/, dbPaymentAccounts.updateBankCard(cardId, ctx.user.id, data)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 删除银行卡
    deleteBankCard: trpc_1.protectedProcedure
        .input(zod_1.z.object({ cardId: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.deleteBankCard(input.cardId, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 设置默认银行卡
    setDefaultBankCard: trpc_1.protectedProcedure
        .input(zod_1.z.object({ cardId: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.setDefaultBankCard(input.cardId, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // ========== 数字钱包管理 ==========
    // 获取数字钱包列表
    getDigitalWallets: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.getUserDigitalWallets(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 添加数字钱包
    addDigitalWallet: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        walletType: zod_1.z.enum(["blockchain", "alipay", "wechat", "other"]),
        network: zod_1.z.string().optional(),
        walletAddress: zod_1.z.string().optional(),
        currency: zod_1.z.string().optional(),
        account: zod_1.z.string().optional(),
        accountName: zod_1.z.string().optional(),
        isDefault: zod_1.z.boolean().optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.addDigitalWallet(__assign(__assign({}, input), { userId: ctx.user.id }))];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 更新数字钱包
    updateDigitalWallet: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        walletId: zod_1.z.string(),
        walletType: zod_1.z.enum(["blockchain", "alipay", "wechat", "other"]).optional(),
        network: zod_1.z.string().optional(),
        walletAddress: zod_1.z.string().optional(),
        currency: zod_1.z.string().optional(),
        account: zod_1.z.string().optional(),
        accountName: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var walletId, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    walletId = input.walletId, data = __rest(input, ["walletId"]);
                    return [4 /*yield*/, dbPaymentAccounts.updateDigitalWallet(walletId, ctx.user.id, data)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 删除数字钱包
    deleteDigitalWallet: trpc_1.protectedProcedure
        .input(zod_1.z.object({ walletId: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.deleteDigitalWallet(input.walletId, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 设置默认数字钱包
    setDefaultDigitalWallet: trpc_1.protectedProcedure
        .input(zod_1.z.object({ walletId: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbPaymentAccounts.setDefaultDigitalWallet(input.walletId, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
});
