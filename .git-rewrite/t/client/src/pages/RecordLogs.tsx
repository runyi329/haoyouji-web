import { useRoute, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useColorTheme } from "@/contexts/ColorThemeContext";

// 操作类型的中文映射
const ACTION_LABELS: Record<string, string> = {
  edit: '修改',
  delete: '删除',
  restore: '恢复',
  approve: '审批通过',
  reject: '审批拒绝',
  reimburse: '报销',
};

// 字段名中文映射
const FIELD_LABELS: Record<string, string> = {
  type: '类型',
  amount: '金额',
  categoryId: '分类',
  description: '备注',
  transactionDate: '日期',
  imageUrl: '凭证图片',
  memberId: '支出人',
  accountId: '账户',
  reimbursementStatus: '报销状态',
  pendingType: '待结状态',
};

interface LogItem {
  id: number;
  operatorName: string;
  operatorAvatar: string | null;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  createdAt: string;
}

export default function RecordLogs() {
  const [, params] = useRoute("/ledger/:ledgerId/transaction/:transactionId/logs");
  const [, setLocation] = useLocation();
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  const ledgerId = params?.ledgerId ? parseInt(params.ledgerId) : 1;
  const transactionId = params?.transactionId ? parseInt(params.transactionId) : 1;

  const { data: logs, isLoading } = trpc.ledger.getRecordLogs.useQuery({
    recordId: transactionId,
    ledgerId,
  });

  // 格式化时间
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      // 后端返回的是北京时间字符串（如 "2026-02-28 11:30:00"）
      // 需要明确指定为中国时区解析
      const d = new Date(timeStr.replace(' ', 'T') + '+08:00');
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins}分钟前`;
      if (diffHours < 24) return `${diffHours}小时前`;
      if (diffDays < 7) return `${diffDays}天前`;
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch {
      return timeStr;
    }
  };

  // 生成日志描述文本
  const getLogDesc = (log: LogItem) => {
    const actionLabel = ACTION_LABELS[log.action] || log.action;
    if (log.note && (log.action === 'delete' || log.action === 'restore' || log.action === 'approve' || log.action === 'reject' || log.action === 'reimburse')) {
      return log.note;
    }
    if (log.fieldName && log.newValue !== null) {
      const fieldLabel = FIELD_LABELS[log.fieldName] || log.fieldName;
      if (log.oldValue !== null && log.oldValue !== '') {
        return `${actionLabel}了「${fieldLabel}」：${log.oldValue} → ${log.newValue}`;
      }
      return `${actionLabel}了「${fieldLabel}」为：${log.newValue}`;
    }
    if (log.note) return log.note;
    return actionLabel;
  };

  // 获取操作类型颜色
  const getActionColor = (action: string) => {
    switch (action) {
      case 'delete': return '#ef4444';
      case 'restore': return '#22c55e';
      case 'approve': return '#22c55e';
      case 'reject': return '#ef4444';
      case 'reimburse': return '#f59e0b';
      default: return themeColors.primary;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div style={{ backgroundColor: themeColors.primary }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${transactionId}`)}
            className="p-1 text-white"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-medium text-white">修改记录</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="text-center text-gray-400 py-10 text-sm">加载中...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">暂无修改记录</div>
        ) : (
          <div className="bg-white rounded-lg overflow-hidden">
            {logs.map((log, index) => (
              <div
                key={log.id}
                className={`flex items-start gap-3 px-4 py-3 ${index < logs.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                {/* 操作人头像 */}
                <div className="flex-shrink-0 mt-0.5">
                  {log.operatorAvatar ? (
                    <img
                      src={log.operatorAvatar}
                      alt={log.operatorName}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: getActionColor(log.action) }}
                    >
                      {(log.operatorName || 'U').charAt(0)}
                    </div>
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">{log.operatorName}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{getLogDesc(log)}</p>
                </div>

                {/* 操作类型标签 */}
                <div
                  className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded mt-0.5"
                  style={{ backgroundColor: `${getActionColor(log.action)}15`, color: getActionColor(log.action) }}
                >
                  {ACTION_LABELS[log.action] || log.action}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部提示 */}
        {logs && logs.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">共 {logs.length} 条记录</p>
        )}
      </div>
    </div>
  );
}
