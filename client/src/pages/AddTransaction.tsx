import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TransactionType = "expense" | "income";

const AddTransaction = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("0.00");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("银行转账");
  const [note, setNote] = useState("");
  
  // 日期相关状态
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [displayDate, setDisplayDate] = useState(new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  
  const [payer, setPayer] = useState("我自己");
  const [isPayerSheetOpen, setIsPayerSheetOpen] = useState(false);

  // 分类选项
  const categories = {
    expense: ["贷款", "购物", "交通", "其他", "保险医疗", "餐饮", "娱乐", "教育", "住房"],
    income: ["工资", "奖金", "投资收益", "其他收入"],
  };

  // 快捷分类（支出专用）
  const quickCategories = [
    "胡上海建行按揭",
    "邮储",
    "胡招行经营贷",
    "蒋招行闪电贷",
  ];

  // 账户选项
  const accounts = ["银行转账", "现金", "招行转账", "支付宝", "微信支付"];

  // 模拟成员列表
  const members = [
    { id: 1, name: "我自己", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=me" },
    { id: 2, name: "Yunting", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=yunting" },
    { id: 3, name: "M", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=m" },
  ];

  // 判断是否是今天
  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // 判断是否是同一天
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  // 获取月历数据
  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 获取第一天是星期几（0=周日，需要调整为1=周一）
    let firstDayOfWeek = firstDay.getDay();
    if (firstDayOfWeek === 0) firstDayOfWeek = 7; // 周日改为7
    
    // 计算需要显示的上个月的天数
    const prevMonthDays = firstDayOfWeek - 1;
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    const days: Date[] = [];
    
    // 添加上个月的日期
    for (let i = prevMonthDays; i > 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i + 1));
    }
    
    // 添加当月的日期
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    // 添加下个月的日期，补足到42天（6周）
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  // 处理日期选择
  const handleDateSelect = (date: Date) => {
    if (isToday(date)) {
      // 如果选择今天，直接设置
      setSelectedDate(date);
      setDisplayDate(date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
      setIsDateSheetOpen(false);
    } else {
      // 如果不是今天，显示确认对话框
      setPendingDate(date);
      setShowDateConfirm(true);
    }
  };

  // 确认日期选择
  const confirmDateSelect = () => {
    if (pendingDate) {
      setSelectedDate(pendingDate);
      setDisplayDate(pendingDate.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
      setIsDateSheetOpen(false);
      setShowDateConfirm(false);
      setPendingDate(null);
    }
  };

  // 取消日期选择
  const cancelDateSelect = () => {
    setShowDateConfirm(false);
    setPendingDate(null);
  };

  // 切换到今天
  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setDisplayDate(today.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
    setCalendarMonth(today);
    setIsDateSheetOpen(false);
  };

  // 上一个月
  const prevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
  };

  // 下一个月
  const nextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));
  };

  // 处理数字键盘输入
  const handleNumberInput = (num: string) => {
    if (num === "." && amount.includes(".")) {
      return; // 已经有小数点了
    }
    
    if (amount === "0.00" || amount === "0") {
      setAmount(num === "." ? "0." : num);
    } else {
      setAmount(amount + num);
    }
  };

  // 处理删除
  const handleDelete = () => {
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount("0.00");
    }
  };

  // 处理保存
  const handleSave = () => {
    if (!selectedCategory) {
      toast.error("请选择分类");
      return;
    }
    if (parseFloat(amount) === 0) {
      toast.error("请输入金额");
      return;
    }

    toast.success("记账成功！");
    setLocation(`/ledger/${id}`);
  };

  const calendarDays = getCalendarDays();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-blue-500 text-white p-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => setLocation(`/ledger/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold">添加账目</h1>
        <div className="w-5" /> {/* 占位 */}
      </div>

      {/* 类型标签页 */}
      <div className="bg-white flex flex-shrink-0">
        <button
          className={`flex-1 py-2.5 text-sm text-center ${
            transactionType === "expense"
              ? "bg-blue-500 text-white font-semibold"
              : "text-gray-600"
          }`}
          onClick={() => setTransactionType("expense")}
        >
          支出 ▼
        </button>
        <button
          className={`flex-1 py-2.5 text-sm text-center ${
            transactionType === "income"
              ? "bg-blue-500 text-white font-semibold"
              : "text-gray-600"
          }`}
          onClick={() => setTransactionType("income")}
        >
          收入
        </button>
      </div>

      {/* 金额显示 - 缩小高度和字体 */}
      <div className="bg-white py-2 px-4 flex-shrink-0">
        <div className="text-3xl font-light text-gray-800">¥{amount}</div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {/* 分类选择 */}
        <div className="bg-white mt-1 p-3">
          <div className="text-xs text-gray-500 mb-2">请选择分类</div>
          <div className="flex flex-wrap gap-1.5">
            {categories[transactionType].map((category) => (
              <button
                key={category}
                className={`px-3 py-1.5 rounded-full text-xs ${
                  selectedCategory === category
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 快捷分类（仅支出） */}
        {transactionType === "expense" && (
          <div className="bg-white mt-1 p-3">
            <div className="flex flex-wrap gap-1.5">
              {quickCategories.map((category) => (
                <button
                  key={category}
                  className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs rounded border border-gray-200"
                  onClick={() => {
                    setSelectedCategory("贷款");
                    setNote(category);
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 账户选择 */}
        <div className="bg-white mt-1 p-3">
          <div className="text-xs text-gray-500 mb-2">
            {transactionType === "expense" ? "选择付款方式" : "选择收款方式"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((account) => (
              <button
                key={account}
                className={`px-3 py-1.5 rounded-full text-xs ${
                  selectedAccount === account
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
                onClick={() => setSelectedAccount(account)}
              >
                {account}
              </button>
            ))}
          </div>
        </div>

        {/* 备注输入 */}
        <div className="bg-white mt-1 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="备注"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 p-2 border-none outline-none text-sm text-gray-700"
            />
            <button className="p-2 bg-blue-500 text-white rounded">
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 底部工具栏 */}
        <div className="bg-white mt-1 p-3 mb-2">
          <div className="flex items-center justify-between text-xs">
            <button className="flex items-center gap-1 text-gray-600">
              <Link2 className="w-3.5 h-3.5" />
              <span>关联账户</span>
            </button>
            <button 
              className="flex items-center gap-1 text-gray-600"
              onClick={() => setIsDateSheetOpen(true)}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{displayDate}</span>
            </button>
            <button 
              className="flex items-center gap-1 text-gray-600"
              onClick={() => setIsPayerSheetOpen(true)}
            >
              <User className="w-3.5 h-3.5" />
              <span>{payer}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 数字键盘 - 固定在底部，缩小高度 */}
      <div className="flex-shrink-0 bg-gray-100 grid grid-cols-4 gap-px border-t z-50">
        {["7", "8", "9", "-"].map((key) => (
          <button
            key={key}
            className="bg-white p-3 text-xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => key !== "-" && handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        {["4", "5", "6", "+"].map((key) => (
          <button
            key={key}
            className="bg-white p-3 text-xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => key !== "+" && handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        {["1", "2", "3"].map((key) => (
          <button
            key={key}
            className="bg-white p-3 text-xl font-light text-gray-800 active:bg-gray-200"
            onClick={() => handleNumberInput(key)}
          >
            {key}
          </button>
        ))}
        <button
          className="bg-blue-500 text-white p-3 text-base font-semibold row-span-2 active:bg-blue-600"
          onClick={handleSave}
        >
          保存
        </button>
        <button
          className="bg-white p-3 text-xl font-light text-gray-800 active:bg-gray-200"
          onClick={() => handleNumberInput(".")}
        >
          .
        </button>
        <button
          className="bg-white p-3 text-xl font-light text-gray-800 active:bg-gray-200"
          onClick={() => handleNumberInput("0")}
        >
          0
        </button>
        <button
          className="bg-white p-3 text-lg text-gray-800 active:bg-gray-200 flex items-center justify-center"
          onClick={handleDelete}
        >
          ⌫
        </button>
      </div>

      {/* 日期选择抽屉 */}
      <Sheet open={isDateSheetOpen} onOpenChange={setIsDateSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[70vh]">
          <div className="p-4">
            {/* 月份导航 */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="text-base font-medium">
                {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
              </div>
              <button onClick={nextMonth} className="p-2">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={goToToday}
                className="ml-2 px-3 py-1 text-xs text-blue-500 border border-blue-500 rounded-full"
              >
                今天
              </button>
            </div>

            {/* 星期标题 */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs text-blue-500 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={index}
                    onClick={() => handleDateSelect(day)}
                    className={`
                      aspect-square flex items-center justify-center text-sm rounded
                      ${!isCurrentMonth ? "text-gray-300" : "text-gray-800"}
                      ${isSelected ? "bg-blue-500 text-white font-semibold" : ""}
                      ${isTodayDate && !isSelected ? "border border-blue-500" : ""}
                      ${isCurrentMonth && !isSelected ? "hover:bg-gray-100" : ""}
                    `}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 日期确认对话框 */}
      <AlertDialog open={showDateConfirm} onOpenChange={setShowDateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              {pendingDate && (() => {
                const year = pendingDate.getFullYear();
                const month = (pendingDate.getMonth() + 1).toString().padStart(2, '0');
                const day = pendingDate.getDate().toString().padStart(2, '0');
                const currentYear = new Date().getFullYear();
                const yearText = year !== currentYear ? `${year}年` : '';
                return `您选择的 ${year}-${month}-${day}, ${yearText}不是今年呀，确定吗？`;
              })()}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel onClick={cancelDateSelect} className="flex-1">
              取消
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDateSelect} className="flex-1">
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 支出人选择抽屉 */}
      <Sheet open={isPayerSheetOpen} onOpenChange={setIsPayerSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[40vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span className="text-sm">请选择支出人：</span>
              <button
                onClick={() => setIsPayerSheetOpen(false)}
                className="text-blue-500 text-sm"
              >
                完成
              </button>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            {members.map((member) => (
              <button
                key={member.id}
                className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                onClick={() => {
                  setPayer(member.name);
                  setIsPayerSheetOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-sm">{member.name}</span>
                </div>
                {payer === member.name && (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AddTransaction;
