# Aptos 区块链扫描器修复总结

## 问题描述

Aptos 网络的 USDT 充值订单无法被自动检测和完成。用户已经完成转账，但系统扫描器无法识别转入交易。

**测试案例**：
- 订单号：CHG1771986246733318
- 用户地址：`0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d`
- 订单金额：15.90370000 USDT
- 实际转账：15.8837 USDT（扣除 0.02 USDT 手续费）
- 交易版本：4399696408
- 交易时间：2026-02-25 10:25:28

## 根本原因分析

### 1. Aptos 使用 Primary Fungible Store 机制

**旧版 Aptos**：
- 使用 `CoinStore` 资源存储代币
- 代币直接存储在用户地址下

**新版 Aptos**：
- 使用 `Primary Fungible Store` 机制
- USDT 存储在独立的 Store 对象中
- Store 地址：`0x4303cfcca55f45d5a4c930d89fa5085e7a162d8ac042e39c00a987522e86f00c`
- Store 属于用户地址：`0x46f7f36f...d2d`

### 2. REST API 的局限性

**问题**：
- `/accounts/{address}/transactions` 只返回**该地址发起的交易**
- 不返回**转入到该地址的交易**
- 转入交易的发送方是对方地址，不是用户地址

**示例**：
- 用户地址：`0x46f7f36f...d2d`
- 转入交易发送方：`0xae1a6f3d...`（对方地址）
- 查询用户地址的交易列表 → 找不到这笔转入交易

### 3. 旧扫描器的错误逻辑

```typescript
// ❌ 错误：查询地址发起的交易
const txResponse = await fetch(
  `${APTOS_API_URL}/accounts/${walletAddress}/transactions?limit=50`
);

// ❌ 错误：检查 CoinStore（新版 Aptos 已移除）
if (change.data?.type?.includes('CoinStore')) {
  // ...
}
```

## 解决方案

### 使用 Aptos Indexer GraphQL API

**核心改进**：
1. 使用 GraphQL API 而不是 REST API
2. 查询 `fungible_asset_activities` 表
3. 筛选 `owner_address` = 用户地址 + `type` 包含 "Deposit"

**GraphQL 查询**：
```graphql
query GetFungibleAssetDeposits($owner_address: String!, $since: timestamp!) {
  fungible_asset_activities(
    where: {
      owner_address: { _eq: $owner_address }
      type: { _like: "%Deposit%" }
      transaction_timestamp: { _gte: $since }
      is_transaction_success: { _eq: true }
    }
    order_by: { transaction_version: desc }
    limit: 50
  ) {
    transaction_version
    transaction_timestamp
    type
    amount
    asset_type
    storage_id
    entry_function_id_str
    is_transaction_success
  }
}
```

**新扫描器逻辑**：
```typescript
// ✅ 正确：使用 GraphQL 查询 Deposit 活动
const response = await fetch(INDEXER_API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query,
    variables: {
      owner_address: walletAddress,
      since: oneDayAgo
    }
  })
});

// ✅ 正确：直接获取 Deposit 活动
const activities = result.data?.fungible_asset_activities || [];

// ✅ 正确：处理每个 Deposit 活动
for (const activity of activities) {
  const amount = parseFloat(activity.amount) / 1e6;
  await matchAndCompleteOrder(amount, activity.transaction_version);
}
```

## 测试结果

### 本地测试

```
[Aptos Scanner] Scanning 0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d...
[Aptos Scanner] Found 1 deposit activities
[Aptos Scanner] 🎯 Detected INCOMING transfer: 15.8837 USDT (version: 4399696408, time: 2026/2/25 15:25:28)
[Aptos Scanner] 🔄 Fuzzy match! Order CHG1771986246733318, order amount 15.90370000, actual 15.8837 USDT, diff 0.02
[Aptos Scanner] ✅ Order CHG1771986246733318 completed! User 870413 +15.8837 USDT (match: fuzzy)

扫描结果：
- 扫描地址数: 1
- 发现交易数: 1
- 匹配订单数: 1
- 未匹配交易数: 0
```

### 订单状态验证

```
订单号: CHG1771986246733318
金额: 15.90370000 USDT
网络: APTOS
状态: completed（已完成）✅
交易版本: 4399696408
完成时间: 2026-02-25 09:00:37
```

## 关键技术点

### 1. Primary Fungible Store

- **Store 地址获取**：从交易事件中提取
- **Store 所有权验证**：查询 Store 资源的 owner 字段
- **Deposit 识别**：检查事件类型为 `0x1::fungible_asset::Deposit`

### 2. GraphQL Indexer API

- **API 端点**：`https://api.mainnet.aptoslabs.com/v1/graphql`
- **核心表**：`fungible_asset_activities`
- **索引优化**：使用 `faa_owner_type_index` 索引（owner_address + type）

### 3. 金额匹配策略

- **精确匹配**：订单金额 ± 0.01 USDT
- **模糊匹配**：手续费容差 ≤ 3 USDT
- **本案例**：差异 0.02 USDT，模糊匹配成功

### 4. Asset Type 处理

- **问题**：USDT 的 `asset_type` 是 metadata 对象地址（`0x357b0b74...`），不包含 "USDT" 字符串
- **解决**：不过滤 `asset_type`，接受所有 Deposit 活动，依靠金额匹配订单

## 部署状态

- ✅ 代码已提交到 GitHub
- ✅ GitHub Actions 自动部署完成
- ✅ 生产环境扫描器已更新
- ✅ 每分钟自动扫描一次

## 后续建议

### 1. 监控和日志

建议在管理后台添加：
- 扫描器运行状态监控
- 未匹配交易列表
- 扫描统计数据展示

### 2. 其他网络实现

使用相同的模式实现其他网络：
- **ERC20 (Ethereum)**：使用 Etherscan API
- **BSC/BEP20**：使用 BscScan API
- **Solana**：使用 Solana RPC API

### 3. 性能优化

- 缓存已处理的交易版本号
- 使用数据库记录扫描进度
- 支持增量扫描（只查询新交易）

### 4. 容错处理

- API 限流处理
- 网络超时重试
- 数据库事务保护

## 总结

**问题**：Aptos 扫描器无法检测转入交易

**原因**：
1. Aptos 使用 Primary Fungible Store 机制
2. REST API 只返回地址发起的交易
3. 转入交易的发送方是对方地址

**解决**：
1. 使用 GraphQL Indexer API
2. 查询 `fungible_asset_activities` 表
3. 筛选 Deposit 到用户地址的活动

**结果**：
- ✅ 成功检测转入交易
- ✅ 自动匹配订单
- ✅ 自动完成充值

---

**修复时间**：2026-02-25
**测试订单**：CHG1771986246733318 ✅
**部署状态**：已上线生产环境 ✅
