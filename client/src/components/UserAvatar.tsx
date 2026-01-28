import { User } from "lucide-react";

interface UserAvatarProps {
  username?: string | null;
  avatar?: string | null;
  nickname?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserAvatar({
  username,
  avatar,
  nickname,
  size = "md",
  className = "",
}: UserAvatarProps) {
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
  
  // 如果有头像URL,显示图片
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover ${className}`}
      />
    );
  }
  
  // 否则显示首字母
  return (
    <div
      className={`${sizeClass} rounded-full bg-blue-500 text-white flex items-center justify-center font-medium ${className}`}
    >
      {initial}
    </div>
  );
}
