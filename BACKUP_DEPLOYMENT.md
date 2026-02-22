# 账本备份功能部署说明

## 功能概述
实现了账本定期自动备份功能，通过QQ邮箱SMTP服务发送备份邮件给用户。

## 新增文件
1. `server/email-service.ts` - 邮件发送服务模块
2. `server/backup-service.ts` - 备份执行逻辑
3. `server/cron-backup.ts` - 定时任务脚本

## 修改文件
1. `server/routers.ts` - 添加了 `sendTestBackup` API
2. `client/src/pages/LedgerSettings.tsx` - 添加了测试发送按钮

## 部署步骤

### 1. 配置环境变量
在服务器上的 `.env` 文件中添加以下配置：

```bash
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tina_u@qq.com
SMTP_PASS=wqettalptfmebgdf
```

### 2. 部署代码
使用现有的部署脚本：

```bash
cd /home/ubuntu/haoyouji-web
./scripts/deploy.sh
```

### 3. 配置定时任务
在服务器上配置cron job，每小时执行一次备份检查：

```bash
# 编辑crontab
crontab -e

# 添加以下行（根据实际路径调整）
0 * * * * cd /root/haoyouji-web && /usr/bin/node --loader ts-node/esm server/cron-backup.ts >> /var/log/backup-cron.log 2>&1
```

**注意事项：**
- 确保Node.js路径正确（使用 `which node` 查看）
- 确保ts-node已全局安装或在项目中可用
- 日志文件路径可根据需要调整

### 4. 验证部署
1. 登录应用，进入账本设置
2. 点击"定期自动备份"
3. 配置备份频率并启用
4. 点击"立即发送测试邮件"按钮
5. 检查邮箱是否收到备份邮件

## 功能说明

### 用户界面
- 在账本设置页面中，用户可以配置：
  - 备份频率：每周/每月/每季度
  - 启用/禁用自动备份
  - 立即发送测试邮件

### 后端逻辑
- 每小时执行一次定时任务
- 检查所有启用备份且到达备份时间的账本
- 为每个账本生成Excel文件
- 通过邮件发送给用户
- 更新下次备份时间

### 邮件内容
- 发件人：好友记账本系统 <tina_u@qq.com>
- 主题：【好友记】账本备份 - [账本名称]
- 正文：包含账本名称、备份时间等信息
- 附件：Excel格式的账本数据

## 故障排查

### 邮件发送失败
1. 检查SMTP配置是否正确
2. 确认QQ邮箱授权码是否有效
3. 查看服务器日志：`tail -f /var/log/backup-cron.log`

### 定时任务未执行
1. 检查cron服务是否运行：`systemctl status cron`
2. 查看cron日志：`grep CRON /var/log/syslog`
3. 确认Node.js和ts-node路径正确

### 用户未收到邮件
1. 检查用户是否在个人资料中填写了邮箱
2. 检查邮件是否进入垃圾箱
3. 确认备份设置已启用且到达备份时间

## 安全注意事项
- SMTP密码已配置在环境变量中，不要提交到代码仓库
- 定期检查邮件发送日志，防止滥用
- 考虑添加发送频率限制，防止过度发送
