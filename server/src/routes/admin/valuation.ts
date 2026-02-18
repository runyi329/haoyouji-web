import express from 'express';
import { pool } from '../../db';

const router = express.Router();

// 获取所有权重配置
router.get('/weights', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM valuation_weights ORDER BY id ASC'
    );
    res.json(rows);
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

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    for (const weight of weights) {
      await connection.query(
        'UPDATE valuation_weights SET weight_value = ?, is_enabled = ? WHERE id = ?',
        [weight.weight_value, weight.is_enabled ? 1 : 0, weight.id]
      );
    }
    
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('更新权重配置失败:', error);
    res.status(500).json({ error: '更新权重配置失败' });
  } finally {
    connection.release();
  }
});

export default router;
