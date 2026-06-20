# GitHub Actions 自动部署配置指南

## 功能说明

项目已配置GitHub Actions自动部署工作流，每次推送代码到`main`分支时，会自动执行以下操作：

1. ✅ 拉取最新代码
2. ✅ 安装依赖
3. ✅ 构建项目
4. ✅ 执行数据库迁移
5. ✅ 配置SMTP环境变量（如果不存在）
6. ✅ 重启应用

## 前置条件

### 1. 服务器准备
确保服务器已完成以下配置：
- 已安装Node.js、pnpm、pm2
- 项目已部署在 `/root/haoyouji-web`
- 应用已通过pm2启动，名称为 `haoyouji-web`

### 2. GitHub Secrets配置

需要在GitHub仓库中配置以下Secrets：

#### 如何配置Secrets：
1. 打开GitHub仓库页面：https://github.com/runyi329/haoyouji-web
2. 点击 `Settings`（设置）
3. 在左侧菜单中点击 `Secrets and variables` → `Actions`
4. 点击 `New repository secret` 添加以下配置

#### 需要配置的Secrets：

| Secret名称 | 说明 | 示例值 |
|-----------|------|--------|
| `DEPLOY_HOST` | 服务器IP地址 | `123.456.789.0` |
| `DEPLOY_PORT` | SSH端口 | `22` |
| `DEPLOY_USER` | SSH用户名 | `root` |
| `DEPLOY_SSH_KEY` | SSH私钥 | 见下方说明 |

### 3. 生成SSH密钥（如果还没有）

#### 方法一：在本地电脑生成
```bash
# 生成SSH密钥对
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f ~/.ssh/github_deploy

# 查看私钥（用于GitHub Secret）
cat ~/.ssh/github_deploy

# 查看公钥（用于服务器）
cat ~/.ssh/github_deploy.pub
```

#### 方法二：在服务器上生成
```bash
# 登录服务器后执行
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f /root/.ssh/github_deploy

# 将公钥添加到authorized_keys
cat /root/.ssh/github_deploy.pub >> /root/.ssh/authorized_keys

# 查看私钥（复制到GitHub Secret）
cat /root/.ssh/github_deploy
```

### 4. 配置服务器SSH密钥

将公钥添加到服务器的 `~/.ssh/authorized_keys` 文件中：

```bash
# 登录服务器
ssh root@your-server-ip

# 编辑authorized_keys
nano ~/.ssh/authorized_keys

# 粘贴公钥内容，保存退出
```

确保权限正确：
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

## 验证配置

### 1. 检查GitHub Secrets
确保所有4个Secrets都已配置：
- ✅ DEPLOY_HOST
- ✅ DEPLOY_PORT
- ✅ DEPLOY_USER
- ✅ DEPLOY_SSH_KEY

### 2. 测试SSH连接
在本地测试SSH密钥是否可用：
```bash
ssh -i /path/to/private_key -p PORT USER@HOST
```

### 3. 触发自动部署
推送代码到main分支：
```bash
git push origin main
```

### 4. 查看部署状态
1. 打开GitHub仓库页面
2. 点击顶部的 `Actions` 标签
3. 查看最新的工作流运行状态

## 部署流程

```mermaid
graph LR
    A[推送代码到main] --> B[触发GitHub Actions]
    B --> C[SSH连接服务器]
    C --> D[拉取最新代码]
    D --> E[安装依赖]
    E --> F[构建项目]
    F --> G[数据库迁移]
    G --> H[配置环境变量]
    H --> I[重启应用]
    I --> J[部署完成]
```

## 当前部署状态

最新的代码修复已推送到GitHub：
- ✅ commit 387d565 - 修正sendTestBackup API函数名错误
- ✅ commit eda6840 - 添加部署文档和脚本
- ✅ commit e50f455 - 实现备份邮件发送功能

## 自动部署内容

本次部署将自动完成：
1. ✅ 更新邮件发送服务代码
2. ✅ 更新备份执行逻辑
3. ✅ 添加定时任务脚本
4. ✅ 修复API函数名错误
5. ✅ 自动配置SMTP环境变量

## 手动触发部署

如果需要手动触发部署，可以：

### 方法一：推送空提交
```bash
git commit --allow-empty -m "trigger deployment"
git push origin main
```

### 方法二：在GitHub界面手动触发
1. 进入 `Actions` 标签
2. 选择工作流
3. 点击 `Run workflow` 按钮

## 故障排查

### 问题1：SSH连接失败
**错误信息：** `Permission denied (publickey)`

**解决方法：**
1. 检查DEPLOY_SSH_KEY是否正确配置
2. 确认公钥已添加到服务器的authorized_keys
3. 检查服务器SSH配置是否允许密钥登录

### 问题2：pm2命令未找到
**错误信息：** `pm2: command not found`

**解决方法：**
```bash
# 登录服务器
npm install -g pm2
```

### 问题3：pnpm命令未找到
**错误信息：** `pnpm: command not found`

**解决方法：**
```bash
# 登录服务器
npm install -g pnpm
```

### 问题4：数据库迁移失败
**解决方法：**
- 部署脚本中已添加 `|| true`，迁移失败不会中断部署
- 可以手动登录服务器执行迁移

### 问题5：端口被占用
**错误信息：** `Error: listen EADDRINUSE`

**解决方法：**
```bash
# 登录服务器
pm2 restart haoyouji-web
# 或
pm2 delete haoyouji-web
pm2 start ecosystem.config.js
```

## 监控部署

### 查看部署日志
1. GitHub Actions页面查看实时日志
2. 服务器上查看应用日志：
```bash
pm2 logs haoyouji-web
```

### 查看应用状态
```bash
pm2 status
pm2 info haoyouji-web
```

## 安全建议

1. **保护SSH私钥**
   - 不要在代码中硬编码私钥
   - 只在GitHub Secrets中配置
   - 定期更换密钥

2. **限制SSH访问**
   - 使用密钥认证，禁用密码登录
   - 配置防火墙规则
   - 使用非标准SSH端口

3. **监控部署活动**
   - 定期检查GitHub Actions日志
   - 设置部署失败通知
   - 监控服务器资源使用

## 下一步操作

配置完成后，您只需要：
1. ✅ 确认GitHub Secrets已配置
2. ✅ 代码已推送到main分支
3. ✅ 等待自动部署完成（约2-3分钟）
4. ✅ 在应用中测试备份功能

## 联系支持

如果遇到问题：
1. 查看GitHub Actions日志
2. 查看服务器应用日志
3. 参考本文档的故障排查部分
