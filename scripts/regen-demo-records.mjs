/**
 * 重新生成麻六记演示账本(#44)的300条评论
 * - 6大类正态分布（菜品质量最多，卫生安全最少）
 * - 每条带【细分标签】，用于热词统计
 * - 10家分店随机分配
 * - 时间分布在过去30天内
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_CONFIG = {
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  ssl: false,
};

const LEDGER_ID = 44;
const CREATED_BY = 870413; // jiang

// 10家分店的 categoryId（ledger_categories）
const BRANCHES = [
  { id: 90178, name: '国贸商城店' },
  { id: 90179, name: '银泰中心店' },
  { id: 90180, name: '金融街店' },
  { id: 90181, name: '王府井APM店' },
  { id: 90182, name: '三里屯太古里店' },
  { id: 90183, name: '望京华彩店' },
  { id: 90184, name: '中关村欧美汇店' },
  { id: 90185, name: '西单大悦城店' },
  { id: 90186, name: '朝阳大悦城店' },
  { id: 90187, name: '来广营环宇汇店' },
];

// 6大类 + 细分标签 + 对应评论模板
const CATEGORIES = [
  {
    id: 'food', label: '菜品质量', count: 90,
    subtags: [
      { tag: '太咸', templates: ['麻辣锅底太咸了，【太咸】喝了很多水，希望能调整一下盐度。', '【太咸】这次的汤底咸度偏高，影响了整体体验。', '涮菜还好，但蘸料【太咸】，建议减少盐的用量。'] },
      { tag: '食材不新鲜', templates: ['【食材不新鲜】今天的毛肚感觉不太新鲜，有点异味，希望加强食材管理。', '点了鸭肠，感觉【食材不新鲜】，口感不脆，有些失望。'] },
      { tag: '分量不足', templates: ['【分量不足】点了一份夫妻肺片，量比较少，性价比不高。', '牛肉卷【分量不足】，才几片，感觉不够吃。', '点了招牌菜，【分量不足】，价格却不低，希望改进。'] },
      { tag: '火候不对', templates: ['【火候不对】鸭血煮得太老了，口感很差，希望控制好火候。', '豆腐【火候不对】，外面糊了里面还没熟，体验不好。'] },
      { tag: '卖相不佳', templates: ['【卖相不佳】摆盘比较随意，和宣传图差距较大，影响食欲。', '菜品【卖相不佳】，希望能在摆盘上多用心。'] },
      { tag: '菜品质量好', templates: ['菜品质量非常好，【菜品质量好】食材新鲜，口味正宗，下次还会来！', '招牌夫妻肺片超级好吃，红油拌得很均匀，【菜品质量好】。', '酸辣粉真的很好吃，汤底浓郁，分量也足，【菜品质量好】。', '麻辣鲜香，层次丰富，【菜品质量好】，是我吃过最好的川菜之一。', '食材新鲜，火候到位，【菜品质量好】，麻辣程度可以自选，很贴心。'] },
    ]
  },
  {
    id: 'service', label: '服务表现', count: 70,
    subtags: [
      { tag: '响应太慢', templates: ['叫了好几次服务员都没人来，【响应太慢】，等了很久才有人过来。', '【响应太慢】加水等了10分钟，服务态度需要改进。', '高峰期【响应太慢】，点单等了很久，希望增加服务人员。'] },
      { tag: '态度不好', templates: ['服务员【态度不好】，问了个问题回答很敷衍，感觉不受重视。', '催了几次菜，服务员【态度不好】，有些不耐烦，影响用餐心情。'] },
      { tag: '点单出错', templates: ['【点单出错】上来的菜和点的不一样，换菜又等了很久。', '【点单出错】少上了一道菜，提醒后才补上，体验不好。'] },
      { tag: '服务很好', templates: ['服务员态度很好，上菜速度快，整体体验很满意，【服务很好】。', '【服务很好】店员很热情，推荐了几道招牌菜，都非常好吃。', '服务周到，主动加水换碟，【服务很好】，下次还会来。', '【服务很好】服务员专业又热情，解答了很多关于菜品的问题。'] },
      { tag: '未主动加水', templates: ['整个用餐过程没有人来加水，【未主动加水】，需要自己去叫。', '【未主动加水】，杯子空了很久才有人注意到，服务细节需要改进。'] },
    ]
  },
  {
    id: 'env', label: '环境氛围', count: 50,
    subtags: [
      { tag: '太吵', templates: ['餐厅【太吵】，旁边桌声音很大，影响用餐体验，建议做隔音处理。', '【太吵】周末人多，噪音很大，不适合商务用餐。'] },
      { tag: '温度不适', templates: ['空调开得【温度不适】太冷了，吃火锅还好，但坐久了很不舒服。', '【温度不适】夏天空调太强，建议可以调节温度。'] },
      { tag: '太拥挤', templates: ['桌子间距太小，【太拥挤】，坐着很不舒服，服务员走路都困难。', '【太拥挤】高峰期座位太密，影响用餐体验。'] },
      { tag: '环境很好', templates: ['环境整洁舒适，装修有特色，【环境很好】，适合朋友聚餐。', '【环境很好】氛围很好，灯光温馨，很适合约会。', '店内装修很有川味，【环境很好】，拍照也很好看。'] },
      { tag: '装修老旧', templates: ['店内【装修老旧】，桌椅有些破损，希望能翻新一下。', '【装修老旧】整体感觉有点陈旧，和价位不太匹配。'] },
    ]
  },
  {
    id: 'efficiency', label: '运营效率', count: 45,
    subtags: [
      { tag: '出餐太慢', templates: ['等了40分钟菜才上来，【出餐太慢】，严重影响用餐体验。', '【出餐太慢】高峰期等了很久，希望提高后厨效率。', '点了菜等了半小时才上，【出餐太慢】，中途催了两次。'] },
      { tag: '等位太久', templates: ['【等位太久】等了一个小时才有座位，建议增加预约系统。', '周末【等位太久】，排队叫号等了很久，希望能优化排队流程。'] },
      { tag: '结账太慢', templates: ['结账等了很久，【结账太慢】，服务员一直没来，体验不好。', '【结账太慢】叫了好几次才来结账，离开时已经很晚了。'] },
      { tag: '效率很高', templates: ['上菜速度很快，【效率很高】，点完菜没多久就全上来了。', '【效率很高】结账也很顺畅，扫码支付很方便。'] },
    ]
  },
  {
    id: 'value', label: '价值感', count: 30,
    subtags: [
      { tag: '价格偏高', templates: ['人均消费【价格偏高】，性价比不如其他同类餐厅。', '【价格偏高】两个人吃了300多，感觉有点贵。', '菜品质量还可以，但【价格偏高】，希望能推出更多优惠套餐。'] },
      { tag: '优惠不实惠', templates: ['【优惠不实惠】团购券限制太多，实际优惠力度很小。', '会员折扣【优惠不实惠】，感觉没什么实质性的优惠。'] },
      { tag: '性价比高', templates: ['【性价比高】价格实惠，量大味美，强烈推荐！', '整体体验超出预期，【性价比高】，强烈推荐给喜欢川菜的朋友！', '人均不到100，【性价比高】，味道又好，下次还会来。'] },
    ]
  },
  {
    id: 'hygiene', label: '卫生安全', count: 15,
    subtags: [
      { tag: '桌面不干净', templates: ['坐下来桌面【桌面不干净】，有油渍，服务员擦了一下还是不干净。', '【桌面不干净】上桌时有残留食物，清洁工作需要加强。'] },
      { tag: '卫生间脏', templates: ['【卫生间脏】卫生间不太干净，地面有水渍，希望加强清洁频率。', '卫生间【卫生间脏】，洗手台也比较脏，影响整体印象。'] },
      { tag: '食物有异物', templates: ['【食物有异物】菜里发现了一根头发，非常影响食欲，希望加强后厨管理。'] },
      { tag: '卫生很好', templates: ['餐具干净整洁，【卫生很好】，用餐环境让人放心。', '【卫生很好】厨房可视化，食材处理很规范，吃得放心。'] },
    ]
  },
];

// 称谓池
const GUEST_NAMES = ['张先生', '李女士', '王先生', '刘女士', '陈先生', '杨女士', '赵先生', '周女士', '吴先生', '郑女士', '孙先生', '马女士', '朱先生', '胡女士', '林先生', '常客', '老顾客', '新朋友', null, null, null];

// 评分分布（正面评论多给高分，负面给低分）
function getRating(tag) {
  const negTags = ['太咸', '食材不新鲜', '分量不足', '火候不对', '卖相不佳', '响应太慢', '态度不好', '点单出错', '未主动加水', '太吵', '温度不适', '太拥挤', '装修老旧', '出餐太慢', '等位太久', '结账太慢', '价格偏高', '优惠不实惠', '桌面不干净', '卫生间脏', '食物有异物'];
  if (negTags.includes(tag)) return Math.random() < 0.7 ? 2 : 3;
  return Math.random() < 0.6 ? 5 : 4;
}

// 随机选择
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 生成随机日期（过去30天内，工作时间偏多）
function randomDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  // 用餐时间：11-14点或17-21点
  const mealSlots = [11, 12, 13, 17, 18, 19, 20, 21];
  d.setHours(pick(mealSlots), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
  return d;
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('✅ 数据库连接成功');

  // 1. 删除原有300条记录
  const [delResult] = await conn.execute('DELETE FROM ledger_records WHERE ledgerId = ?', [LEDGER_ID]);
  console.log(`🗑️  删除原有记录 ${delResult.affectedRows} 条`);

  // 2. 生成新记录
  const records = [];
  for (const cat of CATEGORIES) {
    for (let i = 0; i < cat.count; i++) {
      const subtag = pick(cat.subtags);
      // 在内容前加上大类关键词，确保前端统计能正确匹配
      const rawContent = pick(subtag.templates);
      const content = `[${cat.label}] ${rawContent}`;
      const branch = pick(BRANCHES);
      const date = randomDate();
      const rating = getRating(subtag.tag);
      const guestName = pick(GUEST_NAMES);
      records.push({
        ledgerId: LEDGER_ID,
        type: 'expense',
        amount: 0,
        categoryId: branch.id,
        description: content,
        recordDate: date.toISOString().split('T')[0],
        createdBy: CREATED_BY,
        createdAt: date,
        rating,
        guest_name: guestName,
      });
    }
  }

  // 打乱顺序（模拟真实时间线）
  records.sort((a, b) => b.createdAt - a.createdAt);

  // 3. 批量插入
  let inserted = 0;
  for (const r of records) {
    await conn.execute(
      `INSERT INTO ledger_records (ledgerId, type, amount, categoryId, description, recordDate, createdBy, createdAt, rating, guest_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.ledgerId, r.type, r.amount, r.categoryId, r.description, r.recordDate, r.createdBy, r.createdAt, r.rating, r.guest_name]
    );
    inserted++;
  }

  console.log(`✅ 成功插入 ${inserted} 条演示记录`);

  // 4. 验证分布
  const [dist] = await conn.execute(`
    SELECT c.name as branch, COUNT(*) as cnt
    FROM ledger_records r
    JOIN ledger_categories c ON c.id = r.categoryId
    WHERE r.ledgerId = ?
    GROUP BY c.name ORDER BY cnt DESC
  `, [LEDGER_ID]);
  console.log('\n📊 分店分布:');
  dist.forEach(row => console.log(`  ${row.branch}: ${row.cnt}条`));

  await conn.end();
  console.log('\n🎉 完成！');
}

main().catch(e => { console.error('❌ 错误:', e.message); process.exit(1); });
