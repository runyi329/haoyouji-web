import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// 提示词配置文件路径
const PROMPTS_FILE_PATH = path.join(process.cwd(), 'server', 'ai-prompts-config.json');

// 默认提示词配置
const DEFAULT_PROMPTS = {
  systemPrompt: '你是一位专业的商业背景调查分析师。你需要根据用户提供的联系人信息，模拟进行全网搜索和背景分析，并以结构化的方式返回结果。注意：你应该基于提供的信息进行合理推测和分析，而不是声称无法联网搜索。',
  userPromptTemplate: `请对以下人物进行全网背景调查和分析：

## 已知基础信息

**姓名**: {{name}}
{{#if company}}**公司**: {{company}}{{/if}}
{{#if position}}**职位**: {{position}}{{/if}}
{{#if wechat}}**微信号**: {{wechat}}{{/if}}
{{#if phone}}**手机号**: {{phone}}{{/if}}
{{#if email}}**邮箱**: {{email}}{{/if}}

{{#if tags}}
**用户标签**: {{tags}}
（这些标签反映了用户对该联系人的分类和印象）
{{/if}}

{{#if notes}}
**备注信息**: {{notes}}
{{/if}}

{{#if contactHistory}}
## 历史联系记录

以下是与该联系人的沟通记录，可能包含重要线索：

{{contactHistory}}

（请特别关注这些记录中提到的背景信息、兴趣点、需求等）
{{/if}}

请按以下结构返回分析结果（使用 Markdown 格式）：

### 📚 教育背景
（如果能推测出学校、专业、毕业年份等信息，请列出；如果无法推测，说明"暂无公开信息"）

### 💼 职业履历
（按时间倒序列出可能的工作经历，包括公司、职位、时间段；基于已知信息进行合理推测）

### 🌐 社交媒体与公开活动
（LinkedIn、Twitter、即刻、公众号等可能的公开账号，以及可能的演讲、采访等）

### 🤝 业务网络与关键人脉
（基于公司和职位，推测可能的合作伙伴、团队成员、行业关联）

### ℹ️ 补充信息
（其他有价值的推测或发现）

**注意**：
- 基于提供的信息进行专业、合理的推测和分析
- 明确区分"已确认"和"推测"的信息
- 如果某项信息完全无法推测，请标注"暂无公开信息"
- 使用 Markdown 格式，让结果易于阅读`,
  temperature: 0.7,
  maxTokens: 2000,
};

/**
 * 获取当前提示词配置
 */
router.get('/api/ai/prompts', async (req, res) => {
  try {
    // 尝试读取配置文件
    try {
      const data = await fs.readFile(PROMPTS_FILE_PATH, 'utf-8');
      const prompts = JSON.parse(data);
      res.json({ success: true, data: prompts });
    } catch (error) {
      // 如果文件不存在，返回默认配置
      res.json({ success: true, data: DEFAULT_PROMPTS });
    }
  } catch (error) {
    console.error('[AI提示词] 获取配置错误:', error);
    res.status(500).json({ 
      error: '获取提示词配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 更新提示词配置
 */
router.put('/api/ai/prompts', async (req, res) => {
  try {
    const { systemPrompt, userPromptTemplate, temperature, maxTokens } = req.body;

    // 验证必填字段
    if (!systemPrompt || !userPromptTemplate) {
      return res.status(400).json({ error: 'systemPrompt 和 userPromptTemplate 是必填字段' });
    }

    // 验证参数范围
    if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
      return res.status(400).json({ error: 'temperature 必须在 0-2 之间' });
    }

    if (maxTokens !== undefined && (maxTokens < 100 || maxTokens > 4000)) {
      return res.status(400).json({ error: 'maxTokens 必须在 100-4000 之间' });
    }

    const newPrompts = {
      systemPrompt,
      userPromptTemplate,
      temperature: temperature ?? DEFAULT_PROMPTS.temperature,
      maxTokens: maxTokens ?? DEFAULT_PROMPTS.maxTokens,
    };

    // 保存到文件
    await fs.writeFile(PROMPTS_FILE_PATH, JSON.stringify(newPrompts, null, 2), 'utf-8');

    console.log('[AI提示词] 配置已更新');

    res.json({ success: true, data: newPrompts });
  } catch (error) {
    console.error('[AI提示词] 更新配置错误:', error);
    res.status(500).json({ 
      error: '更新提示词配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 重置为默认提示词配置
 */
router.post('/api/ai/prompts/reset', async (req, res) => {
  try {
    // 删除配置文件（如果存在）
    try {
      await fs.unlink(PROMPTS_FILE_PATH);
    } catch (error) {
      // 文件不存在，忽略错误
    }

    console.log('[AI提示词] 配置已重置为默认值');

    res.json({ success: true, data: DEFAULT_PROMPTS });
  } catch (error) {
    console.error('[AI提示词] 重置配置错误:', error);
    res.status(500).json({ 
      error: '重置提示词配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 读取提示词配置（供其他模块使用）
 */
export async function getPromptsConfig() {
  try {
    const data = await fs.readFile(PROMPTS_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return DEFAULT_PROMPTS;
  }
}

/**
 * 更新提示词配置（供其他模块使用）
 */
export async function updatePromptsConfig(config: {
  systemPrompt: string;
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
}) {
  const newPrompts = {
    systemPrompt: config.systemPrompt,
    userPromptTemplate: config.userPromptTemplate,
    temperature: config.temperature ?? DEFAULT_PROMPTS.temperature,
    maxTokens: config.maxTokens ?? DEFAULT_PROMPTS.maxTokens,
  };

  await fs.writeFile(PROMPTS_FILE_PATH, JSON.stringify(newPrompts, null, 2), 'utf-8');
  return newPrompts;
}

/**
 * 重置为默认提示词配置（供其他模块使用）
 */
export async function resetPromptsConfig() {
  try {
    await fs.unlink(PROMPTS_FILE_PATH);
  } catch (error) {
    // 文件不存在，忽略错误
  }
  return DEFAULT_PROMPTS;
}

/**
 * 获取AI工具列表
 */
router.get('/api/ai/assistant/tools', async (req, res) => {
  try {
    const dbAI = await import('./db-ai-assistant');
    const result = await dbAI.getToolsList();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[获取工具列表] 错误:', error);
    res.status(500).json({ 
      error: '获取工具列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取API密钥配置状态
 */
router.get('/api/ai/assistant/api-status', async (req, res) => {
  try {
    const dbAI = await import('./db-ai-assistant');
    const result = await dbAI.getApiKeysStatus();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[获取API状态] 错误:', error);
    res.status(500).json({ 
      error: '获取API状态失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 导出默认配置（供测试使用）
 */
export const DEFAULT_PROMPTS_CONFIG = DEFAULT_PROMPTS;
export default router;
