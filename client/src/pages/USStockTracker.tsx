/**
 * USStockTracker.tsx
 * 美股全景仪表盘 - 重新设计版
 * 路径: /us-stock-tracker
 * 主色：深蓝 #1565C0，风格与 StockDetail 红白风格对齐
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, BarChart2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 配色 ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BLUE_DARK = "#0D47A1";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#666666";
const RED = "#D32F2F";
const GREEN = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 七巨头配置 ────────────────────────────────────────────
const MEGA_SEVEN = [
  { symbol: "AAPL.US",  name: "苹果",   code: "AAPL",  emoji: "🍎" },
  { symbol: "MSFT.US",  name: "微软",   code: "MSFT",  emoji: "🪟" },
  { symbol: "NVDA.US",  name: "英伟达", code: "NVDA",  emoji: "🎮" },
  { symbol: "GOOGL.US", name: "谷歌",   code: "GOOGL", emoji: "🔍" },
  { symbol: "AMZN.US",  name: "亚马逊", code: "AMZN",  emoji: "📦" },
  { symbol: "META.US",  name: "Meta",   code: "META",  emoji: "👓" },
  { symbol: "TSLA.US",  name: "特斯拉", code: "TSLA",  emoji: "⚡" },
];

function Skeleton({ w = "full", h = 4 }: { w?: string; h?: number }) {
  return (
    <div
      className={`animate-pulse rounded w-${w}`}
      style={{ height: `${h * 4}px`, background: "#D8E4F0" }}
    />
  );
}

function PriceCard({
  stock,
  priceData,
  onClick,
}: {
  stock: typeof MEGA_SEVEN[0];
  priceData?: { close: number; changePct: number | null; date: string };
  onClick: () => void;
}) {
  const isUp = (priceData?.changePct ?? 0) >= 0;
  const color = isUp ? RED : GREEN;
  const sign = isUp ? "+" : "";

  return (
    <div
      className="rounded-2xl p-3 cursor-pointer active:opacity-80 flex flex-col gap-1"
      style={{
        background: CARD,
        boxShadow: CARD_SHADOW,
        border: `1.5px solid ${BORDER}`,
      }}
      onClick={onClick}
    >
      {/* 公司标识行 */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 16 }}>{stock.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate" style={{ color: TEXT }}>{stock.name}</div>
          <div className="text-xs" style={{ color: MUTED, fontSize: 10 }}>{stock.code}</div>
        </div>
      </div>

      {/* 价格 */}
      <div className="mt-0.5">
        {priceData ? (
          <>
            <div className="text-base font-bold leading-tight" style={{ color: TEXT }}>
              ${priceData.close.toFixed(2)}
            </div>
            <div className="text-xs font-medium mt-0.5" style={{ color }}>
              {sign}{priceData.changePct?.toFixed(2) ?? "—"}%
            </div>
          </>
        ) : (
          <>
            <Skeleton w="20" h={4} />
            <div className="mt-1"><Skeleton w="16" h={3} /></div>
          </>
        )}
      </div>

      {/* 日期 */}
      {priceData && (
        <div className="text-xs" style={{ color: MUTED, fontSize: 9 }}>
          {priceData.date}
        </div>
      )}
    </div>
  );
}

export default function USStockTracker() {
  const [, setLocation] = useLocation();

  // 批量获取7只股票最新日线价格
  const symbols = useMemo(() => MEGA_SEVEN.map(s => s.symbol), []);
  const { data: latestPrices } = trpc.cryptoData.getLatestPrices.useQuery(
    { symbols },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  // 标普500指数
  const { data: sp500 } = trpc.stock.getSP500Index.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });

  // 全生命周期统计（总数）
  const { data: totalCount } = trpc.usStockLifecycle.useQuery(
    { page: 1, pageSize: 1, sortBy: "upRate", sortDir: "desc" },
    { refetchOnWindowFocus: false }
  );

  // 涨幅率 Top5
  const { data: topUpRate } = trpc.usStockLifecycle.useQuery(
    { page: 1, pageSize: 5, sortBy: "upRate", sortDir: "desc", minTotalDays: 500 },
    { refetchOnWindowFocus: false }
  );

  const total = totalCount?.total ?? 0;
  const sp500Up = (sp500?.changePercent ?? 0) >= 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>

      {/* ── 顶部导航 ── */}
      <div
        className="px-4 pt-3 pb-4 flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setLocation("/")}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <p className="font-bold text-lg text-white">美股七巨头</p>
            <p className="text-xs text-white opacity-75">七大科技巨头 · 日线行情</p>
          </div>
          <button
            onClick={() => setLocation("/us-stock-tracker/stock-lifecycle")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
          >
            <Search className="w-3 h-3" />
            全市场
          </button>
        </div>

        {/* 标普500 指数条 */}
        <div
          className="rounded-xl px-3 py-2 flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <div className="flex-1">
            <div className="text-xs text-white opacity-70">标普500 S&P 500</div>
            {sp500 ? (
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold text-white">
                  {sp500.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-medium" style={{ color: sp500Up ? "#FF8A80" : "#69F0AE" }}>
                  {sp500Up ? "+" : ""}{sp500.changePercent.toFixed(2)}%
                </span>
              </div>
            ) : (
              <div className="mt-1"><Skeleton w="32" h={5} /></div>
            )}
          </div>
          {sp500Up ? (
            <TrendingUp className="w-5 h-5" style={{ color: "#FF8A80" }} />
          ) : (
            <TrendingDown className="w-5 h-5" style={{ color: "#69F0AE" }} />
          )}
        </div>
      </div>

      {/* ── 主内容区 ── */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* 七巨头行情网格 */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold" style={{ color: TEXT }}>七巨头最新收盘价</div>
            <div className="text-xs" style={{ color: MUTED }}>点击查看日线数据</div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {MEGA_SEVEN.map((stock) => {
              const pd = latestPrices?.[stock.symbol];
              return (
                <PriceCard
                  key={stock.symbol}
                  stock={stock}
                  priceData={pd}
                  onClick={() => setLocation(`/ledger/52/be-data?filter=stocks&symbol=${stock.symbol}`)}
                />
              );
            })}
          </div>
          <div className="mt-2 text-xs text-center" style={{ color: MUTED }}>
            * 显示最新交易日收盘价，非实时报价
          </div>
        </div>

        {/* 功能入口区 */}
        <div className="px-4 mt-4 grid grid-cols-2 gap-3">
          {/* 日线数据分析 */}
          <div
            className="rounded-2xl p-4 cursor-pointer active:opacity-80 flex flex-col gap-2"
            style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1.5px solid ${BORDER}` }}
            onClick={() => setLocation("/ledger/52/be-data?filter=stocks")}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <BarChart2 className="w-5 h-5" style={{ color: BLUE }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: TEXT }}>日线数据</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>涨跌幅 · 振幅 · 连涨连跌</div>
            </div>
          </div>

          {/* 全市场排行 */}
          <div
            className="rounded-2xl p-4 cursor-pointer active:opacity-80 flex flex-col gap-2"
            style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1.5px solid ${BORDER}` }}
            onClick={() => setLocation("/us-stock-tracker/stock-lifecycle")}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${RED}15` }}>
              <TrendingUp className="w-5 h-5" style={{ color: RED }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: TEXT }}>全市场排行</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                {total > 0 ? `${total.toLocaleString()}只股票` : "涨幅率 · 涨天数排行"}
              </div>
            </div>
          </div>
        </div>

        {/* 涨幅率 Top5 */}
        {topUpRate && topUpRate.list.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold" style={{ color: BLUE }}>
                涨幅率 Top5
              </div>
              <div className="text-xs" style={{ color: MUTED }}>≥500交易日</div>
            </div>
            <div className="space-y-2.5">
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
            <button
              onClick={() => setLocation("/us-stock-tracker/stock-lifecycle")}
              className="mt-3 w-full py-2 rounded-xl text-sm font-medium"
              style={{ background: BG, color: BLUE }}
            >
              查看完整排行榜 →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
