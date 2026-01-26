import { useLocation } from "wouter";
import { ChevronLeft, Home, Plane, Hammer, Briefcase, GraduationCap, FileText, Edit } from "lucide-react";

// 账本类型定义
const ledgerTypes = [
  {
    id: "family",
    name: "家庭/情侣账本",
    description: "生活日常开销，柴米油盐酱醋茶",
    icon: Home,
    color: "bg-orange-100 text-orange-600",
  },
  {
    id: "travel",
    name: "旅游账本",
    description: "多人同行，账目清晰明了",
    icon: Plane,
    color: "bg-amber-100 text-amber-600",
  },
  {
    id: "renovation",
    name: "装修账本",
    description: "各项目的预算情况，一目了然",
    icon: Hammer,
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: "business",
    name: "生意账本",
    description: "收益情况，合伙人随时查看",
    icon: Briefcase,
    color: "bg-purple-100 text-purple-600",
  },
  {
    id: "class",
    name: "班级账本",
    description: "班费支出全班公开透明",
    icon: GraduationCap,
    color: "bg-green-100 text-green-600",
  },
  {
    id: "expense",
    name: "报销账本",
    description: "公司差旅采购支出报销绝So easy",
    icon: FileText,
    color: "bg-cyan-100 text-cyan-600",
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

  const handleSelectType = (typeId: string) => {
    setLocation(`/ledger/create?type=${typeId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶部导航栏 */}
      <div className="bg-blue-500 text-white">
        <div className="container py-3 px-4 flex items-center">
          <button
            onClick={() => setLocation("/ledger")}
            className="p-1 -ml-2 hover:bg-blue-600 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-lg font-semibold text-center mr-8">创建新的账本</h1>
        </div>
      </div>

      {/* 提示文字 */}
      <div className="container px-4 py-3">
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <div className="w-6 h-6 rounded-full border-2 border-gray-400 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 rotate-[-90deg]" />
          </div>
          <span>请选择账本类型</span>
        </div>
      </div>

      {/* 账本类型列表 */}
      <div className="container px-4 pb-4 space-y-0">
        {ledgerTypes.map((type) => {
          const Icon = type.icon;
          return (
            <div
              key={type.id}
              onClick={() => handleSelectType(type.id)}
              className="bg-white py-3 px-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className={`w-12 h-12 rounded-full ${type.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-800 text-base">{type.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
              </div>
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0"></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
