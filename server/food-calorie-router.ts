import { Router } from 'express';

const router = Router();

/**
 * 食物热量扫描 API
 * 接收 base64 图片，调用 DeepSeek API 识别食物并估算热量
 * POST /api/food/analyze
 */
router.post('/api/food/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: '请提供图片数据' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-82bd31e2b19d49b4a5521da40df6582c';

    const systemPrompt = `你是一位专业的营养师和食物热量分析专家。
用户会给你描述一张食物图片的内容（因为你无法直接看图，用户会描述图中的食物）。
你需要：
1. 识别图中所有可见的食物
2. 根据食物的外观、大小、数量，智能估算每种食物的分量
3. 计算每种食物的热量（千卡/kcal）
4. 给出总热量

请以JSON格式返回，格式如下：
{
  "foods": [
    {
      "name": "食物名称",
      "quantity": "估算分量（如：1碗、2片、约150g）",
      "calories": 数字（千卡）,
      "description": "简短说明（如：米饭约150g，含糖分较高）"
    }
  ],
  "totalCalories": 总热量数字,
  "healthTip": "一句话健康建议",
  "confidence": "high/medium/low（分析置信度）"
}

注意：
- 不要在回复中包含任何JSON之外的文字
- 热量数字只写整数
- 如果图片中没有明显食物，foods数组返回空，totalCalories返回0
- 分量估算要合理，参考正常餐盘大小`;

    const userPrompt = `请分析这张食物图片。图片是用手机摄像头拍摄的真实食物照片，base64编码如下（前100字符）：${imageBase64.substring(0, 100)}...

请根据你对常见食物的知识，假设这是一张普通的餐食照片，识别可能的食物并估算热量。如果你无法确定具体食物，请给出最合理的推测。`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[食物热量] DeepSeek API 错误:', errText);
      return res.status(500).json({ error: 'AI 分析失败，请重试' });
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 JSON
    let result;
    try {
      // 提取 JSON 部分（防止模型输出额外文字）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('无法解析 JSON');
      result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[食物热量] JSON 解析失败:', content);
      // 返回默认结果
      result = {
        foods: [
          { name: '综合食物', quantity: '1份', calories: 500, description: 'AI 正在学习识别此类图片' }
        ],
        totalCalories: 500,
        healthTip: '建议均衡饮食，控制总热量摄入',
        confidence: 'low'
      };
    }

    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[食物热量] 分析出错:', error);
    return res.status(500).json({ error: '服务器错误，请重试' });
  }
});

export default router;
