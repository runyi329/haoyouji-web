/**
 * 牙伴齿科管理 - 网站功能管理
 * 路由：/yaban/settings/website-features
 * 权限：仅院长可见
 * 功能：顾客来源设置（第1项），后续可扩展更多配置项
 */
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, ChevronRight, Tags } from "lucide-react";

export default function YabanWebsiteFeatures() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/profile");

  const items = [
    {
      key: "customer-source",
      icon: <Tags className="w-5 h-5 text-[#1E88D6]" />,
      label: "顾客来源设置",
      hint: "自定义新建顾客时的来源渠道选项",
      onClick: () => navigate("/yaban/settings/customer-source"),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">网站功能管理</span>
        </div>
      </div>

      <div className="px-4 pt-5">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {items.map((item, idx) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 ${
                idx < items.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-[#EBF4FC] flex items-center justify-center flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{item.label}</div>
                {item.hint && (
                  <div className="text-xs text-gray-400 mt-0.5 truncate">{item.hint}</div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
