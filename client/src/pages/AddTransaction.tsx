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
  ZoomIn,
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
import { PageTag } from "@/components/PageTag";

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
  // custom_aa账本：只有owner（创建者）才能添加分类标签，管理员不显示加号
  const canManageCategories = !isCustomAA || userRole === 'owner';
  
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
  // 当企业列表加载完成时，自动选中第1个企业（必须选中一个企业才能提交）
  useEffect(() => {
    if (isCustomAJ && ajCompanies && (ajCompanies as any[]).length > 0 && selectedCompanyId === null) {
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

  // 报销事由：固定为「待确认」
  const expenseReasonLabel = '待确认';

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
  // 图片放大预览
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // 选图后预览确认
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [pendingUploadCallback, setPendingUploadCallback] = useState<((files: File[]) => void) | null>(null);
  const [pendingPreviewIndex, setPendingPreviewIndex] = useState(0);

  // 股票代码相关（custom_aa管理员）
  const [stockInputs, setStockInputs] = useState<Array<{code: string; name: string; loading: boolean}>>(
    [{code: '', name: '', loading: false}, {code: '', name: '', loading: false}, {code: '', name: '', loading: false}]
  );

  // 股票代码查询函数
  const handleQueryStock = async (index: number, code: string) => {
    if (!code.trim()) return;
    setStockInputs(prev => prev.map((s, i) => i === index ? { ...s, loading: true } : s));
    try {
      const result = await utils.ledger.queryStockName.fetch({ code: code.trim() });
      setStockInputs(prev => prev.map((s, i) => i === index ? { ...s, name: result.found ? result.name : '未找到', loading: false } : s));
    } catch {
      setStockInputs(prev => prev.map((s, i) => i === index ? { ...s, name: '查询失败', loading: false } : s));
    }
  };
  
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

      // 加载股票代码
      if ((editTransaction as any).stockCodes && (editTransaction as any).stockCodes.length > 0) {
        const codes = (editTransaction as any).stockCodes as Array<{code: string; name: string}>;
        const newInputs = [...Array(Math.max(3, codes.length))].map((_, i) => ({
          code: codes[i]?.code || '',
          name: codes[i]?.name || '',
          loading: false,
        }));
        setStockInputs(newInputs);
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
  
  // 当真实分类加载完成后，更新选中状态
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
    } else if (isEditMode && topCategories.length > 0) {
      // 编辑模式下：如果URL中有categoryId参数（管理员从日历进入），用URL的categoryId覆盖
      const urlCategoryId = urlParams.get('categoryId');
      if (urlCategoryId) {
        const catId = parseInt(urlCategoryId);
        const found = topCategories.find((c: any) => c.id === catId);
        if (found) {
          setSelectedCategoryPath([catId]);
        }
      }
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
      stockCodes: isCustomAA ? stockInputs.filter(s => s.code.trim()).map(s => ({ code: s.code.trim(), name: s.name })) : undefined,
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
    <div className={`h-screen flex flex-col overflow-x-hidden ${isCustomAJ ? 'bg-[#F4F6F9]' : 'bg-[#FAF3ED]'}`}>
      <PageTag code="P004" />
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
        <div className="flex-1 overflow-hidden bg-[#F5F5F5] flex flex-col">
          {/* 单据头 */}
          <div className="bg-[#1A2B4A] px-4 pt-1.5 pb-4 flex items-center justify-between flex-shrink-0">
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
          {/* 内容区（可滚动） */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-3 pt-2 pb-4 gap-2">
          {/* 容器一：开票信息（紧凑两行） */}
          <div className="rounded-2xl bg-white overflow-hidden shadow-sm flex-shrink-0" style={{ border: '1px solid #E2E8F0' }}>
            <div className="px-3 py-3">
              {selectedCompany ? (
                <div className="flex flex-col gap-2">
                  {/* 第一行：公司名称 + 复制按鈕 */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 text-lg font-bold text-[#1A2B4A] leading-tight" style={{ wordBreak: 'break-all' }}>{selectedCompany.name}</div>
                    <button className="w-8 h-8 flex-shrink-0 rounded-md border border-gray-300 text-gray-500 flex items-center justify-center active:bg-gray-100" onClick={() => { navigator.clipboard.writeText(selectedCompany.name); toast.success('\u5df2\u590d\u5236\u4f01\u4e1a\u540d\u79f0'); }} title="\u590d\u5236\u4f01\u4e1a\u540d\u79f0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </div>
                  {/* 第二行：税号 + 复制按鈕 */}
                  {selectedCompany.taxNo && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0 text-lg font-bold text-[#1A2B4A] leading-tight" style={{ wordBreak: 'break-all' }}>{selectedCompany.taxNo}</div>
                      <button className="w-8 h-8 flex-shrink-0 rounded-md border border-gray-300 text-gray-500 flex items-center justify-center active:bg-gray-100" onClick={() => { navigator.clipboard.writeText(selectedCompany.taxNo); toast.success('\u5df2\u590d\u5236\u7a0e\u53f7'); }} title="\u590d\u5236\u7a0e\u53f7">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </div>
                  )}
                  {(ajCompanies as any[])?.length > 1 && (
                    <button className="text-[10px] text-[#1A2B4A] underline self-start" onClick={() => setShowCompanyPicker(true)}>更换企业</button>
                  )}
                </div>
              ) : (
                <div
                  className="text-sm text-gray-400 cursor-pointer flex items-center gap-1"
                  onClick={() => (ajCompanies as any[])?.length > 0 && setShowCompanyPicker(true)}
                >
                  <span>请选择企业</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              )}
            </div>
          </div>

          {/* 容器二：报销金额 + 发票凭证（自适应高度） */}
          <div className="rounded-2xl bg-white shadow-sm flex-shrink-0 flex flex-col" style={{ border: '1px solid #E2E8F0' }}>
            {/* 报销金额 */}
            <div className="px-4 py-3 flex flex-col" style={{ borderBottom: '1px solid #E8D5A3', background: '#FEF9EC', borderLeft: '4px solid #C9A84C' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[#C9A84C] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span className="text-xs font-bold tracking-wider" style={{ color: '#8B6914' }}>报销金额</span>
              </div>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-gray-400">¥</span>
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
                  className="text-3xl font-bold text-[#1A2B4A] bg-transparent border-none outline-none flex-1 placeholder-gray-200"
                  style={{ caretColor: '#1A2B4A' }}
                  autoComplete="off"
                  onBlur={() => {
                    if (amount && parseFloat(amount) > 0) {
                      setAmount(parseFloat(amount).toFixed(2));
                    }
                  }}
                />
              </div>
              {amount && parseFloat(amount) > 0 && (
                <div className="mt-1 text-[11px] font-medium truncate" style={{ color: '#8B6914' }}>
                  {(() => {
                    const num = parseFloat(amount) || 0;
                    const digits = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
                    const units = ['','拾','佰','仟'];
                    const bigUnits = ['','万','亿'];
                    const [intPart, decPart] = num.toFixed(2).split('.');
                    const intNum = parseInt(intPart);
                    if (intNum === 0) return `大写：零元${parseInt(decPart) > 0 ? (digits[parseInt(decPart[0])] + (parseInt(decPart[0])>0?'角':'') + (parseInt(decPart[1])>0?digits[parseInt(decPart[1])]+'分':'')) : '整'}`;
                    let result = '';
                    const intStr = intNum.toString();
                    const groups: string[] = [];
                    for (let i = intStr.length; i > 0; i -= 4) groups.unshift(intStr.slice(Math.max(0, i-4), i));
                    groups.forEach((g, gi) => {
                      let groupStr = '';
                      for (let i = 0; i < g.length; i++) {
                        const d = parseInt(g[i]);
                        const u = units[g.length - 1 - i];
                        if (d !== 0) groupStr += digits[d] + u;
                        else if (groupStr && !groupStr.endsWith('零')) groupStr += '零';
                      }
                      if (groupStr.endsWith('零')) groupStr = groupStr.slice(0,-1);
                      if (groupStr) result += groupStr + bigUnits[groups.length - 1 - gi];
                    });
                    result += '元';
                    const j = parseInt(decPart[0]), f = parseInt(decPart[1]);
                    if (j > 0) result += digits[j] + '角';
                    if (f > 0) result += digits[f] + '分';
                    if (j === 0 && f === 0) result += '整';
                    return `大写：${result}`;
                  })()}
                </div>
              )}
            </div>
            {/* 发票凭证 */}
            <div className="px-4 py-3 flex flex-col" style={{ background: '#FEF9EC', borderLeft: '4px solid #C9A84C' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[#C9A84C] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span className="text-xs font-bold tracking-wider" style={{ color: '#8B6914' }}>发票 / 凭证</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                const MAX_IMAGES = 10;
                const remaining = MAX_IMAGES - uploadedImages.length;
                if (remaining <= 0) { toast.error('最多只能上传10张图片'); e.target.value = ''; return; }
                const filesToProcess = Array.from(files).slice(0, remaining);
                // 先生成预览，弹出确认弹窗
                const previews = filesToProcess.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }));
                setPendingPreviewIndex(0);
                setPendingFiles(previews);
                setPendingUploadCallback(() => async (confirmedFiles: File[]) => {
                  toast.loading('上传中...', { id: 'upload' });
                  try {
                    const uploadedUrls: string[] = [];
                    for (const file of confirmedFiles) {
                      const { base64 } = await autoCompressImage(file, 'normal');
                      const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
                      if (result.success && result.imageUrl) uploadedUrls.push(result.imageUrl);
                    }
                    if (uploadedUrls.length > 0) { setUploadedImages(prev => [...prev, ...uploadedUrls]); toast.success(`成功上传 ${uploadedUrls.length} 张图片`, { id: 'upload' }); }
                    else toast.dismiss('upload');
                  } catch (error) { console.error('图片上传失败:', error); toast.error('图片上传失败，请重试', { id: 'upload' }); }
                });
                e.target.value = '';
              }} />
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
                    <img src={image} alt={`发票${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                    <button className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#1A2B4A] text-white rounded-full flex items-center justify-center shadow" onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== index))}>
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded flex items-center justify-center"
                      onClick={() => setPreviewImageUrl(image)}
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length === 0 ? (
                  /* 未上传时：正方形相机图标+文字 */
                  <button
                    className="flex-shrink-0 flex items-center justify-center rounded-xl text-[#1A2B4A] active:opacity-70"
                    style={{ width: 72, height: 72, background: '#F4F6F9', border: '2px dashed #C9A84C80' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </button>
                ) : uploadedImages.length < 10 ? (
                  /* 已有图片：显示带加号的新增按钮 */
                  <button
                    className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl text-[#C9A84C] active:opacity-70"
                    style={{ width: 72, height: 72, background: '#FFFBF0', border: '2px dashed #C9A84C80' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* 容器三：费用报销明细单预览 */}
          {/* AI提示语 */}
          <div className="px-3 py-1.5 rounded-xl flex-shrink-0" style={{ background: '#F0F4FF', border: '1px solid #D0DAF5' }}>
            <span className="text-[11px]" style={{ color: '#4A5A8A' }}>以下为 <strong>AI财会助理</strong> 自动生成预览，提交后管理员可见</span>
          </div>
          <div className="mb-2 bg-white rounded-xl overflow-hidden flex-shrink-0" style={{ boxShadow: '0 1px 8px rgba(26,43,74,0.08)', border: '1px solid #E2E8F0' }}>

            {/* 顶部色条 */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #1A2B4A 0%, #C9A84C 100%)' }} />

            {/* 标题 */}
            <div className="py-1.5 text-center" style={{ background: '#1A3A5C', borderBottom: '1.5px solid #C9A84C' }}>
              <div className="text-[12px] font-bold text-white tracking-[0.15em]">费 用 报 销 明 细 单</div>
            </div>

            {/* 编制单位 + 填报日期 + 单位 */}
            <div className="px-2 py-0.5 flex items-center justify-between text-[9px] text-gray-500" style={{ borderBottom: '1px solid #E0E0E0', background: '#FAFAFA' }}>
              <span>编制单位：<span className="text-gray-700">{selectedCompany?.name || '—'}</span></span>
              <span>填报日期：{selectedDate.getFullYear()}年 {String(selectedDate.getMonth()+1).padStart(2,'0')}月 {String(selectedDate.getDate()).padStart(2,'0')}日</span>
              <span>单位：元</span>
            </div>

            {/* 明细表格 - 用 table 确保列宽完全对齐 */}
            <table className="w-full text-[10px] border-collapse" style={{ borderBottom: '2px solid #1A3A5C' }}>
              <colgroup>
                <col style={{ width: '2.5em' }} />
                <col style={{ width: '4em' }} />
                <col style={{ width: '5em' }} />
                <col />
                <col style={{ width: '1%', whiteSpace: 'nowrap' }} />
                <col style={{ width: '1%', whiteSpace: 'nowrap' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#1A3A5C', borderBottom: '1px solid #C9A84C' }}>
                  <th className="px-0.5 py-0.5 text-center font-bold text-white border-r border-white/20 whitespace-nowrap">序号</th>
                  <th className="px-0.5 py-0.5 text-center font-bold text-white border-r border-white/20">日期</th>
                  <th className="px-0.5 py-0.5 text-center font-bold text-white border-r border-white/20 whitespace-nowrap">报销事由</th>
                  <th className="px-0.5 py-0.5 text-center font-bold text-white border-r border-white/20">报销类目</th>
                  <th className="px-1 py-0.5 text-center font-bold text-white border-r border-white/20 whitespace-nowrap">金额</th>
                  <th className="px-1 py-0.5 text-center font-bold text-white whitespace-nowrap">附件</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#fff' }}>
                  <td className="px-0.5 py-1 text-center border-r border-gray-200 whitespace-nowrap">1</td>
                  <td className="px-0.5 py-1 text-center border-r border-gray-200">{String(selectedDate.getMonth()+1).padStart(2,'0')}/{String(selectedDate.getDate()).padStart(2,'0')}</td>
                  <td className="px-0.5 py-1 text-center border-r border-gray-200 text-[#444] whitespace-nowrap text-[9px]">待AI主管确认</td>
                  <td className="px-1 py-1 text-center border-r border-gray-200 text-[#444] text-[9px]">待AI财务确认</td>
                  <td className="px-1 py-1 text-center border-r border-gray-200 font-bold text-[#1A3A5C] whitespace-nowrap">¥{parseFloat(amount || '0').toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-0.5 text-center" style={{ verticalAlign: 'middle' }}>
                    {uploadedImages.length > 0 ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <img src={uploadedImages[0]} alt="附件" className="object-cover rounded" style={{ width: 20, height: 20 }} />
                        {uploadedImages.length > 1 && <span className="text-[8px] text-gray-500">+{uploadedImages.length - 1}</span>}
                      </div>
                    ) : null}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: '#EEF2F7' }}>
                  <td colSpan={3} className="px-1.5 py-1 text-center font-bold border-r border-gray-300 whitespace-nowrap">合计金额（大写）</td>
                  <td className="px-1.5 py-1.5 text-center font-bold text-[#1A3A5C] border-r border-gray-300">
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
                  <td className="px-1 py-1 text-center font-bold text-[#1A3A5C] border-r border-gray-300 whitespace-nowrap">¥{parseFloat(amount || '0').toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-1 py-1 text-center whitespace-nowrap"></td>
                </tr>
              </tfoot>
            </table>

            {/* 审批栏：仅报销人 + 经手人（手写签字样式） */}
            <div className="grid text-[10px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="px-2 py-1.5 border-r border-gray-200">
                <span className="text-gray-400">报销人：</span>
                <span
                  className="ml-1"
                  style={{
                    color: '#1a237e',
                  }}
                >{applicantName}</span>
              </div>
              <div className="px-2 py-1.5">
                <span className="text-gray-400">经手人：</span>
                <span
                  className="ml-1"
                  style={{
                    color: '#1a237e',
                  }}
                >
                  {selectedCompany ? (() => {
                    const surnames = ['王','李','张','刘','陈','杨','赵','黄','周','吴'];
                    const seed = (selectedCompany.name.charCodeAt(0) + selectedCompany.name.charCodeAt(selectedCompany.name.length-1)) % 10;
                    return surnames[seed];
                  })() : '—'}
                </span>
              </div>
            </div>

            {/* 底部色条 */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #C9A84C 0%, #1A2B4A 100%)' }} />

          </div>

          {/* 重复账目警告 */}
          {duplicateWarnings.length > 0 && (
            <div className="mx-3 mt-1.5">
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

          </div>{/* 关闭固定内容区 */}

          {/* 提交按鈕（固定在底部） */}
          <div className="flex-shrink-0 px-4 pt-3 pb-4 bg-white" style={{ borderTop: '1px solid #E2E8F0' }}>
            {(() => {
              const isReady = !!(amount && parseFloat(amount) > 0 && uploadedImages.length > 0);
              return (
                <>
                  <div className="text-center text-xs text-gray-400 mb-2">
                    {isReady ? '✓ 信息已完整，提交后管理员将收到通知' : '请填写金额并上传发票/凭证后提交'}
                  </div>
                  <button
                    className="w-full text-white py-4 rounded-2xl text-base font-bold shadow-md tracking-wider transition-all duration-300"
                    style={{
                      background: isReady ? 'linear-gradient(135deg, #1A6B4A 0%, #2E9E6B 100%)' : '#B0B8C4',
                      opacity: 1,
                      cursor: isReady ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!isReady}
                    onClick={() => {
                      if (!isReady) {
                        if (!amount || parseFloat(amount) <= 0) {
                          alert('请先填写报销金额');
                        } else if (uploadedImages.length === 0) {
                          alert('请至少上传一张发票或凭证');
                        }
                        return;
                      }
                      handleSave();
                    }}
                  >
                    {isReady ? '✓ 提交申请' : '提交申请'}
                  </button>
                </>
              );
            })()}
          </div>
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
                // custom_aa管理员模式：URL中有categoryId时，只显示该单个标签（不显示其他用户标签）
                const urlCategoryId = urlParams.get('categoryId') ? parseInt(urlParams.get('categoryId')!) : null;
                const isAdminViewMode = isCustomAA && (userRole === 'admin' || userRole === 'owner') && !!urlCategoryId;
                const filteredCats = (isCustomAA && level === 0)
                  ? (isAdminViewMode
                    ? cats.filter((c: any) => c.id === urlCategoryId)
                    : cats.filter((c: any) => !c.isDefault && c.id > 10))
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

          {/* 图片上传区域（custom_aa管理员可用） */}
          {isCustomAA && (userRole === 'admin' || userRole === 'owner') && (
            <div className="mx-3 mt-3 bg-white rounded-2xl" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #F0E8E0' }}>
              <div className="px-5 py-4">
                <div className="text-xs text-gray-400 mb-3 font-medium tracking-widest uppercase">图片（选填）</div>
                {/* custom_aa 专用的隐藏 file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    const MAX_IMAGES = 10;
                    const remaining = MAX_IMAGES - uploadedImages.length;
                    if (remaining <= 0) { toast.error('最多只能上传10张图片'); e.target.value = ''; return; }
                    const filesToProcess = Array.from(files).slice(0, remaining);
                    // 先生成预览，弹出确认弹窗
                    const previews = filesToProcess.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }));
                    setPendingPreviewIndex(0);
                    setPendingFiles(previews);
                    setPendingUploadCallback(() => async (confirmedFiles: File[]) => {
                      const toastId = toast.loading(`上传中...`);
                      try {
                        const uploadedUrls: string[] = [];
                        for (const file of confirmedFiles) {
                          const { base64 } = await autoCompressImage(file, 'normal');
                          const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
                          if (result.success && result.imageUrl) uploadedUrls.push(result.imageUrl);
                        }
                        if (uploadedUrls.length > 0) {
                          setUploadedImages(prev => [...prev, ...uploadedUrls].slice(0, MAX_IMAGES));
                          toast.success(`成功上传 ${uploadedUrls.length} 张图片`, { id: toastId });
                        } else {
                          toast.dismiss(toastId);
                        }
                      } catch (error) {
                        console.error('图片上传失败:', error);
                        toast.error('图片上传失败，请重试', { id: toastId });
                      }
                    });
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {uploadedImages.map((image, index) => (
                    <div key={index} className="relative w-20 h-20">
                      <img
                        src={image}
                        alt={`图片${index + 1}`}
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <button
                        className="absolute -top-2 -right-2 w-5 h-5 bg-[#D32F2F] text-white rounded-full flex items-center justify-center"
                        onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== index))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <button
                        className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded flex items-center justify-center"
                        onClick={() => setPreviewImageUrl(image)}
                      >
                        <ZoomIn className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.length < 10 && (
                    <button
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 active:bg-gray-50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">{uploadedImages.length > 0 ? `${uploadedImages.length}/10` : '添加图片'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 股票代码输入区域（custom_aa管理员可用） */}
          {isCustomAA && (userRole === 'admin' || userRole === 'owner') && (
            <div className="mx-3 mt-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #F0E8E0' }}>
              <div className="px-5 py-4">
                <div className="text-xs text-gray-400 mb-3 font-medium tracking-widest uppercase">股票代码（选填）</div>
                <div className="space-y-2">
                  {stockInputs.map((stock, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {/* 左半：输入框 */}
                      <div className="flex items-center bg-gray-50 rounded-xl px-3 py-2" style={{ width: '45%' }}>
                        <input
                          type="text"
                          placeholder={`代码 ${index + 1}`}
                          value={stock.code}
                          onChange={(e) => setStockInputs(prev => prev.map((s, i) => i === index ? { ...s, code: e.target.value.toUpperCase(), name: '' } : s))}
                          onBlur={(e) => handleQueryStock(index, e.target.value)}
                          className="w-full bg-transparent text-sm outline-none text-gray-800 placeholder-gray-300"
                          maxLength={10}
                        />
                      </div>
                      {/* 右半：股票名称 */}
                      <div className="flex-1 flex items-center px-2">
                        {stock.loading ? (
                          <span className="text-xs text-gray-400">查询中...</span>
                        ) : stock.name ? (
                          <span className={`text-sm font-medium truncate ${stock.name === '未找到' || stock.name === '查询失败' ? 'text-gray-400' : 'text-blue-600'}`}>{stock.name}</span>
                        ) : (
                          <span className="text-xs text-gray-300">失焦点自动查询</span>
                        )}
                      </div>
                      {stockInputs.length > 3 && (
                        <button
                          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0"
                          onClick={() => setStockInputs(prev => prev.filter((_, i) => i !== index))}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {stockInputs.length < 10 && (
                  <button
                    className="mt-2 flex items-center gap-1 text-xs text-blue-500 active:text-blue-700"
                    onClick={() => setStockInputs(prev => [...prev, { code: '', name: '', loading: false }])}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加股票
                  </button>
                )}
              </div>
            </div>
          )}

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
              // 先生成预览，弹出确认弹窗
              const previews = filesToUpload.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }));
              setPendingPreviewIndex(0);
              setPendingFiles(previews);
              setPendingUploadCallback(() => async (confirmedFiles: File[]) => {
                const toastId = toast.loading(`正在上传 ${confirmedFiles.length} 张图片...`);
                try {
                  const uploadedUrls: string[] = [];
                  for (const file of confirmedFiles) {
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
              });
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
                  <button
                    className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded flex items-center justify-center"
                    onClick={() => setPreviewImageUrl(image)}
                  >
                    <ZoomIn className="w-3 h-3" />
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
      {/* isCustomAJ 提交按鈕已移入内容区内部 */}

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

      {/* 选图后预览确认弹窗 */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-[10000] flex flex-col" style={{ background: 'rgba(0,0,0,0.95)' }}>
          {/* 顶部信息栏 */}
          <div className="flex items-center justify-between px-4 pt-10 pb-3 flex-shrink-0">
            <div className="text-white text-sm">{pendingPreviewIndex + 1} / {pendingFiles.length}</div>
            <div className="text-white text-base font-medium">确认图片</div>
            <button
              className="text-white/60 text-sm"
              onClick={() => {
                pendingFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
                setPendingFiles([]);
                setPendingUploadCallback(null);
              }}
            >取消</button>
          </div>
          {/* 图片展示区 */}
          <div className="flex-1 flex items-center justify-center px-4 relative overflow-hidden">
            <img
              src={pendingFiles[pendingPreviewIndex]?.previewUrl}
              alt="预览"
              className="max-w-full max-h-full object-contain rounded-lg"
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
            />
            {/* 左箭头 */}
            {pendingPreviewIndex > 0 && (
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center"
                onClick={() => setPendingPreviewIndex(i => i - 1)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            {/* 右箭头 */}
            {pendingPreviewIndex < pendingFiles.length - 1 && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center"
                onClick={() => setPendingPreviewIndex(i => i + 1)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
          </div>
          {/* 底部圆点和按鈕 */}
          <div className="flex-shrink-0 pb-10">
            {pendingFiles.length > 1 && (
              <div className="flex justify-center gap-1.5 mb-4">
                {pendingFiles.map((_, i) => (
                  <button
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === pendingPreviewIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                    onClick={() => setPendingPreviewIndex(i)}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-3 px-6">
              <button
                className="flex-1 py-3 rounded-2xl text-white font-medium"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => {
                  pendingFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
                  setPendingFiles([]);
                  setPendingUploadCallback(null);
                }}
              >重新选图</button>
              <button
                className="flex-1 py-3 rounded-2xl text-white font-bold"
                style={{ background: '#D32F2F' }}
                onClick={() => {
                  if (pendingUploadCallback) {
                    pendingUploadCallback(pendingFiles.map(f => f.file));
                  }
                  pendingFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
                  setPendingFiles([]);
                  setPendingUploadCallback(null);
                }}
              >确认上传 ({pendingFiles.length}张)</button>
            </div>
          </div>
        </div>
      )}

      {/* 图片放大预览弹窗 */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <img
            src={previewImageUrl}
            alt="预览"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center"
            onClick={() => setPreviewImageUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AddTransaction;
