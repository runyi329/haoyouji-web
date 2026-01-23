import { cn } from "@/lib/utils";

interface CompanyReportIconProps {
  hasReport: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 企查查 + DeepSeek 联名图标
 * - hasReport=false: 暗灰色（disabled）
 * - hasReport=true: 亮色（可点击）
 */
export function CompanyReportIcon({ hasReport, onClick, className }: CompanyReportIconProps) {
  return (
    <button
      onClick={hasReport ? onClick : undefined}
      disabled={!hasReport}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-all",
        hasReport
          ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 cursor-pointer shadow-sm"
          : "bg-gray-200 text-gray-400 cursor-not-allowed",
        className
      )}
      title={hasReport ? "查看企业报告" : "暂无企业报告"}
    >
      {/* 企查查图标（简化的放大镜+文档） */}
      <svg
        className="w-3 h-3"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 文档 */}
        <rect x="2" y="1" width="9" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="4" y1="4" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5" />
        <line x1="4" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1.5" />
        {/* 放大镜 */}
        <circle cx="11" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="13" y1="12" x2="15" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* DeepSeek图标（简化的AI芯片） */}
      <svg
        className="w-3 h-3"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 芯片外框 */}
        <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        {/* 芯片引脚 */}
        <line x1="2" y1="6" x2="4" y2="6" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="10" x2="4" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="12" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
        <line x1="12" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.5" />
        {/* AI标识（中心点） */}
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );
}
