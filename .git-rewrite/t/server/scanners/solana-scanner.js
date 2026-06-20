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
exports.scanSolanaTransactions = scanSolanaTransactions;
var dbRecharge = require("../db-recharge");
// Solana RPC配置
var SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
// USDT SPL Token Mint Address
var USDT_MINT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
// 已处理的交易签名
var processedTxns = new Set();
// 扫描统计
exports.scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
};
/**
 * 扫描Solana网络的USDT交易
 */
function scanSolanaTransactions() {
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
                    return [4 /*yield*/, dbRecharge.getEnabledWalletAddresses('SOLANA')];
                case 2:
                    wallets = _a.sent();
                    if (wallets.length === 0) {
                        console.log('[Solana Scanner] No enabled SOLANA wallet addresses found');
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
                    console.log("[Solana Scanner] Scan completed for ".concat(wallets.length, " wallet(s)"));
                    return [2 /*return*/, exports.scanStats];
                case 7:
                    error_1 = _a.sent();
                    console.error('[Solana Scanner] Scan error:', error_1);
                    throw error_1;
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取钱包地址的USDT Token Account
 */
function getTokenAccount(walletAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var response, data, accounts, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch(SOLANA_RPC_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'getTokenAccountsByOwner',
                                params: [
                                    walletAddress,
                                    {
                                        mint: USDT_MINT_ADDRESS
                                    },
                                    {
                                        encoding: 'jsonParsed'
                                    }
                                ]
                            })
                        })];
                case 1:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _b.sent();
                    if (data.error) {
                        console.error("[Solana Scanner] Error getting token account:", data.error);
                        return [2 /*return*/, null];
                    }
                    accounts = ((_a = data.result) === null || _a === void 0 ? void 0 : _a.value) || [];
                    if (accounts.length === 0) {
                        console.log("[Solana Scanner] No USDT token account found for ".concat(walletAddress.slice(0, 10), "..."));
                        return [2 /*return*/, null];
                    }
                    // 返回第一个Token Account的地址
                    return [2 /*return*/, accounts[0].pubkey];
                case 3:
                    error_2 = _b.sent();
                    console.error("[Solana Scanner] Error getting token account:", error_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 扫描单个Solana钱包地址
 */
function scanWalletAddress(walletAddress, label) {
    return __awaiter(this, void 0, void 0, function () {
        var tokenAccount, signaturesResponse, signaturesData, signatures, _i, signatures_1, sig, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    console.log("[Solana Scanner] Scanning ".concat(label, " (").concat(walletAddress.slice(0, 10), "...)..."));
                    return [4 /*yield*/, getTokenAccount(walletAddress)];
                case 1:
                    tokenAccount = _a.sent();
                    if (!tokenAccount) {
                        console.log("[Solana Scanner] Skipping ".concat(label, " - no token account"));
                        return [2 /*return*/];
                    }
                    console.log("[Solana Scanner] Token Account: ".concat(tokenAccount.slice(0, 10), "..."));
                    return [4 /*yield*/, fetch(SOLANA_RPC_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'getSignaturesForAddress',
                                params: [
                                    tokenAccount,
                                    { limit: 20 }
                                ]
                            })
                        })];
                case 2:
                    signaturesResponse = _a.sent();
                    return [4 /*yield*/, signaturesResponse.json()];
                case 3:
                    signaturesData = _a.sent();
                    if (signaturesData.error) {
                        console.error("[Solana Scanner] API error:", signaturesData.error);
                        return [2 /*return*/];
                    }
                    signatures = signaturesData.result || [];
                    console.log("[Solana Scanner] Found ".concat(signatures.length, " transactions for ").concat(label));
                    _i = 0, signatures_1 = signatures;
                    _a.label = 4;
                case 4:
                    if (!(_i < signatures_1.length)) return [3 /*break*/, 7];
                    sig = signatures_1[_i];
                    if (!(sig.err === null)) return [3 /*break*/, 6];
                    return [4 /*yield*/, processTransaction(sig.signature, tokenAccount, walletAddress)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [3 /*break*/, 9];
                case 8:
                    error_3 = _a.sent();
                    console.error("[Solana Scanner] Error scanning ".concat(label, ":"), error_3);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * 处理单笔Solana交易
 */
function processTransaction(signature, tokenAccount, walletAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var txResponse, txData, tx, instructions, _i, instructions_1, instruction, info, amount, matchResult, error_4;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 7, , 8]);
                    // 跳过已处理的交易
                    if (processedTxns.has(signature)) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fetch(SOLANA_RPC_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'getTransaction',
                                params: [
                                    signature,
                                    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
                                ]
                            })
                        })];
                case 1:
                    txResponse = _f.sent();
                    return [4 /*yield*/, txResponse.json()];
                case 2:
                    txData = _f.sent();
                    if (txData.error || !txData.result) {
                        return [2 /*return*/];
                    }
                    tx = txData.result;
                    instructions = ((_b = (_a = tx.transaction) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.instructions) || [];
                    _i = 0, instructions_1 = instructions;
                    _f.label = 3;
                case 3:
                    if (!(_i < instructions_1.length)) return [3 /*break*/, 6];
                    instruction = instructions_1[_i];
                    if (!(instruction.program === 'spl-token' &&
                        (((_c = instruction.parsed) === null || _c === void 0 ? void 0 : _c.type) === 'transfer' ||
                            ((_d = instruction.parsed) === null || _d === void 0 ? void 0 : _d.type) === 'transferChecked'))) return [3 /*break*/, 5];
                    info = instruction.parsed.info;
                    if (!(info.destination && info.destination === tokenAccount)) return [3 /*break*/, 5];
                    amount = 0;
                    if ((_e = info.tokenAmount) === null || _e === void 0 ? void 0 : _e.uiAmount) {
                        amount = parseFloat(info.tokenAmount.uiAmount);
                    }
                    else if (info.amount && info.decimals !== undefined) {
                        amount = parseFloat(info.amount) / Math.pow(10, info.decimals);
                    }
                    else if (info.amount) {
                        amount = parseFloat(info.amount) / 1e6; // USDT默认6位小数
                    }
                    if (!(amount > 0)) return [3 /*break*/, 5];
                    exports.scanStats.foundTransactions++;
                    console.log("[Solana Scanner] \u2705 Detected transfer: ".concat(amount, " USDT to ").concat(walletAddress.slice(0, 10), "... (tx: ").concat(signature.slice(0, 10), "...)"));
                    return [4 /*yield*/, dbRecharge.findOrderByAmount(amount, signature)];
                case 4:
                    matchResult = _f.sent();
                    if (matchResult) {
                        exports.scanStats.matchedOrders++;
                        processedTxns.add(signature);
                        console.log("[Solana Scanner] \u2705 Matched order ".concat(matchResult.orderNo));
                    }
                    else {
                        exports.scanStats.unmatchedTransactions++;
                        console.log("[Solana Scanner] \u26A0\uFE0F  No matching order found for ".concat(amount, " USDT"));
                    }
                    _f.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_4 = _f.sent();
                    console.error('[Solana Scanner] Error processing transaction:', error_4);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
