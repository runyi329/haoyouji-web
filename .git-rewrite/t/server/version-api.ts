import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// 获取版本信息
router.get('/api/version', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'version-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    const now = new Date();
    const forceUpdateUntil = config.forceUpdateUntil ? new Date(config.forceUpdateUntil) : null;
    
    // 判断是否在强制更新期内
    const shouldCheckVersion = forceUpdateUntil && now < forceUpdateUntil;
    
    res.json({
      version: config.version,
      shouldCheckVersion,
      forceUpdateUntil: config.forceUpdateUntil
    });
  } catch (error) {
    console.error('Error reading version config:', error);
    res.json({
      version: '1.0.0',
      shouldCheckVersion: false,
      forceUpdateUntil: null
    });
  }
});

export default router;
