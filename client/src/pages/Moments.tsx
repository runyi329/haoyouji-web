import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";

export default function Moments() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-[#424242]">动态</h1>
        </div>
      </header>

      {/* 待开发提示 */}
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <Construction className="w-16 h-16 text-[#1976D2]" />
            <h2 className="text-2xl font-bold text-[#424242]">功能开发中</h2>
            <p className="text-[#757575] max-w-md">
              动态功能正在紧张开发中，即将上线！
            </p>
            <p className="text-sm text-[#757575]">
              这里将展示您和好友的动态，类似朋友圈功能。
            </p>
          </div>
        </Card>
      </div>
      
      {/* 底部导航栏 */}
      <BottomNav />
    </div>
  );
}
