#!/bin/bash
echo "=== 1. 修复 DATABASE_URL 密码 ==="
cd /home/ubuntu/haoyouji-web

# 备份原始.env
cp .env .env.bak.$(date +%Y%m%d%H%M%S)

# 替换密码：Hu20190603 -> Miao@20190603
# 注意：@符号需要URL编码为%40
sed -i 's|Hu20190603|Miao%4020190603|g' .env

echo "修改后的DATABASE_URL:"
grep "DATABASE_URL" .env | head -2

echo ""
echo "=== 2. 测试新密码连接 ==="
python3 -c "
import pymysql
try:
    conn = pymysql.connect(host='127.0.0.1', user='root', password='Miao@20190603', database='crm_db', port=3306, connect_timeout=5)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM ts_daily')
    count = cursor.fetchone()[0]
    print(f'✅ 连接成功！ts_daily 表有 {count} 条记录')
    cursor.execute('SELECT COUNT(*) FROM ts_stock_basic')
    count2 = cursor.fetchone()[0]
    print(f'✅ ts_stock_basic 表有 {count2} 条记录')
    conn.close()
except Exception as e:
    print(f'❌ 连接失败: {e}')
"

echo ""
echo "=== 3. 重启应用 ==="
cd /home/ubuntu/haoyouji-web
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 restart haoyouji-web'
sleep 5

echo ""
echo "=== 4. 检查应用状态 ==="
sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 status'

echo ""
echo "=== 5. 检查端口 ==="
ss -tlnp | grep ':300'

echo ""
echo "=== 6. 等待应用启动后测试API ==="
sleep 10

# 先检查应用监听的端口
APP_PORT=$(ss -tlnp | grep -oP ':\K300[0-9]' | head -1)
echo "应用监听端口: $APP_PORT"

if [ -n "$APP_PORT" ]; then
    echo "测试 aiDashboardMarketCount..."
    timeout 30 curl -s "http://127.0.0.1:$APP_PORT/api/trpc/aiDashboardMarketCount?input=%7B%22json%22%3Anull%7D" 2>&1 | head -5
    echo ""
    echo "测试 aiDashboardSurvival..."
    timeout 30 curl -s "http://127.0.0.1:$APP_PORT/api/trpc/aiDashboardSurvival?input=%7B%22json%22%3A%7B%22page%22%3A1%2C%22pageSize%22%3A5%7D%7D" 2>&1 | head -5
else
    echo "❌ 应用未监听任何端口"
    echo "PM2 错误日志:"
    sudo -u ubuntu bash -c 'HOME=/home/ubuntu pm2 logs haoyouji-web --err --lines 20 --nostream'
fi

echo ""
echo "=== 完成 ==="
