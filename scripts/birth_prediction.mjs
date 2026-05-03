/**
 * 调用 AI 大模型进行中国出生人口预测（2026-2035年）
 * 使用 17 个变量、多维度权重体系
 */
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
config();

const API_URL = process.env.BUILT_IN_FORGE_API_URL;
const API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const PROMPT = `你是一位顶级人口经济学家，拥有20年人口预测建模经验。请基于以下17个变量的权重体系，对中国2026-2035年逐年出生人口进行专业预测。

## 历史数据（近20年出生人口，万人）
2005:1612, 2006:1581, 2007:1591, 2008:1604, 2009:1587,
2010:1588, 2011:1600, 2012:1800(龙年), 2013:1640, 2014:1687,
2015:1655, 2016:1786(全面二孩), 2017:1723, 2018:1523,
2019:1465, 2020:1200, 2021:1062(三孩政策), 2022:956, 2023:902, 2024:882, 2025:792(历史新低)

## 17变量权重体系

### 第一层：人口学基础变量（权重合计70%）
1. 育龄女性人口规模（20-34岁）[权重35%]
   - 90后（1990-1999）规模约1.74亿，已进入生育后期
   - 00后（2000-2009）规模约1.47亿，正在进入生育期
   - 每年净减少约270万育龄女性
   - 2026-2030年：00后主力进入，规模持续萎缩
   - 2031-2035年：05后（约1.35亿）接棒，规模进一步缩小

2. 总和生育率（TFR）趋势[权重25%]
   - 2024年TFR约1.0，为历史最低
   - 东亚规律：韩国0.72、日本1.2、台湾0.87、新加坡1.0
   - 历史上东亚国家TFR跌破1.0后从未自然回升超过1.3
   - 预测TFR区间：0.85-1.05（基准1.0保持稳定或微降）

3. 初婚年龄推迟趋势[权重10%]
   - 2022年男性平均初婚年龄28.67岁，女性27.95岁
   - 每年推迟约0.1-0.15岁，生育窗口持续压缩
   - 晚婚导致实际生育率比意愿生育率低约15-20%

### 第二层：社会经济变量（权重合计23%）
4. 城镇化率[权重8%]
   - 2024年城镇化率约67%，预计2035年达72-75%
   - 城市TFR约0.7，农村约1.5
   - 城镇化每提升1%，拉低全国TFR约0.02

5. 房价收入比[权重7%]
   - 一线城市房价收入比30-40倍（北京约40倍）
   - 与韩国首尔（25倍）相近，生育抑制效应显著
   - 房价压力每提升10%，生育意愿下降约3-5%

6. 女性受教育年限[权重5%]
   - 高学历女性平均推迟生育2-3年，生育数量减少0.3-0.5个
   - 2024年女性大学入学率超过男性，高学历化趋势不可逆

7. 人均可支配收入增速[权重3%]
   - 收入增长对生育有正向边际效应，但弱于成本抑制
   - 预计GDP增速4-5%，收入增速3-4%，边际正效应约+0.5-1%

### 第三层：政策与外部变量（权重合计7%）
8. 生育补贴力度[权重2%]
   - 各省累计补贴：生育补贴+育儿假+税收减免
   - 参考匈牙利：补贴GDP 5%后TFR从1.2→1.6（历时8年）
   - 中国当前补贴力度不足GDP 0.5%，边际效应有限

9. 参照国家经验[权重2%]
   - 韩国：2023年出生23万（TFR 0.72），政策干预无效
   - 日本：2023年出生73万（TFR 1.2），已触底但未回升
   - 台湾：2023年TFR 0.87，与中国大陆路径高度相似
   - 结论：东亚低生育率具有结构性，政策难以逆转

10. 疫情后补偿效应衰减[权重1%]
    - 2021-2022年疫情压制的生育已基本释放完毕
    - 2023-2025年无补偿效应，纯粹反映结构性下降

11. 龙年/吉年效应[权重0.5%]
    - 2024年甲辰龙年出生882万（较2023年下降2.2%，龙年效应已大幅减弱）
    - 2036年为龙年，可能有轻微正向扰动

12. 性别比失衡修复效应[权重0.5%]
    - 出生性别比从2008年的120.6持续下降至2024年的105.3
    - 性别比趋于正常有助于婚配率提升，正向效应约+0.5%

13. 二孩/三孩政策存量释放[权重0.5%]
    - 2016年全面二孩存量释放已完成（2017年高峰后快速回落）
    - 三孩政策存量有限，2022-2024年已基本释放

14. 人口流动与区域集中效应[权重0.3%]
    - 人口向长三角、珠三角、成渝集中，城市生育率低
    - 农村生育率高但人口基数持续萎缩

15. 托育服务覆盖率[权重0.2%]
    - 2024年3岁以下婴幼儿托位数约700万，覆盖率约7%
    - 目标2025年覆盖率12%，有助于缓解育儿压力

16. 辅助生殖技术普及[权重0.1%]
    - 试管婴儿出生占比约3-4%，政策支持下有望提升至5-6%
    - 绝对数量贡献约30-50万/年

17. 气候与环境因素[权重0.1%]
    - 极端气候事件增加生活成本，对生育意愿有轻微负向影响
    - 空气质量改善对新生儿健康有正向影响

## 预测要求
基于以上17个变量，给出：
1. 基准预测（最可能情景，万人，整数）
2. 乐观预测（政策超预期+补贴大幅加码，万人，整数）
3. 悲观预测（TFR继续下滑至0.85，万人，整数）
4. 每年核心驱动因素（最影响该年数据的1-2个变量，中文，不超过40字）
5. 置信度（0-100的整数）

同时给出：
- methodology：详细的预测方法说明（Markdown格式，包含模型介绍、各变量如何影响预测、关键假设等，不少于300字）
- summary：总体趋势摘要（中文，100-150字）

请严格按JSON格式输出：
{
  "predictions": [
    {"year": 2026, "births": 750, "optimistic": 810, "pessimistic": 690, "confidence": 88, "keyFactor": "00后主力进入生育期但规模偏小，TFR维持1.0低位"},
    {"year": 2027, ...},
    ...直到2035年共10条...
  ],
  "methodology": "## AI人口预测方法说明\\n\\n...",
  "dimensions": ["育龄女性人口结构（35%）", "总和生育率趋势（25%）", ...共17个...],
  "summary": "..."
}`;

async function callLLM(prompt) {
  const apiEndpoint = `${API_URL.replace(/\/$/, '')}/v1/chat/completions`;
  console.log(`调用端点: ${apiEndpoint.substring(0, 60)}...`);
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: '你是顶级人口经济学家，擅长多变量人口预测建模。请严格按JSON格式输出，不要有任何额外文字、markdown代码块标记或注释。直接输出JSON对象。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API 错误 ${response.status}: ${text.substring(0, 500)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

console.log('开始调用 AI 进行人口预测（17变量模型）...');
console.log(`API URL: ${API_URL?.substring(0, 50)}...`);

try {
  const result = await callLLM(PROMPT);
  console.log('\n=== AI 预测完成 ===');
  
  const parsed = JSON.parse(result);
  
  // 验证数据完整性
  if (!parsed.predictions || parsed.predictions.length !== 10) {
    throw new Error(`预测数据不完整，期望10条，实际${parsed.predictions?.length}条`);
  }
  
  console.log('\n预测结果摘要:');
  parsed.predictions.forEach(p => {
    console.log(`  ${p.year}年: 基准${p.births}万 | 乐观${p.optimistic}万 | 悲观${p.pessimistic}万 | 置信度${p.confidence}% | ${p.keyFactor}`);
  });
  
  console.log('\n总体摘要:', parsed.summary);
  
  // 保存完整结果
  writeFileSync('/home/ubuntu/birth_prediction_result.json', JSON.stringify(parsed, null, 2), 'utf-8');
  console.log('\n完整结果已保存到 /home/ubuntu/birth_prediction_result.json');
  
} catch (err) {
  console.error('预测失败:', err.message);
  process.exit(1);
}
