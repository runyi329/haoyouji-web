import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * 首页组件
 * 直接跳转到脉动首页（联系人管理）
 */
export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    // 等待加载完成
    if (loading) return;
    
    // 如果已登录，跳转到脉动首页
    if (isAuthenticated) {
      setLocation("/contacts");
    } else {
      // 如果未登录，跳转到登录页
      setLocation("/login");
    }
  }, [isAuthenticated, loading, setLocation]);

  // 显示登录状态调试信息
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50">
      <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-lg shadow-lg max-w-md">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-600">加载中...</p>
        <div className="mt-4 p-4 bg-gray-100 rounded text-left w-full">
          <p className="text-xs font-bold mb-2">调试信息：</p>
          <p className="text-xs">loading: {loading ? '是' : '否'}</p>
          <p className="text-xs">isAuthenticated: {isAuthenticated ? '是' : '否'}</p>
          <p className="text-xs">user: {user ? `ID=${user.id}, username=${user.username}` : 'null'}</p>
        </div>
      </div>
    </div>
  );
}
