import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

/**
 * 首页组件
 * 根据用户的账本访问记录决定跳转到哪里：
 * - 如果用户是新用户（没有访问过账本），跳转到账本列表页
 * - 如果用户是老用户（有访问记录），跳转到最近访问的账本详情页
 */
export default function Home() {
  const [, setLocation] = useLocation();
  
  // 获取用户的账本列表
  const { data: ledgers, isLoading } = trpc.ledger.getUserLedgers.useQuery();

  useEffect(() => {
    if (isLoading) return;
    
    // 如果没有账本，跳转到账本列表页（显示创建账本的入口）
    if (!ledgers || ledgers.length === 0) {
      setLocation("/ledgers");
      return;
    }

    // 如果有账本，跳转到第一个账本的详情页
    // TODO: 未来可以记录用户最近访问的账本ID，跳转到最近访问的账本
    const firstLedger = ledgers[0];
    setLocation(`/ledger/${firstLedger.id}`);
  }, [ledgers, isLoading, setLocation]);

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
