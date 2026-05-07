/**
 * PositionCalc.tsx
 * ETH 持仓计算页面
 * - 每50元一档，从1000到3500
 * - 每档是一条进度条，价格文字融入条内
 * - 点击档位弹出 modal，选择修改计划量或已买量
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
// 注入双端滑块样式
const RANGE_SLIDER_STYLE = `
  .dual-range input[type=range] { pointer-events: none; }
  .dual-range input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: all;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    border: 2px solid #3B82F6;
    box-shadow: 0 1px 4px rgba(59,130,246,0.4);
    cursor: pointer;
  }
  .dual-range input[type=range]::-moz-range-thumb {
    pointer-events: all;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    border: 2px solid #3B82F6;
    box-shadow: 0 1px 4px rgba(59,130,246,0.4);
    cursor: pointer;
  }
`;
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, X, Check, Pencil, HelpCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const MIN_PRICE = 1000;
const MAX_PRICE = 3500;

function generatePriceLevels(step: number = 50): number[] {
  const levels: number[] = [];
  for (let p = MAX_PRICE; p >= MIN_PRICE; p -= step) {
    levels.push(p);
  }
  return levels;
}

// 弹窗状态
interface ModalState {
  price: number;
  mode: 'choose' | 'editPlanned' | 'editActual';
  inputValue: string;
  baseValue: string;     // 底仓输入值
  tacticalValue: string; // 机动仓输入值
  plannedValue: string;  // 计划仓位输入值
}

// 汇总卡片编辑弹窗
interface SummaryEditModal {
  field: 'totalActual' | 'totalPlanned';
  inputValue: string;
}

export default function PositionCalc() {
  const [, params] = useRoute("/ledger/:id/position-calc");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;
  const { user } = useAuth();
  // 视角查看：从URL读取viewAs参数
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? Number(urlSearchParams.get('viewAs')) : undefined;
  const isViewAs = !!viewAsUserId; // 视角查看时禁用写入操作

  // 禁止左右滑动切换页面（包括 iOS 边缘返回手势）
  useEffect(() => {
    // CSS 方案：覆盖 html/body 的 overscroll 行为
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorX;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorX;
    const prevHtmlTouchAction = document.documentElement.style.touchAction;
    const prevBodyTouchAction = document.body.style.touchAction;
    document.documentElement.style.overscrollBehaviorX = 'none';
    document.body.style.overscrollBehaviorX = 'none';
    document.documentElement.style.touchAction = 'pan-y';
    document.body.style.touchAction = 'pan-y';

    // JS 方案：拦截水平主导的 touch 事件
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      // 离开页面时恢复原来的设置
      document.documentElement.style.overscrollBehaviorX = prevHtmlOverscroll;
      document.body.style.overscrollBehaviorX = prevBodyOverscroll;
      document.documentElement.style.touchAction = prevHtmlTouchAction;
      document.body.style.touchAction = prevBodyTouchAction;
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // 注入双端滑块 CSS
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'dual-range-style';
    styleEl.textContent = RANGE_SLIDER_STYLE;
    if (!document.getElementById('dual-range-style')) {
      document.head.appendChild(styleEl);
    }
    return () => { document.getElementById('dual-range-style')?.remove(); };
  }, []);

  const [planned, setPlanned] = useState<Record<number, number>>({});
  const [actual, setActual] = useState<Record<number, number>>({});
  const [baseQty, setBaseQty] = useState<Record<number, number>>({}); // 底仓
  const [tacticalQty, setTacticalQty] = useState<Record<number, number>>({}); // 机动仓
  const [baseNotes, setBaseNotes] = useState<Record<number, Array<{text: string; time: string}>>>({}); // 底仓备注
  const [tacticalNotes, setTacticalNotes] = useState<Record<number, Array<{text: string; time: string}>>>({}); // 机动仓备注
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null); // 单击高亮选中
  const [summaryEdit, setSummaryEdit] = useState<SummaryEditModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetProfitCny, setTargetProfitCny] = useState<string>('');  // 目标止盈利润（人民币）
  const [targetEthQty, setTargetEthQty] = useState<string>('');  // 目标持仓 ETH 数量
  const [strategyRatio, setStrategyRatio] = useState<number>(50); // 策略持仓占比 0-100（战略=100-strategyRatio）
  const [priceStep, setPriceStep] = useState<number>(50); // 档位粒度：20/50/100/200
  // 动态档位列表，随 priceStep 变化重新生成
  const priceLevels = useMemo(() => generatePriceLevels(priceStep), [priceStep]);
  const strategyBarRef = useRef<HTMLDivElement>(null); // 进度条容器 ref
  const isDraggingStrategy = useRef(false); // 是否正在拖动
  const strategyRatioRef = useRef(strategyRatio); // 实时值 ref，避免闭包问题
  useEffect(() => { strategyRatioRef.current = strategyRatio; }, [strategyRatio]);
  const [strategyUnlocked, setStrategyUnlocked] = useState(false); // 双击解锁后才能拖动
  const strategyUnlockedRef = useRef(false); // ref 版本，供事件回调使用
  useEffect(() => { strategyUnlockedRef.current = strategyUnlocked; }, [strategyUnlocked]);
  const strategyLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 自动重新锁定计时器
  const [cnyRate, setCnyRate] = useState<number>(7.28); // 人民币/USDT 汇率（初始占位，会被实时值覆盖）
  const [cnyRateInput, setCnyRateInput] = useState<string>(''); // 手动修改汇率的输入内容
  const [editingRate, setEditingRate] = useState(false); // 是否正在编辑汇率
  const [rateFromApi, setRateFromApi] = useState<number | null>(null); // 实时汇率（API 成功后设置）
  const [showExitPriceInfo, setShowExitPriceInfo] = useState(false); // 目标离场价说明弹窗
  // ===== 自动分配计划持仓 =====
  const [showAutoAlloc, setShowAutoAlloc] = useState(false); // 是否显示自动分配弹窗
  const [allocStep, setAllocStep] = useState<'setup' | 'range' | 'method' | 'preview'>('setup'); // 分配步骤
  const [allocMinPrice, setAllocMinPrice] = useState<string>(''); // 买入最低价
  const [allocMaxPrice, setAllocMaxPrice] = useState<string>(''); // 买入最高价
  const [allocMethod, setAllocMethod] = useState<'equal' | 'geometric' | 'normal' | 'manual'>('equal'); // 分配方式
  const [allocGeomRatio, setAllocGeomRatio] = useState<string>('1.2'); // 等比公比
  const [allocArithDiff, setAllocArithDiff] = useState<string>('1'); // 等差公差
  const [allocEqualAsc, setAllocEqualAsc] = useState(false); // 等差：false=越低越多（默认），true=越高越多
  const [allocGeomAsc, setAllocGeomAsc] = useState(false); // 等比：false=越低越多（默认），true=越高越多
  const [allocNormalSigma, setAllocNormalSigma] = useState<string>('4'); // 正态分布集中度：1=极度集中，10=趋向均匀
  const [allocManualQtys, setAllocManualQtys] = useState<Record<number, string>>({}); // 手动分配数量
  const [allocPreview, setAllocPreview] = useState<Record<number, number>>({}); // 预览分配结果

  // 计算自动分配结果
  const calcAutoAlloc = (method: 'equal' | 'geometric' | 'normal' | 'manual', minP: number, maxP: number): Record<number, number> => {
    const totalQty = Math.round(parseFloat(targetEthQty) || 0);
    if (totalQty <= 0) return {};
    const levels = priceLevels.filter(p => p >= minP && p <= maxP);
    if (levels.length === 0) return {};
    const result: Record<number, number> = {};
    const n = levels.length;

    // 辅助：按权重分配总量，确保总和严格等于 targetQty
    const applyWeights = (weights: number[], asc: boolean) => {
      // asc=false: 越低价格越多（weights[0]对应最高价，weights[n-1]对应最低价，越大越多）
      // asc=true: 越高价格越多（反转权重）
      const w = asc ? [...weights].reverse() : weights;
      const totalW = w.reduce((s, x) => s + x, 0);
      if (totalW === 0) { levels.forEach(p => { result[p] = 0; }); return; }
      // 第一轮：按权重比例取整
      let sum = 0;
      levels.forEach((p, i) => {
        result[p] = Math.round(w[i] / totalW * totalQty);
        sum += result[p];
      });
      // 第二轮：纠正取整误差，将差异加到权重最大的档位上
      const diff = totalQty - sum;
      if (diff !== 0) {
        // 找到权重最大的档位索引
        let maxWIdx = 0;
        for (let i = 1; i < n; i++) { if (w[i] > w[maxWIdx]) maxWIdx = i; }
        result[levels[maxWIdx]] = Math.max(0, result[levels[maxWIdx]] + diff);
      }
    };

    if (method === 'equal') {
      // 等差：第 i 档数量 = a + i*d（levels从高到低，i=0最高价）
      let d = Math.round(parseFloat(allocArithDiff) || 1);
      if (n > 1) {
        const maxD = Math.floor((totalQty - n) * 2 / (n * (n - 1)));
        if (d > maxD) d = Math.max(0, maxD);
      }
      // 生成权重数组：第 i 档权重 = 1 + i*d（i=0最高价，权重最小）
      const weights = levels.map((_, i) => 1 + i * d);
      applyWeights(weights, allocEqualAsc);
    } else if (method === 'geometric') {
      const ratio = Math.round(parseFloat(allocGeomRatio) * 2) / 2 || 1.2;
      // 权重 = ratio^i（i=0最高价，权重最小）
      const weights = levels.map((_, i) => Math.pow(ratio, i));
      applyWeights(weights, allocGeomAsc);
    } else if (method === 'normal') {
      // 正态分布：中间价格区间买最多，两端买最少
      const mid = (n - 1) / 2;
      // sigma 用户可调：1=极度集中在中心，10=趋向均匀；将用户输入值映射为实际 sigma
      const sigmaLevel = Math.max(1, Math.min(10, parseFloat(allocNormalSigma) || 4));
      const sigma = (n / 2) * (sigmaLevel / 10); // sigmaLevel=1 时 sigma=n/20（极度集中），sigmaLevel=10 时 sigma=n/2（趋向均匀）
      const weights = levels.map((_, i) => Math.exp(-0.5 * Math.pow((i - mid) / sigma, 2)));
      const totalW = weights.reduce((s, w) => s + w, 0);
      let sum = 0;
      levels.slice(0, -1).forEach((p, i) => {
        result[p] = Math.max(1, Math.round(weights[i] / totalW * totalQty));
        sum += result[p];
      });
      result[levels[n - 1]] = Math.max(1, totalQty - sum);
    } else {
      levels.forEach(p => { result[p] = parseFloat(allocManualQtys[p] || '0') || 0; });
    }
    return result;
  };

  // 手动模式：总量显示
  const manualTotal = useMemo(() => {
    const minP = parseFloat(allocMinPrice) || 0;
    const maxP = parseFloat(allocMaxPrice) || 0;
    const levels = priceLevels.filter(p => p >= minP && p <= maxP);
    return levels.reduce((s, p) => s + (parseFloat(allocManualQtys[p] || '0') || 0), 0);
  }, [allocManualQtys, allocMinPrice, allocMaxPrice]);

  // 获取实时 USDT/CNY 汇率 — 3秒刷新，保留上次値
  const { data: rateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { staleTime: 1000, refetchInterval: 3000 }
  );
  useEffect(() => {
    if (rateData?.success && rateData.money) {
      const r = parseFloat(rateData.money);
      if (!isNaN(r) && r > 0) {
        setRateFromApi(r); // 记录实时汇率
        if (!editingRate) {
          setCnyRate(r); // 实时汇率优先，非编辑状态下立即更新显示
        }
      }
    }
    // 若接口失败，rateFromApi 保留上次成功值，不清空
  }, [rateData, editingRate]);

  const utils = trpc.useUtils();

  // 获取持仓数据
  const { data: positionData, isLoading: positionLoading } = trpc.ethPositionGetLevels.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: ledgerId > 0 }
  );

  // 修改日志
  const getLogsQuery = trpc.ethPositionGetLogs.useQuery(
    { ledgerId, price: modal?.mode !== 'choose' ? modal?.price : undefined },
    { enabled: !!modal && modal.mode !== 'choose' && ledgerId > 0 }
  );
  const updateLogNoteMutation = trpc.ethPositionUpdateLogNote.useMutation({
    onSuccess: () => utils.ethPositionGetLogs.invalidate({ ledgerId }),
  });
  const deleteLogMutation = trpc.ethPositionDeleteLog.useMutation({
    onSuccess: () => utils.ethPositionGetLogs.invalidate({ ledgerId }),
  });
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingLogNote, setEditingLogNote] = useState<string>('');

  // 保存单个档位
  const saveLevelMutation = trpc.ethPositionSaveLevel.useMutation();
  const updateNotesMutation = trpc.ethPositionUpdateNotes.useMutation();
  const batchSaveMutation = trpc.ethPositionBatchSave.useMutation({
    onSuccess: () => {
      utils.ethPositionGetLevels.invalidate({ ledgerId });
    }
  });
  // 视角查看时获取被查看用户信息
  const { data: membersData } = trpc.ledger.getMembers.useQuery(
    { ledgerId },
    { enabled: isViewAs && ledgerId > 0 }
  );
  const viewAsUserName = useMemo(() => {
    if (!isViewAs || !viewAsUserId || !membersData) return null;
    const member = (membersData as any[]).find((m: any) => m.userId === viewAsUserId);
    return member?.realName || member?.username || null;
  }, [isViewAs, viewAsUserId, membersData]);
  // 显示名：视角查看时用被查看用户名，否则用当前登录用户名
  const displayName = isViewAs ? viewAsUserName : (user?.name || null);

  // 从数据库读取目标止盈和汇率设置
  const { data: settingsData } = trpc.ethPositionGetSettings.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: ledgerId > 0 }
  );
  const saveSettingsMutation = trpc.ethPositionSaveSettings.useMutation({
    onSuccess: () => {
      utils.ethPositionGetSettings.invalidate({ ledgerId });
    }
  });

  // 战略/策略拖动交互：纯 touch/mouse 事件，不依赖 range input
  const calcStrategyRatioFromX = useCallback((clientX: number): number => {
    const bar = strategyBarRef.current;
    if (!bar) return strategyRatioRef.current;
    const rect = bar.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    // pct 是左側战略占比，策略 = 100 - 战略
    const newStrategyRatio = Math.round((1 - pct) * 100);
    return Math.max(0, Math.min(100, newStrategyRatio));
  }, []);

  const handleStrategyDragSave = useCallback((val: number) => {
    if (isViewAs) return; // 视角查看时禁用写入
    saveSettingsMutation.mutate({
      ledgerId,
      targetProfitCny: parseFloat(targetProfitCny) || 0,
      cnyRate: 0,
      targetEthQty: parseFloat(targetEthQty) || 0,
      strategyRatio: val,
      priceStep,
    });
  }, [ledgerId, targetProfitCny, targetEthQty, priceStep, saveSettingsMutation]);

  // 监听全局 touchmove/touchend/mousemove/mouseup
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingStrategy.current) return;
      const val = calcStrategyRatioFromX(e.clientX);
      setStrategyRatio(val);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!isDraggingStrategy.current) return;
      isDraggingStrategy.current = false;
      const val = calcStrategyRatioFromX(e.clientX);
      setStrategyRatio(val);
      handleStrategyDragSave(val);
      // 拖动完成后自动锁定
      setStrategyUnlocked(false);
      if (strategyLockTimer.current) clearTimeout(strategyLockTimer.current);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingStrategy.current) return;
      e.preventDefault();
      const val = calcStrategyRatioFromX(e.touches[0].clientX);
      setStrategyRatio(val);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!isDraggingStrategy.current) return;
      isDraggingStrategy.current = false;
      const touch = e.changedTouches[0];
      const val = calcStrategyRatioFromX(touch.clientX);
      setStrategyRatio(val);
      handleStrategyDragSave(val);
      // 拖动完成后自动锁定
      setStrategyUnlocked(false);
      if (strategyLockTimer.current) clearTimeout(strategyLockTimer.current);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [calcStrategyRatioFromX, handleStrategyDragSave]);

  // 从数据库加载目标止盈和 ETH 数量（不加载汇率，汇率始终用实时 API 值）
  useEffect(() => {
    if (settingsData) {
      if (settingsData.targetProfitCny > 0) {
        setTargetProfitCny(String(settingsData.targetProfitCny));
      }
      // 汇率不从数据库读取，始终使用实时 API 值（方案A）
      if (settingsData.targetEthQty > 0) {
        setTargetEthQty(String(settingsData.targetEthQty));
      }
      if (settingsData.strategyRatio !== undefined) {
        setStrategyRatio(settingsData.strategyRatio);
      }
      if (settingsData.priceStep && [20,50,100,200].includes(settingsData.priceStep)) {
        setPriceStep(settingsData.priceStep);
      }
    }
  }, [settingsData]);

  // 初始化数据：从数据库加载，若无数据则用默认展示
  useEffect(() => {
    if (!positionLoading && positionData && !dataLoaded) {
      const newPlanned: Record<number, number> = {};
      const newActual: Record<number, number> = {};
      const newBase: Record<number, number> = {};
      const newTactical: Record<number, number> = {};
      const newBaseNotes: Record<number, Array<{text: string; time: string}>> = {};
      const newTacticalNotes: Record<number, Array<{text: string; time: string}>> = {};
      if (positionData.levels.length > 0) {
        positionData.levels.forEach((l: any) => {
          newPlanned[l.price] = l.plannedQty;
          newActual[l.price] = l.actualQty;
          newBase[l.price] = l.baseQty ?? 0;
          newTactical[l.price] = l.tacticalQty ?? 0;
          try { newBaseNotes[l.price] = l.baseNotes ? JSON.parse(l.baseNotes) : []; } catch { newBaseNotes[l.price] = []; }
          try { newTacticalNotes[l.price] = l.tacticalNotes ? JSON.parse(l.tacticalNotes) : []; } catch { newTacticalNotes[l.price] = []; }
        });
      } else {
        // 无数据时用默认展示（不写入数据库）
        priceLevels.forEach(p => {
          newPlanned[p] = 0;
          newActual[p] = 0;
          newBase[p] = 0;
          newTactical[p] = 0;
          newBaseNotes[p] = [];
          newTacticalNotes[p] = [];
        });
      }
      setPlanned(newPlanned);
      setActual(newActual);
      setBaseQty(newBase);
      setTacticalQty(newTactical);
      setBaseNotes(newBaseNotes);
      setTacticalNotes(newTacticalNotes);
      setDataLoaded(true);
    }
  }, [positionData, positionLoading, dataLoaded]);

  // ETH 价格 — 3秒刷新，保留上次値（新数据未到前不清空）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 1000,
  });

  useEffect(() => {
    // getCryptoPrices 返回 { prices: { ETH: ... }, changes: {...} } 结构
    const ethPrice = (cryptoPricesRaw as any)?.prices?.ETH ?? (cryptoPricesRaw as any)?.ETH;
    if (ethPrice && ethPrice > 0) {
      setCurrentPrice(ethPrice); // 只在有效值时更新，保留上次值
    }
    // 若接口失败，currentPrice 保留上次成功值，不清空
  }, [cryptoPricesRaw]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    priceLevels.forEach(p => {
      const qty = actual[p] || 0;
      if (qty > 0) { totalQty += qty; totalCost += qty * p; }
    });
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const curPrice = currentPrice || 0;
    const totalValue = totalQty * curPrice;
    const totalPnl = totalQty > 0 && curPrice > 0 ? (curPrice - avgPrice) * totalQty : 0;
    const pnlPct = avgPrice > 0 && curPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 : 0;
    const totalPlanned = priceLevels.reduce((s, p) => s + (planned[p] || 0), 0);
    return { totalQty, avgPrice, totalValue, totalPnl, pnlPct, totalPlanned };
  }, [actual, planned, currentPrice]);

  const hasData = (p: number) => (planned[p] || 0) > 0 || (actual[p] || 0) > 0;

  const visibleLevels = useMemo(() => {
    // 找出所有有数据的档位索引
    const dataIndices = priceLevels.map((p, i) => hasData(p) ? i : -1).filter(i => i >= 0);
    
    if (dataIndices.length === 0) {
      // 全部为空时：只显示当前价格附近的一行空白行
      const nearPrice = currentPrice || 1800;
      const nearIdx = priceLevels.reduce((best, p, i) =>
        Math.abs(p - nearPrice) < Math.abs(priceLevels[best] - nearPrice) ? i : best, 0);
      return [priceLevels[nearIdx]];
    }
    
    const minIdx = dataIndices[0];
    const maxIdx = dataIndices[dataIndices.length - 1];
    
    // 显示所有有数据的行，上下各保留一行空白行
    const startIdx = Math.max(0, minIdx - 1);
    const endIdx = Math.min(priceLevels.length - 1, maxIdx + 1);
    
    return priceLevels.slice(startIdx, endIdx + 1);
  }, [planned, actual, currentPrice]);
  // 所有档位中最大的计划数量，用于进度条背景宽度比例
  const maxPlannedQty = useMemo(() => {
    const vals = priceLevels.map(p => planned[p] || 0);
    return Math.max(...vals, 1);
  }, [planned]);

  // 全局最大值：计划和实际中取最大，作为进度条等比例基准
  const maxGlobalQty = useMemo(() => {
    const planVals = priceLevels.map(p => planned[p] || 0);
    const actualVals = priceLevels.map(p => actual[p] || 0);
    return Math.max(...planVals, ...actualVals, 1);
  }, [planned, actual]);

  // 汇总卡片编辑确认
  const confirmSummaryEdit = () => {
    if (!summaryEdit) return;
    const num = parseFloat(summaryEdit.inputValue);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (summaryEdit.field === 'totalActual') {
      // 按比例分配到各有计划的档位
      const totalPlan = priceLevels.reduce((s, p) => s + (planned[p] || 0), 0);
      if (totalPlan > 0) {
        const ratio = val / totalPlan;
        const newActual: Record<number, number> = {};
        priceLevels.forEach(p => {
          if ((planned[p] || 0) > 0) newActual[p] = parseFloat(((planned[p] || 0) * ratio).toFixed(4));
          else newActual[p] = actual[p] || 0;
        });
        setActual(newActual);
        // 批量保存到数据库
        const levels = priceLevels
          .filter(p => (planned[p] || 0) > 0 || (newActual[p] || 0) > 0)
          .map(p => ({ price: p, plannedQty: planned[p] || 0, actualQty: newActual[p] || 0 }));
        batchSaveMutation.mutate({ ledgerId, levels });
      }
    } else {
      // 按比例缩放各档计划
      const totalPlan = priceLevels.reduce((s, p) => s + (planned[p] || 0), 0);
      if (totalPlan > 0) {
        const ratio = val / totalPlan;
        const newPlanned: Record<number, number> = {};
        priceLevels.forEach(p => {
          if ((planned[p] || 0) > 0) newPlanned[p] = parseFloat(((planned[p] || 0) * ratio).toFixed(4));
          else newPlanned[p] = 0;
        });
        setPlanned(newPlanned);
        // 批量保存到数据库
        const levels = priceLevels
          .filter(p => (newPlanned[p] || 0) > 0 || (actual[p] || 0) > 0)
          .map(p => ({ price: p, plannedQty: newPlanned[p] || 0, actualQty: actual[p] || 0 }));
        batchSaveMutation.mutate({ ledgerId, levels });
      }
    }
    setSummaryEdit(null);
  };

  // 点击档位进度条 - 跳转到档位编辑子页面
  const openModal = (price: number) => {
    if (isViewAs) return; // 视角查看时禁用写入
    const viewAsParam = viewAsUserId ? `?viewAs=${viewAsUserId}` : '';
    setLocation(`/ledger/${ledgerId}/position-calc/${price}${viewAsParam}`);
  };

  // 弹窗确认
  const addChangeLogMutation = trpc.ethPositionAddLog.useMutation({
    onError: (err) => {
      console.error('[ETH Log] 日志写入失败:', err.message, err);
    },
    onSuccess: () => {
      utils.ethPositionGetLogs.invalidate({ ledgerId });
    },
  });
  const confirmModal = () => {
    if (!modal) return;
    if (isViewAs) { setModal(null); return; } // 视角查看时禁用写入
    const num = parseFloat(modal.inputValue);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (modal.mode === 'editPlanned') {
      const oldVal = planned[modal.price] || 0;
      const newPlanned = { ...planned, [modal.price]: val };
      setPlanned(newPlanned);
      // 保存到数据库
      saveLevelMutation.mutate({
        ledgerId,
        price: modal.price,
        plannedQty: val,
        actualQty: actual[modal.price] || 0,
      });
      // 记录修改日志
      addChangeLogMutation.mutate({
        ledgerId,
        price: modal.price,
        changeType: 'planned',
        oldValue: oldVal,
        newValue: val,
      });
    } else if (modal.mode === 'editActual') {
      const bqNum = parseFloat(modal.baseValue);
      const tqNum = parseFloat(modal.tacticalValue);
      const pqNum = parseFloat(modal.plannedValue);
      const bqVal = isNaN(bqNum) || bqNum < 0 ? 0 : bqNum;
      const tqVal = isNaN(tqNum) || tqNum < 0 ? 0 : tqNum;
      const totalVal = bqVal + tqVal; // 总已买 = 底仓 + 机动仓
      // 计划仓位：如果用户修改了，就用新值；否则保持原有值
      const oldPlannedVal = planned[modal.price] || 0;
      const newPlannedVal = !isNaN(pqNum) && pqNum >= 0 ? pqNum : oldPlannedVal;
      const oldVal = actual[modal.price] || 0;
      const newActual = { ...actual, [modal.price]: totalVal };
      const newBase = { ...baseQty, [modal.price]: bqVal };
      const newTactical = { ...tacticalQty, [modal.price]: tqVal };
      const newPlanned = { ...planned, [modal.price]: newPlannedVal };
      setActual(newActual);
      setBaseQty(newBase);
      setTacticalQty(newTactical);
      setPlanned(newPlanned);
      // 保存到数据库
      saveLevelMutation.mutate({
        ledgerId,
        price: modal.price,
        plannedQty: newPlannedVal,
        actualQty: totalVal,
        baseQty: bqVal,
        tacticalQty: tqVal,
      });
      // 记录修改日志
      addChangeLogMutation.mutate({
        ledgerId,
        price: modal.price,
        changeType: 'actual',
        oldValue: oldVal,
        newValue: totalVal,
      });
      // 如果计划仓位有变化，也记录日志
      if (newPlannedVal !== oldPlannedVal) {
        addChangeLogMutation.mutate({
          ledgerId,
          price: modal.price,
          changeType: 'planned',
          oldValue: oldPlannedVal,
          newValue: newPlannedVal,
        });
      }
    }
    setModal(null);
  };

  const isPnlPositive = summary.totalPnl >= 0;

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto relative" style={{ background: '#000000', overscrollBehaviorX: 'none', touchAction: 'pan-y', overflowX: 'hidden' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: '#000000', borderBottom: '1px solid rgba(192,192,192,0.18)' }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
            style={{ backgroundColor: 'rgba(192,192,192,0.08)', border: '1px solid rgba(192,192,192,0.28)' }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 font-semibold text-base" style={{ letterSpacing: '0.05em', background: 'linear-gradient(180deg, #f0f0f0 0%, #c8c8c8 30%, #a0a0a0 60%, #d0d0d0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}>
            <img src="/eth-circle-icon.webp" alt="ETH" className="w-5 h-5 object-contain rounded-full flex-shrink-0" />
            智能仓位管理
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setAllocStep('setup');
              // 初始化最低价为当前 ETH 价格（取整到最近的50档，不低于1000，不高于3500）
              if (currentPrice && currentPrice > 0) {
                const snapped = Math.min(3450, Math.max(1000, Math.round(currentPrice / 50) * 50));
                setAllocMinPrice(String(snapped));
                // 如果当前最高价低于最低价，重置最高价
                const curMax = parseFloat(allocMaxPrice) || 3500;
                if (curMax <= snapped) setAllocMaxPrice(String(Math.min(3500, snapped + 50)));
              }
              setShowAutoAlloc(true);
            }}
            className="px-3 py-1 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(192,192,192,0.08)', color: '#c0c0c0', border: '1px solid rgba(192,192,192,0.28)' }}
          >
            配置
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(192,192,192,0.08)', color: '#c0c0c0', border: '1px solid rgba(192,192,192,0.28)' }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* 目标止盈利润 */}
      <div className="px-4 pt-4 pb-3">
        {!editingRate ? (
          // 展示模式：财经质感卡片
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ background: 'linear-gradient(160deg, #060400 0%, #0c0900 50%, #060400 100%)', border: '1px solid rgba(192,192,192,0.2)', boxShadow: '0 0 0 1px rgba(245,226,122,0.05) inset, 0 8px 40px rgba(0,0,0,0.98)' }}
          >
            {/* 装饰光晕 */}
            <div className="absolute top-0 right-0 w-28 h-28 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,226,122,0.06) 0%, transparent 60%)', transform: 'translate(40%, -40%)' }} />
            {/* 顶部金属高光线 */}
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(192,192,192,0.15) 15%, #f0d060 42%, #fffbe8 50%, #f0d060 58%, rgba(192,192,192,0.15) 85%, transparent 100%)' }} />
            {/* 底部暗线 */}
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'transparent' }} />
            <div className="relative px-5 py-4">
              {/* 主数字区：左右两栏 */}
              <div className="flex items-start gap-0 mb-3">
                {/* 左栏：目标止盈利润 */}
                <div className="flex-1 pr-4">
                  <div className="flex items-center justify-end mb-2" style={{ gap: 0 }}>
                    {displayName && (
                      <>
                        <span
                          className="text-xs font-medium tracking-widest"
                          style={{ color: 'rgba(192,192,192,0.5)', letterSpacing: '0.2em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}
                        >
                          {displayName}
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'rgba(192,192,192,0.3)', margin: '0 0.3em', letterSpacing: 0 }}
                        >
                          ·
                        </span>
                      </>
                    )}
                    <span
                      className="text-xs font-medium tracking-widest"
                      style={{ color: 'rgba(192,192,192,0.4)', letterSpacing: '0.2em', whiteSpace: 'nowrap' }}
                    >
                      目标止盈利润
                    </span>
                  </div>
                  <div className="flex items-baseline justify-end">
                    <span className="text-3xl font-bold" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #f5e27a 0%, #d4af37 40%, #b8860b 70%, #d4af37 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                      {targetProfitCny && !isNaN(parseFloat(targetProfitCny)) && parseFloat(targetProfitCny) > 0
                        ? Number(targetProfitCny).toLocaleString('zh-CN')
                        : <span style={{ color: 'rgba(212,175,55,0.2)' }}>--</span>
                      }
                    </span>
                    <span className="text-sm font-medium" style={{ display: 'inline-block', width: '1.2em', textAlign: 'left', paddingLeft: '2px', color: 'rgba(212,175,55,0.6)' }}>
                      {targetProfitCny && !isNaN(parseFloat(targetProfitCny)) && parseFloat(targetProfitCny) > 0 ? '元' : ''}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-end mt-1">
                    <span className="text-base font-light" style={{ color: 'rgba(212,175,55,0.45)', marginRight: '4px', lineHeight: 1, alignSelf: 'center' }}>≈</span>
                    <span className="text-3xl font-bold" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #d4af37 0%, #9a7a1a 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                      {targetProfitCny && !isNaN(parseFloat(targetProfitCny)) && parseFloat(targetProfitCny) > 0
                        ? (parseFloat(targetProfitCny) / cnyRate).toLocaleString('en-US', { maximumFractionDigits: 0 })
                        : <span style={{ color: 'rgba(212,175,55,0.2)' }}>--</span>
                      }
                    </span>
                    <span className="text-sm font-medium" style={{ display: 'inline-block', width: '1.2em', textAlign: 'left', paddingLeft: '2px', color: 'rgba(212,175,55,0.5)' }}>U</span>
                  </div>
                </div>
                {/* 竖分割线 */}
                <div className="w-px self-stretch" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(192,192,192,0.3) 20%, rgba(192,192,192,0.3) 80%, transparent 100%)' }} />
                {/* 右栏：ETH/USDT + USDT/CNY */}
                <div className="pl-3 flex flex-col justify-start gap-3" style={{ minWidth: 0, width: '90px', flexShrink: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="text-[10px] mb-0.5" style={{ color: 'rgba(192,192,192,0.45)' }}>ETH/USDT</div>
                    <div className="text-base font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', display: 'block', width: '84px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #e8e8e8 0%, #c0c0c0 50%, #a0a0a0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
                      {currentPrice
                        ? currentPrice.toFixed(2)
                        : '--'}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="text-[10px] mb-0.5" style={{ color: 'rgba(192,192,192,0.45)' }}>USDT/CNY</div>
                    <div className="text-base font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', display: 'block', width: '84px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #e8e8e8 0%, #c0c0c0 50%, #a0a0a0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>{cnyRate.toFixed(5)}</div>
                  </div>
                </div>
              </div>
              {/* 持仓进度区 - ETH 蓝色系 */}
              <div className="mb-3 pt-2" style={{ borderTop: '1px solid rgba(192,192,192,0.1)' }}>
                {/* 数量标注行 */}
                {(() => {
                  const targetQty = parseFloat(targetEthQty) || 0;
                  const actualQty = summary.totalQty || 0;
                  const pct = targetQty > 0 ? Math.min(actualQty / targetQty, 1) : 0;
                  const profitUsdt = targetProfitCny && cnyRate ? parseFloat(targetProfitCny) / cnyRate : 0;
                  // 目标均价：按计划档位数量加权均价
                  let _planCost = 0, _planQty = 0;
                  priceLevels.forEach(p => { const q = planned[p] || 0; if (q > 0) { _planCost += q * p; _planQty += q; } });
                  const targetAvgPrice = _planQty > 0 ? _planCost / _planQty : 0;
                  // 实际均价：按实际买入数量加权均价
                  let _actCost = 0, _actQty = 0;
                  priceLevels.forEach(p => { const q = actual[p] || 0; if (q > 0) { _actCost += q * p; _actQty += q; } });
                  const actualAvgPrice = _actQty > 0 ? _actCost / _actQty : 0;
                  // 止盈价 = 均价 + 目标利润(USDT) ÷ 持仓数量（从成本出发，不依赖当前价）
                  const targetExitPrice = targetAvgPrice > 0 && targetQty > 0 ? targetAvgPrice + profitUsdt / targetQty : 0;
                  const actualExitPrice = actualAvgPrice > 0 && actualQty > 0 ? actualAvgPrice + profitUsdt / actualQty : 0;

                  return (
                    <div>
                      {/* 数量对比行 */}
                      <div className="flex items-end justify-between mb-1.5">
                        <div>
                          <div className="text-[11px] mb-0.5 font-medium tracking-wider" style={{ color: 'rgba(192,192,192,0.45)' }}>实际持仓</div>
                          <span className="text-2xl font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,1))' }}>
                            {actualQty > 0 ? actualQty.toFixed(1) : '--'}
                          </span>
                          <span className="text-xs ml-1" style={{ color: 'rgba(192,192,192,0.3)' }}>ETH</span>
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="text-right">
                            <div className="text-[11px] mb-0.5 font-medium tracking-wider" style={{ color: 'rgba(192,192,192,0.45)' }}>目标持仓</div>
                            <span className="text-2xl font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,1))' }}>
                              {targetQty > 0 ? targetQty.toFixed(0) : '--'}
                            </span>
                            <span className="text-xs ml-1" style={{ color: 'rgba(192,192,192,0.25)' }}>ETH</span>
                          </div>
                        </div>
                      </div>

                      {/* 进度条：目标=深蓝底，实际=亮蓝高光，百分比内嵌右端 */}
                      <div className="relative rounded overflow-hidden" style={{ height: '18px', background: 'rgba(255,255,255,0.04)' }}>
                        {/* 目标底条（满宽，深蓝低光） */}
                        <div className="absolute inset-0 rounded" style={{ background: 'linear-gradient(90deg, rgba(192,192,192,0.1) 0%, rgba(192,192,192,0.03) 100%)' }} />
                        {/* 实际填充（亮蓝高光），内含百分比数字 */}
                        {pct > 0 && (
                          <div
                            className="absolute top-0 left-0 h-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{
                              width: `${pct * 100}%`,
                              background: pct >= 1
                                ? 'linear-gradient(90deg, #9a7000 0%, #d4af37 45%, #f5e27a 80%, #fffbe8 100%)'
                                : 'linear-gradient(90deg, #7a5500 0%, #c8960a 45%, #d4af37 80%, #f0d060 100%)',
                              boxShadow: '0 0 14px rgba(212,175,55,0.6), 0 0 5px rgba(255,245,192,0.4)',
                              minWidth: targetQty > 0 ? '2rem' : '0',
                              borderRadius: '0 4px 4px 0',
                            }}
                          >
                            {targetQty > 0 && (
                              <span
                                className="text-[10px] font-bold whitespace-nowrap"
                                style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 0 4px rgba(79,70,229,0.8)' }}
                              >
                                {(pct * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* ===== 战略/策略持仓细分 ===== */}
                      {actualQty > 0 && (
                        <div className="mt-3 mb-1">
                          {/* 标题行，与"实际持仓"同风格 */}
                          <div className="text-[11px] mb-1.5 font-medium tracking-wider" style={{ color: 'rgba(192,192,192,0.45)' }}>战略筹码 VS 策略筹码比例分配</div>
                          {/* 一体化细分进度条+圆形手柄：纯 touch/mouse 事件拖动 */}
                          <div
                            ref={strategyBarRef}
                            className="relative"
                            style={{
                              height: '32px',
                              cursor: strategyUnlocked ? 'ew-resize' : 'default',
                              touchAction: 'none',
                            }}
                            onDoubleClick={() => {
                              // 双击解锁
                              setStrategyUnlocked(true);
                              if (strategyLockTimer.current) clearTimeout(strategyLockTimer.current);
                              // 8秒无操作后自动重新锁定
                              strategyLockTimer.current = setTimeout(() => {
                                setStrategyUnlocked(false);
                              }, 8000);
                            }}
                            onMouseDown={(e) => {
                              if (!strategyUnlockedRef.current) return;
                              isDraggingStrategy.current = true;
                              const val = calcStrategyRatioFromX(e.clientX);
                              setStrategyRatio(val);
                            }}
                            onTouchEnd={(e) => {
                              // 单指双击检测（移动端没有 dblclick）
                              const now = Date.now();
                              const last = (strategyBarRef.current as any)?._lastTap || 0;
                              if (now - last < 350) {
                                setStrategyUnlocked(true);
                                if (strategyLockTimer.current) clearTimeout(strategyLockTimer.current);
                                strategyLockTimer.current = setTimeout(() => setStrategyUnlocked(false), 8000);
                              }
                              if (strategyBarRef.current) (strategyBarRef.current as any)._lastTap = now;
                            }}
                            onTouchStart={(e) => {
                              if (!strategyUnlockedRef.current) return;
                              isDraggingStrategy.current = true;
                              const val = calcStrategyRatioFromX(e.touches[0].clientX);
                              setStrategyRatio(val);
                            }}
                          >
                            {/* 进度条容器，垂直居中 24px（加高容纳内嵌文字） */}
                            <div className="absolute rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: '24px' }}>
                              {/* 战略持仓段（左侧，亮银） */}
                              <div
                                className="absolute top-0 left-0 h-full flex items-center"
                                style={{
                                  width: `${100 - strategyRatio}%`,
                                  background: 'linear-gradient(90deg, #888888 0%, #c0c0c0 60%, #e8e8e8 100%)',
                                  boxShadow: '2px 0 8px rgba(192,192,192,0.4)',
                                  borderRadius: '4px 0 0 4px',
                                  overflow: 'hidden',
                                  paddingLeft: '6px',
                                  clipPath: 'inset(0 0 0 0 round 4px 0 0 4px)',
                                }}
                              >
                                {/* 战略段：百分比+ETH数量都靠左，紧挨，字重相同，颜色略有区分 */}
                                <span className="text-[10px] font-semibold shrink-0" style={{ color: 'rgba(10,10,10,0.95)' }}>{100 - strategyRatio}%</span>
                                <span className="text-[10px] font-semibold shrink-0 whitespace-nowrap ml-0.5" style={{ color: 'rgba(60,40,0,0.75)' }}>{Math.round(actualQty * (100 - strategyRatio) / 100)}E</span>
                              </div>
                              {/* 策略持仓段（右侧，暗金） */}
                              <div
                                className="absolute top-0 h-full flex items-center justify-end"
                                style={{
                                  left: `${100 - strategyRatio}%`,
                                  width: `${strategyRatio}%`,
                                  background: 'linear-gradient(90deg, rgba(139,100,0,0.7) 0%, rgba(90,60,0,0.5) 100%)',
                                  borderRadius: '0 4px 4px 0',
                                  overflow: 'hidden',
                                  paddingRight: '6px',
                                }}
                              >
                                {/* 策略段：ETH数量+百分比都靠右，紧挨，字重相同，颜色略有区分 */}
                                <span className="text-[10px] font-semibold shrink-0 whitespace-nowrap mr-0.5" style={{ color: 'rgba(255,200,60,0.75)' }}>{Math.round(actualQty * strategyRatio / 100)}E</span>
                                <span className="text-[10px] font-semibold shrink-0" style={{ color: 'rgba(255,240,160,0.98)' }}>{strategyRatio}%</span>
                              </div>
                            </div>
                            {/* 圆形手柄：金色圆底 + 立体 ETH 图标 */}
                            <div
                              className="absolute"
                              style={{
                                left: `calc(${100 - strategyRatio}% - 16px)`,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '32px',
                                height: '32px',
                                zIndex: 10,
                                pointerEvents: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: strategyUnlocked
                                  ? 'linear-gradient(135deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)'
                                  : 'linear-gradient(135deg, #383838 0%, #707070 50%, #404040 100%)',
                                boxShadow: strategyUnlocked
                                  ? '0 0 14px rgba(255,235,100,1), 0 2px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.5)'
                                  : '0 0 6px rgba(192,192,192,0.4), 0 2px 6px rgba(0,0,0,0.8)',
                                border: strategyUnlocked
                                  ? '1.5px solid rgba(255,245,192,0.9)'
                                  : '1.5px solid rgba(192,192,192,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s ease',
                              }}>
                                {/* ETH 菱形 SVG 图标 */}
                                <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <defs>
                                    <linearGradient id="ethTop" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#fffbe8' : '#c0c0c0'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#e8e8e8' : '#888888'} />
                                    </linearGradient>
                                    <linearGradient id="ethMidL" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#fff5c0' : '#a0a0a0'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#c0c0c0' : '#707070'} />
                                    </linearGradient>
                                    <linearGradient id="ethMidR" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#e8e8e8' : '#888888'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#a0a0a0' : '#505050'} />
                                    </linearGradient>
                                    <linearGradient id="ethBot" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#c0c0c0' : '#707070'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#888888' : '#4a3000'} />
                                    </linearGradient>
                                  </defs>
                                  {/* 上半菱形 */}
                                  <polygon points="8,0 15,10 8,7" fill="url(#ethTop)" />
                                  <polygon points="8,0 1,10 8,7" fill="url(#ethMidL)" opacity="0.85" />
                                  {/* 中间带 */}
                                  <polygon points="1,10 8,13.5 15,10 8,7" fill="url(#ethMidR)" />
                                  {/* 下半菱形 */}
                                  <polygon points="8,20 15,12 8,13.5" fill="url(#ethBot)" />
                                  <polygon points="8,20 1,12 8,13.5" fill="url(#ethMidL)" opacity="0.75" />
                                </svg>
                              </div>
                            </div>
                          </div>

                        </div>
                      )}
                      {/* ===== 三行对比区域：止盈 / 涨幅 / 均价，每行左右 + VS 中轴 ===== */}
                      {(() => {
                        // 均价计算
                        let planCost2 = 0, planQtyTotal2 = 0;
                        priceLevels.forEach(p => { const q = planned[p] || 0; if (q > 0) { planCost2 += q * p; planQtyTotal2 += q; } });
                        const targetAvg2 = planQtyTotal2 > 0 ? planCost2 / planQtyTotal2 : 0;
                        let actCost2 = 0, actQtyTotal2 = 0;
                        priceLevels.forEach(p => { const q = actual[p] || 0; if (q > 0) { actCost2 += q * p; actQtyTotal2 += q; } });
                        const actualAvg2 = actQtyTotal2 > 0 ? actCost2 / actQtyTotal2 : 0;

                        const showExitRow = actualExitPrice > 0 || targetExitPrice > 0;
                        const showRiseRow = (actualAvgPrice > 0 && actualExitPrice > actualAvgPrice) || (targetAvgPrice > 0 && targetExitPrice > targetAvgPrice);
                        const showAvgRow = targetAvg2 > 0 || actualAvg2 > 0;

                        // 统一行样式
                        const rowCls = "grid mt-2 pt-2 items-center" as const;
                        const rowStyle = { borderTop: '1px solid rgba(192,192,192,0.08)', gridTemplateColumns: '1fr 28px 1fr' };
                        const labelStyle2: React.CSSProperties = { color: 'rgba(192,192,192,0.38)', fontSize: '11px', letterSpacing: '0.05em', marginBottom: '3px', fontWeight: 500 };
                        const numStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' };
                        const vsStyle: React.CSSProperties = { color: 'rgba(192,192,192,0.2)', fontSize: '11px', fontWeight: 700, textAlign: 'center', letterSpacing: '0.05em', lineHeight: 1 };

                        return (
                          <>
                            {/* 行1：止盈价 */}
                            {showExitRow && (
                              <div className={rowCls} style={rowStyle}>
                                {/* 左：实际止盈 */}
                                <div>
                                  <div style={labelStyle2}>实际止盈</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {actualExitPrice > 0
                                      ? <>{Math.round(actualExitPrice)}<span style={{ color: 'rgba(192,192,192,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                                {/* 中：VS */}
                                <div style={vsStyle}>VS</div>
                                {/* 右：目标止盈 */}
                                <div className="text-right">
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <button onClick={(e) => { e.stopPropagation(); setShowExitPriceInfo(true); }} style={{ color: 'rgba(192,192,192,0.4)', lineHeight: 1 }}>
                                      <HelpCircle className="w-2.5 h-2.5" />
                                    </button>
                                    <span style={labelStyle2}>目标止盈</span>
                                  </div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {targetExitPrice > 0
                                      ? <>{Math.round(targetExitPrice)}<span style={{ color: 'rgba(192,192,192,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 行2：需要涨幅 */}
                            {showRiseRow && (
                              <div className={rowCls} style={rowStyle}>
                                {/* 左：实际需要涨幅 */}
                                <div>
                                  <div style={labelStyle2}>实际需要涨幅</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {actualAvgPrice > 0 && actualExitPrice > actualAvgPrice
                                      ? `+${((actualExitPrice - actualAvgPrice) / actualAvgPrice * 100).toFixed(1)}%`
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                                {/* 中：VS */}
                                <div style={vsStyle}>VS</div>
                                {/* 右：目标需要涨幅 */}
                                <div className="text-right">
                                  <div style={labelStyle2}>目标需要涨幅</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {targetAvgPrice > 0 && targetExitPrice > targetAvgPrice
                                      ? `+${((targetExitPrice - targetAvgPrice) / targetAvgPrice * 100).toFixed(1)}%`
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 行3：均价 */}
                            {showAvgRow && (
                              <div className={rowCls} style={rowStyle}>
                                {/* 左：实际均价 */}
                                <div>
                                  <div style={labelStyle2}>实际均价</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {actualAvg2 > 0
                                      ? <>{Math.round(actualAvg2)}<span style={{ color: 'rgba(192,192,192,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                                {/* 中：VS */}
                                <div style={vsStyle}>VS</div>
                                {/* 右：目标均价 */}
                                <div className="text-right">
                                  <div style={labelStyle2}>目标均价</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {targetAvg2 > 0
                                      ? <>{Math.round(targetAvg2)}<span style={{ color: 'rgba(192,192,192,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(192,192,192,0.25)' }}>--</span>}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()
              }
            </div>

            </div>
          </div>
        ) : (
          // 编辑模式
          <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(160deg, #0d0900 0%, #1a1200 100%)', border: '1px solid rgba(192,192,192,0.22)', boxShadow: '0 12px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(192,192,192,0.15)' }}>
            <div className="text-xs font-medium text-gray-500 mb-3 tracking-wide">目标止盈利润—编辑</div>
            {/* 人民币输入 */}
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">目标利润（人民币）</div>
              <div className="flex items-center gap-2 border-b-2 border-blue-300 pb-1">
                <span className="text-lg font-bold text-gray-400">¥</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="输入金额"
                  value={targetProfitCny}
                  onChange={e => setTargetProfitCny(e.target.value)}
                  className="flex-1 text-2xl font-bold outline-none bg-transparent placeholder:font-normal placeholder:text-lg" style={{ color: '#fff', '--tw-placeholder-opacity': '1' } as React.CSSProperties}
                  autoFocus
                />
              </div>
            </div>

            {/* 汇率输入 */}
            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-1">USD/CNY 汇率</div>
              <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={cnyRateInput}
                  onChange={e => setCnyRateInput(e.target.value)}
                  className="flex-1 text-base font-semibold text-gray-700 outline-none bg-transparent"
                />
              </div>
            </div>
            {/* 保存按钮 */}
            <button
              onClick={() => {
                const v = parseFloat(cnyRateInput);
                const rate = (!isNaN(v) && v > 0) ? v : cnyRate;
                const profit = parseFloat(targetProfitCny) || 0;
                if (!isNaN(v) && v > 0) setCnyRate(v);
                setEditingRate(false);
                // 保存到数据库（汇率不保存，始终用实时值）
                if (ledgerId > 0) {
                  saveSettingsMutation.mutate({ ledgerId, targetProfitCny: profit, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0, priceStep });
                }
              }}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
            >
              保存
            </button>
          </div>
        )}
      </div>




      {/* 汇总卡片已删除 */}
      <div style={{display:'none'}}>
        <div>
          <div>
            {/* 总持仓卡片：计划+实际+达成率，点击可编辑 */}
            <div
              className="bg-blue-50 rounded-xl p-3 col-span-2 cursor-pointer active:bg-blue-100 transition-colors"
              onClick={() => setSummaryEdit({ field: 'totalActual', inputValue: String(summary.totalQty.toFixed(4)) })}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500">总持仓量</div>
                <div className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: summary.totalPlanned > 0 ? (summary.totalQty / summary.totalPlanned >= 1 ? '#D1FAE5' : '#DBEAFE') : '#F3F4F6',
                    color: summary.totalPlanned > 0 ? (summary.totalQty / summary.totalPlanned >= 1 ? '#059669' : '#1A56DB') : '#9CA3AF',
                  }}
                >
                  达成率 {summary.totalPlanned > 0 ? `${Math.min((summary.totalQty / summary.totalPlanned) * 100, 100).toFixed(1)}%` : '--'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="bg-white rounded-lg px-3 py-2 text-center cursor-pointer"
                  onClick={e => { e.stopPropagation(); setSummaryEdit({ field: 'totalActual', inputValue: String(summary.totalQty.toFixed(4)) }); }}
                >
                  <div className="text-[10px] text-gray-400 mb-0.5">实际持仓</div>
                  <div className="text-lg font-bold tabular-nums" style={{ color: '#1A56DB' }}>
                    {summary.totalQty.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-400">ETH</div>
                </div>
                <div
                  className="bg-white rounded-lg px-3 py-2 text-center cursor-pointer"
                  onClick={e => { e.stopPropagation(); setSummaryEdit({ field: 'totalPlanned', inputValue: String(summary.totalPlanned.toFixed(4)) }); }}
                >
                  <div className="text-[10px] text-gray-400 mb-0.5">计划持仓</div>
                  <div className="text-lg font-bold tabular-nums text-gray-600">
                    {summary.totalPlanned.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-400">ETH</div>
                </div>
              </div>
              {/* 达成进度条 */}
              <div className="mt-2 h-1.5 rounded bg-blue-100 overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${summary.totalPlanned > 0 ? Math.min((summary.totalQty / summary.totalPlanned) * 100, 100) : 0}%`,
                    background: 'linear-gradient(90deg, #1A56DB, #3B82F6)',
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#0d0900', border: '1px solid rgba(192,192,192,0.12)' }}>
              <div className="text-xs mb-1 tracking-widest" style={{ color: 'rgba(192,192,192,0.4)' }}>当前市值</div>
              <div className="text-xl font-bold" style={{ color: '#c0c0c0', textShadow: '0 0 12px rgba(192,192,192,0.35)' }}>
                {summary.totalValue > 0 ? `$${summary.totalValue.toFixed(0)}` : '--'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.35)' }}>
                成本 ${summary.avgPrice > 0 ? (summary.avgPrice * summary.totalQty).toFixed(0) : '--'}
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#0d0900', border: `1px solid ${isPnlPositive ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
              <div className="text-xs mb-1 tracking-widest" style={{ color: 'rgba(192,192,192,0.4)' }}>总浮盈亏</div>
              <div className={`text-xl font-bold flex items-center gap-1 ${isPnlPositive ? 'text-red-500' : 'text-green-600'}`}>
                {isPnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {summary.totalPnl !== 0 ? `${isPnlPositive ? '+' : ''}$${summary.totalPnl.toFixed(0)}` : '--'}
              </div>
              <div className={`text-xs mt-0.5 ${isPnlPositive ? 'text-red-400' : 'text-green-500'}`}>
                {summary.pnlPct !== 0 ? `${isPnlPositive ? '+' : ''}${summary.pnlPct.toFixed(2)}%` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 档位列表：每档一条进度条 */}
      <div className="px-4 space-y-1.5">
        {visibleLevels.map(price => {
          const planQty = planned[price] || 0;
          const actualQty = actual[price] || 0;
          const bq = baseQty[price] || 0;     // 底仓
          const tq = tacticalQty[price] || 0; // 机动仓
          // 计划条宽度：以全局最大值为基准等比例，最小显示8%（有数据时）
          const planPct = planQty > 0 ? Math.max(Math.round(planQty / maxGlobalQty * 100), 8) : 0;
          // 实际条宽度：以全局最大值为基准等比例（不再 cap 到计划量）
          const actualPct = actualQty > 0 ? Math.max(Math.round(actualQty / maxGlobalQty * 100), 4) : 0;
          // 底仓和机动仓的宽度（按各自比例叠加，总宽度=actualPct）
          const basePct = actualQty > 0 ? Math.round(actualPct * (bq / actualQty)) : 0;
          const tacticalPct = actualQty > 0 ? Math.round(actualPct * (tq / actualQty)) : 0;
          // 是否有子仓位数据
          const hasSubQty = bq > 0 || tq > 0;
          // 文字颜色判断用：实际条是否覆盖到左侧/右侧
          const actualPctForColor = planQty > 0
            ? Math.min((actualQty / planQty) * 100, 100)
            : (actualQty > 0 ? 100 : 0);
          const planPctForColor = planQty > 0 ? Math.max(Math.round(planQty / maxPlannedQty * 100), 8) : 100;
          // ETH 图标规则：当前价格向下取整到最近档位（每50元一档）
          // 如价格2347 → floor(2347/50)*50 = 2300，图标显示在2300档
          const currentFloorPrice = currentPrice ? Math.floor(currentPrice / 50) * 50 : null;
          const isNearCurrent = currentFloorPrice !== null && price === currentFloorPrice;
          const isBelowCurrent = currentPrice ? price <= currentPrice : false;
          const isFullyBought = planQty > 0 && actualQty >= planQty;

          return (
            <button
              key={price}
              onClick={() => setSelectedPrice(prev => prev === price ? null : price)}
              onDoubleClick={() => openModal(price)}
              className="w-full block"
            >
              {/* 进度条容器 */}
              <div
                className="relative h-6 rounded overflow-hidden transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: isNearCurrent
                    ? 'linear-gradient(90deg, #100c00 0%, #1a1200 50%, #100c00 100%)'
                    : (isBelowCurrent ? '#080600' : '#040300'),
                  boxShadow: selectedPrice === price
                    ? '0 0 0 2px rgba(192,192,192,0.9), 0 0 12px rgba(192,192,192,0.3)'
                    : 'none',
                }}
              >
                {/* 计划量条：半透明金色描边，作为底层背景（zIndex 1） */}
                {planQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{
                      width: `${planPct}%`,
                      background: 'linear-gradient(90deg, rgba(192,192,192,0.18) 0%, rgba(192,192,192,0.12) 100%)',
                      borderRight: '1px solid rgba(192,192,192,0.35)',
                      borderRadius: '0 3px 3px 0',
                      zIndex: 1,
                    }}
                  />
                )}
                {/* 实际已买：底仓（蓝色）+ 机动仓（橙色）叠加显示 */}
                {actualQty > 0 && (
                  hasSubQty ? (
                    <>
                      {/* 底仓：蓝色，从左起 */}
                      {bq > 0 && (
                        <div
                          className="absolute left-0 top-0 h-full transition-all duration-300"
                          style={{
                            width: `${basePct}%`,
                            background: tq > 0
                              ? 'linear-gradient(90deg, #003a7a 0%, #0055b3 50%, #1a6db8 100%)'
                              : 'linear-gradient(90deg, #003a7a 0%, #0055b3 45%, #1a7fd4 80%, #4aa8ff 100%)',
                            boxShadow: tq > 0 ? 'none' : '0 0 6px rgba(26,127,212,0.5)',
                            minWidth: '4px',
                            borderRadius: tq > 0 ? '0 0 0 0' : '0 3px 3px 0',
                            zIndex: 2,
                          }}
                        />
                      )}
                      {/* 机动仓：橙色，接在底仓后面 */}
                      {tq > 0 && (
                        <div
                          className="absolute top-0 h-full transition-all duration-300"
                          style={{
                            left: `${basePct}%`,
                            width: `${tacticalPct}%`,
                            background: 'linear-gradient(90deg, #8a3e00 0%, #c85a0a 45%, #e87020 80%, #ff9040 100%)',
                            boxShadow: 'none',
                            minWidth: '4px',
                            borderRadius: '0 3px 3px 0',
                            zIndex: 2,
                          }}
                        />
                      )}
                    </>
                  ) : (
                    /* 旧数据兼容：没有底仓/机动仓数据时，显示金色条 */
                    <div
                      className="absolute left-0 top-0 h-full transition-all duration-300"
                      style={{
                        width: `${actualPct}%`,
                        background: isFullyBought
                          ? 'linear-gradient(90deg, #888888 0%, #c0c0c0 45%, #e8e8e8 80%, #fffbe8 100%)'
                          : 'linear-gradient(90deg, #707070 0%, #c8960a 45%, #c0c0c0 80%, #f0d060 100%)',
                        boxShadow: '0 0 8px rgba(192,192,192,0.4)',
                        minWidth: '4px',
                        borderRadius: '0 3px 3px 0',
                        zIndex: 2,
                      }}
                    />
                  )
                )}

                {/* 价格文字（叠加在进度条上，始终可见） */}
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none" style={{ zIndex: 10 }}>
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color: isBelowCurrent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                      textShadow: '0 1px 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.8)',
                    }}
                  >
                    {price}
                  </span>
  
                </div>

                {/* 当前价格区间 ETH logo：靠右对齐 */}
                {isNearCurrent && (
                  <div className="absolute right-1 top-0 h-full flex items-center pointer-events-none" style={{ zIndex: 20 }}>
                    <svg
                      width="18" height="18"
                      viewBox="0 0 22 22"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle cx="11" cy="11" r="11" fill="rgba(0,0,0,0.6)" />
                      <polygon points="11,3 17,11 11,9" fill="#ffffff" />
                      <polygon points="11,3 5,11 11,9" fill="rgba(255,255,255,0.7)" />
                      <polygon points="11,19 17,13 11,15" fill="rgba(255,255,255,0.9)" />
                      <polygon points="11,19 5,13 11,15" fill="rgba(255,255,255,0.55)" />
                    </svg>
                  </div>
                )}
                {/* 右侧数量标注：智能颜色——进度条覆盖到右侧时用白色+阴影，否则用深色 */}
                <div className="absolute top-0 h-full flex items-center pointer-events-none" style={{ zIndex: 10, right: isNearCurrent ? '22px' : '12px' }}>
                    <span
                      className="text-[11px] font-bold tabular-nums"
                      style={{
                        color: 'rgba(255,255,255,0.75)',
                        textShadow: '0 1px 4px rgba(0,0,0,1)',
                      }}
                    >
                      <span>
                        {Math.round(actualQty)}
                      </span>
                      <span style={{ opacity: 0.6, margin: '0 1px' }}>/</span>
                      <span style={{ opacity: 0.85 }}>
                        {Math.round(planQty)}
                      </span>
                    </span>
                  </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 计划总量 vs 目标仓位 统计行 */}
      {(() => {
        const planTotal = priceLevels.reduce((s, p) => s + (planned[p] || 0), 0);
        const targetTotal = parseFloat(targetEthQty) || 0;
        const diff = planTotal - targetTotal;
        const hasPlan = planTotal > 0;
        const hasTarget = targetTotal > 0;
        if (!hasPlan && !hasTarget) return null;
        const isOver = diff > 0.5;
        const isUnder = diff < -0.5;
        const isMatch = !isOver && !isUnder;
        return (
          <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center justify-between"
            style={{
              background: isOver ? 'rgba(255,80,80,0.08)' : isUnder ? 'rgba(255,200,0,0.07)' : 'rgba(74,222,128,0.07)',
              border: `1px solid ${isOver ? 'rgba(255,80,80,0.25)' : isUnder ? 'rgba(255,200,0,0.2)' : 'rgba(74,222,128,0.2)'}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>计划合计</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#f0d060' }}>{Math.round(planTotal)} ETH</span>
              {hasTarget && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>目标 {Math.round(targetTotal)}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isMatch && hasTarget && (
                <span className="text-xs font-medium" style={{ color: '#4ade80' }}>✓ 已匹配</span>
              )}
              {isOver && (
                <span className="text-xs font-medium" style={{ color: '#ff5050' }}>超出 +{Math.round(diff)} ETH</span>
              )}
              {isUnder && (
                <span className="text-xs font-medium" style={{ color: '#ffc800' }}>缺口 −{Math.round(Math.abs(diff))} ETH</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* 底部提示 */}
      <div className="px-4 pt-4 pb-2 text-center text-xs" style={{ color: 'rgba(192,192,192,0.3)' }}>
        价格范围 $1,000 ~ $3,500 · 每50元一档 · 共50档
      </div>

      {/* 汇总卡片编辑弹窗 */}
      {summaryEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSummaryEdit(null); }}
        >
          <div className="bg-white w-full max-w-md rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold text-gray-800">
                {summaryEdit.field === 'totalActual' ? '修改实际总持仓' : '修改计划总持仓'}
              </div>
              <button onClick={() => setSummaryEdit(null)} className="p-1.5 rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="text-xs text-gray-400 mb-3">
              {summaryEdit.field === 'totalActual'
                ? '输入实际总持仓量，系统将按计划比例自动分配到各档位'
                : '输入计划总持仓量，系统将按原比例缩放各档计划'
              }
            </div>
            <input
              autoFocus
              type="number"
              value={summaryEdit.inputValue}
              onChange={e => setSummaryEdit(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSummaryEdit(); if (e.key === 'Escape') setSummaryEdit(null); }}
              placeholder="输入 ETH 数量"
              className="w-full px-4 py-3 rounded-xl text-base border outline-none"
              style={{ borderColor: summaryEdit.field === 'totalActual' ? '#3B82F6' : '#D1D5DB' }}
              step="0.01"
              min="0"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setSummaryEdit(null)}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={confirmSummaryEdit}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: summaryEdit.field === 'totalActual' ? '#1A56DB' : '#6B7280' }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自动分配计划持仓弹窗 */}
      {showAutoAlloc && (() => {
        const totalQty = parseFloat(targetEthQty) || 0;
        const minP = parseFloat(allocMinPrice) || 0;
        const maxP = parseFloat(allocMaxPrice) || 0;
        const allocLevels = priceLevels.filter(p => p >= minP && p <= maxP);
        const previewResult = allocStep === 'preview' ? allocPreview : {};
        const previewTotal = Object.values(previewResult).reduce((s, v) => s + v, 0);
        return (
          <div
            className="fixed inset-0 z-50 overflow-x-hidden"
            style={{ background: '#0a0f1e' }}
          >
            <div className="w-full h-full max-w-md mx-auto overflow-x-hidden" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0f1e' }}>
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <div className="text-base font-bold" style={{ color: '#f1f5f9' }}>
                    {allocStep === 'setup' ? '持仓配置' : '自动分配计划持仓'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {allocStep === 'setup' ? '设置目标止盈与持仓数量' : `目标持仓 ${totalQty.toFixed(2)} ETH`}
                  </div>
                </div>
                <button onClick={() => setShowAutoAlloc(false)} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {/* 步骤指示器 */}
              <div className="flex items-center px-5 py-3 gap-2">
                {(['setup', 'method', 'preview'] as const).map((step, i) => (
                  <React.Fragment key={step}>
                    <div className="flex items-center gap-1">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: allocStep === step ? '#1A56DB' : (i < ['setup','method','preview'].indexOf(allocStep) ? '#10B981' : '#E5E7EB'),
                          color: allocStep === step || i < ['setup','method','preview'].indexOf(allocStep) ? 'white' : 'rgba(255,255,255,0.3)'
                        }}
                      >{i + 1}</div>
                      <span className="text-xs" style={{ color: allocStep === step ? '#1A56DB' : '#9CA3AF' }}>
                        {step === 'setup' ? '目标' : step === 'method' ? '分配' : '预览'}
                      </span>
                    </div>
                    {i < 2 && <div className="flex-1 h-px bg-gray-200" />}
                  </React.Fragment>
                ))}
              </div>
              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4">
                {/* 步骤 0：目标止盈 + 持仓数量联动 */}
                {allocStep === 'setup' && (() => {
                  const profitUsdt = targetProfitCny && cnyRate ? parseFloat(targetProfitCny) / cnyRate : 0;
                  const qty = parseFloat(targetEthQty) || 0;
                  const simpleTargetPrice = qty > 0 && profitUsdt > 0 ? (currentPrice || 0) + profitUsdt / qty : 0;
                  const simpleRisePct = currentPrice && simpleTargetPrice > currentPrice
                    ? ((simpleTargetPrice - currentPrice) / currentPrice * 100) : 0;
                  const progressPct = simpleTargetPrice > 0 && currentPrice ? Math.min(currentPrice / simpleTargetPrice, 1) : 0;
                  const QTY_MIN = 100, QTY_MAX = 5000, QTY_STEP = 10;
                  const qtyVal = parseFloat(targetEthQty) || QTY_MIN;
                  const qtyPct = Math.min(Math.max((qtyVal - QTY_MIN) / (QTY_MAX - QTY_MIN) * 100, 0), 100);
                  const SLIDER_MIN = 1000, SLIDER_MAX = 3500, SLIDER_STEP = 50;
                  const minVal2 = parseFloat(allocMinPrice) || SLIDER_MIN;
                  const maxVal2 = parseFloat(allocMaxPrice) || SLIDER_MAX;
                  const minPct2 = ((minVal2 - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
                  const maxPct2 = ((maxVal2 - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
                  const allocLevels2 = priceLevels.filter(p => p >= minVal2 && p <= maxVal2);

                  // 统一卡片样式
                  const cardStyle: React.CSSProperties = {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '12px',
                  };
                  const labelStyle: React.CSSProperties = {
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.45)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase' as const,
                    marginBottom: '10px',
                    display: 'block',
                  };

                  return (
                    <div>
                      {/* 区块1：目标止盈利润 */}
                      <div style={cardStyle}>
                        <span style={labelStyle}>目标止盈利润</span>
                        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '2px solid #F59E0B' }}>
                          <span className="text-xl font-bold" style={{ color: '#fbbf24' }}>¥</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="输入目标利润（人民币）"
                            value={targetProfitCny}
                            onChange={e => setTargetProfitCny(e.target.value)}
                            className="flex-1 text-2xl font-bold outline-none bg-transparent placeholder:font-normal placeholder:text-lg" style={{ color: '#fff', '--tw-placeholder-opacity': '1' } as React.CSSProperties}
                            autoFocus
                          />
                        </div>
                        {profitUsdt > 0 && (
                          <div className="text-xs mt-2" style={{ color: 'rgba(96,165,250,0.8)' }}>≈ ${profitUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT</div>
                        )}
                      </div>

                      {/* 区块2：当前价 → 需涨至（联动结果） */}
                      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(26,26,46,0.9) 0%, rgba(15,52,96,0.9) 100%)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>当前 ETH 价格</div>
                            <div className="text-xl font-bold" style={{ color: '#93c5fd' }}>
                              {currentPrice ? `$${currentPrice.toFixed(0)}` : '--'}
                            </div>
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '20px' }}>→</div>
                          <div className="text-right">
                            <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>需涨至（估算）</div>
                            <div className="text-xl font-bold" style={{ color: profitUsdt > 0 && qty > 0 ? '#fbbf24' : 'rgba(255,255,255,0.2)' }}>
                              {simpleTargetPrice > 0 ? `$${simpleTargetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}
                            </div>
                          </div>
                        </div>
                        {/* 进度条 */}
                        <div className="relative rounded overflow-hidden mb-2" style={{ height: '14px', background: 'rgba(255,255,255,0.1)' }}>
                          <div className="absolute top-0 left-0 h-full rounded transition-all duration-500"
                            style={{ width: `${progressPct * 100}%`, background: 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%)', boxShadow: '0 0 8px rgba(96,165,250,0.6)' }}
                          />
                          {progressPct > 0 && (
                            <div className="absolute inset-0 flex items-center justify-end pr-2">
                              <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>{(progressPct * 100).toFixed(0)}%</span>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>当前价</span>
                          <span className="text-xs font-semibold" style={{ color: simpleRisePct > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>
                            {simpleRisePct > 0 ? `还需涨 +${simpleRisePct.toFixed(1)}%` : '请先输入目标利润和持仓数'}
                          </span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>止盈价</span>
                        </div>
                      </div>

                      {/* 区块3：目标持仓数量 */}
                      <div style={cardStyle}>
                        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                          <span style={labelStyle}>目标持仓数量</span>
                        </div>
                        <div className="flex items-center gap-2 pb-2 mb-3" style={{ borderBottom: '2px solid rgba(99,102,241,0.6)' }}>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="输入 ETH 数量"
                            value={targetEthQty}
                            onChange={e => setTargetEthQty(e.target.value)}
                            className="min-w-0 flex-1 text-2xl font-bold outline-none bg-transparent placeholder:text-gray-600 placeholder:font-normal placeholder:text-lg" style={{ color: '#fff' }}
                          />
                          <span className="text-sm font-medium flex-shrink-0" style={{ color: 'rgba(192,192,192,0.5)' }}>ETH</span>
                        </div>
                        {/* 滑动条 */}
                        <div className="relative" style={{ height: '32px' }}>
                          <div className="absolute top-1/2 left-0 right-0 rounded-full" style={{ height: '5px', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)' }} />
                          <div className="absolute top-1/2 left-0 rounded-full" style={{ height: '5px', transform: 'translateY(-50%)', width: `${qtyPct}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }} />
                          <input type="range" min={QTY_MIN} max={QTY_MAX} step={QTY_STEP}
                            value={Math.min(Math.max(qtyVal, QTY_MIN), QTY_MAX)}
                            onChange={e => setTargetEthQty(e.target.value)}
                            className="absolute w-full appearance-none bg-transparent cursor-pointer"
                            style={{ top: '50%', transform: 'translateY(-50%)', height: '32px', zIndex: 2 }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{QTY_MIN}</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{(QTY_MIN + QTY_MAX) / 2}</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{QTY_MAX}</span>
                        </div>
                      </div>

                      {/* 区块4：买入价格区间 */}
                      <div style={cardStyle}>
                        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                          <span style={labelStyle}>买入价格区间</span>
                          <span className="text-xs" style={{ color: 'rgba(96,165,250,0.8)' }}>{allocLevels2.length > 0 ? `${allocLevels2.length} 个档位` : '--'}</span>
                        </div>
                        {/* 当前价下限 */}
                        {(() => {
                          const priceFloor = currentPrice ? Math.min(3450, Math.max(1000, Math.round(currentPrice / 50) * 50)) : SLIDER_MIN;
                          return (
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>最低价</span>
                                  {currentPrice && <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>≥当前价</span>}
                                </div>
                                <div className="text-lg font-bold" style={{ color: '#93c5fd' }}>${minVal2.toLocaleString()}</div>
                              </div>
                              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>~</div>
                              <div className="text-right">
                                <div className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>最高价</div>
                                <div className="text-lg font-bold" style={{ color: '#93c5fd' }}>${maxVal2.toLocaleString()}</div>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="relative mx-1 dual-range" style={{ height: '40px' }}>
                          <div className="absolute top-1/2 left-0 right-0 rounded-full" style={{ height: '5px', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)' }} />
                          <div className="absolute top-1/2 rounded-full" style={{ height: '5px', transform: 'translateY(-50%)', left: `${minPct2}%`, right: `${100 - maxPct2}%`, background: 'linear-gradient(90deg, #3B82F6, #1D4ED8)' }} />
                          <input type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={SLIDER_STEP} value={minVal2}
                            onChange={e => {
                              const priceFloor = currentPrice ? Math.min(3450, Math.max(1000, Math.round(currentPrice / 50) * 50)) : SLIDER_MIN;
                              const v = Math.max(priceFloor, Math.min(parseInt(e.target.value), maxVal2 - SLIDER_STEP));
                              setAllocMinPrice(String(v));
                            }}
                            className="absolute w-full appearance-none bg-transparent cursor-pointer"
                            style={{ top: '50%', transform: 'translateY(-50%)', height: '40px', zIndex: 3, clipPath: `inset(0 ${100 - (minPct2 + maxPct2) / 2}% 0 0)` }}
                          />
                          <input type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={SLIDER_STEP} value={maxVal2}
                            onChange={e => setAllocMaxPrice(String(Math.max(parseInt(e.target.value), minVal2 + SLIDER_STEP)))}
                            className="absolute w-full appearance-none bg-transparent cursor-pointer"
                            style={{ top: '50%', transform: 'translateY(-50%)', height: '40px', zIndex: 4, clipPath: `inset(0 0 0 ${(minPct2 + maxPct2) / 2}%)` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 px-0.5">
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>$1000</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>$1750</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>$2500</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>$3500</span>
                        </div>
                      </div>

                      {/* 区坘5：档位粒度 */}
                      <div style={cardStyle}>
                        <span style={labelStyle}>档位粒度</span>
                        <div className="grid grid-cols-4 gap-2">
                          {([20, 50, 100, 200] as const).map(step => (
                            <button
                              key={step}
                              onClick={() => setPriceStep(step)}
                              className="py-2 rounded-xl text-sm font-bold relative"
                              style={{
                                background: priceStep === step
                                  ? 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)'
                                  : 'rgba(255,255,255,0.06)',
                                color: priceStep === step ? '#0a0800' : 'rgba(255,255,255,0.55)',
                                border: priceStep === step ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
                              }}
                            >
                              {step}
                              {step === 50 && (
                                <span className="absolute -top-1.5 -right-1 text-[9px] px-1 rounded-full font-bold"
                                  style={{ background: '#f59e0b', color: '#0a0800' }}>推荐</span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          当前：每 ${priceStep} 一档，共 {Math.floor((3500 - 1000) / priceStep) + 1} 个档位
                        </div>
                      </div>

                      {/* 操作按鈕 */}
                      <button
                        onClick={() => {
                          if (ledgerId > 0) {
                            saveSettingsMutation.mutate({ ledgerId, targetProfitCny: parseFloat(targetProfitCny) || 0, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0, priceStep });
                          }
                          setAllocStep('method');
                        }}
                        disabled={parseFloat(targetEthQty) <= 0 || !targetProfitCny}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white mb-3 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
                      >
                        下一步：选择分配方式
                      </button>
                      <button
                        onClick={() => {
                          if (ledgerId > 0) {
                            saveSettingsMutation.mutate({ ledgerId, targetProfitCny: parseFloat(targetProfitCny) || 0, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0, priceStep });
                          }
                          setShowAutoAlloc(false);
                        }}
                        className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)' }}
                      >
                        仅保存，不配置分配
                      </button>
                    </div>
                  );
                })()}
                {allocStep === 'range' && (
                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-4">设置买入价格区间</div>
                    {/* 目标持仓数量输入（移入配置弹窗） */}
                    <div className="mb-4">
                      <div className="text-xs text-gray-400 mb-1">目标持仓 ETH 数量</div>
                      <div className="flex items-center gap-2 border-b-2 pb-1" style={{ borderColor: '#3B82F6' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="输入 ETH 数量"
                          value={targetEthQty}
                          onChange={e => setTargetEthQty(e.target.value)}
                          className="min-w-0 flex-1 text-2xl font-bold outline-none bg-transparent placeholder:text-gray-600 placeholder:font-normal placeholder:text-lg" style={{ color: '#fff', minWidth: 0 }}
                        />
                        <span className="text-sm font-medium text-gray-400 flex-shrink-0">ETH</span>
                      </div>
                    </div>
                    {/* 双端滑动区间选择器 */}
                    {(() => {
                      const SLIDER_MIN = 1000;
                      const SLIDER_MAX = 3500;
                      const SLIDER_STEP = 50;
                      const TOTAL_STEPS = (SLIDER_MAX - SLIDER_MIN) / SLIDER_STEP; // 50 steps = 51 points
                      const minVal = parseFloat(allocMinPrice) || SLIDER_MIN;
                      const maxVal = parseFloat(allocMaxPrice) || SLIDER_MAX;
                      const minPct = ((minVal - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
                      const maxPct = ((maxVal - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
                      return (
                        <div className="mb-5">
                          {/* 当前区间显示 */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-center">
                              <div className="text-xs text-gray-400 mb-0.5">最低价</div>
                              <div className="text-lg font-bold text-blue-600">${minVal.toLocaleString()}</div>
                            </div>
                            <div className="flex-1 mx-3 text-center">
                              <div className="text-xs text-gray-400">{allocLevels.length > 0 ? allocLevels.length : '--'} 个档位</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400 mb-0.5">最高价</div>
                              <div className="text-lg font-bold text-blue-600">${maxVal.toLocaleString()}</div>
                            </div>
                          </div>
                          {/* 滑动轨道 */}
                          <div className="relative mx-1 dual-range" style={{ height: '44px' }}>
                            {/* 背景轨道 */}
                            <div className="absolute top-1/2 left-0 right-0 rounded-full" style={{ height: '6px', transform: 'translateY(-50%)', background: '#E5E7EB' }} />
                            {/* 选中区间高亮 */}
                            <div
                              className="absolute top-1/2 rounded-full"
                              style={{
                                height: '6px',
                                transform: 'translateY(-50%)',
                                left: `${minPct}%`,
                                right: `${100 - maxPct}%`,
                                background: 'linear-gradient(90deg, #3B82F6, #1D4ED8)',
                              }}
                            />
                            {/* 最低价滑块：只在左半区域（0% ~ midPct）接收事件 */}
                            <input
                              type="range"
                              min={SLIDER_MIN}
                              max={SLIDER_MAX}
                              step={SLIDER_STEP}
                              value={minVal}
                              onChange={e => {
                                const v = Math.min(parseInt(e.target.value), maxVal - SLIDER_STEP);
                                setAllocMinPrice(String(v));
                              }}
                              className="absolute w-full appearance-none bg-transparent cursor-pointer"
                              style={{
                                top: '50%',
                                transform: 'translateY(-50%)',
                                height: '44px',
                                zIndex: 3,
                                clipPath: `inset(0 ${100 - (minPct + maxPct) / 2}% 0 0)`,
                              }}
                            />
                            {/* 最高价滑块：只在右半区域（midPct ~ 100%）接收事件 */}
                            <input
                              type="range"
                              min={SLIDER_MIN}
                              max={SLIDER_MAX}
                              step={SLIDER_STEP}
                              value={maxVal}
                              onChange={e => {
                                const v = Math.max(parseInt(e.target.value), minVal + SLIDER_STEP);
                                setAllocMaxPrice(String(v));
                              }}
                              className="absolute w-full appearance-none bg-transparent cursor-pointer"
                              style={{
                                top: '50%',
                                transform: 'translateY(-50%)',
                                height: '44px',
                                zIndex: 4,
                                clipPath: `inset(0 0 0 ${(minPct + maxPct) / 2}%)`,
                              }}
                            />
                          </div>
                          {/* 刻度标注 */}
                          <div className="flex justify-between mt-1 px-0.5">
                            <span className="text-xs text-gray-300">$1000</span>
                            <span className="text-xs text-gray-300">$1750</span>
                            <span className="text-xs text-gray-300">$2500</span>
                            <span className="text-xs text-gray-300">$3500</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>只在此区间内的档位进行分配，共 {allocLevels.length > 0 ? allocLevels.length : '--'} 个档位</div>
                    {allocLevels.length > 0 && (
                      <div className="rounded-xl p-3 mb-4" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                        <div className="text-xs text-blue-600">将在 {allocLevels.length} 个档位分配 {totalQty.toFixed(2)} ETH</div>
                        <div className="text-xs text-blue-400 mt-0.5">价格区间：${Math.min(...allocLevels)} ~ ${Math.max(...allocLevels)}</div>
                      </div>
                    )}
                    <button
                      disabled={allocLevels.length === 0 || totalQty <= 0}
                      onClick={() => setAllocStep('method')}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
                    >
                      下一步：选择分配方式
                    </button>
                  </div>
                )}
                {/* 步骤 2：选择分配方式 */}
                {allocStep === 'method' && (
                  <div>
                    <div className="text-sm font-semibold mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>选择分配方式</div>
                    <div className="space-y-3 mb-4">
                      {/* 等差 */}
                      <button
                        onClick={() => setAllocMethod('equal')}
                        className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                        style={{
                          background: allocMethod === 'equal' ? '#EFF6FF' : '#F9FAFB',
                          border: `1px solid ${allocMethod === 'equal' ? '#3B82F6' : '#E5E7EB'}`
                        }}
                      >
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0"
                          style={{ borderColor: allocMethod === 'equal' ? '#3B82F6' : '#D1D5DB' }}
                        >
                          {allocMethod === 'equal' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-800">等差分配</div>
                            {allocMethod === 'equal' && (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setAllocEqualAsc(false)}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                  style={{ background: !allocEqualAsc ? '#3B82F6' : '#E5E7EB', color: !allocEqualAsc ? '#fff' : '#6B7280' }}
                                >越低越多</button>
                                <button
                                  onClick={() => setAllocEqualAsc(true)}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                  style={{ background: allocEqualAsc ? '#3B82F6' : '#E5E7EB', color: allocEqualAsc ? '#fff' : '#6B7280' }}
                                >越高越多</button>
                              </div>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.35)' }}>{allocEqualAsc && allocMethod === 'equal' ? '越高价格买越多' : '越低价格买越多'}，相邻档位数量差异固定</div>
                          {allocMethod === 'equal' && (
                            <div className="mt-2" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">公差（0=均匀，越大梯度越大）</span>
                                <span className="text-xs font-bold" style={{ color: '#3B82F6' }}>{Math.round(parseFloat(allocArithDiff))} ETH</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="10"
                                step="1"
                                value={Math.round(parseFloat(allocArithDiff) || 0)}
                                onChange={e => setAllocArithDiff(String(Math.round(parseFloat(e.target.value))))}
                                onClick={e => e.stopPropagation()}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: '#3B82F6' }}
                              />
                              <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
                                <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                      {/* 等比 */}
                      <button
                        onClick={() => setAllocMethod('geometric')}
                        className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                        style={{
                          background: allocMethod === 'geometric' ? '#FFF7ED' : '#F9FAFB',
                          border: `1px solid ${allocMethod === 'geometric' ? '#F97316' : '#E5E7EB'}`
                        }}
                      >
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0"
                          style={{ borderColor: allocMethod === 'geometric' ? '#F97316' : '#D1D5DB' }}
                        >
                          {allocMethod === 'geometric' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-800">等比分配</div>
                            {allocMethod === 'geometric' && (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setAllocGeomAsc(false)}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                  style={{ background: !allocGeomAsc ? '#F97316' : '#E5E7EB', color: !allocGeomAsc ? '#fff' : '#6B7280' }}
                                >越低越多</button>
                                <button
                                  onClick={() => setAllocGeomAsc(true)}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                  style={{ background: allocGeomAsc ? '#F97316' : '#E5E7EB', color: allocGeomAsc ? '#fff' : '#6B7280' }}
                                >越高越多</button>
                              </div>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.35)' }}>{allocGeomAsc && allocMethod === 'geometric' ? '越高价格分配越多' : '越低价格分配越多'}，按等比递增</div>
                          {allocMethod === 'geometric' && (
                            <div className="mt-2" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">公比（1.0=均匀，越大梯度越大）</span>
                                <span className="text-xs font-bold" style={{ color: '#F97316' }}>{(Math.round(parseFloat(allocGeomRatio) * 2) / 2).toFixed(1)}x</span>
                              </div>
                              <input
                                type="range"
                                min="1.0"
                                max="3.0"
                                step="0.5"
                                value={Math.round(parseFloat(allocGeomRatio) * 2) / 2}
                                onChange={e => setAllocGeomRatio(String(Math.round(parseFloat(e.target.value) * 2) / 2))}
                                onClick={e => e.stopPropagation()}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: '#F97316' }}
                              />
                              <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
                                <span>1.0</span><span>1.5</span><span>2.0</span><span>2.5</span><span>3.0</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                      {/* 正态分布 */}
                      <button
                        onClick={() => setAllocMethod('normal')}
                        className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                        style={{
                          background: allocMethod === 'normal' ? '#F5F3FF' : '#F9FAFB',
                          border: `1px solid ${allocMethod === 'normal' ? '#8B5CF6' : '#E5E7EB'}`
                        }}
                      >
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0"
                          style={{ borderColor: allocMethod === 'normal' ? '#8B5CF6' : '#D1D5DB' }}
                        >
                          {allocMethod === 'normal' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-800">正态分布</div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.35)' }}>中间价格区间买最多，两端价格区间买最少</div>
                          {allocMethod === 'normal' && (
                            <div className="mt-2" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">集中度（1=极度集中，10=趋向均匀）</span>
                                <span className="text-xs font-bold" style={{ color: '#8B5CF6' }}>{Math.round(parseFloat(allocNormalSigma) || 4)}</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={Math.round(parseFloat(allocNormalSigma) || 4)}
                                onChange={e => setAllocNormalSigma(String(Math.round(parseFloat(e.target.value))))}
                                onClick={e => e.stopPropagation()}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: '#8B5CF6' }}
                              />
                              <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
                                <span>极集中</span><span>3</span><span>5</span><span>7</span><span>9</span><span>均匀</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                      {/* 手动 */}
                      <button
                        onClick={() => {
                          setAllocMethod('manual');
                          // 初始化手动输入（等差预填）
                          if (allocLevels.length > 0) {
                            const each = (totalQty / allocLevels.length).toFixed(4);
                            const init: Record<number, string> = {};
                            allocLevels.forEach(p => { init[p] = each; });
                            setAllocManualQtys(init);
                          }
                        }}
                        className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                        style={{
                          background: allocMethod === 'manual' ? '#F0FDF4' : '#F9FAFB',
                          border: `1px solid ${allocMethod === 'manual' ? '#10B981' : '#E5E7EB'}`
                        }}
                      >
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0"
                          style={{ borderColor: allocMethod === 'manual' ? '#10B981' : '#D1D5DB' }}
                        >
                          {allocMethod === 'manual' && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">手动分配</div>
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.35)' }}>自定义每档数量，总量必须等于目标持仓</div>
                        </div>
                      </button>
                    </div>
                    {/* 等差/等比/正态分布实时预览条形图 */}
                    {(allocMethod === 'equal' || allocMethod === 'geometric' || allocMethod === 'normal') && allocLevels.length > 0 && (() => {
                      const previewQtys = calcAutoAlloc(allocMethod, minP, maxP);
                      const maxQty = Math.max(...allocLevels.map(p => previewQtys[p] || 0));
                      // 计算加权均价
                      let _totalCost = 0, _totalQty = 0;
                      allocLevels.forEach(p => { const q = previewQtys[p] || 0; if (q > 0) { _totalCost += q * p; _totalQty += q; } });
                      const previewAvgPrice = _totalQty > 0 ? _totalCost / _totalQty : 0;
                      const livePrice = currentPrice || 0;
                      const priceDiff = previewAvgPrice > 0 && livePrice > 0 ? previewAvgPrice - livePrice : 0;
                      const priceDiffPct = livePrice > 0 && priceDiff !== 0 ? (priceDiff / livePrice * 100) : 0;
                      const isNearTarget = Math.abs(priceDiffPct) < 2;
                      const isHigher = priceDiff > 0;
                      const accentColor = allocMethod === 'equal' ? '#3B82F6' : allocMethod === 'geometric' ? '#F97316' : '#8B5CF6';
                      return (
                        <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${accentColor}33` }}>
                          {/* 均价指示器 */}
                          <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: `1px solid ${accentColor}22` }}>
                            <div>
                              <div className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>预计均价</div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-base font-bold" style={{ color: isNearTarget ? '#4ade80' : isHigher ? '#fb923c' : '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>
                                  {previewAvgPrice > 0 ? `$${previewAvgPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}
                                </span>
                                {priceDiff !== 0 && previewAvgPrice > 0 && (
                                  <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: isHigher ? 'rgba(251,146,60,0.15)' : 'rgba(96,165,250,0.15)', color: isHigher ? '#fb923c' : '#60a5fa' }}>
                                    {isHigher ? '↑' : '↓'}{Math.abs(priceDiffPct).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>当前行情</div>
                              <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                                {livePrice > 0 ? `$${livePrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>实时分配预览</div>
                            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{allocLevels.length} 个档位 · {totalQty.toFixed(2)} ETH</div>
                          </div>
                          <div className="space-y-1">
                            {allocLevels.map(p => {
                              const qty = previewQtys[p] || 0;
                              const pct = maxQty > 0 ? qty / maxQty * 100 : 0;
                              const barColor = allocMethod === 'equal' ? '#3B82F6' : allocMethod === 'geometric' ? '#F97316' : '#8B5CF6';
                              return (
                                <div key={p} className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-gray-400 w-12 flex-shrink-0 text-right">${p}</span>
                                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: '#E5E7EB' }}>
                                    <div
                                      className="h-full rounded-full transition-all duration-200"
                                      style={{ width: `${pct}%`, background: barColor }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-semibold text-gray-600 w-14 flex-shrink-0 text-right tabular-nums">{qty} ETH</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {/* 手动模式输入表 */}
                    {allocMethod === 'manual' && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-gray-600">各档位分配量</div>
                          <div className="text-xs" style={{ color: Math.abs(manualTotal - totalQty) < 0.0001 ? '#10B981' : '#EF4444' }}>
                            已分配 {manualTotal.toFixed(4)} / {totalQty.toFixed(4)} ETH
                          </div>
                        </div>
                        <div className="space-y-2">
                          {allocLevels.map(p => (
                            <div key={p} className="flex items-center gap-3">
                              <span className="text-sm font-mono text-gray-500 w-16 flex-shrink-0">${p}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={allocManualQtys[p] || ''}
                                onChange={e => {
                                  const v = Math.round(parseFloat(e.target.value) || 0);
                                  setAllocManualQtys(prev => ({ ...prev, [p]: String(v) }));
                                }}
                                placeholder="0"
                                className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-800 outline-none"
                                style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
                                step="1"
                                min="0"
                              />
                              <span className="text-xs text-gray-400 flex-shrink-0">ETH</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setAllocStep('setup')}
                        className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)' }}
                      >返回</button>
                      <button
                        disabled={allocMethod === 'manual' && Math.abs(manualTotal - totalQty) > 0.001}
                        onClick={() => {
                          const result = calcAutoAlloc(allocMethod, minP, maxP);
                          setAllocPreview(result);
                          setAllocStep('preview');
                        }}
                        className="flex-2 flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
                      >
                        {allocMethod === 'manual' && Math.abs(manualTotal - totalQty) > 0.001
                          ? `差 ${(totalQty - manualTotal).toFixed(4)} ETH`
                          : '下一步：预览分配'}
                      </button>
                    </div>
                  </div>
                )}
                {/* 步骤 3：预览并确认 */}
                {allocStep === 'preview' && (() => {
                  // 实时重算，确保滑动条变化后预览立即更新
                  const liveResult = allocMethod === 'manual' ? allocPreview : calcAutoAlloc(allocMethod, minP, maxP);
                  const liveTotal = Object.values(liveResult).reduce((s, v) => s + v, 0);
                  const liveMax = allocLevels.length > 0 ? Math.max(...allocLevels.map(p => liveResult[p] || 0)) : 1;
                  return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-700">分配预览</div>
                      <div className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#D1FAE5', color: '#059669' }}>
                        共 {liveTotal} ETH
                      </div>
                    </div>
                    <div className="space-y-1.5 mb-4">
                      {allocLevels.map(p => {
                        const qty = liveResult[p] || 0;
                        const pct = liveMax > 0 ? qty / liveMax * 100 : 0;
                        const barColor = allocMethod === 'equal' ? 'linear-gradient(90deg, #1A56DB, #3B82F6)'
                          : allocMethod === 'geometric' ? 'linear-gradient(90deg, #EA580C, #F97316)'
                          : allocMethod === 'normal' ? 'linear-gradient(90deg, #7C3AED, #8B5CF6)'
                          : 'linear-gradient(90deg, #059669, #10B981)';
                        return (
                          <div key={p} className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 w-14 flex-shrink-0">${p}</span>
                            <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-200"
                                style={{ width: `${pct}%`, background: barColor }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-700 w-12 text-right flex-shrink-0">{qty} ETH</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAllocStep('method'); }}
                        className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)' }}
                      >重新分配</button>
                      <button
                        onClick={() => {
                          // 将实时计算结果写入 planned
                          // 先将所有档位的 planned 清零，防止旧方案超出新区间的档位数据残留
                          const newPlanned: Record<number, number> = {};
                          priceLevels.forEach(p => { newPlanned[p] = 0; });
                          // 将新方案的分配结果写入对应档位
                          allocLevels.forEach(p => {
                            newPlanned[p] = liveResult[p] || 0;
                          });
                          setPlanned(newPlanned);
                          // 保存到数据库
                          const levels = priceLevels.map(p => ({ price: p, plannedQty: newPlanned[p] || 0, actualQty: actual[p] || 0 }));
                          batchSaveMutation.mutate({ ledgerId, levels });
                          // 将分配方式和参数存入 localStorage，下次打开时恢复
                          try {
                            localStorage.setItem(`alloc_config_${ledgerId}`, JSON.stringify({
                              method: allocMethod,
                              arithDiff: allocArithDiff,
                              geomRatio: allocGeomRatio,
                              geomAsc: allocGeomAsc,
                              equalAsc: allocEqualAsc,
                              normalSigma: allocNormalSigma,
                              minPrice: allocMinPrice,
                              maxPrice: allocMaxPrice,
                            }));
                          } catch {}
                          setShowAutoAlloc(false);
                        }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
                      >
                        确认并应用
                      </button>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
      {/* 目标离场价说明弹窗 */}
      {showExitPriceInfo && (() => {
        const ethQty = parseFloat(targetEthQty) || 0;  // 计划持仓数量
        const actualEthQty = summary.totalQty;           // 实际持仓数量
        const profitCny = parseFloat(targetProfitCny) || 0;
        const profitUsdt = cnyRate > 0 ? profitCny / cnyRate : 0;
        // 目标均价（按计划档位加权）
        let _mPlanCost = 0, _mPlanQty = 0;
        priceLevels.forEach(p => { const q = planned[p] || 0; if (q > 0) { _mPlanCost += q * p; _mPlanQty += q; } });
        const targetAvgForModal = _mPlanQty > 0 ? _mPlanCost / _mPlanQty : 0;
        // 实际均价（按实际买入加权）
        let _mActCost = 0, _mActQty = 0;
        priceLevels.forEach(p => { const q = actual[p] || 0; if (q > 0) { _mActCost += q * p; _mActQty += q; } });
        const actualAvgForModal = _mActQty > 0 ? _mActCost / _mActQty : 0;
        // 止盈价 = 均价 + 目标利润(USDT) ÷ 持仓数量
        const exitPrice = targetAvgForModal > 0 && ethQty > 0 ? targetAvgForModal + profitUsdt / ethQty : null;
        const actualExitPrice = actualAvgForModal > 0 && actualEthQty > 0 ? actualAvgForModal + profitUsdt / actualEthQty : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowExitPriceInfo(false)}
          >
            <div
              className="bg-white w-full max-w-md rounded-t-2xl px-5 pt-5 pb-10 shadow-2xl overflow-y-auto"
              style={{ maxHeight: '85vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* 标题 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)' }}>
                    <HelpCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-gray-800">目标离场价 — 计算说明</span>
                </div>
                <button onClick={() => setShowExitPriceInfo(false)} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* 公式说明 */}
              <div className="rounded-xl p-4 mb-4" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <div className="text-xs font-semibold text-orange-600 mb-2 tracking-wide">计算公式</div>
                <div className="text-sm font-mono text-gray-700 leading-relaxed">
                  止盈价 = 持仓均价 + 目标利润(USDT) ÷ 持仓数量
                </div>
                <div className="text-xs text-gray-400 mt-1.5">
                  其中：持仓均价 = Σ(档位价×数量) ÷ 总数量；目标利润(USDT) = 目标利润(CNY) ÷ 汇率
                </div>
              </div>

              {/* 逻辑说明 */}
              <div className="text-sm text-gray-600 leading-relaxed mb-4">
                <p className="mb-2">基于你在各档位的<span className="font-semibold text-gray-800">持仓均价</span>和目标利润，系统计算出：</p>
                <p className="mb-2">ETH 价格需要从<span className="font-semibold text-gray-800">均价</span>上涨多少，才能让你的持仓产生足够的浮盈，恰好达到目标利润。</p>
                <p className="text-gray-400 text-xs">即：每涨 $1，持仓盈利 = 持仓数量 × $1。因此需涨幅 = 目标利润 ÷ 持仓数量，止盈价 = 均价 + 需涨幅。</p>
              </div>

              {/* 基础参数 */}
              {profitCny > 0 && (
                <div className="rounded-xl p-4 mb-3" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                  <div className="text-xs font-semibold text-blue-600 mb-2 tracking-wide">目标利润</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">¥{profitCny.toLocaleString('zh-CN')}</span>
                    <span className="font-semibold text-gray-800">≈ {profitUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT</span>
                  </div>
                </div>
              )}
              {/* 计划持仓 vs 实际持仓 对比 */}
              {profitCny > 0 && (ethQty > 0 || actualEthQty > 0) && (
                <div className="space-y-2">
                  {/* 计划持仓 */}
                  {ethQty > 0 && (
                    <div className="rounded-xl p-4" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        <span className="text-xs font-semibold text-orange-600 tracking-wide">计划持仓</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">持仓数量</span>
                        <span className="text-sm font-semibold text-gray-800">{ethQty.toFixed(0)} ETH</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">持仓均价</span>
                        <span className="text-sm font-semibold text-gray-800">{targetAvgForModal > 0 ? `$${targetAvgForModal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500">每币需涨</span>
                        <span className="text-sm font-semibold" style={{ color: '#f97316' }}>+${(profitUsdt / ethQty).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                      </div>
                      {/* 公式推导 */}
                      <div className="rounded-lg px-3 py-2 mb-2 text-xs font-mono text-orange-700" style={{ background: 'rgba(251,146,60,0.1)' }}>
                        {targetAvgForModal > 0 ? `$${targetAvgForModal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '均价'} + {profitUsdt > 0 ? `${profitUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '利润'} ÷ {ethQty.toFixed(0)} = <span className="font-bold">${exitPrice ? exitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #FED7AA' }}>
                        <span className="text-sm font-semibold text-gray-700">目标止盈价</span>
                        <span className="text-xl font-bold" style={{ color: '#f97316' }}>
                          ${exitPrice ? exitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* 实际持仓 */}
                  {actualEthQty > 0 ? (
                    <div className="rounded-xl p-4" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-xs font-semibold text-green-600 tracking-wide">实际持仓</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">持仓数量</span>
                        <span className="text-sm font-semibold text-gray-800">{actualEthQty.toFixed(0)} ETH</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">持仓均价</span>
                        <span className="text-sm font-semibold text-gray-800">{actualAvgForModal > 0 ? `$${actualAvgForModal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500">每币需涨</span>
                        <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>+${(profitUsdt / actualEthQty).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                      </div>
                      {/* 公式推导 */}
                      <div className="rounded-lg px-3 py-2 mb-2 text-xs font-mono text-green-700" style={{ background: 'rgba(34,197,94,0.1)' }}>
                        {actualAvgForModal > 0 ? `$${actualAvgForModal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '均价'} + {profitUsdt > 0 ? `${profitUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '利润'} ÷ {actualEthQty.toFixed(0)} = <span className="font-bold">${actualExitPrice ? actualExitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #BBF7D0' }}>
                        <span className="text-sm font-semibold text-gray-700">实际止盈价</span>
                        <span className="text-xl font-bold" style={{ color: '#16a34a' }}>
                          ${actualExitPrice ? actualExitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        <span className="text-xs font-semibold text-gray-400 tracking-wide">实际持仓</span>
                      </div>
                      <div className="text-sm text-gray-400">暂无实际买入记录</div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setShowExitPriceInfo(false)}
                className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
              >
                明白了
              </button>
            </div>
          </div>
        );
      })()}

      {/* 编辑弹窗 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center"
          style={{ paddingTop: '15vh', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div className="w-full max-w-md rounded-2xl px-5 pt-5 pb-8 mx-4" style={{ background: 'linear-gradient(160deg, #2a1f00 0%, #1e1500 50%, #2a1f00 100%)', border: '1px solid rgba(192,192,192,0.45)', boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(192,192,192,0.12), inset 0 1px 0 rgba(192,192,192,0.15)' }}>
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold" style={{ background: 'linear-gradient(90deg, #e8e8e8, #c0c0c0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {modal.price} 档位
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.5)' }}>
                  已买 {(actual[modal.price] || 0).toFixed(2)} ETH &nbsp;·&nbsp; 计划 {(planned[modal.price] || 0).toFixed(2)} ETH
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X className="w-4 h-4" style={{ color: 'rgba(192,192,192,0.5)' }} />
              </button>
            </div>



            {modal.mode === 'editActual' && (() => {
              const bqCur = parseFloat(modal.baseValue) || 0;
              const tqCur = parseFloat(modal.tacticalValue) || 0;
              const totalCur = bqCur + tqCur;
              const totalTarget = parseFloat(targetEthQty) || 0;
              const sliderMax = 500;
              const basePctPreview = totalCur > 0 ? Math.round((bqCur / totalCur) * Math.min(totalCur / sliderMax, 1) * 100) : 0;
              const tacticalPctPreview = totalCur > 0 ? Math.round((tqCur / totalCur) * Math.min(totalCur / sliderMax, 1) * 100) : 0;
              return (
                <div>
                  {/* 标题行 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold" style={{ color: '#c0c0c0' }}>修改已买数量</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>
                  </div>

                  {/* 计划仓位输入 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: '#4ade80' }}>计划仓位</span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)' }}>
                      <input
                        autoFocus
                        type="number"
                        value={modal.plannedValue}
                        onChange={e => setModal(prev => prev ? { ...prev, plannedValue: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                        placeholder="0"
                        className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                        style={{ color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}
                        step="1"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* 底仓输入 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: '#4aa8ff' }}>底仓</span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(26,127,212,0.1)', border: '1px solid rgba(74,168,255,0.4)' }}>
                      <input
                        type="number"
                        value={modal.baseValue}
                        onChange={e => setModal(prev => prev ? { ...prev, baseValue: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                        placeholder="0"
                        className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                        style={{ color: '#4aa8ff', fontVariantNumeric: 'tabular-nums' }}
                        step="1"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* 底仓备注区域 */}
                  {(() => {
                    const price = modal.price;
                    const notes = baseNotes[price] || [];
                    const noteCount = notes.length;
                    const [baseExpanded, setBaseExpanded] = [modal as any, (v: boolean) => setModal(prev => prev ? { ...prev, _baseExpanded: v } as any : null)];
                    const isExpanded = (modal as any)._baseExpanded ?? false;
                    return (
                      <div className="mb-3">
                        <div
                          className="flex items-center gap-1.5 cursor-pointer select-none"
                          style={{ color: '#4aa8ff', opacity: 0.7 }}
                          onClick={() => setModal(prev => prev ? { ...prev, _baseExpanded: !isExpanded } as any : null)}
                        >
                          <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                          <span className="text-xs">底仓备注</span>
                          {noteCount > 0 && <span className="text-xs rounded-full px-1.5" style={{ background: 'rgba(74,168,255,0.2)', color: '#4aa8ff' }}>{noteCount}</span>}
                        </div>
                        {isExpanded && (
                          <div className="mt-1.5 space-y-1.5">
                            {notes.map((n: any, i: number) => {
                              const editKey = `base-${price}-${i}`;
                              const isEditing = (modal as any)._editingNoteKey === editKey;
                              return (
                              <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(74,168,255,0.06)', border: `1px solid ${isEditing ? 'rgba(74,168,255,0.5)' : 'rgba(74,168,255,0.15)'}` }}>
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    defaultValue={n.text}
                                    className="flex-1 text-xs outline-none bg-transparent"
                                    style={{ color: 'rgba(255,255,255,0.9)' }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        const newText = (e.target as HTMLInputElement).value.trim();
                                        if (newText) {
                                          const newNotes = notes.map((x: any, j: number) => j === i ? { ...x, text: newText } : x);
                                          setBaseNotes(prev => ({ ...prev, [price]: newNotes }));
                                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes[price] || []) });
                                        }
                                        setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                      }
                                      if (e.key === 'Escape') setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                    }}
                                    onBlur={e => {
                                      const newText = e.target.value.trim();
                                      if (newText && newText !== n.text) {
                                        const newNotes = notes.map((x: any, j: number) => j === i ? { ...x, text: newText } : x);
                                        setBaseNotes(prev => ({ ...prev, [price]: newNotes }));
                                        updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes[price] || []) });
                                      }
                                      setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                    }}
                                  />
                                ) : (
                                  <span
                                    className="flex-1 text-xs break-all cursor-pointer"
                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                    onClick={() => setModal(prev => prev ? { ...prev, _editingNoteKey: editKey } as any : null)}
                                  >{n.text}</span>
                                )}
                                <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>{n.time?.slice(5,16)}</span>
                                <button
                                  className="shrink-0 text-xs px-1"
                                  style={{ color: 'rgba(255,80,80,0.6)' }}
                                  onClick={() => {
                                    const newNotes = notes.filter((_: any, j: number) => j !== i);
                                    setBaseNotes(prev => ({ ...prev, [price]: newNotes }));
                                    updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes[price] || []) });
                                  }}
                                >×</button>
                              </div>
                              );
                            })}
                            {/* 添加新备注输入框 */}
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="添加底仓备注..."
                                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none bg-transparent"
                                style={{ border: '1px solid rgba(74,168,255,0.25)', color: 'rgba(255,255,255,0.7)' }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                    const text = (e.target as HTMLInputElement).value.trim();
                                    const newNote = { text, time: new Date().toISOString().slice(0,16).replace('T',' ') };
                                    const newNotes = [...notes, newNote];
                                    setBaseNotes(prev => ({ ...prev, [price]: newNotes }));
                                    updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes[price] || []) });
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }}
                              />
                              <button
                                className="text-xs px-2 py-1.5 rounded-lg"
                                style={{ background: 'rgba(74,168,255,0.15)', color: '#4aa8ff', border: '1px solid rgba(74,168,255,0.3)' }}
                                onClick={e => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                  const text = input?.value?.trim();
                                  if (!text) return;
                                  const newNote = { text, time: new Date().toISOString().slice(0,16).replace('T',' ') };
                                  const newNotes = [...notes, newNote];
                                  setBaseNotes(prev => ({ ...prev, [price]: newNotes }));
                                  updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes[price] || []) });
                                  if (input) input.value = '';
                                }}
                              >+</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 机动仓输入 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: '#ff9040' }}>机动仓</span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(232,112,32,0.1)', border: '1px solid rgba(255,144,64,0.4)' }}>
                      <input
                        type="number"
                        value={modal.tacticalValue}
                        onChange={e => setModal(prev => prev ? { ...prev, tacticalValue: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                        placeholder="0"
                        className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                        style={{ color: '#ff9040', fontVariantNumeric: 'tabular-nums' }}
                        step="1"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* 机动仓备注区域 */}
                  {(() => {
                    const price = modal.price;
                    const notes = tacticalNotes[price] || [];
                    const noteCount = notes.length;
                    const isExpanded = (modal as any)._tacticalExpanded ?? false;
                    return (
                      <div className="mb-3">
                        <div
                          className="flex items-center gap-1.5 cursor-pointer select-none"
                          style={{ color: '#ff9040', opacity: 0.7 }}
                          onClick={() => setModal(prev => prev ? { ...prev, _tacticalExpanded: !isExpanded } as any : null)}
                        >
                          <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                          <span className="text-xs">机动仓备注</span>
                          {noteCount > 0 && <span className="text-xs rounded-full px-1.5" style={{ background: 'rgba(255,144,64,0.2)', color: '#ff9040' }}>{noteCount}</span>}
                        </div>
                        {isExpanded && (
                          <div className="mt-1.5 space-y-1.5">
                            {notes.map((n: any, i: number) => {
                              const editKey = `tactical-${price}-${i}`;
                              const isEditing = (modal as any)._editingNoteKey === editKey;
                              return (
                              <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,144,64,0.06)', border: `1px solid ${isEditing ? 'rgba(255,144,64,0.5)' : 'rgba(255,144,64,0.15)'}` }}>
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    defaultValue={n.text}
                                    className="flex-1 text-xs outline-none bg-transparent"
                                    style={{ color: 'rgba(255,255,255,0.9)' }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        const newText = (e.target as HTMLInputElement).value.trim();
                                        if (newText) {
                                          const newNotes = notes.map((x: any, j: number) => j === i ? { ...x, text: newText } : x);
                                          setTacticalNotes(prev => ({ ...prev, [price]: newNotes }));
                                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes[price] || []), tacticalNotes: JSON.stringify(newNotes) });
                                        }
                                        setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                      }
                                      if (e.key === 'Escape') setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                    }}
                                    onBlur={e => {
                                      const newText = e.target.value.trim();
                                      if (newText && newText !== n.text) {
                                        const newNotes = notes.map((x: any, j: number) => j === i ? { ...x, text: newText } : x);
                                        setTacticalNotes(prev => ({ ...prev, [price]: newNotes }));
                                        updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes[price] || []), tacticalNotes: JSON.stringify(newNotes) });
                                      }
                                      setModal(prev => prev ? { ...prev, _editingNoteKey: null } as any : null);
                                    }}
                                  />
                                ) : (
                                  <span
                                    className="flex-1 text-xs break-all cursor-pointer"
                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                    onClick={() => setModal(prev => prev ? { ...prev, _editingNoteKey: editKey } as any : null)}
                                  >{n.text}</span>
                                )}
                                <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>{n.time?.slice(5,16)}</span>
                                <button
                                  className="shrink-0 text-xs px-1"
                                  style={{ color: 'rgba(255,80,80,0.6)' }}
                                  onClick={() => {
                                    const newNotes = notes.filter((_: any, j: number) => j !== i);
                                    setTacticalNotes(prev => ({ ...prev, [price]: newNotes }));
                                    updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes[price] || []), tacticalNotes: JSON.stringify(newNotes) });
                                  }}
                                >×</button>
                              </div>
                              );
                            })}
                            {/* 添加新备注输入框 */}
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="添加机动仓备注..."
                                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none bg-transparent"
                                style={{ border: '1px solid rgba(255,144,64,0.25)', color: 'rgba(255,255,255,0.7)' }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                    const text = (e.target as HTMLInputElement).value.trim();
                                    const newNote = { text, time: new Date().toISOString().slice(0,16).replace('T',' ') };
                                    const newNotes = [...notes, newNote];
                                    setTacticalNotes(prev => ({ ...prev, [price]: newNotes }));
                                    updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes[price] || []), tacticalNotes: JSON.stringify(newNotes) });
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }}
                              />
                              <button
                                className="text-xs px-2 py-1.5 rounded-lg"
                                style={{ background: 'rgba(255,144,64,0.15)', color: '#ff9040', border: '1px solid rgba(255,144,64,0.3)' }}
                                onClick={e => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                  const text = input?.value?.trim();
                                  if (!text) return;
                                  const newNote = { text, time: new Date().toISOString().slice(0,16).replace('T',' ') };
                                  const newNotes = [...notes, newNote];
                                  setTacticalNotes(prev => ({ ...prev, [price]: newNotes }));
                                  updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes[price] || []), tacticalNotes: JSON.stringify(newNotes) });
                                  if (input) input.value = '';
                                }}
                              >+</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 总和预览进度条 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <span>总已买</span>
                      <span className="font-bold" style={{ color: totalCur > 0 ? '#f0d060' : 'rgba(255,255,255,0.3)' }}>
                        {totalCur > 0
                          ? (totalTarget > 0
                            ? `${totalCur.toFixed(0)} ETH · ${(totalCur / totalTarget * 100).toFixed(1)}% 占总计划仓`
                            : `${totalCur.toFixed(0)} ETH`)
                          : '--'}
                      </span>
                    </div>
                    {/* 叠加进度条预览 */}
                    <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {bqCur > 0 && (
                        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
                          style={{ width: `${basePctPreview}%`, background: 'linear-gradient(90deg, #003a7a 0%, #1a7fd4 80%, #4aa8ff 100%)', minWidth: '4px' }}
                        />
                      )}
                      {tqCur > 0 && (
                        <div className="absolute top-0 h-full rounded-full transition-all duration-150"
                          style={{ left: `${basePctPreview}%`, width: `${tacticalPctPreview}%`, background: 'linear-gradient(90deg, #7a3500 0%, #e87020 80%, #ff9040 100%)', minWidth: '4px' }}
                        />
                      )}
                    </div>
                    {/* 图例 */}
                    <div className="flex gap-3 mt-1.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1a7fd4' }} />
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>底仓 {bqCur > 0 ? bqCur.toFixed(0) : '0'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#e87020' }} />
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>机动仓 {tqCur > 0 ? tqCur.toFixed(0) : '0'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal(null)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      取消
                    </button>
                    <button
                      onClick={confirmModal}
                      className="flex-2 py-2.5 rounded-xl text-sm font-bold"
                      style={{ flex: 2, background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
                    >
                      确认保存
                    </button>
                  </div>

                  {/* 修改日志 */}
                  <div className="mt-3" style={{ borderTop: '1px solid rgba(192,192,192,0.15)', paddingTop: '12px' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium tracking-widest" style={{ color: 'rgba(192,192,192,0.6)' }}>修改日志</span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>自动记录 · 可编辑/删除</span>
                    </div>
                    <div className="space-y-1.5" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                      {getLogsQuery.isLoading && (
                        <div className="text-center py-3 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>加载中…</div>
                      )}
                      {!getLogsQuery.isLoading && (!getLogsQuery.data || getLogsQuery.data.length === 0) && (
                        <div className="text-center py-3 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>暂无修改记录</div>
                      )}
                      {getLogsQuery.data?.map(log => (
                        <div key={log.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(192,192,192,0.1)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: log.changeType === 'actual' ? 'rgba(192,192,192,0.2)' : 'rgba(192,192,192,0.1)', color: log.changeType === 'actual' ? '#f0d060' : 'rgba(192,192,192,0.7)', fontSize: '10px' }}>
                                  {log.changeType === 'actual' ? '已买' : '计划'}
                                </span>
                                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                  {Number(log.oldValue).toFixed(2)} → <span style={{ color: '#f0d060', fontWeight: 600 }}>{Number(log.newValue).toFixed(2)}</span> ETH
                                </span>
                              </div>
                              {editingLogId === log.id ? (
                                <div className="flex items-center gap-1 mt-1.5">
                                  <input
                                    value={editingLogNote}
                                    onChange={e => setEditingLogNote(e.target.value)}
                                    placeholder="添加备注…"
                                    className="flex-1 text-xs px-2 py-1 rounded"
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(192,192,192,0.3)', color: 'rgba(255,255,255,0.85)', outline: 'none' }}
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        updateLogNoteMutation.mutate({ id: log.id, ledgerId, note: editingLogNote });
                                        setEditingLogId(null);
                                      }
                                      if (e.key === 'Escape') setEditingLogId(null);
                                    }}
                                  />
                                  <button onClick={() => { updateLogNoteMutation.mutate({ id: log.id, ledgerId, note: editingLogNote }); setEditingLogId(null); }} style={{ color: '#f0d060' }}>
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingLogId(null)} style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                log.note ? (
                                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{log.note}</div>
                                ) : null
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>
                                {new Date(log.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { setEditingLogId(log.id); setEditingLogNote(log.note || ''); }}
                                  className="p-0.5 rounded"
                                  style={{ color: 'rgba(192,192,192,0.5)' }}
                                  title="编辑备注"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => deleteLogMutation.mutate({ id: log.id, ledgerId })}
                                  className="p-0.5 rounded"
                                  style={{ color: 'rgba(255,80,80,0.5)' }}
                                  title="删除"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {/* ===== 盈利路径分析：联动滑块 ===== */}
      {(() => {
        // 基础数据
        const profitUsdt = (parseFloat(targetProfitCny) || 0) / (cnyRate || 7.28);
        const curPrice = currentPrice || 0;
        // 实际均价
        let _actCost2 = 0, _actQty2 = 0;
        priceLevels.forEach(p => { const q = actual[p] || 0; if (q > 0) { _actCost2 += q * p; _actQty2 += q; } });
        const avgPrice = _actQty2 > 0 ? _actCost2 / _actQty2 : (curPrice || 2000);
        const basePrice = avgPrice > 0 ? avgPrice : (curPrice || 2000);

        // 滑块范围
        const maxQty = Math.max(200, Math.ceil((parseFloat(targetEthQty) || 50) * 2));
        const maxRisePct = 500;

        // 联动计算
        // qty → 所需涨幅%: riseNeeded = (avgPrice + profit/qty - curPrice) / curPrice * 100
        const qtyToRise = (qty: number): number => {
          if (qty <= 0 || curPrice <= 0) return 0;
          const exitPrice = basePrice + profitUsdt / qty;
          return Math.max(0, ((exitPrice - curPrice) / curPrice) * 100);
        };
        // rise% → 所需数量: qty = profit / (curPrice*(1+rise/100) - avgPrice)
        const riseToQty = (rise: number): number => {
          const exitPrice = curPrice * (1 + rise / 100);
          const perCoin = exitPrice - basePrice;
          if (perCoin <= 0 || profitUsdt <= 0) return 0;
          return Math.min(maxQty, profitUsdt / perCoin);
        };

        return (
          <ProfitPathPanel
            profitUsdt={profitUsdt}
            targetProfitCny={parseFloat(targetProfitCny) || 0}
            curPrice={curPrice}
            avgPrice={basePrice}
            maxQty={maxQty}
            maxRisePct={maxRisePct}
            qtyToRise={qtyToRise}
            riseToQty={riseToQty}
            actualQty={_actQty2}
            cnyRate={cnyRate}
          />
        );
      })()}
    </div>
  );
}


// ===== 盈利路径分析组件 =====
interface ProfitPathPanelProps {
  profitUsdt: number;
  targetProfitCny: number;
  curPrice: number;
  avgPrice: number;
  maxQty: number;
  maxRisePct: number;
  qtyToRise: (qty: number) => number;
  riseToQty: (rise: number) => number;
  actualQty: number;
  cnyRate: number;
}

// 对数刻度：1万～1亿，映射到 0～1
const CNY_MIN = 10000;    // 1万
const CNY_MAX = 100000000; // 1亿
// 对数刻度：1万～1亿，映射到 0～1（每个数量级占相同操作空间）
const logToSlider = (val: number) => (Math.log(val) - Math.log(CNY_MIN)) / (Math.log(CNY_MAX) - Math.log(CNY_MIN));
const sliderToLog = (s: number) => Math.round(Math.exp(Math.log(CNY_MIN) + s * (Math.log(CNY_MAX) - Math.log(CNY_MIN))));

// 对数刻度：1～10000 ETH，映射到 0～1
const ETH_MIN = 1;
const ETH_MAX = 10000;
const ethLogToSlider = (val: number) => (Math.log(Math.max(val, ETH_MIN)) - Math.log(ETH_MIN)) / (Math.log(ETH_MAX) - Math.log(ETH_MIN));
const ethSliderToLog = (s: number) => parseFloat(Math.exp(Math.log(ETH_MIN) + s * (Math.log(ETH_MAX) - Math.log(ETH_MIN))).toFixed(2));

function ProfitPathPanel({
  profitUsdt, targetProfitCny, curPrice, avgPrice,
  maxQty, maxRisePct, qtyToRise, riseToQty, actualQty, cnyRate
}: ProfitPathPanelProps) {
  // 用 sessionStorage 持久化滑块位置（页面内导航保持，刷新页面恢复初始值）
  const SESSION_KEY_QTY = 'profit_path_qty';
  const SESSION_KEY_RISE = 'profit_path_rise';
  const SESSION_KEY_TARGET = 'profit_path_target';
  const SESSION_KEY_INIT = 'profit_path_initialized';

  // 目标止盈金额（人民币）：每次刷新/重进都从 targetProfitCny 读取，不用 sessionStorage
  // 只有在页面内手动拖动时才会变化，不持久化
  const [sliderTarget, setSliderTarget] = React.useState<number>(
    Math.max(CNY_MIN, Math.min(CNY_MAX, targetProfitCny > 0 ? targetProfitCny : 1000000))
  );

  // 当 targetProfitCny 从异步加载变为真实值时，同步更新 sliderTarget
  // 只在 sliderTarget 还是默认值（未被用户手动拖动过）时才同步
  const hasUserDraggedTarget = React.useRef(false);
  React.useEffect(() => {
    if (targetProfitCny > 0 && !hasUserDraggedTarget.current) {
      setSliderTarget(Math.max(CNY_MIN, Math.min(CNY_MAX, targetProfitCny)));
    }
  }, [targetProfitCny]);
  const [sliderQty, setSliderQty] = React.useState<number>(() => {
    const saved = sessionStorage.getItem(SESSION_KEY_QTY);
    return saved !== null ? parseFloat(saved) : Math.max(ETH_MIN, Math.min(ETH_MAX, actualQty || 10));
  });
  const [sliderRise, setSliderRise] = React.useState<number>(() => {
    const saved = sessionStorage.getItem(SESSION_KEY_RISE);
    return saved !== null ? parseFloat(saved) : 0;
  });

  // 解锁状态：true = 解锁（变量，可手动拖动）；false = 锁定（定量，不可拖动）
  // 新逻辑：只有解锁的滑块才能被手动拖动；锁定的滑块只能被联动更新
  const [targetUnlocked, setTargetUnlocked] = React.useState(false); // 目标止盈金额，默认锁定
  const [qtyUnlocked, setQtyUnlocked] = React.useState(false);       // 持仓数量，默认锁定
  const [riseUnlocked, setRiseUnlocked] = React.useState(false);     // 目标涨幅，默认锁定

  // 对数刻度说明弹窗
  const [showLogInfo, setShowLogInfo] = React.useState(false);

  // 内联输入框编辑状态
  const [editingTarget, setEditingTarget] = React.useState(false);
  const [editingQty, setEditingQty] = React.useState(false);
  const [inputTargetVal, setInputTargetVal] = React.useState('');
  const [inputQtyVal, setInputQtyVal] = React.useState('');
  const targetInputRef = React.useRef<HTMLInputElement>(null);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);

  // 滑块拖动 ref
  const targetBarRef = React.useRef<HTMLDivElement>(null);
  const qtyBarRef = React.useRef<HTMLDivElement>(null);
  const riseBarRef = React.useRef<HTMLDivElement>(null);
  const isDraggingTarget = React.useRef(false);
  const isDraggingQty = React.useRef(false);
  const isDraggingRise = React.useRef(false);

  const toggleTargetLock = () => setTargetUnlocked(v => !v);
  const toggleQtyLock = () => setQtyUnlocked(v => !v);
  const toggleRiseLock = () => setRiseUnlocked(v => !v);

  // 从 clientX 计算目标止盈金额（对数刻度）
  const calcTargetFromX = React.useCallback((clientX: number): number => {
    if (!targetBarRef.current) return sliderTarget;
    const rect = targetBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return sliderToLog(ratio);
  }, [sliderTarget]);

  // 从 clientX 计算持仓数量（对数刻度 1～10000 ETH）
  const calcQtyFromX = React.useCallback((clientX: number): number => {
    if (!qtyBarRef.current) return sliderQty;
    const rect = qtyBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(ETH_MIN, ethSliderToLog(ratio));
  }, [sliderQty]);

  // 从 clientX 计算目标涨幅
  const calcRiseFromX = React.useCallback((clientX: number): number => {
    if (!riseBarRef.current) return sliderRise;
    const rect = riseBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = ratio * maxRisePct;
    return Math.max(0, Math.round(raw * 2) / 2);
  }, [maxRisePct, sliderRise]);

  // 根据目标金额和持仓量计算所需涨幅
  const calcRiseFromTargetAndQty = React.useCallback((targetCny: number, qty: number): number => {
    if (!cnyRate || cnyRate <= 0 || qty <= 0 || avgPrice <= 0) return 0;
    const targetUsdt = targetCny / cnyRate;
    const exitPriceCalc = avgPrice + targetUsdt / qty;
    if (curPrice <= 0) return 0;
    return Math.max(0, (exitPriceCalc - curPrice) / curPrice * 100);
  }, [cnyRate, avgPrice, curPrice]);

  // 全局 mousemove/mouseup/touchmove/touchend 监听
  // 新逻辑：只有解锁（变量）的滑块才能被手动拖动
  React.useEffect(() => {
    const handleTargetDrag = (clientX: number) => {
      if (!isDraggingTarget.current) return;
      const target = calcTargetFromX(clientX);
      setSliderTarget(target);
      sessionStorage.setItem(SESSION_KEY_TARGET, String(target));
      // 目标金额变化时，联动锁定的滑块（锁定 = 定量，被动更新）
      if (!qtyUnlocked && !riseUnlocked) {
        // 两个都锁定：保持持仓量不变，联动涨幅
        const rise = Math.min(calcRiseFromTargetAndQty(target, sliderQty), maxRisePct);
        setSliderRise(rise);
        sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
      } else if (!qtyUnlocked && riseUnlocked) {
        // 持仓量锁定，涨幅解锁：保持持仓量不变，联动涨幅
        const rise = Math.min(calcRiseFromTargetAndQty(target, sliderQty), maxRisePct);
        setSliderRise(rise);
        sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
      } else if (qtyUnlocked && !riseUnlocked) {
        // 持仓量解锁，涨幅锁定：保持涨幅不变，联动持仓量
        const targetUsdt = target / (cnyRate || 7.2);
        if (sliderRise > 0 && curPrice > 0 && avgPrice > 0) {
          const exitP = curPrice * (1 + sliderRise / 100);
          const qty = exitP > avgPrice ? Math.min(targetUsdt / (exitP - avgPrice), maxQty) : maxQty;
          setSliderQty(Math.max(0.1, Math.round(qty * 10) / 10));
          sessionStorage.setItem(SESSION_KEY_QTY, String(qty));
        }
      }
    };
    const handleQtyDrag = (clientX: number) => {
      if (!isDraggingQty.current) return;
      const qty = calcQtyFromX(clientX);
      setSliderQty(qty);
      sessionStorage.setItem(SESSION_KEY_QTY, String(qty));
      // 持仓量变化，联动锁定的其他滑块
      if (!riseUnlocked) {
        // 涨幅锁定：联动涨幅
        const rise = Math.min(calcRiseFromTargetAndQty(sliderTarget, qty), maxRisePct);
        setSliderRise(rise);
        sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
      }
      if (!targetUnlocked) {
        // 目标金额锁定：不变（它是定量）
      }
    };
    const handleRiseDrag = (clientX: number) => {
      if (!isDraggingRise.current) return;
      const rise = calcRiseFromX(clientX);
      setSliderRise(rise);
      sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
      // 涨幅变化，联动锁定的其他滑块
      if (!qtyUnlocked) {
        // 持仓量锁定：联动持仓量
                  const qty = Math.max(ETH_MIN, Math.min(ETH_MAX, riseToQty(rise)));
        setSliderQty(Math.max(0.1, qty));
        sessionStorage.setItem(SESSION_KEY_QTY, String(qty));
      }
      if (!targetUnlocked) {
        // 目标金额锁定：不变
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      handleTargetDrag(e.clientX);
      handleQtyDrag(e.clientX);
      handleRiseDrag(e.clientX);
    };
    const onMouseUp = () => {
      isDraggingTarget.current = false;
      isDraggingQty.current = false;
      isDraggingRise.current = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      handleTargetDrag(x);
      handleQtyDrag(x);
      handleRiseDrag(x);
    };
    const onTouchEnd = () => {
      isDraggingTarget.current = false;
      isDraggingQty.current = false;
      isDraggingRise.current = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [calcTargetFromX, calcQtyFromX, calcRiseFromX, calcRiseFromTargetAndQty,
      targetUnlocked, qtyUnlocked, riseUnlocked,
      qtyToRise, riseToQty, maxRisePct, maxQty,
      sliderTarget, sliderQty, sliderRise, cnyRate, curPrice, avgPrice]);

  // 初始化：只在本次会话首次加载时设置持仓量和涨幅的初始值
  // 目标止盈金额不用 sessionStorage，直接从 props 初始化
  React.useEffect(() => {
    const initialized = sessionStorage.getItem(SESSION_KEY_INIT);
    if (!initialized && actualQty && curPrice && avgPrice) {
      const initQty = Math.max(ETH_MIN, Math.min(ETH_MAX, actualQty));
      const rise = calcRiseFromTargetAndQty(sliderTarget, initQty);
      setSliderQty(initQty);
      setSliderRise(Math.min(rise, maxRisePct));
      sessionStorage.setItem(SESSION_KEY_QTY, String(initQty));
      sessionStorage.setItem(SESSION_KEY_RISE, String(Math.min(rise, maxRisePct)));
      sessionStorage.setItem(SESSION_KEY_INIT, '1');
    }
  }, [actualQty, curPrice, avgPrice]);

  // 目标离场价（基于 sliderTarget 和 sliderQty 计算）
  const effectiveProfitUsdt = cnyRate > 0 ? sliderTarget / cnyRate : profitUsdt;
  const exitPrice = sliderQty > 0 && avgPrice > 0 ? avgPrice + effectiveProfitUsdt / sliderQty : 0;
  const riseDisplay = exitPrice > 0 && curPrice > 0 ? ((exitPrice - curPrice) / curPrice * 100) : sliderRise;

  // 难易度评分（0-100）
  const calcDifficulty = (): { score: number; label: string; color: string; desc: string } => {
    if (profitUsdt <= 0 || curPrice <= 0) return { score: 0, label: '无数据', color: '#666', desc: '请先设置目标利润' };
    // 涨幅难度（0-60分）：涨幅越大越难
    const riseFactor = Math.min(riseDisplay / maxRisePct, 1); // 0~1
    const riseScore = riseFactor * 60;
    // 持仓量难度（0-40分）：持仓量越少越难（需要更高涨幅）
    const qtyFactor = 1 - Math.min(sliderQty / maxQty, 1); // 少币=难
    const qtyScore = qtyFactor * 40;
    const score = Math.round(riseScore + qtyScore);

    if (score < 20) return { score, label: '较易', color: '#22c55e', desc: `持仓充足，仅需涨 ${riseDisplay.toFixed(1)}%` };
    if (score < 40) return { score, label: '适中', color: '#84cc16', desc: `需涨 ${riseDisplay.toFixed(1)}%，可行` };
    if (score < 60) return { score, label: '偏难', color: '#eab308', desc: `需涨 ${riseDisplay.toFixed(1)}%，有挑战` };
    if (score < 80) return { score, label: '较难', color: '#f97316', desc: `需涨 ${riseDisplay.toFixed(1)}%，高风险` };
    return { score, label: '极难', color: '#ef4444', desc: `需涨 ${riseDisplay.toFixed(1)}%，极高风险` };
  };
  const difficulty = calcDifficulty();

  // 生成曲线图数据点（持仓量 vs 所需涨幅）
  const chartPoints = React.useMemo(() => {
    const pts: Array<{ qty: number; rise: number }> = [];
    const steps = 60;
                for (let i = 1; i <= steps; i++) {
      const qty = ethSliderToLog(i / steps);
      const rise = qtyToRise(qty);
      pts.push({ qty, rise: Math.min(rise, maxRisePct) });
    }
    return pts;
  }, [maxQty, maxRisePct, profitUsdt, avgPrice, curPrice]);

  // SVG 尺寸
  const svgW = 320, svgH = 140;
  const padL = 38, padR = 12, padT = 12, padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // 坐标转换
  const toX = (qty: number) => padL + ethLogToSlider(qty) * plotW;
  const toY = (rise: number) => padT + plotH - (rise / maxRisePct) * plotH;

  // 曲线路径
  const pathD = chartPoints.length > 0
    ? chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.qty).toFixed(1)} ${toY(pt.rise).toFixed(1)}`).join(' ')
    : '';

  // 热力区域背景（按涨幅分4段）
  const heatZones = [
    { minRise: 0,   maxRise: 50,  color: 'rgba(34,197,94,0.12)',  label: '易' },
    { minRise: 50,  maxRise: 150, color: 'rgba(234,179,8,0.12)',  label: '中' },
    { minRise: 150, maxRise: 300, color: 'rgba(249,115,22,0.12)', label: '难' },
    { minRise: 300, maxRise: 500, color: 'rgba(239,68,68,0.12)',  label: '极' },
  ];

  // 当前选中点坐标
  const selX = toX(Math.max(ETH_MIN, sliderQty));
  const selY = toY(Math.min(riseDisplay, maxRisePct));

  const hasData = profitUsdt > 0 && curPrice > 0;

  return (
    <div style={{ margin: '16px 12px 24px', borderRadius: 16, background: 'linear-gradient(160deg, #0d0f1a 0%, #0a0d18 100%)', border: '1px solid rgba(100,120,200,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '16px 14px 18px' }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #60a5fa, #3b82f6)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1 }}>盈利路径分析</span>
        {targetProfitCny > 0 && (
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', marginLeft: 4 }}>
            目标 ¥{targetProfitCny.toLocaleString('zh-CN')} ≈ ${profitUsdt.toFixed(0)}
          </span>
        )}
      </div>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(148,163,184,0.5)', fontSize: 12 }}>
          请先在上方设置「目标止盈利润」和当前价格
        </div>
      ) : (
        <>
          {/* 热力曲线图（移到最上方） */}
          <div style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(100,120,200,0.12)' }}>
            <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block' }}>
              {/* 热力背景区域 */}
              {heatZones.map((zone, zi) => {
                const y1 = toY(zone.maxRise);
                const y2 = toY(zone.minRise);
                return (
                  <g key={zi}>
                    <rect x={padL} y={y1} width={plotW} height={y2 - y1} fill={zone.color} />
                    <text x={svgW - padR - 2} y={(y1 + y2) / 2 + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.25)">{zone.label}</text>
                  </g>
                );
              })}

              {/* 网格线 */}
              {[0, 100, 200, 300, 400, 500].map(rise => (
                <line key={rise} x1={padL} y1={toY(rise)} x2={svgW - padR} y2={toY(rise)}
                  stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,3" />
              ))}
              {[ETH_MIN, 10, 100, 1000, ETH_MAX].map(v => (
                <line key={v} x1={toX(v)} y1={padT} x2={toX(v)} y2={padT + plotH}
                  stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,3" />
              ))}

              {/* 曲线 */}
              {(() => {
                const pts: string[] = [];
                const steps = 80;
                for (let i = 1; i <= steps; i++) {
                  const qty = ethSliderToLog(i / steps);
                  if (qty <= 0) continue;
                  const rise = qtyToRise(qty);
                  if (rise < 0 || rise > maxRisePct) continue;
                  pts.push(`${toX(qty)},${toY(rise)}`);
                }
                if (pts.length < 2) return null;
                return (
                  <polyline
                    points={pts.join(' ')}
                    fill="none"
                    stroke="url(#curveGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}

              {/* 渐变定义 */}
              <defs>
                <linearGradient id="curveGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="40%" stopColor="#f59e0b" />
                  <stop offset="70%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {/* 当前选中点 */}
              {sliderQty > 0 && riseDisplay >= 0 && riseDisplay <= maxRisePct && (
                <>
                  <line x1={selX} y1={padT} x2={selX} y2={padT + plotH} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeDasharray="2,2" />
                  <line x1={padL} y1={selY} x2={svgW - padR} y2={selY} stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" strokeDasharray="2,2" />
                  <circle cx={selX} cy={selY} r="5" fill="#fff" stroke={difficulty.color} strokeWidth="2" />
                  <text x={selX + 7} y={selY - 4} fontSize="8" fill="rgba(255,255,255,0.8)">{sliderQty.toFixed(1)}ETH → +{riseDisplay.toFixed(1)}%</text>
                </>
              )}

              {/* 坐标轴标签 */}
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
              <line x1={padL} y1={padT + plotH} x2={svgW - padR} y2={padT + plotH} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
              {[0, 100, 200, 300, 400, 500].map(rise => (
                <text key={rise} x={padL - 3} y={toY(rise) + 3} textAnchor="end" fontSize="7" fill="rgba(148,163,184,0.5)">{rise}%</text>
              ))}
              {[ETH_MIN, 10, 100, 1000, ETH_MAX].map(v => (
                <text key={v} x={toX(v)} y={padT + plotH + 10} textAnchor="middle" fontSize="7" fill="rgba(148,163,184,0.4)">{v >= 1000 ? `${v/1000}k` : v}</text>
              ))}
              <text x={padL + plotW / 2} y={svgH - 1} textAnchor="middle" fontSize="8" fill="rgba(148,163,184,0.5)">持仓量 (ETH)</text>
            </svg>
          </div>

          {/* 滑块0：目标止盈金额（对数刻度，1万～1亿） */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  onClick={toggleTargetLock}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: targetUnlocked
                      ? 'linear-gradient(135deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)'
                      : 'linear-gradient(135deg, #2a3050 0%, #3a4060 100%)',
                    border: targetUnlocked ? '1.5px solid rgba(255,245,192,0.9)' : '1.5px solid rgba(100,120,200,0.4)',
                    boxShadow: targetUnlocked
                      ? '0 0 12px rgba(255,235,100,1), 0 2px 6px rgba(0,0,0,0.6)'
                      : '0 1px 4px rgba(0,0,0,0.5)',
                    userSelect: 'none',
                  }}
                  title="点击切换定量/变量"
                >
                  <svg width="11" height="13" viewBox="0 0 10 12" fill="none">
                    <rect x="1.5" y="5" width="7" height="6" rx="1.5" fill={targetUnlocked ? '#888' : 'rgba(148,163,184,0.7)'} />
                    {targetUnlocked
                      ? <path d="M3 5V3.5C3 2.12 3.9 1 5 1" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                      : <path d="M3 5V3.5C3 2.12 3.9 1 5 1C6.1 1 7 2.12 7 3.5V5" stroke="rgba(148,163,184,0.7)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                    }
                    <circle cx="5" cy="8" r="1" fill={targetUnlocked ? '#888' : 'rgba(255,255,255,0.5)'} />
                  </svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: targetUnlocked ? 'rgba(255,235,100,0.9)' : 'rgba(148,163,184,0.8)' }}>目标止盈</span>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                  background: targetUnlocked ? 'rgba(255,235,100,0.15)' : 'rgba(100,120,200,0.15)',
                  color: targetUnlocked ? 'rgba(255,235,100,0.8)' : 'rgba(100,120,200,0.6)',
                  border: `1px solid ${targetUnlocked ? 'rgba(255,235,100,0.3)' : 'rgba(100,120,200,0.2)'}`,
                }}>{targetUnlocked ? '变量' : '定量'}</span>
                <span
                  onClick={() => setShowLogInfo(true)}
                  style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(167,139,250,0.12)',
                    color: 'rgba(167,139,250,0.7)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    userSelect: 'none',
                  }}
                >对数刻度</span>
              </div>
              {editingTarget ? (
                <input
                  ref={targetInputRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  value={inputTargetVal}
                  onChange={(e) => setInputTargetVal(e.target.value)}
                  onBlur={() => {
                    const wan = parseFloat(inputTargetVal);
                    if (!isNaN(wan) && wan >= 1) {
                      const clamped = Math.max(1, Math.min(10000, wan));
                      const val = Math.round(clamped * 10000);
                      setSliderTarget(val);
                      hasUserDraggedTarget.current = true;
                    }
                    setEditingTarget(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingTarget(false);
                  }}
                  style={{
                    width: 80, fontSize: 13, fontWeight: 700, color: '#a78bfa',
                    background: 'transparent',
                    border: '1px solid rgba(167,139,250,0.5)',
                    borderRadius: 6, padding: '1px 4px',
                    textAlign: 'right', outline: 'none',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  placeholder="1-10000万"
                />
              ) : (
                <span
                  onClick={() => {
                    const wan = sliderTarget >= 99900000 ? 10000 : Math.round(sliderTarget / 10000);
                    setInputTargetVal(String(wan));
                    setEditingTarget(true);
                    setTimeout(() => { targetInputRef.current?.select(); }, 30);
                  }}
                  style={{
                    fontSize: 13, fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums',
                    border: '1px solid rgba(167,139,250,0.35)',
                    borderRadius: 6, padding: '1px 6px', cursor: 'text',
                    background: 'rgba(167,139,250,0.06)',
                  }}
                >
                  ¥{sliderTarget >= 99900000 ? '1亿' : `${Math.round(sliderTarget / 10000)}万`}
                </span>
              )}
            </div>
            {/* 进度条区域 */}
            <div
              ref={targetBarRef}
              style={{ position: 'relative', height: 32, cursor: targetUnlocked ? 'ew-resize' : 'not-allowed', touchAction: 'none', userSelect: 'none', opacity: targetUnlocked ? 1 : 0.65 }}
              onMouseDown={(e) => {
                if (!targetUnlocked) return;
                isDraggingTarget.current = true;
                hasUserDraggedTarget.current = true;
                const target = calcTargetFromX(e.clientX);
                setSliderTarget(target);
                sessionStorage.setItem(SESSION_KEY_TARGET, String(target));
              }}
              onTouchStart={(e) => {
                if (!targetUnlocked) return;
                isDraggingTarget.current = true;
                hasUserDraggedTarget.current = true;
                const target = calcTargetFromX(e.touches[0].clientX);
                setSliderTarget(target);
                sessionStorage.setItem(SESSION_KEY_TARGET, String(target));
              }}
            >
              <div className="absolute rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 24 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${logToSlider(sliderTarget) * 100}%`,
                  background: targetUnlocked
                    ? 'linear-gradient(90deg, #4c1d95 0%, #7c3aed 60%, #a78bfa 100%)'
                    : 'linear-gradient(90deg, #4c1d95 0%, #7c3aed 60%, #a78bfa 100%)',
                  borderRadius: '4px 0 0 4px',
                }} />
                <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>1万</span>
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>1亿</span>
              </div>
              <div style={{
                position: 'absolute',
                left: `calc(${logToSlider(sliderTarget) * 100}% - 16px)`,
                top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%',
                zIndex: 10, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #2d1b69 0%, #5b21b6 50%, #2d1b69 100%)',
                boxShadow: targetUnlocked
                  ? '0 0 14px rgba(167,139,250,0.9), 0 2px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.3)'
                  : '0 0 8px rgba(167,139,250,0.5), 0 2px 6px rgba(0,0,0,0.8)',
                border: targetUnlocked ? '1.5px solid rgba(167,139,250,0.9)' : '1.5px solid rgba(167,139,250,0.5)',
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <text x="7" y="10" textAnchor="middle" fontSize="9" fill="#a78bfa" fontWeight="700">¥</text>
                </svg>
              </div>
            </div>
          </div>

          {/* 滑块A：持仓数量 —— 战略/战术进度条风格 */}
          <div style={{ marginBottom: 14 }}>
            {/* 标题行 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* 锁定/解锁按鈕 */}
                <div
                  onClick={toggleQtyLock}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: qtyUnlocked
                      ? 'linear-gradient(135deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)'
                      : 'linear-gradient(135deg, #2a3050 0%, #3a4060 100%)',
                    border: qtyUnlocked ? '1.5px solid rgba(255,245,192,0.9)' : '1.5px solid rgba(100,120,200,0.4)',
                    boxShadow: qtyUnlocked
                      ? '0 0 12px rgba(255,235,100,1), 0 2px 6px rgba(0,0,0,0.6)'
                      : '0 1px 4px rgba(0,0,0,0.5)',
                    userSelect: 'none',
                  }}
                  title="点击切换定量/变量"
                >
                  <svg width="11" height="13" viewBox="0 0 10 12" fill="none">
                    <rect x="1.5" y="5" width="7" height="6" rx="1.5" fill={qtyUnlocked ? '#888' : 'rgba(148,163,184,0.7)'} />
                    {qtyUnlocked
                      ? <path d="M3 5V3.5C3 2.12 3.9 1 5 1" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                      : <path d="M3 5V3.5C3 2.12 3.9 1 5 1C6.1 1 7 2.12 7 3.5V5" stroke="rgba(148,163,184,0.7)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                    }
                    <circle cx="5" cy="8" r="1" fill={qtyUnlocked ? '#888' : 'rgba(255,255,255,0.5)'} />
                  </svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600,
                  color: qtyUnlocked ? 'rgba(255,235,100,0.9)' : 'rgba(148,163,184,0.8)',

                }}>持仓数量</span>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                  background: qtyUnlocked ? 'rgba(255,235,100,0.15)' : 'rgba(100,120,200,0.15)',
                  color: qtyUnlocked ? 'rgba(255,235,100,0.8)' : 'rgba(100,120,200,0.6)',
                  border: `1px solid ${qtyUnlocked ? 'rgba(255,235,100,0.3)' : 'rgba(100,120,200,0.2)'}`,
                }}>{qtyUnlocked ? '变量' : '定量'}</span>
                <span
                  onClick={() => setShowLogInfo(true)}
                  style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(96,165,250,0.12)',
                    color: 'rgba(96,165,250,0.7)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    userSelect: 'none',
                  }}
                >对数刻度</span>
              </div>
              {editingQty ? (
                <input
                  ref={qtyInputRef}
                  type="number"
                  inputMode="numeric"
                  min={ETH_MIN}
                  max={ETH_MAX}
                  value={inputQtyVal}
                  onChange={(e) => setInputQtyVal(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(inputQtyVal);
                    if (!isNaN(v) && v >= ETH_MIN) {
                      const val = Math.max(ETH_MIN, Math.min(ETH_MAX, parseFloat(v.toFixed(2))));
                      setSliderQty(val);
                      sessionStorage.setItem(SESSION_KEY_QTY, String(val));
                    }
                    setEditingQty(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingQty(false);
                  }}
                  style={{
                    width: 88, fontSize: 15, fontWeight: 700, color: '#60a5fa',
                    background: 'transparent',
                    border: '1px solid rgba(96,165,250,0.5)',
                    borderRadius: 6, padding: '1px 4px',
                    textAlign: 'right', outline: 'none',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  placeholder="1-10000"
                />
              ) : (
                <span
                  onClick={() => {
                    setInputQtyVal(sliderQty.toFixed(1));
                    setEditingQty(true);
                    setTimeout(() => { qtyInputRef.current?.select(); }, 30);
                  }}
                  style={{
                    fontSize: 15, fontWeight: 700, color: '#60a5fa', fontVariantNumeric: 'tabular-nums',
                    border: '1px solid rgba(96,165,250,0.35)',
                    borderRadius: 6, padding: '1px 6px', cursor: 'text',
                    background: 'rgba(96,165,250,0.06)',
                  }}
                >
                  {sliderQty.toFixed(1)} <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)' }}>ETH</span>
                </span>
              )}
            </div>
            {/* 进度条区域：32px高，内嵌24px轨道+32px手柄 */}
            <div
              ref={qtyBarRef}
              style={{ position: 'relative', height: 32, cursor: qtyUnlocked ? 'ew-resize' : 'not-allowed', touchAction: 'none', userSelect: 'none', opacity: qtyUnlocked ? 1 : 0.65 }}
              onMouseDown={(e) => {
                if (!qtyUnlocked) return;
                isDraggingQty.current = true;
                const qty = calcQtyFromX(e.clientX);
                setSliderQty(qty);
                sessionStorage.setItem(SESSION_KEY_QTY, String(qty));
              }}
              onTouchStart={(e) => {
                if (!qtyUnlocked) return;
                isDraggingQty.current = true;
                const qty = calcQtyFromX(e.touches[0].clientX);
                setSliderQty(qty);
                sessionStorage.setItem(SESSION_KEY_QTY, String(qty));
              }}
            >
              {/* 24px 轨道容器（垂直居中） */}
              <div className="absolute rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 24 }}>
                {/* 已填充段（蓝色渐变） */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${ethLogToSlider(Math.max(ETH_MIN, sliderQty)) * 100}%`,
                  background: 'linear-gradient(90deg, #1a5faa 0%, #2a7fd4 60%, #60a5fa 100%)',
                  borderRadius: '4px 0 0 4px',
                }} />
                {/* 轨道内文字：左显 0，右显 maxQty */}
                <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>1</span>
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>10000E</span>
              </div>
              {/* 32px 圆形手柄（内嵌 ETH 图标） */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${ethLogToSlider(Math.max(ETH_MIN, sliderQty)) * 100}% - 16px)`,
                  top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  zIndex: 10, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #1a3a6a 0%, #2a5fa0 50%, #1a3a6a 100%)',
                  boxShadow: qtyUnlocked
                    ? '0 0 14px rgba(96,165,250,0.9), 0 2px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.3)'
                    : '0 0 8px rgba(96,165,250,0.5), 0 2px 6px rgba(0,0,0,0.8)',
                  border: qtyUnlocked ? '1.5px solid rgba(96,165,250,0.9)' : '1.5px solid rgba(96,165,250,0.5)',
                }}
              >
                <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                  <defs>
                    <linearGradient id="qtyEthTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={qtyUnlocked ? '#fffbe8' : '#90c8ff'} />
                      <stop offset="100%" stopColor={qtyUnlocked ? '#e8e8e8' : '#4a90d9'} />
                    </linearGradient>
                    <linearGradient id="qtyEthMidL" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={qtyUnlocked ? '#fff5c0' : '#60a5fa'} />
                      <stop offset="100%" stopColor={qtyUnlocked ? '#c0c0c0' : '#2a6cb0'} />
                    </linearGradient>
                    <linearGradient id="qtyEthMidR" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={qtyUnlocked ? '#e8e8e8' : '#4a90d9'} />
                      <stop offset="100%" stopColor={qtyUnlocked ? '#a0a0a0' : '#1a4a80'} />
                    </linearGradient>
                    <linearGradient id="qtyEthBot" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={qtyUnlocked ? '#c0c0c0' : '#2a6cb0'} />
                      <stop offset="100%" stopColor={qtyUnlocked ? '#888888' : '#0a2040'} />
                    </linearGradient>
                  </defs>
                  <polygon points="8,0 15,10 8,7" fill="url(#qtyEthTop)" />
                  <polygon points="8,0 1,10 8,7" fill="url(#qtyEthMidL)" opacity="0.85" />
                  <polygon points="1,10 8,13.5 15,10 8,7" fill="url(#qtyEthMidR)" />
                  <polygon points="8,20 15,12 8,13.5" fill="url(#qtyEthBot)" />
                  <polygon points="8,20 1,12 8,13.5" fill="url(#qtyEthMidL)" opacity="0.75" />
                </svg>
              </div>
            </div>
          </div>

          {/* 联动状态指示 */}
          <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>
            {qtyUnlocked && riseUnlocked
              ? <span style={{ color: 'rgba(255,235,100,0.7)' }}>↕ 双向联动开启</span>
              : qtyUnlocked
              ? <span>↓ 持仓数量随涨幅变动</span>
              : riseUnlocked
              ? <span>↑ 涨幅随持仓数量变动</span>
              : <span>点击锁图可设为变量</span>
            }
          </div>

          {/* 滑块B：目标涨幅 —— 战略/战术进度条风格 */}
          <div style={{ marginBottom: 16 }}>
            {/* 标题行 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  onClick={toggleRiseLock}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: riseUnlocked
                      ? 'linear-gradient(135deg, #fff5c0 0%, #e8e8e8 30%, #c0c0c0 65%, #a0a0a0 100%)'
                      : 'linear-gradient(135deg, #2a3050 0%, #3a4060 100%)',
                    border: riseUnlocked ? '1.5px solid rgba(255,245,192,0.9)' : '1.5px solid rgba(100,120,200,0.4)',
                    boxShadow: riseUnlocked
                      ? '0 0 12px rgba(255,235,100,1), 0 2px 6px rgba(0,0,0,0.6)'
                      : '0 1px 4px rgba(0,0,0,0.5)',
                    userSelect: 'none',
                  }}
                  title="点击切换定量/变量"
                >
                  <svg width="11" height="13" viewBox="0 0 10 12" fill="none">
                    <rect x="1.5" y="5" width="7" height="6" rx="1.5" fill={riseUnlocked ? '#888' : 'rgba(148,163,184,0.7)'} />
                    {riseUnlocked
                      ? <path d="M3 5V3.5C3 2.12 3.9 1 5 1" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                      : <path d="M3 5V3.5C3 2.12 3.9 1 5 1C6.1 1 7 2.12 7 3.5V5" stroke="rgba(148,163,184,0.7)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                    }
                    <circle cx="5" cy="8" r="1" fill={riseUnlocked ? '#888' : 'rgba(255,255,255,0.5)'} />
                  </svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600,
                  color: riseUnlocked ? 'rgba(255,235,100,0.9)' : 'rgba(148,163,184,0.8)',

                }}>目标涨幅</span>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                  background: riseUnlocked ? 'rgba(255,235,100,0.15)' : 'rgba(100,120,200,0.15)',
                  color: riseUnlocked ? 'rgba(255,235,100,0.8)' : 'rgba(100,120,200,0.6)',
                  border: `1px solid ${riseUnlocked ? 'rgba(255,235,100,0.3)' : 'rgba(100,120,200,0.2)'}`,

                }}>{riseUnlocked ? '变量' : '定量'}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: difficulty.color, fontVariantNumeric: 'tabular-nums' }}>
                  +{riseDisplay.toFixed(1)}%
                </span>
                {exitPrice > 0 && curPrice > 0 && (
                  <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', marginLeft: 6 }}>
                    → ${exitPrice.toFixed(0)}
                  </span>
                )}
              </div>
            </div>
            {/* 进度条区域：32px高，内嵌24px轨道+32px手柄 */}
            <div
              ref={riseBarRef}
              style={{ position: 'relative', height: 32, cursor: riseUnlocked ? 'ew-resize' : 'not-allowed', touchAction: 'none', userSelect: 'none', opacity: riseUnlocked ? 1 : 0.65 }}
              onMouseDown={(e) => {
                if (!riseUnlocked) return;
                isDraggingRise.current = true;
                const rise = calcRiseFromX(e.clientX);
                setSliderRise(rise);
                sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
              }}
              onTouchStart={(e) => {
                if (!riseUnlocked) return;
                isDraggingRise.current = true;
                const rise = calcRiseFromX(e.touches[0].clientX);
                setSliderRise(rise);
                sessionStorage.setItem(SESSION_KEY_RISE, String(rise));
              }}
            >
              {/* 24px 轨道容器（垂直居中） */}
              <div className="absolute rounded overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.12), rgba(234,179,8,0.12), rgba(249,115,22,0.12), rgba(239,68,68,0.12))', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 24 }}>
                {/* 已填充段（难易度渐变色） */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${(Math.min(riseDisplay, maxRisePct) / maxRisePct) * 100}%`,
                  background: `linear-gradient(90deg, #22c55e 0%, #84cc16 25%, #eab308 50%, ${difficulty.color} 100%)`,
                  borderRadius: '4px 0 0 4px',
                }} />
                {/* 轨道内文字 */}
                <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>0%</span>
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>{maxRisePct}%</span>
              </div>
              {/* 32px 圆形手柄（内嵌 ETH 图标，颜色随难易度变化） */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${(Math.min(riseDisplay, maxRisePct) / maxRisePct) * 100}% - 16px)`,
                  top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  zIndex: 10, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.9) 100%)`,
                  boxShadow: riseUnlocked
                    ? `0 0 14px ${difficulty.color}cc, 0 2px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.3)`
                    : `0 0 10px ${difficulty.color}80, 0 2px 6px rgba(0,0,0,0.8)`,
                  border: riseUnlocked ? `1.5px solid ${difficulty.color}cc` : `1.5px solid ${difficulty.color}80`,
                }}
              >
                <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                  <defs>
                    <linearGradient id="riseEthTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={riseUnlocked ? '#fffbe8' : difficulty.color} />
                      <stop offset="100%" stopColor={riseUnlocked ? '#e8e8e8' : '#ffffff'} />
                    </linearGradient>
                    <linearGradient id="riseEthMidL" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={riseUnlocked ? '#fff5c0' : difficulty.color} />
                      <stop offset="100%" stopColor={riseUnlocked ? '#c0c0c0' : 'rgba(255,255,255,0.6)'} />
                    </linearGradient>
                    <linearGradient id="riseEthMidR" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={riseUnlocked ? '#e8e8e8' : 'rgba(255,255,255,0.8)'} />
                      <stop offset="100%" stopColor={riseUnlocked ? '#a0a0a0' : difficulty.color} />
                    </linearGradient>
                    <linearGradient id="riseEthBot" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={riseUnlocked ? '#c0c0c0' : 'rgba(255,255,255,0.5)'} />
                      <stop offset="100%" stopColor={riseUnlocked ? '#888888' : difficulty.color} />
                    </linearGradient>
                  </defs>
                  <polygon points="8,0 15,10 8,7" fill="url(#riseEthTop)" />
                  <polygon points="8,0 1,10 8,7" fill="url(#riseEthMidL)" opacity="0.85" />
                  <polygon points="1,10 8,13.5 15,10 8,7" fill="url(#riseEthMidR)" />
                  <polygon points="8,20 15,12 8,13.5" fill="url(#riseEthBot)" />
                  <polygon points="8,20 1,12 8,13.5" fill="url(#riseEthMidL)" opacity="0.75" />
                </svg>
              </div>
            </div>
          </div>

          {/* 难易度评估条 */}
          <div style={{ borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,120,200,0.12)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', fontWeight: 600 }}>方案难易度</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: difficulty.color }}>{difficulty.label}</span>
            </div>
            {/* 难易度进度条 */}
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #22c55e 0%, #84cc16 20%, #eab308 40%, #f97316 70%, #ef4444 100%)', marginBottom: 6 }}>
              {/* 指针 */}
              <div style={{ position: 'absolute', top: -3, left: `${difficulty.score}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: difficulty.color, border: '2px solid white', boxShadow: `0 2px 6px ${difficulty.color}80` }} />
            </div>
            {/* 刻度标签 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              {['极易', '较易', '适中', '偏难', '较难', '极难'].map((l, i) => (
                <span key={i} style={{ fontSize: 8, color: 'rgba(148,163,184,0.4)' }}>{l}</span>
              ))}
            </div>
            {/* 描述文字 */}
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', lineHeight: 1.5 }}>
              {difficulty.desc}
              {exitPrice > 0 && (
                <span style={{ color: 'rgba(148,163,184,0.4)' }}>，目标离场价 <span style={{ color: difficulty.color, fontWeight: 600 }}>${exitPrice.toFixed(0)}</span></span>
              )}
            </div>
            {/* 关键指标行 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', marginBottom: 2 }}>需持仓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>{sliderQty.toFixed(1)}<span style={{ fontSize: 9, marginLeft: 2, color: 'rgba(148,163,184,0.5)' }}>ETH</span></div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', marginBottom: 2 }}>需涨幅</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>+{riseDisplay.toFixed(1)}<span style={{ fontSize: 9, marginLeft: 1, color: 'rgba(148,163,184,0.5)' }}>%</span></div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', marginBottom: 2 }}>离场价</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: difficulty.color }}>${exitPrice > 0 ? exitPrice.toFixed(0) : '--'}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 对数刻度说明弹窗 */}
      {showLogInfo && (
        <div
          onClick={() => setShowLogInfo(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, #1a1f35 0%, #0f1225 100%)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 16, padding: '20px 18px', maxWidth: 360, width: '100%',
              boxShadow: '0 0 40px rgba(167,139,250,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(167,139,250,0.9)' }}>什么是对数刻度？</span>
              <span onClick={() => setShowLogInfo(false)} style={{ fontSize: 18, color: 'rgba(148,163,184,0.5)', cursor: 'pointer', lineHeight: 1 }}>×</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.85)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: 10 }}>
                <span style={{ color: 'rgba(167,139,250,0.9)', fontWeight: 600 }}>线性刻度</span>：把数轴均匀分割，每格代表相同的数值增量。比如 1万～1亿，3000万在 30% 位置。
              </p>
              <p style={{ marginBottom: 10 }}>
                <span style={{ color: 'rgba(167,139,250,0.9)', fontWeight: 600 }}>对数刻度</span>：把数轴按「数量级」分割，每格代表数值乘以 10 倍。比如：
              </p>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontFamily: 'monospace', fontSize: 11 }}>
                <div style={{ color: 'rgba(148,163,184,0.6)', marginBottom: 4 }}>对数刻度：1万 → 10万 → 100万 → 1000万 → 1亿</div>
                <div style={{ color: 'rgba(167,139,250,0.8)' }}>0%&nbsp;&nbsp;&nbsp;&nbsp;25%&nbsp;&nbsp;&nbsp;&nbsp;50%&nbsp;&nbsp;&nbsp;&nbsp;75%&nbsp;&nbsp;&nbsp;&nbsp;100%</div>
              </div>
              <p style={{ marginBottom: 10 }}>
                因此 3000万（接近 1亿 这个数量级）在对数刻度下会显示在约 <span style={{ color: '#f59e0b' }}>74%</span> 位置，而不是 30%。
              </p>
              <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: 11 }}>
                使用对数刻度的好处：1万～100万和 100万～1亿都有足够的操作空间，不会因为数值跨度大而导致小数值区间过于拥挤。
              </p>
            </div>
            <div
              onClick={() => setShowLogInfo(false)}
              style={{
                marginTop: 16, textAlign: 'center', padding: '8px',
                background: 'rgba(167,139,250,0.15)', borderRadius: 8,
                color: 'rgba(167,139,250,0.8)', fontSize: 13, cursor: 'pointer',
                border: '1px solid rgba(167,139,250,0.2)',
              }}
            >明白了</div>
          </div>
        </div>
      )}
    </div>
  );
}
