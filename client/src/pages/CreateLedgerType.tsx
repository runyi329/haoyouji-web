import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Home, Plane, Hammer, Briefcase, GraduationCap, Receipt, Edit } from "lucide-react";

// 账本类型配置
const ledgerTypes = [
  {
    id: "family",
    name: "家庭/情侣账本",
    description: "生活日常开销，柴米油盐酱醋茶",
    icon: Home,
    color: "bg-[#FAF3ED] text-[#CBA471]",
  },
  {
    id: "travel",
    name: "旅游账本",
    description: "多人同行，账目清晰明了",
    icon: Plane,
    color: "bg-[#FAF3ED] text-[#CBA471]",
  },
  {
    id: "renovation",
    name: "装修账本",
    description: "各项目的预算情况，一目了然",
    icon: Hammer,
    color: "bg-[#F5F5F5] text-[#1976D2]",
  },
  {
    id: "business",
    name: "生意账本",
    description: "收益情况，合伙人随时查看",
    icon: Briefcase,
    color: "bg-[#FFEBEE] text-[#D32F2F]",
  },
  {
    id: "class",
    name: "班级账本",
    description: "班费支出全班公开透明",
    icon: GraduationCap,
    color: "bg-[#E8F5E9] text-[#4CAF50]",
  },
  {
    id: "reimbursement",
    name: "报销账本",
    description: "公司出差采购支出报销给So easy",
    icon: Receipt,
    color: "bg-white text-[#1976D2]",
  },
  {
    id: "custom",
    name: "自定义账本",
    description: "自己动手添加收支条目",
    icon: Edit,
    color: "bg-lime-100 text-lime-600",
  },
];

export default function CreateLedgerType() {
  const [, setLocation] = useLocation();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleSelectType = (typeId: string) => {
    setSelectedType(typeId);
    // 跳转到创建账本信息填写页面，传递类型参数
    setLocation(`/ledger/create?type=${typeId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-4">
      {/* 顶部导航栏 */}
      <div className="bg-[#1976D2] text-white px-3 py-2.5 flex items-center">
        <button
          onClick={() => setLocation("/ledger")}
          className="p-1 -ml-1"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium pr-6">创建新的账本</h1>
      </div>

      {/* 提示文字 */}
      <div className="flex items-center justify-center gap-2 py-4 text-[#757575] text-sm">
        <div className="w-5 h-5 rounded-full border-2 border-[#E0E0E0] flex items-center justify-center">
          <div className="w-2 h-2 bg-gray-400 rounded-full" />
        </div>
        <span>请选择账本类型</span>
      </div>

      {/* 账本类型列表 */}
      <div className="px-4 space-y-3">
        {ledgerTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => handleSelectType(type.id)}
              className="w-full bg-white rounded-lg p-3.5 flex items-center gap-3 hover:shadow-md transition-shadow"
            >
              {/* 图标 */}
              <div className={`w-12 h-12 rounded-full ${type.color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-6 h-6" />
              </div>

              {/* 文字内容 */}
              <div className="flex-1 text-left">
                <div className="text-base font-medium text-[#424242]">{type.name}</div>
                <div className="text-xs text-[#757575] mt-0.5">{type.description}</div>
              </div>

              {/* 选择圆圈 */}
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                selectedType === type.id
                  ? "border-[#1976D2] bg-[#1976D2]"
                  : "border-[#E0E0E0]"
              }`}>
                {selectedType === type.id && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
