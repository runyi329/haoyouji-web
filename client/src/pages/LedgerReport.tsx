import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Calendar, List, BarChart3 } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<TabType>("list");

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
        {/* 顶部导航栏 */}
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
          <div className="w-6" /> {/* 占位 */}
        </div>

        {/* 年份选择器和标签页 */}
        <div className="flex items-center justify-between px-4 py-2">
          <Select 
            value={selectedYear.toString()} 
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-auto bg-transparent border-none text-white">
              <div className="flex items-center space-x-1">
                <Calendar className="w-4 h-4" />
                <SelectValue />
                <span>年</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 标签页切换 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
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
          />
        )}
        {activeTab === "calendar" && (
          <CalendarViewContent 
            reportData={reportData}
            selectedYear={selectedYear}
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
                    <span className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs mr-2">
                      👤
                    </span>
                    {member.nickname || "匿名用户"}
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
  formatAmount 
}: { 
  reportData: any;
  selectedYear: number;
  monthlyData: any[];
  formatAmount: (n: number) => string;
}) {
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

  return (
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

// 日历视图内容（占位）
function CalendarViewContent({ 
  reportData,
  selectedYear
}: { 
  reportData: any;
  selectedYear: number;
}) {
  return (
    <div className="p-4">
      <div className="bg-white rounded-lg p-8 text-center text-gray-400">
        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>日历视图开发中...</p>
      </div>
    </div>
  );
}
