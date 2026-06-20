#!/bin/bash
# 临时调试脚本：查询win_status差异，结果推送到企业微信

WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g"

echo "=== 汇总 ==="
SUMMARY=$(mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db --skip-column-names -e "
SELECT CONCAT('total=', COUNT(*),
  '  won=', SUM(CASE WHEN win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0) THEN 1 ELSE 0 END),
  '  lost=', SUM(CASE WHEN win_status IN ('未中奖','0','') OR win_status IS NULL THEN 1 ELSE 0 END),
  '  diff=', COUNT(*) - SUM(CASE WHEN win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0) THEN 1 ELSE 0 END) - SUM(CASE WHEN win_status IN ('未中奖','0','') OR win_status IS NULL THEN 1 ELSE 0 END))
FROM qq_trade_records WHERE amount IS NOT NULL AND amount != '';
" 2>/dev/null)
echo "$SUMMARY"

echo "=== win_status分布 ==="
DIST=$(mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db --skip-column-names -e "
SELECT CONCAT('\"', IFNULL(win_status,'NULL'), '\" hex=[', IFNULL(HEX(win_status),''), '] cnt=', COUNT(*))
FROM qq_trade_records WHERE amount IS NOT NULL AND amount != ''
GROUP BY win_status ORDER BY COUNT(*) DESC;
" 2>/dev/null)
echo "$DIST"

echo "=== 漏算记录 ==="
MISSED=$(mysql -h 127.0.0.1 -u root -pMiao@20190603 crm_db --skip-column-names -e "
SELECT CONCAT('order_id=', IFNULL(order_id,'?'), ' win_status=\"', IFNULL(win_status,'NULL'), '\" hex=[', IFNULL(HEX(win_status),''), '] amount=', IFNULL(amount,'?'))
FROM qq_trade_records
WHERE amount IS NOT NULL AND amount != ''
  AND NOT (win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0))
  AND NOT (win_status IN ('未中奖','0','') OR win_status IS NULL)
LIMIT 20;
" 2>/dev/null)
if [ -z "$MISSED" ]; then
  MISSED="无漏算记录"
fi
echo "$MISSED"

# 推送到企业微信
MSG="## win_status差异调试结果\n\n**汇总：**\n${SUMMARY}\n\n**win_status分布：**\n${DIST}\n\n**漏算记录：**\n${MISSED}"

curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"msgtype\":\"markdown\",\"markdown\":{\"content\":\"${MSG}\"}}"

echo "=== 查询完成，已推送企业微信 ==="
