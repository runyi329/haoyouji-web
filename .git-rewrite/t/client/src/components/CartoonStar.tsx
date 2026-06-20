interface CartoonStarProps {
  size?: number;
  filled?: boolean;
}

export function CartoonStar({ size = 24, filled = true }: CartoonStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
      }}
    >
      {/* 星星主体 */}
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill={filled ? "#FFD700" : "transparent"}
        stroke="#FF8C00"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 高光效果 */}
      {filled && (
        <>
          <path
            d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            fill="url(#starGradient)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="starGradient" x1="12" y1="2" x2="12" y2="21">
              <stop offset="0%" stopColor="#FFF" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#FFD700" stopOpacity="0" />
              <stop offset="100%" stopColor="#FF8C00" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </>
      )}
    </svg>
  );
}
