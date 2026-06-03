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
import { ChevronLeft, ChevronRight, Settings, Search, BarChart3, Plus, ChevronDown, CircleDollarSign, Users, X, RefreshCw, PauseCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageTag } from "@/components/PageTag";
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

  // 数字币价格（每3秒刷新，规范：crypto-price-unified）
  const { data: cryptoPricesData } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 0,
    placeholderData: (prev: any) => prev,
  });
  // 适配新的返回结构 { prices: {...}, changes: {...} }
  const aaCryptoPrices: Record<string, number> = (cryptoPricesData as any)?.prices ?? cryptoPricesData ?? {};

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
  const selectedTagEndDate: string | null = useMemo(() => {
    if (!selectedTagName || !initialBalancesData?.balances) return null;
    return (initialBalancesData.balances as any)[`${selectedTagName}__endDate`] ?? null;
  }, [selectedTagName, initialBalancesData]);

  // 当前用户的交易数据
  const activeMemberTransactions = useMemo(() => {
    // 过滤掉 income=0 且 expense=0 的无效记录（误输入空值/0值后删除导致）
    return (transactionsData || []).filter((d) => {
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
      // 筛选该标签下的记录（category 字段包含标签名）
      const filtered = day.records.filter((r: any) =>
        r.category && r.category.includes(tagName)
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

    // ─── 每天余额快照（直接存当天的余额绝对值，不累加）──────────────────────────
  const cumulativeMap = useMemo(() => {
    const cum = new Map<string, number>();
    filteredTransactions.forEach((d) => {
      // 每天的记录是当天余额快照，取 income 和 expense 中的主要金额
      // income 和 expense 只会有一个有值，取其绝对值作为当天余额
      const dayBalance = d.income > 0 ? d.income : d.expense;
      cum.set(d.date, dayBalance);
    });
    return cum;
  }, [filteredTransactions]);

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
  const [overviewSort, setOverviewSort] = useState<{ col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend'; dir: 'asc' | 'desc' } | null>(null);
  const handleOverviewSort = (col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend') => {
    setOverviewSort(prev => prev && prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' });
  };

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
      // 该标签的所有每日余额记录（按日期升序）
      const tagDays = (activeMemberTransactions || []).map((day: any) => {
        const filtered = (day.records || []).filter((r: any) => r.category && r.category.includes(tagName));
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
        const pnl = (initialBalance - d.balance) * ratio; // 负债视角：初始-最新=盈利
        const pctInitial = initialBalance > 0 ? ((initialBalance - d.balance) / initialBalance) * 100 * ratio : 0;
        const pctMargin = marginCny > 0 ? ((initialBalance - d.balance) * ratio / marginCny) * 100 : 0;
        return { date: d.date, pnl, pctInitial, pctMargin };
      });
      return { name: tagName, color, points, initialBalance, marginCny, marginRaw: marginRaw !== undefined && marginRaw !== null ? Number(marginRaw) : null, marginCoin: coin };
    });
  }, [initialBalancesData, categories, activeMemberTransactions, aaCryptoPrices]);

  // ─── 全部模式：计算所有标签的保证金总和和盈亏总和 ────────────────────────
  const allTagsStats = useMemo(() => {
    if (!initialBalancesData?.balances || !categories || categories.length === 0) {
      return { totalMargin: 0, totalPnl: 0, diff: 0, hasCrypto: false, cryptoDetails: [] as {coin: string, amount: number, cnyValue: number}[] };
    }
    let totalMargin = 0;
    let totalPnl = 0;
    let hasCrypto = false;
    const cryptoMap: Record<string, { amount: number, cnyValue: number }> = {};
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
      // 盈亏：需要计算每个标签的 initialBalance - latestBalance
      const initialBalance = Number(initialBalancesData.balances[tagName] ?? 0);
      const ratio = Number(initialBalancesData.balances[`${tagName}__ratio`] ?? 100) / 100;
      // 找该标签最新的余额记录（与走势图逻辑一致：每日合计，跳过balance=0的天）
      const tagStartDate = initialBalancesData.balances[`${tagName}__startDate`];
      let effectiveStartStr: string | null = null;
      if (tagStartDate) {
        effectiveStartStr = getPrevTradingDay(String(tagStartDate));
      }
      const tagDayMap: Record<string, { income: number; expense: number }> = {};
      (activeMemberTransactions || []).forEach((day: any) => {
        const filtered = (day.records || []).filter((r: any) => r.category && r.category.includes(tagName));
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
      if (filteredTagDaysStats.length > 0) {
        const last = filteredTagDaysStats[filteredTagDaysStats.length - 1];
        if (initialBalance > 0) {
          totalPnl += (initialBalance - last.balance) * ratio;
        }
      }
    });
    const cryptoDetails = Object.entries(cryptoMap).map(([coin, v]) => ({ coin, amount: v.amount, cnyValue: v.cnyValue }));
    return { totalMargin, totalPnl, diff: totalMargin + totalPnl, hasCrypto, cryptoDetails };
  }, [initialBalancesData, categories, activeMemberTransactions, aaCryptoPrices]);

  // ─── 统计数据 ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      return { latestBalance: 0, returnRate: 0, recordDays: 0, totalPnl: 0, initialBalance: 0 };
    }

    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const lastRecord = sorted[sorted.length - 1];
    // 最新余额 = 最后一天的余额快照（income 和 expense 只有一个有值）
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
    // 负债视角：最新余额变大表示亏损（-），变小表示盈利（+），乘以权重
    const rawPnl = initialBalance - latestBalance;
    const totalPnl = rawPnl * ratio;
    const returnRate = initialBalance > 0 ? (rawPnl / initialBalance) * 100 : 0;
    return { latestBalance, latestDate, returnRate, recordDays, totalPnl, initialBalance, startDate };
  }, [filteredTransactions, cumulativeMap, ledgerData, initialBalancesData, selectedTag]);

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
      // 月模式：取当月最后一天的余额快照作为该月余额
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const prefix = `${year}-${String(m).padStart(2, "0")}`;
        const monthData = sorted.filter((d) => d.date.startsWith(prefix));
        if (monthData.length === 0) return { date: `${m}月`, balance: null, pnl: null };
        // 取当月最后一天的余额快照
        const lastDay = monthData[monthData.length - 1];
        const lastBalance = lastDay.income > 0 ? lastDay.income : lastDay.expense;
        return {
          date: `${m}月`,
          balance: lastBalance,
          pnl: lastBalance,
        };
      });
    }
    // 年模式：显示全部数据，每天直接取余额快照
    return sorted.map((d) => ({
      date: d.date.slice(5),
      balance: d.income > 0 ? d.income : d.expense,
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
  const formatMoney = (v: number) => {
    // 日历格子：超过1万用「万」缩写，保留2位小数
    const abs = Math.abs(v);
    if (abs >= 100000000) return (abs / 100000000).toFixed(2) + '亿';
    if (abs >= 10000) return (abs / 10000).toFixed(2) + '万';
    return abs.toFixed(2);
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
      // 显示当天绝对金额（当天支出+收入的绝对值之和）
      const dayData = dayMap.get(dateStr);
      if (!dayData) return null;
      const dayTotal = dayData.expense + dayData.income;
      return dayTotal > 0 ? formatMoney(dayTotal) : null;
    }
    if (calendarMode === "daily") {
      // 当天绝对金额 - 前一天绝对金额的差值
      const todayData = dayMap.get(dateStr);
      if (!todayData) return null;
      const todayTotal = todayData.expense + todayData.income;
      // 找前一个有数据的日期
      const allDates = Array.from(dayMap.keys()).sort();
      const idx = allDates.indexOf(dateStr);
      if (idx <= 0) return formatMoney(todayTotal); // 第一条数据直接显示当天金额
      const prevDate = allDates[idx - 1];
      const prevData = dayMap.get(prevDate)!;
      const prevTotal = prevData.expense + prevData.income;
      const diff = todayTotal - prevTotal;
      const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
      return sign + formatMoney(Math.abs(diff));
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

  // 点击日历格子：已有记录则跳转编辑，否则跳转新增
  const handleDayClick = (day: number) => {
    const dateStr = getDateStr(day);
    const existing = dayMap.get(dateStr);

    // 观察视角权限判断：如果切换到非管理员用户视角，按只读处理
    const viewTargetMember = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
    const viewTargetCanEdit = viewTargetMember ? (viewTargetMember.role === 'owner' || viewTargetMember.role === 'admin') : true;
    const effectiveCanEdit = canEdit && (!viewAsUserId || viewTargetCanEdit);

    if (!effectiveCanEdit) {
      // 普通成员或观察非管理员视角：先检查暂停日期（仍需弹出提示），再查看图片/股票
      const pauseDateRO = selectedTagPauseDate;
      if (pauseDateRO) {
        if (dateStr === pauseDateRO) {
          alert(`暂停于 ${pauseDateRO}，此日期及之后无法添加新记录`);
          return;
        }
        if (dateStr > pauseDateRO) {
          alert(`暂停于 ${pauseDateRO}，此日期无法添加新记录`);
          return;
        }
      }
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

    // 暂停日期检查：暂停日期及之后禁止新增记录（管理员也不能新增，但可编辑已有记录）
    const pauseDate = selectedTagPauseDate;
    const isPauseDay = pauseDate && dateStr === pauseDate;
    const isPausedAfterDay = pauseDate && dateStr > pauseDate;
    // 点击暂停日期当天：弹出说明
    if (isPauseDay) {
      alert(`暂停于 ${pauseDate}，此日期及之后无法添加新记录`);
      return;
    }
    // 点击暂停日期之后的日期：同样弹出说明
    if (isPausedAfterDay) {
      alert(`暂停于 ${pauseDate}，此日期无法添加新记录`);
      return;
    }
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
      <PageTag code={`${calendarView === 'balance' ? 'P117-A' : calendarView === 'daily' ? 'P117-B' : calendarView === 'monthly' ? 'P117-C' : 'P117-D'}`} />
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
        {/* 第二行：刷新 + 返回（靠左）+ 标签下拉（充满剩余宽度） */}
        <div className="px-4 pb-2 flex items-center gap-1.5 w-full">
              {/* 刷新按钮 */}
              <button
                onClick={() => window.location.reload()}
                className="w-16 flex-shrink-0 flex items-center justify-center h-9 rounded-full text-sm font-medium"
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
                className="w-16 flex-shrink-0 flex items-center justify-center h-9 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                返回
              </button>

            {/* 标签下拉选择器（全部按钮变大） */}
            {categories && categories.length > 0 && (
              <div className="relative flex-1">
                <button
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="w-full flex items-center justify-center gap-1 h-9 rounded-full text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: selectedTag ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
                    color: selectedTag ? "#D32F2F" : "#FFFFFF",
                    border: "1px solid rgba(255,255,255,0.4)",
                  }}
                >
                  <span>{selectedTagId === null ? "全部" : (selectedTag?.name ?? "全部")}</span>
                  <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                </button>

                {showTagDropdown && (
                  <>
                    {/* 遮罩 */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowTagDropdown(false)}
                    />
                    {/* 下拉菜单 */}
                    <div
                      className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-50"
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E0E0E0",
                        minWidth: "140px",
                        maxHeight: "calc(5 * 41px)",
                        overflowY: "scroll",
                        overflowX: "hidden",
                      }}
                    >
                      {/* 全部（不筛选） */}
                      <button
                        onClick={() => { setSelectedTagId(null); setShowTagDropdown(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE]"
                        style={{
                          color: selectedTagId === null ? "#D32F2F" : "#222222",
                          fontWeight: selectedTagId === null ? 600 : 400,
                          borderBottom: "1px solid #F5F5F5",
                        }}
                      >
                        全部
                      </button>
                      {categories.map((cat: any) => (
                        <button
                          key={cat.id}
                          onClick={() => { setSelectedTagId(cat.id); setShowTagDropdown(false); }}
                          className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE]"
                          style={{
                            color: selectedTagId === cat.id ? "#D32F2F" : "#222222",
                            fontWeight: selectedTagId === cat.id ? 600 : 400,
                            borderBottom: "1px solid #F5F5F5",
                          }}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
        </div>

        {/* 4个统计卡片 */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {selectedTagId === null ? (
            /* ─── 全部模式：保证金总和 + 盈亏总和 + 差値 ─── */
            <>
              <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-xs opacity-75 mb-0.5">保证金总计</div>
                {allTagsStats.hasCrypto ? (
                  <>
                    {allTagsStats.cryptoDetails.map(d => (
                      <div key={d.coin} className="text-base font-bold leading-tight">
                        {d.amount.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} {d.coin}
                      </div>
                    ))}
                    <div className="text-xs opacity-60 mt-0.5">
                      {allTagsStats.cryptoDetails.length > 0 && aaCryptoPrices[allTagsStats.cryptoDetails[0]?.coin]
                        ? `≈ ¥${allTagsStats.totalMargin.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
                        : '≈ 获取中...'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-bold">
                      ¥{allTagsStats.totalMargin.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">全部保证金之和</div>
                  </>
                )}
              </div>
              <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-xs opacity-75 mb-0.5">数据总计</div>
                <div className="text-base font-bold">
                  {allTagsStats.totalPnl > 0 ? '+' : ''}¥{allTagsStats.totalPnl.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs opacity-60 mt-0.5">全部统计之和</div>
              </div>
              <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                {(() => {
                  const totalDividend = Object.values(dividendByTag).reduce((s: number, v: any) => s + Number(v), 0);
                  const value = allTagsStats.diff - totalDividend;
                  return (
                    <>
                      <div className="text-xs opacity-75 mb-0.5">价値（保证金 + 盈亏 - 分红）</div>
                      <div className="text-base font-bold">
                        {value > 0 ? '+' : ''}¥{value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs opacity-60 mt-0.5">已分红 ¥{totalDividend.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </>
                  );
                })()}
              </div>
              {/* AI数据库入口 */}
              <div
                className="rounded-xl p-2 cursor-pointer active:opacity-70 transition-opacity"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                onClick={() => setLocation(`/ledger/${ledgerId}/ai-database`)}
              >
                <div className="text-xs opacity-75 mb-0.5">AI数据库</div>
                <div className="text-base font-bold">进入 →</div>
                <div className="text-xs opacity-60 mt-0.5">点击查看</div>
              </div>
            </>
          ) : (
            /* ─── 单标签模式：最新余额 + 保证金 + 初始金额 + 累计盈亏 ─── */
            <>
          {/* 最新余额 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">最新余额</div>
            <div className="text-base font-bold">
              ¥{stats.latestBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <div className="text-base font-bold">未设置</div>
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
                    <div className="text-base font-bold">{num !== null ? `${num} ${coin}` : '未设置'}</div>
                    <div className="text-xs opacity-60 mt-0.5">{cnyText}</div>
                  </>
                );
              } else {
                // 法币模式：标题行只显示「保证金」，主值显示¥金额，副行显示比例
                return (
                  <>
                    <div className="text-xs opacity-75 mb-0.5">保证金</div>
                    <div className="text-base font-bold">
                      {num !== null ? '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '未设置'}
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
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">初始金额</div>
            <div className="text-base font-bold">
              {(() => {
                const tagName = selectedTag?.name;
                if (!tagName || !initialBalancesData?.balances) return '未设置';
                const val = initialBalancesData.balances[tagName];
                if (val === undefined || val === null) return '未设置';
                return '¥' + Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}
            </div>
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
            <div className="text-xs opacity-75 mb-0.5">累计盈亏</div>
            <div
              className="text-base font-bold"
              style={{ color: "#FFFFFF" }}
            >
              {stats.totalPnl > 0 ? "+" : stats.totalPnl < 0 ? "-" : ""}¥{Math.abs(stats.totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs opacity-60 mt-0.5">
              收益率 {stats.returnRate >= 0 ? "+" : ""}{stats.returnRate.toFixed(2)}%
            </div>
          </div>
            </>
          )}
        </div>
      </div>

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
                      const isPauseDay = !isNonTrading && pauseDateStr && dayDateStr2 === pauseDateStr;
                      const isPausedAfter = !isNonTrading && pauseDateStr && dayDateStr2 > pauseDateStr;
                      const cellBg = isNonTrading
                        ? '#F0F0F0'
                        : isPauseDay ? '#1565C0'
                        : isPausedAfter ? '#F0F0F0'
                        : todayMark ? '#FFF3E0' : '#F9F9F9';
                      const cellBorder = isNonTrading
                        ? '1px solid #E0E0E0'
                        : isPauseDay ? '1.5px solid #1565C0'
                        : isPausedAfter ? '1px solid #E0E0E0'
                        : todayMark ? '1.5px solid #D32F2F' : '1px solid #F0F0F0';
                      const dayNumColor = isNonTrading
                        ? '#BDBDBD'
                        : isPausedAfter ? '#BDBDBD'
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
                            <PauseCircle style={{ width: '20px', height: '20px', color: '#FFFFFF' }} />
                          ) : (
                            <>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginBottom: '1px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1, color: dayNumColor }}>{day}</span>
                                {!isPausedAfter && dotColor && (
                                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, display: 'inline-block' }} />
                                )}
                              </span>
                              {isNonTrading ? (
                                <span style={{ fontSize: '9px', fontWeight: 400, lineHeight: 1.1, color: '#BDBDBD', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
                                  {nonTradingLabel}
                                </span>
                              ) : !isPausedAfter && hasRecord ? (
                                <span style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.1, color: valueColor, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
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
                        {sign}{formatMoney(Math.abs(net))}
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
          {/* 表格标题行 */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b" style={{ borderColor: '#F5F5F5' }}>
            <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>概览</span>
          </div>
          {/* 概览表格 - 用单个 Grid 容器包裹所有行，确保整列宽度一致 */}
          {(() => {
            const visibleTags = allTagsChartData.filter(tag => tag.points.length > 0);
            const validTags = visibleTags.filter(t => t.marginCny > 0);
            // 计算每个 tag 的数据
            const tagData = visibleTags.map((tag, idx) => {
              const configStartDate = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__startDate`] ?? '') : '';
              const firstDate = configStartDate || tag.points[0]?.date;
              const configPauseDate = initialBalancesData?.balances ? String(initialBalancesData.balances[`${tag.name}__pauseDate`] ?? '') : '';
              // 有暂停日期时，截止日期为暂停前一天；否则截止日期为今天
              let endDate = new Date().toISOString().slice(0, 10);
              let isPaused = false;
              if (configPauseDate) {
                const pauseD = new Date(configPauseDate);
                pauseD.setDate(pauseD.getDate() - 1);
                const dayBefore = pauseD.toISOString().slice(0, 10);
                if (dayBefore <= endDate) { endDate = dayBefore; isPaused = true; }
              }
              const days = firstDate ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(firstDate).getTime()) / 86400000) + 1) : 0;
              const latestPnl = tag.points[tag.points.length - 1]?.pnl ?? 0;
              const latestDate = tag.points[tag.points.length - 1]?.date ?? null;
              const annualized = tag.marginCny > 0 && days > 0 ? (latestPnl / tag.marginCny / days) * 365 * 100 : null;
              const divAmt = dividendByTag[tag.name] ?? 0;
              return { tag, days, latestPnl, latestDate, annualized, divAmt, isLast: idx === visibleTags.length - 1, isPaused, firstDate, endDate };
            });
            // 排序逻辑
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
            }) : tagData;
            // 汇总行数据
            const totalMargin = validTags.reduce((s, t) => s + t.marginCny, 0);
            // totalPnl 统计所有有数据的标签（不限于有保证金），与红色区域「全部统计之和」口径一致
            const totalPnl = visibleTags.reduce((s, t) => s + (t.points[t.points.length - 1]?.pnl ?? 0), 0);
            const weightedDenominator = validTags.reduce((s, t) => {
              const configSD = initialBalancesData?.balances ? String(initialBalancesData.balances[`${t.name}__startDate`] ?? '') : '';
              const firstDate = configSD || t.points[0]?.date;
              const today = new Date().toISOString().slice(0, 10);
              const days = firstDate ? Math.max(1, Math.round((new Date(today).getTime() - new Date(firstDate).getTime()) / 86400000) + 1) : 1;
              return s + t.marginCny * (days / 365);
            }, 0);
            const weightedAnnualized = weightedDenominator > 0 ? (totalPnl / weightedDenominator) * 100 : null;
            const totalDividend = Object.values(dividendByTag).reduce((s, v) => s + v, 0);
            // Grid 列定义：名称固定52px，其他列 minmax 自适应
            // 横向可滑动概览表：默认显示名称/周期/占比/金额/回报，年化和分红隐藏在右侧
            // 前5列自动平分屏幕宽度，年化/分红固定宽度溢出到右侧可滑动查看
            // 列定义：名称(72px) 周期(1fr) 占比(1fr) 金额(1.5fr) 回报(1.5fr) 年化(64px溢出) 分红(64px溢出)
            const gridCols = '72px 1px 1fr 1px 1fr 1px 1.5fr 1px 1.5fr 1px 64px 1px 64px';
            // 表头行高与数据行一致：py-2
            const cellCls = 'px-1 py-2 font-medium text-center';
            const dataCellCls = 'px-1 py-2 text-center';
            const dataCellStyle = { whiteSpace: 'nowrap' as const };
            const dividerStyle = { backgroundColor: '#F0F0F0', width: 1, alignSelf: 'stretch' as const };
            // 内容宽度：前5列占满屏幕，年化/分红固定64px共128px溢出到右侧
            const overviewInnerWidth = 'calc(100% + 130px)';
            // 排序箭头辅助
            const SortArrow = ({ col }: { col: 'days' | 'ratio' | 'amount' | 'pnl' | 'annualized' | 'dividend' }) => {
              if (!overviewSort || overviewSort.col !== col) return <span style={{ color: '#D0D0D0', fontSize: 7, marginLeft: 1 }}>▼</span>;
              return <span style={{ color: '#1565C0', fontSize: 7, marginLeft: 1 }}>{overviewSort.dir === 'desc' ? '▼' : '▲'}</span>;
            };
            const sortHeaderCls = cellCls + ' cursor-pointer select-none';
            return (
              <div
                style={{
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  touchAction: 'pan-x pan-y',
                }}
              >
              <div style={{ minWidth: '100%', width: overviewInnerWidth }}>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
                {/* 表头行 */}
                <div className={cellCls} style={{ borderBottom: '1px solid #F5F5F5' }}><span style={{ color: '#9E9E9E', fontSize: 12 }}>名称</span></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => handleOverviewSort('days')}><span style={{ color: overviewSort?.col === 'days' ? '#1565C0' : '#9E9E9E' }}>周期</span><SortArrow col="days" /></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => handleOverviewSort('ratio')}><span style={{ color: overviewSort?.col === 'ratio' ? '#1565C0' : '#9E9E9E' }}>占比</span><SortArrow col="ratio" /></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => handleOverviewSort('amount')}><span style={{ color: overviewSort?.col === 'amount' ? '#1565C0' : '#9E9E9E' }}>金额¥</span><SortArrow col="amount" /></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => handleOverviewSort('pnl')}><span style={{ color: overviewSort?.col === 'pnl' ? '#1565C0' : '#9E9E9E' }}>回报¥</span><SortArrow col="pnl" /></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={sortHeaderCls} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => handleOverviewSort('annualized')}><span style={{ color: overviewSort?.col === 'annualized' ? '#1565C0' : '#9E9E9E' }}>年化</span><SortArrow col="annualized" /></div>
                <div style={{ ...dividerStyle, borderBottom: '1px solid #F5F5F5' }} />
                <div className={cellCls + ' cursor-pointer'} style={{ borderBottom: '1px solid #F5F5F5', fontSize: 12 }} onClick={() => { handleOverviewSort('dividend'); }}>
                  <span style={{ color: overviewSort?.col === 'dividend' ? '#1565C0' : '#1565C0', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '2px' }} onClick={(e) => { e.stopPropagation(); setLocation(`/ledger/${ledgerId}/aa-dividend-manage${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`); }}>分红¥</span><SortArrow col="dividend" />
                </div>
                {/* 数据行 */}
                {sortedTagData.map(({ tag, days, latestPnl, latestDate, annualized, divAmt, isLast, isPaused, firstDate, endDate }) => {
                      // 判断是否需要灰色：北京时间交易日15:00后且最新数据不是今天
                      const _nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
                      const _todayBJ = _nowBJ.toISOString().slice(0, 10);
                      const _hourBJ = _nowBJ.getUTCHours();
                      const _dowBJ = _nowBJ.getUTCDay(); // 0=周日,6=周六
                      const _isTradeDay = _dowBJ >= 1 && _dowBJ <= 5;
                      const _isStale = _isTradeDay && _hourBJ >= 15 && latestDate !== _todayBJ;
                  const rowBorder = isLast ? 'none' : '1px solid #F9F9F9';
                  return (
                    <>
                      {/* 名称 */}
                      <div key={`${tag.name}-name`} className="py-2 flex items-center justify-start gap-1" style={{ borderBottom: rowBorder, position: 'relative', paddingLeft: 6, paddingRight: 2, overflow: 'hidden' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: tag.color, flexShrink: 0 }} />
                        <span
                          style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, cursor: tag.name.length > 4 ? 'pointer' : 'default', textDecoration: tag.name.length > 4 ? 'underline' : 'none', textDecorationStyle: tag.name.length > 4 ? 'dashed' : undefined, textDecorationColor: tag.name.length > 4 ? '#999' : undefined, textUnderlineOffset: '2px' }}
                          onClick={() => tag.name.length > 4 ? setTooltipTagName(tooltipTagName === tag.name ? null : tag.name) : undefined}
                        >{tag.name.length > 4 ? tag.name.slice(0, 4) + '…' : tag.name}</span>
                        {tooltipTagName === tag.name && (
                          <div style={{ position: 'absolute', zIndex: 50, background: '#333', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', transform: 'translateY(-120%)', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                            {tag.name}
                          </div>
                        )}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 周期 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13 }}>
                        {isPaused ? (
                          <span
                            style={{ display: 'inline-block', backgroundColor: '#1565C0', color: '#FFFFFF', borderRadius: 3, padding: '1px 3px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            onClick={() => {
                              if (!firstDate || !endDate) return;
                              const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${Number(m)}月${Number(dd)}日`; };
                              alert(`${fmt(firstDate)} ~ ${fmt(endDate)}，共 ${days} 天`);
                            }}
                          >{days > 0 ? `${days}天` : '--'}</span>
                        ) : (
                          <span style={{ color: '#424242', whiteSpace: 'nowrap', fontSize: 13 }}>{days > 0 ? `${days}天` : '--'}</span>
                        )}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 占比 */}
                      {(() => {
                        const ratioVal = initialBalancesData?.balances ? initialBalancesData.balances[`${tag.name}__ratio`] : undefined;
                        const ratioNum = ratioVal !== undefined && ratioVal !== null ? Number(ratioVal) : null;
                        // 初始金额：该标签在账本设置里配置的起始资金
                        const tagInitialBalance = tag.initialBalance ?? 0;
                        const actualAmt = ratioNum !== null && tagInitialBalance > 0 ? tagInitialBalance * (ratioNum / 100) : null;
                        return (
                          <div className={dataCellCls} style={{ borderBottom: rowBorder, position: 'relative' }}>
                            <span
                              style={{
                                fontSize: 13,
                                color: ratioNum !== null ? '#424242' : '#BDBDBD',
                                cursor: ratioNum !== null ? 'pointer' : 'default',
                                textDecoration: ratioNum !== null ? 'underline' : 'none',
                                textDecorationStyle: 'dashed',
                                textDecorationColor: '#999',
                                textUnderlineOffset: '2px',
                              }}
                              onClick={() => ratioNum !== null ? setTooltipRatioTag(tooltipRatioTag === tag.name ? null : tag.name) : undefined}
                            >
                              {ratioNum !== null ? `${ratioNum.toFixed(0)}%` : '--'}
                            </span>
                            {tooltipRatioTag === tag.name && ratioNum !== null && actualAmt !== null && (
                              <div style={{
                                position: 'absolute', bottom: '100%', right: 0, zIndex: 50,
                                background: '#1A1A1A', color: '#FFF', borderRadius: 6,
                                padding: '5px 8px', whiteSpace: 'nowrap', fontSize: 10,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.25)', marginBottom: 4,
                              }}>
                                {tagInitialBalance.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} × {ratioNum.toFixed(0)}% = {actualAmt.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 金额 */}
                      <div className="px-1 py-2 flex flex-col items-center justify-center" style={{ borderBottom: rowBorder }}>
                        {tag.marginCny > 0 ? (
                          <>
                            <div style={{ fontSize: 13, lineHeight: 1, color: '#424242' }}>{tag.marginCny.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</div>
                            {tag.marginCoin && CRYPTO_COINS_AA.includes(tag.marginCoin) && tag.marginRaw !== null && (
                              <div style={{ fontSize: 9, marginTop: 2, lineHeight: 1, color: '#BDBDBD' }}>{tag.marginRaw} {tag.marginCoin}</div>
                            )}
                          </>
                        ) : <span style={{ fontSize: 13, color: '#BDBDBD' }}>--</span>}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 回报 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13, color: _isStale ? '#BDBDBD' : latestPnl > 0 ? '#D32F2F' : latestPnl < 0 ? '#388E3C' : '#BDBDBD' }}>
                        {latestPnl !== 0 ? `${latestPnl < 0 ? '-' : ''}${Math.abs(latestPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 年化 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13, color: _isStale || annualized === null ? '#BDBDBD' : annualized >= 0 ? '#D32F2F' : '#388E3C' }}>
                        {annualized === null ? '--' : `${annualized >= 0 ? '+' : ''}${annualized.toFixed(1)}%`}
                      </div>
                      <div style={{ ...dividerStyle, borderBottom: rowBorder }} />
                      {/* 分红 */}
                      <div className={dataCellCls} style={{ borderBottom: rowBorder, whiteSpace: 'nowrap', fontSize: 13, color: divAmt > 0 ? '#D32F2F' : '#BDBDBD' }}>
                        {divAmt > 0 ? `${divAmt.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </div>
                    </>
                  );
                })}
                {/* 汇总行 */}
                {validTags.length > 0 && (
                  <>
                    {/* 合计-名称 */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', borderRadius: '0 0 0 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#9E9E9E' }}>合计</span>
                    </div>
                    {/* 站线要用 background 而非 border，这样才能覆盖 borderTop */}
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 周期 -- */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA' }}>
                      <span style={{ fontSize: 13, color: '#BDBDBD' }}>--</span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 占比 -- */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA' }}>
                      <span style={{ fontSize: 13, color: '#BDBDBD' }}>--</span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 金额：只显示人民币汇总，居中 */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{totalMargin.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 回报 */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: totalPnl > 0 ? '#D32F2F' : totalPnl < 0 ? '#388E3C' : '#BDBDBD' }}>
                        {totalPnl !== 0 ? `${totalPnl < 0 ? '-' : ''}${Math.abs(totalPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 年化 */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: weightedAnnualized === null ? '#BDBDBD' : weightedAnnualized >= 0 ? '#D32F2F' : '#388E3C' }}>
                        {weightedAnnualized === null ? '--' : `${weightedAnnualized >= 0 ? '+' : ''}${weightedAnnualized.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#E0E0E0', width: 1, borderTop: '1px solid #F0F0F0' }} />
                    {/* 分红 */}
                    <div className="px-1 py-2 flex items-center justify-center" style={{ borderTop: '1px solid #F0F0F0', backgroundColor: '#FAFAFA', borderRadius: '0 0 16px 0' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: totalDividend > 0 ? '#D32F2F' : '#BDBDBD' }}>
                        {totalDividend > 0 ? `${totalDividend.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '--'}
                      </span>
                    </div>
                  </>
                )}
              </div>
              </div>
              </div>
            );
          })()}
          </div>
          )}

          <div className="mx-3 mt-2 rounded-2xl shadow-sm mb-4" style={{ backgroundColor: '#FFFFFF' }}>
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
          </div>
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
    </div>
  );
}
// deploy trigger Tue May 26 10:56:28 UTC 2026
