# 好友记数据库备份快速参考

本文档提供备份方案的快速操作指南,适合已完成初始配置的用户日常使用。

---

## 快速开始

### 1. 手动执行备份

```bash
cd /path/to/haoyouji-122-new
node scripts/backup-database.mjs
```

### 2. 配置自动备份

```bash
cd /path/to/haoyouji-122-new
./setup-backup-cron.sh
```

按照提示选择备份时间,脚本会自动配置定时任务。

---

## 常用命令

### 查看定时任务

```bash
# 查看当前所有定时任务
crontab -l

# 编辑定时任务
crontab -e
```

### 查看备份日志

```bash
# 查看最新日志
tail -n 50 logs/backup.log

# 实时监控日志
tail -f logs/backup.log
```

### 检查 Cron 服务

```bash
# 查看服务状态
sudo systemctl status cron

# 重启服务
sudo systemctl restart cron
```

---

## 环境变量配置

在项目根目录创建 `.env` 文件:

```env
DATABASE_URL="mysql://user:password@host:port/database"
S3_BUCKET="haoyouji-backups"
S3_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
NODE_ENV="production"
```

---

## 常用 Cron 表达式

| 执行频率 | Cron 表达式 |
| :------- | :---------- |
| 每天凌晨 2 点 | `0 2 * * *` |
| 每天凌晨 3 点 | `0 3 * * *` |
| 每 6 小时 | `0 */6 * * *` |
| 每 12 小时 | `0 */12 * * *` |
| 每周日凌晨 2 点 | `0 2 * * 0` |

---

## 故障排查

### 备份失败

1. 检查数据库连接: `mysql -h <host> -P <port> -u <user> -p`
2. 检查 `.env` 文件配置是否正确
3. 查看详细错误日志: `cat logs/backup.log`

### S3 上传失败

1. 验证 AWS 凭证是否正确
2. 检查 IAM 用户权限
3. 测试网络连接: `ping s3.amazonaws.com`

### Cron 任务未执行

1. 检查 cron 服务: `sudo systemctl status cron`
2. 查看系统日志: `sudo grep CRON /var/log/syslog | tail -n 20`
3. 验证脚本路径和 Node.js 路径是否正确

---

## 从 S3 恢复数据

### 下载备份文件

```bash
aws s3 cp s3://haoyouji-backups/database-backups/backup.sql ./restore.sql
```

### 恢复到数据库

```bash
mysql -h <host> -P <port> -u <user> -p <database> < restore.sql
```

**警告**: 恢复操作会覆盖现有数据,请务必谨慎操作!

---

## 联系支持

如遇问题,请查看完整文档: `BACKUP_DEPLOYMENT_GUIDE.md`

---

**文档版本**: 1.0  
**最后更新**: 2026-02-13
