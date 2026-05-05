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
const STEP = 50;

function generatePriceLevels(): number[] {
  const levels: number[] = [];
  for (let p = MAX_PRICE; p >= MIN_PRICE; p -= STEP) {
    levels.push(p);
  }
  return levels;
}

const PRICE_LEVELS = generatePriceLevels();

// 弹窗状态
interface ModalState {
  price: number;
  mode: 'choose' | 'editPlanned' | 'editActual';
  inputValue: string;
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [summaryEdit, setSummaryEdit] = useState<SummaryEditModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetProfitCny, setTargetProfitCny] = useState<string>('');  // 目标止盈利润（人民币）
  const [targetEthQty, setTargetEthQty] = useState<string>('');  // 目标持仓 ETH 数量
  const [strategyRatio, setStrategyRatio] = useState<number>(50); // 策略持仓占比 0-100（战略=100-strategyRatio）
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
    const levels = PRICE_LEVELS.filter(p => p >= minP && p <= maxP);
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
    const levels = PRICE_LEVELS.filter(p => p >= minP && p <= maxP);
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
  const batchSaveMutation = trpc.ethPositionBatchSave.useMutation({
    onSuccess: () => {
      utils.ethPositionGetLevels.invalidate({ ledgerId });
    }
  });
  // 从数据库读取目标止盈和汇率设置
  const { data: settingsData } = trpc.ethPositionGetSettings.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: ledgerId > 0 }
  );
  const saveSettingsMutation = trpc.ethPositionSaveSettings.useMutation();

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
    });
  }, [ledgerId, targetProfitCny, targetEthQty, saveSettingsMutation]);

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
    }
  }, [settingsData]);

  // 初始化数据：从数据库加载，若无数据则用默认展示
  useEffect(() => {
    if (!positionLoading && positionData && !dataLoaded) {
      const newPlanned: Record<number, number> = {};
      const newActual: Record<number, number> = {};
      if (positionData.levels.length > 0) {
        positionData.levels.forEach(l => {
          newPlanned[l.price] = l.plannedQty;
          newActual[l.price] = l.actualQty;
        });
      } else {
        // 无数据时用默认展示（不写入数据库）
        PRICE_LEVELS.forEach(p => {
          newPlanned[p] = 0;
          newActual[p] = 0;
        });
      }
      setPlanned(newPlanned);
      setActual(newActual);
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
    PRICE_LEVELS.forEach(p => {
      const qty = actual[p] || 0;
      if (qty > 0) { totalQty += qty; totalCost += qty * p; }
    });
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const curPrice = currentPrice || 0;
    const totalValue = totalQty * curPrice;
    const totalPnl = totalQty > 0 && curPrice > 0 ? (curPrice - avgPrice) * totalQty : 0;
    const pnlPct = avgPrice > 0 && curPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 : 0;
    const totalPlanned = PRICE_LEVELS.reduce((s, p) => s + (planned[p] || 0), 0);
    return { totalQty, avgPrice, totalValue, totalPnl, pnlPct, totalPlanned };
  }, [actual, planned, currentPrice]);

  const hasData = (p: number) => (planned[p] || 0) > 0 || (actual[p] || 0) > 0;

  const visibleLevels = useMemo(() => {
    // 找出所有有数据的档位索引
    const dataIndices = PRICE_LEVELS.map((p, i) => hasData(p) ? i : -1).filter(i => i >= 0);
    
    if (dataIndices.length === 0) {
      // 全部为空时：只显示当前价格附近的一行空白行
      const nearPrice = currentPrice || 1800;
      const nearIdx = PRICE_LEVELS.reduce((best, p, i) =>
        Math.abs(p - nearPrice) < Math.abs(PRICE_LEVELS[best] - nearPrice) ? i : best, 0);
      return [PRICE_LEVELS[nearIdx]];
    }
    
    const minIdx = dataIndices[0];
    const maxIdx = dataIndices[dataIndices.length - 1];
    
    // 显示所有有数据的行，上下各保留一行空白行
    const startIdx = Math.max(0, minIdx - 1);
    const endIdx = Math.min(PRICE_LEVELS.length - 1, maxIdx + 1);
    
    return PRICE_LEVELS.slice(startIdx, endIdx + 1);
  }, [planned, actual, currentPrice]);
  // 所有档位中最大的计划数量，用于进度条背景宽度比例
  const maxPlannedQty = useMemo(() => {
    const vals = PRICE_LEVELS.map(p => planned[p] || 0);
    return Math.max(...vals, 1);
  }, [planned]);

  // 全局最大值：计划和实际中取最大，作为进度条等比例基准
  const maxGlobalQty = useMemo(() => {
    const planVals = PRICE_LEVELS.map(p => planned[p] || 0);
    const actualVals = PRICE_LEVELS.map(p => actual[p] || 0);
    return Math.max(...planVals, ...actualVals, 1);
  }, [planned, actual]);

  // 汇总卡片编辑确认
  const confirmSummaryEdit = () => {
    if (!summaryEdit) return;
    const num = parseFloat(summaryEdit.inputValue);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (summaryEdit.field === 'totalActual') {
      // 按比例分配到各有计划的档位
      const totalPlan = PRICE_LEVELS.reduce((s, p) => s + (planned[p] || 0), 0);
      if (totalPlan > 0) {
        const ratio = val / totalPlan;
        const newActual: Record<number, number> = {};
        PRICE_LEVELS.forEach(p => {
          if ((planned[p] || 0) > 0) newActual[p] = parseFloat(((planned[p] || 0) * ratio).toFixed(4));
          else newActual[p] = actual[p] || 0;
        });
        setActual(newActual);
        // 批量保存到数据库
        const levels = PRICE_LEVELS
          .filter(p => (planned[p] || 0) > 0 || (newActual[p] || 0) > 0)
          .map(p => ({ price: p, plannedQty: planned[p] || 0, actualQty: newActual[p] || 0 }));
        batchSaveMutation.mutate({ ledgerId, levels });
      }
    } else {
      // 按比例缩放各档计划
      const totalPlan = PRICE_LEVELS.reduce((s, p) => s + (planned[p] || 0), 0);
      if (totalPlan > 0) {
        const ratio = val / totalPlan;
        const newPlanned: Record<number, number> = {};
        PRICE_LEVELS.forEach(p => {
          if ((planned[p] || 0) > 0) newPlanned[p] = parseFloat(((planned[p] || 0) * ratio).toFixed(4));
          else newPlanned[p] = 0;
        });
        setPlanned(newPlanned);
        // 批量保存到数据库
        const levels = PRICE_LEVELS
          .filter(p => (newPlanned[p] || 0) > 0 || (actual[p] || 0) > 0)
          .map(p => ({ price: p, plannedQty: newPlanned[p] || 0, actualQty: actual[p] || 0 }));
        batchSaveMutation.mutate({ ledgerId, levels });
      }
    }
    setSummaryEdit(null);
  };

  // 打开弹窗 - 直接进入编辑实际已买模式（计划数量只在配置里修改）
  const openModal = (price: number) => {
    setModal({ price, mode: 'editActual', inputValue: String(actual[price] || '') });
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
      const oldVal = actual[modal.price] || 0;
      const newActual = { ...actual, [modal.price]: val };
      setActual(newActual);
      // 保存到数据库
      saveLevelMutation.mutate({
        ledgerId,
        price: modal.price,
        plannedQty: planned[modal.price] || 0,
        actualQty: val,
      });
      // 记录修改日志
      addChangeLogMutation.mutate({
        ledgerId,
        price: modal.price,
        changeType: 'actual',
        oldValue: oldVal,
        newValue: val,
      });
    }
    setModal(null);
  };

  const isPnlPositive = summary.totalPnl >= 0;

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto relative" style={{ background: '#000000' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: '#000000', borderBottom: '1px solid rgba(212,175,55,0.18)' }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
            style={{ backgroundColor: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.28)' }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-base" style={{ color: '#d4af37', letterSpacing: '0.05em' }}>ETH 持仓计算</div>
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
            style={{ backgroundColor: 'rgba(212,175,55,0.08)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.28)' }}
          >
            配置
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'transparent', color: 'rgba(212,175,55,0.35)', border: '1px solid rgba(212,175,55,0.12)' }}
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
            style={{ background: 'linear-gradient(160deg, #060400 0%, #0c0900 50%, #060400 100%)', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 0 0 1px rgba(245,226,122,0.05) inset, 0 8px 40px rgba(0,0,0,0.98)' }}
          >
            {/* 装饰光晕 */}
            <div className="absolute top-0 right-0 w-28 h-28 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,226,122,0.06) 0%, transparent 60%)', transform: 'translate(40%, -40%)' }} />
            {/* 顶部金属高光线 */}
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.15) 15%, #f0d060 42%, #fffbe8 50%, #f0d060 58%, rgba(212,175,55,0.15) 85%, transparent 100%)' }} />
            {/* 底部暗线 */}
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'transparent' }} />
            <div className="relative px-5 py-4">
              {/* 主数字区：左右两栏 */}
              <div className="flex items-start gap-0 mb-3">
                {/* 左栏：目标止盈利润 */}
                <div className="flex-1 pr-4">
                  <div className="flex items-center justify-end mb-2" style={{ gap: 0 }}>
                    {user?.name && (
                      <>
                        <span
                          className="text-xs font-medium tracking-widest"
                          style={{ color: 'rgba(212,175,55,0.5)', letterSpacing: '0.2em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}
                        >
                          {user.name}
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'rgba(212,175,55,0.3)', margin: '0 0.3em', letterSpacing: 0 }}
                        >
                          ·
                        </span>
                      </>
                    )}
                    <span
                      className="text-xs font-medium tracking-widest"
                      style={{ color: 'rgba(212,175,55,0.4)', letterSpacing: '0.2em', whiteSpace: 'nowrap' }}
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
                <div className="w-px self-stretch" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(212,175,55,0.3) 20%, rgba(212,175,55,0.3) 80%, transparent 100%)' }} />
                {/* 右栏：ETH/USDT + USDT/CNY */}
                <div className="pl-3 flex flex-col justify-start gap-3" style={{ minWidth: 0, width: '90px', flexShrink: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="text-[10px] mb-0.5" style={{ color: 'rgba(212,175,55,0.45)' }}>ETH/USDT</div>
                    <div className="text-base font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', display: 'block', width: '84px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #f5e27a 0%, #d4af37 50%, #b8860b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
                      {currentPrice
                        ? currentPrice.toFixed(2)
                        : '--'}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="text-[10px] mb-0.5" style={{ color: 'rgba(212,175,55,0.45)' }}>USDT/CNY</div>
                    <div className="text-base font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', display: 'block', width: '84px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #f5e27a 0%, #d4af37 50%, #b8860b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>{cnyRate.toFixed(5)}</div>
                  </div>
                </div>
              </div>
              {/* 持仓进度区 - ETH 蓝色系 */}
              <div className="mb-3 pt-2" style={{ borderTop: '1px solid rgba(212,175,55,0.1)' }}>
                {/* 数量标注行 */}
                {(() => {
                  const targetQty = parseFloat(targetEthQty) || 0;
                  const actualQty = summary.totalQty || 0;
                  const pct = targetQty > 0 ? Math.min(actualQty / targetQty, 1) : 0;
                  const profitUsdt = targetProfitCny && cnyRate ? parseFloat(targetProfitCny) / cnyRate : 0;
                  // 目标均价：按计划档位数量加权均价
                  let _planCost = 0, _planQty = 0;
                  PRICE_LEVELS.forEach(p => { const q = planned[p] || 0; if (q > 0) { _planCost += q * p; _planQty += q; } });
                  const targetAvgPrice = _planQty > 0 ? _planCost / _planQty : 0;
                  // 实际均价：按实际买入数量加权均价
                  let _actCost = 0, _actQty = 0;
                  PRICE_LEVELS.forEach(p => { const q = actual[p] || 0; if (q > 0) { _actCost += q * p; _actQty += q; } });
                  const actualAvgPrice = _actQty > 0 ? _actCost / _actQty : 0;
                  // 止盈价 = 均价 + 目标利润(USDT) ÷ 持仓数量（从成本出发，不依赖当前价）
                  const targetExitPrice = targetAvgPrice > 0 && targetQty > 0 ? targetAvgPrice + profitUsdt / targetQty : 0;
                  const actualExitPrice = actualAvgPrice > 0 && actualQty > 0 ? actualAvgPrice + profitUsdt / actualQty : 0;

                  return (
                    <div>
                      {/* 数量对比行 */}
                      <div className="flex items-end justify-between mb-1.5">
                        <div>
                          <div className="text-[11px] mb-0.5 font-medium tracking-wider" style={{ color: 'rgba(212,175,55,0.45)' }}>实际持仓</div>
                          <span className="text-2xl font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #f5e27a 30%, #d4af37 65%, #b8860b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,1))' }}>
                            {actualQty > 0 ? actualQty.toFixed(0) : '--'}
                          </span>
                          <span className="text-xs ml-1" style={{ color: 'rgba(212,175,55,0.3)' }}>ETH</span>
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="text-right">
                            <div className="text-[11px] mb-0.5 font-medium tracking-wider" style={{ color: 'rgba(212,175,55,0.45)' }}>目标持仓</div>
                            <span className="text-2xl font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #f5e27a 30%, #d4af37 65%, #b8860b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,1))' }}>
                              {targetQty > 0 ? targetQty.toFixed(0) : '--'}
                            </span>
                            <span className="text-xs ml-1" style={{ color: 'rgba(212,175,55,0.25)' }}>ETH</span>
                          </div>
                        </div>
                      </div>

                      {/* 进度条：目标=深蓝底，实际=亮蓝高光，百分比内嵌右端 */}
                      <div className="relative rounded overflow-hidden" style={{ height: '18px', background: 'rgba(255,255,255,0.04)' }}>
                        {/* 目标底条（满宽，深蓝低光） */}
                        <div className="absolute inset-0 rounded" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.1) 0%, rgba(212,175,55,0.03) 100%)' }} />
                        {/* 实际填充（亮蓝高光），内含百分比数字 */}
                        {pct > 0 && (
                          <div
                            className="absolute top-0 left-0 h-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{
                              width: `${pct * 100}%`,
                              background: pct >= 1
                                ? 'linear-gradient(90deg, #9a7000 0%, #d4af37 45%, #f5e27a 80%, #fffbe8 100%)'
                                : 'linear-gradient(90deg, #6a4800 0%, #b8860b 45%, #d4af37 80%, #f5e27a 100%)',
                              boxShadow: '0 0 14px rgba(212,175,55,0.55), 0 0 5px rgba(255,245,192,0.25)',
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
                            {/* 进度条容器，垂直居中 18px */}
                            <div className="absolute rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: '18px' }}>
                              {/* 战略持仓段（左侧，亮金） */}
                              <div
                                className="absolute top-0 left-0 h-full"
                                style={{
                                  width: `${100 - strategyRatio}%`,
                                  background: 'linear-gradient(90deg, #9a7000 0%, #d4af37 60%, #f5e27a 100%)',
                                  boxShadow: '2px 0 8px rgba(212,175,55,0.4)',
                                  borderRadius: '4px 0 0 4px',
                                }}
                              />
                              {/* 策略持仓段（右侧，暗金半透明） */}
                              <div
                                className="absolute top-0 h-full"
                                style={{
                                  left: `${100 - strategyRatio}%`,
                                  width: `${strategyRatio}%`,
                                  background: 'linear-gradient(90deg, rgba(139,100,0,0.7) 0%, rgba(90,60,0,0.5) 100%)',
                                  borderRadius: '0 4px 4px 0',
                                  borderLeft: '1px solid rgba(212,175,55,0.3)',
                                }}
                              />
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
                                  ? 'linear-gradient(135deg, #fff5c0 0%, #f5e27a 30%, #d4af37 65%, #b8860b 100%)'
                                  : 'linear-gradient(135deg, #3a2800 0%, #7a5500 50%, #4a3200 100%)',
                                boxShadow: strategyUnlocked
                                  ? '0 0 14px rgba(255,235,100,1), 0 2px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.5)'
                                  : '0 0 6px rgba(212,175,55,0.4), 0 2px 6px rgba(0,0,0,0.8)',
                                border: strategyUnlocked
                                  ? '1.5px solid rgba(255,245,192,0.9)'
                                  : '1.5px solid rgba(212,175,55,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s ease',
                              }}>
                                {/* ETH 菱形 SVG 图标 */}
                                <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <defs>
                                    <linearGradient id="ethTop" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#fffbe8' : '#d4af37'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#f5e27a' : '#9a7000'} />
                                    </linearGradient>
                                    <linearGradient id="ethMidL" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#fff5c0' : '#b8860b'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#d4af37' : '#7a5500'} />
                                    </linearGradient>
                                    <linearGradient id="ethMidR" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#f5e27a' : '#9a7000'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#b8860b' : '#5a3800'} />
                                    </linearGradient>
                                    <linearGradient id="ethBot" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor={strategyUnlocked ? '#d4af37' : '#7a5500'} />
                                      <stop offset="100%" stopColor={strategyUnlocked ? '#9a7000' : '#4a3000'} />
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
                          {/* 进度条下方标注行 */}
                          <div className="flex items-start justify-between mt-2">
                            {/* 左：战略筹码 */}
                            <div className="flex flex-col items-start gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold" style={{ color: '#d4af37' }}>{100 - strategyRatio}%</span>
                                <span className="text-[10px]" style={{ color: 'rgba(212,175,55,0.3)' }}>·</span>
                                <span className="text-[10px] font-mono" style={{ color: 'rgba(212,175,55,0.5)' }}>{Math.round(actualQty * (100 - strategyRatio) / 100)} ETH</span>
                              </div>
                              <span className="text-[10px] font-medium tracking-wider" style={{ color: 'rgba(212,175,55,0.6)' }}>战略筹码</span>
                              <span className="text-[9px] italic" style={{ color: 'rgba(212,175,55,0.3)' }}>要像山一样坚定</span>
                            </div>
                            {/* 右：策略筹码 */}
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono" style={{ color: 'rgba(212,175,55,0.5)' }}>{Math.round(actualQty * strategyRatio / 100)} ETH</span>
                                <span className="text-[10px]" style={{ color: 'rgba(212,175,55,0.3)' }}>·</span>
                                <span className="text-[10px] font-bold" style={{ color: '#b8860b' }}>{strategyRatio}%</span>
                              </div>
                              <span className="text-[10px] font-medium tracking-wider" style={{ color: 'rgba(212,175,55,0.6)' }}>策略筹码</span>
                              <span className="text-[9px] italic" style={{ color: 'rgba(212,175,55,0.3)' }}>要像水一样灵活</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* ===== 三行对比区域：止盈 / 涨幅 / 均价，每行左右 + VS 中轴 ===== */}
                      {(() => {
                        // 均价计算
                        let planCost2 = 0, planQtyTotal2 = 0;
                        PRICE_LEVELS.forEach(p => { const q = planned[p] || 0; if (q > 0) { planCost2 += q * p; planQtyTotal2 += q; } });
                        const targetAvg2 = planQtyTotal2 > 0 ? planCost2 / planQtyTotal2 : 0;
                        let actCost2 = 0, actQtyTotal2 = 0;
                        PRICE_LEVELS.forEach(p => { const q = actual[p] || 0; if (q > 0) { actCost2 += q * p; actQtyTotal2 += q; } });
                        const actualAvg2 = actQtyTotal2 > 0 ? actCost2 / actQtyTotal2 : 0;

                        const showExitRow = actualExitPrice > 0 || targetExitPrice > 0;
                        const showRiseRow = (actualAvgPrice > 0 && actualExitPrice > actualAvgPrice) || (targetAvgPrice > 0 && targetExitPrice > targetAvgPrice);
                        const showAvgRow = targetAvg2 > 0 || actualAvg2 > 0;

                        // 统一行样式
                        const rowCls = "grid mt-2 pt-2 items-center" as const;
                        const rowStyle = { borderTop: '1px solid rgba(212,175,55,0.08)', gridTemplateColumns: '1fr 28px 1fr' };
                        const labelStyle2: React.CSSProperties = { color: 'rgba(212,175,55,0.38)', fontSize: '11px', letterSpacing: '0.05em', marginBottom: '3px', fontWeight: 500 };
                        const numStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(180deg, #fff5c0 0%, #f5e27a 30%, #d4af37 65%, #b8860b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' };
                        const vsStyle: React.CSSProperties = { color: 'rgba(212,175,55,0.2)', fontSize: '11px', fontWeight: 700, textAlign: 'center', letterSpacing: '0.05em', lineHeight: 1 };

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
                                      ? <>{Math.round(actualExitPrice)}<span style={{ color: 'rgba(212,175,55,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
                                  </span>
                                </div>
                                {/* 中：VS */}
                                <div style={vsStyle}>VS</div>
                                {/* 右：目标止盈 */}
                                <div className="text-right">
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <button onClick={(e) => { e.stopPropagation(); setShowExitPriceInfo(true); }} style={{ color: 'rgba(212,175,55,0.4)', lineHeight: 1 }}>
                                      <HelpCircle className="w-2.5 h-2.5" />
                                    </button>
                                    <span style={labelStyle2}>目标止盈</span>
                                  </div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {targetExitPrice > 0
                                      ? <>{Math.round(targetExitPrice)}<span style={{ color: 'rgba(212,175,55,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
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
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
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
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
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
                                      ? <>{Math.round(actualAvg2)}<span style={{ color: 'rgba(212,175,55,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
                                  </span>
                                </div>
                                {/* 中：VS */}
                                <div style={vsStyle}>VS</div>
                                {/* 右：目标均价 */}
                                <div className="text-right">
                                  <div style={labelStyle2}>目标均价</div>
                                  <span className="text-xl font-bold font-mono" style={numStyle}>
                                    {targetAvg2 > 0
                                      ? <>{Math.round(targetAvg2)}<span style={{ color: 'rgba(212,175,55,0.5)', fontSize: '10px', marginLeft: '2px' }}>U</span></>
                                      : <span style={{ color: 'rgba(212,175,55,0.25)' }}>--</span>}
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
          <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(160deg, #0d0900 0%, #1a1200 100%)', border: '1px solid rgba(212,175,55,0.22)', boxShadow: '0 12px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(212,175,55,0.15)' }}>
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
                  saveSettingsMutation.mutate({ ledgerId, targetProfitCny: profit, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0 });
                }
              }}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #9a7000 0%, #d4af37 40%, #f5e27a 55%, #d4af37 70%, #9a7000 100%)', color: '#0a0800', fontWeight: 700 }}
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
            <div className="rounded-xl p-3" style={{ background: '#0d0900', border: '1px solid rgba(212,175,55,0.12)' }}>
              <div className="text-xs mb-1 tracking-widest" style={{ color: 'rgba(212,175,55,0.4)' }}>当前市值</div>
              <div className="text-xl font-bold" style={{ color: '#d4af37', textShadow: '0 0 12px rgba(212,175,55,0.35)' }}>
                {summary.totalValue > 0 ? `$${summary.totalValue.toFixed(0)}` : '--'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.35)' }}>
                成本 ${summary.avgPrice > 0 ? (summary.avgPrice * summary.totalQty).toFixed(0) : '--'}
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#0d0900', border: `1px solid ${isPnlPositive ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
              <div className="text-xs mb-1 tracking-widest" style={{ color: 'rgba(212,175,55,0.4)' }}>总浮盈亏</div>
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
          // 计划条宽度：以全局最大值为基准等比例，最小显示8%（有数据时）
          const planPct = planQty > 0 ? Math.max(Math.round(planQty / maxGlobalQty * 100), 8) : 0;
          // 实际条宽度：以全局最大值为基准等比例（不再 cap 到计划量）
          const actualPct = actualQty > 0 ? Math.max(Math.round(actualQty / maxGlobalQty * 100), 4) : 0;
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
              onClick={() => openModal(price)}
              className="w-full block"
            >
              {/* 进度条容器 */}
              <div
                className="relative h-6 rounded overflow-hidden transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: isNearCurrent
                    ? 'linear-gradient(90deg, #100c00 0%, #1a1200 50%, #100c00 100%)'
                    : (isBelowCurrent ? '#080600' : '#040300'),
                  boxShadow: isNearCurrent
                    ? '0 0 0 1px rgba(255,245,192,0.65), 0 0 16px rgba(212,175,55,0.1)'
                    : 'none',
                }}
              >
                {/* 计划量条：半透明金色描边，作为底层背景（zIndex 1） */}
                {planQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{
                      width: `${planPct}%`,
                      background: 'linear-gradient(90deg, rgba(212,175,55,0.18) 0%, rgba(212,175,55,0.12) 100%)',
                      borderRight: '1px solid rgba(212,175,55,0.35)',
                      borderRadius: '0 3px 3px 0',
                      zIndex: 1,
                    }}
                  />
                )}
                {/* 实际已买：实心金色进度条（zIndex 2，叠在计划条上） */}
                {actualQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{
                      width: `${actualPct}%`,
                      background: isFullyBought
                        ? 'linear-gradient(90deg, #9a7000 0%, #d4af37 45%, #f5e27a 80%, #fffbe8 100%)'
                        : 'linear-gradient(90deg, #7a5500 0%, #c8960a 45%, #d4af37 80%, #f0d060 100%)',
                      boxShadow: '0 0 8px rgba(212,175,55,0.4)',
                      minWidth: '4px',
                      borderRadius: '0 3px 3px 0',
                      zIndex: 2,
                    }}
                  />
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
                  {isNearCurrent && (
                    <svg
                      className="ml-1.5 flex-shrink-0"
                      width="22" height="22"
                      viewBox="0 0 22 22"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* 深色不透明圆圈衬底 */}
                      <circle cx="11" cy="11" r="11" fill="rgba(0,0,0,0.6)" />
                      {/* 白色实心 ETH 菱形，上半亮下半稍暗 */}
                      <polygon points="11,3 17,11 11,9" fill="#ffffff" />
                      <polygon points="11,3 5,11 11,9" fill="rgba(255,255,255,0.7)" />
                      <polygon points="11,19 17,13 11,15" fill="rgba(255,255,255,0.9)" />
                      <polygon points="11,19 5,13 11,15" fill="rgba(255,255,255,0.55)" />
                    </svg>
                  )}
                </div>

                {/* 右侧数量标注：智能颜色——进度条覆盖到右侧时用白色+阴影，否则用深色 */}
                <div className="absolute right-3 top-0 h-full flex items-center pointer-events-none" style={{ zIndex: 10 }}>
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

      {/* 底部提示 */}
      <div className="px-4 pt-4 pb-2 text-center text-xs" style={{ color: 'rgba(212,175,55,0.3)' }}>
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
        const allocLevels = PRICE_LEVELS.filter(p => p >= minP && p <= maxP);
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
                  const allocLevels2 = PRICE_LEVELS.filter(p => p >= minVal2 && p <= maxVal2);

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
                          <span className="text-sm font-medium flex-shrink-0" style={{ color: 'rgba(212,175,55,0.5)' }}>ETH</span>
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

                      {/* 操作按钮 */}
                      <button
                        onClick={() => {
                          if (ledgerId > 0) {
                            saveSettingsMutation.mutate({ ledgerId, targetProfitCny: parseFloat(targetProfitCny) || 0, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0 });
                          }
                          setAllocStep('method');
                        }}
                        disabled={parseFloat(targetEthQty) <= 0 || !targetProfitCny}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white mb-3 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #9a7000 0%, #d4af37 40%, #f5e27a 55%, #d4af37 70%, #9a7000 100%)', color: '#0a0800', fontWeight: 700 }}
                      >
                        下一步：选择分配方式
                      </button>
                      <button
                        onClick={() => {
                          if (ledgerId > 0) {
                            saveSettingsMutation.mutate({ ledgerId, targetProfitCny: parseFloat(targetProfitCny) || 0, cnyRate: 0, targetEthQty: parseFloat(targetEthQty) || 0 });
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
                          className="min-w-0 flex-1 text-2xl font-bold outline-none bg-transparent placeholder:text-gray-600 placeholder:font-normal placeholder:text-lg" style={{ color: '#fff' }}
                          style={{ minWidth: 0 }}
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
                      style={{ background: 'linear-gradient(135deg, #9a7000 0%, #d4af37 40%, #f5e27a 55%, #d4af37 70%, #9a7000 100%)', color: '#0a0800', fontWeight: 700 }}
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
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.35)' }}>{allocEqualAsc && allocMethod === 'equal' ? '越高价格买越多' : '越低价格买越多'}，相邻档位数量差异固定</div>
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
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.35)' }}>{allocGeomAsc && allocMethod === 'geometric' ? '越高价格分配越多' : '越低价格分配越多'}，按等比递增</div>
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
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.35)' }}>中间价格区间买最多，两端价格区间买最少</div>
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
                          <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.35)' }}>自定义每档数量，总量必须等于目标持仓</div>
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
                        style={{ background: 'linear-gradient(135deg, #9a7000 0%, #d4af37 40%, #f5e27a 55%, #d4af37 70%, #9a7000 100%)', color: '#0a0800', fontWeight: 700 }}
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
                          const newPlanned = { ...planned };
                          allocLevels.forEach(p => {
                            newPlanned[p] = liveResult[p] || 0;
                          });
                          setPlanned(newPlanned);
                          // 保存到数据库
                          const levels = PRICE_LEVELS.map(p => ({ price: p, plannedQty: newPlanned[p] || 0, actualQty: actual[p] || 0 }));
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
        PRICE_LEVELS.forEach(p => { const q = planned[p] || 0; if (q > 0) { _mPlanCost += q * p; _mPlanQty += q; } });
        const targetAvgForModal = _mPlanQty > 0 ? _mPlanCost / _mPlanQty : 0;
        // 实际均价（按实际买入加权）
        let _mActCost = 0, _mActQty = 0;
        PRICE_LEVELS.forEach(p => { const q = actual[p] || 0; if (q > 0) { _mActCost += q * p; _mActQty += q; } });
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
          <div className="w-full max-w-md rounded-2xl px-5 pt-5 pb-8 mx-4" style={{ background: 'linear-gradient(160deg, #2a1f00 0%, #1e1500 50%, #2a1f00 100%)', border: '1px solid rgba(212,175,55,0.45)', boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(212,175,55,0.12), inset 0 1px 0 rgba(212,175,55,0.15)' }}>
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold" style={{ background: 'linear-gradient(90deg, #f5e27a, #d4af37)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {modal.price} 档位
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(212,175,55,0.5)' }}>
                  已买 {(actual[modal.price] || 0).toFixed(2)} ETH &nbsp;·&nbsp; 计划 {(planned[modal.price] || 0).toFixed(2)} ETH
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X className="w-4 h-4" style={{ color: 'rgba(212,175,55,0.5)' }} />
              </button>
            </div>



            {modal.mode === 'editActual' && (() => {
              const isActual = true;
              const accentColor = '#d4af37';
              const currentVal = parseFloat(modal.inputValue) || 0;
              // 参考值：目标持仓总量用于计算百分比快捷按钮
              const totalTarget = parseFloat(targetEthQty) || 0;
              // 滑块范围：左辸0，右辸500
              const sliderMin = 0;
              const sliderMax = 500;
              // 当前值在滑块范围内的百分比
              const sliderPct = Math.min(Math.max(currentVal / sliderMax, 0), 1);
              // 快捷百分比按钮（基于目标总持仓量）
              const pctBtns = [5, 10, 20, 50];
              const adjust = (delta: number) => {
                const next = Math.max(0, (parseFloat(modal.inputValue) || 0) + delta);
                setModal(prev => prev ? { ...prev, inputValue: String(next) } : null);
              };
              return (
                <div>
                  {/* 标题行 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold" style={{ color: isActual ? '#d4af37' : 'rgba(212,175,55,0.7)' }}>
                      {isActual ? '修改已买数量' : '修改计划数量'}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>
                  </div>

                  {/* 输入框 */}
                  <div className="mb-4 px-3 py-2 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)', border: `1px solid ${isActual ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.2)'}` }}>
                    <input
                      autoFocus
                      type="number"
                      value={modal.inputValue}
                      onChange={e => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                      placeholder="0"
                      className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                      style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}
                      step="1"
                      min="0"
                    />
                  </div>

                  {/* 滑动进度条：0 → 500，实时显示占总计划仓位百分比 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-2" style={{ color: 'rgba(212,175,55,0.4)' }}>
                      <span>0</span>
                      <span className="text-sm font-bold" style={{ color: '#f0d060', letterSpacing: '0.02em' }}>
                        {currentVal > 0 && totalTarget > 0
                          ? `${(currentVal / totalTarget * 100).toFixed(1)}%  占总计划仓`
                          : currentVal > 0 ? `${currentVal} ETH` : '--'
                        }
                      </span>
                      <span>500</span>
                    </div>
                    {/* 进度条轨道 */}
                    <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="absolute top-0 left-0 h-full rounded-full transition-all duration-150"
                        style={{
                          width: `${sliderPct * 100}%`,
                          background: isActual
                            ? 'linear-gradient(90deg, #7a5500 0%, #c8960a 45%, #d4af37 80%, #f0d060 100%)'
                            : 'linear-gradient(90deg, rgba(212,175,55,0.3) 0%, rgba(212,175,55,0.6) 100%)',
                          boxShadow: isActual ? '0 0 6px rgba(212,175,55,0.4)' : 'none',
                        }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={500}
                      step={1}
                      value={Math.min(Math.max(currentVal, 0), 500)}
                      onChange={e => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                      className="w-full mt-1"
                      style={{ accentColor: '#d4af37', height: '20px' }}
                    />
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal({ ...modal, mode: 'choose', inputValue: '' })}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      返回
                    </button>
                    <button
                      onClick={confirmModal}
                      className="flex-2 py-2.5 rounded-xl text-sm font-bold"
                      style={{ flex: 2, background: isActual ? 'linear-gradient(135deg, #9a7000 0%, #d4af37 40%, #f5e27a 55%, #d4af37 70%, #9a7000 100%)' : 'linear-gradient(135deg, rgba(212,175,55,0.5) 0%, rgba(212,175,55,0.8) 50%, rgba(212,175,55,0.5) 100%)', color: '#0a0800', fontWeight: 700 }}
                    >
                      确认保存
                    </button>
                  </div>

                  {/* 修改日志 */}
                  <div className="mt-3" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', paddingTop: '12px' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium tracking-widest" style={{ color: 'rgba(212,175,55,0.6)' }}>修改日志</span>
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
                        <div key={log.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: log.changeType === 'actual' ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.1)', color: log.changeType === 'actual' ? '#f0d060' : 'rgba(212,175,55,0.7)', fontSize: '10px' }}>
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
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(212,175,55,0.3)', color: 'rgba(255,255,255,0.85)', outline: 'none' }}
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
                                  style={{ color: 'rgba(212,175,55,0.5)' }}
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
    </div>
  );
}

