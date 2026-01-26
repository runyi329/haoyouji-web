import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronRight,
  Settings,
  Wallet,
  BarChart3,
  Calendar,
  Plus,
  User,
  FileText,
} from "lucide-react";

// 模拟账本数据
const mockLedgers = [
  { id: 1, name: "家庭记账" },
  { id: 2, name: "生意账本" },
  { id: 3, name: "澳门润仪投资有限公司" },
  { id: 4, name: "上海润豆仪豆贸易有限公司" },
];

// 模拟记账记录数据
const mockRecords = [
  {
    date: "2026-01-11",
    dayOfWeek: "周六",
    income: 0,
    expense: 38,
    balance: -38,
    records: [
      {
        id: 1,
        category: "交通",
        subcategory: "停车费",
        amount: -38.0,
        user: { name: "用户1", avatar: "" },
      },
    ],
  },
  {
    date: "2026-01-06",
    dayOfWeek: "周二",
    income: 0,
    expense: 1279,
    balance: -1279,
    records: [
      {
        id: 2,
        category: "购物",
        subcategory: "",
        amount: -25.0,
        user: { name: "用户1", avatar: "" },
      },
      {
        id: 3,
        category: "其他",
        subcategory: "喵喵",
        amount: -144.0,
        user: { name: "用户1", avatar: "" },
        note: "餐费",
      },
      {
        id: 4,
        category: "其他",
        subcategory: "旺旺",
        amount: -1110.0,
        user: { name: "用户1", avatar: "" },
        note: "学费",
      },
    ],
  },
  {
    date: "2026-01-02",
    dayOfWeek: "周五",
    income: 0,
    expense: 503.6,
    balance: -503.6,
    records: [
      {
        id: 5,
        category: "交通",
        subcategory: "加油",
        amount: -414.6,
        user: { name: "用户1", avatar: "" },
      },
      {
        id: 6,
        category: "交通",
        subcategory: "停车费",
        amount: -9.0,
        user: { name: "用户1", avatar: "" },
      },
      {
        id: 7,
        category: "其他",
        subcategory: "电费",
        amount: -50.0,
        user: { name: "用户1", avatar: "" },
      },
      {
        id: 8,
        category: "其他",
        subcategory: "话费",
        amount: -30.0,
        user: { name: "用户1", avatar: "" },
      },
    ],
  },
];

// 分类图标映射
const categoryIcons: Record<string, string> = {
  交通: "🚗",
  购物: "🛍️",
  餐饮: "🍜",
  娱乐: "🎮",
  医疗: "💊",
  教育: "📚",
  住房: "🏠",
  其他: "💸",
};

export default function LedgerDetail() {
  const [, params] = useRoute("/ledger/:id");
  const [, setLocation] = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const ledgerId = params?.id ? parseInt(params.id) : 1;
  const currentLedger = mockLedgers.find((l) => l.id === ledgerId) || mockLedgers[0];

  // 计算月度统计
  const monthlyStats = {
    income: 0,
    expense: 1820.6,
    balance: -1820.6,
  };

  const handleSwitchLedger = (id: number) => {
    setLocation(`/ledger/${id}`);
    setIsDrawerOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 pb-20">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <div className="container py-4 px-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{currentLedger.name}</h1>
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="flex items-center gap-1 text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
            >
              <span>切换账本</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 成员和功能按钮 */}
      <div className="container px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          {/* 成员头像 */}
          <div className="flex -space-x-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-2 border-white flex items-center justify-center text-white text-sm font-medium shadow-md"
              >
                {i}
              </div>
            ))}
          </div>

          {/* 设置按钮 */}
          <button className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-md transition-colors">
            <Settings className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* 功能按钮 */}
        <div className="flex gap-4 mb-4">
          <button className="flex items-center gap-2 bg-white/90 hover:bg-white px-4 py-2 rounded-lg shadow-md transition-colors">
            <Wallet className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">资金</span>
          </button>
          <button className="flex items-center gap-2 bg-white/90 hover:bg-white px-4 py-2 rounded-lg shadow-md transition-colors">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">报表</span>
          </button>
          <button className="flex items-center gap-2 bg-white/90 hover:bg-white px-4 py-2 rounded-lg shadow-md transition-colors">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">日历</span>
          </button>
        </div>

        {/* 月度统计 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">1月总收入</div>
            <div className="text-lg font-bold text-green-600">{monthlyStats.income.toFixed(2)}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">1月总结余</div>
            <div className="text-lg font-bold text-gray-700">{monthlyStats.balance.toFixed(2)}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">1月总支出</div>
            <div className="text-lg font-bold text-red-600">{monthlyStats.expense.toFixed(2)}</div>
          </Card>
        </div>
      </div>

      {/* 记账记录列表 */}
      <div className="container px-4 pb-4 space-y-4">
        {mockRecords.map((dayRecord) => (
          <div key={dayRecord.date}>
            {/* 日期标题 */}
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-sm text-white/90">
                {dayRecord.date} {dayRecord.dayOfWeek}
              </span>
              <span className="text-xs text-white/80">
                收:{dayRecord.income}, 支:{dayRecord.expense}, 余:{dayRecord.balance}
              </span>
            </div>

            {/* 当天的记录 */}
            <div className="space-y-2">
              {dayRecord.records.map((record) => (
                <Card key={record.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {/* 用户头像 */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                      U
                    </div>

                    {/* 分类信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 text-sm">●</span>
                        <span className="text-sm font-medium text-gray-800">
                          {categoryIcons[record.category] || "💰"} {record.category}
                          {record.subcategory && `–${record.subcategory}`}
                        </span>
                      </div>
                      {record.note && (
                        <div className="text-xs text-gray-500 mt-1">{record.note}</div>
                      )}
                    </div>

                    {/* 金额 */}
                    <div className={`text-lg font-bold flex-shrink-0 ${
                      record.amount < 0 ? "text-gray-800" : "text-green-600"
                    }`}>
                      {record.amount.toFixed(2)}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 底部固定按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="container flex items-center justify-around py-3">
          <button
            onClick={() => setLocation("/ledger")}
            className="flex flex-col items-center gap-1"
          >
            <FileText className="w-6 h-6 text-gray-600" />
            <span className="text-xs text-gray-600">账本</span>
          </button>

          <Button
            size="icon"
            className="w-16 h-16 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg"
            onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          >
            <Plus className="w-8 h-8" />
          </Button>

          <button
            onClick={() => setLocation("/profile")}
            className="flex flex-col items-center gap-1"
          >
            <User className="w-6 h-6 text-gray-600" />
            <span className="text-xs text-gray-600">我</span>
          </button>
        </div>
      </div>

      {/* 切换账本抽屉 */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle>创建或加入账本?</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {mockLedgers.map((ledger) => (
              <button
                key={ledger.id}
                onClick={() => handleSwitchLedger(ledger.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  ledger.id === ledgerId
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="font-medium text-gray-800">{ledger.name}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
