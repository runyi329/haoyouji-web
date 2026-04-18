#!/bin/bash
# 发送测试短信脚本 - 直接调用腾讯云SMS HTTP API，不依赖SDK
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
  set -a
  source .env
  set +a
fi

# 如果传入了新密钥参数，优先使用
if [ -n "$SMS_SECRET_ID" ]; then
  export COS_SECRET_ID="$SMS_SECRET_ID"
fi
if [ -n "$SMS_SECRET_KEY" ]; then
  export COS_SECRET_KEY="$SMS_SECRET_KEY"
fi

echo "=== 短信配置检查 ==="
echo "SecretId前8位: ${COS_SECRET_ID:0:8}***"
echo "APP_ID前4位: ${TENCENT_SMS_APP_ID:0:4}***"
echo "SIGN: $TENCENT_SMS_SIGN_NAME"
echo "TEMPLATE: $TENCENT_SMS_TEMPLATE_ID"
echo "REGION: $TENCENT_SMS_REGION"
echo ""

PHONE="${1:-13127919173}"
echo "=== 发送测试短信到 $PHONE ==="

# 用Node.js调用腾讯云SMS API（纯HTTP，不依赖SDK）
node << NODESCRIPT
const https = require('https');
const crypto = require('crypto');

const secretId = process.env.COS_SECRET_ID;
const secretKey = process.env.COS_SECRET_KEY;
const region = process.env.TENCENT_SMS_REGION || 'ap-guangzhou';
const appId = process.env.TENCENT_SMS_APP_ID;
const signName = process.env.TENCENT_SMS_SIGN_NAME;
const templateId = process.env.TENCENT_SMS_TEMPLATE_ID;
const phone = '+86${PHONE}';

if (!secretId || !secretKey || !appId || !signName || !templateId) {
  console.error('ERROR: 缺少必要的环境变量');
  console.error('secretId:', secretId ? '已设置' : '缺失');
  console.error('secretKey:', secretKey ? '已设置' : '缺失');
  console.error('appId:', appId || '缺失');
  console.error('signName:', signName || '缺失');
  console.error('templateId:', templateId || '缺失');
  process.exit(1);
}

const service = 'sms';
const host = 'sms.tencentcloudapi.com';
const action = 'SendSms';
const version = '2021-01-11';
const timestamp = Math.floor(Date.now() / 1000);
const date = new Date(timestamp * 1000).toISOString().split('T')[0];

const payload = JSON.stringify({
  SmsSdkAppId: appId,
  SignName: signName,
  TemplateId: templateId,
  PhoneNumberSet: [phone],
  TemplateParamSet: []
});

function sha256(message, secret, encoding) {
  const hmac = crypto.createHmac('sha256', secret);
  return hmac.update(message).digest(encoding);
}
function getHash(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

const hashedRequestPayload = getHash(payload);
const canonicalRequest = [
  'POST',
  '/',
  '',
  'content-type:application/json; charset=utf-8\n' + 'host:' + host + '\n',
  'content-type;host',
  hashedRequestPayload
].join('\n');

const credentialScope = date + '/' + service + '/tc3_request';
const stringToSign = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + credentialScope + '\n' + getHash(canonicalRequest);

const secretDate = sha256(date, 'TC3' + secretKey);
const secretService = sha256(service, secretDate);
const secretSigning = sha256('tc3_request', secretService);
const signature = sha256(stringToSign, secretSigning, 'hex');

const authorization = 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope +
  ', SignedHeaders=content-type;host, Signature=' + signature;

const options = {
  hostname: host,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': region,
    'Authorization': authorization
  }
};

console.log('发送到:', phone);
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      const resp = result.Response;
      if (resp.Error) {
        console.error('API ERROR:', resp.Error.Code, resp.Error.Message);
        process.exit(1);
      }
      const s = resp.SendStatusSet[0];
      if (s.Code === 'Ok') {
        console.log('SUCCESS! SerialNo:', s.SerialNo, 'Fee:', s.Fee);
      } else {
        console.error('SEND FAIL:', s.Code, s.Message);
        process.exit(1);
      }
    } catch(e) {
      console.error('Parse error:', e.message, 'Raw:', data.substring(0, 200));
      process.exit(1);
    }
  });
});
req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});
req.write(payload);
req.end();
NODESCRIPT
