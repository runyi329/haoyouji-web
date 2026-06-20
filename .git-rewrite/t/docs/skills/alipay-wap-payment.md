---
name: alipay-wap-payment
description: 好友记项目支付宝 WAP 手机支付全套配置规范。包含商户 App ID、RSA2 密钥对、SDK 初始化、下单接口、异步回调验签、前端跳转支付完整流程。凡是需要接入支付宝支付的功能，必须遵循此规范。
---

# 支付宝 WAP 手机支付全套配置规范

## 商户基本信息

| 配置项 | 值 |
|--------|-----|
| **App ID** | `2021006136636386` |
| **签名方式** | RSA2（SHA256WithRSA） |
| **网关地址** | `https://openapi.alipay.com/gateway.do` |
| **SDK 版本** | `alipay-sdk@^4.14.0` |
| **支付类型** | WAP 手机网站支付（`alipay.trade.wap.pay`） |
| **产品码** | `QUICK_WAP_WAY` |

---

## 密钥配置

密钥通过 `scripts/inject-alipay-env.cjs` 在每次部署时自动注入到 `ecosystem.config.cjs`，无需手动配置服务器环境变量。

### 环境变量名称

| 变量名 | 说明 |
|--------|------|
| `ALIPAY_APP_ID` | 商户应用 ID，值为 `2021006136636386` |
| `ALIPAY_APP_PRIVATE_KEY` | 商户 RSA2 私钥（PKCS8 格式，不含 PEM 头尾） |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥（用于验签回调，不含 PEM 头尾） |

### 密钥存储位置

```
scripts/
  inject-alipay-env.cjs   ← 部署时自动注入密钥到 PM2 配置
ecosystem.config.cjs      ← 生产环境 PM2 配置（含注入后的密钥，勿提交 Git）
```

> **安全说明**：`ecosystem.config.cjs` 已加入 `.gitignore`，密钥不会泄露到 Git 仓库。每次部署由 `inject-alipay-env.cjs` 脚本自动写入。

---

## 文件结构

```
server/
  alipay.ts           ← SDK 初始化 + 核心工具函数
  alipay-router.ts    ← Express 路由（下单/回调/查询）
  alipay.test.ts      ← Vitest 单元测试
scripts/
  inject-alipay-env.cjs  ← 部署时注入密钥脚本
.github/workflows/
  deploy.yml          ← 部署流程（第50行调用 inject-alipay-env.cjs）
```

---

## 核心工具函数（server/alipay.ts）

### SDK 初始化

```ts
import { getAlipaySdk } from './alipay';
const sdk = getAlipaySdk(); // 单例，自动读取环境变量
```

SDK 初始化时自动格式化私钥和公钥（添加 PEM 头尾、每64字符换行），无需手动处理。

### 创建 WAP 支付链接（GET 方式）

```ts
import { createWapPayUrl } from './alipay';

const payUrl = createWapPayUrl({
  orderId: 'HYJ17000000000ABC123',  // 唯一订单号，最长64位
  subject: '好友记-利息支付',         // 商品标题
  totalAmount: 100.00,               // 金额（元），保留2位小数
  returnUrl: 'https://jiangyuchen.cn/payment/result?orderId=xxx', // 同步跳转
  notifyUrl: 'https://jiangyuchen.cn/api/alipay/notify',          // 异步回调
  body: '好友记-利息支付说明',         // 商品描述（可选）
});

// 前端跳转：window.location.href = payUrl
```

### 创建 WAP 支付表单（POST 方式）

```ts
import { createWapPayForm } from './alipay';

const formHtml = createWapPayForm({ ...同上参数 });
// 前端：document.write(formHtml) 后自动提交跳转
```

### 验证异步回调签名

```ts
import { verifyAlipayNotify } from './alipay';

const isValid = verifyAlipayNotify(req.body as Record<string, string>);
// 返回 true 表示签名合法，false 表示伪造请求
```

---

## HTTP 接口清单（server/alipay-router.ts）

所有接口已在 `server/_core/index.ts` 中挂载：`app.use(alipayRouterModule.default)`

| 方法 | 路径 | 说明 | 是否需要登录 |
|------|------|------|------------|
| `POST` | `/api/alipay/create-order` | 标准下单（写入 recharge_orders 表） | ✅ 需要 |
| `POST` | `/api/alipay/notify` | 支付宝异步回调（验签+更新订单状态） | ❌ 公开 |
| `GET` | `/api/alipay/return` | 支付完成同步跳转（302 到前端结果页） | ❌ 公开 |
| `GET` | `/api/alipay/order-status` | 前端轮询查询订单状态 | ✅ 需要 |
| `POST` | `/api/alipay/feedback-pay` | 意见反馈页快速支付（无需登录） | ❌ 公开 |
| `GET` | `/api/alipay/quick-pay` | URL 参数传金额直接302跳转支付宝 | ❌ 公开 |

### POST /api/alipay/create-order

请求体：
```json
{
  "productId": "INTEREST_2024_01",
  "productName": "1月利息",
  "amount": 100.00
}
```

响应：
```json
{
  "success": true,
  "orderId": "HYJ17000000000ABC123",
  "payUrl": "https://openapi.alipay.com/gateway.do?..."
}
```

### POST /api/alipay/notify（支付宝回调）

支付宝以 `application/x-www-form-urlencoded` POST 回调，必须返回纯文本 `success`（否则支付宝会重试）。

回调处理逻辑：
1. 验证签名（`verifyAlipayNotify`）
2. 判断 `trade_status` 为 `TRADE_SUCCESS` 或 `TRADE_FINISHED`
3. 更新 `recharge_orders` 表：`status = 'completed'`，`txnHash = trade_no`
4. 返回 `"success"`

### GET /api/alipay/quick-pay

快速支付，适合在任意页面直接跳转：

```
/api/alipay/quick-pay?amount=100&subject=1月利息&returnPath=/ledger/37
```

---

## 订单号生成规范

```ts
import { nanoid } from 'nanoid';

// 标准订单：HYJ + 时间戳 + 6位随机
const orderId = `HYJ${Date.now()}${nanoid(6)}`;

// 反馈支付：FB + 时间戳 + 6位随机
const orderId = `FB${Date.now()}${nanoid(6)}`;

// 快速支付：QP + 时间戳 + 6位随机
const orderId = `QP${Date.now()}${nanoid(6)}`;
```

---

## 回调地址构建规范

生产环境必须使用 `x-forwarded-host` 而非 `req.headers.host`，确保 HTTPS 域名正确：

```ts
const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
const hostHeader = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'jiangyuchen.cn';
const host = `${protocol}://${hostHeader}`;
const notifyUrl = `${host}/api/alipay/notify`;
```

---

## 前端支付流程

### 标准流程（需登录用户）

```tsx
// 1. 调用后端创建订单
const res = await fetch('/api/alipay/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ productId, productName, amount }),
});
const { orderId, payUrl } = await res.json();

// 2. 跳转支付宝支付页
window.location.href = payUrl;

// 3. 支付完成后支付宝跳回 /payment/result?orderId=xxx&status=TRADE_SUCCESS
// 4. 前端轮询订单状态确认
const statusRes = await fetch(`/api/alipay/order-status?orderId=${orderId}`, {
  credentials: 'include',
});
const { status } = await statusRes.json(); // 'pending' | 'completed'
```

### 快速支付（无需登录）

```ts
// 直接跳转，适合简单场景
window.location.href = `/api/alipay/quick-pay?amount=100&subject=${encodeURIComponent('1月利息')}`;
```

---

## 数据库表：recharge_orders

订单记录存储在 `recharge_orders` 表（Drizzle schema 定义）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 主键 |
| `userId` | int | 下单用户 ID |
| `orderNo` | varchar | 商户订单号（唯一） |
| `amount` | decimal | 支付金额（元） |
| `currency` | varchar | 货币，固定 `CNY` |
| `network` | varchar | 支付渠道，固定 `ALIPAY` |
| `status` | varchar | `pending` / `completed` / `failed` |
| `txnHash` | varchar | 支付宝交易号（`trade_no`） |
| `expiresAt` | datetime | 订单过期时间（30分钟） |
| `completedAt` | datetime | 支付完成时间 |

---

## 部署流程

每次 `git push main` 触发 GitHub Actions，部署步骤中自动执行：

```bash
node /root/haoyouji-web/scripts/inject-alipay-env.cjs
```

该脚本检查 `ecosystem.config.cjs` 中是否已有 `ALIPAY_APP_ID`，若无则自动注入三个环境变量（App ID、私钥、公钥）。

---

## 测试

```bash
# 运行支付宝相关单元测试
pnpm test server/alipay.test.ts
```

测试覆盖：
- 环境变量是否存在
- SDK 实例化不报错
- 生成 WAP 支付 URL 格式正确

---

## 常见问题

**Q：支付宝回调收不到怎么办？**

确认以下几点：
1. `notifyUrl` 必须是公网可访问的 HTTPS 地址（`jiangyuchen.cn` 已满足）
2. 回调接口必须返回纯文本 `success`（不是 JSON）
3. 支付宝会在 25 小时内重试 8 次，直到收到 `success`

**Q：如何在新功能中接入支付？**

1. 复用 `/api/alipay/create-order` 接口，传入 `productId`、`productName`、`amount`
2. 在 `POST /api/alipay/notify` 回调中根据 `out_trade_no` 前缀判断业务类型，执行对应业务逻辑
3. 或使用 `/api/alipay/quick-pay` 快速跳转（适合金额固定的简单场景）

**Q：如何扩展回调逻辑（如支付后自动结息）？**

在 `alipay-router.ts` 的 `notify` 处理中，`out_trade_no` 包含业务标识前缀（如 `INT` 代表利息支付），根据前缀执行不同的业务逻辑（如调用 `funderAddInterestPayment`）。

---

## 文件位置（haoyouji-web 仓库）

```
server/
  alipay.ts                 ← SDK 初始化 + 工具函数
  alipay-router.ts          ← Express 路由
  alipay.test.ts            ← 单元测试
scripts/
  inject-alipay-env.cjs     ← 部署注入脚本
docs/
  skills/
    alipay-wap-payment.md   ← 本规范文档（供团队查阅）
```
