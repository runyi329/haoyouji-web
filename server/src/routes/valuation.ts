import express from 'express';
import { pool } from '../db';

const router = express.Router();

// 获取当前平台估值
router.get('/current', async (req, res) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT total_valuation FROM valuation_history ORDER BY id DESC LIMIT 1'
    );
    
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

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 获取该行为的权重配置
    const [weightRows]: any = await connection.query(
      'SELECT weight_value, is_enabled FROM valuation_weights WHERE action_type = ?',
      [action_type]
    );
    
    if (weightRows.length === 0 || !weightRows[0].is_enabled) {
      await connection.commit();
      return res.json({ success: true, message: '该行为未配置或已禁用' });
    }
    
    const weight = parseFloat(weightRows[0].weight_value);
    const increment = weight * action_count;
    
    // 获取当前总估值
    const [currentRows]: any = await connection.query(
      'SELECT total_valuation FROM valuation_history ORDER BY id DESC LIMIT 1'
    );
    
    const currentValuation = currentRows.length > 0 
      ? parseFloat(currentRows[0].total_valuation) 
      : 0;
    
    const newValuation = currentValuation + increment;
    
    // 插入新的估值记录
    await connection.query(
      'INSERT INTO valuation_history (total_valuation, action_type, action_count, increment_amount) VALUES (?, ?, ?, ?)',
      [newValuation, action_type, action_count, increment]
    );
    
    await connection.commit();
    res.json({ 
      success: true, 
      new_valuation: newValuation,
      increment: increment
    });
  } catch (error) {
    await connection.rollback();
    console.error('更新估值失败:', error);
    res.status(500).json({ error: '更新估值失败' });
  } finally {
    connection.release();
  }
});

export default router;
