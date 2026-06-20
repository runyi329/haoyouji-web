#!/bin/bash

# 好友记数据库备份自动化配置脚本
# 用途: 在生产服务器上快速配置定时备份任务

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 好友记数据库备份自动化配置工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 获取项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup-database.mjs"
LOG_DIR="$PROJECT_DIR/logs"
BACKUP_LOG="$LOG_DIR/backup.log"

echo "📂 项目目录: $PROJECT_DIR"
echo "📜 备份脚本: $BACKUP_SCRIPT"
echo ""

# 检查备份脚本是否存在
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ 错误: 备份脚本不存在"
    echo "   请确保文件存在: $BACKUP_SCRIPT"
    exit 1
fi

# 检查 .env 文件是否存在
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "⚠️  警告: .env 文件不存在"
    echo "   请先创建 .env 文件并配置数据库连接信息"
    echo ""
    read -p "是否继续配置定时任务? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建日志目录
mkdir -p "$LOG_DIR"
echo "✅ 日志目录已创建: $LOG_DIR"
echo ""

# 获取 Node.js 路径
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ 错误: 未找到 Node.js"
    echo "   请先安装 Node.js"
    exit 1
fi
echo "✅ Node.js 路径: $NODE_PATH"
echo ""

# 提示用户选择备份时间
echo "⏰ 请选择备份执行时间:"
echo "   1) 每天凌晨 2:00 (推荐)"
echo "   2) 每天凌晨 3:00"
echo "   3) 每天凌晨 4:00"
echo "   4) 每 6 小时一次"
echo "   5) 每 12 小时一次"
echo "   6) 自定义"
echo ""
read -p "请输入选项 (1-6): " -n 1 -r SCHEDULE_OPTION
echo ""
echo ""

case $SCHEDULE_OPTION in
    1)
        CRON_SCHEDULE="0 2 * * *"
        SCHEDULE_DESC="每天凌晨 2:00"
        ;;
    2)
        CRON_SCHEDULE="0 3 * * *"
        SCHEDULE_DESC="每天凌晨 3:00"
        ;;
    3)
        CRON_SCHEDULE="0 4 * * *"
        SCHEDULE_DESC="每天凌晨 4:00"
        ;;
    4)
        CRON_SCHEDULE="0 */6 * * *"
        SCHEDULE_DESC="每 6 小时一次"
        ;;
    5)
        CRON_SCHEDULE="0 */12 * * *"
        SCHEDULE_DESC="每 12 小时一次"
        ;;
    6)
        echo "请输入自定义 cron 表达式 (例如: 0 3 * * *):"
        read -r CRON_SCHEDULE
        SCHEDULE_DESC="自定义: $CRON_SCHEDULE"
        ;;
    *)
        echo "❌ 无效选项,使用默认值: 每天凌晨 2:00"
        CRON_SCHEDULE="0 2 * * *"
        SCHEDULE_DESC="每天凌晨 2:00"
        ;;
esac

echo "✅ 备份计划: $SCHEDULE_DESC"
echo ""

# 构建 cron 任务命令
CRON_COMMAND="cd $PROJECT_DIR && $NODE_PATH $BACKUP_SCRIPT >> $BACKUP_LOG 2>&1"
CRON_ENTRY="$CRON_SCHEDULE $CRON_COMMAND"

# 检查是否已存在相同的定时任务
if crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT" > /dev/null; then
    echo "⚠️  检测到已存在的备份定时任务"
    echo ""
    crontab -l | grep -F "$BACKUP_SCRIPT"
    echo ""
    read -p "是否替换现有任务? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 删除旧的定时任务
        crontab -l 2>/dev/null | grep -v -F "$BACKUP_SCRIPT" | crontab -
        echo "✅ 已删除旧的定时任务"
    else
        echo "❌ 取消配置"
        exit 0
    fi
fi

# 添加新的定时任务
(crontab -l 2>/dev/null; echo "# 好友记数据库自动备份"; echo "$CRON_ENTRY") | crontab -

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 定时备份任务配置成功!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 任务详情:"
echo "   • 执行计划: $SCHEDULE_DESC"
echo "   • 备份脚本: $BACKUP_SCRIPT"
echo "   • 日志文件: $BACKUP_LOG"
echo ""
echo "🔍 查看当前所有定时任务:"
echo "   crontab -l"
echo ""
echo "📝 查看备份日志:"
echo "   tail -f $BACKUP_LOG"
echo ""
echo "🧪 立即测试备份:"
echo "   cd $PROJECT_DIR && node scripts/backup-database.mjs"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
