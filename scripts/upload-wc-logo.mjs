#!/usr/bin/env node
import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读取.env文件
const envPaths = [
  '/tmp/haoyouji-web/.env',
  '/root/haoyouji-web/.env',
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=\s#][^=]*)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
    console.log(`✅ 已加载环境变量: ${envPath}`);
    break;
  }
}

const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

if (!COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error('❌ 未找到COS密钥');
  process.exit(1);
}

const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });
const iconPath = '/home/ubuntu/upload/wc2026_logo2.png';
const key = 'assets/wc2026-logo.png';

if (!fs.existsSync(iconPath)) {
  console.error(`❌ 图标文件不存在: ${iconPath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(iconPath);
console.log(`📤 上传世界杯Logo到COS: ${key}`);

cos.putObject({
  Bucket: BUCKET,
  Region: REGION,
  Key: key,
  Body: fileBuffer,
  ContentType: 'image/png',
}, (err, data) => {
  if (err) {
    console.error('❌ 上传失败:', err);
    process.exit(1);
  }
  const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
  console.log(`✅ 上传成功！URL: ${url}`);
});
