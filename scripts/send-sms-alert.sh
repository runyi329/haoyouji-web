#!/bin/bash
# 发送测试短信脚本 - 在生产服务器上运行
set -e

# 查找项目目录
APP_DIR=""
for d in /root/haoyouji-web /home/ubuntu/haoyouji-web /var/www/haoyouji-web; do
  if [ -f "$d/.env" ]; then
    APP_DIR="$d"
    break
  fi
done

if [ -z "$APP_DIR" ]; then
  echo "ERROR: 找不到项目目录"
  exit 1
fi

echo "项目目录: $APP_DIR"
cd "$APP_DIR"

# 加载环境变量
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
fi

echo "=== 短信配置检查 ==="
echo "APP_ID前4位: ${TENCENT_SMS_APP_ID:0:4}***"
echo "SIGN: $TENCENT_SMS_SIGN_NAME"
echo "TEMPLATE: $TENCENT_SMS_TEMPLATE_ID"
echo "REGION: $TENCENT_SMS_REGION"
echo ""

PHONE="${1:-13127919173}"
echo "=== 发送测试短信到 $PHONE ==="

# 查找tencentcloud-sdk-nodejs
SDK_PATH=""
for p in \
  "$APP_DIR/node_modules/tencentcloud-sdk-nodejs/index.js" \
  "$APP_DIR/node_modules/.pnpm/tencentcloud-sdk-nodejs@4.0.1036/node_modules/tencentcloud-sdk-nodejs/index.js"; do
  if [ -f "$p" ]; then
    SDK_PATH="$p"
    break
  fi
done

# 如果找不到，用find搜索
if [ -z "$SDK_PATH" ]; then
  SDK_PATH=$(find "$APP_DIR/node_modules" -name "index.js" -path "*/tencentcloud-sdk-nodejs/index.js" 2>/dev/null | head -1)
fi

if [ -z "$SDK_PATH" ]; then
  echo "ERROR: 找不到 tencentcloud-sdk-nodejs"
  echo "尝试用npm安装..."
  cd /tmp && npm install tencentcloud-sdk-nodejs 2>&1 | tail -3
  SDK_PATH="/tmp/node_modules/tencentcloud-sdk-nodejs/index.js"
fi

echo "SDK路径: $SDK_PATH"

# 写入临时Node.js脚本
cat > /tmp/send_sms_test.js << NODESCRIPT
const tc = require('$SDK_PATH');
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
  SmsSdkAppId: params.SmsSdkAppId ? params.SmsSdkAppId.substring(0,4)+'***' : 'MISSING',
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
