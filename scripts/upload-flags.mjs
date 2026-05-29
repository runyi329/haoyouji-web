#!/usr/bin/env node
/**
 * 下载世界杯48支球队国旗并上传到腾讯云COS
 * 在生产服务器上执行（有COS密钥环境变量）
 */
import { createRequire } from 'module';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 48支参赛球队的国旗代码
const teams = [
  // A组
  { code: 'mx', name: '墨西哥' },
  { code: 'za', name: '南非' },
  { code: 'kr', name: '韩国' },
  { code: 'cz', name: '捷克' },
  // B组
  { code: 'ar', name: '阿根廷' },
  { code: 'ca', name: '加拿大' },
  { code: 'ba', name: '波黑' },
  { code: 'py', name: '巴拉圭' },
  // C组
  { code: 'us', name: '美国' },
  { code: 'uy', name: '乌拉圭' },
  { code: 'pt', name: '葡萄牙' },
  { code: 'ci', name: '科特迪瓦' },
  // D组
  { code: 'qa', name: '卡塔尔' },
  { code: 'ch', name: '瑞士' },
  { code: 'br', name: '巴西' },
  { code: 'ma', name: '摩洛哥' },
  // E组
  { code: 'ht', name: '海地' },
  { code: 'gb-sct', name: '苏格兰' },
  { code: 'au', name: '澳大利亚' },
  { code: 'tr', name: '土耳其' },
  // F组
  { code: 'de', name: '德国' },
  { code: 'cw', name: '库拉索' },
  { code: 'nl', name: '荷兰' },
  { code: 'jp', name: '日本' },
  // G组
  { code: 'gb-eng', name: '英格兰' },
  { code: 'sn', name: '塞内加尔' },
  { code: 'ir', name: '伊朗' },
  { code: 'ec', name: '厄瓜多尔' },
  // H组
  { code: 'es', name: '西班牙' },
  { code: 'dz', name: '阿尔及利亚' },
  { code: 'no', name: '挪威' },
  { code: 'tn', name: '突尼斯' },
  // I组
  { code: 'fr', name: '法国' },
  { code: 'cd', name: '刚果(金)' },
  { code: 'be', name: '比利时' },
  { code: 'jo', name: '约旦' },
  // J组
  { code: 'hr', name: '克罗地亚' },
  { code: 'pa', name: '巴拿马' },
  { code: 'co', name: '哥伦比亚' },
  { code: 'nz', name: '新西兰' },
  // K组
  { code: 'at', name: '奥地利' },
  { code: 'gh', name: '加纳' },
  { code: 'se', name: '瑞典' },
  { code: 'uz', name: '乌兹别克' },
  // L组
  { code: 'sa', name: '沙特' },
  { code: 'iq', name: '伊拉克' },
  { code: 'eg', name: '埃及' },
  { code: 'cv', name: '佛得角' },
];

const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';
const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;

if (!SECRET_ID || !SECRET_KEY) {
  console.error('❌ 缺少 COS_SECRET_ID 或 COS_SECRET_KEY 环境变量');
  process.exit(1);
}

// 动态导入cos-nodejs-sdk-v5
const require = createRequire(import.meta.url);
let COS;
try {
  COS = require('cos-nodejs-sdk-v5');
} catch (e) {
  console.error('❌ 请先安装: npm install cos-nodejs-sdk-v5');
  process.exit(1);
}

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY });

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function uploadToCOS(key, buffer, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }, (err, data) => {
      if (err) reject(err);
      else resolve(`https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`);
    });
  });
}

async function main() {
  const urlMap = {};
  console.log(`开始处理 ${teams.length} 支球队国旗...`);

  for (const team of teams) {
    const code = team.code.toLowerCase();
    const cosKey = `flags/${code}.png`;
    const cosUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${cosKey}`;

    try {
      // 下载国旗（使用80px宽度版本）
      const flagUrl = `https://flagcdn.com/w80/${code}.png`;
      const buffer = await downloadFile(flagUrl);
      
      // 上传到COS
      await uploadToCOS(cosKey, buffer, 'image/png');
      urlMap[code] = cosUrl;
      console.log(`✅ ${team.name} (${code}) -> ${cosUrl}`);
    } catch (err) {
      console.error(`❌ ${team.name} (${code}) 失败: ${err.message}`);
      urlMap[code] = `https://flagcdn.com/w80/${code}.png`; // 回退到flagcdn
    }
  }

  // 输出URL映射JSON，供代码使用
  const outputPath = join(__dirname, '../client/src/flagUrls.json');
  writeFileSync(outputPath, JSON.stringify(urlMap, null, 2));
  console.log(`\n✅ 完成！URL映射已保存到 ${outputPath}`);
}

main().catch(console.error);
