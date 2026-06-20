# 好友记数据库备份指南

## 概述

本项目包含自动化数据库备份脚本,用于定期备份好友记应用的数据库,并可选择性地上传到S3存储。

## 文件说明

- `scripts/backup-database.mjs` - 核心备份脚本
- `run-backup.sh` - 备份执行包装器
- `.env.example` - 环境变量配置模板

## 功能特性

1. ✅ 使用 `mysqldump` 导出完整数据库到SQL文件
2. ✅ 自动生成带时间戳的备份文件名
3. ✅ 可选上传到S3存储(路径: `database-backups/`)
4. ✅ 自动清理本地临时文件
5. ✅ 显示备份结果和数据库统计信息
6. ✅ 完整的错误处理和日志输出

## 环境变量配置

### 必需配置

在Manus平台项目设置中配置以下环境变量:

```bash
DATABASE_URL=mysql://username:password@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/dWfvfUieyVkmVGc44bjad7
```

### 可选配置(S3上传)

如果需要将备份上传到S3,请配置:

```bash
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
S3_BUCKET=haoyouji-backups
S3_REGION=us-east-1
```

**注意:** 如果未配置S3凭证,备份将仅保存在本地 `backups/` 目录中。

## 使用方法

### 方法1: 使用包装脚本(推荐)

```bash
cd /home/ubuntu/haoyouji-web
./run-backup.sh
```

包装脚本会自动:
- 检查环境变量配置
- 安装必要的依赖
- 执行备份任务

### 方法2: 直接执行备份脚本

```bash
cd /home/ubuntu/haoyouji-web
node scripts/backup-database.mjs
```

**前提条件:**
- 已安装项目依赖 (`pnpm install`)
- 已设置 `DATABASE_URL` 环境变量

## 备份文件

### 本地存储

备份文件保存在项目根目录的 `backups/` 文件夹中:

```
backups/
├── haoyouji_backup_2026-01-28T01-30-00.sql
├── haoyouji_backup_2026-01-28T02-30-00.sql
└── ...
```

### S3存储

如果配置了S3,备份文件将上传到:

```
s3://{S3_BUCKET}/database-backups/haoyouji_backup_2026-01-28T01-30-00.sql
```

## 自动化备份

### 使用Manus定时任务

在Manus平台中创建定时任务:

1. 打开项目设置
2. 进入"定时任务"或"Scheduled Tasks"
3. 创建新任务:
   - **名称**: 数据库每日备份
   - **执行命令**: `cd /home/ubuntu/haoyouji-web && ./run-backup.sh`
   - **执行频率**: 每天凌晨2点 (Cron: `0 0 2 * * *`)

### 使用系统Cron

在服务器上设置cron任务:

```bash
# 编辑crontab
crontab -e

# 添加每天凌晨2点执行备份
0 2 * * * cd /home/ubuntu/haoyouji-web && ./run-backup.sh >> /var/log/haoyouji-backup.log 2>&1
```

## 备份输出示例

```
🚀 好友记数据库备份任务启动
⏰ 开始时间: 2026-01-28 02:00:00

📦 开始备份数据库...
   数据库: dWfvfUieyVkmVGc44bjad7
   主机: gateway03.us-east-1.prod.aws.tidbcloud.com:4000

✅ 数据库备份成功!
   文件: haoyouji_backup_2026-01-28T02-00-00.sql
   大小: 12.45 MB

☁️  开始上传到S3...
✅ 上传到S3成功!
   Bucket: haoyouji-backups
   Key: database-backups/haoyouji_backup_2026-01-28T02-00-00.sql

🧹 本地临时文件已清理

📧 备份完成通知
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 好友记数据库备份成功

📊 备份信息:
   • 文件名: haoyouji_backup_2026-01-28T02-00-00.sql
   • 文件大小: 12.45 MB
   • 备份时间: 2026-01-28 02:00:00

☁️  S3存储:
   • Bucket: haoyouji-backups
   • 路径: database-backups/haoyouji_backup_2026-01-28T02-00-00.sql

📈 数据库统计:
   • 联系人: 382个
   • 标签: 109个
   • 用户: 79个
   • 互动记录: 144条
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 备份任务完成! 耗时: 15.32秒
```

## 数据库信息

当前配置的数据库:

- **主机**: gateway03.us-east-1.prod.aws.tidbcloud.com:4000
- **数据库**: dWfvfUieyVkmVGc44bjad7
- **类型**: TiDB (MySQL兼容)

数据统计(截至最后更新):
- 联系人: 382个
- 标签: 109个
- 用户: 79个
- 互动记录: 144条

## 故障排查

### 问题1: DATABASE_URL未设置

**错误信息:**
```
❌ 错误: DATABASE_URL 环境变量未设置
```

**解决方法:**
在Manus平台项目设置中配置 `DATABASE_URL` 环境变量。

### 问题2: mysqldump命令未找到

**错误信息:**
```
mysqldump: command not found
```

**解决方法:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install mysql-client

# CentOS/RHEL
sudo yum install mysql
```

### 问题3: S3上传失败

**错误信息:**
```
❌ S3上传失败: The security token included in the request is invalid
```

**解决方法:**
- 检查 `AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY` 是否正确
- 确认S3 bucket存在且有写入权限
- 验证S3区域配置是否正确

### 问题4: 数据库连接失败

**错误信息:**
```
❌ 数据库备份失败: Access denied for user
```

**解决方法:**
- 检查数据库用户名和密码是否正确
- 确认数据库主机和端口可访问
- 验证数据库用户是否有导出权限

## 安全建议

1. ✅ 使用环境变量存储敏感信息,不要硬编码在代码中
2. ✅ 定期轮换数据库密码和S3访问密钥
3. ✅ 限制S3 bucket的访问权限,仅允许备份操作
4. ✅ 启用S3 bucket加密
5. ✅ 定期测试备份恢复流程
6. ✅ 保留多个备份版本,设置合理的保留策略

## 备份恢复

如需从备份恢复数据库:

```bash
# 从本地备份恢复
mysql --host=gateway03.us-east-1.prod.aws.tidbcloud.com \
      --port=4000 \
      --user=username \
      --password=password \
      dWfvfUieyVkmVGc44bjad7 < backups/haoyouji_backup_2026-01-28T02-00-00.sql

# 从S3下载后恢复
aws s3 cp s3://haoyouji-backups/database-backups/haoyouji_backup_2026-01-28T02-00-00.sql ./
mysql --host=gateway03.us-east-1.prod.aws.tidbcloud.com \
      --port=4000 \
      --user=username \
      --password=password \
      dWfvfUieyVkmVGc44bjad7 < haoyouji_backup_2026-01-28T02-00-00.sql
```

## 支持

如有问题或建议,请联系项目维护者。
