import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  Plus,
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
import { trpc } from "@/lib/trpc";
import { autoCompressImage } from "@/utils/imageUtils";

type TransactionType = "expense" | "income";

interface Category {
  id: number;
  ledgerId: number;
  name: string;
  type: "income" | "expense";
  parentId: number | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  createdBy: number;
}

const AddTransaction = () => {
  const [location, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");
  const utils = trpc.useUtils();
  
  // 监听页面进入，刷新分类数据
  useEffect(() => {
    // 每次组件挂载或ledgerId变化时，使分类缓存失效
    utils.ledger.getCategories.invalidate({ ledgerId });
  }, [ledgerId, utils]);
  
  // 监听路由变化，当返回到添加账目页面时刷新分类数据
  useEffect(() => {
    // 当路由包含 /add 时，说明在添加账目页面，刷新分类数据
    if (location.includes('/add')) {
      utils.ledger.getCategories.invalidate({ ledgerId });
    }
  }, [location, ledgerId, utils]);
  
  // 监听页面可见性变化，当页面重新可见时刷新分类数据
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 页面重新可见时，刷新分类数据
        utils.ledger.getCategories.invalidate({ ledgerId });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ledgerId, utils]);
  
  // 编辑模式：从 URL 参数获取要编辑的账目 ID
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  const isEditMode = !!editId;
  const editTransactionId = editId ? parseInt(editId) : undefined;
  
  // 获取账本信息（用于获取功能开关）
  const { data: ledger } = trpc.ledger.getLedger.useQuery({ id: ledgerId });
  const isCustomAA = (ledger as any)?.type === 'custom_aa';
  const userRole = (ledger as any)?.userRole;
  const canManageCategories = !isCustomAA || userRole === 'owner' || userRole === 'admin';
  
  // 获取要编辑的账目详情
  const { data: editTransaction } = trpc.ledger.getTransactionDetail.useQuery(
    { ledgerId, transactionId: editTransactionId! },
    { enabled: isEditMode && !!editTransactionId }
  );

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  
  
  // 分类选择状态：存储选中的分类路径 [一级分类ID, 二级分类ID, 三级分类ID, ...]
  // 默认选中第一个预设分类（ID为2）
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<number[]>([2]);
  
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["微信"]);
  const [reimbursementStatus, setReimbursementStatus] = useState<'none' | 'pending'>('none');
  const [pendingType, setPendingType] = useState<'receivable' | 'payable' | null>(null);
  const [pendingIncludeStats, setPendingIncludeStats] = useState<number>(
    (ledger as any)?.pendingDefaultIncludeStats ?? 1
  ); // 0=仅显示不计入，1=显示并计入，默认使用账本设置
  const [note, setNote] = useState("");
  
  // 日期相关状态：支持 ?date=YYYY-MM-DD URL 参数预设日期
  const presetDateStr = urlParams.get('date');
  const initDate = presetDateStr ? new Date(presetDateStr + 'T00:00:00') : new Date();
  const [selectedDate, setSelectedDate] = useState(initDate);
  const [displayDate, setDisplayDate] = useState(initDate.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  
  const [payer, setPayer] = useState("我自己");
  const [isPayerSheetOpen, setIsPayerSheetOpen] = useState(false);

  // ===== 重复账目检测 =====
  // 防抖金额（500ms）
  const [debouncedAmount, setDebouncedAmount] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(amount), 500);
    return () => clearTimeout(timer);
  }, [amount]);

  // 当天日期字符串
  const selectedDateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  // 当前选中的最终类目 ID
  const currentCategoryId = selectedCategoryPath.length > 0
    ? selectedCategoryPath[selectedCategoryPath.length - 1]
    : undefined;

  const amountNum = debouncedAmount ? parseFloat(debouncedAmount) : undefined;
  const hasAmountInput = !!amountNum && amountNum > 0;

  const { data: dupData } = trpc.ledger.checkDuplicateTransaction.useQuery(
    {
      ledgerId,
      type: transactionType,
      amount: hasAmountInput ? amountNum : undefined,
      categoryId: currentCategoryId,
      date: selectedDateStr,
      excludeId: isEditMode && editTransactionId ? editTransactionId : undefined,
    },
    { enabled: hasAmountInput && !isEditMode || (isEditMode && hasAmountInput) }
  );

  const duplicateWarnings = useMemo(() => {
    if (!dupData?.duplicates || dupData.duplicates.length === 0) return [];
    return dupData.duplicates.map((d) => {
      const typeLabel = transactionType === 'income' ? '收入' : '支出';
      if (d.matchType === 'both') {
        return { text: `今天已有一笔相同类目和金额的${typeLabel}（${d.amount}元）`, id: d.id };
      }
      return { text: `今天已有一笔相同金额的${typeLabel}（${d.amount}元）`, id: d.id };
    });
  }, [dupData, transactionType]);
  // ===== 重复检测结束 =====
  
  // 图片上传相关
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 加载编辑数据
  // 当账本数据加载后，同步默认统计模式（仅在非编辑模式且未选择待结类型时）
  useEffect(() => {
    if (!isEditMode && ledger && !pendingType) {
      setPendingIncludeStats((ledger as any).pendingDefaultIncludeStats ?? 1);
    }
  }, [ledger, isEditMode, pendingType]);

  useEffect(() => {
    if (isEditMode && editTransaction) {
      setTransactionType(editTransaction.type as TransactionType);
      setAmount(editTransaction.amount.toString());
      setNote(editTransaction.description || "");
      setSelectedDate(new Date(editTransaction.recordDate));
      setDisplayDate(new Date(editTransaction.recordDate).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
      
      // 设置分类路径
      if (editTransaction.categoryPath && editTransaction.categoryPath.length > 0) {
        setSelectedCategoryPath(editTransaction.categoryPath);
      } else if (editTransaction.categoryId) {
        // 如果没有categoryPath，使用categoryId
        setSelectedCategoryPath([editTransaction.categoryId]);
      }
      
      // 加载图片
      if (editTransaction.images && editTransaction.images.length > 0) {
        setUploadedImages(editTransaction.images);
      }
      
      // 加载报销状态
      if (editTransaction.reimbursementStatus) {
        setReimbursementStatus(editTransaction.reimbursementStatus as 'none' | 'pending');
      }
      
      // 加载待结类型
      if (editTransaction.pendingType) {
        setPendingType(editTransaction.pendingType as 'receivable' | 'payable');
        setPendingIncludeStats(editTransaction.pendingIncludeStats ?? 1);
      }
    }
  }, [isEditMode, editTransaction]);



  // 账户选项
  const accounts = ["微信", "支付宝", "银行卡", "数字钱包", "现金"];

  // 模拟成员列表
  const members = [
    { id: 1, name: "我自己", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=me" },
    { id: 2, name: "Yunting", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=yunting" },
    { id: 3, name: "M", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=m" },
  ];

  // 预设分类（当数据库中没有分类时显示）
  const defaultCategories = [
    { id: 2, name: "购物", icon: "🛍️", color: "bg-[#D32F2F]-light0" },
  ];

  // 预设子分类（包括三级分类）
  const defaultSubCategories: Record<number, any[]> = {
    "2": [{ id: 25, name: "淘宝", icon: "🛍️", color: "bg-red-400", parentId: 2 }],
    "25": [
      { id: 251, name: "服饰", icon: "👔", color: "bg-[#D32F2F]", parentId: 25 },
      { id: 252, name: "数码", icon: "📱", color: "bg-[#D32F2F]", parentId: 25 },
      { id: 253, name: "食品", icon: "🍞", color: "bg-[#D32F2F]", parentId: 25 },
    ],
  };

  // 获取顶级分类（parentId = null）- 收入和支出共享同一套分类
  const { data: topCategories = [], isLoading: isLoadingTop } = trpc.ledger.getCategories.useQuery({
    ledgerId,
    parentId: null,
  }, {
    // 禁用缓存，每次都重新获取
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // 如果没有分类，使用预设分类
  const displayCategories = topCategories.length > 0 ? topCategories : defaultCategories;
  
  // 当真实分类加载完成后，更新选中状态（仅在非编辑模式下）
  useEffect(() => {
    if (!isEditMode && topCategories.length > 0) {
      // 优先使用 URL 中的 categoryId 参数（从详情页传入的当前选中标签）
      const urlCategoryId = urlParams.get('categoryId');
      if (urlCategoryId) {
        const catId = parseInt(urlCategoryId);
        const found = topCategories.find((c: any) => c.id === catId);
        if (found) {
          setSelectedCategoryPath([catId]);
          return;
        }
      }
      setSelectedCategoryPath([topCategories[0].id]);
    }
  }, [isEditMode, topCategories.length > 0 ? topCategories[0]?.id : null]);

  // 动态加载子分类 - 使用固定的3个查询(最多支持3级分类) - 收入和支出共享分类
  const level1Query = trpc.ledger.getCategories.useQuery(
    {
      ledgerId,
      parentId: selectedCategoryPath[0] || null,
    },
    { 
      enabled: selectedCategoryPath.length >= 1,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      staleTime: 0,
    }
  );

  const level2Query = trpc.ledger.getCategories.useQuery(
    {
      ledgerId,
      parentId: selectedCategoryPath[1] || null,
    },
    { 
      enabled: selectedCategoryPath.length >= 2,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      staleTime: 0,
    }
  );

  // 构建多级分类数据
  const categoryLevels: any[][] = (() => {
    const levels: any[][] = [displayCategories];
    
    // 添加一级子分类
    if (selectedCategoryPath.length >= 1) {
      const parentId = selectedCategoryPath[0];
      const subCategories = level1Query.data && level1Query.data.length > 0 
        ? level1Query.data 
        : defaultSubCategories[parentId.toString()] || [];
      if (subCategories.length > 0) {
        levels.push(subCategories);
      }
    }
    
    // 添加二级子分类
    if (selectedCategoryPath.length >= 2) {
      const parentId = selectedCategoryPath[1];
      const subCategories = level2Query.data && level2Query.data.length > 0
        ? level2Query.data
        : defaultSubCategories[parentId.toString()] || [];
      if (subCategories.length > 0) {
        levels.push(subCategories);
      }
    }
    
    return levels;
  })();

  // 处理分类选择
  const handleCategorySelect = (categoryId: number, level: number) => {
    // 如果点击的是已经选中的分类，则取消选中并收起下级分类
    if (selectedCategoryPath[level] === categoryId) {
      // 取消选中：移除当前层级及之后的所有选择
      const newPath = selectedCategoryPath.slice(0, level);
      setSelectedCategoryPath(newPath);
    } else {
      // 选中新分类：更新选中路径，保留到当前层级，移除后续层级
      const newPath = [...selectedCategoryPath.slice(0, level), categoryId];
      setSelectedCategoryPath(newPath);
    }
  };

  // 获取当前选中的分类名称（用于显示）
  const getSelectedCategoryName = () => {
    if (selectedCategoryPath.length === 0) return "";
    
    // 找到最后一级选中的分类
    const lastSelectedId = selectedCategoryPath[selectedCategoryPath.length - 1];
    const lastLevelCategories = categoryLevels[selectedCategoryPath.length];
    
    // 在上一级的分类列表中查找
    if (selectedCategoryPath.length > 0) {
      const prevLevelCategories = categoryLevels[selectedCategoryPath.length - 1];
      const category = prevLevelCategories.find(c => c.id === lastSelectedId);
      return category?.name || "";
    }
    
    return "";
  };


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

  // ===== A股非交易日判断（与 LedgerDetailAA 保持一致）=====
  const HOLIDAYS_2026: Record<string, string> = {
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
    '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节',
    '2026-02-18': '春节', '2026-02-19': '春节', '2026-02-20': '春节',
    '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
    '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
    '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节',
    '2026-10-07': '国庆节',
  };

  const isNonTradingDay = (date: Date): string | null => {
    // 只有 AA 型账本（A 股账本）才限制交易日
    if (!isCustomAA) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    // 法定节假日
    if (HOLIDAYS_2026[key]) return HOLIDAYS_2026[key];
    // 周六周日一律休市
    const dow = date.getDay();
    if (dow === 0) return '周日';
    if (dow === 6) return '周六';
    return null;
  };
  // ===================================================

  // 处理日期选择
  const handleDateSelect = (date: Date) => {
    // 非交易日不可选
    if (isNonTradingDay(date)) {
      const label = isNonTradingDay(date);
      toast.error(`${label}为A股休市日，无法录入数据`);
      return;
    }
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

  // 上一年
  const prevYear = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear() - 1, calendarMonth.getMonth()));
  };

  // 下一年
  const nextYear = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear() + 1, calendarMonth.getMonth()));
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
    setAmount((prevAmount) => {
      // 如果是小数点
      if (num === ".") {
        if (prevAmount.includes(".")) return prevAmount; // 已经有小数点
        return (!prevAmount || prevAmount === "0.00" || prevAmount === "") ? "0." : prevAmount + ".";
      }
      
      // 检查小数点后是否已有两位
      if (prevAmount.includes(".")) {
        const parts = prevAmount.split(".");
        if (parts[1] && parts[1].length >= 2) return prevAmount; // 限制小数点后两位
        return prevAmount + num;
      }
      
      // 如果当前是空字符串、0或0.00，替换为新数字
      if (!prevAmount || prevAmount === "0" || prevAmount === "0.00" || prevAmount === "") {
        return num;
      }
      
      // 否则追加数字
      return prevAmount + num;
    });
  };

  // 处理删除
  const handleDelete = () => {
    if (amount.length > 1) {
      const newAmount = amount.slice(0, -1);
      // 如果删除后为空或只剩下小数点，重置为空字符串
      if (newAmount === "" || newAmount === ".") {
        setAmount("");
      } else {
        setAmount(newAmount);
      }
    } else {
      setAmount("");
    }
  };

  // 添加记账mutation
  const addTransactionMutation = trpc.ledger.addTransaction.useMutation({
    onSuccess: () => {
      toast.success("记账成功！");
      // 使缓存失效，强制重新获取数据
      utils.ledger.getTransactions.invalidate({ ledgerId });
      setLocation(`/ledger/${id}`);
    },
    onError: (error) => {
      toast.error("记账失败：" + error.message);
    },
  });
  
  // 更新记账mutation
  const updateTransactionMutation = trpc.ledger.updateTransaction.useMutation({
    onSuccess: () => {
      toast.success("账目修改成功！");
      utils.ledger.getTransactions.invalidate({ ledgerId });
      if (editTransactionId) {
        utils.ledger.getTransactionDetail.invalidate({ ledgerId, transactionId: editTransactionId });
        utils.ledger.getRecordLogCount.invalidate({ recordId: editTransactionId, ledgerId });
      }
      utils.ledger.getById.invalidate({ ledgerId });
      setLocation(`/ledger/${id}`);
    },
    onError: (error) => {
      toast.error("修改失败：" + error.message);
    },
  });
  
  // 上传图片mutation
  const uploadImageMutation = trpc.ledger.uploadLedgerImage.useMutation();

  // 处理保存
  const handleSave = () => {
    if (selectedCategoryPath.length === 0) {
      toast.error("请选择分类");
      return;
    }
    // 允许零金额提交

    // 调用后端API保存记账
    // selectedAccounts是数组,取第一个元素(如果存在)
    const accountIdNum = selectedAccounts.length > 0 ? parseInt(selectedAccounts[0]) : NaN;
    // 格式化为 YYYY-MM-DD 格式，使用本地时间
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    const payload: any = {
      ledgerId,
      amount: parseFloat(amount) || 0,
      type: transactionType,
      categoryId: selectedCategoryPath[selectedCategoryPath.length - 1], // 使用最后一级分类ID
      transactionDate: formattedDate,
      description: note || undefined,
      images: uploadedImages.length > 0 ? uploadedImages : undefined, // 使用images数组
      reimbursementStatus, // 添加报销状态
      pendingType: pendingType || undefined, // 添加待结类型
      pendingIncludeStats: pendingType ? pendingIncludeStats : undefined, // 添加待结统计模式
    };
    
    // 只有当accountId是有效数字时才添加
    if (!isNaN(accountIdNum)) {
      payload.accountId = accountIdNum;
    }
    
    if (isEditMode && editTransactionId) {
      // 编辑模式：调用更新API
      updateTransactionMutation.mutate({
        recordId: editTransactionId,
        ...payload,
      });
    } else {
      // 新增模式：调用添加API
      addTransactionMutation.mutate(payload);
    }
  };

  const calendarDays = getCalendarDays();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  // 主题颜色数组
  const themeColors = ["bg-[#D32F2F]", "bg-[#CBA471]", "bg-[#4CAF50]", "bg-[#1976D2]"];

  return (
    <div className="h-screen flex flex-col bg-[#FAF3ED]">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white p-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => setLocation(`/ledger/${id}`)}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold">{isEditMode ? "修改账目" : "添加账目"}</h1>
        <div className="w-5" /> {/* 占位 */}
      </div>

      {/* 类型标签页 - 独立白色容器，custom_aa 账本不显示 */}
      {!isCustomAA && <div className="px-4 py-3 flex-shrink-0">
        <div className="bg-white rounded-lg flex overflow-hidden shadow-sm">
          <button
            className={`flex-1 py-2 text-sm text-center transition-colors ${
              transactionType === "expense"
                ? "bg-[#D32F2F] text-white font-semibold"
                : "text-[#757575] bg-white"
            }`}
            onClick={() => setTransactionType("expense")}
          >
            支出
          </button>
          <button
            className={`flex-1 py-2 text-sm text-center transition-colors ${
              transactionType === "income"
                ? "bg-[#D32F2F] text-white font-semibold"
                : "text-[#757575] bg-white"
            }`}
            onClick={() => setTransactionType("income")}
          >
            收入
          </button>
        </div>
      </div>}

      {/* 金额输入 */}
      <div className="bg-white py-3 px-4 flex-shrink-0">
        <div className="inline-flex items-end w-full">
          <input
            type="text"
            inputMode="decimal"
            value={amount || ""}
            placeholder="0.00"
            onChange={(e) => {
              const val = e.target.value;
              // 只允许数字和小数点
              if (/^\d*\.?\d{0,2}$/.test(val) || val === "") {
                setAmount(val);
              }
            }}
            className="text-5xl font-light text-[#222222] bg-transparent border-none outline-none w-0 flex-1 placeholder-gray-300"
            style={{ caretColor: '#D32F2F' }}
            autoComplete="off"
          />
          <div className="text-sm font-medium text-gray-400 mb-1 ml-1 flex-shrink-0">
            {(() => {
              const currencyMap: Record<string, string> = {
                CNY: "元",
                USD: "USD",
                JPY: "JPY",
                EUR: "EUR",
                HKD: "HKD",
                GBP: "GBP",
                USDT: "USDT",
              };
              const currency = (ledger as any)?.currency || "CNY";
              return currencyMap[currency] || currency;
            })()}
          </div>
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {/* 多级分类选择 - custom_aa 只显示自定义分类（过滤默认购物等） */}
        <div className="bg-white mt-1">
          {/* 一级分类标题 */}
          <div className="bg-[#FAF3ED] px-3 py-2 text-xs text-gray-500">选择分类</div>
          
          {/* 渲染每一级分类 - 每级单独一行 */}
          {categoryLevels.map((cats, level) => {
            // custom_aa 账本第一级过滤掉默认分类（isDefault=true 或 id<=10 的预设）
            const filteredCats = (isCustomAA && level === 0)
              ? cats.filter((c: any) => !c.isDefault && c.id > 10)
              : cats;
            if (filteredCats.length === 0) return null;
            // custom_aa 账本不显示二级及以下分类
            if (isCustomAA && level > 0) return null;
            
            return (
              <div key={level} className="border-t border-gray-100">
                <div className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {filteredCats.map((category: any, index: number) => {
                      const isSelected = selectedCategoryPath[level] === category.id;
                      const colorClass = themeColors[index % themeColors.length];
                      
                      return (
                        <button
                          key={category.id}
                          className={`px-3 py-1.5 rounded text-xs transition-colors ${
                            isSelected
                              ? `${colorClass} text-white font-medium`
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          onClick={() => handleCategorySelect(category.id, level)}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                    
                    {/* 只在第一级显示"+"按鈕，custom_aa 的 owner/admin 也可以添加 */}
                    {level === 0 && canManageCategories && (
                      <button
                        className="px-3 py-1.5 rounded text-xs bg-white border border-dashed border-[#D32F2F] text-[#D32F2F] flex items-center gap-1 hover:bg-[#D32F2F]-light"
                        onClick={() => setLocation(`/ledger/${id}/categories`)}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {isLoadingTop && (
            <div className="text-xs text-gray-400 p-3">加载分类中...</div>
          )}

        </div>



        {/* 账户选择 - custom_aa 不显示 */}
        {!isCustomAA && <div className="bg-white mt-1">
          <div className="bg-[#FAF3ED] px-3 py-2 text-xs text-gray-500">
            {transactionType === "expense" ? "付款方式" : "收款方式"}
          </div>
          <div className="p-3">
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((account) => (
              <button
                key={account}
                className={`px-3 py-1.5 rounded text-xs ${
                  selectedAccounts.includes(account)
                    ? "bg-[#D32F2F] text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
                onClick={() => {
                  if (selectedAccounts.includes(account)) {
                    // 取消选中
                    setSelectedAccounts(selectedAccounts.filter(a => a !== account));
                  } else {
                    // 添加选中
                    setSelectedAccounts([...selectedAccounts, account]);
                  }
                }}
              >
                {account}
              </button>
            ))}
          </div>
          </div>
        </div>}

        {/* 报销状态选择 - 根据功能开关显示 */}
        {ledger?.enableReimbursement === 1 && (
          <div className="bg-white mt-1">
            <div className="bg-[#FAF3ED] px-3 py-2 text-xs text-gray-500">
              报销状态
            </div>
            <div className="p-3">
              <button
                className={`px-3 py-1.5 rounded text-xs ${
                  reimbursementStatus === 'pending'
                    ? "bg-[#1976D2] text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
                onClick={() => setReimbursementStatus(reimbursementStatus === 'pending' ? 'none' : 'pending')}
              >
                申请报销
              </button>
            </div>
          </div>
        )}

        {/* 待结功能 - 根据功能开关显示 */}
        {ledger?.enablePending === 1 && (
          <div className="bg-white mt-1">
            <div className="bg-[#FAF3ED] px-3 py-2 text-xs text-gray-500">
              待结状态
            </div>
            <div className="p-3 flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1.5 rounded text-xs ${
                    pendingType === 'receivable'
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                  onClick={() => {
                    setPendingType(pendingType === 'receivable' ? null : 'receivable');
                    if (pendingType === 'receivable') setPendingIncludeStats(1);
                  }}
                >
                  代收
                </button>
                <button
                  className={`px-3 py-1.5 rounded text-xs ${
                    pendingType === 'payable'
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                  onClick={() => {
                    setPendingType(pendingType === 'payable' ? null : 'payable');
                    if (pendingType === 'payable') setPendingIncludeStats(1);
                  }}
                >
                  代付
                </button>
              </div>
              {/* 子选项：仅当选择了代收或代付时显示 */}
              {pendingType && (
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-1.5 rounded text-xs border ${
                      pendingIncludeStats === 0
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setPendingIncludeStats(0)}
                  >
                    仅显示不计入
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded text-xs border ${
                      pendingIncludeStats === 1
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setPendingIncludeStats(1)}
                  >
                    显示并计入
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 备注输入 - custom_aa 不显示 */}
        {!isCustomAA && <div className="bg-white mt-1 flex items-stretch">
          <input
            type="text"
            placeholder="备注"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 px-3 py-3 border-none outline-none text-sm text-gray-700"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = e.target.files;
              if (files) {
                // 只支持上传1张图片
                const file = files[0];
                if (!file) return;
                
                try {
                  // 显示加载提示
                  toast.loading('正在上传图片...');
                  
                  // 自动压缩图片
                  const { base64 } = await autoCompressImage(file, 'normal');
                  
                  // 上传到COS
                  const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
                  
                  if (result.success && result.imageUrl) {
                    setUploadedImages([result.imageUrl]); // 只保存一张
                    toast.dismiss();
                    toast.success('图片上传成功！');
                  }
                } catch (error) {
                  toast.dismiss();
                  console.error('图片上传失败:', error);
                  toast.error('图片上传失败，请重试');
                }
              }
            }}
          />
          {!isCustomAA && <button 
            className="px-6 bg-[#D32F2F] text-white flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-sm font-medium">传图</span>
          </button>}
        </div>}

        {/* 图片预览区域 */}
        {uploadedImages.length > 0 && (
          <div className="bg-white mt-1 p-3">
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((image, index) => (
                <div key={index} className="relative w-20 h-20">
                  <img
                    src={image}
                    alt={`上传图片${index + 1}`}
                    className="w-full h-full object-cover rounded"
                  />
                  <button
                    className="absolute -top-2 -right-2 w-5 h-5 bg-[#D32F2F]-light0 text-white rounded-full flex items-center justify-center text-xs"
                    onClick={() => {
                      setUploadedImages(prev => prev.filter((_, i) => i !== index));
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部工具栏 */}
        <div className="bg-white mt-1 p-3 mb-2">
          <div className="flex items-center justify-between text-xs">
            {!isCustomAA && <button className="flex items-center gap-1 text-[#757575]">
              <Link2 className="w-3.5 h-3.5" />
              <span>关联账户</span>
            </button>}
            <button 
              className="flex items-center gap-1 text-[#757575]"
              onClick={() => setIsDateSheetOpen(true)}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{selectedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </button>
            {!isCustomAA && <button 
              className="flex items-center gap-1 text-[#757575]"
              onClick={() => setIsPayerSheetOpen(true)}
            >
              <User className="w-3.5 h-3.5" />
              <span>{payer}</span>
            </button>}
          </div>
        </div>
      </div>

      {/* 重复账目警告提示 - 占满空白区域 */}
      {duplicateWarnings.length > 0 && (
        <div className="flex-1 flex flex-col justify-center px-4 py-3 bg-white">
          {duplicateWarnings.map((w, idx) => (
            <div
              key={idx}
              className="animate-warn-flash flex-1 flex flex-col items-center justify-center gap-3 px-5 py-5 border-2 border-[#FFCDD2] rounded-2xl cursor-pointer"
              style={{ minHeight: 120 }}
              onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${w.id}`)}
            >
              {/* 闪动图标 */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#FFEBEE]">
                <AlertTriangle className="animate-icon-pulse w-7 h-7 text-[#D32F2F]" />
              </div>
              {/* 主文字 */}
              <div className="text-center">
                <p className="text-sm font-bold text-[#D32F2F] leading-snug">{w.text}</p>
                <p className="text-xs text-[#B71C1C] mt-1.5 font-medium">点击查看该账目</p>
              </div>
              {/* 底部提示 */}
              <p className="text-[11px] text-[#E57373] border border-[#FFCDD2] rounded-full px-3 py-1">仍可继续点下方「保存」按鈕</p>
            </div>
          ))}
        </div>
      )}

      {/* 底部保存按鈕 */}
      <div className="flex-shrink-0 p-3 bg-white border-t">
        <button
          className="w-full bg-[#D32F2F] text-white py-3 rounded-lg text-base font-semibold active:bg-[#B71C1C]"
          onClick={handleSave}
        >
          保存
        </button>
      </div>

      {/* 日期选择抽屉 */}
      <Sheet open={isDateSheetOpen} onOpenChange={setIsDateSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[90vh] overflow-y-auto">
          <div className="p-4 max-w-lg mx-auto">
            {/* 日期导航 */}
            <div className="flex items-center mb-3 relative">
              {/* 外层箭头 - 控制年份 */}
              <button onClick={prevYear} className="p-1.5">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
              
              {/* 内层箭头 - 控制月份 */}
              <button onClick={prevMonth} className="p-1.5">
                <ChevronLeft className="w-5 h-5 text-[#D32F2F]" />
              </button>
              
              {/* 年月显示 */}
              <div className="text-base font-medium mx-3">
                {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
              </div>
              
              {/* 内层箭头 - 控制月份 */}
              <button onClick={nextMonth} className="p-1.5">
                <ChevronRight className="w-5 h-5 text-[#D32F2F]" />
              </button>
              
              {/* 外层箭头 - 控制年份 */}
              <button onClick={nextYear} className="p-1.5">
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
              
              {/* 今天按钮 */}
              <button
                onClick={goToToday}
                className="ml-auto px-3 py-1 text-sm text-[#D32F2F] border-2 border-[#D32F2F] rounded-full"
              >
                今天
              </button>
            </div>

            {/* 星期标题 */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs text-[#D32F2F] py-0.5">
                  {day}
                </div>
              ))}
            </div>

            {/* 日期网格 - 使用固定高度而非 aspect-square，确保电脑端完整显示 */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);
                const nonTradingLabel = isCurrentMonth ? isNonTradingDay(day) : null;

                return (
                  <button
                    key={index}
                    onClick={() => handleDateSelect(day)}
                    disabled={!!nonTradingLabel}
                    className={`
                      h-9 sm:h-10 flex flex-col items-center justify-center text-sm rounded
                      ${!isCurrentMonth ? "text-gray-300" : ""}
                      ${nonTradingLabel ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}
                      ${isSelected && !nonTradingLabel ? "bg-[#D32F2F] text-white font-semibold" : ""}
                      ${isTodayDate && !isSelected && !nonTradingLabel ? "border border-[#D32F2F]" : ""}
                      ${isCurrentMonth && !isSelected && !nonTradingLabel ? "hover:bg-gray-100 text-[#222222]" : ""}
                    `}
                  >
                    <span className="leading-none">{day.getDate()}</span>
                    {nonTradingLabel && (
                      <span className="text-[9px] leading-none mt-0.5 text-gray-400">{nonTradingLabel}</span>
                    )}
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
                return `您选择的 ${year}-${month}-${day}, ${yearText}不是今天呀，确定吗？`;
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
                className="text-[#D32F2F] text-sm"
              >
                完成
              </button>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            {members.map((member) => (
              <button
                key={member.id}
                className="w-full flex items-center justify-between p-2 hover:bg-[#FAF3ED] rounded"
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
                  <CheckCircle2 className="w-4 h-4 text-[#4CAF50]" />
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
