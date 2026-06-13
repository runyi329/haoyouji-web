/**
 * 牙伴齿科管理 - 核销记录（顾客视角）
 * 路由：/yaban/profile/verify-records
 * 风格：蓝色系。当前先做空态展示，待客人侧已核销订单接口接入后填充。
 */
import { useLocation } from "wouter";
import { ChevronLeft, Ticket } from "lucide-react";
import { PageTag } from "@/components/PageTag";

export default function YabanVerifyRecords() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      <PageTag code="P315" />
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/profile")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">核销记录</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-24 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-[#EAF4FE] flex items-center justify-center mb-4">
          <Ticket className="w-8 h-8 text-[#9CC8EC]" />
        </div>
        <p className="text-sm text-gray-500">暂无核销记录</p>
        <p className="text-xs text-gray-400 mt-1">到店核销的服务订单将显示在这里</p>
        <button
          onClick={() => navigate("/yaban/shop/my-orders")}
          className="mt-6 px-5 py-2 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium active:scale-[0.98] transition-transform"
        >
          查看我的订单
        </button>
      </div>
    </div>
  );
}
