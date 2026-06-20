---
name: crypto-price-unified
description: 数字币统一价格获取规范（适用于 haoyouji-web 项目）。凡是需要展示或计算数字币（BTC/ETH/SOL等）实时价格的功能，必须遵循此规范：统一数据源路径、主备切换、价格不为空（保留上次数据）、前端统一接口。Use when implementing any feature that displays or calculates cryptocurrency prices.
---

# 数字币统一价格获取规范

## 核心原则

1. **统一入口**：所有数字币价格从 `price-scanner.ts` 的内存缓存读取，禁止前端直连外部 API
2. **主备切换**：Gate.io → 火币 → OKX，任一失败自动切下一个
3. **价格不为空**：拿不到新数据时保留上次成功价格，不清空不显示 `---`
4. **统一频率**：后端扫描器每 **30秒** 刷新，前端 `refetchInterval: 30000`

---

## 后端：price-scanner.ts

文件路径：`server/price-scanner.ts`

### 覆盖币种

`COINS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM']`

新增币种：在 `COINS` 数组追加即可，无需其他改动。

### 数据源优先级

```
Gate.io (api.gateio.ws/api/v4/spot/tickers)   ← 主力
  ↓ 失败（5秒超时）
火币 (api.huobi.pro/market/detail/merged)      ← 备用1
  ↓ 失败（5秒超时）
OKX (okx.com/api/v5/market/ticker)             ← 备用2
  ↓ 全部失败（8秒超时）
保留上次内存/文件缓存价格                        ← 不清空
```

### 关键导出函数

```ts
getLatestPrice(coin: string): number | null   // USDT 固定返回 1.0
getAllLatestPrices(): Record<string, { price: number; updatedAt: string }>
startPriceScanner()  // 在 server/_core/index.ts 启动时调用一次
```

### 持久化

每次扫描成功后写入 `price-cache.json`（项目根目录），服务重启时自动恢复，避免短暂空值。

---

## 后端：tRPC 接口

### getCryptoPrices — 前端统一调用此接口

```ts
getCryptoPrices: publicProcedure.query(async () => {
  const { getAllLatestPrices } = await import('./price-scanner');
  const allPrices = getAllLatestPrices();
  const result: Record<string, number> = {};
  for (const [coin, entry] of Object.entries(allPrices)) {
    result[coin] = entry.price;
  }
  return result;
})
```

> **重要**：从 `price-scanner` 内存读取，**不得**从数据库 `crypto_price_cache` 表读取（已废弃）。

### 业务接口中使用价格

```ts
import { getLatestPrice } from './price-scanner';

const btcPrice = getLatestPrice('BTC') ?? 0;  // 拿不到时用 0，不抛错
```

---

## 前端：统一调用方式

```tsx
const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, {
  refetchInterval: 30000,
  staleTime: 25000,
});

const btcPrice = cryptoPrices?.['BTC'] ?? 0;
```

### 禁止的写法

```tsx
// ❌ 禁止：前端直连外部 API
fetch('https://api.binance.com/...')
fetch('https://www.okx.com/...')
fetch('https://api.huobi.pro/...')
fetch('https://api.gateio.ws/...')
```

---

## 扫描频率

| 层级 | 频率 | 说明 |
|------|------|------|
| 后端 price-scanner | **30秒** | 向外部 API 发请求，每分钟约 2 次，无压力 |
| 前端 refetchInterval | **30秒** | 向自己服务器请求，读内存，几乎无服务器压力 |

---

## 新增币种流程

1. 在 `COINS` 数组追加（如 `'LINK'`）
2. 确认三个数据源都支持该交易对（`LINKUSDT` / `linkusdt` / `LINK-USDT`）
3. 前端直接用 `cryptoPrices?.['LINK'] ?? 0`，无需其他改动

---

## 文件位置（haoyouji-web 仓库）

```
server/
  price-scanner.ts          ← 后端扫描器（唯一价格来源）
  price-cache.json          ← 持久化缓存（自动生成，勿手动编辑）
docs/
  skills/
    crypto-price-unified.md ← 本规范文档副本（供团队查阅）
```
