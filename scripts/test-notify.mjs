// 测试发送邮件和短信
import nodemailer from 'nodemailer';
import tencentcloud from 'tencentcloud-sdk-nodejs';
import { readFileSync } from 'fs';

// 读取生产环境变量
const envPath = '/home/ubuntu/haoyouji-full/.env.production';
let envVars = {};
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.log('未找到 .env.production，尝试读取环境变量');
}

// ===== 发送邮件 =====
const SMTP_CONFIG = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: {
    user: 'tina_u@qq.com',
    pass: 'wqettalptfmebgdf',
  },
};

const transporter = nodemailer.createTransport(SMTP_CONFIG);

const now = new Date();
const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const coin = 'BTC';
const buyValue = 50000;
const collateralValue = 37500;
const accruedInterest = 2500;
const gapAmount = 10000;
const gapPct = 20;
const userName = '胡';

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.c{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1A56DB 0%,#3B82F6 100%);padding:28px 24px;text-align:center}
.h h1{color:#fff;font-size:20px;margin:0 0 6px;font-weight:600}
.h p{color:rgba(255,255,255,.85);font-size:13px;margin:0}
.b{padding:24px}
.g{font-size:15px;color:#1A2340;margin-bottom:16px}
.ac{background:#FFF7ED;border:1.5px solid #FED7AA;border-radius:12px;padding:16px;margin-bottom:20px}
.at{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#C2410C;margin-bottom:12px}
.dot{width:8px;height:8px;background:#F97316;border-radius:50%;display:inline-block;flex-shrink:0}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #FDE8D0;font-size:13px}
.row:last-child{border-bottom:none}
.lbl{color:#6B7280}.val{font-weight:600;color:#1A2340}
.red{color:#EF4444}.orange{color:#F97316}
.tip{background:#F0F4FF;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7;margin-bottom:20px}
.tip strong{color:#1A56DB}
.ft{text-align:center;padding:16px 24px;background:#F9FAFB;font-size:12px;color:#9CA3AF;border-top:1px solid #F3F4F6}
.badge{display:inline-block;background:#EFF6FF;color:#1A56DB;font-size:11px;padding:3px 10px;border-radius:20px;margin-top:4px}
</style></head>
<body><div class="c">
<div class="h"><h1>🔔 担保缺口提醒</h1><p>【测试】来自好友记 · AI 智能通知</p></div>
<div class="b">
<p class="g">您好，${userName}！</p>
<div class="ac">
  <div class="at"><span class="dot"></span>&nbsp;【测试】担保缺口已超过 ${gapPct}%</div>
  <div class="row"><span class="lbl">标的币种</span><span class="val">${coin}</span></div>
  <div class="row"><span class="lbl">买入价值</span><span class="val">${buyValue.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">担保物当前价值</span><span class="val">${collateralValue.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">待结利息</span><span class="val">${accruedInterest.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">担保缺口</span><span class="val red">-${gapAmount.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">缺口占比</span><span class="val orange">${gapPct}%</span></div>
</div>
<div class="tip"><strong>温馨提示：</strong><p>这是一条测试邮件，数据为模拟值。</p><p>如您收到此邮件，说明邮件通知功能已正常配置。</p></div>
<div style="text-align:center"><div class="badge">提醒时间：${dateStr}</div></div>
</div>
<div class="ft">此邮件由好友记 AI 智能通知系统自动发送，请勿直接回复。</div>
</div></body></html>`;

console.log('📧 正在发送测试邮件至 1821113@qq.com ...');
try {
  await transporter.sendMail({
    from: '"好友记 AI 通知" <tina_u@qq.com>',
    to: '1821113@qq.com',
    subject: '【测试】《好友记》BTC 订单担保缺口提醒',
    html,
  });
  console.log('✅ 邮件发送成功！');
} catch (e) {
  console.error('❌ 邮件发送失败:', e.message);
}

// ===== 发送短信 =====
const secretId = envVars['COS_SECRET_ID'] || process.env.COS_SECRET_ID || '';
const secretKey = envVars['COS_SECRET_KEY'] || process.env.COS_SECRET_KEY || '';
const appId = envVars['TENCENT_SMS_APP_ID'] || process.env.TENCENT_SMS_APP_ID || '';
const signName = envVars['TENCENT_SMS_SIGN_NAME'] || process.env.TENCENT_SMS_SIGN_NAME || '';
const templateId = envVars['TENCENT_SMS_TEMPLATE_ID'] || process.env.TENCENT_SMS_TEMPLATE_ID || '2623560';

console.log('\n📱 正在发送测试短信至 13127919173 ...');
console.log(`   secretId: ${secretId ? secretId.slice(0,8)+'...' : '未配置'}`);
console.log(`   appId: ${appId || '未配置'}`);
console.log(`   signName: ${signName || '未配置'}`);
console.log(`   templateId: ${templateId}`);

if (!secretId || !secretKey || !appId) {
  console.error('❌ 腾讯云短信配置不完整，跳过短信发送');
  process.exit(0);
}

try {
  const SmsClient = tencentcloud.sms.v20210111.Client;
  const client = new SmsClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
  });

  const result = await client.SendSms({
    SmsSdkAppId: appId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [],
    PhoneNumberSet: ['+8613127919173'],
  });

  const item = result?.SendStatusSet?.[0];
  if (item?.Code === 'Ok') {
    console.log('✅ 短信发送成功！');
  } else {
    console.error('❌ 短信发送失败:', item?.Code, item?.Message);
  }
} catch (e) {
  console.error('❌ 短信发送异常:', e.message);
}
