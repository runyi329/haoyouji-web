/**
 * 谷底增筹 — 产品演示页
 * 路由：/ledger/:id/product-demo
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

// ─── 公式核心 ──────────────────────────────────────────────────
function calcRatio(n: number): number {
  if (n === 0) return 1;
  return Math.min(1, 1 / 0.75 / (n + 1));
}

const STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// 增筹B 等比分润表
const B_CLIENT_SHARES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function pctColor(pct: number): string {
  const MIN = 10, MAX = 100;
  const t = Math.max(0, Math.min(1, (pct - MIN) / (MAX - MIN)));
  if (t < 0.5) {
    const u = t / 0.5;
    const r = Math.round(0x3F + (0xF0 - 0x3F) * u);
    const g = Math.round(0xB9 + (0x88 - 0xB9) * u);
    const b = Math.round(0x50 + (0x3E - 0x50) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    const u = (t - 0.5) / 0.5;
    const r = Math.round(0xF0 + (0xF8 - 0xF0) * u);
    const g = Math.round(0x88 + (0x51 - 0x88) * u);
    const b = Math.round(0x3E + (0x49 - 0x3E) * u);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── 实时 ETH 价格 Hook ─────────────────────────────────────────
function useEthPrice() {
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(2000);

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    wsRef.current = ws;
    ws.onopen = () => {
      delayRef.current = 2000;
      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: 9999, method: "public/subscribe",
        params: { channels: ["ticker.ETH-PERPETUAL.100ms"] }
      }));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.method === "subscription" && msg.params?.channel?.startsWith("ticker.ETH-PERPETUAL")) {
          const p = msg.params.data?.mark_price;
          if (p) setEthPrice(p);
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      timerRef.current = setTimeout(() => {
        delayRef.current = Math.min(delayRef.current * 1.5, 30000);
        connect();
      }, delayRef.current);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  return ethPrice;
}

// ─── 区块标题 ──────────────────────────────────────────────────
function SectionTitle({ text, color = "#F0B42999" }: { text: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-3.5 rounded-full" style={{ background: color }} />
      <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{text}</span>
    </div>
  );
}

// ─── A/B 切换按钮 ──────────────────────────────────────────────
function ABToggle({ value, onChange }: { value: "A" | "B"; onChange: (v: "A" | "B") => void }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "#E8EEFF", border: "1px solid #D0D8FF" }}>
      {(["A", "B"] as const).map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className="px-3 py-0.5 rounded text-sm font-semibold transition-all duration-150"
          style={value === k
            ? { background: k === "A" ? "#1A56DB" : "#E8922A", color: "#fff" }
            : { background: "transparent", color: "#6B7280" }
          }
        >
          增筹{k}
        </button>
      ))}
    </div>
  );
}

// ─── 场景评分星星 ──────────────────────────────────────────────
function Stars({ count, max = 5, color }: { count: number; max?: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className="w-2 h-2 rounded-full" style={{ background: i < count ? color : "#D1D5DB" }} />
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export default function GutdiProductDemo() {
  const [, params] = useRoute("/ledger/:id/product-demo");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const urlParams = new URLSearchParams(window.location.search);
  const viewAsUserId = urlParams.get("viewAs");

  const ethPrice = useEthPrice();
  const ethEntry = ethPrice ?? 1800;

  const [tableAB, setTableAB] = useState<"A" | "B">("A");

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen font-sans" style={{ background: "#F0F4FF", color: "#1A2340" }}>

      {/* ── 顶部导航栏 ── */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #1E40AF 100%)', minHeight: '52px' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?hideTab=1${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
            className="p-1 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-base font-semibold text-white">谷底增筹 · 产品演示</span>
        </div>
        {/* ETH 实时价格 */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${ethPrice ? 'bg-green-300' : 'bg-yellow-300 animate-pulse'}`} />
          {ethPrice && (
            <span className="text-sm font-semibold text-white tabular-nums">
              ETH {ethPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="px-4 py-5 space-y-6 max-w-2xl mx-auto">

        {/* ── 1. 什么是谷底增筹 ── */}
        <section>
          <SectionTitle text="什么是谷底增筹？" />
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#D0D8FF", background: "#fff" }}>
            <div className="relative h-28 flex items-end justify-center" style={{ background: "linear-gradient(180deg, #EEF2FF 0%, #E0E8FF 100%)" }}>
              <svg viewBox="0 0 320 80" className="w-full" preserveAspectRatio="none" style={{ height: "100%" }}>
                <defs>
                  <linearGradient id="valleyGrad_demo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <path d="M0,10 Q40,65 80,72 Q120,78 160,75 Q200,72 240,65 Q280,55 320,10 L320,80 L0,80 Z" fill="url(#valleyGrad_demo)" />
                <path d="M0,10 Q40,65 80,72 Q120,78 160,75 Q200,72 240,65 Q280,55 320,10" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="160" cy="75" r="3" fill="#F59E0B" />
                <line x1="160" y1="75" x2="160" y2="30" stroke="#059669" strokeWidth="1" strokeDasharray="3,2" />
                <text x="130" y="70" fontSize="7" fill="#D97706" fontFamily="monospace">谷底入场</text>
                <text x="8" y="20" fontSize="7" fill="#9CA3AF" fontFamily="monospace">ETH 跌</text>
                <text x="278" y="20" fontSize="7" fill="#9CA3AF" fontFamily="monospace">ETH 涨</text>
              </svg>
            </div>
            <div className="grid grid-cols-3" style={{ borderTop: "1px solid #E0E8FF" }}>
              {[
                { title: "谷底入场", desc: "少量资金锁定全额涨幅参与权" },
                { title: "永不爆仓", desc: "最多亏本期利息，无追加风险" },
                { title: "涨幅增筹", desc: "涨幅越大，你拿的比例越高" },
              ].map((item, i) => (
                <div key={i} className="px-3 py-3 text-center" style={{ background: "#F8FAFF", borderRight: i < 2 ? "1px solid #E0E8FF" : "none" }}>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: '#1A2340' }}>{item.title}</div>
                  <div className="text-[13px] leading-relaxed" style={{ color: '#6B7280' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. 两款产品一眼看懂 ── */}
        <section>
          <SectionTitle text="两款产品一眼看懂" />
          <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#D0D8FF" }}>
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#E0E8FF", background: "#F0F4FF" }}>
              <div className="p-3 text-[13px]" style={{ color: '#9CA3AF' }}>ETH</div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-base font-bold" style={{ color: '#1A56DB' }}>增筹A</div>
              </div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-base font-bold" style={{ color: '#E8922A' }}>增筹B</div>
              </div>
            </div>
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#E0E8FF" }}>
              <div className="px-3 py-2 flex items-center justify-center">
                <span className="font-bold text-base" style={{ color: '#059669' }}>跌</span>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-sm" style={{ color: '#374151' }}>不用补仓 不会爆仓</div>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-sm" style={{ color: '#374151' }}>收益权只加不减</div>
              </div>
            </div>
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#E0E8FF" }}>
              <div className="px-3 py-2 flex items-center justify-center">
                <span className="font-bold text-base" style={{ color: '#DC2626' }}>涨</span>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-sm" style={{ color: '#374151' }}>最高 5.25 倍收益</div>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-sm" style={{ color: '#374151' }}>涨幅越大分润越高</div>
              </div>
            </div>
            <div className="px-3 py-2 border-b" style={{ borderColor: "#E0E8FF", background: "#F8FAFF" }}>
              <span className="text-[12px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>不同市场情景下的表现</span>
            </div>
            {[
              { scene: "单边上涨", a: 5, b: 3, noteA: "A 完胜", noteB: "B 也有分润" },
              { scene: "先跌后涨", a: 1, b: 3, noteA: "A 收益被稀释", noteB: "B 不受影响" },
              { scene: "震荡横盘", a: 2, b: 2, noteA: "A 分润下降", noteB: "B 收益稳定" },
              { scene: "单边大跌", a: 2, b: 2, noteA: "A 不用补仓", noteB: "B 永不爆仓" },
            ].map(({ scene, a, b, noteA, noteB }) => (
              <div key={scene} className="grid border-b last:border-0" style={{ gridTemplateColumns: "1fr 1fr 1fr", borderColor: "#E0E8FF" }}>
                <div className="p-3 text-[13px]" style={{ color: '#374151' }}>{scene}</div>
                <div className="p-3 border-l flex flex-col items-center gap-1" style={{ borderColor: "#E0E8FF" }}>
                  <Stars count={a} color="#1A56DB" />
                  <span className="text-[11px]" style={{ color: '#6B7280' }}>{noteA}</span>
                </div>
                <div className="p-3 border-l flex flex-col items-center gap-1" style={{ borderColor: "#E0E8FF" }}>
                  <Stars count={b} color="#E8922A" />
                  <span className="text-[11px]" style={{ color: '#6B7280' }}>{noteB}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. 分润/回撤表（A/B 切换）── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle text={tableAB === "B" ? "客户分润比例" : "回撤如何影响收益？"} />
            <ABToggle value={tableAB} onChange={setTableAB} />
          </div>

          {tableAB === "B" ? (
            <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#D0D8FF" }}>
              <div className="flex items-center justify-between px-4 py-2 text-[13px] uppercase tracking-wider border-b" style={{ borderColor: "#E0E8FF", color: '#9CA3AF' }}>
                <span>ETH 涨幅<span className="ml-1 normal-case font-normal" style={{ color: '#D97706' }}>（现价 {ethEntry ? `${fmt(ethEntry)}u` : "连接中…"}）</span></span>
                <span style={{ color: '#059669' }}>客户分润%</span>
              </div>
              {STEPS.map((pct, i) => {
                const clientPct = B_CLIENT_SHARES[i];
                const targetPriceA = ethEntry * (1 + pct / 100);
                const isHighest = i === STEPS.length - 1;
                return (
                  <div key={pct} className="px-4 py-1.5 border-b last:border-0" style={{ borderColor: "#E0E8FF", background: isHighest ? "#FFF7ED" : "transparent" }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="relative h-6 rounded-sm overflow-hidden" style={{ background: "#F3F4F6" }}>
                          <div className="absolute inset-y-0 left-0 rounded-sm" style={{
                            width: `${clientPct}%`,
                            background: clientPct <= 20 ? "linear-gradient(90deg, #BBF7D0, #34D399)" : clientPct <= 40 ? "linear-gradient(90deg, #D9F99D, #84CC16)" : clientPct <= 60 ? "linear-gradient(90deg, #FEF9C3, #EAB308)" : clientPct <= 80 ? "linear-gradient(90deg, #FED7AA, #F97316)" : "linear-gradient(90deg, #FECACA, #EF4444)",
                            transition: "width 0.4s ease"
                          }} />
                          <div className="absolute inset-0 flex items-center px-2 gap-1">
                            <span className="text-[13px] font-medium tabular-nums whitespace-nowrap relative z-10" style={{ color: '#1A2340' }}>涨{pct}%</span>
                            <span className="text-[13px] tabular-nums whitespace-nowrap relative z-10" style={{ color: '#374151' }}>涨到{fmt(targetPriceA)}u</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="font-bold text-xl tabular-nums leading-none" style={{ color: pctColor(clientPct) }}>{clientPct.toFixed(0)}%</span>
                        {isHighest && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "#FED7AA", color: "#C2410C" }}>最高分润</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#D0D8FF" }}>
              <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "#E0E8FF" }}>
                <span className="text-[13px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>回撤幅度</span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[13px] uppercase tracking-wider" style={{ color: '#059669' }}>收益权剩余比例</span>
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>增筹A 下跌会稀释·增筹B 永不稀释</span>
                </div>
              </div>
              {[0, ...STEPS.filter(s => s < 100)].map((pct) => {
                const n = pct / 10;
                const ratio = calcRatio(n);
                const clientPct = ratio * 100;
                return (
                  <div key={pct} className="px-4 py-1.5 border-b last:border-0" style={{ borderColor: "#E0E8FF", background: pct === 0 ? "#F0FDF4" : "transparent" }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="relative h-6 rounded-sm overflow-hidden" style={{ background: "#F3F4F6" }}>
                          <div className="absolute inset-y-0 left-0 rounded-sm" style={{
                            width: `${Math.round(Math.sqrt(clientPct / 100) * 100)}%`,
                            background: pct === 0 ? "linear-gradient(90deg, #BBF7D0, #34D399)" : pct <= 20 ? "linear-gradient(90deg, #D9F99D, #84CC16)" : pct <= 40 ? "linear-gradient(90deg, #FEF9C3, #EAB308)" : pct <= 60 ? "linear-gradient(90deg, #FED7AA, #F97316)" : "linear-gradient(90deg, #FECACA, #EF4444)",
                            transition: "width 0.4s ease"
                          }} />
                          <div className="absolute inset-0 flex items-center px-2 gap-1">
                            <span className="text-[13px] font-medium tabular-nums whitespace-nowrap relative z-10" style={{ color: '#1A2340' }}>{pct === 0 ? "不跌" : `跌${pct}%`}</span>
                            {pct === 0 && <span className="text-[13px] relative z-10" style={{ color: '#6B7280' }}>无回撤</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-0.5 shrink-0">
                        <span className="font-bold text-xl tabular-nums leading-none" style={{ color: pct === 0 ? "#059669" : pct <= 20 ? "#65A30D" : pct <= 40 ? "#CA8A04" : pct <= 60 ? "#EA580C" : "#DC2626" }}>{clientPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 4. 资金成本对比表 ── */}
        <section>
          <SectionTitle text="资金成本" />
          <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#D0D8FF" }}>
            <div className="grid border-b" style={{ gridTemplateColumns: "72px 1fr 1fr", borderColor: "#E0E8FF", background: "#F0F4FF" }}>
              <div className="p-3 text-[13px] text-center whitespace-nowrap" style={{ color: '#9CA3AF' }}>项目</div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-base font-bold" style={{ color: '#1A56DB' }}>增筹A</div>
              </div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#E0E8FF" }}>
                <div className="text-base font-bold" style={{ color: '#E8922A' }}>增筹B</div>
              </div>
            </div>
            <div className="grid border-b" style={{ gridTemplateColumns: "72px 1fr 1fr", borderColor: "#E0E8FF" }}>
              <div className="px-3 py-3 flex items-center justify-center whitespace-nowrap">
                <span className="text-sm" style={{ color: '#6B7280' }}>首仓资金</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#E0E8FF" }}>
                <span className="text-sm font-medium" style={{ color: '#374151' }}>10%</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#E0E8FF" }}>
                <span className="text-sm font-medium" style={{ color: '#374151' }}>10%</span>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "72px 1fr 1fr" }}>
              <div className="px-3 py-3 flex items-center justify-center whitespace-nowrap">
                <span className="text-sm" style={{ color: '#6B7280' }}>管理费用</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#E0E8FF" }}>
                <span className="text-sm font-medium" style={{ color: '#374151' }}>1.33%</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#E0E8FF" }}>
                <span className="text-sm font-medium" style={{ color: '#374151' }}>2.33%</span>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t" style={{ borderColor: "#E0E8FF", background: "#F8FAFF" }}>
              <span className="text-[12px] leading-relaxed" style={{ color: '#6B7280' }}>增筹A 管理费较低，因为回撤会稀释收益权，客户承担了部分市场风险；增筹B 管理费较高，但下跌永不影响收益权，确定性更强。</span>
            </div>
          </div>
        </section>

        {/* ── 5. 哪款适合我 ── */}
        <section>
          <SectionTitle text="哪款适合我？" />
          <div className="space-y-3">
            <div className="rounded-xl border p-4" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#1A56DB" }} />
                <span className="font-bold text-sm" style={{ color: '#1A56DB' }}>我适合增筹A，如果……</span>
              </div>
              <div className="space-y-1.5 pl-4">
                {[
                  <>我判断 ETH 短期内会<span className="font-medium" style={{ color: '#1A56DB' }}>持续上涨</span>，回撤概率低</>,
                  <>我希望在<span className="font-medium" style={{ color: '#1A56DB' }}>大涨行情</span>下获得最高 5.25 倍收益</>,
                  <>我能接受市场震荡时分润比例有所下降</>,
                  <>我希望以<span className="font-medium" style={{ color: '#1A56DB' }}>更低的持有成本</span>参与行情</>,
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: '#1A56DB' }}>·</span>
                    <span className="text-sm leading-relaxed" style={{ color: '#374151' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "#FFF7ED", borderColor: "#FED7AA" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#E8922A" }} />
                <span className="font-bold text-sm" style={{ color: '#E8922A' }}>我适合增筹B，如果……</span>
              </div>
              <div className="space-y-1.5 pl-4">
                {[
                  <>我不确定 ETH 走势，希望<span className="font-medium" style={{ color: '#E8922A' }}>无论涨跌都有保障</span></>,
                  <>我希望<span className="font-medium" style={{ color: '#E8922A' }}>下跌时收益权永不被稀释</span>，持仓更安心</>,
                  <>我偏好<span className="font-medium" style={{ color: '#E8922A' }}>稳健策略</span>，涨了有分润，跌了不受损</>,
                  <>我愿意<span className="font-medium" style={{ color: '#E8922A' }}>中长期持仓</span>，持得越久分润比例越高</>,
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: '#E8922A' }}>·</span>
                    <span className="text-sm leading-relaxed" style={{ color: '#374151' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="h-8" />
      </div>

      {/* 悬浮回到顶部 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-4 z-50 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
        style={{ background: "#1A56DB", color: "#fff" }}
        aria-label="回到顶部"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
