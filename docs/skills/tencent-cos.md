# 腾讯云 COS 图片/文件存储 Skill

## 概述

本项目所有图片、视频、静态资源文件统一存储在腾讯云 COS（对象存储）中，通过 CDN URL 引用。**禁止将图片/视频等大文件直接提交到 GitHub 仓库。**

---

## 存储桶配置

| 配置项 | 值 |
|--------|-----|
| Bucket | `haoyouji-images-1396946788` |
| Region | `ap-shanghai` |
| SecretId | 见服务器 `.env` 文件中的 `COS_SECRET_ID` |
| SecretKey | 见服务器 `.env` 文件中的 `COS_SECRET_KEY` |
| 访问域名 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com` |

> 密钥可在腾讯云控制台 → 访问管理 → API密钥管理 中查看，或联系项目负责人获取。

---

## 使用规范

### 1. 所有图片/视频必须上传到 COS

- 图标、Banner、产品图、头像、背景图等所有静态图片 → 上传 COS
- 视频文件 → 上传 COS
- 代码中只保留 COS 的 URL，不存储文件本体

### 2. 图片压缩规范

上传前必须压缩，避免加载过慢：

| 类型 | 建议格式 | 建议尺寸 | 建议大小 |
|------|---------|---------|---------|
| 图标（Icon） | `.webp` 或 `.png` | 256×256 px | < 50 KB |
| 产品图 | `.webp` | 800×800 px | < 200 KB |
| Banner | `.webp` | 1200×400 px | < 300 KB |
| 头像 | `.webp` | 200×200 px | < 30 KB |
| 视频封面 | `.webp` | 800×450 px | < 150 KB |

压缩工具推荐：
- 命令行：`cwebp input.png -q 85 -o output.webp`
- Python：`pip install Pillow`，使用 `image.save('output.webp', 'WEBP', quality=85)`

### 3. 文件命名规范

```
{分类}/{描述性名称}-{版本或hash}.{ext}

示例：
icons/nvda-3d-icon.webp
icons/aapl-3d-icon.webp
banners/home-banner-v2.webp
products/romanico-tea-01.webp
```

---

## 上传代码示例

### Node.js / TypeScript（服务端）

```typescript
import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

const BUCKET = 'haoyouji-images-1396946788';
const REGION = 'ap-shanghai';
const BASE_URL = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com';

async function uploadFile(localPath: string, cosKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: cosKey,
      Body: fs.createReadStream(localPath),
    }, (err, data) => {
      if (err) reject(err);
      else resolve(`${BASE_URL}/${cosKey}`);
    });
  });
}

// 使用示例
const url = await uploadFile('./icons/nvda-3d-icon.webp', 'icons/nvda-3d-icon.webp');
console.log('上传成功:', url);
```

### Python（脚本上传）

```python
from qcloud_cos import CosConfig, CosS3Client
import os

config = CosConfig(
    Region='ap-shanghai',
    SecretId=os.environ['COS_SECRET_ID'],
    SecretKey=os.environ['COS_SECRET_KEY'],
)
client = CosS3Client(config)

BUCKET = 'haoyouji-images-1396946788'
BASE_URL = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com'

def upload_file(local_path: str, cos_key: str) -> str:
    with open(local_path, 'rb') as f:
        client.put_object(Bucket=BUCKET, Body=f, Key=cos_key)
    return f'{BASE_URL}/{cos_key}'
```

---

## 已上传资源目录

### 图标（icons/）

| 文件名 | 说明 | URL |
|--------|------|-----|
| `icons/btc-3d-icon.webp` | BTC 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/btc-3d-icon.webp` |
| `icons/eth-3d-icon.webp` | ETH 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/eth-3d-icon.webp` |
| `icons/sol-3d-icon.webp` | SOL 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/sol-3d-icon.webp` |
| `icons/nvda-3d-icon.webp` | NVDA 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/nvda-3d-icon.webp` |
| `icons/aapl-3d-icon.webp` | AAPL 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/aapl-3d-icon.webp` |
| `icons/msft-3d-icon.webp` | MSFT 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/msft-3d-icon.webp` |
| `icons/tsla-3d-icon.webp` | TSLA 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/tsla-3d-icon.webp` |
| `icons/amzn-3d-icon.webp` | AMZN 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/amzn-3d-icon.webp` |
| `icons/meta-3d-icon.webp` | META 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/meta-3d-icon.webp` |
| `icons/googl-3d-icon.webp` | GOOGL 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/googl-3d-icon.webp` |
| `icons/nflx-3d-icon.webp` | NFLX 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/nflx-3d-icon.webp` |
| `icons/amd-3d-icon.webp` | AMD 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/amd-3d-icon.webp` |
| `icons/intc-3d-icon.webp` | INTC 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/intc-3d-icon.webp` |
| `icons/coin-3d-icon.webp` | COIN 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/coin-3d-icon.webp` |
| `icons/pltr-3d-icon.webp` | PLTR 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/pltr-3d-icon.webp` |
| `icons/orcl-3d-icon.webp` | ORCL 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/orcl-3d-icon.webp` |
| `icons/mstr-3d-icon.webp` | MSTR 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/mstr-3d-icon.webp` |
| `icons/tsm-3d-icon.webp` | TSM 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/tsm-3d-icon.webp` |
| `icons/hood-3d-icon.webp` | HOOD 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/hood-3d-icon.webp` |
| `icons/wdc-3d-icon.webp` | WDC 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/wdc-3d-icon.webp` |
| `icons/sndk-3d-icon.webp` | SNDK 3D图标 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/sndk-3d-icon.webp` |

---

## 注意事项

1. **SecretId/SecretKey 不得提交到 GitHub 代码**，只在服务端、`.env` 文件或脚本中使用
2. COS Bucket 为公开读取，上传后 URL 可直接访问，无需签名
3. 文件名使用小写字母+连字符，避免空格和特殊字符
4. 定期清理不再使用的文件，避免存储费用浪费
