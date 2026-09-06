import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getUserDisplayName, getUserSearchLabel, matchesUserSearch } from "@/lib/userIdentity";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X, Check } from "lucide-react";
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

export default function FunderManagement({ ledgerIdProp, hideHeader, adminOnly, financeOnly, onRecycleBinRef }: FunderManagementProps = {}) {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, routeParams2] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = ledgerIdProp || (params?.id ? parseInt(params.id) : (routeParams2?.id ? parseInt(routeParams2.id) : 0));
  const trpcUtils = trpc.useUtils();

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
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
  // 标签输入状态
  const [tagInput, setTagInput] = useState('');
  // 担保货币列表：[{ coin: 'BTC', qty: '' }, ...]
  const [collateralAssets, setCollateralAssets] = useState<{ coin: string; qty: string; note?: string }[]>([]);
  // 担保货币编辑模式：编辑已有订单时默认只读，点「编辑」才可改；新建订单时恒为可编辑
  const [collateralEditMode, setCollateralEditMode] = useState(false);
  // 共享担保模式：none=不共享, self=本人订单共享, cross=与他人共享（占位）
  const [collateralShareMode, setCollateralShareMode] = useState<'none' | 'self' | 'cross'>('none');
  // 共享担保确认弹窗
  const [shareConfirmModal, setShareConfirmModal] = useState<{ mode: 'self' | 'cross'; sharedOrders: any[] } | null>(null);
  // 调用其他账本担保物（collateralSource）
  const [collateralSourceMode, setCollateralSourceMode] = useState<'manual' | 'external'>('manual');
  const [collateralSource, setCollateralSource] = useState<{ ledgerId: number; tagName: string } | null>(null);
  const [interestTagName, setInterestTagName] = useState<string>(''); // 利息标签（与保证金标签联动）

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
    marginRate: true,
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
    approxCollateralValue: 'hidden',
    // 股票专属字段
    brokerName: true,
    brokerAccount: true,
    // 多空方向标签显示开关
    showTradeDirection: true,
    // 期权 Greeks 面板
    showGreeks: false,
    // 浮动盈亏（默认关闭）
    floatPnl: false,
    // 52号账本：交易手续费默认隐藏，由控制开关决定是否向前端展示
    tradingFee: false,
    // 仅控制普通用户前端的下载箭头；管理员订单列表始终可下载
    allowUserImageDownload: true,
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean | string>>(DEFAULT_DISPLAY_CONFIG);
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
    expanded: boolean; // UI 折叠状态
  };
  const [participants, setParticipants] = useState<ParticipantForm[]>([]);
  const [participantUserSearch, setParticipantUserSearch] = useState('');
  const [selectedParticipantUserIds, setSelectedParticipantUserIds] = useState<number[]>([]);
  const [participantsSectionExpanded, setParticipantsSectionExpanded] = useState(false);
  const saveParticipantFormMutation = trpc.ledger.funderSaveParticipantFullConfig.useMutation({
    onSuccess: (_result, vars) => {
      trpcUtils.ledger.funderGetOrderParticipants.invalidate({ orderId: vars.orderId, ledgerId: vars.ledgerId });
      refetchOrders();
    },
    onError: (err) => toast.error(`参与者保存失败：${err.message}`),
  });
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
      userName: p.nickname || p.username || p.userName || String(p.user_id),
      avatar: p.avatar,
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
      expanded: false,
    }));
    setParticipants(loaded);
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
  // 弹窗状态提升：存储当前打开弹窗的 orderId，null 表示关闭（防止子组件因数据刷新重渲染导致弹窗自动关闭）
  const [collateralInfoOrderId, setCollateralInfoOrderId] = useState<number | null>(null);
  const [interestTipOrderId, setInterestTipOrderId] = useState<number | null>(null);
  const [marginInfoOrderId, setMarginInfoOrderId] = useState<number | null>(null);

  // 担保价值（在 assetOrdersData 定义后使用）——放到这里是为了先定义类型，实际计算在下方的 derivedCollateral 中
  // 当前登录用户信息（用于备注权限控制）
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery({ id: ledgerId }, { enabled: ledgerId > 0 });
  const isAdminUser = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';

  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0 && isAdminUser }
  );

  const { data: assetOrdersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}), ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0, staleTime: 3000, refetchInterval: 3000, placeholderData: (prev: any) => prev }
  );
  // funderGetAssetOrders 返回 { orders, livePrices }，取 orders 数组
  const assetOrders = (assetOrdersData as any)?.orders ?? assetOrdersData ?? [];
  const getParticipantUserIdForOrder = (order: any): number | undefined => {
    const isParticipantOrder = !!order?.participantInfo || !!order?._isParticipant || !!order?._fromFunder || order?.order_perspective === 'other';
    return isParticipantOrder ? (Number(order?.participantInfo?.userId) || undefined) : undefined;
  };
  const formLivePrices: Record<string, number> = (assetOrdersData as any)?.livePrices ?? {};
  // 共享担保池数据按当前编辑视角隔离：参与者子订单使用参与者自己的池。
  const sharedCollateralUserId = getParticipantUserIdForOrder(editingOrder) ?? editingOrder?.user_id ?? (formData as any)?.userId;
  const { data: sharedPoolData } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId, userId: Number(sharedCollateralUserId) },
    { enabled: ledgerId > 0 && !!sharedCollateralUserId && collateralShareMode === 'self', staleTime: 5000 }
  );
  const { data: cnyRateData } = trpc.exchange.getRate.useQuery({ fromcoin: "USD", tocoin: "CNY", money: 1 }, { staleTime: 3000, refetchInterval: 3000 });
  // 获取37号账本活跃的右侧保证金标签列表（供下拉框使用）
  const { data: activeMarginTags } = trpc.ledger.getActiveMarginTags.useQuery(
    { ledgerId: 37 },
    { enabled: collateralSourceMode === 'external', staleTime: 30000 }
  );
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
  const { data: allOrdersData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}), ...(financeOnly ? { financeOnly: true } : {}) },
    { enabled: ledgerId > 0, staleTime: 30000 }
  );
  const allOrders: any[] = (allOrdersData as any)?.orders ?? allOrdersData ?? [];

  // 强制转成数字，避免 MySQL 返回字符串导致 tRPC z.number() 校验失败
  // 编辑面板专用：查询当前编辑订单的结息记录列表
  // enabled 只依赖 editingOrderId，不加 participantInfo 限制，确保管理员编辑任何订单都能查到
  const editingParticipantUserId = getParticipantUserIdForOrder(editingOrder);
  const { data: editingOrderPayments, refetch: refetchEditingPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: editingOrderId!, participantUserId: editingParticipantUserId },
    { enabled: !!editingOrderId && ledgerId > 0, staleTime: 0 }
  );
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

  // 担保缺口 = 订单总金额 - 担保价值
  const computedCollateralGap = useMemo(() => {
    const orderAmt = parseFloat(financingAmountUsdt || '0');
    if (orderAmt <= 0) return null;
    return orderAmt - computedCollateralValue;
  }, [computedCollateralValue, financingAmountUsdt]);

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
    const floatPnl = currentValue !== null ? currentValue - buyValue : null;
    return floatPnl !== null
      ? computedCollateralValue + floatPnl - previewAccrued
      : computedCollateralValue - previewAccrued;
  }, [computedCollateralValue, formLivePrices, formData.coin, formData.buyQuantity, formData.buyPrice, previewAccrued]);

   const createMutation = trpc.ledger.funderCreateAssetOrder.useMutation({
    onSuccess: () => {
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
    onSuccess: () => {
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
          await saveParticipantFormMutation.mutateAsync({
            orderId: Number(orderId),
            ledgerId,
            participants: participants.map((p, i) => ({
              userId: p.userId,
              sortOrder: i,
              amount: p.amount || undefined,
              amountCurrency: p.amountCurrency || undefined,
              interestRate: normalizeFunderAnnualRate(p.interestRateAnnual) || undefined,
              interestBase: p.interestBase || undefined,
              interestBaseCurrency: p.interestBaseCurrency || undefined,
              interestPaymentType: p.interestPaymentType || undefined,
              interestStartDate: p.interestStartDate || undefined,
              interestRateCurrency: p.interestRateCurrency || undefined,
              displayConfig: JSON.stringify({
                ...p.displayConfig,
                allowUserImageDownload: Boolean(displayConfig.allowUserImageDownload),
                marginAlertThreshold: p.marginAlertThreshold || undefined,
                financingInputAmount: p.amount || '',
                financingInputCurrency: p.amountCurrency || formData.amountCurrency || 'USDT',
              }),
            })),
          });
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
      setShowForm(false);
      setEditingOrder(null);
      setParticipants([]);
      participantsLoadedRef.current = null;
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
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
  const persistCollateral = (assets: { coin: string; qty: string; note?: string }[]) => {
    const oid = editingOrder?.id ? Number(editingOrder.id) : null;
    if (!oid) return; // 新建态无订单 ID，跳过（随订单一起保存）
    const cleanAssets = assets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)));
    const participantUserId = editingOrder?.participantInfo?.userId ?? editingOrder?.participantInfo?.user_id;
    if (participantUserId) {
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
        displayName: p.username || p.nickname || p.userName || `用户${p.user_id}`,
        role: p.role as ParticipantRole,
        sortOrder: p.sort_order || 0,
        rate: (p.commission_rate != null && p.commission_rate !== '') ? String(p.commission_rate) : (p.rate != null ? String(p.rate) : ''),
      }));
      setParticipantsList(mapped);
      // 已有保存记录 → 默认只读态；从未配置过 → 直接进编辑态方便首次添加
      setParticipantsEditMode(mapped.length === 0);
      const mappedMembers = (result.members || []).map((m: any) => ({
        userId: m.userId,
        displayName: m.username || m.nickname || m.userName || `用户${m.userId}`,
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
      tags: [] as string[],
      principalLentOut: false,
      tradingFeeRate: '2',
      tradingFeeStatus: 'unpaid' as 'unpaid' | 'half_paid' | 'paid',
      brokerName: '',
      brokerAccount: '',
    });
    setTagInput('');
    setOptionFormData({ optionCurrency: 'BTC', direction: 'long_call', exerciseDate: '', deribitLabel: '', strikePrice: '', premium: '', premiumDenomination: 'USDT', buyQty: '' });
    interestBaseTouchedRef.current = false; // 新建订单：允许融资金额(U)自动带入计息基数
    setCollateralAssets([]);
    setCollateralEditMode(true); // 新建订单：担保货币恒为可编辑
    setCollateralShareMode('none');
    setCollateralSourceMode('manual');
    setCollateralSource(null);
    setInterestTagName('');
    setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
    setEditingOrder(null);
    setParticipantsSectionExpanded(true);
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
    setParticipantsSectionExpanded(false);
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
    // 加载担保货币
    try {
      const ca = order.collateral_assets;
      if (ca) {
        const parsed = typeof ca === 'string' ? JSON.parse(ca) : ca;
        setCollateralAssets(Array.isArray(parsed) ? parsed : []);
      } else {
        setCollateralAssets([]);
      }
    } catch { setCollateralAssets([]); }
    // 编辑已有订单：担保货币默认只读态，点「编辑」才可改
    setCollateralEditMode(false);
    // 加载共享担保模式
    const csm = (order as any).collateral_share_mode;
    setCollateralShareMode(csm === 'self' || csm === 'cross' ? csm : 'none');
    // 加载调用其他账本担保物
    try {
      const cs = (order as any).collateral_source;
      if (cs) {
        const parsed = typeof cs === 'string' ? JSON.parse(cs) : cs;
        if (parsed && parsed.ledgerId && parsed.tagName) {
          setCollateralSourceMode('external');
          setCollateralSource({ ledgerId: parsed.ledgerId, tagName: parsed.tagName });
          setInterestTagName(parsed.interestTagName || parsed.tagName || '');
        } else {
          setCollateralSourceMode('manual');
          setCollateralSource(null);
          setInterestTagName('');
        }
      } else {
        setCollateralSourceMode('manual');
        setCollateralSource(null);
        setInterestTagName('');
      }
    } catch {
      setCollateralSourceMode('manual');
      setCollateralSource(null);
      setInterestTagName('');
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
        setDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, ...safeConfig });
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

  const handleSubmit = () => {
    // 新建模式必须选择用户
    if (!editingOrder && !formData.userId) {
      toast.error('请选择用户');
      return;
    }
    // 股票历史订单的 amount 按所选融资币种原值保存；数字币和期权统一保存USDT基准。
    // 三种类型都支持融资金额、买入价格、币数任选两项推算第三项。
    let finalAmount: string;
    const price = parseFloat(formData.buyPrice || '0');
    const quantity = parseFloat(formData.buyQuantity || '0');
    const hasCompleteLinkedValues = !!financingAmountUsdt && parseFloat(financingAmountUsdt) > 0 && price > 0 && quantity > 0;
    if (formData.assetType === 'stock') {
      finalAmount = (() => { const v = parseFloat(amountInputValue); return isNaN(v) ? '' : v.toFixed(2); })();
      if (!finalAmount || parseFloat(finalAmount) <= 0) {
        toast.error('请填写融资金额');
        return;
      }
    } else if (formData.assetType === 'crypto_option' && !hasCompleteLinkedValues) {
      const premium = parseFloat(optionFormData.premium || '0');
      const optionQty = parseFloat(optionFormData.buyQty || '0');
      const premiumTotalUsdt = premium > 0 && optionQty > 0
        ? toUsdtBase(premium * optionQty, optionFormData.premiumDenomination)
        : null;
      finalAmount = premiumTotalUsdt && premiumTotalUsdt > 0
        ? premiumTotalUsdt.toFixed(4)
        : (editingOrder ? formData.originalAmount : '');
      if (!finalAmount || parseFloat(finalAmount) <= 0) {
        toast.error('请在三字段中手动输入任意两项，或填写权利金和数量');
        return;
      }
    } else {
      finalAmount = financingAmountUsdt || (editingOrder ? formData.originalAmount : '');
      if (!finalAmount || parseFloat(finalAmount) <= 0 || price <= 0 || quantity <= 0) {
        toast.error('请手动输入任意两项，确认第三项已自动推算');
        return;
      }
    }
    const payload = {
      ledgerId,
      coin: formData.coin,
      amount: finalAmount,
      amountCurrency: formData.amountCurrency || undefined,
      buyPrice: formData.buyPrice || undefined,
      buyDate: formData.buyDate || undefined,
      buyQuantity: formData.buyQuantity || undefined,
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
      // 编辑模式：始终传 collateralAssets（空数组表示清空），新建模式：为空时传 undefined
      collateralAssets: editingOrder
        ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
        : collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))).length > 0
          ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
          : undefined,
      // 提交前确保 displayConfig 所有値都是 boolean
      displayConfig: {
        ...Object.fromEntries(
          Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean' || typeof v === 'string')
        ),
        ...(marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? { marginAlertThreshold: parseFloat(marginAlertThreshold) } : {}),
        rate_negative: normalizeFunderAnnualRate(formData.interestRateAnnual).startsWith('-'),
        financingInputAmount: amountInputValue || '',
        financingInputCurrency: formData.amountCurrency || 'USDT',
        linkedManualFields: manualLinkedFieldsRef.current.join(','),
        linkedDerivedField: derivedLinkedField || '',
      } as Record<string, boolean | number | string>,
      assetType: formData.assetType || undefined,
      tradeDirection: (['long', 'short'] as const).includes(formData.tradeDirection as any) ? (formData.tradeDirection as 'long' | 'short') : null,
      ownerLabel: formData.ownerLabel || undefined,
      tags: formData.tags.length > 0 ? formData.tags : undefined,
      collateralShareMode: collateralShareMode !== 'none' ? collateralShareMode : undefined,
      collateralSource: collateralSourceMode === 'external' && collateralSource
        ? { ...collateralSource, interestTagName: interestTagName || collateralSource.tagName }
        : null,
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
    if (editingOrder?.participantInfo) {
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
          collateral_assets: payload.collateralAssets ? JSON.stringify(payload.collateralAssets) : null,
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
                  : (funderUsers as any[])?.find((u: any) => u.userId === selectedUserId)
                    ? (() => { const _u = (funderUsers as any[]).find((u: any) => u.userId === selectedUserId); return getUserDisplayName(_u, '成员'); })()
                    : '选择成员'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1 shrink-0" />
            </button>
            {showUserDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden" style={{ minWidth: '240px', width: 'max-content', maxWidth: '90vw' }}>
                {(funderUsers as any[])?.length > 10 && (
                  <div className="px-3 pt-2 pb-1">
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={e => setUserSearchText(e.target.value)}
                      placeholder="搜索成员..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none"
                      autoFocus
                    />
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto overflow-x-hidden">
                  <button
                    onClick={() => { setSelectedUserId(null); setShowUserDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                    style={{ color: selectedUserId === null ? '#1A56DB' : '#374151', fontWeight: selectedUserId === null ? 600 : 400 }}
                  >全部成员</button>
                  {(funderUsers as any[])?.filter((u: any) => {
                    if (!matchesUserSearch(u, userSearchText)) return false;
                    // 中侧（管理）必须显示全部 owner/admin，即使尚无订单，方便管理员先选人再创建首张订单。
                    if (adminOnly) return true;
                    // 其他分栏继续只显示已有主订单或参与订单的用户，避免列表被空成员淹没。
                    const hasOrders = allOrders.some((o: any) => o.userId === u.userId || o.user_id === u.userId || (o._participantUserIds && o._participantUserIds.includes(u.userId)));
                    return hasOrders;
                  }).map((u: any) => {
                    const userOrders = allOrders.filter((o: any) => o.userId === u.userId || o.user_id === u.userId || (o._participantUserIds && o._participantUserIds.includes(u.userId)));
                    const activeCount = userOrders.filter((o: any) => o.status === 'active').length;
                    const settledCount = userOrders.filter((o: any) => o.status === 'settled' || o.status === 'cancelled').length;
                    return (
                    <button
                      key={u.userId}
                      onClick={() => { setSelectedUserId(u.userId); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                      style={{ color: selectedUserId === u.userId ? '#1A56DB' : '#374151', fontWeight: selectedUserId === u.userId ? 600 : 400 }}
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
            订单列表 {assetOrders ? `· ${(assetOrders as any[]).length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !assetOrders || (assetOrders as any[]).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无订单</div>
            </div>
          ) : (() => {
            const filteredOrders = [...(assetOrders as any[])].filter((o: any) => {
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
                <div className="text-gray-400 text-sm">暂无订单</div>
              </div>
            ) : (
            <div className="space-y-3">
              {filteredOrders.map((order: any) => {
                const isInvited = !!order.participantInfo;
                return (
                  <FunderOrderCard
                    key={order.id}
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
                    onConfirmSettle={setConfirmSettleId}
                    showCollateralInfo={collateralInfoOrderId === order.id}
                    setShowCollateralInfo={(v) => setCollateralInfoOrderId(v ? order.id : null)}
                    showInterestTip={interestTipOrderId === order.id}
                    setShowInterestTip={(v) => setInterestTipOrderId(v ? order.id : null)}
                    showMarginInfo={marginInfoOrderId === order.id}
                    setShowMarginInfo={(v) => setMarginInfoOrderId(v ? order.id : null)}
                    allOrders={assetOrders as any[]}
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
                {editingOrder?.participantInfo ? '受邀订单配置' : editingOrder ? '编辑订单' : '添加订单'}
              </h3>
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
              {/* 受邀订单：只读提示 */}
              {editingOrder?.participantInfo && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  <span className="text-green-600 mt-0.5">✓</span>
                  <div>
                    <div className="text-sm font-medium text-green-800">受邀订单</div>
                    <div className="text-xs text-green-600 mt-0.5">订单基础信息为只读，仅可配置佣金相关参数</div>
                  </div>
                </div>
              )}
              {/* 类型 */}
              {!editingOrder?.participantInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">类型<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，单选</span></label>
                  <div className="flex gap-2 flex-wrap">
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
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={
                          formData.assetType === opt.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 做多/做空 — 仅数字币时显示 */}
              {!editingOrder?.participantInfo && (formData.assetType === 'crypto' || formData.assetType === '') && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">方向<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，数字币专用</span></label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, tradeDirection: d.tradeDirection === 'long' ? null : 'long' }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={formData.tradeDirection === 'long'
                        ? { background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff' }
                        : { backgroundColor: '#F0FDF4', color: '#059669', border: '1px solid #A7F3D0' }
                      }
                    >
                      做多
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, tradeDirection: d.tradeDirection === 'short' ? null : 'short' }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={formData.tradeDirection === 'short'
                        ? { background: 'linear-gradient(135deg, #DC2626, #EF4444)', color: '#fff' }
                        : { backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                      }
                    >
                      做空
                    </button>
                  </div>
                </div>
              )}

              {/* 成交状态 */}
              {!editingOrder?.participantInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">成交状态</label>
                  <div className="flex gap-3">
                    {([{ value: 'filled', label: '已成交' }, { value: 'pending', label: '挂单中' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(d => ({ ...d, orderFillStatus: opt.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors"
                        style={
                          formData.orderFillStatus === opt.value
                            ? opt.value === 'filled'
                              ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                              : { background: 'linear-gradient(135deg, #EA580C, #F97316)', color: '#fff', borderColor: 'transparent' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280', borderColor: 'transparent' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 归属分类 */}
              {!editingOrder?.participantInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">归属分类</label>
                  <div className="flex gap-3">
                    {([{ value: 'self', label: '本人' }, { value: 'other', label: '他人' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(d => ({ ...d, orderPerspective: opt.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors"
                        style={
                          formData.orderPerspective === opt.value
                            ? opt.value === 'self'
                              ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff', borderColor: 'transparent' }
                              : { background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', color: '#fff', borderColor: 'transparent' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280', borderColor: 'transparent' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 自定义标签 */}
              {!editingOrder?.participantInfo && (
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
              {!editingOrder?.participantInfo && (
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
              </div>
              {/* 购买币种已移至三联最后一行（与币数并排） */}

              {/* 融资金额 / 买入价格 / 购买币种+币数 三字段联动（统一圆角容器框） */}
              {formData.assetType === 'crypto_option' && (
                <div className="text-xs text-purple-500 bg-purple-50 rounded-xl px-3 py-2">
                  期权参数保留在下方；融资金额、买入价格、币数仍可任选两项自动推算第三项
                </div>
              )}
              <div className="space-y-3">
                <span className="block text-xs text-gray-400">
                  最后手动输入的两项保持不变，第三项显示“≈ 自动推算”
                </span>
                {/* 融资金额 + 融资币种（同行并排） */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">融资金额{derivedLinkedField === 'amount' && <span className="font-normal text-orange-500">≈ 自动推算</span>}</label>
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
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">购买币种{editingOrder && <span className="ml-1 text-xs text-orange-500 font-normal">(不可改)</span>}</label>
                    <select
                      value={formData.coin}
                      onChange={e => {
                        if (editingOrder) return;
                        const nextCoin = e.target.value as CoinType;
                        setFormData(d => ({ ...d, coin: nextCoin }));
                        if (formData.assetType === 'crypto_option') {
                          setOptionFormData(d => ({ ...d, optionCurrency: nextCoin, deribitLabel: '', exerciseDate: '', strikePrice: '' }));
                        }
                      }}
                      disabled={!!editingOrder}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none disabled:text-gray-300"
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

              {/* 期权专属字段（在隐藏 div 外面，期权类型时正常显示） */}
              {formData.assetType === 'crypto_option' && (
                <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <div className="text-xs font-semibold text-purple-600 mb-1">期权参数</div>
                  {/* 标的币种 + 方向 */}
                  <div className="flex gap-2">
                    <div style={{ width: '40%' }}>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">标的币种</label>
                      <select
                        value={optionFormData.optionCurrency}
                        onChange={e => {
                          const nextCoin = e.target.value as CoinType;
                          setOptionFormData(d => ({ ...d, optionCurrency: nextCoin, deribitLabel: '', exerciseDate: '', strikePrice: '' }));
                          if (!editingOrder) setFormData(d => ({ ...d, coin: nextCoin }));
                        }}
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

              {/* 受邀订单专属：佣金配置区 */}
              {editingOrder?.participantInfo && (
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

              {/* 担保货币分隔线：参与者使用自己的独立担保物，不继承订单拥有者。 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: editingOrder?.participantInfo ? '#A7F3D0' : collateralShareMode === 'self' ? '#FECACA' : '#F3F4F6' }} />
                <span className="text-xs shrink-0" style={{ color: editingOrder?.participantInfo ? '#047857' : collateralShareMode === 'self' ? '#DC2626' : '#9CA3AF', fontWeight: editingOrder?.participantInfo || collateralShareMode === 'self' ? 600 : 400 }}>
                  {editingOrder?.participantInfo ? '参与者独立担保' : collateralShareMode === 'self' ? '共享担保' : '担保货币'}
                </span>
                <div className="flex-1 h-px" style={{ background: editingOrder?.participantInfo ? '#A7F3D0' : collateralShareMode === 'self' ? '#FECACA' : '#F3F4F6' }} />
              </div>
              {editingOrder?.participantInfo && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                  这里添加或修改的是当前参与者自己的担保物，不会改变订单拥有者或其他参与者的担保物。
                </div>
              )}

              {/* 担保物来源切换 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && formData.assetType === 'stock' && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => { setCollateralSourceMode('manual'); setCollateralSource(null); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    collateralSourceMode === 'manual'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >手动输入</button>
                <button
                  type="button"
                  onClick={() => setCollateralSourceMode('external')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    collateralSourceMode === 'external'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >调用其他账本担保物</button>
              </div>
              )}

              {/* 调用其他账本担保物：下拉框选择标签 */}
              {!editingOrder?.participantInfo && formData.assetType === 'stock' && collateralSourceMode === 'external' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
                {/* 保证金标签 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600">保证金标签（37号账本）</div>
                  <select
                    value={collateralSource?.tagName || ''}
                    onChange={e => {
                      const tag = e.target.value;
                      setCollateralSource(tag ? { ledgerId: 37, tagName: tag } : null);
                      // 联动：保证金选了，利息同步
                      if (tag) setInterestTagName(tag);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                  >
                    <option value="">请选择标签</option>
                    {(activeMarginTags as any[])?.map((t: any) => (
                      <option key={t.tagName} value={t.tagName}>{t.tagName}</option>
                    ))}
                  </select>
                </div>
                {/* 利息标签 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600">利息标签（37号账本）</div>
                  <select
                    value={interestTagName}
                    onChange={e => {
                      const tag = e.target.value;
                      setInterestTagName(tag);
                      // 联动：利息选了，保证金同步
                      if (tag) setCollateralSource({ ledgerId: 37, tagName: tag });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none bg-white"
                  >
                    <option value="">请选择标签</option>
                    {(activeMarginTags as any[])?.map((t: any) => (
                      <option key={t.tagName} value={t.tagName}>{t.tagName}</option>
                    ))}
                  </select>
                </div>
                {(collateralSource || interestTagName) && (
                  <div className="text-xs text-blue-500 pt-0.5">
                    {collateralSource && <span>保证金：{collateralSource.tagName}</span>}
                    {collateralSource && interestTagName && <span className="mx-1.5 text-blue-300">·</span>}
                    {interestTagName && <span>利息：{interestTagName}</span>}
                  </div>
                )}
              </div>
              )}

              {/* 担保货币列表：参与者始终编辑自己的快照；拥有者按所选来源编辑。 */}
              {(editingOrder?.participantInfo || collateralSourceMode === 'manual') && (
              <div className="space-y-3">
                {/* 只读态：编辑已有订单且未进入编辑模式时 */}
                {editingOrder?.id && !collateralEditMode ? (
                  <>
                    {collateralAssets.filter(a => a.coin && a.qty !== '').length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">暂无担保货币</div>
                    ) : (
                      collateralAssets.filter(a => a.coin && a.qty !== '').map((item, idx) => (
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
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors"
                    >编辑担保货币</button>
                  </>
                ) : (
                <>
                {collateralAssets.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select
                        value={item.coin}
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
                        onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, qty: e.target.value } : a))}
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="数量"
                        style={{ width: '0' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
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
                      onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, note: e.target.value } : a))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="备注（选填）"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCollateralAssets(prev => [...prev, { coin: 'BTC', qty: '', note: '' }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-blue-300 text-sm text-blue-500 font-medium flex items-center justify-center gap-1"
                >
                  <span className="text-base leading-none">+</span> 添加担保货币
                </button>
                {/* 编辑已有订单时，整组独立保存 */}
                {editingOrder?.id && (
                  <button
                    type="button"
                    onClick={() => persistCollateral(collateralAssets)}
                    disabled={saveCollateralMutation.isPending || saveParticipantCollateralMutation.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                  >{saveCollateralMutation.isPending || saveParticipantCollateralMutation.isPending ? '保存中…' : editingOrder?.participantInfo ? '保存参与者担保货币' : '保存担保货币'}</button>
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
                          computedCollateralGap > 0 ? 'text-red-500' : 'text-green-600'
                        }`}>
                          {computedCollateralGap > 0 ? '+' : ''}{computedCollateralGap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                        </span>
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
                  <div className="text-xs font-medium text-indigo-500 mb-2">用户前端权限</div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-700">允许用户下载图片</div>
                      <div className="mt-0.5 text-xs leading-5 text-gray-400">默认开启；只控制用户前端，管理员订单列表始终可下载</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDisplayConfig(c => ({ ...c, allowUserImageDownload: !c.allowUserImageDownload }))}
                      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                        displayConfig.allowUserImageDownload ? 'bg-indigo-500' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        displayConfig.allowUserImageDownload ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100" />
                {/* 左栏字段 */}
                <div className="px-4 pt-3 pb-1">
                  <div className="text-xs font-medium text-blue-500 mb-2">左栏：持有资产</div>
                  <div className="space-y-2">
                    {[
                      { key: 'buyPrice', label: '买入币价' },
                      { key: 'buyValue', label: '买入价値' },
                      { key: 'buyDate', label: '开仓时间' },
                      { key: 'openPrice', label: '开仓币价' },
                      { key: 'todayPrice', label: '当前币价' },
                      { key: 'floatPnl', label: '浮动盈亏' },
                      // 当前价値已移至持有资产括号显示，不再单独作为开关
                      { key: 'holdDuration', label: '持有时长' },
                      { key: 'orderNo', label: '订单编号' },
                      { key: 'aiIcon', label: 'AI图标（持有资产右上角）' },
                      { key: 'assetType', label: '资产类型标签（股票/数字币）' },
                      { key: 'showOwnerName', label: '显示订单所有者名字' },
                      ...(formData.assetType === 'crypto' ? [
                        { key: 'showTradeDirection', label: '多空方向标签（数字币专属）' },
                      ] : []),
                      ...(formData.assetType === 'stock' ? [
                        { key: 'brokerName', label: '证券公司（股票专属）' },
                        { key: 'brokerAccount', label: '证券账号（股票专属）' },
                      ] : []),
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{label}</span>
                        <button
                          type="button"
                          onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                          className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                            displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏上半：待结利息区 */}
                <div className="px-4 pb-2">
                  <div className="text-xs font-medium text-blue-500 mb-2">右栏上半：待结利息区</div>
                  <div className="space-y-2">
                    {[
                      { key: 'accruedInterest', label: '待结利息（标题+大数字）' },
                      { key: 'paidInterest', label: '已结利息' },
                      { key: 'interestBase', label: '计息基数' },
                      { key: 'interestStartDate', label: '计息日期' },
                      { key: 'interestDuration', label: '计息时长' },
                      { key: 'interestPaymentType', label: '付息方式' },
                      { key: 'collateralCoin', label: '担保货币' },
                      { key: 'collateralValue', label: '担保价値' },
                      { key: 'collateral', label: '担保缺口' },
                      { key: 'marginRate', label: '保证金率' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{label}</span>
                          <button
                            type="button"
                            onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                              displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                        {/* 保证金率预警阈值输入框（仅在保证金率开关打开时显示） */}
                        {key === 'marginRate' && displayConfig.marginRate && (
                          <div className="mt-1.5 flex items-center gap-2 pl-1">
                            <span className="text-xs text-gray-400 shrink-0">低于</span>
                            <input
                              type="number"
                              min="0"
                              max="200"
                              step="1"
                              value={marginAlertThreshold}
                              onChange={e => setMarginAlertThreshold(e.target.value)}
                              placeholder="如：80"
                              className="w-16 text-xs text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                              style={{ color: '#D97706' }}
                            />
                            <span className="text-xs text-gray-400 shrink-0">% 时预警</span>
                            {marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 && (
                              <span className="text-xs text-orange-500 font-medium">已设置</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
                <div className="px-4 pb-2">
                  <div className="text-xs font-medium text-blue-500 mb-2">约等于显示控制</div>
                  <div className="space-y-3">
                    {([
                      { key: 'approxHolding', label: '持有资产约等于' },
                      { key: 'approxInterest', label: '待结利息约等于' },
                      { key: 'approxPaid', label: '已结利息约等于' },
                      { key: 'approxCollateralItem', label: '担保货币约等于' },
                      { key: 'approxCollateralValue', label: '担保价値约等于' },
                    ] as { key: string; label: string }[]).map(({ key, label }) => (
                      <div key={key}>
                        <div className="text-sm text-gray-600 mb-1">{label}</div>
                        <div className="flex gap-2">
                          {(['hidden', 'U', 'CNY'] as const).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setDisplayConfig(c => ({ ...c, [key]: opt }))}
                              className={`flex-1 py-1 text-xs rounded-lg border transition-colors ${
                                displayConfig[key] === opt
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-500 border-gray-200'
                              }`}
                            >
                              {opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ U' : '≈ 元'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {ledgerId === 52 && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-gray-700">手续费</span>
                        <p className="text-xs text-gray-400 mt-0.5">开启后，订单卡片和订单详情显示参考手续费及已付进度</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDisplayConfig(c => ({ ...c, tradingFee: !Boolean(c.tradingFee) }))}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          displayConfig.tradingFee ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                        aria-label="显示手续费"
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          displayConfig.tradingFee ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 借出本金开关 */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">借出本金</span>
                      <p className="text-xs text-gray-400 mt-0.5">开启后担保缺口计算将扣除计息基数（本金）</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, principalLentOut: !d.principalLentOut }))}
                      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                        formData.principalLentOut ? 'bg-orange-500' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        formData.principalLentOut ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* Greeks 开关（仅期权类型显示） */}
                {formData.assetType === 'crypto_option' && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700">Greeks 面板</span>
                        <p className="text-xs text-gray-400 mt-0.5">开启后显示 Delta / Gamma / Vega / Theta 等期权参数</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDisplayConfig(c => ({ ...c, showGreeks: !c.showGreeks }))}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          displayConfig.showGreeks !== false ? 'bg-purple-500' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          displayConfig.showGreeks !== false ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏下半：收益分成区 */}
                <div className="px-4 pb-3">
                  <div className="text-xs font-medium text-blue-500 mb-2">右栏下半：收益分成区</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">收益分成（开启后显示下半区）</span>
                      <button
                        type="button"
                        onClick={() => setDisplayConfig(c => ({ ...c, profitShare: !c.profitShare }))}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          displayConfig.profitShare ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          displayConfig.profitShare ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
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
                    return m?.username || m?.nickname || m?.name || editingOrder?.userName || null;
                  }
                  return editingOrder?.userName || null;
                })();
                const previewOrder: any = {
                  id: editingOrder?.id ?? -1,
                  order_no: editingOrder?.order_no ?? null,
                  user_id: formData.userId,
                  owner_label: ownerLabel,
                  coin: formData.coin,
                  asset_type: formData.assetType || null,
                  buy_price: formData.buyPrice || null,
                  buy_quantity: formData.buyQuantity || null,
                  amount: formData.assetType === 'stock' ? (amountInputValue || null) : (financingAmountUsdt || null),
                  amount_currency: formData.amountCurrency || 'USDT',
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
                  trade_direction: formData.tradeDirection || null,
                  display_config: JSON.stringify({
                    ...displayConfig,
                    marginAlertThreshold: marginAlertThreshold || undefined,
                    rate_negative: normalizeFunderAnnualRate(formData.interestRateAnnual).startsWith('-'),
                    financingInputAmount: amountInputValue || '',
                    financingInputCurrency: formData.amountCurrency || 'USDT',
                  }),
                  tags: formData.tags && formData.tags.length > 0 ? JSON.stringify(formData.tags) : null,
                  public_note: null,
                  admin_note: null,
                  settled_at: null,
                  participantCount: 0,
                  participantInfo: null,
                  paidTotal: editingOrderPayments && (editingOrderPayments as any[]).length > 0
                    ? { amount: String((editingOrderPayments as any[]).reduce((s: number, p: any) => s + parseFloat(p.amount || '0'), 0)), currency: (editingOrderPayments as any[])[0]?.currency || 'U' }
                    : null,
                };
                const rateValPreview = parseFloat(String(previewOrder.interest_rate_annual || '0'));
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
                    {previewViewMode === 'order' ? (
                      <FunderOrderCard
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
            </div>

            {/* ===== 订单参与者管理 ===== */}
            {editingOrder && !editingOrder?.participantInfo && (
              <div className="px-5 pb-4" ref={participantsSectionRef}>
                <button type="button" onClick={() => setParticipantsSectionExpanded(value => !value)} className="mb-3 w-full rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                      <Users2 className="h-4 w-4" />
                      <span>订单参与者</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 shadow-sm">
                        {existingParticipantsLoading && participants.length === 0 ? '读取中' : `${participants.length} 人`}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-indigo-400 transition-transform ${participantsSectionExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-indigo-500">{participantsSectionExpanded ? '点击参与者可展开独立设置；最后在页面底部统一保存。' : '已收起，点击查看、编辑或批量添加参与者。'}</p>
                </button>

                {participantsSectionExpanded && (<>
                {participants.length === 0 && !existingParticipantsLoading && (
                  <div className="mb-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
                    当前没有参与者，请在下方批量选择需要添加的成员。
                  </div>
                )}

                {/* 参与者列表 */}
                {participants.map((p, idx) => (
                  <div key={p.userId} className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 overflow-hidden">
                    {/* 参与者头部 */}
                    <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setParticipants(prev => prev.map((pp, i) => ({ ...pp, expanded: i === idx ? !pp.expanded : false })))}>
                      {p.avatar ? <img src={p.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" /> : <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">{p.userName.slice(0,1).toUpperCase()}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{p.userName}</div>
                        <div className="truncate text-xs text-gray-400">{p.amount ? `${p.amount} ${p.amountCurrency === 'CNY' ? '元' : p.amountCurrency}` : `参与者 ${idx + 1}`}{p.interestRateAnnual ? ` · 年化 ${normalizeFunderAnnualRate(p.interestRateAnnual)}%` : ''}</div>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); setParticipants(prev => prev.filter((_, i) => i !== idx)); }} className="p-1 rounded-lg text-red-400 hover:bg-red-50">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transform: p.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>

                    {/* 参与者完整参数面板 */}
                    {p.expanded && (
                      <div className="border-t border-indigo-100">
                        {/* ===== 基础参数 ===== */}
                        <div className="px-3 pb-3 space-y-3">
                          {/* 融资金额 */}
                          <div className="pt-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">融资金额</label>
                            <div className="flex gap-2">
                              <input type="number" inputMode="decimal" value={p.amount} onChange={e => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, amount: e.target.value } : pp))} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" placeholder="如：10000" />
                              <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
                                {(['USDT','CNY'] as const).map(c => (
                                  <button key={c} type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, amountCurrency: c } : pp))} className={`px-2 py-1 ${(p.amountCurrency||'USDT')===c ? 'bg-blue-500 text-white' : 'bg-white text-gray-500'}`}>{c==='CNY'?'元':c}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* 年利率 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">年利率 (%)</label>
                            <div className="flex items-center gap-2">
                              {(() => { const isNeg = (p.interestRateAnnual || '').startsWith('-'); return (
                                <>
                                  <button type="button" title="收"
                                    onClick={() => { const raw = normalizeFunderAnnualRate(p.interestRateAnnual || ''); const absVal = raw.startsWith('-') ? raw.slice(1) : raw; setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateAnnual: absVal } : pp)); }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-base font-bold shrink-0 transition-all"
                                    style={!isNeg ? { background: '#FEE2E2', color: '#DC2626', border: '2px solid #DC2626' } : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                                  >+</button>
                                  <button type="button" title="付"
                                    onClick={() => { const raw = normalizeFunderAnnualRate(p.interestRateAnnual || ''); const absVal = raw.startsWith('-') ? raw.slice(1) : raw; setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateAnnual: '-' + absVal } : pp)); }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-base font-bold shrink-0 transition-all"
                                    style={isNeg ? { background: '#DEF7EC', color: '#059669', border: '2px solid #059669' } : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                                  >−</button>
                                </>
                              ); })()}
                              <input type="text" inputMode="decimal"
                                value={(p.interestRateAnnual || '').startsWith('-') ? (p.interestRateAnnual || '').slice(1) : (p.interestRateAnnual || '')}
                                onChange={e => {
                                  const val = limitFunderAnnualRateInput(e.target.value);
                                  if (val === null) return;
                                  const isNeg = (p.interestRateAnnual || '').startsWith('-');
                                  setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateAnnual: isNeg ? '-' + val : val } : pp));
                                }}
                                onBlur={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateAnnual: normalizeFunderAnnualRate(pp.interestRateAnnual) } : pp))}
                                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
                                placeholder="如：18" />
                              <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs shrink-0">
                                {(['USDT','CNY'] as const).map(c => (
                                  <button key={c} type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateCurrency: c } : pp))} className={`px-2 py-1 ${(p.interestRateCurrency||'USDT')===c ? 'bg-blue-500 text-white' : 'bg-white text-gray-500'}`}>{c==='CNY'?'元':c}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* 利息计价货币（大按钮，与主订单一致） */}
                          <div className="flex gap-2">
                            {(['USDT', 'CNY'] as const).map(cur => (
                              <button
                                key={cur}
                                type="button"
                                onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestRateCurrency: cur } : pp))}
                                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                                style={
                                  (p.interestRateCurrency || 'USDT') === cur
                                    ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                                    : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                                }
                              >
                                {cur === 'USDT' ? 'U（USDT）' : '人民币（元）'}
                              </button>
                            ))}
                          </div>
                          {/* 计息基数 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">计息基数</label>
                            <div className="flex gap-2">
                              <input type="number" inputMode="decimal" value={p.interestBase} onChange={e => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestBase: e.target.value } : pp))} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" placeholder="如：10000" />
                              <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
                                {(['USDT','CNY'] as const).map(c => (
                                  <button key={c} type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestBaseCurrency: c } : pp))} className={`px-2 py-1 ${(p.interestBaseCurrency||'USDT')===c ? 'bg-blue-500 text-white' : 'bg-white text-gray-500'}`}>{c==='CNY'?'元':c}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* 付息方式 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">付息方式</label>
                            <select value={p.interestPaymentType} onChange={e => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestPaymentType: e.target.value } : pp))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white appearance-none">
                              <option value="">请选择</option>
                              {INTEREST_PAYMENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                          {/* 起息日 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">起息日</label>
                            <input type="date" value={p.interestStartDate} onChange={e => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, interestStartDate: e.target.value } : pp))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" />
                          </div>
                        </div>

                        {/* ===== 显示配置开关（与本人编辑表单完全一致） ===== */}
                        <div className="mx-3 h-px bg-indigo-100 my-1" />
                        <div className="rounded-xl border border-indigo-100 overflow-hidden mx-3 mb-3" style={{ backgroundColor: '#FAFBFF' }}>
                          {/* 左栏字段 */}
                          <div className="px-3 pt-3 pb-1">
                            <div className="text-xs font-medium text-blue-500 mb-2">左栏：持有资产</div>
                            <div className="space-y-2">
                              {[
                                { key: 'buyPrice', label: '买入币价' },
                                { key: 'buyValue', label: '买入价値' },
                                { key: 'buyDate', label: '开仓时间' },
                                { key: 'openPrice', label: '开仓币价' },
                                { key: 'todayPrice', label: '当前币价' },
                                { key: 'floatPnl', label: '浮动盈亏' },
                                { key: 'holdDuration', label: '持有时长' },
                                { key: 'orderNo', label: '订单编号' },
                                { key: 'aiIcon', label: 'AI图标' },
                                { key: 'assetType', label: '资产类型标签' },
                                { key: 'showOwnerName', label: '显示订单所有者名字' },
                              ].map(({ key, label }) => (
                                <div key={key} className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">{label}</span>
                                  <button type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, displayConfig: { ...pp.displayConfig, [key]: !pp.displayConfig?.[key] } } : pp))}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${p.displayConfig?.[key] ? 'bg-blue-500' : 'bg-gray-200'}`}>
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${p.displayConfig?.[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mx-3 h-px bg-gray-100 my-2" />
                          {/* 右栏上半：待结利息区 */}
                          <div className="px-3 pb-2">
                            <div className="text-xs font-medium text-blue-500 mb-2">右栏上半：待结利息区</div>
                            <div className="space-y-2">
                              {[
                                { key: 'accruedInterest', label: '待结利息' },
                                { key: 'paidInterest', label: '已结利息' },
                                { key: 'interestBase', label: '计息基数' },
                                { key: 'interestStartDate', label: '计息日期' },
                                { key: 'interestDuration', label: '计息时长' },
                                { key: 'interestPaymentType', label: '付息方式' },
                                { key: 'collateralCoin', label: '担保货币' },
                                { key: 'collateralValue', label: '担保价値' },
                                { key: 'collateral', label: '担保缺口' },
                                { key: 'marginRate', label: '保证金率' },
                              ].map(({ key, label }) => (
                                <div key={key}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">{label}</span>
                                    <button type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, displayConfig: { ...pp.displayConfig, [key]: !pp.displayConfig?.[key] } } : pp))}
                                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${p.displayConfig?.[key] ? 'bg-blue-500' : 'bg-gray-200'}`}>
                                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${p.displayConfig?.[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </button>
                                  </div>
                                  {key === 'marginRate' && p.displayConfig?.marginRate && (
                                    <div className="mt-1 flex items-center gap-2 pl-1">
                                      <span className="text-xs text-gray-400 shrink-0">低于</span>
                                      <input type="number" min="0" max="200" step="1" value={p.marginAlertThreshold||''} onChange={e => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, marginAlertThreshold: e.target.value } : pp))} placeholder="如：80" className="w-14 text-xs text-center border border-gray-200 rounded-lg px-1 py-0.5 focus:outline-none focus:border-orange-400" style={{ color: '#D97706' }} />
                                      <span className="text-xs text-gray-400 shrink-0">% 时预警</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mx-3 h-px bg-gray-100 my-2" />
                          {/* 约等于显示控制 */}
                          <div className="px-3 pb-2">
                            <div className="text-xs font-medium text-blue-500 mb-2">约等于显示控制</div>
                            <div className="space-y-2">
                              {([
                                { key: 'approxHolding', label: '持有资产约等于' },
                                { key: 'approxInterest', label: '待结利息约等于' },
                                { key: 'approxPaid', label: '已结利息约等于' },
                                { key: 'approxCollateralItem', label: '担保货币约等于' },
                                { key: 'approxCollateralValue', label: '担保价値约等于' },
                              ] as { key: string; label: string }[]).map(({ key, label }) => (
                                <div key={key}>
                                  <div className="text-xs text-gray-600 mb-1">{label}</div>
                                  <div className="flex gap-1">
                                    {(['hidden', 'U', 'CNY'] as const).map(opt => (
                                      <button key={opt} type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, displayConfig: { ...pp.displayConfig, [key]: opt } } : pp))}
                                        className={`flex-1 py-0.5 text-xs rounded-lg border transition-colors ${ (p.displayConfig?.[key]||'hidden') === opt ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200' }`}>
                                        {opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ U' : '≈ 元'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mx-3 h-px bg-gray-100 my-2" />
                          {/* 借出本金开关 */}
                          <div className="px-3 pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-medium text-gray-700">借出本金</span>
                                <p className="text-xs text-gray-400 mt-0.5">开启后担保缺口计算将扣除计息基数（本金）</p>
                              </div>
                              <button type="button" onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, displayConfig: { ...pp.displayConfig, principalLentOut: !pp.displayConfig?.principalLentOut } } : pp))}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${p.displayConfig?.principalLentOut ? 'bg-orange-500' : 'bg-gray-200'}`}>
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${p.displayConfig?.principalLentOut ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* ===== 参与者预览卡片（常驻展开） ===== */}
                        <div className="mx-3 mb-3">
                          {/* 模式切换 Tab */}
                          <div className="flex items-center gap-1 mb-2 p-0.5 rounded-full bg-gray-100" style={{ width: 'fit-content' }}>
                            {(['card', 'order'] as const).map(mode => (
                              <button key={mode} type="button"
                                onClick={() => setParticipants(prev => prev.map((pp, i) => i === idx ? { ...pp, previewMode: mode } : pp))}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${ ((p as any).previewMode || 'order') === mode ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700' }`}>
                                {mode === 'card' ? '卡片模式' : '订单模式'}
                              </button>
                            ))}
                          </div>
                          {(() => {
                            const pPreviewOrder: any = {
                              id: editingOrder?.id ?? -1,
                              order_no: editingOrder?.order_no ?? null,
                              user_id: p.userId,
                              owner_label: p.userName,
                              // 订单拥有者名字（从 membersData 按 editingOrder.user_id 查）
                              order_owner_name: (() => {
                                const allM = ((ledgerData as any)?.members || funderUsers || []) as any[];
                                const ownerM = allM.find((m: any) => m.userId === editingOrder?.user_id);
                                return ownerM ? (ownerM.nickname || ownerM.username) : (editingOrder?.owner_label || editingOrder?.username || null);
                              })(),
                              coin: (p.coin || formData.coin),
                              asset_type: formData.assetType || null,
                              buy_price: formData.buyPrice || null,
                              buy_quantity: formData.buyQuantity || null,
                              amount: p.amount || (formData.assetType === 'stock' ? (amountInputValue || null) : (financingAmountUsdt || null)),
                              amount_currency: p.amountCurrency || formData.amountCurrency || 'USDT',
                              buy_date: formData.buyDate || null,
                              status: formData.status || 'active',
                              broker_name: formData.brokerName || null,
                              broker_account: formData.brokerAccount || null,
                              interest_rate_annual: p.interestRateAnnual !== '' ? normalizeFunderAnnualRate(p.interestRateAnnual) : (normalizeFunderAnnualRate(formData.interestRateAnnual) || null),
                              interest_payment_type: p.interestPaymentType || formData.interestPaymentType || null,
                              interest_base: p.interestBase !== '' ? p.interestBase : (formData.interestBase || null),
                              interest_base_currency: p.interestBaseCurrency || formData.interestBaseCurrency || 'USDT',
                              interest_rate_currency: p.interestRateCurrency || formData.interestRateCurrency || 'USDT',
                              interest_start_date: p.interestStartDate || formData.interestStartDate || null,
                              principal_lent_out: p.displayConfig?.principalLentOut ? 1 : 0,
                              trading_fee_rate_per_mille: ledgerId === 52 ? (Number(formData.tradingFeeRate) || 2) : null,
                              trading_fee_status: ledgerId === 52 ? formData.tradingFeeStatus : 'unpaid',
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
                              trade_direction: formData.tradeDirection || null,
                              display_config: JSON.stringify({
                                ...p.displayConfig,
                                allowUserImageDownload: Boolean(displayConfig.allowUserImageDownload),
                                tradingFee: ledgerId === 52 ? Boolean(displayConfig.tradingFee) : false,
                                marginAlertThreshold: p.marginAlertThreshold || undefined,
                                financingInputAmount: p.amount || amountInputValue || '',
                                financingInputCurrency: p.amountCurrency || formData.amountCurrency || 'USDT',
                              }),
                              participantCount: 0,
                              participantInfo: null,
                              paidTotal: null,
                              order_perspective: 'other',
                            };
                            const pMode = (p as any).previewMode || 'order';
                            const rateVal = parseFloat(String(pPreviewOrder.interest_rate_annual || '0'));
                            return (
                              <div>
                                {pMode === 'card' ? (
                                  // 参与者视角：内部已处理绿色主题，无需在此强制切换
                                  rateVal > 0 ? (
                                    <FunderLenderCardSilver
                                      order={pPreviewOrder}
                                      ledgerId={ledgerId}
                                      livePrices={formLivePrices}
                                      priceDirection={priceDirection}
                                      membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                                      cnyRate={cnyRate}
                                      currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar } : undefined}
                                      isAdmin={isAdminUser}
                                    />
                                  ) : (
                                    <FunderOrderCardV2Silver
                                      order={pPreviewOrder}
                                      ledgerId={ledgerId}
                                      livePrices={formLivePrices}
                                      priceDirection={priceDirection}
                                      membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                                      cnyRate={cnyRate}
                                      currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar } : undefined}
                                      isAdmin={isAdminUser}
                                    />
                                  )
                                ) : (
                                  <FunderOrderCard
                                    order={pPreviewOrder}
                                    livePrices={formLivePrices}
                                    priceDirection={priceDirection}
                                    currentUser={currentUser}
                                    isAdmin={isAdminUser}
                                    membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                                    ledgerId={ledgerId}
                                    previewMode={true}
                                    showCollateralInfo={false}
                                    setShowCollateralInfo={() => {}}
                                    showMarginInfo={false}
                                    setShowMarginInfo={() => {}}
                                    showInterestTip={false}
                                    setShowInterestTip={() => {}}
                                  />
                                )}
                              </div>
                            );
                          })()}
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
                    const newParticipants: ParticipantForm[] = selectedMembers
                      .filter((m: any) => {
                        const id = Number(m.userId || m.id);
                        return id !== Number(formData.userId) && !participants.some(p => p.userId === id);
                      })
                      .map((m: any, index: number) => ({
                        userId: Number(m.userId || m.id),
                        userName: getUserDisplayName(m, String(m.userId || m.id)),
                        avatar: m.avatar,
                        coin: formData.coin,
                        amount: formData.assetType === 'stock' ? amountInputValue : (financingAmountUsdt || ''),
                        amountCurrency: formData.amountCurrency || 'USDT',
                        interestRateAnnual: normalizeFunderAnnualRate(formData.interestRateAnnual),
                        interestBase: formData.interestBase || '',
                        interestBaseCurrency: formData.interestBaseCurrency || 'USDT',
                        interestRateCurrency: formData.interestRateCurrency || 'USDT',
                        interestPaymentType: formData.interestPaymentType || '',
                        interestStartDate: formData.interestStartDate || '',
                        displayConfig: { ...displayConfig },
                        marginAlertThreshold: marginAlertThreshold || '',
                        expanded: index === 0,
                      }));
                    if (newParticipants.length === 0) return;
                    setParticipants(prev => [...prev.map(item => ({ ...item, expanded: false })), ...newParticipants]);
                    setParticipantsSectionExpanded(true);
                    setSelectedParticipantUserIds([]);
                    setParticipantUserSearch('');
                    toast.success(`已加入 ${newParticipants.length} 位参与者，请在底部统一保存`);
                  };
                  return (
                    <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-700">批量添加参与者</div>
                          <div className="mt-0.5 text-xs text-gray-400">可连续勾选多人，再一次加入订单</div>
                        </div>
                        {selectedParticipantUserIds.length > 0 && (
                          <button type="button" onClick={() => setSelectedParticipantUserIds([])} className="shrink-0 text-xs text-gray-400">清空</button>
                        )}
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
                        {selectedParticipantUserIds.length > 0 ? `一次加入 ${selectedParticipantUserIds.length} 位参与者` : '请先勾选参与者'}
                      </button>
                    </div>
                  );
                })()}
                </>)}
              </div>
            )}

            {/* 提交按钮 */}
            <div className="flex-shrink-0 bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || updateParticipantOrderMutation.isPending}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
              >
                {(createMutation.isPending || updateMutation.isPending || updateParticipantOrderMutation.isPending)
                  ? '提交中...'
                  : editingOrder && !editingOrder?.participantInfo
                    ? `保存订单与 ${participants.length} 位参与者`
                    : editingOrder
                      ? '保存修改'
                      : '确认添加'}
              </button>
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
              <p className="text-sm text-gray-600 mb-2">本功能只改变融资付息的记账状态和页面显示，<span className="font-semibold text-gray-800">不会产生任何钱包流水</span>。</p>
              <p className="text-sm font-medium text-red-600 mb-5">统一结清后不能单独保留某位参与者为持有中，确定继续？</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmSettleId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
                <button
                  onClick={() => {
                    updateMutation.mutate({ id: confirmSettleId, ledgerId, status: 'settled' });
                    setConfirmSettleId(null);
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
                        <div className="text-xs text-gray-500">需求 {o.collateralRequired.toFixed(0)} U</div>
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
                    const show = (key: string) => dc ? (dc[key] !== false) : true;
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




