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
exports.scanTRC20Transactions = scanTRC20Transactions;
exports.startScanner = startScanner;
exports.stopScanner = stopScanner;
var dbRecharge = require("./db-recharge");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
// TronGrid API配置
var TRONGRID_API_URL = 'https://api.trongrid.io';
var TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '';
// USDT TRC20 合约地址
var USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
// 已处理的交易哈希（防止重复处理）
var processedTxns = new Set();
// 上次扫描的时间戳
var lastScanTimestamp = Date.now() - 24 * 60 * 60 * 1000; // 从24小时前开始
// 扫描统计数据
var currentScanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
};
/**
 * 更新扫描器心跳
 */
function updateScannerHeartbeat(success, error) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, existing, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    now = new Date();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.scannerHeartbeat)
                            .where((0, drizzle_orm_1.eq)(schema_1.scannerHeartbeat.scannerType, 'blockchain'))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    // 更新现有记录
                    return [4 /*yield*/, db
                            .update(schema_1.scannerHeartbeat)
                            .set({
                            lastScanAt: now,
                            scanCount: existing[0].scanCount + 1,
                            successCount: success ? existing[0].successCount + 1 : existing[0].successCount,
                            errorCount: success ? existing[0].errorCount : existing[0].errorCount + 1,
                            lastError: error || existing[0].lastError,
                            scannedAddresses: currentScanStats.scannedAddresses,
                            foundTransactions: currentScanStats.foundTransactions,
                            matchedOrders: currentScanStats.matchedOrders,
                            unmatchedTransactions: currentScanStats.unmatchedTransactions,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.scannerHeartbeat.scannerType, 'blockchain'))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 插入新记录
                return [4 /*yield*/, db.insert(schema_1.scannerHeartbeat).values({
                        scannerType: 'blockchain',
                        lastScanAt: now,
                        scanCount: 1,
                        successCount: success ? 1 : 0,
                        errorCount: success ? 0 : 1,
                        lastError: error,
                        scannedAddresses: currentScanStats.scannedAddresses,
                        foundTransactions: currentScanStats.foundTransactions,
                        matchedOrders: currentScanStats.matchedOrders,
                        unmatchedTransactions: currentScanStats.unmatchedTransactions,
                    })];
                case 5:
                    // 插入新记录
                    _a.sent();
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    err_1 = _a.sent();
                    console.error('[Scanner] Failed to update heartbeat:', err_1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扫描所有启用的收款地址的TRC20 USDT交易
 */
function scanTRC20Transactions() {
    return __awaiter(this, void 0, void 0, function () {
        var wallets, _i, wallets_1, wallet, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // 重置统计数据
                    currentScanStats = {
                        scannedAddresses: 0,
                        foundTransactions: 0,
                        matchedOrders: 0,
                        unmatchedTransactions: 0,
                    };
                    // 每次扫描前重置时间戳，从24小时前开始扫描
                    // 这样可以确保不会漏掉任何交易
                    lastScanTimestamp = Date.now() - 24 * 60 * 60 * 1000;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, , 12]);
                    return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses('TRC20')];
                case 2:
                    wallets = _a.sent();
                    if (!(wallets.length === 0)) return [3 /*break*/, 4];
                    console.warn('[Scanner] ⚠️  No enabled TRC20 wallet addresses found in database. Please add wallet addresses in admin panel.');
                    return [4 /*yield*/, updateScannerHeartbeat(false, 'No enabled wallet addresses')];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
                case 4:
                    currentScanStats.scannedAddresses = wallets.length;
                    _i = 0, wallets_1 = wallets;
                    _a.label = 5;
                case 5:
                    if (!(_i < wallets_1.length)) return [3 /*break*/, 8];
                    wallet = wallets_1[_i];
                    return [4 /*yield*/, scanWalletAddress(wallet.address, wallet.label || wallet.address)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8:
                    console.log("[Scanner] Scan completed for ".concat(wallets.length, " wallet(s)"));
                    // 更新心跳（成功）
                    return [4 /*yield*/, updateScannerHeartbeat(true)];
                case 9:
                    // 更新心跳（成功）
                    _a.sent();
                    return [3 /*break*/, 12];
                case 10:
                    error_1 = _a.sent();
                    console.error('[Scanner] Scan error:', error_1);
                    return [4 /*yield*/, updateScannerHeartbeat(false, error_1 instanceof Error ? error_1.message : String(error_1))];
                case 11:
                    _a.sent();
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扫描单个钱包地址的交易
 */
function scanWalletAddress(walletAddress, label) {
    return __awaiter(this, void 0, void 0, function () {
        var fetchOptions, response, errorText, data, _i, _a, tx, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 9, , 10]);
                    console.log("[Scanner] Scanning ".concat(label, " (").concat(walletAddress.slice(0, 8), "...)..."));
                    fetchOptions = {};
                    if (TRONGRID_API_KEY) {
                        fetchOptions.headers = {
                            'TRON-PRO-API-KEY': TRONGRID_API_KEY
                        };
                    }
                    return [4 /*yield*/, fetch("".concat(TRONGRID_API_URL, "/v1/accounts/").concat(walletAddress, "/transactions/trc20?limit=20&only_to=true&contract_address=").concat(USDT_CONTRACT_ADDRESS), fetchOptions)];
                case 1:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _b.sent();
                    console.error("[Scanner] TronGrid API error for ".concat(label, ": ").concat(response.status, " ").concat(response.statusText));
                    console.error("[Scanner] Response: ".concat(errorText));
                    throw new Error("TronGrid API error: ".concat(response.status));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    data = _b.sent();
                    if (!data.data || data.data.length === 0) {
                        return [2 /*return*/];
                    }
                    // 处理每笔交易
                    currentScanStats.foundTransactions += data.data.length;
                    _i = 0, _a = data.data;
                    _b.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    tx = _a[_i];
                    return [4 /*yield*/, processTRC20Transaction(tx, walletAddress)];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_2 = _b.sent();
                    console.error("[Scanner] Error scanning ".concat(label, ":"), error_2);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * 处理单笔TRC20交易（改进版：支持模糊匹配）
 */
function processTRC20Transaction(tx, walletAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var txnHash, timestamp, amount, toAddress, fromAddress, matchResult, order, matchType, amountDiff, success, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    txnHash = tx.transaction_id;
                    timestamp = tx.block_timestamp;
                    // 跳过已处理的交易
                    if (processedTxns.has(txnHash)) {
                        return [2 /*return*/];
                    }
                    // 跳过上次扫描之前的交易
                    if (timestamp < lastScanTimestamp) {
                        return [2 /*return*/];
                    }
                    amount = parseFloat(tx.value) / 1e6;
                    toAddress = tx.to;
                    fromAddress = tx.from || '';
                    // 确认是转到我们的地址
                    if (toAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                        return [2 /*return*/];
                    }
                    console.log("[Scanner] Detected transfer: ".concat(amount, " USDT from ").concat(fromAddress, " to ").concat(walletAddress.slice(0, 8), "... (tx: ").concat(txnHash, ")"));
                    return [4 /*yield*/, dbRecharge.findOrderByAmount(amount, txnHash)];
                case 1:
                    matchResult = _a.sent();
                    if (!!matchResult) return [3 /*break*/, 3];
                    console.log("[Scanner] \u26A0\uFE0F No matching order for amount ".concat(amount, " USDT"));
                    // 记录未匹配交易，供管理员手动处理
                    return [4 /*yield*/, dbRecharge.recordUnmatchedTransaction(txnHash, amount, fromAddress)];
                case 2:
                    // 记录未匹配交易，供管理员手动处理
                    _a.sent();
                    currentScanStats.unmatchedTransactions++;
                    processedTxns.add(txnHash);
                    return [2 /*return*/];
                case 3:
                    order = matchResult.order, matchType = matchResult.matchType, amountDiff = matchResult.amountDiff;
                    if (matchType === 'exact') {
                        console.log("[Scanner] \u2705 Exact match! Order ".concat(order.orderNo, ", amount ").concat(amount, " USDT"));
                    }
                    else {
                        console.log("[Scanner] \uD83D\uDD04 Fuzzy match! Order ".concat(order.orderNo, ", order amount ").concat(order.amount, ", actual ").concat(amount, " USDT, diff ").concat(amountDiff, " (likely fee)"));
                    }
                    return [4 /*yield*/, dbRecharge.completeRechargeOrder(order.id, txnHash, amount, matchType)];
                case 4:
                    success = _a.sent();
                    if (success) {
                        console.log("[Scanner] \u2705 Order ".concat(order.orderNo, " completed! User ").concat(order.userId, " +").concat(amount, " USDT (match: ").concat(matchType, ")"));
                        currentScanStats.matchedOrders++;
                        processedTxns.add(txnHash);
                    }
                    return [3 /*break*/, 6];
                case 5:
                    error_3 = _a.sent();
                    console.error('[Scanner] Process transaction error:', error_3);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 启动扫描器（不再依赖环境变量，从数据库读取地址）
 */
function startScanner() {
    var _this = this;
    console.log('[Scanner] Starting multi-chain blockchain scanner...');
    console.log('[Scanner] Supported chains: TRC20, APTOS, SOLANA, ERC20, BEP20');
    console.log('[Scanner] Wallet addresses: loaded from database');
    console.log('[Scanner] Scan interval: 60 seconds');
    console.log('[Scanner] Match strategy: exact (±0.01) → fuzzy (≤3 USDT fee tolerance) → record unmatched');
    // 立即执行一次（异步导入多链扫描器）
    (function () { return __awaiter(_this, void 0, void 0, function () {
        var scanAllChains;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./multi-chain-scanner'); })];
                case 1:
                    scanAllChains = (_a.sent()).scanAllChains;
                    return [4 /*yield*/, scanAllChains()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); })();
    // 每分钟扫描一次
    setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        var scanAllChains;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./multi-chain-scanner'); })];
                case 1:
                    scanAllChains = (_a.sent()).scanAllChains;
                    return [4 /*yield*/, scanAllChains()];
                case 2:
                    _a.sent();
                    // 更新上次扫描时间
                    lastScanTimestamp = Date.now() - 60 * 1000; // 保留１分钟重叠
                    // 清理过期订单
                    return [4 /*yield*/, dbRecharge.cleanExpiredOrders()];
                case 3:
                    // 清理过期订单
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, 60 * 1000);
    console.log('[Scanner] Blockchain scanner started successfully');
}
/**
 * 停止扫描器
 */
function stopScanner() {
    console.log('[Scanner] Stopping blockchain scanner...');
}
