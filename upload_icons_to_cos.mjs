import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const COS_SECRET_ID = process.env.COS_SECRET_ID;
const COS_SECRET_KEY = process.env.COS_SECRET_KEY;
const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

if (!COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error('❌ 缺少 COS_SECRET_ID 或 COS_SECRET_KEY 环境变量');
  process.exit(1);
}

const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

// 分类ID → 图标文件名映射
const iconMap = {
  39: 'icon_39.png',
  40: 'icon_40.png',
  41: 'icon_41.png',
  42: 'icon_42.png',
  43: 'icon_43.png',
  44: 'icon_44.png',
  45: 'icon_45.png',
  46: 'icon_46.png',
  47: 'icon_47.png',
  48: 'icon_48.png',
  49: 'icon_49.png',
  50: 'icon_50.png',
  51: 'icon_51.png',
  52: 'icon_52.png',
  53: 'icon_53.png',
};

const DB_URL = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
const conn = await mysql.createConnection(DB_URL);

const results = {};

for (const [id, filename] of Object.entries(iconMap)) {
  const filePath = `/home/ubuntu/icons_download/${filename}`;
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件不存在: ${filePath}`);
    continue;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const cosKey = `icons/category_${id}.png`;

  try {
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: BUCKET,
        Region: REGION,
        Key: cosKey,
        Body: fileBuffer,
        ContentType: 'image/png',
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const cosUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${cosKey}`;
    results[id] = cosUrl;
    console.log(`✅ 上传成功 [${id}]: ${cosUrl}`);

    // 更新数据库
    await conn.execute('UPDATE merchant_product_categories SET iconUrl=? WHERE id=?', [cosUrl, id]);
    console.log(`   📝 数据库已更新 id=${id}`);
  } catch (err) {
    console.error(`❌ 上传失败 [${id}]:`, err.message);
  }
}

await conn.end();
console.log('\n✅ 全部完成！共处理', Object.keys(results).length, '个图标');
