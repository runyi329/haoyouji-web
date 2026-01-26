import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Plus,
  Search,
} from "lucide-react";

// 模拟记账记录数据
const mockRecords = [
  {
    date: "2026-01-11",
    dayOfWeek: "周天",
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

export default function LedgerDetail() {
  const [, params] = useRoute("/ledger/:id");
  const [, setLocation] = useLocation();


  const ledgerId = params?.id ? parseInt(params.id) : 1;
  console.log('[LedgerDetail] params:', params, 'ledgerId:', ledgerId);
  
  // 使用 tRPC 获取账本详情
  const { data: ledgerData, isLoading, error } = trpc.ledger.getById.useQuery({
    ledgerId,
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center">
        <div className="text-[#404969] text-lg">加载中...</div>
      </div>
    );
  }
  
  if (error || !ledgerData) {
    return (
      <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center">
        <div className="text-[#404969] text-lg">账本不存在或您没有权限访问</div>
      </div>
    );
  }
  
  // 使用真实数据，如果没有数据则显示空状态
  // 对于新创建的账本（ID >= 30000），显示空状态
  const hasRecords = ledgerId < 30000 && mockRecords && mockRecords.length > 0;

  // 计算月度统计
  const monthlyStats = {
    income: 0,
    expense: 1820.6,
    balance: -1820.6,
  };



  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部区域 */}
      <div className="bg-[#bde4f4] text-[#404969] pb-4">
        {/* 标题栏 */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="p-1 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 flex-1 justify-center -ml-8">
            <h1 className="text-lg font-medium">{ledgerData.name}</h1>
            <button
              onClick={() => setLocation("/ledger")}
              className="flex items-center gap-0.5 text-sm"
            >
              <ChevronRight className="w-4 h-4" />
              <span>切换账本</span>
            </button>
          </div>
          {/* 报表按钮 */}
          <button className="flex flex-col items-center gap-0.5">
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs">报表</span>
          </button>
        </div>

        {/* 搜索框、成员头像和设置按钮 */}
        <div className="px-4 py-2 flex items-center gap-3">
          {/* 搜索框 */}
          <div 
            className="flex-1 flex items-center gap-2 bg-white/90 rounded-full px-4 py-2 shadow-sm cursor-pointer"
            onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
          >
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索账单"
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400 cursor-pointer"
              readOnly
            />
          </div>
          
          {/* 成员头像 */}
          <div className="flex items-center gap-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-gray-800 border-2 border-white flex items-center justify-center text-white text-sm font-medium"
              >
                R{i}
              </div>
            ))}
            <div className="w-10 h-10 rounded-full border-2 border-white/50 flex items-center justify-center">
              <Settings 
                className="w-5 h-5 text-white cursor-pointer" 
                onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
              />
            </div>
          </div>
        </div>

        {/* 月度统计 */}
        <div className="px-4 pt-2 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs opacity-90">1月总收入</div>
            <div className="text-lg font-medium">{monthlyStats.income.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs opacity-90">1月总结余</div>
            <div className="text-lg font-medium">{monthlyStats.balance.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs opacity-90">1月总支出</div>
            <div className="text-lg font-medium">{monthlyStats.expense.toFixed(2)}</div>
          </div>
        </div>
      </div>



      {/* 记账记录列表 */}
      <div className="flex-1 px-4 pb-20 space-y-3">
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">还没有记账记录</div>
            <div className="text-gray-400 text-sm">点击下方"+"按钮开始记账</div>
          </div>
        ) : (
          mockRecords.map((dayRecord) => (
            <div key={dayRecord.date}>
              {/* 日期标题 */}
              <div className="flex items-center justify-between py-2 text-sm text-gray-500">
                <span>
                  {dayRecord.date} {dayRecord.dayOfWeek}
                </span>
                <span className="text-xs">
                  收:{dayRecord.income}, 支:{dayRecord.expense}, 余:{dayRecord.balance}
                </span>
              </div>

              {/* 当天的记录 */}
              <div className="space-y-2">
                {dayRecord.records.map((record) => (
                  <div
                    key={record.id}
                    className="bg-white rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
                  >
                    {/* 用户头像 */}
                    <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                      U
                    </div>

                    {/* 分类信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                        <span className="text-sm text-gray-900">
                          {record.category}
                          {record.subcategory && `–${record.subcategory}`}
                        </span>
                      </div>
                      {record.note && (
                        <div className="text-xs text-gray-500 mt-0.5 ml-3.5">{record.note}</div>
                      )}
                    </div>

                    {/* 金额 */}
                    <div className="text-base font-medium text-gray-900 flex-shrink-0">
                      {record.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部固定按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex items-center justify-center py-2">
          <Button
            size="icon"
            className="w-14 h-14 rounded-full bg-[#ff7f50] hover:bg-[#bde4f4] text-white hover:text-[#404969] shadow-lg"
            onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          >
            <Plus className="w-7 h-7" />
          </Button>
        </div>
      </div>
    </div>
  );
}
