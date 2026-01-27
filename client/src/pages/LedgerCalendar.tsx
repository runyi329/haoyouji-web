import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Calendar, Users, Plus } from "lucide-react";

type ViewType = "balance" | "income" | "expense";

export default function LedgerCalendar() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(id || "0");
  
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [viewType, setViewType] = useState<ViewType>("balance");

  // 获取账本信息
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });

  // 获取日历数据
  const { data: calendarData } = trpc.ledger.getCalendarData.useQuery({ 
    ledgerId, 
    year: currentYear,
    month: currentMonth
  });

  // 获取选中日期的记录
  const selectedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const { data: dayRecords } = trpc.ledger.getDayRecords.useQuery({ 
    ledgerId, 
    date: selectedDateStr
  });

  // 格式化金额
  const formatAmount = (amount: number) => {
    return amount.toFixed(2);
  };

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
    
    // 获取第一天是周几（0=周日，需要转换为周一开始）
    let startDayOfWeek = firstDay.getDay();
    // 转换：周日(0)->6, 周一(1)->0, 周二(2)->1, ...
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const rows: (number | null)[][] = [];
    let currentRow: (number | null)[] = [];
    
    // 填充第一行前面的空白
    for (let i = 0; i < startDayOfWeek; i++) {
      currentRow.push(null);
    }
    
    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      currentRow.push(day);
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
    
    // 填充最后一行的空白
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
    if (dayData) {
      return dayData;
    }
    return { income: 0, expense: 0, balance: 0 };
  }, [dailyDataMap, selectedDate]);

  // 获取显示的金额值
  const getDisplayValue = (day: number) => {
    const dayData = dailyDataMap.get(day);
    if (!dayData) return 0;
    switch (viewType) {
      case "income":
        return dayData.income;
      case "expense":
        return -dayData.expense;
      case "balance":
      default:
        return dayData.balance;
    }
  };

  // 星期标题
  const weekDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  return (
    <div className="min-h-screen bg-gray-100" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航栏 */}
      <div className="bg-white px-4 py-3" style={{ display: 'flex', alignItems: 'center' }}>
        <button 
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="text-gray-600"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-center font-medium text-gray-800" style={{ flex: 1 }}>账本日历</h1>
        <div style={{ width: '24px' }} />
      </div>

      {/* 蓝色背景区域 */}
      <div className="bg-gradient-to-b from-blue-500 to-blue-600 text-white pb-4">
        {/* 月份选择器和切换按钮 */}
        <div className="px-4 py-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button 
            onClick={goToNextMonth}
            className="text-white"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Calendar className="w-4 h-4 mr-1" />
            <span>{currentYear}年{currentMonth}月</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div className="bg-white/20 rounded overflow-hidden" style={{ display: 'flex' }}>
              <button
                onClick={() => setViewType("balance")}
                className={`px-3 py-1 text-sm ${
                  viewType === "balance" 
                    ? "bg-white text-blue-600" 
                    : "text-white"
                }`}
              >
                结余
              </button>
              <button
                onClick={() => setViewType("income")}
                className={`px-3 py-1 text-sm ${
                  viewType === "income" 
                    ? "bg-white text-blue-600" 
                    : "text-white"
                }`}
              >
                收入
              </button>
              <button
                onClick={() => setViewType("expense")}
                className={`px-3 py-1 text-sm ${
                  viewType === "expense" 
                    ? "bg-white text-blue-600" 
                    : "text-white"
                }`}
              >
                支出
              </button>
            </div>
            
            <button className="bg-red-500 text-white text-xs px-2 py-1 rounded">
              多账本
            </button>
          </div>
        </div>

        {/* 月度统计 */}
        <div className="px-4 py-2 bg-blue-400/30 mx-4 rounded" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
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

        {/* 日历网格 - 使用表格布局 */}
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
                        <td 
                          key={`empty-${rowIndex}-${colIndex}`}
                          className="h-14 border-b border-r border-blue-400/20"
                        />
                      );
                    }
                    
                    const isSelected = day === selectedDate;
                    const dayValue = getDisplayValue(day);
                    const hasData = dailyDataMap.has(day);
                    
                    return (
                      <td 
                        key={`day-${day}`}
                        className={`h-14 text-center border-b border-r border-blue-400/20 cursor-pointer ${
                          isSelected ? "bg-orange-100" : ""
                        }`}
                        onClick={() => setSelectedDate(day)}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <span className={`text-sm ${
                            isSelected ? "font-bold text-blue-600" : "text-white"
                          }`}>
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
      <div className="bg-gray-100 overflow-auto" style={{ flex: 1 }}>
        <div className="bg-white px-4 py-3 border-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                className="px-4 py-3 border-b border-gray-100 cursor-pointer"
                style={{ display: 'flex', alignItems: 'center' }}
                onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 mr-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users className="w-5 h-5 text-gray-400" />
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
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
      <div style={{ position: 'fixed', bottom: '16px', right: '16px' }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          className="bg-blue-500 text-white px-6 py-3 rounded-full shadow-lg"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <Plus className="w-5 h-5 mr-1" />
          <span>记一笔</span>
        </button>
      </div>
    </div>
  );
}
