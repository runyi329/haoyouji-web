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
exports.scanAptosTransactions = scanAptosTransactions;
var dbRecharge = require("../db-recharge");
// Aptos Indexer GraphQL API配置
var INDEXER_API_URL = 'https://api.mainnet.aptoslabs.com/v1/graphql';
// USDT on Aptos (LayerZero USDT) - Fungible Asset Metadata地址
var USDT_ASSET_TYPE = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';
// 已处理的交易版本号
var processedTxns = new Set();
// 扫描统计
exports.scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
};
/**
 * 扫描Aptos网络的USDT交易
 */
function scanAptosTransactions() {
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
                    return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses('APTOS')];
                case 2:
                    wallets = _a.sent();
                    if (wallets.length === 0) {
                        console.log('[Aptos Scanner] No enabled APTOS wallet addresses found');
                        return [2 /*return*/, exports.scanStats];
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
                    console.log("[Aptos Scanner] Scan completed for ".concat(wallets.length, " wallet(s)"));
                    return [2 /*return*/, exports.scanStats];
                case 7:
                    error_1 = _a.sent();
                    console.error('[Aptos Scanner] Scan error:', error_1);
                    throw error_1;
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扫描单个Aptos钱包地址
 * 使用GraphQL Indexer API查询转入该地址的USDT交易
 */
function scanWalletAddress(walletAddress, label) {
    return __awaiter(this, void 0, void 0, function () {
        var oneDayAgo, query, response, result, activities, _i, activities_1, activity, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 7, , 8]);
                    console.log("[Aptos Scanner] Scanning ".concat(label, " (").concat(walletAddress.slice(0, 10), "...)..."));
                    oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                    query = "\n      query GetFungibleAssetDeposits($owner_address: String!, $since: timestamp!) {\n        fungible_asset_activities(\n          where: {\n            owner_address: { _eq: $owner_address }\n            type: { _like: \"%Deposit%\" }\n            transaction_timestamp: { _gte: $since }\n            is_transaction_success: { _eq: true }\n          }\n          order_by: { transaction_version: desc }\n          limit: 50\n        ) {\n          transaction_version\n          transaction_timestamp\n          type\n          amount\n          asset_type\n          storage_id\n          entry_function_id_str\n          is_transaction_success\n        }\n      }\n    ";
                    return [4 /*yield*/, fetch(INDEXER_API_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: query,
                                variables: {
                                    owner_address: walletAddress,
                                    since: oneDayAgo
                                }
                            })
                        })];
                case 1:
                    response = _b.sent();
                    if (!response.ok) {
                        console.error("[Aptos Scanner] GraphQL API error: ".concat(response.status));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    result = _b.sent();
                    if (result.errors) {
                        console.error("[Aptos Scanner] GraphQL errors:", result.errors);
                        return [2 /*return*/];
                    }
                    activities = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.fungible_asset_activities) || [];
                    if (activities.length === 0) {
                        return [2 /*return*/];
                    }
                    console.log("[Aptos Scanner] Found ".concat(activities.length, " deposit activities"));
                    _i = 0, activities_1 = activities;
                    _b.label = 3;
                case 3:
                    if (!(_i < activities_1.length)) return [3 /*break*/, 6];
                    activity = activities_1[_i];
                    return [4 /*yield*/, processDepositActivity(activity, walletAddress)];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_2 = _b.sent();
                    console.error("[Aptos Scanner] Error scanning ".concat(label, ":"), error_2);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 处理单个Deposit活动
 */
function processDepositActivity(activity, walletAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var txVersion, amount, timestamp, matchResult, order, matchType, amountDiff, success, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    txVersion = activity.transaction_version.toString();
                    // 跳过已处理的交易
                    if (processedTxns.has(txVersion)) {
                        return [2 /*return*/];
                    }
                    amount = parseFloat(activity.amount) / 1e6;
                    if (amount <= 0) {
                        return [2 /*return*/];
                    }
                    exports.scanStats.foundTransactions++;
                    timestamp = new Date(activity.transaction_timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    console.log("[Aptos Scanner] \uD83C\uDFAF Detected INCOMING transfer: ".concat(amount, " USDT to ").concat(walletAddress.slice(0, 10), "... (version: ").concat(txVersion, ", time: ").concat(timestamp, ")"));
                    return [4 /*yield*/, dbRecharge.findOrderByAmount(amount, txVersion)];
                case 1:
                    matchResult = _a.sent();
                    if (!!matchResult) return [3 /*break*/, 3];
                    console.log("[Aptos Scanner] \u26A0\uFE0F  No matching order for amount ".concat(amount, " USDT"));
                    // 记录未匹配交易
                    return [4 /*yield*/, dbRecharge.recordUnmatchedTransaction(txVersion, amount, '')];
                case 2:
                    // 记录未匹配交易
                    _a.sent();
                    exports.scanStats.unmatchedTransactions++;
                    processedTxns.add(txVersion);
                    return [2 /*return*/];
                case 3:
                    order = matchResult.order, matchType = matchResult.matchType, amountDiff = matchResult.amountDiff;
                    if (matchType === 'exact') {
                        console.log("[Aptos Scanner] \u2705 Exact match! Order ".concat(order.orderNo, ", amount ").concat(amount, " USDT"));
                    }
                    else {
                        console.log("[Aptos Scanner] \uD83D\uDD04 Fuzzy match! Order ".concat(order.orderNo, ", order amount ").concat(order.amount, ", actual ").concat(amount, " USDT, diff ").concat(amountDiff));
                    }
                    return [4 /*yield*/, dbRecharge.completeRechargeOrder(order.id, txVersion, amount, matchType)];
                case 4:
                    success = _a.sent();
                    if (success) {
                        console.log("[Aptos Scanner] \u2705 Order ".concat(order.orderNo, " completed! User ").concat(order.userId, " +").concat(amount, " USDT (match: ").concat(matchType, ")"));
                        exports.scanStats.matchedOrders++;
                        processedTxns.add(txVersion);
                    }
                    return [3 /*break*/, 6];
                case 5:
                    error_3 = _a.sent();
                    console.error('[Aptos Scanner] Error processing deposit activity:', error_3);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
