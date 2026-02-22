# 快速部署指南 - 账本备份功能

## 🎯 目标
通过GitHub Actions自动部署最新的账本备份功能代码到服务器。

## ✅ 当前状态
- 代码已推送到GitHub仓库
- GitHub Actions工作流已配置
- 需要确保GitHub Secrets配置正确

## 📋 部署步骤

### 方式一：自动部署（推荐）

#### 1. 检查GitHub Secrets配置
打开 https://github.com/runyi329/haoyouji-web/settings/secrets/actions

确保以下Secrets已配置：
- ✅ `DEPLOY_HOST` - 服务器IP地址
- ✅ `DEPLOY_PORT` - SSH端口（通常是22）
- ✅ `DEPLOY_USER` - SSH用户名（通常是root）
- ✅ `DEPLOY_SSH_KEY` - SSH私钥

#### 2. 触发自动部署
代码已推送到main分支，如果Secrets配置正确，GitHub Actions会自动部署。

查看部署状态：https://github.com/runyi329/haoyouji-web/actions

#### 3. 部署后配置SMTP环境变量
自动部署完成后，需要在服务器上配置SMTP环境变量。

**通过腾讯云控制台网页终端执行：**
```bash
cd /root/haoyouji-web
bash scripts/setup-smtp-env.sh
pm2 restart haoyouji-web
```

### 方式二：手动部署

如果GitHub Actions未配置或遇到问题，可以通过腾讯云控制台手动部署。

#### 1. 登录腾讯云控制台
- 打开腾讯云控制台
- 进入云服务器管理
- 点击"登录"按钮（使用网页终端）

#### 2. 复制粘贴以下命令
```bash
# 进入项目目录
cd /root/haoyouji-web

# 拉取最新代码
git pull origin main

# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 配置SMTP环境变量
bash scripts/setup-smtp-env.sh

# 重启应用
pm2 restart haoyouji-web

# 查看应用状态
pm2 status
```

## 🧪 验证部署

### 1. 检查应用状态
```bash
pm2 status
pm2 logs haoyouji-web --lines 50
```

### 2. 在应用中测试
1. 登录应用
2. 进入任意账本的设置页面
3. 点击"定期自动备份"
4. 确保个人资料中已填写邮箱
5. 点击"立即发送测试邮件"
6. 检查邮箱是否收到备份邮件

## 📝 本次部署内容

### 代码更新
- ✅ commit 387d565 - 修正sendTestBackup API函数名错误
- ✅ commit eda6840 - 添加部署文档和脚本
- ✅ commit e50f455 - 实现备份邮件发送功能

### 新增文件
- `server/email-service.ts` - 邮件发送服务
- `server/backup-service.ts` - 备份执行逻辑
- `server/cron-backup.ts` - 定时任务脚本
- `scripts/setup-smtp-env.sh` - SMTP环境变量配置脚本

### 新增功能
- ✅ 邮件发送服务（QQ邮箱SMTP）
- ✅ 账本备份执行逻辑
- ✅ 定时任务脚本
- ✅ 立即发送测试邮件按钮

## ⚙️ SMTP配置说明

部署后需要配置以下环境变量（脚本会自动添加）：
```
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tina_u@qq.com
SMTP_PASS=wqettalptfmebgdf
```

## 🔧 故障排查

### 问题1：GitHub Actions部署失败
**解决方法：**
1. 检查GitHub Secrets是否配置正确
2. 查看Actions日志：https://github.com/runyi329/haoyouji-web/actions
3. 使用手动部署方式

### 问题2：测试邮件发送失败
**可能原因：**
- SMTP环境变量未配置
- 用户未填写邮箱地址

**解决方法：**
```bash
# 检查环境变量
cd /root/haoyouji-web
grep SMTP .env

# 如果没有，运行配置脚本
bash scripts/setup-smtp-env.sh

# 重启应用
pm2 restart haoyouji-web
```

### 问题3：应用启动失败
**解决方法：**
```bash
# 查看错误日志
pm2 logs haoyouji-web --err --lines 100

# 尝试重启
pm2 restart haoyouji-web

# 如果还是失败，重新构建
cd /root/haoyouji-web
pnpm run build
pm2 restart haoyouji-web
```

## 📞 需要帮助？

如果遇到问题：
1. 查看 `GITHUB_ACTIONS_SETUP.md` 了解详细配置
2. 查看 `SERVER_DEPLOYMENT_CHECKLIST.md` 了解部署清单
3. 查看应用日志：`pm2 logs haoyouji-web`

## ⏭️ 下一步

部署完成后：
1. ✅ 测试"立即发送测试邮件"功能
2. ✅ 配置定期备份设置
3. ✅ 等待定时任务自动执行（每小时检查一次）
4. ✅ 查看备份日志：`tail -f /var/log/haoyouji-backup.log`

---

**注意：** 如果您通过手机操作，建议使用腾讯云控制台的网页终端，可以直接复制粘贴命令执行。
