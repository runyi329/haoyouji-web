/**
 * 牙伴齿科管理 - 商城 Tab（占位符）
 */
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { ShoppingBag } from "lucide-react";

export default function YabanShop() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P302" />
      {/* 顶部 Header */}
      <div className="bg-gradient-to-r from-[#FF8C00] to-[#FFA500] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <span className="text-sm font-bold">商城</span>
        </div>
      </div>
      {/* 占位内容 */}
      <div className="max-w-lg mx-auto pb-20 flex flex-col items-center justify-center pt-32">
        <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-sm text-gray-400">商城功能开发中，敬请期待</p>
      </div>
      <YabanTabBar />
    </div>
  );
}
