/**
 * PositionCalc.tsx
 * ETH 持仓计算页面
 * - 每50元一档，从1000到3500
 * - 每档是一条进度条，价格文字融入条内
 * - 点击档位弹出 modal，选择修改计划量或已买量
 */
import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, X, Check, Pencil, HelpCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const MIN_PRICE = 1000;
const MAX_PRICE = 2500;
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

  const [planned, setPlanned] = useState<Record<number, number>>({});
  const [actual, setActual] = useState<Record<number, number>>({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [summaryEdit, setSummaryEdit] = useState<SummaryEditModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetProfitCny, setTargetProfitCny] = useState<string>('');  // 目标止盈利润（人民币）
  const [targetEthQty, setTargetEthQty] = useState<string>('');  // 目标持仓 ETH 数量
  const [cnyRate, setCnyRate] = useState<number>(7.28); // 人民币/USDT 汇率（初始占位，会被实时值覆盖）
  const [cnyRateInput, setCnyRateInput] = useState<string>(''); // 手动修改汇率的输入内容
  const [editingRate, setEditingRate] = useState(false); // 是否正在编辑汇率
  const [rateFromApi, setRateFromApi] = useState<number | null>(null); // 实时汇率（API 成功后设置）
  const [showExitPriceInfo, setShowExitPriceInfo] = useState(false); // 目标离场价说明弹窗
  // ===== 自动分配计划持仓 =====
  const [showAutoAlloc, setShowAutoAlloc] = useState(false); // 是否显示自动分配弹窗
  const [allocStep, setAllocStep] = useState<'range' | 'method' | 'preview'>('range'); // 分配步骤
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

    // 辅助：除最后一档外全部取整，最后一档吸收剩余（确保总量严格一致）
    const applyWeights = (weights: number[], asc: boolean) => {
      // asc=false: 越低价格越多（weights[0]对应最高价，weights[n-1]对应最低价，越大越多）
      // asc=true: 越高价格越多（反转权重）
      const w = asc ? [...weights].reverse() : weights;
      const totalW = w.reduce((s, x) => s + x, 0);
      let sum = 0;
      levels.slice(0, -1).forEach((p, i) => {
        result[p] = Math.max(1, Math.round(w[i] / totalW * totalQty));
        sum += result[p];
      });
      result[levels[n - 1]] = Math.max(1, totalQty - sum);
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

  // 获取实时 USDT/CNY 汇率 — 10秒刷新，保留上次值
  const { data: rateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { staleTime: 8000, refetchInterval: 10000 }
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
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 保存单个档位
  const saveLevelMutation = trpc.ethPositionSaveLevel.useMutation();
  const batchSaveMutation = trpc.ethPositionBatchSave.useMutation({
    onSuccess: () => {
      utils.ethPositionGetLevels.invalidate({ ledgerId });
    }
  });
  // 从数据库读取目标止盈和汇率设置
  const { data: settingsData } = trpc.ethPositionGetSettings.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );
  const saveSettingsMutation = trpc.ethPositionSaveSettings.useMutation();

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

  // ETH 价格 — 10秒刷新，保留上次值（新数据未到前不清空）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 10000,
    staleTime: 8000,
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
    const nearPrice = currentPrice || 1800;
    return PRICE_LEVELS.filter(p =>
      hasData(p) || (p >= nearPrice - 500 && p <= nearPrice + 500)
    );
  }, [planned, actual, currentPrice]);
  // 所有档位中最大的计划数量，用于进度条背景宽度比例
  const maxPlannedQty = useMemo(() => {
    const vals = PRICE_LEVELS.map(p => planned[p] || 0);
    return Math.max(...vals, 1);
  }, [planned]);

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

  // 打开弹窗
  const openModal = (price: number) => {
    setModal({ price, mode: 'choose', inputValue: '' });
  };

  // 弹窗确认
  const confirmModal = () => {
    if (!modal) return;
    const num = parseFloat(modal.inputValue);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (modal.mode === 'editPlanned') {
      const newPlanned = { ...planned, [modal.price]: val };
      setPlanned(newPlanned);
      // 保存到数据库
      saveLevelMutation.mutate({
        ledgerId,
        price: modal.price,
        plannedQty: val,
        actualQty: actual[modal.price] || 0,
      });
    } else if (modal.mode === 'editActual') {
      const newActual = { ...actual, [modal.price]: val };
      setActual(newActual);
      // 保存到数据库
      saveLevelMutation.mutate({
        ledgerId,
        price: modal.price,
        plannedQty: planned[modal.price] || 0,
        actualQty: val,
      });
    }
    setModal(null);
  };

  const isPnlPositive = summary.totalPnl >= 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative">
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <div className="text-white font-semibold text-base">ETH 持仓计算</div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
        >
          刷新
        </button>
      </div>

      {/* 目标止盈利润 */}
      <div className="px-4 pt-4 pb-3">
        {!editingRate ? (
          // 展示模式：财经质感卡片
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
          >
            {/* 装饰光晕 */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #e2b96f 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #4fc3f7 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />
            <div className="relative px-5 py-4">
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium tracking-widest" style={{ color: '#e2b96f', letterSpacing: '0.15em' }}>目标止盈利润</span>
                <button
                  onClick={() => { setCnyRateInput(cnyRate.toFixed(4)); setEditingRate(true); }}
                  className="p-1 rounded-md"
                  style={{ background: 'rgba(226,185,111,0.12)' }}
                >
                  <Pencil className="w-3.5 h-3.5" style={{ color: 'rgba(226,185,111,0.8)' }} />
                </button>
              </div>
              {/* 主数字区 */}
              <div className="mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold" style={{ color: '#e2b96f', fontVariantNumeric: 'tabular-nums' }}>
                    {targetProfitCny && !isNaN(parseFloat(targetProfitCny)) && parseFloat(targetProfitCny) > 0
                      ? `¥${Number(targetProfitCny).toLocaleString('zh-CN')}`
                      : <span style={{ color: 'rgba(226,185,111,0.3)' }}>¥ --</span>
                    }
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>=</span>
                  <span className="text-lg font-semibold" style={{ color: '#4fc3f7', fontVariantNumeric: 'tabular-nums' }}>
                    {targetProfitCny && !isNaN(parseFloat(targetProfitCny)) && parseFloat(targetProfitCny) > 0
                      ? `$${(parseFloat(targetProfitCny) / cnyRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} U`
                      : <span style={{ color: 'rgba(79,195,247,0.3)' }}>-- U</span>
                    }
                  </span>
                </div>
              </div>
              {/* 持仓进度区 - ETH 蓝色系 */}
              <div className="mb-3 pt-2" style={{ borderTop: '1px solid rgba(98,126,234,0.2)' }}>
                {/* 标题行：当前 ETH 价 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'rgba(98,126,234,0.7)' }}>持仓进度</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>ETH </span>
                    <span className="text-sm font-semibold" style={{ color: '#93c5fd' }}>
                      {currentPrice ? `$${currentPrice.toFixed(0)}` : '--'}
                    </span>
                  </div>
                </div>

                {/* 数量标注行 */}
                {(() => {
                  const targetQty = parseFloat(targetEthQty) || 0;
                  const actualQty = summary.totalQty || 0;
                  const pct = targetQty > 0 ? Math.min(actualQty / targetQty, 1) : 0;
                  const profitUsdt = targetProfitCny && cnyRate ? parseFloat(targetProfitCny) / cnyRate : 0;
                  const targetExitPrice = currentPrice && targetQty > 0 ? currentPrice + profitUsdt / targetQty : 0;
                  const actualExitPrice = currentPrice && actualQty > 0 ? currentPrice + profitUsdt / actualQty : 0;

                  return (
                    <div>
                      {/* 数量对比行 */}
                      <div className="flex items-end justify-between mb-1.5">
                        <div>
                          <div className="text-xs mb-0.5" style={{ color: 'rgba(129,140,248,0.6)' }}>实际持仓</div>
                          <span className="text-2xl font-bold" style={{ color: '#a5b4fc', fontVariantNumeric: 'tabular-nums' }}>
                            {actualQty > 0 ? actualQty.toFixed(0) : '--'}
                          </span>
                          <span className="text-xs ml-1" style={{ color: 'rgba(165,180,252,0.6)' }}>ETH</span>
                        </div>
                        <div className="flex items-end gap-2">
                          {/* 配置按钮：在目标持仓左边 */}
                          {targetEthQty && parseFloat(targetEthQty) > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                try {
                                  const saved = localStorage.getItem(`alloc_config_${ledgerId}`);
                                  if (saved) {
                                    const cfg = JSON.parse(saved);
                                    if (cfg.method) setAllocMethod(cfg.method);
                                    if (cfg.arithDiff) setAllocArithDiff(cfg.arithDiff);
                                    if (cfg.geomRatio) setAllocGeomRatio(cfg.geomRatio);
                                    if (typeof cfg.geomAsc === 'boolean') setAllocGeomAsc(cfg.geomAsc);
                                    if (typeof cfg.equalAsc === 'boolean') setAllocEqualAsc(cfg.equalAsc);
                                    if (cfg.normalSigma) setAllocNormalSigma(cfg.normalSigma);
                                    if (cfg.minPrice) setAllocMinPrice(cfg.minPrice);
                                    if (cfg.maxPrice) setAllocMaxPrice(cfg.maxPrice);
                                  }
                                } catch {}
                                const hasAlloc = PRICE_LEVELS.some(p => (planned[p] || 0) > 0);
                                if (hasAlloc) {
                                  const allocedLevels = PRICE_LEVELS.filter(p => (planned[p] || 0) > 0);
                                  if (allocedLevels.length > 0) {
                                    const detectedMin = Math.min(...allocedLevels);
                                    const detectedMax = Math.max(...allocedLevels);
                                    setAllocMinPrice(String(detectedMin));
                                    setAllocMaxPrice(String(detectedMax));
                                    const preview: Record<number, number> = {};
                                    allocedLevels.forEach(p => { preview[p] = planned[p] || 0; });
                                    setAllocPreview(preview);
                                  }
                                  setAllocStep('preview');
                                } else {
                                  setAllocStep('range');
                                }
                                setShowAutoAlloc(true);
                              }}
                              className="px-1.5 py-0.5 rounded font-semibold self-end mb-0.5"
                              style={{ background: 'rgba(98,126,234,0.18)', color: '#818cf8', border: '1px solid rgba(98,126,234,0.35)', fontSize: '10px' }}
                            >配置</button>
                          )}
                          <div className="text-right">
                            <div className="text-xs mb-0.5" style={{ color: 'rgba(98,126,234,0.5)' }}>目标持仓</div>
                            <span className="text-lg font-semibold" style={{ color: '#6366f1', fontVariantNumeric: 'tabular-nums' }}>
                              {targetQty > 0 ? targetQty.toFixed(0) : '--'}
                            </span>
                            <span className="text-xs ml-1" style={{ color: 'rgba(99,102,241,0.5)' }}>ETH</span>
                          </div>
                        </div>
                      </div>

                      {/* 进度条：目标=深蓝底，实际=亮蓝高光，百分比内嵌右端 */}
                      <div className="relative rounded-full overflow-hidden" style={{ height: '18px', background: 'rgba(99,102,241,0.2)' }}>
                        {/* 目标底条（满宽，深蓝低光） */}
                        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0.15) 100%)' }} />
                        {/* 实际填充（亮蓝高光） */}
                        {pct > 0 && (
                          <div
                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct * 100}%`,
                              background: pct >= 1
                                ? 'linear-gradient(90deg, #6366f1 0%, #818cf8 60%, #a5b4fc 100%)'
                                : 'linear-gradient(90deg, #4f46e5 0%, #6366f1 60%, #818cf8 100%)',
                              boxShadow: '0 0 8px rgba(129,140,248,0.6)',
                            }}
                          />
                        )}
                        {/* 百分比内嵌进度条右端 */}
                        {targetQty > 0 && (
                          <div className="absolute right-2 top-0 bottom-0 flex items-center">
                            <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 0 4px rgba(79,70,229,0.8)' }}>
                              {(pct * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                      {/* 离场价对照行：实际离场（左）和目标离场（右） */}
                      <div className="flex items-start justify-between mt-1.5">
                        <div>
                          {actualExitPrice > 0 ? (
                            <>
                              <div className="text-xs" style={{ color: 'rgba(165,180,252,0.6)' }}>实际离场</div>
                              <span className="text-xs font-bold" style={{ color: '#a5b4fc' }}>
                                ${actualExitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </>
                          ) : <span />}
                        </div>
                        <div className="text-right">
                          {targetExitPrice > 0 && (
                            <>
                              <div className="flex items-center gap-0.5 justify-end">
                                <span className="text-xs" style={{ color: 'rgba(99,102,241,0.5)' }}>目标离场</span>
                                <button onClick={(e) => { e.stopPropagation(); setShowExitPriceInfo(true); }} style={{ color: 'rgba(99,102,241,0.5)', lineHeight: 1 }}>
                                  <HelpCircle className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <span className="text-xs font-bold" style={{ color: '#6366f1' }}>
                                ${targetExitPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* 均价对照行 */}
                      {(() => {
                        // 目标均价：按计划数量加权均价
                        let planCost = 0, planQtyTotal = 0;
                        PRICE_LEVELS.forEach(p => {
                          const q = planned[p] || 0;
                          if (q > 0) { planCost += q * p; planQtyTotal += q; }
                        });
                        const targetAvg = planQtyTotal > 0 ? planCost / planQtyTotal : 0;
                        // 实际均价：按实际买入数量加权均价
                        let actCost = 0, actQtyTotal = 0;
                        PRICE_LEVELS.forEach(p => {
                          const q = actual[p] || 0;
                          if (q > 0) { actCost += q * p; actQtyTotal += q; }
                        });
                        const actualAvg = actQtyTotal > 0 ? actCost / actQtyTotal : 0;
                        if (targetAvg === 0 && actualAvg === 0) return null;
                        return (
                          <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.15)' }}>
                            <div>
                              <div className="text-xs mb-0.5" style={{ color: 'rgba(129,140,248,0.6)' }}>实际均价</div>
                              <span className="text-sm font-bold" style={{ color: '#a5b4fc', fontVariantNumeric: 'tabular-nums' }}>
                                {actualAvg > 0 ? `$${actualAvg.toFixed(0)}` : '--'}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-xs mb-0.5" style={{ color: 'rgba(99,102,241,0.5)' }}>目标均价</div>
                              <span className="text-sm font-bold" style={{ color: '#6366f1', fontVariantNumeric: 'tabular-nums' }}>
                                {targetAvg > 0 ? `$${targetAvg.toFixed(0)}` : '--'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()
              }
            </div>
                            {/* 汇率行 */}
              <div className="flex items-center gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>USD/CNY</span>
                <span className="text-xs font-mono font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>{cnyRate.toFixed(4)}</span>
                <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.25)' }}>实时汇率</span>
              </div>
            </div>
          </div>
        ) : (
          // 编辑模式
          <div className="rounded-2xl border-2 border-blue-400 bg-white px-5 py-4 shadow-lg">
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
                  className="flex-1 text-2xl font-bold text-gray-800 outline-none bg-transparent placeholder:text-gray-200 placeholder:font-normal placeholder:text-lg"
                  autoFocus
                />
              </div>
            </div>
            {/* 目标 ETH 数量输入 */}
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">目标持仓 ETH 数量</div>
              <div className="flex items-center gap-2 border-b-2 border-blue-300 pb-1">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="输入 ETH 数量"
                  value={targetEthQty}
                  onChange={e => setTargetEthQty(e.target.value)}
                  className="flex-1 text-2xl font-bold text-gray-800 outline-none bg-transparent placeholder:text-gray-200 placeholder:font-normal placeholder:text-lg"
                />
                <span className="text-sm font-medium text-gray-400">ETH</span>
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
              style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)' }}
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
              <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${summary.totalPlanned > 0 ? Math.min((summary.totalQty / summary.totalPlanned) * 100, 100) : 0}%`,
                    background: 'linear-gradient(90deg, #1A56DB, #3B82F6)',
                  }}
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">当前市值</div>
              <div className="text-xl font-bold text-gray-800">
                {summary.totalValue > 0 ? `$${summary.totalValue.toFixed(0)}` : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                成本 ${summary.avgPrice > 0 ? (summary.avgPrice * summary.totalQty).toFixed(0) : '--'}
              </div>
            </div>
            <div className={`rounded-xl p-3 ${isPnlPositive ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className="text-xs text-gray-500 mb-1">总浮盈亏</div>
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
          // 计划量占最大计划量的百分比（用于进度条背景宽度）
          const planPct = planQty > 0 ? Math.max(Math.round(planQty / maxPlannedQty * 100), 8) : 100;
          // 已买占计划的百分比；若无计划但有实际，显示满格
          const actualPct = planQty > 0
            ? Math.min((actualQty / planQty) * 100, 100)
            : (actualQty > 0 ? 100 : 0);
          const isNearCurrent = currentPrice && Math.abs(price - currentPrice) <= 25;
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
                className="relative h-8 rounded-lg overflow-hidden transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: '#F3F4F6',
                  boxShadow: isNearCurrent ? '0 0 0 2px #3B82F6' : 'none',
                }}
              >
                {/* 计划量背景宽度（灰色，反映该档计划数量相对大小） */}
                {planQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{ width: `${planPct}%`, background: 'linear-gradient(90deg, #CBA471, #E2B96F)' }}
                  />
                )}
                {/* 已买填充（蓝色） */}
                {actualQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{
                      width: `${actualPct}%`,
                      background: isFullyBought
                        ? 'linear-gradient(90deg, #047857, #059669)'  // 满仓翠绿
                        : 'linear-gradient(90deg, #B71C1C, #D32F2F)',
                      minWidth: '4px',
                    }}
                  />
                )}

                {/* 价格文字（叠加在进度条上，始终可见） */}
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color: actualPct > 30
                        ? 'rgba(255,255,255,0.95)'
                        : (isBelowCurrent ? '#374151' : '#9CA3AF'),
                      textShadow: actualPct > 30 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    ${price.toLocaleString()}
                  </span>
                  {isNearCurrent && (
                    <span
                      className="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded"
                      style={{
                        background: 'rgba(59,130,246,0.15)',
                        color: actualPct > 30 ? 'rgba(255,255,255,0.9)' : '#3B82F6',
                      }}
                    >
                      ↑当前
                    </span>
                  )}
                </div>

                {/* 右侧数量标注 */}
                {(planQty > 0 || actualQty > 0) && (
                  <div className="absolute right-3 top-0 h-full flex items-center pointer-events-none">
                    <span
                      className="text-[11px] font-medium tabular-nums"
                      style={{
                        color: actualPct > 70
                          ? 'rgba(255,255,255,0.9)'
                          : '#6B7280',
                        textShadow: actualPct > 70 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                      }}
                    >
                      {actualQty > 0 ? actualQty.toFixed(2) : ''}
                      {planQty > 0 && actualQty > 0 ? <span style={{ opacity: 0.6 }}>/</span> : ''}
                      {planQty > 0 && <span style={{ opacity: actualQty > 0 ? 0.6 : 1 }}>{planQty.toFixed(2)}</span>}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="px-4 pt-4 pb-2 text-center text-xs text-gray-300">
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
            className="fixed inset-0 z-50"
            style={{ background: '#F9FAFB' }}
          >
            <div className="bg-white w-full h-full max-w-md mx-auto" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
                <div>
                  <div className="text-base font-bold text-gray-800">自动分配计划持仓</div>
                  <div className="text-xs text-gray-400 mt-0.5">目标持仓 {totalQty.toFixed(2)} ETH</div>
                </div>
                <button onClick={() => setShowAutoAlloc(false)} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {/* 步骤指示器 */}
              <div className="flex items-center px-5 py-3 gap-2">
                {(['range', 'method', 'preview'] as const).map((step, i) => (
                  <React.Fragment key={step}>
                    <div className="flex items-center gap-1">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: allocStep === step ? '#1A56DB' : (i < ['range','method','preview'].indexOf(allocStep) ? '#10B981' : '#E5E7EB'),
                          color: allocStep === step || i < ['range','method','preview'].indexOf(allocStep) ? 'white' : '#9CA3AF'
                        }}
                      >{i + 1}</div>
                      <span className="text-xs" style={{ color: allocStep === step ? '#1A56DB' : '#9CA3AF' }}>
                        {step === 'range' ? '区间' : step === 'method' ? '方式' : '预览'}
                      </span>
                    </div>
                    {i < 2 && <div className="flex-1 h-px bg-gray-200" />}
                  </React.Fragment>
                ))}
              </div>
              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto px-5 pb-4">
                {/* 步骤 1：设置价格区间 */}
                {allocStep === 'range' && (
                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-4">设置买入价格区间</div>
                    <div className="text-xs text-gray-400 mb-4">只在此区间内的档位进行分配，共 {allocLevels.length > 0 ? allocLevels.length : '--'} 个档位</div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">最低价（底部）</div>
                        <div className="flex items-center gap-1 border-b-2 pb-1" style={{ borderColor: '#3B82F6' }}>
                          <span className="text-sm text-gray-400">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="如 1000"
                            value={allocMinPrice}
                            onChange={e => setAllocMinPrice(e.target.value)}
                            className="flex-1 text-lg font-bold text-gray-800 outline-none bg-transparent"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">最高价（顶部）</div>
                        <div className="flex items-center gap-1 border-b-2 pb-1" style={{ borderColor: '#3B82F6' }}>
                          <span className="text-sm text-gray-400">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="如 2000"
                            value={allocMaxPrice}
                            onChange={e => setAllocMaxPrice(e.target.value)}
                            className="flex-1 text-lg font-bold text-gray-800 outline-none bg-transparent"
                          />
                        </div>
                      </div>
                    </div>
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
                      style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)' }}
                    >
                      下一步：选择分配方式
                    </button>
                  </div>
                )}
                {/* 步骤 2：选择分配方式 */}
                {allocStep === 'method' && (
                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-4">选择分配方式</div>
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
                          <div className="text-xs text-gray-400 mt-0.5">{allocEqualAsc && allocMethod === 'equal' ? '越高价格买越多' : '越低价格买越多'}，相邻档位数量差异固定</div>
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
                          <div className="text-xs text-gray-400 mt-0.5">{allocGeomAsc && allocMethod === 'geometric' ? '越高价格分配越多' : '越低价格分配越多'}，按等比递增</div>
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
                          <div className="text-xs text-gray-400 mt-0.5">中间价格区间买最多，两端价格区间买最少</div>
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
                          <div className="text-xs text-gray-400 mt-0.5">自定义每档数量，总量必须等于目标持仓</div>
                        </div>
                      </button>
                    </div>
                    {/* 等差/等比/正态分布实时预览条形图 */}
                    {(allocMethod === 'equal' || allocMethod === 'geometric' || allocMethod === 'normal') && allocLevels.length > 0 && (() => {
                      const previewQtys = calcAutoAlloc(allocMethod, minP, maxP);
                      const maxQty = Math.max(...allocLevels.map(p => previewQtys[p] || 0));
                      return (
                        <div className="mb-4 rounded-xl p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-gray-500">实时分配预览</div>
                            <div className="text-xs text-gray-400">{allocLevels.length} 个档位 · {totalQty.toFixed(2)} ETH</div>
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
                        onClick={() => setAllocStep('range')}
                        className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
                      >返回</button>
                      <button
                        disabled={allocMethod === 'manual' && Math.abs(manualTotal - totalQty) > 0.001}
                        onClick={() => {
                          const result = calcAutoAlloc(allocMethod, minP, maxP);
                          setAllocPreview(result);
                          setAllocStep('preview');
                        }}
                        className="flex-2 flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)' }}
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
                        onClick={() => { setAllocStep('range'); }}
                        className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
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
        const exitPrice = currentPrice && ethQty > 0 ? currentPrice + profitUsdt / ethQty : null;
        const actualExitPrice = currentPrice && actualEthQty > 0 ? currentPrice + profitUsdt / actualEthQty : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowExitPriceInfo(false)}
          >
            <div
              className="bg-white w-full max-w-md rounded-t-2xl px-5 pt-5 pb-10 shadow-2xl"
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
                  目标离场价 = 当前价 + 目标利润(USDT) ÷ 持仓数量
                </div>
                <div className="text-xs text-gray-400 mt-1.5">
                  其中：目标利润(USDT) = 目标利润(CNY) ÷ 汇率
                </div>
              </div>

              {/* 逻辑说明 */}
              <div className="text-sm text-gray-600 leading-relaxed mb-4">
                <p className="mb-2">当你持有一定数量的 ETH，并设定了目标利润后，系统会计算出：</p>
                <p className="mb-2">ETH 价格需要从<span className="font-semibold text-gray-800">当前价</span>上涨多少，才能让你的持仓产生足够的浮盈，恰好达到目标利润。</p>
                <p className="text-gray-400 text-xs">即：每涨 $1，持仓盈利 = 持仓数量 × $1。因此涨幅 = 目标利润 ÷ 持仓数量。</p>
              </div>

              {/* 基础参数 */}
              {profitCny > 0 && currentPrice && (
                <div className="rounded-xl p-4 mb-3" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                  <div className="text-xs font-semibold text-blue-600 mb-3 tracking-wide">基础参数</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">当前 ETH 价</span>
                      <span className="font-semibold text-gray-800">${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">目标利润</span>
                      <span className="font-semibold text-gray-800">¥{profitCny.toLocaleString('zh-CN')} ≈ {profitUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT</span>
                    </div>
                  </div>
                </div>
              )}
              {/* 计划持仓 vs 实际持仓 对比 */}
              {profitCny > 0 && currentPrice && (ethQty > 0 || actualEthQty > 0) && (
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
                        <span className="text-sm font-semibold text-gray-800">{ethQty.toFixed(2)} ETH</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">需涨幅度</span>
                        <span className="text-sm font-semibold" style={{ color: '#f97316' }}>+${(profitUsdt / ethQty).toLocaleString('en-US', { maximumFractionDigits: 0 })} / ETH</span>
                      </div>
                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #FED7AA' }}>
                        <span className="text-sm font-semibold text-gray-700">目标离场价</span>
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
                        <span className="text-sm font-semibold text-gray-800">{actualEthQty.toFixed(2)} ETH</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">需涨幅度</span>
                        <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>+${(profitUsdt / actualEthQty).toLocaleString('en-US', { maximumFractionDigits: 0 })} / ETH</span>
                      </div>
                      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #BBF7D0' }}>
                        <span className="text-sm font-semibold text-gray-700">目标离场价</span>
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
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div className="bg-white w-full max-w-md rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-gray-800">
                  ${modal.price.toLocaleString()} 档位
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  已买 {(actual[modal.price] || 0).toFixed(2)} ETH &nbsp;·&nbsp; 计划 {(planned[modal.price] || 0).toFixed(2)} ETH
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {modal.mode === 'choose' && (
              <div className="space-y-3">
                <button
                  onClick={() => setModal({ ...modal, mode: 'editActual', inputValue: String(actual[modal.price] || '') })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                  style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1A56DB' }}>
                    <span className="text-white text-sm font-bold">买</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: '#1A56DB' }}>修改已买数量</div>
                    <div className="text-xs text-gray-400">当前：{(actual[modal.price] || 0).toFixed(2)} ETH</div>
                  </div>
                </button>
                <button
                  onClick={() => setModal({ ...modal, mode: 'editPlanned', inputValue: String(planned[modal.price] || '') })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-400">
                    <span className="text-white text-sm font-bold">划</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-700">修改计划数量</div>
                    <div className="text-xs text-gray-400">当前：{(planned[modal.price] || 0).toFixed(2)} ETH</div>
                  </div>
                </button>
              </div>
            )}

            {(modal.mode === 'editActual' || modal.mode === 'editPlanned') && (
              <div>
                <div className="mb-3 text-sm font-medium text-gray-700">
                  {modal.mode === 'editActual' ? '输入已买数量（ETH）' : '输入计划数量（ETH）'}
                </div>
                <input
                  autoFocus
                  type="number"
                  value={modal.inputValue}
                  onChange={e => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                  placeholder="输入 ETH 数量，如 0.5"
                  className="w-full px-4 py-3 rounded-xl text-base border outline-none"
                  style={{ borderColor: modal.mode === 'editActual' ? '#3B82F6' : '#D1D5DB' }}
                  step="0.01"
                  min="0"
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setModal({ ...modal, mode: 'choose', inputValue: '' })}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
                  >
                    返回
                  </button>
                  <button
                    onClick={confirmModal}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: modal.mode === 'editActual' ? '#1A56DB' : '#6B7280' }}
                  >
                    确认
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

