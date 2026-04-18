#!/bin/bash
# 发送测试短信脚本 - 在生产服务器上运行
set -e

cd /root/haoyouji-web

# 加载环境变量
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "=== 短信配置检查 ==="
echo "APP_ID前4位: ${TENCENT_SMS_APP_ID:0:4}***"
echo "SIGN: $TENCENT_SMS_SIGN_NAME"
echo "TEMPLATE: $TENCENT_SMS_TEMPLATE_ID"
echo "REGION: $TENCENT_SMS_REGION"
echo ""

PHONE="${1:-13127919173}"
echo "=== 发送测试短信到 $PHONE ==="

# 写入临时Node.js脚本
cat > /tmp/send_sms_test.js << 'NODESCRIPT'
const tc = require('/root/haoyouji-web/node_modules/tencentcloud-sdk-nodejs/index.js');
const SmsClient = tc.sms.v20210111.Client;
const client = new SmsClient({
  credential: {
    secretId: process.env.COS_SECRET_ID,
    secretKey: process.env.COS_SECRET_KEY
  },
  region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
  profile: {
    httpProfile: { endpoint: 'sms.tencentcloudapi.com' }
  }
});

const phone = process.argv[2] || '13127919173';
const params = {
  SmsSdkAppId: process.env.TENCENT_SMS_APP_ID,
  SignName: process.env.TENCENT_SMS_SIGN_NAME,
  TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID,
  PhoneNumberSet: ['+86' + phone],
  TemplateParamSet: []
};

console.log('发送参数:', JSON.stringify({
  SmsSdkAppId: params.SmsSdkAppId,
  SignName: params.SignName,
  TemplateId: params.TemplateId,
  PhoneNumberSet: params.PhoneNumberSet
}));

client.SendSms(params).then(r => {
  const s = r.SendStatusSet[0];
  if (s.Code === 'Ok') {
    console.log('SUCCESS! SerialNo:', s.SerialNo, 'Fee:', s.Fee);
  } else {
    console.log('FAIL:', s.Code, s.Message);
    process.exit(1);
  }
}).catch(e => {
  console.error('ERROR:', e.code, e.message);
  process.exit(1);
});
NODESCRIPT

node /tmp/send_sms_test.js "$PHONE"
