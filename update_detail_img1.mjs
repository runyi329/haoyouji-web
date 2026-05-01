import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection(DB_URL);

// 新的第1张图（文字不截断版本）
const newImg1 = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_1_v2-X5dyQAA6DEbLzoFq5o6K2z.png';

// 其余5张保持不变
const detailImages = JSON.stringify([
  newImg1,
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_2-RcioVPUFxQjUmaouWghPcm.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_3-ZMgzcqTWZD9GgRXxtUteWF.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_4-c9pLtbFpdY6eF6W2FonbiY.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_5-RDuGg2KS9vyNnCrPs2yUyn.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_6-5qDbVgNLrUfyfdwHHqESzq.png',
]);

// 同时更新主图为新版第1张
await conn.execute(
  'UPDATE merchant_products SET imageUrls=?, mainImageUrl=? WHERE id=20',
  [detailImages, newImg1]
);

console.log('✅ 第1张详情图已更新（文字不截断版本）');
await conn.end();
