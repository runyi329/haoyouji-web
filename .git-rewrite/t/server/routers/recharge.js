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
exports.fixScannerHeartbeat = exports.rechargeRouter = void 0;
var trpc_1 = require("./trpc");
var zod_1 = require("zod");
var dbRecharge = require("../db-recharge");
var db_1 = require("../db");
var schema = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
exports.rechargeRouter = (0, trpc_1.router)({
    // 创建充值订单
    createOrder: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        amount: zod_1.z.number().min(1).max(100000),
        network: zod_1.z.enum(["TRC20", "ERC20", "BEP20", "APTOS", "SOLANA"]).default("TRC20"),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.createRechargeOrder(ctx.user.id, input.amount, input.network)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 用户提交转账确认
    submitTransfer: trpc_1.protectedProcedure
        .input(zod_1.z.object({ orderNo: zod_1.z.string() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.submitTransferConfirmation(input.orderNo, ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 查询充值订单
    getOrder: trpc_1.protectedProcedure
        .input(zod_1.z.object({ orderNo: zod_1.z.string() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.getRechargeOrder(input.orderNo)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取用户充值订单列表
    getMyOrders: trpc_1.protectedProcedure
        .input(zod_1.z.object({ limit: zod_1.z.number().optional() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.getUserRechargeOrders(ctx.user.id, input.limit)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取用户余额
    getBalance: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.getUserBalance(ctx.user.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取余额变动记录
    getBalanceHistory: trpc_1.protectedProcedure
        .input(zod_1.z.object({ limit: zod_1.z.number().optional() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.getUserBalanceHistory(ctx.user.id, input.limit)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 用户申请提现
    requestWithdraw: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        amount: zod_1.z.number().min(10),
        paymentAccountId: zod_1.z.number(),
        remark: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.requestWithdraw(ctx.user.id, input.amount, input.paymentAccountId, input.remark)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取用户提现记录
    getMyWithdrawHistory: trpc_1.protectedProcedure
        .input(zod_1.z.object({ limit: zod_1.z.number().optional() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbRecharge.getUserWithdrawHistory(ctx.user.id, input.limit)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // === 管理员功能 ===
    // 获取所有待处理订单
    adminGetPendingOrders: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.getAllPendingOrders()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取所有充值订单
    adminGetAllOrders: trpc_1.protectedProcedure
        .input(zod_1.z.object({ limit: zod_1.z.number().optional() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.getAllOrders(input.limit)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取未匹配交易列表
    adminGetUnmatchedTransactions: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.getUnmatchedTransactions()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员手动确认充值
    adminConfirmRecharge: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        orderId: zod_1.z.number(),
        txnHash: zod_1.z.string(),
        actualAmount: zod_1.z.number().min(0.01),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.adminConfirmRecharge(ctx.user.id, input.orderId, input.txnHash, input.actualAmount)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员审核提现
    adminDirectRecharge: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        userId: zod_1.z.number(),
        amount: zod_1.z.number().min(0.01),
        description: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.adminDirectRecharge(ctx.user.id, input.userId, input.amount, input.description)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 获取系统统计信息
    adminGetSystemStats: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.getSystemStats()];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员获取扫描器心跳状态
    adminGetScannerHeartbeat: trpc_1.protectedProcedure
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var db, heartbeat;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema.scannerHeartbeat)
                            .where((0, drizzle_orm_1.eq)(schema.scannerHeartbeat.scannerType, "blockchain"))
                            .limit(1)];
                case 2:
                    heartbeat = _c.sent();
                    if (heartbeat.length === 0) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, heartbeat[0]];
            }
        });
    }); }),
    // 管理员添加收款地址
    adminAddWalletAddress: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        address: zod_1.z.string().min(1),
        network: zod_1.z.string().min(1),
        label: zod_1.z.string().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.addWalletAddress(input.address, input.network, input.label)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员更新收款地址
    adminUpdateWalletAddress: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        address: zod_1.z.string().optional(),
        network: zod_1.z.string().optional(),
        label: zod_1.z.string().optional(),
        enabled: zod_1.z.number().min(0).max(1).optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, data;
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    id = input.id, data = __rest(input, ["id"]);
                    return [4 /*yield*/, dbRecharge.updateWalletAddress(id, data)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员删除收款地址
    adminDeleteWalletAddress: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var ctx = _b.ctx, input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    return [4 /*yield*/, dbRecharge.deleteWalletAddress(input.id)];
                case 1: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    // 管理员一键修复扫描器
    adminFixScanner: trpc_1.protectedProcedure
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var results, db, error_1, createTableSQL, enabledAddresses, existingHeartbeat, error_2;
        var ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
                        throw new Error("无权限");
                    }
                    results = [];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 13, , 14]);
                    // 1. 检查scanner_heartbeat表是否存在
                    results.push("步骤1: 检查scanner_heartbeat表...");
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 7]);
                    return [4 /*yield*/, db.select().from(schema.scannerHeartbeat).limit(1)];
                case 4:
                    _c.sent();
                    results.push("✅ scanner_heartbeat表存在");
                    return [3 /*break*/, 7];
                case 5:
                    error_1 = _c.sent();
                    results.push("⚠️ scanner_heartbeat表不存在，尝试创建...");
                    createTableSQL = "\n            CREATE TABLE IF NOT EXISTS scanner_heartbeat (\n              id INT AUTO_INCREMENT PRIMARY KEY,\n              scanner_type VARCHAR(50) NOT NULL,\n              last_scan_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n              scan_count INT DEFAULT 0,\n              success_count INT DEFAULT 0,\n              error_count INT DEFAULT 0,\n              last_error TEXT,\n              scanned_addresses INT DEFAULT 0,\n              found_transactions INT DEFAULT 0,\n              matched_orders INT DEFAULT 0,\n              unmatched_transactions INT DEFAULT 0,\n              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n              UNIQUE KEY unique_scanner_type (scanner_type)\n            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n          ";
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", ""], ["", ""])), createTableSQL))];
                case 6:
                    _c.sent();
                    results.push("✅ scanner_heartbeat表创建成功");
                    return [3 /*break*/, 7];
                case 7:
                    // 2. 检查用户是否已启用收款地址
                    results.push("步骤2: 检查用户是否已启用收款地址...");
                    return [4 /*yield*/, db.query.walletAddresses.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.walletAddresses.userId, ctx.user.id), (0, drizzle_orm_1.eq)(schema.walletAddresses.enabled, true)),
                        })];
                case 8:
                    enabledAddresses = _c.sent();
                    if (enabledAddresses.length === 0) {
                        return [2 /*return*/, {
                                success: false,
                                message: "没有启用的收款地址",
                                logs: results,
                            }];
                    }
                    else {
                        results.push("\u2705 \u627E\u5230 ".concat(enabledAddresses.length, " \u4E2A\u542F\u7528\u7684\u6536\u6B3E\u5730\u5740"));
                    }
                    // 3. 初始化心跳记录
                    results.push("步骤3: 初始化心跳记录...");
                    return [4 /*yield*/, db
                            .select()
                            .from(schema.scannerHeartbeat)
                            .where((0, drizzle_orm_1.eq)(schema.scannerHeartbeat.scannerType, "blockchain"))
                            .limit(1)];
                case 9:
                    existingHeartbeat = _c.sent();
                    if (!(existingHeartbeat.length === 0)) return [3 /*break*/, 11];
                    return [4 /*yield*/, db.insert(schema.scannerHeartbeat).values({
                            scannerType: "blockchain",
                            lastScanAt: new Date(),
                            scanCount: 0,
                            successCount: 0,
                            errorCount: 0,
                            scannedAddresses: 0,
                            foundTransactions: 0,
                            matchedOrders: 0,
                            unmatchedTransactions: 0,
                        })];
                case 10:
                    _c.sent();
                    results.push("✅ 区块链扫描器心跳记录初始化成功");
                    return [3 /*break*/, 12];
                case 11:
                    results.push("✅ 区块链扫描器心跳记录已存在，无需初始化");
                    _c.label = 12;
                case 12:
                    results.push("✅ 区块链扫描器修复完成");
                    return [2 /*return*/, {
                            success: true,
                            message: "区块链扫描器修复完成",
                            logs: results,
                        }];
                case 13:
                    error_2 = _c.sent();
                    results.push("\u274C \u4FEE\u590D\u5931\u8D25: ".concat(error_2.message));
                    return [2 /*return*/, {
                            success: false,
                            message: "区块链扫描器修复失败",
                            logs: results,
                        }];
                case 14: return [2 /*return*/];
            }
        });
    }); }),
});
// 区块链扫描器修复工具
exports.fixScannerHeartbeat = trpc_1.protectedProcedure
    .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var results, enabledAddresses, existingHeartbeat, error_3;
    var ctx = _b.ctx;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                results = [];
                _c.label = 1;
            case 1:
                _c.trys.push([1, 7, , 8]);
                results.push("开始修复区块链扫描器心跳记录...");
                // 1. 检查用户是否已启用收款地址
                results.push("步骤1: 检查用户是否已启用收款地址...");
                return [4 /*yield*/, db.query.walletAddresses.findMany({
                        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.walletAddresses.userId, ctx.user.id), (0, drizzle_orm_1.eq)(schema.walletAddresses.enabled, true)),
                    })];
            case 2:
                enabledAddresses = _c.sent();
                if (enabledAddresses.length === 0) {
                    return [2 /*return*/, {
                            success: false,
                            message: "没有启用的收款地址",
                            logs: results,
                        }];
                }
                else {
                    results.push("\u2705 \u627E\u5230 ".concat(enabledAddresses.length, " \u4E2A\u542F\u7528\u7684\u6536\u6B3E\u5730\u5740"));
                }
                // 3. 初始化心跳记录
                results.push("步骤3: 初始化心跳记录...");
                return [4 /*yield*/, db
                        .select()
                        .from(schema.scannerHeartbeat)
                        .where((0, drizzle_orm_1.eq)(schema.scannerHeartbeat.scannerType, "blockchain"))
                        .limit(1)];
            case 3:
                existingHeartbeat = _c.sent();
                if (!(existingHeartbeat.length === 0)) return [3 /*break*/, 5];
                return [4 /*yield*/, db.insert(schema.scannerHeartbeat).values({
                        scannerType: "blockchain",
                        lastScanAt: new Date(),
                        scanCount: 0,
                        successCount: 0,
                        errorCount: 0,
                        scannedAddresses: 0,
                        foundTransactions: 0,
                        matchedOrders: 0,
                        unmatchedTransactions: 0,
                    })];
            case 4:
                _c.sent();
                results.push("✅ 区块链扫描器心跳记录初始化成功");
                return [3 /*break*/, 6];
            case 5:
                results.push("✅ 区块链扫描器心跳记录已存在，无需初始化");
                _c.label = 6;
            case 6:
                results.push("✅ 区块链扫描器修复完成");
                return [2 /*return*/, {
                        success: true,
                        message: "区块链扫描器修复完成",
                        logs: results,
                    }];
            case 7:
                error_3 = _c.sent();
                results.push("\u274C \u4FEE\u590D\u5931\u8D25: ".concat(error_3.message));
                return [2 /*return*/, {
                        success: false,
                        message: "区块链扫描器修复失败",
                        logs: results,
                    }];
            case 8: return [2 /*return*/];
        }
    });
}); });
var templateObject_1;
