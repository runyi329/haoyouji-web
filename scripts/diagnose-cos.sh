#!/bin/bash
echo "========== COS/图片上传诊断报告 =========="
echo ""
echo "=== 1. PM2 环境变量（COS相关） ==="
cd /root/haoyouji-web
pm2 env haoyouji-web 2>&1 | grep -i "COS\|cos_" || echo "未找到COS相关环境变量"

echo ""
echo "=== 2. ecosystem.config.cjs 中的COS配置 ==="
grep -i "COS\|cos_secret\|cos_bucket\|cos_region" /root/haoyouji-web/ecosystem.config.cjs 2>/dev/null | head -20 || echo "未找到ecosystem.config.cjs"

echo ""
echo "=== 3. 最近的图片上传相关日志 ==="
pm2 logs haoyouji-web --lines 100 --nostream 2>&1 | grep -i "COS\|uploadLedgerImage\|cos-upload\|图片上传\|upload" | tail -30

echo ""
echo "=== 4. 测试COS连接 ==="
node -e "
const dotenv = require('dotenv');
dotenv.config({ path: '/root/haoyouji-web/.env' });
console.log('COS_SECRET_ID:', process.env.COS_SECRET_ID ? '已设置(长度:' + process.env.COS_SECRET_ID.length + ')' : '未设置');
console.log('COS_SECRET_KEY:', process.env.COS_SECRET_KEY ? '已设置(长度:' + process.env.COS_SECRET_KEY.length + ')' : '未设置');
console.log('COS_BUCKET:', process.env.COS_BUCKET || '未设置(使用默认值)');
console.log('COS_REGION:', process.env.COS_REGION || '未设置(使用默认值)');
" 2>&1

echo ""
echo "========== 诊断完成 =========="
