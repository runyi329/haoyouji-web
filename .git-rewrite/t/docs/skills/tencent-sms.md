---
name: tencent-sms
description: 好友记项目腾讯云短信服务全套配置规范。包含商户账号、App ID、签名、模板ID、SDK初始化、发送验证码、发送自定义短信、服务状态检查的完整流程。凡是需要发送短信（验证码、通知、告警）的功能，必须遵循此规范。
---

# 腾讯云短信服务全套配置规范

## 商户基本信息

| 配置项 | 值 |
|--------|-----|
| **SDK** | `tencentcloud-sdk-nodejs@^4.1.206` |
| **API 版本** | `v20210111` |
| **接入点** | `sms.tencentcloudapi.com` |
| **地域** | `ap-guangzhou`（广州） |
| **短信应用 ID** | `1401098628` |
| **短信签名** | `北京润仪商业中心` |
| **验证码模板 ID** | `2328724`（含验证码+有效期两个参数） |
| **通知模板 ID** | `2623560`（无参数，固定内容通知） |

---

## 密钥配置

密钥通过 GitHub Secrets 管理，每次部署时由 `zz-update-sms-config.yml` 工作流写入服务器 `.env` 文件。

### GitHub Secrets 名称

| Secret 名称 | 说明 |
|-------------|------|
| `TENCENT_SMS_SECRET_ID` | 腾讯云 API SecretId（最新于 2026-04-18 更新） |
| `TENCENT_SMS_SECRET_KEY` | 腾讯云 API SecretKey（最新于 2026-04-18 更新） |

### 服务器 .env 环境变量名称

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `COS_SECRET_ID` | 腾讯云 SecretId（与 COS 共用同一对密钥） | `AKIDxxx...` |
| `COS_SECRET_KEY` | 腾讯云 SecretKey | `xxxxx...` |
| `TENCENT_SMS_APP_ID` | 短信应用 ID | `1401098628` |
| `TENCENT_SMS_SIGN_NAME` | 短信签名 | `北京润仪商业中心` |
| `TENCENT_SMS_TEMPLATE_ID` | 默认短信模板 ID | `2623560` |
| `TENCENT_SMS_REGION` | 地域 | `ap-guangzhou` |

> **注意**：腾讯云短信与 COS（对象存储）共用同一对 SecretId/SecretKey，变量名为 `COS_SECRET_ID` / `COS_SECRET_KEY`。

---

## 文件结构

```
server/
  sms-service.ts              ← 短信服务类（单例导出）
scripts/
  send-sms-alert.sh           ← 命令行测试发送脚本
.github/workflows/
  zz-update-sms-config.yml    ← 更新服务器 SMS 配置（含密钥）
  zz-send-test-sms.yml        ← 手动触发发送测试短信
  zz-check-sms-config.yml     ← 检查 SMS 配置状态
  zz-sms-send.yml             ← 推送触发发送短信
```

---

## 核心类：SmsService（server/sms-service.ts）

### 导入与使用

```ts
import { smsService } from './sms-service';
// smsService 是单例，项目启动时自动初始化
```

### 初始化逻辑

SDK 在构造函数中自动初始化，读取以下环境变量：

```ts
const TENCENT_CLOUD_SECRET_ID = process.env.COS_SECRET_ID || "";
const TENCENT_CLOUD_SECRET_KEY = process.env.COS_SECRET_KEY || "";
const TENCENT_SMS_REGION = process.env.TENCENT_SMS_REGION || "ap-guangzhou";
```

若 SecretId 或 SecretKey 为空，服务标记为不可用（`isInitialized = false`），不抛错，仅打印警告。

---

## 核心方法

### 1. 发送验证码短信

```ts
const result = await smsService.sendVerificationCode(
  '13127919173',  // 手机号（不含+86）
  '123456',       // 验证码
  5               // 有效期（分钟），默认5分钟
);
// result: { success: true, messageId: 'SerialNo', phoneNumber, code }
```

对应模板 `2328724`，模板参数：`[验证码, 有效期分钟数]`

模板内容示例：`您的验证码为{1}，{2}分钟内有效，请勿泄露。`

### 2. 发送自定义短信（指定模板）

```ts
const result = await smsService.sendCustomMessage(
  '13127919173',   // 手机号（不含+86）
  '2623560',       // 模板 ID
  []               // 模板参数数组（模板2623560无参数）
);
// result: { Code: 'Ok', Message: 'send success', SerialNo: 'xxx' }
```

### 3. 生成随机验证码

```ts
const code = smsService.generateVerificationCode(6); // 默认6位纯数字
```

### 4. 检查服务状态

```ts
const status = await smsService.checkServiceStatus();
// status: { available: true, template: { id, name, content, status, statusText } }
// 或: { available: false, reason: '...' }
```

### 5. 获取所有模板列表

```ts
const templates = await smsService.getTemplates();
// templates: [{ id, name, content, status, statusText, createTime, reviewReply }]
```

---

## 在 tRPC 路由中的调用示例

```ts
import { smsService } from "./sms-service";

// 发送通知短信（无参数模板）
const smsTemplateId = process.env.TENCENT_SMS_TEMPLATE_ID || '2623560';
const result = await smsService.sendCustomMessage(
  userPhone,
  smsTemplateId,
  []
);
const ok = (result as any)?.Code === 'Ok';
if (!ok) {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '短信发送失败' });
}
```

---

## 错误码映射

| 腾讯云错误码 | 中文说明 |
|-------------|---------|
| `exceeds the upper limit` | 该手机号今日收到短信条数已达上限，请明天再试 |
| `template content` | 短信模板参数不匹配，请联系管理员 |
| `invalid phone` / `invalid mobile` | 手机号码格式不正确 |
| `AuthFailure` | 短信服务认证失败，请联系管理员 |
| `LimitExceeded` | 发送频率超限，请稍后再试 |
| `InternalError` | 短信服务内部错误，请稍后再试 |
| `AuthFailure.SecretIdNotFound` | API 密钥无效 |
| `UnsupportedOperation` | 短信服务未开通 |

---

## 手机号格式规范

发送时统一加 `+86` 前缀：

```ts
PhoneNumberSet: [`+86${phoneNumber}`]  // phoneNumber 不含+86
```

---

## 更新密钥流程

当腾讯云密钥需要更换时：

1. 在 GitHub 仓库 Settings → Secrets 中更新 `TENCENT_SMS_SECRET_ID` 和 `TENCENT_SMS_SECRET_KEY`
2. 手动触发 `.github/workflows/zz-update-sms-config.yml` 工作流（push 该文件即可触发）
3. 工作流自动通过 SSH 更新服务器 `.env` 并重启 PM2

---

## 测试短信发送

```bash
# 通过 GitHub Actions 手动触发（workflow_dispatch）
# 工作流：zz-send-test-sms.yml
# 默认发送到 13127919173，模板参数：验证码 888888，有效期 5 分钟
```

---

## 文件位置（haoyouji-web 仓库）

```
server/
  sms-service.ts              ← 短信服务（唯一入口）
docs/
  skills/
    tencent-sms.md            ← 本规范文档（供团队查阅）
```
