# 好友记数据库备份脚本

## 快速开始

### 1. 配置环境变量

在Manus平台项目设置中配置以下环境变量:

**必需:**
```bash
DATABASE_URL=mysql://username:password@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/dWfvfUieyVkmVGc44bjad7
```

**可选(S3上传):**
```bash
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
S3_BUCKET=haoyouji-backups
S3_REGION=us-east-1
```

### 2. 执行备份

```bash
cd /home/ubuntu/haoyouji-web
./run-backup.sh
```

或直接执行:

```bash
cd /home/ubuntu/haoyouji-web
node scripts/backup-database.mjs
```

## 详细文档

请参阅项目根目录的 [BACKUP_GUIDE.md](../BACKUP_GUIDE.md) 获取完整的使用指南。

## 脚本说明

- `backup-database.mjs` - 核心备份脚本,实现数据库导出、S3上传、文件清理等功能
- 备份文件保存在项目根目录的 `backups/` 文件夹中
- 如果配置了S3,备份会自动上传到 `s3://{bucket}/database-backups/` 路径

## 当前数据库信息

- **主机**: gateway03.us-east-1.prod.aws.tidbcloud.com:4000
- **数据库**: dWfvfUieyVkmVGc44bjad7
- **包含**: 382个联系人、109个标签、79个用户、144条互动记录
