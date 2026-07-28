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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminFeatureRouter = exports.get = exports.appRouter = void 0;
var const_1 = require("@shared/const");
var cookies_1 = require("./_core/cookies");
var systemRouter_1 = require("./_core/systemRouter");
var trpc_1 = require("./trpc");
var paymentAccounts_1 = require("./routers/paymentAccounts");
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var db = require("./db");
var storage_1 = require("./storage");
var nanoid_1 = require("nanoid");
var auth_1 = require("./auth");
var sdk_1 = require("./_core/sdk");
var tts_1 = require("./_core/tts");
var dbContacts = require("./db-contacts");
var dbReminderTypes = require("./db-reminder-types");
var dbReferrerStats = require("./db-referrer-stats");
var dbAnalytics = require("./db-analytics");
var dbPoints = require("./db-points");
var dbTagAnalytics = require("./db-tag-analytics");
var db_point_system_1 = require("./db-point-system");
var dbLedger = require("./db-ledger");
var dbCoupon = require("./db-coupon");
var dbRecharge = require("./db-recharge");
var recharge_1 = require("./routers/recharge");
var dbUserInsights = require("./db-user-insights");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var schema = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var invite_api_1 = require("./invite-api");
var equity_router_1 = require("./equity-router");
var invite_permission_api_1 = require("./invite-permission-api");
var work_groups_api_1 = require("./work-groups-api");
var partnership_router_1 = require("./partnership-router");
var poster_favorites_router_1 = require("./poster-favorites-router");
// 数据库初始化功能已禁用
// import { initDatabase } from "./db-init";
var exceljs_1 = require("exceljs");
// // 在应用启动时初始化数据库
// initDatabase().catch(err => {
//   console.error("[DB Init] Failed to initialize database:", err);
// });
exports.appRouter = (0, trpc_1.router)({
    system: systemRouter_1.systemRouter,
    equity: equity_router_1.equityRouter,
    partnership: partnership_router_1.partnershipRouter,
    // AI 用户洞察相关路由
    userInsights: (0, trpc_1.router)({
        // 支付账户管理
        paymentAccounts: paymentAccounts_1.paymentAccountsRouter,
        // 获取当前用户的最新洞察
        getLatest: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbUserInsights.getLatestUserInsight(ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }),
        // 获取全站运营洞察汇总（仅限管理员）
        getAdminSummary: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
                            throw new server_1.TRPCError({
                                code: "FORBIDDEN",
                                message: "无权限访问运营洞察数据",
                            });
                        }
                        return [4 /*yield*/, dbUserInsights.getAdminInsightsSummary()];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }),
        recharge: recharge_1.rechargeRouter,
        // 管理员诊断API：检查所有链的扫描器状态,
        adminDiagnose: trpc_1.protectedProcedure
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var logs, networks, _i, networks_1, network, wallets_1, apiKey, wallets, walletAddress, USDT_CONTRACT, apiUrl, fetchOpts, response, errorText, data, i, tx, amount, txTime, db2, pendingOrders, _c, pendingOrders_1, order, scanTimestamp, _d, _e, tx, amount, txTime, _f, pendingOrders_2, order, orderAmount, diff, error_1;
            var _g, _h, _j;
            var ctx = _b.ctx;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
                            throw new Error('无权限');
                        }
                        logs = [];
                        _k.label = 1;
                    case 1:
                        _k.trys.push([1, 13, , 14]);
                        logs.push('========== 多链扫描器诊断 ==========');
                        logs.push('');
                        networks = ['TRC20', 'APTOS', 'SOLANA', 'ERC20', 'BEP20'];
                        _i = 0, networks_1 = networks;
                        _k.label = 2;
                    case 2:
                        if (!(_i < networks_1.length)) return [3 /*break*/, 5];
                        network = networks_1[_i];
                        return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses(network)];
                    case 3:
                        wallets_1 = _k.sent();
                        logs.push("".concat(network, ": ").concat(wallets_1.length, "\u4E2A\u542F\u7528\u5730\u5740"));
                        if (wallets_1.length > 0) {
                            wallets_1.forEach(function (w, i) {
                                logs.push("  ".concat(i + 1, ". ").concat(w.label || '未命名', " (").concat(w.address.slice(0, 10), "...)"));
                            });
                        }
                        _k.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        logs.push('');
                        apiKey = process.env.TRONGRID_API_KEY || '';
                        logs.push("TRONGRID_API_KEY: ".concat(apiKey ? '已设置 (' + apiKey.slice(0, 8) + '...)' : '❌ 未设置'));
                        logs.push("ETHERSCAN_API_KEY: ".concat(process.env.ETHERSCAN_API_KEY ? '已设置' : '未设置（可选）'));
                        logs.push("BSCSCAN_API_KEY: ".concat(process.env.BSCSCAN_API_KEY ? '已设置' : '未设置（可选）'));
                        logs.push('');
                        // 2. 测试TRC20（保留原有逻辑）
                        logs.push('---------- TRC20 测试 ----------');
                        return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses('TRC20')];
                    case 6:
                        wallets = _k.sent();
                        logs.push("\u542F\u7528\u7684TRC20\u94B1\u5305: ".concat(wallets.length, "\u4E2A"));
                        if (wallets.length === 0) {
                            logs.push('❌ 没有启用的TRC20钱包地址');
                            return [2 /*return*/, { success: false, logs: logs }];
                        }
                        walletAddress = wallets[0].address;
                        logs.push("\u6D4B\u8BD5\u94B1\u5305: ".concat(walletAddress));
                        USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
                        apiUrl = "https://api.trongrid.io/v1/accounts/".concat(walletAddress, "/transactions/trc20?limit=20&only_to=true&contract_address=").concat(USDT_CONTRACT);
                        logs.push("API URL: ".concat(apiUrl));
                        fetchOpts = {};
                        if (apiKey) {
                            fetchOpts.headers = {
                                'TRON-PRO-API-KEY': apiKey
                            };
                        }
                        return [4 /*yield*/, fetch(apiUrl, fetchOpts)];
                    case 7:
                        response = _k.sent();
                        logs.push("HTTP\u72B6\u6001: ".concat(response.status, " ").concat(response.statusText));
                        if (!!response.ok) return [3 /*break*/, 9];
                        return [4 /*yield*/, response.text()];
                    case 8:
                        errorText = _k.sent();
                        logs.push("\u9519\u8BEF\u54CD\u5E94: ".concat(errorText.slice(0, 500)));
                        return [2 /*return*/, { success: false, logs: logs }];
                    case 9: return [4 /*yield*/, response.json()];
                    case 10:
                        data = _k.sent();
                        logs.push("\u8FD4\u56DE\u6570\u636E: data.success=".concat(data.success, ", data.data\u957F\u5EA6=").concat(((_g = data.data) === null || _g === void 0 ? void 0 : _g.length) || 0));
                        if (data.data && data.data.length > 0) {
                            // 显示前5笔交易
                            for (i = 0; i < Math.min(5, data.data.length); i++) {
                                tx = data.data[i];
                                amount = parseFloat(tx.value) / 1e6;
                                txTime = new Date(tx.block_timestamp);
                                logs.push("\u4EA4\u6613".concat(i + 1, ": ").concat(amount, " USDT, from=").concat((_h = tx.from) === null || _h === void 0 ? void 0 : _h.slice(0, 10), "..., hash=").concat((_j = tx.transaction_id) === null || _j === void 0 ? void 0 : _j.slice(0, 16), "..., \u65F6\u95F4=").concat(txTime.toISOString()));
                            }
                        }
                        else {
                            logs.push('⚠️ API返回0笔交易');
                        }
                        return [4 /*yield*/, (0, db_1.getDb)()];
                    case 11:
                        db2 = _k.sent();
                        return [4 /*yield*/, db2
                                .select()
                                .from(schema.rechargeOrders)
                                .where((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " IN ('pending', 'submitted')"], ["", " IN ('pending', 'submitted')"])), schema.rechargeOrders.status))];
                    case 12:
                        pendingOrders = _k.sent();
                        logs.push("\u5F85\u5904\u7406\u8BA2\u5355: ".concat(pendingOrders.length, "\u4E2A"));
                        for (_c = 0, pendingOrders_1 = pendingOrders; _c < pendingOrders_1.length; _c++) {
                            order = pendingOrders_1[_c];
                            logs.push("  \u8BA2\u5355 ".concat(order.orderNo, ": ").concat(order.amount, " USDT, \u72B6\u6001=").concat(order.status, ", \u8FC7\u671F=").concat(order.expiresAt));
                        }
                        scanTimestamp = Date.now() - 24 * 60 * 60 * 1000;
                        logs.push("\u626B\u63CF\u65F6\u95F4\u8303\u56F4: ".concat(new Date(scanTimestamp).toISOString(), " \u5230\u73B0\u5728"));
                        // 6. 尝试匹配
                        if (data.data && data.data.length > 0 && pendingOrders.length > 0) {
                            logs.push('--- 尝试匹配 ---');
                            for (_d = 0, _e = data.data.slice(0, 10); _d < _e.length; _d++) {
                                tx = _e[_d];
                                amount = parseFloat(tx.value) / 1e6;
                                txTime = tx.block_timestamp;
                                if (txTime < scanTimestamp) {
                                    logs.push("\u8DF3\u8FC7: ".concat(amount, " USDT (\u65F6\u95F4 ").concat(new Date(txTime).toISOString(), " \u65E9\u4E8E\u626B\u63CF\u8303\u56F4)"));
                                    continue;
                                }
                                // 检查是否有匹配的订单
                                for (_f = 0, pendingOrders_2 = pendingOrders; _f < pendingOrders_2.length; _f++) {
                                    order = pendingOrders_2[_f];
                                    orderAmount = parseFloat(order.amount);
                                    diff = Math.abs(orderAmount - amount);
                                    if (diff <= 0.01) {
                                        logs.push("\u2705 \u7CBE\u786E\u5339\u914D: \u4EA4\u6613 ".concat(amount, " USDT \u2194 \u8BA2\u5355 ").concat(order.orderNo, " (").concat(order.amount, " USDT), \u5DEE\u989D=").concat(diff));
                                    }
                                    else if (orderAmount > amount && orderAmount - amount <= 3) {
                                        logs.push("\uD83D\uDD04 \u6A21\u7CCA\u5339\u914D: \u4EA4\u6613 ".concat(amount, " USDT \u2194 \u8BA2\u5355 ").concat(order.orderNo, " (").concat(order.amount, " USDT), \u5DEE\u989D=").concat((orderAmount - amount).toFixed(4)));
                                    }
                                }
                            }
                        }
                        return [2 /*return*/, { success: true, logs: logs }];
                    case 13:
                        error_1 = _k.sent();
                        logs.push("\u274C \u5F02\u5E38: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                        return [2 /*return*/, { success: false, logs: logs }];
                    case 14: return [2 /*return*/];
                }
            });
        }); }),
        // 管理员手动触发扫描
        adminTriggerScan: trpc_1.protectedProcedure
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var scanAllChains, results, error_2;
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
                            throw new Error('无权限');
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('./multi-chain-scanner'); })];
                    case 2:
                        scanAllChains = (_c.sent()).scanAllChains;
                        return [4 /*yield*/, scanAllChains()];
                    case 3:
                        results = _c.sent();
                        return [2 /*return*/, {
                                success: results.success,
                                message: results.success ? '扫描完成' : "\u626B\u63CF\u5B8C\u6210\uFF0C\u4F46\u6709\u9519\u8BEF: ".concat(results.errors.join(', ')),
                                results: results,
                            }];
                    case 4:
                        error_2 = _c.sent();
                        return [2 /*return*/, {
                                success: false,
                                message: error_2 instanceof Error ? error_2.message : '扫描失败',
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        }); }),
        // 管理员手动回滚错误订单
        adminRollbackOrder: trpc_1.protectedProcedure
            .input(zod_1.z.object({ orderNo: zod_1.z.string() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var db_2, order, refundAmount, error_3;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
                            throw new Error('无权限');
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, (0, db_1.getDb)()];
                    case 2:
                        db_2 = _c.sent();
                        return [4 /*yield*/, db_2
                                .select()
                                .from(schema_1.rechargeOrders)
                                .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.orderNo, input.orderNo))
                                .limit(1)];
                    case 3:
                        order = (_c.sent())[0];
                        if (!order) {
                            return [2 /*return*/, { success: false, message: '订单不存在' }];
                        }
                        if (order.status !== 'completed') {
                            return [2 /*return*/, { success: false, message: '订单不是已完成状态' }];
                        }
                        refundAmount = parseFloat(order.amount);
                        // 扣除余额
                        return [4 /*yield*/, db_2
                                .update(schema_1.users)
                                .set({ balance: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["balance - ", ""], ["balance - ", ""])), refundAmount) })
                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, order.userId))];
                    case 4:
                        // 扣除余额
                        _c.sent();
                        // 更新订单状态
                        return [4 /*yield*/, db_2
                                .update(schema_1.rechargeOrders)
                                .set({
                                status: 'pending',
                                txnHash: null,
                                completedAt: null
                            })];
                    case 5:
                        // 更新订单状态
                        _c.sent(),
                                .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, order.id));
                        return [2 /*return*/, {
                                success: true,
                                message: "\u8BA2\u5355".concat(input.orderNo, "\u5DF2\u56DE\u6EDA\uFF0C\u6263\u9664\u4F59\u989D").concat(refundAmount, " USDT")
                            }];
                    case 6:
                        error_3 = _c.sent();
                        return [2 /*return*/, {
                                success: false,
                                message: error_3 instanceof Error ? error_3.message : '回滚失败'
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        }); }),
    }),
    // 卡券系统
    coupon: (0, trpc_1.router)({
        // 获取可发送卡券的用户列表
        getAvailableRecipients: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.getAvailableRecipients(ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }),
        // 创建并发送卡券
        create: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            title: zod_1.z.string().min(1).max(200),
            description: zod_1.z.string().optional(),
            validFrom: zod_1.z.string(),
            validUntil: zod_1.z.string(),
            recipientIds: zod_1.z.union([zod_1.z.array(zod_1.z.string()), zod_1.z.literal('all')]),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.createCoupon(__assign(__assign({}, input), { creatorId: ctx.user.id }))];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 获取收到的卡券列表
        getReceived, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.getReceivedCoupons(ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 获取发出的卡券列表
        getSent, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.getSentCoupons(ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 获取卡券详情
        getDetail, trpc_1.protectedProcedure
            .input(zod_1.z.object({ couponId: zod_1.z.string() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.getCouponDetail(input.couponId, ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 使用/核销卡券
        use, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            recipientRecordId: zod_1.z.string(),
            notes: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.useCoupon(input.recipientRecordId, ctx.user.id, input.notes)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 获取卡券核销记录（仅创建者可见）
        getUsageRecords, trpc_1.protectedProcedure
            .input(zod_1.z.object({ couponId: zod_1.z.string() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, dbCoupon.getCouponUsageRecords(input.couponId, ctx.user.id)];
                    case 1: return [2 /*return*/, _c.sent()];
                }
            });
        }); })))
    }),
    auth: (0, trpc_1.router)({
        me: trpc_1.publicProcedure.query(function (opts) {
            console.log('[auth.me] 返回用户信息:', opts.ctx.user ? "\u7528\u6237ID: ".concat(opts.ctx.user.id, ", \u7528\u6237\u540D: ").concat(opts.ctx.user.username) : 'null');
            return opts.ctx.user;
        }),
        logout: trpc_1.publicProcedure.mutation(function (_a) {
            var ctx = _a.ctx;
            var cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
            console.log("[Logout] Clearing cookie with options:", {
                cookieName: const_1.COOKIE_NAME,
                cookieOptions: cookieOptions,
                host: ctx.req.headers.host,
                protocol: ctx.req.protocol,
                forwardedProto: ctx.req.headers['x-forwarded-proto']
            }), ;
            // 方法1: 使用clearCookie
            ctx.res.clearCookie(const_1.COOKIE_NAME, cookieOptions);
            // 方法2: 设置过期的cookie来强制覆盖
            ctx.res.cookie(const_1.COOKIE_NAME, '', __assign(__assign({}, cookieOptions), { maxAge: 0, expires: new Date(0) })), ;
            // 方法3: 清除所有可能的domain变体（处理代理环境）
            var host = ctx.req.headers.host;
            if (host) {
                var hostname = host.split(':')[0];
                // 清除当前域名的cookie
                ctx.res.clearCookie(const_1.COOKIE_NAME, __assign(__assign({}, cookieOptions), { domain: hostname }));
                ctx.res.cookie(const_1.COOKIE_NAME, '', __assign(__assign({}, cookieOptions), { domain: hostname, maxAge: 0, expires: new Date(0) }));
                // 如果是子域名，也清除父域名的cookie
                var parts = hostname.split('.');
                if (parts.length > 2) {
                    var parentDomain = parts.slice(-2).join('.');
                    ctx.res.clearCookie(const_1.COOKIE_NAME, __assign(__assign({}, cookieOptions), { domain: ".".concat(parentDomain) }));
                    ctx.res.cookie(const_1.COOKIE_NAME, '', __assign(__assign({}, cookieOptions), { domain: ".".concat(parentDomain), maxAge: 0, expires: new Date(0) }));
                }
            }
            return { success: true };
        }),
        // 用户名密码登录
        loginWithPassword: trpc_1.publicProcedure
            .input(zod_1.z.object({
            username: zod_1.z.string().min(1).max(20),
            password: zod_1.z.string().min(6),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ipAddress, result, user, sessionToken, cookieOptions;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        ipAddress = ctx.req.ip || ctx.req.headers["x-forwarded-for"] || "unknown";
                        return [4 /*yield*/, (0, auth_1.loginWithPassword)(input.username, input.password, ipAddress)];
                    case 1:
                        result = _c.sent();
                        if (!result.success) {
                            throw new server_1.TRPCError({
                                code: result.isLocked ? "FORBIDDEN" : "UNAUTHORIZED",
                                message: result.error || "登录失败",
                            });
                        }
                        return [4 /*yield*/, db.getUserByUsername(input.username)];
                    case 2:
                        user = _c.sent();
                        if (!user) {
                            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户不存在" });
                        }
                        return [4 /*yield*/, sdk_1.sdk.createSessionToken(user.id.toString(), {
                                expiresInMs: const_1.ONE_YEAR_MS,
                                name: user.name || user.username || "",
                            })
                            // 设置cookie
                        ];
                    case 3:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: const_1.ONE_YEAR_MS }));
                        return [2 /*return*/, {
                                success: true,
                                token: sessionToken, // 返回token供前端存储到localStorage
                                user: {
                                    id: user.id,
                                    username: user.username,
                                    name: user.name,
                                    role: user.role,
                                },
                            }];
                }
            });
        }); }), 
        // 用户名密码注册
        auth_1.registerWithPassword, trpc_1.publicProcedure
            .input(zod_1.z.object({
            username: zod_1.z.string().min(2).max(20),
            password: zod_1.z.string().min(6),
            name: zod_1.z.string().optional(),
            email: zod_1.z.string().email().optional(),
            inviteCode: zod_1.z.string().optional(), // 邀请码
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var result, user, dbConn, inviter, familyName, sessionToken, cookieOptions;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, auth_1.registerWithPassword)(input.username, input.password, input.name, input.email)];
                    case 1:
                        result = _c.sent();
                        if (!result.success) {
                            throw new server_1.TRPCError({
                                code: "BAD_REQUEST",
                                message: result.error || "注册失败",
                            });
                        }
                        return [4 /*yield*/, db.getUserByUsername(input.username)];
                    case 2:
                        user = _c.sent();
                        if (!user) {
                            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建用户失败" });
                        }
                        if (!input.inviteCode) return [3 /*break*/, 6];
                        dbConn = (0, db_1.getDb)();
                        return [4 /*yield*/, dbConn
                                .select({ id: schema_1.users.id })
                                .from(schema_1.users)
                                .where((0, drizzle_orm_1.eq)(schema_1.users.inviteCode, input.inviteCode))];
                    case 3:
                        inviter = (_c.sent())[0];
                        if (!inviter) return [3 /*break*/, 6];
                        // 更新新用户的邀请信息
                        return [4 /*yield*/, dbConn
                                .update(schema_1.users)
                                .set({
                                invitedByUserId: inviter.id,
                                invitedAt: new Date().toISOString(),
                            })];
                    case 4:
                        // 更新新用户的邀请信息
                        _c.sent(),
                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
                        // 更新邀请者的邀请计数
                        return [4 /*yield*/, dbConn
                                .update(schema_1.users)
                                .set({
                                inviteCount: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.users.inviteCount),
                            })];
                    case 5:
                        // 更新邀请者的邀请计数
                        _c.sent(),
                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, inviter.id));
                        _c.label = 6;
                    case 6:
                        if (!(user.role === "parent")) return [3 /*break*/, 8];
                        familyName = input.name || input.username;
                        return [4 /*yield*/, db.createFamilyForParent(user.id, familyName)];
                    case 7:
                        _c.sent();
                        _c.label = 8;
                    case 8: return [4 /*yield*/, sdk_1.sdk.createSessionToken(user.id.toString(), {
                            expiresInMs: const_1.ONE_YEAR_MS,
                            name: user.name || user.username || "",
                        })];
                    case 9:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: const_1.ONE_YEAR_MS }));
                        return [2 /*return*/, {
                                success: true,
                                token: sessionToken, // 返回token供前端存储到localStorage
                                user: {
                                    id: user.id,
                                    username: user.username,
                                    name: user.name,
                                    role: user.role,
                                },
                            }];
                }
            });
        }); }), 
        // 更新个人信息（用户自己更新）
        updateProfile, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            name: zod_1.z.string().optional(),
            email: zod_1.z.string().email().optional(),
            realName: zod_1.z.string().optional(),
            idCardNumber: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var db_instance, updateData;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                    case 1:
                        db_instance = _c.sent();
                        if (!db_instance)
                            throw new Error("Database not available");
                        updateData = {};
                        if (input.name !== undefined)
                            updateData.name = input.name;
                        if (input.email !== undefined)
                            updateData.email = input.email;
                        if (input.realName !== undefined)
                            updateData.realName = input.realName;
                        if (input.idCardNumber !== undefined)
                            updateData.idCardNumber = input.idCardNumber;
                        if (!(Object.keys(updateData).length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_instance.update(schema_1.users).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.users.id, ctx.user.id))];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3: return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 上传头像
        uploadAvatar, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            imageData: zod_1.z.string(), // base64 encoded image
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var uploadImageToCOS, avatarUrl, db_instance, error_4;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('./cos-upload'); })];
                    case 1:
                        uploadImageToCOS = (_c.sent()).uploadImageToCOS;
                        return [4 /*yield*/, uploadImageToCOS(input.imageData, 'avatars')];
                    case 2:
                        avatarUrl = _c.sent();
                        return [4 /*yield*/, (0, db_1.getDb)()];
                    case 3:
                        db_instance = _c.sent();
                        if (!db_instance) return [3 /*break*/, 5];
                        return [4 /*yield*/, db_instance.update(schema_1.users).set({ avatar: avatarUrl }).where((0, drizzle_orm_1.eq)(schema_1.users.id, ctx.user.id))];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5: return [2 /*return*/, { success: true, avatarUrl: avatarUrl }];
                    case 6:
                        error_4 = _c.sent();
                        console.error('[uploadAvatar] 错误:', error_4);
                        throw new server_1.TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: "\u5934\u50CF\u4E0A\u4F20\u5931\u8D25: ".concat(error_4 instanceof Error ? error_4.message : '未知错误')
                        });
                    case 7: return [2 /*return*/];
                }
            });
        }); }), 
        // 游客模式登录（开发专用）
        guestLogin, trpc_1.publicProcedure
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var guestUserId, user, sessionToken, cookieOptions;
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        guestUserId = 5070293;
                        return [4 /*yield*/, db.getUserById(guestUserId)];
                    case 1:
                        user = _c.sent();
                        if (!user) {
                            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "游客用户不存在" });
                        }
                        return [4 /*yield*/, sdk_1.sdk.createSessionToken(user.id.toString(), {
                                expiresInMs: const_1.ONE_YEAR_MS,
                                name: user.name || user.username || "游客",
                            })
                            // 设置cookie
                        ];
                    case 2:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: const_1.ONE_YEAR_MS }));
                        return [2 /*return*/, {
                                success: true,
                                token: sessionToken, // 返回token供前端存储到localStorage
                                user: {
                                    id: user.id,
                                    username: user.username,
                                    name: user.name,
                                    role: user.role,
                                },
                            }];
                }
            });
        }); }), 
        // 修改密码
        changePassword, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            currentPassword: zod_1.z.string().min(6),
            newPassword: zod_1.z.string().min(6),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var user, verifyPassword, isValid, newHash;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getUserById(ctx.user.id)];
                    case 1:
                        user = _c.sent();
                        if (!user || !user.passwordHash) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "无法修改密码" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./auth"); })];
                    case 2:
                        verifyPassword = (_c.sent()).verifyPassword;
                        return [4 /*yield*/, verifyPassword(input.currentPassword, user.passwordHash)];
                    case 3:
                        isValid = _c.sent();
                        if (!isValid) {
                            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "当前密码错误" });
                        }
                        return [4 /*yield*/, (0, auth_1.hashPassword)(input.newPassword)];
                    case 4:
                        newHash = _c.sent();
                        return [4 /*yield*/, db.updateUserPassword(ctx.user.id, newHash)];
                    case 5:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 一键登录（管理员和家长功能）
        quickLogin, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            targetUserId: zod_1.z.number(),
            password: zod_1.z.string().optional(), // 宝宝切换回家长时需要提供家长密码
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var targetUser, sdk_2, sessionToken, cookieOptions, targetUser, kids, isMyKid, sdk_3, sessionToken, cookieOptions, targetUser, kids, isMyParent, verifyPassword, isPasswordValid, sdk_4, sessionToken, cookieOptions;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!(ctx.user.role === "super_admin")) return [3 /*break*/, 4];
                        return [4 /*yield*/, db.getUserById(input.targetUserId)];
                    case 1:
                        targetUser = _c.sent();
                        if (!targetUser) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/sdk"); })];
                    case 2:
                        sdk_2 = (_c.sent()).sdk;
                        return [4 /*yield*/, sdk_2.createSessionToken(targetUser.id.toString(), {
                                name: targetUser.name || targetUser.username || "",
                                expiresInMs: 24 * 60 * 60 * 1000,
                            })];
                    case 3:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: 24 * 60 * 60 * 1000 }));
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: targetUser.id,
                                    username: targetUser.username,
                                    name: targetUser.name,
                                    role: targetUser.role,
                                },
                            }];
                    case 4:
                        if (!(ctx.user.role === "parent")) return [3 /*break*/, 9];
                        return [4 /*yield*/, db.getUserById(input.targetUserId)];
                    case 5:
                        targetUser = _c.sent();
                        if (!targetUser) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
                        }
                        if (targetUser.role !== "baby") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只能切换到宝宝账户" });
                        }
                        return [4 /*yield*/, db.getKidsByParent(ctx.user.id)];
                    case 6:
                        kids = _c.sent();
                        isMyKid = kids.some(function (kid) { return kid.userId === input.targetUserId; });
                        if (!isMyKid) {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只能切换到自己管理的宝宝账户" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/sdk"); })];
                    case 7:
                        sdk_3 = (_c.sent()).sdk;
                        return [4 /*yield*/, sdk_3.createSessionToken(targetUser.id.toString(), {
                                name: targetUser.name || targetUser.username || "",
                                expiresInMs: 24 * 60 * 60 * 1000,
                            })];
                    case 8:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: 24 * 60 * 60 * 1000 }));
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: targetUser.id,
                                    username: targetUser.username,
                                    name: targetUser.name,
                                    role: targetUser.role,
                                },
                            }];
                    case 9:
                        if (!(ctx.user.role === "baby")) return [3 /*break*/, 16];
                        return [4 /*yield*/, db.getUserById(input.targetUserId)];
                    case 10:
                        targetUser = _c.sent();
                        if (!targetUser) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
                        }
                        if (targetUser.role !== "parent") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只能切换到家长账户" });
                        }
                        return [4 /*yield*/, db.getKidsByParent(input.targetUserId)];
                    case 11:
                        kids = _c.sent();
                        isMyParent = kids.some(function (kid) { return kid.userId === ctx.user.id; });
                        if (!isMyParent) {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只能切换到自己的家长账户" });
                        }
                        // 验证家长密码
                        if (!input.password) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "请输入家长密码" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./auth"); })];
                    case 12:
                        verifyPassword = (_c.sent()).verifyPassword;
                        if (!targetUser.passwordHash) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "家长账户未设置密码" });
                        }
                        return [4 /*yield*/, verifyPassword(input.password, targetUser.passwordHash)];
                    case 13:
                        isPasswordValid = _c.sent();
                        if (!isPasswordValid) {
                            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "家长密码错误" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/sdk"); })];
                    case 14:
                        sdk_4 = (_c.sent()).sdk;
                        return [4 /*yield*/, sdk_4.createSessionToken(targetUser.id.toString(), {
                                name: targetUser.name || targetUser.username || "",
                                expiresInMs: 24 * 60 * 60 * 1000,
                            })];
                    case 15:
                        sessionToken = _c.sent();
                        cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                        ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: 24 * 60 * 60 * 1000 }));
                        return [2 /*return*/, {
                                success: true,
                                user: {
                                    id: targetUser.id,
                                    username: targetUser.username,
                                    name: targetUser.name,
                                    role: targetUser.role,
                                },
                            }];
                    case 16: throw new server_1.TRPCError({ code: "FORBIDDEN", message: "无权使用一键登录功能" });
                }
            });
        }); }), 
        // 获取当前用户的功能权限
        getMyFeaturePermissions, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var userId, userRole, dbPermissions, permissions, result, featureKeys, _loop_1, _i, featureKeys_1, key;
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        userId = ctx.user.id;
                        userRole = ctx.user.role;
                        // 超级管理员拥有所有权限
                        if (userRole === 'super_admin') {
                            return [2 /*return*/, {
                                    'my-equity': true,
                                    'node-growth': true,
                                    'my-points': true,
                                    'ai-assistant': true,
                                    'wallet': true,
                                }];
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-permissions'); })];
                    case 1:
                        dbPermissions = _c.sent();
                        return [4 /*yield*/, dbPermissions.getUserPermissions(userId)];
                    case 2:
                        permissions = _c.sent();
                        result = {};
                        featureKeys = ['my-equity', 'node-growth', 'my-points', 'ai-assistant', 'wallet'];
                        _loop_1 = function (key) {
                            var perm = permissions.find(function (p) { return p.featureKey === key; });
                            if (perm) {
                                result[key] = perm.isEnabled;
                            }
                            else {
                                // 默认关闭
                                result[key] = false;
                            }
                        };
                        for (_i = 0, featureKeys_1 = featureKeys; _i < featureKeys_1.length; _i++) {
                            key = featureKeys_1[_i];
                            _loop_1(key);
                        }
                        return [2 /*return*/, result];
                }
            });
        }); })))))))
    }),
    // 通用文件上传API
    upload: (0, trpc_1.router)({
        file: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            base64Data: zod_1.z.string(),
            contentType: zod_1.z.string(),
            prefix: zod_1.z.string().default("uploads"),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var buffer, ext, fileKey, url;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        buffer = Buffer.from(input.base64Data, "base64");
                        ext = input.contentType.split("/")[1] || "bin";
                        fileKey = "".concat(input.prefix, "/").concat(Date.now(), "-").concat((0, nanoid_1.nanoid)(), ".").concat(ext);
                        return [4 /*yield*/, (0, storage_1.storagePut)(fileKey, buffer, input.contentType)];
                    case 1:
                        url = (_c.sent()).url;
                        return [2 /*return*/, { url: url, fileKey: fileKey }];
                }
            });
        }); }))
    }),
    // ==================== 管理后台 ====================
    admin: (0, trpc_1.router)({
        // 获取所有用户
        getUsers: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                if (ctx.user.role !== "super_admin") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                }
                return [2 /*return*/, db.getAllUsers()];
            });
        }); }),
        // 解锁用户
        unlockUser: trpc_1.protectedProcedure
            .input(zod_1.z.object({ userId: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以解锁用户" });
                        }
                        return [4 /*yield*/, db.unlockUser(input.userId)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }),
        // 设置用户角色
        setUserRole: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            role: zod_1.z.enum(["super_admin", "parent", "baby"]),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以设置角色" });
                        }
                        return [4 /*yield*/, db.updateUserRole(input.userId, input.role)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 创建用户（管理员创建）
        createUser, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            username: zod_1.z.string().min(1).max(20),
            password: zod_1.z.string().min(6),
            name: zod_1.z.string().optional(),
            role: zod_1.z.enum(["super_admin", "parent", "baby"]).default("parent"),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var existingUser, passwordHash, userId;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建用户" });
                        }
                        return [4 /*yield*/, db.getUserByUsername(input.username)];
                    case 1:
                        existingUser = _c.sent();
                        if (existingUser) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "用户名已存在" });
                        }
                        return [4 /*yield*/, (0, auth_1.hashPassword)(input.password)];
                    case 2:
                        passwordHash = _c.sent();
                        return [4 /*yield*/, db.createUserWithPassword({
                                username: input.username,
                                passwordHash: passwordHash,
                                name: input.name,
                                role: input.role,
                            })];
                    case 3:
                        userId = _c.sent();
                        return [2 /*return*/, { success: true, userId: userId }];
                }
            });
        }); }), 
        // 重置用户密码
        resetUserPassword, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            newPassword: zod_1.z.string().min(6),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var passwordHash;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以重置密码" });
                        }
                        return [4 /*yield*/, (0, auth_1.hashPassword)(input.newPassword)];
                    case 1:
                        passwordHash = _c.sent();
                        return [4 /*yield*/, db.updateUserPassword(input.userId, passwordHash)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 获取所有家长用户
        getAllParents, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                if (ctx.user.role !== "super_admin") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                }
                return [2 /*return*/, db.getAllParents()];
            });
        }); }), 
        // 获取家庭的所有子功能权限
        getFamilyFeatures, trpc_1.protectedProcedure
            .input(zod_1.z.object({ familyId: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                if (ctx.user.role !== "super_admin") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                }
                return [2 /*return*/, db.getFamilyFeatures(input.familyId)];
            });
        }); }), 
        // 更新子功能权限
        updateFamilyFeature, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            familyId: zod_1.z.number(),
            featureName: zod_1.z.string(),
            subFeatureName: zod_1.z.string(),
            enabled: zod_1.z.boolean(),
            settings: zod_1.z.any().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
                        }
                        return [4 /*yield*/, db.upsertFamilyFeature(input)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 批量更新子功能权限
        batchUpdateFamilyFeatures, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            familyId: zod_1.z.number(),
            features: zod_1.z.array(zod_1.z.object({
                featureName: zod_1.z.string(),
                subFeatureName: zod_1.z.string(),
                enabled: zod_1.z.boolean(),
                settings: zod_1.z.any().optional(),
            }))
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
                        }
                        return [4 /*yield*/, db.batchUpdateFamilyFeatures(input.familyId, input.features)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 获取当前用户的功能权限（家长/宝宝使用）
        getMyFamilyFeatures, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var user;
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                user = ctx.user;
                if (!user.familyId) {
                    return [2 /*return*/, []];
                }
                return [2 /*return*/, db.getFamilyFeatures(user.familyId)];
            });
        }); }), 
        // 获取功能树（带家庭权限状态）
        getFeatureTree, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            familyId: zod_1.z.number(),
        })
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var _c, FEATURE_TREE, buildFeatureTree, familyFeatures, featureMap, featuresWithStatus;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("../shared/featureTree"); })];
                    case 1:
                        _c = _d.sent(), FEATURE_TREE = _c.FEATURE_TREE, buildFeatureTree = _c.buildFeatureTree;
                        return [4 /*yield*/, db.getFamilyFeatures(input.familyId)];
                    case 2:
                        familyFeatures = _d.sent();
                        featureMap = new Map(familyFeatures.map(function (f) { return [f.path, f]; }));
                        featuresWithStatus = FEATURE_TREE.map(function (node) {
                            var _a, _b;
                            return (__assign(__assign({}, node), { enabled: (_b = (_a = featureMap.get(node.path)) === null || _a === void 0 ? void 0 : _a.enabled) !== null && _b !== void 0 ? _b : false }));
                        });
                        return [2 /*return*/, buildFeatureTree(featuresWithStatus)];
                }
            });
        }); }), 
        // 批量更新功能权限（按path）
        batchUpdateFeaturesByPath, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            familyId: zod_1.z.number(),
            updates: zod_1.z.array(zod_1.z.object({
                path: zod_1.z.string(),
                enabled: zod_1.z.boolean(),
            }))
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var sharingPermissionUpdate;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
                        }
                        console.log('[batchUpdateFeaturesByPath] 收到保存请求:', {
                            familyId: input.familyId,
                            updatesCount: input.updates.length,
                            updates: input.updates.slice(0, 10),
                        });
                        return [4 /*yield*/, db.batchUpdateFeaturesByPath(input.familyId, input.updates)];
                    case 1:
                        _c.sent();
                        sharingPermissionUpdate = input.updates.find(function (u) { return u.path === '社交/好友记/好友记 - 共享权限'; });
                        if (!(sharingPermissionUpdate !== undefined)) return [3 /*break*/, 3];
                        console.log('[batchUpdateFeaturesByPath] 同步更新用户sharingEnabled:', sharingPermissionUpdate.enabled);
                        return [4 /*yield*/, db.updateUsersSharingEnabled(input.familyId, sharingPermissionUpdate.enabled)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        console.log('[batchUpdateFeaturesByPath] 保存成功');
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 同步功能树到数据库（初始化/更新时使用）
        syncFeatureTree, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            familyId: zod_1.z.number(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var FEATURE_TREE, features;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以同步功能树" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("../shared/featureTree"); })];
                    case 1:
                        FEATURE_TREE = (_c.sent()).FEATURE_TREE;
                        features = FEATURE_TREE.map(function (node) {
                            var _a, _b;
                            return ({
                                featureName: node.path.split('/')[0], // 顶级模块名称
                                subFeatureName: node.name,
                                parentFeature: node.parentId ? (_b = (_a = FEATURE_TREE.find(function (n) { return n.id === node.parentId; })) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null : null,
                                level: node.level,
                                path: node.path,
                                displayOrder: node.displayOrder,
                                enabled: false, // 默认关闭
                            });
                        });
                        return [4 /*yield*/, db.syncFamilyFeatures(input.familyId, features)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 检查功能权限
        checkPermission, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            path: zod_1.z.string(),
        })
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var user;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                user = ctx.user;
                if (!user.familyId) {
                    return [2 /*return*/, false];
                }
                return [2 /*return*/, db.checkFeaturePermission(user.familyId, input.path)];
            });
        }); }), 
        // 获取所有家庭
        getFamilies, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                if (ctx.user.role !== "super_admin") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                }
                return [2 /*return*/, db.getAllFamilies()];
            });
        }); }), 
        // 更新用户的家庭归属
        updateUserFamily, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            familyId: zod_1.z.number().nullable(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户家庭归属" });
                        }
                        return [4 /*yield*/, db.updateUserFamily(input.userId, input.familyId)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 更新用户关系：关联家长和宝宝
        updateUserRelation, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            relatedUserId: zod_1.z.number().nullable(),
            relationType: zod_1.z.enum(['parent', 'child']),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户关系" });
                        }
                        return [4 /*yield*/, db.updateUserRelation(input.userId, input.relatedUserId, input.relationType)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 批量删除用户
        deleteUsers, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userIds: zod_1.z.array(zod_1.z.number()),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除用户" });
                        }
                        return [4 /*yield*/, db.deleteUsers(input.userIds)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 更新用户基本信息
        updateUser, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            username: zod_1.z.string().optional(),
            name: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以编辑用户信息" });
                        }
                        return [4 /*yield*/, db.updateUserInfo(input.userId, {
                                username: input.username,
                                name: input.name,
                            })];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 切换钱包功能开关
        toggleWalletEnabled, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            enabled: zod_1.z.boolean(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var db, users, eq;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以操作" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 1:
                        db = _c.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
                    case 2:
                        users = (_c.sent()).users;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                    case 3:
                        eq = (_c.sent()).eq;
                        return [4 /*yield*/, db.default.update(users)
                                .set({ walletEnabled: input.enabled ? 1 : 0 })
                                .where(eq(users.id, input.userId))];
                    case 4:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 获取用户的功能权限
        getUserPermissions, trpc_1.protectedProcedure
            .input(zod_1.z.object({ userId: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var dbPermissions;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-permissions"); })];
                    case 1:
                        dbPermissions = _c.sent();
                        return [4 /*yield*/, dbPermissions.getUserPermissions(input.userId)];
                    case 2: return [2 /*return*/, _c.sent()];
                }
            });
        }); }), 
        // 获取所有可用功能列表
        getAllFeatures, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var dbPermissions;
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-permissions"); })];
                    case 1:
                        dbPermissions = _c.sent();
                        return [2 /*return*/, dbPermissions.getAllFeatures()];
                }
            });
        }); }), 
        // 设置用户功能权限
        setUserPermissions, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            userId: zod_1.z.number(),
            permissions: zod_1.z.array(zod_1.z.object({
                featureKey: zod_1.z.string(),
                isEnabled: zod_1.z.boolean(),
            }))
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var dbPermissions;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-permissions"); })];
                    case 1:
                        dbPermissions = _c.sent();
                        return [4 /*yield*/, dbPermissions.setUserPermissions(input.userId, input.permissions)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }))))))))))))))))
    }),
    // ==================== 功能权限检查 ====================
    features: (0, trpc_1.router)({
        // 检查用户的功能权限（普通用户可访问）
        checkPermission: trpc_1.protectedProcedure
            .input(zod_1.z.object({ path: zod_1.z.string() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var feature;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log('[features.checkPermission] ========== 开始检查 ==========');
                        console.log('[features.checkPermission] 调用参数:', {
                            userId: ctx.user.id,
                            username: ctx.user.username,
                            familyId: ctx.user.familyId,
                            sharingEnabled: ctx.user.sharingEnabled,
                            path: input.path
                        });
                        // 对于"好友记 - 共享权限"，直接返回user.sharingEnabled
                        if (input.path === '社交/好友记/好友记 - 共享权限') {
                            console.log('[features.checkPermission] 返回用户级别权限:', ctx.user.sharingEnabled);
                            return [2 /*return*/, { enabled: ctx.user.sharingEnabled || false }];
                        }
                        // 其他功能仍然使用familyFeatures表
                        if (!ctx.user.familyId) {
                            console.log('[features.checkPermission] 用户没有familyId，返回false');
                            return [2 /*return*/, { enabled: false }];
                        }
                        return [4 /*yield*/, db.checkFeaturePermission(ctx.user.familyId, input.path)];
                    case 1:
                        feature = _c.sent();
                        console.log('[features.checkPermission] 权限检查结果:', {
                            familyId: ctx.user.familyId,
                            path: input.path,
                            result: feature
                        });
                        console.log('[features.checkPermission] ========== 检查结束 ==========');
                        return [2 /*return*/, { enabled: feature || false }];
                }
            });
        }); }),
    }),
    // ==================== 孩子档案 ====================
    children: (0, trpc_1.router)({
        list: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getChildrenByParent(ctx.user.id)];
            });
        }); }),
        create: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            name: zod_1.z.string().min(1).max(100),
            avatar: zod_1.z.string().optional(),
            birthday: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createChildProfile({
                            parentId: ctx.user.id,
                            name: input.name,
                            avatar: input.avatar,
                            birthday: input.birthday ? new Date(input.birthday) : undefined,
                        })];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), exports.get, trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getChildById(input.id)];
            });
        }); }))
    }),
    // ==================== 游戏 ====================
    games: (0, trpc_1.router)({
        saveRecord: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            gameType: zod_1.z.enum(["memory", "puzzle", "math"]),
            score: zod_1.z.number(),
            level: zod_1.z.number().default(1),
            duration: zod_1.z.number().default(0),
            childId: zod_1.z.number().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id, pointsEarned;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createGameRecord({
                            userId: ctx.user.id,
                            childId: input.childId,
                            gameType: input.gameType,
                            score: input.score,
                            level: input.level,
                            duration: input.duration,
                        })
                        // 计算积分奖励
                    ];
                    case 1:
                        id = _c.sent();
                        pointsEarned = Math.floor(input.score / 10);
                        if (!(pointsEarned > 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, db.updateUserPoints(ctx.user.id, pointsEarned)];
                    case 2:
                        _c.sent();
                        if (!input.childId) return [3 /*break*/, 4];
                        return [4 /*yield*/, db.updateChildPoints(input.childId, pointsEarned)];
                    case 3:
                        _c.sent();
                        _c.label = 4;
                    case 4: return [4 /*yield*/, db.createPointTransaction({
                            userId: ctx.user.id,
                            childId: input.childId,
                            amount: pointsEarned,
                            type: "game",
                            referenceId: id,
                            description: "\u6E38\u620F\u5956\u52B1: ".concat(input.gameType),
                        })];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6: return [2 /*return*/, { id: id, pointsEarned: pointsEarned }];
                }
            });
        }); }), getRecords, trpc_1.protectedProcedure
            .input(zod_1.z.object({ gameType: zod_1.z.string().optional() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getGameRecordsByUser(ctx.user.id, input.gameType)];
            });
        }); }), getLeaderboard, trpc_1.publicProcedure
            .input(zod_1.z.object({ gameType: zod_1.z.enum(["memory", "puzzle", "math"]), limit: zod_1.z.number().default(10) }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getTopScores(input.gameType, input.limit)];
            });
        }); }))
    }),
    antonym: (0, trpc_1.router)({
        getRandomPairs: trpc_1.publicProcedure
            .input(zod_1.z.object({
            count: zod_1.z.number().min(10).max(50).default(10),
            difficulty: zod_1.z.enum(['beginner', 'advanced']).default('beginner') // 初级/高级
        })
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getRandomAntonymPairs(input.count, input.difficulty)];
            });
        }); }), getAllPairs, trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getAllAntonymPairs()];
            });
        }); }), createPair, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            word: zod_1.z.string().min(1).max(50),
            antonym: zod_1.z.string().min(1).max(50),
            category: zod_1.z.string().default("general"),
            difficulty: zod_1.z.enum(["easy", "medium", "hard"]).default("easy"),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can add antonyms" });
                        }
                        return [4 /*yield*/, db.createAntonymPair(input)];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), updatePair, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            word: zod_1.z.string().optional(),
            antonym: zod_1.z.string().optional(),
            category: zod_1.z.string().optional(),
            difficulty: zod_1.z.enum(["easy", "medium", "hard"]).optional(),
            isActive: zod_1.z.boolean().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can update antonyms" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateAntonymPair(id, data)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), deletePair, trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can delete antonyms" });
                        }
                        return [4 /*yield*/, db.deleteAntonymPair(input.id)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }))))
    }),
    // ==================== 知识 ====================
    knowledge: (0, trpc_1.router)({
        getCategories: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getAllKnowledgeCategories()];
            });
        }); }),
        createCategory: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            name: zod_1.z.string().min(1).max(100),
            icon: zod_1.z.string().optional(),
            color: zod_1.z.string().optional(),
            description: zod_1.z.string().optional(),
            sortOrder: zod_1.z.number().default(0),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建分类" });
                        }
                        return [4 /*yield*/, db.createKnowledgeCategory(input)];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), updateCategory, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            name: zod_1.z.string().min(1).max(100).optional(),
            icon: zod_1.z.string().optional(),
            color: zod_1.z.string().optional(),
            description: zod_1.z.string().optional(),
            sortOrder: zod_1.z.number().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新分类" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateKnowledgeCategory(id, data)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), deleteCategory, trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除分类" });
                        }
                        return [4 /*yield*/, db.deleteKnowledgeCategory(input.id)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), getItems, trpc_1.publicProcedure
            .input(zod_1.z.object({ categoryId: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getKnowledgeItemsByCategory(input.categoryId)];
            });
        }); }), getItem, trpc_1.publicProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var item;
            var input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getKnowledgeItemById(input.id)];
                    case 1:
                        item = _c.sent();
                        if (!item) return [3 /*break*/, 3];
                        return [4 /*yield*/, db.incrementKnowledgeViewCount(input.id)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3: return [2 /*return*/, item];
                }
            });
        }); }), createItem, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            categoryId: zod_1.z.number(),
            title: zod_1.z.string().min(1).max(200),
            content: zod_1.z.string(),
            coverImage: zod_1.z.string().optional(),
            images: zod_1.z.array(zod_1.z.string()).optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建内容" });
                        }
                        return [4 /*yield*/, db.createKnowledgeItem(__assign(__assign({}, input), { createdBy: ctx.user.id }))];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), updateItem, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            title: zod_1.z.string().min(1).max(200).optional(),
            content: zod_1.z.string().optional(),
            coverImage: zod_1.z.string().optional(),
            images: zod_1.z.array(zod_1.z.string()).optional(),
            isPublished: zod_1.z.boolean().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新内容" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateKnowledgeItem(id, data)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), deleteItem, trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除内容" });
                        }
                        return [4 /*yield*/, db.deleteKnowledgeItem(input.id)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); })))))
    }),
    // ==================== 相册 ====================
    albums: (0, trpc_1.router)({
        // 公开访问：获取所有相册
        list: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getAllPublicAlbums()];
            });
        }); }),
        // 公开访问：获取相册详情
        get: trpc_1.publicProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var album;
            var input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getAlbumById(input.id)];
                    case 1:
                        album = _c.sent();
                        if (!album) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
                        }
                        return [2 /*return*/, album];
                }
            });
        }); }),
        create: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            name: zod_1.z.string().min(1).max(100),
            description: zod_1.z.string().optional(),
            childId: zod_1.z.number().optional(),
            isPublic: zod_1.z.boolean().default(false),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createAlbum(__assign({ userId: ctx.user.id }, input))];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), update, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            name: zod_1.z.string().min(1).max(100).optional(),
            description: zod_1.z.string().optional(),
            coverImage: zod_1.z.string().optional(),
            isPublic: zod_1.z.boolean().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var album, id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getAlbumById(input.id)];
                    case 1:
                        album = _c.sent();
                        if (!album || album.userId !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateAlbum(id, data)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), delete , trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var album;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getAlbumById(input.id)];
                    case 1:
                        album = _c.sent();
                        if (!album || album.userId !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
                        }
                        return [4 /*yield*/, db.deleteAlbum(input.id)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); })))
    }),
    // ==================== 照片 ====================
    photos: (0, trpc_1.router)({
        // 公开访问：获取相册中的照片列表
        list: trpc_1.publicProcedure
            .input(zod_1.z.object({ albumId: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var album;
            var input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getAlbumById(input.albumId)];
                    case 1:
                        album = _c.sent();
                        if (!album) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
                        }
                        return [2 /*return*/, db.getPhotosByAlbum(input.albumId)];
                }
            });
        }); }),
        // 公开访问：获取单张照片详情
        get: trpc_1.publicProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getPhotoById(input.id)];
            });
        }); }),
        upload: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            albumId: zod_1.z.number(),
            fileData: zod_1.z.string(), // base64 encoded
            fileName: zod_1.z.string(),
            mimeType: zod_1.z.string(),
            description: zod_1.z.string().optional(),
            takenAt: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var album, buffer, fileKey, url, id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getAlbumById(input.albumId)];
                    case 1:
                        album = _c.sent();
                        if (!album || album.userId !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
                        }
                        buffer = Buffer.from(input.fileData, "base64");
                        fileKey = "photos/".concat(ctx.user.id, "/").concat((0, nanoid_1.nanoid)(), "-").concat(input.fileName);
                        return [4 /*yield*/, (0, storage_1.storagePut)(fileKey, buffer, input.mimeType)];
                    case 2:
                        url = (_c.sent()).url;
                        return [4 /*yield*/, db.createPhoto({
                                albumId: input.albumId,
                                userId: ctx.user.id,
                                url: url,
                                fileKey: fileKey,
                                description: input.description,
                                takenAt: input.takenAt ? new Date(input.takenAt) : undefined,
                            })
                            // 如果是相册第一张照片，设为封面
                        ];
                    case 3:
                        id = _c.sent();
                        if (!!album.coverImage) return [3 /*break*/, 5];
                        return [4 /*yield*/, db.updateAlbum(input.albumId, { coverImage: url })];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5: return [2 /*return*/, { id: id, url: url }];
                }
            });
        }); }), update, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            description: zod_1.z.string().optional(),
            takenAt: zod_1.z.string().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var photo, id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getPhotoById(input.id)];
                    case 1:
                        photo = _c.sent();
                        if (!photo || photo.userId !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updatePhoto(id, __assign(__assign({}, data), { takenAt: data.takenAt ? new Date(data.takenAt) : undefined }))];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), delete , trpc_1.protectedProcedure
            .input(zod_1.z.object({ id: zod_1.z.number() }))
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var photo;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getPhotoById(input.id)];
                    case 1:
                        photo = _c.sent();
                        if (!photo || photo.userId !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
                        }
                        return [4 /*yield*/, db.deletePhoto(input.id)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), addComment, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            photoId: zod_1.z.number(),
            content: zod_1.z.string().min(1),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createPhotoComment({
                            photoId: input.photoId,
                            userId: ctx.user.id,
                            content: input.content,
                        })];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), getComments, trpc_1.protectedProcedure
            .input(zod_1.z.object({ photoId: zod_1.z.number() }))
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getCommentsByPhoto(input.photoId)];
            });
        }); }))))
    }),
    // ==================== 奖励系统 ====================
    rewards: (0, trpc_1.router)({
        // 勋章
        getBadges: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getAllBadges()];
            });
        }); }),
        getUserBadges: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getUserBadges(ctx.user.id)];
            });
        }); }),
        awardBadge: trpc_1.protectedProcedure
            .input(zod_1.z.object({
            badgeId: zod_1.z.number(),
            childId: zod_1.z.number().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.awardBadge({
                            userId: ctx.user.id,
                            badgeId: input.badgeId,
                            childId: input.childId,
                        })];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), 
        // 任务
        getTasks, trpc_1.protectedProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getActiveTasks()];
            });
        }); }), getMyTasks, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getTasksByCreator(ctx.user.id)];
            });
        }); }), createTask, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            title: zod_1.z.string().min(1).max(200),
            description: zod_1.z.string().optional(),
            taskType: zod_1.z.enum(["daily", "weekly", "custom"]).default("custom"),
            points: zod_1.z.number().default(10),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createTask(__assign({ createdBy: ctx.user.id }, input))];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), updateTask, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            title: zod_1.z.string().min(1).max(200).optional(),
            description: zod_1.z.string().optional(),
            points: zod_1.z.number().optional(),
            isActive: zod_1.z.boolean().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var task, id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getTaskById(input.id)];
                    case 1:
                        task = _c.sent();
                        if (!task || task.createdBy !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateTask(id, data)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), completeTask, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            taskId: zod_1.z.number(),
            childId: zod_1.z.number().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var task, id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getTaskById(input.taskId)];
                    case 1:
                        task = _c.sent();
                        if (!task) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
                        }
                        return [4 /*yield*/, db.completeTask({
                                taskId: input.taskId,
                                userId: ctx.user.id,
                                childId: input.childId,
                                pointsEarned: task.points,
                            })
                            // 发放积分
                        ];
                    case 2:
                        id = _c.sent();
                        // 发放积分
                        return [4 /*yield*/, db.updateUserPoints(ctx.user.id, task.points)];
                    case 3:
                        // 发放积分
                        _c.sent();
                        if (!input.childId) return [3 /*break*/, 5];
                        return [4 /*yield*/, db.updateChildPoints(input.childId, task.points)];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5: return [4 /*yield*/, db.createPointTransaction({
                            userId: ctx.user.id,
                            childId: input.childId,
                            amount: task.points,
                            type: "task",
                            referenceId: input.taskId,
                            description: "\u5B8C\u6210\u4EFB\u52A1: ".concat(task.title),
                        })];
                    case 6:
                        _c.sent();
                        return [2 /*return*/, { id: id, pointsEarned: task.points }];
                }
            });
        }); }), getCompletions, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getTaskCompletionsByUser(ctx.user.id)];
            });
        }); }), 
        // 奖品
        list, trpc_1.publicProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                // 未登录或超级管理员：返回所有活跃奖品
                if (!ctx.user || ctx.user.role === "super_admin") {
                    return [2 /*return*/, db.getActiveRewards()];
                }
                // 家长：只返回自己创建的奖品
                if (ctx.user.role === "parent") {
                    return [2 /*return*/, db.getRewardsByCreator(ctx.user.id)];
                }
                // 其他角色：返回所有活跃奖品
                return [2 /*return*/, db.getActiveRewards()];
            });
        }); }), getRewards, trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db.getActiveRewards()];
            });
        }); }), createReward, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            name: zod_1.z.string().min(1).max(100),
            description: zod_1.z.string().optional(),
            icon: zod_1.z.string().optional(),
            pointsCost: zod_1.z.number().default(100),
            stock: zod_1.z.number().default(-1),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.createReward(__assign({ createdBy: ctx.user.id }, input))];
                    case 1:
                        id = _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), updateReward, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            name: zod_1.z.string().min(1).max(100).optional(),
            description: zod_1.z.string().optional(),
            icon: zod_1.z.string().optional(),
            pointsCost: zod_1.z.number().optional(),
            stock: zod_1.z.number().optional(),
            isActive: zod_1.z.boolean().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var reward, id, data;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getRewardById(input.id)];
                    case 1:
                        reward = _c.sent();
                        if (!reward) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
                        }
                        // 家长只能编辑自己创建的奖品，超级管理员可以编辑所有奖品
                        if (ctx.user.role !== "super_admin" && reward.createdBy !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "无权编辑此奖品" });
                        }
                        id = input.id, data = __rest(input, ["id"]);
                        return [4 /*yield*/, db.updateReward(id, data)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), redeemReward, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            rewardId: zod_1.z.number(),
            childId: zod_1.z.number().optional(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var reward, user, id;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getRewardById(input.rewardId)];
                    case 1:
                        reward = _c.sent();
                        if (!reward || !reward.isActive) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
                        }
                        return [4 /*yield*/, db.getUserById(ctx.user.id)];
                    case 2:
                        user = _c.sent();
                        if (!user || user.points < reward.pointsCost) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "积分不足" });
                        }
                        // 检查库存
                        if (reward.stock !== -1 && reward.stock <= 0) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
                        }
                        // 扣除积分
                        return [4 /*yield*/, db.updateUserPoints(ctx.user.id, -reward.pointsCost)];
                    case 3:
                        // 扣除积分
                        _c.sent();
                        if (!input.childId) return [3 /*break*/, 5];
                        return [4 /*yield*/, db.updateChildPoints(input.childId, -reward.pointsCost)];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5:
                        if (!(reward.stock !== -1)) return [3 /*break*/, 7];
                        return [4 /*yield*/, db.updateReward(input.rewardId, { stock: reward.stock - 1 })];
                    case 6:
                        _c.sent();
                        _c.label = 7;
                    case 7: return [4 /*yield*/, db.redeemReward({
                            rewardId: input.rewardId,
                            userId: ctx.user.id,
                            childId: input.childId,
                            pointsSpent: reward.pointsCost,
                        })
                        // 记录积分交易
                    ];
                    case 8:
                        id = _c.sent();
                        // 记录积分交易
                        return [4 /*yield*/, db.createPointTransaction({
                                userId: ctx.user.id,
                                childId: input.childId,
                                amount: -reward.pointsCost,
                                type: "reward",
                                referenceId: input.rewardId,
                                description: "\u5151\u6362\u5956\u54C1: ".concat(reward.name),
                            })];
                    case 9:
                        // 记录积分交易
                        _c.sent();
                        return [2 /*return*/, { id: id }];
                }
            });
        }); }), getRedemptions, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getRedemptionsByUser(ctx.user.id)];
            });
        }); }), updateRedemptionStatus, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
            status: zod_1.z.enum(["pending", "approved", "rejected", "completed"]),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (ctx.user.role !== "super_admin") {
                            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
                        }
                        return [4 /*yield*/, db.updateRedemptionStatus(input.id, input.status)];
                    case 1:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), 
        // 积分
        getPoints, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var user;
            var _c;
            var ctx = _b.ctx;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, db.getUserById(ctx.user.id)];
                    case 1:
                        user = _d.sent();
                        return [2 /*return*/, { points: (_c = user === null || user === void 0 ? void 0 : user.points) !== null && _c !== void 0 ? _c : 0 }];
                }
            });
        }); }), deleteReward, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            id: zod_1.z.number(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var reward;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getRewardById(input.id)];
                    case 1:
                        reward = _c.sent();
                        if (!reward || reward.createdBy !== ctx.user.id) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
                        }
                        return [4 /*yield*/, db.deleteReward(input.id)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true }];
                }
            });
        }); }), getTransactions, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx;
            return __generator(this, function (_c) {
                return [2 /*return*/, db.getPointTransactionsByUser(ctx.user.id)];
            });
        }); }), 
        // 获取积分历史记录
        getPointHistory, trpc_1.protectedProcedure
            .input(zod_1.z.object({
            limit: zod_1.z.number().default(50),
        })
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_c) {
                return [2 /*return*/, dbPoints.getPointHistory(ctx.user.id, input.limit)];
            });
        }); }), 
        // 获取积分统计数据
        getPointStats, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var user, stats;
            var _c;
            var ctx = _b.ctx;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, db.getUserById(ctx.user.id)];
                    case 1:
                        user = _d.sent();
                        return [4 /*yield*/, dbPoints.getPointStats(ctx.user.id)];
                    case 2:
                        stats = _d.sent();
                        return [2 /*return*/, __assign({ currentPoints: (_c = user === null || user === void 0 ? void 0 : user.points) !== null && _c !== void 0 ? _c : 0 }, stats)];
                }
            });
        }); }), 
        // 用星星兑换奖品
        redeemWithStars, trpc_1.publicProcedure
            .input(zod_1.z.object({
            kidId: zod_1.z.number(),
            rewardId: zod_1.z.number(),
        })
            .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var reward, kid, redemptionId;
            var input = _b.input;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, db.getRewardById(input.rewardId)];
                    case 1:
                        reward = _c.sent();
                        if (!reward || !reward.isActive) {
                            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
                        }
                        return [4 /*yield*/, db.getSpecialKidById(input.kidId)];
                    case 2:
                        kid = _c.sent();
                        if (!kid || kid.stars < reward.pointsCost) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
                        }
                        // 检查库存
                        if (reward.stock !== -1 && reward.stock <= 0) {
                            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
                        }
                        // 扣除星星
                        return [4 /*yield*/, db.updateSpecialKidStars(input.kidId, -reward.pointsCost)];
                    case 3:
                        // 扣除星星
                        _c.sent();
                        if (!(reward.stock !== -1)) return [3 /*break*/, 5];
                        return [4 /*yield*/, db.updateReward(input.rewardId, { stock: reward.stock - 1 })];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5: return [4 /*yield*/, db.redeemReward({
                            rewardId: input.rewardId,
                            userId: reward.createdBy, // 使用奖品创建者作为userId
                            childId: input.kidId,
                            pointsSpent: reward.pointsCost,
                        })];
                    case 6:
                        redemptionId = _c.sent();
                        return [2 /*return*/, {
                                id: redemptionId,
                                itemName: reward.name,
                            }];
                }
            });
        }); }))))))))))))
    }),
    // ==================== 喵喵旺旺专属模块 ====================
    specialKids: (0, trpc_1.router)({
        // 获取喵喵和斺斺的信息
        // 根据用户角色返回不同的宝宝列表：
        // - super_admin: 返回所有宝宝（喵喵、斺斺）- 仅用于首页展示
        // - parent: 只返回该家长的家庭中的宝宝
        // - baby: 返回空列表
        list: trpc_1.publicProcedure
            .input(zod_1.z.object({ forManagement: zod_1.z.boolean().optional() }).optional())
            .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var db_instance, _c, specialKids, users_1, eq_1, kids;
            var ctx = _b.ctx, input = _b.input;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        // 未登录：返回所有特殊宝宝（喵喵、旺旺），供演示
                        if (!ctx.user) {
                            return [2 /*return*/, db.getSpecialKids()];
                        }
                        // 超级管理员：
                        // - 如果是宝贝档案管理页面（forManagement=true），返回自己的宝宝（空列表）
                        // - 如果是首页（forManagement=false），返回所有特殊宝宝用于演示
                        if (ctx.user.role === "super_admin") {
                            if (input === null || input === void 0 ? void 0 : input.forManagement) {
                                return [2 /*return*/, db.getKidsByParent(ctx.user.id)];
                            }
                            return [2 /*return*/, db.getSpecialKids()];
                        }
                        // 家长：只返回自己家庭中的宝宝
                        if (ctx.user.role === "parent") {
                            return [2 /*return*/, db.getKidsByParent(ctx.user.id)];
                        }
                        if (!(ctx.user.role === "baby")) return [3 /*break*/, 5];
                        return [4 /*yield*/, db.getDb()];
                    case 1:
                        db_instance = _d.sent();
                        if (!db_instance)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
                    case 2:
                        _c = _d.sent(), specialKids = _c.specialKids, users_1 = _c.users;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                    case 3:
                        eq_1 = (_d.sent()).eq;
                        return [4 /*yield*/, db_instance.select({
                                id: specialKids.id,
                                userId: specialKids.userId,
                                parentUserId: specialKids.parentUserId,
                                name: specialKids.name,
                                avatar: specialKids.avatar,
                                stars: specialKids.stars,
                                position: specialKids.position,
                                createdAt: specialKids.createdAt,
                                updatedAt: specialKids.updatedAt,
                                username: users_1.username,
                            })];
                    case 4:
                        kids = _d.sent();
                        _d.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        }); }).from(specialKids)
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(specialKids.userId, schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(specialKids.userId, ctx.user.id)),
        return: kids
    }),
    return: []
});
(zod_1.z.object({ id: zod_1.z.number() }))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var input = _b.input;
    return __generator(this, function (_c) {
        return [2 /*return*/, db.getSpecialKidById(input.id)];
    });
}); }),
    // 更新孩子信息（管理员）
    update;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    id: zod_1.z.number(),
    name: zod_1.z.string().optional(),
    avatar: zod_1.z.string().optional(),
    starsChange: zod_1.z.number().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (ctx.user.role !== "super_admin") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改" });
                }
                if (!(input.name || input.avatar)) return [3 /*break*/, 2];
                return [4 /*yield*/, db.updateSpecialKid(input.id, {
                        name: input.name,
                        avatar: input.avatar,
                    })];
            case 1:
                _c.sent();
                _c.label = 2;
            case 2:
                if (!(input.starsChange !== undefined && input.starsChange !== 0)) return [3 /*break*/, 4];
                return [4 /*yield*/, db.updateSpecialKidStars(input.id, input.starsChange)];
            case 3:
                _c.sent();
                _c.label = 4;
            case 4: return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 上传头像
uploadAvatar, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    id: zod_1.z.number().optional(),
    filename: zod_1.z.string(),
    contentType: zod_1.z.string(),
    fileData: zod_1.z.instanceof(Uint8Array),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var buffer, ext, fileKey, url;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                // 只有家长和超级管理员可以上传头像
                if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝头像" });
                }
                buffer = Buffer.from(input.fileData);
                ext = input.contentType.split("/")[1] || "jpg";
                fileKey = "kids/avatar-".concat(input.id || Date.now(), "-").concat((0, nanoid_1.nanoid)(), ".").concat(ext);
                return [4 /*yield*/, (0, storage_1.storagePut)(fileKey, buffer, input.contentType)];
            case 1:
                url = (_c.sent()).url;
                if (!input.id) return [3 /*break*/, 3];
                return [4 /*yield*/, db.updateSpecialKid(input.id, { avatar: url })];
            case 2:
                _c.sent();
                _c.label = 3;
            case 3: return [2 /*return*/, { url: url }];
        }
    });
}); }), 
// 创建宝宝（家长添加）
create, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    name: zod_1.z.string().min(1),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var existingKids, kidCount, position, defaultPassword, randomSuffix, username, passwordHash, userId, kid;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝" });
                }
                return [4 /*yield*/, db.getKidsByParent(ctx.user.id)];
            case 1:
                existingKids = _c.sent();
                kidCount = (existingKids === null || existingKids === void 0 ? void 0 : existingKids.length) || 0;
                position = "left";
                if (kidCount === 1) {
                    position = "right";
                }
                else if (kidCount >= 2) {
                    position = "left";
                }
                defaultPassword = "123456";
                randomSuffix = Math.random().toString(36).substring(2, 6);
                username = "baby_".concat(input.name, "_").concat(randomSuffix);
                return [4 /*yield*/, (0, auth_1.hashPassword)(defaultPassword)];
            case 2:
                passwordHash = _c.sent();
                return [4 /*yield*/, db.createUserWithPassword({
                        username: username,
                        passwordHash: passwordHash,
                        name: input.name,
                        role: "baby",
                    })];
            case 3:
                userId = _c.sent();
                if (!userId) {
                    throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建宝宝账户失败" });
                }
                return [4 /*yield*/, db.createSpecialKid({
                        name: input.name,
                        position: position,
                        parentUserId: ctx.user.id,
                        userId: userId,
                    })
                    // 返回宝宝信息和账户信息
                ];
            case 4:
                kid = _c.sent();
                // 返回宝宝信息和账户信息
                return [2 /*return*/, __assign(__assign({}, kid), { account: {
                            username: username,
                            password: defaultPassword,
                        } })];
        }
    });
}); }), 
// 删除宝宝
delete , trpc_1.protectedProcedure
    .input(zod_1.z.object({ id: zod_1.z.number() }))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var kid;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (!(ctx.user.role === "super_admin")) return [3 /*break*/, 2];
                return [4 /*yield*/, db.deleteSpecialKid(input.id)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
            case 2:
                if (!(ctx.user.role === "parent")) return [3 /*break*/, 5];
                return [4 /*yield*/, db.getSpecialKidById(input.id)];
            case 3:
                kid = _c.sent();
                if (!kid || kid.parentUserId !== ctx.user.id) {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "你只能删除自己的宝宝" });
                }
                return [4 /*yield*/, db.deleteSpecialKid(input.id)];
            case 4:
                _c.sent();
                return [2 /*return*/, { success: true }];
            case 5: 
            // 宝宝角色不能删除
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "无权删除宝宝" });
        }
    });
}); }), 
// 获取孩子的奖励记录
getRewards, trpc_1.publicProcedure
    .input(zod_1.z.object({ kidId: zod_1.z.number() }))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var input = _b.input;
    return __generator(this, function (_c) {
        return [2 /*return*/, db.getStarRewardsByKid(input.kidId)];
    });
}); })), 
// ==================== 五角星奖励规则 ====================
starRules, (0, trpc_1.router)({
    // 获取所有奖励规则
    list: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, db.getStarRewardRules()];
        });
    }); }),
    // 更新奖励规则（管理员）
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        starsReward: zod_1.z.number().min(0),
        isActive: zod_1.z.boolean().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改奖励规则" });
                    }
                    return [4 /*yield*/, db.updateStarRewardRule(input.id, {
                            starsReward: input.starsReward,
                            isActive: input.isActive,
                        })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 创建自定义奖励规则（管理员）
    create, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        activityType: zod_1.z.string().min(1),
        activityName: zod_1.z.string().min(1),
        starsReward: zod_1.z.number().min(0),
        description: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建奖励规则" });
                    }
                    return [4 /*yield*/, db.createStarRewardRule(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 删除奖励规则（管理员）
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除奖励规则" });
                    }
                    return [4 /*yield*/, db.deleteStarRewardRule(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))
}), 
// ==================== 五角星奖励发放 ====================
starRewards, (0, trpc_1.router)({
    // 发放奖励（游戏获胜等）
    award: trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        activityType: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        customStars: zod_1.z.number().optional(), // 自定义星星数量（反义词游戏等根据题数变化）
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var rule, starsToAward;
        var _c;
        var input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, db.getStarRewardRuleByType(input.activityType)];
                case 1:
                    rule = _d.sent();
                    if (!rule || !rule.isActive) {
                        return [2 /*return*/, { success: false, starsEarned: 0, message: "该活动没有奖励" }];
                    }
                    starsToAward = (_c = input.customStars) !== null && _c !== void 0 ? _c : rule.starsReward;
                    // 创建奖励记录
                    return [4 /*yield*/, db.createStarReward({
                            kidId: input.kidId,
                            activityType: input.activityType,
                            starsEarned: starsToAward,
                            description: input.description || rule.activityName,
                        })];
                case 2:
                    // 创建奖励记录
                    _d.sent();
                    return [2 /*return*/, {
                            success: true,
                            starsEarned: starsToAward,
                            activityName: rule.activityName,
                        }];
            }
        });
    }); }), 
    // 管理员手动发放奖励
    manualAward, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        stars: zod_1.z.number().min(1),
        description: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以手动发放奖励" });
                    }
                    return [4 /*yield*/, db.createStarReward({
                            kidId: input.kidId,
                            activityType: "manual",
                            starsEarned: input.stars,
                            description: input.description,
                        })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))
}), 
// ==================== 星星商城 ====================
starShop, (0, trpc_1.router)({
    // 获取商品列表
    list: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, db.getStarShopItems()];
        });
    }); }),
    // 获取所有商品（包括下架的，管理员用）
    listAll: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            if (ctx.user.role !== "super_admin") {
                throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有商品" });
            }
            return [2 /*return*/, db.getAllStarShopItems()];
        });
    }); }),
    // 创建商品（管理员）
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
        image: zod_1.z.string().optional(),
        starsCost: zod_1.z.number().min(1),
        stock: zod_1.z.number().default(-1),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建商品" });
                    }
                    return [4 /*yield*/, db.createStarShopItem(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 更新商品（管理员）
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        image: zod_1.z.string().optional(),
        starsCost: zod_1.z.number().optional(),
        stock: zod_1.z.number().optional(),
        isActive: zod_1.z.boolean().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改商品" });
                    }
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, db.updateStarShopItem(id, data)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除商品（管理员）
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除商品" });
                    }
                    return [4 /*yield*/, db.deleteStarShopItem(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 兑换商品
    redeem, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        itemId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var kid, item, id;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getSpecialKidById(input.kidId)];
                case 1:
                    kid = _c.sent();
                    if (!kid) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "找不到孩子信息" });
                    }
                    return [4 /*yield*/, db.getStarShopItemById(input.itemId)];
                case 2:
                    item = _c.sent();
                    if (!item || !item.isActive) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "商品不存在或已下架" });
                    }
                    // 检查星星是否足够
                    if (kid.stars < item.starsCost) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
                    }
                    // 检查库存
                    if (item.stock !== -1 && item.stock <= 0) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "商品已售罄" });
                    }
                    return [4 /*yield*/, db.createStarRedemption({
                            kidId: input.kidId,
                            itemId: input.itemId,
                            starsSpent: item.starsCost,
                        })
                        // 更新库存
                    ];
                case 3:
                    id = _c.sent();
                    if (!(item.stock !== -1)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.updateStarShopItem(input.itemId, { stock: item.stock - 1 })];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5: return [2 /*return*/, { id: id, itemName: item.name }];
            }
        });
    }); }), 
    // 获取兑换记录
    getRedemptions, trpc_1.publicProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getStarRedemptionsByKid(input.kidId)];
        });
    }); }), 
    // 获取所有兑换记录（管理员）
    getAllRedemptions, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            if (ctx.user.role !== "super_admin") {
                throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有兑换记录" });
            }
            return [2 /*return*/, db.getAllStarRedemptions()];
        });
    }); }), 
    // 更新兑换状态（管理员）
    updateRedemptionStatus, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        status: zod_1.z.enum(["pending", "approved", "rejected", "completed"]),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
                    }
                    return [4 /*yield*/, db.updateStarRedemptionStatus(input.id, input.status)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))))
}), 
// ==================== 游戏排序偏好 ====================
gameOrder, (0, trpc_1.router)({
    // 获取孩子的游戏排序偏好
    get: trpc_1.publicProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var preference;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getGameOrderPreference(input.kidId)];
                case 1:
                    preference = _c.sent();
                    if (!preference) {
                        return [2 /*return*/, { gameOrders: null }];
                    }
                    return [2 /*return*/, { gameOrders: JSON.parse(preference.gameOrders) }];
            }
        });
    }); }),
    // 保存孩子的游戏排序偏好
    save: trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        gameOrders: zod_1.z.array(zod_1.z.string()),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.saveGameOrderPreference(input.kidId, input.gameOrders)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))
}), 
// ==================== 错题本 ====================
wrongQuestions, (0, trpc_1.router)({
    // 记录错题
    add: trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        gameType: zod_1.z.enum(["math", "antonym", "character"]),
        questionData: zod_1.z.string(), // JSON字符串
        userAnswer: zod_1.z.string(),
        correctAnswer: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.createWrongQuestion(input)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取错题列表
    list, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        gameType: zod_1.z.enum(["math", "antonym", "character"]).optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getWrongQuestionsByKid(input.kidId, input.gameType)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 标记为已复习
    markReviewed, trpc_1.publicProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.markWrongQuestionReviewed(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除错题
    delete , trpc_1.publicProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.deleteWrongQuestion(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取错题统计
    stats, trpc_1.publicProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getWrongQuestionStats(input.kidId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); })))
}), 
// ==================== 汉字学习 ====================
character, (0, trpc_1.router)({
    // 获取随机汉字题目
    getRandomCharacters: trpc_1.publicProcedure
        .input(zod_1.z.object({
        count: zod_1.z.number().min(5).max(1000).default(10),
        category: zod_1.z.string().optional(),
        difficulty: zod_1.z.number().min(1).max(5).optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getRandomCharacters(input.count, input.category, input.difficulty)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取所有汉字（管理后台用）
    getAll, trpc_1.publicProcedure
        .input(zod_1.z.object({
        category: zod_1.z.string().optional(),
        difficulty: zod_1.z.number().optional(),
        limit: zod_1.z.number().optional(),
        offset: zod_1.z.number().optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getAllCharacters(input)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 创建汉字（管理员）
    create, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        character: zod_1.z.string().min(1).max(10),
        pinyin: zod_1.z.string().min(1).max(50),
        imageUrl: zod_1.z.string().url(),
        fileKey: zod_1.z.string(),
        category: zod_1.z.string().min(1).max(50),
        difficulty: zod_1.z.number().min(1).max(5).default(1),
        strokeCount: zod_1.z.number().min(0).default(0),
        commonWords: zod_1.z.array(zod_1.z.string()).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can create characters" });
                    }
                    return [4 /*yield*/, db.createCharacter(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 更新汉字（管理员）
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        character: zod_1.z.string().optional(),
        pinyin: zod_1.z.string().optional(),
        imageUrl: zod_1.z.string().optional(),
        fileKey: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        difficulty: zod_1.z.number().optional(),
        strokeCount: zod_1.z.number().optional(),
        commonWords: zod_1.z.array(zod_1.z.string()).optional(),
        isActive: zod_1.z.boolean().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can update characters" });
                    }
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, db.updateCharacter(id, data)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除汉字（管理员）
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Only admins can delete characters" });
                    }
                    return [4 /*yield*/, db.deleteCharacter(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 记录学习
    recordLearning, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        characterId: zod_1.z.number(),
        isCorrect: zod_1.z.boolean(),
        timeSpent: zod_1.z.number(), // 秒
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.recordCharacterLearning(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 获取学习记录
    getLearningRecords, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        characterId: zod_1.z.number().optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getCharacterLearningRecords(input.kidId, input.characterId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取汉字统计信息
    getStats, trpc_1.publicProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getCharacterStats()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }), 
    // 获取快闪识字记录
    getFlashcardRecord, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        characterId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getFlashcardRecordByCharacter(input.kidId, input.characterId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取所有快闪识字记录
    getAllFlashcardRecords, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getFlashcardRecords(input.kidId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 记录认识
    recordKnown, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        characterId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.incrementFlashcardKnown(input.kidId, input.characterId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 记录忘记
    recordForgotten, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        characterId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.incrementFlashcardForgotten(input.kidId, input.characterId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))))))))))
}), 
// ==================== 刷牙游戏 ====================
brushing, (0, trpc_1.router)({
    // 创建刷牙记录
    create: trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        duration: zod_1.z.number().min(120).max(300), // 2-5分钟
        completed: zod_1.z.boolean().default(true),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var session;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.createBrushingSession({
                        kidId: input.kidId,
                        duration: input.duration,
                        completed: input.completed,
                        starsEarned: 1, // 完成刷牙获得1颗星
                    })];
                case 1:
                    session = _c.sent();
                    if (!session) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建刷牙记录失败" });
                    }
                    // 发放星星奖励
                    return [4 /*yield*/, db.createStarReward({
                            kidId: input.kidId,
                            activityType: "brushing_complete",
                            starsEarned: 1,
                            description: "完成刷牙任务",
                        })];
                case 2:
                    // 发放星星奖励
                    _c.sent();
                    return [2 /*return*/, { session: session, starsEarned: 1 }];
            }
        });
    }); }), 
    // 获取刷牙记录列表
    list, trpc_1.publicProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        limit: zod_1.z.number().min(1).max(100).default(10),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getBrushingSessions(input.kidId, input.limit)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取刷牙统计
    stats, trpc_1.publicProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getBrushingStats(input.kidId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); })))
}), 
// ==================== 邀请码管理 ====================
invitations, (0, trpc_1.router)({
    // 创建邀请码（仅超级管理员）
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        familyName: zod_1.z.string().optional(),
        maxUses: zod_1.z.number().min(1).max(100).optional(),
        expiresInDays: zod_1.z.number().min(1).max(365).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var expiresAt, result;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以创建邀请码' });
                    }
                    expiresAt = input.expiresInDays
                        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
                        : undefined;
                    return [4 /*yield*/, db.createInvitation({
                            familyName: input.familyName,
                            maxUses: input.maxUses || 1,
                            expiresAt: expiresAt,
                            createdBy: ctx.user.id,
                        })];
                case 1:
                    result = _c.sent();
                    if (!result) {
                        throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建邀请码失败' });
                    }
                    return [2 /*return*/, result];
            }
        });
    }); }), 
    // 获取所有邀请码（仅超级管理员）
    list, trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权查看邀请码列表' });
                    }
                    return [4 /*yield*/, db.getAllInvitations()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 验证邀请码（公开接口）
    validate, trpc_1.publicProcedure
        .input(zod_1.z.object({ code: zod_1.z.string() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var result;
        var _c;
        var input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, db.validateInvitation(input.code)];
                case 1:
                    result = _d.sent();
                    return [2 /*return*/, {
                            valid: result.valid,
                            familyName: (_c = result.invitation) === null || _c === void 0 ? void 0 : _c.familyName,
                            error: result.error,
                        }];
            }
        });
    }); }), 
    // 使用邀请码注册（公开接口）
    register, trpc_1.publicProcedure
        .input(zod_1.z.object({
        code: zod_1.z.string(),
        username: zod_1.z.string().min(1).max(20),
        password: zod_1.z.string().min(6),
        name: zod_1.z.string().optional(),
        email: zod_1.z.string().email().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var passwordHash, result, user, sessionToken, cookieOptions;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, auth_1.hashPassword)(input.password)];
                case 1:
                    passwordHash = _c.sent();
                    return [4 /*yield*/, db.useInvitationToRegister({
                            code: input.code,
                            username: input.username,
                            passwordHash: passwordHash,
                            name: input.name,
                            email: input.email,
                        })];
                case 2:
                    result = _c.sent();
                    if (!result.success) {
                        throw new server_1.TRPCError({ code: 'BAD_REQUEST', message: result.error || '注册失败' });
                    }
                    return [4 /*yield*/, db.getUserByUsername(input.username)];
                case 3:
                    user = _c.sent();
                    if (!user) {
                        throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建用户失败' });
                    }
                    return [4 /*yield*/, sdk_1.sdk.createSessionToken(user.id.toString(), {
                            expiresInMs: const_1.ONE_YEAR_MS,
                            name: user.name || user.username || '',
                        })
                        // 设置cookie
                    ];
                case 4:
                    sessionToken = _c.sent();
                    cookieOptions = (0, cookies_1.getSessionCookieOptions)(ctx.req);
                    ctx.res.cookie(const_1.COOKIE_NAME, sessionToken, __assign(__assign({}, cookieOptions), { maxAge: const_1.ONE_YEAR_MS }));
                    return [2 /*return*/, {
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                name: user.name,
                                role: user.role,
                                familyId: result.familyId,
                            },
                        }];
            }
        });
    }); }), 
    // 停用邀请码（仅超级管理员）
    deactivate, trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权停用邀请码' });
                    }
                    return [4 /*yield*/, db.deactivateInvitation(input.id)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '停用失败' });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))
}), 
// ==================== 家庭管理 ====================
families, (0, trpc_1.router)({
    // 获取所有家庭（仅超级管理员）
    list: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权查看家庭列表' });
                    }
                    return [4 /*yield*/, db.getAllFamilies()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取家庭成员
    members: trpc_1.protectedProcedure
        .input(zod_1.z.object({ familyId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 超级管理员可以查看任何家庭，家长只能查看自己家庭
                    if (ctx.user.role !== 'super_admin' && ctx.user.familyId !== input.familyId) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '无权查看该家庭成员' });
                    }
                    return [4 /*yield*/, db.getFamilyMembers(input.familyId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
}), 
// ==================== 初始化 ====================
init, (0, trpc_1.router)({
    setup: trpc_1.publicProcedure.mutation(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.initializeDefaultData()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, db.initDefaultStarRewardRules()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.initSpecialKids()];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
}), 
// ==================== 语音合成 ====================
tts, (0, trpc_1.router)({
    speak: trpc_1.publicProcedure
        .input(zod_1.z.object({
        text: zod_1.z.string().min(1).max(500),
        voice: zod_1.z.string().optional(),
        speed: zod_1.z.number().min(0.5).max(2.0).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, tts_1.textToSpeech)(input)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }))
}), 
// ==================== 首页横幅 ====================
homeBanner, (0, trpc_1.router)({
    // 获取当前活跃的横幅（公开接口）
    get: trpc_1.publicProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getActiveHomeBanner()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }),
    // 更新横幅（仅超级管理员）
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        title: zod_1.z.string().max(200).optional(),
        description: zod_1.z.string().optional(),
        imageUrl: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以更新横幅' });
                    }
                    return [4 /*yield*/, db.upsertHomeBanner(input)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))
}), 
// 20加法游戏
addition20, (0, trpc_1.router)({
    // 获取游戏配置
    getConfig: trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var config;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getAddition20Config(input.kidId)];
                case 1:
                    config = _c.sent();
                    return [2 /*return*/, config || {
                            kidId: input.kidId,
                            difficulty: "easy",
                            questionCount: 10,
                            answerMode: "choice",
                        }];
            }
        });
    }); }),
    // 保存游戏配置（家长使用）
    saveConfig: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]).optional(),
        questionCount: zod_1.z.number().min(10).max(50).optional(),
        answerMode: zod_1.z.enum(["choice", "input"]).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限：只有家长或管理员可以修改配置
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有家长可以修改游戏配置" });
                    }
                    return [4 /*yield*/, db.upsertAddition20Config(input)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 保存游戏记录
    saveRecord, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]),
        questionCount: zod_1.z.number(),
        correctCount: zod_1.z.number(),
        duration: zod_1.z.number(),
        answerMode: zod_1.z.enum(["choice", "input"]),
        starsEarned: zod_1.z.number().default(0),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.saveAddition20Record(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 获取游戏记录
    getRecords, trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number(), limit: zod_1.z.number().default(10) }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getAddition20Records(input.kidId, input.limit)];
        });
    }); }), 
    // 获取最高分
    getHighScore, trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getAddition20HighScore(input.kidId)];
        });
    }); }), 
    // ==================== 有奖挑战相关 ====================
    // 创建有奖挑战（家长使用）
    createChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        targetCorrectCount: zod_1.z.number().min(10).max(1000),
        penaltyPerWrong: zod_1.z.number().min(0).max(10).default(0),
        rewardTitle: zod_1.z.string().min(1).max(100),
        rewardImageUrl: zod_1.z.string().optional(),
        rewardFileKey: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var existingChallenge, id;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限：只有家长或管理员可以创建挑战
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有家长可以创建挑战" });
                    }
                    return [4 /*yield*/, db.getActiveAddition20Challenge(input.kidId)];
                case 1:
                    existingChallenge = _c.sent();
                    if (existingChallenge) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "已有进行中的挑战，请先完成或取消" });
                    }
                    return [4 /*yield*/, db.createAddition20Challenge(__assign(__assign({}, input), { parentId: ctx.user.id }))];
                case 2:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 获取活跃挑战
    getActiveChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getActiveAddition20Challenge(input.kidId)];
        });
    }); }), 
    // 更新挑战进度
    updateChallengeProgress, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        challengeId: zod_1.z.number(),
        currentCorrectCount: zod_1.z.number().optional(),
        totalAttempted: zod_1.z.number().optional(),
        totalCorrect: zod_1.z.number().optional(),
        totalWrong: zod_1.z.number().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var challengeId, data;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    challengeId = input.challengeId, data = __rest(input, ["challengeId"]);
                    return [4 /*yield*/, db.updateAddition20ChallengeProgress(challengeId, __assign(__assign({}, data), { lastPlayedAt: new Date() }))];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 完成挑战
    completeChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({ challengeId: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.completeAddition20Challenge(input.challengeId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 暂停挑战（休息保存）
    pauseChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({ challengeId: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.pauseAddition20Challenge(input.challengeId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 恢复挑战
    resumeChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({ challengeId: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.resumeAddition20Challenge(input.challengeId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 取消/放弃挑战（需要家长密码验证）
    cancelChallenge, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        challengeId: zod_1.z.number(),
        password: zod_1.z.string()
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var user, bcrypt, isValid;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getUserById(ctx.user.id)];
                case 1:
                    user = _c.sent();
                    if (!user || !user.passwordHash) {
                        throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "请先设置家长密码" });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("bcryptjs"); })];
                case 2:
                    bcrypt = _c.sent();
                    return [4 /*yield*/, bcrypt.default.compare(input.password, user.passwordHash)];
                case 3:
                    isValid = _c.sent();
                    if (!isValid) {
                        throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
                    }
                    // 取消挑战
                    return [4 /*yield*/, db.cancelAddition20Challenge(input.challengeId)];
                case 4:
                    // 取消挑战
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取挑战历史
    getChallengeHistory, trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number(), limit: zod_1.z.number().default(10) }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getAddition20ChallengeHistory(input.kidId, input.limit)];
        });
    }); }), 
    // 验证家长密码
    verifyParentPassword, trpc_1.protectedProcedure
        .input(zod_1.z.object({ password: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var user, bcrypt, isValid;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 检查权限：只有家长或管理员可以验证
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有家长可以验证密码" });
                    }
                    return [4 /*yield*/, db.getUserById(ctx.user.id)];
                case 1:
                    user = _c.sent();
                    if (!user || !user.passwordHash) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "未设置密码" });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("bcryptjs"); })];
                case 2:
                    bcrypt = _c.sent();
                    return [4 /*yield*/, bcrypt.default.compare(input.password, user.passwordHash)];
                case 3:
                    isValid = _c.sent();
                    if (!isValid) {
                        throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))))))
}), 
// 阅读识字游戏
readingGame, (0, trpc_1.router)({
    // 获取故事列表
    getStories: trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number().optional() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getReadingStories(input.kidId)];
        });
    }); }),
    // 获取单个故事
    getStory: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getReadingStoryById(input.id)];
        });
    }); }),
    // 创建自定义故事
    createStory: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        title: zod_1.z.string(),
        content: zod_1.z.string().max(5000, "故事内容最多5000字"),
        type: zod_1.z.enum(["custom", "ai_generated"]),
        kidId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var storyId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.createReadingStory({
                        title: input.title,
                        content: input.content,
                        type: input.type,
                        createdBy: ctx.user.id,
                        kidId: input.kidId,
                    })];
                case 1:
                    storyId = _c.sent();
                    return [2 /*return*/, { storyId: storyId }];
            }
        });
    }); }), 
    // 更新故事
    updateStory, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        title: zod_1.z.string().optional(),
        content: zod_1.z.string().max(5000).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.updateReadingStory(input.id, {
                        title: input.title,
                        content: input.content,
                    })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除故事
    deleteStory, trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.deleteReadingStory(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // AI生成故事
    generateStory, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        theme: zod_1.z.string().optional(), // 主题（可选）
        wordCount: zod_1.z.number().min(50).max(500).default(100), // 字数限制
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var invokeLLM, minWords, maxWords, prompt, response, content, contentStr, storyData, coverImageUrl, generateImage, imagePrompt, result, error_5, storyId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/llm"); })];
                case 1:
                    invokeLLM = (_c.sent()).invokeLLM;
                    minWords = Math.max(input.wordCount - 10, 30);
                    maxWords = input.wordCount + 10;
                    prompt = input.theme
                        ? "\u8BF7\u4E3A\u5B66\u9F84\u524D\u513F\u7AE5\u521B\u4F5C\u4E00\u4E2A\u4E3B\u9898\u4E3A\u300C".concat(input.theme, "\u300D\u7684\u6545\u4E8B\u3002\n\n\u91CD\u8981\u8981\u6C42\uFF1A\n1. \u6545\u4E8B\u603B\u5B57\u6570\u5FC5\u987B\u4E25\u683C\u63A7\u5236\u5728 ").concat(minWords, "-").concat(maxWords, " \u5B57\u4E4B\u95F4\uFF0C\u76EE\u6807\u662F ").concat(input.wordCount, " \u5B57\u3002\n2. \u8BF7\u7CBE\u786E\u8BA1\u7B97\u5B57\u6570\uFF0C\u4E0D\u8981\u8D85\u51FA\u8303\u56F4\u3002\n3. \u6545\u4E8B\u5E94\u8BE5\u6709\u8DA3\u3001\u6709\u6559\u80B2\u610F\u4E49\uFF0C\u4F7F\u7528\u7B80\u5355\u6613\u61C2\u7684\u8BED\u8A00\u3002\n4. \u5982\u679C\u5B57\u6570\u8F83\u5C11\uFF0850-100\u5B57\uFF09\uFF0C\u8BF7\u521B\u4F5C\u7B80\u77ED\u7684\u5C0F\u6545\u4E8B\u3002")
                        : "\u8BF7\u4E3A\u5B66\u9F84\u524D\u513F\u7AE5\u521B\u4F5C\u4E00\u4E2A\u6545\u4E8B\u3002\n\n\u91CD\u8981\u8981\u6C42\uFF1A\n1. \u6545\u4E8B\u603B\u5B57\u6570\u5FC5\u987B\u4E25\u683C\u63A7\u5236\u5728 ".concat(minWords, "-").concat(maxWords, " \u5B57\u4E4B\u95F4\uFF0C\u76EE\u6807\u662F ").concat(input.wordCount, " \u5B57\u3002\n2. \u8BF7\u7CBE\u786E\u8BA1\u7B97\u5B57\u6570\uFF0C\u4E0D\u8981\u8D85\u51FA\u8303\u56F4\u3002\n3. \u6545\u4E8B\u5E94\u8BE5\u6709\u8DA3\u3001\u6709\u6559\u80B2\u610F\u4E49\uFF0C\u4F7F\u7528\u7B80\u5355\u6613\u61C2\u7684\u8BED\u8A00\u3002\n4. \u8BF7\u968F\u673A\u9009\u62E9\u4E00\u4E2A\u9002\u5408\u5B69\u5B50\u7684\u4E3B\u9898\uFF08\u5982\u52A8\u7269\u3001\u690D\u7269\u3001\u53CB\u8C0A\u3001\u52C7\u6C14\u7B49\uFF09\u3002\n5. \u5982\u679C\u5B57\u6570\u8F83\u5C11\uFF0850-100\u5B57\uFF09\uFF0C\u8BF7\u521B\u4F5C\u7B80\u77ED\u7684\u5C0F\u6545\u4E8B\u3002");
                    return [4 /*yield*/, invokeLLM({
                            messages: [
                                { role: "system", content: "你是一个儿童故事作家，擅长创作适合学龄前儿童的故事。" },
                                { role: "user", content: prompt },
                            ],
                            response_format: {
                                type: "json_schema",
                                json_schema: {
                                    name: "story",
                                    strict: true,
                                    schema: {
                                        type: "object",
                                        properties: {
                                            title: { type: "string", description: "故事标题" },
                                            content: { type: "string", description: "故事内容" },
                                        },
                                        required: ["title", "content"],
                                        additionalProperties: false,
                                    },
                                },
                            },
                        })];
                case 2:
                    response = _c.sent();
                    content = response.choices[0].message.content;
                    contentStr = typeof content === 'string' ? content : JSON.stringify(content);
                    storyData = JSON.parse(contentStr || "{}");
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/imageGeneration"); })];
                case 4:
                    generateImage = (_c.sent()).generateImage;
                    imagePrompt = "\u4E3A\u513F\u7AE5\u6545\u4E8B\u300A".concat(storyData.title, "\u300B\u521B\u4F5C\u4E00\u5E45\u5361\u901A\u98CE\u683C\u7684\u5C01\u9762\u63D2\u56FE\u3002\u6545\u4E8B\u7B80\u4ECB\uFF1A").concat(storyData.content.substring(0, 100), "...\n\n\u8981\u6C42\uFF1A\n1. \u5361\u901A\u98CE\u683C\uFF0C\u8272\u5F69\u660E\u4EAE\u6E29\u6696\n2. \u9002\u5408\u5B66\u9F84\u524D\u513F\u7AE5\u89C2\u770B\n3. \u753B\u9762\u7B80\u6D01\u53EF\u7231\uFF0C\u4E0D\u8981\u6587\u5B57\n4. \u4F53\u73B0\u6545\u4E8B\u4E3B\u9898\u548C\u60C5\u8282");
                    return [4 /*yield*/, generateImage({
                            prompt: imagePrompt,
                        })];
                case 5:
                    result = _c.sent();
                    coverImageUrl = result.url;
                    return [3 /*break*/, 7];
                case 6:
                    error_5 = _c.sent();
                    console.error("生成故事配图失败：", error_5);
                    return [3 /*break*/, 7];
                case 7: return [4 /*yield*/, db.createReadingStory({
                        title: storyData.title,
                        content: storyData.content,
                        type: "ai_generated",
                        coverImageUrl: coverImageUrl,
                        createdBy: ctx.user.id,
                        kidId: input.kidId,
                    })];
                case 8:
                    storyId = _c.sent();
                    return [2 /*return*/, {
                            storyId: storyId,
                            title: storyData.title,
                            content: storyData.content,
                            coverImageUrl: coverImageUrl,
                        }];
            }
        });
    }); }), 
    // 文本转语音（TTS）
    tts_1.textToSpeech, trpc_1.protectedProcedure
        .input(zod_1.z.object({ text: zod_1.z.string().max(1000) }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var response, audioBuffer, base64Audio;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, fetch("".concat(process.env.BUILT_IN_FORGE_API_URL, "/tts"), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer ".concat(process.env.BUILT_IN_FORGE_API_KEY),
                        },
                        body: JSON.stringify({
                            text: input.text,
                            voice: "zh-CN-XiaoxiaoNeural", // 使用中文女声
                        }),
                    })];
                case 1:
                    response = _c.sent();
                    if (!response.ok) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TTS服务调用失败" });
                    }
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    audioBuffer = _c.sent();
                    base64Audio = Buffer.from(audioBuffer).toString("base64");
                    return [2 /*return*/, { audioData: base64Audio }];
            }
        });
    }); }), 
    // 创建阅读记录
    createRecord, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number(),
        storyId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var recordId;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.createReadingRecord(input)];
                case 1:
                    recordId = _c.sent();
                    return [2 /*return*/, { recordId: recordId }];
            }
        });
    }); }), 
    // 更新阅读记录
    updateRecord, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        recordId: zod_1.z.number(),
        clickCount: zod_1.z.number().optional(),
        readDuration: zod_1.z.number().optional(),
        completed: zod_1.z.boolean().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var updateData;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    updateData = {};
                    if (input.clickCount !== undefined)
                        updateData.clickCount = input.clickCount;
                    if (input.readDuration !== undefined)
                        updateData.readDuration = input.readDuration;
                    if (input.completed)
                        updateData.completedAt = new Date();
                    return [4 /*yield*/, db.updateReadingRecord(input.recordId, updateData)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取阅读记录
    getRecords, trpc_1.protectedProcedure
        .input(zod_1.z.object({ kidId: zod_1.z.number(), limit: zod_1.z.number().default(20) }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, db.getReadingRecords(input.kidId, input.limit)];
        });
    }); }))))))
}), 
// ==================== 宝宝词库 ====================
vocabulary, (0, trpc_1.router)({
    // 获取总词库列表（超级管理员）
    masterList: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        language: zod_1.z.enum(["chinese", "english"]).optional(),
        category: zod_1.z.string().optional(),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]).optional(),
        search: zod_1.z.string().optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以查看总词库" });
                    }
                    return [4 /*yield*/, db.getVocabularyMasterList(input)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 创建总词库词汇（超级管理员）
    masterCreate, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        word: zod_1.z.string().min(1).max(100),
        language: zod_1.z.enum(["chinese", "english"]),
        translation: zod_1.z.string().max(200).optional(),
        pinyin: zod_1.z.string().max(100).optional(),
        pronunciation: zod_1.z.string().max(100).optional(),
        category: zod_1.z.string().default("general"),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]).default("easy"),
        example: zod_1.z.string().optional(),
        imageUrl: zod_1.z.string().optional(),
        audioUrl: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var vocab;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以添加总词库" });
                    }
                    return [4 /*yield*/, db.createVocabularyMaster(input)];
                case 1:
                    vocab = _c.sent();
                    return [2 /*return*/, { id: vocab === null || vocab === void 0 ? void 0 : vocab.id }];
            }
        });
    }); }), 
    // 更新总词库词汇（超级管理员）
    masterUpdate, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        word: zod_1.z.string().optional(),
        translation: zod_1.z.string().optional(),
        pinyin: zod_1.z.string().optional(),
        pronunciation: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]).optional(),
        example: zod_1.z.string().optional(),
        imageUrl: zod_1.z.string().optional(),
        audioUrl: zod_1.z.string().optional(),
        isActive: zod_1.z.boolean().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以修改总词库" });
                    }
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, db.updateVocabularyMaster(id, data)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除总词库词汇（超级管理员）
    masterDelete, trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin") {
                        throw new server_1.TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以删除总词库" });
                    }
                    return [4 /*yield*/, db.deleteVocabularyMaster(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取家长词库列表
    familyList, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        language: zod_1.z.enum(["chinese", "english"]).optional(),
        kidId: zod_1.z.number().nullable().optional(),
        wordType: zod_1.z.enum(["character", "word"]).optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getFamilyVocabularyList(ctx.user.id, input.language, input.kidId, input.wordType)];
                case 1: 
                // 家长只能查看自己的词库
                return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 添加词汇到家长词库
    familyAdd, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number().nullable().optional(),
        word: zod_1.z.string().min(1).max(100),
        language: zod_1.z.enum(["chinese", "english"]),
        wordType: zod_1.z.enum(["character", "word"]).default("word"),
        translation: zod_1.z.string().max(200).optional(),
        pinyin: zod_1.z.string().max(100).optional(),
        pronunciation: zod_1.z.string().max(100).optional(),
        category: zod_1.z.string().default("general"),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]).default("easy"),
        customNote: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var kidId, customNote, vocabData, masterVocab, familyVocab;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    kidId = input.kidId, customNote = input.customNote, vocabData = __rest(input, ["kidId", "customNote"]);
                    return [4 /*yield*/, db.findVocabularyMasterByWord(vocabData.word, vocabData.language)];
                case 1:
                    masterVocab = _c.sent();
                    if (!!masterVocab) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.createVocabularyMaster(vocabData)];
                case 2:
                    masterVocab = _c.sent();
                    if (!masterVocab) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "添加到总词库失败" });
                    }
                    _c.label = 3;
                case 3: return [4 /*yield*/, db.addVocabularyToFamily({
                        parentUserId: ctx.user.id,
                        vocabularyId: masterVocab.id,
                        kidId: kidId,
                        addedBy: ctx.user.id,
                        customNote: customNote,
                    })];
                case 4:
                    familyVocab = _c.sent();
                    return [2 /*return*/, { success: true, id: familyVocab === null || familyVocab === void 0 ? void 0 : familyVocab.id }];
            }
        });
    }); }), 
    // 从家长词库删除词汇
    familyRemove, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        vocabularyId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.removeVocabularyFromFamily(ctx.user.id, input.vocabularyId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 更新家长词库备注
    familyUpdateNote, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        vocabularyId: zod_1.z.number(),
        customNote: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.updateFamilyVocabularyNote(ctx.user.id, input.vocabularyId, input.customNote)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 更新学习进度
    updateMasteryLevel, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        vocabularyId: zod_1.z.number(),
        masteryLevel: zod_1.z.enum(["not_started", "learning", "mastered"]),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.updateFamilyVocabularyMasteryLevel(ctx.user.id, input.vocabularyId, input.masteryLevel)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // OCR识别图片中的文字
    recognizeImage, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        imageUrl: zod_1.z.string(),
        contentType: zod_1.z.enum(["character", "word", "english"]).optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var recognizeText;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/ocr"); })];
                case 1:
                    recognizeText = (_c.sent()).recognizeText;
                    return [4 /*yield*/, recognizeText(input.imageUrl, input.contentType)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取词库统计数据
    stats, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        kidId: zod_1.z.number().nullable().optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getFamilyVocabularyStats(ctx.user.id, input.kidId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 从文本中提取词汇
    extractWords, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        text: zod_1.z.string(),
        useLLM: zod_1.z.boolean().default(false),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _c, extractWords, extractWordsWithLLM, words, hasChinese, hasEnglish, language, words;
        var input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/ocr"); })];
                case 1:
                    _c = _d.sent(), extractWords = _c.extractWords, extractWordsWithLLM = _c.extractWordsWithLLM;
                    if (!input.useLLM) return [3 /*break*/, 3];
                    return [4 /*yield*/, extractWordsWithLLM(input.text)];
                case 2:
                    words = _d.sent();
                    return [2 /*return*/, { words: words }];
                case 3:
                    hasChinese = /[\u4e00-\u9fa5]/.test(input.text);
                    hasEnglish = /[a-zA-Z]/.test(input.text);
                    language = "chinese";
                    if (hasChinese && hasEnglish) {
                        language = "mixed";
                    }
                    else if (hasEnglish && !hasChinese) {
                        language = "english";
                    }
                    words = extractWords(input.text, language);
                    return [2 /*return*/, { words: words }];
            }
        });
    }); }))))))))))))
}), 
// ==================== 游戏使用统计 ====================
gameStats, (0, trpc_1.router)({
    // 获取所有游戏的使用统计
    getUsageStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var stats;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 只有超级管理员可以查看统计数据
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: 'FORBIDDEN',
                            message: '只有超级管理员可以查看游戏统计数据',
                        });
                    }
                    return [4 /*yield*/, db.getGameUsageStats()];
                case 1:
                    stats = _c.sent();
                    return [2 /*return*/, stats];
            }
        });
    }); }),
}), 
// ==================== VI配置管理 ====================
vi, (0, trpc_1.router)({
    // 获取家长的VI配置
    getConfig: trpc_1.publicProcedure
        .input(zod_1.z.object({
        parentUserId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var config;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getViConfigByParentUserId(input.parentUserId)];
                case 1:
                    config = _c.sent();
                    return [2 /*return*/, config];
            }
        });
    }); }), 
    // 更新家长的VI配置（仅超级管理员）
    updateConfig, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        parentUserId: zod_1.z.number(),
        viThemeId: zod_1.z.string().nullable().optional(),
        customConfig: zod_1.z.any().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var config;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 只有超级管理员可以配置VI
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: 'FORBIDDEN',
                            message: '只有超级管理员可以配置VI',
                        });
                    }
                    return [4 /*yield*/, db.upsertViConfig({
                            parentUserId: input.parentUserId,
                            viThemeId: input.viThemeId,
                            customConfig: input.customConfig,
                            createdBy: ctx.user.id,
                        })];
                case 1:
                    config = _c.sent();
                    return [2 /*return*/, config];
            }
        });
    }); }), 
    // 重置家长的VI配置（仅超级管理员）
    resetConfig, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        parentUserId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 只有超级管理员可以重置VI
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({
                            code: 'FORBIDDEN',
                            message: '只有超级管理员可以重置VI',
                        });
                    }
                    return [4 /*yield*/, db.deleteViConfig(input.parentUserId)];
                case 1:
                    success = _c.sent();
                    return [2 /*return*/, { success: success }];
            }
        });
    }); }), 
    // 获取可用的VI主题列表
    getAvailableThemes, trpc_1.publicProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var themes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getAvailableViThemes()];
                case 1:
                    themes = _a.sent();
                    return [2 /*return*/, themes];
            }
        });
    }); }))))
}), 
// 人脉管理
schema_1.contacts, (0, trpc_1.router)({
    // 获取人脉关系健康度汇总统计
    overviewStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var stats;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactsOverviewStats(ctx.user.id)];
                case 1:
                    stats = _c.sent();
                    return [2 /*return*/, stats];
            }
        });
    }); }),
    // 获取累计使用天数
    getTotalUsageDays: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var firstContactCreatedAt, firstContactDate, now, diffInMs, diffInDays;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getFirstContactCreatedAt(ctx.user.id)];
                case 1:
                    firstContactCreatedAt = _c.sent();
                    if (!firstContactCreatedAt) {
                        return [2 /*return*/, 0];
                    }
                    firstContactDate = new Date(firstContactCreatedAt).getTime();
                    now = Date.now();
                    diffInMs = now - firstContactDate;
                    diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                    return [2 /*return*/, diffInDays];
            }
        });
    }); }),
    // 名片OCR识别
    recognizeBusinessCard: trpc_1.protectedProcedure
        .input(zod_1.z.object({ imageUrl: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var invokeLLM, response, content, result;
        var _c, _d;
        var input = _b.input;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./_core/llm"); })];
                case 1:
                    invokeLLM = (_e.sent()).invokeLLM;
                    return [4 /*yield*/, invokeLLM({
                            messages: [
                                {
                                    role: "system",
                                    content: "你是一个专业的名片识别助手。请从名片图片中提取联系人信息,以JSON格式返回。如果某个字段无法识别,返回空字符串。"
                                },
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "text",
                                            text: "请识别这张名片中的信息,提取姓名、公司、职位、电话、邮箱、地址等字段。"
                                        },
                                        {
                                            type: "image_url",
                                            image_url: {
                                                url: input.imageUrl
                                            }
                                        }
                                    ]
                                }
                            ],
                            response_format: {
                                type: "json_schema",
                                json_schema: {
                                    name: "business_card_info",
                                    strict: true,
                                    schema: {
                                        type: "object",
                                        properties: {
                                            name: { type: "string", description: "姓名" },
                                            company: { type: "string", description: "公司名称" },
                                            title: { type: "string", description: "职位" },
                                            phone: { type: "string", description: "电话号码" },
                                            email: { type: "string", description: "邮箱地址" },
                                            address: { type: "string", description: "地址" },
                                            wechat: { type: "string", description: "微信号" },
                                            website: { type: "string", description: "网站" }
                                        },
                                        required: ["name", "company", "title", "phone", "email", "address", "wechat", "website"],
                                        additionalProperties: false
                                    }
                                }
                            }
                        })];
                case 2:
                    response = _e.sent();
                    content = (_d = (_c = response.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content;
                    if (!content || typeof content !== "string") {
                        throw new server_1.TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: "名片识别失败"
                        });
                    }
                    result = JSON.parse(content);
                    return [2 /*return*/, result];
            }
        });
    }); }),
    // 获取人脉列表
    list: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        searchQuery: zod_1.z.string().optional(),
        sortBy: zod_1.z.enum(['tagCount_desc', 'tagCount_asc', 'interactionCount_desc', 'interactionCount_asc']).optional(),
        page: zod_1.z.number().min(1).default(1),
        pageSize: zod_1.z.number().min(1).max(100).default(50),
        filterType: zod_1.z.string().optional(), // 筛选类型: todayActive, weeklyActive, thisWeek等
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var paginatedResult, contacts, contactIds, _c, allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap, referrerStatsMap, contactsWithDetails, filteredContacts, now_1, startOfWeek_1, startOfMonth_1, startOfYear_1;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactsByParentPaginated(ctx.user.id, input.searchQuery, input.page, input.pageSize)];
                case 1:
                    paginatedResult = _d.sent();
                    contacts = paginatedResult.contacts;
                    if (contacts.length === 0) {
                        return [2 /*return*/, {
                                total: paginatedResult.total,
                                contacts: [],
                                hasMore: false,
                                page: paginatedResult.page,
                                pageSize: paginatedResult.pageSize,
                            }];
                    }
                    contactIds = contacts.map(function (c) { return c.id; });
                    return [4 /*yield*/, Promise.all([
                            // 推荐人统计只查询一次
                            dbReferrerStats.getReferrerStats(ctx.user.id).catch(function (err) {
                                console.error('获取介绍人贡献统计失败:', err);
                                return [];
                            }),
                            // 批量获取所有联系人的标签
                            dbContacts.getTagsForContacts(contactIds),
                            // 批量获取所有联系人的个人标签
                            dbContacts.getPersonalTagsForContacts(contactIds),
                            // 批量获取所有联系人的联络统计
                            dbContacts.getInteractionStatsForContacts(contactIds),
                            // 批量获取所有联系人的最后联络时间和今日联络状态
                            dbContacts.getInteractionInfoForContacts(contactIds),
                            // 批量获取所有联系人的字段值（公司、职位等）
                            dbContacts.getFieldValuesForContacts(contactIds),
                        ])];
                case 2:
                    _c = _d.sent(), allReferrerStats = _c[0], tagsMap = _c[1], personalTagsMap = _c[2], interactionStatsMap = _c[3], interactionInfoMap = _c[4], fieldValuesMap = _c[5];
                    referrerStatsMap = new Map(allReferrerStats.map(function (stat) { return [stat.contactId, stat]; }));
                    contactsWithDetails = contacts.map(function (contact) {
                        // 从批量查询结果中获取数据
                        var tags = tagsMap.get(contact.id) || [];
                        var personalTags = personalTagsMap.get(contact.id) || [];
                        var interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
                        var interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
                        var referrerStats = referrerStatsMap.get(contact.id) || null;
                        var fieldValues = fieldValuesMap.get(contact.id) || [];
                        return __assign(__assign({}, contact), { tags: tags, personalTags: personalTags, fieldValues: fieldValues, lastInteractionDate: interactionInfo.lastInteraction, daysSinceLastInteraction: interactionInfo.lastInteraction
                                ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
                                : null, hasTodayInteraction: interactionInfo.hasTodayInteraction, hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined, totalInteractions: (interactionStats === null || interactionStats === void 0 ? void 0 : interactionStats.totalInteractions) || 0, directReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.directReferrals) || 0, indirectReferrals: (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.indirectReferrals) || 0 });
                    });
                    filteredContacts = contactsWithDetails;
                    if (input.filterType) {
                        now_1 = new Date();
                        startOfWeek_1 = new Date(now_1);
                        startOfWeek_1.setDate(now_1.getDate() - now_1.getDay());
                        startOfWeek_1.setHours(0, 0, 0, 0);
                        startOfMonth_1 = new Date(now_1.getFullYear(), now_1.getMonth(), 1);
                        startOfYear_1 = new Date(now_1.getFullYear(), 0, 1);
                        filteredContacts = contactsWithDetails.filter(function (contact) {
                            var _a;
                            var createdAt = new Date(contact.createdAt);
                            switch (input.filterType) {
                                case 'thisWeek':
                                    return createdAt >= startOfWeek_1;
                                case 'thisMonth':
                                    return createdAt >= startOfMonth_1;
                                case 'thisYear':
                                    return createdAt >= startOfYear_1;
                                case 'todayActive':
                                    return contact.hasTodayInteraction === true;
                                case 'weeklyActive': {
                                    // 本周活跃：需要查询本周有联络记录
                                    // 这里简化处理，如果有lastInteractionDate且在本周内
                                    if (!contact.lastInteractionDate)
                                        return false;
                                    var lastInteraction = new Date(contact.lastInteractionDate);
                                    return lastInteraction >= startOfWeek_1;
                                }
                                case 'monthlyActive': {
                                    // 本月活跃
                                    if (!contact.lastInteractionDate)
                                        return false;
                                    var lastInteraction = new Date(contact.lastInteractionDate);
                                    return lastInteraction >= startOfMonth_1;
                                }
                                case 'yearlyActive': {
                                    // 今年活跃
                                    if (!contact.lastInteractionDate)
                                        return false;
                                    var lastInteraction = new Date(contact.lastInteractionDate);
                                    return lastInteraction >= startOfYear_1;
                                }
                                case 'blacklist':
                                    return contact.isBlacklisted === true;
                                case 'needsAttention': {
                                    // 需要关注：基于标签的分级关注机制
                                    var tagNames = ((_a = contact.tags) === null || _a === void 0 ? void 0 : _a.map(function (t) { return t.name; })) || [];
                                    var thresholdDays = void 0;
                                    if (tagNames.includes('周关注')) {
                                        thresholdDays = 7;
                                    }
                                    else if (tagNames.includes('月关注')) {
                                        thresholdDays = 30;
                                    }
                                    else if (tagNames.includes('季关注')) {
                                        thresholdDays = 90;
                                    }
                                    else {
                                        thresholdDays = 180;
                                    }
                                    if (!contact.lastInteractionDate)
                                        return true;
                                    var daysSince = Math.floor((now_1.getTime() - new Date(contact.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24));
                                    return daysSince > thresholdDays;
                                }
                                default:
                                    return true;
                            }
                        });
                    }
                    // 根据 sortBy 参数排序
                    if (input.sortBy) {
                        filteredContacts.sort(function (a, b) {
                            if (input.sortBy === 'tagCount_desc') {
                                return (b.tags.length + b.personalTags.length) - (a.tags.length + a.personalTags.length);
                            }
                            else if (input.sortBy === 'tagCount_asc') {
                                return (a.tags.length + a.personalTags.length) - (b.tags.length + b.personalTags.length);
                            }
                            else if (input.sortBy === 'interactionCount_desc') {
                                return (b.totalInteractions || 0) - (a.totalInteractions || 0);
                            }
                            else if (input.sortBy === 'interactionCount_asc') {
                                return (a.totalInteractions || 0) - (b.totalInteractions || 0);
                            }
                            return 0;
                        });
                    }
                    return [2 /*return*/, {
                            total: filteredContacts.length, // 返回过滤后的总数
                            contacts: filteredContacts,
                            hasMore: false, // 过滤后一次返回所有结果，无需分页
                            page: input.page,
                            pageSize: input.pageSize,
                        }];
            }
        });
    }); }),
    // 获取人脉详情
    get: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var contact, tags, interactions, lastInteraction, hasTodayInteraction, referrerContribution, allReferrerStats, error_6;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('[contacts.get] 查询人脉详情:', { contactId: input.id, userId: ctx.user.id });
                    return [4 /*yield*/, dbContacts.getContactById(input.id)];
                case 1:
                    contact = _c.sent();
                    if (!contact) {
                        console.error('[contacts.get] 人脉不存在:', input.id);
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
                    }
                    console.log('[contacts.get] 找到人脉:', { id: contact.id, name: contact.name, parentUserId: contact.parentUserId });
                    return [4 /*yield*/, dbContacts.getContactTagsByContactId(contact.id)];
                case 2:
                    tags = _c.sent();
                    return [4 /*yield*/, dbContacts.getContactInteractions(contact.id)];
                case 3:
                    interactions = _c.sent();
                    return [4 /*yield*/, dbContacts.getLastInteractionDate(contact.id)];
                case 4:
                    lastInteraction = _c.sent();
                    return [4 /*yield*/, dbContacts.hasTodayInteraction(contact.id)];
                case 5:
                    hasTodayInteraction = _c.sent();
                    referrerContribution = null;
                    _c.label = 6;
                case 6:
                    _c.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, dbReferrerStats.getReferrerStats(ctx.user.id)];
                case 7:
                    allReferrerStats = _c.sent();
                    referrerContribution = allReferrerStats.find(function (stat) { return stat.contactId === contact.id; }) || null;
                    return [3 /*break*/, 9];
                case 8:
                    error_6 = _c.sent();
                    console.error('获取介绍人贡献统计失败:', error_6);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/, __assign(__assign({}, contact), { tags: tags, interactions: interactions, lastInteractionDate: lastInteraction, daysSinceLastInteraction: lastInteraction
                            ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
                            : null, hasTodayInteraction: hasTodayInteraction, hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined, 
                        // 介绍人贡献数据
                        referrerContribution: referrerContribution ? {
                            directReferrals: referrerContribution.directReferrals,
                            indirectReferrals: referrerContribution.indirectReferrals,
                            totalScore: referrerContribution.totalScore,
                        } : null })];
            }
        });
    }); }),
    // 重名检测：检查姓名和昵称的各种交叉重复
    checkDuplicateName: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().optional(),
        title: zod_1.z.string().optional(), // 昵称
        phone: zod_1.z.string().optional(), // 手机号
        email: zod_1.z.string().optional(), // 邮箱
        excludeId: zod_1.z.number().optional(), // 编辑模式下排除当前联系人
    }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var userId, name, nickname, phone, email, excludeId, duplicates, db, _c, contacts, contactFieldValues, contactFieldCategories, _d, eq, and, ne, or, sql, conditions, allContacts, trimmedName, trimmedNickname, trimmedPhone, trimmedEmail, _i, allContacts_1, c, cName, cTitle, cPhone, fieldValues;
        var _e, _f, _g;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    userId = ctx.user.id;
                    name = input.name, nickname = input.title, phone = input.phone, email = input.email, excludeId = input.excludeId;
                    duplicates = [];
                    if (!name && !nickname && !phone && !email)
                        return [2 /*return*/, { duplicates: duplicates }];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db'); })];
                case 1: return [4 /*yield*/, (_h.sent()).getDb()];
                case 2:
                    db = _h.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 3:
                    _c = _h.sent(), contacts = _c.contacts, contactFieldValues = _c.contactFieldValues, contactFieldCategories = _c.contactFieldCategories;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('drizzle-orm'); })];
                case 4:
                    _d = _h.sent(), eq = _d.eq, and = _d.and, ne = _d.ne, or = _d.or, sql = _d.sql;
                    conditions = [eq(contacts.parentUserId, userId)];
                    if (excludeId) {
                        conditions.push(ne(contacts.id, excludeId));
                    }
                    return [4 /*yield*/, db
                            .select({ id: contacts.id, name: contacts.name, title: contacts.title, phone: contacts.phone })
                            .from(contacts)
                            .where(and.apply(void 0, conditions))];
                case 5:
                    allContacts = _h.sent();
                    trimmedName = name === null || name === void 0 ? void 0 : name.trim().toLowerCase();
                    trimmedNickname = nickname === null || nickname === void 0 ? void 0 : nickname.trim().toLowerCase();
                    trimmedPhone = phone === null || phone === void 0 ? void 0 : phone.trim().replace(/\s+/g, '');
                    trimmedEmail = email === null || email === void 0 ? void 0 : email.trim().toLowerCase();
                    // 检查姓名和昵称重复
                    for (_i = 0, allContacts_1 = allContacts; _i < allContacts_1.length; _i++) {
                        c = allContacts_1[_i];
                        cName = (_e = c.name) === null || _e === void 0 ? void 0 : _e.trim().toLowerCase();
                        cTitle = (_f = c.title) === null || _f === void 0 ? void 0 : _f.trim().toLowerCase();
                        cPhone = (_g = c.phone) === null || _g === void 0 ? void 0 : _g.trim().replace(/\s+/g, '');
                        // 1. 姓名与姓名重复
                        if (trimmedName && cName && trimmedName === cName) {
                            duplicates.push({ type: 'name_name', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
                            continue;
                        }
                        // 2. 昵称与昵称重复
                        if (trimmedNickname && cTitle && trimmedNickname === cTitle) {
                            duplicates.push({ type: 'title_title', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
                            continue;
                        }
                        // 3. 姓名与已有昵称重复
                        if (trimmedName && cTitle && trimmedName === cTitle) {
                            duplicates.push({ type: 'name_title', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
                            continue;
                        }
                        // 4. 昵称与已有姓名重复
                        if (trimmedNickname && cName && trimmedNickname === cName) {
                            duplicates.push({ type: 'title_name', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
                            continue;
                        }
                        // 5. 手机号重复（contacts表中的phone字段）
                        if (trimmedPhone && cPhone && trimmedPhone === cPhone) {
                            duplicates.push({ type: 'phone_phone', matchedName: c.name, matchedTitle: c.title, matchedValue: c.phone || undefined, contactId: c.id });
                            continue;
                        }
                    }
                    if (!(trimmedPhone || trimmedEmail)) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({
                            contactId: contactFieldValues.contactId,
                            categoryName: contactFieldCategories.name,
                            value: contactFieldValues.value,
                        })];
                case 6:
                    fieldValues = _h.sent();
                    _h.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    }); })
        .from(schema_1.contactFieldValues)
        .innerJoin(schema_1.contactFieldCategories, (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.categoryId, schema_1.contactFieldCategories.id))
        .innerJoin(schema_1.contacts, (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, schema_1.contacts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId), excludeId ? ne(schema_1.contacts.id, excludeId) : (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["1=1"], ["1=1"]))), or((0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.name, '手机'), (0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.name, '邮箱')))),
    for: function (, fv, of, fieldValues) {
        // 手机号是JSON数组格式
        if (fv.categoryName === '手机' && trimmedPhone) {
            try {
                var phones = JSON.parse(fv.value);
                if (Array.isArray(phones)) {
                    var _loop_2 = function (p) {
                        var normalizedP = p.trim().replace(/\s+/g, '');
                        if (normalizedP === trimmedPhone) {
                            var contact_1 = allContacts.find(function (c) { return c.id === fv.contactId; });
                            if (contact_1 && !duplicates.find(function (d) { return d.contactId === contact_1.id && d.type === 'phone_phone'; })) {
                                duplicates.push({ type: 'phone_phone', matchedName: contact_1.name, matchedTitle: contact_1.title, matchedValue: p, contactId: contact_1.id });
                            }
                            return "break";
                        }
                    };
                    for (var _i = 0, phones_1 = phones; _i < phones_1.length; _i++) {
                        var p = phones_1[_i];
                        var state_1 = _loop_2(p);
                        if (state_1 === "break")
                            break;
                    }
                }
            }
            catch (_a) { }
        }
        // 邮箱也JSON数组格式
        if (fv.categoryName === '邮箱' && trimmedEmail) {
            try {
                var emails = JSON.parse(fv.value);
                if (Array.isArray(emails)) {
                    var _loop_3 = function (e) {
                        var normalizedE = e.trim().toLowerCase();
                        if (normalizedE === trimmedEmail) {
                            var contact_2 = allContacts.find(function (c) { return c.id === fv.contactId; });
                            if (contact_2 && !duplicates.find(function (d) { return d.contactId === contact_2.id && d.type === 'email_email'; })) {
                                duplicates.push({ type: 'email_email', matchedName: contact_2.name, matchedTitle: contact_2.title, matchedValue: e, contactId: contact_2.id });
                            }
                            return "break";
                        }
                    };
                    for (var _b = 0, emails_1 = emails; _b < emails_1.length; _b++) {
                        var e = emails_1[_b];
                        var state_2 = _loop_3(e);
                        if (state_2 === "break")
                            break;
                    }
                }
            }
            catch (_c) { }
        }
    }
})));
return { duplicates: duplicates };
// 创建人脉
create: trpc_1.protectedProcedure
    .input(zod_1.z.object({
    name: zod_1.z.string().min(1, "姓名不能为空"),
    title: zod_1.z.string().optional(), // 称谓
    gender: zod_1.z.string().optional(),
    birthDate: zod_1.z.string().optional(),
    occupation: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    region: zod_1.z.string().optional(), // 所在地区
    wechat: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    referrerId: zod_1.z.number().optional(), // 介绍人 ID
    tagIds: zod_1.z.array(zod_1.z.number()).optional(),
    customFields: zod_1.z.array(zod_1.z.object({
        fieldName: zod_1.z.string(),
        fieldValue: zod_1.z.string(),
    }).optional()) // 自定义字段
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var tagIds, customFields, contactData, contactId, referrerContact;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                tagIds = input.tagIds, customFields = input.customFields, contactData = __rest(input, ["tagIds", "customFields"]);
                return [4 /*yield*/, dbContacts.createContact(__assign(__assign({}, contactData), { parentUserId: ctx.user.id }))];
            case 1:
                contactId = _c.sent();
                if (!contactId) {
                    throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建人脉失败" });
                }
                if (!(tagIds && tagIds.length > 0)) return [3 /*break*/, 3];
                return [4 /*yield*/, Promise.all(tagIds.map(function (tagId) { return dbContacts.addTagToContact(contactId, tagId); }))];
            case 2:
                _c.sent();
                _c.label = 3;
            case 3:
                if (!(customFields && customFields.length > 0)) return [3 /*break*/, 5];
                return [4 /*yield*/, dbContacts.addCustomFields(contactId, customFields)];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5: 
            // 奖励积分：添加人脉
            return [4 /*yield*/, (0, db_point_system_1.addPointsForAction)(ctx.user.id, 'add_contact', contactId)];
            case 6:
                // 奖励积分：添加人脉
                _c.sent();
                if (!input.referrerId) return [3 /*break*/, 9];
                return [4 /*yield*/, dbContacts.getContactById(input.referrerId)];
            case 7:
                referrerContact = _c.sent();
                if (!(referrerContact && referrerContact.parentUserId)) return [3 /*break*/, 9];
                return [4 /*yield*/, (0, db_point_system_1.addPointsForAction)(referrerContact.parentUserId, 'be_referrer', contactId)];
            case 8:
                _c.sent();
                _c.label = 9;
            case 9: return [2 /*return*/, { id: contactId }];
        }
    });
}); }),
    // 更新人脉
    update;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    id: zod_1.z.number(),
    name: zod_1.z.string().min(1, "姓名不能为空").optional(),
    title: zod_1.z.string().optional(), // 称谓
    gender: zod_1.z.string().optional(),
    birthDate: zod_1.z.string().optional(),
    occupation: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    region: zod_1.z.string().optional(), // 所在地区
    wechat: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    referrerId: zod_1.z.number().optional(), // 介绍人 ID
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var id, updateData;
    var input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                id = input.id, updateData = __rest(input, ["id"]);
                return [4 /*yield*/, dbContacts.updateContact(id, updateData)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }),
    // 设置介绍人（独立API，专门用于设置/清除介绍人）
    setReferrer;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    contactId: zod_1.z.number(),
    referrerId: zod_1.z.number().nullable(), // null表示清除介绍人
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var contactId, referrerId, contact, referrer;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                contactId = input.contactId, referrerId = input.referrerId;
                return [4 /*yield*/, dbContacts.getContactById(contactId)];
            case 1:
                contact = _c.sent();
                if (!contact) {
                    throw new server_1.TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
                }
                if (contact.parentUserId !== ctx.user.id) {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "无权操作此人脉" });
                }
                if (!(referrerId !== null)) return [3 /*break*/, 3];
                return [4 /*yield*/, dbContacts.getContactById(referrerId)];
            case 2:
                referrer = _c.sent();
                if (!referrer) {
                    throw new server_1.TRPCError({ code: "NOT_FOUND", message: "介绍人不存在" });
                }
                if (referrer.parentUserId !== ctx.user.id) {
                    throw new server_1.TRPCError({ code: "FORBIDDEN", message: "介绍人不属于您的人脉" });
                }
                // 不能设置自己为介绍人
                if (referrerId === contactId) {
                    throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "不能设置自己为介绍人" });
                }
                _c.label = 3;
            case 3: 
            // 更新介绍人
            return [4 /*yield*/, dbContacts.updateContact(contactId, { referrerId: referrerId })];
            case 4:
                // 更新介绍人
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }),
    // 获取可选择的介绍人列表（独立API，避免依赖list API的复杂逻辑）
    listForReferrer;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    excludeContactId: zod_1.z.number().optional(), // 排除当前人脉（编辑时不能选择自己）
}))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var db, allContacts, from;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db = _c.sent();
                if (!db)
                    return [2 /*return*/, []];
                return [4 /*yield*/, db.select({
                        id: schema_1.contacts.id,
                        name: schema_1.contacts.name,
                        title: schema_1.contacts.title,
                    })];
            case 2:
                allContacts = _c.sent();
                (schema_1.contacts)
                    .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, ctx.user.id))
                    .orderBy(schema_1.contacts.name);
                // 排除指定的人脉
                if (input.excludeContactId) {
                    return [2 /*return*/, allContacts.filter(function (c) { return c.id !== input.excludeContactId; })];
                }
                return [2 /*return*/, allContacts];
        }
    });
}); }),
    // 智能识别快递地址（调用DeepSeek API解析文本）
    recognizeAddress;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    text: zod_1.z.string().min(1).max(1000),
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var apiKey, controller, timeoutId, response, data, content, jsonMatch, parsed, err_1;
    var _c, _d, _e;
    var input = _b.input;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                apiKey = process.env.DEEPSEEK_API_KEY;
                if (!apiKey)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务未配置' });
                controller = new AbortController();
                timeoutId = setTimeout(function () { return controller.abort(); }, 15000);
                _f.label = 1;
            case 1:
                _f.trys.push([1, 4, , 5]);
                return [4 /*yield*/, fetch('https://api.deepseek.com/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: "Bearer ".concat(apiKey) },
                        body: JSON.stringify({
                            model: 'deepseek-chat',
                            messages: [
                                {
                                    role: 'system',
                                    content: '你是一个快递地址解析助手。用户会粘贴一段包含收件人信息的文本，请从中提取：收件人姓名、联系电话、详细地址。以JSON格式返回，格式为：{"name":"收件人姓名","phone":"联系电话","address":"详细地址"}。如果某个字段无法识别则返回空字符串。只返回JSON，不要其他内容。'
                                },
                                { role: 'user', content: input.text }
                            ],
                            temperature: 0.1,
                            max_tokens: 300,
                        }),
                        signal: controller.signal,
                    })];
            case 2:
                response = _f.sent();
                clearTimeout(timeoutId);
                if (!response.ok)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务暂时不可用' });
                return [4 /*yield*/, response.json()];
            case 3:
                data = _f.sent();
                content = ((_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '{}';
                jsonMatch = content.match(/\{[\s\S]*\}/);
                parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
                return [2 /*return*/, {
                        name: String(parsed.name || ''),
                        phone: String(parsed.phone || ''),
                        address: String(parsed.address || ''),
                    }];
            case 4:
                err_1 = _f.sent();
                clearTimeout(timeoutId);
                if (err_1.name === 'AbortError')
                    throw new server_1.TRPCError({ code: 'TIMEOUT', message: 'AI识别超时，请重试' });
                if (err_1 instanceof server_1.TRPCError)
                    throw err_1;
                throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI识别失败，请手动填写' });
            case 5: return [2 /*return*/];
        }
    });
}); }),
    // 智能识别银行账号（调用DeepSeek API解析文本）
    recognizeBank;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    text: zod_1.z.string().min(1).max(1000),
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var apiKey, controller, timeoutId, response, data, content, jsonMatch, parsed, accountName, bankName, accountNumber, err_2;
    var _c, _d, _e;
    var input = _b.input;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                apiKey = process.env.DEEPSEEK_API_KEY;
                if (!apiKey)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务未配置' });
                controller = new AbortController();
                timeoutId = setTimeout(function () { return controller.abort(); }, 15000);
                _f.label = 1;
            case 1:
                _f.trys.push([1, 4, , 5]);
                return [4 /*yield*/, fetch('https://api.deepseek.com/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: "Bearer ".concat(apiKey) },
                        body: JSON.stringify({
                            model: 'deepseek-chat',
                            messages: [
                                {
                                    role: 'system',
                                    content: '你是一个专业的银行账户信息提取助手。用户会粘贴一段包含银行账户信息的文本，请从中准确提取出户名、开户银行名称和银行账号。银行账号必须是纯数字，通常为16-19位。开户银行名称不能包含银行账号的数字。以JSON格式返回，格式为：{"accountName":"账户名","bankName":"开户行","accountNumber":"银行账号"}。如果某个字段无法识别，请返回空字符串。只返回JSON，不要其他内容。'
                                },
                                { role: 'user', content: input.text }
                            ],
                            temperature: 0.1,
                            max_tokens: 300,
                        }),
                        signal: controller.signal,
                    })];
            case 2:
                response = _f.sent();
                clearTimeout(timeoutId);
                if (!response.ok)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务暂时不可用' });
                return [4 /*yield*/, response.json()];
            case 3:
                data = _f.sent();
                content = ((_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '{}';
                jsonMatch = content.match(/\{[\s\S]*\}/);
                parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
                accountName = String(parsed.accountName || '');
                bankName = String(parsed.bankName || '');
                accountNumber = String(parsed.accountNumber || '');
                // 后置处理：确保 accountNumber 是纯数字
                accountNumber = accountNumber.replace(/\D/g, "");
                // 后置处理：防止 bankName 包含账号信息
                if (bankName && accountNumber && bankName.includes(accountNumber)) {
                    bankName = bankName.replace(accountNumber, "").trim();
                }
                return [2 /*return*/, {
                        accountName: accountName,
                        bankName: bankName,
                        accountNumber: accountNumber,
                    }];
            case 4:
                err_2 = _f.sent();
                clearTimeout(timeoutId);
                if (err_2.name === 'AbortError')
                    throw new server_1.TRPCError({ code: 'TIMEOUT', message: 'AI识别超时，请重试' });
                if (err_2 instanceof server_1.TRPCError)
                    throw err_2;
                throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI识别失败，请手动填写' });
            case 5: return [2 /*return*/];
        }
    });
}); }),
    // 自定义字段管理
    customFields;
(0, trpc_1.router)({
    // 获取人脉的自定义字段
    list: trpc_1.protectedProcedure
        .input(zod_1.z.object({ contactId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getCustomFieldsByContactId(input.contactId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 添加自定义字段
    add: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        fieldName: zod_1.z.string().min(1, "字段名称不能为空"),
        fieldValue: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.addCustomField(input)];
                case 1:
                    id = _c.sent();
                    return [2 /*return*/, { id: id }];
            }
        });
    }); }), 
    // 更新自定义字段
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        fieldName: zod_1.z.string().optional(),
        fieldValue: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, dbContacts.updateCustomField(id, data)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除自定义字段
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteCustomField(input.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))
}),
    // 删除人脉
    delete ;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    id: zod_1.z.number(),
}))
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.deleteContact(input.id)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }),
    // 获取统计数据
    stats;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getContactStats(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 轻量级获取联系人数量（全部、我的、共享）
    counts;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getContactCounts(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 根据筛选类型获取分类统计数量（全部、我的、共享）
    filteredCounts;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    filterType: zod_1.z.string(),
}))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getFilteredCounts(ctx.user.id, input.filterType)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取公司列表（所有有公司名称的联系人，标注重复）
    companyList;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var result;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getCompanyList(ctx.user.id)];
            case 1:
                result = _c.sent();
                console.log('[companyList] 返回数据示例:', result.slice(0, 3));
                console.log('[companyList] 总共返回', result.length, '条记录');
                return [2 /*return*/, result];
        }
    });
}); }),
    // 获取累计联络次数
    totalInteractionCount;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getTotalInteractionCount(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取互动统计总览
    interactionOverview;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getInteractionOverview(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取互动频次分布
    interactionDistribution;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getInteractionDistribution(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取互动时间序列
    interactionTimeSeries;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    granularity: zod_1.z.enum(['day', 'week', 'month']).default('day'),
    range: zod_1.z.number().default(30)
}))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getInteractionTimeSeries(ctx.user.id, input.granularity, input.range)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取标签互动统计
    tagInteractionStats;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getTagInteractionStats(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取累计标签数量
    totalTagCount;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getTotalTagCount(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 获取账目总数
    totalLedgerEntries;
trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getTotalLedgerEntries(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
    // 自动生成模拟人脉功能（仅限特定用户）
    autoGenerate;
(0, trpc_1.router)({
    // 检查当前用户是否有权限使用此功能
    checkPermission: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var allowedUsernames;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            allowedUsernames = ['胡永煜'];
            return [2 /*return*/, {
                    allowed: allowedUsernames.includes(ctx.user.username),
                    username: ctx.user.username
                }];
        });
    }); }),
    // 获取当前自动生成状态
    status: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getAutoGenerateStatus;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./mock-data-generator'); })];
                case 1:
                    getAutoGenerateStatus = (_c.sent()).getAutoGenerateStatus;
                    return [2 /*return*/, getAutoGenerateStatus(ctx.user.id)];
            }
        });
    }); }),
    // 启动自动生成
    start: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        dailyNewContacts: zod_1.z.number().min(0).max(100).default(0), // 每天生成新人脉数量
        dailyRandomInteractions: zod_1.z.number().min(0).max(100).default(0), // 每天随机联络数量
        dailyRandomTags: zod_1.z.number().min(0).max(200).default(0), // 每天随机打标签数量
        options: zod_1.z.object({
            includePhone: zod_1.z.boolean().default(true),
            includeEmail: zod_1.z.boolean().default(true),
            includeAddress: zod_1.z.boolean().default(true),
            includeBankAccount: zod_1.z.boolean().default(true),
            includeCompany: zod_1.z.boolean().default(true),
            includeInvoiceInfo: zod_1.z.boolean().default(true),
        }),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var allowedUsernames, _c, startAutoGenerate, generateMockContact, userId, createContactCallback, createInteractionCallback, addTagCallback, getRandomContactIds, messages;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    allowedUsernames = ['胡永煤'];
                    if (!allowedUsernames.includes(ctx.user.username)) {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '您没有权限使用此功能' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./mock-data-generator'); })];
                case 1:
                    _c = _d.sent(), startAutoGenerate = _c.startAutoGenerate, generateMockContact = _c.generateMockContact;
                    userId = ctx.user.id;
                    createContactCallback = function (mockData) { return __awaiter(void 0, void 0, void 0, function () {
                        var contactId, categories, getCategoryId;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, dbContacts.createContact({
                                        parentUserId: userId,
                                        name: mockData.name,
                                        title: mockData.title,
                                        gender: mockData.gender,
                                        region: mockData.region,
                                    })
                                    // 添加扩展信息 - 使用 addFieldValue 函数
                                    // 先获取字段类目信息
                                ];
                                case 1:
                                    contactId = _a.sent();
                                    return [4 /*yield*/, dbContacts.getFieldCategories(userId)];
                                case 2:
                                    categories = _a.sent();
                                    getCategoryId = function (name) {
                                        for (var _i = 0, categories_1 = categories; _i < categories_1.length; _i++) {
                                            var cat = categories_1[_i];
                                            if (cat.name === name)
                                                return cat.id;
                                            if (cat.children) {
                                                var child = cat.children.find(function (c) { return c.name === name; });
                                                if (child)
                                                    return child.id;
                                            }
                                        }
                                        return 0;
                                    };
                                    if (!mockData.phone) return [3 /*break*/, 4];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('手机'), '手机', mockData.phone)];
                                case 3:
                                    _a.sent();
                                    _a.label = 4;
                                case 4:
                                    if (!mockData.email) return [3 /*break*/, 6];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('邮箱'), '邮箱', mockData.email)];
                                case 5:
                                    _a.sent();
                                    _a.label = 6;
                                case 6:
                                    if (!mockData.address) return [3 /*break*/, 8];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('快递地址'), '快递地址', JSON.stringify(mockData.address))];
                                case 7:
                                    _a.sent();
                                    _a.label = 8;
                                case 8:
                                    if (!mockData.bankAccount) return [3 /*break*/, 10];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('银行账号'), '银行账号', JSON.stringify(mockData.bankAccount))];
                                case 9:
                                    _a.sent();
                                    _a.label = 10;
                                case 10:
                                    if (!mockData.company) return [3 /*break*/, 12];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('公司名称'), '公司名称', mockData.company)];
                                case 11:
                                    _a.sent();
                                    _a.label = 12;
                                case 12:
                                    if (!mockData.invoiceInfo) return [3 /*break*/, 14];
                                    return [4 /*yield*/, dbContacts.addFieldValue(contactId, getCategoryId('开票信息'), '开票信息', JSON.stringify(mockData.invoiceInfo))];
                                case 13:
                                    _a.sent();
                                    _a.label = 14;
                                case 14: return [2 /*return*/, contactId];
                            }
                        });
                    }); };
                    createInteractionCallback = function (contactId, type, notes) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, dbContacts.createContactInteraction({
                                        contactId: contactId,
                                        interactionDate: new Date(),
                                        note: "[\u81EA\u52A8\u751F\u6210] ".concat(type, ": ").concat(notes),
                                    })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    addTagCallback = function (contactId, tagName) { return __awaiter(void 0, void 0, void 0, function () {
                        var existingTags, tagId, newTag;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, dbContacts.getContactTags(userId)];
                                case 1:
                                    existingTags = _b.sent();
                                    tagId = (_a = existingTags.find(function (t) { return t.name === tagName; })) === null || _a === void 0 ? void 0 : _a.id;
                                    if (!!tagId) return [3 /*break*/, 3];
                                    return [4 /*yield*/, dbContacts.createContactTag({
                                            name: tagName,
                                            parentUserId: userId,
                                            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                                        })];
                                case 2:
                                    newTag = _b.sent();
                                    tagId = newTag === null || newTag === void 0 ? void 0 : newTag.id;
                                    _b.label = 3;
                                case 3:
                                    if (!tagId) return [3 /*break*/, 5];
                                    return [4 /*yield*/, dbContacts.addTagToContact(contactId, tagId)];
                                case 4:
                                    _b.sent();
                                    _b.label = 5;
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); };
                    getRandomContactIds = function () { return __awaiter(void 0, void 0, void 0, function () {
                        var contacts;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, dbContacts.getContactsByParent(userId)];
                                case 1:
                                    contacts = _a.sent();
                                    return [2 /*return*/, contacts.map(function (c) { return c.id; })];
                            }
                        });
                    }); };
                    // 启动自动任务
                    startAutoGenerate(userId, {
                        dailyNewContacts: input.dailyNewContacts,
                        dailyRandomInteractions: input.dailyRandomInteractions,
                        dailyRandomTags: input.dailyRandomTags,
                        options: input.options,
                    }, createContactCallback, createInteractionCallback, addTagCallback, getRandomContactIds);
                    messages = [];
                    if (input.dailyNewContacts > 0)
                        messages.push("\u6BCF\u5929\u751F\u6210".concat(input.dailyNewContacts, "\u4E2A\u65B0\u4EBA\u8109"));
                    if (input.dailyRandomInteractions > 0)
                        messages.push("\u6BCF\u5929\u968F\u673A\u8054\u7EDC".concat(input.dailyRandomInteractions, "\u6B21"));
                    if (input.dailyRandomTags > 0)
                        messages.push("\u6BCF\u5929\u968F\u673A\u6253".concat(input.dailyRandomTags, "\u4E2A\u6807\u7B7E"));
                    return [2 /*return*/, { success: true, message: "\u5DF2\u542F\u52A8\u81EA\u52A8\u4EFB\u52A1\uFF1A".concat(messages.join('，')) }];
            }
        });
    }); }), 
    // 停止自动生成
    stop, trpc_1.protectedProcedure
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var stopAutoGenerate, stopped;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./mock-data-generator'); })];
                case 1:
                    stopAutoGenerate = (_c.sent()).stopAutoGenerate;
                    stopped = stopAutoGenerate(ctx.user.id);
                    return [2 /*return*/, { success: stopped, message: stopped ? '已停止自动生成' : '没有正在运行的任务' }];
            }
        });
    }); }))
}),
    // 标签管理
    tags;
(0, trpc_1.router)({
    // 获取所有标签
    list: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactTags(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 搜索标签（模糊搜索标签名称）
    search: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        keyword: zod_1.z.string().optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.searchTags(ctx.user.id, input.keyword || '')];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 创建自定义标签
    create, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "标签名称不能为空"),
        color: zod_1.z.string().default("#3b82f6"),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tagId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.createContactTag({
                        name: input.name,
                        color: input.color,
                        parentUserId: ctx.user.id,
                        isPreset: false,
                    })];
                case 1:
                    tagId = _c.sent();
                    return [2 /*return*/, { id: tagId }];
            }
        });
    }); }), 
    // 编辑标签
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().min(1, "标签名称不能为空").optional(),
        color: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.updateContactTag(input.id, ctx.user.id, {
                        name: input.name,
                        color: input.color,
                    })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除自定义标签
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteContactTag(input.id, ctx.user.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 批量更新标签排序
    updateOrder, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        tagOrders: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.number(),
            sortOrder: zod_1.z.number(),
        }))
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.updateTagsOrder(ctx.user.id, input.tagOrders)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取标签大数据分析
    analytics, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        scope: zod_1.z.enum(['all', 'mine', 'shared', 'global']).default('all'),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var scope, _c, overallStats, globalRanking, personalRanking, userDistribution, recentTags;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    scope = input.scope;
                    return [4 /*yield*/, Promise.all([
                            dbTagAnalytics.getTagOverallStats(ctx.user.id, scope),
                            dbTagAnalytics.getGlobalTagRanking(ctx.user.id, scope, 50),
                            dbTagAnalytics.getPersonalTagRanking(ctx.user.id, scope, 50),
                            dbTagAnalytics.getTagUserDistribution(ctx.user.id, scope),
                            dbTagAnalytics.getRecentTags(ctx.user.id, scope, 20),
                        ])];
                case 1:
                    _c = _d.sent(), overallStats = _c[0], globalRanking = _c[1], personalRanking = _c[2], userDistribution = _c[3], recentTags = _c[4];
                    return [2 /*return*/, {
                            overallStats: overallStats,
                            globalRanking: globalRanking,
                            personalRanking: personalRanking,
                            userDistribution: userDistribution,
                            recentTags: recentTags,
                        }];
            }
        });
    }); }), 
    // 为人脉添加标签
    addToContact, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        tagId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.addTagToContact(input.contactId, input.tagId)];
                case 1:
                    _c.sent();
                    // 奖励积分：打标签
                    return [4 /*yield*/, (0, db_point_system_1.addPointsForAction)(ctx.user.id, 'add_tag', input.contactId)];
                case 2:
                    // 奖励积分：打标签
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 移除人脉的标签
    removeFromContact, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        tagId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.removeTagFromContact(input.contactId, input.tagId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 批量为多个人脉设置标签（用于关注周期标签等）
    batchAddToContacts, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactIds: zod_1.z.array(zod_1.z.number()),
        tagId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var contactIds, tagId, successCount, skipCount, _i, contactIds_1, contactId, existingTags, hasTag, error_7;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    contactIds = input.contactIds, tagId = input.tagId;
                    successCount = 0;
                    skipCount = 0;
                    _i = 0, contactIds_1 = contactIds;
                    _c.label = 1;
                case 1:
                    if (!(_i < contactIds_1.length)) return [3 /*break*/, 9];
                    contactId = contactIds_1[_i];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 7, , 8]);
                    return [4 /*yield*/, dbContacts.getContactTagsByContactId(contactId)];
                case 3:
                    existingTags = _c.sent();
                    hasTag = existingTags.some(function (t) { return t.id === tagId; });
                    if (!!hasTag) return [3 /*break*/, 5];
                    return [4 /*yield*/, dbContacts.addTagToContact(contactId, tagId)];
                case 4:
                    _c.sent();
                    successCount++;
                    return [3 /*break*/, 6];
                case 5:
                    skipCount++;
                    _c.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_7 = _c.sent();
                    console.error("Failed to add tag to contact ".concat(contactId, ":"), error_7);
                    return [3 /*break*/, 8];
                case 8:
                    _i++;
                    return [3 /*break*/, 1];
                case 9: return [2 /*return*/, {
                        success: true,
                        successCount: successCount,
                        skipCount: skipCount,
                        totalCount: contactIds.length
                    }];
            }
        });
    }); }), 
    // 批量为多个人脉移除标签
    batchRemoveFromContacts, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactIds: zod_1.z.array(zod_1.z.number()),
        tagId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var contactIds, tagId, successCount, skipCount, _i, contactIds_2, contactId, existingTags, hasTag, error_8;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    contactIds = input.contactIds, tagId = input.tagId;
                    successCount = 0;
                    skipCount = 0;
                    _i = 0, contactIds_2 = contactIds;
                    _c.label = 1;
                case 1:
                    if (!(_i < contactIds_2.length)) return [3 /*break*/, 9];
                    contactId = contactIds_2[_i];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 7, , 8]);
                    return [4 /*yield*/, dbContacts.getContactTagsByContactId(contactId)];
                case 3:
                    existingTags = _c.sent();
                    hasTag = existingTags.some(function (t) { return t.id === tagId; });
                    if (!hasTag) return [3 /*break*/, 5];
                    return [4 /*yield*/, dbContacts.removeTagFromContact(contactId, tagId)];
                case 4:
                    _c.sent();
                    successCount++;
                    return [3 /*break*/, 6];
                case 5:
                    skipCount++;
                    _c.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_8 = _c.sent();
                    console.error("Failed to remove tag from contact ".concat(contactId, ":"), error_8);
                    return [3 /*break*/, 8];
                case 8:
                    _i++;
                    return [3 /*break*/, 1];
                case 9: return [2 /*return*/, {
                        success: true,
                        successCount: successCount,
                        skipCount: skipCount,
                        totalCount: contactIds.length
                    }];
            }
        });
    }); })))))))))))
}),
    // 个人标签管理（针对单个人脉的自定义标签）
    personalTags;
(0, trpc_1.router)({
    // 获取人脉的个人标签列表
    list: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getPersonalTagsByContactId(input.contactId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 创建个人标签
    create, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        name: zod_1.z.string().min(1, "标签名称不能为空"),
        color: zod_1.z.string().default("#A80000"),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tagId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.createPersonalTag({
                        contactId: input.contactId,
                        parentUserId: ctx.user.id,
                        name: input.name,
                        color: input.color,
                    })];
                case 1:
                    tagId = _c.sent();
                    return [2 /*return*/, { id: tagId }];
            }
        });
    }); }), 
    // 更新个人标签
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().min(1, "标签名称不能为空").optional(),
        color: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.updatePersonalTag(input.id, ctx.user.id, {
                        name: input.name,
                        color: input.color,
                    })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除个人标签
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deletePersonalTag(input.id, ctx.user.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取个人标签使用统计
    stats, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getPersonalTagsStats(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); })))))
}),
    // 字段分类管理（全局字段定义）
    fieldCategories;
(0, trpc_1.router)({
    // 获取所有字段分类
    list: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getContactFieldCategories(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 创建字段分类
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "字段名称不能为空"),
        fieldType: zod_1.z.enum(["text", "number", "date", "select"]).default("text"),
        options: zod_1.z.array(zod_1.z.string()).optional(),
        isRequired: zod_1.z.boolean().default(false),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var category;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.createContactFieldCategory({
                        parentUserId: ctx.user.id,
                        name: input.name,
                        fieldType: input.fieldType,
                        options: input.options || null,
                        isRequired: input.isRequired,
                        sortOrder: 0,
                    })];
                case 1:
                    category = _c.sent();
                    if (!category) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建字段分类失败" });
                    }
                    return [2 /*return*/, category];
            }
        });
    }); }), 
    // 删除字段分类
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.deleteContactFieldCategory(input.id, ctx.user.id)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段分类失败" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))
}),
    // 字段值管理
    fieldValues;
(0, trpc_1.router)({
    // 获取所有可用的字段类目
    categories: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getFieldCategories(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 创建字段类目
    createCategory: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "分类名称不能为空"),
        icon: zod_1.z.string().default(''),
        parentCategoryId: zod_1.z.number().nullable().default(null),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.createFieldCategory(input.name, input.icon, input.parentCategoryId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取人脉的所有字段值
    list, trpc_1.protectedProcedure
        .input(zod_1.z.object({ contactId: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactFieldValues(input.contactId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 批量设置人脉的字段值
    set, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        values: zod_1.z.array(zod_1.z.object({
            categoryId: zod_1.z.number(),
            value: zod_1.z.string(),
        }))
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.setContactFieldValues(input.contactId, input.values)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "设置字段值失败" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 添加单个字段值
    add, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        categoryId: zod_1.z.number(),
        categoryName: zod_1.z.string(),
        value: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var newFieldValue;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.addFieldValue(input.contactId, input.categoryId, input.categoryName, input.value)];
                case 1:
                    newFieldValue = _c.sent();
                    return [2 /*return*/, newFieldValue];
            }
        });
    }); }), 
    // 删除单个字段值
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteFieldValue(input.id)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段值失败" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 批量删除联系人的所有扩展信息
    deleteAll, trpc_1.protectedProcedure
        .input(zod_1.z.object({ contactId: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteAllFieldValues(input.contactId)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除扩展信息失败" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 更新字段值的排序
    updateSortOrder, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        updates: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.number(),
            sortOrder: zod_1.z.number(),
        }))
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, _i, _c, update;
        var input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db)
                        throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
                    _i = 0, _c = input.updates;
                    _d.label = 2;
                case 2:
                    if (!(_i < _c.length)) return [3 /*break*/, 5];
                    update = _c[_i];
                    return [4 /*yield*/, db
                            .update(schema_1.contactFieldValues)
                            .set({ sortOrder: update.sortOrder })
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.id, update.id))];
                case 3:
                    _d.sent();
                    _d.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { success: true }];
            }
        });
    }); })))))
}),
    // 联络记录
    interactions;
(0, trpc_1.router)({
    // 记录一次联络
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        note: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var hasTodayInteraction, interactionId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.hasTodayInteraction(input.contactId)];
                case 1:
                    hasTodayInteraction = _c.sent();
                    if (hasTodayInteraction) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "今天已经记录过联络，每天只能记录一次"
                        });
                    }
                    return [4 /*yield*/, dbContacts.createContactInteraction({
                            contactId: input.contactId,
                            interactionDate: new Date(),
                            note: input.note,
                        })
                        // 奖励积分：每次联络
                    ];
                case 2:
                    interactionId = _c.sent();
                    // 奖励积分：每次联络
                    return [4 /*yield*/, (0, db_point_system_1.addPointsForAction)(ctx.user.id, 'communication', input.contactId)];
                case 3:
                    // 奖励积分：每次联络
                    _c.sent();
                    return [2 /*return*/, { id: interactionId }];
            }
        });
    }); }), 
    // 获取联络历史
    list, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactInteractions(input.contactId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取联络统计信息
    stats, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactInteractionStats(input.contactId)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 删除联络记录
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({
        interactionId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteContactInteraction(input.interactionId)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 更新联络记录
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        interactionId: zod_1.z.number(),
        interactionDate: zod_1.z.date().optional(),
        note: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.updateContactInteraction({
                        id: input.interactionId,
                        interactionDate: input.interactionDate,
                        note: input.note,
                    })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))))))
}),
    // 提醒类型管理
    reminderTypes;
(0, trpc_1.router)({
    // 创建提醒类型
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "类型名称不能为空"),
        icon: zod_1.z.string().default("🔔"),
        color: zod_1.z.string().default("#6366f1"),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var newType;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbReminderTypes.createReminderType({
                        userId: ctx.user.id,
                        name: input.name,
                        icon: input.icon,
                        color: input.color,
                        isDefault: false,
                    })];
                case 1:
                    newType = _c.sent();
                    return [2 /*return*/, newType];
            }
        });
    }); }), 
    // 获取用户的所有提醒类型
    list, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbReminderTypes.getReminderTypesByUserId(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 更新提醒类型
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().min(1, "类型名称不能为空").optional(),
        icon: zod_1.z.string().optional(),
        color: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data, updated;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, dbReminderTypes.updateReminderType(id, ctx.user.id, data)];
                case 1:
                    updated = _c.sent();
                    if (!updated) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "提醒类型不存在" });
                    }
                    return [2 /*return*/, updated];
            }
        });
    }); }), 
    // 删除提醒类型
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var success;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbReminderTypes.deleteReminderType(input.id, ctx.user.id)];
                case 1:
                    success = _c.sent();
                    if (!success) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "无法删除默认类型或类型不存在" });
                    }
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))))
}),
    // 提醒管理
    reminders;
(0, trpc_1.router)({
    // 创建提醒
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
        title: zod_1.z.string().min(1, "提醒事项不能为空"),
        reminderDate: zod_1.z.number().optional(), // Unix timestamp (ms), 普通提醒必填
        reminderType: zod_1.z.enum(["normal", "birthday"]).default("normal"),
        birthMonth: zod_1.z.number().min(1).max(12).optional(), // 生日月份，生日提醒必填
        birthDay: zod_1.z.number().min(1).max(31).optional(), // 生日日期，生日提醒必填
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var reminderDate, now, currentYear, reminderId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 验证：普通提醒必须有reminderDate，生日提醒必须有birthMonth和birthDay
                    if (input.reminderType === "normal" && !input.reminderDate) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "普通提醒必须指定提醒时间" });
                    }
                    if (input.reminderType === "birthday" && (!input.birthMonth || !input.birthDay)) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "生日提醒必须指定月份和日期" });
                    }
                    if (input.reminderType === "birthday") {
                        now = new Date();
                        currentYear = now.getFullYear();
                        reminderDate = new Date(currentYear, input.birthMonth - 1, input.birthDay);
                        // 如果今年的生日已过，设置为明年的生日
                        if (reminderDate < now) {
                            reminderDate = new Date(currentYear + 1, input.birthMonth - 1, input.birthDay);
                        }
                    }
                    else {
                        reminderDate = new Date(input.reminderDate);
                    }
                    return [4 /*yield*/, dbContacts.createReminder({
                            contactId: input.contactId,
                            userId: ctx.user.id,
                            title: input.title,
                            reminderDate: reminderDate,
                            reminderType: input.reminderType,
                            isRecurring: input.reminderType === "birthday", // 生日提醒自动循环
                            birthMonth: input.birthMonth,
                            birthDay: input.birthDay,
                            isCompleted: false,
                        })];
                case 1:
                    reminderId = _c.sent();
                    return [2 /*return*/, { id: reminderId }];
            }
        });
    }); }), 
    // 获取某个人脉的所有提醒
    list, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        contactId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactReminders(input.contactId, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 更新提醒（标记完成/未完成）
    update, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        isCompleted: zod_1.z.boolean(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.updateReminder(input.id, ctx.user.id, {
                        isCompleted: input.isCompleted,
                    })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除提醒
    delete , trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.deleteReminder(input.id, ctx.user.id)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取今日提醒人数
    todayCount, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getTodayRemindersCount(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取本周提醒人数
    weekCount, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getWeekRemindersCount(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取本月提醒人数
    monthCount, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getMonthRemindersCount(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); })))))
}),
    // 区域统计和筛选
    regions;
(0, trpc_1.router)({
    // 获取所有省份的人数统计
    stats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getRegionStats(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 按区域筛选人脉列表
    list: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        region: zod_1.z.string(),
        page: zod_1.z.number().min(1).default(1),
        pageSize: zod_1.z.number().min(1).max(100).default(50),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getContactsByRegionPaginated(ctx.user.id, input.region, input.page, input.pageSize)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }))
}),
    // 容器顺序管理
    featureOrder;
(0, trpc_1.router)({
    // 获取用户的容器顺序（合并默认定义和用户自定义顺序）
    get: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _c, definitions, userOrder, userOrderMap, features;
        var ctx = _b.ctx;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        db.getActiveFeatureDefinitions(),
                        db.getUserFeatureOrder(ctx.user.id),
                    ])];
                case 1:
                    _c = _d.sent(), definitions = _c[0], userOrder = _c[1];
                    userOrderMap = new Map(userOrder.map(function (o) { return [o.featureId, o.position]; }));
                    features = definitions.map(function (def) {
                        var _a;
                        return ({
                            featureId: def.featureId,
                            title: def.title,
                            description: def.description,
                            position: (_a = userOrderMap.get(def.featureId)) !== null && _a !== void 0 ? _a : def.defaultPosition,
                        });
                    });
                    // 按position排序
                    features.sort(function (a, b) { return a.position - b.position; });
                    return [2 /*return*/, features];
            }
        });
    }); }),
    // 保存用户的容器顺序
    save: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        orders: zod_1.z.array(zod_1.z.object({
            featureId: zod_1.z.number(),
            position: zod_1.z.number(),
        }))
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.saveUserFeatureOrder(ctx.user.id, input.orders)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))
}),
    // 介绍人贡献统计
    referrerStats;
(0, trpc_1.router)({
    // 获取介绍人贡献排行榜
    leaderboard: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        directWeight: zod_1.z.number().optional(),
        indirectWeight: zod_1.z.number().optional(),
    })).optional()
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbReferrerStats.getReferrerStats(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }),
;
// 导出所有人脉数据
exportAll: trpc_1.protectedProcedure
    .input(zod_1.z.object({
    scope: zod_1.z.enum(['current_user', 'all_users']).default('current_user'),
}))
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var scope, db, contactsList, _c, tags, _d, fieldCategoriesList, _e, contactsWithDetails;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                scope = input.scope;
                // 只有超级管理员才能导出所有用户数据
                if (scope === 'all_users' && ctx.user.role !== 'super_admin') {
                    throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员才能导出所有用户数据' });
                }
                return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db = _f.sent();
                if (!db)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
                if (!(scope === 'all_users')) return [3 /*break*/, 3];
                return [4 /*yield*/, db.select().from(schema_1.contacts)]; // 查询所有用户的人脉
            case 2:
                _c = _f.sent(); // 查询所有用户的人脉
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, db.select().from(schema_1.contacts).where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, ctx.user.id))];
            case 4:
                _c = _f.sent();
                _f.label = 5;
            case 5:
                contactsList = _c;
                if (!(scope === 'all_users')) return [3 /*break*/, 7];
                return [4 /*yield*/, db.select().from(schema_1.contactTags)]; // 查询所有标签
            case 6:
                _d = _f.sent(); // 查询所有标签
                return [3 /*break*/, 9];
            case 7: return [4 /*yield*/, dbContacts.getContactTags(ctx.user.id)];
            case 8:
                _d = _f.sent();
                _f.label = 9;
            case 9:
                tags = _d;
                if (!(scope === 'all_users')) return [3 /*break*/, 11];
                return [4 /*yield*/, db.select().from(schema_1.contactFieldCategories)]; // 查询所有字段分类
            case 10:
                _e = _f.sent(); // 查询所有字段分类
                return [3 /*break*/, 13];
            case 11: return [4 /*yield*/, db.select().from(schema_1.contactFieldCategories).where((0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.parentUserId, ctx.user.id))];
            case 12:
                _e = _f.sent();
                _f.label = 13;
            case 13:
                fieldCategoriesList = _e;
                return [4 /*yield*/, Promise.all(contactsList.map(function (contact) { return __awaiter(void 0, void 0, void 0, function () {
                        var fieldValuesList, contactTags, interactions, reminders;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, db.select().from(schema_1.contactFieldValues).where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contact.id))];
                                case 1:
                                    fieldValuesList = _a.sent();
                                    return [4 /*yield*/, dbContacts.getContactTagsByContactId(contact.id)];
                                case 2:
                                    contactTags = _a.sent();
                                    return [4 /*yield*/, dbContacts.getContactInteractions(contact.id)];
                                case 3:
                                    interactions = _a.sent();
                                    return [4 /*yield*/, dbContacts.getContactReminders(contact.id, contact.parentUserId)];
                                case 4:
                                    reminders = _a.sent();
                                    return [2 /*return*/, __assign(__assign({}, contact), { fieldValues: fieldValuesList, tags: contactTags, interactions: interactions, reminders: reminders })];
                            }
                        });
                    }); }))];
            case 14:
                contactsWithDetails = _f.sent();
                // 5. 生成备份数据
                return [2 /*return*/, {
                        exportDate: new Date().toISOString(),
                        scope: scope,
                        exportedBy: ctx.user.id,
                        summary: {
                            totalContacts: contactsList.length,
                            totalTags: tags.length,
                            totalFieldCategories: fieldCategoriesList.length,
                            totalInteractions: contactsWithDetails.reduce(function (sum, c) { return sum + c.interactions.length; }, 0),
                            totalReminders: contactsWithDetails.reduce(function (sum, c) { return sum + c.reminders.length; }, 0),
                        },
                        tags: tags,
                        fieldCategories: fieldCategoriesList,
                        contacts: contactsWithDetails,
                    }];
        }
    });
}); }),
    // 获取推荐关系（直接或间接）
    getReferrals;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    contactId: zod_1.z.number(),
    type: zod_1.z.enum(['direct', 'indirect']),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var referrals, referrals, levelCounts_1, levelDistribution;
    var input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (!(input.type === 'direct')) return [3 /*break*/, 2];
                return [4 /*yield*/, dbContacts.getDirectReferrals(input.contactId)];
            case 1:
                referrals = _c.sent();
                return [2 /*return*/, {
                        referrals: referrals,
                        stats: {
                            total: referrals.length,
                            levelDistribution: [{ level: 1, count: referrals.length }],
                        },
                    }];
            case 2: return [4 /*yield*/, dbContacts.getIndirectReferrals(input.contactId)];
            case 3:
                referrals = _c.sent();
                levelCounts_1 = new Map();
                referrals.forEach(function (r) {
                    var count = levelCounts_1.get(r.level) || 0;
                    levelCounts_1.set(r.level, count + 1);
                });
                levelDistribution = Array.from(levelCounts_1.entries())
                    .map(function (_a) {
                    var level = _a[0], count = _a[1];
                    return ({ level: level, count: count });
                })
                    .sort(function (a, b) { return a.level - b.level; });
                return [2 /*return*/, {
                        referrals: referrals,
                        stats: {
                            total: referrals.length,
                            levelDistribution: levelDistribution,
                        },
                    }];
        }
    });
}); }), getReferralChain, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    contactId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbContacts.getReferralChain(input.contactId)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); })), 
// ==================== 人脉共享管理 ====================
sharing, (0, trpc_1.router)({
    // 创建共享连接
    createConnection: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        receiverUsername: zod_1.z.string().min(1, "请输入接收者用户名"),
        note: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var receiver, existingConnection, connectionId, defaultFields, _i, defaultFields_1, fieldName, currentUser, dbConn;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getUserByUsername(input.receiverUsername)];
                case 1:
                    receiver = _c.sent();
                    if (!receiver) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "找不到该用户" });
                    }
                    // 不能连接自己
                    if (receiver.id === ctx.user.id) {
                        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "不能连接自己" });
                    }
                    return [4 /*yield*/, db.getSharingConnection(ctx.user.id, receiver.id)];
                case 2:
                    existingConnection = _c.sent();
                    if (existingConnection) {
                        throw new server_1.TRPCError({ code: "CONFLICT", message: "已存在与该用户的连接" });
                    }
                    return [4 /*yield*/, db.createSharingConnection({
                            sharerId: ctx.user.id,
                            receiverId: receiver.id,
                            status: 'active', // 直接激活，不需要确认
                            note: input.note,
                        })
                        // 初始化默认权限（全部共享）
                    ];
                case 3:
                    connectionId = _c.sent();
                    defaultFields = ['name', 'title', 'gender', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags'];
                    _i = 0, defaultFields_1 = defaultFields;
                    _c.label = 4;
                case 4:
                    if (!(_i < defaultFields_1.length)) return [3 /*break*/, 7];
                    fieldName = defaultFields_1[_i];
                    return [4 /*yield*/, db.createSharingPermission({
                            connectionId: connectionId,
                            fieldName: fieldName,
                            isShared: true,
                        })];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: 
                // 奖励积分：共享人脉
                return [4 /*yield*/, (0, db_point_system_1.addPointsForAction)(ctx.user.id, 'share_contact', connectionId)];
                case 8:
                    // 奖励积分：共享人脉
                    _c.sent();
                    return [4 /*yield*/, db.getUserById(ctx.user.id)];
                case 9:
                    currentUser = _c.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 10:
                    dbConn = _c.sent();
                    if (!dbConn) return [3 /*break*/, 12];
                    return [4 /*yield*/, dbConn.insert(schema_1.sharingNotifications).values({
                            receiverId: receiver.id,
                            actorId: ctx.user.id,
                            actorName: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.name) || (currentUser === null || currentUser === void 0 ? void 0 : currentUser.username) || "\u7528\u6237".concat(ctx.user.id),
                            type: 'added',
                        })];
                case 11:
                    _c.sent();
                    _c.label = 12;
                case 12: return [2 /*return*/, { connectionId: connectionId, receiverName: receiver.name || receiver.username }];
            }
        });
    }); }), 
    // 删除共享连接
    deleteConnection, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        connectionId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var connection, currentUser, dbConn;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getSharingConnectionById(input.connectionId)];
                case 1:
                    connection = _c.sent();
                    if (!connection || connection.sharerId !== ctx.user.id) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
                    }
                    return [4 /*yield*/, db.getUserById(ctx.user.id)];
                case 2:
                    currentUser = _c.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 3:
                    dbConn = _c.sent();
                    if (!dbConn) return [3 /*break*/, 5];
                    return [4 /*yield*/, dbConn.insert(schema_1.sharingNotifications).values({
                            receiverId: connection.receiverId,
                            actorId: ctx.user.id,
                            actorName: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.name) || (currentUser === null || currentUser === void 0 ? void 0 : currentUser.username) || "\u7528\u6237".concat(ctx.user.id),
                            type: 'removed',
                        })];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5: 
                // 删除权限配置
                return [4 /*yield*/, db.deleteSharingPermissionsByConnectionId(input.connectionId)];
                case 6:
                    // 删除权限配置
                    _c.sent();
                    // 删除连接
                    return [4 /*yield*/, db.deleteSharingConnection(input.connectionId)];
                case 7:
                    // 删除连接
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取我的共享连接列表（作为分享者）
    listMyConnections, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var connections, connectionsWithDetails;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getSharingConnectionsBySharerId(ctx.user.id)];
                case 1:
                    connections = _c.sent();
                    return [4 /*yield*/, Promise.all(connections.map(function (conn) { return __awaiter(void 0, void 0, void 0, function () {
                            var receiver, permissions, contacts, sharedContactCount;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, db.getUserById(conn.receiverId)];
                                    case 1:
                                        receiver = _a.sent();
                                        return [4 /*yield*/, db.getSharingPermissionsByConnectionId(conn.id)];
                                    case 2:
                                        permissions = _a.sent();
                                        return [4 /*yield*/, dbContacts.getContactsByParent(ctx.user.id)];
                                    case 3:
                                        contacts = _a.sent();
                                        sharedContactCount = contacts.length;
                                        return [2 /*return*/, __assign(__assign({}, conn), { receiverName: (receiver === null || receiver === void 0 ? void 0 : receiver.name) || (receiver === null || receiver === void 0 ? void 0 : receiver.username) || '未知用户', receiverUsername: (receiver === null || receiver === void 0 ? void 0 : receiver.username) || '', receiverAvatar: (receiver === null || receiver === void 0 ? void 0 : receiver.avatar) || null, permissions: permissions, sharedContactCount: sharedContactCount })];
                                }
                            });
                        }); }))];
                case 2:
                    connectionsWithDetails = _c.sent();
                    return [2 /*return*/, connectionsWithDetails];
            }
        });
    }); }), 
    // 获取共享给我的连接列表（作为接收者）
    listSharedToMe, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var connections, connectionsWithDetails;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getSharingConnectionsByReceiverId(ctx.user.id)];
                case 1:
                    connections = _c.sent();
                    return [4 /*yield*/, Promise.all(connections.map(function (conn) { return __awaiter(void 0, void 0, void 0, function () {
                            var sharer, contacts, sharedContactCount;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, db.getUserById(conn.sharerId)];
                                    case 1:
                                        sharer = _a.sent();
                                        return [4 /*yield*/, dbContacts.getContactsByParent(conn.sharerId)];
                                    case 2:
                                        contacts = _a.sent();
                                        sharedContactCount = contacts.length;
                                        return [2 /*return*/, __assign(__assign({}, conn), { sharerName: (sharer === null || sharer === void 0 ? void 0 : sharer.name) || (sharer === null || sharer === void 0 ? void 0 : sharer.username) || '未知用户', sharerUsername: (sharer === null || sharer === void 0 ? void 0 : sharer.username) || '', sharerAvatar: (sharer === null || sharer === void 0 ? void 0 : sharer.avatar) || null, sharedContactCount: sharedContactCount })];
                                }
                            });
                        }); }))];
                case 2:
                    connectionsWithDetails = _c.sent();
                    return [2 /*return*/, connectionsWithDetails];
            }
        });
    }); }), 
    // 更新共享权限配置
    updatePermissions, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        connectionId: zod_1.z.number(),
        permissions: zod_1.z.array(zod_1.z.object({
            fieldName: zod_1.z.string(),
            isShared: zod_1.z.boolean(),
        }))
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var connection, _i, _c, perm;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, db.getSharingConnectionById(input.connectionId)];
                case 1:
                    connection = _d.sent();
                    if (!connection || connection.sharerId !== ctx.user.id) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
                    }
                    _i = 0, _c = input.permissions;
                    _d.label = 2;
                case 2:
                    if (!(_i < _c.length)) return [3 /*break*/, 5];
                    perm = _c[_i];
                    return [4 /*yield*/, db.upsertSharingPermission(input.connectionId, perm.fieldName, perm.isShared)];
                case 3:
                    _d.sent();
                    _d.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取共享权限配置
    getPermissions, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        connectionId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var connection;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getSharingConnectionById(input.connectionId)];
                case 1:
                    connection = _c.sent();
                    if (!connection || (connection.sharerId !== ctx.user.id && connection.receiverId !== ctx.user.id)) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
                    }
                    return [4 /*yield*/, db.getSharingPermissionsByConnectionId(input.connectionId)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取未读共享通知数量（区分新增和删除）
    getUnreadCount, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbConn, unread;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    dbConn = _c.sent();
                    if (!dbConn)
                        return [2 /*return*/, { addedCount: 0, removedCount: 0 }];
                    return [4 /*yield*/, dbConn
                            .select({
                            type: schema_1.sharingNotifications.type,
                            id: schema_1.sharingNotifications.id,
                        })];
                case 2:
                    unread = _c.sent();
                    return [2 /*return*/];
            }
        });
    }); })
        .from(schema_1.sharingNotifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sharingNotifications.receiverId, ctx.user.id), (0, drizzle_orm_1.eq)(schema_1.sharingNotifications.isRead, 0))))))),
    const: addedCount = unread.filter(function (n) { return n.type === 'added'; }).length,
    const: removedCount = unread.filter(function (n) { return n.type === 'removed'; }).length,
    return: { addedCount: addedCount, removedCount: removedCount }
}), 
// 获取未读共享通知详情列表
getUnreadNotifications, trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var dbConn, notifications;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                dbConn = _c.sent();
                if (!dbConn)
                    return [2 /*return*/, []];
                return [4 /*yield*/, dbConn
                        .select()
                        .from(schema_1.sharingNotifications)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sharingNotifications.receiverId, ctx.user.id), (0, drizzle_orm_1.eq)(schema_1.sharingNotifications.isRead, 0)))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.sharingNotifications.createdAt))];
            case 2:
                notifications = _c.sent();
                return [2 /*return*/, notifications];
        }
    });
}); }), 
// 标记共享通知为已读
markAsRead, trpc_1.protectedProcedure
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var dbConn;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                dbConn = _c.sent();
                if (!dbConn)
                    return [2 /*return*/, { success: false }];
                return [4 /*yield*/, dbConn
                        .update(schema_1.sharingNotifications)
                        .set({ isRead: 1 })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sharingNotifications.receiverId, ctx.user.id), (0, drizzle_orm_1.eq)(schema_1.sharingNotifications.isRead, 0)))];
            case 2:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 轻量级获取共享人列表（只返回共享人名字和ID，使用单次SQL查询优化）
getSharerList, trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var allConnections, connections, sharerIds, sharers;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, db.getSharingConnectionsByReceiverId(ctx.user.id)];
            case 1:
                allConnections = _c.sent();
                connections = allConnections.filter(function (conn) { return conn.status === 'active'; });
                if (connections.length === 0) {
                    return [2 /*return*/, []];
                }
                sharerIds = connections.map(function (conn) { return conn.sharerId; });
                return [4 /*yield*/, db.getUsersByIds(sharerIds)];
            case 2:
                sharers = _c.sent();
                return [2 /*return*/, sharers.map(function (sharer) { return ({
                        id: sharer.id.toString(),
                        name: sharer.username || "\u7528\u6237".concat(sharer.id)
                    }); })];
        }
    });
}); }), 
// 获取共享给我的人脉列表（数据聚合）
getSharedContacts, trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var allConnections, connections, allSharedContacts, _loop_4, _i, connections_1, conn;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, db.getSharingConnectionsByReceiverId(ctx.user.id)];
            case 1:
                allConnections = _c.sent();
                connections = allConnections.filter(function (conn) { return conn.status === 'active'; });
                if (connections.length === 0) {
                    return [2 /*return*/, []];
                }
                allSharedContacts = [];
                _loop_4 = function (conn) {
                    var sharer, permissions, sharedFields, sharedFieldsSet, contacts_1, contactIds, _d, allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap, referrerStatsMap, contactsWithDetails, _e, contactsWithDetails_1, contact;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0: return [4 /*yield*/, db.getUserById(conn.sharerId)];
                            case 1:
                                sharer = _f.sent();
                                if (!sharer)
                                    return [2 /*return*/, "continue"];
                                return [4 /*yield*/, db.getSharingPermissionsByConnectionId(conn.id)];
                            case 2:
                                permissions = _f.sent();
                                sharedFields = permissions.filter(function (p) { return p.isShared; }).map(function (p) { return p.fieldName; });
                                sharedFieldsSet = new Set(sharedFields);
                                return [4 /*yield*/, dbContacts.getContactsByParent(conn.sharerId)];
                            case 3:
                                contacts_1 = _f.sent();
                                if (contacts_1.length === 0)
                                    return [2 /*return*/, "continue"];
                                contactIds = contacts_1.map(function (c) { return c.id; });
                                return [4 /*yield*/, Promise.all([
                                        dbReferrerStats.getReferrerStats(conn.sharerId).catch(function () { return []; }),
                                        dbContacts.getTagsForContacts(contactIds),
                                        dbContacts.getPersonalTagsForContacts(contactIds),
                                        dbContacts.getInteractionStatsForContacts(contactIds),
                                        dbContacts.getInteractionInfoForContacts(contactIds),
                                        dbContacts.getFieldValuesForContacts(contactIds),
                                    ])];
                            case 4:
                                _d = _f.sent(), allReferrerStats = _d[0], tagsMap = _d[1], personalTagsMap = _d[2], interactionStatsMap = _d[3], interactionInfoMap = _d[4], fieldValuesMap = _d[5];
                                referrerStatsMap = new Map(allReferrerStats.map(function (stat) { return [stat.contactId, stat]; }));
                                contactsWithDetails = contacts_1.map(function (contact) {
                                    var tags = tagsMap.get(contact.id) || [];
                                    var personalTags = personalTagsMap.get(contact.id) || [];
                                    var interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
                                    var interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
                                    var referrerStats = referrerStatsMap.get(contact.id) || null;
                                    var fieldValues = fieldValuesMap.get(contact.id) || [];
                                    // 基础字段（始终返回）
                                    var result = {
                                        id: contact.id,
                                        _sharedBy: sharer.name || sharer.username,
                                        _sharerUserId: conn.sharerId,
                                        createdAt: contact.createdAt,
                                        updatedAt: contact.updatedAt,
                                    };
                                    // 根据权限配置过滤字段
                                    // 姓名始终显示（必须的）
                                    if (sharedFieldsSet.has('name') || sharedFieldsSet.size === 0) {
                                        result.name = contact.name;
                                    }
                                    // 其他基本字段根据权限配置
                                    if (sharedFieldsSet.has('title'))
                                        result.title = contact.title;
                                    if (sharedFieldsSet.has('phone'))
                                        result.phone = contact.phone;
                                    if (sharedFieldsSet.has('occupation'))
                                        result.occupation = contact.occupation;
                                    if (sharedFieldsSet.has('avatar'))
                                        result.avatar = contact.avatar;
                                    if (sharedFieldsSet.has('notes'))
                                        result.notes = contact.notes;
                                    if (sharedFieldsSet.has('isBlacklisted'))
                                        result.isBlacklisted = contact.isBlacklisted;
                                    // 标签始终显示（重要信息）
                                    result.tags = tags;
                                    result.personalTags = personalTags;
                                    // 字段值（公司、职位等）始终显示
                                    result.fieldValues = fieldValues;
                                    // 联络信息始终显示（让接收方知道分享者的联络情况）
                                    result.lastInteractionDate = interactionInfo.lastInteraction;
                                    result.daysSinceLastInteraction = interactionInfo.lastInteraction
                                        ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
                                        : null;
                                    result.hasTodayInteraction = interactionInfo.hasTodayInteraction;
                                    result.hasInteractionToday = interactionInfo.hasInteractionToday || false;
                                    result.hasInteractionThisWeek = interactionInfo.hasInteractionThisWeek || false;
                                    result.hasInteractionThisMonth = interactionInfo.hasInteractionThisMonth || false;
                                    result.hasInteractionThisYear = interactionInfo.hasInteractionThisYear || false;
                                    result.totalInteractions = (interactionStats === null || interactionStats === void 0 ? void 0 : interactionStats.totalInteractions) || 0;
                                    // 推荐人信息
                                    result.hasReferrer = contact.referrerId !== null && contact.referrerId !== undefined;
                                    result.directReferrals = (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.directReferrals) || 0;
                                    result.indirectReferrals = (referrerStats === null || referrerStats === void 0 ? void 0 : referrerStats.indirectReferrals) || 0;
                                    return result;
                                });
                                // 使用concat或循环避免栈溢出（push(...array)在数组很大时会崩溃）
                                for (_e = 0, contactsWithDetails_1 = contactsWithDetails; _e < contactsWithDetails_1.length; _e++) {
                                    contact = contactsWithDetails_1[_e];
                                    allSharedContacts.push(contact);
                                }
                                return [2 /*return*/];
                        }
                    });
                };
                _i = 0, connections_1 = connections;
                _c.label = 2;
            case 2:
                if (!(_i < connections_1.length)) return [3 /*break*/, 5];
                conn = connections_1[_i];
                return [5 /*yield**/, _loop_4(conn)];
            case 3:
                _c.sent();
                _c.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5: return [2 /*return*/, allSharedContacts];
        }
    });
}); }), 
// 搜索用户（用于添加连接时搜索）
searchUsers, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    query: zod_1.z.string().min(1),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var users;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, db.searchUsersByUsername(input.query)];
            case 1:
                users = _c.sent();
                // 过滤掉自己
                return [2 /*return*/, users.filter(function (u) { return u.id !== ctx.user.id; }).map(function (u) { return ({
                        id: u.id,
                        username: u.username,
                        name: u.name,
                    }); })];
        }
    });
}); })), 
// 锦炼计数系统
exercise, (0, trpc_1.router)({
    // 获取锻炼项目列表
    getTypes: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.getExerciseTypes(ctx.user.id)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 创建锻炼项目
    createType: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1).max(50),
        icon: zod_1.z.string().default("💪"),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.createExerciseType(ctx.user.id, input.name, input.icon)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 更新锻炼项目
    updateType, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().min(1).max(50).optional(),
        icon: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise, id, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, dbExercise.updateExerciseType(id, ctx.user.id, data)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 删除锻炼项目
    deleteType, trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.deleteExerciseType(input.id, ctx.user.id)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 保存锻炼记录
    saveRecord, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        exerciseTypeId: zod_1.z.number(),
        count: zod_1.z.number().min(0),
        recordDate: zod_1.z.string(), // YYYY-MM-DD格式
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.upsertExerciseRecord(ctx.user.id, input.exerciseTypeId, input.count, input.recordDate)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取锻炼记录
    getRecords, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        exerciseTypeId: zod_1.z.number(),
        startDate: zod_1.z.string(),
        endDate: zod_1.z.string(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.getExerciseRecordsByDateRange(ctx.user.id, input.exerciseTypeId, input.startDate, input.endDate)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 删除锻炼记录
    deleteRecord, trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.deleteExerciseRecord(input.id, ctx.user.id)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 检查是否已设置家长密码
    hasPassword, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.hasParentPassword(ctx.user.id)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 设置家长密码
    setPassword, trpc_1.protectedProcedure
        .input(zod_1.z.object({ password: zod_1.z.string().min(4).max(20) }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.setParentPassword(ctx.user.id, input.password)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 验证家长密码
    verifyPassword, trpc_1.protectedProcedure
        .input(zod_1.z.object({ password: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbExercise, isValid;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./db-exercise"); })];
                case 1:
                    dbExercise = _c.sent();
                    return [4 /*yield*/, dbExercise.verifyParentPassword(ctx.user.id, input.password)];
                case 2:
                    isValid = _c.sent();
                    return [2 /*return*/, { isValid: isValid }];
            }
        });
    }); })))))
}), 
// 数据分析
analytics, (0, trpc_1.router)({
    // 获取“我的”数据分析
    myData: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var data;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbAnalytics.getMyDataAnalytics(ctx.user.id)];
                case 1:
                    data = _c.sent();
                    return [2 /*return*/, data];
            }
        });
    }); }),
    // 获取地域分布趋势数据
    regionTrend: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        months: zod_1.z.number().min(1).max(24).default(6),
        regions: zod_1.z.array(zod_1.z.string()).optional(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getRegionTrend;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-region-trend'); })];
                case 1:
                    getRegionTrend = (_c.sent()).getRegionTrend;
                    return [4 /*yield*/, getRegionTrend(ctx.user.id, input.months, input.regions)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取海外和其他类别的趋势数据
    overseasAndOtherTrend, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        months: zod_1.z.number().min(1).max(24).default(6),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getOverseasAndOtherTrend;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-region-trend'); })];
                case 1:
                    getOverseasAndOtherTrend = (_c.sent()).getOverseasAndOtherTrend;
                    return [4 /*yield*/, getOverseasAndOtherTrend(ctx.user.id, input.months)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取人脉增长统计数据
    contactGrowthStats, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        type: zod_1.z.enum(['all', 'my', 'shared']),
        period: zod_1.z.enum(['day', 'week', 'month']),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbAnalytics.getContactGrowthStats(ctx.user.id, input.type, input.period)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取人脉互动分层统计数据
    contactLayerStats, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        type: zod_1.z.enum(['all', 'my', 'shared']),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbAnalytics.getContactLayerStats(ctx.user.id, input.type)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取健康度统计数据
    healthStats, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        type: zod_1.z.enum(['all', 'my', 'shared']),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbContacts.getHealthStats(ctx.user.id, input.type)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }))))))
}), 
// 用户偏好设置
userPreferences, (0, trpc_1.router)({
    // 获取用户首页卡片排序
    getHomeCardOrder: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var preference;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getUserPreference(ctx.user.id)];
                case 1:
                    preference = _c.sent();
                    return [2 /*return*/, (preference === null || preference === void 0 ? void 0 : preference.homeCardOrder) || null];
            }
        });
    }); }),
    // 保存用户首页卡片排序
    saveHomeCardOrder: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        cardOrder: zod_1.z.array(zod_1.z.string()),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.saveHomeCardOrder(ctx.user.id, input.cardOrder)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取用户主题设置
    getThemeSettings, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var preference;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.getUserPreference(ctx.user.id)];
                case 1:
                    preference = _c.sent();
                    return [2 /*return*/, {
                            colorThemeId: (preference === null || preference === void 0 ? void 0 : preference.colorThemeId) || null,
                            customColors: (preference === null || preference === void 0 ? void 0 : preference.customColors) || null,
                        }];
            }
        });
    }); }), 
    // 保存用户主题设置
    saveThemeSettings, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        colorThemeId: zod_1.z.string().nullable(),
        customColors: zod_1.z.any().nullable(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db.saveThemeSettings(ctx.user.id, input.colorThemeId, input.customColors)];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); })))
}), 
// 积分系统
pointSystem, (0, trpc_1.router)({
    // 获取当前用户积分
    getMyPoints: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getUserPoints, points;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    getUserPoints = (_c.sent()).getUserPoints;
                    return [4 /*yield*/, getUserPoints(ctx.user.id)];
                case 2:
                    points = _c.sent();
                    return [2 /*return*/, { points: points }];
            }
        });
    }); }),
    // 获取当前用户的积分变动记录
    getMyPointLogs: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        limit: zod_1.z.number().min(1).max(100).default(50),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getUserPointLogs, logs;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    getUserPointLogs = (_c.sent()).getUserPointLogs;
                    return [4 /*yield*/, getUserPointLogs(ctx.user.id, input.limit)];
                case 2:
                    logs = _c.sent();
                    return [2 /*return*/, logs];
            }
        });
    }); }), 
    // 管理员：获取所有积分规则
    getAllRules, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getAllPointRules;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    getAllPointRules = (_c.sent()).getAllPointRules;
                    return [4 /*yield*/, getAllPointRules()];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 管理员：更新积分规则
    updateRule, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        actionType: zod_1.z.string(),
        points: zod_1.z.number().optional(),
        isActive: zod_1.z.boolean().optional(),
        description: zod_1.z.string().optional(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var updatePointRule;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    updatePointRule = (_c.sent()).updatePointRule;
                    return [4 /*yield*/, updatePointRule(input.actionType, {
                            points: input.points,
                            isActive: input.isActive,
                            description: input.description,
                        })];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 管理员：获取所有用户及其积分
    getAllUsers, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        page: zod_1.z.number().min(1).default(1),
        pageSize: zod_1.z.number().min(1).max(100).default(50),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getAllUsersWithPoints;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    getAllUsersWithPoints = (_c.sent()).getAllUsersWithPoints;
                    return [4 /*yield*/, getAllUsersWithPoints(input.page, input.pageSize)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 管理员：搜索用户
    searchUsers, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        keyword: zod_1.z.string().min(1),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var searchUsersByUsername;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    searchUsersByUsername = (_c.sent()).searchUsersByUsername;
                    return [4 /*yield*/, searchUsersByUsername(input.keyword)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 管理员：手动调整用户积分
    adjustUserPoints, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
        points: zod_1.z.number(),
        description: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var adjustUserPointsByAdmin;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    adjustUserPointsByAdmin = (_c.sent()).adjustUserPointsByAdmin;
                    return [4 /*yield*/, adjustUserPointsByAdmin(input.userId, input.points, input.description, ctx.user.id)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 管理员：获取所有积分变动记录
    getAllLogs, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        limit: zod_1.z.number().min(1).max(200).default(100),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getAllPointLogs;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-point-system'); })];
                case 1:
                    getAllPointLogs = (_c.sent()).getAllPointLogs;
                    return [4 /*yield*/, getAllPointLogs(input.limit)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); })))))))
}), 
// 个人中心常用功能管理
profileFeatures, (0, trpc_1.router)({
    // 获取用户的常用功能列表
    getFavorites: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var getUserFavoriteFeatures, favorites;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-profile-features'); })];
                case 1:
                    getUserFavoriteFeatures = (_c.sent()).getUserFavoriteFeatures;
                    return [4 /*yield*/, getUserFavoriteFeatures(ctx.user.id, ctx.user.role)];
                case 2:
                    favorites = _c.sent();
                    return [2 /*return*/, { favorites: favorites }];
            }
        });
    }); }),
    // 保存用户的常用功能配置
    saveFavorites: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        featureIds: zod_1.z.array(zod_1.z.string()),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var saveUserFavoriteFeatures;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-profile-features'); })];
                case 1:
                    saveUserFavoriteFeatures = (_c.sent()).saveUserFavoriteFeatures;
                    return [4 /*yield*/, saveUserFavoriteFeatures(ctx.user.id, input.featureIds)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 生成邀请海报
    generateInvitePoster, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var generateInvitePoster, posterPath;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-poster'); })];
                case 1:
                    generateInvitePoster = (_c.sent()).generateInvitePoster;
                    return [4 /*yield*/, generateInvitePoster(ctx.user.id, ctx.user.username)];
                case 2:
                    posterPath = _c.sent();
                    return [2 /*return*/, { posterPath: posterPath }];
            }
        });
    }); }))
}), 
// 账本管理
ledger, (0, trpc_1.router)({
    // 获取全站最近活动动态（公开API，用于首页滚动排行榜）
    recentActivity: trpc_1.publicProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var database, recentLedgers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.getDb()];
                case 1:
                    database = _a.sent();
                    return [4 /*yield*/, database
                            .select({
                            id: schema_1.ledgers.id,
                            name: schema_1.ledgers.name,
                            createdAt: schema_1.ledgers.createdAt,
                            username: schema_1.users.username,
                        })];
                case 2:
                    recentLedgers = _a.sent();
                    return [2 /*return*/];
            }
        });
    }); })
        .from(schema_1.ledgers)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgers.createdBy, schema_1.users.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgers.createdAt))
        .limit(30),
    // 获取最近新增的账目（最近30条）
    const: recentRecords = await database
        .select({
        id: schema_1.ledgerRecords.id,
        ledgerId: schema_1.ledgerRecords.ledgerId,
        type: schema_1.ledgerRecords.type,
        createdAt: schema_1.ledgerRecords.createdAt,
        username: schema_1.users.username,
        ledgerName: schema_1.ledgers.name,
    }),
    : 
        .from(schema_1.ledgerRecords)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.createdBy, schema_1.users.id))
        .leftJoin(schema_1.ledgers, (0, drizzle_orm_1.eq)(schema_1.ledgerRecords.ledgerId, schema_1.ledgers.id))
        .where((0, drizzle_orm_1.isNull)(schema_1.ledgerRecords.deletedAt))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerRecords.createdAt))
        .limit(30),
    // 用户名脱敏处理
    const: maskUsername = function (username) {
        if (!username)
            return '***';
        if (username.length <= 1)
            return username[0] + '**';
        if (username.length <= 2)
            return username[0] + '*';
        if (username.length <= 4)
            return username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
        return username[0] + username[1] + '*'.repeat(username.length - 4) + username.slice(-2);
    },
    // 合并并按时间排序
    const: activities,
    Array: function () {
        type: 'new_ledger' | 'new_record';
        username: string;
        detail: string;
        createdAt: string;
    }
} > , []));
for (var _i = 0, recentLedgers_1 = recentLedgers; _i < recentLedgers_1.length; _i++) {
    var l = recentLedgers_1[_i];
    activities.push({
        type: 'new_ledger',
        username: maskUsername(l.username),
        detail: '新建了一个账本',
        createdAt: l.createdAt || '',
    });
}
for (var _a = 0, recentRecords_1 = recentRecords; _a < recentRecords_1.length; _a++) {
    var r = recentRecords_1[_a];
    var actionText = r.type === 'income' ? '新增了一条收入' : '新增了一条支出';
    activities.push({
        type: 'new_record',
        username: maskUsername(r.username),
        detail: actionText,
        createdAt: r.createdAt || '',
    });
}
// 按时间倒序排列，取前50条
activities.sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
return activities.slice(0, 50);
// 获取账本统计数据
stats: trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var activeLedgers, archivedLedgers, allLedgers, totalLedgers, totalEntries;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getUserLedgers(ctx.user.id, false)];
            case 1:
                activeLedgers = _c.sent();
                return [4 /*yield*/, dbLedger.getUserLedgers(ctx.user.id, true)];
            case 2:
                archivedLedgers = _c.sent();
                allLedgers = __spreadArray(__spreadArray([], activeLedgers, true), archivedLedgers, true);
                totalLedgers = allLedgers.length;
                totalEntries = allLedgers.reduce(function (sum, l) { return sum + (l.recordCount || 0); }, 0);
                return [2 /*return*/, {
                        totalLedgers: totalLedgers,
                        totalEntries: totalEntries,
                    }];
        }
    });
}); }),
    // 获取用户的所有账本
    list;
trpc_1.protectedProcedure
    .input(zod_1.z.object({
    isArchived: zod_1.z.boolean().optional().default(false),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getUserLedgers(ctx.user.id, input.isArchived)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取用户所有账本中的待结账目汇总
getAllPending, trpc_1.protectedProcedure
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getAllPendingTransactions(ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取单个账本详情
getById, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerById(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本信息（别名，与getById相同）
getLedger, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    id: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerById(input.id, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 更新账本功能设置
updateLedgerFeatures, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    enableReimbursement: zod_1.z.boolean().optional(),
    enablePending: zod_1.z.boolean().optional(),
    pendingDefaultIncludeStats: zod_1.z.number().min(0).max(1).optional(),
    requireImage: zod_1.z.boolean().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.updateLedgerFeatures(input.ledgerId, ctx.user.id, {
                    enableReimbursement: input.enableReimbursement,
                    enablePending: input.enablePending,
                    pendingDefaultIncludeStats: input.pendingDefaultIncludeStats,
                    requireImage: input.requireImage,
                })];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本成员列表
getMembers, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本金额范围
getAmountRange, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        // TODO: 实现getLedgerAmountRange函数
        return [2 /*return*/, { min: 0, max: 0 }];
    });
}); }), 
// 上传账目图片到COS
uploadLedgerImage, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    imageData: zod_1.z.string(), // base64 encoded image
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var uploadImageToCOS, imageUrl, error_9;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require('./cos-upload'); })];
            case 1:
                uploadImageToCOS = (_c.sent()).uploadImageToCOS;
                return [4 /*yield*/, uploadImageToCOS(input.imageData, 'ledger-photos')];
            case 2:
                imageUrl = _c.sent();
                return [2 /*return*/, { success: true, imageUrl: imageUrl }];
            case 3:
                error_9 = _c.sent();
                console.error('[uploadLedgerImage] 错误:', error_9);
                throw new server_1.TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: "\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ".concat(error_9 instanceof Error ? error_9.message : '未知错误')
                });
            case 4: return [2 /*return*/];
        }
    });
}); }), 
// 创建新账本
create, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
    description: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    currency: zod_1.z.string().optional(),
    memberNickname: zod_1.z.string().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ledger;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.createLedger({
                    name: input.name,
                    description: input.description,
                    type: input.type,
                    currency: input.currency,
                    createdBy: ctx.user.id,
                })];
            case 1:
                ledger = _c.sent();
                return [2 /*return*/, ledger];
        }
    });
}); }), 
// 更新账本信息
update, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    name: zod_1.z.string().min(1).max(50).optional(),
    description: zod_1.z.string().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.updateLedger(input.ledgerId, ctx.user.id, {
                    name: input.name,
                    description: input.description,
                })];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 更新成员昵称
updateMemberNickname, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    nickname: zod_1.z.string().min(0).max(20),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.updateMemberNickname(input.ledgerId, ctx.user.id, input.nickname)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 存档/取消存档账本
archive, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    isArchived: zod_1.z.boolean(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.archiveLedger(input.ledgerId, ctx.user.id, input.isArchived)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 删除账本
delete , trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.deleteLedger(input.ledgerId, ctx.user.id)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 复制账本
copy, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var newLedger;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.copyLedger(input.ledgerId, ctx.user.id)];
            case 1:
                newLedger = _c.sent();
                return [2 /*return*/, newLedger];
        }
    });
}); }), 
// 生成邀请token
generateInviteToken, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var token;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.generateInviteToken(input.ledgerId, ctx.user.id)];
            case 1:
                token = _c.sent();
                return [2 /*return*/, { token: token }];
        }
    });
}); }), 
// 通过邀请token加入账本
joinByToken, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    token: zod_1.z.string(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ledger;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.joinLedgerByToken(input.token, ctx.user.id)];
            case 1:
                ledger = _c.sent();
                return [2 /*return*/, ledger];
        }
    });
}); }), 
// 邀请成员加入账本（通过用户名）
inviteMember, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    username: zod_1.z.string(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 移除账本成员
removeMember, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    userId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.removeLedgerMember(input.ledgerId, ctx.user.id, input.userId)];
            case 1:
                _c.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 转移账本创建人
transferOwnership, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    newOwnerId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.transferOwnership(input.ledgerId, ctx.user.id, input.newOwnerId)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本密钥
getSecretKey, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerSecretKey(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 通过密钥加入账本
joinBySecretKey, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    secretKey: zod_1.z.string().min(1),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.joinLedgerBySecretKey(input.secretKey, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本分类列表
getCategories, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    type: zod_1.z.enum(['income', 'expense']).optional(),
    parentId: zod_1.z.number().nullable().optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerCategories(input.ledgerId, ctx.user.id, input.type, input.parentId)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 添加账本分类
addCategory, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    name: zod_1.z.string().min(1).max(50),
    type: zod_1.z.enum(['income', 'expense']),
    parentId: zod_1.z.number().optional(),
    icon: zod_1.z.string().optional(),
    color: zod_1.z.string().optional(),
    sortOrder: zod_1.z.number().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.addLedgerCategory(__assign(__assign({}, input), { createdBy: ctx.user.id }))];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 删除账本分类
deleteCategory, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    categoryId: zod_1.z.number(),
    cascade: zod_1.z.boolean().optional().default(false),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.deleteLedgerCategory(input.categoryId, ctx.user.id, input.cascade)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 批量替换分类
replaceCategory, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    sourceCategoryId: zod_1.z.number(),
    targetCategoryId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.replaceLedgerCategory(input.ledgerId, input.sourceCategoryId, input.targetCategoryId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取分类使用数量
getCategoryUsageCount, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    categoryId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getCategoryUsageCount(input.ledgerId, input.categoryId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取成员权限列表
getMemberPermissions, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var result, membersWithUserInfo;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getMemberPermissions(input.ledgerId, ctx.user.id)];
            case 1:
                result = _c.sent();
                return [4 /*yield*/, Promise.all(result.members.map(function (member) { return __awaiter(void 0, void 0, void 0, function () {
                        var user;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, db.getUserById(member.userId)];
                                case 1:
                                    user = _a.sent();
                                    return [2 /*return*/, __assign(__assign({}, member), { userName: (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.username) || '未知用户', userAvatar: (user === null || user === void 0 ? void 0 : user.avatar) || null })];
                            }
                        });
                    }); }))];
            case 2:
                membersWithUserInfo = _c.sent();
                return [2 /*return*/, {
                        members: membersWithUserInfo,
                        defaultPermissions: result.defaultPermissions,
                        currentUserRole: result.currentUserRole,
                        isOwner: result.isOwner,
                    }];
        }
    });
}); }), 
// 更新成员权限
updateMemberPermission, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    memberId: zod_1.z.number(),
    permissionType: zod_1.z.enum(['view', 'add', 'edit', 'delete', 'backup']),
    permissionValue: zod_1.z.enum(['all', 'own', 'none', 'allow']),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.updateMemberPermission(input.ledgerId, input.memberId, input.permissionType, input.permissionValue, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 更新默认成员权限
updateDefaultPermission, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    permissionType: zod_1.z.enum(['view', 'add', 'edit', 'delete', 'backup']),
    permissionValue: zod_1.z.enum(['all', 'own', 'none', 'allow']),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.updateDefaultPermission(input.ledgerId, input.permissionType, input.permissionValue, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取AI雇员列表
getAIEmployees, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getAIEmployees(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 开关AI分身（开启则自动创建，关闭则删除）
toggleAIEmployee, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    enabled: zod_1.z.boolean(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.toggleAIEmployee(input.ledgerId, input.enabled, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 保留旧接口兼容
addAIEmployee, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    avatarType: zod_1.z.string(),
    nickname: zod_1.z.string(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.addAIEmployee(input.ledgerId, input.avatarType, input.nickname, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 删除AI雇员 (暂时注释)
/*
removeAIEmployee: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
    employeeId: z.number(),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbLedger.removeAIEmployee(
      input.ledgerId,
      input.employeeId,
      ctx.user.id
    );
  }),

// AI分身：解析任务（调用DeepSeek API）
parseAIEmployeeTask: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
    taskDescription: z.string().min(1).max(500),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.parseTaskWithAI(
      input.ledgerId,
      ctx.user.id,
      input.taskDescription
    );
  }),

// AI分身：确认并创建任务
createAIEmployeeTask: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
    taskDescription: z.string(),
    parsedPlan: z.any(),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.createAIEmployeeTask(
      input.ledgerId,
      ctx.user.id,
      input.taskDescription,
      input.parsedPlan
    );
  }),

// AI分身：获取任务列表
getAIEmployeeTasks: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
  })
  .query(async ({ ctx, input }) => {
    return await dbAIEmployee.getAIEmployeeTasks(
      input.ledgerId,
      ctx.user.id
    );
  }),

// AI分身：更新任务状态
updateAIEmployeeTaskStatus: protectedProcedure
  .input(z.object({
    taskId: z.number(),
    status: z.enum(["running", "paused", "stopped"]),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.updateTaskStatus(
      input.taskId,
      ctx.user.id,
      input.status
    );
  }),

// AI分身：获取任务执行日志
getAIEmployeeTaskLogs: protectedProcedure
  .input(z.object({
    taskId: z.number(),
  })
  .query(async ({ ctx, input }) => {
    return await dbAIEmployee.getTaskLogs(
      input.taskId,
      ctx.user.id
    );
  }),

// AI分身：多轮对话（新版）
chatWithAIEmployee: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
    message: z.string().min(1).max(1000),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.chatWithAIEmployee(
      input.ledgerId,
      ctx.user.id,
      input.message
    );
  }),
// AI分身：获取对话历史
getAIConversationHistory: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
  })
  .query(async ({ ctx, input }) => {
    return await dbAIEmployee.getAIConversationHistory(
      input.ledgerId,
      ctx.user.id
    );
  }),
// AI分身：清空对话历史
clearAIConversationHistory: protectedProcedure
  .input(z.object({
    ledgerId: z.number(),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.clearAIConversationHistory(
      input.ledgerId,
      ctx.user.id
    );
  }),

updateAIEmployeeTask: protectedProcedure
  .input(z.object({
    taskId: z.number(),
    updates: z.object({
      amount: z.number().optional(),
      schedule_type: z.string().optional(),
      description: z.string().optional(),
      effective_date: z.string().optional(),
    }),
  })
  .mutation(async ({ ctx, input }) => {
    return await dbAIEmployee.updateAIEmployeeTask(
      input.taskId,
      ctx.userId,
      input.updates
    );
  }),
*/
// 获取报表数据
getReport, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    year: zod_1.z.number(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerReport(input.ledgerId, ctx.user.id, input.year, input.startDate, input.endDate)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取日历数据（指定月份的每日收支统计）
getCalendarData, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    year: zod_1.z.number(),
    month: zod_1.z.number(),
    memberIds: zod_1.z.array(zod_1.z.number()).optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getCalendarData(input.ledgerId, ctx.user.id, input.year, input.month, input.memberIds)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取指定日期的记账记录
getDayRecords, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    date: zod_1.z.string(),
    memberIds: zod_1.z.array(zod_1.z.number()).optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getDayRecords(input.ledgerId, ctx.user.id, input.date, input.memberIds)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 添加记账记录
addTransaction, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    type: zod_1.z.enum(['income', 'expense']),
    amount: zod_1.z.number().positive(),
    categoryId: zod_1.z.number(),
    subcategoryId: zod_1.z.number().optional(),
    description: zod_1.z.string().optional(),
    imageUrl: zod_1.z.string().optional(),
    transactionDate: zod_1.z.string(),
    images: zod_1.z.array(zod_1.z.string()).optional(),
    memberId: zod_1.z.number().optional(),
    accountId: zod_1.z.number().optional(),
    reimbursementStatus: zod_1.z.enum(['none', 'pending', 'completed']).optional(),
    pendingType: zod_1.z.enum(['receivable', 'payable']).nullable().optional(),
    pendingIncludeStats: zod_1.z.number().min(0).max(1).optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.addTransaction(__assign(__assign({}, input), { userId: ctx.user.id }))];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取记账记录列表（按日期分组）
getTransactions, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    type: zod_1.z.enum(['income', 'expense']).optional(),
    categoryId: zod_1.z.number().optional(),
    memberId: zod_1.z.number().optional(),
    amountMin: zod_1.z.string().optional(),
    amountMax: zod_1.z.string().optional(),
    limit: zod_1.z.number().optional(),
    offset: zod_1.z.number().optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ledgerId, options;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                ledgerId = input.ledgerId, options = __rest(input, ["ledgerId"]);
                return [4 /*yield*/, dbLedger.getTransactionsList(ledgerId, ctx.user.id, options)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 删除记账记录
deleteTransaction, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.deleteTransaction(input.recordId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取已删除的账目记录（30天内）
getDeletedTransactions, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getDeletedTransactions(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 恢复已删除的账目记录
restoreTransaction, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.restoreTransaction(input.recordId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 清理超过30天的已删除记录
purgeExpiredDeletedRecords, trpc_1.protectedProcedure
    .mutation(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, dbLedger.purgeExpiredDeletedRecords()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); }), 
// 获取账目修改记录日志
getRecordLogs, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getRecordLogs(input.recordId, input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账目修改记录条数
getRecordLogCount, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var count;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getRecordLogCount(input.recordId, input.ledgerId, ctx.user.id)];
            case 1:
                count = _c.sent();
                return [2 /*return*/, { count: count }];
        }
    });
}); }), 
// 更新记账记录
updateTransaction, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
    type: zod_1.z.enum(['income', 'expense']).optional(),
    amount: zod_1.z.number().positive().optional(),
    categoryId: zod_1.z.number().optional(),
    subcategoryId: zod_1.z.number().optional(),
    description: zod_1.z.string().optional(),
    transactionDate: zod_1.z.string().optional(),
    images: zod_1.z.array(zod_1.z.string()).optional(),
    memberId: zod_1.z.number().optional(),
    accountId: zod_1.z.number().optional(),
    reimbursementStatus: zod_1.z.enum(['none', 'pending', 'completed']).optional(),
    pendingType: zod_1.z.enum(['receivable', 'payable']).nullable().optional(),
    pendingIncludeStats: zod_1.z.number().min(0).max(1).nullable().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var recordId, data;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                recordId = input.recordId, data = __rest(input, ["recordId"]);
                return [4 /*yield*/, dbLedger.updateTransaction(recordId, ctx.user.id, data)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// ==================== 审批相关 ====================
// 获取审批规则
getApprovalRules, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getApprovalRules(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 保存审批规则
saveApprovalRules, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    rules: zod_1.z.array(zod_1.z.object({
        recorderId: zod_1.z.number().nullable(),
        approverType: zod_1.z.enum(['all', 'specific']),
        approverIds: zod_1.z.array(zod_1.z.number()).optional(),
    }))
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.saveApprovalRules(input.ledgerId, ctx.user.id, input.rules)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 删除审批规则
deleteApprovalRule, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ruleId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.deleteApprovalRule(input.ruleId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 审批记账
approveTransaction, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    transactionId: zod_1.z.number(),
    action: zod_1.z.enum(['approved', 'rejected']),
    comment: zod_1.z.string().optional(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.approveTransaction(input.transactionId, ctx.user.id, input.action, input.comment)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取单条记账详情
getTransactionDetail, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    transactionId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getTransactionDetail(input.ledgerId, input.transactionId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取待审批的记账列表
getPendingApprovals, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getPendingApprovals(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 导出账目为Excel
exportToExcel, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var hasBackupPermission, transactions, workbook, worksheet_1, rowCount_1, buffer, base64, error_10;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 4, , 5]);
                console.log('[exportToExcel] 开始导出:', { ledgerId: input.ledgerId, userId: ctx.user.id });
                return [4 /*yield*/, dbLedger.checkBackupPermission(input.ledgerId, ctx.user.id)];
            case 1:
                hasBackupPermission = _c.sent();
                if (!hasBackupPermission) {
                    throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '您没有备份该账本的权限' });
                }
                return [4 /*yield*/, dbLedger.getTransactionsList(input.ledgerId, ctx.user.id, {
                        startDate: input.startDate,
                        endDate: input.endDate,
                    })];
            case 2:
                transactions = _c.sent();
                console.log('[exportToExcel] 获取到账目数据:', { count: transactions.length });
                workbook = new exceljs_1.default.Workbook();
                worksheet_1 = workbook.addWorksheet('账目明细');
                // 设置列
                worksheet_1.columns = [
                    { header: '日期', key: 'date', width: 15 },
                    { header: '类型', key: 'type', width: 10 },
                    { header: '分类', key: 'category', width: 15 },
                    { header: '金额', key: 'amount', width: 15 },
                    { header: '备注', key: 'description', width: 30 },
                    { header: '创建人', key: 'creator', width: 15 },
                ];
                rowCount_1 = 0;
                transactions.forEach(function (dayGroup) {
                    dayGroup.records.forEach(function (record) {
                        var _a;
                        worksheet_1.addRow({
                            date: dayGroup.date,
                            type: record.type === 'income' ? '收入' : '支出',
                            category: record.category || '未分类',
                            amount: record.amount,
                            description: record.description || '',
                            creator: ((_a = record.member) === null || _a === void 0 ? void 0 : _a.username) || '',
                        });
                        rowCount_1++;
                    });
                });
                console.log('[exportToExcel] 添加了', rowCount_1, '条记录');
                return [4 /*yield*/, workbook.xlsx.writeBuffer()];
            case 3:
                buffer = _c.sent();
                base64 = buffer.toString('base64');
                console.log('[exportToExcel] 生成成功, base64长度:', base64.length);
                return [2 /*return*/, {
                        data: base64,
                        filename: "\u8D26\u76EE\u5BFC\u51FA_".concat(new Date().toLocaleDateString('zh-CN').replace(/\//g, '-'), ".xlsx"),
                    }];
            case 4:
                error_10 = _c.sent();
                console.error('[exportToExcel] 错误:', error_10);
                throw new server_1.TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: "\u5BFC\u51FA\u5931\u8D25: ".concat(error_10.message),
                });
            case 5: return [2 /*return*/];
        }
    });
}); }), 
// 设置成员角色（owner设置admin）重写版：使用targetUserId
setMemberRole, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    targetUserId: zod_1.z.number(),
    role: zod_1.z.enum(['admin', 'member']),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.setMemberRole(input.ledgerId, ctx.user.id, input.targetUserId, input.role)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 管理报销（管理员操作）
manageReimbursement, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
    status: zod_1.z.enum(['none', 'pending', 'completed']),
    notes: zod_1.z.string().optional(),
    voucherImage: zod_1.z.string().optional(), // base64
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.manageReimbursement(input.recordId, ctx.user.id, input.status, input.notes, input.voucherImage)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取报销历史
getReimbursementHistory, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    recordId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getReimbursementHistory(input.recordId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取报表数据统计
getReimbursementStats, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getReimbursementStats(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本所有图片
getImages, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerImages(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本导出统计信息
getExportStats, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, dbLedger.getLedgerExportStats(input.ledgerId, ctx.user.id)];
            case 1: return [2 /*return*/, _c.sent()];
        }
    });
}); }), 
// 获取账本备份设置
getBackupSettings, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var db_instance, ledgerBackupSettings, _c, eq, and, settings;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db_instance = _d.sent();
                if (!db_instance)
                    throw new Error("Database not available");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
            case 2:
                ledgerBackupSettings = (_d.sent()).ledgerBackupSettings;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
            case 3:
                _c = _d.sent(), eq = _c.eq, and = _c.and;
                return [4 /*yield*/, db_instance
                        .select()
                        .from(ledgerBackupSettings)
                        .where(and(eq(ledgerBackupSettings.ledgerId, input.ledgerId), eq(ledgerBackupSettings.userId, ctx.user.id)))
                        .limit(1)];
            case 4:
                settings = _d.sent();
                return [2 /*return*/, settings[0] || null];
        }
    });
}); }), 
// 保存账本备份设置
saveBackupSettings, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    frequency: zod_1.z.enum(['weekly', 'monthly', 'quarterly']),
    enabled: zod_1.z.boolean(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var db_instance, ledgerBackupSettings, _c, eq, and, now, nextBackupAt, existing, pad, formatMySQLDate, nextBackupStr;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db_instance = _d.sent();
                if (!db_instance)
                    throw new Error("Database not available");
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
            case 2:
                ledgerBackupSettings = (_d.sent()).ledgerBackupSettings;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
            case 3:
                _c = _d.sent(), eq = _c.eq, and = _c.and;
                now = new Date();
                nextBackupAt = new Date(now);
                if (input.frequency === 'weekly') {
                    nextBackupAt.setDate(now.getDate() + 7);
                }
                else if (input.frequency === 'monthly') {
                    nextBackupAt.setMonth(now.getMonth() + 1);
                }
                else if (input.frequency === 'quarterly') {
                    nextBackupAt.setMonth(now.getMonth() + 3);
                }
                return [4 /*yield*/, db_instance
                        .select()
                        .from(ledgerBackupSettings)
                        .where(and(eq(ledgerBackupSettings.ledgerId, input.ledgerId), eq(ledgerBackupSettings.userId, ctx.user.id)))
                        .limit(1)];
            case 4:
                existing = _d.sent();
                pad = function (n) { return String(n).padStart(2, '0'); };
                formatMySQLDate = function (d) { return "".concat(d.getFullYear(), "-").concat(pad(d.getMonth() + 1), "-").concat(pad(d.getDate()), " ").concat(pad(d.getHours()), ":").concat(pad(d.getMinutes()), ":").concat(pad(d.getSeconds())); };
                nextBackupStr = formatMySQLDate(nextBackupAt);
                if (!(existing.length > 0)) return [3 /*break*/, 6];
                // 更新现有设置
                return [4 /*yield*/, db_instance
                        .update(ledgerBackupSettings)
                        .set({
                        frequency: input.frequency,
                        enabled: input.enabled ? 1 : 0,
                        nextBackupAt: nextBackupStr,
                    })];
            case 5:
                // 更新现有设置
                _d.sent(),
                        .where(eq(ledgerBackupSettings.id, existing[0].id));
                return [3 /*break*/, 8];
            case 6: 
            // 创建新设置
            return [4 /*yield*/, db_instance.insert(ledgerBackupSettings).values({
                    ledgerId: input.ledgerId,
                    userId: ctx.user.id,
                    frequency: input.frequency,
                    enabled: input.enabled ? 1 : 0,
                    lastBackupAt: null,
                    nextBackupAt: nextBackupStr,
                })];
            case 7:
                // 创建新设置
                _d.sent();
                _d.label = 8;
            case 8: return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 发送测试备份邮件
sendTestBackup, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var hasBackupPermission, executeBackup, db_instance, ledgerBackupSettings, _c, eq_2, and_1, sql_1, now, pad, nowStr;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, dbLedger.checkBackupPermission(input.ledgerId, ctx.user.id)];
            case 1:
                hasBackupPermission = _d.sent();
                if (!hasBackupPermission) {
                    throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '您没有备份该账本的权限' });
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require('./backup-service'); })];
            case 2:
                executeBackup = (_d.sent()).executeBackup;
                return [4 /*yield*/, executeBackup(input.ledgerId, ctx.user.id)];
            case 3:
                _d.sent();
                return [4 /*yield*/, (0, db_1.getDb)()];
            case 4:
                db_instance = _d.sent();
                if (!db_instance) return [3 /*break*/, 8];
                return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
            case 5:
                ledgerBackupSettings = (_d.sent()).ledgerBackupSettings;
                return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
            case 6:
                _c = _d.sent(), eq_2 = _c.eq, and_1 = _c.and, sql_1 = _c.sql;
                now = new Date();
                pad = function (n) { return String(n).padStart(2, '0'); };
                nowStr = "".concat(now.getFullYear(), "-").concat(pad(now.getMonth() + 1), "-").concat(pad(now.getDate()), " ").concat(pad(now.getHours()), ":").concat(pad(now.getMinutes()), ":").concat(pad(now.getSeconds()));
                return [4 /*yield*/, db_instance
                        .update(ledgerBackupSettings)
                        .set({
                        backupCount: sql_1(templateObject_5 || (templateObject_5 = __makeTemplateObject(["backup_count + 1"], ["backup_count + 1"]))),
                        lastBackupAt: nowStr,
                    })];
            case 7:
                _d.sent(),
                        .where(and_1(eq_2(ledgerBackupSettings.ledgerId, input.ledgerId), eq_2(ledgerBackupSettings.userId, ctx.user.id)));
                _d.label = 8;
            case 8: return [2 /*return*/, { success: true }];
        }
    });
}); }), 
// 解析导入数据
parseImportData, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    data: zod_1.z.string(),
    ledgerId: zod_1.z.number(),
})
    .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var db_instance, member, lines, records, firstLine, delimiter, i, line, fields, date, amount, type, category, description, j, field, amountMatch, parsedAmount, now;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db_instance = _c.sent();
                if (!db_instance)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
                return [4 /*yield*/, db_instance
                        .select()
                        .from(ledgerMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerMembers.ledgerId, input.ledgerId), (0, drizzle_orm_1.eq)(ledgerMembers.userId, ctx.user.id)))
                        .limit(1)];
            case 2:
                member = _c.sent();
                if (member.length === 0) {
                    throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
                }
                lines = input.data.split('\n').filter(function (line) { return line.trim(); });
                records = [];
                firstLine = lines[0];
                delimiter = firstLine.includes('\t') ? '\t' : ',';
                // 解析每一行
                for (i = 0; i < lines.length; i++) {
                    line = lines[i].trim();
                    if (!line)
                        continue;
                    // 跳过表头行（包含“交易时间”、“金额”等关键字）
                    if (i === 0 && (line.includes('交易时间') || line.includes('时间') || line.includes('金额') || line.includes('类型'))) {
                        continue;
                    }
                    fields = line.split(delimiter).map(function (f) { return f.trim().replace(/^"|"$/g, ''); });
                    // 至少需要有日期和金额
                    if (fields.length < 2)
                        continue;
                    date = '';
                    amount = 0;
                    type = 'expense';
                    category = '其他';
                    description = '';
                    // 微信账单格式：交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
                    // 支付宝账单格式：交易时间,交易分类,交易对方,商品说明,金额,收/支,交易状态
                    for (j = 0; j < fields.length; j++) {
                        field = fields[j];
                        // 识别日期（包含 - 或 / 或年月日）
                        if (!date && (field.match(/\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/) || field.match(/\d{4}-\d{2}-\d{2}/))) {
                            date = field.replace(/年|月/g, '-').replace(/日/g, '').split(' ')[0];
                        }
                        amountMatch = field.match(/([+-]?\d+\.?\d*)/);
                        if (amountMatch && parseFloat(amountMatch[1]) > 0) {
                            parsedAmount = parseFloat(amountMatch[1]);
                            if (parsedAmount > amount) {
                                amount = parsedAmount;
                                // 根据正负号判断收支
                                if (field.startsWith('-') || field.startsWith('－')) {
                                    type = 'expense';
                                }
                                else if (field.startsWith('+') || field.startsWith('＋')) {
                                    type = 'income';
                                }
                            }
                        }
                        // 识别收支类型
                        if (field.includes('支出') || field.includes('付款') || field === '支') {
                            type = 'expense';
                        }
                        else if (field.includes('收入') || field.includes('收款') || field === '收') {
                            type = 'income';
                        }
                        // 识别分类
                        if (field.includes('餐饮') || field.includes('美食')) {
                            category = '餐饮';
                        }
                        else if (field.includes('购物') || field.includes('超市')) {
                            category = '购物';
                        }
                        else if (field.includes('交通') || field.includes('打车') || field.includes('公交')) {
                            category = '交通';
                        }
                        else if (field.includes('娱乐') || field.includes('电影')) {
                            category = '娱乐';
                        }
                        else if (field.includes('医疗') || field.includes('药店')) {
                            category = '医疗';
                        }
                        // 收集备注信息
                        if (j > 2 && field.length > 0 && field.length < 50 && !field.match(/\d{10,}/)) {
                            if (!description) {
                                description = field;
                            }
                        }
                    }
                    // 如果没有识别到日期，使用今天
                    if (!date) {
                        now = new Date();
                        date = "".concat(now.getFullYear(), "-").concat(String(now.getMonth() + 1).padStart(2, '0'), "-").concat(String(now.getDate()).padStart(2, '0'));
                    }
                    // 如果识别到有效数据，添加到结果
                    if (amount > 0) {
                        records.push({
                            date: date,
                            type: type,
                            amount: amount,
                            category: category,
                            description: description || '导入记录',
                            originalData: line,
                        });
                    }
                }
                return [2 /*return*/, { records: records }];
        }
    });
}); }), 
// 导入记录
importRecords, trpc_1.protectedProcedure
    .input(zod_1.z.object({
    ledgerId: zod_1.z.number(),
    records: zod_1.z.array(zod_1.z.object({
        date: zod_1.z.string(),
        type: zod_1.z.enum(['income', 'expense']),
        amount: zod_1.z.number(),
        category: zod_1.z.string(),
        description: zod_1.z.string(),
        originalData: zod_1.z.string().optional(),
    }))
})
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var db_instance, member, successCount, _i, _c, record, categoryId, existingCategory, result, error_11;
    var ctx = _b.ctx, input = _b.input;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDb)()];
            case 1:
                db_instance = _d.sent();
                if (!db_instance)
                    throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
                return [4 /*yield*/, db_instance
                        .select()
                        .from(ledgerMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerMembers.ledgerId, input.ledgerId), (0, drizzle_orm_1.eq)(ledgerMembers.userId, ctx.user.id)))
                        .limit(1)];
            case 2:
                member = _d.sent();
                if (member.length === 0) {
                    throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
                }
                successCount = 0;
                _i = 0, _c = input.records;
                _d.label = 3;
            case 3:
                if (!(_i < _c.length)) return [3 /*break*/, 12];
                record = _c[_i];
                _d.label = 4;
            case 4:
                _d.trys.push([4, 10, , 11]);
                categoryId = null;
                return [4 /*yield*/, db_instance
                        .select()
                        .from(ledgerCategories)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ledgerCategories.ledgerId, input.ledgerId), (0, drizzle_orm_1.eq)(ledgerCategories.name, record.category)))
                        .limit(1)];
            case 5:
                existingCategory = _d.sent();
                if (!(existingCategory.length > 0)) return [3 /*break*/, 6];
                categoryId = existingCategory[0].id;
                return [3 /*break*/, 8];
            case 6: return [4 /*yield*/, db_instance
                    .insert(ledgerCategories)
                    .values({
                    ledgerId: input.ledgerId,
                    name: record.category,
                    type: record.type,
                    icon: '💰',
                    color: record.type === 'income' ? '#4CAF50' : '#D32F2F',
                })];
            case 7:
                result = _d.sent();
                categoryId = result[0].insertId;
                _d.label = 8;
            case 8: 
            // 插入账目记录
            return [4 /*yield*/, db_instance
                    .insert(schema_1.ledgerRecords)
                    .values({
                    ledgerId: input.ledgerId,
                    userId: ctx.user.id,
                    categoryId: categoryId,
                    amount: record.amount,
                    type: record.type,
                    date: record.date,
                    description: record.description,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })];
            case 9:
                // 插入账目记录
                _d.sent();
                successCount++;
                return [3 /*break*/, 11];
            case 10:
                error_11 = _d.sent();
                console.error('导入记录失败:', error_11);
                return [3 /*break*/, 11];
            case 11:
                _i++;
                return [3 /*break*/, 3];
            case 12: return [2 /*return*/, { count: successCount }];
        }
    });
}); })), 
// 银行列表管理
banks, (0, trpc_1.router)({
    // 搜索银行
    search: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        query: zod_1.z.string(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbBanks;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-banks'); })];
                case 1:
                    dbBanks = _c.sent();
                    return [4 /*yield*/, dbBanks.searchBanks(input.query)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 更新银行使用次数（仅预置银行）
    updateUsage, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbBanks;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-banks'); })];
                case 1:
                    dbBanks = _c.sent();
                    return [4 /*yield*/, dbBanks.updateBankUsage(input.name)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取所有银行
    list, trpc_1.protectedProcedure
        .query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var dbBanks;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-banks'); })];
                case 1:
                    dbBanks = _a.sent();
                    return [4 /*yield*/, dbBanks.getAllBanks()];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    }); })))
}), 
// AI智能助手
aiAssistant, (0, trpc_1.router)({
    // AI查询
    query: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        query: zod_1.z.string(),
        sessionId: zod_1.z.number().optional(),
        history: zod_1.z.array(zod_1.z.object({
            role: zod_1.z.string(),
            content: zod_1.z.string(),
        }).optional())
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbAI, result, error_12;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-assistant'); })];
                case 1:
                    dbAI = _c.sent();
                    return [4 /*yield*/, dbAI.queryWithAI(ctx.user.id, input.query, input.sessionId, input.history)];
                case 2:
                    result = _c.sent();
                    return [2 /*return*/, {
                            answer: result.result,
                            tokensUsed: result.tokensUsed,
                            cost: result.cost,
                            balanceAfter: result.balanceAfter,
                            sessionId: result.sessionId,
                        }];
                case 3:
                    error_12 = _c.sent();
                    console.error('[Router] AI query error:', error_12.message);
                    throw error_12;
                case 4: return [2 /*return*/];
            }
        });
    }); }), 
    // 获取AI助手的提示词配置
    getPrompts, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbAI;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-assistant'); })];
                case 1:
                    dbAI = _c.sent();
                    return [4 /*yield*/, dbAI.getAssistantPrompts()];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 保存AI助手的提示词配置
    savePrompts, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        role: zod_1.z.string(),
        rules: zod_1.z.string(),
        format: zod_1.z.string(),
        examples: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbAI;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-assistant'); })];
                case 1:
                    dbAI = _c.sent();
                    return [4 /*yield*/, dbAI.saveAssistantPrompts(input)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 获取AI工具列表
    getTools, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbAI;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-assistant'); })];
                case 1:
                    dbAI = _c.sent();
                    return [4 /*yield*/, dbAI.getToolsList()];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取API密钥配置状态
    getApiStatus, trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbAI;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-assistant'); })];
                case 1:
                    dbAI = _c.sent();
                    return [4 /*yield*/, dbAI.getApiKeysStatus()];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取用户的会话列表
    getSessions, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        page: zod_1.z.number().default(1),
        limit: zod_1.z.number().default(20),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbSessions;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-sessions'); })];
                case 1:
                    dbSessions = _c.sent();
                    return [4 /*yield*/, dbSessions.getUserSessions(ctx.user.id, input.page, input.limit)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 获取会话详情（包含消息历史）
    getSessionDetail, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        sessionId: zod_1.z.number(),
    })
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbSessions;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-sessions'); })];
                case 1:
                    dbSessions = _c.sent();
                    return [4 /*yield*/, dbSessions.getSessionDetail(input.sessionId, ctx.user.id)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 创建新会话
    createSession, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        title: zod_1.z.string().default('新对话'),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbSessions, sessionId;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-sessions'); })];
                case 1:
                    dbSessions = _c.sent();
                    return [4 /*yield*/, dbSessions.createSession(ctx.user.id, input.title)];
                case 2:
                    sessionId = _c.sent();
                    return [2 /*return*/, { sessionId: sessionId }];
            }
        });
    }); }), 
    // 更新会话标题
    updateSessionTitle, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        sessionId: zod_1.z.number(),
        title: zod_1.z.string(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbSessions;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-sessions'); })];
                case 1:
                    dbSessions = _c.sent();
                    return [4 /*yield*/, dbSessions.updateSessionTitle(input.sessionId, ctx.user.id, input.title)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }), 
    // 删除会话
    deleteSession, trpc_1.protectedProcedure
        .input(zod_1.z.object({
        sessionId: zod_1.z.number(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbSessions;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-ai-sessions'); })];
                case 1:
                    dbSessions = _c.sent();
                    return [4 /*yield*/, dbSessions.deleteSession(input.sessionId, ctx.user.id)];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))))))))
}), 
// 邀请系统
invite, invite_api_1.inviteRouter, 
// 邀请功能权限管理 (管理员)
invitePermission, invite_permission_api_1.invitePermissionRouter, 
// 海报收藏管理
posterFavorites, poster_favorites_router_1.posterFavoritesRouter, 
// 脉动节点合作平台 - 工作群管理
workGroups, work_groups_api_1.workGroupsRouter, 
// ==================== 管理员功能 ====================
adminFeature, exports.adminFeatureRouter, 
// ==================== 数据安全（加密管理） ====================
encryption, (0, trpc_1.router)({
    // 获取加密配置列表
    getConfig: trpc_1.protectedProcedure.query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbEncryption, configs, stats, keyConfigured;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-encryption'); })];
                case 1:
                    dbEncryption = _c.sent();
                    return [4 /*yield*/, dbEncryption.getEncryptionConfigList()];
                case 2:
                    configs = _c.sent();
                    return [4 /*yield*/, dbEncryption.getEncryptionStats()];
                case 3:
                    stats = _c.sent();
                    keyConfigured = dbEncryption.isEncryptionKeyConfigured();
                    return [2 /*return*/, { configs: configs, stats: stats, keyConfigured: keyConfigured }];
            }
        });
    }); }),
    // 切换字段加密开关
    toggleField: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        configId: zod_1.z.number(),
        enable: zod_1.z.boolean(),
    })
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbEncryption;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-encryption'); })];
                case 1:
                    dbEncryption = _c.sent();
                    return [4 /*yield*/, dbEncryption.toggleFieldEncryption(input.configId, input.enable)];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }), 
    // 初始化加密配置表
    init, trpc_1.protectedProcedure.mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var dbEncryption;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db-encryption'); })];
                case 1:
                    dbEncryption = _c.sent();
                    return [4 /*yield*/, dbEncryption.initEncryptionConfig()];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }))
}))))))))))))))))))))))))))))))))))))))))))))))))))))))))))));
// 管理员容器定义管理（独立 router，仅超级管理员可用）
exports.adminFeatureRouter = (0, trpc_1.router)({
    // 获取所有容器定义
    list: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            if (ctx.user.role !== 'super_admin') {
                throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
            }
            return [2 /*return*/, db.getAllFeatureDefinitions()];
        });
    }); }),
    // 创建或更新容器定义
    upsert: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        featureId: zod_1.z.number(),
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        isActive: zod_1.z.boolean(),
        defaultPosition: zod_1.z.number(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, db.upsertFeatureDefinition(__assign(__assign({}, input), { createdBy: ctx.user.id }))];
                case 1:
                    _c.sent(), ;
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // 执行 pending_type 数据库迁移
    migratePendingType: trpc_1.protectedProcedure
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var migratePendingType, db, result;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== 'super_admin') {
                        throw new server_1.TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./migrate-production'); })];
                case 1:
                    migratePendingType = (_c.sent()).migratePendingType;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./db'); }).then(function (m) { return m.getDb(); })];
                case 2:
                    db = _c.sent();
                    if (!db) {
                        throw new server_1.TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
                    }
                    return [4 /*yield*/, migratePendingType(db)];
                case 3:
                    result = _c.sent();
                    if (!result.success) {
                        throw new server_1.TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: "\u8FC1\u79FB\u5931\u8D25: ".concat(result.error)
                        });
                    }
                    return [2 /*return*/, result];
            }
        });
    }); }),
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5;
