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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnabledWalletAddresses = getEnabledWalletAddresses;
exports.getAllWalletAddresses = getAllWalletAddresses;
exports.getRandomWalletAddress = getRandomWalletAddress;
exports.addWalletAddress = addWalletAddress;
exports.updateWalletAddress = updateWalletAddress;
exports.deleteWalletAddress = deleteWalletAddress;
exports.createRechargeOrder = createRechargeOrder;
exports.submitTransferConfirmation = submitTransferConfirmation;
exports.getRechargeOrder = getRechargeOrder;
exports.getUserRechargeOrders = getUserRechargeOrders;
exports.findOrderByAmount = findOrderByAmount;
exports.recordUnmatchedTransaction = recordUnmatchedTransaction;
exports.completeRechargeOrder = completeRechargeOrder;
exports.adminConfirmRecharge = adminConfirmRecharge;
exports.adminDirectRecharge = adminDirectRecharge;
exports.getAllPendingOrders = getAllPendingOrders;
exports.getAllOrders = getAllOrders;
exports.getUnmatchedTransactions = getUnmatchedTransactions;
exports.addUserBalance = addUserBalance;
exports.getUserBalance = getUserBalance;
exports.getUserBalanceHistory = getUserBalanceHistory;
exports.cleanExpiredOrders = cleanExpiredOrders;
exports.getSystemStats = getSystemStats;
exports.requestWithdraw = requestWithdraw;
exports.getUserWithdrawHistory = getUserWithdrawHistory;
exports.getAllWithdrawRequests = getAllWithdrawRequests;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
// 生成唯一的充值金额（原金额 + 0.0001-0.9999的随机数）
function generateUniqueAmount(baseAmount) {
    var randomDecimal = (Math.floor(Math.random() * 9999) + 1) / 10000;
    return parseFloat((baseAmount + randomDecimal).toFixed(4));
}
// 生成订单号
function generateOrderNo() {
    var timestamp = Date.now();
    var random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return "CHG".concat(timestamp).concat(random);
}
// ========== 收款地址管理（数据库存储） ==========
// 获取所有启用的收款地址
function getEnabledWalletAddresses(network) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!network) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.walletAddresses)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.walletAddresses.enabled, 1), (0, drizzle_orm_1.eq)(schema_1.walletAddresses.network, network)))];
                case 2: return [2 /*return*/, _a.sent()];
                case 3: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.walletAddresses)
                        .where((0, drizzle_orm_1.eq)(schema_1.walletAddresses.enabled, 1))];
                case 4: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 获取所有收款地址（管理员用）
function getAllWalletAddresses() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.walletAddresses)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.walletAddresses.createdAt))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 随机选择一个启用的收款地址
function getRandomWalletAddress() {
    return __awaiter(this, arguments, void 0, function (network) {
        var addresses, randomIndex;
        if (network === void 0) { network = 'TRC20'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getEnabledWalletAddresses(network)];
                case 1:
                    addresses = _a.sent();
                    if (addresses.length === 0) {
                        return [2 /*return*/, null];
                    }
                    randomIndex = Math.floor(Math.random() * addresses.length);
                    return [2 /*return*/, {
                            address: addresses[randomIndex].address,
                            id: addresses[randomIndex].id
                        }];
            }
        });
    });
}
// 添加收款地址（防止重复添加）
function addWalletAddress(address, network, label) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.walletAddresses)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.walletAddresses.address, address), (0, drizzle_orm_1.eq)(schema_1.walletAddresses.network, network)))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        throw new Error("\u8BE5".concat(network, "\u5730\u5740\u5DF2\u5B58\u5728\uFF08ID: ").concat(existing[0].id, "\uFF09"));
                    }
                    return [4 /*yield*/, db.insert(schema_1.walletAddresses).values({
                            address: address,
                            network: network,
                            label: label || null,
                            enabled: 1
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
// 更新收款地址
function updateWalletAddress(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    updateData = {};
                    if (data.address !== undefined)
                        updateData.address = data.address;
                    if (data.network !== undefined)
                        updateData.network = data.network;
                    if (data.label !== undefined)
                        updateData.label = data.label;
                    if (data.enabled !== undefined)
                        updateData.enabled = data.enabled;
                    return [4 /*yield*/, db
                            .update(schema_1.walletAddresses)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.walletAddresses.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
// 删除收款地址
function deleteWalletAddress(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .delete(schema_1.walletAddresses)
                            .where((0, drizzle_orm_1.eq)(schema_1.walletAddresses.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
// ========== 充值订单管理 ==========
// 创建充值订单（从数据库随机选择收款地址）
function createRechargeOrder(userId_1, baseAmount_1) {
    return __awaiter(this, arguments, void 0, function (userId, baseAmount, network) {
        var db, wallet, uniqueAmount, orderNo, expiresAt;
        if (network === void 0) { network = 'TRC20'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, getRandomWalletAddress(network)];
                case 2:
                    wallet = _a.sent();
                    if (!wallet) {
                        throw new Error('充值功能暂未开放，请联系管理员配置收款地址');
                    }
                    uniqueAmount = generateUniqueAmount(baseAmount);
                    orderNo = generateOrderNo();
                    expiresAt = new Date(Date.now() + 30 * 60 * 1000);
                    return [4 /*yield*/, db.insert(schema_1.rechargeOrders).values({
                            userId: userId,
                            orderNo: orderNo,
                            amount: uniqueAmount.toString(),
                            currency: 'USDT',
                            network: network,
                            walletAddress: wallet.address,
                            status: 'pending',
                            expiresAt: expiresAt.toISOString().slice(0, 19).replace('T', ' ')
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/, {
                            orderNo: orderNo,
                            amount: uniqueAmount,
                            currency: 'USDT',
                            network: network,
                            walletAddress: wallet.address,
                            expiresAt: expiresAt
                        }];
            }
        });
    });
}
// 用户提交转账确认（将订单状态从pending改为submitted）
function submitTransferConfirmation(orderNo, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, orders;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.orderNo, orderNo), (0, drizzle_orm_1.eq)(schema_1.rechargeOrders.userId, userId), (0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, 'pending')))
                            .limit(1)];
                case 2:
                    orders = _a.sent();
                    if (orders.length === 0) {
                        throw new Error('订单不存在或已处理');
                    }
                    // 更新状态为submitted
                    return [4 /*yield*/, db
                            .update(schema_1.rechargeOrders)
                            .set({ status: 'submitted' })
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, orders[0].id))];
                case 3:
                    // 更新状态为submitted
                    _a.sent();
                    console.log("[Recharge] User ".concat(userId, " submitted transfer confirmation for order ").concat(orderNo));
                    return [2 /*return*/, { success: true, orderNo: orderNo, status: 'submitted' }];
            }
        });
    });
}
// 查询充值订单
function getRechargeOrder(orderNo) {
    return __awaiter(this, void 0, void 0, function () {
        var db, orders;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.orderNo, orderNo))
                            .limit(1)];
                case 2:
                    orders = _a.sent();
                    return [2 /*return*/, orders[0] || null];
            }
        });
    });
}
// 查询用户的充值订单列表
function getUserRechargeOrders(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        var db;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.userId, userId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.rechargeOrders.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 根据金额查找匹配的订单（改进版：submitted优先 + 精确匹配优先 + 模糊匹配兜底）
 *
 * 匹配策略（按/**
 * 改进的订单匹配算法（按优先级）：
 * 1. 完全匹配（金额完全相同）— 直接自动确认
 * 2. 精确匹配（误差 ±0.01 USDT）— 直接自动确认
 * 3. 模糊匹配（到账金额 < 订单金额，差额在手续费范围内 ≤0.1 USDT）— 自动确认，按实际到账金额入账
 * 4. 无法匹配 — 记录未匹配交易，等待管理员手动处理
 *
 * @param amount 交易金额
 * @param txnHash 交易哈希（用于防止重复匹配）
 */
function findOrderByAmount(amount, txnHash) {
    return __awaiter(this, void 0, void 0, function () {
        var db, statusPriority, _i, statusPriority_1, status_1, exactConditions, exactOrders, fuzzyConditions, fuzzyOrders, orderAmount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    statusPriority = ['submitted', 'pending'];
                    _i = 0, statusPriority_1 = statusPriority;
                    _a.label = 2;
                case 2:
                    if (!(_i < statusPriority_1.length)) return [3 /*break*/, 6];
                    status_1 = statusPriority_1[_i];
                    exactConditions = [
                        (0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, status_1),
                        (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["ABS(CAST(", " AS DECIMAL(20,8)) - ", ") <= 0.01"], ["ABS(CAST(", " AS DECIMAL(20,8)) - ", ") <= 0.01"])), schema_1.rechargeOrders.amount, amount)
                    ];
                    // 如果提供了txnHash，排除已被其他交易使用的订单
                    if (txnHash) {
                        exactConditions.push((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["(txn_hash IS NULL OR txn_hash = ", ")"], ["(txn_hash IS NULL OR txn_hash = ", ")"])), txnHash));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where(drizzle_orm_1.and.apply(void 0, exactConditions))
                            .limit(1)];
                case 3:
                    exactOrders = _a.sent();
                    if (exactOrders.length > 0) {
                        console.log("[Recharge] Exact match found in ".concat(status_1, " orders"));
                        return [2 /*return*/, {
                                order: exactOrders[0],
                                matchType: 'exact',
                                amountDiff: 0
                            }];
                    }
                    fuzzyConditions = [
                        (0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, status_1),
                        (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["CAST(", " AS DECIMAL(20,8)) > ", ""], ["CAST(", " AS DECIMAL(20,8)) > ", ""])), schema_1.rechargeOrders.amount, amount),
                        (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["CAST(", " AS DECIMAL(20,8)) - ", " <= 0.1"], ["CAST(", " AS DECIMAL(20,8)) - ", " <= 0.1"])), schema_1.rechargeOrders.amount, amount)
                    ];
                    // 如果提供了txnHash，排除已被其他交易使用的订单
                    if (txnHash) {
                        fuzzyConditions.push((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["(txn_hash IS NULL OR txn_hash = ", ")"], ["(txn_hash IS NULL OR txn_hash = ", ")"])), txnHash));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where(drizzle_orm_1.and.apply(void 0, fuzzyConditions))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["ABS(CAST(", " AS DECIMAL(20,8)) - ", ") ASC"], ["ABS(CAST(", " AS DECIMAL(20,8)) - ", ") ASC"])), schema_1.rechargeOrders.amount, amount))
                            .limit(1)];
                case 4:
                    fuzzyOrders = _a.sent();
                    if (fuzzyOrders.length > 0) {
                        orderAmount = parseFloat(fuzzyOrders[0].amount);
                        console.log("[Recharge] Fuzzy match found in ".concat(status_1, " orders"));
                        return [2 /*return*/, {
                                order: fuzzyOrders[0],
                                matchType: 'fuzzy',
                                amountDiff: parseFloat((orderAmount - amount).toFixed(4))
                            }];
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: 
                // 无法匹配
                return [2 /*return*/, null];
            }
        });
    });
}
// 记录未匹配的交易（供管理员手动处理）
function recordUnmatchedTransaction(txnHash, amount, fromAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["SELECT id FROM unmatched_transactions WHERE txn_hash = ", " LIMIT 1"], ["SELECT id FROM unmatched_transactions WHERE txn_hash = ", " LIMIT 1"])), txnHash))];
                case 2:
                    existing = _b.sent();
                    if (((_a = existing[0]) === null || _a === void 0 ? void 0 : _a.length) > 0 || (existing === null || existing === void 0 ? void 0 : existing.length) > 0) {
                        return [2 /*return*/];
                    }
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["\n      INSERT INTO unmatched_transactions (txn_hash, amount, from_address, status, created_at)\n      VALUES (", ", ", ", ", ", 'pending', NOW())\n    "], ["\n      INSERT INTO unmatched_transactions (txn_hash, amount, from_address, status, created_at)\n      VALUES (", ", ", ", ", ", 'pending', NOW())\n    "])), txnHash, amount, fromAddress))];
                case 4:
                    _b.sent();
                    console.log("[Recharge] Recorded unmatched transaction: ".concat(txnHash, ", ").concat(amount, " USDT"));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _b.sent();
                    // 表可能不存在，忽略错误
                    console.error('[Recharge] Failed to record unmatched transaction:', error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// 完成充值订单（改进版：支持按实际到账金额入账）
function completeRechargeOrder(orderId_1, txnHash_1, actualAmount_1) {
    return __awaiter(this, arguments, void 0, function (orderId, txnHash, actualAmount, matchType) {
        var db, order, creditAmount, description;
        if (matchType === void 0) { matchType = 'exact'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    // 更新订单状态
                    return [4 /*yield*/, db
                            .update(schema_1.rechargeOrders)
                            .set({
                            status: 'completed',
                            txnHash: txnHash,
                            completedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, orderId))];
                case 2:
                    // 更新订单状态
                    _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, orderId))
                            .limit(1)];
                case 3:
                    order = _a.sent();
                    if (order.length === 0)
                        return [2 /*return*/, false];
                    creditAmount = actualAmount;
                    description = matchType === 'fuzzy'
                        ? "\u5145\u503C\u5230\u8D26\uFF08\u8BA2\u5355\u91D1\u989D".concat(order[0].amount, "\uFF0C\u5B9E\u9645\u5230\u8D26").concat(actualAmount, "\uFF0C\u5DEE\u989D\u4E3A\u624B\u7EED\u8D39\uFF09")
                        : "\u5145\u503C\u5230\u8D26";
                    return [4 /*yield*/, addUserBalance(order[0].userId, creditAmount, 'recharge', orderId, description)];
                case 4:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
// 管理员手动确认充值（将未匹配交易关联到指定订单或用户）
function adminConfirmRecharge(adminId, orderId, txnHash, actualAmount) {
    return __awaiter(this, void 0, void 0, function () {
        var db, order, description, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, orderId))
                            .limit(1)];
                case 2:
                    order = _a.sent();
                    if (order.length === 0) {
                        throw new Error('订单不存在');
                    }
                    if (order[0].status === 'completed') {
                        throw new Error('订单已完成');
                    }
                    // 完成订单
                    return [4 /*yield*/, db
                            .update(schema_1.rechargeOrders)
                            .set({
                            status: 'completed',
                            txnHash: txnHash,
                            completedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.id, orderId))];
                case 3:
                    // 完成订单
                    _a.sent();
                    description = "\u7BA1\u7406\u5458\u624B\u52A8\u786E\u8BA4\u5145\u503C\uFF08\u64CD\u4F5C\u4EBAID:".concat(adminId, "\uFF0C\u4EA4\u6613\u54C8\u5E0C:").concat(txnHash, "\uFF09");
                    return [4 /*yield*/, addUserBalance(order[0].userId, actualAmount, 'recharge', orderId, description)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["\n      UPDATE unmatched_transactions SET status = 'resolved' WHERE txn_hash = ", "\n    "], ["\n      UPDATE unmatched_transactions SET status = 'resolved' WHERE txn_hash = ", "\n    "])), txnHash))];
                case 6:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 7:
                    e_1 = _a.sent();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/, { success: true, userId: order[0].userId, amount: actualAmount }];
            }
        });
    });
}
// 管理员直接给用户充值（无需链上交易）
function adminDirectRecharge(adminId, userId, amount, description) {
    return __awaiter(this, void 0, void 0, function () {
        var desc, newBalance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    desc = description || "\u7BA1\u7406\u5458\u624B\u52A8\u5145\u503C\uFF08\u64CD\u4F5C\u4EBAID:".concat(adminId, "\uFF09");
                    return [4 /*yield*/, addUserBalance(userId, amount, 'recharge', undefined, desc)];
                case 1:
                    newBalance = _a.sent();
                    return [2 /*return*/, { success: true, userId: userId, amount: amount, newBalance: newBalance }];
            }
        });
    });
}
// 获取所有待处理订单（管理员用）
function getAllPendingOrders() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.rechargeOrders.id,
                            userId: schema_1.rechargeOrders.userId,
                            orderNo: schema_1.rechargeOrders.orderNo,
                            amount: schema_1.rechargeOrders.amount,
                            currency: schema_1.rechargeOrders.currency,
                            network: schema_1.rechargeOrders.network,
                            status: schema_1.rechargeOrders.status,
                            createdAt: schema_1.rechargeOrders.createdAt,
                            expiresAt: schema_1.rechargeOrders.expiresAt,
                        })
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, 'pending'))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.rechargeOrders.createdAt))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 获取所有充值订单（管理员用）
function getAllOrders() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var db;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.rechargeOrders)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.rechargeOrders.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 获取未匹配交易列表（管理员用）
function getUnmatchedTransactions() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["\n      SELECT * FROM unmatched_transactions \n      WHERE status = 'pending' \n      ORDER BY created_at DESC \n      LIMIT 50\n    "], ["\n      SELECT * FROM unmatched_transactions \n      WHERE status = 'pending' \n      ORDER BY created_at DESC \n      LIMIT 50\n    "]))))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || []];
                case 4:
                    e_2 = _a.sent();
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// 给用户添加余额
function addUserBalance(userId, amount, type, relatedId, description) {
    return __awaiter(this, void 0, void 0, function () {
        var db, userResult, newBalance;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    // 更新用户余额
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["\n    UPDATE users \n    SET balance = COALESCE(balance, 0) + ", "\n    WHERE id = ", "\n  "], ["\n    UPDATE users \n    SET balance = COALESCE(balance, 0) + ", "\n    WHERE id = ", "\n  "])), amount, userId))];
                case 2:
                    // 更新用户余额
                    _b.sent();
                    return [4 /*yield*/, db
                            .select({ balance: schema_1.users.balance })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 3:
                    userResult = _b.sent();
                    newBalance = ((_a = userResult[0]) === null || _a === void 0 ? void 0 : _a.balance) || 0;
                    // 记录余额变动
                    return [4 /*yield*/, db.insert(schema_1.balanceHistory).values({
                            userId: userId,
                            amount: amount.toString(),
                            type: type,
                            relatedId: relatedId,
                            balance: newBalance.toString(),
                            description: description
                        })];
                case 4:
                    // 记录余额变动
                    _b.sent();
                    return [2 /*return*/, newBalance];
            }
        });
    });
}
// 获取用户余额
function getUserBalance(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, db
                            .select({ balance: schema_1.users.balance })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 2:
                    result = _c.sent();
                    return [2 /*return*/, parseFloat(((_b = (_a = result[0]) === null || _a === void 0 ? void 0 : _a.balance) === null || _b === void 0 ? void 0 : _b.toString()) || '0')];
            }
        });
    });
}
// 获取用户余额变动记录
function getUserBalanceHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        var db;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.balanceHistory)
                            .where((0, drizzle_orm_1.eq)(schema_1.balanceHistory.userId, userId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.balanceHistory.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 定期清理过期订单（只清理pending状态，submitted状态的不过期，因为用户已确认转账）
function cleanExpiredOrders() {
    return __awaiter(this, void 0, void 0, function () {
        var db, now;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    return [4 /*yield*/, db
                            .update(schema_1.rechargeOrders)
                            .set({ status: 'expired' })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, 'pending'), (0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.rechargeOrders.expiresAt, now)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// 获取系统统计信息（管理员用）— 从数据库读取收款地址配置
function getSystemStats() {
    return __awaiter(this, void 0, void 0, function () {
        var db, enabledAddresses, allAddresses, scannerEnabled, orderStats, unmatchedCount, unmatchedTotalAmount, unmatchedResult, row, e_3, matchedStats, matchedOrdersCount, now, utcYear, utcMonth, utcDate, utcHours, beijingDate, beijingMonth, beijingYear, daysInMonth, beijingTodayStart, beijingTomorrowStart, todayStartUTC, todayEndUTC, todayStats, recentOrders;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, getEnabledWalletAddresses()];
                case 2:
                    enabledAddresses = _b.sent();
                    return [4 /*yield*/, getAllWalletAddresses()];
                case 3:
                    allAddresses = _b.sent();
                    scannerEnabled = enabledAddresses.length > 0;
                    return [4 /*yield*/, db
                            .select({
                            status: schema_1.rechargeOrders.status,
                            count: (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            totalAmount: (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["SUM(CAST(", " AS DECIMAL(20,8)))"], ["SUM(CAST(", " AS DECIMAL(20,8)))"])), schema_1.rechargeOrders.amount)
                        })
                            .from(schema_1.rechargeOrders)
                            .groupBy(schema_1.rechargeOrders.status)];
                case 4:
                    orderStats = _b.sent();
                    unmatchedCount = 0;
                    unmatchedTotalAmount = 0;
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["\n      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount \n      FROM unmatched_transactions WHERE status = 'pending'\n    "], ["\n      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount \n      FROM unmatched_transactions WHERE status = 'pending'\n    "]))))];
                case 6:
                    unmatchedResult = _b.sent();
                    row = (_a = unmatchedResult[0]) === null || _a === void 0 ? void 0 : _a[0];
                    unmatchedCount = Number((row === null || row === void 0 ? void 0 : row.count) || 0);
                    unmatchedTotalAmount = parseFloat((row === null || row === void 0 ? void 0 : row.totalAmount) || '0');
                    return [3 /*break*/, 8];
                case 7:
                    e_3 = _b.sent();
                    return [3 /*break*/, 8];
                case 8: return [4 /*yield*/, db
                        .select({
                        count: (0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"])))
                    })
                        .from(schema_1.rechargeOrders)
                        .where((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, 'completed'))];
                case 9:
                    matchedStats = (_b.sent())[0];
                    matchedOrdersCount = Number((matchedStats === null || matchedStats === void 0 ? void 0 : matchedStats.count) || 0);
                    now = new Date();
                    utcYear = now.getUTCFullYear();
                    utcMonth = now.getUTCMonth();
                    utcDate = now.getUTCDate();
                    utcHours = now.getUTCHours();
                    beijingDate = utcDate;
                    beijingMonth = utcMonth;
                    beijingYear = utcYear;
                    if (utcHours >= 16) {
                        // UTC 16:00 = 北京 00:00（第二天）
                        beijingDate++;
                        daysInMonth = new Date(beijingYear, beijingMonth + 1, 0).getDate();
                        if (beijingDate > daysInMonth) {
                            beijingDate = 1;
                            beijingMonth++;
                            if (beijingMonth > 11) {
                                beijingMonth = 0;
                                beijingYear++;
                            }
                        }
                    }
                    beijingTodayStart = new Date(Date.UTC(beijingYear, beijingMonth, beijingDate, -8, 0, 0, 0));
                    beijingTomorrowStart = new Date(beijingTodayStart.getTime() + 24 * 60 * 60 * 1000);
                    todayStartUTC = beijingTodayStart.toISOString().slice(0, 19).replace('T', ' ');
                    todayEndUTC = beijingTomorrowStart.toISOString().slice(0, 19).replace('T', ' ');
                    return [4 /*yield*/, db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            totalAmount: (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["SUM(CAST(", " AS DECIMAL(20,8)))"], ["SUM(CAST(", " AS DECIMAL(20,8)))"])), schema_1.rechargeOrders.amount)
                        })
                            .from(schema_1.rechargeOrders)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.rechargeOrders.status, 'completed'), (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["", " >= ", ""], ["", " >= ", ""])), schema_1.rechargeOrders.completedAt, todayStartUTC), (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.rechargeOrders.completedAt, todayEndUTC)))];
                case 10:
                    todayStats = (_b.sent())[0];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.rechargeOrders.id,
                            userId: schema_1.rechargeOrders.userId,
                            orderNo: schema_1.rechargeOrders.orderNo,
                            amount: schema_1.rechargeOrders.amount,
                            network: schema_1.rechargeOrders.network,
                            walletAddress: schema_1.rechargeOrders.walletAddress,
                            txnHash: schema_1.rechargeOrders.txnHash,
                            status: schema_1.rechargeOrders.status,
                            createdAt: schema_1.rechargeOrders.createdAt,
                            completedAt: schema_1.rechargeOrders.completedAt,
                            username: schema_1.users.username,
                        })
                            .from(schema_1.rechargeOrders)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.rechargeOrders.userId, schema_1.users.id))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.rechargeOrders.createdAt))
                            .limit(10)];
                case 11:
                    recentOrders = _b.sent();
                    return [2 /*return*/, {
                            scannerEnabled: scannerEnabled,
                            walletAddresses: enabledAddresses.map(function (a) { return ({
                                id: a.id,
                                address: a.address,
                                network: a.network,
                                label: a.label
                            }); }),
                            allWalletAddresses: allAddresses,
                            scanInterval: 60,
                            orderStats: orderStats.map(function (s) { return ({
                                status: s.status,
                                count: Number(s.count),
                                totalAmount: parseFloat(s.totalAmount || '0')
                            }); }),
                            matchedOrdersCount: matchedOrdersCount,
                            unmatchedCount: unmatchedCount,
                            unmatchedTotalAmount: unmatchedTotalAmount,
                            todayCount: Number((todayStats === null || todayStats === void 0 ? void 0 : todayStats.count) || 0),
                            todayTotalAmount: parseFloat((todayStats === null || todayStats === void 0 ? void 0 : todayStats.totalAmount) || '0'),
                            recentOrders: recentOrders
                        }];
            }
        });
    });
}
// ========== 提现功能 ==========
// 用户申请提现
function requestWithdraw(userId, amount, paymentAccountId, remark) {
    return __awaiter(this, void 0, void 0, function () {
        var db, user, balance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 2:
                    user = _a.sent();
                    if (!user || user.length === 0) {
                        throw new Error('用户不存在');
                    }
                    balance = parseFloat(user[0].balance || '0');
                    if (balance < amount) {
                        throw new Error('余额不足');
                    }
                    if (amount < 10) {
                        throw new Error('最低提现金额为 10 USDT');
                    }
                    // 扣除余额
                    return [4 /*yield*/, db
                            .update(schema_1.users)
                            .set({
                            balance: (0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["", " - ", ""], ["", " - ", ""])), schema_1.users.balance, amount),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 3:
                    // 扣除余额
                    _a.sent();
                    // 记录余额变动
                    return [4 /*yield*/, db.insert(schema_1.balanceHistory).values({
                            userId: userId,
                            amount: -amount, // 负数表示减少
                            type: 'withdraw',
                            relatedId: paymentAccountId,
                            balance: balance - amount,
                            description: remark || "\u63D0\u73B0 ".concat(amount, " USDT"),
                        })];
                case 4:
                    // 记录余额变动
                    _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            message: '提现申请已提交，等待管理员审核',
                        }];
            }
        });
    });
}
// 获取用户提现记录
function getUserWithdrawHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        var db;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.balanceHistory)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.balanceHistory.userId, userId), (0, drizzle_orm_1.eq)(schema_1.balanceHistory.type, 'withdraw')))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.balanceHistory.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// 管理员获取所有提现申请
function getAllWithdrawRequests() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var db;
        if (limit === void 0) { limit = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.balanceHistory.id,
                            userId: schema_1.balanceHistory.userId,
                            username: schema_1.users.username,
                            amount: schema_1.balanceHistory.amount,
                            balance: schema_1.balanceHistory.balance,
                            description: schema_1.balanceHistory.description,
                            createdAt: schema_1.balanceHistory.createdAt,
                        })
                            .from(schema_1.balanceHistory)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.balanceHistory.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.balanceHistory.type, 'withdraw'))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.balanceHistory.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29;
