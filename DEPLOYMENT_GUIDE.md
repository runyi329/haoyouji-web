# 生产环境部署指南

## 问题诊断

当前生产环境显示"加载中..."是因为 tRPC API 返回 500 错误。

## 完整部署步骤

### 1. 拉取最新代码
```bash
cd /path/to/haoyouji
git pull origin main
```

### 2. 安装依赖
```bash
pnpm install
```

### 3. 配置环境变量

确保 `.env` 文件包含所有必需的环境变量：

```bash
# 检查环境变量文件
cat .env
```

**必需的环境变量：**
```env
# 数据库配置
DATABASE_URL=mysql://user:password@host:port/database
ORIGINAL_DATABASE_URL=mysql://user:password@host:port/database

# JWT密钥
JWT_SECRET=your-jwt-secret

# OAuth配置
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im
VITE_APP_ID=your-app-id

# DeepSeek API
DEEPSEEK_API_KEY=your-deepseek-api-key

# Manus内置API
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-forge-api-key
VITE_FRONTEND_FORGE_API_KEY=your-frontend-forge-api-key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# 所有者信息
OWNER_OPEN_ID=your-owner-open-id
OWNER_NAME=your-owner-name

# 前端配置
VITE_APP_TITLE=脉动
VITE_APP_LOGO=/logo.png
VITE_ANALYTICS_ENDPOINT=https://analytics.example.com
VITE_ANALYTICS_WEBSITE_ID=your-website-id

# 运行环境
NODE_ENV=production
PORT=3001
```

### 4. 构建前端
```bash
pnpm run build
```

这一步会：
- 编译 TypeScript
- 打包前端资源
- 替换环境变量
- 生成 `dist/public` 目录

### 5. 数据库迁移（如果需要）
```bash
pnpm db:push
```

### 6. 重启服务

**如果使用 PM2：**
```bash
pm2 restart haoyouji
# 或者如果是第一次启动
pm2 start ecosystem.config.js
pm2 save
```

**如果使用 systemd：**
```bash
sudo systemctl restart haoyouji
```

**如果直接运行：**
```bash
# 停止旧进程
pkill -f "node.*haoyouji"

# 启动新进程
NODE_ENV=production pnpm start > logs/app.log 2>&1 &
```

### 7. 查看日志排查错误

**PM2 日志：**
```bash
pm2 logs haoyouji --lines 100
```

**systemd 日志：**
```bash
journalctl -u haoyouji -n 100 -f
```

**直接运行的日志：**
```bash
tail -f logs/app.log
```

## 常见错误排查

### 错误1：tRPC API 返回 500
**原因：** 数据库连接失败
**解决：** 
- 检查 `DATABASE_URL` 是否正确
- 确认数据库服务器是否运行
- 检查数据库用户权限
- 查看服务器日志中的具体错误信息

### 错误2：环境变量未替换（如 %VITE_ANALYTICS_ENDPOINT%）
**原因：** 前端构建时环境变量未正确注入
**解决：**
- 确保 `.env` 文件中包含所有 `VITE_` 开头的变量
- 重新运行 `pnpm run build`
- 检查 `dist/public/index.html` 中是否还有 `%` 符号

### 错误3：页面显示 404
**原因：** 静态文件路径不正确
**解决：**
- 确认 `dist/public` 目录存在
- 检查 `dist/public/index.html` 文件存在
- 确认服务器正确配置了 SPA fallback

### 错误4：数据库表不存在
**原因：** 数据库迁移未执行
**解决：**
```bash
pnpm db:push
```

## 快速诊断命令

```bash
# 1. 检查进程是否运行
ps aux | grep node

# 2. 检查端口是否监听
netstat -tlnp | grep 3001

# 3. 测试API是否响应
curl http://localhost:3001/api/trpc/auth.me

# 4. 检查构建产物
ls -la dist/public/

# 5. 查看最近的错误日志
pm2 logs haoyouji --err --lines 50
```

## 下一步

请在腾讯云服务器上执行以下操作并分享结果：

1. **查看服务器日志**（最重要）：
```bash
pm2 logs haoyouji --lines 100
```

2. **检查环境变量**：
```bash
cat .env | grep -E "DATABASE|DEEPSEEK|JWT"
```

3. **测试数据库连接**：
```bash
# 在项目目录下运行
node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL ? '已配置' : '未配置');"
```

把这些信息发给我，我可以帮您精确定位问题！
