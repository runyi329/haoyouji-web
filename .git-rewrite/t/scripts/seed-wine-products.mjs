/**
 * 通过 tRPC API 插入三款红酒产品到数据库
 * 使用方式：node scripts/seed-wine-products.mjs
 */

const BASE_URL = 'http://localhost:3000';

// 先获取cx8618商家的ID
async function getMerchantId() {
  const res = await fetch(`${BASE_URL}/api/trpc/merchant.getMerchantShareInfo?input=${encodeURIComponent(JSON.stringify({ merchantCode: 'cx8618' }))}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  console.log('getMerchantShareInfo response:', JSON.stringify(data).slice(0, 200));
  return data?.result?.data?.id;
}

// 通过直接SQL插入（需要server端支持）
async function insertProducts() {
  // 先查商家ID
  const merchantRes = await fetch(`${BASE_URL}/api/trpc/merchant.getMerchants`, {
    headers: { 'Content-Type': 'application/json', 'Cookie': '' }
  });
  console.log('getMerchants status:', merchantRes.status);
}

insertProducts().catch(console.error);
