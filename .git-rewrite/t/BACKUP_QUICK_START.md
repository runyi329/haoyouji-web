# 数据库备份快速开始指南

## 🚀 5分钟完成设置

### 第一步：SSH登录到服务器

```bash
ssh ubuntu@[你的服务器IP]
```

### 第二步：测试手动备份

```bash
cd /home/ubuntu/haoyouji-web
./backup-local.sh
```

看到 `✅ 备份成功！` 就说明备份脚本工作正常。

### 第三步：设置自动备份

```bash
# 编辑定时任务
crontab -e

# 在打开的编辑器中添加这一行（每天凌晨2点自动备份）
0 2 * * * /home/ubuntu/haoyouji-web/backup-local.sh >> /home/ubuntu/database-backups/cron.log 2>&1

# 保存并退出（按Ctrl+X，然后Y，然后Enter）
```

### 第四步：验证设置

```bash
# 查看定时任务是否添加成功
crontab -l
```

应该能看到刚才添加的那一行。

---

## ✅ 完成！

现在你的数据库会：
- ✅ 每天凌晨2点自动备份
- ✅ 自动压缩节省空间
- ✅ 自动清理15天前的旧备份
- ✅ 完全免费，无额外费用

---

## 📋 常用命令

### 查看备份列表
```bash
ls -lh /home/ubuntu/database-backups/
```

### 下载备份到本地（在你的电脑上执行）
```bash
scp ubuntu@[服务器IP]:/home/ubuntu/database-backups/haoyouji_backup_*.sql.gz ~/Downloads/
```

### 查看备份日志
```bash
cat /home/ubuntu/database-backups/backup.log
```

### 手动执行备份
```bash
/home/ubuntu/haoyouji-web/backup-local.sh
```

---

## 📖 详细文档

查看完整文档：`DATABASE_BACKUP_GUIDE.md`

包含：
- 恢复数据库步骤
- 常见问题解答
- 故障排查指南
- 最佳实践建议

---

**需要帮助？** 查看日志文件或联系技术支持。
