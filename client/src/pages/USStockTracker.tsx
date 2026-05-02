/**
 * USStockTracker.tsx
 * 美股全景仪表盘
 * 路径: /us-stock-tracker
 * 风格与 HKStockTracker 一致，主色为深蓝 #1565C0
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 配色 ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#555555";
const RED = "#D32F2F";
const GREEN = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

function Skeleton() {
  return <div className="animate-pulse rounded-lg h-4 w-full" style={{ background: "#E0E8F0" }} />;
}

function useCountUp(target: number, duration: number, active: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const start = performance.now();
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(0 + (target - 0) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, active]);
  return value;
}

export default function USStockTracker() {
  const [, setLocation] = useLocation();
  const [animActive, setAnimActive] = useState(false);

  // 查询美股全生命周期统计（取前几名）
  const { data: topUpRate } = trpc.usStockLifecycle.useQuery(
    { page: 1, pageSize: 5, sortBy: "upRate", sortDir: "desc", minTotalDays: 500 },
    { refetchOnWindowFocus: false }
  );
  const { data: topUpDays } = trpc.usStockLifecycle.useQuery(
    { page: 1, pageSize: 5, sortBy: "up", sortDir: "desc", minTotalDays: 500 },
    { refetchOnWindowFocus: false }
  );
  const { data: totalCount } = trpc.usStockLifecycle.useQuery(
    { page: 1, pageSize: 1, sortBy: "upRate", sortDir: "desc" },
    { refetchOnWindowFocus: false }
  );

  useEffect(() => {
    const t = setTimeout(() => setAnimActive(true), 300);
    return () => clearTimeout(t);
  }, []);

  const total = totalCount?.total ?? 0;
  const animTotal = useCountUp(total, 1200, animActive);
  const dataReady = (totalCount as any)?.dataReady !== false;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: BLUE, color: "#fff" }}>
        <button
          onClick={() => setLocation('/')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">美股AI追踪</p>
          <p className="text-xs opacity-80">全生命周期涨跌分析</p>
        </div>
        <button
          onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
          className="flex items-center justify-center px-3 h-7 rounded-full text-sm font-medium"
          style={{
            backgroundColor: "rgba(255,255,255,0.9)",
            color: BLUE,
            border: "1px solid rgba(255,255,255,0.4)",
            minWidth: "44px",
          }}
        >
          个股
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {/* 数据未就绪提示 */}
        {!dataReady && (
          <div className="mx-4 mt-4 rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            style={{ background: CARD, boxShadow: CARD_SHADOW }}>
            <div className="text-3xl">⏳</div>
            <div className="text-sm font-bold" style={{ color: TEXT }}>历史数据回填中</div>
            <div className="text-xs leading-relaxed" style={{ color: MUTED }}>
              美股全历史数据（约1万只股票）正在后台回填，预计需要 8-12 小时。
              完成后将自动显示完整数据。
            </div>
            <button
              onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
              className="mt-1 px-5 py-2 rounded-full text-sm font-medium text-white"
              style={{ background: BLUE }}
            >
              查看当前数据
            </button>
          </div>
        )}

        {/* 美股日线数据快捷入口 */}
        <div
          className="mx-4 mt-4 rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:opacity-80"
          style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1.5px solid ${BORDER}` }}
          onClick={() => setLocation('/ledger/52/be-data?filter=stocks')}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${BLUE}15` }}>
            <span style={{ fontSize: 22 }}>📊</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: TEXT }}>美股日线数据</div>
            <div className="text-xs mt-0.5" style={{ color: MUTED }}>AAPL / MSFT / GOOGL / AMZN / NVDA / TSLA / META</div>
          </div>
          <div style={{ color: BLUE, fontSize: 18 }}>›</div>
        </div>

        {/* 总览卡片 */}
        {dataReady && (
          <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
            <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>数据总览</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3 text-center" style={{ background: BG }}>
                <div className="text-2xl font-bold" style={{ color: BLUE }}>
                  {animTotal > 0 ? animTotal.toLocaleString() : <Skeleton />}
                </div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>收录股票总数</div>
              </div>
              <div
                className="rounded-xl p-3 text-center cursor-pointer"
                style={{ background: BG }}
                onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
              >
                <div className="text-2xl font-bold" style={{ color: BLUE }}>→</div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>查看全部个股</div>
              </div>
            </div>
          </div>
        )}

        {/* 涨幅率最高 Top5 */}
        {dataReady && topUpRate && topUpRate.list.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
            <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>
              涨幅率最高 Top5
              <span className="ml-1 text-xs font-normal" style={{ color: MUTED }}>（≥500交易日）</span>
            </div>
            <div className="space-y-2">
              {topUpRate.list.map((s, i) => (
                <div
                  key={s.tsCode}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setLocation(`/us-stock/${encodeURIComponent(s.tsCode)}`)}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: i === 0 ? "#FFD600" : i === 1 ? "#E0E0E0" : i === 2 ? "#FFAB40" : BG,
                      color: i < 3 ? "#333" : MUTED,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: TEXT }}>
                      {s.name || s.enname || s.tsCode}
                    </div>
                    <div className="text-xs" style={{ color: MUTED }}>{s.tsCode}</div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: s.upRate >= 50 ? RED : GREEN }}>
                    {s.upRate.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 上涨天数最多 Top5 */}
        {dataReady && topUpDays && topUpDays.list.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
            <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>
              上涨天数最多 Top5
              <span className="ml-1 text-xs font-normal" style={{ color: MUTED }}>（≥500交易日）</span>
            </div>
            <div className="space-y-2">
              {topUpDays.list.map((s, i) => (
                <div
                  key={s.tsCode}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setLocation(`/us-stock/${encodeURIComponent(s.tsCode)}`)}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: i === 0 ? "#FFD600" : i === 1 ? "#E0E0E0" : i === 2 ? "#FFAB40" : BG,
                      color: i < 3 ? "#333" : MUTED,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: TEXT }}>
                      {s.name || s.enname || s.tsCode}
                    </div>
                    <div className="text-xs" style={{ color: MUTED }}>{s.tsCode}</div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: RED }}>
                    {s.upDays.toLocaleString()}天
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 快速入口 */}
        <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>快速查找</div>
          <button
            onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
            className="w-full py-3 rounded-xl text-sm font-medium text-white"
            style={{ background: `linear-gradient(135deg, ${BLUE} 0%, #0D47A1 100%)` }}
          >
            查看全部美股涨跌天数排行
          </button>
          <div className="mt-2 text-xs text-center" style={{ color: MUTED }}>
            支持按涨幅率、涨天数、跌天数、总天数排序
          </div>
        </div>
      </div>
    </div>
  );
}
