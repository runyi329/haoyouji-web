/**
 * 直接通过数据库插入三款红酒产品
 * 运行方式：cd /home/ubuntu/haoyouji-web && npx tsx scripts/seed-wine-products.ts
 */
import { getDb } from '../server/db';
import { merchants, merchantProducts, merchantShopProducts } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('数据库连接失败');
    process.exit(1);
  }

  // 1. 查询cx8618商家ID
  const merchantRows = await db
    .select({ id: merchants.id, shopName: merchants.shopName })
    .from(merchants)
    .where(eq(merchants.merchantCode, 'cx8618'))
    .limit(1);

  if (!merchantRows || merchantRows.length === 0) {
    console.error('未找到cx8618商家');
    process.exit(1);
  }

  const merchantId = merchantRows[0].id;
  console.log(`找到商家: ${merchantRows[0].shopName} (ID: ${merchantId})`);

  // 2. 三款产品数据
  const products = [
    {
      name: 'FIDENCIO RESERVA 飞腾干红葡萄酒',
      subtitle: '圣女酒庄 · 西班牙拉曼恰产区 · 2016年份',
      basePrice: '168.00',
      originalPrice: '238.00',
      description: JSON.stringify({
        winery: '圣女酒庄（Virgen de las Vinas）',
        wineryDesc: '圣女酒庄坐落于西班牙拉曼恰产区，其历史可追溯到1961年，它作为工坊而被建立，1995年始，得益于政府的帮助，开始生产并酿造葡萄酒至今。在其50多年的历史中，巧妙地将传统生产工艺与尖端技术相结合，跻身于葡萄酒行业前列。',
        country: '西班牙',
        vintage: '2016',
        region: '拉曼恰',
        alcohol: '13.5%vol',
        volume: '750ml',
        grade: 'DO/RESERVA',
        grape: '丹魄',
        review: '该款葡萄酒采用100%丹魄酿制而成。12个月的橡木桶陈酿，酒体柔顺饱满。',
        pairing: '奶酪、牛排、各种肉类',
      }),
      mainImageUrl: 'https://images.vivino.com/thumbs/ApnIiXjcT5Kc33OHgNb9dA_pb_x600.png',
      status: 'active' as const,
      sourceType: 'merchant' as const,
      isShareable: 1,
      stock: 999,
      ownerMerchantId: merchantId,
      extendedFields: JSON.stringify({
        country: '西班牙',
        vintage: '2016',
        region: '拉曼恰',
        alcohol: '13.5%vol',
        volume: '750ml',
        grade: 'DO/RESERVA',
        grape: '丹魄',
      }),
    },
    {
      name: 'MARTHU 玛莎干红葡萄酒',
      subtitle: '马约尔酒庄 · 西班牙里奥哈产区 · 2018年份',
      basePrice: '198.00',
      originalPrice: '268.00',
      description: JSON.stringify({
        winery: '马约尔酒庄（Bodegas Fuenmayor）',
        wineryDesc: '该酒庄位于西班牙里奥哈产区，采用传统和先进的酿造工艺相结合。在这里，葡萄酒是自然而然的选择和处理的。这确保了它们逐渐增强的特点，酒厂区分它们，直到所得到的葡萄酒汇集在一起，从而酿造出独特的产品。',
        country: '西班牙',
        vintage: '2018',
        region: '里奥哈',
        alcohol: '14.5%vol',
        volume: '750ml',
        grade: 'DOC',
        grape: '添帕尼优',
        review: '该款酒呈石榴红色，采用西班牙特有的葡萄品种添帕尼优，明亮清新的色泽令人愉快，优雅清爽的果香，单宁适中，酸度均衡，回味悠长。',
        pairing: '奶酪、牛排、各种肉类',
      }),
      mainImageUrl: 'https://images.vivino.com/thumbs/7_PdFiL1R6q_Ht_o3MpWyA_pb_x600.png',
      status: 'active' as const,
      sourceType: 'merchant' as const,
      isShareable: 1,
      stock: 999,
      ownerMerchantId: merchantId,
      extendedFields: JSON.stringify({
        country: '西班牙',
        vintage: '2018',
        region: '里奥哈',
        alcohol: '14.5%vol',
        volume: '750ml',
        grade: 'DOC',
        grape: '添帕尼优',
      }),
    },
    {
      name: 'ROMANICO 罗马尼克干红葡萄酒',
      subtitle: 'Teso La Monja酒庄 · 西班牙托罗产区',
      basePrice: '328.00',
      originalPrice: '468.00',
      description: JSON.stringify({
        winery: 'Teso La Monja',
        wineryDesc: '这是一款来自托罗产区物超所值的葡萄酒。它酒体饱满，酒体丰腴，余味悠长，其口感堪比50美元或更高价位的葡萄酒。——《葡萄酒倡导家》杂志',
        country: '西班牙',
        vintage: '2020',
        region: '托罗',
        alcohol: '14.5%vol',
        volume: '750ml',
        grade: 'DO',
        grape: '100%丹魄',
        review: '传统方式酿造，100%去梗。在法国橡木桶中进行苹果酸乳酸发酵后陈酿6个月，瓶中成年2个月。位于托罗产区萨莫拉的有机葡萄园，平均气温21摄氏度，海拔750-850米。全部有机施肥。',
        pairing: '红肉、烤羊排、陈年奶酪',
        scores: {
          rp: 92,
          st: 91,
          pena: 92,
        },
        vineyard: '位于托罗产区萨莫拉的有机葡萄园，平均气温21摄氏度，海拔750-850米。全部有机施肥。葡萄藤采用头部整形和高杯式剪枝。',
        brewing: '传统方式酿造，100%去梗。在法国橡木桶中进行苹果酸乳酸发酵后陈酿6个月，瓶中成年2个月。',
      }),
      mainImageUrl: 'https://images.vivino.com/thumbs/oWlPn_9M_9f5-Hq-7nnGrg_pb_x600.png',
      status: 'active' as const,
      sourceType: 'merchant' as const,
      isShareable: 1,
      stock: 999,
      ownerMerchantId: merchantId,
      extendedFields: JSON.stringify({
        country: '西班牙',
        vintage: '2020',
        region: '托罗',
        alcohol: '14.5%vol',
        volume: '750ml',
        grade: 'DO',
        grape: '100%丹魄',
        rpScore: '92',
        stScore: '91',
        penaScore: '92',
      }),
    },
  ];

  // 3. 逐个插入
  for (const product of products) {
    try {
      // 检查是否已存在
      const existing = await db
        .select({ id: merchantProducts.id })
        .from(merchantProducts)
        .where(eq(merchantProducts.name, product.name))
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`⚠️  商品已存在，跳过: ${product.name}`);
        continue;
      }

      // 写入商品总库
      const [result] = await db.insert(merchantProducts).values(product);
      const productId = (result as any).insertId;
      console.log(`✅ 商品写入总库: ${product.name} (ID: ${productId})`);

      // 自动写入店铺陈列层
      await db.insert(merchantShopProducts).values({
        merchantId: merchantId,
        productId: productId,
        isOwned: 1,
        isVisible: 1,
        customSortOrder: 0,
      });
      console.log(`✅ 商品写入店铺陈列层: ${product.name}`);

    } catch (err) {
      console.error(`❌ 插入失败: ${product.name}`, err);
    }
  }

  console.log('\n🎉 完成！三款产品已录入数据库，前台商城应立即可见。');
  process.exit(0);
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
