import { User } from "lucide-react";
import { useState } from "react";
import { useColorTheme } from "@/contexts/ColorThemeContext";

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
  
  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;
  
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
        className={`${sizeClass} rounded-full object-cover border-2 border-white ${className}`}
        style={{ ...style, boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }}
        onError={() => setImageError(true)}
      />
    );
  }
  
  // 否则显示首字母，使用全局主题色
  return (
    <div
      className={`${sizeClass} rounded-full text-white flex items-center justify-center font-medium border-2 border-white ${className}`}
      style={{ 
        backgroundColor: themeColors.primary,
        color: themeColors.accent1,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
        ...style 
      }}
    >
      {initial}
    </div>
  );
}
