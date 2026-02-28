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
        schedule_type VARCHAR(30) DEFAULT 'once' COMMENT '执行频率(once/every_minute/every_5_minutes/every_10_minutes/every_30_minutes/every_hour/daily/weekly/monthly)',
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

    // 修复旧表：如果schedule_type是ENUM类型，改为VARCHAR(30)
    try {
      const [cols] = await conn.execute(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_employee_tasks' AND COLUMN_NAME = 'schedule_type'`
      ) as any;
      const colType: string = cols?.[0]?.COLUMN_TYPE || '';
      if (colType.toLowerCase().startsWith('enum')) {
        await conn.execute(
          `ALTER TABLE ai_employee_tasks MODIFY COLUMN schedule_type VARCHAR(30) DEFAULT 'once' COMMENT '执行频率(once/every_minute/every_5_minutes/every_10_minutes/every_30_minutes/every_hour/daily/weekly/monthly)'`
        );
        console.log('[AI Employee] 已将schedule_type从ENUM改为VARCHAR(30)');
      }
    } catch (alterErr: any) {
      console.error('[AI Employee] ALTER TABLE schedule_type失败:', alterErr.message);
    }

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

// ==================== 对话历史表迁移 ====================

let _aiConversationTableMigrated = false;
async function ensureAIConversationTable() {
  if (_aiConversationTableMigrated) return;
  try {
    const conn = await getDbConnection();
    if (!conn) return;
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ai_employee_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL COMMENT '账本ID',
        user_id INT NOT NULL COMMENT '用户ID',
        role ENUM('user','assistant') NOT NULL COMMENT '角色',
        content TEXT NOT NULL COMMENT '消息内容',
        action_data JSON COMMENT '待执行的动作数据（assistant消息才有）',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ledger_user (ledger_id, user_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='AI分身对话历史'
    `);
    console.log('[AI Employee] 对话历史表迁移完成');
  } catch (e: any) {
    if (!e.message?.includes('already exists')) {
      console.error('[AI Employee] 对话历史表迁移错误:', e.message);
    }
  }
  _aiConversationTableMigrated = true;
}
ensureAIConversationTable().catch(console.error);

// ==================== AI分身专用提示词 ====================

/**
 * 构建AI分身的系统提示词（独立于AI助理）
 * AI分身专注于记账任务解析，不涉及人脉管理
 */
function buildAIEmployeeSystemPrompt(categories: any[], today?: string): string {
  const categoryList = categories.map(c => {
    const subcats = c.children?.map((s: any) => s.name).join('、') || '';
    return `  - ${c.name}（${c.type === 'expense' ? '支出' : '收入'}）${subcats ? `，子分类：${subcats}` : ''}`;
  }).join('\n');

  const todayStr = today || new Date().toISOString().split('T')[0];
  const todayDate = new Date(todayStr);
  const yesterday = new Date(todayDate); yesterday.setDate(todayDate.getDate() - 1);
  const dayBeforeYesterday = new Date(todayDate); dayBeforeYesterday.setDate(todayDate.getDate() - 2);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
  const weekdays = ['日','一','二','三','四','五','六'];

  return `你是一个智能记账助手（AI分身），专门帮助用户在账本中记账。你可以进行多轮对话，理解用户意图后再执行。

## 当前日期信息
- 今天：${todayStr}（周${weekdays[todayDate.getDay()]}）
- 昨天：${yesterdayStr}
- 前天：${dayBeforeYesterdayStr}

## 你能做的事
1. 在账本中添加收入或支出记录（add_transaction）
2. 创建新的记账分类（create_category）

## 你绝对不能做的事
- 删除或修改已有记录、分类、成员
- 管理人脉/联系人
- 修改账本设置或成员
- 访问外部网站

## 当前账本分类
${categoryList || '（暂无分类）'}

## 输出格式（必须严格遵守，只输出JSON）

当还在对话/询问阶段时：
\`\`\`json
{
  "reply": "对用户说的话（自然语言，友好简洁）",
  "action": null
}
\`\`\`

当用户明确确认执行时：
\`\`\`json
{
  "reply": "执行结果说明",
  "action": {
    "type": "confirm_and_execute",
    "plan": {
      "summary": "任务概要",
      "schedule_type": "once|daily|weekly|monthly|every_minute|every_5_minutes|every_10_minutes|every_30_minutes|every_hour",
      "schedule_detail": "执行时间描述",
      "actions": [
        {
          "type": "add_transaction",
          "transaction_type": "income|expense",
          "amount": 数字,
          "category_name": "分类名",
          "description": "备注",
          "record_date": "YYYY-MM-DD（仅历史日期时填写）"
        }
      ]
    }
  }
}
\`\`\`

创建分类时在 plan.actions 中加入：
\`\`\`json
{
  "type": "create_category",
  "category_type": "expense|income",
  "category_name": "分类名称"
}
\`\`\`

## 对话规则

1. **分类不存在时**：主动询问用户选择：
   - 选项1：帮您创建新分类"XXX"
   - 选项2：归入现有分类"XXX"
   - 选项3：写入备注，分类选"其他"

2. **确认机制**：理解用户意图后，先用自然语言复述任务请用户确认，action 设为 null；用户说"确认"/"对"/"好的"/"执行"等词后，才将 action 设为 confirm_and_execute

3. **历史日期**：
   - "昨天" → record_date: "${yesterdayStr}"
   - "前天" → record_date: "${dayBeforeYesterdayStr}"
   - "X天前" → 今天减X天
   - "从X天前到今天" → 生成多个action，每个对应一天

4. **金额**：固定金额用 amount，随机范围用 amount_min + amount_max

5. **回复风格**：自然、友好、简洁，像一个贴心的财务助手

## 注意
- 只输出JSON，不要有任何额外文字
- 金额必须是正数`;
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
    `SELECT id, name, type, parentId 
     FROM ledger_categories 
     WHERE (ledgerId = ? OR ledgerId = 0)
     ORDER BY sortOrder ASC, id ASC`,
    [ledgerId]
  ) as any;

  // 构建分类树
  const categories = buildCategoryTree(categoryRows || []);

  // 构建提示词
  // 传入今天的日期，让AI能正确解析相对日期（昨天、3天前等）
  const todayForPrompt = new Date().toISOString().split('T')[0];
  const systemPrompt = buildAIEmployeeSystemPrompt(categories, todayForPrompt);

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
  } else {
    // 对于周期性任务，立即执行第一次
    await executeTask(taskId, ledgerId, userId, parsedPlan);
    await conn.execute(
      `UPDATE ai_employee_tasks SET last_executed_at = NOW(), execution_count = execution_count + 1 WHERE id = ?`,
      [taskId]
    );

    // 对于分钟/小时级别的任务，启动内存定时器
    const intervalMs = getIntervalMs(parsedPlan.schedule_type);
    if (intervalMs) {
      startTaskTimer(taskId, ledgerId, userId, parsedPlan, intervalMs);
    }
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
             WHERE (ledgerId = ? OR ledgerId = 0) AND name = '其他' AND type = ? 
             LIMIT 1`,
            [ledgerId, action.transaction_type || 'expense']
          ) as any;
          categoryId = otherCat?.[0]?.id || 1;
        }

        // 获取今天的日期
        // 使用action中指定的日期，如果没有则用今天（支持补录历史账目）
        const today = action.record_date || new Date().toISOString().split('T')[0];
        // 计算实际金额：支持随机范围围
        let actualAmount: number;
        if (action.amount_min !== undefined && action.amount_max !== undefined) {
          // 随机范围金额：在[min, max]之间生成随机整数
          const min = Math.ceil(Number(action.amount_min));
          const max = Math.floor(Number(action.amount_max));
          actualAmount = Math.floor(Math.random() * (max - min + 1)) + min;
        } else {
          actualAmount = Number(action.amount) || 0;
        }

        // 插入记账记录
        const [insertResult] = await conn.execute(
          `INSERT INTO ledger_records 
           (ledgerId, type, amount, categoryId, description, recordDate, createdBy)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ledgerId,
            action.transaction_type || 'expense',
            actualAmount,
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
            `成功添加${action.transaction_type === 'income' ? '收入' : '支出'}记录 ¥${actualAmount}${action.amount_min !== undefined ? `（随机范围${action.amount_min}-${action.amount_max}）` : ''}`,
            insertResult.insertId,
          ]
        );

        console.log(`[AI Employee] 任务${taskId}: 成功记账 ¥${actualAmount} (${action.transaction_type})${action.amount_min !== undefined ? ` [随机范围${action.amount_min}-${action.amount_max}]` : ''}`);
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

  // 暂停或停止时清除定时器
  if (status === 'paused' || status === 'stopped') {
    stopTaskTimer(taskId);
  }

  // 恢复运行时重启定时器
  if (status === 'running') {
    const [taskRows] = await conn.execute(
      'SELECT ledger_id, user_id, parsed_plan, schedule_type FROM ai_employee_tasks WHERE id = ?',
      [taskId]
    ) as any;
    const task = taskRows?.[0];
    if (task) {
      const parsedPlan = typeof task.parsed_plan === 'string' ? JSON.parse(task.parsed_plan) : task.parsed_plan;
      const intervalMs = getIntervalMs(task.schedule_type);
      if (intervalMs) {
        startTaskTimer(taskId, task.ledger_id, task.user_id, parsedPlan, intervalMs);
      }
    }
  }

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
  const parentCategories = categories.filter(c => !c.parentId);
  return parentCategories.map(parent => ({
    ...parent,
    children: categories.filter(c => c.parentId === parent.id),
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
    const parentMatch = parentId !== undefined ? c.parentId === parentId : true;
    return nameMatch && typeMatch && parentMatch;
  });

  if (match) return match;

  // 模糊匹配（包含关系）
  match = categories.find(c => {
    const nameMatch = c.name.includes(name) || name.includes(c.name);
    const typeMatch = !type || c.type === type;
    const parentMatch = parentId !== undefined ? c.parentId === parentId : !c.parentId;
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
    case 'every_minute': {
      const next = new Date(now.getTime() + 60 * 1000);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'every_5_minutes': {
      const next = new Date(now.getTime() + 5 * 60 * 1000);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'every_10_minutes': {
      const next = new Date(now.getTime() + 10 * 60 * 1000);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'every_30_minutes': {
      const next = new Date(now.getTime() + 30 * 60 * 1000);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'every_hour': {
      const next = new Date(now.getTime() + 60 * 60 * 1000);
      return next.toISOString().slice(0, 19).replace('T', ' ');
    }
    case 'daily': {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
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

/**
 * 获取频率对应的间隔毫秒数
 */
function getIntervalMs(scheduleType: string): number | null {
  switch (scheduleType) {
    case 'every_minute': return 60 * 1000;
    case 'every_5_minutes': return 5 * 60 * 1000;
    case 'every_10_minutes': return 10 * 60 * 1000;
    case 'every_30_minutes': return 30 * 60 * 1000;
    case 'every_hour': return 60 * 60 * 1000;
    default: return null;
  }
}

// ==================== 定时器管理 ====================

// 内存中存储活跃的定时器
const activeTimers: Map<number, NodeJS.Timeout> = new Map();

/**
 * 启动任务定时器
 */
function startTaskTimer(
  taskId: number,
  ledgerId: number,
  userId: number,
  parsedPlan: any,
  intervalMs: number
) {
  // 先清理已有定时器
  stopTaskTimer(taskId);

  const timer = setInterval(async () => {
    try {
      const conn = await getDbConnection();
      if (!conn) return;

      // 检查任务是否仍在运行
      const [taskRows] = await conn.execute(
        'SELECT status FROM ai_employee_tasks WHERE id = ?',
        [taskId]
      ) as any;

      const task = taskRows?.[0];
      if (!task || task.status !== 'running') {
        // 任务已暂停/停止/完成，清除定时器
        stopTaskTimer(taskId);
        return;
      }

      // 执行任务
      await executeTask(taskId, ledgerId, userId, parsedPlan);

      // 更新执行信息
      const nextExecuteAt = calculateNextExecuteTime(parsedPlan.schedule_type, parsedPlan.schedule_detail);
      await conn.execute(
        `UPDATE ai_employee_tasks 
         SET last_executed_at = NOW(), execution_count = execution_count + 1, next_execute_at = ?
         WHERE id = ?`,
        [nextExecuteAt, taskId]
      );

      console.log(`[AI Employee] 定时任务${taskId}: 执行成功`);
    } catch (error: any) {
      console.error(`[AI Employee] 定时任务${taskId}: 执行失败`, error.message);
    }
  }, intervalMs);

  activeTimers.set(taskId, timer);
  console.log(`[AI Employee] 定时器已启动: 任务${taskId}, 间隔${intervalMs / 1000}秒`);
}

/**
 * 停止任务定时器
 */
export function stopTaskTimer(taskId: number) {
  const timer = activeTimers.get(taskId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(taskId);
    console.log(`[AI Employee] 定时器已停止: 任务${taskId}`);
  }
}

/**
 * 服务启动时恢复所有活跃的分钟/小时级定时任务
 */
export async function restoreActiveTimers() {
  try {
    const conn = await getDbConnection();
    if (!conn) return;

    const [rows] = await conn.execute(
      `SELECT id, ledger_id, user_id, parsed_plan, schedule_type 
       FROM ai_employee_tasks 
       WHERE status = 'running' 
       AND schedule_type IN ('every_minute', 'every_5_minutes', 'every_10_minutes', 'every_30_minutes', 'every_hour')`
    ) as any;

    for (const row of (rows || [])) {
      const parsedPlan = typeof row.parsed_plan === 'string' ? JSON.parse(row.parsed_plan) : row.parsed_plan;
      const intervalMs = getIntervalMs(row.schedule_type);
      if (intervalMs) {
        startTaskTimer(row.id, row.ledger_id, row.user_id, parsedPlan, intervalMs);
      }
    }

    console.log(`[AI Employee] 已恢复 ${(rows || []).length} 个活跃定时任务`);
  } catch (error: any) {
    console.error('[AI Employee] 恢复定时任务失败:', error.message);
  }
}

// 服务启动时自动恢复定时任务
setTimeout(() => {
  restoreActiveTimers().catch(console.error);
}, 5000); // 延迟5秒等待数据库连接就绪

// ==================== 多轮对话 API ====================

/**
 * 获取账本的对话历史（最近20条）
 */
export async function getAIConversationHistory(
  ledgerId: number,
  userId: number
): Promise<Array<{ role: string; content: string; action_data: any; created_at: string }>> {
  await ensureAIConversationTable();
  const conn = await getDbConnection();
  if (!conn) return [];

  const [rows] = await conn.execute(
    `SELECT role, content, action_data, created_at 
     FROM ai_employee_conversations 
     WHERE ledger_id = ? AND user_id = ?
     ORDER BY created_at DESC 
     LIMIT 20`,
    [ledgerId, userId]
  ) as any;

  return (rows || []).reverse();
}

/**
 * 清空账本的对话历史
 */
export async function clearAIConversationHistory(
  ledgerId: number,
  userId: number
): Promise<void> {
  await ensureAIConversationTable();
  const conn = await getDbConnection();
  if (!conn) return;

  await conn.execute(
    'DELETE FROM ai_employee_conversations WHERE ledger_id = ? AND user_id = ?',
    [ledgerId, userId]
  );
}

/**
 * 多轮对话：发送消息给AI，获取回复，如果用户确认则执行任务
 */
export async function chatWithAIEmployee(
  ledgerId: number,
  userId: number,
  userMessage: string
): Promise<{
  reply: string;
  action: any;
  taskCreated?: { taskId: number; summary: string };
}> {
  await ensureAIConversationTable();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");

  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");

  // 验证成员
  const [memberRows] = await conn.execute(
    'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
    [ledgerId, userId]
  ) as any;
  if (!memberRows || memberRows.length === 0) throw new Error("您不是该账本的成员");

  // 获取分类
  const [categoryRows] = await conn.execute(
    `SELECT id, name, type, parentId FROM ledger_categories 
     WHERE (ledgerId = ? OR ledgerId = 0) ORDER BY sortOrder ASC, id ASC`,
    [ledgerId]
  ) as any;
  const categories = buildCategoryTree(categoryRows || []);

  // 获取历史对话（最近20条）
  const [historyRows] = await conn.execute(
    `SELECT role, content FROM ai_employee_conversations 
     WHERE ledger_id = ? AND user_id = ?
     ORDER BY created_at DESC LIMIT 20`,
    [ledgerId, userId]
  ) as any;
  const history = (historyRows || []).reverse();

  // 构建消息列表
  const todayStr = new Date().toISOString().split('T')[0];
  const systemPrompt = buildAIEmployeeSystemPrompt(categories, todayStr);
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h: any) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  // 保存用户消息
  await conn.execute(
    'INSERT INTO ai_employee_conversations (ledger_id, user_id, role, content) VALUES (?, ?, ?, ?)',
    [ledgerId, userId, 'user', userMessage]
  );

  // 调用 DeepSeek
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let aiReply = '';
  let parsedAction: any = null;

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AI服务暂时不可用 (${response.status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON响应
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        aiReply = parsed.reply || content;
        parsedAction = parsed.action || null;
      } catch {
        aiReply = content;
      }
    } else {
      aiReply = content;
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error("AI请求超时，请稍后重试");
    throw error;
  }

  // 保存AI回复
  await conn.execute(
    'INSERT INTO ai_employee_conversations (ledger_id, user_id, role, content, action_data) VALUES (?, ?, ?, ?, ?)',
    [ledgerId, userId, 'assistant', aiReply, parsedAction ? JSON.stringify(parsedAction) : null]
  );

  // 如果有执行动作，处理分类创建和记账
  let taskCreated: { taskId: number; summary: string } | undefined;

  if (parsedAction?.type === 'confirm_and_execute' && parsedAction?.plan) {
    const plan = parsedAction.plan;

    // 先处理 create_category 动作
    for (const action of (plan.actions || [])) {
      if (action.type === 'create_category') {
        try {
          // 检查分类是否已存在
          const [existCat] = await conn.execute(
            `SELECT id FROM ledger_categories WHERE ledgerId = ? AND name = ? AND type = ? LIMIT 1`,
            [ledgerId, action.category_name, action.category_type || 'expense']
          ) as any;

          if (!existCat || existCat.length === 0) {
            await conn.execute(
              `INSERT INTO ledger_categories (ledgerId, name, type, sortOrder) VALUES (?, ?, ?, 999)`,
              [ledgerId, action.category_name, action.category_type || 'expense']
            );
            console.log(`[AI Chat] 创建分类: ${action.category_name}`);
          }

          // 重新获取分类列表（包含新创建的）
          const [newCatRows] = await conn.execute(
            `SELECT id, name, type FROM ledger_categories WHERE ledgerId = ? AND name = ? LIMIT 1`,
            [ledgerId, action.category_name]
          ) as any;

          if (newCatRows?.[0]) {
            // 将后续 add_transaction 中的 category_name 匹配到新分类ID
            for (const txAction of (plan.actions || [])) {
              if (txAction.type === 'add_transaction' && txAction.category_name === action.category_name) {
                txAction.category_id = newCatRows[0].id;
              }
            }
          }
        } catch (e: any) {
          console.error('[AI Chat] 创建分类失败:', e.message);
        }
      }
    }

    // 重新匹配分类ID（针对 add_transaction）
    const [freshCategoryRows] = await conn.execute(
      `SELECT id, name, type, parentId FROM ledger_categories 
       WHERE (ledgerId = ? OR ledgerId = 0) ORDER BY sortOrder ASC, id ASC`,
      [ledgerId]
    ) as any;

    for (const action of (plan.actions || [])) {
      if (action.type === 'add_transaction' && action.category_name && !action.category_id) {
        const matched = findCategoryByName(freshCategoryRows || [], action.category_name, action.transaction_type);
        if (matched) {
          action.category_id = matched.id;
          action.category_name = matched.name;
        }
      }
    }

    // 创建任务并执行
    const result = await createAIEmployeeTask(ledgerId, userId, userMessage, plan);
    taskCreated = { taskId: result.taskId, summary: plan.summary };
  }

  return { reply: aiReply, action: parsedAction, taskCreated };
}
