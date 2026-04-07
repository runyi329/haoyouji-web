#!/bin/bash
# SSL/HTTPS 诊断脚本
echo "========== SSL/HTTPS 诊断报告 =========="
echo ""

echo "=== 1. Nginx 版本和状态 ==="
nginx -v 2>&1
systemctl status nginx 2>&1 | head -5
echo ""

echo "=== 2. Nginx 配置文件列表 ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
ls -la /etc/nginx/conf.d/ 2>/dev/null
echo ""

echo "=== 3. 所有Nginx配置中的SSL相关内容 ==="
grep -r "ssl\|443\|certificate\|ssl_certificate" /etc/nginx/sites-enabled/ 2>/dev/null
grep -r "ssl\|443\|certificate\|ssl_certificate" /etc/nginx/conf.d/ 2>/dev/null
grep -r "ssl\|443\|certificate\|ssl_certificate" /etc/nginx/nginx.conf 2>/dev/null
echo ""

echo "=== 4. 完整的Nginx站点配置 ==="
for f in /etc/nginx/sites-enabled/*; do
  echo "--- FILE: $f ---"
  cat "$f" 2>/dev/null
  echo ""
done
echo ""

echo "=== 5. /etc/nginx/conf.d/ 下的配置 ==="
for f in /etc/nginx/conf.d/*; do
  echo "--- FILE: $f ---"
  cat "$f" 2>/dev/null
  echo ""
done
echo ""

echo "=== 6. SSL证书文件检查 ==="
find /etc/nginx/ -name "*.pem" -o -name "*.crt" -o -name "*.key" 2>/dev/null
find /etc/letsencrypt/ -name "*.pem" 2>/dev/null | head -20
find /www/server/panel/vhost/cert/ -name "*.pem" -o -name "*.key" 2>/dev/null | head -20
echo ""

echo "=== 7. 宝塔面板检查 ==="
ls /www/server/panel/ 2>/dev/null | head -5
bt default 2>/dev/null | head -5
echo ""

echo "=== 8. certbot检查 ==="
certbot certificates 2>/dev/null
echo ""

echo "=== 9. 监听443端口的进程 ==="
ss -tlnp | grep 443
echo ""

echo "=== 10. Nginx完整配置测试 ==="
nginx -T 2>&1 | head -100
echo ""

echo "========== 诊断完成 =========="
