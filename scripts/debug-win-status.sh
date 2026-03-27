#!/bin/bash
# 临时调试脚本：查询win_status差异
# 在服务器上执行: bash scripts/debug-win-status.sh

echo "=== 汇总 ==="
mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db -e "
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0) THEN 1 ELSE 0 END) as won,
  SUM(CASE WHEN win_status IN ('未中奖','0','') OR win_status IS NULL THEN 1 ELSE 0 END) as lost,
  COUNT(*) - SUM(CASE WHEN win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0) THEN 1 ELSE 0 END) - SUM(CASE WHEN win_status IN ('未中奖','0','') OR win_status IS NULL THEN 1 ELSE 0 END) as diff
FROM qq_trade_records WHERE amount IS NOT NULL AND amount != '';
" 2>&1

echo "=== win_status分布(含HEX) ==="
mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db -e "
SELECT win_status, HEX(win_status) as hex_val, COUNT(*) as cnt
FROM qq_trade_records WHERE amount IS NOT NULL AND amount != ''
GROUP BY win_status ORDER BY cnt DESC;
" 2>&1

echo "=== 漏算记录 ==="
mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db -e "
SELECT order_id, win_status, HEX(win_status) as hex_val, amount
FROM qq_trade_records
WHERE amount IS NOT NULL AND amount != ''
  AND NOT (win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0))
  AND NOT (win_status IN ('未中奖','0','') OR win_status IS NULL)
LIMIT 20;
" 2>&1

echo "=== 查询完成 ==="
