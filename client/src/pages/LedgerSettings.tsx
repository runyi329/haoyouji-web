import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users, List, Wallet, BarChart3, Download, Archive, Trash2 } from "lucide-react";

// 设置项配置
const settingItems = [
  { id: "members", label: "成员管理", icon: Users, description: "邀请成员、设置权限" },
  { id: "categories", label: "收支条目", icon: List, description: "管理收支分类" },
  { id: "accounts", label: "资金账户", icon: Wallet, description: "管理账户信息" },
  { id: "stats", label: "统计设置", icon: BarChart3, description: "统计相关设置" },
  { id: "export", label: "导出账本", icon: Download, description: "导出为Excel或PDF" },
  { id: "archive", label: "存档账本", icon: Archive, description: "将账本移至已存档" },
  { id: "delete", label: "删除账本", icon: Trash2, description: "永久删除此账本", danger: true },
];

export default function LedgerSettings() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params.id;

  const handleBack = () => {
    setLocation(`/ledger/${ledgerId}`);
  };

  const handleItemClick = (itemId: string) => {
    // TODO: 实现各个设置项的功能
    console.log("点击设置项:", itemId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-blue-500 text-white px-3 py-2.5 flex items-center">
        <button
          onClick={handleBack}
          className="p-1 -ml-1"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium pr-6">账本设置</h1>
      </div>

      {/* 设置项列表 */}
      <div className="p-4 space-y-2">
        {settingItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`w-full bg-white rounded-lg p-3 flex items-center gap-3 hover:shadow-md transition-shadow ${
                item.danger ? "border border-red-200" : ""
              }`}
            >
              {/* 图标 */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.danger ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
              }`}>
                <Icon className="w-5 h-5" />
              </div>

              {/* 文字内容 */}
              <div className="flex-1 text-left">
                <div className={`text-sm font-medium ${item.danger ? "text-red-600" : "text-gray-900"}`}>
                  {item.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
              </div>

              {/* 箭头 */}
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
