import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import DraggableAddButton from "@/components/DraggableAddButton";

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
  
  // 使用 tRPC
  const { data: ledgerData, isLoading, error } = trpc.ledger.getById.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 记录最后访问的账本ID到localStorage
  useEffect(() => {
    if (ledgerId) {
      localStorage.setItem('lastVisitedLedgerId', String(ledgerId));
    }
  }, [ledgerId]);

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
  
  // 使用模拟数据展示
  const hasRecords = mockRecords && mockRecords.length > 0;

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
          <div className="flex items-center gap-2 flex-1 justify-center">
            <h1 className="text-lg font-medium">{ledgerData.name}</h1>
            <button
              onClick={() => setLocation("/ledger")}
              className="flex items-center gap-0.5 text-sm"
            >
              <ChevronRight className="w-4 h-4" />
              <span>切换账本</span>
            </button>
          </div>
        </div>

        {/* 成员头像和功能按钮 */}
        <div className="px-4 py-2 flex items-center justify-between">
          {/* 成员头像（靠左） */}
          <div className="flex items-center gap-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-gray-800 border-2 border-white flex items-center justify-center text-white text-sm font-medium"
              >
                R{i}
              </div>
            ))}
          </div>
          
          {/* 功能按钮（靠右） */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full border-2 border-white/50 flex items-center justify-center">
              <Settings 
                className="w-5 h-5 text-white cursor-pointer" 
                onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
              />
            </div>
            <div 
              className="w-10 h-10 rounded-full border-2 border-white/50 flex items-center justify-center cursor-pointer"
              onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
            >
              <Search className="w-5 h-5 text-white" />
            </div>
            <div 
              className="w-10 h-10 rounded-full border-2 border-white/50 flex items-center justify-center cursor-pointer"
              onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
            >
              <BarChart3 className="w-5 h-5 text-white" />
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
      <div className="flex-1 px-4 pb-20 space-y-2">
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">还没有记账记录</div>
            <div className="text-gray-400 text-sm">点击下方"+"按钮开始记账</div>
          </div>
        ) : (
          mockRecords.map((dayRecord) => (
            <div key={dayRecord.date}>
              {/* 日期标题 */}
              <div className="flex items-center justify-between py-1 text-xs text-gray-500">
                <span>
                  {dayRecord.date} {dayRecord.dayOfWeek}
                </span>
                <span className="text-xs">
                  收:{dayRecord.income}, 支:{dayRecord.expense}, 余:{dayRecord.balance}
                </span>
              </div>

              {/* 当天的记录 */}
              <div className="space-y-1.5">
                {dayRecord.records.map((record) => (
                  <div
                    key={record.id}
                    className="bg-white rounded-lg p-2 flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
                  >
                    {/* 用户头像 */}
                    <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                      U
                    </div>

                    {/* 分类信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
                        <span className="text-xs text-gray-900 font-normal">
                          {record.category}
                          {record.subcategory && `–${record.subcategory}`}
                        </span>
                      </div>
                      {record.note && (
                        <div className="text-xs text-gray-500 mt-0.5 ml-2.5 font-light">{record.note}</div>
                      )}
                    </div>

                    {/* 金额 */}
                    <div className="text-sm font-normal text-gray-900 flex-shrink-0">
                      {record.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 可拖动悬浮加号按钮 */}
      <DraggableAddButton onClick={() => setLocation(`/ledger/${ledgerId}/add`)} />
    </div>
  );
}
