/**
 * A 股风控 · 私人委託操盤 · 风险参考手册
 * 1:1 复刻参考页面，包含：利息测算、保证金管理4风险、穿仓5场景、法律问题、核心建议
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

// ─── 类型 ─────────────────────────────────────────────────────────

interface StockInput {
  id: number;
  code: string;
  name: string | null; // null = not found
  loading: boolean;
}

interface RuleItem {
  id: string;
  name: string;
  add_rate: number;
  hit: boolean;
  detail: string;
  level: string;
  prob?: number;
  loss?: number;
  suggest_rate?: number;
  threshold_label?: string;
  is_dynamic?: boolean;
  desc?: string;
}

interface StockResult {
  ts_code: string;
  name: string;
  stock_type?: string;
  market_cap_yi?: number | null;
  pledge_ratio?: number | null;
  account_rate: number;
  base_rate: number;
  total_add: number;
  hits: string[];
  all_rules: RuleItem[];
  rate_breakdown: RuleItem[];
  force_close_info?: {
    trigger_pct: number;
    daily_limit: number;
    risk_level: string;
    desc: string;
    margin_pct?: number;
    stock_type?: string;
  };
  is_multi?: boolean;
  suggest_rate?: number;
  error?: string;
}

interface CheckResult {
  results: StockResult[];
  account_rate: number;
  account_add: number;
  all_hits: string[];
  base_rate: number;
}

// ─── 工具函数 ─────────────────────────────────────────────────────

let idCounter = 0;

// ─── 主页面 ──────────────────────────────────────────────────────

export default function StockRisk() {
  // 利息测算状态
  const [calcBaseRate, setCalcBaseRate] = useState(12);
  const [calcMarginPct, setCalcMarginPct] = useState(20);
  const [bufferPct, setBufferPct] = useState(0);
  // 板块选择（空股票时生效）
  const [boardTypes, setBoardTypes] = useState<Array<"main" | "star" | "gem" | "st">>([ "main"]);

  const toggleBoard = (b: "main" | "star" | "gem" | "st") => {
    setBoardTypes(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    );
  };

  // 结算方式
  const [settlementType, setSettlementType] = useState<"rmb" | "crypto" | "cash" | "foreign">("rmb");
  // 结算频率
  const [settlementFreqMode, setSettlementFreqMode] = useState<"timed" | "countdown">("timed");
  const [timedFreq, setTimedFreq] = useState<"daily" | "weekly">("daily");
  const [countdownAmount, setCountdownAmount] = useState<10000 | 20000 | 30000 | 50000>(10000);

  // 单格数组：每次+新增一个格子，默认两个
  const [calcCells, setCalcCells] = useState<Array<{ code: string; name: string | null; tsCode: string }>>(
    [{ code: "", name: null, tsCode: "" }, { code: "", name: null, tsCode: "" }]
  );
  const [calcResult, setCalcResult] = useState<CheckResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const calcSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 保证金管理 overlay
  const [detailOverlay, setDetailOverlay] = useState<null | "risk1" | "risk2" | "risk3" | "risk4">(null);

  // 穿仓 accordion 开关
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  // 风险四内的 AI 检测工具
  const [widgetStocks, setWidgetStocks] = useState<StockInput[]>([{ id: ++idCounter, code: "", name: null, loading: false }]);
  const [widgetBaseRate, setWidgetBaseRate] = useState(12);
  const [widgetMarginPct, setWidgetMarginPct] = useState(20);
  const [widgetScanning, setWidgetScanning] = useState(false);
  const [widgetResult, setWidgetResult] = useState<CheckResult | null>(null);
  const [widgetPhase, setWidgetPhase] = useState<"input" | "scanning" | "result">("input");
  const [widgetScanStep, setWidgetScanStep] = useState("正在读取市场数据…");
  const widgetSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // 利率加成表（从后端获取）
  const rulesQuery = trpc.stockRisk.getRules.useQuery();

  const checkMutation = trpc.stockRisk.check.useMutation();
  const saveHistoryMutation = trpc.stockRisk.saveHistory.useMutation();
  const historyQuery = trpc.stockRisk.getHistory.useQuery();
  const utils = trpc.useUtils();

  // 方案管理
  const { user } = useAuth();
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [savePlanName, setSavePlanName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  // 当前已载入的方案（编辑模式）
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const savePlanMutation = trpc.stockRisk.savePlan.useMutation();
  const updatePlanMutation = trpc.stockRisk.updatePlan.useMutation();
  const deletePlanMutation = trpc.stockRisk.deletePlan.useMutation();
  const plansQuery = trpc.stockRisk.listPlans.useQuery(undefined, { enabled: !!user });

  const handleSavePlan = async () => {
    if (!user) { startLogin(); return; }
    // 如果当前处于编辑方案模式，弹出覆盖确认
    if (currentPlanId !== null) {
      setShowUpdateConfirm(true);
      return;
    }
    if (!showSaveInput) { setShowSaveInput(true); setSavePlanName(""); return; }
    const name = savePlanName.trim() || `方案 ${new Date().toLocaleDateString("zh-CN")}`;
    try {
      await savePlanMutation.mutateAsync({
        name,
        baseRate: calcBaseRate,
        marginPct: calcMarginPct,
        boardTypes,
        stocks: calcCells.filter(c => c.code).map(c => ({ code: c.code, name: c.name })),
      });
      utils.stockRisk.listPlans.invalidate();
      setSaveMsg("已保存");
      setShowSaveInput(false);
      setTimeout(() => setSaveMsg(""), 2000);
    } catch { setSaveMsg("保存失败"); setTimeout(() => setSaveMsg(""), 2000); }
  };

  const handleUpdatePlan = async () => {
    if (!currentPlanId || !currentPlanName) return;
    try {
      await updatePlanMutation.mutateAsync({
        id: currentPlanId,
        name: currentPlanName,
        baseRate: calcBaseRate,
        marginPct: calcMarginPct,
        boardTypes,
        stocks: calcCells.filter(c => c.code).map(c => ({ code: c.code, name: c.name })),
      });
      utils.stockRisk.listPlans.invalidate();
      setShowUpdateConfirm(false);
      setSaveMsg("已更新");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch { setSaveMsg("更新失败"); setTimeout(() => setSaveMsg(""), 2000); }
  };

  const handleLoadPlan = (plan: { id: number; name: string; baseRate: number; marginPct: number; boardTypes: string[]; stocks: Array<{ code: string; name: string | null }> }) => {
    setCalcBaseRate(plan.baseRate);
    setCalcMarginPct(plan.marginPct);
    setBoardTypes(plan.boardTypes as Array<"main" | "star" | "gem" | "st">);
    setCalcCells(
      plan.stocks.length > 0
        ? plan.stocks.map(s => ({ code: s.code, name: s.name ?? null, tsCode: "" }))
        : [{ code: "", name: null, tsCode: "" }, { code: "", name: null, tsCode: "" }]
    );
    setCalcResult(null);
    setCurrentPlanId(plan.id);
    setCurrentPlanName(plan.name);
    setShowPlansModal(false);
  };

  const handleDeletePlan = async (id: number) => {
    await deletePlanMutation.mutateAsync({ id });
    utils.stockRisk.listPlans.invalidate();
  };

  // ─── 利息测算：股票搜索 ──────────────────────────────────────────

  const handleCalcInput = useCallback((idx: number, val: string) => {
    const code = val.trim().replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
    setCalcCells(prev => {
      const cells = [...prev];
      if (cells[idx].code === code) return cells;
      cells[idx] = { code, name: null, tsCode: "" };
      return cells;
    });
    if (code.length < 4) return;
    const key = `cell-${idx}`;
    clearTimeout(calcSearchTimers.current[key]);
    calcSearchTimers.current[key] = setTimeout(async () => {
      try {
        const res = await utils.stockRisk.searchStock.fetch({ code });
        setCalcCells(prev => {
          const cells = [...prev];
          if (cells[idx].code !== code) return cells;
          cells[idx] = { code, name: res.name ?? null, tsCode: res.ts_code ?? "" };
          return cells;
        });
      } catch {
        // ignore
      }
    }, 200);
  }, [utils]);

  const calcAddCell = () => {
    setCalcCells(prev => [...prev, { code: "", name: null, tsCode: "" }]);
  };

  const calcDelCell = (idx: number) => {
    setCalcCells(prev => {
      if (prev.length <= 1) return prev; // 最少保留一个
      return prev.filter((_, i) => i !== idx);
    });
  };

  const calcRun = async () => {
    const stockCodes: string[] = [];
    for (const cell of calcCells) {
      if (cell.code) stockCodes.push(cell.code);
    }
    const filtered = stockCodes.filter(c => c.length >= 4);
    const uniqueCodes = filtered.filter((c, i) => filtered.indexOf(c) === i);
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const res = await checkMutation.mutateAsync({ stocks: uniqueCodes, base_rate: calcBaseRate, margin_pct: calcMarginPct, board_types: uniqueCodes.length === 0 ? boardTypes : undefined });
      setCalcResult(res as unknown as CheckResult);
      const validResults = (res.results as StockResult[]).filter(r => !r.error);
      if (validResults.length > 0) {
        const highest = validResults.reduce((a, b) => a.account_rate > b.account_rate ? a : b);
        await saveHistoryMutation.mutateAsync({
          symbols: validResults.map(r => r.ts_code),
          names: validResults.map(r => r.name),
          baseRate: calcBaseRate,
          totalRate: res.account_rate,
          highestSymbol: highest.ts_code,
          highestName: highest.name,
        });
        utils.stockRisk.getHistory.invalidate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCalcLoading(false);
    }
  };

  // ─── 风险四 AI 检测工具 ───────────────────────────────────────────

  const handleWidgetCodeChange = useCallback((id: number, code: string) => {
    setWidgetStocks(prev => prev.map(s => s.id === id ? { ...s, code, name: null, loading: false } : s));
    if (widgetSearchTimers.current[id]) clearTimeout(widgetSearchTimers.current[id]);
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    setWidgetStocks(prev => prev.map(s => s.id === id ? { ...s, loading: true } : s));
    widgetSearchTimers.current[id] = setTimeout(async () => {
      try {
        const res = await utils.stockRisk.searchStock.fetch({ code: trimmed });
        setWidgetStocks(prev => prev.map(s => s.id === id ? { ...s, name: res.name ?? null, loading: false } : s));
      } catch {
        setWidgetStocks(prev => prev.map(s => s.id === id ? { ...s, loading: false } : s));
      }
    }, 300);
  }, [utils]);

  const widgetCheckMutation = trpc.stockRisk.check.useMutation();

  const handleWidgetCheck = async () => {
    const codes = widgetStocks.map(s => s.code.trim()).filter(Boolean);
    if (!codes.length) return;
    setWidgetPhase("scanning");
    setWidgetScanning(true);
    setWidgetResult(null);

    const steps = [
      "正在读取公司基本面数据…",
      "正在核查总市值与流通盘…",
      "正在比对大股东质押比例…",
      "正在追踪连续亏损财务指标…",
      "正在评估ST风险等级…",
      "正在计算风险补偿利率…",
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      setWidgetScanStep(steps[stepIdx % steps.length]);
      stepIdx++;
    }, 900);

    try {
      const res = await widgetCheckMutation.mutateAsync({ stocks: codes, base_rate: widgetBaseRate, margin_pct: widgetMarginPct });
      clearInterval(stepTimer);
      setWidgetResult(res as unknown as CheckResult);
      setWidgetPhase("result");
    } catch {
      clearInterval(stepTimer);
      setWidgetPhase("result");
    } finally {
      setWidgetScanning(false);
    }
  };

  const resetWidget = () => {
    setWidgetPhase("input");
    setWidgetResult(null);
    setWidgetStocks([{ id: ++idCounter, code: "", name: null, loading: false }]);
  };

  // ─── accordion 切换 ───────────────────────────────────────────────

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ─── 打开 overlay 时重置 widget ────────────────────────────────────

  useEffect(() => {
    if (detailOverlay === "risk4") {
      resetWidget();
    }
  }, [detailOverlay]);

  // ─── 渲染 ─────────────────────────────────────────────────────────

  const rules = (rulesQuery.data?.rules ?? []) as RuleItem[];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f0f2f5",
      color: "#1a1a1a",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
      overflowX: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        padding: "36px 20px 28px",
        textAlign: "center",
        color: "white",
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
          澳门潤儀A股业务风控管理 - B
        </h1>
      </div>

      {/* ── 利息测算模块 ── */}
      <div style={{ background: "white", padding: "20px 18px 22px", borderBottom: "2px solid #f0f2f5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "#1a1a2e", letterSpacing: 0.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8a838", display: "inline-block" }} />
            利息测算
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { if (!user) { startLogin(); return; } setShowPlansModal(true); }}
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: 600,
                background: "#f5f6f8", border: "1px solid #dde0e8",
                borderRadius: 6, cursor: "pointer", color: "#555",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.color = "white"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1d4ed8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f6f8"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#dde0e8"; }}
            >
              方案
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: 600,
                background: "#f5f6f8", border: "1px solid #dde0e8",
                borderRadius: 6, cursor: "pointer", color: "#555",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#e8a838"; (e.currentTarget as HTMLButtonElement).style.color = "white"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#d4922a"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f5f6f8"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#dde0e8"; }}
            >
              刷新
            </button>
          </div>
        </div>

        {/* 基础月化利率 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>基础月化利率</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { val: 12, label: "1%", period: "使用一年" },
              { val: 18, label: "1.5%", period: "使用半年" },
              { val: 24, label: "2%", period: "使用三个月" },
              { val: 36, label: "3%", period: "小于三个月" },
            ].map(item => (
              <div
                key={item.val}
                onClick={() => setCalcBaseRate(item.val)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: calcBaseRate === item.val ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${calcBaseRate === item.val ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: calcBaseRate === item.val ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 800, color: calcBaseRate === item.val ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 11, fontWeight: 400, color: calcBaseRate === item.val ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.period}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 保证金比例 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>保证金比例</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[5, 10, 15, 20].map(v => (
              <div
                key={v}
                onClick={() => setCalcMarginPct(v)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: calcMarginPct === v ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${calcMarginPct === v ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: calcMarginPct === v ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  fontSize: 15, fontWeight: 700,
                  color: calcMarginPct === v ? "white" : "#1a1a1a",
                  userSelect: "none",
                }}
              >
                {v}%
              </div>
            ))}
          </div>
        </div>

        {/* 预留缓冲垫 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>预留缓冲垫</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { val: 0, label: "不预留", sub: "0%" },
              { val: 5, label: "5%", sub: "小额缓冲" },
              { val: 10, label: "10%", sub: "中额缓冲" },
              { val: 15, label: "15%", sub: "大额缓冲" },
            ].map(item => (
              <div
                key={item.val}
                onClick={() => setBufferPct(item.val)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: bufferPct === item.val ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${bufferPct === item.val ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: bufferPct === item.val ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: bufferPct === item.val ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: bufferPct === item.val ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 结算方式 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>结算方式</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { val: "crypto" as const, label: "数字币", sub: "USDT/BTC" },
              { val: "cash" as const, label: "现金", sub: "实物现金" },
              { val: "rmb" as const, label: "转账", sub: "CNY人民币" },
              { val: "foreign" as const, label: "转账", sub: "USD/HKD外币" },
            ].map(item => (
              <div
                key={item.val}
                onClick={() => setSettlementType(item.val)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: settlementType === item.val ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${settlementType === item.val ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: settlementType === item.val ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: settlementType === item.val ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: settlementType === item.val ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 结算频率 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>结算频率</div>
          {/* 一级：到时/倒数 */}
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            {([
              { val: "timed" as const, label: "到时结算", sub: "按时间周期" },
              { val: "countdown" as const, label: "倒数结算", sub: "按盈利金额" },
            ] as const).map(item => (
              <div
                key={item.val}
                onClick={() => setSettlementFreqMode(item.val)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: settlementFreqMode === item.val ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${settlementFreqMode === item.val ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: settlementFreqMode === item.val ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: settlementFreqMode === item.val ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: settlementFreqMode === item.val ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
          {/* 二级子选项 */}
          {settlementFreqMode === "timed" ? (
            <div style={{ display: "flex", gap: 5 }}>
              {([
                { val: "daily" as const, label: "每日", sub: "每个交易日" },
                { val: "weekly" as const, label: "每周", sub: "每周结算一次" },
              ] as const).map(item => (
                <div
                  key={item.val}
                  onClick={() => setTimedFreq(item.val)}
                  style={{
                    flex: 1, padding: "8px 0 9px", textAlign: "center",
                    background: timedFreq === item.val ? "#e8a838" : "#f5f6f8",
                    border: `1px solid ${timedFreq === item.val ? "#d4922a" : "#dde0e8"}`,
                    borderRadius: 8, cursor: "pointer",
                    boxShadow: timedFreq === item.val ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                    transition: "all 0.15s",
                    userSelect: "none",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: timedFreq === item.val ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: timedFreq === item.val ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 5 }}>
              {([10000, 20000, 30000, 50000] as const).map(amt => (
                <div
                  key={amt}
                  onClick={() => setCountdownAmount(amt)}
                  style={{
                    flex: 1, padding: "8px 0 9px", textAlign: "center",
                    background: countdownAmount === amt ? "#e8a838" : "#f5f6f8",
                    border: `1px solid ${countdownAmount === amt ? "#d4922a" : "#dde0e8"}`,
                    borderRadius: 8, cursor: "pointer",
                    boxShadow: countdownAmount === amt ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                    transition: "all 0.15s",
                    userSelect: "none",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: countdownAmount === amt ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{amt / 10000}万</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: countdownAmount === amt ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>盈利达{amt / 10000}万</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 股票板块选择（无股票代码时显示） */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#999", letterSpacing: 0.3, marginBottom: 6 }}>交易品种</div>
          <div style={{ display: "flex", gap: 5 }}>
            {([
              { val: "main" as const, label: "沪深主板", sub: "600/000/002" },
              { val: "gem" as const, label: "创业板", sub: "300/301" },
              { val: "star" as const, label: "科创板", sub: "688" },
              { val: "st" as const, label: "ST股", sub: "ST/*ST" },
            ] as const).map(item => (
              <div
                key={item.val}
                onClick={() => toggleBoard(item.val)}
                style={{
                  flex: 1, padding: "9px 0 10px", textAlign: "center",
                  background: boardTypes.includes(item.val) ? "#e8a838" : "#f5f6f8",
                  border: `1px solid ${boardTypes.includes(item.val) ? "#d4922a" : "#dde0e8"}`,
                  borderRadius: 8, cursor: "pointer",
                  boxShadow: boardTypes.includes(item.val) ? "0 2px 8px rgba(232,168,56,0.45)" : "none",
                  transition: "all 0.15s",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: boardTypes.includes(item.val) ? "white" : "#1a1a1a", lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: boardTypes.includes(item.val) ? "rgba(255,255,255,0.8)" : "#bbb", marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 股票代码输入（单格数组，两格一排） */}
        <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>
          股票代码 <span style={{ fontSize: 11, fontWeight: 400, color: "#aaa" }}>（选填，空着则按上方选中板块计算）</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          {(() => {
            // 将单格数组按每行2个分组渲染
            const rows: React.ReactElement[] = [];
            for (let i = 0; i < calcCells.length; i += 2) {
              const isLastRow = i + 2 >= calcCells.length;
              const rowCells = calcCells.slice(i, i + 2);
              rows.push(
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  {rowCells.map((cell, j) => {
                    const idx = i + j;
                    const hasCode = !!cell.code;
                    const isError = cell.name === null && hasCode;
                    const isFound = !!cell.name;
                    return (
                      <div key={idx} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <div style={{
                          display: "flex", alignItems: "center",
                          background: isError ? "#fff8f8" : isFound ? "#f0fff4" : "#f7f8fa",
                          border: `1px solid ${isError ? "#e53935" : isFound ? "#27ae60" : "#dde0e8"}`,
                          borderRadius: 8, overflow: "hidden", transition: "border-color 0.18s",
                          paddingRight: 20,
                        }}>
                          <input
                            style={{ flex: "0 0 auto", width: 86, padding: "9px 2px 9px 10px", background: "transparent", border: "none", color: "#1a1a2e", fontSize: 14, fontWeight: 700, outline: "none", letterSpacing: 2, fontVariantNumeric: "tabular-nums" }}
                            placeholder="代码"
                            maxLength={6}
                            value={cell.code}
                            onChange={e => handleCalcInput(idx, e.target.value)}
                          />
                          <span style={{
                            fontSize: 13, fontWeight: 600, flexShrink: 0,
                            color: isError ? "#e53935" : isFound ? "#27ae60" : "#bbb",
                            whiteSpace: "nowrap",
                          }}>
                            {isError ? "未找到" : cell.name ?? ""}
                          </span>
                        </div>
                        {/* 格内右上角 × 按鈕 */}
                        <div
                          onClick={() => calcDelCell(idx)}
                          style={{
                            position: "absolute", top: 2, right: 4,
                            width: 16, height: 16,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, color: hasCode ? "#999" : "#ccc", cursor: "pointer", userSelect: "none",
                            lineHeight: 1,
                          }}
                          title="删除"
                        >×</div>
                      </div>
                    );
                  })}
                  {/* 如果这一行只有一个格子，占位符 */}
                  {rowCells.length === 1 && <div style={{ flex: 1 }} />}
                  {/* 最后一行末尾放加号 */}
                  {isLastRow ? (
                    <div
                      onClick={calcAddCell}
                      style={{
                        width: 30, height: 34, flexShrink: 0, background: "#f5f6f8",
                        border: "1px dashed #ccc", borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, color: "#aaa", cursor: "pointer", userSelect: "none",
                      }}
                      title="新增一个"
                    >+</div>
                  ) : (
                    <div style={{ width: 30, flexShrink: 0 }} />
                  )}
                </div>
              );
            }
            return rows;
          })()}
        </div>

        {/* 开始测算按钮 */}
        {(() => {
          const hasAnyCode = calcCells.some(c => c.code);
          const noBoardSelected = !hasAnyCode && boardTypes.length === 0;
          const isDisabled = calcLoading || noBoardSelected;
          return (
            <>
              <button
                onClick={isDisabled ? undefined : calcRun}
                disabled={isDisabled}
                style={{
                  width: "100%", marginTop: 4, padding: "11px 0",
                  background: isDisabled ? "#f5f6f8" : "#1a1a2e",
                  border: "none", borderRadius: 8,
                  color: isDisabled ? "#aaa" : "white",
                  fontSize: 14, fontWeight: 700,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  letterSpacing: 1, transition: "all 0.15s",
                }}
              >
                {calcLoading ? "正在计算中..." : "开始计算"}
              </button>
              {/* 保存/更新方案 */}
              <div style={{ marginTop: 8 }}>
                {/* 当前方案标签 */}
                {currentPlanId !== null && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    marginBottom: 6, padding: "5px 10px",
                    background: "#fffbf0", border: "1px solid #f0d080",
                    borderRadius: 6, fontSize: 12,
                  }}>
                    <span style={{ color: "#b8860b", fontWeight: 600 }}>当前方案：</span>
                    <span style={{ color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentPlanName}</span>
                    <button
                      onClick={() => { setCurrentPlanId(null); setCurrentPlanName(null); }}
                      style={{ background: "none", border: "none", color: "#bbb", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}
                      title="退出编辑模式"
                    >×</button>
                  </div>
                )}
                {!showSaveInput ? (
                  <button
                    onClick={handleSavePlan}
                    style={{
                      width: "100%", padding: "9px 0",
                      background: currentPlanId !== null ? "#fffbf0" : "white",
                      border: `1px solid ${currentPlanId !== null ? "#e8a838" : "#dde0e8"}`,
                      borderRadius: 8,
                      color: currentPlanId !== null ? "#b8860b" : "#555",
                      fontSize: 13, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      if (currentPlanId !== null) {
                        (e.currentTarget as HTMLButtonElement).style.background = "#e8a838";
                        (e.currentTarget as HTMLButtonElement).style.color = "white";
                      } else {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563eb";
                        (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
                      }
                    }}
                    onMouseLeave={e => {
                      if (currentPlanId !== null) {
                        (e.currentTarget as HTMLButtonElement).style.background = "#fffbf0";
                        (e.currentTarget as HTMLButtonElement).style.color = "#b8860b";
                      } else {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#dde0e8";
                        (e.currentTarget as HTMLButtonElement).style.color = "#555";
                      }
                    }}
                  >
                    {saveMsg || (currentPlanId !== null ? "更新方案" : "保存方案")}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      value={savePlanName}
                      onChange={e => setSavePlanName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSavePlan(); if (e.key === "Escape") setShowSaveInput(false); }}
                      placeholder="方案名称（回车保存）"
                      style={{
                        flex: 1, padding: "8px 10px", fontSize: 13,
                        border: "1px solid #2563eb", borderRadius: 8, outline: "none",
                      }}
                    />
                    <button
                      onClick={handleSavePlan}
                      style={{
                        padding: "8px 14px", background: "#2563eb", color: "white",
                        border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {savePlanMutation.isPending ? "保存中..." : (saveMsg || "确认")}
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      style={{
                        padding: "8px 10px", background: "#f5f6f8", color: "#888",
                        border: "1px solid #dde0e8", borderRadius: 8, fontSize: 13, cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* 结果区 */}
        {calcResult && !calcLoading && (
          <div style={{ marginTop: 16, animation: "fadeIn 0.3s ease" }}>
            {(() => {
              const hasAnyCode = calcCells.some(c => c.code);
              if (!hasAnyCode && boardTypes.length > 0) {
                const boardNames: Record<string, string> = { main: "沪深主板", gem: "创业板", star: "科创板", st: "ST股" };
                const label = boardTypes.map(b => boardNames[b] ?? b).join(" + ");
                return (
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#888", textAlign: "center" }}>
                    按 <span style={{ color: "#2563eb", fontWeight: 600 }}>{label}</span> 估算（未填入具体股票代码）
                  </div>
                );
              }
              return null;
            })()}
            <CalcResultBlock result={calcResult} baseRate={calcBaseRate} />
          </div>
        )}
      </div>

      {/* ── 主内容区 ── */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 8px 40px" }}>

        {/* ===== 板块一：保证金管理 ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, background: "#f0fff6", color: "#2d9e6b" }}>I</div>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1a1a1a" }}>保证金管理</h2>
          </div>
        </div>

        {/* 2×2 风险卡片网格 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { id: "risk1" as const, num: 1, label: "风险一", title: "跌停板封死" },
            { id: "risk2" as const, num: 2, label: "风险二", title: "日内换仓叠加跌停" },
            { id: "risk3" as const, num: 3, label: "风险三", title: "收盘后突然停牌" },
            { id: "risk4" as const, num: 4, label: "风险四", title: "收盘后被转ST" },
          ].map(card => (
            <div
              key={card.id}
              onClick={() => setDetailOverlay(card.id)}
              style={{
                background: "white", borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden", cursor: "pointer",
                transition: "box-shadow 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, flexShrink: 0, color: "white",
                  background: card.num <= 2 ? "#e05c5c" : "#e8a838",
                }}>
                  {card.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{card.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{card.title}</div>
                </div>
                <div style={{ fontSize: 18, color: "#ccc", flexShrink: 0 }}>›</div>
              </div>
            </div>
          ))}
        </div>

        {/* 分割线 */}
        <div style={{ height: 1, background: "#e5e7eb", margin: "20px 0" }} />

        {/* ===== 板块二：穿仓问题 ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, background: "#fff0f0", color: "#e05c5c" }}>II</div>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1a1a1a" }}>穿仓问题</h2>
          </div>
        </div>

        {[
          {
            id: "c1", num: 1, label: "穿仓处置", title: "A默认亏损，接受现实",
            content: (
              <>
                <div style={blockStyle("#f0f9ff", "#3b82f6")}>
                  <div style={blockTitleStyle}>A方处境</div>
                  <p style={blockTextStyle}>A承担了真实的财务损失。由于"输了补亏"的保底条款在法律上无效，A深知起诉追讨的胜算极低，且起诉将暴露自身违规出借账户的事实，因此选择财务止损，规避法律风险。</p>
                </div>
                <div style={blockStyle("#fff8f0", "#e8a838")}>
                  <div style={blockTitleStyle}>B方处境</div>
                  <p style={blockTextStyle}>B损失全部保证金。但在此情景下，B的违规代客理财行为未被暴露于监管或司法视野，免于行政处罚（没收违法所得及罚款）或刑事追诉。</p>
                </div>
                <div style={verdictStyle}>
                  <div style={verdictLabelStyle}>综合结论</div>
                  <p style={blockTextStyle}>这是穿仓发生后，对双方综合伤害最小的结局。A以财务损失换取合规安全，B以保证金损失换取免受法律制裁。<span style={tagSafeStyle}>双方损失最小</span></p>
                </div>
              </>
            ),
          },
          {
            id: "c2", num: 2, label: "穿仓处置", title: "A不认亏，选择民事起诉",
            content: (
              <>
                <div style={blockStyle("#f0f9ff", "#3b82f6")}>
                  <div style={blockTitleStyle}>A方处境</div>
                  <ul style={ulStyle}>
                    <li><strong>败诉风险：</strong>根据最高法《九民纪要》第92条，保底条款无效。法院认定A自身存在过错，大概率判决A自行承担损失。</li>
                    <li><strong>合规暴露：</strong>庭审将披露A出借账户的事实，A面临证监局行政罚款，实际执法中通常为 <strong>3万—10万元</strong>。</li>
                  </ul>
                </div>
                <div style={blockStyle("#fff8f0", "#e8a838")}>
                  <div style={blockTitleStyle}>B方处境</div>
                  <ul style={ulStyle}>
                    <li><strong>民事层面：</strong>B大概率无需承担超出保证金的赔偿责任。</li>
                    <li><strong>致命代价：</strong>B代客理财的事实通过法庭记录被坐实，监管部门介入后：<br />
                      — 之前所有分成收益被<strong>全额没收</strong><br />
                      — 并处违法所得1至5倍<strong>罚款</strong><br />
                      — 情节严重者，触犯《刑法》第225条，面临<strong>刑事追诉</strong>
                    </li>
                  </ul>
                </div>
                <div style={verdictStyle}>
                  <div style={verdictLabelStyle}>综合结论</div>
                  <p style={blockTextStyle}>B赢了官司，输了人生。民事胜诉的代价是暴露违规经营事实，引发灾难性的行政与刑事后果。<span style={tagDangerStyle}>B高风险</span></p>
                </div>
              </>
            ),
          },
          {
            id: "c3", num: 3, label: "穿仓处置", title: "A不认亏，选择刑事报案",
            content: (
              <>
                <div style={blockStyle("#f0f9ff", "#3b82f6")}>
                  <div style={blockTitleStyle}>A方处境</div>
                  <p style={blockTextStyle}>A的报案行为等同于自首出借账户，必将面临证监局行政罚款。B被查处后，其财产将优先用于缴纳国家罚金和没收违法所得，A的亏损极难追回。A付出巨大时间精力，面临"交了罚款、钱没追回"的双输局面。</p>
                </div>
                <div style={blockStyle("#fff8f0", "#e8a838")}>
                  <div style={blockTitleStyle}>B方处境</div>
                  <p style={blockTextStyle}>公安机关一旦立案，B将直接面临刑事强制措施（拘留、逮捕）。B的全部银行流水将被倒查，所有代客操盘的盈利将被定性为违法所得。B面临的不再是赔不赔钱的问题，而是量刑轻重的问题。</p>
                </div>
                <div style={verdictStyle}>
                  <div style={verdictLabelStyle}>综合结论</div>
                  <p style={blockTextStyle}>最极端的双输情景。B必须通过严格的仓位控制，极力避免亏损逼近A的心理防线，绝不给A走极端的理由。<span style={tagDangerStyle}>极高风险</span></p>
                </div>
              </>
            ),
          },
          {
            id: "c4", num: 4, label: "B方主动出击", title: "B主张保证金系借款，要求返还",
            content: (
              <>
                <div style={blockStyle("#fff8f0", "#e8a838")}>
                  <div style={blockTitleStyle}>B方处境</div>
                  <ul style={ulStyle}>
                    <li><strong>举证失败：</strong>若微信记录中存在"合作"、"保证金"等字眼，且转账备注为"合作保证金"，法院将驳回B的诉讼请求。</li>
                    <li><strong>自曝其短：</strong>起诉行为同样将合作细节暴露于司法程序，引发与情景二相同的行政及刑事后果。</li>
                  </ul>
                </div>
                <div style={verdictStyle}>
                  <div style={verdictLabelStyle}>综合结论</div>
                  <p style={blockTextStyle}>在铁证面前，主张借款不仅无法挽回财务损失，反而主动引爆自身的法律地雷。这是一条走不通且极其危险的死胡同。<span style={tagDangerStyle}>高风险</span></p>
                </div>
              </>
            ),
          },
          {
            id: "c5", num: 5, label: "B方主动出击", title: "B故意违规操作，损害账户资产",
            content: (
              <>
                <div style={blockStyle("#fff8f0", "#e8a838")}>
                  <div style={blockTitleStyle}>B方处境</div>
                  <p style={blockTextStyle}>B通过故意重仓垃圾股、对倒交易等方式恶意造成账户亏损，此举已跨越民事纠纷边界。A可凭借交易流水、操作时间戳及异常持仓记录向公安机关报案。</p>
                  <ul style={{ ...ulStyle, marginTop: 8 }}>
                    <li>涉嫌《刑法》第275条 <strong>故意毁坏财物罪</strong></li>
                    <li>若涉及利益输送，涉嫌 <strong>诈骗罪</strong> 或 <strong>操纵证券市场罪</strong></li>
                    <li>公安可通过调取远程登录IP及操作日志锁定证据</li>
                  </ul>
                </div>
                <div style={verdictStyle}>
                  <div style={verdictLabelStyle}>综合结论</div>
                  <p style={blockTextStyle}>用键盘报复，换来的是刑事制裁。B的技术优势绝不能用于恶意破坏，否则性质将发生根本性恶化。<span style={tagDangerStyle}>极高风险</span></p>
                </div>
              </>
            ),
          },
        ].map(item => (
          <div
            key={item.id}
            style={{
              background: "white", borderRadius: 12, marginBottom: 10,
              boxShadow: openAccordions[item.id] ? "0 4px 16px rgba(0,0,0,0.1)" : "0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden", transition: "box-shadow 0.2s",
            }}
          >
            <div
              onClick={() => toggleAccordion(item.id)}
              style={{ display: "flex", alignItems: "center", padding: "16px 18px", cursor: "pointer", userSelect: "none", gap: 12 }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, flexShrink: 0, color: "white",
                background: item.num <= 3 ? "#e05c5c" : "#e8a838",
              }}>
                {item.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#999" }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{item.title}</div>
              </div>
              <div style={{ fontSize: 14, color: "#999", transition: "transform 0.2s", transform: openAccordions[item.id] ? "rotate(180deg)" : "none" }}>▼</div>
            </div>
            {openAccordions[item.id] && (
              <div style={{ padding: "0 18px 18px", borderTop: "1px solid #f3f4f6" }}>
                {item.content}
              </div>
            )}
          </div>
        ))}

        {/* 分割线 */}
        <div style={{ height: 1, background: "#e5e7eb", margin: "20px 0" }} />

        {/* ===== 板块三：法律问题 ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, background: "#f0f4ff", color: "#4a90d9" }}>III</div>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1a1a1a" }}>法律问题</h2>
          </div>
        </div>

        <div
          style={{
            background: "white", borderRadius: 12, marginBottom: 10,
            boxShadow: openAccordions["l1"] ? "0 4px 16px rgba(0,0,0,0.1)" : "0 2px 8px rgba(0,0,0,0.06)",
            overflow: "hidden", transition: "box-shadow 0.2s",
          }}
        >
          <div
            onClick={() => toggleAccordion("l1")}
            style={{ display: "flex", alignItems: "center", padding: "16px 18px", cursor: "pointer", userSelect: "none", gap: 12 }}
          >
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, color: "white", background: "#4a90d9" }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#999" }}>法律界定</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>非法集资的认定与本合作的边界</div>
            </div>
            <div style={{ fontSize: 14, color: "#999", transition: "transform 0.2s", transform: openAccordions["l1"] ? "rotate(180deg)" : "none" }}>▼</div>
          </div>
          {openAccordions["l1"] && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid #f3f4f6" }}>
              <div style={blockStyle("#f8f9ff", "#4a90d9")}>
                <div style={blockTitleStyle}>非法集资的法定构成要件</div>
                <p style={blockTextStyle}>根据《防范和处置非法集资条例》，非法集资须同时满足以下四个要件，缺一不可：</p>
                <table style={tableStyle}>
                  <tbody>
                    <tr><th style={thStyle}>要件</th><th style={thStyle}>说明</th></tr>
                    <tr><td style={tdStyle}><strong>非法性</strong></td><td style={tdStyle}>未经批准，擅自向社会募集资金</td></tr>
                    <tr><td style={tdStyle}><strong>公开性</strong></td><td style={tdStyle}>通过媒体、推介会、传单等方式公开宣传</td></tr>
                    <tr><td style={tdStyle}><strong>利诱性</strong></td><td style={tdStyle}>承诺在一定期限内还本付息或给予固定回报</td></tr>
                    <tr><td style={tdStyle}><strong>社会性</strong></td><td style={tdStyle}>向不特定多数人募集资金</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ ...blockStyle("#f8fff8", "#27ae60"), marginTop: 18 }}>
                <div style={blockTitleStyle}>本合作模式的法律边界</div>
                <p style={blockTextStyle}>本合作模式中，A的资金始终存放于A本人的证券账户内，B仅持有账户操作权限，并无任何资金归集行为。以下为本合作与非法集资的逐项对比：</p>
                <table style={{ ...tableStyle, marginTop: 10 }}>
                  <tbody>
                    <tr><th style={thStyle}>认定要件</th><th style={thStyle}>非法集资</th><th style={thStyle}>本合作模式</th></tr>
                    <tr><td style={tdStyle}>资金归集</td><td style={tdStyle}>资金汇入B处，由B统一管理</td><td style={tdStyle}><span style={tagSafeStyle}>资金始终在A账户</span>，B无法提取</td></tr>
                    <tr><td style={tdStyle}>公开宣传</td><td style={tdStyle}>主动向公众推介，招募投资人</td><td style={tdStyle}><span style={tagSafeStyle}>私下一对一协议</span>，无公开宣传</td></tr>
                    <tr><td style={tdStyle}>保底承诺</td><td style={tdStyle}>承诺固定收益或保本</td><td style={tdStyle}><span style={tagSafeStyle}>无保底承诺</span>，盈亏依市场结果分配</td></tr>
                    <tr><td style={tdStyle}>募集对象</td><td style={tdStyle}>面向不特定社会公众</td><td style={tdStyle}><span style={tagSafeStyle}>特定个人</span>，双方系私人合作关系</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={verdictStyle}>
                <div style={verdictLabelStyle}>综合结论</div>
                <p style={blockTextStyle}>非法集资的核心在于"集资"二字——资金必须归集到募集方处。本合作模式中，A的资金始终在A自己的证券账户内，B不持有、不控制任何资金，四项构成要件均不满足，<strong>不构成非法集资</strong>。<span style={tagSafeStyle}>风险极低</span></p>
              </div>
            </div>
          )}
        </div>

        {/* ── 底部建议 ── */}
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          borderRadius: 14, padding: "22px 20px", marginTop: 24,
          color: "white",
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 14 }}>核心操作建议</h3>
          <ol style={{ paddingLeft: 20, lineHeight: 2.2, fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
            <li><strong style={{ color: "#e8a838" }}>理解定价：</strong>充分认知A承担的裸露风险，认可A在保证金及分成上的定价逻辑。</li>
            <li><strong style={{ color: "#e8a838" }}>严控回撤：</strong>将账户亏损牢牢控制在保证金范围内，是阻断一切法律风险的物理隔离墙。</li>
            <li><strong style={{ color: "#e8a838" }}>协商解决：</strong>遇任何争议，协商是成本最低、唯一安全的路径。任何诉诸外部程序的方式，均会将B的违规经营事实暴露于法律程序，引发远超当前争议金额的连带风险。</li>
          </ol>
        </div>

        {/* 底部说明 */}
        <div style={{ textAlign: "center", fontSize: 12, color: "#bbb", marginTop: 24, paddingBottom: 20 }}>
          本文件仅供合作双方参考，不构成正式法律意见
        </div>

      </div>

      {/* ── 详情 Overlay ── */}
      {detailOverlay && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          background: "#f0f2f5", zIndex: 1000, overflowY: "auto", overflowX: "hidden",
        }}>
          {/* 顶部导航 */}
          <div style={{
            background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
            padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
            position: "sticky", top: 0, zIndex: 10,
          }}>
            <button
              onClick={() => setDetailOverlay(null)}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none", color: "white",
                fontSize: 18, width: 36, height: 36, borderRadius: "50%",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >←</button>
            <span style={{ color: "white", fontSize: 16, fontWeight: 600 }}>
              {detailOverlay === "risk1" ? "风险一 · 跌停板封死" :
               detailOverlay === "risk2" ? "风险二 · 日内换仓叠加跌停" :
               detailOverlay === "risk3" ? "风险三 · 收盘后突然停牌" :
               "风险四 · 收盘后被转ST"}
            </span>
          </div>

          <div style={{ padding: "20px 16px 40px", maxWidth: 680, margin: "0 auto" }}>
            {detailOverlay === "risk1" && <Risk1Detail />}
            {detailOverlay === "risk2" && <Risk2Detail />}
            {detailOverlay === "risk3" && <Risk3Detail />}
            {detailOverlay === "risk4" && (
              <Risk4Detail
                rules={rules}
                widgetStocks={widgetStocks}
                widgetBaseRate={widgetBaseRate}
                widgetMarginPct={widgetMarginPct}
                widgetPhase={widgetPhase}
                widgetScanStep={widgetScanStep}
                widgetResult={widgetResult}
                onCodeChange={handleWidgetCodeChange}
                onAddStock={() => setWidgetStocks(prev => prev.length < 10 ? [...prev, { id: ++idCounter, code: "", name: null, loading: false }] : prev)}
                onRemoveStock={(id) => setWidgetStocks(prev => prev.filter(s => s.id !== id))}
                onSetBaseRate={setWidgetBaseRate}
                onSetMarginPct={setWidgetMarginPct}
                onCheck={handleWidgetCheck}
                onReset={resetWidget}
              />
            )}
          </div>
        </div>
      )}

      {/* ── 我的方案弹窗 ── */}
      {showPlansModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowPlansModal(false)}
        >
          <div
            style={{
              background: "white", borderRadius: 14, padding: "24px 20px",
              width: "min(92vw, 400px)", maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>方案</div>
              <button
                onClick={() => setShowPlansModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, color: "#aaa", cursor: "pointer", lineHeight: 1 }}
              >×</button>
            </div>
            {plansQuery.isLoading ? (
              <div style={{ textAlign: "center", color: "#aaa", padding: "20px 0" }}>加载中...</div>
            ) : !plansQuery.data || plansQuery.data.length === 0 ? (
              <div style={{ textAlign: "center", color: "#aaa", padding: "20px 0", fontSize: 13 }}>暂无保存的方案</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plansQuery.data.map((plan: { id: number; name: string; baseRate: number; marginPct: number; boardTypes: string[]; stocks: Array<{ code: string; name: string | null }>; createdAt: Date }) => (
                  <div
                    key={plan.id}
                    style={{
                      border: `1px solid ${currentPlanId === plan.id ? "#e8a838" : "#e8eaee"}`,
                      background: currentPlanId === plan.id ? "#fffbf0" : "white",
                      borderRadius: 10, padding: "12px 14px",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 3 }}>{plan.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          年化 {plan.baseRate}% · 保证金 {plan.marginPct}%
                          {plan.stocks.length > 0 && ` · ${plan.stocks.length} 只股票`}
                        </div>
                        <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
                          {new Date(plan.createdAt).toLocaleDateString("zh-CN")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                        <button
                          onClick={() => handleLoadPlan(plan)}
                          style={{
                            padding: "5px 12px", fontSize: 12, fontWeight: 600,
                            background: currentPlanId === plan.id ? "#e8a838" : "#f5f6f8",
                            color: currentPlanId === plan.id ? "white" : "#555",
                            border: `1px solid ${currentPlanId === plan.id ? "#d4922a" : "#dde0e8"}`,
                            borderRadius: 6, cursor: "pointer",
                          }}
                        >
                          {currentPlanId === plan.id ? "编辑中" : "编辑"}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                          style={{
                            background: "none", border: "none", color: "#ccc", fontSize: 16,
                            cursor: "pointer", padding: "0 4px", lineHeight: 1,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#e53935"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ccc"; }}
                        >×</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 更新方案确认弹窗 */}
      {showUpdateConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowUpdateConfirm(false)}
        >
          <div
            style={{
              background: "white", borderRadius: 14, padding: "24px 22px",
              width: "min(88vw, 340px)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>确认更新方案</div>
            <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7, marginBottom: 18 }}>
              保存后「{currentPlanName}」的原有内容将被覆盖，无法恢复。确认更新？
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleUpdatePlan}
                style={{
                  flex: 1, padding: "9px 0", background: "#e8a838",
                  border: "none", borderRadius: 8, color: "white",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {updatePlanMutation.isPending ? "更新中..." : "确认更新"}
              </button>
              <button
                onClick={() => setShowUpdateConfirm(false)}
                style={{
                  flex: 1, padding: "9px 0", background: "#f5f6f8",
                  border: "1px solid #dde0e8", borderRadius: 8, color: "#555",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aiPulse { 0%,100% { opacity: 1; box-shadow: 0 0 8px rgba(245,158,11,0.9); } 50% { opacity: 0.4; box-shadow: none; } }
        @keyframes btnShine { from { left: -60%; } to { left: 120%; } }
        @keyframes scanDot { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
      `}</style>
    </div>
  );
}

// ─── 样式常量 ────────────────────────────────────────────────────

const blockStyle = (bg: string, borderColor: string): React.CSSProperties => ({
  background: bg, borderLeft: `3px solid ${borderColor}`,
  padding: "12px 14px", borderRadius: 6, marginTop: 12,
});
const blockTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6 };
const blockTextStyle: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.8 };
const ulStyle: React.CSSProperties = { paddingLeft: 18, lineHeight: 2, fontSize: 14, color: "#444" };
const verdictStyle: React.CSSProperties = {
  background: "#f8f9ff", border: "1px solid #dde5ff",
  borderRadius: 8, padding: "12px 14px", marginTop: 12,
};
const verdictLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#4a90d9", letterSpacing: 0.5, marginBottom: 6 };
const tagSafeStyle: React.CSSProperties = {
  display: "inline-block", background: "#f0fff4", color: "#27ae60",
  border: "1px solid #b7f5c8", borderRadius: 4, padding: "1px 7px", fontSize: 12, marginLeft: 4,
};
const tagDangerStyle: React.CSSProperties = {
  display: "inline-block", background: "#fff5f5", color: "#e05c5c",
  border: "1px solid #ffd0d0", borderRadius: 4, padding: "1px 7px", fontSize: 12, marginLeft: 4,
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10,
};
const thStyle: React.CSSProperties = {
  background: "#f5f5f5", padding: "7px 8px", textAlign: "left",
  borderBottom: "1px solid #e8eaee", fontWeight: 600, color: "#555",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 8px", borderBottom: "1px solid #f0f1f4", color: "#444", verticalAlign: "top",
};

// ─── 利息测算结果块 ───────────────────────────────────────────────

function CalcResultBlock({ result, baseRate }: { result: CheckResult; baseRate: number }) {
  const sorted = [...result.results].sort((a, b) => (b.account_rate || baseRate) - (a.account_rate || baseRate));
  const worstStock = sorted[0];
  if (!worstStock) return null;
  const maxRate = worstStock.account_rate || baseRate;
  const totalAdd = Math.round((maxRate - baseRate) * 100) / 100;
  const rateColor = totalAdd === 0 ? "#27ae60" : totalAdd <= 3 ? "#e8a838" : "#e53935";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>应执行年化利率</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: rateColor, lineHeight: 1 }}>{maxRate.toFixed(2)}%</div>
        </div>
        <div style={{ fontSize: 13, color: "#888", textAlign: "right" }}>
          基础 {baseRate}%{totalAdd > 0 ? ` + 风险加息 +${totalAdd}%` : " · 无风险加息"}
        </div>
      </div>
      {result.results.length > 1 && (
        <div style={{ fontSize: 11, color: "#e53935", fontWeight: 600, marginBottom: 8, padding: "5px 8px", background: "#fff5f5", borderRadius: 5, borderLeft: "3px solid #e53935" }}>
          以风险最高的 <strong>{worstStock.name || worstStock.ts_code}</strong> 为准，共测算 {result.results.length} 只股票
        </div>
      )}
      {/* 最高风险股票详情 */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>{worstStock.name || worstStock.ts_code} <span style={{ color: "#bbb", fontWeight: 400 }}>{worstStock.ts_code}</span></span>
          <span style={{ color: totalAdd > 0 ? "#e53935" : "#27ae60", fontWeight: 700 }}>{totalAdd > 0 ? `+${totalAdd}%` : "无加息"}</span>
        </div>
        {worstStock.all_rules?.map(rule => (
          <div key={rule.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #f0f1f4", fontSize: 12 }}>
            <span style={{ color: rule.hit ? "#e53935" : "#aaa" }}>
              {rule.hit ? "✗" : "✓"} {rule.name}
              {rule.hit && rule.detail && <><br /><span style={{ fontSize: 10.5, fontWeight: 400, color: "#e53935" }}>{rule.detail}</span></>}
            </span>
            <span style={{ color: rule.hit ? "#e53935" : "#ccc", fontWeight: rule.hit ? 700 : 400 }}>{rule.hit ? `+${rule.add_rate}%` : "通过"}</span>
          </div>
        ))}
      </div>
      {/* 多只股票排序 */}
      {sorted.length > 1 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e8eaee" }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>全部股票风险排序</div>
          {sorted.map(s => {
            const add = Math.round((s.account_rate - baseRate) * 100) / 100;
            const isWorst = s.ts_code === worstStock.ts_code;
            return (
              <div key={s.ts_code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, borderBottom: "1px solid #f0f1f4" }}>
                <span style={{ color: isWorst ? "#e53935" : "#555", fontWeight: isWorst ? 700 : 400 }}>
                  {isWorst ? "⚠️ " : ""}{s.name || s.ts_code} <span style={{ color: "#bbb" }}>{s.ts_code}</span>
                </span>
                <span style={{ fontWeight: 700, color: add > 0 ? "#e53935" : "#27ae60" }}>{add > 0 ? `+${add}%` : "无加息"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 风险一详情 ───────────────────────────────────────────────────

function Risk1Detail() {
  return (
    <>
      <div style={blockStyle("#f8f8f8", "#e05c5c")}>
        <div style={blockTitleStyle}>风险描述</div>
        <p style={blockTextStyle}>股票封死跌停时，大量卖单堆积但买盘极少，实际无法成交。B即便想止损也无法卖出。若B已穿仓宣告放弃，但股票仍封在跌停板上，次日开盘若继续跌停，损失持续叠加，保证金补足机制完全失效。A股历史上最长连续跌停记录为<strong>18个交易日</strong>，期间持仓者完全无法减仓。</p>
      </div>
      <div style={{ ...blockStyle("#f0f4ff", "#4a90d9"), marginTop: 12 }}>
        <div style={blockTitleStyle}>2025年真实数据（来源：Tushare/交易所）</div>
        <table style={tableStyle}>
          <tbody>
            <tr><th style={thStyle}>指标</th><th style={thStyle}>数据</th></tr>
            <tr><td style={tdStyle}>全年跌停总股次</td><td style={tdStyle}><strong>4,945 次</strong></td></tr>
            <tr><td style={tdStyle}>日均跌停数量</td><td style={tdStyle}><strong>22.2 只</strong></td></tr>
            <tr><td style={tdStyle}>单日最多跌停</td><td style={tdStyle}><strong style={{ color: "#e05c5c" }}>2,804 只</strong>（2025/04/07 关税战）</td></tr>
            <tr><td style={tdStyle}>跌停≥100只的交易日</td><td style={tdStyle}><strong>2 天</strong></td></tr>
            <tr><td style={tdStyle}>跌停≥50只的交易日</td><td style={tdStyle}><strong>5 天</strong></td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 10, fontSize: 13.5, color: "#888" }}>2025年4月7日（关税战黑色星期一），全市场2,804只股票同日跌停，创A股历史单日跌停数量纪录，超过2020年2月3日的3,000只（彼时市场规模更小）。</p>
      </div>
      <div style={{ ...blockStyle("#fff8f0", "#e8a838"), marginTop: 12 }}>
        <div style={{ ...blockTitleStyle, color: "#c07820" }}>高风险触发场景</div>
        <p style={blockTextStyle}>停牌复牌后的重大利空、业绩暴雷、监管处罚公告、实控人被查。这类情况下跌停板封死概率最高，且往往连续多日。</p>
      </div>
      <div style={verdictStyle}>
        <div style={verdictLabelStyle}>管控方案</div>
        <ul style={ulStyle}>
          <li>禁止持有<strong>小市值、高质押</strong>的高风险股票</li>
          <li>禁止持有<strong>有历史连续跌停记录</strong>的股票</li>
          <li>合作条款中应明确约定<strong>持仓品种白名单</strong>，超出范围即触发补足保证金义务</li>
        </ul>
      </div>
    </>
  );
}

// ─── 风险二详情 ───────────────────────────────────────────────────

function Risk2Detail() {
  return (
    <>
      <div style={blockStyle("#f8f8f8", "#e05c5c")}>
        <div style={blockTitleStyle}>风险描述</div>
        <p style={blockTextStyle}>当日持仓股跌停，割肉卖出确认亏损。随后在同一天追入已涨停的新股票（以涨停价买入，溢价损失已包含其中）。由于A股T+1制度，当天买入的股票当天不能卖出。当天收盘时新买入的涨停股反转跌停，无法止损。三个涨跌幅叠加，当日账户实际亏损可达：</p>
        <ul style={{ ...ulStyle, marginTop: 8 }}>
          <li><strong>10cm票（主板普通股）</strong>：单日亏损约 <strong style={{ color: "#e05c5c" }}>-30%</strong></li>
          <li><strong>20cm票（科创板/创业板）</strong>：单日亏损约 <strong style={{ color: "#e05c5c" }}>-60%</strong></li>
        </ul>
      </div>
      <div style={{ ...blockStyle("#f0f4ff", "#4a90d9"), marginTop: 12 }}>
        <div style={blockTitleStyle}>保证金覆盖情况（以100万本金为例）</div>
        <table style={tableStyle}>
          <tbody>
            <tr><th style={thStyle}>保证金</th><th style={thStyle}>10cm结果</th><th style={thStyle}>20cm结果</th></tr>
            <tr><td style={tdStyle}>5%（5万）</td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -25万</span></td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -55万</span></td></tr>
            <tr><td style={tdStyle}>10%（10万）</td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -20万</span></td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -50万</span></td></tr>
            <tr><td style={tdStyle}>20%（20万）</td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -10万</span></td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -40万</span></td></tr>
          </tbody>
        </table>
      </div>
      <div style={verdictStyle}>
        <div style={verdictLabelStyle}>管控方案</div>
        <ul style={ulStyle}>
          <li><strong>禁止当日割肉后再追涨停板</strong>，该操作将导致单日亏损叠加</li>
          <li>建议单日最大回撤不超过<strong>5%</strong>，达到阈值即停止操作并通知A方</li>
          <li>科创板/创业板的高弹性股票需提高保证金比例，否则单日极端情景下保证金将完全失效</li>
        </ul>
      </div>
    </>
  );
}

// ─── 风险三详情 ───────────────────────────────────────────────────

function Risk3Detail() {
  return (
    <>
      <div style={blockStyle("#f8f8f8", "#e05c5c")}>
        <div style={blockTitleStyle}>风险描述</div>
        <p style={blockTextStyle}>B正常持有某股票，公司在收盘后公告重大事项停牌（重组、被查、资金链断裂等）。停牌公告均为<strong>盘后发布</strong>，B当天操作完全正常，收盘后才知晓。停牌期间完全无法卖出。复牌后若遇重大利空，股票连续封死跌停，保证金补足机制在此期间完全失效。</p>
        <table style={{ ...tableStyle, marginTop: 10 }}>
          <tbody>
            <tr><th style={thStyle}>指标</th><th style={thStyle}>2025年真实数据</th></tr>
            <tr><td style={tdStyle}>全年全天停牌总次数</td><td style={tdStyle}><strong>3,441 次</strong></td></tr>
            <tr><td style={tdStyle}>日均停牌数量</td><td style={tdStyle}><strong>14.3 只</strong></td></tr>
            <tr><td style={tdStyle}>单日最多停牌</td><td style={tdStyle}><strong style={{ color: "#e05c5c" }}>54 只</strong>（2025/04/29，年报披露高峰）</td></tr>
            <tr><td style={tdStyle}>盘中临时停牌（科创/创业板）</td><td style={tdStyle}><strong>39 次</strong>，涉及37只股票</td></tr>
            <tr><td style={tdStyle}>停牌最集中月份</td><td style={tdStyle}><strong>4、5月（年报季）</strong>，共505次</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8, fontSize: 13.5, color: "#888" }}>数据来源：Tushare Pro（上交所/深交所官方数据）</p>
      </div>
      <div style={{ ...blockStyle("#f0f4ff", "#4a90d9"), marginTop: 12 }}>
        <div style={blockTitleStyle}>保证金覆盖情况（连续三日跌停）</div>
        <table style={tableStyle}>
          <tbody>
            <tr><th style={thStyle}>保证金</th><th style={thStyle}>三日亏损</th><th style={thStyle}>结果</th></tr>
            <tr><td style={tdStyle}>10%（10万）</td><td style={tdStyle}>27万</td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -17万</span></td></tr>
            <tr><td style={tdStyle}>20%（20万）</td><td style={tdStyle}>27万</td><td style={tdStyle}><span style={tagDangerStyle}>穿仓 -7万</span></td></tr>
            <tr><td style={tdStyle}>30%（30万）</td><td style={tdStyle}>27万</td><td style={tdStyle}><span style={tagSafeStyle}>覆盖，剩余3万</span></td></tr>
          </tbody>
        </table>
      </div>
      <div style={verdictStyle}>
        <div style={verdictLabelStyle}>管控方案</div>
        <p style={blockTextStyle}>停牌风险无法完全预防，但可通过以下持仓标准降低概率：</p>
        <ul style={ulStyle}>
          <li>禁止持有<strong>总市值低于30亿</strong>的小盘股过夜</li>
          <li>禁止持有<strong>大股东质押比例超过70%</strong>的股票</li>
          <li>禁止持有<strong>近期收到监管问询函或立案调查</strong>的股票</li>
        </ul>
      </div>
    </>
  );
}

// ─── 风险四详情（含 AI 检测工具）────────────────────────────────────

interface Risk4Props {
  rules: RuleItem[];
  widgetStocks: StockInput[];
  widgetBaseRate: number;
  widgetMarginPct: number;
  widgetPhase: "input" | "scanning" | "result";
  widgetScanStep: string;
  widgetResult: CheckResult | null;
  onCodeChange: (id: number, code: string) => void;
  onAddStock: () => void;
  onRemoveStock: (id: number) => void;
  onSetBaseRate: (v: number) => void;
  onSetMarginPct: (v: number) => void;
  onCheck: () => void;
  onReset: () => void;
}

function Risk4Detail(props: Risk4Props) {
  const { rules, widgetStocks, widgetBaseRate, widgetMarginPct, widgetPhase, widgetScanStep, widgetResult, onCodeChange, onAddStock, onRemoveStock, onSetBaseRate, onSetMarginPct, onCheck, onReset } = props;

  return (
    <>
      <div style={blockStyle("#f8f8f8", "#e05c5c")}>
        <div style={blockTitleStyle}>风险描述</div>
        <p style={blockTextStyle}>公司因连续两年亏损、净资产为负等原因，在每年4月底年报披露截止日前后<strong>收盘后公告被转ST</strong>。B当天操作完全正常，收盘后才知晓次日起股票变ST。次日开盘即遇大量抛盘，股价大幅低开，B无法提前止损。</p>

        {/* 10年概率表 */}
        <div style={{ marginTop: 10, marginBottom: 6, fontSize: 12, color: "#666", fontWeight: 600, letterSpacing: 0.5 }}>▶ 2015–2025年戴帽与退市概率（来源：Tushare Pro）</div>
        <table style={{ ...tableStyle, fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>年份</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>股票池</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>戴帽数</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>戴帽率</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>退市数</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "5px 2px" }}>退市率</th>
            </tr>
          </thead>
          <tbody>
            {[
              { year: "2025", pool: "5,470", hat: "129", hatRate: "2.36%", delist: "29", delistRate: "0.53%", highlight: true },
              { year: "2024", pool: "5,375", hat: "96", hatRate: "1.79%", delist: "52", delistRate: "0.97%", highlight: false },
              { year: "2023", pool: "5,342", hat: "66", hatRate: "1.24%", delist: "45", delistRate: "0.84%", highlight: false },
              { year: "2022", pool: "4,909", hat: "60", hatRate: "1.22%", delist: "46", delistRate: "0.94%", highlight: false },
              { year: "2021", pool: "4,627", hat: "74", hatRate: "1.60%", delist: "20", delistRate: "0.43%", highlight: false },
              { year: "2020", pool: "4,164", hat: "109", hatRate: "2.62%", delist: "16", delistRate: "0.38%", highlight: false },
              { year: "2019", pool: "3,769", hat: "86", hatRate: "2.28%", delist: "10", delistRate: "0.27%", highlight: false },
              { year: "2018", pool: "3,576", hat: "54", hatRate: "1.51%", delist: "5", delistRate: "0.14%", highlight: false },
              { year: "2017", pool: "3,477", hat: "58", hatRate: "1.67%", delist: "5", delistRate: "0.14%", highlight: false },
              { year: "2016", pool: "3,071", hat: "60", hatRate: "1.95%", delist: "1", delistRate: "0.03%", highlight: false },
              { year: "2015", pool: "2,827", hat: "46", hatRate: "1.63%", delist: "7", delistRate: "0.25%", highlight: false },
            ].map(row => (
              <tr key={row.year} style={{ background: row.highlight ? "#fff3f3" : undefined }}>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}><strong>{row.year}</strong></td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>{row.pool}</td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}><strong>{row.hat}</strong></td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px", color: "#c0392b" }}><strong>{row.hatRate}</strong></td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>{row.delist}</td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px", color: "#888" }}>{row.delistRate}</td>
              </tr>
            ))}
            <tr style={{ background: "#f0f4ff", fontWeight: 600 }}>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>11年均</td>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>—</td>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>—</td>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px", color: "#c0392b" }}>1.81%</td>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px" }}>—</td>
              <td style={{ ...tdStyle, textAlign: "center", padding: "5px 2px", color: "#e05c5c" }}>0.45%</td>
            </tr>
          </tbody>
        </table>

        {/* A方风险量化 */}
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#fff8f0", borderRadius: 8, borderLeft: "3px solid #e8a838" }}>
          <div style={{ fontSize: 13, color: "#c07820", fontWeight: 700, marginBottom: 8 }}>ℹ️ A方实际承担的风险量化</div>
          <p style={{ fontSize: 13, color: "#555", margin: "0 0 6px", lineHeight: 1.75 }}>
            随机购买一只股票，年内被戴帽ST的概率平均为 <strong style={{ color: "#c0392b" }}>1.81%</strong>，退市概率平均为 <strong style={{ color: "#c0392b" }}>0.45%</strong>。两者叠加，A方每年面对"持仓股票出现戴帽或退市"的概率约为 <strong style={{ color: "#c0392b" }}>2.26%</strong>。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0" }}>
            {[
              { title: "B 全仓持某股 · 戴帽后连跌 3 日", prob: "1.81%", loss: "27%", years: "2.25年" },
              { title: "B 半仓持某股 · 戴帽后连跌 3 日", prob: "1.81%", loss: "13.5%", years: "1.13年" },
              { title: "B 全仓持某股 · 直接退市清盘", prob: "0.45%", loss: "80%+", years: "6.7年", danger: true },
            ].map(s => (
              <div key={s.title} style={{ background: s.danger ? "#fff0f0" : "#fff5f5", border: `1px solid ${s.danger ? "#e8a0a0" : "#f0c0c0"}`, borderRadius: 7, padding: "10px 12px" }}>
                <div style={{ fontSize: 12.5, color: "#444", fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ label: "命中概率", val: s.prob }, { label: "A单次损失", val: s.loss, sub: "本金" }, { label: "年利12% 相当于", val: s.years, sub: "利息才能弥补" }].map((cell, ci) => (
                    <div key={ci} style={{ flex: ci === 2 ? 1.4 : 1, background: "white", borderRadius: 5, padding: "7px 6px", textAlign: "center", border: `1px solid ${s.danger ? "#f0c0c0" : "#f5d5d5"}` }}>
                      <div style={{ fontSize: 10.5, color: "#999", marginBottom: 2 }}>{cell.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#c0392b" }}>{cell.val}</div>
                      {cell.sub && <div style={{ fontSize: 10, color: "#aaa" }}>{cell.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff3cd", borderRadius: 5, fontSize: 12.5, color: "#7a5c00", lineHeight: 1.7 }}>
            <strong>结论：</strong>A方收取的利息，实质上是在代B承担"戴帽ST与退市"这类不可预知的尾部风险。每年有近1.81%的概率遇到戴帽事件，一旦命中，A的单次损失可达本金的<strong>13–27%</strong>，远超全年利息收入。利息不是白收的，更不是任意提高的——它是对这种不对称风险的定价补偿，也正是影响利率、维持双方能长期稳定合作的重要原因。
          </div>
        </div>
      </div>

      {/* 利率加成测算表 */}
      <div style={verdictStyle}>
        <div style={verdictLabelStyle}>持有高风险品种的利率加成测算（期望损失补偿模型）</div>
        <p style={{ fontSize: 12.5, color: "#888", margin: "4px 0 10px" }}>公式：加息幅度 = 命中概率 × 全仓损失率（使 A 方长期收支平衡的最低风险补偿）</p>
        <table style={{ ...tableStyle, fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ ...thStyle, textAlign: "left", padding: "7px 8px" }}>持仓品种</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "7px 4px" }}>命中概率</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "7px 4px" }}>全仓损失</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "7px 4px" }}>需加息</th>
              <th style={{ ...thStyle, textAlign: "center", padding: "7px 4px" }}>建议利率</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#aaa", padding: 12 }}>加载中…</td></tr>
            ) : rules.map(r => {
              const levelBg = r.level === "extreme" ? "#ffe8e8" : r.level === "high" ? "#fff5f5" : r.level === "mid" ? "#fff8f8" : "";
              const levelColor = r.level !== "base" ? "#c0392b" : "#888";
              const bold = r.level !== "base";
              const wrap = (v: string) => bold ? <strong>{v}</strong> : <>{v}</>;
              if (r.is_dynamic) {
                return (
                  <tr key={r.id} style={{ background: levelBg }}>
                    <td style={{ padding: "7px 8px", color: "#444" }}>{r.name}<br /><span style={{ fontSize: 11, color: "#aaa" }}>{r.desc}</span></td>
                    <td style={{ textAlign: "center", padding: "7px 4px", color: "#aaa", fontSize: 11 }}>随保证金<br />比例变化</td>
                    <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor }}>{wrap("本金100%")}</td>
                    <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor, fontSize: 11 }}>
                      <span style={{ color: "#ff6b6b" }}>10cm+5%: +3.12%</span><br />
                      <span style={{ color: "#ff9800" }}>10cm+10%: +1.56%</span><br />
                      <span style={{ color: "#ff6b6b" }}>20cm+5%: +6.24%</span><br />
                      <span style={{ color: "#ff9800" }}>20cm+10%: +3.12%</span>
                    </td>
                    <td style={{ textAlign: "center", padding: "7px 4px", color: "#aaa", fontSize: 11 }}>随选择<br />动态计算</td>
                  </tr>
                );
              }
              return (
                <tr key={r.id} style={{ background: levelBg }}>
                  <td style={{ padding: "7px 8px", color: "#444" }}>
                    {r.name}
                    {r.threshold_label && <><br /><span style={{ fontSize: 11, color: "#aaa" }}>{r.threshold_label}</span></>}
                  </td>
                  <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor }}>{wrap((r.prob ?? 0) + "%")}</td>
                  <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor }}>{wrap((r.loss ?? 0) + "%")}</td>
                  <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor }}>{wrap("+" + (r.add_rate ?? 0) + "%")}</td>
                  <td style={{ textAlign: "center", padding: "7px 4px", color: levelColor }}>{wrap((r.suggest_rate ?? 0) + "%")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: "#999", marginTop: 8, lineHeight: 1.6 }}>• 命中概率来源：Tushare Pro 2015–2025年实际数据推算。全仓损失率基于戴帽后连跌3日／退市清盘历史均值。建议利率为长期收支平衡的最低阈值，实际谈判可在此基础上加1–2%作为风险溢价缓冲。</p>
      </div>

      {/* AI 检测工具 */}
      <div style={{ marginTop: 20 }}>
        <AICheckerWidget
          stocks={widgetStocks}
          baseRate={widgetBaseRate}
          marginPct={widgetMarginPct}
          phase={widgetPhase}
          scanStep={widgetScanStep}
          result={widgetResult}
          onCodeChange={onCodeChange}
          onAddStock={onAddStock}
          onRemoveStock={onRemoveStock}
          onSetBaseRate={onSetBaseRate}
          onSetMarginPct={onSetMarginPct}
          onCheck={onCheck}
          onReset={onReset}
        />
      </div>
    </>
  );
}

// ─── AI 检测工具组件 ──────────────────────────────────────────────

interface AICheckerProps {
  stocks: StockInput[];
  baseRate: number;
  marginPct: number;
  phase: "input" | "scanning" | "result";
  scanStep: string;
  result: CheckResult | null;
  onCodeChange: (id: number, code: string) => void;
  onAddStock: () => void;
  onRemoveStock: (id: number) => void;
  onSetBaseRate: (v: number) => void;
  onSetMarginPct: (v: number) => void;
  onCheck: () => void;
  onReset: () => void;
}

function AICheckerWidget(props: AICheckerProps) {
  const { stocks, baseRate, marginPct, phase, scanStep, result, onCodeChange, onAddStock, onRemoveStock, onSetBaseRate, onSetMarginPct, onCheck, onReset } = props;

  return (
    <div style={{
      background: "#0a0e1a", borderRadius: 16, color: "white",
      border: "1px solid rgba(245,158,11,0.2)",
      boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.05)",
      overflow: "hidden",
    }}>
      {/* 顶部金色进度条 */}
      <div style={{
        height: 3,
        background: "linear-gradient(90deg,transparent,rgba(245,158,11,0.5),rgba(245,158,11,1),rgba(245,158,11,0.5),transparent)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: "-60%", width: "40%", height: "100%",
          background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)",
          animation: "btnShine 2s linear infinite",
        }} />
      </div>

      {/* 头部 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px 11px", borderBottom: "1px solid rgba(245,158,11,0.08)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10, color: "rgba(245,158,11,0.9)", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", animation: "aiPulse 1.4s ease-in-out infinite", boxShadow: "0 0 8px rgba(245,158,11,0.9)", display: "inline-block" }} />
          AI RISK ENGINE
        </div>
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.2)", letterSpacing: 1 }}>READY</div>
      </div>

      {/* 内容区 */}
      <div style={{ padding: "18px 18px 20px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 3 }}>持仓股票利率测算</div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)", marginBottom: 18, lineHeight: 1.65 }}>
          输入持仓股票代码，系统自动分析风险特征并输出应执行利率。不管持几只，只要有一只命中，全账按最高利率执行。
        </div>

        {phase !== "result" && (
          <>
            {/* 基础年化利率 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>基础年化利率</div>
              <div style={{ display: "flex", gap: 5 }}>
                {[12, 18, 24, 36].map(v => (
                  <div
                    key={v}
                    onClick={() => onSetBaseRate(v)}
                    style={{
                      flex: 1, padding: "8px 0", textAlign: "center", borderRadius: 6,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${baseRate === v ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.07)"}`,
                      background: baseRate === v ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.03)",
                      color: baseRate === v ? "#f59e0b" : "rgba(255,255,255,0.3)",
                      boxShadow: baseRate === v ? "0 0 14px rgba(245,158,11,0.15),inset 0 1px 0 rgba(245,158,11,0.1)" : "none",
                      transition: "all 0.18s cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    {v}%
                  </div>
                ))}
              </div>
            </div>

            {/* 保证金比例 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>保证金比例</div>
              <div style={{ display: "flex", gap: 5 }}>
                {[5, 10, 15, 20].map(v => (
                  <div
                    key={v}
                    onClick={() => onSetMarginPct(v)}
                    style={{
                      flex: 1, padding: "8px 0", textAlign: "center", borderRadius: 6,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${marginPct === v ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.07)"}`,
                      background: marginPct === v ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.03)",
                      color: marginPct === v ? "#f59e0b" : "rgba(255,255,255,0.3)",
                      transition: "all 0.18s cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    {v}%
                  </div>
                ))}
              </div>
            </div>

            {/* 股票输入 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {stocks.map((s, idx) => (
                <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder={idx === 0 ? "输入股票代码，如 600519" : "输入股票代码"}
                    value={s.code}
                    onChange={e => onCodeChange(s.id, e.target.value)}
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8,
                      padding: "10px 13px", color: "white", fontSize: 14, outline: "none",
                      fontFamily: "inherit", letterSpacing: 0.5,
                    }}
                  />
                  {s.name !== null && s.name !== "" && (
                    <span style={{ fontSize: 12, color: "#48bb78", whiteSpace: "nowrap" }}>{s.name}</span>
                  )}
                  {stocks.length > 1 && (
                    <button
                      onClick={() => onRemoveStock(s.id)}
                      style={{
                        width: 32, height: 32, borderRadius: 6, background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.28)",
                        fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>

            {stocks.length < 10 && (
              <button
                onClick={onAddStock}
                style={{
                  width: "100%", padding: 9, background: "transparent",
                  border: "1px dashed rgba(255,255,255,0.09)", borderRadius: 8,
                  color: "rgba(255,255,255,0.22)", fontSize: 12, cursor: "pointer",
                  marginBottom: 14, letterSpacing: 0.5, transition: "all 0.18s",
                }}
              >+ 添加更多股票</button>
            )}

            {/* 检测按钮 */}
            <button
              onClick={onCheck}
              disabled={phase === "scanning"}
              style={{
                width: "100%", padding: 13,
                background: "linear-gradient(135deg,rgba(245,158,11,0.92),rgba(180,83,9,0.96))",
                border: "none", borderRadius: 10, color: "#0a0e1a",
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                letterSpacing: 2, boxShadow: "0 4px 20px rgba(245,158,11,0.35)",
                transition: "transform 0.12s, box-shadow 0.12s",
              }}
            >
              开始检测
            </button>
          </>
        )}

        {/* 扫描动画 */}
        {phase === "scanning" && (
          <div style={{ padding: "20px 0 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 3, marginBottom: 16 }}>
              {Array.from({ length: 32 }, (_, i) => (
                <div key={i} style={{
                  height: 20, borderRadius: 2,
                  background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 6.5, color: "rgba(245,158,11,0.4)" }}>{(Math.random() * 99 + 1).toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>
                ANALYZING<span style={{ animation: "scanDot 1s 0s infinite" }}> ·</span><span style={{ animation: "scanDot 1s 0.3s infinite" }}>·</span><span style={{ animation: "scanDot 1s 0.6s infinite" }}>·</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{scanStep}</div>
            </div>
          </div>
        )}

        {/* 结果区 */}
        {phase === "result" && result && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, marginBottom: 4 }}>ACCOUNT RATE · 账户应执行年化利率</div>
              <div style={{
                fontSize: 48, fontWeight: 900, lineHeight: 1,
                color: result.account_add === 0 ? "#48bb78" : result.account_add <= 1.5 ? "#f59e0b" : "#fc8181",
              }}>
                {result.account_rate.toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                {result.account_add === 0
                  ? "持仓品种无风险项命中，按基础利率执行"
                  : `基础 ${baseRate}% ＋ 风险加息 +${result.account_add.toFixed(2)}%`}
              </div>
            </div>

            {result.results.map((stock, si) => {
              if (stock.error) return (
                <div key={si} style={{ background: "rgba(252,129,129,0.08)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ color: "#fc8181", fontSize: 13 }}>⚠️ {stock.error}</div>
                </div>
              );
              const hasHit = stock.hits && stock.hits.length > 0;
              const accountRate = stock.account_rate || baseRate;
              const totalAdd = stock.total_add || 0;
              return (
                <div key={si} style={{
                  background: hasHit ? "rgba(252,129,129,0.06)" : "rgba(72,187,120,0.05)",
                  border: `1px solid ${hasHit ? "rgba(252,129,129,0.2)" : "rgba(72,187,120,0.15)"}`,
                  borderRadius: 10, padding: "12px 14px", marginBottom: 10,
                  animation: `fadeIn 0.3s ${si * 0.12}s ease both`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{stock.name}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>{stock.ts_code}</span>
                      {(stock.market_cap_yi || stock.pledge_ratio) && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                          {stock.market_cap_yi ? `市值 ${stock.market_cap_yi}亿` : ""}
                          {stock.market_cap_yi && stock.pledge_ratio ? "｜" : ""}
                          {stock.pledge_ratio ? `质押 ${stock.pledge_ratio}%` : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: hasHit ? "#fc8181" : "#48bb78", lineHeight: 1 }}>{accountRate.toFixed(2)}%</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>应执行利率</div>
                    </div>
                  </div>

                  {/* 逐项检测 */}
                  {stock.all_rules?.map((rule, ri) => {
                    const isHit = rule.hit;
                    const levelColor = rule.level === "high" || rule.level === "extreme" ? "#fc8181" : "#f59e0b";
                    return (
                      <div key={rule.id} style={{
                        display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        animation: `fadeIn 0.2s ${(si * (stock.all_rules?.length ?? 0) + ri) * 0.08}s ease both`,
                      }}>
                        <span style={{ fontSize: 12, color: isHit ? levelColor : "#48bb78", flexShrink: 0, marginTop: 1 }}>{isHit ? "✗" : "✓"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: isHit ? levelColor : "rgba(255,255,255,0.5)", fontWeight: isHit ? 600 : 400 }}>{rule.name}</div>
                          {isHit && rule.detail && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{rule.detail}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: isHit ? levelColor : "rgba(255,255,255,0.25)", fontWeight: isHit ? 700 : 400, flexShrink: 0 }}>
                          {isHit ? `+${rule.add_rate}%` : "通过"}
                        </span>
                      </div>
                    );
                  })}

                  {/* 利率汇总 */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginTop: 8, padding: "8px 10px", borderRadius: 6,
                    background: hasHit ? "rgba(252,129,129,0.08)" : "rgba(72,187,120,0.06)",
                    border: `1px solid ${hasHit ? "rgba(252,129,129,0.25)" : "rgba(72,187,120,0.2)"}`,
                  }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flex: 1, minWidth: 0 }}>
                      {hasHit ? `基础 ${baseRate}% ＋ 风险加息 +${totalAdd}%` : "所有风险项均通过检测"}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: hasHit ? "#f59e0b" : "#48bb78", whiteSpace: "nowrap" }}>
                      {accountRate.toFixed(2)}%
                    </span>
                  </div>

                  {/* 强平提示 */}
                  {stock.force_close_info && (
                    <div style={{
                      marginTop: 10, padding: "10px 12px", borderRadius: 8,
                      background: stock.force_close_info.risk_level === "high" ? "rgba(252,129,129,0.08)" : "rgba(245,158,11,0.08)",
                      border: `1px solid ${stock.force_close_info.risk_level === "high" ? "rgba(252,129,129,0.33)" : "rgba(245,158,11,0.33)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12 }}>⚠️</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: stock.force_close_info.risk_level === "high" ? "#fc8181" : "#f59e0b" }}>强平规则警示</span>
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>
                        当日跌幅达到 <span style={{ color: "#fc8181", fontWeight: 700 }}>{stock.force_close_info.trigger_pct}%</span>，A方有权强制平仓，不待收盘。
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={onReset}
              style={{
                width: "100%", padding: "10px 0", marginTop: 8,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >↻ 重新检测</button>
          </div>
        )}
      </div>
    </div>
  );
}
