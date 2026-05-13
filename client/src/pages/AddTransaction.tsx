import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useParams, useSearch } from "wouter";
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
import { EXPENSE_CATEGORIES, getDefaultExpenseConfig } from "@/pages/AJCompanyManager";
import { useAuth } from "@/_core/hooks/useAuth";
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
  // 使用 wouter 的 useSearch 确保 SPA 路由下能正确读取 URL 参数
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const editId = urlParams.get('edit');
  const fromPage = urlParams.get('from'); // 来源页面：home=首页智能会计
  const isEditMode = !!editId;
  const editTransactionId = editId ? parseInt(editId) : undefined;
  // 视角切换：管理员切换为业务员视角时，从 URL参数或sessionStorage获取 viewAs 参数
  // 使用useState初始化一次，避免sessionStorage清除后重新渲染时丢失
  const [viewAsUserId] = useState<number | null>(() => {
    const fromUrl = urlParams.get('viewAs') ? Number(urlParams.get('viewAs')) : null;
    const fromSession = sessionStorage.getItem('aj_view_as_user_id') ? Number(sessionStorage.getItem('aj_view_as_user_id')) : null;
    const result = fromUrl || fromSession;
    // 读取后立即清除sessionStorage，避免干扰其他页面
    if (fromSession) sessionStorage.removeItem('aj_view_as_user_id');
    return result;
  });
  
  // 获取账本信息（用于获取功能开关）
  const { data: ledger } = trpc.ledger.getLedger.useQuery({ id: ledgerId });
  const isCustomAA = (ledger as any)?.type === 'custom_aa';
  const isCustomAJ = (ledger as any)?.type === 'custom_aj';
  const userRole = (ledger as any)?.userRole;
  const { user: currentUser } = useAuth();
  // 获取视角用户信息（切换视角时显示业务员姓名）
  const { data: viewAsUserInfo } = trpc.ledger.ajGetViewAsUserInfo.useQuery(
    { ledgerId, viewAsUserId: viewAsUserId! },
    { enabled: isCustomAJ && !!viewAsUserId }
  );
  const applicantName = viewAsUserId && viewAsUserInfo
    ? viewAsUserInfo.name
    : ((currentUser as any)?.name || (currentUser as any)?.username || '—');
  const canManageCategories = !isCustomAA || userRole === 'owner' || userRole === 'admin';
  
  // AJ账本：获取业务员有权限的企业列表（切换视角时传入viewAsUserId）
  const { data: ajCompanies } = trpc.ledger.ajGetMyCompanies.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAJ }
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  // AJ账本：获取当前选中企业的报销类型配置
  const { data: companyExpenseConfig } = trpc.ledger.ajGetCompanyExpenseTypes.useQuery(
    { ledgerId, companyId: selectedCompanyId! },
    { enabled: isCustomAJ && !!selectedCompanyId }
  );
  const effectiveExpenseConfig = (companyExpenseConfig as any) ?? getDefaultExpenseConfig();
  const selectedCompany = (ajCompanies as any[])?.find((c: any) => c.id === selectedCompanyId);
  // 当企业列表加载完成且只有1个时，自动选中该企业
  useEffect(() => {
    if (isCustomAJ && ajCompanies && (ajCompanies as any[]).length === 1 && selectedCompanyId === null) {
      setSelectedCompanyId((ajCompanies as any[])[0].id);
    }
  }, [isCustomAJ, ajCompanies]);
  const hasMultipleCompanies = isCustomAJ && (ajCompanies as any[])?.length > 1;
  
  // 获取要编辑的账目详情
  const { data: editTransaction } = trpc.ledger.getTransactionDetail.useQuery(
    { ledgerId, transactionId: editTransactionId! },
    { enabled: isEditMode && !!editTransactionId }
  );

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");

  // 根据金额自动匹配报销事由（只读，无需用户选择）
  const autoExpenseReason = (() => {
    const num = parseFloat(amount) || 0;
    const pool: [string, string][] = num <= 50
      ? [
          ['交通费', '市内打车/公交/地铁'],
          ['办公费', '办公用品'],
          ['交通费', '停车费'],
          ['办公费', '快递邮寄'],
        ]
      : num <= 200
      ? [
          ['业务招待费', '餐饮宴请'],
          ['交通费', '加油费'],
          ['办公费', '文件打印复印'],
          ['通讯费', '手机话费'],
          ['业务招待费', '茶水饮品'],
        ]
      : num <= 500
      ? [
          ['差旅费', '住宿费'],
          ['业务招待费', '商务活动接待'],
          ['通讯费', '网络宽带'],
          ['办公费', '设备耗材'],
          ['员工福利费', '团建活动'],
        ]
      : num <= 2000
      ? [
          ['差旅费', '高铁/动车'],
          ['差旅费', '机票'],
          ['会议费', '会议场地租金'],
          ['广告宣传费', '宣传物料'],
          ['培训教育费', '外部培训'],
        ]
      : [
          ['差旅费', '机票'],
          ['租赁费', '办公场地租金'],
          ['维修维护费', '办公设备维修'],
          ['培训教育费', '外部培训'],
          ['广告宣传费', '广告投放'],
        ];
    if (num <= 0) return '';
    const idx = Math.floor(num) % pool.length;
    const [cat, item] = pool[idx];
    return `${cat} · ${item}`;
  })();
  const expenseReasonLabel = autoExpenseReason;

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
    
    // 管理员以业务员视角提交时，传入viewAsUserId确保记录属于该业务员
    if (viewAsUserId) {
      payload.viewAsUserId = viewAsUserId;
    }
    // AJ账本：必须至少上传一张图片
    if (isCustomAJ && uploadedImages.length === 0) {
      toast.error("请至少上传一张开票凭证图片");
      return;
    }
    // AJ账本：传递开票企业信息，提交后自动设为「申请中」状态
    // AJ账本：报销事由写入description
    if (isCustomAJ && expenseReasonLabel) {
      payload.description = expenseReasonLabel;
    }
    if (isCustomAJ && selectedCompanyId) {
      payload.ajCompanyId = selectedCompanyId;
      payload.ajCompanyName = selectedCompany?.name || undefined;
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
  const weekDays = ["一", "二", "三", "四", "五", "六", "日"]; // 从周一开始，与日历数据对齐

  // 主题颜色数组
  const themeColors = ["bg-[#D32F2F]", "bg-[#CBA471]", "bg-[#4CAF50]", "bg-[#1976D2]"];

  return (
    <div className={`h-screen flex flex-col ${isCustomAJ ? 'bg-[#F4F6F9]' : 'bg-[#FAF3ED]'}`}>
      {/* 顶部导航 */}
      <div className={`${isCustomAJ ? 'bg-[#1A2B4A]' : 'bg-[#D32F2F]'} text-white p-3 flex items-center justify-between flex-shrink-0`}>
        <button onClick={() => setLocation(fromPage === 'home' ? '/' : `/ledger/${id}`)}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold">{isCustomAJ ? (isEditMode ? "修改报销申请" : "报销申请单") : (isEditMode ? "修改账目" : "添加账目")}</h1>
        <div className="w-5" /> {/* 占位 */}
      </div>

      {/* 类型标签页 - 独立白色容器，custom_aa/custom_aj 账本不显示 */}
      {!isCustomAA && !isCustomAJ && <div className="px-4 py-3 flex-shrink-0">
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

      {/* custom_aj 账本：报销申请单风格 */}
      {isCustomAJ ? (
        <div className="flex-1 overflow-y-auto bg-[#F5F5F5]">
          {/* 单据头 */}
          <div className="bg-[#1A2B4A] px-4 pt-2 pb-5 flex items-center justify-between">
            <div>
              <div className="text-white text-xs opacity-80">申请人</div>
              <div className="text-white text-sm font-semibold mt-0.5">{applicantName}</div>
            </div>
            <div className="text-right">
              <div className="text-white text-xs opacity-80">申请日期</div>
              <div className="text-white text-sm font-semibold mt-0.5">
                {selectedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
              </div>
            </div>
          </div>
          {/* 表单卡片 */}
          <div className="mx-3 -mt-3 rounded-2xl bg-white overflow-hidden shadow-md" style={{ border: '1px solid #E2E8F0' }}>
            {/* 报销金额 */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #F5F5F5' }}>
              <div className="text-xs text-gray-400 mb-1 font-medium tracking-wider">报销金额（元）</div>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-light text-gray-400">¥</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount || ""}
                  placeholder="0.00"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d{0,2}$/.test(val) || val === "") {
                      setAmount(val);
                    }
                  }}
                  className="text-4xl font-light text-[#1A2B4A] bg-transparent border-none outline-none flex-1 placeholder-gray-200"
                  style={{ caretColor: '#1A2B4A' }}
                  autoComplete="off"
                />
              </div>
            </div>
            {/* 开票信息区域 */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #F5F5F5' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400 font-medium tracking-wider">开票信息</span>
                {hasMultipleCompanies && (
                  <button className="flex items-center gap-1 text-xs text-[#1A2B4A]" onClick={() => setShowCompanyPicker(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    <span>{selectedCompany ? '更换' : '选择企业'}</span>
                  </button>
                )}
              </div>
              {selectedCompany ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-bold text-gray-800 flex-1 leading-snug">{selectedCompany.name}</span>
                    <button className="flex-shrink-0 p-1.5 rounded-full bg-gray-100 text-gray-500 active:bg-gray-200" onClick={() => { navigator.clipboard.writeText(selectedCompany.name); toast.success('已复制企业名称'); }} title="复制企业名称">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </div>
                  {selectedCompany.taxNo && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base text-gray-600 flex-1">{selectedCompany.taxNo}</span>
                      <button className="flex-shrink-0 p-1.5 rounded-full bg-gray-100 text-gray-500 active:bg-gray-200" onClick={() => { navigator.clipboard.writeText(selectedCompany.taxNo); toast.success('已复制税号'); }} title="复制税号">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-300">请选择企业</div>
              )}
            </div>
            {/* 发票附件 */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #F5F5F5' }}>
              <div className="text-xs text-gray-400 mb-3 font-medium tracking-wider">发票凭证</div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                const MAX_IMAGES = 10;
                const remaining = MAX_IMAGES - uploadedImages.length;
                if (remaining <= 0) { toast.error('最多只能上传10张图片'); e.target.value = ''; return; }
                const filesToProcess = Array.from(files).slice(0, remaining);
                toast.loading('上传中...', { id: 'upload' });
                try {
                  const uploadedUrls: string[] = [];
                  for (const file of filesToProcess) {
                    const { base64 } = await autoCompressImage(file, 'normal');
                    const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
                    if (result.success && result.imageUrl) uploadedUrls.push(result.imageUrl);
                  }
                  if (uploadedUrls.length > 0) { setUploadedImages(prev => [...prev, ...uploadedUrls]); toast.success(`成功上传 ${uploadedUrls.length} 张图片`, { id: 'upload' }); }
                  else toast.dismiss('upload');
                } catch (error) { console.error('图片上传失败:', error); toast.error('图片上传失败，请重试', { id: 'upload' }); }
                e.target.value = '';
              }} />
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative w-20 h-20 flex-shrink-0">
                    <img src={image} alt={`发票${index + 1}`} className="w-full h-full object-cover rounded" />
                    <button className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#1A2B4A] text-white rounded-full flex items-center justify-center shadow" onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== index))}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length < 10 && (
                  <button className="w-20 h-20 flex-shrink-0 flex flex-col items-center justify-center gap-1 bg-[#F4F6F9] border border-[#C9A84C40] rounded text-[#1A2B4A]" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">{uploadedImages.length > 0 ? `${uploadedImages.length}/10` : '上传'}</span>
                  </button>
                )}
                {uploadedImages.length === 0 && (
                  <div className="flex items-center text-xs text-red-400 gap-1"><span>未上传（必填）</span></div>
                )}
              </div>
            </div>
          </div>

          {/* ===== 下方：费用报销明细单预览（紧凑小样） ===== */}
          <div className="mx-3 mt-3 mb-3 bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 8px rgba(26,43,74,0.08)', border: '1px solid #E2E8F0' }}>

            {/* 顶部色条 */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #1A2B4A 0%, #C9A84C 100%)' }} />

            {/* 标题 */}
            <div className="py-2 text-center" style={{ background: '#1A3A5C', borderBottom: '1.5px solid #C9A84C' }}>
              <div className="text-[12px] font-bold text-white tracking-[0.15em]">费 用 报 销 明 细 单</div>
            </div>

            {/* 编制单位 + 填报日期 + 单位 */}
            <div className="px-2 py-1 flex items-center justify-between text-[9px] text-gray-500" style={{ borderBottom: '1px solid #E0E0E0', background: '#FAFAFA' }}>
              <span>编制单位：<span className="text-gray-700">{selectedCompany?.name || '—'}</span></span>
              <span>填报日期：{selectedDate.getFullYear()}年 {String(selectedDate.getMonth()+1).padStart(2,'0')}月 {String(selectedDate.getDate()).padStart(2,'0')}日</span>
              <span>单位：元</span>
            </div>

            {/* 明细表格 - 用 table 确保列宽完全对齐 */}
            <table className="w-full text-[10px] border-collapse" style={{ borderBottom: '2px solid #1A3A5C' }}>
              <colgroup>
                <col style={{ width: '2em' }} />
                <col style={{ width: '4em' }} />
                <col style={{ width: '4em' }} />
                <col />
                <col style={{ width: '1%', whiteSpace: 'nowrap' }} />
                <col style={{ width: '1%', whiteSpace: 'nowrap' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#1A3A5C', borderBottom: '1px solid #C9A84C' }}>
                  <th className="px-0.5 py-1 text-center font-bold text-white border-r border-white/20">序号</th>
                  <th className="px-0.5 py-1 text-center font-bold text-white border-r border-white/20">日期</th>
                  <th className="px-0.5 py-1 text-center font-bold text-white border-r border-white/20">费用名称</th>
                  <th className="px-0.5 py-1 text-center font-bold text-white border-r border-white/20">事项</th>
                  <th className="px-1 py-1 text-center font-bold text-white border-r border-white/20 whitespace-nowrap">金额</th>
                  <th className="px-1 py-1 text-center font-bold text-white whitespace-nowrap">附件</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#fff' }}>
                  <td className="px-0.5 py-2 text-center border-r border-gray-200">1</td>
                  <td className="px-0.5 py-2 text-center border-r border-gray-200">{String(selectedDate.getMonth()+1).padStart(2,'0')}/{String(selectedDate.getDate()).padStart(2,'0')}</td>
                  <td className="px-0.5 py-2 text-center border-r border-gray-200 font-semibold text-[#1A3A5C]">{expenseReasonLabel ? expenseReasonLabel.split(' · ')[0] : '其他'}</td>
                  <td className="px-1 py-2 border-r border-gray-200 text-gray-500 text-[9px]">{expenseReasonLabel ? (expenseReasonLabel.split(' · ')[1] || '—') : '—'}</td>
                  <td className="px-1 py-2 text-right border-r border-gray-200 font-bold text-[#1A3A5C] whitespace-nowrap">¥{parseFloat(amount || '0').toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-1 py-2 text-center whitespace-nowrap">{uploadedImages.length > 0 ? uploadedImages.length : '—'}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: '#EEF2F7' }}>
                  <td colSpan={2} className="px-1.5 py-1.5 font-bold border-r border-gray-300">合计金额（大写）</td>
                  <td colSpan={2} className="px-1.5 py-1.5 font-bold text-[#1A3A5C] border-r border-gray-300">
                    {(() => {
                      const num = parseFloat(amount) || 0;
                      if (num <= 0) return '—';
                      const units = ['', '拾', '佰', '仟', '万', '拾万', '佰万', '仟万', '亿'];
                      const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
                      const intPart = Math.floor(num);
                      const decPart = Math.round((num - intPart) * 100);
                      let result = '';
                      const intStr = intPart.toString();
                      for (let i = 0; i < intStr.length; i++) {
                        const d = parseInt(intStr[i]);
                        const u = units[intStr.length - 1 - i];
                        if (d === 0) { if (result && result[result.length-1] !== '零') result += '零'; }
                        else result += digits[d] + u;
                      }
                      result = result.replace(/零+$/, '');
                      if (decPart === 0) result += '元整';
                      else if (decPart % 10 === 0) result += '元' + digits[Math.floor(decPart/10)] + '角';
                      else result += '元' + digits[Math.floor(decPart/10)] + '角' + digits[decPart%10] + '分';
                      return result;
                    })()}
                  </td>
                  <td className="px-1 py-1.5 text-right font-bold text-[#1A3A5C] border-r border-gray-300 whitespace-nowrap">¥{parseFloat(amount || '0').toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-1 py-1.5 text-center whitespace-nowrap">{uploadedImages.length > 0 ? uploadedImages.length : '—'}</td>
                </tr>
              </tfoot>
            </table>

            {/* 审批栏：仅报销人 + 经手人 */}
            <div className="grid text-[10px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="px-2 py-2 border-r border-gray-200">
                <span className="text-gray-400">报销人：</span>
                <span className="font-semibold text-[#1A2B4A] ml-0.5">{applicantName}</span>
              </div>
              <div className="px-2 py-2">
                <span className="text-gray-400">经手人：</span>
                <span className="font-semibold text-[#1A2B4A] ml-0.5">
                  {selectedCompany ? (() => {
                    const surnames = ['王','李','张','刘','陈','杨','赵','黄','周','吴'];
                    const names = ['建国','志远','明华','秀英','桂芳','国强','文静','晓燕','海涛','俊杰'];
                    const seed = (selectedCompany.name.charCodeAt(0) + selectedCompany.name.charCodeAt(selectedCompany.name.length-1)) % 10;
                    return surnames[seed] + names[(seed * 3 + 1) % 10];
                  })() : '—'}
                </span>
              </div>
            </div>

            {/* 底部色条 */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #C9A84C 0%, #1A2B4A 100%)' }} />

          </div>

          {/* 重复账目警告 */}
          {duplicateWarnings.length > 0 && (
            <div className="mx-3 mt-3">
              {duplicateWarnings.map((w, idx) => (
                <div
                  key={idx}
                  className="animate-warn-flash flex items-center gap-3 px-4 py-3 border-2 border-[#C9A84C40] rounded-2xl cursor-pointer bg-white"
                  onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${w.id}`)}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[#EEF2F8]">
                    <AlertTriangle className="animate-icon-pulse w-5 h-5 text-[#1A2B4A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1A2B4A] leading-snug">{w.text}</p>
                    <p className="text-[11px] text-[#E57373] mt-0.5">点此查看，仍可继续提交</p>
                  </div>
                  <div className="flex-shrink-0 text-[#E57373] text-lg font-light">›</div>
                </div>
              ))}
            </div>
          )}
          <div className="h-6" />
        </div>
      ) : isCustomAA ? (
        <div className="flex-1 overflow-y-auto flex flex-col bg-[#F4F6F9]">
          <div className="bg-white mx-3 mt-3 rounded-2xl overflow-hidden flex-shrink-0" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #F0E8E0' }}>

            {/* 金额输入区 */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #F5F5F5' }}>
              <div className="text-xs text-gray-400 mb-2 font-medium tracking-widest uppercase">金额</div>
              <div className="inline-flex items-end w-full">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount || ""}
                  placeholder="0.00"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d{0,2}$/.test(val) || val === "") {
                      setAmount(val);
                    }
                  }}
                  className="text-5xl font-light text-[#222222] bg-transparent border-none outline-none w-0 flex-1 placeholder-gray-200"
                  style={{ caretColor: '#1A2B4A' }}
                  autoComplete="off"
                />
                <div className="text-base font-medium text-gray-400 mb-1.5 ml-2 flex-shrink-0">
                  {(() => {
                    const currencyMap: Record<string, string> = { CNY: "元", USD: "USD", JPY: "JPY", EUR: "EUR", HKD: "HKD", GBP: "GBP", USDT: "USDT" };
                    const currency = (ledger as any)?.currency || "CNY";
                    return currencyMap[currency] || currency;
                  })()}
                </div>
              </div>
            </div>

            {/* 分类选择区 */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #F5F5F5' }}>
              <div className="text-xs text-gray-400 mb-3 font-medium tracking-widest uppercase">分类</div>
              {categoryLevels.map((cats, level) => {
                const filteredCats = (isCustomAA && level === 0)
                  ? cats.filter((c: any) => !c.isDefault && c.id > 10)
                  : cats;
                if (filteredCats.length === 0) return null;
                if (isCustomAA && level > 0) return null;
                return (
                  <div key={level} className="flex flex-wrap gap-2.5">
                    {filteredCats.map((category: any, index: number) => {
                      const isSelected = selectedCategoryPath[level] === category.id;
                      const colorClass = themeColors[index % themeColors.length];
                      return (
                        <button
                          key={category.id}
                          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            isSelected
                              ? `${colorClass} text-white shadow-sm scale-105`
                              : "bg-gray-100 text-gray-600"
                          }`}
                          style={{ minWidth: '56px' }}
                          onClick={() => handleCategorySelect(category.id, level)}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                    {level === 0 && canManageCategories && (
                      <button
                        className="px-4 py-2.5 rounded-xl text-sm bg-white border border-dashed border-[#1A2B4A] text-[#1A2B4A] flex items-center gap-1"
                        onClick={() => setLocation(`/ledger/${id}/categories`)}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {isLoadingTop && <div className="text-xs text-gray-400 mt-2">加载分类中...</div>}
            </div>

            {/* 日期选择区 */}
            <button
              className="w-full px-5 py-4 flex items-center justify-between active:bg-gray-50 transition-colors"
              onClick={() => setIsDateSheetOpen(true)}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-[#1A2B4A]" />
                <span className="text-sm font-medium text-gray-500">日期</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-semibold text-[#222222]">
                  {selectedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          </div>

          {/* 重复账目警告 */}
          {duplicateWarnings.length > 0 && (
            <div className="mx-3 mt-3">
              {duplicateWarnings.map((w, idx) => (
                <div
                  key={idx}
                  className="animate-warn-flash flex items-center gap-3 px-4 py-3 border-2 border-[#C9A84C40] rounded-2xl cursor-pointer bg-white"
                  onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${w.id}`)}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[#EEF2F8]">
                    <AlertTriangle className="animate-icon-pulse w-5 h-5 text-[#1A2B4A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1A2B4A] leading-snug">{w.text}</p>
                    <p className="text-[11px] text-[#E57373] mt-0.5">点此查看该账目，仍可继续保存</p>
                  </div>
                  <div className="flex-shrink-0 text-[#E57373] text-lg font-light">›</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1" />
        </div>
      ) : (
      <>
      {/* 非custom_aa/custom_aj：原有金额输入 */}
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

      {/* 可滚动内容区域（非custom_aa） */}
      <div className="flex-1 overflow-y-auto">
        {/* 多级分类选择 */}
        <div className="bg-white mt-1">
          {/* 一级分类标题 */}
          <div className="bg-[#FFF5F5] px-3 py-2 text-xs text-gray-500">选择分类</div>
          
          {/* 渲染每一级分类 - 每级单独一行 */}
          {categoryLevels.map((cats, level) => {
            const filteredCats = (isCustomAA && level === 0)
              ? cats.filter((c: any) => !c.isDefault && c.id > 10)
              : cats;
            if (filteredCats.length === 0) return null;
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
                    
                    {level === 0 && canManageCategories && (
                      <button
                        className="px-3 py-1.5 rounded text-xs bg-white border border-dashed border-[#D32F2F] text-[#D32F2F] flex items-center gap-1 hover:bg-red-50"
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
          <div className="bg-[#FFF5F5] px-3 py-2 text-xs text-gray-500">
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
            <div className="bg-[#FFF5F5] px-3 py-2 text-xs text-gray-500">
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
            <div className="bg-[#FFF5F5] px-3 py-2 text-xs text-gray-500">
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
              if (!files || files.length === 0) return;

              const MAX_IMAGES = 5;
              const remaining = MAX_IMAGES - uploadedImages.length;
              if (remaining <= 0) {
                toast.error('最多只能上传5张图片');
                e.target.value = '';
                return;
              }

              const filesToUpload = Array.from(files).slice(0, remaining);
              const toastId = toast.loading(`正在上传 ${filesToUpload.length} 张图片...`);

              try {
                const uploadedUrls: string[] = [];
                for (const file of filesToUpload) {
                  const { base64 } = await autoCompressImage(file, 'normal');
                  const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
                  if (result.success && result.imageUrl) {
                    uploadedUrls.push(result.imageUrl);
                  }
                }
                if (uploadedUrls.length > 0) {
                  setUploadedImages(prev => [...prev, ...uploadedUrls].slice(0, MAX_IMAGES));
                  toast.dismiss(toastId);
                  toast.success(`成功上传 ${uploadedUrls.length} 张图片`);
                } else {
                  toast.dismiss(toastId);
                }
              } catch (error) {
                toast.dismiss(toastId);
                console.error('图片上传失败:', error);
                toast.error('图片上传失败，请重试');
              }
              e.target.value = '';
            }}
          />
          {!isCustomAA && <button 
            className="px-6 bg-[#D32F2F] text-white flex items-center gap-2"
            onClick={() => {
              if (uploadedImages.length >= 5) {
                toast.error('最多只能上传5张图片');
                return;
              }
              fileInputRef.current?.click();
            }}
          >
            <ImageIcon className="w-5 h-5" />
            <span className="text-sm font-medium">传图{uploadedImages.length > 0 ? `(${uploadedImages.length}/5)` : ''}</span>
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
                    className="absolute -top-2 -right-2 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center text-xs"
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

      {/* 重复账目警告提示 - 固定高度，不遗挡上方操作区 */}
      {duplicateWarnings.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-white">
          {duplicateWarnings.map((w, idx) => (
            <div
              key={idx}
              className="animate-warn-flash flex items-center gap-3 px-4 py-3.5 border-2 border-[#FFCDD2] rounded-2xl cursor-pointer"
              onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${w.id}`)}
            >
              {/* 闪动图标 */}
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-[#FFEBEE]">
                <AlertTriangle className="animate-icon-pulse w-6 h-6 text-[#D32F2F]" />
              </div>
              {/* 文字区 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#D32F2F] leading-snug">{w.text}</p>
                <p className="text-[11px] text-[#E57373] mt-1">点此查看该账目，仍可继续保存</p>
              </div>
              {/* 右箭头 */}
              <div className="flex-shrink-0 text-[#E57373] text-lg font-light">›</div>
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
      </>
      )}

      {/* 底部保存按鈕（custom_aa 专用，固定在底部） */}
      {isCustomAA && (
        <div className="flex-shrink-0 p-4 bg-white" style={{ borderTop: '1px solid #F0E8E0' }}>
          <button
            className="w-full bg-[#D32F2F] text-white py-4 rounded-2xl text-base font-semibold active:bg-[#B71C1C] shadow-sm"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      )}
      {/* AJ企业选择弹窗 */}
      {isCustomAJ && showCompanyPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCompanyPicker(false)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="font-semibold text-gray-800">选择服务企业</div>
              <button onClick={() => setShowCompanyPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
                <span className="text-gray-500 text-lg leading-none">×</span>
              </button>
            </div>
            <div className="p-4">
              {!ajCompanies || (ajCompanies as any[]).length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  暂无可用企业
                  <div className="text-xs mt-1">请联系管理员为您开通企业访问权限</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                      selectedCompanyId === null ? 'bg-[#1A2B4A] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                    onClick={() => { setSelectedCompanyId(null); setShowCompanyPicker(false); }}
                  >
                    不指定企业
                  </button>
                  {(ajCompanies as any[]).map((company: any) => (
                    <div
                      key={company.id}
                      className={`w-full rounded-xl transition-colors ${
                        selectedCompanyId === company.id ? 'bg-[#1A2B4A]' : 'bg-gray-50'
                      }`}
                    >
                      <button
                        className="w-full text-left px-4 py-3"
                        onClick={() => { setSelectedCompanyId(company.id); setShowCompanyPicker(false); }}
                      >
                        <div className={`font-medium text-sm ${selectedCompanyId === company.id ? 'text-white' : 'text-gray-800'}`}>{company.name}</div>
                        {company.taxNo && (
                          <div className={`text-xs mt-0.5 ${selectedCompanyId === company.id ? 'text-white/70' : 'text-gray-400'}`}>税号：{company.taxNo}</div>
                        )}
                      </button>
                      {/* 开票信息展示与复制 */}
                      {(company.address || company.phone || company.bankName || company.bankAccount) && (
                        <div className={`px-4 pb-3 space-y-1 border-t ${selectedCompanyId === company.id ? 'border-white/20' : 'border-gray-200'}`}>
                          <div className={`text-xs font-medium mt-2 mb-1 ${selectedCompanyId === company.id ? 'text-white/80' : 'text-gray-500'}`}>开票信息</div>
                          {company.address && (
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs flex-1 ${selectedCompanyId === company.id ? 'text-white/70' : 'text-gray-500'}`}>地址：{company.address}</span>
                              <button
                                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${selectedCompanyId === company.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company.address); }}
                              >复制</button>
                            </div>
                          )}
                          {company.phone && (
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs flex-1 ${selectedCompanyId === company.id ? 'text-white/70' : 'text-gray-500'}`}>电话：{company.phone}</span>
                              <button
                                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${selectedCompanyId === company.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company.phone); }}
                              >复制</button>
                            </div>
                          )}
                          {company.bankName && (
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs flex-1 ${selectedCompanyId === company.id ? 'text-white/70' : 'text-gray-500'}`}>开户行：{company.bankName}</span>
                              <button
                                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${selectedCompanyId === company.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company.bankName); }}
                              >复制</button>
                            </div>
                          )}
                          {company.bankAccount && (
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs flex-1 ${selectedCompanyId === company.id ? 'text-white/70' : 'text-gray-500'}`}>账号：{company.bankAccount}</span>
                              <button
                                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${selectedCompanyId === company.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company.bankAccount); }}
                              >复制</button>
                            </div>
                          )}
                          {/* 一键复制全部开票信息 */}
                          <button
                            className={`w-full mt-2 text-xs py-1.5 rounded ${selectedCompanyId === company.id ? 'bg-white/20 text-white' : 'bg-[#1A2B4A]/10 text-[#1A2B4A]'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const info = [
                                company.name,
                                company.taxNo ? `税号：${company.taxNo}` : '',
                                company.address ? `地址：${company.address}` : '',
                                company.phone ? `电话：${company.phone}` : '',
                                company.bankName ? `开户行：${company.bankName}` : '',
                                company.bankAccount ? `账号：${company.bankAccount}` : '',
                              ].filter(Boolean).join('\n');
                              navigator.clipboard.writeText(info);
                            }}
                          >一键复制全部开票信息</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isCustomAJ && viewAsUserId && viewAsUserInfo && (
        <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: '#F59E0B' }}>
          <div className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: '#1A2340' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>正在以 <strong>{viewAsUserInfo.name}</strong> 的视角提交申请</span>
          </div>
        </div>
      )}
      {isCustomAJ && (
        <div className="flex-shrink-0 px-4 py-4 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
          <button
            className="w-full bg-[#1A2B4A] text-white py-4 rounded-2xl text-base font-bold active:bg-[#152238] shadow-md tracking-wider"
            onClick={handleSave}
          >
            提交申请
          </button>
        </div>
      )}

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
                className="w-full flex items-center justify-between p-2 hover:bg-[#F4F6F9] rounded"
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
