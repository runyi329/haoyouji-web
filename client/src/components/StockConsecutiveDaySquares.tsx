import * as React from "react";

export interface StockConsecutiveDaySquaresProps {
  days: number;
  isLowerBound: boolean;
  title?: string;
}

const MAX_VISIBLE_DAYS = 1000;
const squareStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  flexShrink: 0,
  boxSizing: "border-box",
  border: "1px solid #408B77",
  borderRadius: 1,
  backgroundColor: "#50A78F",
};

/** 每格仅表示一个已确认连续收盘符合条件的交易日；不推断未知日期或买卖信号。 */
export default function StockConsecutiveDaySquares({
  days,
  isLowerBound,
  title,
}: StockConsecutiveDaySquaresProps): React.ReactElement {
  // 交易日计数必须是非负安全整数，不能把异常/小数输入虚构成交易日。
  const knownDays = Number.isSafeInteger(days) && days > 0 ? days : 0;
  const visibleDays = Math.min(knownDays, MAX_VISIBLE_DAYS);
  const remainingDays = knownDays - visibleDays;
  const identity = `${isLowerBound ? "≥" : ""}${knownDays}天`;
  const description = [
    knownDays > 0
      ? `连续${knownDays}个交易日收盘符合条件，不是连续上涨`
      : "暂无已确认的连续符合条件交易日，不是连续上涨",
    "每格代表1个已确认符合条件的交易日，不代表买卖信号",
    isLowerBound
      ? `已知至少${knownDays}个交易日，实际持续天数可能更多；未知天数不画格`
      : "",
    remainingDays > 0
      ? `显示前${visibleDays}格，其余${remainingDays}天未绘制方格`
      : "",
  ].filter(Boolean).join("；");
  const accessibleTitle = title ? `${description}；${title}` : description;

  return (
    <div
      data-stock-monitor-consecutive={identity}
      role="img"
      aria-label={accessibleTitle}
      title={accessibleTitle}
      tabIndex={visibleDays > 12 || remainingDays > 0 ? 0 : undefined}
      className="min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        gap: 2,
        height: 16,
        minHeight: 16,
        maxHeight: 16,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {isLowerBound && (
        <span
          data-stock-monitor-lower-bound="true"
          aria-hidden="true"
          style={{ flexShrink: 0, fontSize: 10, lineHeight: "16px", color: "#408B77" }}
        >
          ≥
        </span>
      )}
      {Array.from({ length: visibleDays }, (_, index) => (
        <span
          key={index + 1}
          data-stock-monitor-day-square={index + 1}
          aria-hidden="true"
          style={squareStyle}
        />
      ))}
      {remainingDays > 0 && (
        <span
          data-stock-monitor-remaining-days={remainingDays}
          aria-hidden="true"
          style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 10, lineHeight: "16px", color: "#408B77" }}
        >
          +剩余{remainingDays}天
        </span>
      )}
    </div>
  );
}
