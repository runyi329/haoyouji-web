import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * 首页组件
 * 直接跳转到脉动首页（联系人管理）或登录页
 */
export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();

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

  // 不显示任何内容，直接跳转
  return null;
}
