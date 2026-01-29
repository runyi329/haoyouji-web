#!/bin/bash

#############################################
# 好友记数据库本地备份脚本
# 功能：
# 1. 自动备份数据库到本地
# 2. 压缩备份文件节省空间
# 3. 自动清理7天前的旧备份
# 4. 显示备份结果和磁盘使用情况
#############################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 自动检测脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 配置
BACKUP_DIR="$HOME/database-backups"
KEEP_DAYS=15
LOG_FILE="$BACKUP_DIR/backup.log"

# 从.env文件读取数据库配置（自动使用脚本所在目录）
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ 错误: .env文件不存在${NC}"
    exit 1
fi

# 解析DATABASE_URL
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d '=' -f2-)

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ 错误: DATABASE_URL未在.env中配置${NC}"
    exit 1
fi

# 从URL中提取数据库信息
# 格式: mysql://username:password@host:port/database
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|mysql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

# 生成备份文件名
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/haoyouji_backup_$TIMESTAMP.sql"
BACKUP_FILE_GZ="$BACKUP_FILE.gz"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 记录日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 好友记数据库备份任务启动${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

log "开始备份数据库: $DB_NAME"
echo -e "${YELLOW}📦 正在备份数据库...${NC}"
echo "   数据库: $DB_NAME"
echo "   主机: $DB_HOST:$DB_PORT"
echo ""

# 执行备份
if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-table \
    --databases "$DB_NAME" \
    > "$BACKUP_FILE" 2>/dev/null; then
    
    # 压缩备份文件
    echo -e "${YELLOW}🗜️  正在压缩备份文件...${NC}"
    gzip "$BACKUP_FILE"
    
    # 获取文件大小
    FILE_SIZE=$(du -h "$BACKUP_FILE_GZ" | cut -f1)
    
    echo ""
    echo -e "${GREEN}✅ 备份成功！${NC}"
    echo "   文件: haoyouji_backup_$TIMESTAMP.sql.gz"
    echo "   大小: $FILE_SIZE"
    echo "   位置: $BACKUP_FILE_GZ"
    echo ""
    
    log "备份成功: $BACKUP_FILE_GZ (大小: $FILE_SIZE)"
    
else
    echo ""
    echo -e "${RED}❌ 备份失败！${NC}"
    log "备份失败"
    exit 1
fi

# 清理旧备份
echo -e "${YELLOW}🧹 清理${KEEP_DAYS}天前的旧备份...${NC}"
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "haoyouji_backup_*.sql.gz" -mtime +$KEEP_DAYS)

if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | while read -r file; do
        rm -f "$file"
        echo "   删除: $(basename "$file")"
        log "删除旧备份: $(basename "$file")"
    done
else
    echo "   无需清理"
fi

echo ""

# 显示备份列表
echo -e "${BLUE}📋 当前备份列表:${NC}"
ls -lh "$BACKUP_DIR"/haoyouji_backup_*.sql.gz 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'

echo ""

# 显示磁盘使用情况
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
DISK_USAGE=$(df -h "$BACKUP_DIR" | tail -1 | awk '{print $5}')

echo -e "${BLUE}💾 存储信息:${NC}"
echo "   备份目录大小: $BACKUP_SIZE"
echo "   磁盘使用率: $DISK_USAGE"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ 备份任务完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

log "备份任务完成"
