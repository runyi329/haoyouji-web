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
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
const MEGA_SEVEN = [
  { symbol: "AAPL.US",  name: "Apple",     code: "AAPL",  logo: `${COS}/logo_apple_3d_t_16b8b55f.png` },
  { symbol: "MSFT.US",  name: "Microsoft", code: "MSFT",  logo: `${COS}/logo_microsoft_3d_t_4719f9c5.png` },
  { symbol: "NVDA.US",  name: "NVIDIA",    code: "NVDA",  logo: `${COS}/logo_nvidia_3d_t_d451eb3d.png` },
  { symbol: "GOOGL.US", name: "Alphabet",  code: "GOOGL", logo: `${COS}/logo_google_3d_t_cd971ae7.png` },
  { symbol: "AMZN.US",  name: "Amazon",    code: "AMZN",  logo: `${COS}/logo_amazon_3d_t_0c61d380.png` },
  { symbol: "META.US",  name: "Meta",      code: "META",  logo: `${COS}/logo_meta_3d_t_5b7237ab.png` },
  { symbol: "TSLA.US",  name: "Tesla",     code: "TSLA",  logo: `${COS}/logo_tesla_3d_t_0d585ca4.png` },
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
  index,
  total,
}: {
  stock: typeof MEGA_SEVEN[0];
  priceData?: { close: number; changePct: number | null; date: string };
  onClick: () => void;
  index: number;
  total: number;
}) {
  const isUp = (priceData?.changePct ?? 0) >= 0;
  const changeColor = isUp ? RED : GREEN;
  const changeBg = isUp ? "rgba(211,47,47,0.08)" : "rgba(0,176,80,0.08)";
  const sign = isUp ? "+" : "";

  return (
    <div
      className="flex items-center cursor-pointer active:opacity-80"
      style={{
        padding: "10px 4px",
        borderBottom: index < total - 1 ? `1px solid ${BORDER}` : "none",
      }}
      onClick={onClick}
    >
      {/* 立体 Logo */}
      <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 44, height: 44 }}>
        <img
          src={stock.logo}
          alt={stock.name}
          style={{ width: 38, height: 38, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }}
        />
      </div>

      {/* 公司名 + 代码 */}
      <div className="flex flex-col ml-3" style={{ flex: 1, minWidth: 0 }}>
        <span className="font-semibold truncate" style={{ color: TEXT, fontSize: 14, lineHeight: 1.3 }}>{stock.name}</span>
        <span style={{ color: MUTED, fontSize: 11, lineHeight: 1.3 }}>{stock.code}</span>
        {priceData && (
          <span style={{ color: MUTED, fontSize: 9, lineHeight: 1.5 }}>{priceData.date}</span>
        )}
      </div>

      {/* 价格 + 涨跌幅 */}
      <div className="flex flex-col items-end ml-2 flex-shrink-0">
        {priceData ? (
          <>
            <span className="font-bold" style={{ color: TEXT, fontSize: 16, lineHeight: 1.3 }}>
              ${priceData.close.toFixed(2)}
            </span>
            <span
              style={{
                color: changeColor,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.3,
                background: changeBg,
                borderRadius: 5,
                padding: "1px 6px",
                marginTop: 2,
              }}
            >
              {sign}{priceData.changePct?.toFixed(2) ?? "—"}%
            </span>
          </>
        ) : (
          <>
            <Skeleton w="20" h={4} />
            <div className="mt-1"><Skeleton w="16" h={3} /></div>
          </>
        )}
      </div>

      {/* 右箭头 */}
      <span style={{ color: MUTED, fontSize: 14, marginLeft: 8, opacity: 0.5 }}>›</span>
    </div>
  );
}

export default function USStockTracker() {
  const [, setLocation] = useLocation();

  // 批量获取7只股票最新日线价格（数据库存的是不带 .US 的 code，如 AAPL）
  const codes = useMemo(() => MEGA_SEVEN.map(s => s.code), []);
  const { data: latestPrices } = trpc.cryptoData.getLatestPrices.useQuery(
    { symbols: codes },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  // 标普500指数
  const { data: sp500 } = trpc.stock.getSP500Index.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });

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

        {/* 七巨头行情列表 */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold" style={{ color: TEXT }}>七巨头最新收盘价</div>
            <div className="text-xs" style={{ color: MUTED }}>点击查看日线数据</div>
          </div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1.5px solid ${BORDER}`, padding: "0 12px" }}
          >
            {MEGA_SEVEN.map((stock, idx) => {
              const pd = latestPrices?.[stock.code];
              return (
                <PriceCard
                  key={stock.symbol}
                  stock={stock}
                  priceData={pd}
                  onClick={() => setLocation(`/ledger/52/be-data?filter=stocks&symbol=${stock.symbol}`)}
                  index={idx}
                  total={MEGA_SEVEN.length}
                />
              );
            })}
          </div>
          <div className="mt-2 text-xs text-center" style={{ color: MUTED }}>
            * 显示最新交易日收盘价，非实时报价
          </div>
        </div>

        {/* 功能入口区 */}
        <div className="px-4 mt-4">
          {/* 日线数据分析 - 全宽横向卡片 */}
          <div
            className="rounded-2xl p-4 cursor-pointer active:opacity-80 flex items-center gap-4"
            style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1.5px solid ${BORDER}` }}
            onClick={() => setLocation("/ledger/52/be-data?filter=stocks")}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${BLUE}15` }}>
              <BarChart2 className="w-5 h-5" style={{ color: BLUE }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: TEXT }}>七巨头日线数据分析</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>涨跌幅 · 振幅 · 连涨连跌 · 历史K线</div>
            </div>
            <div className="text-lg" style={{ color: BLUE }}>›</div>
          </div>

        </div>



      </div>
    </div>
  );
}
