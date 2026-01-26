import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";

export default function Ledger() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">账本</h1>
        </div>
      </header>

      {/* 待开发提示 */}
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <Construction className="w-16 h-16 text-blue-500" />
            <h2 className="text-2xl font-bold text-gray-900">功能开发中</h2>
            <p className="text-gray-600 max-w-md">
              账本功能正在紧张开发中，即将上线！
            </p>
            <p className="text-sm text-gray-500">
              这里将提供详细的收支记录、统计分析和预算管理功能。
            </p>
          </div>
        </Card>
      </div>
      
      {/* 底部导航栏 */}
      <BottomNav />
    </div>
  );
}
