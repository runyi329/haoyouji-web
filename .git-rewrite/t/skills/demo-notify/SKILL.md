# 好友记演示通知技能

## 功能说明

在客户演示场景中，可即时向对方发送短信或邮件（含支付链接），无需提前准备，实时操作。
所有密钥存储在服务器环境变量中，代码中不包含明文密钥。

---

## 一、发送短信

**触发方式**：用户说"发短信给 [手机号]"

**配置信息**（密钥请查阅服务器 .env 或 GitHub Secrets）：
- 腾讯云 SecretId：环境变量 `TENCENT_SECRET_ID`
- 腾讯云 SecretKey：环境变量 `TENCENT_SECRET_KEY`
- SMS AppId：`1401098628`
- 签名：`北京润仪商业中心`

**已审批通过的模板**：

| 模板ID | 内容 |
|--------|------|
| 2623560 | AI数字员工已经完成你的任务部署，请登录脉动网查看。 |
| 2630924 | 您的AI助理发现 账本订单信息有新更新 请登录查看详情 |
| 2631015 | AI助理报告：你有新客户注册 请登录查看详情。 |
| 2631016 | AI助理报告：你有新客户下单 请登录查看详情。 |

**发送方式**（在 Manus 沙箱直接执行，无需部署）：

```js
import tencentcloud from 'tencentcloud-sdk-nodejs';
// 密钥从沙箱环境变量或用户提供中获取
const client = new tencentcloud.sms.v20210111.Client({
  credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
  region: 'ap-guangzhou',
  profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
});
await client.SendSms({
  SmsSdkAppId: '1401098628',
  SignName: '北京润仪商业中心',
  TemplateId: '2623560',  // 根据需要替换
  TemplateParamSet: [],
  PhoneNumberSet: ['+86手机号'],
});
```

---

## 二、发送邮件

**触发方式**：用户说"发邮件给 [邮箱]，内容是 [内容]"

**SMTP 配置**（密钥请查阅服务器 .env）：
- 服务器：`smtp.qq.com:465`（SSL）
- 账号：环境变量 `QQ_EMAIL_USER`（当前为 tina_u@qq.com）
- 授权码：环境变量 `QQ_EMAIL_PASS`
- 发件人显示名：`好友记 AI 助理`

**发送方式**（在 Manus 沙箱直接执行，无需部署）：

```js
import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com', port: 465, secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});
await transporter.sendMail({
  from: '"好友记 AI 助理" <' + EMAIL_USER + '>',
  to: '收件人邮箱',
  subject: '邮件主题',
  html: '邮件正文（支持 HTML）',
});
```

---

## 三、发送带支付链接的邮件

**触发方式**：用户说"发一封 [金额] 元的支付链接给 [邮箱]"

**支付链接格式**：
```
https://jiangyuchen.cn/api/alipay/quick-pay?amount=金额&subject=商品名称
```

**邮件模板要点**：
- 显示金额（红色大字）
- 蓝色"立即支付宝付款"按钮，href 指向上方链接
- 点击后直接跳转支付宝完成付款

**示例**（3元）：
```
https://jiangyuchen.cn/api/alipay/quick-pay?amount=3&subject=脉动-商品购买
```

---

## 注意事项

- 以上操作均在 Manus 沙箱中直接调用 API，**无需推送 GitHub 或部署服务器**，实时发送
- 需要先在沙箱安装依赖：`npm install tencentcloud-sdk-nodejs nodemailer`（已安装则跳过）
- 短信模板内容固定，不可修改；如需新内容需在腾讯云控制台申请新模板
- 实际密钥由用户在对话中提供，或从已知配置中读取
