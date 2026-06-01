/**
 * 上传AI旅行海报到腾讯云COS
 * 在生产服务器上运行：node scripts/upload-ai-travel-banner.mjs
 * 需要在服务器 .env 中配置 COS_SECRET_ID 和 COS_SECRET_KEY
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

if (!COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error('未找到COS密钥，请在.env中配置 COS_SECRET_ID 和 COS_SECRET_KEY');
  process.exit(1);
}

const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

const banners = [
  {
    localPath: path.join(__dirname, '..', 'client', 'public', 'ai-travel-banner.png'),
    cosKey: 'assets/banners/ai-travel-banner.png',
    name: 'AI环游世界海报',
  },
];

for (const item of banners) {
  if (!existsSync(item.localPath)) {
    console.warn(`文件不存在，跳过: ${item.localPath}`);
    continue;
  }
  const buffer = readFileSync(item.localPath);
  await new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: item.cosKey,
        Body: buffer,
        ContentType: 'image/png',
      },
      (err, data) => {
        if (err) {
          console.error(`上传失败 ${item.name}:`, err.message);
          reject(err);
        } else {
          const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${item.cosKey}`;
          console.log(`上传成功 ${item.name}: ${url}`);
          resolve(data);
        }
      }
    );
  });
}
console.log('AI旅行海报上传完成');
