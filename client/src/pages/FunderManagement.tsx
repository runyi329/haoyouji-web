import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getUserDisplayName, getUserSearchLabel, matchesUserSearch } from "@/lib/userIdentity";
import { ChevronLeft, ChevronDown, ChevronRight, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { FunderOrderCard, COIN_OPTIONS, COIN_COLORS, STATUS_OPTIONS, INTEREST_PAYMENT_OPTIONS, getBeijingToday, DatePicker, CoinType, INTEGER_COINS_FUNDER } from "@/components/FunderOrderCard";
import { FunderOrderCardV2Silver, FunderLenderCardSilver } from "@/components/FunderOrderCardV2";
import { formatFunderAnnualRate, limitFunderAnnualRateInput, normalizeFunderAnnualRate } from "@/lib/funderAnnualRate";



interface FunderManagementProps {
  adminOnly?: boolean;
  financeOnly?: boolean;
  ledgerIdProp?: number;
  hideHeader?: boolean;
  onRecycleBinRef?: (openFn: () => void) => void;
}

type ManualStockPosition = {
  name: string;
  symbol: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  // 账户总额度模式用作首次计算兜底；每日 15:05 的盘尾快照会优先覆盖它。
  latestPrice?: string;
  latestPriceDate?: string;
  latestPriceUpdatedAt?: string;
};

const formatChineseStockPriceDate = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (parts) return `${parts[1]}年${Number(parts[2])}月${Number(parts[3])}日`;
  return text;
};

type CompactDisplayToggleProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  tone?: 'blue' | 'indigo' | 'orange' | 'purple';
};

function CompactDisplayToggle({ label, checked, onToggle, tone = 'blue' }: CompactDisplayToggleProps) {
  const activeTone = {
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
  }[tone];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={`切换${label}`}
      className="flex min-h-8 min-w-0 items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
    >
      <span className="min-w-0 truncate text-[11px] font-medium text-gray-600">{label}</span>
      <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? activeTone : 'bg-gray-200'}`} aria-hidden="true">
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-3' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

export default function FunderManagement({ ledgerIdProp, hideHeader, adminOnly, financeOnly, onRecycleBinRef }: FunderManagementProps = {}) {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, routeParams2] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = ledgerIdProp || (params?.id ? parseInt(params.id) : (routeParams2?.id ? parseInt(routeParams2.id) : 0));
  const trpcUtils = trpc.useUtils();

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
  // 中侧是管理员统一订单台：本地索引所有订单字段，并在命中后展开同一关联组的全部独立视图。
  const [orderSearchText, setOrderSearchText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showInterestDatePicker, setShowInterestDatePicker] = useState(false);
  // 多视角订单参与方相关 state
  const [showParticipantsPanel, setShowParticipantsPanel] = useState<number | null>(null); // 当前展开参与方面板的订单id
  const [participantsEditMode, setParticipantsEditMode] = useState(false); // 参与方面板是否处于编辑态（已保存默认只读）
  type ParticipantRole = 'funder' | 'borrower' | 'broker';
  type ParticipantItem = { userId: number; displayName: string; role: ParticipantRole; sortOrder: number; rate: string };
  type LedgerMember = { userId: number; displayName: string; memberRole: string };
  const [participantsList, setParticipantsList] = useState<ParticipantItem[]>([]);
  const [ledgerMembers, setLedgerMembers] = useState<LedgerMember[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const ROLE_OPTIONS: { value: ParticipantRole; label: string; color: string; defaultRateLabel: string }[] = [
    { value: 'funder', label: '资金方', color: '#1A56DB', defaultRateLabel: '年化利率' },
    { value: 'borrower', label: '借款人', color: '#D97706', defaultRateLabel: '综合利率' },
    { value: 'broker', label: '中间人', color: '#059669', defaultRateLabel: '介绍费' },
  ];
  // 结息记录相关 state
  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null); // 当前展开结息面板的订单id
  const [paymentForm, setPaymentForm] = useState({ amount: '', currency: 'U' as 'CNY' | 'U', exchangeRate: '6.75', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null); // 正在编辑的结息记录id
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  // 将打开回收站的方法暴露给父组件
  useEffect(() => {
    if (onRecycleBinRef) {
      onRecycleBinRef(() => setShowRecycleBin(true));
    }
  }, [onRecycleBinRef]);

  const [formData, setFormData] = useState({
    userId: 0,
    coin: 'BTC' as CoinType,
    amountCurrency: 'USDT' as CoinType, // 融资金额出资币种（独立于标的币种）
    buyPrice: '',
    buyQuantity: '',
    buyDate: getBeijingToday(),
    storageAccount: '',
    status: 'active',
    adminNote: '',
    publicNote: '',
    interestRateAnnual: '',
    interestPaymentType: '',
    interestBase: '',
    interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
    interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
    interestStartDate: getBeijingToday(),
    showProfitShare: true,
    commissionShare: '',
    profitShareRatio: '', // 收益分成比例（百分数，如 20 表示 20%）
    profitShareType: 'interest' as 'interest' | 'coin', // 分成类型：interest=利息分成，coin=币种收益分成
    originalAmount: '', // 编辑时保存原订单金额，买入价格或数量为空时回退使用
    // 受邀订单佣金配置
    commissionRate: '',
    commissionBase: '',
    commissionStartDate: '',
    assetType: '' as '' | 'stock' | 'crypto' | 'crypto_option',
    tradeDirection: null as null | 'long' | 'short',
    ownerLabel: '',
    ownerLabelMode: 'member' as 'member' | 'manual',
    // 拥有者/参与者的业务页眉。它是独立视图中的业务标题，不会覆盖真实账号或订单拥有者身份。
    personalHeaderLabel: '',
    ownerNameDisplay: 'self' as 'all' | 'self',
    ownerVisibilityMode: 'self' as 'self' | 'total' | 'breakdown' | 'partners',
    ownerVisibleOwnerIds: [] as number[],
    tags: [] as string[],
    principalLentOut: false,
    tradingFeeRate: '2',
    tradingFeeStatus: 'unpaid' as 'unpaid' | 'half_paid' | 'paid',
    brokerName: '',
    brokerAccount: '',
    orderFillStatus: 'filled' as 'pending' | 'filled',
    orderPerspective: 'self' as 'self' | 'other',
  });
  // 期权专属表单数据
  const [optionFormData, setOptionFormData] = useState({
    optionCurrency: 'BTC' as CoinType,
    direction: 'long_call' as 'long_call' | 'long_put' | 'short_call' | 'short_put',
    exerciseDate: '',      // YYYY-MM-DD，用于保存和 Greeks
    deribitLabel: '',      // Deribit 格式如 "8JUL26"，用于查行权价
    strikePrice: '',
    premium: '',
    premiumDenomination: 'USDT' as CoinType,
    buyQty: '',
  });
  // 标签与个人订单页眉输入状态
  const [tagInput, setTagInput] = useState('');
  const [personalHeaderDraft, setPersonalHeaderDraft] = useState('');
  // 担保货币列表：[{ coin: 'BTC', qty: '' }, ...]
  const [collateralAssets, setCollateralAssets] = useState<{ coin: string; qty: string; note?: string; source?: 'wallet' }[]>([]);
  // 历史钱包担保有少量记录未带 source 字段；以固定冻结备注兼容识别，避免被误当作手工担保删除。
  const isWalletCollateralAsset = (asset: { source?: string; note?: string }) => asset.source === 'wallet' || asset.note === '钱包担保冻结';
  // 担保货币编辑模式：编辑已有订单时默认只读，点「编辑」才可改；新建订单时恒为可编辑
  const [collateralEditMode, setCollateralEditMode] = useState(false);
  const [walletCollateralEditMode, setWalletCollateralEditMode] = useState(false);
  // 共享担保模式：none=不共享, self=本人订单共享, cross=与他人共享（占位）
  const [collateralShareMode, setCollateralShareMode] = useState<'none' | 'self' | 'cross'>('none');
  // 共享担保确认弹窗
  const [shareConfirmModal, setShareConfirmModal] = useState<{ mode: 'self' | 'cross'; sharedOrders: any[] } | null>(null);
  // 37号标签可独立提供股票浮动盈亏和担保货币，二者不再互斥。
  // 未保存这两个开关的旧订单一律按 true 兼容，保持原有“同时引用”的行为。
  const [collateralSourceMode, setCollateralSourceMode] = useState<'manual' | 'wallet' | 'external'>('manual');
  const [collateralSource, setCollateralSource] = useState<{
    ledgerId: number;
    tagName: string;
    floatingPnlTagName?: string;
    // 默认使用未乘倍率的真实净值盈亏；只有管理员主动选择时才使用37号页的倍数后净值盈亏。
    floatingPnlCalculationMode?: 'raw_net_pnl' | 'leveraged_net_pnl';
    collateralTagName?: string;
    // 37号“剩余保证金占基数比”独立引用；仅用于52号卡片的保证金率展示。
    marginRateTagName?: string;
    useFloatingPnl?: boolean;
    useCollateral?: boolean;
    useMarginRate?: boolean;
    useInterest?: boolean;
  } | null>(null);
  // 股票浮动盈亏可独立选择：37号标签、管理员录入的股票组合，或不调用外部来源。
  // 手工股票支持两种基准：逐只买入价，或账户初始总额度；当前价统一由每日盘尾快照提供。
  const [stockPnlSourceMode, setStockPnlSourceMode] = useState<'none' | 'reference37' | 'manual_positions'>('none');
  const [manualStockPnlCalculationMode, setManualStockPnlCalculationMode] = useState<'position_cost' | 'total_capital'>('position_cost');
  const [manualStockPositions, setManualStockPositions] = useState<ManualStockPosition[]>([]);
  const [manualStockTotalCapital, setManualStockTotalCapital] = useState('');
  const [manualStockCapitalCurrency, setManualStockCapitalCurrency] = useState<'CNY' | 'USD'>('CNY');
  const [manualStockPnlCoefficient, setManualStockPnlCoefficient] = useState('1');
  // A 股检索仅服务于编辑区：输入六码、名称或拼音简称后，管理员从校验结果中选中股票。
  const [manualStockLookupRow, setManualStockLookupRow] = useState<number | null>(null);
  const [manualStockLookupInput, setManualStockLookupInput] = useState('');
  const [manualStockLookupQuery, setManualStockLookupQuery] = useState('');
  // 37号利息分为两条独立引用：待结引用应计部分，已结引用“计入已付”的手工负数分段。
  // 旧订单只保存 interestTagName，读取时一律兼容为“仅已结引用”。
  const [pendingInterestTagName, setPendingInterestTagName] = useState<string>('');
  const [paidInterestTagName, setPaidInterestTagName] = useState<string>('');
  const isUsing37Collateral = collateralSourceMode === 'external'
    && !!(collateralSource?.collateralTagName || (collateralSource?.tagName && collateralSource?.useCollateral !== false));

  // 同一份草稿同时供实时预览、底部订单保存和「保存37号引用」使用，
  // 避免任一入口遗漏待结／已结的独立标签字段。
  // 钱包担保只控制担保物来源，不应抹掉已配置的37号引用或手工股票组合缓存。
  const linkedInterestSourceDraft = useMemo(() => {
    if (!collateralSource) return null;
    const floatingPnlTagName = collateralSource.floatingPnlTagName
      || (collateralSource.useFloatingPnl !== false ? collateralSource.tagName : '');
    const collateralTagName = collateralSource.collateralTagName
      || (collateralSource.useCollateral !== false ? collateralSource.tagName : '');
    const marginRateTagName = collateralSource.marginRateTagName || '';
    const legacyTagName = collateralTagName || floatingPnlTagName || marginRateTagName || pendingInterestTagName || paidInterestTagName;
    if (!legacyTagName) return null;
    return {
      ledgerId: 37,
      tagName: legacyTagName,
      floatingPnlTagName: floatingPnlTagName || undefined,
      floatingPnlCalculationMode: collateralSource.floatingPnlCalculationMode || 'raw_net_pnl',
      collateralTagName: collateralTagName || undefined,
      useFloatingPnl: !!floatingPnlTagName,
      useCollateral: !!collateralTagName,
      marginRateTagName: marginRateTagName || undefined,
      useMarginRate: !!marginRateTagName,
      pendingInterestTagName: pendingInterestTagName || undefined,
      usePendingInterest: !!pendingInterestTagName,
      paidInterestTagName: paidInterestTagName || undefined,
      usePaidInterest: !!paidInterestTagName,
      // 兼容未升级卡片：旧字段始终只对应已结利息。
      interestTagName: paidInterestTagName || undefined,
      useInterest: !!paidInterestTagName,
    };
  }, [collateralSourceMode, collateralSource, pendingInterestTagName, paidInterestTagName]);

  const validManualStockPositions = useMemo(() => manualStockPositions
    .map((position) => {
      const sellPrice = position.sellPrice.trim();
      return {
        name: position.name.trim().slice(0, 48),
        symbol: position.symbol.trim().toUpperCase(),
        buyPrice: manualStockPnlCalculationMode === 'total_capital' ? undefined : position.buyPrice.trim(),
        sellPrice: manualStockPnlCalculationMode === 'total_capital' ? undefined : sellPrice || undefined,
        quantity: position.quantity.trim(),
        latestPrice: position.latestPrice && Number(position.latestPrice) > 0 ? position.latestPrice.trim() : undefined,
        latestPriceDate: position.latestPriceDate || undefined,
        latestPriceUpdatedAt: position.latestPriceUpdatedAt || undefined,
      };
    })
    .filter((position) => /^[A-Z][A-Z0-9.\-]{0,14}$|^\d{6}\.(?:SH|SZ|BJ)$/.test(position.symbol))
    .filter((position) => Number(position.quantity) > 0 && (!position.sellPrice || Number(position.sellPrice) > 0))
    .filter((position) => manualStockPnlCalculationMode === 'total_capital' || Number(position.buyPrice) > 0)
    .slice(0, 20), [manualStockPositions, manualStockPnlCalculationMode]);
  const isManualStockTotalCapitalValid = useMemo(() => {
    const value = Number(manualStockTotalCapital);
    return Number.isFinite(value) && value > 0 && value <= 1_000_000_000_000;
  }, [manualStockTotalCapital]);
  const isManualStockPnlCoefficientValid = useMemo(() => {
    const value = Number(manualStockPnlCoefficient);
    return Number.isFinite(value) && value > 0 && value <= 100000;
  }, [manualStockPnlCoefficient]);
  const normalizedManualStockPnlCoefficient = isManualStockPnlCoefficientValid
    ? Number(manualStockPnlCoefficient)
    : 1;
  const manualStockPreviewSymbols = useMemo(
    () => validManualStockPositions.map((position) => position.symbol),
    [validManualStockPositions],
  );
  useEffect(() => {
    if (manualStockLookupRow === null || manualStockLookupInput.trim().length < 2) {
      setManualStockLookupQuery('');
      return;
    }
    const timer = window.setTimeout(() => setManualStockLookupQuery(manualStockLookupInput.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [manualStockLookupRow, manualStockLookupInput]);
  const manualStockLookupQueryResult = (trpc as any).searchManualAshareStocks.useQuery(
    { query: manualStockLookupQuery || 'xx' },
    { enabled: formData.assetType === 'stock' && stockPnlSourceMode === 'manual_positions' && manualStockLookupRow !== null && manualStockLookupQuery.length >= 2, staleTime: 60_000 },
  );
  const manualStockLookupResults = ((manualStockLookupQueryResult.data as any)?.results ?? []) as Array<{
    symbol: string; code: string; name: string; latestPrice?: number; latestPriceDate?: string; latestPriceUpdatedAt?: string;
  }>;
  const updateManualStockLookupInput = useCallback((rowIndex: number, field: 'name' | 'symbol', value: string) => {
    setManualStockPositions(items => items.map((item, itemIndex) => itemIndex === rowIndex
      ? { ...item, [field]: field === 'symbol' ? value.toUpperCase() : value }
      : item));
    setManualStockLookupRow(rowIndex);
    setManualStockLookupInput(value);
  }, []);
  const selectManualAshareStock = useCallback((rowIndex: number, suggestion: { symbol: string; name: string; latestPrice?: number; latestPriceDate?: string; latestPriceUpdatedAt?: string }) => {
    setManualStockPositions(items => items.map((item, itemIndex) => itemIndex === rowIndex ? {
      ...item,
      name: suggestion.name,
      symbol: suggestion.symbol,
      latestPrice: Number(suggestion.latestPrice) > 0 ? String(suggestion.latestPrice) : '',
      latestPriceDate: suggestion.latestPriceDate || '',
      latestPriceUpdatedAt: suggestion.latestPriceUpdatedAt || '',
    } : item));
    setManualStockLookupRow(null);
    setManualStockLookupInput('');
    setManualStockLookupQuery('');
  }, []);
  // 六码与仅命中一只股票的名称/拼音可直接回填；多个简称候选则保留清单供管理员确认。
  useEffect(() => {
    if (manualStockLookupRow === null || manualStockLookupQueryResult.isFetching) return;
    const typedCode = manualStockLookupInput.trim().toUpperCase()
      .replace(/^(?:SH|SZ|BJ)[._-]?/, '')
      .replace(/[._-]?(?:SH|SZ|BJ)$/, '');
    const exactSuggestion = /^\d{6}$/.test(typedCode)
      ? manualStockLookupResults.find((suggestion) => suggestion.code === typedCode)
      : undefined;
    const onlySuggestion = manualStockLookupResults.length === 1 ? manualStockLookupResults[0] : undefined;
    const suggestion = exactSuggestion || onlySuggestion;
    if (suggestion) selectManualAshareStock(manualStockLookupRow, suggestion);
  }, [manualStockLookupRow, manualStockLookupInput, manualStockLookupResults, manualStockLookupQueryResult.isFetching, selectManualAshareStock]);
  // 编辑页只读展示已保存的盘尾价；不会在盘中额外拉取实时股票行情。
  const manualStockClosePreviewQuery = (trpc as any).getManualStockCloseSnapshots.useQuery(
    { symbols: manualStockPreviewSymbols },
    { enabled: formData.assetType === 'stock' && stockPnlSourceMode === 'manual_positions' && manualStockPreviewSymbols.length > 0, staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false },
  );
  const manualStockPreviewQuotes = ((manualStockClosePreviewQuery.data as any)?.quotes ?? {}) as Record<string, { price?: number; currency?: string; priceDate?: string; updatedAt?: string }>;

  // 手工股票组合是订单可回切的配置缓存，与当前浮盈来源分离保存。
  // 切换为37号标签或不引用时，缓存必须保留，避免再次切回时丢失已录入的股票与参数。
  const manualStockPnlCache = useMemo(() => {
    if (formData.assetType !== 'stock' || validManualStockPositions.length === 0) return null;
    return {
      calculationMode: manualStockPnlCalculationMode,
      positions: validManualStockPositions,
      totalCapital: manualStockPnlCalculationMode === 'total_capital' ? manualStockTotalCapital.trim() : undefined,
      capitalCurrency: manualStockPnlCalculationMode === 'total_capital' ? manualStockCapitalCurrency : undefined,
      coefficient: normalizedManualStockPnlCoefficient,
    };
  }, [formData.assetType, validManualStockPositions, manualStockPnlCalculationMode, manualStockTotalCapital, manualStockCapitalCurrency, normalizedManualStockPnlCoefficient]);

  // 与37号引用共用同一份 collateral_source JSON：允许37号担保/利息与手工股票浮盈并存，
  // 但浮动盈亏本身只取一种来源，避免同一笔风险被重复计入。
  const orderCollateralSourceDraft = useMemo(() => {
    if (formData.assetType === 'stock' && manualStockPnlCache) {
      const baseSource = linkedInterestSourceDraft || {
        ledgerId: 0,
        tagName: 'manual-stock-positions-cache',
      };
      if (stockPnlSourceMode !== 'manual_positions') {
        return {
          ...baseSource,
          stockManualPnl: manualStockPnlCache,
        };
      }
      return {
        ...baseSource,
        floatingPnlTagName: undefined,
        useFloatingPnl: false,
        stockPnlSource: 'manual_positions' as const,
        stockPnlCalculationMode: manualStockPnlCalculationMode,
        stockPositions: validManualStockPositions,
        stockTotalCapital: manualStockPnlCalculationMode === 'total_capital' ? manualStockTotalCapital.trim() : undefined,
        stockCapitalCurrency: manualStockPnlCalculationMode === 'total_capital' ? manualStockCapitalCurrency : undefined,
        // 先汇总每只股票的原始盈亏，再乘此系数；默认 1 表示不放大或缩小。
        stockPnlCoefficient: normalizedManualStockPnlCoefficient,
        stockManualPnl: manualStockPnlCache,
      };
    }
    return linkedInterestSourceDraft;
  }, [formData.assetType, stockPnlSourceMode, validManualStockPositions, manualStockPnlCalculationMode, manualStockTotalCapital, manualStockCapitalCurrency, normalizedManualStockPnlCoefficient, linkedInterestSourceDraft, manualStockPnlCache]);

  // 字段展示配置（控制订单卡片各字段的显示/隐藏）
  const DEFAULT_DISPLAY_CONFIG: Record<string, boolean | string> = {
    buyPrice: true,
    buyValue: true,
    interestBase: true,
    buyDate: true,
    openPrice: true,
    todayPrice: true,
    currentValue: true,
    holdDuration: true,
    orderNo: true,
    accruedInterest: true,
    paidInterest: true,
    interestStartDate: true,
    collateralCoin: true,
    collateralValue: true,
    collateral: true,
    // 保证金率仅在编辑时主动开启，避免所有订单默认占用卡片空间。
    marginRate: false,
    profitShare: false,
    commissionShare: false,
    aiIcon: false,
    assetType: true,
    showOwnerName: true,
    interestPaymentType: true,
    interestDuration: true,
    // 约等于显示控制：'hidden'=不显示, 'U'=显示U, 'CNY'=显示元
    approxHolding: 'U',
    approxInterest: 'U',
    approxPaid: 'U',
    approxCollateralItem: 'U',
    // 多笔担保物的合计价值独立控制；默认显示 USD，避免总值被误隐藏。
    approxCollateralTotal: 'U',
    // 担保缺口主值固定随资产类型显示：股票为人民币，数字币与期权为 U。
    // 本项只控制主值下方的“≈”折算行；默认不额外展示，避免重复数字。
    approxCollateralGap: 'hidden',
    // 股票订单的担保货币主显示单位；默认人民币。
    // 担保货币可显示逐笔数字币（CRYPTO）、折算U或折算人民币；
    externalCollateralValueDisplay: 'CNY',
    // 历史订单兼容字段：不再决定担保缺口的主值或约等于显示。
    externalCollateralGapDisplay: 'CNY',
    // 股票手工担保始终逐笔显示实际输入的担保物；本项只控制下方“担保价值”的合计单位。
    stockManualCollateralValueDisplay: 'CNY',
    // 担保缺口默认按真实买入价值计算；管理员可以逐单改为按计息基数。
    // 该值随 display_config 保存到主订单或拥有者个人订单快照。
    collateralGapBaseMode: 'buy_value',
    // 股票专属字段
    brokerName: true,
    brokerAccount: true,
    // 多空方向标签显示开关
    showTradeDirection: true,
    // 期权 Greeks 面板
    showGreeks: false,
    // 仅在管理员主动切换Greeks开关后置为true，用于保留明确关闭状态。
    showGreeksManualOverride: false,
    // 浮动盈亏（后续新建订单默认开启；已存在订单继续使用各自保存的设置）
    floatPnl: true,
    // 52号账本：交易手续费默认隐藏，由控制开关决定是否向前端展示
    tradingFee: false,
    // 仅控制普通用户前端的下载箭头；管理员订单列表始终可下载
    allowUserImageDownload: true,
    // 共同拥有者的个人订单视图固定显示本人姓名。
    ownerNameDisplay: 'self',
    // 52号账本资金属性：仅控制前端标签展示，不参与任何计算；空值表示未标记。
    assetFundingType: '',
    // 兼容已保存的早期“自有资金”展示标记。
    selfFundedAsset: false,
    // 左上角主展示由订单按需保存；不设默认值，以保持历史订单原有的展示口径。
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean | string>>(DEFAULT_DISPLAY_CONFIG);
  const amountDisplayLabel = formData.principalLentOut
    ? '借出本金'
    : displayConfig.assetFundingType === 'self' || displayConfig.selfFundedAsset === true || displayConfig.selfFundedAsset === 'true'
      ? '订单金额'
      : '融资金额';
  const [marginAlertThreshold, setMarginAlertThreshold] = useState<string>(''); // 保证金率预警阈值（%）
  const [showPreviewCollateralInfo, setShowPreviewCollateralInfo] = useState(false); // 预览卡片-担保缺口说明
  const [showPreviewMarginInfo, setShowPreviewMarginInfo] = useState(false); // 预览卡片-保证金率说明
  const [showPreviewInterestTip, setShowPreviewInterestTip] = useState(false); // 预览卡片-利息说明
  const [previewViewMode, setPreviewViewMode] = useState<'order' | 'card'>('order'); // 预览模式切换
  const COLLATERAL_COINS = ['BTC', 'ETH', 'SOL', 'USDT', 'CNY'];

  // ===== 订单参与者 =====
  type ParticipantForm = {
    userId: number;
    userName: string;
    avatar?: string;
    // owner 代表共同拥有者；其余值仅用于兼容既有参与者记录。
    role: 'owner' | 'funder' | 'borrower' | 'broker';
    // 完整参数（与主订单一一对应）
    coin: string;
    amount: string;
    amountCurrency: string;
    interestRateAnnual: string;
    interestBase: string;
    interestBaseCurrency: string;
    interestRateCurrency: string;
    interestPaymentType: string;
    interestStartDate: string;
    displayConfig: Record<string, boolean | string>;
    marginAlertThreshold: string;
    orderSnapshot: Record<string, any>;
    // 仅用于管理员在协作人列表中的准确预览；完整编辑仍通过个人订单视图完成。
    personalHeaderLabel: string;
    tags: string[];
    tradeDirection: null | 'long' | 'short';
    orderFillStatus: 'pending' | 'filled';
    orderPerspective: 'self' | 'other';
    buyDate: string;
    brokerName: string;
    brokerAccount: string;
    principalLentOut: boolean;
    collateralShareMode: 'none' | 'self' | 'cross';
    collateralSource: string | null;
    tradingFeeRate: string;
    tradingFeeStatus: 'unpaid' | 'half_paid' | 'paid';
    visibilityMode: 'self' | 'total' | 'breakdown' | 'partners';
    visibleOwnerIds: number[];
    expanded: boolean; // UI 折叠状态
  };
  const [participants, setParticipants] = useState<ParticipantForm[]>([]);
  const [participantUserSearch, setParticipantUserSearch] = useState('');
  const [selectedParticipantUserIds, setSelectedParticipantUserIds] = useState<number[]>([]);
  // 新增成员时先明确关系，避免所有人都被默认写成共同拥有者。
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<'owner' | 'funder'>('owner');
  const [participantsSectionExpanded, setParticipantsSectionExpanded] = useState(false);
  const [ownerAddPanelExpanded, setOwnerAddPanelExpanded] = useState(false);
  const [primaryOwnerEditorExpanded, setPrimaryOwnerEditorExpanded] = useState(true);
  const saveParticipantFormMutation = trpc.ledger.funderSaveParticipantFullConfig.useMutation({
    onSuccess: (_result, vars) => {
      trpcUtils.ledger.funderGetOrderParticipants.invalidate({ orderId: vars.orderId, ledgerId: vars.ledgerId });
      refetchOrders();
    },
    onError: (err) => toast.error(`参与者保存失败：${err.message}`),
  });
  // 共同拥有者和历史参与者共用独立快照保存通道；不会修改主订单本金、钱包或资金流水。
  const persistParticipantViews = async (orderId: number) => {
    if (participants.length === 0) return;
    await saveParticipantFormMutation.mutateAsync({
      orderId,
      ledgerId,
      participants: participants.map((p, i) => ({
        userId: p.userId,
        role: p.role,
        sortOrder: i,
        amount: p.amount || undefined,
        amountCurrency: p.amountCurrency || undefined,
        interestRate: normalizeFunderAnnualRate(p.interestRateAnnual) || undefined,
        interestBase: p.interestBase || undefined,
        interestBaseCurrency: p.interestBaseCurrency || undefined,
        interestPaymentType: p.interestPaymentType || undefined,
        interestStartDate: p.interestStartDate || undefined,
        interestRateCurrency: p.interestRateCurrency || undefined,
        visibilityMode: p.role === 'owner' ? p.visibilityMode : undefined,
        visibleOwnerIds: p.role === 'owner' ? p.visibleOwnerIds : undefined,
        displayConfig: JSON.stringify({
          ...p.displayConfig,
          ownerNameDisplay: 'self',
          allowUserImageDownload: Boolean(displayConfig.allowUserImageDownload),
          marginAlertThreshold: p.marginAlertThreshold || undefined,
          financingInputAmount: p.amount || '',
          financingInputCurrency: p.amountCurrency || formData.amountCurrency || 'USDT',
        }),
      })),
    });
  };
  // 编辑已有订单时加载现有参与者
  const editingOrderId = editingOrder?.id ?? null;
  const { data: existingParticipantsData, dataUpdatedAt: existingParticipantsUpdatedAt, isFetching: existingParticipantsLoading } = trpc.ledger.funderGetOrderParticipants.useQuery(
    { orderId: editingOrderId ?? 0, ledgerId },
    { enabled: !!editingOrderId && ledgerId > 0, staleTime: 0, refetchOnMount: 'always' }
  );
  // 加载已有参与者到 state；同时区分缓存数据与最新请求结果，确保同一订单重复打开也能稳定回显。
  const participantsLoadedRef = useRef<string | null>(null);
  React.useEffect(() => {
    const loadKey = editingOrderId ? `${editingOrderId}:${existingParticipantsUpdatedAt}` : null;
    if (existingParticipantsLoading || !existingParticipantsData || !loadKey || participantsLoadedRef.current === loadKey) return;
    participantsLoadedRef.current = loadKey;
    const loaded = (existingParticipantsData.participants as any[]).map((p: any) => ({
      userId: p.user_id,
      userName: getUserDisplayName(p, `成员 #${p.user_id}`),
      avatar: p.avatar,
      role: (['owner', 'funder', 'borrower', 'broker'].includes(p.role) ? p.role : 'funder') as ParticipantForm['role'],
      coin: p.coin || formData.coin,
      amount: p.amount || '',
      amountCurrency: p.amount_currency || formData.amountCurrency || 'USDT',
      interestRateAnnual: normalizeFunderAnnualRate(p.interest_rate || formData.interestRateAnnual || ''),
      interestBase: p.interest_base || formData.interestBase || '',
      interestBaseCurrency: p.interest_base_currency || formData.interestBaseCurrency || 'USDT',
      interestRateCurrency: p.interest_rate_currency || formData.interestRateCurrency || 'USDT',
      interestPaymentType: p.interest_payment_type || formData.interestPaymentType || '',
      interestStartDate: p.interest_start_date || formData.interestStartDate || '',
      displayConfig: (() => { try { return p.display_config ? (typeof p.display_config === 'string' ? JSON.parse(p.display_config) : p.display_config) : { ...DEFAULT_DISPLAY_CONFIG }; } catch { return { ...DEFAULT_DISPLAY_CONFIG }; } })(),
      marginAlertThreshold: '',
      orderSnapshot: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}; } catch { return {}; } })(),
      personalHeaderLabel: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return typeof snapshot?.personal_header_label === 'string' ? snapshot.personal_header_label : ''; } catch { return ''; } })(),
      tags: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; const raw = snapshot?.tags; const tags = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []); return Array.isArray(tags) ? tags.filter((tag: unknown) => typeof tag === 'string') : []; } catch { return []; } })(),
      tradeDirection: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.trade_direction === 'long' || snapshot?.trade_direction === 'short' ? snapshot.trade_direction : null; } catch { return null; } })(),
      orderFillStatus: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.order_fill_status === 'pending' ? 'pending' : 'filled'; } catch { return 'filled'; } })(),
      orderPerspective: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.order_perspective === 'other' ? 'other' : 'self'; } catch { return 'self'; } })(),
      buyDate: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.buy_date ? String(snapshot.buy_date).slice(0, 10) : (formData.buyDate || ''); } catch { return formData.buyDate || ''; } })(),
      brokerName: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.broker_name || ''; } catch { return ''; } })(),
      brokerAccount: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.broker_account || ''; } catch { return ''; } })(),
      principalLentOut: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.principal_lent_out === 1 || snapshot?.principal_lent_out === true; } catch { return false; } })(),
      collateralShareMode: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.collateral_share_mode === 'self' || snapshot?.collateral_share_mode === 'cross' ? snapshot.collateral_share_mode : 'none'; } catch { return 'none'; } })(),
      collateralSource: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.collateral_source || null; } catch { return null; } })(),
      tradingFeeRate: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return snapshot?.trading_fee_rate_per_mille != null ? String(snapshot.trading_fee_rate_per_mille) : '2'; } catch { return '2'; } })(),
      tradingFeeStatus: (() => { try { const snapshot = p.order_snapshot ? (typeof p.order_snapshot === 'string' ? JSON.parse(p.order_snapshot) : p.order_snapshot) : {}; return ['unpaid', 'half_paid', 'paid'].includes(snapshot?.trading_fee_status) ? snapshot.trading_fee_status : 'unpaid'; } catch { return 'unpaid'; } })(),
      visibilityMode: (['self', 'total', 'breakdown', 'partners'].includes(p.visibility_mode) ? p.visibility_mode : 'self') as ParticipantForm['visibilityMode'],
      visibleOwnerIds: (() => { try { const ids = p.visible_owner_ids ? (typeof p.visible_owner_ids === 'string' ? JSON.parse(p.visible_owner_ids) : p.visible_owner_ids) : []; return Array.isArray(ids) ? ids.map(Number).filter(Boolean) : []; } catch { return []; } })(),
      expanded: false,
    }));
    setParticipants(loaded as ParticipantForm[]);
  }, [existingParticipantsData, editingOrderId, existingParticipantsUpdatedAt, existingParticipantsLoading]);

  // 计息基数是否被用户手动改过：手动后不再自动带入融资金额
  const interestBaseTouchedRef = useRef(false);
  const [amountInputValue, setAmountInputValue] = useState('');
  type LinkedAmountField = 'amount' | 'price' | 'quantity';
  const manualLinkedFieldsRef = useRef<LinkedAmountField[]>([]);
  const [derivedLinkedField, setDerivedLinkedField] = useState<LinkedAmountField | null>(null);
  const resetLinkedAmountFields = () => {
    manualLinkedFieldsRef.current = [];
    setDerivedLinkedField(null);
  };
  // 三字段联动函数已下移到 formLivePrices/cnyRate/折算函数定义之后（避免 TDZ）。

  // 员工名字筛选
  const [employeeNameFilter, setEmployeeNameFilter] = useState('');
  // 类型筛选：资产类型或已结清状态；左侧用户筛选由订单查询接口先行处理。
  const [assetTypeFilter, setAssetTypeFilter] = useState<'' | 'stock' | 'crypto' | 'crypto_option' | 'settled'>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmSettleId, setConfirmSettleId] = useState<number | null>(null);
  // 仅在转结清时使用；清空后默认回到当前北京日期。
  const [settleInterestEndDate, setSettleInterestEndDate] = useState('');
  // 弹窗状态提升：存储当前打开弹窗的 orderId，null 表示关闭（防止子组件因数据刷新重渲染导致弹窗自动关闭）
  const [collateralInfoOrderId, setCollateralInfoOrderId] = useState<number | null>(null);
  const [interestTipOrderId, setInterestTipOrderId] = useState<number | null>(null);
  const [marginInfoOrderId, setMarginInfoOrderId] = useState<number | null>(null);

  // 担保价值（在 assetOrdersData 定义后使用）——放到这里是为了先定义类型，实际计算在下方的 derivedCollateral 中
  // 当前登录用户信息（用于备注权限控制）
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery({ id: ledgerId }, { enabled: ledgerId > 0 });
  const isAdminUser = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';
  // 共同拥有者也会携带 participantInfo，以便加载其独立订单视图；这不能把拥有者误判成受限参与者。
  // 仅历史参与者保留“只编辑自己的独立参数”的限制。管理员仍可从任一协作视图进入整组配置。
  const editingCollaboratorRole = String((editingOrder as any)?.participantInfo?.role || '');
  const editingCollaboratorUserId = Number((editingOrder as any)?.participantInfo?.userId || (editingOrder as any)?.participantInfo?.user_id || 0);
  const isPrimaryOwnerEdit = editingCollaboratorRole === 'owner'
    && editingCollaboratorUserId > 0
    && editingCollaboratorUserId === Number((editingOrder as any)?.user_id || 0)
    // 从拥有者组打开的“个人订单视图”即使恰好是最初存储锚点，也必须使用该拥有者自己的配置快照。
    && !(editingOrder as any)?.participantInfo?.isPersonalOwnerView;
  const isSnapshotScopedEdit = !!editingOrder?.participantInfo && !isPrimaryOwnerEdit;
  const isRestrictedParticipantEdit = !!editingOrder?.participantInfo && editingCollaboratorRole !== 'owner';
  const isOwnerPersonalView = isSnapshotScopedEdit && editingCollaboratorRole === 'owner';
  // 所有协作人界面共用中文显示名优先级，避免手机号式 username 被当作姓名展示。
  const getMemberDisplayName = (member: any, fallback = '当前成员') => getUserDisplayName(member, fallback);
  const personalViewName = String((editingOrder as any)?.participant_display_name
    || (editingOrder as any)?.participant_name
    || (editingOrder as any)?.owner_label
    || '当前成员');
  const primaryOwnerDisplayName = getMemberDisplayName(
    ((ledgerData as any)?.members || []).find((member: any) => Number(member.userId ?? member.id) === Number(formData.userId)),
    (editingOrder as any)?.owner_display_name || (editingOrder as any)?.nickname || (editingOrder as any)?.username || '当前拥有者',
  );
  const canManageCollaboratorsInEditor = !editingOrder || isAdminUser;

  // 拥有者在业务上是平级关系：主订单仅是数据存储锚点，不能作为界面上的主次排序依据。
  // 保留原数组索引给保存动作使用，展示层仅按角色和姓名做稳定排序。
  const displayParticipants = useMemo(() => participants
    .map((participant, index) => ({ participant, index }))
    .sort((a, b) => {
      const roleWeight = (value: ParticipantForm['role']) => value === 'owner' ? 0 : 1;
      const roleDiff = roleWeight(a.participant.role) - roleWeight(b.participant.role);
      if (roleDiff !== 0) return roleDiff;
      const nameDiff = a.participant.userName.localeCompare(b.participant.userName, 'zh-Hans-CN');
      return nameDiff !== 0 ? nameDiff : a.participant.userId - b.participant.userId;
    }), [participants]);
  const ownerGroupSize = participants.filter(participant => participant.role === 'owner').length;
  // 第一位拥有者继续使用主订单编辑内容；多人时把它收成独立抽屉，避免与下方成员编辑重复。
  const hasPrimaryOwnerDrawer = Boolean(editingOrder?.id) && !isSnapshotScopedEdit && ownerGroupSize > 1;
  const editableParticipants = useMemo(() => displayParticipants.filter(({ participant }) => !(
    participant.role === 'owner' && Number(participant.userId) === Number(formData.userId)
  )), [displayParticipants, formData.userId]);
  useEffect(() => {
    setPrimaryOwnerEditorExpanded(!hasPrimaryOwnerDrawer);
  }, [editingOrder?.id, hasPrimaryOwnerDrawer]);

  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0 && isAdminUser }
  );
  const walletCollateralUserId = Number(
    isSnapshotScopedEdit
      ? (editingOrder?.participantInfo?.userId ?? editingOrder?.participantInfo?.user_id ?? 0)
      : formData.userId,
  );
  const walletCollateralBalancesQuery = trpc.ledger.funderGetWalletCollateralBalances.useQuery(
    { ledgerId: 52, userId: walletCollateralUserId || 1 },
    {
      // 52号订单的手工担保和钱包担保可并行；只要打开订单编辑页就同时读取钱包余额。
      enabled: ledgerId === 52 && showForm && walletCollateralUserId > 0 && isAdminUser,
      staleTime: 5_000,
    },
  );

  const standardOrderQuery = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}), ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0 && !adminOnly, staleTime: 3000, refetchInterval: 3000, placeholderData: (prev: any) => prev }
  );
  const adminOrderQuery = trpc.ledger.funderAdminGetOrderViews.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 && !!adminOnly && isAdminUser, staleTime: 3000, refetchInterval: 3000, placeholderData: (prev: any) => prev }
  );
  const assetOrdersData = adminOnly ? adminOrderQuery.data : standardOrderQuery.data;
  const ordersLoading = adminOnly ? adminOrderQuery.isLoading : standardOrderQuery.isLoading;
  const refetchOrders = adminOnly ? adminOrderQuery.refetch : standardOrderQuery.refetch;
  // 两个接口均返回 { orders, livePrices }，取 orders 数组。
  const assetOrders = (assetOrdersData as any)?.orders ?? assetOrdersData ?? [];
  const getParticipantUserIdForOrder = (order: any): number | undefined => {
    const collaboratorUserId = Number(order?.participantInfo?.userId ?? order?.participantInfo?.user_id ?? 0);
    const parentOwnerUserId = Number(order?.user_id ?? 0);
    const collaboratorRole = String(order?.participantInfo?.role ?? '');
    const hasCollaboratorView = !!order?.participantInfo || !!order?._isParticipant || !!order?._fromFunder;
    // 主拥有者即使被自动加入 owner 协作组，仍读取主订单（NULL）结息流水；
    // 其他共同拥有者与历史参与者则读取自己独立的结息流水。
    return hasCollaboratorView
      && collaboratorUserId > 0
      && (collaboratorUserId !== parentOwnerUserId || collaboratorRole !== 'owner')
      ? collaboratorUserId
      : undefined;
  };
  const formLivePrices: Record<string, number> = (assetOrdersData as any)?.livePrices ?? {};
  // 共享担保池数据按当前编辑视角隔离：参与者子订单使用参与者自己的池。
  const sharedCollateralUserId = getParticipantUserIdForOrder(editingOrder) ?? editingOrder?.user_id ?? (formData as any)?.userId;
  const { data: sharedPoolData } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId, userId: Number(sharedCollateralUserId) },
    { enabled: ledgerId > 0 && !!sharedCollateralUserId && collateralShareMode === 'self', staleTime: 5000 }
  );
  const { data: cnyRateData } = trpc.exchange.getRate.useQuery({ fromcoin: "USD", tocoin: "CNY", money: 1 }, { staleTime: 3000, refetchInterval: 3000 });
  // 获取37号账本可引用标签。利息暂停与保证金查询暂停是独立状态，均保留历史引用能力。
  const { data: activeMarginTags } = trpc.ledger.getActiveMarginTags.useQuery(
    { ledgerId: 37 },
    { enabled: collateralSourceMode === 'external', staleTime: 30000 }
  );
  const get37ReferenceTagLabel = (tag: any) => {
    const statuses: string[] = [];
    if (tag?.interestPaused) statuses.push('利息已暂停');
    if (tag?.marginPaused ?? tag?.paused) statuses.push('保证金查询已暂停');
    return statuses.length > 0
      ? `${tag?.tagName || ''}（${statuses.join('；')}，可引用历史数据）`
      : String(tag?.tagName || '');
  };
  const cnyRate = parseFloat((cnyRateData as any)?.money ?? "6.8") || 6.8;
  // 通用折算：任一币种数额 -> USDT 基准（CNY 用 cnyRate，USDT=1，其余按实时价 USDT/枚）
  const toUsdtBase = (val: number, cur: string): number | null => {
    if (isNaN(val)) return null;
    if (cur === 'USDT') return val;
    if (cur === 'CNY') return val / cnyRate;
    const p = formLivePrices[cur];
    if (!p || p <= 0) return null;
    return val * p;
  };
  // 通用折算：USDT 基准数额 -> 任一币种数额
  const fromUsdtBase = (usdtVal: number, cur: string): number | null => {
    if (isNaN(usdtVal)) return null;
    if (cur === 'USDT') return usdtVal;
    if (cur === 'CNY') return usdtVal * cnyRate;
    const p = formLivePrices[cur];
    if (!p || p <= 0) return null;
    return usdtVal / p;
  };

  // 期权订单只以专属参数为准：单张权利金 × 合约数量，统一折算为 U 供订单金额、担保与预览使用。
  const getOptionPremiumSummary = () => {
    const premium = Number(optionFormData.premium || 0);
    const quantity = Number(optionFormData.buyQty || 0);
    const totalInDenomination = Number.isFinite(premium) && premium > 0 && Number.isFinite(quantity) && quantity > 0
      ? premium * quantity
      : 0;
    const totalUsdt = totalInDenomination > 0
      ? toUsdtBase(totalInDenomination, optionFormData.premiumDenomination)
      : null;
    return {
      premium,
      quantity,
      totalInDenomination,
      totalUsdt,
      totalInput: totalInDenomination > 0 ? String(Number(totalInDenomination.toFixed(8))) : '',
      denomination: optionFormData.premiumDenomination,
    };
  };

  const formatLinkedAmountValue = (value: number, field: LinkedAmountField): string => {
    if (!isFinite(value)) return '';
    if (field === 'quantity' && INTEGER_COINS_FUNDER.has(formData.coin)) return String(Math.round(value));
    const digits = field === 'amount' ? 2 : 6;
    return parseFloat(value.toFixed(digits)).toString();
  };

  const clearLinkedFieldValue = (field: LinkedAmountField) => {
    if (field === 'amount') setAmountInputValue('');
    if (field === 'price') setFormData(current => ({ ...current, buyPrice: '' }));
    if (field === 'quantity') setFormData(current => ({ ...current, buyQuantity: '' }));
  };

  const handleLinkedAmountInput = (field: LinkedAmountField, rawValue: string) => {
    if (rawValue.trim() === '') {
      manualLinkedFieldsRef.current = manualLinkedFieldsRef.current.filter(item => item !== field);
      if (derivedLinkedField && derivedLinkedField !== field) clearLinkedFieldValue(derivedLinkedField);
      setDerivedLinkedField(null);
      return;
    }

    const nextManualFields = [...manualLinkedFieldsRef.current.filter(item => item !== field), field].slice(-2) as LinkedAmountField[];
    manualLinkedFieldsRef.current = nextManualFields;

    if (nextManualFields.length < 2) {
      setDerivedLinkedField(null);
      return;
    }

    const nextDerivedField = (['amount', 'price', 'quantity'] as LinkedAmountField[]).find(item => !nextManualFields.includes(item)) || null;
    const amount = parseFloat(field === 'amount' ? rawValue : amountInputValue);
    const price = parseFloat(field === 'price' ? rawValue : formData.buyPrice);
    const quantity = parseFloat(field === 'quantity' ? rawValue : formData.buyQuantity);

    if (!nextDerivedField) return;
    if (nextDerivedField === 'amount' && price > 0 && quantity > 0) {
      setAmountInputValue(formatLinkedAmountValue(price * quantity, 'amount'));
      setDerivedLinkedField('amount');
      return;
    }
    if (nextDerivedField === 'price' && amount > 0 && quantity > 0) {
      setFormData(current => ({ ...current, buyPrice: formatLinkedAmountValue(amount / quantity, 'price') }));
      setDerivedLinkedField('price');
      return;
    }
    if (nextDerivedField === 'quantity' && amount > 0 && price > 0) {
      setFormData(current => ({ ...current, buyQuantity: formatLinkedAmountValue(amount / price, 'quantity') }));
      setDerivedLinkedField('quantity');
      return;
    }
    if (derivedLinkedField && derivedLinkedField !== field) clearLinkedFieldValue(derivedLinkedField);
    setDerivedLinkedField(null);
  };

  const handleAmountCurrencyChange = (nextCurrency: CoinType) => {
    const previousCurrency = formData.amountCurrency;
    if (previousCurrency === nextCurrency) return;

    const convertQuoteValue = (rawValue: string, field: 'amount' | 'price') => {
      const value = parseFloat(rawValue);
      if (!isFinite(value) || value <= 0) return rawValue;
      const usdtValue = toUsdtBase(value, previousCurrency);
      if (usdtValue === null) return rawValue;
      const converted = fromUsdtBase(usdtValue, nextCurrency);
      return converted === null ? rawValue : formatLinkedAmountValue(converted, field);
    };

    const nextAmount = convertQuoteValue(amountInputValue, 'amount');
    setAmountInputValue(nextAmount);
    setFormData(current => ({
      ...current,
      amountCurrency: nextCurrency,
      buyPrice: convertQuoteValue(current.buyPrice, 'price'),
    }));
  };

  // 编辑订单时也允许更正购买币种。买入价和币数属于旧币种的单位，不能在切币后继续沿用，
  // 因此保留融资金额、清空这两项，并要求按新币种重新输入任意两项以恢复三字段联动。
  // 期权订单的标的币种必须与主订单币种一致，切换时一并清空旧标的参数。
  const handlePurchaseCoinChange = (nextCoin: CoinType) => {
    if (nextCoin === formData.coin) return;
    resetLinkedAmountFields();
    setFormData(current => ({
      ...current,
      coin: nextCoin,
      buyPrice: '',
      buyQuantity: '',
    }));
    if (formData.assetType === 'crypto_option') {
      setOptionFormData(current => ({
        ...current,
        optionCurrency: nextCoin,
        deribitLabel: '',
        exerciseDate: '',
        strikePrice: '',
        premium: '',
        buyQty: '',
      }));
    }
  };

  // 融资金额始终以输入框当前值为准；若它是第三个字段，则该值已由联动函数推算。
  // 底层统一保存为USDT基准，融资币种仅控制输入和展示口径。
  const financingAmountUsdt = useMemo(() => {
    const amount = parseFloat(amountInputValue);
    if (!isFinite(amount) || amount <= 0) return '';
    const usdtBase = toUsdtBase(amount, formData.amountCurrency);
    return usdtBase !== null && isFinite(usdtBase) ? usdtBase.toFixed(2) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountInputValue, formData.amountCurrency, cnyRate, JSON.stringify(formLivePrices)]);

  // 便捷操作：融资币种为 CNY 时计息基数默认按人民币带入；其余数字币融资仍按 USDT 基准带入。
  // 仅在用户未手动改过计息基数时生效；用户手动修改后不再覆盖。
  useEffect(() => {
    if (interestBaseTouchedRef.current) return;
    const usdtVal = parseFloat(financingAmountUsdt || '0');
    if (!usdtVal || usdtVal <= 0) return;
    const nextCurrency: 'USDT' | 'CNY' = formData.amountCurrency === 'CNY' ? 'CNY' : 'USDT';
    const nextValue = nextCurrency === 'CNY' ? fromUsdtBase(usdtVal, 'CNY') : usdtVal;
    if (nextValue === null || !isFinite(nextValue)) return;
    const next = parseFloat(nextValue.toFixed(2)).toString();
    setFormData(d => (d.interestBase === next && d.interestBaseCurrency === nextCurrency && d.interestRateCurrency === nextCurrency)
      ? d
      : { ...d, interestBase: next, interestBaseCurrency: nextCurrency, interestRateCurrency: nextCurrency });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financingAmountUsdt, formData.amountCurrency, cnyRate]);

  // 涨跌方向计算：用 localStorage 存储上一次价格（与 LedgerDetail 一致）
  const PREV_PRICE_CACHE_KEY = `funder_prev_prices_p095_${ledgerId}`;
  const [priceDirection, setPriceDirection] = useState<Record<string, 'up' | 'down' | 'same'>>({});
  useEffect(() => {
    if (Object.keys(formLivePrices).length === 0) return;
    let prevPrices: Record<string, number> = {};
    try { prevPrices = JSON.parse(localStorage.getItem(PREV_PRICE_CACHE_KEY) || '{}'); } catch {}
    const newDir: Record<string, 'up' | 'down' | 'same'> = {};
    for (const coin of Object.keys(formLivePrices)) {
      const prev = prevPrices[coin];
      const curr = formLivePrices[coin];
      if (!prev || prev === 0) { newDir[coin] = 'same'; }
      else if (curr > prev) { newDir[coin] = 'up'; }
      else if (curr < prev) { newDir[coin] = 'down'; }
      else { newDir[coin] = 'same'; }
    }
    setPriceDirection(newDir);
    try { localStorage.setItem(PREV_PRICE_CACHE_KEY, JSON.stringify(formLivePrices)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formLivePrices)]);
  // 全量订单（不带 userId 过滤），专用于下拉框统计每个用户的订单数量
  const standardAllOrdersQuery = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0 && !adminOnly, staleTime: 30000 }
  );
  const allOrdersData = adminOnly ? adminOrderQuery.data : standardAllOrdersQuery.data;
  const allOrders: any[] = (allOrdersData as any)?.orders ?? allOrdersData ?? [];
  // 右侧借方列表会先于全量统计请求拿到卡片数据；在此期间以已显示订单兜底，避免下拉框只剩“全部成员”。
  const memberSelectorOrders: any[] = allOrders.length > 0 ? allOrders : assetOrders;
  const getMemberSelectorId = (member: any): number => Number(member?.userId ?? member?.user_id ?? member?.id ?? 0);
  const isOrderRelatedToMember = (order: any, memberId: number): boolean => {
    if (!memberId) return false;
    const ownerId = Number(order?.userId ?? order?.user_id ?? 0);
    const participantId = Number(order?.participantInfo?.userId ?? order?.participantInfo?.user_id ?? order?._participantUserId ?? 0);
    const participantIds = Array.isArray(order?._participantUserIds) ? order._participantUserIds : [];
    return ownerId === memberId
      || participantId === memberId
      || participantIds.some((id: unknown) => Number(id) === memberId);
  };
  // 成员目录同时使用账本成员和融资专用列表：前者避免专用请求短暂空载时丢失搜索入口，后者提供完整用户名资料。
  const memberSelectorUsers = Array.from(new Map(
    [
      ...((((ledgerData as any)?.members || []) as any[])),
      ...(((funderUsers as any[]) || [])),
    ].map((member: any) => [getMemberSelectorId(member), member] as const).filter(([userId]) => userId > 0)
  ).values());
  const normalizeOrderSearchText = (value: unknown) => String(value ?? '')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim();
  const smartMatchedOrders = useMemo(() => {
    const allViews = assetOrders as any[];
    if (!adminOnly) return allViews;
    const selectedMemberViews = selectedUserId === null
      ? allViews
      : allViews.filter((order: any) => {
        const selectedId = Number(selectedUserId);
        const participantId = Number(order?.participantInfo?.userId ?? order?.participantInfo?.user_id ?? 0);
        const relatedIds = Array.isArray(order?._participantUserIds) ? order._participantUserIds : [];
        return Number(order?.user_id) === selectedId
          || participantId === selectedId
          || relatedIds.some((id: unknown) => Number(id) === selectedId);
      });
    const queryTerms = normalizeOrderSearchText(orderSearchText).split(' ').filter(Boolean);
    if (queryTerms.length === 0) return selectedMemberViews;
    const hasTermMatch = (order: any) => {
      const searchable = [
        order?.id, order?.order_no, order?._parentOrderNo, order?.order_role, order?._orderViewKind,
        order?.owner_display_name, order?.owner_user_name, order?.username, order?.order_owner_name,
        order?.participant_name, order?.participant_display_name, order?.owner_label,
        order?.coin, order?.amount_currency, order?.asset_type, order?.finance_type,
        order?.broker_name, order?.broker_account, order?.storage_account,
        order?.admin_note, order?.public_note, order?._participantSearchNote,
        order?.tags, order?.collateral_assets, order?.option_info, order?.display_config,
      ].map(normalizeOrderSearchText).join(' ');
      return queryTerms.every(term => searchable.includes(term));
    };
    const matchedGroups = new Set(
      selectedMemberViews
        .filter(hasTermMatch)
        .map((order: any) => String(order?._linkGroupKey || `order:${order?.id}`)),
    );
    // 命中任一视图后，显示同一关联组中的主订单、共同拥有者和参与者视图，彼此保持独立卡片。
    return selectedMemberViews.filter((order: any) => matchedGroups.has(String(order?._linkGroupKey || `order:${order?.id}`)));
  }, [adminOnly, assetOrders, orderSearchText, selectedUserId]);
  const managementCardLookupOrders = useMemo(() => {
    if (!adminOnly) return assetOrders as any[];
    const uniqueParents = new Map<number, any>();
    for (const order of assetOrders as any[]) {
      const parentId = Number(order?._parentOrderId ?? order?.id);
      if (parentId > 0 && !uniqueParents.has(parentId)) uniqueParents.set(parentId, order);
    }
    return Array.from(uniqueParents.values());
  }, [adminOnly, assetOrders]);
  const managementSideCounts = useMemo(() => {
    const counts = { 左侧: 0, 中侧: 0, 右侧: 0 } as Record<'左侧' | '中侧' | '右侧', number>;
    if (!adminOnly) return counts;
    for (const order of assetOrders as any[]) {
      // 每个物理订单仅计一次，个人视图只在检索结果中展开，不重复膨胀三侧统计。
      if (String(order?._viewKey || '').includes(':collaborator:')) continue;
      const side = order?._managementSide as keyof typeof counts;
      if (side in counts) counts[side] += 1;
    }
    return counts;
  }, [adminOnly, assetOrders]);

  // 强制转成数字，避免 MySQL 返回字符串导致 tRPC z.number() 校验失败
  // 编辑面板专用：查询当前编辑订单的结息记录列表
  // enabled 只依赖 editingOrderId，不加 participantInfo 限制，确保管理员编辑任何订单都能查到
  const editingParticipantUserId = getParticipantUserIdForOrder(editingOrder);
  const { data: editingOrderPayments, refetch: refetchEditingPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: editingOrderId!, participantUserId: editingParticipantUserId },
    { enabled: !!editingOrderId && ledgerId > 0, staleTime: 0 }
  );
  // 钱包担保首版曾覆盖手工担保字段。管理员打开钱包担保时，读取审计记录中的最近一份非钱包担保，供一键恢复。
  const { data: collateralAuditData } = trpc.ledger.financeGetOrderLogs.useQuery(
    { orderId: editingOrderId ?? 0, ledgerId, actionTypes: ['collateral_update', 'wallet_collateral_sync'] },
    { enabled: ledgerId === 52 && !!editingOrderId && collateralSourceMode === 'wallet' && isAdminUser, staleTime: 0 }
  );
  const recoverableManualCollateral = useMemo(() => {
    const logs = (collateralAuditData as any)?.logs;
    if (!Array.isArray(logs)) return [] as { coin: string; qty: string; note?: string }[];
    for (const log of logs) {
      for (const payload of [log?.beforeData, log?.afterData]) {
        try {
          const assets = typeof payload === 'string' ? JSON.parse(payload) : payload;
          if (!Array.isArray(assets)) continue;
          const manualAssets = assets.filter((asset: any) => asset?.coin && asset?.qty !== '' && !isWalletCollateralAsset(asset));
          if (manualAssets.length > 0) return manualAssets.map((asset: any) => ({ coin: String(asset.coin), qty: String(asset.qty), ...(asset.note ? { note: String(asset.note) } : {}) }));
        } catch {}
      }
    }
    return [] as { coin: string; qty: string; note?: string }[];
  }, [collateralAuditData]);
  // 直接从当前视角的独立结息流水计算已结利息总额和最新币种。
  const previewPaidInterest: number = Array.isArray(editingOrderPayments) && (editingOrderPayments as any[]).length > 0
    ? (editingOrderPayments as any[]).reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0)
    : 0;
  const previewPaidInterestCurrency: string = Array.isArray(editingOrderPayments) && (editingOrderPayments as any[]).length > 0
    ? ((editingOrderPayments as any[])[0]?.currency || 'U')
    : 'U';
  // refetchAllPaidSummary 兼容旧引用（mutation onSuccess 中调用）
  const refetchAllPaidSummary = refetchEditingPayments;

  // 担保价值（所有担保货币折算为 USDT 的总值）
  // 担保物为空时返回 0（而非 null），预览显示完全依据开关控制，不依赖是否有输入
  const computedCollateralValue = useMemo(() => {
    let total = 0;
    for (const item of collateralAssets) {
      if (!item.coin) continue;
      const qty = parseFloat(item.qty);
      // qty 为空字符串时跳过，其他情况（包括 0）都算有效
      if (item.qty === '' || isNaN(qty)) continue;
      if (item.coin === 'USDT') {
        total += qty;
      } else if (item.coin === 'CNY') {
        total += qty / cnyRate;
      } else {
        const price = formLivePrices[item.coin];
        if (price) total += qty * price;
      }
    }
    return total; // 无担保物时返回 0，不返回 null
  }, [collateralAssets, formLivePrices, cnyRate]);

  // 担保缺口基准默认使用买入价值；管理员可逐单改为计息基数。
  // 所有数值先统一折成 U，与担保物实时估值保持同一口径。
  const collateralGapBaseMode = displayConfig.collateralGapBaseMode === 'interest_base'
    ? 'interest_base'
    : 'buy_value';
  const collateralGapBaseValue = useMemo(() => {
    if (collateralGapBaseMode === 'buy_value') {
      return parseFloat(financingAmountUsdt || '0');
    }
    const base = parseFloat(formData.interestBase || '0');
    if (!Number.isFinite(base) || base <= 0) return 0;
    const currency = String(formData.interestBaseCurrency || 'USDT').trim().toUpperCase();
    return ['CNY', 'RMB', '人民币'].includes(currency) ? base / cnyRate : base;
  }, [collateralGapBaseMode, financingAmountUsdt, formData.interestBase, formData.interestBaseCurrency, cnyRate]);

  // 资金属性“融”只用于订单展示；只有明确开启“借出本金”才把本金视为待覆盖负债。
  // 未开启时，37号引用按净值盈亏、担保物和利息计算，不扣原始融资本金。
  const previewIsPrincipalLoan = useMemo(() => Boolean(formData.principalLentOut), [formData.principalLentOut]);
  const previewBorrowedPrincipalU = useMemo(() => {
    const principal = parseFloat(formData.interestBase || '0');
    if (Number.isFinite(principal) && principal > 0) {
      const currency = String(formData.interestBaseCurrency || 'USDT').trim().toUpperCase();
      return ['CNY', 'RMB', '人民币'].includes(currency) ? principal / cnyRate : principal;
    }
    return collateralGapBaseValue;
  }, [collateralGapBaseValue, cnyRate, formData.interestBase, formData.interestBaseCurrency]);

  const previewCurrentHoldingValue = useMemo(() => {
    const quantity = parseFloat(formData.buyQuantity || '0');
    const coin = String(formData.coin || '').trim().toUpperCase();
    const price = formLivePrices[coin];
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
    return quantity * price;
  }, [formData.buyQuantity, formData.coin, formLivePrices]);

  // 预览卡片实时待结利息（每秒更新）
  const [previewAccrued, setPreviewAccrued] = useState<number>(0);
  useEffect(() => {
    const compute = () => {
      const base = parseFloat(formData.interestBase || '0');
      const rate = parseFloat(formData.interestRateAnnual || '0');
      if (!base || !rate || !formData.interestStartDate) { setPreviewAccrued(0); return; }
      const startTs = new Date(formData.interestStartDate + 'T00:00:00').getTime();
      if (isNaN(startTs)) { setPreviewAccrued(0); return; }
      const elapsedSeconds = Math.max(0, (Date.now() - startTs) / 1000);
      const perSecond = (base * rate / 100) / (365 * 24 * 3600);
      setPreviewAccrued(perSecond * elapsedSeconds);
    };
    compute();
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [formData.interestBase, formData.interestRateAnnual, formData.interestStartDate]);

  // 普通订单：当前持有资产 − 基准 − 待结 + 已结 + 担保物。
  // 明确借出本金：担保物 − 固定融资本金 − 待结 + 已结；借出的币不可再当成持有资产。
  const previewPendingInterestU = useMemo(() => {
    const currency = String(formData.interestBaseCurrency || 'USDT').trim().toUpperCase();
    return ['CNY', 'RMB', '人民币'].includes(currency) ? previewAccrued / cnyRate : previewAccrued;
  }, [previewAccrued, formData.interestBaseCurrency, cnyRate]);
  const previewPaidInterestU = useMemo(() => {
    const currency = String(previewPaidInterestCurrency || 'USDT').trim().toUpperCase();
    return ['CNY', 'RMB', '人民币'].includes(currency) ? previewPaidInterest / cnyRate : previewPaidInterest;
  }, [previewPaidInterest, previewPaidInterestCurrency, cnyRate]);
  const computedCollateralGap = useMemo(() => {
    if (collateralGapBaseValue <= 0) return null;
    if (previewIsPrincipalLoan) {
      return computedCollateralValue - previewBorrowedPrincipalU - previewPendingInterestU + previewPaidInterestU;
    }
    return (previewCurrentHoldingValue ?? 0)
      - collateralGapBaseValue
      - previewPendingInterestU
      + previewPaidInterestU
      + computedCollateralValue;
  }, [computedCollateralValue, collateralGapBaseValue, previewIsPrincipalLoan, previewBorrowedPrincipalU, previewCurrentHoldingValue, previewPendingInterestU, previewPaidInterestU]);

  // 预览卡片实时待结佣金（受邀订单专用，每秒更新）
  const [previewCommission, setPreviewCommission] = useState<number>(0);
  useEffect(() => {
    const compute = () => {
      const base = parseFloat(formData.commissionBase || '0');
      const rate = parseFloat(formData.commissionRate || '0');
      if (!base || !rate || !formData.commissionStartDate) { setPreviewCommission(0); return; }
      const startTs = new Date(formData.commissionStartDate + 'T00:00:00').getTime();
      if (isNaN(startTs)) { setPreviewCommission(0); return; }
      const elapsedSeconds = Math.max(0, (Date.now() - startTs) / 1000);
      const perSecond = (base * rate / 100) / (365 * 24 * 3600);
      setPreviewCommission(perSecond * elapsedSeconds);
    };
    compute();
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [formData.commissionBase, formData.commissionRate, formData.commissionStartDate]);

  // 预览卡片实时风险敎口
  const previewExposure = useMemo(() => {
    const liveP = formLivePrices[formData.coin];
    const buyQty = parseFloat(formData.buyQuantity || '0');
    const buyPriceNum = parseFloat(formData.buyPrice || '0');
    const buyValue = buyPriceNum * buyQty;
    const currentValue = liveP ? liveP * buyQty : null;
    if (previewIsPrincipalLoan) {
      return computedCollateralValue - previewBorrowedPrincipalU - previewPendingInterestU + previewPaidInterestU;
    }
    const floatPnl = currentValue !== null ? currentValue - buyValue : null;
    return floatPnl !== null
      ? computedCollateralValue + floatPnl - previewAccrued
      : computedCollateralValue - previewAccrued;
  }, [computedCollateralValue, formLivePrices, formData.coin, formData.buyQuantity, formData.buyPrice, previewAccrued, previewBorrowedPrincipalU, previewIsPrincipalLoan, previewPaidInterestU, previewPendingInterestU]);

  const createMutation = trpc.ledger.funderCreateAssetOrder.useMutation({
    onSuccess: async (result) => {
      try {
        const orderId = Number((result as any)?.orderId || 0);
        if (orderId > 0 && collateralAssets.some(isWalletCollateralAsset)) {
          await persistWalletCollateral(orderId, Number(formData.userId), collateralAssets);
        }
        if (orderId > 0 && participants.length > 0) await persistParticipantViews(orderId);
      } catch {
        // 冻结或子视图保存失败时保持表单，避免管理员误以为担保已受控。
        return;
      }
      toast.success('创建成功');
      setShowForm(false);
      refetchOrders();
      // 使 LedgerDetail 中的担保缺口数据同步更新
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  // 借方创建：当所选用户是账本普通成员时，订单归属右侧（借方）
  const financeCreateMutation = trpc.ledger.financeCreateOrder.useMutation({
    onSuccess: async (result) => {
      try {
        const orderId = Number((result as any)?.orderId || 0);
        if (orderId > 0 && collateralAssets.some(isWalletCollateralAsset)) {
          await persistWalletCollateral(orderId, Number(formData.userId), collateralAssets);
        }
        if (orderId > 0 && participants.length > 0) await persistParticipantViews(orderId);
      } catch {
        return;
      }
      toast.success('创建成功');
      setShowForm(false);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: async (result, vars) => {
      const isLinkedStatusUpdate = vars.status === 'settled' || vars.status === 'active';
      // 普通编辑必须等待参与者独立配置全部写入后再关闭表单；结清/恢复由后端原子级联。
      const orderId = (vars as any).id;
      try {
        if (!isLinkedStatusUpdate && orderId && participants.length > 0) {
          await persistParticipantViews(Number(orderId));
        } else if (!isLinkedStatusUpdate && orderId && participants.length === 0 && existingParticipantsData?.participants?.length) {
          // 删除所有参与者
          await saveParticipantFormMutation.mutateAsync({ orderId: Number(orderId), ledgerId, participants: [] });
        }
      } catch {
        // 参与者保存失败时保留表单，管理员可直接修正并重试。
        return;
      }
      const syncedCount = Number((result as any)?.participantCount || 0);
      if (vars.status === 'settled') {
        toast.success(syncedCount > 0 ? `主订单及 ${syncedCount} 位参与者已同步结清` : '订单已结清');
      } else if (vars.status === 'active') {
        toast.success(syncedCount > 0 ? `主订单及 ${syncedCount} 位参与者已同步恢复` : '订单已恢复为持有中');
      } else {
        toast.success('更新成功');
      }
      // 多拥有者订单中，顶部只代表第一位拥有者的主订单内容。
      // 保存后留在同一编辑页并收起该抽屉，方便继续管理其余成员。
      if (hasPrimaryOwnerDrawer && !isLinkedStatusUpdate) {
        setPrimaryOwnerEditorExpanded(false);
        setParticipantsSectionExpanded(false);
        setOwnerAddPanelExpanded(false);
        refetchOrders();
        trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
        return;
      }
      setShowForm(false);
      setEditingOrder(null);
      setParticipants([]);
      participantsLoadedRef.current = null;
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  // 37号标签属于订单级只读引用配置，允许在编辑区直接保存，避免必须滚到页尾。
  // 该动作只写 collateral_source，不改本金、担保物、利率或结息记录。
  const saveLinkedInterestSourceMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => {
      toast.success('订单外部数据来源已保存');
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(`37号利息引用保存失败：${err.message}`),
  });
  const saveParticipantLinkedInterestSourceMutation = trpc.ledger.funderUpdateParticipantOrder.useMutation({
    onSuccess: () => {
      toast.success('成员视图的外部数据来源已保存');
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.financeGetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(`成员视图的37号利息引用保存失败：${err.message}`),
  });
  const saveLinkedInterestSource = () => {
    if (!editingOrder?.id) {
      toast.error('请先创建订单，再单独保存37号利息引用');
      return;
    }
    if (!orderCollateralSourceDraft) {
      toast.error('请至少选择一个37号引用标签');
      return;
    }
    if (isSnapshotScopedEdit) {
      const participantUserId = editingOrder.participantInfo?.userId ?? editingOrder.participantInfo?.user_id;
      if (!participantUserId) {
        toast.error('无法确定成员视图对应的用户');
        return;
      }
      saveParticipantLinkedInterestSourceMutation.mutate({
        orderId: Number(editingOrder.id),
        ledgerId,
        userId: Number(participantUserId),
        snapshot: { collateral_source: JSON.stringify(orderCollateralSourceDraft) },
      });
      return;
    }
    saveLinkedInterestSourceMutation.mutate({
      id: Number(editingOrder.id),
      ledgerId,
      collateralSource: orderCollateralSourceDraft,
    });
  };
  const saveManualStockPnlSource = () => {
    if (!editingOrder?.id) {
      toast.error('请先创建订单，再单独保存股票组合');
      return;
    }
    if (!orderCollateralSourceDraft || validManualStockPositions.length === 0) {
      toast.error(manualStockPnlCalculationMode === 'total_capital'
        ? '请至少完整填写一只股票的代码和当前持股数量'
        : '请至少完整填写一只股票的代码、买入价和股数');
      return;
    }
    if (manualStockPnlCalculationMode === 'total_capital' && !isManualStockTotalCapitalValid) {
      toast.error('请输入大于 0 的股票账户初始总额度');
      return;
    }
    if (!isManualStockPnlCoefficientValid) {
      toast.error('股票计算系数须大于 0，且不超过 100000');
      return;
    }
    if (isSnapshotScopedEdit) {
      const participantUserId = editingOrder.participantInfo?.userId ?? editingOrder.participantInfo?.user_id;
      if (!participantUserId) {
        toast.error('无法确定成员视图对应的用户');
        return;
      }
      saveParticipantLinkedInterestSourceMutation.mutate({
        orderId: Number(editingOrder.id),
        ledgerId,
        userId: Number(participantUserId),
        snapshot: { collateral_source: JSON.stringify(orderCollateralSourceDraft) },
      });
      return;
    }
    saveLinkedInterestSourceMutation.mutate({
      id: Number(editingOrder.id),
      ledgerId,
      collateralSource: orderCollateralSourceDraft,
    });
  };
  // 担保货币独立保存（编辑已有订单时，仅写回 collateral_assets，不动其他字段，不关闭表单）
  const saveCollateralMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => {
      toast.success('担保货币已保存');
      setCollateralEditMode(false); // 保存成功后切回只读态
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.funderGetSharedCollateralPool.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const saveWalletCollateralMutation = trpc.ledger.funderSaveWalletCollateral.useMutation({
    onSuccess: () => {
      toast.success('钱包担保已冻结并保存');
      setWalletCollateralEditMode(false);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.funderGetSharedCollateralPool.invalidate();
      void walletCollateralBalancesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  // 参与者担保物独立保存：只写入该参与者的子订单快照，不修改主订单拥有者的担保物。
  const saveParticipantCollateralMutation = trpc.ledger.funderUpdateParticipantOrder.useMutation({
    onSuccess: () => {
      toast.success('参与者担保货币已保存');
      setCollateralEditMode(false);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.financeGetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.funderGetSharedCollateralPool.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  // 把当前整组担保货币写回正在编辑的视角：参与者写子订单快照，拥有者写主订单。
  const persistCollateral = (assets: { coin: string; qty: string; note?: string; source?: 'wallet' }[]) => {
    const oid = editingOrder?.id ? Number(editingOrder.id) : null;
    if (!oid) return; // 新建态无订单 ID，跳过（随订单一起保存）
    const cleanAssets = assets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)));
    const participantUserId = editingOrder?.participantInfo?.userId ?? editingOrder?.participantInfo?.user_id;
    if (isSnapshotScopedEdit && participantUserId) {
      saveParticipantCollateralMutation.mutate({
        orderId: oid,
        ledgerId,
        userId: Number(participantUserId),
        snapshot: { collateral_assets: JSON.stringify(cleanAssets) },
      });
      return;
    }
    saveCollateralMutation.mutate({
      id: oid,
      ledgerId,
      collateralAssets: cleanAssets,
    });
  };
  const persistWalletCollateral = async (orderId: number, holderUserId: number, assets: { coin: string; qty: string; source?: 'wallet' }[]) => {
    const walletAssets = assets
      .filter((asset) => isWalletCollateralAsset(asset) && asset.coin && asset.qty !== '' && Number(asset.qty) > 0)
      .map((asset) => ({ coin: asset.coin as any, qty: asset.qty }));
    if (ledgerId !== 52 || orderId <= 0 || holderUserId <= 0) return;
    await saveWalletCollateralMutation.mutateAsync({ ledgerId: 52, orderId, userId: holderUserId, assets: walletAssets });
  };
  const deleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('已移入回收站');
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      refetchDeletedOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  // Deribit 期权到期日查询（表单开启且资产类型为期权时才拉取）
  const isOptionForm = formData.assetType === 'crypto_option' && showForm;
  const supportsDeribitOptionData = optionFormData.optionCurrency === 'BTC' || optionFormData.optionCurrency === 'ETH';
  const deribitOptionCurrency = (optionFormData.optionCurrency === 'ETH' ? 'ETH' : 'BTC') as 'BTC' | 'ETH';
  const { data: expiriesData, isLoading: expiriesLoading } = (trpc.ledger as any).deribitGetExpiries.useQuery(
    { currency: deribitOptionCurrency },
    { enabled: isOptionForm && supportsDeribitOptionData, staleTime: 5 * 60 * 1000 }
  );
  const expiries: { label: string; deribitLabel: string; ts: number; diffDays: number }[] = expiriesData?.expiries ?? [];
  // Deribit 期权行权价查询（选完到期日后才拉取）
  const { data: strikesData, isLoading: strikesLoading } = (trpc.ledger as any).deribitGetStrikes.useQuery(
    { currency: deribitOptionCurrency, deribitLabel: optionFormData.deribitLabel },
    { enabled: isOptionForm && supportsDeribitOptionData && !!optionFormData.deribitLabel, staleTime: 5 * 60 * 1000 }
  );
  const strikes: number[] = strikesData?.strikes ?? [];
  // 回收站相关
  const { data: deletedOrdersData, refetch: refetchDeletedOrders } = trpc.ledger.funderGetDeletedOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const restoreMutation = trpc.ledger.funderRestoreOrder.useMutation({
    onSuccess: () => {
      toast.success('订单已恢复');
      refetchDeletedOrders();
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeleteMutation = trpc.ledger.funderPermanentDeleteOrder.useMutation({
    onSuccess: () => {
      toast.success('已永久删除');
      refetchDeletedOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  // 参与方相关
  const updateParticipantConfigMutation = trpc.ledger.funderUpdateParticipantConfig.useMutation({
    onSuccess: () => {
      toast.success('佣金配置已保存');
      setShowForm(false);
      setEditingOrder(null);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateParticipantOrderMutation = trpc.ledger.funderUpdateParticipantOrder.useMutation({
    onSuccess: () => {
      toast.success('参与者子订单已保存');
      setShowForm(false);
      setEditingOrder(null);
      setParticipants([]);
      participantsLoadedRef.current = null;
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.financeGetOrders.invalidate({ ledgerId });
      trpcUtils.ledger.funderGetSharedCollateralPool.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const saveParticipantsMutation = trpc.ledger.funderSaveOrderParticipants.useMutation({
    onSuccess: async () => {
      toast.success('参与方配置已保存');
      // 保存成功后自动收起面板，刷新订单数据
      setShowParticipantsPanel(null);
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const [currentOrderAmount, setCurrentOrderAmount] = useState('');
  const handleOpenParticipants = async (orderId: number, orderInterestBase: string) => {
    if (showParticipantsPanel === orderId) {
      setShowParticipantsPanel(null);
      return;
    }
    setShowParticipantsPanel(orderId);
    setCurrentOrderAmount(orderInterestBase || '');
    setParticipantsLoading(true);
    try {
      const result = await trpcUtils.ledger.funderGetOrderParticipants.fetch({ orderId, ledgerId });
      const mapped = (result.participants || []).map((p: any) => ({
        userId: p.user_id,
        displayName: getUserDisplayName(p, `成员 #${p.user_id}`),
        role: p.role as ParticipantRole,
        sortOrder: p.sort_order || 0,
        rate: (p.commission_rate != null && p.commission_rate !== '') ? String(p.commission_rate) : (p.rate != null ? String(p.rate) : ''),
      }));
      setParticipantsList(mapped);
      // 已有保存记录 → 默认只读态；从未配置过 → 直接进编辑态方便首次添加
      setParticipantsEditMode(mapped.length === 0);
      const mappedMembers = (result.members || []).map((m: any) => ({
        userId: m.userId,
        displayName: getUserDisplayName(m, `成员 #${m.userId}`),
        memberRole: m.memberRole,
      }));
      setLedgerMembers(mappedMembers);
    } catch (e) {
      toast.error('加载参与方失败');
      setParticipantsList([]);
      setParticipantsEditMode(true);
    } finally {
      setParticipantsLoading(false);
    }
  };
  const handleAddParticipant = (role: ParticipantRole) => {
    setParticipantsList(list => {
      const usedIds = list.map(p => p.userId);
      const firstAvail = ledgerMembers.find(m => !usedIds.includes(m.userId));
      return [...list, {
        userId: firstAvail?.userId ?? 0,
        displayName: firstAvail?.displayName ?? '',
        role,
        sortOrder: list.length,
        rate: '',
      }];
    });
  };
  const handleSaveParticipants = (orderId: number) => {
    const valid = participantsList.filter(p => p.userId > 0);
    saveParticipantsMutation.mutate({
      orderId,
      ledgerId,
      participants: valid.map((p, i) => ({
        userId: p.userId,
        role: p.role,
        sortOrder: i,
        rate: (p.rate ?? '').toString().trim() || undefined,
      })),
    });
  };

  // 结息记录相关：按当前展开订单的拥有者/参与者视角独立查询。
  const paymentPanelOrder = showPaymentPanel !== null
    ? (assetOrders as any[]).find((o: any) => Number(o.id) === Number(showPaymentPanel))
    : null;
  const paymentPanelParticipantUserId = getParticipantUserIdForOrder(paymentPanelOrder);
  const { data: interestPayments, refetch: refetchPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: showPaymentPanel!, participantUserId: paymentPanelParticipantUserId },
    { enabled: showPaymentPanel !== null }
  );

    const addPaymentMutation = trpc.ledger.funderAddInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已添加');
      setPaymentForm({ amount: '', currency: 'U', exchangeRate: String(cnyRate || 6.75), payDate: new Date().toISOString().slice(0, 10), note: '' });
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  const updatePaymentMutation = trpc.ledger.funderUpdateInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已更新');
      setEditingPaymentId(null);
      setPaymentForm({ amount: '', currency: 'U', exchangeRate: String(cnyRate || 6.75), payDate: new Date().toISOString().slice(0, 10), note: '' });
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  const deletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已删除');
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  // 表单内用户选择相关状态
  const [formUserDropdown, setFormUserDropdown] = useState(false);
  const [formUserSearch, setFormUserSearch] = useState('');

  const handleOpenCreate = () => {
    setParticipants([]);
    setSelectedParticipantUserIds([]);
    setParticipantUserSearch('');
    setNewCollaboratorRole('owner');
    // 多拥有者只在管理员主动选择时配置；新订单仍按原有单拥有者表单打开。
    setParticipantsSectionExpanded(false);
    resetLinkedAmountFields();
    setAmountInputValue('');
    participantsLoadedRef.current = null;
    setFormData({
      userId: 0,
      coin: 'BTC',
      amountCurrency: 'USDT',
      buyPrice: '',
      buyQuantity: '',
      buyDate: getBeijingToday(),
      storageAccount: '',
      status: 'active',
      adminNote: '',
      publicNote: '',
      interestRateAnnual: '',
      interestPaymentType: '',
      interestBase: '',
      interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
      interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
      interestStartDate: getBeijingToday(),
      showProfitShare: true,
      commissionShare: '',
      profitShareRatio: '',
      profitShareType: 'interest' as 'interest' | 'coin',
      originalAmount: '',
      commissionRate: '',
      commissionBase: '',
      commissionStartDate: '',
      assetType: '' as '' | 'stock' | 'crypto' | 'crypto_option',
      tradeDirection: null as null | 'long' | 'short',
      ownerLabel: '',
      ownerLabelMode: 'member' as 'member' | 'manual',
      personalHeaderLabel: '',
      ownerNameDisplay: 'self' as 'all' | 'self',
      ownerVisibilityMode: 'self' as 'self' | 'total' | 'breakdown' | 'partners',
      ownerVisibleOwnerIds: [] as number[],
      tags: [] as string[],
      principalLentOut: false,
      tradingFeeRate: '2',
      tradingFeeStatus: 'unpaid' as 'unpaid' | 'half_paid' | 'paid',
      brokerName: '',
      brokerAccount: '',
      orderFillStatus: 'filled' as 'pending' | 'filled',
      orderPerspective: 'self' as 'self' | 'other',
    });
    setTagInput('');
    setPersonalHeaderDraft('');
    setOptionFormData({ optionCurrency: 'BTC', direction: 'long_call', exerciseDate: '', deribitLabel: '', strikePrice: '', premium: '', premiumDenomination: 'USDT', buyQty: '' });
    interestBaseTouchedRef.current = false; // 新建订单：允许融资金额(U)自动带入计息基数
    setCollateralAssets([]);
    setCollateralEditMode(true); // 新建订单：担保货币恒为可编辑
    setWalletCollateralEditMode(true);
    setCollateralShareMode('none');
    setCollateralSourceMode('manual');
    setCollateralSource(null);
    setPendingInterestTagName('');
    setPaidInterestTagName('');
    setStockPnlSourceMode('none');
    setManualStockPnlCalculationMode('position_cost');
    setManualStockPositions([]);
    setManualStockTotalCapital('');
    setManualStockCapitalCurrency('CNY');
    setManualStockPnlCoefficient('1');
    setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
    setEditingOrder(null);
    setShowDatePicker(false);
    setShowInterestDatePicker(false);
    setShowForm(true);
  };

  const participantsSectionRef = React.useRef<HTMLDivElement>(null);
  const handleOpenEdit = (order: any, scrollTo?: string) => {
    // 已有订单的参与者总区域默认收起，避免多人配置占满编辑界面。
    setParticipants([]);
    setSelectedParticipantUserIds([]);
    setParticipantUserSearch('');
    setNewCollaboratorRole('owner');
    // 只有从订单底部的“拥有者/参与者”入口进入时才主动展开；普通编辑保持收起。
    setParticipantsSectionExpanded(scrollTo === 'participants');
    resetLinkedAmountFields();
    participantsLoadedRef.current = null;
    trpcUtils.ledger.funderGetOrderParticipants.invalidate({ orderId: Number(order.id), ledgerId });
    // amount_currency 为 NULL/空表示老订单，按 USDT 口径兼容（amount 本就是 USDT 价值）
    const editAmountCurrency = (order.amount_currency && String(order.amount_currency).trim()) ? String(order.amount_currency) : 'USDT';
    const editDisplayConfig = (() => {
      try {
        const raw = order.display_config;
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      } catch {
        return {};
      }
    })();
    const savedDerivedLinkedField = (['amount', 'price', 'quantity'] as LinkedAmountField[]).includes(editDisplayConfig?.linkedDerivedField)
      ? editDisplayConfig.linkedDerivedField as LinkedAmountField
      : null;
    const savedManualLinkedFields = String(editDisplayConfig?.linkedManualFields || '')
      .split(',')
      .filter((field): field is LinkedAmountField => (['amount', 'price', 'quantity'] as string[]).includes(field));
    manualLinkedFieldsRef.current = savedManualLinkedFields.length === 2
      ? savedManualLinkedFields.slice(-2)
      : savedDerivedLinkedField
        ? (['amount', 'price', 'quantity'] as LinkedAmountField[]).filter(field => field !== savedDerivedLinkedField)
        : [];
    setDerivedLinkedField(savedDerivedLinkedField);
    setFormData({
      userId: order.user_id,
      coin: order.coin as CoinType,
      amountCurrency: editAmountCurrency as CoinType,
      buyPrice: order.buy_price || '',
      buyQuantity: order.buy_quantity || '',
      buyDate: order.buy_date || '',
      storageAccount: order.storage_account || '',
      status: order.status,
      adminNote: order.admin_note || '',
      publicNote: order.public_note || '',
      interestRateAnnual: (() => {
        const r = String(order.interest_rate_annual ?? '');
        // 如果利率本身带负号（如-8），直接用
        if (r.startsWith('-')) return normalizeFunderAnnualRate(r);
        // 如果利率是0或空，检查display_config里的rate_negative标记
        const rNum = parseFloat(r);
        if ((rNum === 0 || r === '' || r === '0') && !r.startsWith('-')) {
          try {
            const dc = order.display_config;
            const parsed = dc ? (typeof dc === 'string' ? JSON.parse(dc) : dc) : null;
            if (parsed?.rate_negative === true) return '-0';
          } catch {}
        }
        return normalizeFunderAnnualRate(r);
      })(),
      interestPaymentType: order.interest_payment_type || '',
      interestBase: order.interest_base || '',
      interestBaseCurrency: (['CNY', 'RMB', 'cny', 'rmb', '人民币'].includes(order.interest_base_currency || '') ? 'CNY' : 'USDT') as 'USDT' | 'CNY',
      interestRateCurrency: (order.interest_rate_currency || 'USDT') as 'USDT' | 'CNY',
      interestStartDate: order.interest_start_date ? String(order.interest_start_date).slice(0, 10) : '',
      showProfitShare: order.show_profit_share !== 0 && order.show_profit_share !== false,
      commissionShare: order.commission_share || '',
      profitShareRatio: (() => { const m = String(order.commission_share || '').match(/(\d+(?:\.\d+)?)/); return m ? m[1] : ''; })(),
      profitShareType: (String(order.commission_share || '').includes('币种收益') ? 'coin' : 'interest') as 'interest' | 'coin',
      originalAmount: order.amount || '',
      commissionRate: order.participantInfo?.commissionRate != null ? String(order.participantInfo.commissionRate) : '',
      commissionBase: order.participantInfo?.commissionBase != null ? String(order.participantInfo.commissionBase) : '',
      commissionStartDate: order.participantInfo?.commissionStartDate ? String(order.participantInfo.commissionStartDate).slice(0, 10) : '',
      assetType: (order.asset_type || '') as '' | 'stock' | 'crypto' | 'crypto_option',
      tradeDirection: (order.trade_direction as null | 'long' | 'short') || null,
      ownerLabel: order.owner_label || '',
      ownerLabelMode: (order.owner_label ? 'manual' : 'member') as 'member' | 'manual',
      personalHeaderLabel: typeof (order as any).personal_header_label === 'string' ? (order as any).personal_header_label : '',
      ownerNameDisplay: 'self',
      ownerVisibilityMode: (['self', 'total', 'breakdown', 'partners'].includes((order as any).owner_visibility_mode)
        ? (order as any).owner_visibility_mode
        : 'self') as 'self' | 'total' | 'breakdown' | 'partners',
      ownerVisibleOwnerIds: Array.isArray((order as any).visible_owner_ids)
        ? (order as any).visible_owner_ids.map(Number).filter(Boolean)
        : (() => { try { const ids = typeof (order as any).visible_owner_ids === 'string' ? JSON.parse((order as any).visible_owner_ids) : []; return Array.isArray(ids) ? ids.map(Number).filter(Boolean) : []; } catch { return []; } })(),
      tags: (() => { try { const t = order.tags; return Array.isArray(t) ? t : (typeof t === 'string' ? JSON.parse(t) : []); } catch { return []; } })(),
      principalLentOut: !!(order.principal_lent_out),
      tradingFeeRate: order.trading_fee_rate_per_mille != null ? String(order.trading_fee_rate_per_mille) : '2',
      tradingFeeStatus: (['unpaid', 'half_paid', 'paid'].includes(order.trading_fee_status) ? order.trading_fee_status : 'unpaid') as 'unpaid' | 'half_paid' | 'paid',
      brokerName: order.broker_name || '',
      brokerAccount: order.broker_account || '',
      orderFillStatus: (order.order_fill_status === 'pending' ? 'pending' : 'filled') as 'pending' | 'filled',
      orderPerspective: (order.order_perspective === 'other' ? 'other' : 'self') as 'self' | 'other',
    });
    setTagInput('');
    setPersonalHeaderDraft(typeof (order as any).personal_header_label === 'string' ? (order as any).personal_header_label : '');
    // 加载期权信息
    try {
      const oi = order.option_info;
      if (oi) {
        const parsed = typeof oi === 'string' ? JSON.parse(oi) : oi;
        setOptionFormData({
          optionCurrency: (parsed.coin || order.coin || 'BTC') as CoinType,
          direction: (parsed.direction || 'long_call') as 'long_call' | 'long_put' | 'short_call' | 'short_put',
          exerciseDate: parsed.exerciseDate || '',
          deribitLabel: parsed.deribitLabel || '',
          strikePrice: parsed.strikePrice ? String(parsed.strikePrice) : '',
          premium: parsed.premium || '',
          premiumDenomination: (parsed.denomination === 'B'
            ? (parsed.coin || 'BTC')
            : parsed.denomination === 'U'
              ? 'USDT'
              : (parsed.denomination || 'USDT')) as CoinType,
          buyQty: parsed.buyQty || '',
        });
      } else {
        setOptionFormData({ optionCurrency: 'BTC', direction: 'long_call', exerciseDate: '', deribitLabel: '', strikePrice: '', premium: '', premiumDenomination: 'USDT', buyQty: '' });
      }
    } catch { setOptionFormData({ optionCurrency: 'BTC', direction: 'long_call', exerciseDate: '', deribitLabel: '', strikePrice: '', premium: '', premiumDenomination: 'USDT', buyQty: '' }); }
    // 加载担保货币；钱包来源以 source=wallet 持久化，编辑时优先恢复冻结担保模式。
    let hasWalletCollateralSource = false;
    try {
      const ca = order.collateral_assets;
      if (ca) {
        const parsed = typeof ca === 'string' ? JSON.parse(ca) : ca;
        const normalized = Array.isArray(parsed)
          ? parsed.map((asset: any) => isWalletCollateralAsset(asset) ? { ...asset, source: 'wallet' as const } : asset)
          : [];
        setCollateralAssets(normalized);
        hasWalletCollateralSource = normalized.some((asset: any) => asset?.source === 'wallet');
      } else {
        setCollateralAssets([]);
      }
    } catch { setCollateralAssets([]); }
    // 编辑已有订单：担保货币默认只读态，点「编辑」才可改
    setCollateralEditMode(false);
    setWalletCollateralEditMode(false);
    // 加载共享担保模式
    const csm = (order as any).collateral_share_mode;
    setCollateralShareMode(csm === 'self' || csm === 'cross' ? csm : 'none');
    // 加载37号引用与手工股票缓存。钱包担保只切换担保物展示，不能覆盖这两组订单配置。
    try {
      const cs = (order as any).collateral_source;
      if (cs) {
        const parsed = typeof cs === 'string' ? JSON.parse(cs) : cs;
        const savedManualPnl = parsed?.stockManualPnl && typeof parsed.stockManualPnl === 'object'
          ? parsed.stockManualPnl
          : parsed;
        const savedManualPositions = Array.isArray(savedManualPnl?.positions)
          ? savedManualPnl.positions.map((position: any) => ({
              name: String(position?.name || '').trim(),
              symbol: String(position?.symbol || '').trim().toUpperCase(),
              buyPrice: String(position?.buyPrice ?? ''),
              sellPrice: String(position?.sellPrice ?? ''),
              quantity: String(position?.quantity ?? ''),
              // 兼容上一版刚保存过的「初始参考价」：作为首次最新价兜底读取，
              // 但在账户总额度模式中不会再以初始价/初始日期方式展示。
              latestPrice: position?.latestPrice ?? position?.initialPrice ?? '',
              latestPriceDate: String(position?.latestPriceDate || position?.initialPriceDate || ''),
              latestPriceUpdatedAt: String(position?.latestPriceUpdatedAt || ''),
            }))
          : (Array.isArray(parsed?.stockPositions)
            ? parsed.stockPositions.map((position: any) => ({
                name: String(position?.name || '').trim(),
                symbol: String(position?.symbol || '').trim().toUpperCase(),
                buyPrice: String(position?.buyPrice ?? ''),
                sellPrice: String(position?.sellPrice ?? ''),
                quantity: String(position?.quantity ?? ''),
                latestPrice: position?.latestPrice ?? position?.initialPrice ?? '',
                latestPriceDate: String(position?.latestPriceDate || position?.initialPriceDate || ''),
                latestPriceUpdatedAt: String(position?.latestPriceUpdatedAt || ''),
              }))
            : []);
        setManualStockPositions(savedManualPositions);
        setManualStockPnlCalculationMode(savedManualPnl?.calculationMode === 'total_capital' || parsed?.stockPnlCalculationMode === 'total_capital' ? 'total_capital' : 'position_cost');
        const savedTotalCapital = savedManualPnl?.totalCapital ?? parsed?.stockTotalCapital;
        setManualStockTotalCapital(savedTotalCapital === null || savedTotalCapital === undefined ? '' : String(savedTotalCapital));
        setManualStockCapitalCurrency(String(savedManualPnl?.capitalCurrency ?? parsed?.stockCapitalCurrency ?? '').toUpperCase() === 'USD' ? 'USD' : 'CNY');
        const savedStockCoefficient = Number(savedManualPnl?.coefficient ?? parsed?.stockPnlCoefficient);
        setManualStockPnlCoefficient(
          Number.isFinite(savedStockCoefficient) && savedStockCoefficient > 0 && savedStockCoefficient <= 100000
            ? String(savedStockCoefficient)
            : '1',
        );
        setStockPnlSourceMode(parsed?.stockPnlSource === 'manual_positions' && savedManualPositions.length > 0
          ? 'manual_positions'
          : (parsed?.floatingPnlTagName || (parsed?.useFloatingPnl !== false && Number(parsed?.ledgerId) === 37 && parsed?.tagName) ? 'reference37' : 'none'));
        if (parsed && Number(parsed.ledgerId) === 37 && parsed.tagName) {
          const floatingPnlTagName = parsed.floatingPnlTagName || (parsed.useFloatingPnl !== false ? parsed.tagName : '');
          const collateralTagName = parsed.collateralTagName || (parsed.useCollateral !== false ? parsed.tagName : '');
          setCollateralSource({
            ledgerId: parsed.ledgerId,
            // tagName保留为旧字段回退，新的两个字段才是各自独立的数据来源。
            tagName: parsed.tagName,
            floatingPnlTagName,
            floatingPnlCalculationMode: parsed.floatingPnlCalculationMode === 'leveraged_net_pnl'
              ? 'leveraged_net_pnl'
              : 'raw_net_pnl',
            collateralTagName,
            useFloatingPnl: !!floatingPnlTagName,
            useCollateral: !!collateralTagName,
          });
          setPendingInterestTagName(parsed.pendingInterestTagName || (parsed.usePendingInterest === true ? parsed.tagName : ''));
          // 旧的 interestTagName/useInterest 在本次升级前只代表“已结引用”，不能误当成待结引用。
          setPaidInterestTagName(parsed.paidInterestTagName || parsed.interestTagName || ((parsed.usePaidInterest === true || parsed.useInterest === true) ? parsed.tagName : ''));
          setCollateralSourceMode(hasWalletCollateralSource ? 'wallet' : 'external');
        } else {
          setCollateralSourceMode(hasWalletCollateralSource ? 'wallet' : 'manual');
          setCollateralSource(null);
          setPendingInterestTagName('');
          setPaidInterestTagName('');
        }
      } else {
        setCollateralSourceMode(hasWalletCollateralSource ? 'wallet' : 'manual');
        setCollateralSource(null);
        setPendingInterestTagName('');
        setPaidInterestTagName('');
        setStockPnlSourceMode('none');
        setManualStockPnlCalculationMode('position_cost');
        setManualStockPositions([]);
        setManualStockTotalCapital('');
        setManualStockCapitalCurrency('CNY');
        setManualStockPnlCoefficient('1');
      }
    } catch {
      setCollateralSourceMode('manual');
      setCollateralSource(null);
      setPendingInterestTagName('');
      setPaidInterestTagName('');
      setStockPnlSourceMode('none');
      setManualStockPnlCalculationMode('position_cost');
      setManualStockPositions([]);
      setManualStockTotalCapital('');
      setManualStockCapitalCurrency('CNY');
      setManualStockPnlCoefficient('1');
    }
    // 加载字段展示配置
    try {
      const dc = order.display_config;
      if (dc) {
        const parsed = typeof dc === 'string' ? JSON.parse(dc) : dc;
        // 过滤掉非 boolean 值，防止旧数据污染导致后端校验失败
        const safeConfig: Record<string, boolean | string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'boolean' || typeof v === 'string') safeConfig[k] = v;
        }
        const mergedDisplayConfig = { ...DEFAULT_DISPLAY_CONFIG, ...safeConfig };
        // 旧期权订单在新增资金属性前已有Greeks展示；资金属性只应增加标签，不能让默认配置误将其关闭。
        const hasFundingAssetTag = mergedDisplayConfig.assetFundingType === 'self'
          || mergedDisplayConfig.assetFundingType === 'financing'
          || mergedDisplayConfig.selfFundedAsset === true
          || mergedDisplayConfig.selfFundedAsset === 'true';
        if (order.asset_type === 'crypto_option' && hasFundingAssetTag && safeConfig.showGreeksManualOverride !== true) {
          mergedDisplayConfig.showGreeks = true;
        }
        setDisplayConfig(mergedDisplayConfig);
        // 回填保证金率预警阈值（数字字段，不在 safeConfig 中）
        if ((parsed as any).marginAlertThreshold !== undefined && (parsed as any).marginAlertThreshold !== null) {
          setMarginAlertThreshold(String((parsed as any).marginAlertThreshold));
        } else {
          setMarginAlertThreshold('');
        }
      } else {
        setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
        setMarginAlertThreshold('');
      }
    } catch { setDisplayConfig(DEFAULT_DISPLAY_CONFIG); setMarginAlertThreshold(''); }
    // 初始化融资金额输入值：优先恢复管理员上次手动输入的原值，避免实时汇率变化后重新反算。
    // 老订单缺失原始输入快照时，才按既有 USDT 基准和当前币种兼容折算。
    (() => {
      const savedInputRaw = editDisplayConfig?.financingInputAmount;
      const savedInputAmount = Number(savedInputRaw);
      const savedCurrencyRaw = String(editDisplayConfig?.financingInputCurrency || '').toUpperCase();
      const savedCurrency = savedCurrencyRaw === 'U' ? 'USDT' : savedCurrencyRaw === 'RMB' ? 'CNY' : savedCurrencyRaw;
      const normalizedEditCurrency = String(editAmountCurrency).toUpperCase() === 'U' ? 'USDT' : String(editAmountCurrency).toUpperCase() === 'RMB' ? 'CNY' : String(editAmountCurrency).toUpperCase();
      if (savedInputAmount > 0 && savedCurrency === normalizedEditCurrency) {
        setAmountInputValue(String(savedInputRaw));
        return;
      }
      const amtU = order.amount ? parseFloat(order.amount) : NaN;
      if (isNaN(amtU)) { setAmountInputValue(''); return; }
      // 股票类型：直接显示原始金额（CNY）
      if (order.asset_type === 'stock') { setAmountInputValue(String(order.amount)); return; }
      if (normalizedEditCurrency === 'USDT') { setAmountInputValue(String(order.amount)); return; }
      const conv = fromUsdtBase(amtU, normalizedEditCurrency);
      setAmountInputValue(conv !== null && !isNaN(conv) ? parseFloat(conv.toFixed(2)).toString() : String(order.amount));
    })();
    // 编辑已有订单：若已有计息基数则视为手动值，不被融资金额自动覆盖
    interestBaseTouchedRef.current = !!(order.interest_base && parseFloat(order.interest_base) > 0);
    setEditingOrder(order);
    setShowDatePicker(false);
    setShowInterestDatePicker(false);
    setShowForm(true);
    if (scrollTo === 'participants') {
      setTimeout(() => {
        participantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  };

  // 管理员可从订单号深链直达编辑界面，便于移动端复核同一张订单的拥有者组配置。
  // 使用一次性标记；关闭表单后不会因同一 URL 自动重新弹出。
  const directEditHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || ledgerId !== 52 || !isAdminUser) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = Number(params.get('orderId') || 0);
    if (params.get('edit') !== '1' || !Number.isInteger(orderId) || orderId <= 0) return;
    const key = `${ledgerId}:${orderId}`;
    if (directEditHandledRef.current === key) return;
    const target = (assetOrders as any[]).find((order: any) => Number(order?.id) === orderId);
    if (!target) return;
    directEditHandledRef.current = key;
    handleOpenEdit(target);
  }, [assetOrders, isAdminUser, ledgerId]);

  // 管理员从协作人列表进入个人配置时，必须把该协作人的完整快照交给同一套编辑表单。
  // 身份、主订单 ID、共享标的和结清状态仍强制来自父订单，避免个人视图改写真实关联关系。
  const openParticipantFullView = (participant: ParticipantForm) => {
    if (!editingOrder?.id) return;
    const snapshot = participant.orderSnapshot || {};
    const participantOrder = {
      ...editingOrder,
      ...snapshot,
      id: editingOrder.id,
      ledger_id: editingOrder.ledger_id ?? ledgerId,
      user_id: editingOrder.user_id,
      status: editingOrder.status,
      settled_at: editingOrder.settled_at,
      interest_end_date: editingOrder.interest_end_date,
      order_no: editingOrder.order_no,
      amount: participant.amount || snapshot.amount || editingOrder.amount,
      amount_currency: participant.amountCurrency || snapshot.amount_currency || editingOrder.amount_currency,
      interest_rate_annual: participant.interestRateAnnual !== '' ? participant.interestRateAnnual : (snapshot.interest_rate_annual ?? editingOrder.interest_rate_annual),
      interest_base: participant.interestBase !== '' ? participant.interestBase : (snapshot.interest_base ?? editingOrder.interest_base),
      interest_base_currency: participant.interestBaseCurrency || snapshot.interest_base_currency || editingOrder.interest_base_currency,
      interest_rate_currency: participant.interestRateCurrency || snapshot.interest_rate_currency || editingOrder.interest_rate_currency,
      interest_payment_type: participant.interestPaymentType || snapshot.interest_payment_type || editingOrder.interest_payment_type,
      interest_start_date: participant.interestStartDate || snapshot.interest_start_date || editingOrder.interest_start_date,
      display_config: JSON.stringify({
        ...(() => { try { const value = snapshot.display_config; return value ? (typeof value === 'string' ? JSON.parse(value) : value) : {}; } catch { return {}; } })(),
        ...participant.displayConfig,
        marginAlertThreshold: participant.marginAlertThreshold || undefined,
      }),
      personal_header_label: participant.personalHeaderLabel || snapshot.personal_header_label || '',
      tags: JSON.stringify(participant.tags.length > 0 ? participant.tags : (() => { try { const value = snapshot.tags; return Array.isArray(value) ? value : (typeof value === 'string' ? JSON.parse(value) : []); } catch { return []; } })()),
      trade_direction: participant.tradeDirection ?? snapshot.trade_direction ?? null,
      order_fill_status: participant.orderFillStatus || snapshot.order_fill_status || 'filled',
      order_perspective: participant.orderPerspective || snapshot.order_perspective || 'self',
      buy_date: participant.buyDate || snapshot.buy_date || editingOrder.buy_date,
      broker_name: participant.brokerName || snapshot.broker_name || '',
      broker_account: participant.brokerAccount || snapshot.broker_account || '',
      principal_lent_out: participant.principalLentOut ? 1 : (snapshot.principal_lent_out || 0),
      collateral_share_mode: participant.collateralShareMode || snapshot.collateral_share_mode || 'none',
      collateral_source: participant.collateralSource || snapshot.collateral_source || null,
      trading_fee_rate_per_mille: participant.tradingFeeRate || snapshot.trading_fee_rate_per_mille || null,
      trading_fee_status: participant.tradingFeeStatus || snapshot.trading_fee_status || 'unpaid',
      participantInfo: {
        userId: participant.userId,
        role: participant.role,
        isPersonalOwnerView: participant.role === 'owner',
        commissionRate: snapshot.commission_rate ?? '',
        commissionBase: snapshot.commission_base ?? '',
        commissionStartDate: snapshot.commission_start_date ?? '',
      },
      participant_name: participant.userName,
      owner_label: participant.userName,
      order_owner_name: editingOrder.order_owner_name || editingOrder.owner_label || editingOrder.username || null,
      owner_visibility_mode: participant.visibilityMode,
      visible_owner_ids: participant.visibleOwnerIds,
      _isParticipant: participant.role !== 'owner',
    };
    handleOpenEdit(participantOrder);
  };

  const handleSubmit = () => {
    // 新建模式必须选择用户
    if (!editingOrder && !formData.userId) {
      toast.error('请选择用户');
      return;
    }
    // 股票历史订单的 amount 按所选融资币种原值保存；数字币和期权统一保存USDT基准。
    // 三种类型都支持融资金额、买入价格、币数任选两项推算第三项。
    let finalAmount: string;
    const isOptionOrder = formData.assetType === 'crypto_option';
    const optionPremiumSummary = isOptionOrder ? getOptionPremiumSummary() : null;
    const price = parseFloat(formData.buyPrice || '0');
    const quantity = parseFloat(formData.buyQuantity || '0');
    const hasCompleteLinkedValues = !!financingAmountUsdt && parseFloat(financingAmountUsdt) > 0 && price > 0 && quantity > 0;
    if (formData.assetType === 'stock') {
      finalAmount = (() => { const v = parseFloat(amountInputValue); return isNaN(v) ? '' : v.toFixed(2); })();
      if (!finalAmount || parseFloat(finalAmount) <= 0) {
        toast.error(`请填写${amountDisplayLabel}`);
        return;
      }
    } else if (isOptionOrder) {
      finalAmount = optionPremiumSummary?.totalUsdt && optionPremiumSummary.totalUsdt > 0
        ? optionPremiumSummary.totalUsdt.toFixed(4)
        : '';
      if (!finalAmount || parseFloat(finalAmount) <= 0) {
        toast.error('请填写单张权利金和合约数量');
        return;
      }
    } else {
      finalAmount = financingAmountUsdt || (editingOrder ? formData.originalAmount : '');
      if (!finalAmount || parseFloat(finalAmount) <= 0 || price <= 0 || quantity <= 0) {
        toast.error('请手动输入任意两项，确认第三项已自动推算');
        return;
      }
    }
    if (formData.assetType === 'stock' && stockPnlSourceMode === 'manual_positions') {
      if (validManualStockPositions.length === 0) {
        toast.error(manualStockPnlCalculationMode === 'total_capital'
          ? '请至少完整填写一只股票的代码和当前持股数量'
          : '请至少完整填写一只股票的代码、买入价和股数');
        return;
      }
      if (manualStockPnlCalculationMode === 'total_capital' && !isManualStockTotalCapitalValid) {
        toast.error('请输入大于 0 的股票账户初始总额度');
        return;
      }
      if (!isManualStockPnlCoefficientValid) {
        toast.error('股票计算系数须大于 0，且不超过 100000');
        return;
      }
    }
    const payload = {
      ledgerId,
      coin: isOptionOrder ? optionFormData.optionCurrency : formData.coin,
      amount: finalAmount,
      amountCurrency: isOptionOrder ? optionPremiumSummary?.denomination || 'USDT' : formData.amountCurrency || undefined,
      buyPrice: isOptionOrder ? optionFormData.premium || undefined : formData.buyPrice || undefined,
      buyDate: formData.buyDate || undefined,
      buyQuantity: isOptionOrder ? optionFormData.buyQty || undefined : formData.buyQuantity || undefined,
      storageAccount: formData.storageAccount || undefined,
      adminNote: formData.adminNote || undefined,
      publicNote: formData.publicNote || undefined,
      interestRateAnnual: normalizeFunderAnnualRate(formData.interestRateAnnual) || undefined,
      interestPaymentType: formData.interestPaymentType || undefined,
      interestBase: formData.interestBase || undefined,
      interestBaseCurrency: formData.interestBaseCurrency,
      interestRateCurrency: formData.interestRateCurrency,
      interestStartDate: formData.interestStartDate || undefined,
      showProfitShare: Boolean(displayConfig.profitShare),
      commissionShare: (() => {
        if (!displayConfig.profitShare) return undefined;
        const typeLabel = formData.profitShareType === 'coin' ? '利润分成' : '利息分成';
        const ratio = (formData.profitShareRatio ?? '').toString().trim();
        return ratio ? `${typeLabel} ${ratio}%` : typeLabel;
      })(),
      // 新建订单仅先写入手工担保；钱包担保在订单创建后走原子冻结接口。
      // 编辑订单保留全部既有担保，避免保存手工字段时丢失已冻结的钱包条目。
      collateralAssets: editingOrder
        ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
        : collateralAssets.filter(a => !isWalletCollateralAsset(a) && a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))).length > 0
          ? collateralAssets.filter(a => !isWalletCollateralAsset(a) && a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
          : undefined,
      // 提交前确保 displayConfig 所有値都是 boolean
      displayConfig: {
        ...Object.fromEntries(
          Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean' || typeof v === 'string')
        ),
        ...(marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? { marginAlertThreshold: parseFloat(marginAlertThreshold) } : {}),
        rate_negative: normalizeFunderAnnualRate(formData.interestRateAnnual).startsWith('-'),
        ownerNameDisplay: 'self',
        financingInputAmount: isOptionOrder ? optionPremiumSummary?.totalInput || '' : amountInputValue || '',
        financingInputCurrency: isOptionOrder ? optionPremiumSummary?.denomination || 'USDT' : formData.amountCurrency || 'USDT',
        linkedManualFields: isOptionOrder ? '' : manualLinkedFieldsRef.current.join(','),
        linkedDerivedField: isOptionOrder ? '' : derivedLinkedField || '',
      } as Record<string, boolean | number | string>,
      assetType: formData.assetType || undefined,
      tradeDirection: !isOptionOrder && (['long', 'short'] as const).includes(formData.tradeDirection as any) ? (formData.tradeDirection as 'long' | 'short') : null,
      ownerLabel: formData.ownerLabel || undefined,
      personalHeaderLabel: formData.personalHeaderLabel.trim() || undefined,
      ownerVisibilityMode: formData.ownerVisibilityMode,
      ownerVisibleOwnerIds: formData.ownerVisibleOwnerIds,
      tags: formData.tags.length > 0 ? formData.tags : undefined,
      collateralShareMode: collateralShareMode !== 'none' ? collateralShareMode : undefined,
      collateralSource: orderCollateralSourceDraft,
      principalLentOut: formData.principalLentOut,
      tradingFeeRate: ledgerId === 52 ? (Number.isFinite(Number(formData.tradingFeeRate)) ? Math.max(0, Number(formData.tradingFeeRate)) : 2) : undefined,
      tradingFeeStatus: ledgerId === 52 ? formData.tradingFeeStatus : undefined,
      orderFillStatus: formData.orderFillStatus,
      orderPerspective: formData.orderPerspective,
      brokerName: formData.brokerName || undefined,
      brokerAccount: formData.brokerAccount || undefined,
      optionInfo: formData.assetType === 'crypto_option' ? {
        coin: optionFormData.optionCurrency,
        direction: optionFormData.direction,
        exerciseDate: optionFormData.exerciseDate || undefined,
        deribitLabel: optionFormData.deribitLabel || undefined,
        strikePrice: optionFormData.strikePrice ? parseFloat(optionFormData.strikePrice) : undefined,
        premium: optionFormData.premium || undefined,
        denomination: optionFormData.premiumDenomination,
        buyQty: optionFormData.buyQty || undefined,
      } : undefined,
    };
    if (isSnapshotScopedEdit && editingOrder?.participantInfo) {
      const participantUserId = editingOrder.participantInfo.userId ?? editingOrder.participantInfo.user_id;
      if (!participantUserId) {
        toast.error('无法确定参与者用户ID');
        return;
      }
      updateParticipantOrderMutation.mutate({
        orderId: Number(editingOrder.id),
        ledgerId,
        userId: Number(participantUserId),
        snapshot: {
          coin: payload.coin,
          amount: payload.amount,
          amount_currency: payload.amountCurrency || null,
          buy_price: payload.buyPrice || null,
          buy_date: payload.buyDate || null,
          buy_quantity: payload.buyQuantity || null,
          storage_account: payload.storageAccount || null,
          status: formData.status,
          admin_note: payload.adminNote || null,
          public_note: payload.publicNote || null,
          interest_rate_annual: payload.interestRateAnnual || null,
          interest_payment_type: payload.interestPaymentType || null,
          interest_base: payload.interestBase || null,
          interest_base_currency: payload.interestBaseCurrency || null,
          interest_rate_currency: payload.interestRateCurrency || null,
          interest_start_date: payload.interestStartDate || null,
          ...(payload.collateralAssets !== undefined ? { collateral_assets: payload.collateralAssets ? JSON.stringify(payload.collateralAssets) : null } : {}),
          show_profit_share: payload.showProfitShare ? 1 : 0,
          commission_share: payload.commissionShare || null,
          display_config: JSON.stringify(payload.displayConfig || {}),
          asset_type: payload.assetType || null,
          tags: payload.tags ? JSON.stringify(payload.tags) : null,
          collateral_share_mode: payload.collateralShareMode || 'none',
          collateral_source: payload.collateralSource ? JSON.stringify(payload.collateralSource) : null,
          principal_lent_out: payload.principalLentOut ? 1 : 0,
          trading_fee_rate_per_mille: payload.tradingFeeRate ?? null,
          trading_fee_status: payload.tradingFeeStatus || null,
          order_fill_status: payload.orderFillStatus || 'filled',
          order_perspective: payload.orderPerspective || 'self',
          broker_name: payload.brokerName || null,
          broker_account: payload.brokerAccount || null,
          option_info: payload.optionInfo ? JSON.stringify(payload.optionInfo) : null,
          trade_direction: payload.tradeDirection || null,
          personal_header_label: payload.personalHeaderLabel || null,
          owner_visibility_mode: editingCollaboratorRole === 'owner' ? payload.ownerVisibilityMode : null,
          visible_owner_ids: editingCollaboratorRole === 'owner' ? payload.ownerVisibleOwnerIds : [],
        },
      });
    } else if (editingOrder) {
      // 普通编辑不传 status；结清/恢复只允许走独立状态操作，避免普通保存被误判为状态联动并跳过参与者保存。
      updateMutation.mutate({ id: editingOrder.id, ...(formData.userId > 0 ? { userId: formData.userId } : {}), ...payload });
    } else {
      // 根据所选用户在账本中的角色自动判断归属：
      // 资方/管理员(owner/admin) -> 左侧资方订单；普通成员(member) -> 右侧借方订单
      const allMembers = ((ledgerData as any)?.members || []) as any[];
      const selMember = allMembers.find((m: any) => m.userId === formData.userId);
      const selRole = String(selMember?.role || '').toLowerCase();
      const isFunderSide = selRole === 'owner' || selRole === 'admin';
      if (isFunderSide) {
        createMutation.mutate({ userId: formData.userId, ...payload });
      } else {
        financeCreateMutation.mutate({ userId: formData.userId, ...payload });
      }
    }
  };

  const handleDelete = (orderId: number) => {
    setConfirmDeleteId(orderId);
  };
  const handleConfirmDelete = (participantAction: 'retain' | 'settle_all') => {
    if (confirmDeleteId === null) return;
    deleteMutation.mutate({ id: confirmDeleteId, ledgerId, participantAction });
    setConfirmDeleteId(null);
  };

  const getPaymentLabel = (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;

  return (
    <div className={hideHeader ? '' : 'min-h-screen'} style={{ backgroundColor: '#F0F4FF' }}>
      {/* 顶部导航 */}
      {!hideHeader && (
      <div
        className="sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        {/* 第一行：返回 + 标题 + 回收站 */}
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white flex-1">资方管理</h1>
          {isAdminUser && (
            <button onClick={() => setShowRecycleBin(true)} className="p-1" title="回收站">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
        {/* 合作资金总额 */}
        {(() => {
          const activeOrders: any[] = (assetOrders as any[]).filter((o: any) => o.status === 'active');
          const totalAmount = activeOrders.reduce((sum: number, o: any) => {
            // coin=CNY 且 amount_currency=USDT 的订单：用 buy_quantity÷cnyRate 实时折算，避免存储值过期
            if ((o.coin === 'CNY' || o.coin === 'RMB') && (o.amount_currency === 'USDT' || o.amount_currency === 'U')) {
              const qty = parseFloat(o.buy_quantity || '0');
              if (!isNaN(qty) && qty > 0 && cnyRate > 0) return sum + qty / cnyRate;
            }
            const amt = parseFloat(o.amount || '0');
            return sum + (isNaN(amt) ? 0 : amt);
          }, 0);
          if (totalAmount <= 0) return null;
          const fmt = (v: number) => v >= 10000
            ? (v / 10000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '万'
            : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
            <div className="mx-4 mb-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}>
              <div className="text-[11px] mb-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>目前合作资金总额</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAmount)}</span>
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>USDT</span>
              </div>
            </div>
          );
        })()}
        {/* 第二行：持币统计 */}
        {(() => {
          const activeOrders: any[] = (assetOrders as any[]).filter((o: any) => o.status === 'active');
          const coinMap: Record<string, number> = {};
          for (const o of activeOrders) {
            const coin = o.coin || o.asset_coin || '';
            const qty = parseFloat(o.buy_quantity || o.quantity || '0');
            if (!coin || isNaN(qty) || qty <= 0) continue;
            coinMap[coin] = (coinMap[coin] || 0) + qty;
          }
          const entries = Object.entries(coinMap);
          if (entries.length === 0) return null;
          const fmtQty = (v: number) => v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
          return (
            <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
              {entries.map(([coin, qty]) => (
                <div key={coin} className="flex items-baseline gap-1">
                  <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{coin}</span>
                  <span className="text-sm font-bold" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtQty(qty)}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      )}

      <div className="px-4 py-4">
        {isAdminUser && adminOnly && (
          <div className="mb-3">
            <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-white px-3 py-2.5 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-blue-500" />
              <input
                value={orderSearchText}
                onChange={event => setOrderSearchText(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                placeholder="智能查询：订单号、姓名、币种、标签、备注…"
                aria-label="智能查询全部融资付息订单"
              />
              {orderSearchText && (
                <button type="button" onClick={() => setOrderSearchText('')} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="清空查询">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-1.5 px-1 text-[11px] text-gray-400">
              命中任意一张关联订单后，会一并列出该组的主订单、共同拥有者和参与者个人视图。
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 px-0.5 text-[11px]">
              {(['左侧', '中侧', '右侧'] as const).map(side => (
                <span key={side} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-blue-700">
                  {side} {managementSideCounts[side]}
                </span>
              ))}
              <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-slate-500">含协作人个人视图</span>
            </div>
          </div>
        )}
        {/* 用户选择下拉框 + 资产类型筛选 + 添加订单按钮（仅管理员可见） */}
        {isAdminUser && (
        <div className="flex items-center gap-2 mb-4">
          {/* 用户下拉框 */}
          <div className="relative" style={{ flex: '1 1 0', minWidth: 0 }}>
            <button
              onClick={() => { setShowUserDropdown(!showUserDropdown); setUserSearchText(''); }}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 shadow-sm"
              style={{ color: '#374151' }}
            >
              <span>
                {selectedUserId === null
                  ? '全部成员'
                  : memberSelectorUsers.find((u: any) => getMemberSelectorId(u) === Number(selectedUserId))
                    ? (() => { const _u = memberSelectorUsers.find((u: any) => getMemberSelectorId(u) === Number(selectedUserId)); return getUserDisplayName(_u, '成员'); })()
                    : '选择成员'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1 shrink-0" />
            </button>
            {showUserDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden" style={{ minWidth: '240px', width: 'max-content', maxWidth: '90vw' }}>
                <div className="px-3 pt-2 pb-1">
                  <input
                    type="text"
                    value={userSearchText}
                    onChange={e => setUserSearchText(e.target.value)}
                    placeholder="搜索成员、用户名或昵称..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-52 overflow-y-auto overflow-x-hidden">
                  <button
                    onClick={() => { setSelectedUserId(null); setShowUserDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                    style={{ color: selectedUserId === null ? '#1A56DB' : '#374151', fontWeight: selectedUserId === null ? 600 : 400 }}
                  >全部成员</button>
                  {memberSelectorUsers.filter((u: any) => {
                    if (!matchesUserSearch(u, userSearchText)) return false;
                    // 中侧（管理）必须显示全部 owner/admin，即使尚无订单，方便管理员先选人再创建首张订单。
                    if (adminOnly) return true;
                    // 其他分栏继续只显示已有主订单或参与订单的用户，避免列表被空成员淹没。
                    const hasOrders = memberSelectorOrders.some((o: any) => isOrderRelatedToMember(o, getMemberSelectorId(u)));
                    return hasOrders;
                  }).map((u: any) => {
                    const memberId = getMemberSelectorId(u);
                    const userOrders = memberSelectorOrders.filter((o: any) => isOrderRelatedToMember(o, memberId));
                    const activeCount = userOrders.filter((o: any) => o.status === 'active').length;
                    const settledCount = userOrders.filter((o: any) => o.status === 'settled' || o.status === 'cancelled').length;
                    return (
                    <button
                      key={memberId}
                      onClick={() => { setSelectedUserId(memberId); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                      style={{ color: Number(selectedUserId) === memberId ? '#1A56DB' : '#374151', fontWeight: Number(selectedUserId) === memberId ? 600 : 400 }}
                    >
                      <span className="whitespace-nowrap">{getUserSearchLabel(u)}</span>
                      <span className="text-xs ml-2 shrink-0" style={{ color: '#9CA3AF', fontWeight: 400 }}>
                        {activeCount > 0 && <span style={{ color: '#22C55E' }}>进行中 {activeCount}</span>}
                        {activeCount > 0 && settledCount > 0 && <span style={{ color: '#D1D5DB' }}> / </span>}
                        {settledCount > 0 && <span style={{ color: '#9CA3AF' }}>已结束 {settledCount}</span>}
                        {activeCount === 0 && settledCount === 0 && <span>暂无订单</span>}
                      </span>
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* 类型筛选框：全部 / 股票 / 数字币 / 期权 / 已结清 */}
          <select
            value={assetTypeFilter}
            onChange={e => setAssetTypeFilter(e.target.value as '' | 'stock' | 'crypto' | 'crypto_option' | 'settled')}
            className="shrink-0 px-2.5 py-2 rounded-full text-sm font-medium bg-white border border-gray-200 shadow-sm outline-none"
            style={{ color: assetTypeFilter ? '#1A56DB' : '#6B7280', minWidth: 72 }}
          >
            <option value="">全部</option>
            <option value="stock">股票</option>
            <option value="crypto">数字币</option>
            <option value="crypto_option">期权</option>
            <option value="settled">已结清</option>
          </select>
          {/* 添加订单按钮：借方模式下隐藏，统一在左侧资方Tab添加 */}
          {!financeOnly && (
          <button
            onClick={() => handleOpenCreate()}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
          >
            <Plus className="w-4 h-4" />
            添加订单
          </button>
          )}
        </div>
        )}

        {/* 订单列表 */}
        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            {adminOnly ? '统一订单台' : '订单列表'} {smartMatchedOrders ? `· ${smartMatchedOrders.length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !assetOrders || (assetOrders as any[]).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无订单</div>
            </div>
          ) : (() => {
            const filteredOrders = [...smartMatchedOrders].filter((o: any) => {
              if (!assetTypeFilter) return true;
              if (assetTypeFilter === 'settled') return o.status === 'settled';
              if (assetTypeFilter === 'stock') return o.asset_type === 'stock';
              if (assetTypeFilter === 'crypto') return o.asset_type === 'crypto' || !o.asset_type;
              if (assetTypeFilter === 'crypto_option') return o.asset_type === 'crypto_option';
              return true;
            }).sort((a: any, b: any) => {
              const aSettled = a.status === 'settled' || a.status === 'cancelled' ? 1 : 0;
              const bSettled = b.status === 'settled' || b.status === 'cancelled' ? 1 : 0;
              if (aSettled !== bSettled) return aSettled - bSettled;
              const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
              const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
              return bTime - aTime;
            });
            return filteredOrders.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
                <div className="text-gray-400 text-sm">{adminOnly && orderSearchText ? '未找到匹配的订单或关联订单组' : '暂无订单'}</div>
              </div>
            ) : (
            <div className="space-y-3">
              {filteredOrders.map((order: any) => {
                // 主拥有者自动加入协作组只是保存独立视图，不应被当作“受邀订单”而隐藏主单操作。
                const isInvited = !!order.participantInfo && String(order.participantInfo?.role || '') !== 'owner';
                return (
                  <FunderOrderCard
                    key={order._viewKey || order.id}
                    order={order}
                    livePrices={(assetOrdersData as any)?.livePrices ?? {}}
                    priceDirection={priceDirection}
                    currentUser={currentUser}
                    isAdmin={isAdminUser}
                    membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                    ledgerId={ledgerId}
                    showPaymentPanel={showPaymentPanel}
                    setShowPaymentPanel={setShowPaymentPanel}
                    paymentForm={paymentForm}
                    setPaymentForm={setPaymentForm}
                    editingPaymentId={editingPaymentId}
                    setEditingPaymentId={setEditingPaymentId}
                    showPaymentDatePicker={showPaymentDatePicker}
                    setShowPaymentDatePicker={setShowPaymentDatePicker}
                    addPaymentMutation={addPaymentMutation}
                    updatePaymentMutation={updatePaymentMutation}
                    deletePaymentMutation={deletePaymentMutation}
                    interestPayments={interestPayments as any[]}
                    updateMutation={updateMutation}
                    handleOpenEdit={handleOpenEdit}
                    handleDelete={handleDelete}
                    handleOpenParticipants={handleOpenParticipants}
                    showParticipantsPanel={showParticipantsPanel}
                    getPaymentLabel={getPaymentLabel}
                    isInvited={isInvited}
                    participantsList={participantsList}
                    setParticipantsList={setParticipantsList}
                    ledgerMembers={ledgerMembers}
                    participantsLoading={participantsLoading}
                    roleOptions={ROLE_OPTIONS}
                    handleAddParticipant={handleAddParticipant}
                    handleSaveParticipants={handleSaveParticipants}
                    saveParticipantsMutation={saveParticipantsMutation}
                    participantsEditMode={participantsEditMode}
                    setParticipantsEditMode={setParticipantsEditMode}
                    onConfirmSettle={(id) => {
                      setSettleInterestEndDate('');
                      setConfirmSettleId(id);
                    }}
                    showCollateralInfo={collateralInfoOrderId === order.id}
                    setShowCollateralInfo={(v) => setCollateralInfoOrderId(v ? order.id : null)}
                    showInterestTip={interestTipOrderId === order.id}
                    setShowInterestTip={(v) => setInterestTipOrderId(v ? order.id : null)}
                    showMarginInfo={marginInfoOrderId === order.id}
                    setShowMarginInfo={(v) => setMarginInfoOrderId(v ? order.id : null)}
                    allOrders={managementCardLookupOrders}
                  />
                );
              })}
            </div>
            );
          })()}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col overflow-x-hidden" style={{ overscrollBehavior: 'contain' }}>
            <div className="flex-shrink-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl" style={{ zIndex: 10 }}>
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {isSnapshotScopedEdit ? `配置 ${personalViewName} 的个人订单` : editingOrder ? '编辑订单' : '添加订单'}
              </h3>
              {editingOrder && canManageCollaboratorsInEditor && (
                <button
                  type="button"
                  onClick={() => {
                    setParticipantsSectionExpanded(true);
                    setTimeout(() => participantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                  }}
                  className="ml-auto mr-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                >
                  拥有者／参与者{participants.length > 0 ? ` ${participants.length}人` : ''}
                </button>
              )}
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingOrder(null);
                  setParticipants([]);
                  setSelectedParticipantUserIds([]);
                  setParticipantUserSearch('');
                  setParticipantsSectionExpanded(false);
                  resetLinkedAmountFields();
                  participantsLoadedRef.current = null;
                  setShowDatePicker(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-5" style={{ overscrollBehavior: 'contain' }}>
              {hasPrimaryOwnerDrawer && (
                <button
                  type="button"
                  onClick={() => setPrimaryOwnerEditorExpanded(expanded => !expanded)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-blue-950">第一位拥有者的订单内容</span>
                    <span className="mt-0.5 block truncate text-xs text-blue-700">{formData.ownerLabel || primaryOwnerDisplayName} · 单独保存后自动收起</span>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-blue-600 transition-transform ${primaryOwnerEditorExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}
              {(!hasPrimaryOwnerDrawer || primaryOwnerEditorExpanded) && (<>
              {/* 每位共同拥有者或历史参与者均编辑自己的完整订单快照；真实订单关系仍由主订单受控。 */}
              {isSnapshotScopedEdit && (
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <div className="text-sm font-medium text-blue-950">{personalViewName} 的完整个人订单视图</div>
                    <div className="mt-0.5 text-xs leading-5 text-blue-700">所有金额、利息、担保、展示方式与备注均在此处独立保存；共享标的、真实身份与结清状态保持一致。</div>
                  </div>
                </div>
              )}
              {isOwnerPersonalView && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-sm font-semibold text-slate-800">同组拥有者信息可见范围</label>
                  <p className="mt-1 text-xs leading-5 text-slate-500">此设置只影响 {personalViewName} 查看同组其他拥有者的信息范围；订单卡片固定显示本人姓名。</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([
                      { value: 'self', label: '仅本人金额' },
                      { value: 'total', label: '仅订单总额' },
                      { value: 'breakdown', label: '总额及明细' },
                      { value: 'partners', label: '指定合作人' },
                    ] as const).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData(current => ({ ...current, ownerVisibilityMode: option.value }))}
                        className={`rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${formData.ownerVisibilityMode === option.value ? 'border-slate-600 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {formData.ownerVisibilityMode === 'partners' && (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="mb-1.5 text-[11px] text-slate-500">选择可见的同组拥有者（不显示订单总额）</div>
                      <div className="flex flex-wrap gap-1.5">
                        {participants.filter(owner => owner.role === 'owner' && Number(owner.userId) !== Number(editingCollaboratorUserId)).map(owner => {
                          const active = formData.ownerVisibleOwnerIds.includes(Number(owner.userId));
                          return (
                            <button
                              key={owner.userId}
                              type="button"
                              onClick={() => setFormData(current => ({
                                ...current,
                                ownerVisibleOwnerIds: active
                                  ? current.ownerVisibleOwnerIds.filter(id => id !== Number(owner.userId))
                                  : [...current.ownerVisibleOwnerIds, Number(owner.userId)],
                              }))}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                            >
                              {owner.userName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* 标的类型必须与主订单一致；参与者可以完整配置自己的业务展示，但不能把同一张主订单改成另一种实际标的。 */}
              {isSnapshotScopedEdit ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5">
                  <div className="text-xs font-semibold text-blue-800">共享订单标的</div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-blue-950">{formData.assetType === 'stock' ? '股票' : formData.assetType === 'crypto_option' ? '期权' : '数字币'}</span>
                    <span className="text-right text-[11px] leading-4 text-blue-700">币种、类型与期权合约由主订单统一维护</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-3">
                  <div className={(formData.assetType === 'crypto' || formData.assetType === '') ? 'col-span-3' : 'col-span-5'}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">类型</label>
                    <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                      {([{ value: 'stock', label: '股票' }, { value: 'crypto', label: '数字币' }, { value: 'crypto_option', label: '期权' }] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            if (editingOrder && !editingOrder.participantInfo) {
                              toast.error('\u5df2\u521b\u5efa\u8ba2\u5355\u7684\u8d44\u4ea7\u7c7b\u578b\u4e0d\u53ef\u4fee\u6539');
                              return;
                            }
                            const newType = formData.assetType === opt.value ? '' : opt.value;
                            setFormData(d => ({ ...d, assetType: newType }));
                            if (newType === 'crypto_option') {
                              setOptionFormData(d => ({ ...d, optionCurrency: formData.coin }));
                            }
                          }}
                          className="flex-1 min-w-0 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-all last:border-r-0"
                          style={formData.assetType === opt.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(formData.assetType === 'crypto' || formData.assetType === '') && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">方向</label>
                      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                        <button
                          type="button"
                          onClick={() => setFormData(d => ({ ...d, tradeDirection: d.tradeDirection === 'long' ? null : 'long' }))}
                          className="flex-1 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-all"
                          style={formData.tradeDirection === 'long'
                            ? { background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff', borderColor: 'transparent' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                        >
                          做多
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(d => ({ ...d, tradeDirection: d.tradeDirection === 'short' ? null : 'short' }))}
                          className="flex-1 px-1 py-1.5 text-xs font-semibold transition-all"
                          style={formData.tradeDirection === 'short'
                            ? { background: 'linear-gradient(135deg, #DC2626, #EF4444)', color: '#fff', borderColor: 'transparent' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                        >
                          做空
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 成交状态 + 归属分类 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">成交状态</label>
                  <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                    {([{ value: 'filled', label: '已成交' }, { value: 'pending', label: '挂单中' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(d => ({ ...d, orderFillStatus: opt.value }))}
                        className="flex-1 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-colors last:border-r-0"
                        style={formData.orderFillStatus === opt.value
                          ? opt.value === 'filled'
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                            : { background: 'linear-gradient(135deg, #EA580C, #F97316)', color: '#fff', borderColor: 'transparent' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">归属分类</label>
                  <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                    {([{ value: 'self', label: '本人' }, { value: 'other', label: '他人' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(d => ({ ...d, orderPerspective: opt.value }))}
                        className="flex-1 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-colors last:border-r-0"
                        style={formData.orderPerspective === opt.value
                          ? opt.value === 'self'
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                            : { background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', color: '#fff', borderColor: 'transparent' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 52号账本：资金属性 + 左上角展示 */}
              {ledgerId === 52 && (() => {
                const selectedFundingType = displayConfig.assetFundingType === 'self' || displayConfig.assetFundingType === 'financing'
                  ? displayConfig.assetFundingType
                  : displayConfig.selfFundedAsset ? 'self' : 'financing';
                const fundingOptions = [
                  { value: 'self', label: '自', active: { background: 'linear-gradient(135deg, #047857, #10B981)', color: '#fff', borderColor: 'transparent' } },
                  { value: 'financing', label: '融', active: { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' } },
                ] as const;
                const explicitPrimaryDisplay = displayConfig.primaryAssetDisplay === 'financing' || displayConfig.primaryAssetDisplay === 'quantity'
                  ? displayConfig.primaryAssetDisplay
                  : null;
                // 未明确选择的新字段时，严格沿用旧订单的主展示：借出本金/CNY 默认显示金额，
                // 其余数字币默认显示数量。管理员选过后才写入新的独立展示偏好。
                const legacyPrimaryDisplay = displayConfig.principalLentOutPrimary === 'quantity'
                  ? 'quantity'
                  : displayConfig.principalLentOutPrimary === 'principal'
                    ? 'financing'
                    : (formData.principalLentOut || formData.amountCurrency === 'CNY' ? 'financing' : 'quantity');
                const selectedPrimaryDisplay = explicitPrimaryDisplay ?? legacyPrimaryDisplay;
                const showPrimaryDisplay = formData.assetType !== 'stock';
                return (
                  <div className={`grid gap-3 ${showPrimaryDisplay ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">资金属性</label>
                      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                        {fundingOptions.map(option => {
                          const isSelected = selectedFundingType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDisplayConfig(config => ({
                                ...config,
                                assetFundingType: option.value,
                                selfFundedAsset: option.value === 'self',
                              }))}
                              className="flex-1 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-colors last:border-r-0"
                              style={isSelected
                                ? option.active
                                : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                              aria-pressed={isSelected}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {showPrimaryDisplay && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">左上角展示</label>
                        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                          {([
                            { value: 'financing', label: amountDisplayLabel },
                            { value: 'quantity', label: formData.assetType === 'crypto_option' ? '合约张数' : '币种数量' },
                          ] as const).map(({ value, label }) => {
                            const active = selectedPrimaryDisplay === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setDisplayConfig(config => ({ ...config, primaryAssetDisplay: value }))}
                                className="flex-1 border-r border-gray-200 px-1 py-1.5 text-xs font-semibold transition-colors last:border-r-0"
                                style={active
                                  ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                                  : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 自定义标签 */}
              {(
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">标签<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，可添加多个</span></label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: '#E8F0FE', color: '#1A56DB' }}>
                        {tag}
                        <button type="button" onClick={() => setFormData(d => ({ ...d, tags: d.tags.filter((_, i) => i !== idx) }))} className="text-blue-400 hover:text-red-500 text-sm leading-none">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault();
                          if (!formData.tags.includes(tagInput.trim())) {
                            setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                          }
                          setTagInput('');
                        }
                      }}
                      placeholder="输入标签名称，按回车添加"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
                          setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                        }
                        setTagInput('');
                      }}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                      style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                    >
                      添加
                    </button>
                  </div>
                </div>
              )}

              {/* 用户选择（从账本所有成员中选）：根据所选用户角色自动判断订单归属左侧(资方)或右侧(借方) */}
              <div className="flex gap-3 items-start">
              {isSnapshotScopedEdit ? (
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-600 mb-2">个人订单对象</label>
                  <div className="flex min-h-[48px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-xs font-bold text-emerald-700">{String((editingOrder as any)?.participant_name || (editingOrder as any)?.owner_label || '?').slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-emerald-900">{(editingOrder as any)?.participant_name || (editingOrder as any)?.owner_label || '当前协作人'}</div>
                      <div className="text-[11px] text-emerald-700">身份与主订单关系由管理员统一维护</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    订单拥有者 <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <div className="relative">
                    {formData.userId > 0 ? (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-50 cursor-pointer"
                        onClick={() => { setFormUserDropdown(true); setFormUserSearch(''); }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                        >
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const m = allMembers.find((m: any) => m.userId === formData.userId);
                            return getUserDisplayName(m, '?')[0].toUpperCase();
                          })()}
                        </div>
                        <span className="text-sm font-medium flex-1" style={{ color: '#1A2340' }}>
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const m = allMembers.find((m: any) => m.userId === formData.userId);
                            return getUserDisplayName(m, `用户${formData.userId}`);
                          })()}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setFormData(d => ({ ...d, userId: 0 })); setFormUserSearch(''); }}
                          className="text-gray-400 hover:text-gray-600 text-base leading-none px-1"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formUserSearch}
                        onChange={e => { setFormUserSearch(e.target.value); setFormUserDropdown(true); }}
                        onFocus={() => setFormUserDropdown(true)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="搜索或选择用户..."
                        style={{ display: 'block', boxSizing: 'border-box' }}
                      />
                    )}
                    {formUserDropdown && formData.userId === 0 && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setFormUserDropdown(false)}
                        />
                        <div
                          className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
                          style={{ maxHeight: 200, overflowY: 'auto' }}
                        >
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const filtered = allMembers.filter((m: any) => {
                              if (!formUserSearch) return true;
                              return matchesUserSearch(m, formUserSearch);
                            });
                            if (filtered.length === 0) {
                              return <div className="px-4 py-3 text-sm text-gray-400 text-center">无匹配用户</div>;
                            }
                            return filtered.map((m: any) => (
                              <button
                                key={m.userId}
                                onClick={() => { setFormData(d => ({ ...d, userId: m.userId })); setFormUserSearch(getUserDisplayName(m)); setFormUserDropdown(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                              >
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                                >
                                  {getUserDisplayName(m, '?')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate" style={{ color: '#1A2340' }}>
                                    {getUserSearchLabel(m)}
                                  </div>
                                  <div className="text-xs text-gray-400">{m.role}</div>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {formData.assetType !== 'crypto_option' && (
                <>
                {/* 开仓日期（与用户同行并排） */}
                <div className="flex-1 min-w-0" style={{}}>
                  <label className="block text-sm font-medium text-gray-600 mb-2">开仓日期</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(v => !v)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                      style={{ backgroundColor: '#fff', color: formData.buyDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                    >
                      {formData.buyDate || '点击选择日期'}
                    </button>
                    {showDatePicker && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-2">
                        <DatePicker
                          value={formData.buyDate}
                          onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowDatePicker(false); }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                </>
              )}
              </div>
              {/* 购买币种已移至三联最后一行（与币数并排） */}

              {/* 非期权订单：金额 / 买入价格 / 购买币种+币数三字段联动 */}
              {formData.assetType !== 'crypto_option' && (
              <div className="space-y-3">
                <span className="block text-xs text-gray-400">
                  最后手动输入的两项保持不变，第三项显示“≈ 自动推算”
                </span>
                {/* 融资金额 + 融资币种（同行并排） */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">{amountDisplayLabel}{derivedLinkedField === 'amount' && <span className="font-normal text-orange-500">≈ 自动推算</span>}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amountInputValue}
                      onChange={e => { setAmountInputValue(e.target.value); handleLinkedAmountInput('amount', e.target.value); }}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 ${derivedLinkedField === 'amount' ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200'}`}
                      placeholder="如：100000"
                    />
                  </div>
                  <div style={{ width: '34%' }}>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">融资币种</label>
                    <select
                      value={formData.amountCurrency}
                      onChange={e => handleAmountCurrencyChange(e.target.value as CoinType)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                      style={{ backgroundColor: '#fff', color: COIN_COLORS[formData.amountCurrency as keyof typeof COIN_COLORS] || '#1A2340' }}
                    >
                      {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                        <option key={c} value={c}>{c === 'CNY' ? '人民币 CNY' : c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {amountInputValue && parseFloat(amountInputValue) > 0 && formData.amountCurrency !== 'USDT' && (() => {
                  const amt = parseFloat(amountInputValue);
                  const usdtEquiv = toUsdtBase(amt, formData.amountCurrency);
                  if (usdtEquiv === null) return null;
                  return (
                    <span className="text-xs text-gray-400 -mt-1 block">
                      ≈ {usdtEquiv.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT
                    </span>
                  );
                })()}
                {/* 股票专属：证券公司 + 证券账号 */}
                {formData.assetType === 'stock' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">证券公司</label>
                      <input
                        type="text"
                        value={formData.brokerName}
                        onChange={e => setFormData(d => ({ ...d, brokerName: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="如：中信证券"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">证券账号</label>
                      <input
                        type="text"
                        value={formData.brokerAccount}
                        onChange={e => setFormData(d => ({ ...d, brokerAccount: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="如：6225xxxx"
                      />
                    </div>
                  </>
                )}
                {/* 买入价格 */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">买入价格（{formData.amountCurrency}/{formData.coin}）{derivedLinkedField === 'price' && <span className="font-normal text-orange-500">≈ 自动推算</span>}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyPrice}
                    onChange={e => { setFormData(d => ({ ...d, buyPrice: e.target.value })); handleLinkedAmountInput('price', e.target.value); }}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:text-gray-300 ${derivedLinkedField === 'price' ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200'}`}
                    placeholder="如：95000"
                    step="any"
                  />
                </div>
                {/* 购买币种 + 币数（同行并排） */}
                <div className="flex items-end gap-3">
                  <div style={{ width: '40%' }}>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">购买币种</label>
                    <select
                      value={formData.coin}
                      onChange={e => handlePurchaseCoinChange(e.target.value as CoinType)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                      style={{ backgroundColor: '#fff', color: COIN_COLORS[formData.coin as keyof typeof COIN_COLORS] || '#1A2340' }}
                    >
                      {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">币数（{formData.coin}）{derivedLinkedField === 'quantity' && <span className="font-normal text-orange-500">≈ 自动推算</span>}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.buyQuantity}
                      onChange={e => { setFormData(d => ({ ...d, buyQuantity: e.target.value })); handleLinkedAmountInput('quantity', e.target.value); }}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:text-gray-300 ${derivedLinkedField === 'quantity' ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200'}`}
                      placeholder="如：1.05"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* 期权专属字段（在隐藏 div 外面，期权类型时正常显示） */}
              {formData.assetType === 'crypto_option' && (
                <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-xs font-semibold text-purple-600">期权参数</div>
                    <div className="text-[11px] text-purple-500">总投入自动计算</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">开仓日期</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(v => !v)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                        style={{ color: formData.buyDate ? '#1A2340' : '#9CA3AF' }}
                      >
                        {formData.buyDate || '点击选择日期'}
                      </button>
                      {showDatePicker && (
                        <div className="absolute top-full left-0 right-0 z-30 mt-2">
                          <DatePicker
                            value={formData.buyDate}
                            onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowDatePicker(false); }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 标的币种 + 方向 */}
                  <div className="flex gap-2">
                    <div style={{ width: '40%' }}>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">标的币种</label>
                      <select
                        value={optionFormData.optionCurrency}
                        onChange={e => handlePurchaseCoinChange(e.target.value as CoinType)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none bg-white"
                      >
                        {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                          <option key={c} value={c}>{c === 'CNY' ? '人民币 CNY' : c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">方向</label>
                      <select
                        value={optionFormData.direction}
                        onChange={e => setOptionFormData(d => ({ ...d, direction: e.target.value as 'long_call' | 'long_put' | 'short_call' | 'short_put' }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none bg-white"
                      >
                        <option value="long_call">买入看涨（Long Call）</option>
                        <option value="long_put">买入看跌（Long Put）</option>
                        <option value="short_call">卖出看涨（Short Call）</option>
                        <option value="short_put">卖出看跌（Short Put）</option>
                      </select>
                    </div>
                  </div>
                  {/* 到期日（下拉选择） */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      到期日
                      {expiriesLoading && <span className="ml-1 text-purple-400">加载中...</span>}
                    </label>
                    {supportsDeribitOptionData ? (
                      <select
                        value={optionFormData.deribitLabel}
                        onChange={e => {
                          const selected = expiries.find(ex => ex.deribitLabel === e.target.value);
                          let isoDate = '';
                          if (selected) {
                            const d = new Date(selected.ts);
                            isoDate = d.toISOString().slice(0, 10);
                          }
                          setOptionFormData(prev => ({
                            ...prev,
                            deribitLabel: e.target.value,
                            exerciseDate: isoDate,
                            strikePrice: '',
                          }));
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none bg-white"
                      >
                        <option value="">请选择到期日</option>
                        {expiries.map(ex => (
                          <option key={ex.deribitLabel} value={ex.deribitLabel}>
                            {ex.dateStr || ex.deribitLabel}（{ex.diffDays > 0 ? `余${ex.diffDays}天` : '即将到期'}）
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={optionFormData.exerciseDate}
                        onChange={e => setOptionFormData(prev => ({ ...prev, exerciseDate: e.target.value, deribitLabel: '' }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                      />
                    )}
                  </div>
                  {/* 行权价（下拉选择，选完到期日后才展示） + 权利金 */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        行权价（USD）
                        {strikesLoading && <span className="ml-1 text-purple-400">加载中...</span>}
                      </label>
                      {supportsDeribitOptionData ? (
                        optionFormData.deribitLabel ? (
                          <select
                            value={optionFormData.strikePrice}
                            onChange={e => setOptionFormData(d => ({ ...d, strikePrice: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none bg-white"
                          >
                            <option value="">请选择行权价</option>
                            {strikes.map(s => (
                              <option key={s} value={String(s)}>{s.toLocaleString()}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-400 bg-gray-50">
                            请先选择到期日
                          </div>
                        )
                      ) : (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={optionFormData.strikePrice}
                          onChange={e => setOptionFormData(d => ({ ...d, strikePrice: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                          placeholder="请输入行权价"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        权利金（{optionFormData.premiumDenomination}）
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={['BTC', 'ETH', 'SOL'].includes(optionFormData.premiumDenomination) ? '0.0001' : '0.01'}
                        value={optionFormData.premium}
                        onChange={e => setOptionFormData(d => ({ ...d, premium: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                        placeholder={optionFormData.premiumDenomination === 'USDT' ? '如：500' : optionFormData.premiumDenomination === 'BTC' ? '如：0.005' : '如：0.05'}
                      />
                    </div>
                  </div>
                  {/* 权利金计价 + 张数 */}
                  <div className="flex gap-2">
                    <div style={{ width: '40%' }}>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">权利金计价</label>
                      <select
                        value={optionFormData.premiumDenomination}
                        onChange={e => setOptionFormData(prev => ({ ...prev, premiumDenomination: e.target.value as CoinType }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none bg-white"
                      >
                        {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                          <option key={c} value={c}>{c === 'CNY' ? '人民币 CNY' : c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">数量</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={optionFormData.buyQty}
                        onChange={e => setOptionFormData(d => ({ ...d, buyQty: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                        placeholder="如：1"
                      />
                    </div>
                  </div>
                  {(() => {
                    const summary = getOptionPremiumSummary();
                    if (summary.totalInDenomination <= 0) return null;
                    const digits = ['BTC', 'ETH', 'SOL'].includes(summary.denomination) ? 4 : 2;
                    return (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-white/80 px-3 py-2 text-xs">
                        <span className="font-medium text-purple-600">总权利金</span>
                        <span className="text-right font-semibold text-purple-800 tabular-nums">
                          {summary.totalInDenomination.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} {summary.denomination}
                          {summary.denomination !== 'USDT' && summary.totalUsdt !== null && (
                            <span className="ml-1 font-normal text-purple-500">≈ {summary.totalUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 分隔线：利息约定 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">利息约定</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 计息基数 */}
              <div style={{}}>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  计息基数
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息计算的本金基数</span>
                </label>
                <div className="flex gap-2 w-full min-w-0">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'USDT', interestRateCurrency: 'USDT' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'USDT'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >USDT</button>
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'CNY', interestRateCurrency: 'CNY' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'CNY'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >人民币</button>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestBase}
                    onChange={e => { interestBaseTouchedRef.current = true; setFormData(d => ({ ...d, interestBase: e.target.value })); }}
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder={formData.interestBaseCurrency === 'CNY' ? '如：800000' : '如：120000'}
                    style={{ display: 'block', boxSizing: 'border-box', width: '0' }}
                  />
                </div>
              </div>

              {/* 历史参与者专属：佣金配置区 */}
              {isRestrictedParticipantEdit && (
                <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <div className="text-sm font-semibold text-green-800 mb-1">佣金配置</div>
                  {/* 佣金率 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">佣金率（%/年）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={formData.commissionRate ?? ''}
                        onChange={e => setFormData(d => ({ ...d, commissionRate: e.target.value }))}
                        className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                        placeholder="如：1"
                        style={{ display: 'block', boxSizing: 'border-box' }}
                      />
                      <span className="text-base font-medium text-gray-500 shrink-0">% / 年</span>
                    </div>
                  </div>
                  {/* 计佣基数 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      计佣基数（USDT）
                      <span className="text-xs text-gray-400 ml-1">默认=计息基数</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.commissionBase ?? ''}
                      onChange={e => setFormData(d => ({ ...d, commissionBase: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                      placeholder={formData.interestBase ? `默认：${formData.interestBase}` : '默认=计息基数'}
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* 计佣开始日期 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      计佣开始日期
                      <span className="text-xs text-gray-400 ml-1">默认=计息开始日</span>
                    </label>
                    <input
                      type="date"
                      value={formData.commissionStartDate ?? ''}
                      onChange={e => setFormData(d => ({ ...d, commissionStartDate: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              {/* 计息开始日期 */}
              <div style={{}}>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  计息开始日期
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息从此日开始累计</span>
                </label>
                <button
                  onClick={() => setShowInterestDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.interestStartDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.interestStartDate || '点击选择开始日期'}
                </button>
                {showInterestDatePicker && (
                  <div className="mt-2">
                    <DatePicker
                      value={formData.interestStartDate}
                      onChange={v => { setFormData(d => ({ ...d, interestStartDate: v })); setShowInterestDatePicker(false); }}
                    />
                  </div>
                )}
              </div>

              {/* 约定年化利息 */}
              <div style={{}}>
                <label className="block text-sm font-medium text-gray-600 mb-2">约定年化利息（%）</label>
                {/* 收（红圈+）/ 付（绿圈-） 与利率输入同行 */}
                <div className="flex items-center gap-2">
                  {(() => { const isNeg = formData.interestRateAnnual.startsWith('-'); return (
                  <>
                    <button
                      type="button"
                      title="收"
                      onClick={() => { const raw = normalizeFunderAnnualRate(formData.interestRateAnnual); const absVal = raw.startsWith('-') ? raw.slice(1) : raw; setFormData(d => ({ ...d, interestRateAnnual: absVal })); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-all"
                      style={!isNeg
                        ? { background: '#FEE2E2', color: '#DC2626', border: '2px solid #DC2626' }
                        : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                    >+</button>
                    <button
                      type="button"
                      title="付"
                      onClick={() => { const raw = normalizeFunderAnnualRate(formData.interestRateAnnual); const absVal = raw.startsWith('-') ? raw.slice(1) : raw; setFormData(d => ({ ...d, interestRateAnnual: '-' + absVal })); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-all"
                      style={isNeg
                        ? { background: '#DEF7EC', color: '#059669', border: '2px solid #059669' }
                        : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                    >−</button>
                  </>
                  ); })()}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.interestRateAnnual.startsWith('-') ? formData.interestRateAnnual.slice(1) : formData.interestRateAnnual}
                    onChange={e => {
                      const val = limitFunderAnnualRateInput(e.target.value);
                      if (val === null) return;
                      const isNeg = formData.interestRateAnnual.startsWith('-');
                      setFormData(d => ({ ...d, interestRateAnnual: isNeg ? ('-' + val) : val }));
                    }}
                    onBlur={() => setFormData(d => ({ ...d, interestRateAnnual: normalizeFunderAnnualRate(d.interestRateAnnual) }))}
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="如：8.5"
                    style={{ display: 'block', boxSizing: 'border-box' }}
                  />
                  <span className="text-base font-medium text-gray-500 shrink-0">% / 年</span>
                </div>
                {/* 利息计价货币选择 */}
                <div className="flex gap-2 mt-2">
                  {(['USDT', 'CNY'] as const).map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestRateCurrency: cur }))}
                      className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                      style={
                        formData.interestRateCurrency === cur
                          ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {cur === 'USDT' ? 'U（USDT）' : '人民币（元）'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 利息支付方式 */}
              <div style={{}}>
                <label className="block text-sm font-medium text-gray-600 mb-2">利息支付方式</label>
                <select
                  value={formData.interestPaymentType}
                  onChange={e => setFormData(d => ({ ...d, interestPaymentType: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                  style={{ backgroundColor: '#fff', color: formData.interestPaymentType ? '#1A2340' : '#9CA3AF' }}
                >
                  <option value="">请选择支付方式</option>
                  {INTEREST_PAYMENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 担保货币分隔线：历史参与者使用自己的独立担保物，不继承订单拥有者。 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: isRestrictedParticipantEdit ? '#A7F3D0' : collateralShareMode === 'self' ? '#FECACA' : '#F3F4F6' }} />
                <span className="text-xs shrink-0" style={{ color: isRestrictedParticipantEdit ? '#047857' : collateralShareMode === 'self' ? '#DC2626' : '#9CA3AF', fontWeight: isRestrictedParticipantEdit || collateralShareMode === 'self' ? 600 : 400 }}>
                  {isRestrictedParticipantEdit ? '参与者独立担保' : collateralShareMode === 'self' ? '共享担保' : '担保货币'}
                </span>
                <div className="flex-1 h-px" style={{ background: isRestrictedParticipantEdit ? '#A7F3D0' : collateralShareMode === 'self' ? '#FECACA' : '#F3F4F6' }} />
              </div>
              {isRestrictedParticipantEdit && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                  这里添加或修改的是当前参与者自己的担保物，不会改变订单拥有者或其他参与者的担保物。
                </div>
              )}

              {/* 52号可同时保留手工与钱包担保；37号标签仍为股票订单的独立引用项。 */}
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => { setCollateralSourceMode('manual'); setCollateralSource(null); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    collateralSourceMode === 'manual'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >手工担保物</button>
                {ledgerId === 52 && (
                  <button
                    type="button"
                  onClick={() => { setCollateralSourceMode('wallet'); setCollateralSource(null); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      collateralSourceMode === 'wallet'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >钱包担保物</button>
                )}
                {formData.assetType === 'stock' && (
                <button
                  type="button"
                  onClick={() => setCollateralSourceMode('external')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    collateralSourceMode === 'external'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >调用37号数据</button>
                )}
              </div>

              {ledgerId === 52 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="text-xs font-semibold text-slate-600">当前担保汇总（两类担保均计入总值）</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {collateralAssets.filter((asset) => !isWalletCollateralAsset(asset) && asset.coin && asset.qty !== '').map((asset, index) => (
                      <span key={`manual-${index}`} className="rounded-md bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">手工 · {asset.qty} {asset.coin}</span>
                    ))}
                    {collateralAssets.filter((asset) => isWalletCollateralAsset(asset) && asset.coin && asset.qty !== '').map((asset, index) => (
                      <span key={`wallet-${index}`} className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">钱包冻结 · {asset.qty} {asset.coin}</span>
                    ))}
                    {collateralAssets.filter((asset) => asset.coin && asset.qty !== '').length === 0 && (
                      <span className="text-[11px] text-slate-400">暂无担保物</span>
                    )}
                  </div>
                </div>
              )}

              {/* 股票订单：盈亏、担保物、利息标签分别选择，互不强制联动。 */}
              {formData.assetType === 'stock' && collateralSourceMode === 'external' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
                <div className="rounded-lg border border-blue-100 bg-white/70 px-2.5 py-2 text-[11px] leading-4 text-blue-600">
                  下拉列表会分别标注“利息已暂停”和“保证金查询已暂停”；两者是37号账本的独立状态，暂停后既有盈亏、担保和利息数据仍可引用。
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600">盈亏标签（37号账本）</div>
                  <select
                    value={collateralSource?.floatingPnlTagName || ''}
                    onChange={e => {
                      const tag = e.target.value;
                      setStockPnlSourceMode(tag ? 'reference37' : 'none');
                      setCollateralSource(prev => {
                        if (!tag) return prev ? { ...prev, floatingPnlTagName: '', useFloatingPnl: false } : prev;
                        const collateralTagName = prev?.collateralTagName || '';
                        return {
                          ledgerId: 37,
                          tagName: collateralTagName || tag,
                          floatingPnlTagName: tag,
                          collateralTagName,
                          useFloatingPnl: true,
                          useCollateral: !!collateralTagName,
                        };
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                  >
                    <option value="">不读取37号浮动盈亏</option>
                    {(activeMarginTags as any[])?.map((t: any) => (
                      <option key={t.tagName} value={t.tagName}>{get37ReferenceTagLabel(t)}</option>
                    ))}
                  </select>
                  {collateralSource?.floatingPnlTagName && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs font-medium text-blue-600">浮动盈亏计算口径</div>
                      <select
                        value={collateralSource.floatingPnlCalculationMode || 'raw_net_pnl'}
                        onChange={e => {
                          const mode = e.target.value === 'leveraged_net_pnl'
                            ? 'leveraged_net_pnl'
                            : 'raw_net_pnl';
                          setCollateralSource(prev => prev ? { ...prev, floatingPnlCalculationMode: mode } : prev);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                      >
                        <option value="raw_net_pnl">今日最新余额 − 初始金额（默认）</option>
                        <option value="leveraged_net_pnl">37号净值盈亏（含账号倍率）</option>
                      </select>
                      <div className="text-[11px] leading-4 text-blue-500">
                        {collateralSource.floatingPnlCalculationMode === 'leveraged_net_pnl'
                          ? '与37号页面“净值盈亏”后的数字一致： （今日最新余额 − 初始金额）× 账号倍率。'
                          : '今日最新余额 − 初始金额，不使用账号倍率；余额低于初始金额时为负数，表示亏损。未选择口径的历史订单也按此默认值显示。'}
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] text-blue-500">仅影响股票浮动盈亏和担保缺口中的浮盈项，不会自动引用保证金。</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600">数据标签 / 担保标签（37号账本）</div>
                  <select
                    value={collateralSource?.collateralTagName || ''}
                    onChange={e => {
                      const tag = e.target.value;
                      setCollateralSource(prev => {
                        if (!tag) return prev ? { ...prev, collateralTagName: '', useCollateral: false } : prev;
                        const floatingPnlTagName = prev?.floatingPnlTagName || '';
                        return {
                          ledgerId: 37,
                          tagName: floatingPnlTagName || tag,
                          floatingPnlTagName,
                          collateralTagName: tag,
                          useFloatingPnl: !!floatingPnlTagName,
                          useCollateral: true,
                        };
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                  >
                    <option value="">不引用37号担保货币（下方手工录入）</option>
                    {(activeMarginTags as any[])?.map((t: any) => (
                      <option key={t.tagName} value={t.tagName}>{get37ReferenceTagLabel(t)}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-blue-500">可与盈亏标签不同；未选择时，下方手工担保货币区域可直接使用。</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600">保证金率标签（37号账本）</div>
                  <select
                    value={collateralSource?.marginRateTagName || ''}
                    onChange={e => {
                      const tag = e.target.value;
                      setCollateralSource(prev => {
                        if (!tag) return prev ? { ...prev, marginRateTagName: '', useMarginRate: false } : prev;
                        if (prev) return { ...prev, marginRateTagName: tag, useMarginRate: true };
                        return {
                          ledgerId: 37,
                          tagName: tag,
                          floatingPnlTagName: '',
                          collateralTagName: '',
                          marginRateTagName: tag,
                          useFloatingPnl: false,
                          useCollateral: false,
                          useMarginRate: true,
                        };
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                  >
                    <option value="">不引用37号保证金率</option>
                    {(activeMarginTags as any[])?.map((t: any) => (
                      <option key={t.tagName} value={t.tagName}>{get37ReferenceTagLabel(t)}</option>
                    ))}
                  </select>
                  <div className="text-[11px] leading-4 text-blue-500">选中后，打开“保证金率”将直接显示该标签的“剩余保证金占基数比”；不选则继续按52号订单自身的担保缺口口径计算。</div>
                </div>
                <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                  <div className="text-xs font-semibold text-blue-700">利息引用（37号账本，可分别选择）</div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-blue-600">待结利息引用</div>
                    <select
                      value={pendingInterestTagName}
                      onChange={e => {
                        const tag = e.target.value;
                        setPendingInterestTagName(tag);
                        if (tag) setCollateralSource(prev => prev || {
                          ledgerId: 37, tagName: tag, floatingPnlTagName: '', collateralTagName: '', useFloatingPnl: false, useCollateral: false,
                        });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                    >
                      <option value="">不引用（按52号账本自动计算）</option>
                      {(activeMarginTags as any[])?.map((t: any) => (
                        <option key={t.tagName} value={t.tagName}>{get37ReferenceTagLabel(t)}</option>
                      ))}
                    </select>
                    <div className="text-[11px] leading-4 text-blue-500">引用37号的自动计息与“手工加息”合计；不扣除已付金额，因此不会误把“欠息/上欠”当作待结。</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-blue-600">已结利息引用</div>
                    <select
                      value={paidInterestTagName}
                      onChange={e => {
                        const tag = e.target.value;
                        setPaidInterestTagName(tag);
                        if (tag) setCollateralSource(prev => prev || {
                          ledgerId: 37, tagName: tag, floatingPnlTagName: '', collateralTagName: '', useFloatingPnl: false, useCollateral: false,
                        });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                    >
                      <option value="">不引用（保留52号手工结息）</option>
                      {(activeMarginTags as any[])?.map((t: any) => (
                        <option key={t.tagName} value={t.tagName}>{get37ReferenceTagLabel(t)}</option>
                      ))}
                    </select>
                    <div className="text-[11px] leading-4 text-blue-500">只读取37号标签中“计入已付”的手工减息累计；选中后，订单页尾的52号手工记录结息会锁定。</div>
                  </div>
                </div>
                {(collateralSource?.floatingPnlTagName || collateralSource?.collateralTagName || collateralSource?.marginRateTagName || pendingInterestTagName || paidInterestTagName) && (
                  <div className="text-xs text-blue-500 pt-0.5 leading-5">
                    {collateralSource?.floatingPnlTagName && <span>盈亏：{collateralSource.floatingPnlTagName}</span>}
                    {collateralSource?.floatingPnlTagName && (collateralSource?.collateralTagName || collateralSource?.marginRateTagName || pendingInterestTagName || paidInterestTagName) && <span className="mx-1.5 text-blue-300">·</span>}
                    {collateralSource?.collateralTagName && <span>担保：{collateralSource.collateralTagName}</span>}
                    {collateralSource?.collateralTagName && (collateralSource?.marginRateTagName || pendingInterestTagName || paidInterestTagName) && <span className="mx-1.5 text-blue-300">·</span>}
                    {collateralSource?.marginRateTagName && <span>保证金率：{collateralSource.marginRateTagName}</span>}
                    {collateralSource?.marginRateTagName && (pendingInterestTagName || paidInterestTagName) && <span className="mx-1.5 text-blue-300">·</span>}
                    {pendingInterestTagName && <span>待结：{pendingInterestTagName}</span>}
                    {pendingInterestTagName && paidInterestTagName && <span className="mx-1.5 text-blue-300">·</span>}
                    {paidInterestTagName && <span>已结：{paidInterestTagName}</span>}
                  </div>
                )}
                {editingOrder?.id && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-2.5 py-2">
                    <span className="text-[11px] leading-4 text-blue-600">标签修改可直接保存，不必滚到页尾。</span>
                    <button
                      type="button"
                      onClick={saveLinkedInterestSource}
                      disabled={!linkedInterestSourceDraft || saveLinkedInterestSourceMutation.isPending || saveParticipantLinkedInterestSourceMutation.isPending}
                      className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saveLinkedInterestSourceMutation.isPending || saveParticipantLinkedInterestSourceMutation.isPending ? '保存中…' : '保存37号引用'}
                    </button>
                  </div>
                )}
              </div>
              )}

              {formData.assetType === 'stock' && (
                <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-violet-800">股票浮动盈亏来源</div>
                    <p className="mt-1 text-[11px] leading-4 text-violet-600">三选一：不引用、37号账本标签，或管理员录入股票组合。52号手工组合在开盘交易时段每 5 分钟刷新，15:05 固化盘尾价。</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'none', label: '不引用' },
                      { value: 'reference37', label: '37号标签' },
                      { value: 'manual_positions', label: '手工股票' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setStockPnlSourceMode(value);
                          if (value === 'none') {
                            setCollateralSource(prev => prev ? { ...prev, floatingPnlTagName: '', useFloatingPnl: false } : prev);
                          }
                          if (value === 'manual_positions') {
                            setCollateralSource(prev => prev ? { ...prev, floatingPnlTagName: '', useFloatingPnl: false } : prev);
                            if (manualStockPositions.length === 0) setManualStockPositions([{ name: '', symbol: '', buyPrice: '', sellPrice: '', quantity: '', latestPrice: '', latestPriceDate: '', latestPriceUpdatedAt: '' }]);
                          }
                        }}
                        className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                          stockPnlSourceMode === value
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-violet-200 bg-white text-violet-700'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                  {stockPnlSourceMode !== 'manual_positions' && manualStockPositions.length > 0 && (
                    <div className="rounded-lg border border-dashed border-violet-200 bg-white/80 px-2.5 py-2 text-[11px] leading-4 text-violet-700">
                      已保留 {manualStockPositions.length} 只手工股票及全部计算参数；当前仅切换浮盈来源，不会删除，切回“手工股票”即可继续查看和编辑。
                    </div>
                  )}
                  {stockPnlSourceMode === 'reference37' && !collateralSource?.floatingPnlTagName && (
                    <div className="rounded-lg border border-dashed border-violet-300 bg-white px-3 py-2 text-xs text-violet-700">请在上方「调用37号数据」中选择盈亏标签。</div>
                  )}
                  {stockPnlSourceMode === 'manual_positions' && (
                    <div className="space-y-2 rounded-lg border border-violet-200 bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-violet-800">股票组合（盘中参考价 + 盘尾价）</div>
                        <span className="text-[10px] text-violet-500">开盘每 5 分钟 · 15:05 固化</span>
                      </div>
                      <div className="rounded-lg border border-violet-100 bg-violet-50 p-2">
                        <div className="mb-1.5 text-[11px] font-semibold text-violet-800">盈亏计算方式</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManualStockPnlCalculationMode('position_cost')}
                            className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${manualStockPnlCalculationMode === 'position_cost' ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-700'}`}
                          >逐只买入价</button>
                          <button
                            type="button"
                            onClick={() => setManualStockPnlCalculationMode('total_capital')}
                            className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${manualStockPnlCalculationMode === 'total_capital' ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-700'}`}
                          >账户初始总额度</button>
                        </div>
                        <p className="mt-1.5 text-[10px] leading-4 text-violet-600">
                          {manualStockPnlCalculationMode === 'position_cost'
                            ? '逐只输入买入价：各股票（盘中参考价／盘尾价／卖出价 − 买入价）× 股数后汇总。'
                            : '不需填写逐只买入价：最新持仓市值合计 − 账户初始总额度，最后再乘计算系数。'}
                        </p>
                      </div>
                      {manualStockPnlCalculationMode === 'total_capital' && (
                        <div className="grid grid-cols-[minmax(0,1fr)_86px] gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2">
                          <label className="col-span-2 text-xs font-semibold text-violet-800" htmlFor="manual-stock-total-capital">账户初始总额度</label>
                          <input
                            id="manual-stock-total-capital"
                            type="number"
                            min="0"
                            step="any"
                            value={manualStockTotalCapital}
                            onChange={event => setManualStockTotalCapital(event.target.value)}
                            placeholder="例如 200000"
                            className={`min-w-0 rounded-md border px-2 py-1.5 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-200 ${isManualStockTotalCapitalValid ? 'border-violet-200 bg-white text-violet-800' : 'border-red-300 bg-red-50 text-red-700'}`}
                          />
                          <select
                            value={manualStockCapitalCurrency}
                            onChange={event => setManualStockCapitalCurrency(event.target.value === 'USD' ? 'USD' : 'CNY')}
                            className="rounded-md border border-violet-200 bg-white px-2 py-1.5 text-xs font-semibold text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            aria-label="账户初始总额度币种"
                          ><option value="CNY">人民币</option><option value="USD">美元</option></select>
                          <p className={`col-span-2 text-[10px] leading-4 ${isManualStockTotalCapitalValid ? 'text-violet-600' : 'text-red-600'}`}>
                            {isManualStockTotalCapitalValid ? '总额度只作为整体成本基准；每只股票只需录入名称、代码和当前持股数量，选中时自动带入一笔最新价。' : '请输入大于 0 的账户初始总额度'}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2">
                        <label htmlFor="manual-stock-pnl-coefficient" className="text-xs font-semibold text-violet-800">计算系数</label>
                        <div className="min-w-0">
                          <input
                            id="manual-stock-pnl-coefficient"
                            type="number"
                            min="0.000001"
                            max="100000"
                            step="any"
                            value={manualStockPnlCoefficient}
                            onChange={event => setManualStockPnlCoefficient(event.target.value)}
                            className={`w-full rounded-md border px-2 py-1.5 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-200 ${isManualStockPnlCoefficientValid ? 'border-violet-200 bg-white text-violet-800' : 'border-red-300 bg-red-50 text-red-700'}`}
                            aria-label="股票组合浮动盈亏计算系数"
                          />
                          <div className={`mt-1 text-[10px] leading-4 ${isManualStockPnlCoefficientValid ? 'text-violet-600' : 'text-red-600'}`}>
                            {isManualStockPnlCoefficientValid
                              ? manualStockPnlCalculationMode === 'total_capital'
                                ? `总浮动盈亏 =（最新持仓市值合计 − 账户初始总额度）× ${normalizedManualStockPnlCoefficient}`
                                : `总浮动盈亏 = 各股票原始盈亏合计 × ${normalizedManualStockPnlCoefficient}`
                              : '请输入大于 0 且不超过 100000 的计算系数'}
                          </div>
                        </div>
                      </div>
                      {manualStockPositions.map((position, index) => (
                        <div key={index} className={`grid grid-cols-2 gap-1.5 ${manualStockPnlCalculationMode === 'total_capital' ? 'sm:grid-cols-[1.2fr_1fr_1fr_auto]' : 'sm:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_auto]'}`}>
                          <input
                            value={position.name}
                            onFocus={() => { setManualStockLookupRow(index); setManualStockLookupInput(position.name); }}
                            onChange={e => updateManualStockLookupInput(index, 'name', e.target.value)}
                            className="min-w-0 rounded-md border border-violet-200 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="名称 / 拼音简称"
                            aria-label={`第${index + 1}只股票名称`}
                          />
                          <input
                            value={position.symbol}
                            onFocus={() => { setManualStockLookupRow(index); setManualStockLookupInput(position.symbol); }}
                            onChange={e => updateManualStockLookupInput(index, 'symbol', e.target.value)}
                            className="min-w-0 rounded-md border border-violet-200 px-2 py-2 text-xs font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="A 股六码，如 600519"
                            aria-label={`第${index + 1}只股票代码`}
                          />
                          {manualStockLookupRow === index && (
                            <div className={`col-span-2 rounded-md border border-violet-200 bg-white p-1.5 shadow-sm ${manualStockPnlCalculationMode === 'total_capital' ? 'sm:col-span-4' : 'sm:col-span-6'}`}>
                              <div className="px-1 pb-1 text-[10px] text-violet-500">输入 A 股六码、名称或英文简写后自动校验；多个同名/简称候选请点选，名称、代码和最新价会一起补全。</div>
                              {manualStockLookupQueryResult.isFetching && <div className="px-1 py-1.5 text-xs text-violet-500">正在检索 A 股…</div>}
                              {!manualStockLookupQueryResult.isFetching && manualStockLookupQuery.length >= 2 && manualStockLookupResults.length === 0 && <div className="px-1 py-1.5 text-xs text-slate-500">未找到可验证的沪深北 A 股，请检查名称、拼音或六码代码。</div>}
                              {manualStockLookupResults.map((suggestion) => (
                                <button
                                  key={suggestion.symbol}
                                  type="button"
                                  onClick={() => selectManualAshareStock(index, suggestion)}
                                  className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left text-xs hover:bg-violet-50"
                                >
                                  <span className="min-w-0 truncate font-semibold text-violet-900">{suggestion.name}</span>
                                  <span className="shrink-0 font-mono text-violet-700">{suggestion.code}</span>
                                  <span className="shrink-0 tabular-nums text-violet-600">{Number(suggestion.latestPrice) > 0 ? `最新 ¥${Number(suggestion.latestPrice).toLocaleString()}` : '最新价暂缺'}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {manualStockPnlCalculationMode === 'position_cost' && <>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={position.buyPrice}
                              onChange={e => setManualStockPositions(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, buyPrice: e.target.value } : item))}
                              className="min-w-0 rounded-md border border-violet-200 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200"
                              placeholder="买入价"
                              aria-label={`第${index + 1}只股票买入价`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={position.sellPrice}
                              onChange={e => setManualStockPositions(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, sellPrice: e.target.value } : item))}
                              className="min-w-0 rounded-md border border-violet-200 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200"
                              placeholder="卖出价（可选）"
                              aria-label={`第${index + 1}只股票卖出价`}
                            />
                          </>}
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={position.quantity}
                            onChange={e => setManualStockPositions(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: e.target.value } : item))}
                            className="min-w-0 rounded-md border border-violet-200 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="股数"
                            aria-label={`第${index + 1}只股票股数`}
                          />
                          <button
                            type="button"
                            onClick={() => setManualStockPositions(items => items.filter((_, itemIndex) => itemIndex !== index))}
                            className="rounded-md border border-red-200 px-2 text-red-500 hover:bg-red-50"
                            aria-label={`删除第${index + 1}只股票`}
                          >×</button>
                          {(() => {
                            const quote = manualStockPreviewQuotes[position.symbol.trim().toUpperCase()];
                            const snapshotPrice = Number(quote?.price);
                            const fallbackPrice = Number(position.latestPrice);
                            const price = snapshotPrice > 0 ? snapshotPrice : (fallbackPrice > 0 ? fallbackPrice : null);
                            const unit = String(quote?.currency || 'CNY').toUpperCase() === 'CNY' ? '元' : 'USD';
                            const priceDate = String(quote?.priceDate || position.latestPriceDate || '');
                            const updatedAt = String(quote?.updatedAt || position.latestPriceUpdatedAt || '');
                            const isIntradayQuote = String((quote as any)?.source || '').startsWith('盘中·');
                            const quoteLabel = isIntradayQuote ? '最新盘中参考价' : '最新盘尾价';
                            return (
                              <div className={`col-span-2 flex min-w-0 items-center justify-between rounded-md bg-violet-50 px-2 py-1.5 text-[11px] text-violet-700 ${manualStockPnlCalculationMode === 'total_capital' ? 'sm:col-span-4' : 'sm:col-span-6'}`}>
                                <span>{snapshotPrice > 0 ? quoteLabel : '最新价'}</span>
                                <span className="font-semibold tabular-nums">{price === null ? '正在获取最新价' : `${price.toLocaleString()} ${unit}`}</span>
                                <span className="text-violet-400">{priceDate ? `价格日期 ${formatChineseStockPriceDate(priceDate)}` : updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}` : '选择股票后自动带入'}</span>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={manualStockPositions.length >= 20}
                          onClick={() => setManualStockPositions(items => [...items, { name: '', symbol: '', buyPrice: '', sellPrice: '', quantity: '', latestPrice: '', latestPriceDate: '', latestPriceUpdatedAt: '' }])}
                          className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50"
                        >+ 添加股票</button>
                        {editingOrder?.id && (
                          <button
                            type="button"
                            onClick={saveManualStockPnlSource}
                            disabled={validManualStockPositions.length === 0 || !isManualStockPnlCoefficientValid || (manualStockPnlCalculationMode === 'total_capital' && !isManualStockTotalCapitalValid) || saveLinkedInterestSourceMutation.isPending || saveParticipantLinkedInterestSourceMutation.isPending}
                            className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-violet-300"
                          >{saveLinkedInterestSourceMutation.isPending || saveParticipantLinkedInterestSourceMutation.isPending ? '保存中…' : '保存股票组合'}</button>
                        )}
                      </div>
                      <div className="text-[11px] leading-4 text-violet-600">
                        {manualStockPnlCalculationMode === 'total_capital'
                          ? '字段依次为名称、代码和当前持股数量。选中股票时自动带入一笔最新价；开盘交易时段每 5 分钟更新，15:05 以盘尾价固化。差值 = Σ（最新价 × 股数）− 账户初始总额度；最终浮动盈亏 = 差值 × 计算系数。点击订单浮动盈亏说明可查看价格、更新时间与计算过程。'
                          : '字段依次为名称、代码、买入价、卖出价（可选）和持股数量。未填卖出价时，原始盈亏 = Σ（盘中参考价／盘尾价 − 买入价）× 股数；填入卖出价后按卖出价锁定计算。最终浮动盈亏 = 原始盈亏合计 × 计算系数；点击订单浮动盈亏说明可查看价格、更新时间与计算过程。'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {ledgerId === 52 && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div>
                    <div className="text-sm font-semibold text-amber-800">钱包担保物（可与下方手工担保并行）</div>
                    <p className="mt-1 text-xs leading-5 text-amber-700">冻结后钱包总余额不变，但冻结部分不能提现、转账或再次担保；订单结清或移入回收站时自动恢复为可用余额。人民币、USDT与数字资产均可担保，手工担保与钱包担保分别保存、互不覆盖。</p>
                  </div>
                  {editingOrder?.id && collateralAssets.every(isWalletCollateralAsset) && recoverableManualCollateral.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                      <div className="text-xs font-semibold text-blue-800">检测到本订单历史手工担保：{recoverableManualCollateral.map((asset) => `${asset.qty} ${asset.coin}`).join('、')}</div>
                      <p className="mt-1 text-[11px] leading-4 text-blue-600">钱包担保不会再替换手工担保。可恢复后与当前钱包冻结资产一并保留。</p>
                      <button
                        type="button"
                        onClick={() => {
                          const mergedAssets = [
                            ...recoverableManualCollateral,
                            ...collateralAssets.filter(isWalletCollateralAsset),
                          ];
                          setCollateralAssets(mergedAssets);
                          persistCollateral(mergedAssets);
                        }}
                        disabled={saveCollateralMutation.isPending}
                        className="mt-2 w-full rounded-lg border border-blue-300 bg-white py-2 text-xs font-semibold text-blue-700 disabled:opacity-60"
                      >{saveCollateralMutation.isPending ? '恢复中…' : '恢复历史手工担保'}</button>
                    </div>
                  )}
                  {walletCollateralUserId <= 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-xs text-amber-700">请先选择订单拥有者，才能读取其钱包资产。</div>
                  ) : walletCollateralBalancesQuery.isLoading ? (
                    <div className="rounded-lg bg-white px-3 py-4 text-center text-xs text-gray-400">正在读取钱包可用余额…</div>
                  ) : (walletCollateralBalancesQuery.data ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-center text-xs text-amber-700">该用户暂无可用于担保的钱包资产。</div>
                  ) : (
                    <div className="space-y-2">
                      {(walletCollateralBalancesQuery.data ?? []).map((asset: any) => {
                        const assetCode = String(asset.assetCode || '').toUpperCase();
                        const selected = collateralAssets.find((item) => isWalletCollateralAsset(item) && item.coin === assetCode);
                        const available = Number(asset.availableBalance ?? 0);
                        const frozen = Number(asset.frozenBalance ?? 0);
                        const selectedAmount = Number(selected?.qty ?? 0);
                        const maximum = Math.max(0, available + selectedAmount);
                        const fractionDigits = assetCode === 'CNY' ? 2 : assetCode === 'USDT' ? 4 : 8;
                        const inputStep = assetCode === 'CNY' ? '0.01' : assetCode === 'USDT' ? '0.0001' : '0.00000001';
                        return (
                          <div key={assetCode} className="rounded-lg border border-amber-100 bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-800">{assetCode} <span className="text-xs font-normal text-gray-400">{asset.assetName || ''}</span></div>
                                <div className="mt-0.5 text-[11px] text-gray-500">可用 {available.toLocaleString('zh-CN', { maximumFractionDigits: fractionDigits })} · 已冻结 {frozen.toLocaleString('zh-CN', { maximumFractionDigits: fractionDigits })}</div>
                              </div>
                              {selected ? (
                                <button
                                  type="button"
                                  disabled={!walletCollateralEditMode && !!editingOrder?.id}
                                  onClick={() => setCollateralAssets((previous) => previous.filter((item) => !(isWalletCollateralAsset(item) && item.coin === assetCode)))}
                                  className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500 disabled:opacity-50"
                                >移除</button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={available <= 0 || (!walletCollateralEditMode && !!editingOrder?.id)}
                                  onClick={() => setCollateralAssets((previous) => [...previous, { coin: assetCode, qty: '', note: '钱包担保冻结', source: 'wallet' }])}
                                  className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                                >选择</button>
                              )}
                            </div>
                            {selected && (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={maximum > 0 ? maximum : undefined}
                                  step={inputStep}
                                  value={selected.qty}
                                  disabled={!walletCollateralEditMode && !!editingOrder?.id}
                                  onChange={(event) => setCollateralAssets((previous) => previous.map((item) => isWalletCollateralAsset(item) && item.coin === assetCode ? { ...item, qty: event.target.value, source: 'wallet' } : item))}
                                  placeholder={`最多 ${maximum.toLocaleString('zh-CN', { maximumFractionDigits: fractionDigits })}`}
                                  className="min-w-0 flex-1 rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-500 disabled:bg-gray-50"
                                />
                                <span className="text-xs font-semibold text-amber-700">{assetCode}</span>
                                <button type="button" disabled={!walletCollateralEditMode && !!editingOrder?.id} onClick={() => setCollateralAssets((previous) => previous.map((item) => isWalletCollateralAsset(item) && item.coin === assetCode ? { ...item, qty: String(maximum), source: 'wallet' } : item))} className="text-xs font-semibold text-amber-700 disabled:opacity-50">全部</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {editingOrder?.id && !walletCollateralEditMode ? (
                    <button type="button" onClick={() => setWalletCollateralEditMode(true)} disabled={collateralEditMode} className="w-full rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-semibold text-amber-700 disabled:opacity-50">编辑钱包担保</button>
                  ) : (
                    <>
                      {editingOrder?.id && (
                        <button
                          type="button"
                          onClick={() => void persistWalletCollateral(Number(editingOrder.id), walletCollateralUserId, collateralAssets)}
                          disabled={saveWalletCollateralMutation.isPending || walletCollateralUserId <= 0}
                          className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        >{saveWalletCollateralMutation.isPending ? '冻结保存中…' : '保存并冻结钱包担保'}</button>
                      )}
                      {!editingOrder?.id && <div className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-amber-700">新建订单保存成功后，所选资产会立即进入冻结担保；余额不足将不会创建担保冻结。</div>}
                    </>
                  )}
                </div>
              )}

              {/* 担保货币列表：37号担保货币关闭时，即使仍使用37号浮盈也可手工录入。 */}
              {(isRestrictedParticipantEdit || ledgerId === 52 || collateralSourceMode === 'manual' || (collateralSourceMode === 'external' && !isUsing37Collateral)) && (
              <div className="space-y-3">
                {ledgerId === 52 && <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">手工担保物独立管理：在本区新增、修改或删除只影响手工条目；不会解除上方钱包冻结资产。</div>}
                {/* 只读态：编辑已有订单且未进入编辑模式时 */}
                {editingOrder?.id && !collateralEditMode ? (
                  <>
                    {collateralAssets.filter(a => !isWalletCollateralAsset(a) && a.coin && a.qty !== '').length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">暂无手工担保物</div>
                    ) : (
                      collateralAssets.filter(a => !isWalletCollateralAsset(a) && a.coin && a.qty !== '').map((item, idx) => (
                        <div key={idx} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold shrink-0" style={{ color: COIN_COLORS[item.coin as keyof typeof COIN_COLORS] || '#1A2340' }}>{item.coin}</span>
                            <span className="text-sm text-gray-700 tabular-nums">{item.qty}</span>
                            {item.note ? <span className="text-xs text-gray-400 truncate">· {item.note}</span> : null}
                          </div>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setCollateralEditMode(true)}
                      disabled={walletCollateralEditMode}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >编辑手工担保物</button>
                  </>
                ) : (
                <>
                {collateralAssets.map((item, idx) => isWalletCollateralAsset(item) ? null : (
                  <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select
                        value={item.coin}
                        disabled={walletCollateralEditMode && !!editingOrder?.id}
                        onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, coin: e.target.value } : a))}
                        className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                        style={{ width: '50%', backgroundColor: '#fff', color: COIN_COLORS[item.coin as keyof typeof COIN_COLORS] || '#1A2340' }}
                      >
                        {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={item.qty}
                        disabled={walletCollateralEditMode && !!editingOrder?.id}
                        onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, qty: e.target.value } : a))}
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="数量"
                        style={{ width: '0' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (walletCollateralEditMode && editingOrder?.id) {
                            toast.error('请先保存钱包担保变更，再编辑手工担保物');
                            return;
                          }
                          const next = collateralAssets.filter((_, i) => i !== idx);
                          setCollateralAssets(next);
                          if (editingOrder?.id) persistCollateral(next); // 编辑态：删除立即写回
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 text-lg shrink-0"
                      >&times;</button>
                    </div>
                    <input
                      type="text"
                      value={item.note || ''}
                      disabled={walletCollateralEditMode && !!editingOrder?.id}
                      onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, note: e.target.value } : a))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="备注（选填）"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCollateralAssets(prev => [...prev, { coin: 'BTC', qty: '', note: '' }])}
                  disabled={walletCollateralEditMode && !!editingOrder?.id}
                  className="w-full py-2.5 rounded-xl border border-dashed border-blue-300 text-sm text-blue-500 font-medium flex items-center justify-center gap-1"
                >
                  <span className="text-base leading-none">+</span> 添加手工担保物
                </button>
                {/* 编辑已有订单时，整组独立保存 */}
                {editingOrder?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (walletCollateralEditMode) {
                        toast.error('请先保存钱包担保变更，再保存手工担保物');
                        return;
                      }
                      persistCollateral(collateralAssets);
                    }}
                    disabled={saveCollateralMutation.isPending || saveParticipantCollateralMutation.isPending || walletCollateralEditMode}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                  >{saveCollateralMutation.isPending || saveParticipantCollateralMutation.isPending ? '保存中…' : isRestrictedParticipantEdit ? '保存参与者手工担保' : '保存手工担保物'}</button>
                )}
                </>
                )}

                {/* 担保价值和担保缺口实时预览（始终显示，无担保物时显示 0） */}
                <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: collateralShareMode === 'self' ? '#FFF7ED' : '#EFF6FF', border: collateralShareMode === 'self' ? '1px solid #FED7AA' : 'none' }}>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: '#6B7280' }}>担保价值</span>
                      <span className="font-semibold text-blue-700">{computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                    </div>
                    {computedCollateralGap !== null && (
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: '#6B7280' }}>担保缺口</span>
                        <span className={`font-semibold ${
                          computedCollateralGap < 0 ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {computedCollateralGap > 0 ? '+' : ''}{computedCollateralGap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                        </span>
                      </div>
                    )}
                    {ledgerId === 52 && previewIsPrincipalLoan && (
                      <div className="mt-2 border-t border-blue-100 pt-2 text-[11px] text-slate-500">
                        借出本金订单固定按：担保物市值 − 原始融资本金 − 待结利息 + 已结利息计算；不随标的实时价格重复改变本金。
                      </div>
                    )}
                    {ledgerId === 52 && !previewIsPrincipalLoan && (
                      <div className="mt-2 border-t border-blue-100 pt-2">
                        <div className="mb-1.5 text-xs font-medium text-slate-600">担保缺口计算基准</div>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: 'buy_value', label: '买入价值', detail: '按实际买入总价值' },
                            { value: 'interest_base', label: '计息基数', detail: '按约定计息基数' },
                          ] as const).map(option => {
                            const active = collateralGapBaseMode === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setDisplayConfig(current => ({ ...current, collateralGapBaseMode: option.value }))}
                                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-blue-100 bg-white text-slate-600'}`}
                              >
                                <span className="block text-xs font-semibold">{option.label}</span>
                                <span className={`mt-0.5 block text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>{option.detail}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-1.5 text-[11px] text-slate-500">
                          当前基准：<span className="font-semibold text-slate-700">{collateralGapBaseMode === 'interest_base' ? '计息基数' : '买入价值'}</span>
                          {collateralGapBaseValue > 0 && <> · {collateralGapBaseValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</>}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          预览缺口 = 当前持有资产{previewCurrentHoldingValue !== null ? `（${previewCurrentHoldingValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U）` : '（行情待获取）'} − 基准 + 担保价值；待结、已结利息在订单卡片中继续计算。
                        </div>
                      </div>
                    )}
                </div>

                {/* 共享担保模式选择 */}
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2">
                  <div className="text-sm font-medium text-gray-700">共享担保设置</div>
                  <div className="flex flex-col gap-2">
                    {/* 不共享 */}
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="collateralShareMode"
                        value="none"
                        checked={collateralShareMode === 'none'}
                        onChange={() => setCollateralShareMode('none')}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">不共享（担保物仅保障本订单）</span>
                    </label>
                    {/* 本人订单共享 */}
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="collateralShareMode"
                        value="self"
                        checked={collateralShareMode === 'self'}
                        onChange={() => {
                          // 显示确认弹窗，列出当前共享池中的订单
                          const poolOrders = (sharedPoolData as any)?.orders ?? [];
                          // 排除当前正在编辑的订单
                          const otherOrders = poolOrders.filter((o: any) => !editingOrder || o.orderId !== editingOrder.id);
                          setShareConfirmModal({ mode: 'self', sharedOrders: otherOrders });
                        }}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">本人订单共享</span>
                      {collateralShareMode === 'self' && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">已开启</span>
                      )}
                    </label>
                    {/* 与他人共享（占位，暂不开放） */}
                    <label className="flex items-center gap-2.5 opacity-40 cursor-not-allowed">
                      <input
                        type="radio"
                        name="collateralShareMode"
                        value="cross"
                        disabled
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-400">与他人共享（开发中）</span>
                    </label>
                  </div>
                </div>
              </div>
              )}





              {/* 分隔线：字段展示控制 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">字段展示控制</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 字段开关面板 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
                {/* 用户前端权限 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-indigo-500">用户权限</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                    <CompactDisplayToggle
                      label="图片下载"
                      checked={Boolean(displayConfig.allowUserImageDownload)}
                      onToggle={() => setDisplayConfig(c => ({ ...c, allowUserImageDownload: !c.allowUserImageDownload }))}
                      tone="indigo"
                    />
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">仅控制用户前端；管理员订单列表始终可下载。</p>
                </div>
                <div className="mx-4 h-px bg-gray-100" />
                {/* 左栏字段 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-blue-500">左栏 · 持有资产</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                    {[
                      { key: 'buyPrice', label: '买入币价' },
                      { key: 'buyValue', label: '买入价值' },
                      { key: 'buyDate', label: '开仓时间' },
                      { key: 'openPrice', label: '开仓币价' },
                      { key: 'todayPrice', label: '当前币价' },
                      { key: 'floatPnl', label: '浮动盈亏' },
                      { key: 'holdDuration', label: '持有时长' },
                      { key: 'orderNo', label: '订单编号' },
                      { key: 'assetType', label: '资产标签' },
                      { key: 'showOwnerName', label: '显示名字' },
                      ...(formData.assetType === 'crypto' ? [
                        { key: 'showTradeDirection', label: '多空标签' },
                      ] : []),
                      ...(formData.assetType === 'stock' ? [
                        { key: 'brokerName', label: '证券公司' },
                        { key: 'brokerAccount', label: '证券账号' },
                      ] : []),
                      { key: 'aiIcon', label: 'AI图标' },
                    ].map(({ key, label }) => (
                      <CompactDisplayToggle
                        key={key}
                        label={label}
                        checked={Boolean(displayConfig[key])}
                        onToggle={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                      />
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏上半：待结利息区 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-blue-500">右栏 · 利息担保</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                    {[
                      { key: 'accruedInterest', label: '待结利息' },
                      { key: 'paidInterest', label: '已结利息' },
                      { key: 'interestBase', label: '计息基数' },
                      { key: 'interestStartDate', label: '计息日期' },
                      { key: 'interestDuration', label: '计息时长' },
                      { key: 'interestPaymentType', label: '付息方式' },
                      { key: 'collateralCoin', label: '担保货币' },
                      { key: 'collateralValue', label: '担保价值' },
                      { key: 'collateral', label: '担保缺口' },
                      { key: 'marginRate', label: '保证金率' },
                    ].map(({ key, label }) => (
                      <CompactDisplayToggle
                        key={key}
                        label={label}
                        checked={Boolean(displayConfig[key])}
                        onToggle={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                      />
                    ))}
                  </div>
                  {/* 保证金率预警阈值输入框（仅在保证金率开关打开时显示） */}
                  {displayConfig.marginRate && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-orange-50 px-2.5 py-2">
                      <span className="text-xs text-orange-600 shrink-0">低于</span>
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="1"
                        value={marginAlertThreshold}
                        onChange={e => setMarginAlertThreshold(e.target.value)}
                        placeholder="80"
                        className="w-14 rounded-md border border-orange-200 bg-white px-1.5 py-1 text-center text-xs focus:outline-none focus:border-orange-400"
                        style={{ color: '#D97706' }}
                      />
                      <span className="text-xs text-orange-600 shrink-0">% 时预警</span>
                      {marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 && (
                        <span className="text-xs text-orange-500 font-medium">已设</span>
                      )}
                    </div>
                  )}
                </div>
                {ledgerId === 52 && (
                  <>
                    {/* 手续费操作区：交易管理员可调整费率及付款进度 */}
                    <div className="px-4 pb-3">
                      <div className="text-xs font-medium text-blue-500 mb-2">手续费操作</div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-700">参考手续费费率</div>
                            <p className="text-[11px] text-gray-400 mt-0.5">按计息基数（为空时按订单金额）自动计算</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={formData.tradingFeeRate}
                              onChange={e => setFormData(d => ({ ...d, tradingFeeRate: e.target.value }))}
                              className="w-16 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-center text-sm font-semibold text-blue-700 outline-none focus:border-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-500">‰</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5">手续费支付进度</div>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: 'unpaid', label: '已付0%' },
                              { value: 'half_paid', label: '已付50%' },
                              { value: 'paid', label: '已付100%' },
                            ] as const).map(item => (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => setFormData(d => ({ ...d, tradingFeeStatus: item.value }))}
                                className={`rounded-lg border px-1 py-1.5 text-xs font-medium transition-colors ${
                                  formData.tradingFeeStatus === item.value
                                    ? 'border-blue-500 bg-blue-500 text-white'
                                    : 'border-gray-200 bg-white text-gray-600'
                                }`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mx-4 h-px bg-gray-100 my-2" />
                  </>
                )}
                {/* 约等于显示控制 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-blue-500">约等于显示</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                    {([
                      { key: 'approxHolding', label: '持有资产' },
                      { key: 'approxInterest', label: '待结利息' },
                      { key: 'approxPaid', label: '已结利息' },
                      // 逐笔担保与37号担保汇总是两条不同的展示路径：
                      // 引用37号担保时不渲染手工逐笔/合计配置，避免出现两个“担保货币”。
                      ...(!isUsing37Collateral ? [
                        { key: 'approxCollateralItem', label: '逐笔担保货币' },
                        ...(formData.assetType !== 'stock' ? [{ key: 'approxCollateralTotal', label: '担保总值' }] : []),
                      ] : []),
                      { key: 'approxCollateralGap', label: '担保缺口' },
                      ...(formData.assetType === 'stock' && !isUsing37Collateral ? [
                        { key: 'stockManualCollateralValueDisplay', label: '担保价值' },
                      ] : formData.assetType === 'stock' ? [
                        { key: 'externalCollateralValueDisplay', label: '37号担保展示' },
                      ] : []),
                    ] as { key: string; label: string }[]).map(({ key, label }) => (
                      <div key={key} className="min-w-0">
                        <div className="mb-1 text-[11px] font-medium text-gray-600">{label}</div>
                        <div className="flex gap-1">
                          {(key === 'externalCollateralValueDisplay'
                            ? ['CRYPTO', 'U', 'CNY']
                            : key === 'stockManualCollateralValueDisplay'
                              ? ['U', 'CNY']
                            : ['hidden', 'U', 'CNY']).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setDisplayConfig(c => ({ ...c, [key]: opt }))}
                              className={`min-h-7 flex-1 rounded-md border px-1 py-1 text-[11px] transition-colors ${
                                (key === 'externalCollateralValueDisplay'
                                  ? (['CRYPTO', 'U', 'CNY'].includes(String(displayConfig[key])) ? displayConfig[key] : 'CNY')
                                  : key === 'stockManualCollateralValueDisplay'
                                      ? (['U', 'CNY'].includes(String(displayConfig[key])) ? displayConfig[key] : 'CNY')
                                      : key === 'approxCollateralGap'
                                        ? (['hidden', 'U', 'CNY'].includes(String(displayConfig[key])) ? displayConfig[key] : 'hidden')
                                        : displayConfig[key]) === opt
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-500 border-gray-200'
                              }`}
                            >
                              {key === 'externalCollateralValueDisplay'
                                ? (opt === 'CRYPTO' ? '明细' : opt === 'U' ? '≈ U' : '≈ 元')
                                : key === 'stockManualCollateralValueDisplay'
                                    ? (opt === 'U' ? '≈ U' : '≈ 元')
                                    : (opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ U' : '≈ 元')}
                            </button>
                          ))}
                        </div>
                        {key === 'stockManualCollateralValueDisplay' && (
                          <div className="mt-1 text-[10px] leading-4 text-gray-400">逐笔照常显示；此处只控合计。</div>
                        )}
                        {key === 'approxCollateralGap' && (
                          <div className="mt-1 text-[10px] leading-4 text-gray-400">主值：股票元；数字币、期权 U。</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 功能开关 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-blue-500">功能开关</div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                    {ledgerId === 52 && (
                      <CompactDisplayToggle
                        label="手续费"
                        checked={Boolean(displayConfig.tradingFee)}
                        onToggle={() => setDisplayConfig(c => ({ ...c, tradingFee: !Boolean(c.tradingFee) }))}
                      />
                    )}
                    <CompactDisplayToggle
                      label="借出本金"
                      checked={formData.principalLentOut}
                      onToggle={() => setFormData(d => ({ ...d, principalLentOut: !d.principalLentOut }))}
                      tone="orange"
                    />
                    {formData.assetType === 'crypto_option' && (
                      <CompactDisplayToggle
                        label="Greeks"
                        checked={displayConfig.showGreeks !== false}
                        onToggle={() => setDisplayConfig(c => ({ ...c, showGreeks: !c.showGreeks, showGreeksManualOverride: true }))}
                        tone="purple"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">借出本金开启后，担保缺口按计息基数扣减。</p>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏下半：收益分成区 */}
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-xs font-medium text-blue-500">右栏 · 收益分成</div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                      <CompactDisplayToggle
                        label="收益分成"
                        checked={Boolean(displayConfig.profitShare)}
                        onToggle={() => setDisplayConfig(c => ({ ...c, profitShare: !c.profitShare }))}
                      />
                    </div>
                    {displayConfig.profitShare && (
                      <div className="space-y-2 pt-1">
                        {/* 分成类型选择：利息分成 / 利润分成 */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, profitShareType: 'interest' }))}
                            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              formData.profitShareType === 'interest'
                                ? 'border-blue-500 bg-blue-50 text-blue-600'
                                : 'border-gray-200 text-gray-500'
                            }`}
                          >利息分成</button>
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, profitShareType: 'coin' }))}
                            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              formData.profitShareType === 'coin'
                                ? 'border-blue-500 bg-blue-50 text-blue-600'
                                : 'border-gray-200 text-gray-500'
                            }`}
                          >利润分成</button>
                        </div>
                        {/* 分成比例输入 */}
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                          <span className="text-sm text-gray-500 shrink-0">分成比例</span>
                          <input
                            type="number"
                            value={formData.profitShareRatio}
                            onChange={e => setFormData(d => ({ ...d, profitShareRatio: e.target.value }))}
                            className="flex-1 min-w-0 text-right text-sm focus:outline-none bg-transparent"
                            placeholder="例如 20"
                          />
                          <span className="text-sm text-gray-500 shrink-0">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 实时预览卡片 - 复用 FunderOrderCard，与订单列表完全一致 */}
              {(() => {
                // 构造预览用的 order 对象，字段名与数据库/后端返回保持一致
                const ownerLabel = (() => {
                  if (formData.ownerLabel) return formData.ownerLabel;
                  if (formData.userId > 0) {
                    const allMembers = ((ledgerData as any)?.members || []) as any[];
                    const m = allMembers.find((mm: any) => mm.userId === formData.userId);
                    return m?.nickname || m?.name || m?.user_nickname || m?.username || editingOrder?.owner_display_name || editingOrder?.userName || null;
                  }
                  return editingOrder?.owner_display_name || editingOrder?.userName || null;
                })();
                const previewIsOptionOrder = formData.assetType === 'crypto_option';
                const previewOptionSummary = previewIsOptionOrder ? getOptionPremiumSummary() : null;
                const previewCoin = previewIsOptionOrder ? optionFormData.optionCurrency : formData.coin;
                const previewAmountCurrency = previewIsOptionOrder ? previewOptionSummary?.denomination || 'USDT' : formData.amountCurrency || 'USDT';
                const previewBuyPrice = previewIsOptionOrder ? optionFormData.premium || null : formData.buyPrice || null;
                const previewBuyQuantity = previewIsOptionOrder ? optionFormData.buyQty || null : formData.buyQuantity || null;
                const previewAmount = previewIsOptionOrder
                  ? (previewOptionSummary?.totalUsdt && previewOptionSummary.totalUsdt > 0 ? previewOptionSummary.totalUsdt.toFixed(4) : null)
                  : formData.assetType === 'stock' ? amountInputValue || null : financingAmountUsdt || null;
                const previewDisplayInputAmount = previewIsOptionOrder ? previewOptionSummary?.totalInput || '' : amountInputValue || '';
                const previewOrder: any = {
                  id: editingOrder?.id ?? -1,
                  order_no: editingOrder?.order_no ?? null,
                  user_id: formData.userId,
                  owner_label: isSnapshotScopedEdit ? ((editingOrder as any)?.owner_label || ownerLabel) : ownerLabel,
                  participantInfo: isSnapshotScopedEdit ? (editingOrder as any)?.participantInfo : undefined,
                  _isParticipant: isRestrictedParticipantEdit,
                  participant_name: isSnapshotScopedEdit ? (editingOrder as any)?.participant_name : undefined,
                  order_owner_name: isSnapshotScopedEdit ? (editingOrder as any)?.order_owner_name : undefined,
                  owner_display_names: isSnapshotScopedEdit
                    ? participants.filter(participant => participant.role === 'owner').map(participant => ({ userId: participant.userId, name: participant.userName }))
                    : undefined,
                  personal_header_label: formData.personalHeaderLabel.trim() || null,
                  coin: previewCoin,
                  asset_type: formData.assetType || null,
                  buy_price: previewBuyPrice,
                  buy_quantity: previewBuyQuantity,
                  amount: previewAmount,
                  amount_currency: previewAmountCurrency,
                  buy_date: formData.buyDate || null,
                  status: formData.status || 'active',
                  order_fill_status: formData.orderFillStatus || 'filled',
                  storage_account: formData.storageAccount || null,
                  broker_name: formData.brokerName || null,
                  broker_account: formData.brokerAccount || null,
                  interest_rate_annual: (() => { const r = normalizeFunderAnnualRate(formData.interestRateAnnual); return r || '0'; })(),
                  interest_payment_type: formData.interestPaymentType || null,
                  interest_base: formData.interestBase || null,
                  interest_base_currency: formData.interestBaseCurrency || 'USDT',
                  interest_rate_currency: formData.interestRateCurrency || 'USDT',
                  interest_start_date: formData.interestStartDate || null,
                  show_profit_share: formData.showProfitShare ? 1 : 0,
                  commission_share: formData.commissionShare || null,
                  profit_share_ratio: formData.profitShareRatio || null,
                  profit_share_type: formData.profitShareType || 'interest',
                  principal_lent_out: formData.principalLentOut ? 1 : 0,
                  collateral_assets: collateralAssets.length > 0 ? JSON.stringify(collateralAssets) : null,
                  option_info: formData.assetType === 'crypto_option' ? JSON.stringify({
                    coin: optionFormData.optionCurrency,
                    direction: optionFormData.direction,
                    exerciseDate: optionFormData.exerciseDate || null,
                    deribitLabel: optionFormData.deribitLabel || null,
                    strikePrice: optionFormData.strikePrice ? parseFloat(optionFormData.strikePrice) : null,
                    premium: optionFormData.premium || null,
                    denomination: optionFormData.premiumDenomination,
                    buyQty: optionFormData.buyQty || null,
                  }) : null,
                  collateral_share_mode: collateralShareMode || 'none',
                  // 预览使用与保存完全相同的来源草稿，37号引用和手工股票组合都会即时同步。
                  collateral_source: orderCollateralSourceDraft ? JSON.stringify(orderCollateralSourceDraft) : null,
                  trade_direction: previewIsOptionOrder ? null : formData.tradeDirection || null,
                  display_config: JSON.stringify({
                    ...displayConfig,
                    ownerNameDisplay: 'self',
                    marginAlertThreshold: marginAlertThreshold || undefined,
                    rate_negative: normalizeFunderAnnualRate(formData.interestRateAnnual).startsWith('-'),
                    financingInputAmount: previewDisplayInputAmount,
                    financingInputCurrency: previewAmountCurrency,
                  }),
                  tags: formData.tags && formData.tags.length > 0 ? JSON.stringify(formData.tags) : null,
                  public_note: null,
                  admin_note: null,
                  settled_at: null,
                  participantCount: 0,
                  paidTotal: editingOrderPayments && (editingOrderPayments as any[]).length > 0
                    ? { amount: String((editingOrderPayments as any[]).reduce((s: number, p: any) => s + parseFloat(p.amount || '0'), 0)), currency: (editingOrderPayments as any[])[0]?.currency || 'U' }
                    : null,
                };
                const rateValPreview = parseFloat(String(previewOrder.interest_rate_annual || '0'));
                // 字段展示开关改变时强制重建预览卡片，避免卡片内部状态保留旧配置。
                const previewDisplayKey = `preview-${previewViewMode}-${formData.assetType}-${String(displayConfig.floatPnl)}-${JSON.stringify(optionFormData)}-${JSON.stringify(orderCollateralSourceDraft)}`;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-gray-400">实时预览</div>
                      {/* 模式切换 Tab */}
                      <div className="flex items-center gap-1 p-0.5 rounded-full bg-gray-100">
                        {(['order', 'card'] as const).map(mode => (
                          <button key={mode} type="button"
                            onClick={() => setPreviewViewMode(mode)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${previewViewMode === mode ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {mode === 'card' ? '卡片模式' : '订单模式'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {previewViewMode === 'order' || (formData.assetType === 'stock' && stockPnlSourceMode === 'manual_positions') ? (
                      <FunderOrderCard
                        key={previewDisplayKey}
                        order={previewOrder}
                        livePrices={formLivePrices}
                        priceDirection={priceDirection}
                        currentUser={currentUser}
                        isAdmin={isAdminUser}
                        membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                        ledgerId={ledgerId}
                        previewMode={true}
                        showCollateralInfo={showPreviewCollateralInfo}
                        setShowCollateralInfo={setShowPreviewCollateralInfo}
                        showMarginInfo={showPreviewMarginInfo}
                        setShowMarginInfo={setShowPreviewMarginInfo}
                        showInterestTip={showPreviewInterestTip}
                        setShowInterestTip={setShowPreviewInterestTip}
                      />
                    ) : (
                      rateValPreview > 0 ? (
                        <FunderLenderCardSilver
                          key={previewDisplayKey}
                          order={previewOrder}
                          ledgerId={ledgerId}
                          livePrices={formLivePrices}
                          priceDirection={priceDirection}
                          membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar } : undefined}
                          isAdmin={isAdminUser}
                        />
                      ) : (
                        <FunderOrderCardV2Silver
                          key={previewDisplayKey}
                          order={previewOrder}
                          ledgerId={ledgerId}
                          livePrices={formLivePrices}
                          priceDirection={priceDirection}
                          membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar } : undefined}
                          isAdmin={isAdminUser}
                        />
                      )
                    )}
                  </div>
                );
              })()}
              </>)}

            {/* ===== 表单末尾：共同拥有者与历史参与者管理 ===== */}
            {canManageCollaboratorsInEditor && (
              <div className="border-t border-gray-100 pt-4" ref={participantsSectionRef}>
                <button type="button" onClick={() => setParticipantsSectionExpanded(value => !value)} className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Users2 className="h-4 w-4" />
                      <span>{hasPrimaryOwnerDrawer ? '其余拥有者 / 参与者' : participants.length > 0 ? '拥有者组 / 参与者' : '添加拥有者 / 参与者（可选）'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        {existingParticipantsLoading && participants.length === 0 ? '读取中' : `${hasPrimaryOwnerDrawer ? editableParticipants.length : participants.length} 人`}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${participantsSectionExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{participantsSectionExpanded ? (hasPrimaryOwnerDrawer ? '第一位拥有者已在上方单独编辑；此处仅列出其余成员，点击即可直接进入各自完整订单页。' : '同组拥有者完全平级；点击任一成员即可直接打开该成员的完整订单编辑页，保存后自动收起。') : participants.length > 0 ? '已收起，点击查看或调整已关联的拥有者／参与者。' : '不需要多人协作时无需操作；点击后才会添加拥有者或参与者。'}</p>
                </button>

                {participantsSectionExpanded && (<>
                {participants.length === 0 && !existingParticipantsLoading && (
                  <div className="mb-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
                    当前没有拥有者组；添加后，原订单拥有者会自动纳入同一组，并以平级成员方式显示和配置。
                  </div>
                )}

                {/* 拥有者组 / 历史参与者列表。拥有者不用颜色或排序暗示主次。 */}
                {editableParticipants.map(({ participant: p }) => (
                  <div key={p.userId} className={`mb-3 overflow-hidden rounded-xl border ${p.role === 'owner' ? 'border-slate-200 bg-white' : 'border-emerald-200 bg-emerald-50'}`}>
                    {/* 协作成员头部 */}
                    <div
                      className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                      onClick={() => {
                        if (editingOrder?.id) {
                          openParticipantFullView(p);
                          return;
                        }
                        setParticipants(prev => prev.map(pp => ({ ...pp, expanded: pp.userId === p.userId ? !pp.expanded : false })));
                      }}
                    >
                      {p.avatar ? <img src={p.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.role === 'owner' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-200 text-emerald-700'}`}>{p.userName.slice(0,1).toUpperCase()}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800 truncate"><span className="truncate">{p.userName}</span><span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${p.role === 'owner' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>{p.role === 'owner' ? '拥有者' : '参与者'}</span></div>
                        <div className="truncate text-xs text-gray-400">{p.amount ? `${p.amount} ${p.amountCurrency === 'CNY' ? '元' : p.amountCurrency}` : p.role === 'owner' ? '平级拥有者' : '历史参与者'}{p.interestRateAnnual ? ` · 年化 ${normalizeFunderAnnualRate(p.interestRateAnnual)}%` : ''}</div>
                      </div>
                      {!(p.role === 'owner' && Number(p.userId) === Number(formData.userId)) && (
                        <button type="button" onClick={e => { e.stopPropagation(); setParticipants(prev => prev.filter(item => item.userId !== p.userId)); }} className="p-1 rounded-lg text-red-400 hover:bg-red-50" aria-label="移除协作成员">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                      {editingOrder?.id
                        ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transform: p.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>}
                    </div>

                    {/* 新建订单尚未落库时保留关系确认；已有订单点击成员会直接进入完整编辑页。 */}
                    {!editingOrder?.id && p.expanded && (
                      <div className={`border-t ${p.role === 'owner' ? 'border-slate-200' : 'border-emerald-200'}`}>
                        <div className="space-y-3 px-3 py-3">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-500">订单关系</label>
                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5">
                              {([
                                { value: 'owner', label: '拥有者' },
                                { value: 'funder', label: '历史参与者' },
                              ] as const).map(option => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={Number(p.userId) === Number(formData.userId) && p.role === 'owner' && option.value !== 'owner'}
                                  onClick={() => setParticipants(prev => prev.map(pp => pp.userId === p.userId ? { ...pp, role: option.value } : pp))}
                                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${p.role === option.value ? 'bg-slate-700 text-white' : 'bg-gray-50 text-gray-500'} disabled:opacity-45`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <p className="mt-1.5 text-[11px] leading-4 text-gray-400">拥有者在同一组内完全平级；关系不会因编辑顺序产生主次。</p>
                          </div>

                          {editingOrder?.id ? (
                            <button
                              type="button"
                              onClick={() => openParticipantFullView(p)}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ${p.role === 'owner' ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'}`}
                            >
                              <span className="min-w-0">
                                <span className="block">配置 {p.userName} 的完整个人订单视图</span>
                                <span className="mt-0.5 block font-normal leading-4 opacity-75">页眉、金额、利息、担保、展示方式、拥有者姓名与可见范围均在此处统一设置</span>
                              </span>
                              <ChevronRight className="ml-2 h-4 w-4 shrink-0" />
                            </button>
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-500">请先保存订单，再打开此人的完整个人订单视图。</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 批量添加参与者区域 */}
                {(() => {
                  const rawMembers = (((ledgerData as any)?.members || funderUsers || []) as any[]);
                  const allMembers = rawMembers.filter((m: any, index: number, arr: any[]) => {
                    const id = Number(m.userId || m.id);
                    return id > 0 && arr.findIndex((candidate: any) => Number(candidate.userId || candidate.id) === id) === index;
                  });
                  const availableMembers = allMembers.filter((m: any) => {
                    const id = Number(m.userId || m.id);
                    return id !== Number(formData.userId) && !participants.some(p => p.userId === id);
                  });
                  const visibleMembers = availableMembers
                    .filter((m: any) => !participantUserSearch.trim() || matchesUserSearch(m, participantUserSearch))
                    .slice(0, 40);
                  const selectedMembers = allMembers.filter((m: any) => selectedParticipantUserIds.includes(Number(m.userId || m.id)));
                  const addSelectedParticipants = () => {
                    const buildCollaboratorForm = (m: any, index: number, useParentDefaults = false): ParticipantForm => ({
                      userId: Number(m.userId || m.id),
                      userName: getUserDisplayName(m, String(m.userId || m.id)),
                      avatar: m.avatar,
                      role: newCollaboratorRole,
                      coin: formData.coin,
                      amount: useParentDefaults ? (formData.assetType === 'stock' ? amountInputValue : (financingAmountUsdt || '')) : '',
                      amountCurrency: formData.amountCurrency || 'USDT',
                      interestRateAnnual: normalizeFunderAnnualRate(formData.interestRateAnnual),
                      interestBase: useParentDefaults ? (formData.interestBase || '') : '',
                      interestBaseCurrency: formData.interestBaseCurrency || 'USDT',
                      interestRateCurrency: formData.interestRateCurrency || 'USDT',
                      interestPaymentType: formData.interestPaymentType || '',
                      interestStartDate: formData.interestStartDate || '',
                      displayConfig: { ...displayConfig },
                      marginAlertThreshold: marginAlertThreshold || '',
                      orderSnapshot: {},
                      personalHeaderLabel: '',
                      tags: [],
                      tradeDirection: null,
                      orderFillStatus: 'filled' as const,
                      orderPerspective: 'self' as const,
                      buyDate: formData.buyDate || '',
                      brokerName: '',
                      brokerAccount: '',
                      principalLentOut: false,
                      collateralShareMode: 'none' as const,
                      collateralSource: null,
                      tradingFeeRate: '2',
                      tradingFeeStatus: 'unpaid' as const,
                      visibilityMode: 'self' as const,
                      visibleOwnerIds: [],
                      expanded: index === 0,
                    });
                    const newParticipants: ParticipantForm[] = selectedMembers
                      .filter((m: any) => {
                        const id = Number(m.userId || m.id);
                        return id !== Number(formData.userId) && !participants.some(p => p.userId === id);
                      })
                      .map((m: any, index: number) => buildCollaboratorForm(m, index));
                    if (newParticipants.length === 0) return;
                    // 第一次建立拥有者组时，同步纳入原订单拥有者，便于立即配置其独立视图和可见范围。
                    // 仅新增“参与者”时不需要把主拥有者重复写入协作关系。
                    const primaryOwnerId = Number(formData.userId);
                    const primaryMember = allMembers.find((m: any) => Number(m.userId || m.id) === primaryOwnerId);
                    if (newCollaboratorRole === 'owner' && primaryMember && !participants.some(p => p.userId === primaryOwnerId)) {
                      newParticipants.unshift({ ...buildCollaboratorForm(primaryMember, -1, true), role: 'owner', expanded: false });
                    }
                    setParticipants(prev => [...prev.map(item => ({ ...item, expanded: false })), ...newParticipants]);
                    setParticipantsSectionExpanded(true);
                    setSelectedParticipantUserIds([]);
                    setParticipantUserSearch('');
                    setOwnerAddPanelExpanded(false);
                    toast.success(`已加入 ${newParticipants.length} 位${newCollaboratorRole === 'owner' ? '拥有者' : '参与者'}，请在底部统一保存`);
                  };
                  return (
                    <div className="overflow-hidden rounded-xl border border-dashed border-indigo-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setOwnerAddPanelExpanded(expanded => {
                          if (expanded) {
                            setSelectedParticipantUserIds([]);
                            setParticipantUserSearch('');
                          }
                          return !expanded;
                        })}
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                      >
                        <span>
                          <span className="block text-sm font-medium text-gray-700">添加拥有者 / 参与者</span>
                          <span className="mt-0.5 block text-xs text-gray-400">需要添加时再展开搜索、选择身份与成员</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                          {ownerAddPanelExpanded ? '收起' : '添加'}
                          <ChevronDown className={`h-4 w-4 transition-transform ${ownerAddPanelExpanded ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {ownerAddPanelExpanded && (
                        <div className="border-t border-indigo-100 p-3">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="text-xs leading-5 text-gray-500">先选择要添加的关系，再搜索并勾选成员；共同拥有者与参与者会进入不同的前端页签。</div>
                            {selectedParticipantUserIds.length > 0 && (
                              <button type="button" onClick={() => setSelectedParticipantUserIds([])} className="shrink-0 text-xs text-gray-400">清空</button>
                            )}
                          </div>
                          <div className="mb-3">
                            <div className="mb-1.5 text-xs font-medium text-gray-600">添加身份</div>
                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                              {([
                                { value: 'owner', label: '共同拥有者', hint: '显示在本人订单' },
                                { value: 'funder', label: '参与者', hint: '显示在参与订单' },
                              ] as const).map(option => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setNewCollaboratorRole(option.value)}
                                  className={`rounded-lg px-2 py-2 text-left transition-colors ${newCollaboratorRole === option.value ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
                                >
                                  <span className="block text-xs font-semibold">{option.label}</span>
                                  <span className={`mt-0.5 block text-[10px] ${newCollaboratorRole === option.value ? 'text-slate-200' : 'text-slate-400'}`}>{option.hint}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                      <input
                        type="text"
                        value={participantUserSearch}
                        onChange={e => setParticipantUserSearch(e.target.value)}
                        placeholder="输入姓名 / 账号搜索；也可直接勾选下方成员"
                        className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      />
                      {selectedMembers.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl bg-indigo-50 p-2">
                          {selectedMembers.map((m: any) => {
                            const id = Number(m.userId || m.id);
                            return (
                              <button key={id} type="button" onClick={() => setSelectedParticipantUserIds(prev => prev.filter(value => value !== id))} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-indigo-700 shadow-sm">
                                <span className="max-w-[110px] truncate">{getUserDisplayName(m, String(id))}</span>
                                <X className="h-3 w-3 text-indigo-400" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
                        {visibleMembers.map((m: any) => {
                          const id = Number(m.userId || m.id);
                          const isSelected = selectedParticipantUserIds.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSelectedParticipantUserIds(prev => isSelected ? prev.filter(value => value !== id) : [...prev, id])}
                              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isSelected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                            >
                              {m.avatar ? <img src={m.avatar} className="h-7 w-7 shrink-0 rounded-full object-cover" /> : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">{getUserDisplayName(m, '?').slice(0,1).toUpperCase()}</div>}
                              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{getUserSearchLabel(m)}</span>
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 bg-white'}`}>
                                {isSelected && <Check className="h-3.5 w-3.5" />}
                              </span>
                            </button>
                          );
                        })}
                        {visibleMembers.length === 0 && (
                          <div className="py-5 text-center text-xs text-gray-400">没有可添加的成员</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={selectedParticipantUserIds.length === 0}
                        onClick={addSelectedParticipants}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #4F46E5, #6366F1)' }}
                      >
                        <Plus className="h-4 w-4" />
                        {selectedParticipantUserIds.length > 0 ? `加入 ${selectedParticipantUserIds.length} 位${newCollaboratorRole === 'owner' ? '拥有者' : '参与者'}` : `请先勾选${newCollaboratorRole === 'owner' ? '拥有者' : '参与者'}`}
                      </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {editingOrder?.id && participants.length > 0 && (
                  <button
                    type="button"
                    disabled={saveParticipantFormMutation.isPending}
                    onClick={async () => {
                      try {
                        await persistParticipantViews(Number(editingOrder.id));
                        toast.success('拥有者／参与者设置已保存');
                      } catch {
                        // 错误信息由 mutation 统一提示；保留当前编辑状态以便修正。
                      }
                    }}
                    className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4F46E5, #6366F1)' }}
                  >
                    {saveParticipantFormMutation.isPending ? '保存成员设置中…' : '保存拥有者／参与者设置'}
                  </button>
                )}
                </>)}
              </div>
            )}

            {/* 第一位拥有者的订单内容收起后，不显示其保存按钮；其他成员各自在个人订单页保存。 */}
            {(!hasPrimaryOwnerDrawer || primaryOwnerEditorExpanded) && (
            <div className="border-t border-gray-100 pt-4 pb-2">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || updateParticipantOrderMutation.isPending}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
              >
                {(createMutation.isPending || updateMutation.isPending || updateParticipantOrderMutation.isPending)
                  ? '提交中...'
                  : editingOrder && !isSnapshotScopedEdit
                    ? `保存订单与 ${participants.length} 位参与者`
                    : editingOrder
                      ? '保存修改'
                      : '确认添加'}
              </button>
            </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 删除主订单确认：融资付息只改变记账展示，绝不触碰钱包 */}
      {confirmDeleteId !== null && (() => {
        const targetOrder = (assetOrders as any[]).find((o: any) => Number(o.id) === Number(confirmDeleteId));
        const participantCount = Number(targetOrder?.participantCount ?? targetOrder?._participantCount ?? targetOrder?._participantUserIds?.length ?? 0);
        return (
          <div className="fixed inset-0 z-[500] flex items-center justify-center px-4" onClick={() => setConfirmDeleteId(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-900 mb-2">删除融资付息订单</h3>
              <p className="text-sm text-gray-600 mb-2">订单将移入回收站。本功能只改变记账状态和页面显示，<span className="font-semibold text-gray-800">不会产生任何钱包流水</span>。</p>
              {participantCount > 0 ? (
                <>
                  <p className="text-sm text-indigo-600 mb-4">该主订单关联 {participantCount} 位参与者，请选择参与者子订单的处理方式。</p>
                  <div className="space-y-2.5">
                    <button
                      onClick={() => handleConfirmDelete('retain')}
                      className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
                    >
                      <div className="text-sm font-semibold text-emerald-700">仅删除订单拥有者，保留参与者</div>
                      <div className="text-xs text-emerald-600 mt-1">参与者绿色子订单继续显示并独立计息、记账</div>
                    </button>
                    <button
                      onClick={() => handleConfirmDelete('settle_all')}
                      className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left"
                    >
                      <div className="text-sm font-semibold text-red-700">主订单与参与者一起结算并删除</div>
                      <div className="text-xs text-red-600 mt-1">全部标记为已结算并移入回收站，不操作钱包</div>
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
                  </div>
                </>
              ) : (
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
                  <button onClick={() => handleConfirmDelete('settle_all')} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white">确认删除</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 结清确认：有关联参与者时必须随主订单统一结清 */}
      {confirmSettleId !== null && (() => {
        const targetOrder = (assetOrders as any[]).find((o: any) => Number(o.id) === Number(confirmSettleId));
        const participantCount = Number(targetOrder?.participantCount ?? targetOrder?._participantCount ?? targetOrder?._participantUserIds?.length ?? 0);
        return (
          <div className="fixed inset-0 z-[500] flex items-center justify-center px-4" onClick={() => setConfirmSettleId(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-900 mb-2">确认统一结清</h3>
              {participantCount > 0 ? (
                <p className="text-sm text-indigo-600 mb-2">该主订单关联 <span className="font-semibold">{participantCount}</span> 位参与者。确认后，订单拥有者与全部参与者子订单将使用同一时间一起结清。</p>
              ) : (
                <p className="text-sm text-gray-600 mb-2">结清后该订单利息将停止计算，状态变为「已结清」。</p>
              )}
              <p className="text-sm text-gray-600 mb-3">本功能只改变融资付息的记账状态和页面显示，<span className="font-semibold text-gray-800">不会产生任何钱包流水</span>。</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-3">
                <div className="text-sm font-semibold text-amber-900">利息结算截止日</div>
                <p className="text-xs text-amber-800 mt-1">利息按北京时间自然日累计至该日。默认当天；若实际结清后才补录，可改为约定结息日期。</p>
                <input
                  type="date"
                  value={settleInterestEndDate || getBeijingToday()}
                  min={targetOrder?.interest_start_date ? String(targetOrder.interest_start_date).slice(0, 10) : undefined}
                  max={getBeijingToday()}
                  onChange={(e) => setSettleInterestEndDate(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-amber-500"
                />
              </div>
              <p className="text-sm font-medium text-red-600 mb-5">统一结清后不能单独保留某位参与者为持有中，确定继续？</p>
              <div className="flex gap-3">
                <button onClick={() => { setConfirmSettleId(null); setSettleInterestEndDate(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
                <button
                  onClick={() => {
                    updateMutation.mutate({ id: confirmSettleId, ledgerId, status: 'settled', interestEndDate: settleInterestEndDate || getBeijingToday() });
                    setConfirmSettleId(null);
                    setSettleInterestEndDate('');
                  }}
                  disabled={updateMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white disabled:opacity-50"
                >{updateMutation.isPending ? '结清中...' : participantCount > 0 ? '全部结清' : '确认结清'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 共享担保确认弹窗 */}
      {shareConfirmModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShareConfirmModal(null)}>
          <div className="relative bg-white rounded-2xl p-5 mx-4 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">开启本人订单共享</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">开启后，本订单的担保物将与您名下所有已开启共享的订单共同计算担保缺口。</p>
            {shareConfirmModal.sharedOrders.length > 0 ? (
              <div className="mb-4">
                <div className="text-xs font-semibold text-orange-600 mb-2">⚠️ 当前将与以下 {shareConfirmModal.sharedOrders.length} 张订单共享担保池：</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {shareConfirmModal.sharedOrders.map((o: any) => (
                    <div key={o.orderId} className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">{o.orderNo}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{o.coin}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">担保物 {o.collateralValue.toFixed(0)} U</div>
                        <div className="text-xs text-gray-500">持仓差额 {o.collateralRequired >= 0 ? '+' : ''}{o.collateralRequired.toFixed(0)} U</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 bg-blue-50 rounded-xl px-3 py-2.5 text-sm text-blue-600">目前您名下没有其他已开启共享的订单，开启后将单独形成一个共享池。</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShareConfirmModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
              <button
                onClick={() => {
                  setCollateralShareMode('self');
                  setShareConfirmModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
              >确认开启共享</button>
            </div>
          </div>
        </div>
      )}

      {/* 回收站弹窗 */}
      {showRecycleBin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowRecycleBin(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold">回收站</h3>
              <button onClick={() => setShowRecycleBin(false)} className="p-1">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              {(!deletedOrdersData || (deletedOrdersData as any[]).length === 0) ? (
                <p className="text-center text-gray-400 py-8">回收站为空</p>
              ) : (
                <div className="space-y-3">
                  {(deletedOrdersData as any[]).map((order: any) => {
                    const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
                    const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
                    const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                    const qty = parseFloat(order.buy_quantity || '0');
                    const price = parseFloat(order.buy_price || '0');
                    const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
                    const baseCur = order.interest_base_currency || 'USDT';
                    const rateCur = order.interest_rate_currency || 'USDT';
                    const interestUnit = rateCur === 'CNY' ? '元' : 'U';
                    const rateStr = order.interest_rate_annual || '';
                    const rateAbs = formatFunderAnnualRate(rateStr);
                    const dc = (() => { try { const raw = order.display_config; if (!raw) return null; return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; } })();
                    const show = (key: string) => key === 'marginRate'
                      ? dc?.marginRate === true
                      : dc ? (dc[key] !== false) : true;
                    return (
                      <div key={order.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}>
                        {/* 帽子：标签行 */}
                        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: '#FAFBFF' }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
                              {order.coin}
                            </span>
                            {order.asset_type && (
                              <span className="text-xs px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                {order.asset_type === 'stock' ? '股票' : '数字币'}
                              </span>
                            )}
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                              {statusLabel}
                            </span>
                            {(order.owner_label || order.user_display_name || order.username) && (
                              <span className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                {order.owner_label || order.user_display_name || order.username}
                              </span>
                            )}
                            {(() => {
                              try {
                                const t = order.tags;
                                const tags: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
                                return tags.map((tag: string, i: number) => (
                                  <span key={i} className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                    {tag}
                                  </span>
                                ));
                              } catch { return null; }
                            })()}
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {order.deleted_at ? new Date(order.deleted_at).toLocaleDateString('zh-CN') + ' 删除' : ''}
                          </span>
                        </div>

                        {/* 主体：左右两栏 */}
                        <div className="flex" style={{ minHeight: '80px' }}>
                          {/* 左栏：持有资产 */}
                          <div className="flex-1 p-3 pr-2">
                            <div className="text-[10px] font-medium mb-0.5" style={{ color: '#3B82F6' }}>持有资产</div>
                            <div className="flex items-baseline gap-1 flex-wrap mb-1">
                              <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                                {order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                              </span>
                              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{baseCur === 'CNY' ? 'CNY' : order.coin}</span>
                            </div>
                            <div className="space-y-0.5 text-xs">
                              {order.interest_base && parseFloat(order.interest_base) > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">计息基数</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(order.interest_base).toLocaleString()} {interestUnit}</span>
                                </div>
                              )}
                              {order.buy_date && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">开仓时间</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
                                </div>
                              )}
                              {order.order_no && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">订单编号</span>
                                  <span className="font-mono" style={{ color: '#9CA3AF' }}>{order.order_no}</span>
                                </div>
                              )}
                              {order.interest_payment_type && show('interestPaymentType') && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">付息方式</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.interest_payment_type === 'monthly_prepaid' ? '月付先付' : order.interest_payment_type === 'monthly_postpaid' ? '月付后付' : order.interest_payment_type === 'quarterly' ? '季付' : order.interest_payment_type === 'maturity' ? '到期付' : order.interest_payment_type}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 中间分隔线 */}
                          <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

                          {/* 右栏：利息信息 */}
                          <div className="w-36 p-3 pl-2 flex flex-col">
                            <div className="text-[10px] mb-0.5" style={{ color: '#3B82F6' }}>待结利息{rateAbs ? ` (年化 ${rateAbs}%)` : ''}</div>
                            {price > 0 && (
                              <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-gray-400">买入价</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
                              </div>
                            )}
                            {qty > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">数量</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{qty}</span>
                              </div>
                            )}
                            {order.interest_start_date && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">计息日</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{String(order.interest_start_date).slice(5)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 底部操作按钮 */}
                        <div className="flex gap-2 px-4 pb-3">
                          <button
                            onClick={() => {
                              if (window.confirm('确认恢复该订单？')) {
                                restoreMutation.mutate({ id: order.id, ledgerId });
                              }
                            }}
                            className="flex-1 py-2 rounded-xl text-sm font-medium bg-green-50 text-green-600 border border-green-200"
                          >
                            恢复
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('确认永久删除？此操作不可恢复！')) {
                                permanentDeleteMutation.mutate({ id: order.id, ledgerId });
                              }
                            }}
                            className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200"
                          >
                            永久删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
