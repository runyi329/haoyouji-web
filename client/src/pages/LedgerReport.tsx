import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, List, BarChart3 } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabType = "calendar" | "list" | "chart";

export default function LedgerReport() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(id || "0");
  
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<TabType>("chart");

  // 获取账本信息
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });

  // 获取报表数据
  const { data: reportData } = trpc.ledger.getReport.useQuery({ 
    ledgerId, 
    year: selectedYear 
  });

  // 生成年份选项（最近5年）
  const yearOptions = useMemo(() => {
    const years = [];
    for (let i = currentYear; i >= currentYear - 4; i--) {
      years.push(i);
    }
    return years;
  }, [currentYear]);

  // 格式化金额
  const formatAmount = (amount: number) => {
    return amount.toFixed(2);
  };

  // 月份数据（1-12月）
  const monthlyData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
      const monthData = reportData?.monthlyStats?.find((m: any) => m.month === i);
      data.push({
        month: i,
        income: monthData?.income || 0,
        expense: monthData?.expense || 0,
        balance: (monthData?.income || 0) - (monthData?.expense || 0),
      });
    }
    return data;
  }, [reportData]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航区 - 蓝色渐变背景 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        {/* 顶部导航栏：返回 + 账本名称 + 切换账本 + Tab切换 */}
        <div className="flex items-center justify-between px-4 py-3">
          <button 
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="flex items-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-2">
            <span className="font-medium">{ledgerData?.name || "账本"}</span>
            <span className="text-sm opacity-80">⇄ 切换账本</span>
          </div>
          {/* 标签页切换 - 放在账本名称右边 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setActiveTab("chart")}
              className={`px-3 py-1 text-sm ${
                activeTab === "chart" 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              图表
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-3 py-1 text-sm ${
                activeTab === "calendar" 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              日历
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3 py-1 text-sm ${
                activeTab === "list" 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              列表
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 bg-gray-50 overflow-auto">
        {activeTab === "list" && (
          <ListViewContent 
            reportData={reportData} 
            selectedYear={selectedYear}
            monthlyData={monthlyData}
            formatAmount={formatAmount}
          />
        )}
        {activeTab === "chart" && (
          <ChartViewContent 
            reportData={reportData}
            selectedYear={selectedYear}
            monthlyData={monthlyData}
            formatAmount={formatAmount}
            ledgerId={ledgerId}
          />
        )}
        {activeTab === "calendar" && (
          <CalendarViewContent 
            ledgerId={ledgerId}
          />
        )}
      </div>
    </div>
  );
}

// 列表视图内容
function ListViewContent({ 
  reportData, 
  selectedYear, 
  monthlyData,
  formatAmount 
}: { 
  reportData: any; 
  selectedYear: number;
  monthlyData: any[];
  formatAmount: (n: number) => string;
}) {
  const yearIncome = reportData?.yearlyStats?.income || 0;
  const yearExpense = reportData?.yearlyStats?.expense || 0;
  const yearBalance = yearIncome - yearExpense;

  return (
    <div className="p-4 space-y-4">
      {/* 年度汇总卡片 */}
      <div className="bg-red-50 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500 mb-1">{selectedYear}年收入</div>
            <div className="text-lg font-semibold text-green-600">
              {formatAmount(yearIncome)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{selectedYear}年结余</div>
            <div className={`text-lg font-semibold ${yearBalance >= 0 ? 'text-gray-600' : 'text-gray-600'}`}>
              {formatAmount(yearBalance)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{selectedYear}年支出</div>
            <div className="text-lg font-semibold text-red-600">
              {formatAmount(yearExpense)}
            </div>
          </div>
        </div>
      </div>

      {/* 成员收支 */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded mr-2"></div>
          <h3 className="font-medium">成员收支</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-sm text-gray-500">
              <th className="text-left py-2">昵称</th>
              <th className="text-right py-2">收入</th>
              <th className="text-right py-2">支出</th>
              <th className="text-right py-2">结余</th>
            </tr>
          </thead>
          <tbody>
            {reportData?.memberStats?.length > 0 ? (
              reportData.memberStats.map((member: any, index: number) => (
                <tr key={index} className="border-t border-gray-100">
                  <td className="py-3 flex items-center">
                    <div className="mr-2">
                      <UserAvatar
                        username={member.username}
                        avatar={member.avatar}
                        nickname={member.nickname}
                        size="sm"
                      />
                    </div>
                    {member.nickname || member.username || "匿名用户"}
                  </td>
                  <td className="py-3 text-right text-green-600">
                    {formatAmount(member.income || 0)}
                  </td>
                  <td className="py-3 text-right text-red-600">
                    {formatAmount(member.expense || 0)}
                  </td>
                  <td className={`py-3 text-right ${
                    (member.income || 0) - (member.expense || 0) >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {formatAmount((member.income || 0) - (member.expense || 0))}
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-gray-100">
                <td colSpan={4} className="py-3 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 年度每月收支 */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded mr-2"></div>
          <h3 className="font-medium">年度每月收支</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-sm text-gray-500">
              <th className="text-left py-2">月份</th>
              <th className="text-right py-2">收入</th>
              <th className="text-right py-2">支出</th>
              <th className="text-right py-2">结余</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((month) => (
              <tr key={month.month} className="border-t border-gray-100">
                <td className="py-3">{month.month}月</td>
                <td className="py-3 text-right text-green-600">
                  {formatAmount(month.income)}
                </td>
                <td className="py-3 text-right text-red-600">
                  {formatAmount(month.expense)}
                </td>
                <td className={`py-3 text-right ${
                  month.balance >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatAmount(month.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 图表视图内容
function ChartViewContent({ 
  reportData,
  selectedYear,
  monthlyData,
  formatAmount,
  ledgerId 
}: { 
  reportData: any;
  selectedYear: number;
  monthlyData: any[];
  formatAmount: (n: number) => string;
  ledgerId: number;
}) {
  const [chartYear, setChartYear] = useState(selectedYear);
  const [chartMonth, setChartMonth] = useState(new Date().getMonth() + 1);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [timeDimension, setTimeDimension] = useState<'month' | 'year' | 'custom'>('month');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // 获取显示的时间范围文本
  const getTimeRangeText = () => {
    if (timeDimension === 'year') return `${chartYear}年`;
    if (timeDimension === 'month') return `${chartYear}年${chartMonth}月`;
    if (timeDimension === 'custom' && customStartDate && customEndDate) {
      return null; // 自定义时间范围单独处理
    }
    return `${chartYear}年${chartMonth}月`;
  };
  
  // 获取账本成员
  const { data: membersData } = trpc.ledger.getMembers.useQuery({ ledgerId });
  
  const yearIncome = reportData?.yearlyStats?.income || 0;
  const yearExpense = reportData?.yearlyStats?.expense || 0;
  
  // 计算天数和平均值
  const currentDate = new Date();
  const isCurrentYear = selectedYear === currentDate.getFullYear();
  const daysPassed = isCurrentYear 
    ? Math.floor((currentDate.getTime() - new Date(selectedYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 365;
  
  const avgIncome = daysPassed > 0 ? yearIncome / daysPassed : 0;
  const avgExpense = daysPassed > 0 ? yearExpense / daysPassed : 0;

  // 支出分类数据
  const expenseCategories = reportData?.categoryStats?.expense || [];
  const incomeCategories = reportData?.categoryStats?.income || [];
  
  // 成员显示文本
  const getMemberDisplayText = () => {
    if (selectedMemberIds.length === 0) return "全部成员";
    if (selectedMemberIds.length === 1 && membersData) {
      const member = membersData.find((m: any) => m.id === selectedMemberIds[0]);
      return member?.nickname || "成员";
    }
    return "多选";
  };
  
  // 切换成员选择
  const toggleMember = (memberId: number) => {
    if (memberId === 0) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(prev => 
        prev.includes(memberId) 
          ? prev.filter(id => id !== memberId)
          : [...prev, memberId]
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* 筛选器区域 */}
      <div className="bg-gradient-to-b from-blue-500 to-blue-600 text-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* 显示选择的时间范围 */}
          <div className="flex items-center gap-1 text-sm">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            {timeDimension === 'custom' && customStartDate && customEndDate ? (
              <div className="flex flex-col text-xs leading-tight">
                <span>{customStartDate}</span>
                <span>{customEndDate}</span>
              </div>
            ) : (
              <span>{getTimeRangeText()}</span>
            )}
          </div>
          
          {/* 时间维度切换按钮 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                setTimeDimension('month');
                setShowTimePicker(true);
              }}
              className={`px-2 py-1 text-xs ${
                timeDimension === 'month' 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              自然月
            </button>
            <button
              onClick={() => {
                setTimeDimension('year');
                setShowTimePicker(true);
              }}
              className={`px-2 py-1 text-xs ${
                timeDimension === 'year' 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              自然年
            </button>
            <button
              onClick={() => {
                setTimeDimension('custom');
                setShowTimePicker(true);
              }}
              className={`px-2 py-1 text-xs ${
                timeDimension === 'custom' 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              自定义
            </button>
          </div>
          
          {/* 成员筛选按钮 */}
          <button
            onClick={() => setShowMemberPicker(true)}
            className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 overflow-hidden"
          >
            {(() => {
              if (selectedMemberIds.length === 0) {
                return <span className="text-[8px] leading-tight">全部<br />成员</span>;
              }
              if (selectedMemberIds.length === 1 && membersData) {
                const member = membersData.find((m: any) => m.userId === selectedMemberIds[0]);
                if (member?.avatar) {
                  return <img src={member.avatar} alt="" className="w-full h-full object-cover" />;
                }
                const displayName = member?.nickname || member?.username || 'U';
                return <span className="text-[10px]">{displayName.charAt(0)}</span>;
              }
              return <span className="text-[9px]">多选</span>;
            })()}
          </button>
        </div>
      </div>
      
      {/* 成员选择弹窗 */}
      {showMemberPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMemberPicker(false)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">选择成员</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div 
                onClick={() => toggleMember(0)}
                className={`flex items-center p-2 rounded cursor-pointer ${
                  selectedMemberIds.length === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm mr-2">
                  全
                </div>
                <span>全部成员</span>
                {selectedMemberIds.length === 0 && <span className="ml-auto text-blue-600">✓</span>}
              </div>
              {membersData?.map((member: any) => (
                <div 
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`flex items-center p-2 rounded cursor-pointer ${
                    selectedMemberIds.includes(member.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="mr-2">
                    <UserAvatar
                      username={member.username}
                      avatar={member.avatar}
                      nickname={member.nickname}
                      size="sm"
                    />
                  </div>
                  <span>{member.nickname}</span>
                  {selectedMemberIds.includes(member.id) && <span className="ml-auto text-blue-600">✓</span>}
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowMemberPicker(false)}
              className="w-full mt-4 bg-blue-600 text-white py-2 rounded"
            >
              确定
            </button>
          </div>
        </div>
      )}
      
      {/* 时间选择弹窗 */}
      {showTimePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTimePicker(false)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">选择时间范围</h3>
            
            {/* 时间维度切换 */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTimeDimension('month')}
                className={`flex-1 py-2 rounded ${
                  timeDimension === 'month' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                自然月
              </button>
              <button
                onClick={() => setTimeDimension('year')}
                className={`flex-1 py-2 rounded ${
                  timeDimension === 'year' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                自然年
              </button>
              <button
                onClick={() => setTimeDimension('custom')}
                className={`flex-1 py-2 rounded ${
                  timeDimension === 'custom' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                自定义
              </button>
            </div>
            
            {/* 时间输入 */}
            <div className="mb-4">
              {timeDimension === 'year' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">选择年份</label>
                  <select
                    value={chartYear}
                    onChange={(e) => setChartYear(Number(e.target.value))}
                    className="w-full p-2 border border-gray-200 rounded"
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                      <option key={year} value={year}>{year}年</option>
                    ))}
                  </select>
                </div>
              )}
              {timeDimension === 'month' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">选择年份</label>
                    <select
                      value={chartYear}
                      onChange={(e) => setChartYear(Number(e.target.value))}
                      className="w-full p-2 border border-gray-200 rounded"
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                        <option key={year} value={year}>{year}年</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">选择月份</label>
                    <select
                      value={chartMonth}
                      onChange={(e) => setChartMonth(Number(e.target.value))}
                      className="w-full p-2 border border-gray-200 rounded"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                        <option key={month} value={month}>{month}月</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {timeDimension === 'custom' && (
                <div className="space-y-2 px-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full max-w-full p-2 border border-gray-200 rounded text-sm"
                    placeholder="开始日期"
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full max-w-full p-2 border border-gray-200 rounded text-sm"
                    placeholder="结束日期"
                  />
                </div>
              )}
            </div>
            
            {/* 按钮 */}
            <div className="flex gap-2">
              <button 
                onClick={() => setShowTimePicker(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded"
              >
                取消
              </button>
              <button 
                onClick={() => setShowTimePicker(false)}
                className="flex-1 bg-blue-600 text-white py-2 rounded"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-4 space-y-4">
      {/* 收支曲线 */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded mr-2"></div>
          <h3 className="font-medium">收支曲线</h3>
        </div>
        
        {/* 简单的折线图展示 */}
        <div className="h-48 flex items-end justify-around border-b border-l border-gray-200 relative">
          {monthlyData.slice(0, 12).map((month, index) => {
            const maxValue = Math.max(
              ...monthlyData.map(m => Math.max(m.income, m.expense)),
              1
            );
            const incomeHeight = (month.income / maxValue) * 100;
            const expenseHeight = (month.expense / maxValue) * 100;
            
            return (
              <div key={index} className="flex flex-col items-center w-full">
                <div className="flex items-end space-x-1 h-40">
                  <div 
                    className="w-2 bg-orange-400 rounded-t"
                    style={{ height: `${incomeHeight}%`, minHeight: month.income > 0 ? '4px' : '0' }}
                  />
                  <div 
                    className="w-2 bg-blue-500 rounded-t"
                    style={{ height: `${expenseHeight}%`, minHeight: month.expense > 0 ? '4px' : '0' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* 图例 */}
        <div className="flex justify-center space-x-6 mt-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
            <span>支出</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-orange-400 rounded-full mr-1"></div>
            <span>收入</span>
          </div>
        </div>

        {/* 平均值 */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">{daysPassed}天平均收入</span>
            <span className="text-green-600">{formatAmount(avgIncome)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{daysPassed}天平均支出</span>
            <span className="text-red-600">{formatAmount(avgExpense)}</span>
          </div>
        </div>
      </div>

      {/* 支出比例 */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded mr-2"></div>
          <h3 className="font-medium">支出比例</h3>
        </div>
        
        {/* 饼图 */}
        <div className="flex justify-center mb-4">
          <PieChart 
            data={expenseCategories} 
            total={yearExpense}
            formatAmount={formatAmount}
          />
        </div>

        {/* 分类列表 */}
        <table className="w-full">
          <thead>
            <tr className="text-sm text-gray-500">
              <th className="text-left py-2">支出类型</th>
              <th className="text-center py-2">占比</th>
              <th className="text-right py-2">金额</th>
            </tr>
          </thead>
          <tbody>
            {expenseCategories.length > 0 ? (
              expenseCategories.map((cat: any, index: number) => {
                const percentage = yearExpense > 0 
                  ? ((cat.amount / yearExpense) * 100).toFixed(0)
                  : 0;
                return (
                  <tr key={index} className="border-t border-gray-100">
                    <td className="py-3">{cat.category || "未分类"}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-center">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="ml-2 text-red-600">{percentage}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-red-600">
                      {formatAmount(cat.amount)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="border-t border-gray-100">
                <td colSpan={3} className="py-3 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 收入比例 */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center mb-4">
          <div className="w-1 h-5 bg-blue-600 rounded mr-2"></div>
          <h3 className="font-medium">收入比例</h3>
        </div>
        
        {/* 饼图 */}
        <div className="flex justify-center mb-4">
          <PieChart 
            data={incomeCategories} 
            total={yearIncome}
            formatAmount={formatAmount}
            isIncome
          />
        </div>

        {/* 分类列表 */}
        <table className="w-full">
          <thead>
            <tr className="text-sm text-gray-500">
              <th className="text-left py-2">收入类型</th>
              <th className="text-center py-2">占比</th>
              <th className="text-right py-2">金额</th>
            </tr>
          </thead>
          <tbody>
            {incomeCategories.length > 0 ? (
              incomeCategories.map((cat: any, index: number) => {
                const percentage = yearIncome > 0 
                  ? ((cat.amount / yearIncome) * 100).toFixed(0)
                  : 0;
                return (
                  <tr key={index} className="border-t border-gray-100">
                    <td className="py-3">{cat.category || "未分类"}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-center">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="ml-2 text-green-600">{percentage}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-green-600">
                      {formatAmount(cat.amount)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="border-t border-gray-100">
                <td colSpan={3} className="py-3 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

// 简单的饼图组件
function PieChart({ 
  data, 
  total,
  formatAmount,
  isIncome = false
}: { 
  data: any[]; 
  total: number;
  formatAmount: (n: number) => string;
  isIncome?: boolean;
}) {
  const colors = isIncome 
    ? ['#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7']
    : ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

  // 计算饼图路径
  const radius = 80;
  const centerX = 100;
  const centerY = 100;

  let currentAngle = -90; // 从顶部开始

  const slices = data.map((item, index) => {
    const percentage = total > 0 ? (item.amount / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    return {
      path: pathData,
      color: colors[index % colors.length],
      label: item.category,
      amount: item.amount,
      percentage,
    };
  });

  // 如果没有数据，显示一个完整的圆
  if (data.length === 0 || total === 0) {
    return (
      <div className="relative">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill={colors[0]}
          />
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-sm fill-white"
          >
            暂无数据
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {slices.map((slice, index) => (
          <path
            key={index}
            d={slice.path}
            fill={slice.color}
          />
        ))}
        {/* 显示百分比标签 */}
        {slices.length === 1 && (
          <text
            x={centerX + radius * 0.6 * Math.cos((-90 * Math.PI) / 180)}
            y={centerY + radius * 0.6 * Math.sin((-90 * Math.PI) / 180)}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-white font-medium"
          >
            100%
          </text>
        )}
      </svg>
      
      {/* 图例 */}
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {slices.map((slice, index) => (
          <div key={index} className="flex items-center text-xs">
            <div 
              className="w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: slice.color }}
            />
            <span>{slice.label}({formatAmount(slice.amount)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 日历视图内容
function CalendarViewContent({ 
  ledgerId
}: { 
  ledgerId: number;
}) {
  const [, setLocation] = useLocation();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [viewType, setViewType] = useState<"balance" | "income" | "expense">("balance");
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]); // 空数组表示全部成员

  // 获取账本成员列表
  const { data: membersData } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 获取日历数据（支持成员筛选）
  const { data: calendarData } = trpc.ledger.getCalendarData.useQuery({ 
    ledgerId, 
    year: currentYear,
    month: currentMonth,
    memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : undefined
  });

  // 获取选中日期的记录（支持成员筛选）
  const selectedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const { data: dayRecords } = trpc.ledger.getDayRecords.useQuery({ 
    ledgerId, 
    date: selectedDateStr,
    memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : undefined
  });

  // 切换成员选中状态
  const toggleMember = (memberId: number) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(memberId)) {
        return prev.filter(id => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  // 选择全部成员
  const selectAllMembers = () => {
    setSelectedMemberIds([]);
    setShowMemberPicker(false);
  };

  // 获取显示的成员文本
  const getMemberDisplayText = () => {
    if (selectedMemberIds.length === 0) {
      return "全部成员";
    }
    if (selectedMemberIds.length === 1 && membersData) {
      const member = membersData.find((m: any) => m.id === selectedMemberIds[0]);
      return member?.nickname || "成员";
    }
    return `${selectedMemberIds.length}人`;
  };

  // 格式化金额
  const formatAmount = (amount: number) => amount.toFixed(2);

  // 获取月度统计
  const monthlyStats = useMemo(() => {
    if (!calendarData?.monthlyStats) {
      return { income: 0, expense: 0, balance: 0 };
    }
    return {
      income: calendarData.monthlyStats.income,
      expense: calendarData.monthlyStats.expense,
      balance: calendarData.monthlyStats.income - calendarData.monthlyStats.expense
    };
  }, [calendarData]);

  // 获取每日数据映射
  const dailyDataMap = useMemo(() => {
    const map = new Map<number, { income: number; expense: number; balance: number }>();
    if (calendarData?.dailyStats) {
      calendarData.dailyStats.forEach((day: any) => {
        map.set(day.day, {
          income: day.income,
          expense: day.expense,
          balance: day.income - day.expense,
        });
      });
    }
    return map;
  }, [calendarData]);

  // 生成日历行数据
  const calendarRows = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const rows: (number | null)[][] = [];
    let currentRow: (number | null)[] = [];
    
    for (let i = 0; i < startDayOfWeek; i++) {
      currentRow.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      currentRow.push(day);
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
    
    if (currentRow.length > 0) {
      while (currentRow.length < 7) {
        currentRow.push(null);
      }
      rows.push(currentRow);
    }
    
    return rows;
  }, [currentYear, currentMonth]);

  // 切换月份
  const goToPrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(1);
  };

  const goToNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(1);
  };

  // 获取选中日期的统计
  const selectedDayStats = useMemo(() => {
    const dayData = dailyDataMap.get(selectedDate);
    if (dayData) return dayData;
    return { income: 0, expense: 0, balance: 0 };
  }, [dailyDataMap, selectedDate]);

  // 获取显示的金额值
  const getDisplayValue = (day: number) => {
    const dayData = dailyDataMap.get(day);
    if (!dayData) return 0;
    switch (viewType) {
      case "income": return dayData.income;
      case "expense": return -dayData.expense;
      case "balance":
      default: return dayData.balance;
    }
  };

  const weekDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  return (
    <div className="flex flex-col h-full relative">
      {/* 成员选择弹出层 */}
      {showMemberPicker && (
        <div className="absolute inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => setShowMemberPicker(false)}
          />
          <div className="absolute top-20 left-4 right-4 bg-white rounded-lg shadow-lg max-h-80 overflow-auto">
            <div className="p-3 border-b">
              <span className="font-medium text-gray-800">选择成员</span>
            </div>
            {/* 全部成员选项 */}
            <div 
              className="flex items-center px-4 py-3 border-b cursor-pointer hover:bg-gray-50"
              onClick={selectAllMembers}
            >
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white mr-3">
                <span>全</span>
              </div>
              <span className="flex-1 text-gray-800">全部成员</span>
              {selectedMemberIds.length === 0 && (
                <span className="text-blue-500">✓</span>
              )}
            </div>
            {/* 成员列表 */}
            {membersData?.map((member: any) => (
              <div 
                key={member.id}
                className="flex items-center px-4 py-3 border-b cursor-pointer hover:bg-gray-50"
                onClick={() => toggleMember(member.id)}
              >
                <div className="mr-3">
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="md"
                  />
                </div>
                <span className="flex-1 text-gray-800">{member.nickname || '未命名'}</span>
                {selectedMemberIds.includes(member.id) && (
                  <span className="text-blue-500">✓</span>
                )}
              </div>
            ))}
            <div className="p-3">
              <button 
                onClick={() => setShowMemberPicker(false)}
                className="w-full bg-blue-500 text-white py-2 rounded"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 蓝色背景区域 */}
      <div className="bg-gradient-to-b from-blue-500 to-blue-600 text-white pb-4">
        {/* 月份选择器和切换按钮 */}
        <div className="px-4 py-2 flex items-center justify-between gap-2">
          {/* 月份选择器 */}
          <div className="flex items-center gap-1 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{currentYear}年{currentMonth}月</span>
            <button onClick={goToNextMonth} className="p-0.5">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          {/* 结余/收入/支出切换 */}
          <div className="flex bg-white/20 rounded overflow-hidden">
            <button
              onClick={() => setViewType("balance")}
              className={`px-2.5 py-1 text-xs ${viewType === "balance" ? "bg-white text-blue-600" : "text-white"}`}
            >
              结余
            </button>
            <button
              onClick={() => setViewType("income")}
              className={`px-2.5 py-1 text-xs ${viewType === "income" ? "bg-white text-blue-600" : "text-white"}`}
            >
              收入
            </button>
            <button
              onClick={() => setViewType("expense")}
              className={`px-2.5 py-1 text-xs ${viewType === "expense" ? "bg-white text-blue-600" : "text-white"}`}
            >
              支出
            </button>
          </div>
          
          {/* 成员筛选按钮（圆形头像样式，缩小20%） */}
          <button
            onClick={() => setShowMemberPicker(true)}
            className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 overflow-hidden"
          >
            {(() => {
              if (selectedMemberIds.length === 0) {
                return <span className="text-[8px] leading-tight">全部<br />成员</span>;
              }
              if (selectedMemberIds.length === 1 && membersData) {
                const member = membersData.find((m: any) => m.userId === selectedMemberIds[0]);
                if (member?.avatar) {
                  return <img src={member.avatar} alt="" className="w-full h-full object-cover" />;
                }
                const displayName = member?.nickname || member?.username || 'U';
                return <span className="text-[10px]">{displayName.charAt(0)}</span>;
              }
              return <span className="text-[9px]">多选</span>;
            })()}
          </button>
        </div>

        {/* 月度统计 */}
        <div className="px-4 py-2 bg-blue-400/30 mx-4 rounded grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-xs opacity-80">{currentMonth}月收入</div>
            <div className="text-lg font-semibold">{formatAmount(monthlyStats.income)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-80">{currentMonth}月支出</div>
            <div className="text-lg font-semibold">{formatAmount(monthlyStats.expense)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-80">{currentMonth}月结余</div>
            <div className="text-lg font-semibold">{formatAmount(monthlyStats.balance)}</div>
          </div>
        </div>

        {/* 日历网格 */}
        <div className="mx-4 mt-3 bg-blue-600/50 rounded overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {weekDays.map((day) => (
                  <th key={day} className="text-center text-xs py-2 text-white/80 font-normal border-b border-blue-400/30">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((day, colIndex) => {
                    if (day === null) {
                      return (
                        <td key={`empty-${rowIndex}-${colIndex}`} className="h-12 border-b border-r border-blue-400/20" />
                      );
                    }
                    
                    const isSelected = day === selectedDate;
                    const dayValue = getDisplayValue(day);
                    const hasData = dailyDataMap.has(day);
                    
                    return (
                      <td 
                        key={`day-${day}`}
                        className={`h-12 text-center border-b border-r border-blue-400/20 cursor-pointer ${
                          isSelected ? "bg-orange-100" : ""
                        }`}
                        onClick={() => setSelectedDate(day)}
                      >
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className={`text-sm ${isSelected ? "font-bold text-blue-600" : "text-white"}`}>
                            {day}
                          </span>
                          <span className={`text-xs ${
                            isSelected 
                              ? (dayValue >= 0 ? "text-green-600" : "text-red-500")
                              : "text-white/70"
                          }`}>
                            {hasData ? dayValue.toFixed(0) : "0"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 当日明细区域 */}
      <div className="flex-1 bg-gray-100 overflow-auto">
        <div className="bg-white px-4 py-3 border-b flex items-center justify-between">
          <span className="text-gray-800">
            {currentYear}年{currentMonth}月{selectedDate}日
          </span>
          <span className="text-sm text-gray-500">
            收:{formatAmount(selectedDayStats.income)} 支:{formatAmount(selectedDayStats.expense)} 余:{formatAmount(selectedDayStats.balance)}
          </span>
        </div>

        <div className="bg-white">
          {dayRecords && dayRecords.length > 0 ? (
            dayRecords.map((record: any) => (
              <div 
                key={record.id} 
                className="px-4 py-3 border-b border-gray-100 cursor-pointer flex items-center"
                onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
              >
                <div className="mr-3">
                  <UserAvatar
                    username={record.createdBy?.username}
                    avatar={record.createdBy?.avatar}
                    size="md"
                  />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      record.type === "income" ? "bg-green-500" : "bg-red-500"
                    }`} />
                    <span className="text-gray-800">{record.categoryName || "未分类"}</span>
                  </div>
                </div>
                
                <span className={`font-medium ${
                  record.type === "income" ? "text-green-600" : "text-gray-800"
                }`}>
                  {record.type === "income" ? "+" : "-"}{formatAmount(record.amount)}
                </span>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-gray-400">
              暂无记录
            </div>
          )}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="bg-white border-t p-4">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          className="w-full bg-blue-500 text-white py-3 rounded-full flex items-center justify-center"
        >
          <span className="mr-1">+</span>
          <span>记一笔</span>
        </button>
      </div>
    </div>
  );
}
