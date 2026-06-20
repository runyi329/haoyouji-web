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
exports.scanStats = void 0;
exports.scanBSCTransactions = scanBSCTransactions;
var dbRecharge = require("../db-recharge");
// BscScan API配置
var BSCSCAN_API_URL = 'https://api.bscscan.com/api';
var BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || ''; // 需要免费API key
// USDT BEP20 Contract Address
var USDT_CONTRACT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955';
// 已处理的交易哈希
var processedTxns = new Set();
// 扫描统计
exports.scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
};
/**
 * 扫描BSC网络的USDT交易
 */
function scanBSCTransactions() {
    return __awaiter(this, void 0, void 0, function () {
        var wallets, _i, wallets_1, wallet, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exports.scanStats = {
                        scannedAddresses: 0,
                        foundTransactions: 0,
                        matchedOrders: 0,
                        unmatchedTransactions: 0,
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses('BEP20')];
                case 2:
                    wallets = _a.sent();
                    if (wallets.length === 0) {
                        console.log('[BSC Scanner] No enabled BEP20 wallet addresses found');
                        return [2 /*return*/, exports.scanStats];
                    }
                    if (!BSCSCAN_API_KEY) {
                        console.warn('[BSC Scanner] ⚠️  BSCSCAN_API_KEY not set. BSC scanning will be limited.');
                    }
                    exports.scanStats.scannedAddresses = wallets.length;
                    _i = 0, wallets_1 = wallets;
                    _a.label = 3;
                case 3:
                    if (!(_i < wallets_1.length)) return [3 /*break*/, 6];
                    wallet = wallets_1[_i];
                    return [4 /*yield*/, scanWalletAddress(wallet.address, wallet.label || wallet.address)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    console.log("[BSC Scanner] Scan completed for ".concat(wallets.length, " wallet(s)"));
                    return [2 /*return*/, exports.scanStats];
                case 7:
                    error_1 = _a.sent();
                    console.error('[BSC Scanner] Scan error:', error_1);
                    throw error_1;
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扫描单个BSC钱包地址
 */
function scanWalletAddress(walletAddress, label) {
    return __awaiter(this, void 0, void 0, function () {
        var params, response, data, transactions, _i, transactions_1, tx, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 7, , 8]);
                    console.log("[BSC Scanner] Scanning ".concat(label, " (").concat(walletAddress.slice(0, 10), "...)..."));
                    params = new URLSearchParams({
                        module: 'account',
                        action: 'tokentx',
                        contractaddress: USDT_CONTRACT_ADDRESS,
                        address: walletAddress,
                        page: '1',
                        offset: '20',
                        sort: 'desc'
                    });
                    if (BSCSCAN_API_KEY) {
                        params.append('apikey', BSCSCAN_API_KEY);
                    }
                    return [4 /*yield*/, fetch("".concat(BSCSCAN_API_URL, "?").concat(params))];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    if (data.status !== '1') {
                        console.error("[BSC Scanner] API error: ".concat(data.message));
                        return [2 /*return*/];
                    }
                    transactions = data.result || [];
                    _i = 0, transactions_1 = transactions;
                    _a.label = 3;
                case 3:
                    if (!(_i < transactions_1.length)) return [3 /*break*/, 6];
                    tx = transactions_1[_i];
                    if (!(tx.to.toLowerCase() === walletAddress.toLowerCase())) return [3 /*break*/, 5];
                    return [4 /*yield*/, processBSCTransaction(tx, walletAddress)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    console.error("[BSC Scanner] Error scanning ".concat(label, ":"), error_2);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 处理单笔BSC交易
 */
function processBSCTransaction(tx, walletAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var txnHash, amount, matchResult, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    txnHash = tx.hash;
                    // 跳过已处理的交易
                    if (processedTxns.has(txnHash)) {
                        return [2 /*return*/];
                    }
                    amount = parseFloat(tx.value) / 1e18;
                    if (!(amount > 0)) return [3 /*break*/, 2];
                    exports.scanStats.foundTransactions++;
                    console.log("[BSC Scanner] Detected transfer: ".concat(amount, " USDT from ").concat(tx.from, " to ").concat(walletAddress.slice(0, 10), "... (tx: ").concat(txnHash, ")"));
                    return [4 /*yield*/, dbRecharge.findOrderByAmount(amount, txnHash)];
                case 1:
                    matchResult = _a.sent();
                    if (matchResult) {
                        exports.scanStats.matchedOrders++;
                        processedTxns.add(txnHash);
                        console.log("[BSC Scanner] \u2705 Matched order ".concat(matchResult.orderNo));
                    }
                    else {
                        exports.scanStats.unmatchedTransactions++;
                    }
                    _a.label = 2;
                case 2: return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    console.error('[BSC Scanner] Error processing transaction:', error_3);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
