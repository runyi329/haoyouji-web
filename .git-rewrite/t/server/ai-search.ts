import { Router } from 'express';
import { getPromptsConfig } from './ai-prompts';

const router = Router();

/**
 * AI Background Check API
 * 接收联系人信息，调用 DeepSeek API 进行全网搜索和背景分析
 */
router.post('/api/ai/background-check', async (req, res) => {
  try {
    const { name, company, position, wechat, phone, email, notes, tags, contactHistory, contactId } = req.body;

    // 验证必填字段
    if (!name) {
      return res.status(400).json({ error: '姓名是必填字段' });
    }

    // 从环境变量获取 DeepSeek API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: '未配置 DeepSeek API Key',
        message: '请在环境变量中设置 DEEPSEEK_API_KEY。获取方式：访问 https://platform.deepseek.com 注册并申请 API Key'
      });
    }

    // 获取提示词配置
    const promptsConfig = await getPromptsConfig();

    // 构建搜索提示词（包含标签和联系记录）
    const searchPrompt = buildSearchPrompt({ 
      name, 
      company, 
      position, 
      wechat, 
      phone, 
      email,
      notes, 
      tags, 
      contactHistory 
    }, promptsConfig.userPromptTemplate);

    console.log(`[AI背调] 开始搜索: ${name} (${company || '未知公司'})`);

    // 调用 DeepSeek API
    const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: promptsConfig.systemPrompt
          },
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        temperature: promptsConfig.temperature,
        max_tokens: promptsConfig.maxTokens,
      }),
    });

    if (!deepseekResponse.ok) {
      const errorData = await deepseekResponse.json().catch(() => ({}));
      console.error('[AI背调] DeepSeek API 错误:', errorData);
      return res.status(500).json({ 
        error: 'DeepSeek API 调用失败',
        details: errorData,
        message: '请检查 API Key 是否正确，或访问 https://platform.deepseek.com 查看配额'
      });
    }

    const data = await deepseekResponse.json();
    const aiAnalysis = data.choices[0]?.message?.content || '未能获取分析结果';

    console.log(`[AI背调] 搜索完成: ${name}`);

    // 返回结构化结果
    res.json({
      success: true,
      data: {
        rawAnalysis: aiAnalysis,
        searchQuery: { name, company, position },
        timestamp: new Date().toISOString(),
        source: 'deepseek',
        contactId: contactId || null,
      }
    });

  } catch (error) {
    console.error('[AI背调] 服务器错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取联系人的历史 AI 背调记录
 */
router.get('/api/ai/background-check/:contactId/history', async (req, res) => {
  try {
    const { contactId } = req.params;

    // TODO: 从数据库查询该联系人的历史 AI 背调记录
    // 这里返回模拟数据，实际应该从数据库查询
    const mockHistory = [
      {
        id: '1',
        contactId,
        timestamp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90天前
        source: 'deepseek',
        summary: '首次 AI 背调，发现教育背景和职业履历'
      }
    ];

    res.json({
      success: true,
      data: {
        history: mockHistory,
        lastSearchTime: mockHistory[0]?.timestamp || null,
      }
    });

  } catch (error) {
    console.error('[AI背调] 获取历史记录错误:', error);
    res.status(500).json({ 
      error: '获取历史记录失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 构建搜索提示词
 */
function buildSearchPrompt(contact: {
  name: string;
  company?: string;
  position?: string;
  wechat?: string;
  phone?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  contactHistory?: Array<{
    date: string;
    type: string;
    content: string;
  }>;
}, template?: string) {
  // 如果提供了自定义模板，使用模板；否则使用默认逻辑
  if (template) {
    return renderTemplate(template, contact);
  }
  
  // 默认模板逻辑（兼容旧版本）
  let prompt = `请对以下人物进行全网背景调查和分析：\n\n`;
  
  prompt += `## 已知基础信息\n\n`;
  prompt += `**姓名**: ${contact.name}\n`;
  if (contact.company) prompt += `**公司**: ${contact.company}\n`;
  if (contact.position) prompt += `**职位**: ${contact.position}\n`;
  if (contact.wechat) prompt += `**微信号**: ${contact.wechat}\n`;
  if (contact.phone) prompt += `**手机号**: ${contact.phone}\n`;
  if (contact.email) prompt += `**邮箱**: ${contact.email}\n`;
  
  // 添加标签信息
  if (contact.tags && contact.tags.length > 0) {
    prompt += `\n**用户标签**: ${contact.tags.join('、')}\n`;
    prompt += `（这些标签反映了用户对该联系人的分类和印象）\n`;
  }
  
  // 添加备注信息
  if (contact.notes) {
    prompt += `\n**备注信息**: ${contact.notes}\n`;
  }
  
  // 添加联系记录历史
  if (contact.contactHistory && contact.contactHistory.length > 0) {
    prompt += `\n## 历史联系记录\n\n`;
    prompt += `以下是与该联系人的沟通记录，可能包含重要线索：\n\n`;
    contact.contactHistory.forEach((record, index) => {
      prompt += `**${index + 1}. ${record.date}** (${record.type}):\n`;
      prompt += `${record.content}\n\n`;
    });
    prompt += `（请特别关注这些记录中提到的背景信息、兴趣点、需求等）\n`;
  }

  prompt += `\n请按以下结构返回分析结果（使用 Markdown 格式）：\n\n`;
  prompt += `### 📚 教育背景\n`;
  prompt += `（如果能推测出学校、专业、毕业年份等信息，请列出；如果无法推测，说明"暂无公开信息"）\n\n`;
  prompt += `### 💼 职业履历\n`;
  prompt += `（按时间倒序列出可能的工作经历，包括公司、职位、时间段；基于已知信息进行合理推测）\n\n`;
  prompt += `### 🌐 社交媒体与公开活动\n`;
  prompt += `（LinkedIn、Twitter、即刻、公众号等可能的公开账号，以及可能的演讲、采访等）\n\n`;
  prompt += `### 🤝 业务网络与关键人脉\n`;
  prompt += `（基于公司和职位，推测可能的合作伙伴、团队成员、行业关联）\n\n`;
  prompt += `### ℹ️ 补充信息\n`;
  prompt += `（其他有价值的推测或发现）\n\n`;
  prompt += `**注意**：\n`;
  prompt += `- 基于提供的信息进行专业、合理的推测和分析\n`;
  prompt += `- 明确区分"已确认"和"推测"的信息\n`;
  prompt += `- 如果某项信息完全无法推测，请标注"暂无公开信息"\n`;
  prompt += `- 使用 Markdown 格式，让结果易于阅读`;

  return prompt;
}

/**
 * 渲染模板（简单的 Handlebars 风格模板引擎）
 */
function renderTemplate(template: string, data: any): string {
  let result = template;
  
  // 处理 {{#if field}} ... {{/if}} 条件语句
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, field, content) => {
    const value = data[field];
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      return content;
    }
    return '';
  });
  
  // 处理 {{field}} 变量替换
  result = result.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    const value = data[field];
    if (Array.isArray(value)) {
      return value.join('、');
    }
    if (field === 'contactHistory' && Array.isArray(value)) {
      return value.map((record: any, index: number) => 
        `**${index + 1}. ${record.date}** (${record.type}):\n${record.content}\n`
      ).join('\n');
    }
    return value || '';
  });
  
  return result;
}

export default router;
