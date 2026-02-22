# 服务器部署清单 - 账本备份功能

## 前置条件
- 服务器已部署好友记应用
- 已安装Node.js和npm/pnpm
- 已配置数据库

## 部署步骤

### 第一步：拉取最新代码
```bash
cd /root/haoyouji-web  # 或您的实际部署路径
git pull origin main
```

### 第二步：配置环境变量
编辑 `.env` 文件，添加SMTP配置：

```bash
nano .env  # 或使用 vim
```

在文件中添加以下内容：
```
# SMTP邮件配置
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tina_u@qq.com
SMTP_PASS=wqettalptfmebgdf
```

保存并退出（nano: Ctrl+X, Y, Enter）

### 第三步：安装依赖（如果有新依赖）
```bash
pnpm install
```

### 第四步：构建项目
```bash
pnpm run build
```

### 第五步：重启应用
```bash
pm2 restart haoyouji-web
# 或
pm2 restart all
```

### 第六步：配置定时任务
编辑crontab：
```bash
crontab -e
```

添加以下行（请根据实际路径调整）：
```
# 每小时执行一次账本备份检查
0 * * * * cd /root/haoyouji-web && /usr/bin/node --loader ts-node/esm server/cron-backup.ts >> /var/log/haoyouji-backup.log 2>&1
```

**重要提示：**
1. 确认Node.js路径：`which node`
2. 确认项目路径：`pwd`（在项目目录下执行）
3. 确保日志目录存在：`sudo touch /var/log/haoyouji-backup.log && sudo chmod 666 /var/log/haoyouji-backup.log`

保存并退出。

### 第七步：验证cron配置
```bash
# 查看已配置的cron任务
crontab -l

# 检查cron服务状态
systemctl status cron
```

### 第八步：手动测试定时任务
```bash
cd /root/haoyouji-web
node --loader ts-node/esm server/cron-backup.ts
```

如果执行成功，应该看到类似输出：
```
[2026-02-22T...] 开始检查备份任务...
[2026-02-22T...] 备份任务检查完成
```

### 第九步：在应用中测试
1. 登录应用
2. 进入任意账本的设置页面
3. 点击"定期自动备份"
4. 确保个人资料中已填写邮箱地址
5. 配置备份频率并启用
6. 点击"立即发送测试邮件"按钮
7. 检查邮箱（包括垃圾箱）是否收到备份邮件

## 验证清单

- [ ] 代码已拉取到最新版本
- [ ] 环境变量已正确配置
- [ ] 项目已成功构建
- [ ] 应用已重启
- [ ] Cron任务已配置
- [ ] Cron服务正在运行
- [ ] 手动执行定时任务脚本成功
- [ ] 测试邮件发送成功
- [ ] 用户可以配置备份设置

## 故障排查

### 问题1：测试邮件发送失败
**可能原因：**
- SMTP配置错误
- QQ邮箱授权码失效
- 网络连接问题

**解决方法：**
```bash
# 查看应用日志
pm2 logs haoyouji-web

# 测试SMTP连接
telnet smtp.qq.com 465
```

### 问题2：定时任务未执行
**可能原因：**
- Cron服务未运行
- Node.js路径错误
- 权限问题

**解决方法：**
```bash
# 启动cron服务
sudo systemctl start cron

# 查看cron日志
grep CRON /var/log/syslog | tail -20

# 查看备份日志
tail -f /var/log/haoyouji-backup.log
```

### 问题3：ts-node无法加载
**可能原因：**
- ts-node未安装
- Node.js版本不兼容

**解决方法：**
```bash
# 全局安装ts-node
npm install -g ts-node

# 或在项目中安装
cd /root/haoyouji-web
pnpm add -D ts-node

# 使用tsx替代（更快）
npm install -g tsx
# 修改cron命令为：
# 0 * * * * cd /root/haoyouji-web && /usr/bin/tsx server/cron-backup.ts >> /var/log/haoyouji-backup.log 2>&1
```

## 监控建议

### 1. 日志监控
定期检查备份日志：
```bash
tail -f /var/log/haoyouji-backup.log
```

### 2. 邮件发送统计
可以在数据库中添加邮件发送记录表，用于统计和监控。

### 3. 告警设置
如果备份失败，可以配置告警通知：
- 使用监控工具（如Prometheus + Grafana）
- 配置邮件告警
- 集成企业微信/钉钉机器人

## 安全注意事项

1. **保护SMTP密码**
   - 不要将密码提交到代码仓库
   - 使用环境变量存储
   - 定期更换授权码

2. **限制邮件发送频率**
   - 防止被标记为垃圾邮件
   - 避免超出QQ邮箱发送限制

3. **日志文件管理**
   - 定期清理旧日志
   - 使用logrotate管理日志文件

4. **备份文件安全**
   - 邮件附件包含敏感数据
   - 提醒用户妥善保管备份邮件

## 后续优化建议

1. **添加备份历史记录**
   - 记录每次备份的时间和结果
   - 提供备份历史查询功能

2. **支持更多邮件服务商**
   - 163邮箱
   - Gmail
   - 企业邮箱

3. **优化邮件模板**
   - 使用HTML邮件模板
   - 添加品牌元素
   - 提供更详细的备份信息

4. **添加备份恢复功能**
   - 允许用户从备份文件恢复数据
   - 提供导入功能

## 联系支持

如果遇到问题，请联系技术支持并提供：
- 错误日志
- 环境信息（Node.js版本、操作系统等）
- 复现步骤
