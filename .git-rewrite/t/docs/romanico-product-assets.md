# ROMANICO 罗马尼克 - 商品详情页配图资源

> 生成日期：2026-03-06  
> 商品ID：3（merchant_products.id = 3）  
> 商家：红酒文化商会（ownerMerchantId = 1）

---

## 主图轮播（4张，1:1正方形）

| 序号 | 用途 | CDN 地址（压缩版 WebP） |
|------|------|------------------------|
| 1 | 主图（酒瓶+酒杯，黑背景聚光灯） | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-main-square-Q4xQjKSfZ72zcj4mvWfiMK.webp` |
| 2 | 酒标细节特写 | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-label-closeup-QJ4zBX6VPML4htb6NGWWJM.webp` |
| 3 | 配餐场景（原图） | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/wine-products/romanico-pairing.webp` |
| 4 | 托罗产区葡萄园 | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-vineyard-4s4HB3PTqKbNRi6kR4EGCw.webp` |

---

## 详情长图（3张，3:4竖版，无缝拼接）

| 序号 | 用途 | CDN 地址（压缩版 WebP） |
|------|------|------------------------|
| 1 | 权威评分信息图（RP92/ST91/Peña92） | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-detail-scores-cxJ3VmtjLL2ffmGjkDaoV8.webp` |
| 2 | 酿造工艺图（酒窖橡木桶+工艺说明） | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-detail-winery-Gwdvx3LZ4ZXWeNREVmbCf2.webp` |
| 3 | 配餐建议图（牛排/烤羊排/陈年奶酪） | `https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-detail-pairing-QVENyqABbPfTr4Rm3h6jJi.webp` |

---

## 数据库更新建议

```sql
-- 更新 ROMANICO 商品的主图和轮播图
UPDATE merchant_products SET
  mainImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-main-square-Q4xQjKSfZ72zcj4mvWfiMK.webp',
  imageUrls = JSON_ARRAY(
    'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-main-square-Q4xQjKSfZ72zcj4mvWfiMK.webp',
    'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-label-closeup-QJ4zBX6VPML4htb6NGWWJM.webp',
    'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/wine-products/romanico-pairing.webp',
    'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-vineyard-4s4HB3PTqKbNRi6kR4EGCw.webp'
  )
WHERE id = 3;
```

---

## 页面预览文件

- 预览 HTML：`docs/romanico-product-preview.html`
- 设计规范：参见架构文档 v1.7 第二十三章「商品展示铁规」
