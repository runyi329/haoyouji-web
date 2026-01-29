interface LevelIconProps {
  level: number;
}

export function LevelIcon({ level }: LevelIconProps) {
  return (
    <svg
      width="40"
      height="16"
      viewBox="0 0 40 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 方框 */}
      <rect
        x="1"
        y="1"
        width="38"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      {/* VIP文字 */}
      <text
        x="20"
        y="11"
        fontSize="7"
        fontWeight="600"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="sans-serif"
      >
        VIP{level}
      </text>
    </svg>
  );
}
