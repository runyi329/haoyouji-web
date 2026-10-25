/*
 * 将康宝莱中国官网商品详情页中与本商品直接相关的公开图片，转存到自有腾讯云 COS。
 *
 * 运行：node scripts/migrate-herbalife-official-assets.cjs
 * 依赖：项目 .env 中配置 COS_SECRET_ID / COS_SECRET_KEY。
 * 说明：不保存官网带时效参数的原始 URL；每次运行均从对应官方详情页重新解析图片地址。
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const COS = require("cos-nodejs-sdk-v5");

const bucket = process.env.COS_BUCKET || "haoyouji-images-1396946788";
const region = process.env.COS_REGION || "ap-shanghai";
const secretId = process.env.COS_SECRET_ID;
const secretKey = process.env.COS_SECRET_KEY;
if (!secretId || !secretKey) {
  throw new Error("未配置 COS_SECRET_ID 或 COS_SECRET_KEY");
}

const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
const cacheDir = path.resolve("/tmp/herbalife-official-assets-v1");
const outputFile = path.join(cacheDir, "cos-manifest.json");
const COS_BASE = `https://${bucket}.cos.${region}.myqcloud.com/miban-shebei/herbalife/v1`;

/**
 * 只列出商品自身的官方图片：不含官网头尾 Logo、二维码与相关推荐的其他商品图。
 * 其中奶昔两张 2503px 官方大图会走 COS 分片上传，其余图片直接上传。
 */
const assets = [
  {
    product: "herbal-tea-lemon",
    page: "https://www.herbalife.cn/Content/Index/2426",
    needle: "柠檬茶饮小条装透明底方图",
    file: "product-main.png",
    contentType: "image/png",
    role: "当前条装包装主图",
  },
  {
    product: "herbal-tea-lemon",
    page: "https://www.herbalife.cn/Content/Index/2426",
    needle: "H Tea Lemon 1335CH0D",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "柠檬茶饮官方包装图",
  },
  {
    product: "aloe-nutrition",
    page: "https://www.herbalife.cn/Content/Index/2428",
    needle: "芦荟小条装透明底方图",
    file: "product-main.png",
    contentType: "image/png",
    role: "当前条装包装主图",
  },
  {
    product: "aloe-nutrition",
    page: "https://www.herbalife.cn/Content/Index/2428",
    needle: "AloePowder 1408",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "芦荟营养粉官方包装图",
  },
  {
    product: "shake-red-bean",
    page: "https://www.herbalife.cn/Content/Index/2024",
    needle: "康宝莱_红豆随享装",
    file: "product-main.jpg",
    contentType: "image/jpeg",
    role: "红豆薏苡仁随享装官方包装主图",
  },
  {
    product: "shake-red-bean",
    page: "https://www.herbalife.cn/Content/Index/2024",
    needle: "康宝莱_红豆大修图",
    file: "product-hero.jpg",
    contentType: "image/jpeg",
    role: "红豆薏苡仁随享装官方展示图",
  },
  {
    product: "shake-red-bean",
    page: "https://www.herbalife.cn/Content/Index/2024",
    needle: "F1 PPP Redbean合 L866CH0B-icon",
    file: "product-icon.jpg",
    contentType: "image/jpeg",
    role: "红豆薏苡仁随享装官方包装图标",
  },
  {
    product: "shake-red-bean",
    page: "https://www.herbalife.cn/Content/Index/2024",
    needle: "摇摇珠 红豆 轮播图",
    file: "shake-bead.jpg",
    contentType: "image/jpeg",
    role: "红豆薏苡仁随享装官方摇摇珠展示图",
  },
  {
    product: "shake-red-bean",
    page: "https://www.herbalife.cn/Content/Index/2024",
    needle: "F1 PPP Redbean合 L866CH0B.png",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "红豆薏苡仁随享装官方包装图",
  },
  {
    product: "shake-mango",
    page: "https://www.herbalife.cn/Content/Index/2019",
    needle: "康宝莱_芒果随享装",
    file: "product-main.jpg",
    contentType: "image/jpeg",
    role: "芒果随享装官方包装主图",
  },
  {
    product: "shake-mango",
    page: "https://www.herbalife.cn/Content/Index/2019",
    needle: "康宝莱_芒果大修图",
    file: "product-hero.jpg",
    contentType: "image/jpeg",
    role: "芒果随享装官方展示图",
  },
  {
    product: "shake-mango",
    page: "https://www.herbalife.cn/Content/Index/2019",
    needle: "F1 PPP mango合 L867CH0C-icon",
    file: "product-icon.jpg",
    contentType: "image/jpeg",
    role: "芒果随享装官方包装图标",
  },
  {
    product: "shake-mango",
    page: "https://www.herbalife.cn/Content/Index/2019",
    needle: "摇摇珠 芒果 轮播图1",
    file: "shake-bead.jpg",
    contentType: "image/jpeg",
    role: "芒果随享装官方摇摇珠展示图",
  },
  {
    product: "shake-mango",
    page: "https://www.herbalife.cn/Content/Index/2019",
    needle: "F1 PPP mango合 L867CH-0C 官网",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "芒果随享装官方包装图",
  },
  {
    product: "shake-cookie",
    page: "https://www.herbalife.cn/Content/Index/2042",
    needle: "康宝莱_曲奇随享装",
    file: "product-main.jpg",
    contentType: "image/jpeg",
    role: "奶油曲奇随享装官方包装主图",
  },
  {
    product: "shake-cookie",
    page: "https://www.herbalife.cn/Content/Index/2042",
    needle: "康宝莱_曲奇大修图",
    file: "product-hero.jpg",
    contentType: "image/jpeg",
    role: "奶油曲奇随享装官方展示图",
  },
  {
    product: "shake-cookie",
    page: "https://www.herbalife.cn/Content/Index/2042",
    needle: "轮播图_1 750X750",
    file: "product-carousel.jpg",
    contentType: "image/jpeg",
    role: "奶油曲奇随享装官方轮播展示图",
  },
  {
    product: "shake-cookie",
    page: "https://www.herbalife.cn/Content/Index/2042",
    needle: "F1 PPP CC合 L870CH0A-icon",
    file: "product-icon.jpg",
    contentType: "image/jpeg",
    role: "奶油曲奇随享装官方包装图标",
  },
  {
    product: "shake-cookie",
    page: "https://www.herbalife.cn/Content/Index/2042",
    needle: "F1 PPP CC合 L870CH0A 官网",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "奶油曲奇随享装官方包装图",
  },
  {
    product: "ningyouran-sleep-5in1",
    page: "https://www.herbalife.cn/Content/Index/2425",
    needle: "PQQ官网透明底头图",
    file: "product-main.png",
    contentType: "image/png",
    role: "宁悠然恬梦五合饮官方包装主图",
  },
  {
    product: "youth-protein-portable",
    page: "https://www.herbalife.cn/Content/Index/2188",
    needle: "Youth Shake CUTL864 官网",
    file: "product-legacy.png",
    contentType: "image/png",
    role: "智满星蛋白营养粉易享装官方包装图",
  },
  {
    product: "youth-protein-portable",
    page: "https://www.herbalife.cn/Content/Index/2188",
    needle: "多渠道方形750X750",
    file: "product-carousel.jpg",
    contentType: "image/jpeg",
    role: "智满星蛋白营养粉易享装官方轮播图",
  },
  {
    product: "youth-protein-portable",
    page: "https://www.herbalife.cn/Content/Index/2188",
    needle: "20251112_康宝莱_智满星",
    file: "product-main.jpg",
    contentType: "image/jpeg",
    role: "智满星蛋白营养粉易享装官方展示图",
  },
];

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function htmlDecode(value) {
  return value.replaceAll("&amp;", "&");
}

function normalizeAssetName(value) {
  return decode(value).replaceAll("+", " ");
}

async function getImageUrls(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`读取官网页面失败：${response.status}`);
  const html = await response.text();
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  const urls = [];
  for (const tag of imageTags) {
    const attributes = [
      ...tag.matchAll(
        /(?:data-original|data-src|data-lazy|src)\s*=\s*["']([^"']+)["']/gi
      ),
    ];
    for (const attribute of attributes) {
      const url = htmlDecode(attribute[1]);
      if (url && !url.startsWith("data:") && !urls.includes(url))
        urls.push(url);
    }
  }
  return urls;
}

function uploadSmall(localPath, key, contentType) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      },
      error => (error ? reject(error) : resolve())
    );
  });
}

function uploadLarge(localPath, key, contentType) {
  return new Promise((resolve, reject) => {
    cos.sliceUploadFile(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        FilePath: localPath,
        ContentType: contentType,
        SliceSize: 1024 * 1024,
        AsyncLimit: 2,
        CacheControl: "public, max-age=31536000, immutable",
      },
      error => (error ? reject(error) : resolve())
    );
  });
}

async function uploadWithRetry(localPath, key, contentType, bytes) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      if (bytes > 1024 * 1024) {
        await uploadLarge(localPath, key, contentType);
      } else {
        await uploadSmall(localPath, key, contentType);
      }
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`上传重试 ${attempt}/4：${key}（${message}）`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

function objectExists(key) {
  return new Promise(resolve => {
    cos.headObject({ Bucket: bucket, Region: region, Key: key }, error => {
      resolve(!error);
    });
  });
}

(async () => {
  fs.mkdirSync(cacheDir, { recursive: true });
  const urlsByPage = new Map();
  const manifest = [];
  for (const asset of assets) {
    if (!urlsByPage.has(asset.page)) {
      urlsByPage.set(asset.page, await getImageUrls(asset.page));
    }
    const sourceUrl = urlsByPage
      .get(asset.page)
      .find(url => normalizeAssetName(url).includes(asset.needle));
    if (!sourceUrl) {
      throw new Error(`官网页面未找到素材：${asset.needle}`);
    }

    const localDir = path.join(cacheDir, asset.product);
    const localPath = path.join(localDir, asset.file);
    const key = `miban-shebei/herbalife/v1/${asset.product}/${asset.file}`;
    fs.mkdirSync(localDir, { recursive: true });
    if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
      execFileSync(
        "curl",
        [
          "--fail",
          "--location",
          "--retry",
          "6",
          "--retry-all-errors",
          "--connect-timeout",
          "20",
          "--max-time",
          "300",
          "--output",
          localPath,
          sourceUrl,
        ],
        { stdio: "inherit" }
      );
    }

    const bytes = fs.statSync(localPath).size;
    // 1MB 以上图片用分片上传，与红参的超长详情图使用同一可靠策略。
    if (await objectExists(key)) {
      console.log(`已存在，跳过上传：${asset.product}/${asset.file}`);
    } else {
      await uploadWithRetry(localPath, key, asset.contentType, bytes);
    }
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(localPath))
      .digest("hex");
    const url = `${COS_BASE}/${asset.product}/${asset.file}`;
    manifest.push({
      product: asset.product,
      role: asset.role,
      sourcePage: asset.page,
      sourceUrl: sourceUrl.replace(/\?.*$/, ""),
      key,
      url,
      contentType: asset.contentType,
      bytes,
      sha256,
    });
    console.log(
      `已转存：${asset.product}/${asset.file}\t${bytes} bytes\t${url}`
    );
  }
  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `\n完成：${manifest.length} 张官方商品图片已转存。清单：${outputFile}`
  );
})().catch(error => {
  console.error("转存失败：", error);
  process.exit(1);
});
