import { cn } from "@/lib/utils";

interface CompanyReportIconProps {
  hasReport: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 机器人图标（企业报告）
 * - hasReport=false: 灰色（未点亮）
 * - hasReport=true: 蓝色线条（点亮）
 */
export function CompanyReportIcon({ hasReport, onClick, className }: CompanyReportIconProps) {
  return (
    <div
      onClick={hasReport ? onClick : undefined}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-all",
        className
      )}
      style={{
        cursor: hasReport ? 'pointer' : 'not-allowed',
        pointerEvents: hasReport ? 'auto' : 'none'
      }}
      title={hasReport ? "查看企业报告" : "暂无企业报告"}
    >
      {/* 机器人图标 */}
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        stroke={hasReport ? 'rgb(59, 130, 246)' : 'rgb(156, 163, 175)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 头部天线 */}
        <path d="M12 2v2" />
        {/* 头部主体 */}
        <rect x="6" y="4" width="12" height="10" rx="2" />
        {/* 眼睛 */}
        <circle cx="9" cy="8" r="1" fill={hasReport ? 'rgb(59, 130, 246)' : 'rgb(156, 163, 175)'} />
        <circle cx="15" cy="8" r="1" fill={hasReport ? 'rgb(59, 130, 246)' : 'rgb(156, 163, 175)'} />
        {/* 嘴巴 */}
        <path d="M9 11h6" />
        {/* 身体 */}
        <rect x="8" y="14" width="8" height="6" rx="1" />
        {/* 手臂 */}
        <path d="M6 16h2" />
        <path d="M16 16h2" />
      </svg>
    </div>
  );
}
