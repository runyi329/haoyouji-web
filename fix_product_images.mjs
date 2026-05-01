import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection(DB_URL);

// 独立的产品主图（白色背景，正方形展示图）
const mainImageUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/nLXYmZWnvPSxEfIe.png';

// 6张详情长图（蓝色系，无缝衔接）
const detailImages = JSON.stringify([
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_1_v2-X5dyQAA6DEbLzoFq5o6K2z.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_2-RcioVPUFxQjUmaouWghPcm.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_3-ZMgzcqTWZD9GgRXxtUteWF.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_4-c9pLtbFpdY6eF6W2FonbiY.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_5-RDuGg2KS9vyNnCrPs2yUyn.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_6-5qDbVgNLrUfyfdwHHqESzq.png',
]);

await conn.execute(
  'UPDATE merchant_products SET mainImageUrl=?, imageUrls=? WHERE id=20',
  [mainImageUrl, detailImages]
);

console.log('✅ 产品图片已更新：主图=产品展示图，详情图=6张蓝色长图（全部从第1张开始完整显示）');
await conn.end();
