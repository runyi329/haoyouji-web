import { User } from "lucide-react";
import { useState } from "react";

interface UserAvatarProps {
  username?: string | null;
  avatar?: string | null;
  nickname?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({
  username,
  avatar,
  nickname,
  size = "md",
  className = "",
  style,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  
  // 确定显示的文本:优先nickname,其次username
  const displayName = nickname || username || "用户";
  
  // 获取首字母
  const initial = displayName.charAt(0).toUpperCase();
  
  // 尺寸映射
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
  };
  
  const sizeClass = sizeClasses[size];
  
  // 如果有头像URL且图片未加载失败,显示图片
  if (avatar && !imageError) {
    return (
      <img
        src={avatar}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        style={style}
        onError={() => setImageError(true)}
      />
    );
  }
  
  // 否则显示首字母
  return (
    <div
      className={`${sizeClass} rounded-full bg-purple-500 text-white flex items-center justify-center font-medium ${className}`}
      style={style}
    >
      {initial}
    </div>
  );
}
