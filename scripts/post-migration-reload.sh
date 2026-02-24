#!/bin/bash

# 检查是否需要重新加载环境变量

if [ -f "/tmp/haoyouji-env-updated" ]; then
  echo "🔄 检测到环境变量更新，重新加载PM2进程..."
  pm2 reload haoyouji-web --update-env
  rm -f /tmp/haoyouji-env-updated
  echo "✅ PM2进程已重新加载环境变量"
else
  echo "ℹ️  无需重新加载环境变量"
fi
