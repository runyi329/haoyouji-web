interface TagLabelIconProps {
  size?: number;
  className?: string;
}

export function TagLabelIcon({ size = 16, className = "" }: TagLabelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 方框 */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* 标签文字 - 使用text元素显示汉字 */}
      <text
        x="12"
        y="15"
        fontSize="8"
        fontWeight="500"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="sans-serif"
      >
        标签
      </text>
    </svg>
  );
}
