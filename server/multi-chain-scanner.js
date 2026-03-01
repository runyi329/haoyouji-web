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
exports.scanAllChains = scanAllChains;
var blockchain_scanner_1 = require("./blockchain-scanner");
var aptos_scanner_1 = require("./scanners/aptos-scanner");
var solana_scanner_1 = require("./scanners/solana-scanner");
var erc20_scanner_1 = require("./scanners/erc20-scanner");
var bsc_scanner_1 = require("./scanners/bsc-scanner");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * 扫描所有支持的区块链网络
 */
function scanAllChains() {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, results, error_1, aptosStats, error_2, solanaStats, error_3, erc20Stats, error_4, bscStats, error_5, duration;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[Multi-Chain Scanner] ========== Starting scan for all chains ==========');
                    startTime = Date.now();
                    results = {
                        success: true,
                        chains: {},
                        totalStats: {
                            scannedAddresses: 0,
                            foundTransactions: 0,
                            matchedOrders: 0,
                            unmatchedTransactions: 0,
                        },
                        errors: []
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    console.log('[Multi-Chain Scanner] Scanning TRC20...');
                    return [4 /*yield*/, (0, blockchain_scanner_1.scanTRC20Transactions)()];
                case 2:
                    _a.sent();
                    results.chains.TRC20 = { success: true };
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error('[Multi-Chain Scanner] TRC20 scan failed:', error_1);
                    results.chains.TRC20 = { success: false, error: String(error_1) };
                    results.errors.push("TRC20: ".concat(error_1));
                    return [3 /*break*/, 4];
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    console.log('[Multi-Chain Scanner] Scanning Aptos...');
                    return [4 /*yield*/, (0, aptos_scanner_1.scanAptosTransactions)()];
                case 5:
                    aptosStats = _a.sent();
                    results.chains.APTOS = { success: true, stats: aptosStats };
                    results.totalStats.scannedAddresses += aptosStats.scannedAddresses;
                    results.totalStats.foundTransactions += aptosStats.foundTransactions;
                    results.totalStats.matchedOrders += aptosStats.matchedOrders;
                    results.totalStats.unmatchedTransactions += aptosStats.unmatchedTransactions;
                    return [3 /*break*/, 7];
                case 6:
                    error_2 = _a.sent();
                    console.error('[Multi-Chain Scanner] Aptos scan failed:', error_2);
                    results.chains.APTOS = { success: false, error: String(error_2) };
                    results.errors.push("Aptos: ".concat(error_2));
                    return [3 /*break*/, 7];
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    console.log('[Multi-Chain Scanner] Scanning Solana...');
                    return [4 /*yield*/, (0, solana_scanner_1.scanSolanaTransactions)()];
                case 8:
                    solanaStats = _a.sent();
                    results.chains.SOLANA = { success: true, stats: solanaStats };
                    results.totalStats.scannedAddresses += solanaStats.scannedAddresses;
                    results.totalStats.foundTransactions += solanaStats.foundTransactions;
                    results.totalStats.matchedOrders += solanaStats.matchedOrders;
                    results.totalStats.unmatchedTransactions += solanaStats.unmatchedTransactions;
                    return [3 /*break*/, 10];
                case 9:
                    error_3 = _a.sent();
                    console.error('[Multi-Chain Scanner] Solana scan failed:', error_3);
                    results.chains.SOLANA = { success: false, error: String(error_3) };
                    results.errors.push("Solana: ".concat(error_3));
                    return [3 /*break*/, 10];
                case 10:
                    _a.trys.push([10, 12, , 13]);
                    console.log('[Multi-Chain Scanner] Scanning ERC20...');
                    return [4 /*yield*/, (0, erc20_scanner_1.scanERC20Transactions)()];
                case 11:
                    erc20Stats = _a.sent();
                    results.chains.ERC20 = { success: true, stats: erc20Stats };
                    results.totalStats.scannedAddresses += erc20Stats.scannedAddresses;
                    results.totalStats.foundTransactions += erc20Stats.foundTransactions;
                    results.totalStats.matchedOrders += erc20Stats.matchedOrders;
                    results.totalStats.unmatchedTransactions += erc20Stats.unmatchedTransactions;
                    return [3 /*break*/, 13];
                case 12:
                    error_4 = _a.sent();
                    console.error('[Multi-Chain Scanner] ERC20 scan failed:', error_4);
                    results.chains.ERC20 = { success: false, error: String(error_4) };
                    results.errors.push("ERC20: ".concat(error_4));
                    return [3 /*break*/, 13];
                case 13:
                    _a.trys.push([13, 15, , 16]);
                    console.log('[Multi-Chain Scanner] Scanning BSC...');
                    return [4 /*yield*/, (0, bsc_scanner_1.scanBSCTransactions)()];
                case 14:
                    bscStats = _a.sent();
                    results.chains.BEP20 = { success: true, stats: bscStats };
                    results.totalStats.scannedAddresses += bscStats.scannedAddresses;
                    results.totalStats.foundTransactions += bscStats.foundTransactions;
                    results.totalStats.matchedOrders += bscStats.matchedOrders;
                    results.totalStats.unmatchedTransactions += bscStats.unmatchedTransactions;
                    return [3 /*break*/, 16];
                case 15:
                    error_5 = _a.sent();
                    console.error('[Multi-Chain Scanner] BSC scan failed:', error_5);
                    results.chains.BEP20 = { success: false, error: String(error_5) };
                    results.errors.push("BSC: ".concat(error_5));
                    return [3 /*break*/, 16];
                case 16:
                    duration = Date.now() - startTime;
                    console.log('[Multi-Chain Scanner] ========== Scan completed ==========');
                    console.log("[Multi-Chain Scanner] Duration: ".concat(duration, "ms"));
                    console.log("[Multi-Chain Scanner] Total addresses scanned: ".concat(results.totalStats.scannedAddresses));
                    console.log("[Multi-Chain Scanner] Total transactions found: ".concat(results.totalStats.foundTransactions));
                    console.log("[Multi-Chain Scanner] Total orders matched: ".concat(results.totalStats.matchedOrders));
                    console.log("[Multi-Chain Scanner] Total unmatched: ".concat(results.totalStats.unmatchedTransactions));
                    if (results.errors.length > 0) {
                        console.error("[Multi-Chain Scanner] Errors: ".concat(results.errors.join(', ')));
                        results.success = false;
                    }
                    // 更新心跳
                    return [4 /*yield*/, updateMultiChainHeartbeat(results)];
                case 17:
                    // 更新心跳
                    _a.sent();
                    return [2 /*return*/, results];
            }
        });
    });
}
/**
 * 更新多链扫描器心跳
 */
function updateMultiChainHeartbeat(results) {
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
                            .where((0, drizzle_orm_1.eq)(schema_1.scannerHeartbeat.scannerType, 'multi-chain'))
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
                            successCount: results.success ? existing[0].successCount + 1 : existing[0].successCount,
                            errorCount: results.success ? existing[0].errorCount : existing[0].errorCount + 1,
                            lastError: results.errors.length > 0 ? results.errors.join('; ') : null,
                            scannedAddresses: results.totalStats.scannedAddresses,
                            foundTransactions: results.totalStats.foundTransactions,
                            matchedOrders: results.totalStats.matchedOrders,
                            unmatchedTransactions: results.totalStats.unmatchedTransactions,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.scannerHeartbeat.scannerType, 'multi-chain'))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 插入新记录
                return [4 /*yield*/, db.insert(schema_1.scannerHeartbeat).values({
                        scannerType: 'multi-chain',
                        lastScanAt: now,
                        scanCount: 1,
                        successCount: results.success ? 1 : 0,
                        errorCount: results.success ? 0 : 1,
                        lastError: results.errors.length > 0 ? results.errors.join('; ') : null,
                        scannedAddresses: results.totalStats.scannedAddresses,
                        foundTransactions: results.totalStats.foundTransactions,
                        matchedOrders: results.totalStats.matchedOrders,
                        unmatchedTransactions: results.totalStats.unmatchedTransactions,
                    })];
                case 5:
                    // 插入新记录
                    _a.sent();
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    err_1 = _a.sent();
                    console.error('[Multi-Chain Scanner] Failed to update heartbeat:', err_1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
