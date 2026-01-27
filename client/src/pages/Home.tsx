import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/**
 * 首页组件
 * 直接跳转到脉动首页（联系人管理）
 */
export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // 直接跳转到脉动首页
    setLocation("/contacts");
  }, [setLocation]);

  // 显示加载状态
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-600">加载中...</p>
      </div>
    </div>
  );
}
