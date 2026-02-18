import express from 'express';
import { getDb } from './db';
import { sql } from 'drizzle-orm';

const router = express.Router();

// 获取所有权重配置
router.get('/weights', async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: '数据库不可用' });
    }
    
    const result = await db.execute(sql`
      SELECT * FROM valuation_weights ORDER BY id ASC
    `);
    
    res.json(result);
  } catch (error) {
    console.error('获取权重配置失败:', error);
    res.status(500).json({ error: '获取权重配置失败' });
  }
});

// 更新权重配置
router.put('/weights', async (req, res) => {
  const { weights } = req.body;
  
  if (!Array.isArray(weights)) {
    return res.status(400).json({ error: '参数格式错误' });
  }

  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: '数据库不可用' });
    }
    
    // 逐个更新权重配置
    for (const weight of weights) {
      await db.execute(sql`
        UPDATE valuation_weights 
        SET weight_value = ${weight.weight_value}, is_enabled = ${weight.is_enabled ? 1 : 0} 
        WHERE id = ${weight.id}
      `);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('更新权重配置失败:', error);
    res.status(500).json({ error: '更新权重配置失败' });
  }
});

export default router;
