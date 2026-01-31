import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

import MembersDialog from "@/components/MembersDialog";
import { UserAvatar } from "@/components/UserAvatar";

import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Plus,
  Search,
} from "lucide-react";

export default function LedgerDetail() {
  const [, params] = useRoute("/ledger/:id");
  const [, setLocation] = useLocation();

  const ledgerId = params?.id ? parseInt(params.id) : 1;
  console.log('[LedgerDetail] params:', params, 'ledgerId:', ledgerId);
  
  // 读取URL查询参数
  const urlParams = new URLSearchParams(window.location.search);
  const filters: any = {
    ledgerId: Number(ledgerId),
    limit: 100,
  };
  
  // 从 URL 参数中读取筛选条件
  if (urlParams.has('startDate')) filters.startDate = urlParams.get('startDate')!;
  if (urlParams.has('endDate')) filters.endDate = urlParams.get('endDate')!;
  if (urlParams.has('type')) filters.type = urlParams.get('type') as 'income' | 'expense';
  if (urlParams.has('amountMin')) filters.amountMin = urlParams.get('amountMin')!;
  if (urlParams.has('amountMax')) filters.amountMax = urlParams.get('amountMax')!;
  
  // 处理分类 ID（只使用第一个）
  if (urlParams.has('categoryIds')) {
    const categoryIds = urlParams.get('categoryIds')!.split(',').map(Number);
    if (categoryIds.length > 0) {
      filters.categoryId = categoryIds[0];
    }
  }
  
  // 处理成员 ID（只使用第一个）
  if (urlParams.has('memberIds')) {
    const memberIds = urlParams.get('memberIds')!.split(',').map(Number);
    if (memberIds.length > 0) {
      filters.memberId = memberIds[0];
    }
  }
  
  console.log('[LedgerDetail] filters:', filters);
  
  // 使用 tRPC
  const { data: ledgerData, isLoading, error } = trpc.ledger.getById.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取成员列表
  const { data: membersData } = trpc.ledger.getMembers.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取记账记录列表（应用筛选条件）
  const { data: transactionsData } = trpc.ledger.getTransactions.useQuery(filters);

  // 获取待审批记账数量
  const { data: pendingApprovals = [] } = trpc.ledger.getPendingApprovals.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 成员弹窗状态
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  
  // 统计周期状态
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);

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
  
  // 使用真实数据
  const hasRecords = transactionsData && transactionsData.length > 0;

  // 根据选择的周期计算统计数据
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = `${now.getFullYear()}`;
  
  // 计算本周的开始日期（周一）
  const getWeekStart = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 周日调整为上周最后一天
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  };
  const weekStart = getWeekStart(now);
  
  const monthlyStats = {
    income: 0,
    expense: 0,
    balance: 0,
  };
  
  if (transactionsData) {
    transactionsData.forEach((day: any) => {
      let shouldInclude = false;
      
      switch (statsPeriod) {
        case 'day':
          shouldInclude = day.date === today;
          break;
        case 'week':
          shouldInclude = day.date >= weekStart && day.date <= today;
          break;
        case 'month':
          shouldInclude = day.date.startsWith(currentMonth);
          break;
        case 'year':
          shouldInclude = day.date.startsWith(currentYear);
          break;
      }
      
      if (shouldInclude) {
        monthlyStats.income += day.income || 0;
        monthlyStats.expense += day.expense || 0;
      }
    });
    monthlyStats.balance = monthlyStats.income - monthlyStats.expense;
  }



  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部区域 */}
      <div className="bg-[#bde4f4] text-[#404969] pb-4">
        {/* 标题栏 */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button
            onClick={() => setLocation("/ledger")}
            className="p-1 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center flex-1">
            <h1 className="text-lg font-medium">{ledgerData.name}</h1>
          </div>
        </div>

        {/* 成员头像和功能按钮 */}
        <div className="px-4 py-2 flex items-center justify-between">
          {/* 成员头像（靠左，堆叠显示） */}
          <div className="flex items-center">
            {membersData && Array.isArray(membersData) && membersData.length > 0 && membersData.slice(0, 5).map((member, index) => (
              <div
                key={member.userId}
                style={{ marginLeft: index === 0 ? 0 : '-12px', zIndex: 5 - index }}
              >
                <UserAvatar
                  username={member.username}
                  avatar={member.avatar}
                  nickname={member.nickname}
                  size="md"
                />
              </div>
            ))}
            {/* 显示更多按钮 */}
            {membersData && Array.isArray(membersData) && membersData.length > 0 && (
              <div
                className="w-10 h-10 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-gray-600 text-lg font-medium cursor-pointer hover:bg-gray-50"
                style={{ marginLeft: membersData.length > 0 ? '-12px' : 0, zIndex: 0 }}
                onClick={() => setShowMembersDialog(true)}
              >
                +
              </div>
            )}
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

        {/* 统计区域 */}
        <div className="px-4 pt-2 relative">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="relative">
              <div className="text-xs opacity-90 flex items-center justify-center gap-1">
                <span>
                  {statsPeriod === 'day' && '今日'}
                  {statsPeriod === 'week' && '本周'}
                  {statsPeriod === 'month' && '1月'}
                  {statsPeriod === 'year' && '今年'}
                  总收入
                </span>
                <button 
                  onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                  className="inline-flex items-center justify-center w-4 h-4"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 12 12">
                    <path d="M6 8L2 4h8z" />
                  </svg>
                </button>
              </div>
              <div className="text-lg font-medium">{monthlyStats.income.toFixed(2)}</div>
              
              {/* 周期选择菜单 */}
              {showPeriodMenu && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 w-[5.5rem]">
                  <button
                    onClick={() => {
                      setStatsPeriod('day');
                      setShowPeriodMenu(false);
                    }}
                    className="w-full px-2 py-2.5 text-sm text-gray-900 active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                  >
                    按天
                  </button>
                  <button
                    onClick={() => {
                      setStatsPeriod('week');
                      setShowPeriodMenu(false);
                    }}
                    className="w-full px-2 py-2.5 text-sm text-gray-900 active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                  >
                    按自然周
                  </button>
                  <button
                    onClick={() => {
                      setStatsPeriod('month');
                      setShowPeriodMenu(false);
                    }}
                    className="w-full px-2 py-2.5 text-sm text-gray-900 active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                  >
                    按自然月
                  </button>
                  <button
                    onClick={() => {
                      setStatsPeriod('year');
                      setShowPeriodMenu(false);
                    }}
                    className="w-full px-2 py-2.5 text-sm text-gray-900 active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                  >
                    按自然年
                  </button>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs opacity-90">
                {statsPeriod === 'day' && '今日'}
                {statsPeriod === 'week' && '本周'}
                {statsPeriod === 'month' && '1月'}
                {statsPeriod === 'year' && '今年'}
                总结余
              </div>
              <div className="text-lg font-medium">{monthlyStats.balance.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs opacity-90">
                {statsPeriod === 'day' && '今日'}
                {statsPeriod === 'week' && '本周'}
                {statsPeriod === 'month' && '1月'}
                {statsPeriod === 'year' && '今年'}
                总支出
              </div>
              <div className="text-lg font-medium">{monthlyStats.expense.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>



      {/* 待审批提示 */}
      {pendingApprovals.length > 0 && (
        <div 
          className="mx-4 mt-3 mb-2 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 cursor-pointer hover:bg-orange-100 transition-colors"
          onClick={() => setLocation(`/ledger/${ledgerId}/pending-approvals`)}
        >
          <Search className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <span className="text-sm text-orange-800">
            你有 <span className="font-semibold">{pendingApprovals.length}</span> 个待审批账目
          </span>
          <ChevronRight className="w-4 h-4 text-orange-600 ml-auto" />
        </div>
      )}

      {/* 记账记录列表 */}
      <div className="flex-1 px-4 pb-20 space-y-2">
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">还没有记账记录</div>
            <div className="text-gray-400 text-sm">点击下方"+"按钮开始记账</div>
          </div>
        ) : (
          transactionsData.map((dayRecord: any) => {
            // 计算星期
            const date = new Date(dayRecord.date);
            const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const dayOfWeek = weekDays[date.getDay()];
            
            return (
              <div key={dayRecord.date}>
                {/* 日期标题 */}
                <div className="flex items-center justify-between py-1 text-xs text-gray-500">
                  <span>
                    {dayRecord.date} {dayOfWeek}
                  </span>
                  <span className="text-xs">
                    收:{dayRecord.income.toFixed(2)}, 支:{dayRecord.expense.toFixed(2)}, 余:{dayRecord.balance.toFixed(2)}
                  </span>
                </div>

                {/* 当天的记录 */}
                <div className="space-y-1.5">
                  {dayRecord.records.map((record: any) => (
                    <div
                      key={record.id}
                      className="bg-white rounded-lg p-2 flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
                    >
                      {/* 成员头像 */}
                      <div className="flex-shrink-0">
                        <UserAvatar
                          username={record.member?.username}
                          avatar={record.member?.avatar}
                          nickname={record.member?.nickname}
                          size="sm"
                        />
                      </div>

                      {/* 分类信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${record.type === 'expense' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                          <span className="text-xs text-gray-900 font-normal">
                            {record.category}
                            {record.subcategory && `–${record.subcategory}`}
                          </span>
                          {/* 图片图标 */}
                          {record.imageUrl && (
                            <span className="text-gray-400 text-xs ml-0.5">📷</span>
                          )}
                          {/* 待审批图标 */}
                          {record.approvalStatus === 'pending' && (
                            <span className="ml-1 text-red-500 text-xs flex items-center gap-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" opacity="0.2" />
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0.3" />
                                <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="bold">审</text>
                              </svg>
                            </span>
                          )}
                        </div>
                        {record.description && (
                          <div className="text-xs text-gray-500 mt-0.5 ml-2.5 font-light">{record.description}</div>
                        )}
                      </div>

                      {/* 金额 */}
                      <div className={`text-sm font-normal flex-shrink-0 ${record.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                        {record.type === 'expense' ? '-' : '+'}{record.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 固定底部中间的添加账目按钮 */}
      <Button
        onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all"
        style={{ backgroundColor: '#f97316' }}
        size="icon"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </Button>

      {/* 成员列表弹窗 */}
      {membersData && (
        <MembersDialog
          open={showMembersDialog}
          onOpenChange={setShowMembersDialog}
          members={membersData}
        />
      )}
    </div>
  );
}
