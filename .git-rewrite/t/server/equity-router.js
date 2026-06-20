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
Object.defineProperty(exports, "__esModule", { value: true });
exports.equityRouter = void 0;
var trpc_1 = require("./_core/trpc");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var dbEquity = require("./db-equity");
exports.equityRouter = (0, trpc_1.router)({
    // 获取当前用户的股权信息
    getMyEquity: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbEquity.calculateUserEquity(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取所有股东的股权信息（管理员），附带席位编号
    getAllShareholders: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var shareholders, seatMap;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.getAllShareholdersEquity()];
                case 1:
                    shareholders = _c.sent();
                    return [4 /*yield*/, dbEquity.getAllSeatNumbers()];
                case 2:
                    seatMap = _c.sent();
                    return [2 /*return*/, shareholders.map(function (sh) { return (__assign(__assign({}, sh), { seatNumber: seatMap.get(sh.userId) || 0 })); })];
            }
        });
    }); }),
    // 获取所有投资记录（管理员），附带席位编号
    getAllInvestments: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var investments, seatMap;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.getAllInvestments()];
                case 1:
                    investments = _c.sent();
                    return [4 /*yield*/, dbEquity.getAllSeatNumbers()];
                case 2:
                    seatMap = _c.sent();
                    return [2 /*return*/, investments.map(function (inv) { return (__assign(__assign({}, inv), { seatNumber: inv.userId ? (seatMap.get(inv.userId) || 0) : 0 })); })];
            }
        });
    }); }),
    // 添加投资记录（管理员）
    addInvestment: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
        investorName: zod_1.z.string().optional(),
        investorIdCard: zod_1.z.string().optional(),
        amount: zod_1.z.number().positive(),
        investmentDate: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.addInvestment(input.userId, input.investorName, input.investorIdCard, input.amount, input.investmentDate, input.notes)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 更新投资记录（管理员）
    updateInvestment: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        amount: zod_1.z.number().positive(),
        investorName: zod_1.z.string().optional(),
        investorIdCard: zod_1.z.string().optional(),
        investmentDate: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.updateInvestment(input.id, input.amount, input.investorName, input.investorIdCard, input.investmentDate, input.notes)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 删除投资记录（管理员）
    deleteInvestment: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.deleteInvestment(input.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取股权规则配置（管理员）
    getRules: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.getEquityRules()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 更新股权规则（管理员）
    updateRule: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        ruleKey: zod_1.z.string(),
        ruleValue: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.updateEquityRule(input.ruleKey, input.ruleValue)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 批量更新股权规则（管理员）
    updateRules: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        rules: zod_1.z.array(zod_1.z.object({
            ruleKey: zod_1.z.string(),
            ruleValue: zod_1.z.number(),
            ruleDescription: zod_1.z.string().optional(),
        })),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var results, _i, _c, rule, err_1, failed;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    console.log("[updateRules] Received ".concat(input.rules.length, " rules to update"));
                    results = [];
                    _i = 0, _c = input.rules;
                    _d.label = 1;
                case 1:
                    if (!(_i < _c.length)) return [3 /*break*/, 6];
                    rule = _c[_i];
                    console.log("[updateRules] Processing: key=".concat(rule.ruleKey, ", value=").concat(rule.ruleValue, ", desc=").concat(rule.ruleDescription));
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, dbEquity.upsertEquityRule(rule.ruleKey, rule.ruleValue, rule.ruleDescription)];
                case 3:
                    _d.sent();
                    results.push({ key: rule.ruleKey, status: 'ok' });
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _d.sent();
                    console.error("[updateRules] Failed for ".concat(rule.ruleKey, ":"), err_1.message);
                    results.push({ key: rule.ruleKey, status: 'error', message: err_1.message });
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    failed = results.filter(function (r) { return r.status === 'error'; });
                    if (failed.length > 0) {
                        throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: "\u90E8\u5206\u89C4\u5219\u4FDD\u5B58\u5931\u8D25: ".concat(failed.map(function (f) { return f.key; }).join(', ')) });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 删除股权规则（管理员）
    deleteRule: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        ruleKey: zod_1.z.string(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.deleteEquityRule(input.ruleKey)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取所有规则详情（包含描述）
    getRulesDetail: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
                    }
                    return [4 /*yield*/, dbEquity.getEquityRulesDetail()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取股份池配置（所有登录用户可访问，用于前端展示公司股权架构饼图）
    getPoolConfig: trpc_1.protectedProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbEquity.getEquityRulesDetail()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }),
    // 获取增强的股权信息（包含估值、排名、席位编号、动态杠杆等）
    getMyEquityEnhanced: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var equity, rules, companyValuation, estimatedValue, ranking, poolStatus, seat, dynamicLeverage;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbEquity.calculateUserEquity(ctx.user.id)];
                case 1:
                    equity = _c.sent();
                    return [4 /*yield*/, dbEquity.getEquityRules()];
                case 2:
                    rules = _c.sent();
                    companyValuation = rules['company_valuation'] || 5000000;
                    estimatedValue = (equity.totalEquity / 100) * companyValuation;
                    return [4 /*yield*/, dbEquity.getShareholderRanking(ctx.user.id)];
                case 3:
                    ranking = _c.sent();
                    return [4 /*yield*/, dbEquity.getPoolStatus()];
                case 4:
                    poolStatus = _c.sent();
                    return [4 /*yield*/, dbEquity.getUserSeatNumber(ctx.user.id)];
                case 5:
                    seat = _c.sent();
                    dynamicLeverage = seat.seatNumber > 0
                        ? dbEquity.calculateDynamicLeverage(seat.seatNumber, seat.totalSeats)
                        : null;
                    return [2 /*return*/, __assign(__assign({}, equity), { estimatedValue: estimatedValue, companyValuation: companyValuation, ranking: ranking, poolStatus: poolStatus, seat: seat, dynamicLeverage: dynamicLeverage })];
            }
        });
    }); }),
    // 获取估值历史
    getValuationHistory: trpc_1.protectedProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbEquity.getValuationHistory()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }),
    // 获取最近动态
    getRecentActivities: trpc_1.protectedProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbEquity.getRecentActivities(10)];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }),
    // 获取用户晋升数据统计
    getPromotionStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbEquity.getUserPromotionStats(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取我邀请的用户统计
    getMyInvitedUsersStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbEquity.getMyInvitedUsersStats(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取用户的历史周报
    getWeeklyReports: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbEquity.getUserWeeklyReports(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
});
