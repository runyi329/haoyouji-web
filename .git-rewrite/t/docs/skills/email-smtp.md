---
name: email-smtp
description: 好友记项目 QQ 邮箱 SMTP 邮件发送全套配置规范。包含 SMTP 账号、授权码、nodemailer 初始化、账本备份邮件（带 Excel 附件）、担保缺口预警邮件、测试邮件三种场景的完整实现。凡是需要发送邮件的功能，必须遵循此规范。
---

# QQ 邮箱 SMTP 邮件发送全套配置规范

## 账号基本信息

| 配置项 | 值 |
|--------|-----|
| **SDK** | `nodemailer@^8.0.1` |
| **SMTP 服务器** | `smtp.qq.com` |
| **端口** | `465` |
| **加密方式** | SSL（`secure: true`） |
| **发件邮箱** | `tina_u@qq.com` |
| **授权码** | `wqettalptfmebgdf` |

> **说明**：授权码不是 QQ 密码，是在 QQ 邮箱设置 → 账户 → POP3/SMTP 服务中生成的专用授权码。

---

## 密钥配置

SMTP 账号和授权码**硬编码**在 `server/email-service.ts` 中（未使用环境变量），部署时无需额外配置。

若需迁移为环境变量，可参考以下变量名约定：

| 变量名 | 说明 |
|--------|------|
| `SMTP_USER` | 发件邮箱地址，`tina_u@qq.com` |
| `SMTP_PASS` | QQ 邮箱授权码，`wqettalptfmebgdf` |

相关脚本（`scripts/setup-smtp-env.sh`、`scripts/deploy-backup-feature.sh`）中已使用上述变量名。

---

## 文件结构

```
server/
  email-service.ts            ← 邮件服务（三个导出函数）
scripts/
  setup-smtp-env.sh           ← 配置服务器 SMTP 环境变量脚本
  deploy-backup-feature.sh    ← 部署备份功能脚本（含 SMTP 配置）
```

---

## SMTP 配置（server/email-service.ts）

```ts
import nodemailer from 'nodemailer';

const SMTP_CONFIG = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true,         // SSL，465端口必须为true
  auth: {
    user: 'tina_u@qq.com',
    pass: 'wqettalptfmebgdf',  // QQ邮箱授权码
  },
};

// transporter 延迟创建（单例），避免启动时报错
let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return _transporter;
}
```

---

## 三个导出函数

### 1. sendBackupEmail — 账本备份邮件（带 Excel 附件）

**场景**：账本定期自动备份，将 Excel 文件发送给账本成员。

```ts
import { sendBackupEmail } from './email-service';

await sendBackupEmail({
  to: 'user@example.com',
  ledgerName: '脉动共享账本',
  excelBuffer: Buffer,          // Excel 文件内容
  stats: {
    totalRecords: 100,          // 记录总数
    earliestDate: '2024-01-01', // 最早记录日期
    latestDate: '2024-12-31',   // 最新记录日期
    totalIncome: 10000.00,      // 总收入
    totalExpense: 8000.00,      // 总支出
    balance: 2000.00,           // 结余
  },
});
```

**邮件格式**：
- 发件人：`脉动共享账本备份 <tina_u@qq.com>`
- 主题：`【脉动共享账本备份】{ledgerName} ({日期})`
- 正文：HTML，含账本统计表格
- 附件：`{ledgerName}_账目备份_{日期}.xlsx`

---

### 2. sendAlertEmail — 担保缺口预警邮件

**场景**：AI 智能监控发现担保缺口超过阈值时，自动发送预警邮件给资方。

```ts
import { sendAlertEmail } from './email-service';

await sendAlertEmail({
  to: 'funder@example.com',
  userName: '张三',
  coin: 'BTC',
  buyValue: 10000.00,           // 买入价值（U）
  collateralValue: 8000.00,     // 担保物当前价值（U）
  accruedInterest: 500.00,      // 待结利息（U）
  gapAmount: 2500.00,           // 担保缺口（U）
  gapPct: 25,                   // 缺口占比（%）
  templateVars: {               // 可选：覆盖默认模板变量
    senderName: '好友记 AI 通知',
    headerTitle: '🔔 担保缺口提醒',
    // ... 其他变量
  },
});
```

**邮件格式**：
- 发件人：`好友记 AI 通知 <tina_u@qq.com>`
- 主题：`《好友记》{coin} 订单担保缺口提醒（已超过 {gapPct}%）`
- 正文：蓝色渐变头部 + 橙色预警卡片 + 数据明细 + 温馨提示

**可自定义的模板变量**（`templateVars`）：

| 变量名 | 默认值 |
|--------|--------|
| `senderName` | `好友记 AI 通知` |
| `headerTitle` | `🔔 担保缺口提醒` |
| `headerSubtitle` | `来自好友记 · AI 智能通知` |
| `greeting` | `您好，{userName}！` |
| `alertTitle` | `担保缺口已超过 {gapPct}%` |
| `tipText` | 默认提示文案 |
| `footerText` | 默认页脚文案 |
| `subjectTemplate` | `《好友记》{coin} 订单担保缺口提醒（已超过 {gapPct}%）` |

---

### 3. sendBackupTestEmail — 备份测试邮件

**场景**：测试 SMTP 配置是否正常，发送一封无附件的测试邮件。

```ts
import { sendBackupTestEmail } from './email-service';

await sendBackupTestEmail({
  to: 'test@example.com',
  templateVars: {               // 可选
    senderName: '脉动共享账本备份',
    headerTitle: '账本自动备份',
    // ...
  },
});
```

---

## 在 tRPC 路由中的调用示例

```ts
import { sendAlertEmail, sendBackupTestEmail } from "./email-service";

// 发送预警邮件
try {
  await sendAlertEmail({
    to: userEmail,
    userName: user.name,
    coin: order.coin,
    buyValue: 10000,
    collateralValue: 7500,
    accruedInterest: 300,
    gapAmount: 2800,
    gapPct: 28,
  });
} catch (emailErr: any) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `邮件发送失败: ${emailErr?.message || '未知错误'}`,
  });
}
```

---

## 邮件 HTML 设计规范

两种邮件均使用内联 CSS，兼容主流邮件客户端：

| 邮件类型 | 头部颜色 | 主色调 |
|---------|---------|--------|
| 账本备份邮件 | 红色 `#D32F2F` | 红色系 |
| 担保缺口预警邮件 | 蓝色渐变 `#1A56DB → #3B82F6` | 蓝色+橙色预警 |

---

## 常见问题

**Q：邮件发送失败，提示认证错误？**

检查以下几点：
1. 确认 QQ 邮箱已开启 SMTP 服务（设置 → 账户 → POP3/SMTP 服务）
2. 授权码 `wqettalptfmebgdf` 是否仍有效（授权码可能过期或被重置）
3. 端口 465 需使用 SSL（`secure: true`），不要改为 587

**Q：如何更换发件邮箱？**

修改 `server/email-service.ts` 中的 `SMTP_CONFIG.auth.user` 和 `pass`，同时更新所有 `from` 字段中的邮箱地址。

**Q：如何新增邮件模板？**

在 `server/email-service.ts` 中新增一个 `export async function sendXxxEmail(...)` 函数，复用 `getTransporter()` 发送，保持与现有函数相同的结构。

---

## 文件位置（haoyouji-web 仓库）

```
server/
  email-service.ts            ← 邮件服务（唯一入口）
docs/
  skills/
    email-smtp.md             ← 本规范文档（供团队查阅）
```
