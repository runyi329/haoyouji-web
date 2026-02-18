import express from 'express';
import { getDb } from './db';
import { sql } from 'drizzle-orm';

const router = express.Router();

// 获取当前平台估值
router.get('/current', async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: '数据库不可用' });
    }
    
    const result = await db.execute(sql`
      SELECT total_valuation FROM valuation_history ORDER BY id DESC LIMIT 1
    `);
    
    const rows = result as any[];
    if (rows.length === 0) {
      return res.json({ total_valuation: 0 });
    }
    
    res.json({ total_valuation: parseFloat(rows[0].total_valuation) });
  } catch (error) {
    console.error('获取当前估值失败:', error);
    res.status(500).json({ error: '获取当前估值失败' });
  }
});

// 记录行为并更新估值（内部调用）
router.post('/increment', async (req, res) => {
  const { action_type, action_count = 1 } = req.body;
  
  if (!action_type) {
    return res.status(400).json({ error: '缺少action_type参数' });
  }

  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: '数据库不可用' });
    }
    
    // 获取该行为的权重配置
    const weightResult = await db.execute(sql`
      SELECT weight_value, is_enabled FROM valuation_weights WHERE action_type = ${action_type}
    `);
    
    const weightRows = weightResult as any[];
    if (weightRows.length === 0 || !weightRows[0].is_enabled) {
      return res.json({ success: true, message: '该行为未配置或已禁用' });
    }
    
    const weight = parseFloat(weightRows[0].weight_value);
    const increment = weight * action_count;
    
    // 获取当前总估值
    const currentResult = await db.execute(sql`
      SELECT total_valuation FROM valuation_history ORDER BY id DESC LIMIT 1
    `);
    
    const currentRows = currentResult as any[];
    const currentValuation = currentRows.length > 0 
      ? parseFloat(currentRows[0].total_valuation) 
      : 0;
    
    const newValuation = currentValuation + increment;
    
    // 插入新的估值记录
    await db.execute(sql`
      INSERT INTO valuation_history (total_valuation, action_type, action_count, increment_amount) 
      VALUES (${newValuation}, ${action_type}, ${action_count}, ${increment})
    `);
    
    res.json({ 
      success: true, 
      new_valuation: newValuation,
      increment: increment
    });
  } catch (error) {
    console.error('更新估值失败:', error);
    res.status(500).json({ error: '更新估值失败' });
  }
});

export default router;
