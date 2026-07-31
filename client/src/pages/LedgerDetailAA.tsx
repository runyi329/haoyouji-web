/**
 * LedgerDetailAA.tsx - 定制账本(AA) 专用 UI
 * 配色系统：红白金13色
 *   主色   #D32F2F  顶部/高亮
 *   浅红   #FFEBEE  日历有记录格背景
 *   杏白   #FAF3ED  页面背景
 *   白     #FFFFFF  卡片背景
 *   金     #CBA471  装饰
 *   黑     #222222  主文字
 *   灰     #757575  辅助文字
 *   分割   #E0E0E0  边框/网格
 *   绿     #4CAF50  正收益
 *   橙     #FFA000  警告
 *
 * 标签 = 被记录者（账本一级分类）
 * - 管理员通过账本设置创建/管理分类（标签）
 * - 普通用户在头像右侧通过下拉选择标签
 * - 选中标签后，日历和曲线只显示该标签下的账目
 *
 * transactionsData 格式（来自 ledger.getTransactions）：
 *   Array<{ date: string; records: any[]; income: number; expense: number; balance: number }>
 *   注意：balance 是当天 income - expense，不是累计余额
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { useLocation } from "wouter";
import { UserAvatar } from "@/components/UserAvatar";
import { ChevronLeft, ChevronRight, Settings, Search, BarChart3, Plus, ChevronDown, CircleDollarSign, Users, X, RefreshCw, PauseCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// 数字币价格查询（用于保证金人民币折算显示）——使用OKX API格式
// 数字币价格现已改为服务端缓存，通过 tRPC getCryptoPrices 接口获取
// CRYPTO_COINS_AA 仅用于判断币种是否为数字币
const CRYPTO_COINS_AA = ['BTC', 'ETH', 'SOL', 'LDO'];

interface DayGroup {
  date: string;       // "YYYY-MM-DD"
  records: any[];
  income: number;
  expense: number;
  balance: number;    // 当天 income - expense（非累计）
}

interface Props {
  ledgerId: number;
  ledgerData: any;
  membersData: any[];
  transactionsData: DayGroup[];
  refetchTransactions: () => void;
  user: any;
}

// A股2026年法定节假日（不含周末）
const HOLIDAY_SET_2026 = new Set([
  '2026-01-01','2026-01-02','2026-01-03',
  '2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22','2026-02-23',
  '2026-04-04','2026-04-05','2026-04-06',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
  '2026-06-19','2026-06-20','2026-06-21',
  '2026-09-25','2026-09-26','2026-09-27',
  '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07',
]);

/**
 * 从 dateStr（含）往前找第一个 A 股交易日（跳过周末和2026节假日）。
 * 例：startDate=2026-05-06（周三），返回 2026-04-30（上一个交易日）。
 */
function getPrevTradingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1); // 先退一天，从 startDate 的前一天开始找
  for (let i = 0; i < 30; i++) { // 最多往前找30天，避免死循环
    const s = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAY_SET_2026.has(s)) return s;
    d.setDate(d.getDate() - 1);
  }
  // 兜底：直接返回前一天
  const fallback = new Date(dateStr + 'T00:00:00');
  fallback.setDate(fallback.getDate() - 1);
  return fallback.toISOString().slice(0, 10);
}

export default function LedgerDetailAA({
  ledgerId,
  ledgerData,
  transactionsData,
  user,
  membersData,
  refetchTransactions,
}: Props) {
  const [, setLocation] = useLocation();

  // 快捷按钮配置：从数据库读取当前用户的快捷按钮开关状态
  const { data: myShortcuts } = (trpc as any).ledger.getMyShortcutButtons.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: true }
  );

  // 数字币价格（走服务器tRPC，price-scanner缓存，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  const aaCryptoPrices: Record<string, number> = (cryptoPricesRaw as any)?.prices ?? {};

  // 日历当前月份
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // 日历视图模  // 权限判断：owner 或 admin 才能操作
  const userRole = (ledgerData as any)?.userRole;
  const canEdit = userRole === 'owner' || userRole === 'admin';
  // 视角切换仅账本创建者（owner）可用，管理员不可切换他人视角
  const canSwitchView = userRole === 'owner';
  // 隐藏悬浮+按钮：账本 ID=37（"2026 AA"私人定制账本）对所有人隐藏，仅保留点击日历格子添加记录
  const hideFloatingAddButton = ledgerId === 37;

  const [calendarMode, setCalendarMode] = useState<"balance" | "daily" | "monthly" | "yearly">("balance");
  // 汇总日历（全部模式，概览下方）独立月份状态
  const [summaryCalendarDate, setSummaryCalendarDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // 标签（被记录者）选择
  // 用 sessionStorage 持久化选中的标签，返回时恢复；页面首次加载时清除
  const sessionKey = `ledger_${ledgerId}_selectedTagId`;
  // 默认不选任何标签，等 categories 加载后由 useEffect 自动选中第1个
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // 图片预览（普通成员点击日历格子时弹出）
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [imgScale, setImgScale] = useState(1);
  const [imgTranslateX, setImgTranslateX] = useState(0);
  const [imgTranslateY, setImgTranslateY] = useState(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  // 所有实时状态存入 ref，避免原生事件闭包问题
  const imgScaleRef = useRef(1);
  const imgTxRef = useRef(0);
  const imgTyRef = useRef(0);
  const imgPinchRef = useRef<{ dist: number } | null>(null);
  const imgLastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const imgSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const previewIndexRef = useRef(0);
  const previewImagesRef = useRef<string[]>([]);

  // 日历横向滚动容器 ref（用于默认定位到周一）
  const calendarScrollRef = useRef<HTMLDivElement>(null);

  // 股票预览（普通成员点击有蓝点/紫点的日历格子时弹出）
  const [previewStocks, setPreviewStocks] = useState<Array<{code: string; name: string}>>([]);
  const [showStockPreview, setShowStockPreview] = useState(false);

  // ── 视角切换（管理员/创建者可切换到其他成员视角）──
  const [viewAsUserId, setViewAsUserId] = useState<number | null>(null);
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const trpcUtils = trpc.useUtils();

  const handleSwitchView = (userId: number | null) => {
    setViewAsUserId(userId);
    setShowViewAsPicker(false);
    setViewAsSearch('');
    // 同步 sessionStorage，使后端身份代入（x-view-as-user-id 请求头）生效
    if (userId) {
      sessionStorage.setItem('view-as-user-id', String(userId));
    } else {
      sessionStorage.removeItem('view-as-user-id');
    }
    // 刷新所有查询，使视角切换立即生效（包括 transactionsData、initialBalancesData 等）
    trpcUtils.invalidate();
    // 同时触发父组件的 refetch，确保 transactionsData 切换到被观察用户的数据
    if (refetchTransactions) refetchTransactions();
  };

  // 同步 previewImages/previewImageIndex 到 ref（供原生事件闭包使用）
  previewImagesRef.current = previewImages;
  previewIndexRef.current = previewImageIndex;

  // 图片预览弹窗：用原生事件绑定，完全避开 React 合成事件的 passive 限制
  useEffect(() => {
    if (!showImagePreview) return;
    const el = imgContainerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        imgPinchRef.current = { dist: Math.hypot(dx, dy) };
        imgLastTouchRef.current = null;
        imgSwipeStartRef.current = null;
      } else if (e.touches.length === 1) {
        const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (imgScaleRef.current > 1) {
          imgLastTouchRef.current = pt;
          imgSwipeStartRef.current = null;
        } else {
          imgSwipeStartRef.current = pt;
          imgLastTouchRef.current = null;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && imgPinchRef.current) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const newDist = Math.hypot(dx, dy);
        const ratio = newDist / imgPinchRef.current.dist;
        const newScale = Math.min(5, Math.max(1, imgScaleRef.current * ratio));
        imgScaleRef.current = newScale;
        setImgScale(newScale);
        imgPinchRef.current.dist = newDist;
      } else if (e.touches.length === 1 && imgLastTouchRef.current && imgScaleRef.current > 1) {
        const dx = e.touches[0].clientX - imgLastTouchRef.current.x;
        const dy = e.touches[0].clientY - imgLastTouchRef.current.y;
        imgTxRef.current += dx;
        imgTyRef.current += dy;
        setImgTranslateX(imgTxRef.current);
        setImgTranslateY(imgTyRef.current);
        imgLastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      imgPinchRef.current = null;
      imgLastTouchRef.current = null;
      if (imgScaleRef.current < 1) {
        imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
        setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
      }
      if (imgScaleRef.current <= 1 && imgSwipeStartRef.current && e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - imgSwipeStartRef.current.x;
        const dy = e.changedTouches[0].clientY - imgSwipeStartRef.current.y;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          const imgs = previewImagesRef.current;
          const cur = previewIndexRef.current;
          if (dx < 0 && cur < imgs.length - 1) {
            previewIndexRef.current = cur + 1;
            setPreviewImageIndex(cur + 1);
            imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
            setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
          } else if (dx > 0 && cur > 0) {
            previewIndexRef.current = cur - 1;
            setPreviewImageIndex(cur - 1);
            imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
            setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
          }
        }
        imgSwipeStartRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [showImagePreview]);

  // selectedTagId 变化时同步到 sessionStorage
  useEffect(() => {
    if (selectedTagId !== null) {
      sessionStorage.setItem(sessionKey, String(selectedTagId));
    }
  }, [selectedTagId, sessionKey]);


  // 获取分红汇总数据
  const { data: dividendSummaryData } = trpc.getDividendSummary.useQuery(
    { ledgerId, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId }
  );
  const dividendByTag: Record<string, number> = dividendSummaryData?.byTag ?? {};

  // 获取账本一级分类（标签）
  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  // 获取初始金额（支持视角切换：管理员可查他人数据）
  const { data: initialBalancesData } = trpc.ledger.getMyInitialBalances.useQuery(
    { ledgerId, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId }
  );
  // 过滤掉全局默认分类（如「购物」），只保留手动创建的标签
  const allCategories = useMemo(() => {
    if (!rawCategories) return [];
    return rawCategories.filter((c: any) => !c.isDefault);
  }, [rawCategories]);

  // 根据 initialBalancesData 中的 visible 字段，过滤掉对当前用户隐藏的标签
  // 注意：initialBalancesData 未加载完成时返回空数组，防止隐藏标签在加载期间闪现在下拉框中
  const categories = useMemo(() => {
    if (!initialBalancesData) return []; // 数据未加载完，先返回空，防止隐藏标签闪现
    const balances = initialBalancesData.balances ?? {};
    // 检查是否有任何 visible 配置；若完全没有配置则全部显示
    const hasVisibleConfig = allCategories.some(
      (c: any) => balances[`${c.name}__visible`] !== undefined && balances[`${c.name}__visible`] !== null
    );
    if (!hasVisibleConfig) return allCategories; // 该用户没有配置，全部显示
    return allCategories.filter((c: any) => {
      const visibleVal = balances[`${c.name}__visible`];
      // 未设置时默认显示；设置为 0 则隐藏
      if (visibleVal === undefined || visibleVal === null) return true;
      return Number(visibleVal) !== 0;
    });
  }, [allCategories, initialBalancesData]);

  // 如果当前选中的标签已被隐藏，切换到全部模式
  useEffect(() => {
    if (selectedTagId !== null && categories.length > 0) {
      const stillVisible = categories.find((c: any) => c.id === selectedTagId);
      if (!stillVisible) setSelectedTagId(null);
    }
  }, [categories]);

  // admin 进入账本时默认选中 YH 标签（仅首次加载，未手动选过时生效）
  useEffect(() => {
    if (userRole === 'admin' && categories.length > 0 && selectedTagId === null) {
      const yhTag = categories.find((c: any) => c.name === 'YH');
      if (yhTag) setSelectedTagId(yhTag.id);
    }
  }, [userRole, categories]);

  // 当前选中的标签名
  const selectedTag = useMemo(() => {
    if (!selectedTagId || !categories) return null;
    return categories.find((c: any) => c.id === selectedTagId) || null;
  }, [selectedTagId, categories]);;
  // 获取当前选中标签的配置（暂停日期、结束日期等）——从 initialBalancesData 读取（用户×标签维度）
  const selectedTagName = selectedTag?.name ?? null;
  // 暂停日期和结束日期从当前用户的 initialBalancesData 中读取（tagName__pauseDate / tagName__endDate）
  const selectedTagPauseDate: string | null = useMemo(() => {
    if (!selectedTagName || !initialBalancesData?.balances) return null;
    return (initialBalancesData.balances as any)[`${selectedTagName}__pauseDate`] ?? null;
  }, [selectedTagName, initialBalancesData]);
  // 多次暂停/重启历史（兑容旧 pauseDate）
  const selectedTagPauseHistory: Array<{ pauseDate: string; resumeDate?: string }> = useMemo(() => {
    if (!selectedTagName || !initialBalancesData?.balances) return [];
    const raw = (initialBalancesData.balances as any)[`${selectedTagName}__pauseHistory`];
    if (raw) {
      try { return JSON.parse(String(raw)); } catch { /* fall through */ }
    }
    // 兑容旧字段
    const legacy = (initialBalancesData.balances as any)[`${selectedTagName}__pauseDate`];
    if (legacy) return [{ pauseDate: String(legacy) }];
    return [];
  }, [selectedTagName, initialBalancesData]);
  const selectedTagEndDate: string | null = useMemo(() => {
    if (!selectedTagName || !initialBalancesData?.balances) return null;
    return (initialBalancesData.balances as any)[`${selectedTagName}__endDate`] ?? null;
  }, [selectedTagName, initialBalancesData]);

  // ===== 本金变动历史查询（用于初始金额旁感叹号弹窗） =====
  const [showCapitalHistory, setShowCapitalHistory] = useState(false);
  const [showWithdrawHistory, setShowWithdrawHistory] = useState(false);
  const [showPnlExplain, setShowPnlExplain] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAllModeHelp, setShowAllModeHelp] = useState<'value' | 'pnl' | 'margin' | null>(null);
  // 概览表格盘价总和：用 ref 存储，在概览渲染时赋值，弹窗直接读取
  const overviewTotalPnlRef = useRef<number>(0);

  // 客户端查看备注
  // 分红备注按标签维度：记录当前查看的标签名
  const [dividendNoteTag, setDividendNoteTag] = useState<string | null>(null);
  const [marginNoteTag, setMarginNoteTag] = useState<string | null>(null);

  // 分红明细弹窗：使用 getDividendRecords 获取分红日志记录
  const { data: dividendRecordsData } = trpc.getDividendRecords.useQuery(
    { ledgerId, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId && !!dividendNoteTag }
  );
  // 按标签过滤当前弹窗的分红记录
  const currentDividendRecords = (dividendRecordsData?.records ?? []).filter((r: any) => r.tag_name === dividendNoteTag);

  const { data: dividendNotesData } = trpc.getAdminNotes.useQuery(
    { ledgerId, type: 'dividend' as const, tagName: dividendNoteTag ?? '', viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId && !!dividendNoteTag }
  );
  const { data: marginNotesData } = trpc.getAdminNotes.useQuery(
    { ledgerId, type: 'margin' as const, tagName: marginNoteTag ?? '', viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId && !!marginNoteTag }
  );
  // 各标签备注数量（用于在分红/金额旁显示条数）
  const { data: dividendNoteCountsData } = trpc.getAdminNoteCounts.useQuery(
    { ledgerId, type: 'dividend' as const, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId }
  );
  const dividendNoteCounts = (dividendNoteCountsData?.counts ?? {}) as Record<string, number>;
  const { data: marginNoteCountsData } = trpc.getAdminNoteCounts.useQuery(
    { ledgerId, type: 'margin' as const, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId }
  );
  const marginNoteCounts = (marginNoteCountsData?.counts ?? {}) as Record<string, number>;
  const { data: capitalTransferData } = trpc.ledger.getTransactions.useQuery(
    { ledgerId, type: 'transfer' as any, categoryId: selectedTagId ?? undefined, limit: 200 },
    { enabled: !!ledgerId && !!selectedTagId }
  );
  // 筛选本金变动记录（description 以 capital_ 开头）
  const capitalHistory = useMemo(() => {
    const records: any[] = [];
    (capitalTransferData as any[] || []).forEach((group: any) => {
      group.records?.forEach((r: any) => {
        if (r.description?.startsWith('capital_')) {
          // 如果记录本身没有 recordDate，从外层分组的 date 字段补充
          records.push({ ...r, recordDate: r.recordDate || group.date || '' });
        }
      });
    });
    return records.sort((a: any, b: any) => (a.recordDate || '').localeCompare(b.recordDate || ''));
  }, [capitalTransferData]);

  // 筛选提现记录（非 capital_ 开头的 transfer 记录）—— 带日期列表
  const withdrawRecords = useMemo(() => {
    const records: { date: string; amount: number }[] = [];
    (capitalTransferData as any[] || []).forEach((group: any) => {
      group.records?.forEach((r: any) => {
        if (!r.description?.startsWith('capital_') && r.type === 'transfer') {
          records.push({ date: r.recordDate || group.date || '', amount: Number(r.amount) || 0 });
        }
      });
    });
    return records.sort((a, b) => a.date.localeCompare(b.date));
  }, [capitalTransferData]);
  // 总提现金额（兼容旧引用）
  const totalWithdraw = useMemo(() => withdrawRecords.reduce((s, r) => s + r.amount, 0), [withdrawRecords]);

  // 当前用户的交易数据
  const activeMemberTransactions = useMemo(() => {
    // 过滤掉 income=0 且 expense=0 的无效记录，并排除 transfer 类型记录（提现/本金变动不显示在日历上）
    return (transactionsData || []).map((day) => {
      const nonTransferRecords = day.records?.filter((r: any) => r.type !== 'transfer') || day.records;
      if (nonTransferRecords !== day.records) {
        // 重新计算 income/expense
        let income = 0, expense = 0;
        nonTransferRecords.forEach((r: any) => {
          if (r.type === 'income') income += r.amount;
          else if (r.type === 'expense') expense += r.amount;
        });
        return { ...day, records: nonTransferRecords, income, expense, balance: income - expense };
      }
      return day;
    }).filter((d) => {
      const total = (d.income || 0) + (d.expense || 0);
      return total > 0;
    });
  }, [transactionsData]);

  // ─── 按标签筛选 activeMemberTransactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    if (!selectedTagId || !categories) return activeMemberTransactions;
    const tagName = selectedTag?.name;
    if (!tagName) return activeMemberTransactions;

    return (activeMemberTransactions || []).map((day) => {
      // 筛选该标签下的记录（category 字段包含标签名），排除 transfer 类型（提现/本金变动不显示在日历上）
      const filtered = day.records.filter((r: any) =>
        r.category && r.category === tagName && r.type !== 'transfer'
      );
      if (filtered.length === 0) return null;

      let income = 0, expense = 0;
      filtered.forEach((r: any) => {
        if (r.type === 'income') income += r.amount;
        else expense += r.amount;
      });

      // 过滤掉 income+expense=0 的无效天（误输入空值/0值导致）
      if (income === 0 && expense === 0) return null;

      return {
        ...day,
        records: filtered,
        income,
        expense,
        balance: income - expense,
      };
    }).filter(Boolean) as DayGroup[];
  }, [activeMemberTransactions, selectedTagId, selectedTag, categories]);

  // ─── 将分组数据转换为按日期索引的 Map ────────────────────────────────────
  const dayMap = useMemo(() => {
    const map = new Map<string, DayGroup>();
    filteredTransactions.forEach((d) => {
      if (d.date) map.set(d.date, d);
    });
    return map;
  }, [filteredTransactions]);

    // ─── 每天余额快照（联动：原始余额 + 截止当天累计提现）────────
  const cumulativeMap = useMemo(() => {
    const cum = new Map<string, number>();
    filteredTransactions.forEach((d) => {
      const dayBalance = d.income > 0 ? d.income : d.expense;
      // 截止当天的累计提现（提现日期 <= 当天）
      const withdrawToDate = withdrawRecords
        .filter(w => w.date <= d.date)
        .reduce((s, w) => s + w.amount, 0);
      // 客户前端看到的余额 = 原始余额 + 截止当天提现
      // 注意：本金变动不叠加，因为登记员录入的余额已经包含了本金变动后的实际账户数字
      cum.set(d.date, dayBalance + withdrawToDate);
    });
    return cum;
  }, [filteredTransactions, withdrawRecords]);

  // ─── 变动日期集合（用于日历格子上显示黄色感叹号标记）───────────
  const changeDates = useMemo(() => {
    const dates = new Set<string>();
    withdrawRecords.forEach(w => dates.add(w.date));
    capitalHistory.forEach((r: any) => { if (r.recordDate) dates.add(r.recordDate); });
    return dates;
  }, [withdrawRecords, capitalHistory]);

  // ─── 全部模式：图表模式切换 ────────────────────────────────────────────────
  const [allChartMode, setAllChartMode] = useState<'amount' | 'initial' | 'margin'>('amount');
  // 已隐藏的标签集合（点击标签名可切换显隐）
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
  // 走势图标签多选下拉框显隐
  const [showChartTagDropdown, setShowChartTagDropdown] = useState(false);
  // 走势图滑块区间（用户拖动后保持位置）
  const [chartZoom, setChartZoom] = useState<{ start: number; end: number } | null>(null);
  // 走势图当前激活的线（点击某条线时显示其最高/最低点）
  const [activeChartLine, setActiveChartLine] = useState<string | null>(null);
  // ECharts实例ref，用于datazoom时直接setOption更新markPoint（绕过React渲染延迟）
  const echartsRef = useRef<any>(null);
  const [tooltipTagName, setTooltipTagName] = useState<string | null>(null);
  const [tooltipRatioTag, setTooltipRatioTag] = useState<string | null>(null);
  const [tooltipTodayPnlTag, setTooltipTodayPnlTag] = useState<string | null>(null);
  const [showTotalTodayTooltip, setShowTotalTodayTooltip] = useState(false);
  const [totalTodayTooltipPos, setTotalTodayTooltipPos] = useState<{ x: number; y: number } | null>(null);
  // 名称列 tooltip 用 fixed 定位，记录点击坐标
  const [tooltipTagPos, setTooltipTagPos] = useState<{ x: number; y: number } | null>(null);

  // 自定义名称弹框
  const [aliasEditTag, setAliasEditTag] = useState<string | null>(null); // 正在编辑的 tag.name
  const [aliasEditValue, setAliasEditValue] = useState(''); // 输入框内容
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasInfoTag, setAliasInfoTag] = useState<string | null>(null); // 单击查看信息的 tag.name
  // 回报分段详情弹框
  const [pnlDetailModal, setPnlDetailModal] = useState<{
    tagName: string;
    tagAlias: string;
    ratio: number;
    initialBalance: number;
    capitalChange: number;
    capitalRecords: Array<{ date: string; amount: number; isAdd: boolean }>;
    tagWithdraw: number;
    segments: Array<{
      segNo: number;
      startDate: string;
      endDate: string;
      startBalance: number;
      endBalance: number;
      effectiveInitial: number;
      pnl: number;
      isPaused: boolean;
      resumeDate?: string;
    }>;
    totalPnl: number;
  } | null>(null);
  const updateMyInitialBalancesMutation = (trpc as any).ledger.updateMyInitialBalances.useMutation({
    onSuccess: () => {
      trpcUtils.ledger.getMyInitialBalances.invalidate({ ledgerId });
    },
  });

  // 全局点击关闭所有 tooltip
  useEffect(() => {
    const closeAll = () => {
      setTooltipTagName(null);
      setTooltipTagPos(null);
      setTooltipRatioTag(null);
      setTooltipTodayPnlTag(null);
      setShowTotalTodayTooltip(false);
      setTotalTodayTooltipPos(null);
    };
    document.addEventListener('click', closeAll);
    return () => document.removeEventListener('click', closeAll);
  }, []);

  const [overviewTab, setOverviewTab] = useState<'overview' | 'calendar' | 'chart'>('overview');
  const overviewHeaderInnerRef = useRef<HTMLDivElement>(null); // 表头行内层div，用translateX同步横向位置
  const overviewBodyScrollRef = useRef<HTMLDivElement>(null); // 数据行横向滚动容器
  const [overviewSort, setOverviewSort] = useState<{ col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend'; dir: 'asc' | 'desc' } | null>(null);
  const handleOverviewSort = (col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend') => {
    setOverviewSort(prev => prev && prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' });
  };

  // ─── 全部模式：按标签统计提现（从原始 transactionsData 中提取 transfer 记录）────
  const withdrawByTag = useMemo(() => {
    const map: Record<string, number> = {};
    if (!categories || categories.length === 0) return map;
    (transactionsData || []).forEach((day) => {
      (day.records || []).forEach((r: any) => {
        // 提现 = transfer 类型且非 capital_ 开头
        if (r.type === 'transfer' && !r.description?.startsWith('capital_')) {
          const cat = r.category || '';
          if (!cat) return;
          // 按标签名精确匹配（避免「612郭总8617P15」被误并入「郭总8617」）
          categories.forEach((c: any) => {
            if (cat === c.name) {
              map[c.name] = (map[c.name] || 0) + (Number(r.amount) || 0);
            }
          });
        }
      });
    });
    return map;
  }, [transactionsData, categories]);

  // ─── 全部模式：按标签统计本金变动净额（从原始 transactionsData 中提取 capital_ 记录）────
  const capitalByTag = useMemo(() => {
    const map: Record<string, number> = {};
    if (!categories || categories.length === 0) return map;
    (transactionsData || []).forEach((day) => {
      (day.records || []).forEach((r: any) => {
        if (r.type === 'transfer' && r.description?.startsWith('capital_')) {
          const cat = r.category || '';
          if (!cat) return;
          categories.forEach((c: any) => {
            if (cat === c.name) {
              const amt = Number(r.amount) || 0;
              if (r.description?.startsWith('capital_add')) {
                map[c.name] = (map[c.name] || 0) + amt;
              } else {
                map[c.name] = (map[c.name] || 0) - amt;
              }
            }
          });
        }
      });
    });
    return map;
  }, [transactionsData, categories]);

  // ─── 全部模式：计算每个标签的每日盈亏数据（用于多线图表） ─────────────────
  const allTagsChartData = useMemo(() => {
    if (!initialBalancesData?.balances || !categories || categories.length === 0) return [];
    // 颜色列表（每个标签一个颜色）
    const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#00838F', '#C62828', '#283593', '#2E7D32'];
    return categories.map((cat: any, idx: number) => {
      const tagName = cat.name;
      const color = COLORS[idx % COLORS.length];
      // 初始金额
      const initialBalance = Number(initialBalancesData.balances[tagName] ?? 0);
      // 保证金
      const marginRaw = initialBalancesData.balances[`${tagName}__margin`];
      const coinRaw = (initialBalancesData.balances as any)[`${tagName}__marginCoin`];
      const coin = coinRaw ? String(coinRaw) : '';
      let marginCny = 0;
      if (marginRaw !== undefined && marginRaw !== null) {
        const num = Number(marginRaw);
        if (coin && CRYPTO_COINS_AA.includes(coin)) {
          marginCny = num * (aaCryptoPrices[coin] ?? 0);
        } else {
          marginCny = num;
        }
      }
      // 权重比例
      const ratio = Number(initialBalancesData.balances[`${tagName}__ratio`] ?? 100) / 100;
      // 该标签的累计提现
      const tagWithdraw = withdrawByTag[tagName] || 0;
      // 该标签的本金变动净额
      const tagCapitalChange = capitalByTag[tagName] || 0;
      // 该标签的所有每日余额记录（按日期升序）
      const tagDays = (activeMemberTransactions || []).map((day: any) => {
        const filtered = (day.records || []).filter((r: any) => r.category && r.category === tagName);
        if (filtered.length === 0) return null;
        let income = 0, expense = 0;
        filtered.forEach((r: any) => {
          if (r.type === 'income') income += r.amount;
          else expense += r.amount;
        });
        if (income === 0 && expense === 0) return null;
        const balance = income > 0 ? income : expense;
        return { date: day.date, balance, income, expense };
      }).filter(Boolean).sort((a: any, b: any) => a.date.localeCompare(b.date));
      // 计算每天的盈亏値（绝对金额、%初始、%保证金）
      // 如果该标签配置了 startDate，则只显示 startDate 前一个交易日及之后的数据
      const tagStartDate = initialBalancesData.balances[`${tagName}__startDate`];
      let filteredTagDays = tagDays;
      if (tagStartDate) {
        const effectiveStartStr = getPrevTradingDay(String(tagStartDate));
        filteredTagDays = tagDays.filter((d: any) => d.date >= effectiveStartStr);
      }
      const points = filteredTagDays.map((d: any) => {
        // 盈亏 = (初始本金 + 增减本金 - 当日余额 - 累计提现) * ratio
        // effectiveInitial = 当前本金（初始本金 + 中途追加/减少）
        const effectiveInitial = initialBalance + tagCapitalChange;
        // 盈亏 = (当前本金 - 填写余额 - 累计提现) × ratio
        // 日历余额 = 填写余额 + 提现，所以盈亏公式需要减去 tagWithdraw
        const pnl = (effectiveInitial - d.balance - tagWithdraw) * ratio;
        const pctInitial = effectiveInitial > 0 ? ((effectiveInitial - d.balance - tagWithdraw) / effectiveInitial) * 100 * ratio : 0;
        const pctMargin = marginCny > 0 ? ((effectiveInitial - d.balance - tagWithdraw) * ratio / marginCny) * 100 : 0;
        return { date: d.date, pnl, pctInitial, pctMargin, balance: d.balance };
      });
      return { name: tagName, color, points, initialBalance, marginCny, marginRaw: marginRaw !== undefined && marginRaw !== null ? Number(marginRaw) : null, marginCoin: coin };
    });
  }, [initialBalancesData, categories, activeMemberTransactions, aaCryptoPrices, withdrawByTag, capitalByTag]);

  // ─── 全部模式：计算所有标签的保证金总和和盈亏总和 ────────────────────────
  const allTagsStats = useMemo(() => {
    if (!initialBalancesData?.balances || !categories || categories.length === 0) {
      return { totalMargin: 0, totalPnl: 0, diff: 0, hasCrypto: false, cryptoDetails: [] as {coin: string, amount: number, cnyValue: number}[] };
    }
    let totalMargin = 0;
    let totalPnl = 0;
    let hasCrypto = false;
    const cryptoMap: Record<string, { amount: number, cnyValue: number }> = {};
    const perTagDetail: Array<{
      tagName: string;
      margin: number; marginCoin: string; marginCny: number;
      initialBalance: number; capitalChange: number; effectiveInitial: number;
      latestBalance: number; latestDate: string;
      tagWithdraw: number;
      ratio: number;
      tagPnl: number;
      hasData: boolean;
    }> = [];
    categories.forEach((cat: any) => {
      const tagName = cat.name;
      // 保证金
      const margin = initialBalancesData.balances[`${tagName}__margin`];
      const coinRaw = (initialBalancesData.balances as any)[`${tagName}__marginCoin`];
      const coin = coinRaw ? String(coinRaw) : '';
      if (margin !== undefined && margin !== null) {
        const num = Number(margin);
        if (coin && CRYPTO_COINS_AA.includes(coin)) {
          // 数字币：按币种合并汇总
          hasCrypto = true;
          const price = aaCryptoPrices[coin] ?? 0;
          const cnyValue = num * price;
          totalMargin += cnyValue;
          if (cryptoMap[coin]) {
            cryptoMap[coin].amount += num;
            cryptoMap[coin].cnyValue += cnyValue;
          } else {
            cryptoMap[coin] = { amount: num, cnyValue };
          }
        } else {
          totalMargin += num;
        }
      }
      // 盈亏：需要计算每个标签的 (initialBalance - latestBalance - totalWithdraw) * ratio
      const initialBalance = Number(initialBalancesData.balances[tagName] ?? 0);
      const ratio = Number(initialBalancesData.balances[`${tagName}__ratio`] ?? 100) / 100;
      const tagWithdraw = withdrawByTag[tagName] || 0;
      const tagCapitalChange = capitalByTag[tagName] || 0;
      // 找该标签最新的余额记录（与走势图逻辑一致：每日合计，跳过balance=0的天）
      const tagStartDate = initialBalancesData.balances[`${tagName}__startDate`];
      let effectiveStartStr: string | null = null;
      if (tagStartDate) {
        effectiveStartStr = getPrevTradingDay(String(tagStartDate));
      }
      // 暂停截止日：与概览逻辑一致，暂停标签只取暂停日当天或之前的余额
      const tagPauseHistoryRaw = initialBalancesData.balances[`${tagName}__pauseHistory`];
      let tagPauseCutoff: string | null = null;
      if (tagPauseHistoryRaw) {
        try {
          const ph = JSON.parse(String(tagPauseHistoryRaw));
          const lastPh = ph[ph.length - 1];
          if (lastPh && lastPh.pauseDate && !lastPh.resumeDate) {
            tagPauseCutoff = lastPh.pauseDate;
          }
        } catch { /* ignore */ }
      } else {
        const legacyPause = initialBalancesData.balances[`${tagName}__pauseDate`];
        if (legacyPause) tagPauseCutoff = String(legacyPause);
      }
      const tagDayMap: Record<string, { income: number; expense: number }> = {};
      (activeMemberTransactions || []).forEach((day: any) => {
        const filtered = (day.records || []).filter((r: any) => r.category && r.category === tagName);
        if (filtered.length === 0) return;
        if (!tagDayMap[day.date]) tagDayMap[day.date] = { income: 0, expense: 0 };
        filtered.forEach((r: any) => {
          if (r.type === 'income') tagDayMap[day.date].income += r.amount;
          else tagDayMap[day.date].expense += r.amount;
        });
      });
      const tagDays = Object.entries(tagDayMap)
        .map(([date, v]) => ({ date, balance: v.income > 0 ? v.income : v.expense }))
        .filter(d => d.balance > 0) // 跳过balance=0的天（防止误录入干扰）
        .sort((a, b) => a.date.localeCompare(b.date));
      const filteredTagDaysStats = effectiveStartStr ? tagDays.filter(d => d.date >= effectiveStartStr!) : tagDays;
      // 暂停截断：与概览一致，只取暂停日当天或之前的数据
      const pauseCutoffTagDays = tagPauseCutoff ? filteredTagDaysStats.filter(d => d.date <= tagPauseCutoff!) : filteredTagDaysStats;
      const effectiveDaysStats = pauseCutoffTagDays.length > 0 ? pauseCutoffTagDays : filteredTagDaysStats;
      if (effectiveDaysStats.length > 0) {
        const last = effectiveDaysStats[effectiveDaysStats.length - 1];
        // effectiveInitial = 当前本金（初始本金 + 中途追加/减少）
        const effectiveInitial = initialBalance + tagCapitalChange;
        // 盈亏 = (当前本金 - 填写余额 - 累计提现) × ratio
        const tagPnl = effectiveInitial > 0 ? (effectiveInitial - last.balance - tagWithdraw) * ratio : 0;
        if (effectiveInitial > 0) {
          totalPnl += tagPnl;
        }
        const coinRaw2 = (initialBalancesData.balances as any)[`${tagName}__marginCoin`];
        const coin2 = coinRaw2 ? String(coinRaw2) : '';
        const marginNum = margin !== undefined && margin !== null ? Number(margin) : 0;
        const price2 = coin2 && CRYPTO_COINS_AA.includes(coin2) ? (aaCryptoPrices[coin2] ?? 0) : 0;
        perTagDetail.push({
          tagName,
          margin: marginNum,
          marginCoin: coin2,
          marginCny: coin2 && CRYPTO_COINS_AA.includes(coin2) ? marginNum * price2 : marginNum,
          initialBalance,
          capitalChange: tagCapitalChange,
          effectiveInitial: initialBalance + tagCapitalChange,
          latestBalance: last.balance,
          latestDate: last.date,
          tagWithdraw,
          ratio,
          tagPnl,
          hasData: true,
        });
      } else {
        const coinRaw2 = (initialBalancesData.balances as any)[`${tagName}__marginCoin`];
        const coin2 = coinRaw2 ? String(coinRaw2) : '';
        const marginNum = margin !== undefined && margin !== null ? Number(margin) : 0;
        const price2 = coin2 && CRYPTO_COINS_AA.includes(coin2) ? (aaCryptoPrices[coin2] ?? 0) : 0;
        perTagDetail.push({
          tagName,
          margin: marginNum,
          marginCoin: coin2,
          marginCny: coin2 && CRYPTO_COINS_AA.includes(coin2) ? marginNum * price2 : marginNum,
          initialBalance,
          capitalChange: tagCapitalChange,
          effectiveInitial: initialBalance + tagCapitalChange,
          latestBalance: 0,
          latestDate: '',
          tagWithdraw,
          ratio,
          tagPnl: 0,
          hasData: false,
        });
      }
    });
    const cryptoDetails = Object.entries(cryptoMap).map(([coin, v]) => ({ coin, amount: v.amount, cnyValue: v.cnyValue }));
    return { totalMargin, totalPnl, diff: totalMargin + totalPnl, hasCrypto, cryptoDetails, perTagDetail };
  }, [initialBalancesData, categories, activeMemberTransactions, aaCryptoPrices, withdrawByTag, capitalByTag]);


  // ─── 统计数据 ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      return { latestBalance: 0, returnRate: 0, recordDays: 0, totalPnl: 0, initialBalance: 0 };
    }

    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const lastRecord = sorted[sorted.length - 1];
    // 最新余额 = 最后一天的原始余额快照（income 和 expense 只有一个有值）
    const latestBalance = lastRecord.income > 0 ? lastRecord.income : lastRecord.expense;
    const latestDate = lastRecord.date; // 最新余额登记日期
    const recordDays = filteredTransactions.length;
    // 初始金额：从 initialBalancesData 接口数据读取（当前选中标签对应的初始金额）
    let initialBalance = 0;
    if (selectedTag?.name && initialBalancesData?.balances) {
      const val = initialBalancesData.balances[selectedTag.name];
      if (val !== undefined && val !== null) {
        initialBalance = Number(val);
      }
    }
    // 初始比例权重（存在 balances[标签名__ratio]）
    let ratio = 1;
    if (selectedTag?.name && initialBalancesData?.balances) {
      const ratioVal = initialBalancesData.balances[`${selectedTag.name}__ratio`];
      if (ratioVal !== undefined && ratioVal !== null) {
        ratio = Number(ratioVal) / 100;
      }
    }
    // 开始日期（从 initialBalancesData 读取 tagName__startDate）
    let startDate = "";
    if (selectedTag?.name && initialBalancesData?.balances) {
      const sd = initialBalancesData.balances[`${selectedTag.name}__startDate`];
      if (sd) startDate = String(sd);
    }
        // 本金变动净额（从 capitalHistory 计算）
    const capitalNetChange = capitalHistory.reduce((sum: number, r: any) => {
      const amt = Number(r.amount) || 0;
      return r.description?.startsWith('capital_add') ? sum + amt : sum - amt;
    }, 0);
    // 当前本金 = 初始本金 + 增减本金净额
    const currentCapital = initialBalance + capitalNetChange;
    // 盈亏 = (当前本金 - 填写余额 - 累计提现) × ratio
    // 日历余额 = 填写余额 + 提现，所以盈亏公式需要减去 totalWithdraw
    const rawPnl = currentCapital - latestBalance - totalWithdraw;
    const totalPnl = rawPnl * ratio;
    const returnRate = currentCapital > 0 ? (rawPnl / currentCapital) * 100 : 0;
    return { latestBalance, latestDate, returnRate, recordDays, totalPnl, initialBalance, currentCapital, startDate, capitalNetChange };
  }, [filteredTransactions, cumulativeMap, ledgerData, initialBalancesData, selectedTag, capitalHistory, totalWithdraw]);

   // ─── 余额曲线数据（根据日历模式生成对应时间范围内所有日期点） ─────
  // 计算走势图的有效开始日期（startDate前一天），与日历同步
  const chartEffectiveStartDate = useMemo(() => {
    if (!stats.startDate) return null;
    return getPrevTradingDay(stats.startDate);
  }, [stats.startDate]);

  const chartData = useMemo(() => {
    const { year, month } = calendarDate;
    let sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    // 过滤掉 startDate 前一天之前的数据
    if (chartEffectiveStartDate) {
      sorted = sorted.filter(d => d.date >= chartEffectiveStartDate);
    }
    if (calendarMode === "balance" || calendarMode === "daily") {
      // 余额/日模式：只显示第一条数据到最后一条数据之间的范围，去掉前后空白
      const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // 建立当月有数据的日期映射
      const monthDataMap = new Map<string, { balance: number | null; pnl: number }>();
      sorted
        .filter((d) => d.date.startsWith(monthPrefix))
        .forEach((d) => {
          monthDataMap.set(d.date, {
            balance: cumulativeMap.get(d.date) ?? null,
            pnl: d.income - d.expense,
          });
        });
      // 找到当月有数据的第一天和最后一天
      let firstDataDay = -1;
      let lastDataDay = -1;
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${monthPrefix}-${String(i).padStart(2, "0")}`;
        if (monthDataMap.has(dateStr)) {
          if (firstDataDay === -1) firstDataDay = i;
          lastDataDay = i;
        }
      }
      // 如果当月没有任何数据，返回空数组
      if (firstDataDay === -1) return [];
      // 只填充第一条数据到最后一条数据之间的日期
      return Array.from({ length: lastDataDay - firstDataDay + 1 }, (_, i) => {
        const day = firstDataDay + i;
        const dateStr = `${monthPrefix}-${String(day).padStart(2, "0")}`;
        const label = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const data = monthDataMap.get(dateStr);
        return {
          date: label,
          balance: data ? data.balance : null,
          balanceGap: null as number | null,
          pnl: data ? data.pnl : null,
          isGap: !data,
        };
      }).map((point, idx, arr) => {
        // balanceGap：对于无数据的点，用线性插値连接前后有数据的点
        if (point.balance !== null) {
          return { ...point, balanceGap: point.balance };
        }
        let prevIdx = idx - 1;
        while (prevIdx >= 0 && arr[prevIdx].balance === null) prevIdx--;
        let nextIdx = idx + 1;
        while (nextIdx < arr.length && arr[nextIdx].balance === null) nextIdx++;
        if (prevIdx < 0 || nextIdx >= arr.length) return { ...point, balanceGap: null };
        const prevVal = arr[prevIdx].balance!;
        const nextVal = arr[nextIdx].balance!;
        const ratio = (idx - prevIdx) / (nextIdx - prevIdx);
        return { ...point, balanceGap: prevVal + (nextVal - prevVal) * ratio };
      });
    } else if (calendarMode === "monthly") {
      // 月模式：取当月最后一天的联动余额作为该月余额
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const prefix = `${year}-${String(m).padStart(2, "0")}`;
        const monthData = sorted.filter((d) => d.date.startsWith(prefix));
        if (monthData.length === 0) return { date: `${m}月`, balance: null, pnl: null };
        // 取当月最后一天的联动余额
        const lastDay = monthData[monthData.length - 1];
        const lastBalance = cumulativeMap.get(lastDay.date) ?? (lastDay.income > 0 ? lastDay.income : lastDay.expense);
        return {
          date: `${m}月`,
          balance: lastBalance,
          pnl: lastBalance,
        };
      });
    }
    // 年模式：显示全部数据，每天取联动余额
    return sorted.map((d) => ({
      date: d.date.slice(5),
      balance: cumulativeMap.get(d.date) ?? (d.income > 0 ? d.income : d.expense),
      pnl: d.income - d.expense,
    }));
  }, [filteredTransactions, cumulativeMap, calendarMode, calendarDate, dayMap, chartEffectiveStartDate]);

  // ─── 当前月日历格子（按周分组，周一为第一列）────────────────────────────────
  // calendarWeeks: 每个元素是一周7天（周一到周日），null表示空位
  const calendarWeeks = useMemo(() => {
    const { year, month } = calendarDate;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // 计算本月1日是周几（0=周日，1=周一，...，6=周六）
    // 转换为周一起始：周一=0，...，周日=6
    const firstDayRaw = new Date(year, month, 1).getDay(); // 0=Sun
    const firstDayMon = (firstDayRaw + 6) % 7; // 0=Mon,...,6=Sun
    // 构建一维数组（周一起始）
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayMon; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // 补齐末尾使总数为7的倍数
    while (cells.length % 7 !== 0) cells.push(null);
    // 按7个一组切分成周数组
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [calendarDate]);

  // 兼容旧代码：calendarCells 保持为一维数组
  const calendarCells = useMemo(() => calendarWeeks.flat(), [calendarWeeks]);

  // 月份切换后自动滚动到周一（让周六周日在屏幕外）
  useEffect(() => {
    const el = calendarScrollRef.current;
    if (!el) return;
    // 每列宽度 = 总宽 / 7，周六在第6列（index=5），周日在第7列（index=6）
    // 周一在第1列（index=0），默认滚动到使周一在最左边
    // 即 scrollLeft = 0（周一已在最左），但容器宽度只显示5列
    // 所以设 scrollLeft = 0 即可让周一在左边，周六周日在右侧屏幕外
    el.scrollLeft = 0;
  }, [calendarDate, calendarMode]);

  // ─── 辅助函数 ──────────────────────────────────────────────────────────────
  // formatMoney: 日历格子金额格式化，prefix 为符号前缀（如 "+" "-"），总长度不超过 6 字符（含前缀）
  const formatMoney = (v: number, prefix = '') => {
    const abs = Math.abs(v);
    const maxLen = 6 - prefix.length; // 去掉前缀后剩余可用字符数
    const adaptDecimals = (str: string, suffix: string): string => {
      const full = str + suffix;
      if (full.length <= maxLen) return full;
      const dot = str.indexOf('.');
      if (dot !== -1) {
        const one = str.slice(0, dot + 2) + suffix;
        if (one.length <= maxLen) return one;
        return str.slice(0, dot) + suffix;
      }
      return full;
    };
    if (abs >= 100000000) return prefix + adaptDecimals((abs / 100000000).toFixed(2), '亿');
    if (abs >= 10000) return prefix + adaptDecimals((abs / 10000).toFixed(2), '万');
    const base = abs.toFixed(2);
    if (base.length <= maxLen) return prefix + base;
    const one = abs.toFixed(1);
    if (one.length <= maxLen) return prefix + one;
    return prefix + abs.toFixed(0);
  };

  const getDateStr = (day: number) => {
    const { year, month } = calendarDate;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  // 获取某天相对上一个有数据日期的差値
  const getDailyDiff = (dateStr: string): number | null => {
    if (!cumulativeMap.has(dateStr)) return null;
    const currentVal = cumulativeMap.get(dateStr)!;
    // 按日期升序排列所有有数据的日期
    const allDates = Array.from(cumulativeMap.keys()).sort();
    const idx = allDates.indexOf(dateStr);
    if (idx <= 0) return null; // 第一条数据无差値
    const prevDate = allDates[idx - 1];
    const prevVal = cumulativeMap.get(prevDate)!;
    return currentVal - prevVal;
  };

  // 计算当前标签的有效开始日期：初始日期的前一天
  const tagEffectiveStartDate = useMemo(() => {
    if (!stats.startDate) return null;
    return getPrevTradingDay(stats.startDate);
  }, [stats.startDate]);

  const getCellValue = (day: number): string | null => {
    const dateStr = getDateStr(day);
    // 如果该日期在有效开始日期之前，不显示
    if (tagEffectiveStartDate && dateStr < tagEffectiveStartDate) return null;
    const data = dayMap.get(dateStr);
    if (!data) return null;

    if (calendarMode === "balance") {
      // 显示联动后的余额（原始余额 + 提现）
      const linkedBalance = cumulativeMap.get(dateStr);
      if (linkedBalance === undefined || linkedBalance <= 0) return null;
      return formatMoney(linkedBalance);
    }
    if (calendarMode === "daily") {
      // 联动后的当天余额 - 前一天联动余额的差值
      const todayLinked = cumulativeMap.get(dateStr);
      if (todayLinked === undefined) return null;
      // 找前一个有数据的日期
      const allDates = Array.from(cumulativeMap.keys()).sort();
      const idx = allDates.indexOf(dateStr);
      if (idx <= 0) return formatMoney(todayLinked); // 第一条数据直接显示联动余额
      const prevDate = allDates[idx - 1];
      const prevLinked = cumulativeMap.get(prevDate)!;
      const diff = todayLinked - prevLinked;
      const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
      return formatMoney(Math.abs(diff), sign);
    }
    if (calendarMode === "monthly") {
      const { year, month } = calendarDate;
      const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(prefix)) total += v.income - v.expense;
      });
      return formatMoney(total);
    }
    if (calendarMode === "yearly") {
      const { year } = calendarDate;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(String(year))) total += v.income - v.expense;
      });
      return formatMoney(total);
    }
    return null;
  };

  const getCellPnl = (day: number): number | null => {
    const dateStr = getDateStr(day);
    // 如果该日期在有效开始日期之前，不显示
    if (tagEffectiveStartDate && dateStr < tagEffectiveStartDate) return null;
    const data = dayMap.get(dateStr);
    if (!data) return null;
    return data.income - data.expense;
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === calendarDate.year &&
    today.getMonth() === calendarDate.month &&
    today.getDate() === day;

  // ─── A股非交易日判断 ───────────────────────────────────────────────────────
  // 2026年法定节假日休市日（不含周末）
  const HOLIDAY_MAP_2026: Record<string, string> = {
    // 元旦 1/1-1/3
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
    // 春节 2/15-2/23
    '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节',
    '2026-02-18': '春节', '2026-02-19': '春节', '2026-02-20': '春节',
    '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
    // 清明节 4/4-4/6
    '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
    // 劳动节 5/1-5/5
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    // 端午节 6/19-6/21
    '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
    // 中秋节 9/25-9/27
    '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
    // 国庆节 10/1-10/7
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节',
    '2026-10-07': '国庆节',
  };
  // 上交所官方通知确认：A股周六、周日一律休市，无例外。
  // 调休上班日虽然居民要上班，但上交所均明确标注「周末休市」，不开盘。
  // 故此列表为空。
  const MAKEUP_WORKDAYS_2026 = new Set<string>([]);

  // 判断某天是否为A股非交易日，返回标注文字或null
  const getNonTradingLabel = (day: number): string | null => {
    const { year, month } = calendarDate;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // 先检查调休上班日（周末但开盘，不标注）
    if (MAKEUP_WORKDAYS_2026.has(dateStr)) return null;
    // 检查法定节假日
    if (HOLIDAY_MAP_2026[dateStr]) return HOLIDAY_MAP_2026[dateStr];
    // 检查周末
    const d = new Date(year, month, day);
    const dow = d.getDay();
    if (dow === 0) return '周日';
    if (dow === 6) return '周六';
    return null;
  };

  // 基于 YYYY-MM-DD 字符串判断是否为非交易日（节假日/周末，排除调休上班日），可跨月使用
  const isNonTradingDateStr = (dateStr: string): boolean => {
    if (MAKEUP_WORKDAYS_2026.has(dateStr)) return false;
    if (HOLIDAY_MAP_2026[dateStr]) return true;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
  };

  // 暂停标志应显示的日期：暂停日期当天；若当天为非交易日（周末/节假日），则顺延到下一个交易日
  // 这样可保证暂停标志一定可见，不会被非交易日灰格覆盖
  const pauseMarkDateStr: string | null = useMemo(() => {
    if (!selectedTagPauseDate) return null;
    const [y, m, d] = selectedTagPauseDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    let cur = new Date(y, m - 1, d);
    // 最多顺延 30 天，避免极端情况死循环
    for (let i = 0; i < 30; i++) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!isNonTradingDateStr(ds)) return ds;
      cur.setDate(cur.getDate() + 1);
    }
    return selectedTagPauseDate;
  }, [selectedTagPauseDate]);
  // 所有暂停标记日期集合（支持多次暂停）
  const pauseMarkDatesSet: Set<string> = useMemo(() => {
    const s = new Set<string>();
    for (const item of selectedTagPauseHistory) {
      if (!item.pauseDate) continue;
      const [y, m, d] = item.pauseDate.split('-').map(Number);
      if (!y || !m || !d) continue;
      let cur = new Date(y, m - 1, d);
      for (let i = 0; i < 30; i++) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!isNonTradingDateStr(ds)) { s.add(ds); break; }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return s;
  }, [selectedTagPauseHistory]);
  // 所有重启标记日期集合（绿色）
  const resumeMarkDatesSet: Set<string> = useMemo(() => {
    const s = new Set<string>();
    for (const item of selectedTagPauseHistory) {
      if (!item.resumeDate) continue;
      const [y, m, d] = item.resumeDate.split('-').map(Number);
      if (!y || !m || !d) continue;
      let cur = new Date(y, m - 1, d);
      for (let i = 0; i < 30; i++) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!isNonTradingDateStr(ds)) { s.add(ds); break; }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return s;
  }, [selectedTagPauseHistory]);

  // 点击日历格子：已有记录则跳转编辑，否则跳转新增
  const handleDayClick = (day: number) => {
    const dateStr = getDateStr(day);
    const existing = dayMap.get(dateStr);

    // 观察视角权限判断：如果切换到非管理员用户视角，按只读处理
    const viewTargetMember = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
    const viewTargetCanEdit = viewTargetMember ? (viewTargetMember.role === 'owner' || viewTargetMember.role === 'admin') : true;
    const effectiveCanEdit = canEdit && (!viewAsUserId || viewTargetCanEdit);

    if (!effectiveCanEdit) {
      // 普通成员或观察非管理员视角：暂停后仍可查看图片/股票，不拦截也不弹提示
      // 不可编辑，但可查看图片和股票
      if (existing && existing.records.length > 0) {
        // 收集当天所有记录的图片
        const allImages: string[] = [];
        for (const record of existing.records) {
          if (record.images && Array.isArray(record.images) && record.images.length > 0) {
            allImages.push(...record.images);
          } else if (record.imageUrl) {
            allImages.push(record.imageUrl);
          }
        }
        // 收集当天所有记录的股票代码（去重）
        const allStocks: Array<{code: string; name: string}> = [];
        const seenCodes = new Set<string>();
        for (const record of existing.records) {
          if (record.stockCodes && Array.isArray(record.stockCodes)) {
            for (const s of record.stockCodes) {
              if (s.code && !seenCodes.has(s.code)) {
                seenCodes.add(s.code);
                allStocks.push(s);
              }
            }
          }
        }
        // 优先显示图片，若只有股票则显示股票弹窗
        if (allImages.length > 0) {
          setPreviewImages(allImages);
          setPreviewImageIndex(0);
          setShowImagePreview(true);
        } else if (allStocks.length > 0) {
          setPreviewStocks(allStocks);
          setShowStockPreview(true);
        }
      }
      return;
    }

    // 注意：管理员在暂停日期之后仍可继续登记（暂停只冻结周期/年化，不拦截日历登记）
    if (existing && existing.records.length > 0) {
      // 已有记录：跳转编辑第一条记录
      const recordId = existing.records[0].id;
      let editUrl = `/ledger/${ledgerId}/add?edit=${recordId}`;
      if (selectedTagId) editUrl += `&categoryId=${selectedTagId}`;
      setLocation(editUrl);
    } else {
      let url = `/ledger/${ledgerId}/add?date=${dateStr}`;
      if (selectedTagId) url += `&categoryId=${selectedTagId}`;
      setLocation(url);
    }
  };

  // ─── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#FAF3ED" }}>
      {/* ── 顶部红色区域 ── */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        {/* 用户信息行 + 标签下拉（直接顶部，无返回栏） */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-3">
          {/* 头像（管理员可点击切换视角） */}
          <div
            className="flex-shrink-0 relative"
            onClick={() => { if (canSwitchView) { setViewAsSearch(''); setShowViewAsPicker(true); } }}
            style={{ cursor: canSwitchView ? 'pointer' : 'default' }}
          >
            {(() => {
              const viewTarget = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
              return viewTarget ? (
                <UserAvatar username={viewTarget.username} avatar={viewTarget.avatar} nickname={viewTarget.nickname} size="lg" />
              ) : user ? (
                <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="lg" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>?</div>
              );
            })()}
            {canSwitchView && !viewAsUserId && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                <Users className="w-2.5 h-2.5" style={{ color: '#D32F2F' }} />
              </div>
            )}
          </div>

          {/* 用户名 + 操作按鈕 + 标签下拉（同行） */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
            <div className="text-base font-semibold truncate">
              {(() => {
                const viewTarget = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
                return viewTarget ? (viewTarget.nickname || viewTarget.username) : (user?.nickname || user?.username || "用户");
              })()}
            </div>

            </div>

            {/* 右侧：操作按鈕 + 返回按鈕 + 标签下拉 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 数字B快捷按钮（跳转52号账本）——最左边 */}
              {myShortcuts?.digitalB && (
                <div
                  className="w-8 h-8 rounded-full cursor-pointer overflow-hidden flex-shrink-0"
                  style={{ border: '1.5px solid rgba(255,255,255,0.5)', position: 'relative' }}
                  onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/52'); }}
                  title="数字B"
                >
                  <img
                    src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/btc-icon-trimmed.png"
                    alt="数字B"
                    style={{ width: '105%', height: '105%', objectFit: 'cover', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              )}
              {/* 世界杯快捷按钮（所有账本通用） */}
              {(myShortcuts as any)?.worldCup && (
                <div
                  className="w-8 h-8 rounded-full cursor-pointer overflow-hidden flex-shrink-0"
                  style={{ border: '1.5px solid rgba(255,255,255,0.5)', position: 'relative' }}
                  onClick={() => setLocation('/world-cup')}
                  title="FIFA World Cup 2026"
                >
                  <img
                    src="/wc2026-logo.png"
                    alt="World Cup"
                    style={{ width: '105%', height: '105%', objectFit: 'cover', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              )}
              {/* 59号账本快捷按钮（蓄水池股东）*/}
              {myShortcuts?.ledger59 && (
                <div
                  className="w-8 h-8 rounded-full cursor-pointer overflow-hidden flex-shrink-0"
                  style={{ border: '1.5px solid rgba(255,255,255,0.5)', position: 'relative' }}
                  onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/59'); }}
                  title="蓄水池股东"
                >
                  <img
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/gZMsAzlHHuDFuUTJ.png"
                    alt="蓄水池"
                    style={{ width: '105%', height: '105%', objectFit: 'cover', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              )}
              {/* 搜索和数据按钮已隐藏 */}
              {/* 设置按钮仅账本创建者（owner）可见，管理员不显示 */}
              {canSwitchView && !viewAsUserId && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <Settings className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>
        {/* 第二行：刷新 + 返回 + AI数据（平铺整行） */}
        <div className="px-4 pb-2 flex items-center gap-1.5">
              {/* 刷新按钮 */}
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center h-9 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                刷新
              </button>
              {/* 返回按钮 */}
              <button
                onClick={() => setLocation("/ledger")}
                className="flex-1 flex items-center justify-center h-9 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                返回
              </button>
              {/* AI数据按钮 */}
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/ai-database`)}
                className="flex-1 flex items-center justify-center h-9 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                AI数据
              </button>
              {/* 细则按钮 */}
              <button
                onClick={() => setShowRules(true)}
                className="flex-1 flex items-center justify-center h-9 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                细则
              </button>
        </div>


        {/* 4个统计卡片 */}
        <div className={`px-4 pb-3 grid gap-1.5 ${selectedTagId === null ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {selectedTagId === null ? (
            /* ─── 全部模式：价値 + 盈亏总计 + 保证金 ─── */
            <>
              {/* 价値（第一个） */}
              <div className="rounded-sm p-2 flex flex-col" style={{ backgroundColor: "rgba(15,23,42,0.45)" }}>
                {(() => {
                  const totalDividend = Object.values(dividendByTag).reduce((s: number, v: any) => s + Number(v), 0);
                  const value = allTagsStats.diff - totalDividend;
                  return (
                    <>
                      <div className="text-[10px] opacity-75 flex items-center justify-end gap-0.5 mb-1">实时价値 <button onClick={() => setShowAllModeHelp('value')} className="inline-flex items-center justify-center active:opacity-60"><HelpCircle className="w-3 h-3 text-white/60" /></button></div>
                      <div className="text-sm font-bold leading-tight text-right">
                        {value > 0 ? '+' : ''}￥{value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </>
                  );
                })()}
              </div>
              {/* 盈亏总计（第二个） */}
              <div className="rounded-sm p-2 flex flex-col" style={{ backgroundColor: "rgba(15,23,42,0.45)" }}>
                <div className="text-[10px] opacity-75 flex items-center justify-end gap-1 mb-1">实时波动 <button onClick={() => setShowAllModeHelp('pnl')} className="inline-flex items-center justify-center active:opacity-60"><HelpCircle className="w-3 h-3 text-white/60" /></button></div>
                <div className="text-sm font-bold leading-tight text-right">
                  {overviewTotalPnlRef.current > 0 ? '+' : ''}￥{overviewTotalPnlRef.current.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              {/* 保证金（第三个） */}
              <div className="rounded-sm p-2 flex flex-col" style={{ backgroundColor: "rgba(15,23,42,0.45)" }}>
                <div className="text-[10px] opacity-75 flex items-center justify-end gap-1 mb-1">历史保证金 <button onClick={() => setShowAllModeHelp('margin')} className="inline-flex items-center justify-center active:opacity-60"><HelpCircle className="w-3 h-3 text-white/60" /></button></div>
                {allTagsStats.hasCrypto ? (
                  <div className="text-sm font-bold leading-tight text-right">
                    {allTagsStats.cryptoDetails.map(d => `${d.amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${d.coin}`).join(' + ')}
                  </div>
                ) : (
                  <div className="text-sm font-bold leading-tight text-right">
                    ￥{allTagsStats.totalMargin.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>

            </>
          ) : (
            /* ─── 单标签模式：最新余额 + 保证金 + 初始金额 + 累计盈亏 ─── */
            <>
          {/* 最新余额（联动：原始余额 + 提现） */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">最新余额</div>
            <div className="text-base font-bold">
              {(() => {
                // 从 cumulativeMap 取最后一天的联动值（已按日期累进）
                const lastDate = stats.latestDate;
                const linkedBalance = lastDate && cumulativeMap.has(lastDate) ? cumulativeMap.get(lastDate)! : stats.latestBalance;
                return '¥' + linkedBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}
            </div>
            {stats.latestDate && (
              <div className="text-xs opacity-60 mt-0.5">
                {(() => {
                  const [y, m, d] = stats.latestDate.split("-");
                  return `${y}年${m}月${d}日`;
                })()}
              </div>
            )}
          </div>

          {/* 保证金 + 比例 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            {(() => {
              const tagName = selectedTag?.name;
              if (!tagName || !initialBalancesData?.balances) {
                return (
                  <>
                    <div className="text-xs opacity-75 mb-0.5">保证金</div>
                    <div className="text-base font-bold">¥0.00</div>
                  </>
                );
              }
              const val = initialBalancesData.balances[`${tagName}__margin`];
              const coinRaw = (initialBalancesData.balances as any)[`${tagName}__marginCoin`];
              const coin = coinRaw ? String(coinRaw) : '';
              const ratioVal = initialBalancesData.balances[`${tagName}__ratio`];
              const isCrypto = coin && CRYPTO_COINS_AA.includes(coin);
              const num = val !== undefined && val !== null ? Number(val) : null;

              if (isCrypto) {
                // 数字币模式：标题行显示「保证金  比例X%」，主值显示数量+币种，副行显示约等于人民币
                const price = aaCryptoPrices[coin];
                const cnyText = price && num !== null
                  ? '≈ ¥' + (num * price).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
                  : '≈ 获取中...';
                return (
                  <>
                    <div className="text-xs opacity-75 mb-0.5 flex items-center gap-2">
                      <span>保证金</span>
                      {ratioVal !== undefined && ratioVal !== null && (
                        <span className="opacity-80">比例 {Number(ratioVal).toFixed(1)}%</span>
                      )}
                    </div>
                    <div className="text-base font-bold">{num !== null ? `${num} ${coin}` : '0'}</div>
                    <div className="text-xs opacity-60 mt-0.5">{cnyText}</div>
                  </>
                );
              } else {
                // 法币模式：标题行只显示「保证金」，主值显示¥金额，副行显示比例
                return (
                  <>
                    <div className="text-xs opacity-75 mb-0.5">保证金</div>
                    <div className="text-base font-bold">
                      {num !== null ? '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '¥0.00'}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {ratioVal !== undefined && ratioVal !== null ? `比例 ${Number(ratioVal).toFixed(1)}%` : ''}
                    </div>
                  </>
                );
              }
            })()}
          </div>

          {/* 初始金额 */}
          <div className="rounded-xl p-2 relative" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5 flex items-center gap-1">
              {capitalHistory.length > 0 ? '当前本金' : '初始本金'}
              {capitalHistory.length > 0 && (
                <button
                  onClick={() => setShowCapitalHistory(true)}
                  className="inline-flex items-center justify-center active:opacity-60"
                  title="本金有变动，点击查看详情"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-black" fill="#FBBF24" />
                </button>
              )}
            </div>
            <div className="text-base font-bold">
              {(() => {
                const tagName = selectedTag?.name;
                if (!tagName || !initialBalancesData?.balances) return '未设置';
                const val = initialBalancesData.balances[tagName];
                if (val === undefined || val === null) return '未设置';
                const initialVal = Number(val);
                // 如果有本金变动，显示当前本金（初始 + 净变动）
                if (capitalHistory.length > 0) {
                  const netChange = capitalHistory.reduce((sum: number, r: any) => {
                    const amt = Number(r.amount) || 0;
                    return r.description?.startsWith('capital_add') ? sum + amt : sum - amt;
                  }, 0);
                  const currentCapital = initialVal + netChange;
                  return '¥' + currentCapital.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
                return '¥' + initialVal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}
            </div>
            {capitalHistory.length > 0 && (() => {
              const tagName = selectedTag?.name;
              const val = tagName && initialBalancesData?.balances ? initialBalancesData.balances[tagName] : null;
              if (val === undefined || val === null) return null;
              return (
                <div className="text-[10px] opacity-50 mt-0.5">
                  初始: ¥{Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
              );
            })()}
            {stats.startDate && (
              <div className="text-xs opacity-60 mt-0.5">
                {(() => {
                  const [y, m, d] = stats.startDate.split("-");
                  return `${y}年${m}月${d}日`;
                })()}
              </div>
            )}
          </div>

          {/* 累计盈亏 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5 flex items-center gap-1">
              累计盈亏
              {withdrawRecords.length > 0 && (
                <button
                  onClick={() => setShowWithdrawHistory(true)}
                  className="inline-flex items-center justify-center active:opacity-60"
                  title="有提现记录，点击查看详情"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-black" fill="#FBBF24" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div
                className="text-base font-bold"
                style={{ color: "#FFFFFF" }}
              >
                {stats.totalPnl > 0 ? "+" : stats.totalPnl < 0 ? "-" : ""}¥{Math.abs(stats.totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <button
                onClick={() => setShowPnlExplain(true)}
                className="inline-flex items-center justify-center active:opacity-60"
                title="查看计算详情"
              >
                <HelpCircle className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
            <div className="text-xs opacity-60 mt-0.5">
              收益率 {stats.returnRate >= 0 ? "+" : ""}{stats.returnRate.toFixed(2)}%
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* 标签下拉（白色区域顶部，整行，始终可见） */}
      {categories && categories.length > 0 && (
        <div className="px-3 pt-3">
          <div className="relative w-full">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className="w-full flex items-center justify-center gap-1 h-10 rounded-xl text-sm font-semibold transition-all bg-white shadow-sm"
              style={{ color: selectedTag ? '#D32F2F' : '#888888', border: '1px solid #E0E0E0' }}
            >
              <span>{selectedTagId === null ? '全部' : (() => { const alias = (initialBalancesData?.balances as any)?.[`${selectedTag?.name}__alias`]; return alias || selectedTag?.name || '全部'; })()}</span>
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
            </button>
            {showTagDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTagDropdown(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-lg z-50 bg-white" style={{ border: '1px solid #E0E0E0', maxHeight: 'calc(5 * 41px)', overflowY: 'scroll' }}>
                  <button onClick={() => { setSelectedTagId(null); setShowTagDropdown(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#FFEBEE]" style={{ color: selectedTagId === null ? '#D32F2F' : '#222222', fontWeight: selectedTagId === null ? 600 : 400, borderBottom: '1px solid #F5F5F5' }}>全部</button>
                  {[...categories].sort((a: any, b: any) => {
                    const balances = initialBalancesData?.balances ?? {};
                    const getIsPaused = (name: string) => {
                      const raw = (balances as any)[`${name}__pauseHistory`];
                      if (raw) { try { const h = JSON.parse(String(raw)); const last = h[h.length-1]; return !!last && !last.resumeDate; } catch { /* ignore */ } }
                      return !!(balances as any)[`${name}__pauseDate`];
                    };
                    const aPaused = getIsPaused(a.name);
                    const bPaused = getIsPaused(b.name);
                    if (aPaused && !bPaused) return 1;
                    if (!aPaused && bPaused) return -1;
                    return 0;
                  }).map((cat: any) => {
                    // 优先读 pauseHistory，兑容旧 pauseDate
                    const catPauseHistoryRaw = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${cat.name}__pauseHistory`] : null;
                    let catPauseHistory: Array<{pauseDate: string; resumeDate?: string}> = [];
                    if (catPauseHistoryRaw) { try { catPauseHistory = JSON.parse(String(catPauseHistoryRaw)); } catch { /* ignore */ } }
                    const catPauseDate = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${cat.name}__pauseDate`] : null;
                    if (catPauseHistory.length === 0 && catPauseDate) catPauseHistory = [{ pauseDate: String(catPauseDate) }];
                    const lastCatItem = catPauseHistory[catPauseHistory.length - 1];
                    const isCatPaused = !!lastCatItem && !lastCatItem.resumeDate;
                    let pauseInfo = '';
                    if (isCatPaused && lastCatItem) {
                      const [, m, d] = lastCatItem.pauseDate.split('-');
                      const pauseD = new Date(lastCatItem.pauseDate);
                      const today = new Date();
                      const diffDays = Math.floor((today.getTime() - pauseD.getTime()) / 86400000);
                      pauseInfo = `(${Number(m)}月${Number(d)}日暂停，已${diffDays}天)`;
                    }
                    return (
                      <button key={cat.id} onClick={() => { setSelectedTagId(cat.id); setShowTagDropdown(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#FFEBEE]" style={{ fontWeight: selectedTagId === cat.id ? 600 : 400, borderBottom: '1px solid #F5F5F5' }}>
                        <span style={{ color: selectedTagId === cat.id ? '#D32F2F' : '#222222' }}>{(initialBalancesData?.balances as any)?.[`${cat.name}__alias`] || cat.name}</span>
                        {isCatPaused && <span style={{ marginLeft: 4, fontSize: 11, color: '#1565C0' }}>{pauseInfo}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 可滚动内容区域（全部模式下隐藏） ── */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', display: selectedTagId === null ? 'none' : undefined }}>

      {/* ── 日历视图 ── */}
      <div className="mx-3 mt-2 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="px-3 pt-3 pb-2">
          {/* 月份导航 + 视图切换 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCalendarDate((prev) => {
                    let m = prev.month - 1, y = prev.year;
                    if (m < 0) { m = 11; y--; }
                    return { year: y, month: m };
                  })
                }
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronLeft className="w-3.5 h-3.5" style={{ color: "#D32F2F" }} />
              </button>
              <span
                className="text-sm font-semibold whitespace-nowrap"
                style={{ color: "#222222", minWidth: "72px", textAlign: "center" }}
              >
                {calendarDate.year}年{calendarDate.month + 1}月
              </span>
              <button
                onClick={() =>
                  setCalendarDate((prev) => {
                    let m = prev.month + 1, y = prev.year;
                    if (m > 11) { m = 0; y++; }
                    return { year: y, month: m };
                  })
                }
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronRight className="w-3.5 h-3.5" style={{ color: "#D32F2F" }} />
              </button>
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 flex-nowrap justify-end">
              {(["balance", "daily", "monthly", "yearly"] as const).map((mode) => {
                const active = calendarMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setCalendarMode(mode)}
                    className="px-2 py-1 rounded-lg text-xs font-medium transition-all flex items-center justify-center"
                    style={{
                      backgroundColor: active ? "#D32F2F" : "#F5F5F5",
                      color: active ? "#FFFFFF" : "#757575",
                    }}
                  >
                    {mode === "balance" ? (
                      <CircleDollarSign className="w-3.5 h-3.5" />
                    ) : (
                      { daily: "日", monthly: "月", yearly: "年" }[mode]
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 日视图 / 月视图 / 年视图 */}
          {(calendarMode === "balance" || calendarMode === "daily") && (
            <>
              {/* 横向可滑动日历：默认显示周一到周五，周六周日在屏幕外 */}
              <div
                ref={calendarScrollRef}
                style={{
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  touchAction: 'pan-x pan-y',
                }}
              >
                {/* 内容宽度 = 7/5 * 100% ≈ 140%，屏幕只显5列 */}
                <div style={{ width: 'calc(7 / 5 * 100%)' }}>
              {/* 星期标题 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px' }}>
                {["一", "二", "三", "四", "五", "六", "日"].map((d, i) => (
                  <div key={d} className="text-center py-1" style={{ fontSize: '11px', fontWeight: 500, color: i >= 5 ? '#BDBDBD' : '#757575' }}>
                    {d}
                  </div>
                ))}
              </div>
              {/* 日历格子 - 按周行渲染 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {calendarWeeks.map((week, weekIdx) => (
                  <div key={weekIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                    {week.map((day, colIdx) => {
                      if (day === null) return <div key={`empty-${weekIdx}-${colIdx}`} style={{ height: '50px' }} />;
                      const nonTradingLabel = getNonTradingLabel(day);
                      const isNonTrading = nonTradingLabel !== null;
                      const cellValue = getCellValue(day);
                      const hasRecord = cellValue !== null;
                      const todayMark = isToday(day);
                      // 字体颜色逻辑
                      let valueColor = "#D32F2F";
                      if (hasRecord) {
                        const dateStr = getDateStr(day);
                        if (calendarMode === "daily") {
                          const todayData = dayMap.get(dateStr);
                          const allDates = Array.from(dayMap.keys()).sort();
                          const idx2 = allDates.indexOf(dateStr);
                          if (todayData && idx2 > 0) {
                            const prevData = dayMap.get(allDates[idx2 - 1])!;
                            const diff = (todayData.expense + todayData.income) - (prevData.expense + prevData.income);
                            valueColor = diff > 0 ? "#D32F2F" : diff < 0 ? "#4CAF50" : "#9E9E9E";
                          } else {
                            valueColor = "#9E9E9E";
                          }
                        } else {
                          const allDates = Array.from(dayMap.keys()).sort();
                          const idx2 = allDates.indexOf(dateStr);
                          const tagStartDate = selectedTag?.name && initialBalancesData?.balances
                            ? String(initialBalancesData.balances[`${selectedTag.name}__startDate`] ?? '')
                            : '';
                          const isFirstRecord = idx2 === 0;
                          const isStartDate = tagStartDate && dateStr === tagStartDate;
                          if (isFirstRecord || isStartDate) {
                            valueColor = "#222222";
                          } else if (idx2 > 0) {
                            const todayData = dayMap.get(dateStr)!;
                            const prevData = dayMap.get(allDates[idx2 - 1])!;
                            const diff = (todayData.expense + todayData.income) - (prevData.expense + prevData.income);
                            valueColor = diff > 0 ? "#D32F2F" : diff < 0 ? "#4CAF50" : "#9E9E9E";
                          }
                        }
                      }
                      const pauseDateStr = selectedTagPauseDate;
                      const endDateStr = selectedTagEndDate;
                      const dayDateStr2 = getDateStr(day);
                      // 暂停标志显示在「暂停标志日」(暂停日，非交易日则顺延到下一交易日)那一格，即使该格本身是非交易日也强制显示蓝标
                      const isPauseDay = pauseMarkDatesSet.has(dayDateStr2);
                      const isResumeDay = resumeMarkDatesSet.has(dayDateStr2);
                      const isPausedAfter = false; // 暂停后不再灰色，管理员可继续登记
                      const cellBg = isPauseDay ? '#1565C0'
                        : isResumeDay ? '#1B5E20'
                        : isNonTrading ? '#F0F0F0'
                        : todayMark ? '#FFF3E0' : '#F9F9F9';
                      const cellBorder = isPauseDay ? '1.5px solid #1565C0'
                        : isResumeDay ? '1.5px solid #1B5E20'
                        : isNonTrading ? '1px solid #E0E0E0'
                        : todayMark ? '1.5px solid #D32F2F' : '1px solid #F0F0F0';
                      const dayNumColor = isNonTrading
                        ? '#BDBDBD'
                        : todayMark ? '#D32F2F' : '#222222';
                      const dayDateStr = getDateStr(day);
                      const dayData = dayMap.get(dayDateStr);
                      const hasImages = !isNonTrading && dayData?.records?.some((r: any) => {
                        if (r.images && Array.isArray(r.images) && r.images.length > 0) return true;
                        if (r.imageUrl) return true;
                        return false;
                      });
                      const hasStocks = !isNonTrading && dayData?.records?.some((r: any) => {
                        return r.stockCodes && Array.isArray(r.stockCodes) && r.stockCodes.length > 0;
                      });
                      const dotColor = (hasImages && hasStocks) ? '#7B1FA2' : hasImages ? '#D32F2F' : hasStocks ? '#1565C0' : null;
                      return (
                        <button
                          key={day}
                          onClick={() => isNonTrading ? undefined : handleDayClick(day)}
                          disabled={isNonTrading}
                          className="rounded-lg flex flex-col items-center justify-center transition-all active:scale-95"
                          style={{
                            height: '50px',
                            backgroundColor: cellBg,
                            border: cellBorder,
                            padding: '3px 2px',
                            cursor: isNonTrading ? 'default' : 'pointer',
                            position: 'relative',
                          }}
                        >
                          {isPauseDay ? (
                            <>
                              <PauseCircle style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
                              {hasRecord && (
                                <span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.1, color: '#FFFFFF', maxWidth: '100%', overflow: 'visible', whiteSpace: 'nowrap', display: 'block', textAlign: 'center', marginTop: '1px' }}>{cellValue}</span>
                              )}
                            </>
                          ) : isResumeDay ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5,3 19,12 5,21" fill="#FFFFFF" />
                            </svg>
                          ) : (
                            <>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginBottom: '1px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1, color: dayNumColor }}>{day}</span>
                                {dotColor && (
                                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, display: 'inline-block' }} />
                                )}
                                {changeDates.has(dayDateStr) && (
                                  <span style={{ width: '10px', height: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="10" height="10" viewBox="0 0 20 20">
                                      <polygon points="10,2 19,18 1,18" fill="#FBBF24" stroke="#222" strokeWidth="1.5" />
                                      <text x="10" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#222">!</text>
                                    </svg>
                                  </span>
                                )}
                              </span>
                              {isNonTrading ? (
                                <span style={{ fontSize: '9px', fontWeight: 400, lineHeight: 1.1, color: '#BDBDBD', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
                                  {nonTradingLabel}
                                </span>
                              ) : hasRecord ? (
                                <span style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.1, color: (() => {
                                  // 判断当前日期是否在某个暂停段内（暂停后、重启前）
                                  const isInPausedSegment = selectedTagPauseHistory.some(item => {
                                    if (!item.pauseDate) return false;
                                    if (dayDateStr2 <= item.pauseDate) return false; // 暂停日当天不算在暂停段内
                                    if (item.resumeDate && dayDateStr2 >= item.resumeDate) return false; // 重启日及之后不算
                                    return true;
                                  });
                                  return isInPausedSegment ? '#222222' : valueColor;
                                })(), maxWidth: '100%', overflow: 'visible', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
                                  {cellValue}
                                </span>
                              ) : null}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              </div>{/* end 内容宽度容器 */}
              </div>{/* end 横向滑动容器 */}
            </>
          )}

          {/* 月视图：12个月份格 - 显示该月最后一条与上一个有数据月的最后一条的差値 */}
          {calendarMode === "monthly" && (() => {
            const { year } = calendarDate;
            const months = Array.from({ length: 12 }, (_, i) => i + 1);
            // 按日期升序排列所有数据
            const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
            // 整个账本只有一条数据时，所有月都不显示差値
            const totalCount = sorted.length;
            // 每个月的最后一条数据的累计余额
            const monthLastCum = new Map<string, number>();
            sorted.forEach((d) => {
              const ym = d.date.slice(0, 7);
              monthLastCum.set(ym, cumulativeMap.get(d.date) ?? 0);
            });
            // 所有有数据的月份（升序）
            const allMonths = Array.from(monthLastCum.keys()).sort();
            return (
              <div className="grid grid-cols-4 gap-1.5">
                {months.map((m) => {
                  const ym = `${year}-${String(m).padStart(2, "0")}`;
                  const hasData = monthLastCum.has(ym);
                  const nowM = new Date().getMonth() + 1;
                  const nowY = new Date().getFullYear();
                  const isCurrent = year === nowY && m === nowM;
                  // 计算差値：该月最后一条 - 上一个有数据月的最后一条
                  let diff: number | null = null;
                  if (hasData && totalCount > 1) {
                    const idx = allMonths.indexOf(ym);
                    if (idx > 0) {
                      const prevYm = allMonths[idx - 1];
                      diff = (monthLastCum.get(ym) ?? 0) - (monthLastCum.get(prevYm) ?? 0);
                    }
                    // idx === 0 表示是第一个月，但如果还有后续月也不显示（无前序可比）
                  }
                  const sign = diff !== null ? (diff > 0 ? "+" : diff < 0 ? "-" : "") : "";
                  const color = diff !== null ? (diff > 0 ? "#4CAF50" : diff < 0 ? "#F44336" : "#9E9E9E") : "#9E9E9E";
                  return (
                    <div
                      key={m}
                      className="rounded-lg flex flex-col items-center justify-center py-2"
                      style={{
                        height: '58px',
                        backgroundColor: hasData ? "#FFEBEE" : "#F9F9F9",
                        border: isCurrent ? "1.5px solid #D32F2F" : "1px solid #F0F0F0",
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 500, color: isCurrent ? "#D32F2F" : "#222222" }}>{m}月</span>
                      {diff !== null && (
                        <span className="font-semibold mt-0.5" style={{ fontSize: "12px", color }}>
                          {sign}{String(Math.floor(Math.abs(diff)))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 年视图：显示所有有数据的年份，显示该年所有记录的净盈亏总和 */}
          {calendarMode === "yearly" && (() => {
            const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
            // 按年汇总每年的净盈亏（income - expense）
            const yearNetMap = new Map<string, number>();
            sorted.forEach((d) => {
              const y = d.date.slice(0, 4);
              yearNetMap.set(y, (yearNetMap.get(y) ?? 0) + (d.income - d.expense));
            });
            const allYears = Array.from(yearNetMap.keys()).sort();
            if (allYears.length === 0) return <div className="text-xs text-gray-400 py-4 text-center">暂无数据</div>;
            const nowY = String(new Date().getFullYear());
            return (
              <div className="grid grid-cols-3 gap-1.5">
                {allYears.map((y) => {
                  const net = yearNetMap.get(y) ?? 0;
                  const sign = net > 0 ? "+" : net < 0 ? "-" : "";
                  const color = net > 0 ? "#D32F2F" : net < 0 ? "#4CAF50" : "#9E9E9E";
                  return (
                    <div
                      key={y}
                      className="rounded-lg flex flex-col items-center justify-center py-2"
                      style={{
                        height: '58px',
                        backgroundColor: "#F9F9F9",
                        border: y === nowY ? "1.5px solid #D32F2F" : "1px solid #F0F0F0",
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 500, color: y === nowY ? "#D32F2F" : "#222222" }}>{y}年</span>
                      <span className="font-semibold mt-0.5" style={{ fontSize: "12px", color }}>
                        {formatMoney(Math.abs(net), sign)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── 余额变化曲线 ── */}
      <div
        className="mx-3 mt-2 rounded-2xl shadow-sm mb-4"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        {/* 头部：标题 + 最新余额展示 */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>余额走势</span>
              {selectedTag && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>
                  {selectedTag.name}
                </span>
              )}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "#9E9E9E" }}>
              {calendarMode === 'balance' ? '当月日度余额变化' : calendarMode === 'daily' ? '当月日盈亏走势' : calendarMode === 'monthly' ? '全年月度盈亏' : '全部记录余额走势'}
            </div>
          </div>
          {/* 日盈亏模式：显示当月所有交易日盈亏累加总和；月/年模式：显示区间变化；余额模式：不显示数字 */}
          {calendarMode === 'daily' && (() => {
            // 日盈亏模式：当月所有交易日的 pnl 累加总和
            const { year, month } = calendarDate;
            const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
            const totalPnl = filteredTransactions
              .filter((d) => d.date.startsWith(monthPrefix))
              .reduce((sum, d) => sum + (d.income - d.expense), 0);
            const isUp = totalPnl >= 0;
            return (
              <div className="text-right">
                <div className="text-base font-bold" style={{ color: isUp ? "#D32F2F" : "#4CAF50" }}>
                  {isUp ? '+' : ''}¥{totalPnl.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px]" style={{ color: "#9E9E9E" }}>当月盈亏合计</div>
              </div>
            );
          })()}
          {(calendarMode === 'monthly' || calendarMode === 'yearly') && chartData.filter((d: any) => d.balance !== null).length > 0 && (() => {
            const validPoints = chartData.filter((d: any) => d.balance !== null);
            const latest = validPoints[validPoints.length - 1];
            const first = validPoints[0];
            const diff = latest.balance - first.balance;
            const isUp = diff >= 0;
            return (
              <div className="text-right">
                <div className="text-base font-bold" style={{ color: isUp ? "#D32F2F" : "#4CAF50" }}>
                  {isUp ? '+' : ''}¥{diff.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px]" style={{ color: "#9E9E9E" }}>区间变化</div>
              </div>
            );
          })()}
        </div>

        {chartData.filter((d: any) => d.balance !== null).length === 0 ? (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: "#BDBDBD" }}
          >
            {selectedTag ? `「${selectedTag.name}」暂无记录` : "暂无数据，点击日历格子添加记录"}
          </div>
        ) : (() => {
          // 计算Y轴自适应范围：取有效数据的最大最小值，上下各留约15%余量
          const validBalances = chartData
            .map((d: any) => d.balance)
            .filter((v: any) => v !== null && v !== undefined) as number[];
          const costLine = stats.initialBalance > 0 ? stats.initialBalance : undefined;
          let yMin: number | undefined = undefined;
          let yMax: number | undefined = undefined;
          if (validBalances.length > 0) {
            const allValues = costLine ? [...validBalances, costLine] : validBalances;
            const dataMin = Math.min(...allValues);
            const dataMax = Math.max(...allValues);
            const range = dataMax - dataMin;
            const padding = range > 0 ? range * 0.15 : dataMax * 0.02;
            yMin = dataMin - padding;
            yMax = dataMax + padding;
          }
          // 计算成本线在Y轴中的相对位置（用于渐变色分界点）
          // recharts的linearGradient y1=0是顶部，y1=1是底部
          const costLineOffset = (costLine !== undefined && yMin !== undefined && yMax !== undefined)
            ? Math.max(0, Math.min(1, (yMax - costLine) / (yMax - yMin)))
            : 0.5;
          return (
          <div className="px-1 pb-4" style={{ touchAction: 'pan-y' }} onTouchMove={(e) => { e.stopPropagation(); }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  {/* 成本线以上红色渐变，以下绿色渐变 */}
                  <linearGradient id="aaBalanceSplitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D32F2F" stopOpacity={0.35} />
                    <stop offset={`${(costLineOffset * 100).toFixed(1)}%`} stopColor="#D32F2F" stopOpacity={0.12} />
                    <stop offset={`${(costLineOffset * 100).toFixed(1)}%`} stopColor="#4CAF50" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.35} />
                  </linearGradient>
                  <filter id="chartGlow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#F0F0F0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#BDBDBD", fontWeight: 400 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#BDBDBD", fontWeight: 400 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
                  }
                  width={42}
                  domain={yMin !== undefined && yMax !== undefined ? [yMin, yMax] : ['auto', 'auto']}
                  tickCount={4}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1A1A1A",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "12px",
                    color: "#FFFFFF",
                    padding: "8px 12px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                  }}
                  labelStyle={{ color: "#9E9E9E", fontSize: "10px", marginBottom: 2 }}
                  itemStyle={{ color: "#FFFFFF", fontWeight: 600 }}
                  formatter={(value: number) => [
                    `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
                    "余额",
                  ]}
                  cursor={{ stroke: "rgba(211,47,47,0.3)", strokeWidth: 1, strokeDasharray: "4 2" }}
                />
                {/* 成本线（初始金额水平基准线） */}
                {costLine !== undefined && (
                  <ReferenceLine
                    y={costLine}
                    stroke="#888888"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    label={{
                      value: `成本 ${Math.abs(costLine) >= 10000 ? (costLine / 10000).toFixed(0) + '万' : costLine}`,
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: '#888888',
                      dy: -4,
                    }}
                  />
                )}
                {/* 余额走势线：成本线以上红，以下绿 */}
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={validBalances.length > 0 && validBalances[validBalances.length - 1] >= (costLine ?? 0) ? "#D32F2F" : "#4CAF50"}
                  strokeWidth={2.5}
                  fill="url(#aaBalanceSplitGradient)"
                  connectNulls={true}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#FFFFFF",
                    stroke: validBalances.length > 0 && validBalances[validBalances.length - 1] >= (costLine ?? 0) ? "#D32F2F" : "#4CAF50",
                    strokeWidth: 2.5,
                    filter: "url(#chartGlow)",
                  }}
                  baseValue={costLine ?? yMin}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          );
        })()}
      </div>

      </div>{/* end 可滚动内容区域 */}

      {/* ── 全部模式：多线盈亏增长图表 ── */}
      {selectedTagId === null && (
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* ── 标签周期年化表格（在滚动容器内） ── */}
          {allTagsChartData.length > 0 && (
          <div className="mx-3 mt-3 rounded-2xl shadow-sm mb-4" style={{ backgroundColor: '#FFFFFF' }}>
          {/* 冻结头部：Tab行 + 表头行共用一个 sticky 容器，彻底消除缝隙 */}
          <div style={{ position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 20 }}>
          <div className="flex border-b" style={{ borderColor: '#F5F5F5' }}>
            {(['overview', 'calendar', 'chart'] as const).map((tab) => {
              const labels = { overview: '概览', calendar: '日历图', chart: '走势图' };
              const active = overviewTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setOverviewTab(tab)}
                  className="flex-1 py-2.5 text-sm font-medium transition-all"
                  style={{
                    color: active ? '#D32F2F' : '#9E9E9E',
                    borderBottom: active ? '2px solid #D32F2F' : '2px solid transparent',
                    backgroundColor: 'transparent',
                  }}
                >{labels[tab]}</button>
              );
            })}
          </div>
          </div>{/* 关闭大sticky容器 */}
          {/* 概览表格数据行 */}
          {overviewTab === 'overview' && (() => {
            const visibleTags = allTagsChartData.filter(tag => tag.points.length > 0);
            const validTags = visibleTags.filter(t => t.marginCny > 0);
            // 计算每个 tag 的数据
            const tagData = visibleTags.map((tag, idx) => {
              const configStartDate = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__startDate`] ?? '') : '';
              const firstDate = configStartDate || tag.points[0]?.date;
              const configPauseDate = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__pauseDate`] ?? '') : '';
              // 读取 pauseHistory，兼容旧 pauseDate
              const pauseHistoryRaw2 = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${tag.name}__pauseHistory`] : null;
              let tagPauseHistory2: Array<{ pauseDate: string; resumeDate?: string }> = [];
              if (pauseHistoryRaw2) {
                try { tagPauseHistory2 = JSON.parse(String(pauseHistoryRaw2)); } catch { /* ignore */ }
              } else if (configPauseDate) {
                tagPauseHistory2 = [{ pauseDate: configPauseDate }];
              }
              // 分段合计天数
              const today2 = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              let endDate = today2;
              let isPaused = false;
              let days = 0;
              if (firstDate) {
                if (tagPauseHistory2.length === 0) {
                  days = Math.max(1, Math.round((new Date(today2).getTime() - new Date(firstDate).getTime()) / 86400000) + 1);
                } else {
                  let segStart = firstDate;
                  for (const item of tagPauseHistory2) {
                    if (!item.pauseDate || item.pauseDate <= segStart) continue;
                    const pauseD = new Date(item.pauseDate);
                    pauseD.setDate(pauseD.getDate() - 1);
                    const segEnd = pauseD.toISOString().slice(0, 10);
                    if (segEnd >= segStart) {
                      days += Math.round((new Date(segEnd).getTime() - new Date(segStart).getTime()) / 86400000) + 1;
                    }
                    segStart = item.resumeDate ?? '';
                  }
                  const lastItem2 = tagPauseHistory2[tagPauseHistory2.length - 1];
                  if (lastItem2.resumeDate && lastItem2.resumeDate <= today2) {
                    days += Math.max(1, Math.round((new Date(today2).getTime() - new Date(lastItem2.resumeDate).getTime()) / 86400000) + 1);
                    isPaused = false;
                  } else if (!lastItem2.resumeDate) {
                    isPaused = true;
                  }
                  days = Math.max(1, days);
                  if (isPaused && lastItem2.pauseDate) {
                    const pauseD2 = new Date(lastItem2.pauseDate);
                    pauseD2.setDate(pauseD2.getDate() - 1);
                    endDate = pauseD2.toISOString().slice(0, 10);
                  }
                }
              }
              // 读取 pauseHistory 用于回报冻结
              const pnlPauseHistoryRaw = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${tag.name}__pauseHistory`] : null;
              let pnlPauseHistory: Array<{ pauseDate: string; resumeDate?: string }> = [];
              if (pnlPauseHistoryRaw) { try { pnlPauseHistory = JSON.parse(String(pnlPauseHistoryRaw)); } catch { /* ignore */ } }
              else if (configPauseDate) { pnlPauseHistory = [{ pauseDate: configPauseDate }]; }
              // 计算有效截止日期：若当前处于暂停段，取最近一次暂停日；若重启后则取今天
              const pnlLastItem = pnlPauseHistory[pnlPauseHistory.length - 1];
              const pnlIsPaused = !!pnlLastItem && !pnlLastItem.resumeDate;
              const pnlCutoffDate = pnlIsPaused && pnlLastItem.pauseDate ? pnlLastItem.pauseDate : null;
              // latestPnl：暂停时取暂停日当天或之前的最后一条，否则取最新一条
              const _effectivePoints = pnlCutoffDate
                ? tag.points.filter((p: any) => p.date <= pnlCutoffDate)
                : tag.points;
              const _latestPoint = _effectivePoints[_effectivePoints.length - 1];
              const _prevPoint = _effectivePoints.length >= 2 ? _effectivePoints[_effectivePoints.length - 2] : null;
              const latestPnl = _latestPoint?.pnl ?? 0;
              const latestDate = _latestPoint?.date ?? null;
              // 原始账户金额（日历格子里填的数字）
              const latestBalance = (_latestPoint as any)?.balance ?? null;
              const prevBalance = (_prevPoint as any)?.balance ?? null;
              // 占比（用于今日变动计算）
              const _tagRatio = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${tag.name}__ratio`] ?? 0) : 0;
              // 今日变动 = (昨日balance - 今日balance) × 占比%
              // 用户与标签对赌，标签账户上升则用户亏，所以符号取反
              const prevPnl = tag.points.length >= 2 ? (tag.points[tag.points.length - 2]?.pnl ?? 0) : 0;
              // 今日变动：有balance数据时乘以占比（ratio=0时结果为0）；无balance数据时fallback到pnl差值再乘ratio
              const todayPnl = (latestBalance !== null && prevBalance !== null)
                ? (prevBalance - latestBalance) * (_tagRatio / 100)
                : (_tagRatio > 0 && tag.points.length > 0 ? (latestPnl - prevPnl) * (_tagRatio / 100) : (_tagRatio === 0 ? 0 : (tag.points.length > 0 ? latestPnl - prevPnl : null)));
              const annualized = tag.marginCny > 0 && days > 0 ? (latestPnl / tag.marginCny / days) * 365 * 100 : null;
              const divAmt = dividendByTag[tag.name] ?? 0;
              return { tag, days, latestPnl, latestDate, todayPnl, prevPnl, latestBalance, prevBalance, annualized, divAmt, isLast: idx === visibleTags.length - 1, isPaused, firstDate, endDate };
            });
            // 排序逻辑：默认（无手动排序）时暂停的排最下面；用户手动排序时参与全局排序
            const sortedTagData = overviewSort ? [...tagData].sort((a, b) => {
              let va = 0, vb = 0;
              if (overviewSort.col === 'days') { va = a.days; vb = b.days; }
              else if (overviewSort.col === 'ratio') {
                const ra = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${a.tag.name}__ratio`] ?? 0) : 0;
                const rb = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${b.tag.name}__ratio`] ?? 0) : 0;
                va = ra; vb = rb;
              }
              else if (overviewSort.col === 'amount') { va = a.tag.marginCny; vb = b.tag.marginCny; }
              else if (overviewSort.col === 'pnl') { va = a.latestPnl; vb = b.latestPnl; }
              else if (overviewSort.col === 'annualized') { va = a.annualized ?? -Infinity; vb = b.annualized ?? -Infinity; }
              else if (overviewSort.col === 'dividend') { va = a.divAmt; vb = b.divAmt; }
              return overviewSort.dir === 'desc' ? vb - va : va - vb;
            }) : [...tagData].sort((a, b) => {
              // 默认排序：暂停(isPaused)的排最下面
              if (a.isPaused && !b.isPaused) return 1;
              if (!a.isPaused && b.isPaused) return -1;
              return 0; // 同状态保持原始顺序
            });
            // 汇总行数据
            const totalMargin = validTags.reduce((s, t) => s + t.marginCny, 0);
            // totalPnl = 直接把每行显示的 latestPnl 加总（含灰色，不含灰色均统计）
            // tagData 在此之前已计算完毕，直接用
            const totalPnl = tagData.reduce((s, td) => s + td.latestPnl, 0);
            overviewTotalPnlRef.current = totalPnl;
            const weightedDenominator = validTags.reduce((s, t) => {
              const configSD = initialBalancesData?.balances ? String(initialBalancesData.balances[`${t.name}__startDate`] ?? '') : '';
              const firstDate = configSD || t.points[0]?.date;
              const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const days = firstDate ? Math.max(1, Math.round((new Date(today).getTime() - new Date(firstDate).getTime()) / 86400000) + 1) : 1;
              return s + t.marginCny * (days / 365);
            }, 0);
            const weightedAnnualized = weightedDenominator > 0 ? (totalPnl / weightedDenominator) * 100 : null;
            const totalDividend = Object.values(dividendByTag).reduce((s, v) => s + v, 0);
            // Grid 列定义：名称固定52px，其他列 minmax 自适应
            // 横向可滑动概览表：名称(sticky)/今日/回报/周期 第一屏平分；金额/年化/分红/占比全部溢出右侧可滑动
            // 名称列 sticky 固定左边，前4列平分屏幕宽度，其余列溢出到右侧
            // 列定义：名称(90px) | 今日(1fr) | 回报(1fr) | 周期(1fr) | 金额(70px溢出) | 年化(64px溢出) | 分红(64px溢出) | 占比(52px最右溢出)
            // 右侧滚动区 grid 列定义（去掉第一列 104px 名称列）
            const rightGridCols = 'minmax(52px,max-content) 1px minmax(52px,max-content) 1px minmax(52px,max-content) 1px minmax(64px,max-content) 1px minmax(64px,max-content) 1px 64px 1px 52px';
            // 右侧滚动区最小宽度：内容自动撑开，不换行
            const rightMinWidth = 'max-content';
            // 列标题日期：取所有 tag 中最新一条数据的日期（不管是不是当天）
            const _latestDataDate = visibleTags.reduce((maxDate, t) => {
              const d = t.points[t.points.length - 1]?.date ?? '';
              return d > maxDate ? d : maxDate;
            }, '');
            const todayColTitle = _latestDataDate
              ? (() => { const [, m, d] = _latestDataDate.split('-'); return `${Number(m)}/${Number(d)}`; })()
              : (() => { const n = new Date(Date.now() + 8 * 3600 * 1000); return `${n.getUTCMonth() + 1}/${n.getUTCDate()}`; })();
            // 内容宽度：前4列占满屏幕，金额/年化/分红/占比全部溢出到右侧
            // 前4列占满屏幕：104px名称 + 3个1px分隔线 + 3个1fr内容列 = 100%
            // 溢出列：金额(70px)+分隔(1px)+年化(64px)+分隔(1px)+分红(64px)+分隔(1px)+占比(52px) = 253px
            // 表头行高与数据行一致：py-2
            const cellCls = 'px-1 font-medium text-center flex items-center justify-center';
            const dataCellCls = 'px-1 text-center flex items-center justify-center';
            const rowHeight = 36; // 左右两侧统一行高，保证对齐
            const dataCellStyle = { whiteSpace: 'nowrap' as const };
            const dividerStyle = { backgroundColor: '#F0F0F0', width: 1, alignSelf: 'stretch' as const };
            // 排序箭头辅助
            const SortArrow = ({ col }: { col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend' }) => {
              if (!overviewSort || overviewSort.col !== col) return <span style={{ color: '#D0D0D0', fontSize: 7, marginLeft: 1 }}>▼</span>;
              return <span style={{ color: '#1565C0', fontSize: 7, marginLeft: 1 }}>{overviewSort.dir === 'desc' ? '▼' : '▲'}</span>;
            };
            const sortHeaderCls = cellCls + ' cursor-pointer select-none';
            return (
              <>
              {/* 左右分栏布局：左侧固定104px名称列 + 右侧横向滚动区 */}
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                {/* ── 左侧固定名称列 ── */}
                <div style={{ width: 104, flexShrink: 0, borderRight: '1px solid #F0F0F0', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column' }}>
                  {/* 表头名称格 */}
                  <div className={cellCls} style={{ borderBottom: '1px solid #F5F5F5', background: '#fff', flex: '0 0 auto', height: 36 }}>
                    <span style={{ color: '#9E9E9E', fontSize: 12 }}>名称</span>
                  </div>
                  {/* 数据行名称格 */}
                  {sortedTagData.map(({ tag, isLast }) => {
                    const rowBorder2 = isLast ? 'none' : '1px solid #F9F9F9';
                    const tagAlias2 = (initialBalancesData?.balances as any)?.[`${tag.name}__alias`] ?? '';
                    const displayName2 = tagAlias2 || tag.name;
                    return (
                      <div key={`${tag.name}-name-left`} className="flex items-center justify-start gap-1" style={{ borderBottom: rowBorder2, flex: '0 0 auto', height: 36, paddingLeft: 6, paddingRight: 2, overflow: 'hidden' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: tag.color, flexShrink: 0 }} />
                        <span
                          style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: '#999', textUnderlineOffset: '2px' }}
                          onPointerDown={(e) => {
                            let fired = false;
                            const t = setTimeout(() => {
                              fired = true;
                              e.stopPropagation();
                              setAliasEditTag(tag.name);
                              setAliasEditValue(tagAlias2);
                            }, 500);
                            const cancel = () => {
                              clearTimeout(t);
                              if (!fired) setAliasInfoTag(tag.name);
                            };
                            (e.target as HTMLElement).addEventListener('pointerup', cancel, { once: true });
                            (e.target as HTMLElement).addEventListener('pointermove', () => clearTimeout(t), { once: true });
                          }}
                        >{displayName2}</span>
                      </div>
                    );
                  })}
                  {/* 合计名称格 */}
                  {visibleTags.length > 0 && (
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', borderRadius: '0 0 0 16px', flex: '0 0 auto', height: 36 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#9E9E9E' }}>合计</span>
                    </div>
                  )}
                </div>
                {/* ── 右侧横向滚动区 ── */}
                <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x pan-y' }}>
                <div style={{ display: 'grid', gridTemplateColumns: rightGridCols, backgroundColor: '#fff', minWidth: rightMinWidth }}>
                  {/* 表头右侧各列 */}
                  <div className={cellCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }}><span style={{ color: '#9E9E9E' }}>{todayColTitle}</span></div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('pnl')}><span style={{ color: overviewSort?.col === 'pnl' ? '#1565C0' : '#9E9E9E' }}>回报￥</span><SortArrow col="pnl" /></div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('days')}><span style={{ color: overviewSort?.col === 'days' ? '#1565C0' : '#9E9E9E' }}>周期</span><SortArrow col="days" /></div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('amount')}><span style={{ color: overviewSort?.col === 'amount' ? '#1565C0' : '#9E9E9E' }}>金额￥</span><SortArrow col="amount" /></div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('annualized')}><span style={{ color: overviewSort?.col === 'annualized' ? '#1565C0' : '#9E9E9E' }}>年化</span><SortArrow col="annualized" /></div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('dividend')}>
                    <span style={{ color: '#1565C0', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '2px' }} onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledgerId}/aa-dividend-manage${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`); }}>分红￥</span><SortArrow col="dividend" />
                  </div>
                  <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                  <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12, height: rowHeight }} onClick={() => handleOverviewSort('ratio')}><span style={{ color: overviewSort?.col === 'ratio' ? '#1565C0' : '#9E9E9E' }}>占比</span><SortArrow col="ratio" /></div>
                  {/* 数据行右侧各列 */}
                {sortedTagData.map(({ tag, days, latestPnl, latestDate, todayPnl, prevPnl, latestBalance, prevBalance, annualized, divAmt, isLast, isPaused, firstDate, endDate }) => {
                      // 判断是否需要灰色：北京时间交易日 15:00后且最新数据不是今天
                      const _nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
                      const _todayBJ = _nowBJ.toISOString().slice(0, 10);
                      const _hourBJ = _nowBJ.getUTCHours();
                      const _dowBJ = _nowBJ.getUTCDay(); // 0=周日,6=周六
                      const _isTradeDay = _dowBJ >= 1 && _dowBJ <= 5;
                      const _isStale = _isTradeDay && _hourBJ >= 15 && latestDate !== _todayBJ;
                      // 是否当天已更新：该用户最新数据日期 = 全局最新日期
                      const _isTodayNonTradeDay = false; // 已废弃交易日判断
                      const _isTagUpdatedToday = latestDate === _latestDataDate;
                      const _showTodayPnl = todayPnl !== null;
                  const rowBorder = isLast ? 'none' : '1px solid #F9F9F9';
                  return (
                    <>
                      {/* 今日变动：已更新彩色，未更新灰色显示数字；可点击展示计算过程 */}
                      {(() => {
                        const _todayPnlColor = !_showTodayPnl || todayPnl === null ? '#BDBDBD'
                          : !_isTagUpdatedToday ? '#BDBDBD'
                          : todayPnl === 0 ? '#1A1A1A'
                          : todayPnl > 0 ? '#D32F2F' : '#388E3C';
                        const _todayPnlText = _showTodayPnl && todayPnl !== null
                          ? `${todayPnl < 0 ? '-' : ''}${Math.abs(todayPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
                          : '--';
                        // 占比
                        const _ratioNum = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${tag.name}__ratio`] ?? 0) : 0;
                        // 计算过程：(最新帐面值 - 上一天帐面值) × 占比%
                        // 帐面值 = pnl（已是对应用户占比后的值）
                        const _prevDate = tag.points.length >= 2 ? (tag.points[tag.points.length - 2]?.date ?? '') : '';
                        const _latestDateLabel = latestDate ? latestDate.slice(5).replace('-', '/') : '';
                        const _prevDateLabel = _prevDate ? _prevDate.slice(5).replace('-', '/') : '';
                        const _canShowTooltip = _showTodayPnl && todayPnl !== null;
                        return (
                          <div className={dataCellCls} style={{ borderBottom: rowBorder, position: 'relative', height: rowHeight }}>
                            <span
                              style={{ fontSize: 13, color: _todayPnlColor, cursor: _canShowTooltip ? 'pointer' : 'default',
                                textDecoration: _canShowTooltip ? 'underline' : 'none', textDecorationStyle: 'dashed',
                                textDecorationColor: _todayPnlColor, textUnderlineOffset: '2px', whiteSpace: 'normal', wordBreak: 'break-all', textAlign: 'center' }}
                              onClick={(e) => { if (_canShowTooltip) { e.stopPropagation(); setTooltipTodayPnlTag(tooltipTodayPnlTag === tag.name ? null : tag.name); } }}
                            >{_todayPnlText}</span>
                            {tooltipTodayPnlTag === tag.name && _canShowTooltip && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#1A1A1A', color: '#FFF', borderRadius: 6, padding: '5px 8px', whiteSpace: 'nowrap', fontSize: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', marginTop: 4, lineHeight: 1.6 }}>
                                <div style={{ color: '#BDBDBD', marginBottom: 2 }}>
                                  {_prevDateLabel ? `${_prevDateLabel} → ${_latestDateLabel}` : _latestDateLabel}
                                </div>
                                <div>
                                  {latestBalance !== null && prevBalance !== null ? (
                                    <>
                                      ({prevBalance.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} − {latestBalance.toLocaleString('zh-CN', { maximumFractionDigits: 0 })})
                                      {` × ${_ratioNum.toFixed(0)}%`}
                                    </>
                                  ) : (
                                    <>
                                      ({latestPnl.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} − {prevPnl.toLocaleString('zh-CN', { maximumFractionDigits: 0 })})
                                      {` × ${_ratioNum.toFixed(0)}%`}
                                    </>
                                  )}
                                  {' = '}
                                  <span style={{ color: todayPnl === 0 ? '#BDBDBD' : todayPnl > 0 ? '#FF8A80' : '#A5D6A7', fontWeight: 600 }}>
                                    {todayPnl < 0 ? '-' : ''}{Math.abs(todayPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 回报 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'normal', wordBreak: 'break-all', fontSize: 13, height: rowHeight }}>
                        {(() => {
                          const pnlColor = _isStale ? '#BDBDBD' : latestPnl > 0 ? '#D32F2F' : latestPnl < 0 ? '#388E3C' : '#BDBDBD';
                          const pnlText = latestPnl !== 0 ? `${latestPnl < 0 ? '-' : ''}${Math.abs(latestPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--';
                          const fmt = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}月${Number(dd)}日`; };
                          // 构建分段详情
                          const pnlHistoryForAlert = (() => {
                            const raw = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${tag.name}__pauseHistory`] : null;
                            if (raw) { try { return JSON.parse(String(raw)); } catch { /* ignore */ } }
                            const legacy = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__pauseDate`] ?? '') : '';
                            if (legacy) return [{ pauseDate: legacy }];
                            return [];
                          })() as Array<{ pauseDate: string; resumeDate?: string }>;
                          const canClick = !!firstDate;
                          const handlePnlClick = () => {
                            if (!firstDate) return;
                            const _ratio = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${tag.name}__ratio`] ?? 100) : 100;
                            const _tagAlias = (initialBalancesData?.balances as any)?.[`${tag.name}__alias`] ?? tag.name;
                            const _effectiveInitial = tag.initialBalance + (capitalByTag[tag.name] || 0);
                            const _capitalChange = capitalByTag[tag.name] || 0;
                            const _tagWithdraw = withdrawByTag[tag.name] || 0;
                            // 逐笔本金变动记录（从 transactionsData 中按标签名筛选）
                            const _capitalRecords: Array<{ date: string; amount: number; isAdd: boolean }> = [];
                            if (categories) {
                              (transactionsData || []).forEach((day: any) => {
                                (day.records || []).forEach((r: any) => {
                                  if (r.type === 'transfer' && r.description?.startsWith('capital_') && r.category === tag.name) {
                                    _capitalRecords.push({
                                      date: r.recordDate || day.date || '',
                                      amount: Math.abs(Number(r.amount) || 0),
                                      isAdd: r.description?.startsWith('capital_add'),
                                    });
                                  }
                                });
                              });
                              _capitalRecords.sort((a, b) => a.date.localeCompare(b.date));
                            }
                            const today3 = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                            const segments: typeof pnlDetailModal extends null ? never : NonNullable<typeof pnlDetailModal>['segments'] = [];
                            if (pnlHistoryForAlert.length === 0) {
                              // 无暂停：单段
                              const segStartPt = tag.points.find((p: any) => p.date >= firstDate);
                              const _localCutoff = (() => { const _h = pnlHistoryForAlert; const _last = _h[_h.length - 1]; return (_last && !_last.resumeDate && _last.pauseDate) ? _last.pauseDate : null; })();
                              const _localEffPts = _localCutoff ? tag.points.filter((p: any) => p.date <= _localCutoff) : tag.points;
                              const segEndPt = _localEffPts[_localEffPts.length - 1];
                              if (segStartPt && segEndPt) {
                                segments.push({
                                  segNo: 1,
                                  startDate: segStartPt.date,
                                  endDate: segEndPt.date,
                                  startBalance: (segStartPt as any).balance ?? 0,
                                  endBalance: (segEndPt as any).balance ?? 0,
                                  effectiveInitial: _effectiveInitial,
                                  pnl: latestPnl,
                                  isPaused: false,
                                });
                              }
                            } else {
                              let segStart = firstDate;
                              let segNo = 1;
                              for (const item of pnlHistoryForAlert) {
                                if (!item.pauseDate || item.pauseDate <= segStart) continue;
                                const segPts = tag.points.filter((p: any) => p.date >= segStart && p.date <= item.pauseDate);
                                const segStartPt = segPts[0];
                                const segEndPt = segPts[segPts.length - 1];
                                if (segStartPt && segEndPt) {
                                  const prevSegPts = tag.points.filter((p: any) => p.date < segStart);
                                  const prevSegPnl = prevSegPts.length > 0 ? prevSegPts[prevSegPts.length - 1].pnl : 0;
                                  // 第一段直接用 latestPnl（已按当前有效本金正确计算），避免 startDate 前的基准数据导致偏差
                                  const thisSegPnl = segNo === 1 ? latestPnl : (segEndPt.pnl - prevSegPnl);
                                  segments.push({
                                    segNo,
                                    startDate: segStartPt.date,
                                    endDate: segEndPt.date,
                                    startBalance: (segStartPt as any).balance ?? 0,
                                    endBalance: (segEndPt as any).balance ?? 0,
                                    effectiveInitial: _effectiveInitial,
                                    pnl: thisSegPnl,
                                    isPaused: !item.resumeDate,
                                    resumeDate: item.resumeDate,
                                  });
                                  segNo++;
                                }
                                segStart = item.resumeDate ?? '';
                              }
                              // 最后一段（若已重启）
                              const lastItem = pnlHistoryForAlert[pnlHistoryForAlert.length - 1];
                              if (lastItem.resumeDate && lastItem.resumeDate <= today3 && segStart) {
                                const segPts = tag.points.filter((p: any) => p.date >= segStart);
                                const segStartPt = segPts[0];
                                const segEndPt = segPts[segPts.length - 1];
                                if (segStartPt && segEndPt) {
                                  const prevSegPts = tag.points.filter((p: any) => p.date < segStart);
                                  const prevSegPnl = prevSegPts.length > 0 ? prevSegPts[prevSegPts.length - 1].pnl : 0;
                                  const thisSegPnl = segEndPt.pnl - prevSegPnl;
                                  segments.push({
                                    segNo,
                                    startDate: segStartPt.date,
                                    endDate: segEndPt.date,
                                    startBalance: (segStartPt as any).balance ?? 0,
                                    endBalance: (segEndPt as any).balance ?? 0,
                                    effectiveInitial: _effectiveInitial,
                                    pnl: thisSegPnl,
                                    isPaused: false,
                                  });
                                }
                              }
                            }
                            setPnlDetailModal({ tagName: tag.name, tagAlias: _tagAlias, ratio: _ratio, initialBalance: tag.initialBalance, capitalChange: _capitalChange, capitalRecords: _capitalRecords, tagWithdraw: _tagWithdraw, segments, totalPnl: latestPnl });
                          };
                          return (
                            <span
                              style={{ color: pnlColor, cursor: canClick ? 'pointer' : 'default', textDecoration: canClick ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: pnlColor, textUnderlineOffset: '2px' }}
                              onClick={canClick ? handlePnlClick : undefined}
                            >{pnlText}</span>
                          );
                        })()}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 周期（移到回报后面） */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13, height: rowHeight }}>
                        {(() => {
                          const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${Number(m)}月${Number(dd)}日`; };
                          const pauseHistoryForAlert = (() => {
                            const raw = initialBalancesData?.balances ? (initialBalancesData.balances as any)[`${tag.name}__pauseHistory`] : null;
                            if (raw) { try { return JSON.parse(String(raw)); } catch { /* ignore */ } }
                            const legacy = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__pauseDate`] ?? '') : '';
                            if (legacy) return [{ pauseDate: legacy }];
                            return [];
                          })();
                          const handleClick = () => {
                            if (!firstDate) return;
                            if (pauseHistoryForAlert.length === 0) {
                              alert(`${fmt(firstDate)} ~ 今天，共 ${days} 天`);
                            } else {
                              const today3 = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                              let lines: string[] = [];
                              let segStart = firstDate;
                              for (const item of pauseHistoryForAlert) {
                                if (!item.pauseDate || item.pauseDate <= segStart) continue;
                                const pauseD = new Date(item.pauseDate); pauseD.setDate(pauseD.getDate() - 1);
                                const segEnd = pauseD.toISOString().slice(0, 10);
                                const segDays = segEnd >= segStart ? Math.round((new Date(segEnd).getTime() - new Date(segStart).getTime()) / 86400000) + 1 : 0;
                                lines.push(`${fmt(segStart)} ~ ${fmt(segEnd)}（${segDays}天）`);
                                lines.push(`  ⏸ 暂停 ${fmt(item.pauseDate)}${item.resumeDate ? ` → ▶ 重启 ${fmt(item.resumeDate)}` : '（暂停中）'}`);
                                segStart = item.resumeDate ?? '';
                              }
                              const lastItem = pauseHistoryForAlert[pauseHistoryForAlert.length - 1];
                              if (lastItem.resumeDate && lastItem.resumeDate <= today3) {
                                const segDays2 = Math.max(1, Math.round((new Date(today3).getTime() - new Date(lastItem.resumeDate).getTime()) / 86400000) + 1);
                                lines.push(`${fmt(lastItem.resumeDate)} ~ 今天（${segDays2}天）`);
                              }
                              lines.push(`合计 ${days} 天`);
                              alert(lines.join('\n'));
                            }
                          };
                          return isPaused ? (
                            <span
                              style={{ display: 'inline-block', backgroundColor: '#1565C0', color: '#FFFFFF', borderRadius: 3, padding: '1px 3px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              onClick={handleClick}
                            >{days > 0 ? `${days}天` : '--'}</span>
                          ) : (
                            <span
                              style={{ color: '#424242', whiteSpace: 'nowrap', fontSize: 13, cursor: firstDate ? 'pointer' : 'default', textDecoration: firstDate ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#999', textUnderlineOffset: '2px' }}
                              onClick={handleClick}
                            >{days > 0 ? `${days}天` : '--'}</span>
                          );
                        })()}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 金额（周期后面） */}
                      <div className="px-1 flex flex-col items-center justify-center" style={{ borderBottom: rowBorder, height: rowHeight }}>
                        {tag.marginCny > 0 ? (
                          <>
                            <div
                              onClick={(e) => { e.stopPropagation(); setMarginNoteTag(tag.name); }}
                              style={{ fontSize: 13, lineHeight: 1, color: '#424242', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: '#999', textUnderlineOffset: '2px' }}
                            >{tag.marginCny.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}{(marginNoteCounts[tag.name] ?? 0) > 0 && (<sup style={{ fontSize: 9, color: '#1565C0', marginLeft: 1 }}>{marginNoteCounts[tag.name]}</sup>)}</div>
                            {tag.marginCoin && CRYPTO_COINS_AA.includes(tag.marginCoin) && tag.marginRaw !== null && (
                              <div style={{ fontSize: 9, marginTop: 2, lineHeight: 1, color: '#BDBDBD' }}>{tag.marginRaw} {tag.marginCoin}</div>
                            )}
                          </>
                        ) : (
                          <span
                            onClick={(e) => { e.stopPropagation(); setMarginNoteTag(tag.name); }}
                            style={{ fontSize: 13, color: '#424242', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: '#999', textUnderlineOffset: '2px' }}
                          >0</span>
                        )}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 年化 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13, color: _isStale || annualized === null ? '#BDBDBD' : annualized >= 0 ? '#D32F2F' : '#388E3C', height: rowHeight }}>
                        {annualized === null ? '--' : `${annualized >= 0 ? '+' : ''}${annualized.toFixed(1)}%`}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 分红 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'normal', wordBreak: 'break-all', fontSize: 13, color: divAmt > 0 ? '#D32F2F' : '#BDBDBD', height: rowHeight }}>
                        {divAmt > 0 ? (
                          <span
                            onClick={(e) => { e.stopPropagation(); setDividendNoteTag(tag.name); }}
                            style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: '#D32F2F', textUnderlineOffset: '2px' }}
                          >{divAmt.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}{(dividendNoteCounts[tag.name] ?? 0) > 0 && (<sup style={{ fontSize: 9, color: '#1565C0', marginLeft: 1 }}>{dividendNoteCounts[tag.name]}</sup>)}</span>
                        ) : '--'}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 占比（移到最右，默认屏幕外） */}
                      {(() => {
                        const ratioVal = initialBalancesData?.balances ? initialBalancesData.balances[`${tag.name}__ratio`] : undefined;
                        const ratioNum = ratioVal !== undefined && ratioVal !== null ? Number(ratioVal) : null;
                        const tagInitialBalance = tag.initialBalance ?? 0;
                        const actualAmt = ratioNum !== null && tagInitialBalance > 0 ? tagInitialBalance * (ratioNum / 100) : null;
                        return (
                          <div className={dataCellCls} style={{ borderBottom: rowBorder, position: 'relative', height: rowHeight }}>
                            <span
                              style={{ fontSize: 13, color: '#424242', cursor: ratioNum !== null ? 'pointer' : 'default', textDecoration: ratioNum !== null ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: '#999', textUnderlineOffset: '2px' }}
                              onClick={(e) => { if (ratioNum !== null) { e.stopPropagation(); setTooltipRatioTag(tooltipRatioTag === tag.name ? null : tag.name); } }}
                            >
                              {ratioNum !== null ? `${ratioNum.toFixed(0)}%` : '0%'}
                            </span>
                            {tooltipRatioTag === tag.name && ratioNum !== null && actualAmt !== null && (
                              <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 50, background: '#1A1A1A', color: '#FFF', borderRadius: 6, padding: '5px 8px', whiteSpace: 'nowrap', fontSize: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', marginBottom: 4 }}>
                                {tagInitialBalance.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} × {ratioNum.toFixed(0)}% = {actualAmt.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })}
                  {/* 汇总行右侧各列 */}
                {visibleTags.length > 0 && (
                  <>
                    {/* 今日变动合计（第1列，对应表头"当天X/X"）*/}
                    {(() => {
                      // 只统计有彩色数字的标签：已更新（latestDate === _latestDataDate）且 todayPnl 非零非空
                      const updatedTagsData = tagData.filter(td => td.latestDate === _latestDataDate && td.todayPnl !== null && td.todayPnl !== 0);
                      const staleTagsData = tagData.filter(td => td.latestDate !== _latestDataDate && td.tag.points.length > 0);
                      const totalTodayPnl = updatedTagsData.reduce((s, td) => s + (td.todayPnl ?? 0), 0);
                      const hasAny = updatedTagsData.length > 0;
                      return (
                        <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', position: 'relative', height: rowHeight }}>
                          <span
                            style={{ fontSize: 13, fontWeight: 600, color: !hasAny ? '#BDBDBD' : totalTodayPnl > 0 ? '#D32F2F' : totalTodayPnl < 0 ? '#388E3C' : '#BDBDBD', cursor: hasAny ? 'pointer' : 'default', textDecoration: hasAny ? 'underline' : 'none', textDecorationStyle: 'dashed', textDecorationColor: totalTodayPnl > 0 ? '#D32F2F' : '#388E3C', textUnderlineOffset: '2px' }}
                            onClick={(e) => { if (hasAny) { e.stopPropagation(); if (showTotalTodayTooltip) { setShowTotalTodayTooltip(false); setTotalTodayTooltipPos(null); } else { setShowTotalTodayTooltip(true); setTotalTodayTooltipPos({ x: e.clientX, y: e.clientY }); } } }}
                          >
                            {!hasAny ? '--' : (totalTodayPnl !== 0 ? `${totalTodayPnl < 0 ? '-' : ''}${Math.abs(totalTodayPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--')}
                          </span>
                          {showTotalTodayTooltip && hasAny && totalTodayTooltipPos && (
                            <div style={{ position: 'fixed', left: Math.min(totalTodayTooltipPos.x + 8, window.innerWidth - 160), bottom: window.innerHeight - totalTodayTooltipPos.y + 12, zIndex: 9999, background: '#1A1A1A', color: '#FFF', borderRadius: 8, padding: '8px 10px', whiteSpace: 'nowrap', fontSize: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', lineHeight: 1.8, minWidth: 140 }}
                              onClick={(e) => { e.stopPropagation(); setShowTotalTodayTooltip(false); setTotalTodayTooltipPos(null); }}
                            >
                              <div style={{ color: '#BDBDBD', marginBottom: 4, fontSize: 9 }}>点击关闭</div>
                              {updatedTagsData.length > 0 && (
                                <div>
                                  <div style={{ color: '#A5D6A7', marginBottom: 2 }}>✓ 已计入（{updatedTagsData.length}个）</div>
                                  {updatedTagsData.map(td => (
                                    <div key={td.tag.name} style={{ paddingLeft: 8, color: '#FFF' }}>
                                      {td.tag.name}：{(td.todayPnl ?? 0) >= 0 ? '+' : ''}{(td.todayPnl ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {staleTagsData.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  <div style={{ color: '#BDBDBD', marginBottom: 2 }}>✗ 未更新（{staleTagsData.length}个，不计入）</div>
                                  {staleTagsData.map(td => (
                                    <div key={td.tag.name} style={{ paddingLeft: 8, color: '#757575' }}>
                                      {td.tag.name}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 回报 */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', height: rowHeight }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: totalPnl > 0 ? '#D32F2F' : totalPnl < 0 ? '#388E3C' : '#BDBDBD' }}>
                        {totalPnl !== 0 ? `${totalPnl < 0 ? '-' : ''}${Math.abs(totalPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 周期 -- */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', height: rowHeight }}>
                      <span style={{ fontSize: 13, color: '#BDBDBD' }}>--</span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 金额：人民币汇总 */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', height: rowHeight }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{totalMargin.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 年化 */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', height: rowHeight }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: weightedAnnualized === null ? '#BDBDBD' : weightedAnnualized >= 0 ? '#D32F2F' : '#388E3C' }}>
                        {weightedAnnualized === null ? '--' : `${weightedAnnualized >= 0 ? '+' : ''}${weightedAnnualized.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 分红 */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', height: rowHeight }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: totalDividend > 0 ? '#D32F2F' : '#BDBDBD' }}>
                        {totalDividend > 0 ? `${totalDividend.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 占比 -- */}
                    <div className="px-1 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', borderRadius: '0 0 16px 0', height: rowHeight }}>
                      <span style={{ fontSize: 13, color: '#BDBDBD' }}>--</span>
                    </div>
                  </>
                )}
                </div>
                </div>
              </div>
              </>
            );
          })()}

          {/* ── 汇总日历（日历图 Tab）── */}
          {overviewTab === 'calendar' && allTagsChartData.filter(t => t.points.length > 0).length > 0 && (() => {
            // 构建每日汇总数据：按日期聚合所有标签的当日变动（用户视角 = 昨日balance - 今日balance × ratio）
            // 只计入「该日有数据 且 前一日也有数据」的标签
            const summaryDayMap = new Map<string, { total: number; tags: { name: string; val: number }[] }>();
            allTagsChartData.filter(t => t.points.length > 0).forEach(tag => {
              const _ratio = initialBalancesData?.balances ? Number(initialBalancesData.balances[`${tag.name}__ratio`] ?? 0) : 0;
              if (_ratio <= 0) return;
              tag.points.forEach((pt: any, idx: number) => {
                if (idx === 0) return; // 第一个点没有前一天，跳过
                const prevPt = tag.points[idx - 1] as any;
                if (prevPt.balance == null || pt.balance == null) return;
                const val = (prevPt.balance - pt.balance) * (_ratio / 100);
                const dateStr = pt.date;
                if (!summaryDayMap.has(dateStr)) summaryDayMap.set(dateStr, { total: 0, tags: [] });
                const entry = summaryDayMap.get(dateStr)!;
                entry.total += val;
                entry.tags.push({ name: tag.name, val });
              });
            });
            // 汇总日历的weeks计算
            const { year: sy, month: sm } = summaryCalendarDate;
            const sDaysInMonth = new Date(sy, sm + 1, 0).getDate();
            const sFirstDayRaw = new Date(sy, sm, 1).getDay();
            const sFirstDayMon = (sFirstDayRaw + 6) % 7;
            const sCells: (number | null)[] = [];
            for (let i = 0; i < sFirstDayMon; i++) sCells.push(null);
            for (let d = 1; d <= sDaysInMonth; d++) sCells.push(d);
            while (sCells.length % 7 !== 0) sCells.push(null);
            const sWeeks: (number | null)[][] = [];
            for (let i = 0; i < sCells.length; i += 7) sWeeks.push(sCells.slice(i, i + 7));
            const sGetDateStr = (day: number) => `${sy}-${String(sm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const sToday = new Date();
            return (
              <div style={{ backgroundColor: '#FFFFFF' }}>
                <div className="px-3 pt-3 pb-2">
                  {/* 月份导航 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSummaryCalendarDate(prev => { let m = prev.month - 1, y = prev.year; if (m < 0) { m = 11; y--; } return { year: y, month: m }; })} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}>
                        <ChevronLeft className="w-3.5 h-3.5" style={{ color: '#D32F2F' }} />
                      </button>
                      <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#222222', minWidth: '72px', textAlign: 'center' }}>{sy}年{sm + 1}月</span>
                      <button onClick={() => setSummaryCalendarDate(prev => { let m = prev.month + 1, y = prev.year; if (m > 11) { m = 0; y++; } return { year: y, month: m }; })} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}>
                        <ChevronRight className="w-3.5 h-3.5" style={{ color: '#D32F2F' }} />
                      </button>
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>每日汇总</span>
                  </div>
                  {/* 横向可滑动日历 */}
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x pan-y' }}>
                    <div style={{ width: 'calc(7 / 5 * 100%)' }}>
                      {/* 星期标题 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px' }}>
                        {['一','二','三','四','五','六','日'].map((d, i) => (
                          <div key={d} className="text-center py-1" style={{ fontSize: '11px', fontWeight: 500, color: i >= 5 ? '#BDBDBD' : '#757575' }}>{d}</div>
                        ))}
                      </div>
                      {/* 日历格子 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {sWeeks.map((week, wIdx) => (
                          <div key={wIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                            {week.map((day, cIdx) => {
                              if (day === null) return <div key={`se-${wIdx}-${cIdx}`} style={{ height: '50px' }} />;
                              const dateStr = sGetDateStr(day);
                              const entry = summaryDayMap.get(dateStr);
                              const val = entry?.total ?? null;
                              const isTodayCell = sToday.getFullYear() === sy && sToday.getMonth() === sm && sToday.getDate() === day;
                              // 使用与单标签日历相同的非交易日判断逻辑
                              const sNonTradingLabel = (() => {
                                if (MAKEUP_WORKDAYS_2026.has(dateStr)) return null;
                                if (HOLIDAY_MAP_2026[dateStr]) return HOLIDAY_MAP_2026[dateStr];
                                const dow2 = new Date(sy, sm, day).getDay();
                                if (dow2 === 0) return '周日';
                                if (dow2 === 6) return '周六';
                                return null;
                              })();
                              const isNonTrading = sNonTradingLabel !== null;
                              const cellBg = isNonTrading ? '#F0F0F0' : isTodayCell ? '#FFF3E0' : '#F9F9F9';
                              const cellBorder = isNonTrading ? '1px solid #E0E0E0' : isTodayCell ? '1.5px solid #D32F2F' : '1px solid #F0F0F0';
                              const dayNumColor = isNonTrading ? '#BDBDBD' : isTodayCell ? '#D32F2F' : '#222222';
                              const valueColor = val === null ? '#9E9E9E' : val > 0 ? '#D32F2F' : val < 0 ? '#4CAF50' : '#9E9E9E';
                              const displayVal = val === null ? null : formatMoney(Math.abs(val), val >= 0 ? '+' : '-');
                              return (
                                <div key={day} className="rounded-lg flex flex-col items-center justify-center" style={{ height: '50px', backgroundColor: cellBg, border: cellBorder, padding: '3px 2px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1, color: dayNumColor, marginBottom: '1px' }}>{day}</span>
                                  {isNonTrading ? (
                                    <span style={{ fontSize: '9px', fontWeight: 400, lineHeight: 1.1, color: '#BDBDBD', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>{sNonTradingLabel}</span>
                                  ) : displayVal !== null ? (
                                    <span style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.1, color: valueColor, whiteSpace: 'nowrap' }}>{displayVal}</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {overviewTab === 'chart' && <div style={{ backgroundColor: '#FFFFFF' }}>
            {/* 图表标题行 */}
            <div className="px-4 pt-4 pb-1 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold" style={{ color: '#1A1A1A' }}>走势</div>
              </div>
              {/* 标签多选下拉框 */}
              {allTagsChartData.filter(t => t.points.length > 0).length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowChartTagDropdown(v => !v)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={{
                      backgroundColor: 'rgba(211,47,47,0.08)',
                      color: '#D32F2F',
                      border: '1px solid rgba(211,47,47,0.25)',
                    }}
                  >
                    <span>
                      {hiddenTags.size === 0
                        ? '全部'
                        : `${allTagsChartData.filter(t => t.points.length > 0).length - hiddenTags.size}/${allTagsChartData.filter(t => t.points.length > 0).length}`
                      }
                    </span>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" />
                  </button>

                  {showChartTagDropdown && (
                    <>
                      {/* 遇罩 */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowChartTagDropdown(false)} />
                      {/* 下拉菜单 */}
                      <div
                        className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-50"
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E0E0E0',
                          minWidth: '140px',
                          maxHeight: 'calc(5 * 41px)',
                          overflowY: 'scroll',
                          overflowX: 'hidden',
                        }}
                      >
                        {/* 全选/反选 */}
                        <button
                          onClick={() => {
                            if (hiddenTags.size === 0) {
                              // 全选 → 全部隐藏
                              setHiddenTags(new Set(allTagsChartData.filter(t => t.points.length > 0).map(t => t.name)));
                            } else {
                              // 有隐藏 → 全部显示
                              setHiddenTags(new Set());
                            }
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE] flex items-center gap-2"
                          style={{
                            color: '#D32F2F',
                            fontWeight: 600,
                            borderBottom: '1px solid #F5F5F5',
                          }}
                        >
                          <span
                            className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                            style={{
                              borderColor: '#D32F2F',
                              backgroundColor: hiddenTags.size === 0 ? '#D32F2F' : '#FFFFFF',
                            }}
                          >
                            {hiddenTags.size === 0 && <span style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 1 }}>✓</span>}
                          </span>
                          全部
                        </button>
                        {allTagsChartData.filter(t => t.points.length > 0).map(tag => {
                          const isVisible = !hiddenTags.has(tag.name);
                          return (
                            <button
                              key={tag.name}
                              onClick={() => setHiddenTags(prev => {
                                const next = new Set(prev);
                                if (next.has(tag.name)) next.delete(tag.name);
                                else next.add(tag.name);
                                return next;
                              })}
                              className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE] flex items-center gap-2"
                              style={{
                                color: '#222222',
                                borderBottom: '1px solid #F5F5F5',
                              }}
                            >
                              <span
                                className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                style={{
                                  borderColor: isVisible ? tag.color : '#E0E0E0',
                                  backgroundColor: isVisible ? tag.color : '#FFFFFF',
                                }}
                              >
                                {isVisible && <span style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 1 }}>✓</span>}
                              </span>
                              <span
                                className="flex-shrink-0 w-2 h-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 图表主体 */}
            {allTagsChartData.length === 0 || allTagsChartData.every(t => t.points.length === 0) ? (
              <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#BDBDBD' }}>暂无数据</div>
            ) : (() => {
              // 收集所有日期
              const allDates = Array.from(new Set(
                allTagsChartData.flatMap(t => t.points.map((p: any) => p.date))
              )).sort();

              // 默认显示最近3个月
              const now = new Date();
              const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
              const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);
              const defaultStartIdx = allDates.findIndex(d => d >= threeMonthsAgoStr);
              const startPercent = allDates.length > 0 && defaultStartIdx > 0
                ? Math.max(0, Math.floor((defaultStartIdx / allDates.length) * 100) - 2)
                : 0;

              // 辅助函数：根据可视区间计算每个标签的最高/最低点，返回 markPoint 配置
              const buildMarkPoints = (tagDataList: typeof allTagsChartData, dates: string[], startPct: number, endPct: number, mode: typeof allChartMode, hidden: Set<string>) => {
                const total = dates.length;
                const startIdx = Math.floor(total * startPct / 100);
                const endIdx = Math.min(total - 1, Math.ceil(total * endPct / 100));
                return tagDataList
                  .filter(t => t.points.length > 0 && !hidden.has(t.name))
                  .map(tag => {
                    const datePointMap = new Map(tag.points.map((p: any) => [p.date, p]));
                    let maxVal = -Infinity, maxIdx2 = -1;
                    let minVal = Infinity, minIdx2 = -1;
                    for (let i = startIdx; i <= endIdx; i++) {
                      const p = datePointMap.get(dates[i]);
                      if (!p) continue;
                      const v = mode === 'amount' ? p.pnl : mode === 'initial' ? p.pctInitial : p.pctMargin;
                      if (v > maxVal) { maxVal = v; maxIdx2 = i; }
                      if (v < minVal) { minVal = v; minIdx2 = i; }
                    }
                    const fmt = (v: number) => mode === 'amount'
                      ? (Math.abs(v) >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toFixed(0))
                      : v.toFixed(1) + '%';
                    const markData: any[] = [];
                    if (maxIdx2 >= 0) markData.push({
                      coord: [maxIdx2, parseFloat(maxVal.toFixed(2))],
                      value: fmt(maxVal),
                      symbol: 'circle', symbolSize: 6,
                      itemStyle: { color: tag.color, borderColor: '#fff', borderWidth: 1.5 },
                      label: { show: true, formatter: fmt(maxVal), position: 'top', fontSize: 9, fontWeight: 600, color: tag.color, distance: 4, backgroundColor: 'rgba(255,255,255,0.88)', padding: [1, 3], borderRadius: 3 },
                    });
                    if (minIdx2 >= 0 && minIdx2 !== maxIdx2) markData.push({
                      coord: [minIdx2, parseFloat(minVal.toFixed(2))],
                      value: fmt(minVal),
                      symbol: 'circle', symbolSize: 6,
                      itemStyle: { color: tag.color, borderColor: '#fff', borderWidth: 1.5 },
                      label: { show: true, formatter: fmt(minVal), position: 'bottom', fontSize: 9, fontWeight: 600, color: tag.color, distance: 4, backgroundColor: 'rgba(255,255,255,0.88)', padding: [1, 3], borderRadius: 3 },
                    });
                    return { name: tag.name, markData };
                  });
              };

              // 构建ECharts series
              const buildSeries = (startPct: number, endPct: number) => {
                // 计算当前可见线数量（未被隐藏且有数据的线）
                const visibleLines = allTagsChartData.filter(t => t.points.length > 0 && !hiddenTags.has(t.name));
                const singleLine = visibleLines.length === 1 ? visibleLines[0] : null;
                // 只有1条可见线时，自动显示其可视区间内最高/最低点
                const markPoints = singleLine
                  ? buildMarkPoints(
                      [singleLine],
                      allDates, startPct, endPct, allChartMode, hiddenTags
                    )
                  : [];
                const mpMap = new Map(markPoints.map(m => [m.name, m.markData]));
                const hasActive = false; // 不再使用长按激活逻辑
                return allTagsChartData
                  .filter(t => t.points.length > 0)
                  .map(tag => {
                    const isHidden = hiddenTags.has(tag.name);
                    const isActive = singleLine !== null && tag.name === singleLine.name;
                    // 单线时其他线不存在，多线时全部正常显示
                    const dimmed = hasActive && !isActive && !isHidden;
                    const datePointMap = new Map(tag.points.map((p: any) => [p.date, p]));
                    const data: (number | null)[] = allDates.map(date => {
                      const p = datePointMap.get(date);
                      if (!p) return null;
                      if (allChartMode === 'amount') return parseFloat(p.pnl.toFixed(2));
                      if (allChartMode === 'initial') return parseFloat(p.pctInitial.toFixed(2));
                      return parseFloat(p.pctMargin.toFixed(2));
                    });
                    return {
                      name: tag.name,
                      type: 'line',
                      data,
                      smooth: true,
                      symbol: 'circle',
                      symbolSize: isActive ? 5 : 4,
                      showSymbol: false,
                      lineStyle: {
                        color: isHidden ? 'transparent' : tag.color,
                        width: isActive ? 2.5 : dimmed ? 1 : 2,
                        opacity: isHidden ? 0 : dimmed ? 0.2 : 1,
                      },
                      itemStyle: { color: tag.color },
                      opacity: isHidden ? 0 : dimmed ? 0.2 : 1,
                      connectNulls: true,
                      label: { show: false },
                      // 只有1条可见线时，自动显示该线可视区间内最高/最低点；多线时不显示
                      markPoint: (isHidden || !isActive) ? { data: [] } : {
                        data: mpMap.get(tag.name) ?? [],
                        animation: true,
                        silent: true,
                      },
                    };
                  });
              };

              const initialSeries = buildSeries(startPercent, 100);

              const option = {
                backgroundColor: '#FFFFFF',
                grid: { top: 28, right: 16, bottom: 52, left: 52 },
                xAxis: {
                  type: 'category',
                  data: allDates,
                  axisLine: { show: false },
                  axisTick: { show: false },
                  axisLabel: {
                    fontSize: 9,
                    color: '#BDBDBD',
                    formatter: (val: string) => val.slice(5),
                    interval: Math.max(0, Math.floor(allDates.length / 5) - 1),
                    margin: 6,
                  },
                  splitLine: { show: false },
                },
                yAxis: {
                  type: 'value',
                  axisLine: { show: false },
                  axisTick: { show: false },
                  axisLabel: {
                    fontSize: 9,
                    color: '#BDBDBD',
                    formatter: (val: number) => {
                      if (allChartMode === 'amount') {
                        const abs = Math.abs(val);
                        if (abs >= 10000) return (val / 10000).toFixed(1) + '万';
                        return val.toFixed(0);
                      }
                      return val.toFixed(1) + '%';
                    },
                  },
                  splitLine: { lineStyle: { color: '#F5F5F5', type: 'dashed' } },
                },
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: '#1A1A1A',
                  borderColor: 'transparent',
                  textStyle: { color: '#FFFFFF', fontSize: 11 },
                  formatter: (params: any[]) => {
                    if (!params || params.length === 0) return '';
                    const date = params[0].axisValue;
                    let html = `<div style="color:#9E9E9E;font-size:10px;margin-bottom:4px">${date}</div>`;
                    params.forEach((p: any) => {
                      const rawVal = typeof p.value === 'object' && p.value !== null ? p.value.value : p.value;
                      if (rawVal === null || rawVal === undefined) return;
                      if (hiddenTags.has(p.seriesName)) return;
                      const val = allChartMode === 'amount'
                        ? `¥${Number(rawVal).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
                        : `${Number(rawVal).toFixed(2)}%`;
                      html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">`;
                      html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
                      html += `<span style="color:#CCCCCC">${p.seriesName}</span>`;
                      html += `<span style="font-weight:600;margin-left:auto;padding-left:8px">${val}</span></div>`;
                    });
                    return html;
                  },
                  axisPointer: { lineStyle: { color: 'rgba(211,47,47,0.3)', type: 'dashed' } },
                },
                legend: { show: false },
                dataZoom: [
                  // slider滑块：保留缩放功能
                  {
                    type: 'slider',
                    start: chartZoom ? chartZoom.start : startPercent,
                    end: chartZoom ? chartZoom.end : 100,
                    height: 18,
                    bottom: 4,
                    borderColor: 'transparent',
                    backgroundColor: '#F5F5F5',
                    fillerColor: 'rgba(211,47,47,0.15)',
                    handleStyle: { color: '#D32F2F', borderColor: '#D32F2F' },
                    moveHandleStyle: { color: '#D32F2F' },
                    textStyle: { color: 'transparent', fontSize: 0 },
                    showDetail: false,
                    brushSelect: false,
                  },
                  // inside：禁用手指拖动移动，但保留缩放
                  {
                    type: 'inside',
                    moveOnMouseMove: false,
                    moveOnMouseWheel: false,
                    zoomOnMouseWheel: false,
                    preventDefaultMouseMove: false,
                  },
                ],
                series: initialSeries,
              };

              // 长按计时器引用
              let longPressTimer: ReturnType<typeof setTimeout> | null = null;
              let longPressTarget: string | null = null;

              return (
                <div
                  className="px-1 pb-1"
                  style={{ touchAction: 'pan-y', userSelect: 'none' }}
                  onTouchMove={(e) => {
                    // 滑动时取消长按
                    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                    e.stopPropagation();
                  }}
                  onTouchEnd={() => {
                    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                  }}
                >
                  <ReactECharts
                    ref={echartsRef}
                    option={option}
                    style={{ height: '260px', width: '100%', touchAction: 'pan-y' }}
                    opts={{ renderer: 'canvas' }}
                    onEvents={{
                      datazoom: (params: any) => {
                        // 监听滑块拖动，将区间保存到 state
                        const start = params.start ?? params.batch?.[0]?.start;
                        const end = params.end ?? params.batch?.[0]?.end;
                        if (start !== undefined && end !== undefined) {
                          setChartZoom({ start, end });
                          // 如果只有1条可见线，直接通过ECharts实例实时更新markPoint，绕过React渲染延迟
                          const visibleNow = allTagsChartData.filter(t => t.points.length > 0 && !hiddenTags.has(t.name));
                          if (visibleNow.length === 1 && echartsRef.current) {
                            const chartInstance = echartsRef.current.getEchartsInstance?.();
                            if (chartInstance) {
                              const mps = buildMarkPoints([visibleNow[0]], allDates, start, end, allChartMode, hiddenTags);
                              const mpData = mps[0]?.markData ?? [];
                              // 找到该线对应的series索引
                              const seriesIdx = allTagsChartData.filter(t => t.points.length > 0).findIndex(t => t.name === visibleNow[0].name);
                              if (seriesIdx >= 0) {
                                chartInstance.setOption({
                                  series: [{ dataIndex: seriesIdx, markPoint: { data: mpData, animation: false, silent: true } }]
                                }, { replaceMerge: [] });
                              }
                            }
                          }
                        }
                      },
                      // 长按开始：记录目标线并开始计时
                      mousedown: (params: any) => {
                        if (longPressTimer) clearTimeout(longPressTimer);
                        longPressTarget = params.componentType === 'series' ? params.seriesName : null;
                        longPressTimer = setTimeout(() => {
                          longPressTimer = null;
                          if (longPressTarget) {
                            setActiveChartLine(prev => prev === longPressTarget ? null : longPressTarget);
                          } else {
                            setActiveChartLine(null);
                          }
                        }, 500); // 500ms 为长按阈值
                      },
                      // 鼠标抖动/移动时取消长按
                      mousemove: () => {
                        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                      },
                      // 松开时取消长按（如果还没触发）
                      mouseup: () => {
                        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                      },
                    }}
                  />
                </div>
              );
            })()}

            {/* 底部3个Tab切换 */}
            <div className="px-4 pb-4 pt-1 flex items-center justify-center gap-2">
              {(['amount', 'initial', 'margin'] as const).map(mode => {
                const active = allChartMode === mode;
                const label = mode === 'amount' ? '金额' : mode === 'initial' ? '波动' : '回报';
                return (
                  <button
                    key={mode}
                    onClick={() => setAllChartMode(mode)}
                    className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      backgroundColor: active ? '#D32F2F' : '#F5F5F5',
                      color: active ? '#FFFFFF' : '#757575',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>}
          </div>
          )}
        </div>
      )}

      {/* ── 视角切换弹窗（管理员/创建者点击头像弹出） ── */}
      {showViewAsPicker && canSwitchView && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowViewAsPicker(false)}>
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#222' }}>切换视角</span>
              <button onClick={() => setShowViewAsPicker(false)}><X className="w-5 h-5" style={{ color: '#757575' }} /></button>
            </div>
            {/* 搜索框 */}
            <div className="px-4 py-2">
              <input
                type="text"
                placeholder="搜索成员..."
                value={viewAsSearch}
                onChange={e => setViewAsSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: '#F5F5F5', color: '#222', border: '1px solid #E0E0E0' }}
              />
            </div>
            {/* 成员列表 */}
            <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: '50vh' }}>
              {/* 返回自己视角 */}
              <button
                onClick={() => handleSwitchView(null)}
                className="w-full flex items-center gap-3 py-3 border-b"
                style={{ borderColor: '#F5F5F5' }}
              >
                <UserAvatar username={user?.username} avatar={user?.avatar} nickname={user?.nickname} size="md" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium" style={{ color: '#222' }}>{user?.nickname || user?.username || '我自己'}</div>
                  <div className="text-xs" style={{ color: '#757575' }}>自己的视角</div>
                </div>
                {!viewAsUserId && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D32F2F' }} />}
              </button>
              {/* 其他成员 */}
              {(membersData || [])
                .filter((m: any) => m.userId !== user?.id)
                .filter((m: any) => {
                  if (!viewAsSearch) return true;
                  const name = (m.nickname || m.username || '').toLowerCase();
                  return name.includes(viewAsSearch.toLowerCase());
                })
                .map((m: any) => (
                  <button
                    key={m.userId}
                    onClick={() => handleSwitchView(m.userId)}
                    className="w-full flex items-center gap-3 py-3 border-b"
                    style={{ borderColor: '#F5F5F5' }}
                  >
                    <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="md" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium" style={{ color: '#222' }}>{m.nickname || m.username}</div>
                      <div className="text-xs" style={{ color: '#757575' }}>{m.role === 'owner' ? '创建者' : m.role === 'admin' ? '管理员' : '成员'}</div>
                    </div>
                    {viewAsUserId === m.userId && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D32F2F' }} />}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 视角切换黄色横幅提示条（切换后底部显示） ── */}
      {viewAsUserId && canSwitchView && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4" />
            <span>正在以 {(() => {
              const t = (membersData || []).find((m: any) => m.userId === viewAsUserId);
              return t ? (t.nickname || t.username) : '未知用户';
            })()} 的视角查看</span>
          </div>
          <button
            onClick={() => handleSwitchView(null)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#333' }}
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* ── 自定义名称编辑弹框 ── */}
      {/* 单击标签名：信息提示弹框 */}
      {pnlDetailModal !== null && (() => {
        const { tagName, tagAlias, ratio, initialBalance, capitalChange, capitalRecords, tagWithdraw, segments, totalPnl } = pnlDetailModal;
        const fmtAbs = (n: number) => '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmt = (n: number) => (n >= 0 ? '+' : '') + '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtDate = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}月${Number(dd)}日`; };
        const pnlColor = totalPnl > 0 ? '#D32F2F' : totalPnl < 0 ? '#388E3C' : '#BDBDBD';
        const currentCapital = initialBalance + capitalChange;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setPnlDetailModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl mx-4 w-full max-w-sm" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              {/* 标题栏 */}
              <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F0F0F0' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold" style={{ color: '#1A1A1A' }}>{tagAlias !== tagName ? tagAlias : tagName}</span>
                    {tagAlias !== tagName && <span className="text-xs ml-2" style={{ color: '#BDBDBD' }}>{tagName}</span>}
                  </div>
                </div>
              </div>
              {/* 分段列表（可滚动） */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '12px 20px' }}>
                {segments.map((seg, idx) => (
                  <div key={idx}>
                    {/* 分段标题 */}
                    {(() => {
                      const days = seg.startDate && seg.endDate ? Math.round((new Date(seg.endDate).getTime() - new Date(seg.startDate).getTime()) / 86400000) + 1 : 0;
                      return (
                        <div className="flex items-center gap-2 mb-2" style={{ marginTop: idx > 0 ? 12 : 0 }}>
                          <div className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#3949AB' }}>
                            第 {seg.segNo} 段
                          </div>
                          <div className="text-xs" style={{ color: '#888' }}>
                            {fmtDate(seg.startDate)} — {fmtDate(seg.endDate)}
                          </div>
                          {days > 0 && (
                            <div className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#F5F5F5', color: '#BDBDBD' }}>共 {days} 天</div>
                          )}
                          {seg.isPaused && (
                            <div className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#E3F2FD', color: '#1565C0' }}>暂停中</div>
                          )}
                        </div>
                      );
                    })()}
                    {/* 计算过程卡片 */}
                    <div className="rounded-xl space-y-1" style={{ background: '#FAFAFA', padding: '10px 14px' }}>
                      {/* 本段本金（第1段=初始本金，第2段及以后=开始本金） */}
                      {idx === 0 ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: '#888' }}>初始本金</span>
                            <span className="text-sm font-medium font-mono" style={{ color: '#1A1A1A' }}>{fmtAbs(initialBalance)}</span>
                          </div>
                          {capitalRecords.length > 0 && segments.length === 1 && (
                            capitalRecords.map((rec, ri) => (
                              <div key={ri} className="flex items-center justify-between">
                                <span className="text-xs" style={{ color: '#888' }}>{rec.isAdd ? '追加本金' : '减少本金'} <span style={{ color: '#BDBDBD' }}>({fmtDate(rec.date)})</span></span>
                                <span className="text-sm font-medium font-mono" style={{ color: rec.isAdd ? '#1565C0' : '#E65100' }}>{fmtAbs(rec.amount)}</span>
                              </div>
                            ))
                          )}
                          {(capitalChange !== 0 && segments.length === 1) && (
                            <div className="flex items-center justify-between" style={{ borderTop: '1px solid #E0E0E0', paddingTop: 4, marginTop: 2 }}>
                              <span className="text-xs font-medium" style={{ color: '#555' }}>当前本金</span>
                              <span className="text-sm font-bold font-mono" style={{ color: '#1A1A1A' }}>{fmtAbs(currentCapital)}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#888' }}>开始本金 <span style={{ color: '#BDBDBD', fontSize: 10 }}>(待设置)</span></span>
                          <span className="text-sm font-medium font-mono" style={{ color: '#BDBDBD' }}>—</span>
                        </div>
                      )}
                      {/* 分割线 */}
                      <div style={{ borderTop: '1px solid #E0E0E0', margin: '4px 0' }} />
                      {/* 最新余额行 */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: '#888' }}>最新余额 <span style={{ color: '#BDBDBD' }}>({fmtDate(seg.endDate)})</span></span>
                        <span className="text-sm font-medium font-mono" style={{ color: '#1A1A1A' }}>{fmtAbs(seg.endBalance)}</span>
                      </div>
                      {/* 累计提现行（仅当有提现时显示） */}
                      {tagWithdraw > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#888' }}>累计提现</span>
                          <span className="text-sm font-medium font-mono" style={{ color: '#1A1A1A' }}>{fmtAbs(tagWithdraw)}</span>
                        </div>
                      )}
                      {/* 盈亏统计（标签视角）= 余额 + 提现 − 本金（正数=标签赚了红色，负数=标签亏了绿色） */}
                      {idx === 0 && (() => {
                        const segCapital = segments.length === 1 ? currentCapital : initialBalance;
                        const tagPnl = seg.endBalance + tagWithdraw - segCapital; // 标签盈亏：正=赚，负=亏
                        return (
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: '#888' }}>盈亏统计</span>
                            <span className="text-sm font-medium font-mono" style={{ color: tagPnl > 0 ? '#D32F2F' : tagPnl < 0 ? '#388E3C' : '#BDBDBD' }}>{tagPnl > 0 ? '+' : tagPnl < 0 ? '−' : ''}{fmtAbs(tagPnl)}</span>
                          </div>
                        );
                      })()}
                      {/* 占比行 */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: '#888' }}>占比</span>
                        <span className="text-sm font-medium" style={{ color: '#555' }}>× {ratio.toFixed(2)}%</span>
                      </div>
                      {/* 分割线 */}
                      <div style={{ borderTop: '1px dashed #E0E0E0', margin: '6px 0' }} />
                      {/* 本段回报 */}
                      {idx === 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: '#555' }}>本段回报</span>
                          <span className="text-sm font-bold" style={{ color: seg.pnl > 0 ? '#D32F2F' : seg.pnl < 0 ? '#388E3C' : '#BDBDBD' }}>
                            {seg.pnl > 0 ? '+' : seg.pnl < 0 ? '−' : ''}￥{Math.abs(seg.pnl).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {idx > 0 && (
                        <div className="flex items-center justify-between" style={{ paddingTop: 2 }}>
                          <span className="text-xs font-semibold" style={{ color: '#555' }}>本段回报</span>
                          <span className="text-sm font-bold" style={{ color: seg.pnl > 0 ? '#D32F2F' : seg.pnl < 0 ? '#388E3C' : '#BDBDBD' }}>
                            {seg.pnl > 0 ? '+' : seg.pnl < 0 ? '−' : ''}￥{Math.abs(seg.pnl).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* 暂停/重启节点 */}
                    {idx < segments.length - 1 && (
                      <div className="flex items-center gap-2 my-2 px-1">
                        <div style={{ flex: 1, height: 1, background: '#E0E0E0' }} />
                        <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: seg.isPaused ? '#E3F2FD' : '#E8F5E9', color: seg.isPaused ? '#1565C0' : '#2E7D32', whiteSpace: 'nowrap' }}>
                          {seg.isPaused ? '⏸ 暂停' : `▶ 重启 ${seg.resumeDate ? fmtDate(seg.resumeDate) : ''}`}
                        </div>
                        <div style={{ flex: 1, height: 1, background: '#E0E0E0' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* 底部合计 */}
              {segments.length > 1 && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid #F0F0F0', background: '#FAFAFA', borderRadius: '0 0 16px 16px' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: '#555' }}>合计回报</span>
                    <span className="text-lg font-bold" style={{ color: pnlColor }}>{fmt(totalPnl)}</span>
                  </div>
                </div>
              )}
              {/* 关闭按钮 */}
              <div style={{ padding: '10px 20px 16px', background: segments.length > 1 ? '#FAFAFA' : '#FFF', borderRadius: '0 0 16px 16px' }}>
                <button
                  className="w-full py-2 rounded-xl text-sm font-semibold"
                  style={{ background: '#F5F5F5', color: '#666' }}
                  onClick={() => setPnlDetailModal(null)}
                >关闭</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* 细则弹窗 */}
      {showRules && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>
          {/* 顶部导航 */}
          <div className="flex items-center gap-3 px-4 py-4" style={{ backgroundColor: '#C62828' }}>
            <button
              onClick={() => setShowRules(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <span style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>←</span>
            </button>
            <span className="text-base font-bold" style={{ color: '#fff' }}>账本细则</span>
          </div>
          {/* 内容区域（可滚动） */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '16px 16px 32px' }}>
            {/* 第一块：融资利率 */}
            <div className="flex items-center gap-2 mb-2" style={{ marginTop: 0 }}>
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold" style={{ backgroundColor: '#C62828', flexShrink: 0 }}>1</div>
              <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>融资利率</span>
            </div>
            <div className="rounded-2xl bg-white mb-4" style={{ padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #F0F0F0' }}>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'left' }}>借款时长</th>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'center' }}>月利率</th>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'center' }}>年化</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: '不满 3 个月', rate: '3%', annual: '36%' },
                    { label: '满 3 个月', rate: '2%', annual: '24%' },
                    { label: '满 6 个月', rate: '1.5%', annual: '18%' },
                    { label: '满 12 个月', rate: '1%', annual: '12%' },
                  ].map((row, i, arr) => (
                    <tr key={row.label} style={{ borderBottom: i < arr.length - 1 ? '1px solid #F8F8F8' : 'none' }}>
                      <td style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 500, padding: '11px 8px', textAlign: 'left' }}>{row.label}</td>
                      <td style={{ fontSize: 13, color: '#D32F2F', fontWeight: 700, padding: '11px 8px', textAlign: 'center' }}>{row.rate}</td>
                      <td style={{ fontSize: 13, color: '#424242', padding: '11px 8px', textAlign: 'center' }}>{row.annual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#BDBDBD', lineHeight: 1.8, marginTop: 12 }}>
                · 不满 1 个月，按 1 个月计算<br />
                · 达到更长档位后，前期利息自动追溯调整为更低利率
              </div>
            </div>

            {/* 第二块：保证金 */}
            <div className="flex items-center gap-2 mb-2" style={{ marginTop: 4 }}>
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold" style={{ backgroundColor: '#C62828', flexShrink: 0 }}>2</div>
              <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>保证金要求</span>
            </div>
            <div className="rounded-2xl bg-white mb-4" style={{ padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="rounded-xl mb-3" style={{ background: '#F8F8F8', padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#9E9E9E', fontWeight: 600, marginBottom: 4 }}>核心原则</div>
                <div style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 600 }}>当日买入满仓跌停金额 ≤ 保证金</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #F0F0F0' }}>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'left' }}>涨跌幅限制</th>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'center' }}>保证金比例</th>
                    <th style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 500, padding: '0 8px 8px', textAlign: 'center' }}>100万账户</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #F8F8F8' }}>
                    <td style={{ fontSize: 12, color: '#1A1A1A', fontWeight: 500, padding: '11px 8px', textAlign: 'left' }}>±20%（科创/创业板）</td>
                    <td style={{ fontSize: 13, color: '#D32F2F', fontWeight: 700, padding: '11px 8px', textAlign: 'center' }}>20%</td>
                    <td style={{ fontSize: 13, color: '#424242', padding: '11px 8px', textAlign: 'center' }}>20 万</td>
                  </tr>
                  <tr>
                    <td style={{ fontSize: 12, color: '#1A1A1A', fontWeight: 500, padding: '11px 8px', textAlign: 'left' }}>±10%（主板）</td>
                    <td style={{ fontSize: 13, color: '#D32F2F', fontWeight: 700, padding: '11px 8px', textAlign: 'center' }}>10%</td>
                    <td style={{ fontSize: 13, color: '#424242', padding: '11px 8px', textAlign: 'center' }}>10 万</td>
                  </tr>
                </tbody>
              </table>
              <div className="rounded-xl mt-3" style={{ background: '#FFF8F8', padding: '12px' }}>
                <div style={{ fontSize: 11, color: '#C62828', fontWeight: 700, marginBottom: 8 }}>举例说明</div>
                {[
                  { label: '交 10 万保证金，做 ±20% 股票', value: '最多买 50 万' },
                  { label: '50 万 × 20% 跌停', value: '= 10 万 ≤ 保证金 ✓' },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid #FFE0E0' : 'none' }}>
                    <span style={{ fontSize: 12, color: '#757575' }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#D32F2F' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#BDBDBD', lineHeight: 1.8, marginTop: 12 }}>
                · 保证金不足时，可降低仓位至满足要求<br />
                · 满仓跌停损失 = 买入金额 × 涨跌幅限制
              </div>
            </div>

            {/* 第三块：结算方式 */}
            <div className="flex items-center gap-2 mb-2" style={{ marginTop: 4 }}>
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold" style={{ backgroundColor: '#C62828', flexShrink: 0 }}>3</div>
              <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>结算方式</span>
            </div>
            <div className="rounded-2xl bg-white" style={{ padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {/* 每日结算 */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: '#FFF3F3', flexShrink: 0, fontSize: 16 }}>📅</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 3 }}>每日结算</div>
                  <div style={{ fontSize: 12, color: '#757575', lineHeight: 1.6 }}>每天收盘后实时结算，不论当日盈亏金额大小，均按实际数字结算</div>
                </div>
              </div>
              <div style={{ height: 1, background: '#F5F5F5', margin: '10px 0' }} />
              {/* 到数结算 */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: '#FFF3F3', flexShrink: 0, fontSize: 16 }}>🎯</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 3 }}>到数结算</div>
                  <div style={{ fontSize: 12, color: '#757575', lineHeight: 1.6 }}>设定目标金额，盈利或亏损任意一方达到目标即触发结算，双向有效</div>
                  <div className="rounded-lg mt-2" style={{ background: '#FFF8F8', padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: '#EF9A9A', fontWeight: 600, marginBottom: 3 }}>举例（目标金额 ¥5,000）</div>
                    <div style={{ fontSize: 11, color: '#BF360C', lineHeight: 1.8 }}>
                      · 当日盈利累计达到 +¥5,000 → 触发结算<br />
                      · 当日亏损累计达到 −¥5,000 → 触发结算
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {aliasInfoTag !== null && (() => {
        const _infoAlias = (initialBalancesData?.balances as any)?.[`${aliasInfoTag}__alias`] ?? '';
        const _infoAliasTime = (initialBalancesData?.balances as any)?.[`${aliasInfoTag}__aliasTime`] ?? '';
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => setAliasInfoTag(null)}>
            <div className="bg-white rounded-2xl shadow-xl mx-6 w-full max-w-sm" style={{ padding: '20px 20px 16px' }} onClick={(e) => e.stopPropagation()}>
              <div className="text-base font-semibold mb-3" style={{ color: '#222' }}>标签名称信息</div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs" style={{ color: '#888', flexShrink: 0 }}>原始标签</span>
                <span className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{aliasInfoTag}</span>
              </div>
              {_infoAlias ? (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs" style={{ color: '#888', flexShrink: 0 }}>自定义名称</span>
                  <span className="text-sm font-semibold" style={{ color: '#1565C0' }}>{_infoAlias}</span>
                </div>
              ) : (
                <div className="text-xs mb-2" style={{ color: '#BDBDBD' }}>尚未设置自定义名称</div>
              )}
              {_infoAliasTime && (
                <div className="text-xs mb-3" style={{ color: '#BDBDBD' }}>上次修改：{_infoAliasTime}</div>
              )}
              <div className="text-xs mb-4" style={{ color: '#BDBDBD' }}>长按标签名可修改自定义名称</div>
              <button
                className="w-full py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#F5F5F5', color: '#666' }}
                onClick={() => setAliasInfoTag(null)}
              >关闭</button>
            </div>
          </div>
        );
      })()}

      {aliasEditTag !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setAliasEditTag(null)}>
          <div className="bg-white rounded-2xl shadow-xl mx-6 w-full max-w-sm" style={{ padding: '20px 20px 16px' }} onClick={(e) => e.stopPropagation()}>
            {/* 标题 */}
            <div className="text-base font-semibold mb-1" style={{ color: '#222' }}>自定义显示名称</div>
            {/* 原始标签名 */}
            <div className="text-xs mb-3" style={{ color: '#888' }}>原始标签：<span style={{ color: '#D32F2F', fontWeight: 600 }}>{aliasEditTag}</span></div>
            {/* 已设置的自定义名称和时间 */}
            {(initialBalancesData?.balances as any)?.[`${aliasEditTag}__alias`] && (
              <div className="text-xs mb-2" style={{ color: '#888' }}>
                当前自定义：<span style={{ color: '#1565C0', fontWeight: 600 }}>{(initialBalancesData?.balances as any)?.[`${aliasEditTag}__alias`]}</span>
                {(initialBalancesData?.balances as any)?.[`${aliasEditTag}__aliasTime`] && (
                  <span style={{ marginLeft: 6, color: '#BDBDBD' }}>上次修改：{(initialBalancesData?.balances as any)?.[`${aliasEditTag}__aliasTime`]}</span>
                )}
              </div>
            )}
            {/* 输入框 */}
            <input
              type="text"
              className="w-full border rounded-xl px-3 py-2 text-sm mb-4"
              style={{ borderColor: '#E0E0E0', outline: 'none', color: '#222' }}
              placeholder={`输入自定义名称（留空则恢复原始标签）`}
              value={aliasEditValue}
              onChange={(e) => setAliasEditValue(e.target.value)}
              autoFocus
              maxLength={20}
            />
            {/* 按鈕 */}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: '#F5F5F5', color: '#666' }}
                onClick={() => setAliasEditTag(null)}
              >取消</button>
              <button
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#D32F2F', color: '#fff', opacity: aliasSaving ? 0.7 : 1 }}
                disabled={aliasSaving}
                onClick={async () => {
                  setAliasSaving(true);
                  try {
                    const now = new Date();
                    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                    // 增量合并：先读取现有配置，再合并新的 alias 字段，避免全量覆盖
                    const existingBalances = (initialBalancesData?.balances as Record<string, number | string>) ?? {};
                    const mergedBalances = {
                      ...existingBalances,
                      [`${aliasEditTag}__alias`]: aliasEditValue.trim(),
                      [`${aliasEditTag}__aliasTime`]: aliasEditValue.trim() ? timeStr : '',
                    };
                    await updateMyInitialBalancesMutation.mutateAsync({
                      ledgerId,
                      balances: mergedBalances,
                    });
                    setAliasEditTag(null);
                  } finally {
                    setAliasSaving(false);
                  }
                }}
              >{aliasSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 图片预览弹窗（普通成员点击日历格子时弹出） ── */}
      {showImagePreview && previewImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
        >
          {/* 顶部：图片计数 + 关闭按钮（任何状态下均可点击） */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <span className="text-white text-sm">
              {previewImages.length > 1 ? `${previewImageIndex + 1} / ${previewImages.length}` : '凭证查看'}
            </span>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              onClick={() => {
                setShowImagePreview(false);
                imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
                setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
              }}
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* 图片区域：由 useEffect 绑定原生 touch 事件 */}
          <div
            ref={imgContainerRef}
            className="flex-1 relative overflow-hidden"
            style={{ touchAction: 'none' }}
          >
            {/* 左箭头 */}
            {imgScale <= 1 && previewImages.length > 1 && previewImageIndex > 0 && (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                onClick={() => {
                  const idx = Math.max(0, previewImageIndex - 1);
                  previewIndexRef.current = idx;
                  setPreviewImageIndex(idx);
                  imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
                  setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
                }}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}
            {/* 右箭头 */}
            {imgScale <= 1 && previewImages.length > 1 && previewImageIndex < previewImages.length - 1 && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                onClick={() => {
                  const idx = Math.min(previewImages.length - 1, previewImageIndex + 1);
                  previewIndexRef.current = idx;
                  setPreviewImageIndex(idx);
                  imgScaleRef.current = 1; imgTxRef.current = 0; imgTyRef.current = 0;
                  setImgScale(1); setImgTranslateX(0); setImgTranslateY(0);
                }}
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}
            {/* 图片本体 */}
            <div className="w-full h-full flex items-center justify-center px-12">
              <img
                src={previewImages[previewImageIndex]}
                alt={`图片${previewImageIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{
                  maxHeight: 'calc(100vh - 130px)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  pointerEvents: 'none',
                  transform: `scale(${imgScale}) translate(${imgTranslateX / imgScale}px, ${imgTranslateY / imgScale}px)`,
                  transformOrigin: 'center center',
                  transition: imgPinchRef.current ? 'none' : 'transform 0.15s ease',
                }}
                onContextMenu={e => e.preventDefault()}
                draggable={false}
              />
            </div>
          </div>

          {/* 底部提示 + 圆点指示器 */}
          <div className="flex-shrink-0 pb-4">
            <div className="text-center text-xs py-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {imgScale > 1 ? '双指缩小还原 · 单指拖动' : '双指放大 · 左右滑动切换'}
            </div>
            {previewImages.length > 1 && (
              <div className="flex justify-center gap-1.5 py-2">
                {previewImages.map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all"
                    style={{ backgroundColor: i === previewImageIndex ? '#fff' : 'rgba(255,255,255,0.4)' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 股票预览弹窗（普通成员点击有蓝点/紫点的日历格子时弹出） ── */}
      {showStockPreview && previewStocks.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowStockPreview(false)}
        >
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#fff', maxWidth: '320px' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 关闭按鈕 */}
            <div className="flex justify-end px-4 pt-3 pb-1">
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ backgroundColor: '#F0F0F0' }}
                onClick={() => setShowStockPreview(false)}
              >
                <X className="w-4 h-4" style={{ color: '#888' }} />
              </button>
            </div>
            {/* 股票列表 */}
            <div className="px-5 pb-5">
              {previewStocks.map((stock, idx) => (
                <div
                  key={stock.code}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: idx < previewStocks.length - 1 ? '1px solid #F0F0F0' : 'none' }}
                >
                  <span className="text-sm font-medium" style={{ color: '#1565C0', minWidth: '60px' }}>{stock.code}</span>
                  <span className="text-sm" style={{ color: '#222' }}>{stock.name || '未知名称'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 本金变动历史弹窗 ── */}
      {showCapitalHistory && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center" onClick={() => setShowCapitalHistory(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white rounded-2xl w-[85%] max-w-sm max-h-[70vh] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0F0F0' }}>
              <div className="text-base font-bold text-gray-800">本金变动记录</div>
              <button onClick={() => setShowCapitalHistory(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {/* 内容 */}
            <div className="px-5 py-4 overflow-y-auto max-h-[55vh]">
              {capitalHistory.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">暂无本金变动记录</div>
              ) : (
                <div className="space-y-3">
                  {/* 初始本金 */}
                  {stats.startDate && (() => {
                    const tagName = selectedTag?.name;
                    const initialVal = tagName && initialBalancesData?.balances ? initialBalancesData.balances[tagName] : null;
                    if (!initialVal) return null;
                    // 计算当前本金 = 初始 + 所有 capital_add - 所有 capital_reduce
                    const netChange = capitalHistory.reduce((sum: number, r: any) => {
                      const amt = Number(r.amount) || 0;
                      return r.description?.startsWith('capital_add') ? sum + amt : sum - amt;
                    }, 0);
                    return (
                      <>
                        <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid #F8F8F8' }}>
                          <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-xs text-gray-500">初始本金</div>
                            <div className="text-[11px] text-gray-400">{stats.startDate}</div>
                          </div>
                          <div className="text-sm font-semibold text-gray-700">
                            ¥{Number(initialVal).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        {/* 变动记录 */}
                        {capitalHistory.map((record: any) => {
                          const isAdd = record.description?.startsWith('capital_add');
                          const noteText = record.description?.includes(':') ? record.description.split(':').slice(1).join(':') : '';
                          return (
                            <div key={record.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid #F8F8F8' }}>
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isAdd ? 'bg-blue-500' : 'bg-orange-500'}`} />
                              <div className="flex-1">
                                <div className="text-xs text-gray-700">{isAdd ? '增加本金' : '减少本金'}{noteText ? ` - ${noteText}` : ''}</div>
                                <div className="text-[11px] text-gray-400">{record.recordDate || ''}</div>
                              </div>
                              <div className={`text-sm font-semibold ${isAdd ? 'text-blue-600' : 'text-orange-600'}`}>
                                {isAdd ? '+' : '-'}¥{Number(record.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                          );
                        })}
                        {/* 当前本金汇总 */}
                        <div className="mt-3 pt-3" style={{ borderTop: '2px solid #F0F0F0' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-600">当前本金</span>
                            <span className="text-base font-bold text-gray-800">
                              ¥{(Number(initialVal) + netChange).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 提现记录弹窗 ── */}
      {showWithdrawHistory && (() => {
        // 不算比例，只算标签账户本身的盈亏
        const accountPnl = stats.latestBalance - stats.currentCapital;
        const totalPnlRaw = accountPnl + totalWithdraw;
        return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center" onClick={() => setShowWithdrawHistory(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white rounded-2xl w-[85%] max-w-sm max-h-[70vh] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0F0F0' }}>
              <div className="text-base font-bold text-gray-800">累计盈亏详情</div>
              <button onClick={() => setShowWithdrawHistory(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {/* 内容 */}
            <div className="px-5 py-4 overflow-y-auto max-h-[55vh]">
              {/* 1. 账面剩余盈亏 */}
              <div className="mb-4">
                <div className="text-sm font-bold text-gray-800 mb-1">1. 账面剩余盈亏</div>
                <div className="text-xs text-gray-500 ml-2 mb-1">当前余额 - 当前本金</div>
                <div className="text-xs text-gray-600 ml-2">= ¥{stats.latestBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} - ¥{stats.currentCapital.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
                <div className="text-sm font-bold ml-2 mt-0.5" style={{ color: accountPnl >= 0 ? '#D32F2F' : '#388E3C' }}>= {accountPnl >= 0 ? '+' : '-'}¥{Math.abs(accountPnl).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
              </div>

              {/* 2. 已提现盈亏 */}
              <div className="mb-4">
                <div className="text-sm font-bold text-gray-800 mb-1">2. 已提现盈亏</div>
                {withdrawRecords.length === 0 ? (
                  <div className="text-xs text-gray-400 ml-2">暂无提现记录</div>
                ) : (
                  <>
                    <div className="text-xs text-gray-500 ml-2 mb-1">共 {withdrawRecords.length} 次提现</div>
                    <div className="ml-2 space-y-1">
                      {withdrawRecords.map((record: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="text-[11px] text-gray-400">{record.date || ''}</span>
                          <span className="text-xs font-medium text-green-600 ml-auto">+¥{Number(record.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm font-bold ml-2 mt-1 text-green-700">累计提现 = +¥{totalWithdraw.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
                  </>
                )}
              </div>

              {/* 汇总 */}
              <div className="pt-3" style={{ borderTop: '2px solid #F0F0F0' }}>
                <div className="text-sm font-bold text-gray-800 mb-1">汇总</div>
                <div className="text-xs text-gray-500 ml-2 mb-1">= 账面剩余盈亏 + 已提现盈亏</div>
                <div className="text-xs text-gray-600 ml-2">= {accountPnl >= 0 ? '+' : '-'}¥{Math.abs(accountPnl).toLocaleString('zh-CN', { minimumFractionDigits: 2 })} + ¥{totalWithdraw.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
                <div className="text-base font-bold ml-2 mt-1" style={{ color: totalPnlRaw >= 0 ? '#D32F2F' : '#388E3C' }}>= {totalPnlRaw >= 0 ? '+' : '-'}¥{Math.abs(totalPnlRaw).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── 盈亏计算详情弹窗 ── */}
      {showPnlExplain && (() => {
        // 计算弹窗内需要的数据
        const initialBalance = stats.initialBalance;
        const latestBalance = stats.latestBalance;
        const latestDate = stats.latestDate || '';
        const capitalNet = stats.capitalNetChange || 0;
        const ratioVal = selectedTag?.name && initialBalancesData?.balances
          ? Number(initialBalancesData.balances[`${selectedTag.name}__ratio`] ?? 100)
          : 100;
        const ratio = ratioVal / 100;
        const currentCapital = initialBalance + capitalNet;
        // 盈亏 = (当前本金 - 最新余额 - 累计提现) × ratio
        const rawPnl = currentCapital - latestBalance - totalWithdraw;
        const totalPnl = rawPnl * ratio;
        const fmtAbs = (n: number) => '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmt = (n: number) => (n >= 0 ? '+' : '') + '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div className="fixed inset-0 z-[500] flex items-center justify-center" onClick={() => setShowPnlExplain(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative bg-white rounded-2xl w-[88%] max-w-sm max-h-[80vh] overflow-hidden shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0F0F0' }}>
                <div className="text-base font-bold text-gray-800">回报计算明细</div>
                <button onClick={() => setShowPnlExplain(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              {/* 内容 */}
              <div className="px-5 py-4 overflow-y-auto max-h-[65vh] text-sm text-gray-700">
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3">公式：回报 = (初始本金 + 增减本金 − 最新余额 − 累计提现) × 占比</div>
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                  <div className="text-xs text-gray-600 flex justify-between">
                    <span>初始本金</span>
                    <span className="font-medium font-mono">{fmtAbs(initialBalance)}</span>
                  </div>
                  {capitalNet !== 0 && (
                    <div className="text-xs text-gray-600 flex justify-between">
                      <span>{capitalNet > 0 ? '追加本金' : '减少本金'}</span>
                      <span className={`font-medium font-mono ${capitalNet > 0 ? 'text-blue-600' : 'text-orange-600'}`}>{capitalNet > 0 ? '+' : ''}{fmtAbs(capitalNet)}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-800 flex justify-between border-t border-gray-200 pt-1">
                    <span className="font-medium">当前本金</span>
                    <span className="font-bold font-mono">{fmtAbs(currentCapital)}</span>
                  </div>
                  <div className="text-xs text-gray-600 flex justify-between">
                    <span>最新余额 <span className="text-gray-400">({latestDate})</span></span>
                    <span className="font-medium font-mono text-red-500">−{fmtAbs(latestBalance)}</span>
                  </div>
                  {totalWithdraw > 0 && (
                    <div className="text-xs text-gray-600 flex justify-between">
                      <span>累计提现</span>
                      <span className="font-medium font-mono text-red-500">−{fmtAbs(totalWithdraw)}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-600 flex justify-between">
                    <span>占比</span>
                    <span className="font-medium">× {ratioVal.toFixed(2)}%</span>
                  </div>
                  <div className="text-xs font-mono text-gray-400 bg-white rounded px-2 py-1">
                    ({fmtAbs(currentCapital)} − {fmtAbs(latestBalance)}{totalWithdraw > 0 ? ` − ${fmtAbs(totalWithdraw)}` : ''}) × {ratioVal.toFixed(2)}%
                  </div>
                  <div className={`text-sm font-bold flex justify-between pt-1 border-t border-gray-200 ${totalPnl >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    <span>累计回报</span>
                    <span>{fmt(totalPnl)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 px-1">
                  <span className="text-xs text-gray-500">收益率</span>
                  <span className={`text-sm font-semibold ${stats.returnRate >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {stats.returnRate >= 0 ? '+' : ''}{stats.returnRate.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 全部模式说明弹窗 ── */}
      {showAllModeHelp && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center" onClick={() => setShowAllModeHelp(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-[88%] max-w-sm max-h-[80vh] overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0F0F0' }}>
              <div className="text-base font-bold text-gray-800">
                {showAllModeHelp === 'value' ? '「实时价値」计算说明' : showAllModeHelp === 'pnl' ? '「实时波动」计算说明' : '「历史保证金」说明'}
              </div>
              <button onClick={() => setShowAllModeHelp(null)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto max-h-[65vh] text-sm text-gray-700 space-y-3">
              {(() => {
                const totalDividend = Object.values(dividendByTag).reduce((s: number, v: any) => s + Number(v), 0);
                const perTag = allTagsStats.perTagDetail ?? [];
                const fmt = (n: number) => (n >= 0 ? '+' : '') + '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtAbs = (n: number) => '￥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                if (showAllModeHelp === 'value') {
                  const value = allTagsStats.totalMargin + overviewTotalPnlRef.current - totalDividend;
                  return (
                    <>
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">公式：价値 = 保证金总和 + 盈亏总和 − 已分红总金额</div>
                      <div className="font-semibold text-gray-900">① 保证金总和
                        <span className="ml-2 font-mono text-red-600">{fmtAbs(allTagsStats.totalMargin)}</span>
                        <span className="ml-1 text-xs font-normal text-gray-400">(客户投入的本金基数)</span>
                      </div>
                      <div className="font-semibold text-gray-900">② 盈亏总和
                        <span className={`ml-2 font-mono ${overviewTotalPnlRef.current >= 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(overviewTotalPnlRef.current)}</span>
                        <span className="ml-1 text-xs font-normal text-gray-400">(全部标签客户盈亏加总)</span>
                      </div>
                      <div className="font-semibold text-gray-900">③ 已分红总金额
                        <span className="ml-2 font-mono text-gray-700">−{fmtAbs(totalDividend)}</span>
                        <span className="ml-1 text-xs font-normal text-gray-400">(历史已分配给客户的分红，已包含在盈亏中故需扣除)</span>
                      </div>
                      <div className="pt-3" style={{ borderTop: '2px solid #F0F0F0' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">价値</span>
                          <span className={`text-lg font-bold ${value >= 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(value)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{fmtAbs(allTagsStats.totalMargin)} + ({fmt(overviewTotalPnlRef.current)}) − {fmtAbs(totalDividend)} = {fmt(value)}</div>
                      </div>
                    </>
                  );
                }

                if (showAllModeHelp === 'pnl') {
                  return (
                    <>
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">公式：回报 = (初始本金 + 增减本金 − 最新余额 − 累计提现) × 占比</div>
                      {perTag.map((t, i) => (
                        <div key={t.tagName} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                          <div className="font-semibold text-gray-900 text-xs">标签「{t.tagName}」</div>
                          {!t.hasData ? (
                            <div className="text-xs text-gray-400">暂无余额记录，跳过</div>
                          ) : (
                            <>
                              <div className="text-xs text-gray-600 flex justify-between">
                                <span>初始本金</span>
                                <span className="font-medium font-mono">{fmtAbs(t.initialBalance)}</span>
                              </div>
                              {t.capitalChange !== 0 && (
                                <div className="text-xs text-gray-600 flex justify-between">
                                  <span>{t.capitalChange > 0 ? '追加本金' : '减少本金'}</span>
                                  <span className={`font-medium font-mono ${t.capitalChange > 0 ? 'text-blue-600' : 'text-orange-600'}`}>{t.capitalChange > 0 ? '+' : ''}{fmtAbs(t.capitalChange)}</span>
                                </div>
                              )}
                              <div className="text-xs text-gray-800 flex justify-between border-t border-gray-200 pt-1">
                                <span className="font-medium">当前本金</span>
                                <span className="font-bold font-mono">{fmtAbs(t.effectiveInitial)}</span>
                              </div>
                              <div className="text-xs text-gray-600 flex justify-between">
                                <span>最新余额 <span className="text-gray-400">({t.latestDate})</span></span>
                                <span className="font-medium font-mono text-red-500">−{fmtAbs(t.latestBalance)}</span>
                              </div>
                              {t.tagWithdraw > 0 && (
                                <div className="text-xs text-gray-600 flex justify-between">
                                  <span>累计提现</span>
                                  <span className="font-medium font-mono text-red-500">−{fmtAbs(t.tagWithdraw)}</span>
                                </div>
                              )}
                              <div className="text-xs text-gray-600 flex justify-between">
                                <span>占比</span>
                                <span className="font-medium">× {(t.ratio * 100).toFixed(2)}%</span>
                              </div>
                              <div className="text-xs font-mono text-gray-400 bg-white rounded px-2 py-1">
                                ({fmtAbs(t.effectiveInitial)} − {fmtAbs(t.latestBalance)}{t.tagWithdraw > 0 ? ` − ${fmtAbs(t.tagWithdraw)}` : ''}) × {(t.ratio*100).toFixed(2)}%
                              </div>
                              <div className={`text-sm font-bold flex justify-between pt-1 border-t border-gray-200 ${t.tagPnl >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                <span>本标签回报</span>
                                <span>{fmt(t.tagPnl)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="pt-3" style={{ borderTop: '2px solid #F0F0F0' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">盈亏总和</span>
                          <span className={`text-lg font-bold ${overviewTotalPnlRef.current >= 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(overviewTotalPnlRef.current)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{perTag.filter(t => t.hasData).map(t => fmt(t.tagPnl)).join(' + ')} = {fmt(overviewTotalPnlRef.current)}</div>
                      </div>
                    </>
                  );
                }

                if (showAllModeHelp === 'margin') {
                  return (
                    <>
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">保证金是客户投入的本金，是计算盈亏和收益率的基准。下列为每个标签的保证金明细：</div>
                      {perTag.map((t) => (
                        <div key={t.tagName} className="bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-900 text-xs">标签「{t.tagName}」</span>
                            <span className="font-mono text-sm font-bold text-gray-800">
                              {t.marginCoin && CRYPTO_COINS_AA.includes(t.marginCoin)
                                ? `${t.margin} ${t.marginCoin}`
                                : fmtAbs(t.margin)}
                            </span>
                          </div>
                          {t.marginCoin && CRYPTO_COINS_AA.includes(t.marginCoin) && (
                            <div className="text-xs text-gray-400 mt-0.5">≈ {fmtAbs(t.marginCny)}（按实时价格折算）</div>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">有效本金：{fmtAbs(t.effectiveInitial)}</div>
                        </div>
                      ))}
                      <div className="pt-3" style={{ borderTop: '2px solid #F0F0F0' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">保证金总和</span>
                          <span className="text-lg font-bold text-gray-900">{fmtAbs(allTagsStats.totalMargin)}</span>
                        </div>
                        {allTagsStats.hasCrypto && <div className="text-xs text-gray-400 mt-1">数字币已按实时价格折算为人民币加总</div>}
                      </div>
                    </>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── 悬浮加号按鈕（仅管理员/创建者可见，且「2026 AA」账本除外；观察非管理员视角时隐藏） ── */}
      {canEdit && !hideFloatingAddButton && (() => {
        const viewTargetMemberFAB = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
        const viewTargetCanEditFAB = viewTargetMemberFAB ? (viewTargetMemberFAB.role === 'owner' || viewTargetMemberFAB.role === 'admin') : true;
        const effectiveCanEditFAB = !viewAsUserId || viewTargetCanEditFAB;
        return effectiveCanEditFAB;
      })() && (
        <button
          onClick={() => {
            let url = `/ledger/${ledgerId}/add`;
            if (selectedTagId) url += `?categoryId=${selectedTagId}`;
            setLocation(url);
          }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

      {/* 分红备注弹窗（客户端查看，按标签） */}
      {dividendNoteTag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDividendNoteTag(null)}
        >
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 400, maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>分红记录 · {dividendNoteTag}</span>
              <button onClick={() => setDividendNoteTag(null)} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
            </div>
            <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: '55vh' }}>
              {currentDividendRecords.length === 0 ? (
                <div className="text-center py-6" style={{ color: '#BDBDBD' }}>暂无分红记录</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {currentDividendRecords.map((r: any) => (
                      <div key={r.id} className="flex items-start justify-between gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
                        <div style={{ minWidth: 72, flexShrink: 0 }}>
                          <div className="text-xs" style={{ color: '#9E9E9E' }}>
                            {(() => { const d = new Date(r.created_at); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; })()}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {r.note ? <div className="text-xs mt-0.5" style={{ color: '#757575', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.note}</div> : null}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span className="text-sm font-semibold" style={{ color: '#D32F2F' }}>+{Number(r.amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 分红备注 */}
                  {(dividendNotesData?.notes ?? []).length > 0 && (
                    <div className="mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FFF8E1' }}>
                      <div className="text-xs font-medium mb-1" style={{ color: '#F57F17' }}>备注</div>
                      {(dividendNotesData.notes as any[]).map((note: any) => (
                        <div key={note.id} className="text-xs" style={{ color: '#5D4037', whiteSpace: 'pre-wrap' }}>{note.content}</div>
                      ))}
                    </div>
                  )}
                  {/* 累计汇总 */}
                  <div className="mt-3 px-3 py-2 rounded-xl flex items-center justify-between" style={{ backgroundColor: '#FFF3E0', borderTop: '1px solid #FFE0B2' }}>
                    <span className="text-sm font-medium" style={{ color: '#E65100' }}>累计分红</span>
                    <span className="text-base font-bold" style={{ color: '#D32F2F' }}>
                      {currentDividendRecords.reduce((s: number, r: any) => s + Number(r.amount), 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 保证金备注弹窗（客户端查看，按标签） */}
      {marginNoteTag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMarginNoteTag(null)}
        >
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 400, maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>保证金备注 · {marginNoteTag}</span>
              <button onClick={() => setMarginNoteTag(null)} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
            </div>
            <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: '55vh' }}>
              {(marginNotesData?.notes ?? []).length === 0 ? (
                <div className="text-center py-6" style={{ color: '#BDBDBD' }}>暂无备注</div>
              ) : (
                <div className="space-y-3">
                  {(marginNotesData?.notes ?? []).map((note: any) => (
                    <div key={note.id} className="px-3 py-2 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
                      <div className="text-xs" style={{ color: '#9E9E9E' }}>
                        {new Date(note.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </div>
                      <div className="text-sm mt-0.5" style={{ color: '#1A1A1A', whiteSpace: 'pre-wrap' }}>{note.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// deploy trigger Tue May 26 10:56:28 UTC 2026
