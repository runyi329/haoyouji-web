/**
 * AI分身任务系统 - 独立于AI助理的DeepSeek对接
 * 
 * 职责：解析用户自然语言任务描述，生成结构化记账方案
 * 与AI助理的区别：
 *   - AI助理：人脉管理（搜索、添加、修改联系人）
 *   - AI分身：记账任务（解析任务、自动记账、定时执行）
 */

import { getDbConnection } from "./db";

// ==================== 数据库迁移 ====================

let _aiEmployeeTablesMigrated = false;

async function ensureAIEmployeeTables() {
  if (_aiEmployeeTablesMigrated) return;
  try {
    const conn = await getDbConnection();
    if (!conn) return;

    // 创建 AI 分身任务表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ai_employee_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL COMMENT '账本ID',
        user_id INT NOT NULL COMMENT '创建者用户ID',
        task_description TEXT NOT NULL COMMENT '用户原始任务描述',
        parsed_plan JSON COMMENT '解析后的任务方案',
        status ENUM('draft','pending','running','paused','stopped','completed') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
        schedule_type ENUM('once','daily','weekly','monthly') DEFAULT 'once' COMMENT '执行频率',
        schedule_detail VARCHAR(255) COMMENT '执行时间详情（如每天几点、每月几号等）',
        last_executed_at TIMESTAMP NULL COMMENT '上次执行时间',
        next_execute_at TIMESTAMP NULL COMMENT '下次执行时间',
        execution_count INT DEFAULT 0 COMMENT '已执行次数',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ledger_user (ledger_id, user_id),
        INDEX idx_status (status),
        INDEX idx_next_execute (next_execute_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='AI分身任务表'
    `);

    // 创建 AI 分身任务执行日志表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ai_employee_task_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL COMMENT '任务ID',
        ledger_id INT NOT NULL COMMENT '账本ID',
        action_type VARCHAR(50) NOT NULL COMMENT '操作类型（add_transaction等）',
        action_detail JSON COMMENT '操作详情',
        result_status ENUM('success','failed') NOT NULL COMMENT '执行结果',
        result_message TEXT COMMENT '结果消息',
        record_id INT COMMENT '关联的记账记录ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_id (task_id),
        INDEX idx_ledger_id (ledger_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='AI分身任务执行日志'
    `);

    console.log('[AI Employee] 任务表迁移完成');
  } catch (e: any) {
    // 表已存在时忽略
    if (!e.message?.includes('already exists')) {
      console.error('[AI Employee] 迁移错误:', e.message);
    }
  }
  _aiEmployeeTablesMigrated = true;
}

// 模块加载时执行迁移
ensureAIEmployeeTables().catch(console.error);

// ==================== AI分身专用提示词 ====================

/**
 * 构建AI分身的系统提示词（独立于AI助理）
 * AI分身专注于记账任务解析，不涉及人脉管理
 */
function buildAIEmployeeSystemPrompt(categories: any[]): string {
  // 构建分类列表供AI参考
  const categoryList = categories.map(c => {
    const subcats = c.children?.map((s: any) => s.name).join('、') || '';
    return `  - ${c.name}（${c.type === 'expense' ? '支出' : '收入'}）${subcats ? `，子分类：${subcats}` : ''}`;
  }).join('\n');

  return `你是一个智能记账助手（AI分身），专门帮助用户解析自然语言描述的记账任务。

## 你的职责
用户会用自然语言描述他们想要自动执行的记账任务，你需要将其解析为结构化的JSON方案。

## 当前账本可用的分类
${categoryList || '（暂无分类数据）'}

## 输出格式要求
你必须严格按照以下JSON格式输出，不要输出任何其他内容：

\`\`\`json
{
  "summary": "任务概要描述（一句话）",
  "schedule_type": "once|daily|weekly|monthly",
  "schedule_detail": "执行时间描述，如'每天09:00'、'每周一'、'每月1日'、'立即执行一次'",
  "actions": [
    {
      "type": "add_transaction",
      "transaction_type": "income|expense",
      "amount": 数字金额,
      "category_name": "分类名称（从上面的分类中选择最匹配的）",
      "subcategory_name": "子分类名称（可选，如果有匹配的子分类）",
      "description": "备注说明"
    }
  ]
}
\`\`\`

## 解析规则
1. 金额：从描述中提取具体数字，如"50元"→50，"三百"→300
2. 收支类型：根据语义判断，"扣除/花费/支出/消费/付款"→expense，"收入/工资/进账/到账"→income
3. 分类匹配：根据描述内容匹配最合适的分类，如"午餐"→餐饮，"房租"→住房，"工资"→工资薪水
4. 频率：
   - "每天/每日/日常"→daily
   - "每周/每周一/周末"→weekly  
   - "每月/月初/月底/每月X号"→monthly
   - 没有提到频率或"一次性"→once
5. 如果描述不清晰，尽量做出合理推断
6. 一条描述可能包含多个操作（如"每天记录50元午餐和20元交通"→两个action）

## 注意事项
- 只输出JSON，不要有任何额外文字
- 金额必须是正数
- category_name 必须从可用分类中选择
- 如果找不到匹配的分类，使用"其他"`;
}

// ==================== 核心功能 ====================

/**
 * 使用DeepSeek解析用户的任务描述
 */
export async function parseTaskWithAI(
  ledgerId: number,
  userId: number,
  taskDescription: string
): Promise<{
  success: boolean;
  parsed: any;
  tokensUsed: number;
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置");
  }

  // 验证用户是否是账本成员
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  const [memberRows] = await conn.execute(
    'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
    [ledgerId, userId]
  ) as any;

  if (!memberRows || memberRows.length === 0) {
    throw new Error("您不是该账本的成员");
  }

  // 获取账本分类列表供AI参考
  const [categoryRows] = await conn.execute(
    `SELECT id, name, type, parent_id 
     FROM ledger_categories 
     WHERE (ledgerId = ? OR ledgerId = 0) AND is_deleted = 0
     ORDER BY sort_order ASC, id ASC`,
    [ledgerId]
  ) as any;

  // 构建分类树
  const categories = buildCategoryTree(categoryRows || []);

  // 构建提示词
  const systemPrompt = buildAIEmployeeSystemPrompt(categories);

  // 调用DeepSeek API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: taskDescription },
        ],
        temperature: 0.3, // 低温度确保输出稳定
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI Employee] DeepSeek API error:", response.status, errorText);
      throw new Error(`AI服务暂时不可用 (${response.status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;

    console.log("[AI Employee] DeepSeek response:", content);

    // 解析JSON响应
    let parsed;
    try {
      // 尝试从响应中提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI未返回有效的JSON格式");
      }
    } catch (parseError: any) {
      console.error("[AI Employee] JSON parse error:", parseError.message);
      throw new Error("AI返回的任务方案格式异常，请重新描述任务");
    }

    // 验证解析结果的基本结构
    if (!parsed.summary || !parsed.actions || !Array.isArray(parsed.actions)) {
      throw new Error("AI返回的任务方案不完整，请重新描述");
    }

    // 匹配分类ID
    for (const action of parsed.actions) {
      if (action.type === 'add_transaction' && action.category_name) {
        const matchedCategory = findCategoryByName(categoryRows || [], action.category_name, action.transaction_type);
        if (matchedCategory) {
          action.category_id = matchedCategory.id;
          action.category_name = matchedCategory.name;
          
          // 匹配子分类
          if (action.subcategory_name) {
            const matchedSub = findCategoryByName(
              categoryRows || [], 
              action.subcategory_name, 
              action.transaction_type,
              matchedCategory.id
            );
            if (matchedSub) {
              action.subcategory_id = matchedSub.id;
              action.subcategory_name = matchedSub.name;
            }
          }
        }
      }
    }

    return {
      success: true,
      parsed,
      tokensUsed,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("AI请求超时，请稍后重试");
    }
    throw error;
  }
}

/**
 * 确认并创建任务
 */
export async function createAIEmployeeTask(
  ledgerId: number,
  userId: number,
  taskDescription: string,
  parsedPlan: any
): Promise<{ taskId: number; success: boolean }> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  // 计算下次执行时间
  const nextExecuteAt = calculateNextExecuteTime(
    parsedPlan.schedule_type,
    parsedPlan.schedule_detail
  );

  const [result] = await conn.execute(
    `INSERT INTO ai_employee_tasks 
     (ledger_id, user_id, task_description, parsed_plan, status, schedule_type, schedule_detail, next_execute_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
    [
      ledgerId,
      userId,
      taskDescription,
      JSON.stringify(parsedPlan),
      parsedPlan.schedule_type || 'once',
      parsedPlan.schedule_detail || '立即执行',
      nextExecuteAt,
    ]
  ) as any;

  const taskId = result.insertId;

  // 如果是一次性任务，立即执行
  if (parsedPlan.schedule_type === 'once') {
    await executeTask(taskId, ledgerId, userId, parsedPlan);
    // 执行完毕后标记为已完成
    await conn.execute(
      `UPDATE ai_employee_tasks SET status = 'completed', last_executed_at = NOW(), execution_count = execution_count + 1 WHERE id = ?`,
      [taskId]
    );
  }

  return { taskId, success: true };
}

/**
 * 执行任务（实际记账操作）
 */
async function executeTask(
  taskId: number,
  ledgerId: number,
  userId: number,
  parsedPlan: any
) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  for (const action of parsedPlan.actions) {
    if (action.type === 'add_transaction') {
      try {
        // 获取AI分身的memberId
        const [aiMemberRows] = await conn.execute(
          'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? AND member_type = ? LIMIT 1',
          [ledgerId, userId, 'ai']
        ) as any;
        
        const aiMemberId = aiMemberRows?.[0]?.id;

        // 确定分类ID
        let categoryId = action.category_id;
        if (!categoryId) {
          // 如果没有匹配到分类，使用"其他"分类
          const [otherCat] = await conn.execute(
            `SELECT id FROM ledger_categories 
             WHERE (ledgerId = ? OR ledgerId = 0) AND name = '其他' AND type = ? AND is_deleted = 0 
             LIMIT 1`,
            [ledgerId, action.transaction_type || 'expense']
          ) as any;
          categoryId = otherCat?.[0]?.id || 1;
        }

        // 获取今天的日期
        const today = new Date().toISOString().split('T')[0];

        // 插入记账记录
        const [insertResult] = await conn.execute(
          `INSERT INTO ledger_records 
           (ledgerId, type, amount, categoryId, description, recordDate, createdBy)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ledgerId,
            action.transaction_type || 'expense',
            action.amount,
            categoryId,
            action.description || `AI分身自动记账：${parsedPlan.summary}`,
            today,
            userId,
          ]
        ) as any;

        // 记录执行日志
        await conn.execute(
          `INSERT INTO ai_employee_task_logs 
           (task_id, ledger_id, action_type, action_detail, result_status, result_message, record_id)
           VALUES (?, ?, 'add_transaction', ?, 'success', ?, ?)`,
          [
            taskId,
            ledgerId,
            JSON.stringify(action),
            `成功添加${action.transaction_type === 'income' ? '收入' : '支出'}记录 ¥${action.amount}`,
            insertResult.insertId,
          ]
        );

        console.log(`[AI Employee] 任务${taskId}: 成功记账 ¥${action.amount} (${action.transaction_type})`);
      } catch (error: any) {
        // 记录失败日志
        await conn.execute(
          `INSERT INTO ai_employee_task_logs 
           (task_id, ledger_id, action_type, action_detail, result_status, result_message)
           VALUES (?, ?, 'add_transaction', ?, 'failed', ?)`,
          [
            taskId,
            ledgerId,
            JSON.stringify(action),
            `记账失败：${error.message}`,
          ]
        );
        console.error(`[AI Employee] 任务${taskId}: 记账失败`, error.message);
      }
    }
  }
}

/**
 * 获取AI分身的任务列表
 */
export async function getAIEmployeeTasks(
  ledgerId: number,
  userId: number
): Promise<any[]> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  const [rows] = await conn.execute(
    `SELECT id, ledger_id, user_id, task_description, parsed_plan, 
            status, schedule_type, schedule_detail, 
            last_executed_at, next_execute_at, execution_count,
            created_at, updated_at
     FROM ai_employee_tasks 
     WHERE ledger_id = ? AND user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [ledgerId, userId]
  ) as any;

  // 解析 parsed_plan JSON
  return (rows || []).map((row: any) => ({
    ...row,
    parsed_plan: typeof row.parsed_plan === 'string' ? JSON.parse(row.parsed_plan) : row.parsed_plan,
  }));
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: number,
  userId: number,
  status: 'running' | 'paused' | 'stopped'
): Promise<{ success: boolean }> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  await conn.execute(
    `UPDATE ai_employee_tasks SET status = ? WHERE id = ? AND user_id = ?`,
    [status, taskId, userId]
  );

  return { success: true };
}

/**
 * 获取任务执行日志
 */
export async function getTaskLogs(
  taskId: number,
  userId: number
): Promise<any[]> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  // 验证任务归属
  const [taskRows] = await conn.execute(
    'SELECT id FROM ai_employee_tasks WHERE id = ? AND user_id = ?',
    [taskId, userId]
  ) as any;

  if (!taskRows || taskRows.length === 0) {
    throw new Error("任务不存在");
  }

  const [rows] = await conn.execute(
    `SELECT id, action_type, action_detail, result_status, result_message, record_id, created_at
     FROM ai_employee_task_logs
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [taskId]
  ) as any;

  return (rows || []).map((row: any) => ({
    ...row,
    action_detail: typeof row.action_detail === 'string' ? JSON.parse(row.action_detail) : row.action_detail,
  }));
}

// ==================== 辅助函数 ====================

/**
 * 构建分类树
 */
function buildCategoryTree(categories: any[]): any[] {
  const parentCategories = categories.filter(c => !c.parent_id);
  return parentCategories.map(parent => ({
    ...parent,
    children: categories.filter(c => c.parent_id === parent.id),
  }));
}

/**
 * 根据名称模糊匹配分类
 */
function findCategoryByName(
  categories: any[], 
  name: string, 
  type?: string,
  parentId?: number
): any | null {
  // 精确匹配
  let match = categories.find(c => {
    const nameMatch = c.name === name;
    const typeMatch = !type || c.type === type;
    const parentMatch = parentId !== undefined ? c.parent_id === parentId : true;
    return nameMatch && typeMatch && parentMatch;
  });

  if (match) return match;

  // 模糊匹配（包含关系）
  match = categories.find(c => {
    const nameMatch = c.name.includes(name) || name.includes(c.name);
    const typeMatch = !type || c.type === type;
    const parentMatch = parentId !== undefined ? c.parent_id === parentId : !c.parent_id;
    return nameMatch && typeMatch && parentMatch;
  });

  return match || null;
}

/**
 * 计算下次执行时间
 */
function calculateNextExecuteTime(
  scheduleType: string,
  scheduleDetail?: string
): string | null {
  const now = new Date();

  switch (scheduleType) {
    case 'once':
      return now.toISOString().slice(0, 19).replace('T', ' ');
    case 'daily': {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0); // 默认每天9点
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'weekly': {
      const next = new Date(now);
      const dayOfWeek = next.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(9, 0, 0, 0);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'monthly': {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(9, 0, 0, 0);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    default:
      return null;
  }
}
