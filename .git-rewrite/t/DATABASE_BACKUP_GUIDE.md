# 好友记数据库备份完整指南

## 📋 目录
1. [手动备份](#手动备份)
2. [设置自动备份](#设置自动备份)
3. [查看备份列表](#查看备份列表)
4. [下载备份到本地](#下载备份到本地)
5. [恢复数据库](#恢复数据库)
6. [常见问题](#常见问题)

---

## 🔧 手动备份

### 方法一：使用备份脚本（推荐）

```bash
# SSH登录到服务器后执行
cd /home/ubuntu/haoyouji-web
./backup-local.sh
```

**输出示例：**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 好友记数据库备份任务启动
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 正在备份数据库...
   数据库: crm_db
   主机: 124.223.54.69:3306

✅ 备份成功！
   文件: haoyouji_backup_20260129_140530.sql.gz
   大小: 2.3M
   位置: /home/ubuntu/database-backups/haoyouji_backup_20260129_140530.sql.gz

🧹 清理15天前的旧备份...
   无需清理

📋 当前备份列表:
   /home/ubuntu/database-backups/haoyouji_backup_20260129_140530.sql.gz (2.3M)

💾 存储信息:
   备份目录大小: 2.3M
   磁盘使用率: 15%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 备份任务完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 方法二：使用mysqldump命令

```bash
# 手动执行mysqldump
mysqldump -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --databases crm_db | gzip > backup_$(date +%Y%m%d).sql.gz
```

---

## ⏰ 设置自动备份

### 步骤1：确保备份脚本可执行

```bash
chmod +x /home/ubuntu/haoyouji-web/backup-local.sh
```

### 步骤2：编辑crontab

```bash
crontab -e
```

### 步骤3：添加定时任务

在打开的编辑器中添加以下内容：

```bash
# 好友记数据库自动备份 - 每天凌晨2点执行
0 2 * * * /home/ubuntu/haoyouji-web/backup-local.sh >> /home/ubuntu/database-backups/cron.log 2>&1
```

**说明：**
- `0 2 * * *` = 每天凌晨2点执行
- 日志会保存到 `/home/ubuntu/database-backups/cron.log`

### 步骤4：验证定时任务

```bash
# 查看已设置的定时任务
crontab -l

# 查看cron服务状态
sudo systemctl status cron
```

### 其他时间设置示例

```bash
# 每天凌晨3点
0 3 * * * /home/ubuntu/haoyouji-web/backup-local.sh

# 每12小时（凌晨0点和中午12点）
0 0,12 * * * /home/ubuntu/haoyouji-web/backup-local.sh

# 每周日凌晨2点
0 2 * * 0 /home/ubuntu/haoyouji-web/backup-local.sh

# 每月1号凌晨2点
0 2 1 * * /home/ubuntu/haoyouji-web/backup-local.sh
```

---

## 📋 查看备份列表

### 查看所有备份文件

```bash
ls -lh /home/ubuntu/database-backups/haoyouji_backup_*.sql.gz
```

### 查看备份目录大小

```bash
du -sh /home/ubuntu/database-backups/
```

### 查看备份日志

```bash
# 查看备份脚本日志
cat /home/ubuntu/database-backups/backup.log

# 查看定时任务日志
cat /home/ubuntu/database-backups/cron.log
```

---

## 💾 下载备份到本地

### 方法一：使用scp命令（推荐）

**在你的本地电脑上执行：**

```bash
# 下载单个备份文件
scp ubuntu@[服务器IP]:/home/ubuntu/database-backups/haoyouji_backup_20260129_140530.sql.gz ~/Downloads/

# 下载所有备份文件
scp ubuntu@[服务器IP]:/home/ubuntu/database-backups/haoyouji_backup_*.sql.gz ~/Downloads/
```

### 方法二：使用SFTP客户端

推荐使用以下工具：
- **Windows**: WinSCP, FileZilla
- **Mac**: Cyberduck, FileZilla
- **Linux**: FileZilla

**连接信息：**
- 主机: 你的服务器IP
- 端口: 22
- 用户名: ubuntu
- 密码: 你的SSH密码
- 备份目录: `/home/ubuntu/database-backups/`

### 方法三：使用腾讯云控制台

1. 登录腾讯云控制台
2. 进入轻量应用服务器
3. 选择你的实例
4. 点击"文件传输"
5. 下载 `/home/ubuntu/database-backups/` 目录下的文件

---

## 🔄 恢复数据库

### ⚠️ 重要提示
恢复数据库会**覆盖现有数据**，请务必谨慎操作！

### 步骤1：上传备份文件到服务器

```bash
# 在本地电脑上执行
scp ~/Downloads/haoyouji_backup_20260129_140530.sql.gz ubuntu@[服务器IP]:/tmp/
```

### 步骤2：解压备份文件

```bash
# SSH登录服务器后执行
gunzip /tmp/haoyouji_backup_20260129_140530.sql.gz
```

### 步骤3：恢复数据库

```bash
# 方法一：直接恢复
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] < /tmp/haoyouji_backup_20260129_140530.sql

# 方法二：先删除数据库再恢复（完全重建）
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] -e "DROP DATABASE IF EXISTS crm_db; CREATE DATABASE crm_db;"
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] crm_db < /tmp/haoyouji_backup_20260129_140530.sql
```

### 步骤4：验证恢复结果

```bash
# 登录数据库检查
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] crm_db

# 在MySQL中执行
SHOW TABLES;
SELECT COUNT(*) FROM contacts;
```

---

## 🔍 常见问题

### Q1: 备份文件太大怎么办？

**A:** 备份文件已经使用gzip压缩，通常能压缩到原大小的20%左右。如果还是太大：
- 考虑清理不需要的历史数据
- 调整备份保留天数（当前设置为15天）
- 只备份重要的表

### Q2: 如何修改备份保留天数？

**A:** 编辑备份脚本：
```bash
nano /home/ubuntu/haoyouji-web/backup-local.sh

# 找到这一行并修改数字
KEEP_DAYS=15  # 改为你想要的天数
```

### Q3: 如何查看定时任务是否正常执行？

**A:** 查看定时任务日志：
```bash
tail -f /home/ubuntu/database-backups/cron.log
```

### Q4: 备份失败怎么办？

**A:** 检查以下几点：
1. 数据库连接是否正常
2. .env文件中的DATABASE_URL是否正确
3. 磁盘空间是否充足：`df -h`
4. 查看错误日志：`cat /home/ubuntu/database-backups/backup.log`

### Q5: 如何测试备份是否可用？

**A:** 最好的方法是在测试环境恢复一次：
```bash
# 创建测试数据库
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] -e "CREATE DATABASE test_restore;"

# 恢复到测试数据库
gunzip -c /home/ubuntu/database-backups/haoyouji_backup_20260129_140530.sql.gz | \
  mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] test_restore

# 检查数据
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] test_restore -e "SHOW TABLES;"

# 删除测试数据库
mysql -h 124.223.54.69 -P 3306 -u [用户名] -p[密码] -e "DROP DATABASE test_restore;"
```

### Q6: 如何立即执行一次备份测试？

**A:** 直接运行备份脚本：
```bash
/home/ubuntu/haoyouji-web/backup-local.sh
```

### Q7: 备份文件存放在哪里？

**A:** 所有备份文件存放在：
```
/home/ubuntu/database-backups/
```

### Q8: 如何删除所有备份？

**A:** 谨慎操作！
```bash
# 删除所有备份文件
rm -f /home/ubuntu/database-backups/haoyouji_backup_*.sql.gz

# 删除日志文件
rm -f /home/ubuntu/database-backups/*.log
```

---

## 💰 费用说明

**完全免费！** 

- ✅ 备份存储在你自己的服务器上
- ✅ 不需要额外的云存储服务
- ✅ 不会产生任何额外费用
- ✅ 只占用服务器的硬盘空间（120GB SSD）

**预估空间占用：**
- 单次备份：约2-5MB（压缩后）
- 保留15天：约30-75MB
- 对120GB硬盘来说，几乎可以忽略不计

---

## 📞 技术支持

如果遇到问题，请检查：
1. 备份日志：`/home/ubuntu/database-backups/backup.log`
2. 定时任务日志：`/home/ubuntu/database-backups/cron.log`
3. 系统日志：`/var/log/syslog`

---

## 📝 最佳实践建议

1. **定期测试恢复** - 每月至少测试一次备份恢复
2. **异地备份** - 每周下载一次备份到本地电脑
3. **监控磁盘空间** - 确保服务器有足够空间
4. **验证备份完整性** - 检查备份文件大小是否正常
5. **保留重要备份** - 每月1号的备份可以单独保存

---

**最后更新：2026-01-29**
