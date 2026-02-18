import { getDb } from "./db";
import {
  searchContacts,
  countContacts,
  addContact,
  updateContact,
  deleteContact,
  addContactInteraction,
  getEarliestContactDate,
  getContactDetail,
  addTagToContact,
  removeTagFromContact,
  updateContactField,
  deleteContactField,
  setContactReferrer,
  queryCompanyInfo,
} from "./ai-tools";
import {
  createSession,
  saveMessage,
  autoGenerateSessionTitle,
  getSessionHistory,
} from "./db-ai-sessions";
import {
  getUserPoints,
  deductPoints,
  calculateAICost,
} from "./db-points";

/**
 * 使用AI查询人脉信息（支持Function Calling）
 * @param userId 用户ID
 * @param query 用户查询
 * @param history 对话历史（可选）
 * @returns AI分析结果
 */
export async function queryWithAI(
  userId: number,
  query: string,
  sessionId?: number,
  history?: Array<{ role: string; content: string }>
): Promise<{
  result: string;
  tokensUsed: number;
  cost: number;
  balanceAfter: number;
  sessionId: number;
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 环境变量未配置，请联系管理员配置");
  }

  // 检查用户积分余额
  const currentBalance = await getUserPoints(userId);
  if (currentBalance <= 0) {
    throw new Error("积分余额不足，请充值后继续使用AI助手");
  }

  // 如果没有提供sessionId，创建新会话
  let currentSessionId = sessionId;
  let isNewSession = false;
  if (!currentSessionId) {
    currentSessionId = await createSession(userId, "新对话");
    isNewSession = true;
    console.log(`[AI] Created new session ${currentSessionId} for user ${userId}`);
  }

  // 保存用户消息
  await saveMessage(currentSessionId, "user", query, 0, 0);

  // 从数据库获取提示词
  const systemPrompt = await buildSystemPrompt();

  // 定义AI可以调用的工具
  const tools = [
    {
      type: "function",
      function: {
        name: "searchContacts",
        description: "搜索人脉。可以按姓名、公司、地区、职位等条件搜索。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "姓名（支持模糊搜索）" },
            company: { type: "string", description: "公司名称（支持模糊搜索）" },
            region: { type: "string", description: "地区（支持模糊搜索）" },
            position: { type: "string", description: "职位（支持模糊搜索）" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "countContacts",
        description: "统计人脉数量。可以按地区、公司等条件统计。",
        parameters: {
          type: "object",
          properties: {
            region: { type: "string", description: "地区（可选）" },
            company: { type: "string", description: "公司（可选）" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addContact",
        description: "添加新的人脉。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "姓名（必填）" },
            phone: { type: "string", description: "电话" },
            company: { type: "string", description: "公司" },
            position: { type: "string", description: "职位" },
            region: { type: "string", description: "地区" },
            gender: { type: "string", description: "性别" },
          },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateContact",
        description: "修改人脉信息。需要提供人脉ID和要修改的字段。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            name: { type: "string", description: "姓名" },
            phone: { type: "string", description: "电话" },
            company: { type: "string", description: "公司" },
            position: { type: "string", description: "职位" },
            region: { type: "string", description: "地区" },
            gender: { type: "string", description: "性别" },
          },
          required: ["contactId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deleteContact",
        description: "删除人脉。需要提供人脉ID。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
          },
          required: ["contactId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addContactInteraction",
        description: "为人脉添加联络记录（打卡）。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            note: { type: "string", description: "联络备注" },
          },
          required: ["contactId", "note"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getEarliestContactDate",
        description: "获取最早的人脉创建时间，用于计算使用天数。",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getContactDetail",
        description: "获取人脉的详细信息，包括扩展字段和标签。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
          },
          required: ["contactId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addTagToContact",
        description: "为人脉添加标签。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            tagName: { type: "string", description: "标签名称" },
          },
          required: ["contactId", "tagName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "removeTagFromContact",
        description: "从人脉移除标签。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            tagName: { type: "string", description: "标签名称" },
          },
          required: ["contactId", "tagName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateContactField",
        description: "添加或更新人脉的扩展字段（如银行卡、生日、微信等）。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            categoryName: { type: "string", description: "字段分类名称（如「银行卡」、「生日」、「微信」）" },
            value: { type: "string", description: "字段值" },
          },
          required: ["contactId", "categoryName", "value"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deleteContactField",
        description: "删除人脉的扩展字段。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            categoryName: { type: "string", description: "字段分类名称" },
          },
          required: ["contactId", "categoryName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "setContactReferrer",
        description: "设置人脉的推荐人。",
        parameters: {
          type: "object",
          properties: {
            contactId: { type: "number", description: "人脉ID" },
            referrerName: { type: "string", description: "推荐人姓名" },
          },
          required: ["contactId", "referrerName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "queryCompanyInfo",
        description: "查询企业工商信息，包括公司名称、注册资本、法人代表、成立时间、经营状态等。适用于了解企业背景、验证企业真实性。",
        parameters: {
          type: "object",
          properties: {
            searchKey: {
              type: "string",
              description: "搜索关键词，可以是公司名称、统一社会信用代码等"
            },
          },
          required: ["searchKey"],
        },
      },
    },
  ];

  // 构建消息历史
  const messages: any[] = [
    { role: "system", content: systemPrompt },
  ];

  // 添加历史对话（如果有）
  if (history && history.length > 0) {
    messages.push(...history);
  }

  // 添加当前用户查询
  messages.push({ role: "user", content: query });

  let maxIterations = 5; // 最多迭代5次
  let iteration = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;

  try {
    console.log('[AI] Starting query with DeepSeek API');
    console.log('[AI] API Key configured:', apiKey ? 'yes' : 'no');
    
    while (iteration < maxIterations) {
      iteration++;
      console.log(`[AI] Iteration ${iteration}/${maxIterations}`);

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          console.log(`[AI] Attempt ${retryCount + 1}/${maxRetries + 1} to call DeepSeek API`);
          
          response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages,
              tools,
              temperature: 0.7,
              max_tokens: 2000,
            }),
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          break; // 成功则跳出重试循环
          
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          
          console.error(`[AI] Fetch attempt ${retryCount + 1} failed:`, {
            name: fetchError.name,
            message: fetchError.message,
            cause: fetchError.cause,
          });
          
          if (fetchError.name === 'AbortError') {
            throw new Error('AI请求超时，请稍后重试');
          }
          
          retryCount++;
          
          if (retryCount > maxRetries) {
            console.error('[AI] All retry attempts failed');
            throw new Error(`网络连接失败，已重试${maxRetries}次。请检查网络连接或稍后再试。`);
          }
          
          // 等待一段时间后重试（指数退避）
          const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          console.log(`[AI] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AI] DeepSeek API error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0]?.message;

      if (!assistantMessage) {
        throw new Error("AI未能生成有效回复");
      }

      // 累积token使用量
      if (data.usage) {
        totalPromptTokens += data.usage.prompt_tokens || 0;
        totalCompletionTokens += data.usage.completion_tokens || 0;
        totalTokens += data.usage.total_tokens || 0;
        console.log(`[AI] Iteration ${iteration} usage:`, data.usage);
      }

      messages.push(assistantMessage);

      // 如果AI没有调用工具，直接返回结果
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const result = assistantMessage.content || "AI未能生成有效回复";
        
        // 使用累积的token总量计算费用
        const cost = calculateAICost(totalPromptTokens, totalCompletionTokens);
        
        console.log(`[AI] Total usage - Prompt: ${totalPromptTokens}, Completion: ${totalCompletionTokens}, Total: ${totalTokens}, Cost: ${cost}`);
        
        // 扣除积分
        const balanceAfter = await deductPoints(
          userId,
          cost,
          "ai_message",
          null,
          `AI对话消费 (${totalTokens} tokens)`
        );
        
        // 保存AI回复
        await saveMessage(currentSessionId, "assistant", result, totalTokens, cost);
        
        // 如果是新会话，自动生成标题
        if (isNewSession) {
          await autoGenerateSessionTitle(currentSessionId, userId, query);
        }
        
        return {
          result,
          tokensUsed: totalTokens,
          cost,
          balanceAfter,
          sessionId: currentSessionId,
        };
      }

      // 执行工具调用
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[AI Tool Call] ${functionName}`, functionArgs);

        let functionResult: any;

        try {
          switch (functionName) {
            case "searchContacts":
              functionResult = await searchContacts(userId, functionArgs);
              break;
            case "countContacts":
              functionResult = await countContacts(userId, functionArgs);
              break;
            case "addContact":
              functionResult = await addContact(userId, functionArgs);
              break;
            case "updateContact":
              functionResult = await updateContact(
                userId,
                functionArgs.contactId,
                functionArgs
              );
              break;
            case "deleteContact":
              functionResult = await deleteContact(userId, functionArgs.contactId);
              break;
            case "addContactInteraction":
              functionResult = await addContactInteraction(
                userId,
                functionArgs.contactId,
                functionArgs.note
              );
              break;
            case "getEarliestContactDate":
              functionResult = await getEarliestContactDate(userId);
              break;
            case "getContactDetail":
              functionResult = await getContactDetail(userId, functionArgs.contactId);
              break;
            case "addTagToContact":
              functionResult = await addTagToContact(
                userId,
                functionArgs.contactId,
                functionArgs.tagName
              );
              break;
            case "removeTagFromContact":
              functionResult = await removeTagFromContact(
                userId,
                functionArgs.contactId,
                functionArgs.tagName
              );
              break;
            case "updateContactField":
              functionResult = await updateContactField(
                userId,
                functionArgs.contactId,
                functionArgs.categoryName,
                functionArgs.value
              );
              break;
            case "deleteContactField":
              functionResult = await deleteContactField(
                userId,
                functionArgs.contactId,
                functionArgs.categoryName
              );
              break;
            case "setContactReferrer":
              functionResult = await setContactReferrer(
                userId,
                functionArgs.contactId,
                functionArgs.referrerName
              );
              break;
            case "queryCompanyInfo":
              functionResult = await queryCompanyInfo(functionArgs.searchKey);
              break;
            default:
              functionResult = { error: "未知的函数调用" };
          }
        } catch (error: any) {
          functionResult = { error: error.message };
        }

        // 将函数执行结果添加到消息历史
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult),
        });
      }
    }

    // 如果达到最大迭代次数，返回错误
    throw new Error("AI调用次数过多，请简化您的问题");
  } catch (error: any) {
    console.error("[AI] Query error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // 返回更友好的错误信息
    if (error.message.includes('DEEPSEEK_API_KEY')) {
      throw error; // 保留原始错误信息
    }
    if (error.message.includes('超时')) {
      throw error; // 保留超时错误信息
    }
    
    throw new Error(`AI查询失败: ${error.message}`);
  }
}

/**
 * 获取AI助手的提示词配置
 * @returns 提示词配置对象
 */
export async function getAssistantPrompts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const prompts = await db.execute(
    `SELECT section, content FROM ai_prompts WHERE type = 'assistant' AND is_active = 1 ORDER BY id`
  );

  const result: any = {
    segment1: "",
    segment2: "",
    segment3: "",
    segment4: "",
  };

  // 处理查询结果
  const rows = Array.isArray(prompts) ? prompts : (prompts.rows || []);
  for (const row of rows as any[]) {
    result[row.section] = row.content;
  }

  return result;
}

/**
 * 保存AI助手的提示词配置
 * @param prompts 提示词配置对象
 */
export async function saveAssistantPrompts(prompts: {
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 更新每个段落的提示词
  for (const [section, content] of Object.entries(prompts)) {
    await db.execute(
      `INSERT INTO ai_prompts (type, section, content) 
       VALUES ('assistant', ?, ?) 
       ON DUPLICATE KEY UPDATE content = ?, updated_at = NOW()`,
      [section, content, content]
    );
  }
}

/**
 * 构建完整的系统提示词
 * @returns 完整的系统提示词
 */
async function buildSystemPrompt(): Promise<string> {
  const prompts = await getAssistantPrompts();

  const systemPrompt = `${prompts.segment1}

${prompts.segment2}

${prompts.segment3}

${prompts.segment4}`;

  return systemPrompt;
}


/**
 * 获取AI工具列表
 * @returns 工具列表
 */
export async function getToolsList() {
  // 返回所有可用的工具定义
  return {
    tools: [
      {
        name: "searchContacts",
        description: "搜索人脉。可以按姓名、公司、地区、职位等条件搜索。",
        category: "人脉管理",
        parameters: [
          { name: "name", type: "string", description: "姓名（支持模糊搜索）", required: false },
          { name: "company", type: "string", description: "公司名称（支持模糊搜索）", required: false },
          { name: "region", type: "string", description: "地区（支持模糊搜索）", required: false },
          { name: "position", type: "string", description: "职位（支持模糊搜索）", required: false },
        ]
      },
      {
        name: "countContacts",
        description: "统计人脉数量。可以按地区、公司等条件统计。",
        category: "人脉管理",
        parameters: [
          { name: "region", type: "string", description: "地区（可选）", required: false },
          { name: "company", type: "string", description: "公司（可选）", required: false },
        ]
      },
      {
        name: "addContact",
        description: "添加新的人脉。",
        category: "人脉管理",
        parameters: [
          { name: "name", type: "string", description: "姓名（必填）", required: true },
          { name: "phone", type: "string", description: "电话", required: false },
          { name: "company", type: "string", description: "公司", required: false },
          { name: "position", type: "string", description: "职位", required: false },
          { name: "region", type: "string", description: "地区", required: false },
          { name: "gender", type: "string", description: "性别", required: false },
        ]
      },
      {
        name: "updateContact",
        description: "修改人脉信息。需要提供人脉ID和要修改的字段。",
        category: "人脉管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "name", type: "string", description: "姓名", required: false },
          { name: "phone", type: "string", description: "电话", required: false },
          { name: "company", type: "string", description: "公司", required: false },
          { name: "position", type: "string", description: "职位", required: false },
          { name: "region", type: "string", description: "地区", required: false },
          { name: "gender", type: "string", description: "性别", required: false },
        ]
      },
      {
        name: "deleteContact",
        description: "删除人脉。需要提供人脉ID。",
        category: "人脉管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
        ]
      },
      {
        name: "addContactInteraction",
        description: "为人脉添加联络记录（打卡）。",
        category: "人脉管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "note", type: "string", description: "联络备注", required: true },
        ]
      },
      {
        name: "getEarliestContactDate",
        description: "获取最早的人脉创建时间，用于计算使用天数。",
        category: "人脉管理",
        parameters: []
      },
      {
        name: "getContactDetail",
        description: "获取人脉的详细信息，包括扩展字段和标签。",
        category: "人脉管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
        ]
      },
      {
        name: "addTagToContact",
        description: "为人脉添加标签。",
        category: "标签管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "tagName", type: "string", description: "标签名称", required: true },
        ]
      },
      {
        name: "removeTagFromContact",
        description: "从人脉移除标签。",
        category: "标签管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "tagName", type: "string", description: "标签名称", required: true },
        ]
      },
      {
        name: "updateContactField",
        description: "添加或更新人脉的扩展字段（如银行卡、生日、微信等）。",
        category: "扩展字段",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "categoryName", type: "string", description: "字段分类名称（如「银行卡」、「生日」、「微信」）", required: true },
          { name: "value", type: "string", description: "字段值", required: true },
        ]
      },
      {
        name: "deleteContactField",
        description: "删除人脉的扩展字段。",
        category: "扩展字段",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "categoryName", type: "string", description: "字段分类名称", required: true },
        ]
      },
      {
        name: "setContactReferrer",
        description: "设置人脉的推荐人。",
        category: "人脉管理",
        parameters: [
          { name: "contactId", type: "number", description: "人脉ID", required: true },
          { name: "referrerName", type: "string", description: "推荐人姓名", required: true },
        ]
      },
      {
        name: "queryCompanyInfo",
        description: "查询企业工商信息，包括公司名称、注册资本、法人代表、成立时间、经营状态等。适用于了解企业背景、验证企业真实性。",
        category: "企业查询",
        parameters: [
          { name: "searchKey", type: "string", description: "搜索关键词，可以是公司名称、统一社会信用代码等", required: true },
        ]
      },
    ]
  };
}

/**
 * 获取API密钥配置状态
 * @returns API密钥状态
 */
export async function getApiKeysStatus() {
  return {
    apiKeys: [
      {
        name: "DEEPSEEK_API_KEY",
        description: "DeepSeek AI API密钥",
        configured: !!process.env.DEEPSEEK_API_KEY,
        value: process.env.DEEPSEEK_API_KEY ? `${process.env.DEEPSEEK_API_KEY.substring(0, 10)}...` : null,
      },
      {
        name: "QICHACHA_APP_KEY",
        description: "企查查 APP KEY",
        configured: !!process.env.QICHACHA_APP_KEY,
        value: process.env.QICHACHA_APP_KEY || null,
      },
      {
        name: "QICHACHA_SECRET_KEY",
        description: "企查查 SECRET KEY",
        configured: !!process.env.QICHACHA_SECRET_KEY,
        value: process.env.QICHACHA_SECRET_KEY ? `${process.env.QICHACHA_SECRET_KEY.substring(0, 10)}...` : null,
      },
    ]
  };
}
