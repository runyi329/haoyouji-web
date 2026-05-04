/**
 * 上传交易所图标到腾讯云COS
 * 在生产服务器上运行：node scripts/upload-exchange-icons.mjs
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

if (!COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error('❌ 未找到COS密钥，请确认.env文件中配置了COS_SECRET_ID和COS_SECRET_KEY');
  process.exit(1);
}

const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

const icons = [
  {
    localPath: path.join(__dirname, '..', 'client', 'public', 'okx-circle-icon.png'),
    cosKey: 'assets/logos/okx-circle-icon.png',
    name: 'OKX',
  },
  {
    localPath: path.join(__dirname, '..', 'client', 'public', 'binance-circle-icon.png'),
    cosKey: 'assets/logos/binance-circle-icon.png',
    name: '币安',
  },
];

for (const icon of icons) {
  if (!existsSync(icon.localPath)) {
    console.warn(`⚠️  文件不存在: ${icon.localPath}`);
    continue;
  }
  const buffer = readFileSync(icon.localPath);
  try {
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: BUCKET,
        Region: REGION,
        Key: icon.cosKey,
        Body: buffer,
        ContentType: 'image/png',
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${icon.cosKey}`;
    console.log(`✅ ${icon.name} 上传成功: ${url}`);
  } catch (err) {
    console.error(`❌ ${icon.name} 上传失败:`, err.message);
  }
}
