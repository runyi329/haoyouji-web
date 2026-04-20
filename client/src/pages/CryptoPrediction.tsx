/**
 * CryptoPrediction.tsx
 * 布局：
 *   顶部导航栏（返回 + 币种名）
 *   K 线图区域（固定，不随 Tab 切换）
 *   三 Tab 切换：无损合约 / 无损现货 / 行情评估（含竞猜）
 */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown, Bitcoin,
  AlertCircle, WifiOff, CheckCircle2, Circle, Loader2, Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

// ─── 币种配置 ──────────────────────────────────────────────────
// 委买价格档位（低于市价，抄底用）
const BUY_PRICE_OPTIONS: Record<string, number[]> = {
  BTC: [70000, 69000, 68000, 67000, 66000, 65000, 64000, 63000, 62000, 61000, 60000],
  ETH: [2100, 2050, 2000, 1950, 1900, 1850, 1800, 1750, 1700, 1650, 1600, 1550, 1500],
  SOL: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50],
};

// 委卖价格档位（高于市价，止盈用）
const SELL_PRICE_OPTIONS: Record<string, number[]> = {
  BTC: [100000, 99000, 98000, 97000, 96000, 95000, 94000, 93000, 92000, 91000, 90000, 89000, 88000, 87000, 86000, 85000, 84000, 83000, 82000, 81000, 80000, 79000, 78000, 77000, 76000, 75000],
  ETH: [5000, 4900, 4800, 4700, 4600, 4500, 4400, 4300, 4200, 4100, 4000, 3900, 3800, 3700, 3600, 3500, 3400, 3300, 3200, 3100, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300],
  SOL: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50],
};

const COIN_CONFIG: Record<string, {
  symbol: string; name: string; fullName: string; color: string; imgUrl: string;
}> = {
  BTC: {
    symbol: "BTCUSDT", name: "BTC", fullName: "比特币", color: "#F7931A",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/btc-official.png",
  },
  ETH: {
    symbol: "ETHUSDT", name: "ETH", fullName: "以太坊", color: "#627EEA",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png",
  },
  SOL: {
    symbol: "SOLUSDT", name: "SOL", fullName: "索拉纳", color: "#9945FF",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sol-official.png",
  },
};

const INTERVALS = [
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

interface KlineBar {
  openTime: number; open: number; high: number; low: number; close: number; volume: number;
}

// ─── Canvas K 线图 ─────────────────────────────────────────────
function KlineChart({ bars, coinColor }: { bars: KlineBar[]; coinColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const prices = bars.flatMap((b) => [b.high, b.low]);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const padL = 4, padR = 4, padT = 8, padB = 8;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const barW = Math.max(1, chartW / bars.length);
    const gap = Math.max(0.5, barW * 0.15);
    const bodyW = Math.max(1, barW - gap * 2);
    const toY = (p: number) => padT + chartH - ((p - minP) / range) * chartH;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }
    bars.forEach((bar, i) => {
      const x = padL + i * barW;
      const isUp = bar.close >= bar.open;
      const color = isUp ? "#26a69a" : "#ef5350";
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + barW / 2, toY(bar.high)); ctx.lineTo(x + barW / 2, toY(bar.low)); ctx.stroke();
      ctx.fillStyle = color;
      const bodyTop = Math.min(toY(bar.open), toY(bar.close));
      const bodyH = Math.max(1, Math.abs(toY(bar.open) - toY(bar.close)));
      ctx.fillRect(x + gap, bodyTop, bodyW, bodyH);
    });
    const last = bars[bars.length - 1];
    const lastY = toY(last.close);
    ctx.strokeStyle = last.close >= last.open ? "#26a69a" : "#ef5350";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, lastY); ctx.lineTo(W - padR, lastY); ctx.stroke();
    ctx.setLineDash([]);
  }, [bars, coinColor]);
  return <canvas ref={canvasRef} width={360} height={160} className="w-full" style={{ height: 160 }} />;
}

// ─── 工具函数 ──────────────────────────────────────────────────
// 整数型币种（单价较低，通常以整数计量）
const INTEGER_COINS_FIN = new Set(['SUI', 'ONDO', 'LOD', 'ENA', 'ARKM', 'AAVE']);

// ─── 美股辅助函数 ─────────────────────────────────────────────
// 美股七姐妹标识
const US_STOCK_KEYS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']);

// 美国法定节假日（2024~2026年，格式 YYYY-MM-DD，均为美东时间）
const US_HOLIDAYS = new Set([
  // 2024
  '2024-01-01','2024-01-15','2024-02-19','2024-03-29','2024-05-27',
  '2024-06-19','2024-07-04','2024-09-02','2024-11-28','2024-12-25',
  // 2025
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  // 2026
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
]);

/** 判断给定日期（YYYY-MM-DD）是否为美股交易日（周一~周五且非节假日） */
function isUSTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=周日, 6=周六
  if (dow === 0 || dow === 6) return false;
  if (US_HOLIDAYS.has(dateStr)) return false;
  return true;
}

/** 判断给定时间是否处于美国夏令时（3月第2个周日 ~ 11月第1个周日） */
function isUSDST(date: Date): boolean {
  const y = date.getUTCFullYear();
  // 3月第2个周日（美东 02:00 切换，UTC 07:00）
  const mar = new Date(Date.UTC(y, 2, 1));
  const marDow = mar.getUTCDay();
  const dstStart = new Date(Date.UTC(y, 2, (7 - marDow + 7) % 7 + 8, 7, 0, 0));
  // 11月第1个周日（美东 02:00 切换，UTC 06:00）
  const nov = new Date(Date.UTC(y, 10, 1));
  const novDow = nov.getUTCDay();
  const dstEnd = new Date(Date.UTC(y, 10, (7 - novDow) % 7 + 1, 6, 0, 0));
  return date >= dstStart && date < dstEnd;
}

/** 获取下一个美股交易日（YYYY-MM-DD），从 fromDate 的次日起算 */
function getNextUSTradingDay(fromDate: Date): string {
  const d = new Date(fromDate);
  d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().slice(0, 10);
    if (isUSTradingDay(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** 获取美股下单截止时间（北京时间）：夏令时 21:29，冬令时 22:29 */
function getUSMarketCutoff(now: Date): { hour: number; minute: number } {
  return isUSDST(now) ? { hour: 21, minute: 29 } : { hour: 22, minute: 29 };
}

// ─── 历史概率数据（基于 Binance 全量日线，2017~2026，3164天）────
// 历史概率数据：各区间在所有时段切片（近1月~近12月+近1~5年+全量）中的最高命中概率
// 历史概率数据：基于数据库crypto_klines日线数据
// 口径：(close-open)/open * 100（当日开收比），统一口径，无隔夜涨跌
// 窗口：近1月~近12月 + 近1年~近5年 + 全量，共18个切片，取最优命中概率
// 最后更新：2026-04-17
const HIST_PROB: Record<string, { up: number[]; down: number[] }> = {
  // BTC: 3163根日线，最优概率（18切片取最大值，6位精度）
  BTC: {
    up:   [0.148148, 0.087719, 0.04521, 0.074074, 0.037037, 0.035088, 0.009801, 0.006323, 0.006661, 0.005691, 0.002845, 0.011494],
    down: [0.172414, 0.090395, 0.111111, 0.022989, 0.018969, 0.014227, 0.006007, 0.006007, 0.003162, 0.002845, 0.001647, 0.001176],
  },
  // ETH: 3163根日线，最优概率（18切片取最大值，6位精度）
  ETH: {
    up:   [0.110041, 0.111111, 0.056699, 0.040468, 0.028249, 0.037037, 0.020408, 0.037037, 0.007588, 0.006007, 0.017544, 0.011494],
    down: [0.105263, 0.111111, 0.074074, 0.091954, 0.037037, 0.020408, 0.022989, 0.010117, 0.011494, 0.005142, 0.003162, 0.003745],
  },
  // AAPL: 11427根日线，最优概率（18切片取最大值，6位精度）
  AAPL: {
    up:   [0.163347, 0.071429, 0.05, 0.018465, 0.010151, 0.006126, 0.002275, 0.001925, 0.0007, 0.000788, 0.000175, 0.00035],
    down: [0.15, 0.069922, 0.03448, 0.017327, 0.016393, 0.003763, 0.0021, 0.001575, 0.000525, 0.000788, 0.000175, 0.000088],
  },
  // MSFT: 10101根日线，最优概率（18切片取最大值，6位精度）
  MSFT: {
    up:   [0.166667, 0.071429, 0.05, 0.010791, 0.005346, 0.002574, 0.001485, 0.000797, 0.000792, 0.002, 0.000099, 0],
    down: [0.25, 0.1, 0.022869, 0.007227, 0.004356, 0.001188, 0.00099, 0.000495, 0.000099, 0.000099, 0, 0],
  },
  // GOOGL: 5449根日线，最优概率（18切片取最大值，6位精度）
  GOOGL: {
    up:   [0.25, 0.1, 0.05, 0.02381, 0.002, 0.016393, 0.000367, 0.000367, 0.002, 0, 0, 0],
    down: [0.170732, 0.1, 0.020717, 0.009901, 0.002936, 0.000184, 0.004016, 0.000367, 0.000184, 0, 0, 0],
  },
  // AMZN: 7275根日线，最优概率（18切片取最大值，6位精度）
  AMZN: {
    up:   [0.357143, 0.071429, 0.05, 0.019794, 0.010584, 0.007423, 0.005223, 0.004399, 0.002612, 0.001649, 0.002, 0.001649],
    down: [0.148515, 0.081301, 0.05, 0.017457, 0.012784, 0.006186, 0.004811, 0.003574, 0.001787, 0.0011, 0.001512, 0.000825],
  },
  // NVDA: 6850根日线，最优概率（18切片取最大值，6位精度）
  NVDA: {
    up:   [0.214286, 0.1, 0.050898, 0.05, 0.013577, 0.009781, 0.007007, 0.00438, 0.003212, 0.001898, 0.002336, 0.000438],
    down: [0.154472, 0.15, 0.048947, 0.028759, 0.01708, 0.012555, 0.009901, 0.006, 0.00292, 0.002044, 0.000584, 0.000292],
  },
  // TSLA: 3974根日线，最优概率（18切片取最大值，6位精度）
  TSLA: {
    up:   [0.168317, 0.119048, 0.056225, 0.033932, 0.028942, 0.05, 0.012, 0.004016, 0.00332, 0.002988, 0.002, 0.000664],
    down: [0.166667, 0.2, 0.05914, 0.04065, 0.05, 0.009462, 0.009106, 0.003097, 0.004, 0.000755, 0.004016, 0.002],
  },
  // META: 3497根日线，最优概率（18切片取最大值，6位精度）
  META: {
    up:   [0.169108, 0.098361, 0.028552, 0.05, 0.007984, 0.002994, 0.001328, 0.000797, 0, 0, 0.000286, 0],
    down: [0.1625, 0.065574, 0.029216, 0.012974, 0.006375, 0.05, 0.000858, 0.000286, 0.000286, 0, 0, 0],
  },
  // SOL: 暂用ETH数据代替
  SOL: {
    up:   [0.110041, 0.111111, 0.056699, 0.040468, 0.028249, 0.037037, 0.020408, 0.037037, 0.007588, 0.006007, 0.017544, 0.011494],
    down: [0.105263, 0.111111, 0.074074, 0.091954, 0.037037, 0.020408, 0.022989, 0.010117, 0.011494, 0.005142, 0.003162, 0.003745],
  },
};
// 全局概率（全量数据固定赔率，口径同上）
const GLOBAL_PROB: Record<string, { up: number[]; down: number[] }> = {
  BTC: {
    up:   [0.12172, 0.06987, 0.04521, 0.03288, 0.018653, 0.008852, 0.009801, 0.006323, 0.006639, 0.005691, 0.002845, 0.001581],
    down: [0.108441, 0.062915, 0.044894, 0.021815, 0.018969, 0.014227, 0.006007, 0.006007, 0.003162, 0.002845, 0.001581, 0.000948],
  },
  ETH: {
    up:   [0.098324, 0.071135, 0.054063, 0.040468, 0.025609, 0.023396, 0.013911, 0.010749, 0.007588, 0.006007, 0.005691, 0.003162],
    down: [0.100221, 0.072716, 0.053114, 0.032564, 0.022447, 0.017072, 0.016124, 0.010117, 0.003794, 0.004742, 0.003162, 0.003162],
  },
  AAPL: {
    up:   [0.123479, 0.062134, 0.031329, 0.018465, 0.010151, 0.006126, 0.002275, 0.001925, 0.0007, 0.000788, 0.000175, 0.00035],
    down: [0.124092, 0.069922, 0.03448, 0.017327, 0.009801, 0.003763, 0.0021, 0.001575, 0.000525, 0.000788, 0.000175, 0.000088],
  },
  MSFT: {
    up:   [0.141174, 0.055539, 0.024552, 0.010791, 0.005346, 0.002574, 0.001485, 0.000297, 0.000792, 0.000495, 0.000099, 0],
    down: [0.128007, 0.054351, 0.022869, 0.007227, 0.004356, 0.001188, 0.00099, 0.000495, 0.000099, 0.000099, 0, 0],
  },
  GOOGL: {
    up:   [0.145531, 0.044962, 0.014131, 0.006056, 0.001468, 0.001835, 0.000367, 0.000367, 0.000184, 0, 0, 0],
    down: [0.130116, 0.041292, 0.01615, 0.007891, 0.002936, 0.000184, 0.001101, 0.000367, 0.000184, 0, 0, 0],
  },
  AMZN: {
    up:   [0.135808, 0.06433, 0.032852, 0.019794, 0.010584, 0.007423, 0.005223, 0.004399, 0.002612, 0.001649, 0.001375, 0.001649],
    down: [0.127835, 0.061993, 0.035601, 0.017457, 0.012784, 0.006186, 0.004811, 0.003574, 0.001787, 0.0011, 0.001512, 0.000825],
  },
  NVDA: {
    up:   [0.127591, 0.07854, 0.044672, 0.026423, 0.013577, 0.009781, 0.007007, 0.00438, 0.003212, 0.001898, 0.002336, 0.000438],
    down: [0.12438, 0.073869, 0.047153, 0.028759, 0.01708, 0.012555, 0.005839, 0.00438, 0.00292, 0.002044, 0.000584, 0.000292],
  },
  TSLA: {
    up:   [0.120282, 0.086563, 0.050075, 0.028435, 0.018118, 0.008052, 0.005788, 0.00302, 0.001761, 0.002265, 0.000503, 0.000503],
    down: [0.130599, 0.081278, 0.050075, 0.030448, 0.017866, 0.007046, 0.006291, 0.002013, 0.001007, 0.000755, 0.001007, 0.000755],
  },
  META: {
    up:   [0.146125, 0.069202, 0.023449, 0.008865, 0.005719, 0.002574, 0.000572, 0.000286, 0, 0, 0.000286, 0],
    down: [0.138118, 0.05519, 0.028024, 0.01058, 0.004861, 0.003432, 0.000858, 0.000286, 0.000286, 0, 0, 0],
  },
  SOL: {
    up:   [0.098324, 0.071135, 0.054063, 0.040468, 0.025609, 0.023396, 0.013911, 0.010749, 0.007588, 0.006007, 0.005691, 0.003162],
    down: [0.100221, 0.072716, 0.053114, 0.032564, 0.022447, 0.017072, 0.016124, 0.010117, 0.003794, 0.004742, 0.003162, 0.003162],
  },
};
// ─── 4档竞猜概率数据（全量切片，6位精度，分界点X=涨幅中位数，Y=跌幅中位数）─────
// X: 涨幅分界点（小涨<X%，大涨≥X%）；Y: 跌幅分界点（小跌<Y%，大跌≥Y%）
const HIST_PROB_4TIER: Record<string, { X: number; Y: number; bigUp: number; smallUp: number; smallDown: number; bigDown: number }> = {
  BTC:   { X: 1.5447, Y: 1.4422, bigUp: 0.256086, smallUp: 0.256086, smallDown: 0.243756, bigDown: 0.244072 },
  ETH:   { X: 2.1494, Y: 2.0387, bigUp: 0.255138, smallUp: 0.255138, smallDown: 0.244388, bigDown: 0.244704 },
  AAPL:  { X: 0.9657, Y: 0.9527, bigUp: 0.257903, smallUp: 0.257903, smallDown: 0.24066,  bigDown: 0.240962 },
  MSFT:  { X: 0.7835, Y: 0.7501, bigUp: 0.250945, smallUp: 0.250794, smallDown: 0.243382, bigDown: 0.243382 },
  GOOGL: { X: 0.8211, Y: 0.7776, bigUp: 0.253074, smallUp: 0.253074, smallDown: 0.245733, bigDown: 0.246284 },
  AMZN:  { X: 1.1614, Y: 1.0868, bigUp: 0.252155, smallUp: 0.252004, smallDown: 0.245954, bigDown: 0.246105 },
  NVDA:  { X: 1.502,  Y: 1.5214, bigUp: 0.251097, smallUp: 0.250945, smallDown: 0.245651, bigDown: 0.245802 },
  TSLA:  { X: 1.647,  Y: 1.5569, bigUp: 0.248364, smallUp: 0.248113, smallDown: 0.250881, bigDown: 0.250881 },
  META:  { X: 1.0294, Y: 0.9801, bigUp: 0.253646, smallUp: 0.253646, smallDown: 0.245353, bigDown: 0.245353 },
  SOL:   { X: 2.1494, Y: 2.0387, bigUp: 0.255138, smallUp: 0.255138, smallDown: 0.244388, bigDown: 0.244704 },
};

const HOUSE_EDGE = 0.25;
const RANGE_LABELS = [
  '≥0%<1%','≥1%<2%','≥2%<3%','≥3%<4%','≥4%<5%','≥5%<6%',
  '≥6%<7%','≥7%<8%','≥8%<9%','≥9%<10%','≥10%<11%','≥11%<12%',
];

// ─── 行情评估9个标的配置（与BE数据页面保持一致）─────────────────
const CDN = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/';
const MARKET_SYMBOLS = [
  { key: 'BTC',   label: 'BTC',   icon: CDN + 'btc_732a725a.png'   },
  { key: 'ETH',   label: 'ETH',   icon: CDN + 'eth_6ebbf353.png'   },
  { key: 'AAPL',  label: 'AAPL',  icon: CDN + 'aapl_3d0ebe4b.png'  },
  { key: 'MSFT',  label: 'MSFT',  icon: CDN + 'msft_6f03ba12.png'  },
  { key: 'GOOGL', label: 'GOOGL', icon: CDN + 'googl_f5e51fc9.png' },
  { key: 'AMZN',  label: 'AMZN',  icon: CDN + 'amzn_62fb91c5.png'  },
  { key: 'NVDA',  label: 'NVDA',  icon: CDN + 'nvda_027844b0.png'  },
  { key: 'TSLA',  label: 'TSLA',  icon: CDN + 'tsla_ce7ce165.png'  },
  { key: 'META',  label: 'META',  icon: CDN + 'meta_c6a365b1.png'  },
];

// ─── 明日涨跌竞猜面板 ─────────────────────────────────────────
function MarketBetPanelWithTabs({ ledgerId }: { ledgerId: number }) {
  const [activeCoin, setActiveCoin] = useState('BTC');
  // 订单列表Tab：最近购买记录 / 持仓订单
  const [orderTab, setOrderTab] = useState<'recent' | 'position'>('recent');
  // 美股休市提示弹窗
  const [closedNotice, setClosedNotice] = useState<{ show: boolean; nextDay: string }>({ show: false, nextDay: '' });

  // 计算目标日期：BTC/ETH始终是明天；美股需要判断交易日和截止时间
  const targetDateStr = useMemo(() => {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // BJT now
    if (!US_STOCK_KEYS.has(activeCoin)) {
      // BTC/ETH: 始终是明天
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow.toISOString().slice(0, 10);
    }
    // 美股：判断当前是否已过截止时间
    const cutoff = getUSMarketCutoff(now);
    const bjtHour = now.getUTCHours();
    const bjtMin = now.getUTCMinutes();
    const pastCutoff = bjtHour > cutoff.hour || (bjtHour === cutoff.hour && bjtMin >= cutoff.minute);
    // 如果已过截止时间，展示下一个交易日（从明天起算）
    if (pastCutoff) {
      return getNextUSTradingDay(now);
    }
    // 未过截止时间：展示今天（如果是交易日）或下一个交易日
    const todayStr = now.toISOString().slice(0, 10);
    if (isUSTradingDay(todayStr)) return todayStr;
    // 今天是非交易日，展示下一个交易日
    return getNextUSTradingDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }, [activeCoin]);

  // 展示用日期标签（X月X日）
  const tomorrowLabel = useMemo(() => {
    const d = new Date(targetDateStr + 'T12:00:00Z');
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return `${m}月${day}日`;
  }, [targetDateStr]);

  // 交易时间段标签
  const timeRangeLabel = useMemo(() => {
    if (!US_STOCK_KEYS.has(activeCoin)) {
      // BTC/ETH：全天候
      return '00:00 ~ 23:59';
    }
    // 美股：判断目标日是否处于夏令时
    const targetDay = new Date(targetDateStr + 'T12:00:00Z');
    if (isUSDST(targetDay)) {
      // 夏令时：美东开盘 BJT 21:30，收盘 BJT次日 04:00
      return 'BJT 21:30 ~ 次日 04:00';
    } else {
      // 冬令时：美东开盘 BJT 22:30，收盘 BJT次日 05:00
      return 'BJT 22:30 ~ 次日 05:00';
    }
  }, [activeCoin, targetDateStr]);

  // 当前北京日期（YYYY-MM-DD）
  const todayBJ = useMemo(() => {
    const nowBJ = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return nowBJ.toISOString().slice(0, 10);
  }, []);

  // 处理Tab点击：美股需检测休市日
  const handleTabClick = (sym: string) => {
    if (US_STOCK_KEYS.has(sym)) {
      const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);
      const cutoff = getUSMarketCutoff(now);
      const bjtHour = now.getUTCHours();
      const bjtMin = now.getUTCMinutes();
      const pastCutoff = bjtHour > cutoff.hour || (bjtHour === cutoff.hour && bjtMin >= cutoff.minute);
      // 如果今天是非交易日（且未开盘），显示休市提示
      if (!isUSTradingDay(todayStr) && !pastCutoff) {
        const nextDay = getNextUSTradingDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        const d = new Date(nextDay + 'T12:00:00Z');
        const nextLabel = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
        setClosedNotice({ show: true, nextDay: nextLabel });
      }
    }
    setActiveCoin(sym);
  };

  // 余额查询（父组件持有，撤单后实时刷新）
  const { refetch: refetchBalanceParent } = trpc.prediction.getBetBalance.useQuery(
    { ledgerId },
    { staleTime: 10000 }
  );

  // 订单列表（在父组件管理，不随币种切换重置）
  const { data: myBetsData, refetch: refetchBets } = trpc.prediction.getMyBets.useQuery(
    { ledgerId, limit: 20 },
    { staleTime: 0 }
  );
  const myBets: any[] = ((myBetsData as any)?.bets ?? []).filter((b: any) => b.status !== 'cancelled');

  // ETH持仓数据
  const { data: ethPositionData } = trpc.prediction.getMyEthPosition.useQuery(
    { ledgerId },
    { staleTime: 30000 }
  );
  const ethPos = ethPositionData as any;

  // 撤销 mutation
  const cancelBetMutation = trpc.prediction.cancelBet.useMutation({
    onSuccess: (data: any) => {
      toast.success('撤销成功', { description: data.message });
      refetchBets();
      refetchBalanceParent();
    },
    onError: (e: any) => {
      toast.error('撤销失败', { description: e.message });
    },
  });

  return (
    <div>
      {/* 金色容器：下单操作区 */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{
        background: 'linear-gradient(160deg, #7a5c00 0%, #b8860b 25%, #d4af37 50%, #b8860b 75%, #7a5c00 100%)',
        border: '2px solid #ffd700',
        boxShadow: '0 6px 32px rgba(212,175,55,0.5), 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.3)',
        isolation: 'isolate',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}>
        {/* 9个标的图标 Tab */}
        <div className="flex overflow-x-auto" style={{
          background: 'rgba(0,0,0,0.18)',
          borderBottom: '1px solid rgba(255,215,0,0.25)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          {MARKET_SYMBOLS.map((sym, i) => {
            const isActive = activeCoin === sym.key;
            const isFirst = i === 0;
            const isLast = i === MARKET_SYMBOLS.length - 1;
            return (
              <button
                key={sym.key}
                onClick={() => handleTabClick(sym.key)}
                className="flex-shrink-0 flex flex-col items-center justify-center transition-all"
                style={{
                  minWidth: '52px',
                  padding: '8px 4px 6px',
                  background: isActive ? 'rgba(0,0,0,0.42)' : 'transparent',
                  borderBottom: isActive ? '3px solid #f5c842' : '3px solid transparent',
                  borderTopLeftRadius: isFirst ? '1rem' : 0,
                  borderTopRightRadius: isLast ? '1rem' : 0,
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
              >
                <img
                  src={sym.icon}
                  alt={sym.label}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: isActive ? '2px solid #f5c842' : '2px solid rgba(255,215,0,0.25)',
                    boxShadow: isActive ? '0 0 8px rgba(245,200,66,0.7)' : 'none',
                    background: '#fff',
                    objectFit: 'cover',
                    transition: 'all 0.2s',
                  }}
                />
                <span style={{
                  fontSize: '0.6rem',
                  marginTop: 3,
                  color: isActive ? '#fff8e1' : 'rgba(255,220,100,0.45)',
                  fontWeight: isActive ? 700 : 400,
                  letterSpacing: '0.02em',
                  transition: 'all 0.2s',
                }}>{sym.label}</span>
              </button>
            );
          })}
        </div>
        {/* 下单操作区（传入tomorrowLabel用于幅度区间旁显示日期） */}
        <MarketBetPanelInner ledgerId={ledgerId} coinKey={activeCoin} onBetPlaced={refetchBets} tomorrowLabel={tomorrowLabel} targetDateStr={targetDateStr} timeRangeLabel={timeRangeLabel} />
      </div>

      {/* 订单列表：独立容器 */}
      <div className="rounded-2xl overflow-hidden mb-3" style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {/* Tab切换标题行 */}
        <div className="flex items-center px-4 py-0" style={{ borderBottom: '1px solid #f0f0f0' }}>
          <button
            className="text-sm font-bold py-3 mr-4 relative"
            style={{
              color: orderTab === 'recent' ? '#1a1a1a' : '#999',
              borderBottom: orderTab === 'recent' ? '2px solid #e53935' : '2px solid transparent',
              marginBottom: '-1px',
            }}
            onClick={() => setOrderTab('recent')}
          >
            最近购买记录{myBets.length > 0 ? `（${myBets.length}）` : ''}
          </button>
          <button
            className="text-sm font-bold py-3 relative"
            style={{
              color: orderTab === 'position' ? '#1a1a1a' : '#999',
              borderBottom: orderTab === 'position' ? '2px solid #4F46E5' : '2px solid transparent',
              marginBottom: '-1px',
            }}
            onClick={() => setOrderTab('position')}
          >
            持仓订单{ethPos?.records?.length > 0 ? `（${ethPos.records.length}）` : ''}
          </button>
        </div>

        {orderTab === 'recent' ? (
        /* 最近购买记录 */
        myBets.length === 0 ? (
          <div className="text-sm text-center py-6" style={{ color: '#bbb' }}>暂无记录</div>
        ) : (
          <div>
            {myBets.map((bet: any, idx: number) => {
              const isEven = idx % 2 === 0;
              const isCancelled = bet.status === 'cancelled';
              const isPending = bet.status === 'pending';
              // 撤销条件：target_date 还未到（即北京时间今天 < target_date）
              // 例：今天 4-17 下单预测 4-18，则 4-17 内可撤销；到了4-18当天则不可撤销
              const canCancel = isPending && todayBJ < String(bet.target_date);
              // 日期简写：4-18
              const shortDate = String(bet.target_date).replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1-$2');

              const rangeMatch = String(bet.range_label).match(/^≥([\d.]+%?)(<[\d.]+%?)$/);
                    const leftPart = rangeMatch ? `${rangeMatch[1]}≤` : bet.range_label;
                    const rightPart = rangeMatch ? rangeMatch[2] : '';
                    const dirColor = bet.direction === 'up' ? '#e53935' : '#43a047';
                    const bjTime = bet.created_at ? new Date(new Date(bet.created_at).getTime() + 8 * 60 * 60 * 1000) : null;
                    const timeStr = bjTime ? `${String(bjTime.getUTCHours()).padStart(2,'0')}:${String(bjTime.getUTCMinutes()).padStart(2,'0')}:${String(bjTime.getUTCSeconds()).padStart(2,'0')}` : '';
              return (
                <div
                  key={bet.id}
                  className="flex items-start justify-between px-4 py-3"
                  style={{
                    background: isEven ? '#ffffff' : '#f9f9f9',
                    borderBottom: idx < myBets.length - 1 ? '1px solid #f0f0f0' : 'none',
                    opacity: isCancelled ? 0.5 : 1,
                  }}
                >
                  {/* 左列：第一行=区间+币种+涨跌幅，第二行=编号+时间 */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1" style={{ color: '#333', fontSize: '0.75rem', fontWeight: 500 }}>
                      <span>{leftPart}</span>
                      <span>{bet.coin} {shortDate}</span>
                      <span style={{ color: dirColor }}>{bet.direction === 'up' ? '涨幅' : '跌幅'}</span>
                      <span>{rightPart}</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ fontSize: '0.7rem', color: '#999' }}>
                      {bet.order_no && <span className="font-mono">编号{bet.order_no}</span>}
                      {timeStr && <span className="font-mono">{timeStr}</span>}
                    </div>
                  </div>
                  {/* 右列：第一行=金额+撤销按钮，第二行=倍数+目标 */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-0.5 ml-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: '#1a1a1a' }}>{parseFloat(bet.bet_amount).toFixed(0)}U</span>
                      {canCancel ? (
                        <button
                          onClick={() => cancelBetMutation.mutate({ ledgerId, betId: bet.id })}
                          disabled={cancelBetMutation.isPending}
                          className="text-xs px-2 py-0.5 rounded-lg font-medium transition-all active:scale-95"
                          style={{ background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }}
                        >
                          {cancelBetMutation.isPending ? '撤销中...' : '撤销'}
                        </button>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-lg" style={{
                          background: isCancelled ? '#f5f5f5' : bet.status === 'won' ? '#ffebee' : bet.status === 'lost' ? '#e8f5e9' : '#fffde7',
                          color: isCancelled ? '#bbb' : bet.status === 'won' ? '#e53935' : bet.status === 'lost' ? '#43a047' : '#f9a825',
                        }}>
                          {isCancelled ? '已撤销' : bet.status === 'won' ? '中奖' : bet.status === 'lost' ? '未中' : '待结算'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1" style={{ fontSize: '0.7rem', color: '#999' }}>
                      <span>{parseFloat(bet.odds).toFixed(2)}x</span>
                      <span>目标<span style={{ color: '#e65100', fontWeight: 600 }}>{parseFloat(bet.expected_return).toFixed(0)}U</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
        ) : (
        /* 持仓订单 Tab */
        <div className="px-4 py-3">
          {/* 汇总统计卡片 */}
          {ethPos?.summary ? (
            <div className="rounded-xl p-3 mb-3" style={{ background: '#f8f7ff', border: '1px solid #e8e5ff' }}>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span style={{ color: '#888' }}>累计买入金额</span>
                  <div className="font-bold" style={{ color: '#1a1a1a' }}>{ethPos.summary.totalBuyAmount.toFixed(2)} U</div>
                </div>
                <div>
                  <span style={{ color: '#888' }}>累计买入ETH</span>
                  <div className="font-bold" style={{ color: '#1a1a1a' }}>{ethPos.summary.totalEthQty.toFixed(6)} ETH</div>
                </div>
                <div>
                  <span style={{ color: '#888' }}>平均买入价</span>
                  <div className="font-bold" style={{ color: '#1a1a1a' }}>{ethPos.summary.avgBuyPrice.toFixed(2)} U</div>
                </div>
                <div>
                  <span style={{ color: '#888' }}>当前ETH价格</span>
                  <div className="font-bold" style={{ color: '#1a1a1a' }}>{ethPos.summary.currentEthPrice.toFixed(2)} U</div>
                </div>
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid #e8e5ff' }}>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span style={{ color: '#888' }}>预测错误金额</span>
                    <div className="font-bold" style={{ color: '#43a047' }}>{ethPos.summary.netLoss.toFixed(2)} U</div>
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>实时持有</span>
                    <div className="font-bold" style={{ color: '#4F46E5' }}>
                      {ethPos.summary.avgBuyPrice > 0
                        ? (ethPos.summary.netLoss / ethPos.summary.avgBuyPrice).toFixed(6) + ' ETH'
                        : '0.000000 ETH'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid #e8e5ff' }}>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span style={{ color: '#888' }}>持仓市值</span>
                    <div className="font-bold" style={{ color: '#1a1a1a' }}>
                      {ethPos.summary.avgBuyPrice > 0
                        ? ((ethPos.summary.netLoss / ethPos.summary.avgBuyPrice) * ethPos.summary.currentEthPrice).toFixed(2) + ' U'
                        : '0.00 U'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>浮盈浮亏</span>
                    {(() => {
                      const holdQty = ethPos.summary.avgBuyPrice > 0 ? ethPos.summary.netLoss / ethPos.summary.avgBuyPrice : 0;
                      const marketVal = holdQty * ethPos.summary.currentEthPrice;
                      const pnl = marketVal - ethPos.summary.netLoss;
                      return (
                        <div className="font-bold" style={{ color: pnl >= 0 ? '#e53935' : '#43a047' }}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} U
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-center py-2" style={{ color: '#bbb' }}>加载中...</div>
          )}

          {/* 持仓明细列表 */}
          {ethPos?.records?.length > 0 ? (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: '#666' }}>买入明细</div>
              {ethPos.records.map((rec: any, idx: number) => {
                const shortDate = String(rec.targetDate).replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1-$2');
                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between py-2"
                    style={{
                      borderBottom: idx < ethPos.records.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: idx % 2 === 0 ? '#fff' : '#f9f9f9',
                      padding: '8px 4px',
                    }}
                  >
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: '#333' }}>
                        <span style={{ color: '#4F46E5', fontWeight: 600 }}>买入ETH</span>
                        <span>{shortDate}</span>
                        {rec.orderNo && <span style={{ color: '#999' }}>编号{rec.orderNo}</span>}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#999' }}>
                        价格 {rec.ethPrice.toFixed(2)} U · 数量 {rec.ethQty.toFixed(6)} ETH
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right ml-2">
                      <div className="text-sm font-bold" style={{ color: '#43a047' }}>-{rec.lossAmount.toFixed(0)} U</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-center py-4" style={{ color: '#bbb' }}>暂无持仓记录</div>
          )}
        </div>
        )}
      </div>

      {/* 美股休市提示弹窗 */}
      {closedNotice.show && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setClosedNotice({ show: false, nextDay: '' })}
        >
          <div
            className="rounded-2xl px-6 py-5 mx-4 text-center"
            style={{
              background: 'linear-gradient(160deg, #1a1200 0%, #3d2e00 50%, #1a1200 100%)',
              border: '2px solid #d4af37',
              boxShadow: '0 8px 32px rgba(212,175,55,0.4)',
              maxWidth: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-3xl mb-2" style={{ lineHeight: 1.2 }}>&#128197;</div>
            <div className="text-base font-bold mb-1" style={{ color: '#f5c842' }}>今日休市</div>
            <div className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.75)' }}>
              美股非交易日，下一交易日为<br />
              <span style={{ color: '#f5c842', fontWeight: 700 }}>{closedNotice.nextDay}</span>
            </div>
            <button
              className="w-full py-2 rounded-xl text-sm font-bold"
              style={{ background: '#d4af37', color: '#1a1200' }}
              onClick={() => setClosedNotice({ show: false, nextDay: '' })}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketBetPanelInner({ ledgerId, coinKey, onBetPlaced, tomorrowLabel, targetDateStr: targetDateStrProp, timeRangeLabel }: { ledgerId: number; coinKey: string; onBetPlaced?: () => void; tomorrowLabel?: string; targetDateStr?: string; timeRangeLabel?: string }) {

  // 4档竞猜：大跌/小跌/小涨/大涨
  type TierChoice = 'bigDown' | 'smallDown' | 'smallUp' | 'bigUp' | null;
  const [tierChoice, setTierChoice] = useState<TierChoice>(null);
  const dir: 'up' | 'down' | null = tierChoice === 'bigUp' || tierChoice === 'smallUp' ? 'up' : tierChoice === 'bigDown' || tierChoice === 'smallDown' ? 'down' : null;

  // 切换标的时自动重置选择
  const prevCoinKeyRef = useRef(coinKey);
  useEffect(() => {
    if (prevCoinKeyRef.current !== coinKey) {
      prevCoinKeyRef.current = coinKey;
      setTierChoice(null);
    }
  }, [coinKey]);
  const [betAmount, setBetAmount] = useState(100);
  const [inputValue, setInputValue] = useState('100'); // 控制输入框显示内容
  const [showConfirm, setShowConfirm] = useState(false);

  // 获取账本余额
  const { data: balanceData, refetch: refetchBalance } = trpc.prediction.getBetBalance.useQuery(
    { ledgerId },
    { staleTime: 10000 }
  );
  const balance = (balanceData as any)?.balance ?? 0;

  // 获取我的竞猜记录（由父组件传入，避免随币种切换重置）
  // myBets 和 refetchBets 通过 props 传入

  // 下单 mutation
  const placeBetMutation = trpc.prediction.placeBet.useMutation({
    onSuccess: (data: any) => {
      toast.success('下单成功！', { description: data.message });
      setShowConfirm(false);
      setTierChoice(null);
      setBetAmount(10);
      refetchBalance();
      onBetPlaced?.();
    },
    onError: (e: any) => {
      toast.error('下单失败', { description: e.message });
      setShowConfirm(false);
    },
  });

  // 4档数据
  const tier4 = HIST_PROB_4TIER[coinKey] || HIST_PROB_4TIER['BTC'];
  const prob = tierChoice ? tier4[tierChoice] : 0;
  const odds = (tierChoice !== null && prob > 0) ? parseFloat((1 / prob * (1 - HOUSE_EDGE)).toFixed(2)) : 0;
  const payout = odds > 0 ? parseFloat((betAmount * odds).toFixed(2)) : 0;
  const MAX_PAYOUT = 100000;
  const maxBetByPayout = odds > 0 ? Math.floor(MAX_PAYOUT / odds) : Infinity;
  const isAtPayoutLimit = payout >= MAX_PAYOUT - 0.5;
  // rangeLabel用于显示和下单
  const rangeLabel = tierChoice === 'bigUp' ? `大涨 ≥${tier4.X.toFixed(2)}%`
    : tierChoice === 'smallUp' ? `小涨 0~${tier4.X.toFixed(2)}%`
    : tierChoice === 'smallDown' ? `小跌 0~${tier4.Y.toFixed(2)}%`
    : tierChoice === 'bigDown' ? `大跌 ≥${tier4.Y.toFixed(2)}%`
    : '未选择';

  // 目标日期：优先使用父组件传入的targetDateStrProp（美股已考虑交易日和截止时间）
  const targetDate = useMemo(() => {
    if (targetDateStrProp) return targetDateStrProp;
    // 备用：如果没有传入，默认展示明天
    const nowBJ = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const tomorrow = new Date(nowBJ);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }, [targetDateStrProp]);
  // 显示用的日期标签：X月X日
  const targetDateLabel = useMemo(() => {
    const d = new Date(targetDate + 'T12:00:00Z');
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return `${m}月${day}日`;
  }, [targetDate]);

  const sliderBg = (val: number, min: number, max: number, color: string) =>
    `linear-gradient(to right, ${color} 0%, ${color} ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) 100%)`;

  const neonUp = { main: '#ff4d4d', glow: 'rgba(255,77,77,0.6)', bg: 'linear-gradient(135deg,#3a0000,#8b0000)', border: '#ff4d4d' };
  const neonDown = { main: '#00e676', glow: 'rgba(0,230,118,0.6)', bg: 'linear-gradient(135deg,#003a1a,#006633)', border: '#00e676' };
  const neonGold = { main: '#d4af37', glow: 'rgba(212,175,55,0.6)', bg: 'linear-gradient(135deg,#1a1200,#3d2e00)', border: '#d4af37' };
  const neon = dir === 'down' ? neonDown : dir === 'up' ? neonUp : neonGold;

  const handleSubmit = () => {
    if (!tierChoice || !dir || odds === 0 || betAmount <= 0) return;
    if (betAmount > balance) {
      toast.error('余额不足', { description: `当前余额 ${balance.toFixed(2)} U` });
      return;
    }
    // 美股七姐妹：校验截止时间
    if (US_STOCK_KEYS.has(coinKey)) {
      const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const cutoff = getUSMarketCutoff(now);
      const bjtHour = now.getUTCHours();
      const bjtMin = now.getUTCMinutes();
      const pastCutoff = bjtHour > cutoff.hour || (bjtHour === cutoff.hour && bjtMin >= cutoff.minute);
      if (pastCutoff) {
        // 已过截止时间，提示已切换到下一交易日
        const nextDay = getNextUSTradingDay(now);
        const d = new Date(nextDay + 'T12:00:00Z');
        const nextLabel = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
        toast.info(`今日下单已截止，已切换至下一交易日 ${nextLabel}`, { duration: 3000 });
        return;
      }
    }
    placeBetMutation.mutate({
      ledgerId,
      coin: coinKey,
      direction: dir,
      rangeIndex: 0, // 4档模式下不使用rangeIndex
      rangeLabel, // 例："大涨 ≥1.54%"
      betAmount,
      odds,
      expectedReturn: payout,
      houseEdge: HOUSE_EDGE,
      probability: prob,
      targetDate,
    });
  };

  return (
    <div>

      {/* 幅度区间标题行 */}
      <div className="mx-4 mt-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>幅度区间</span>
          {tomorrowLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
              background: 'rgba(245,200,66,0.18)',
              color: '#f5c842',
              fontWeight: 600,
              fontSize: '0.65rem',
              border: '1px solid rgba(245,200,66,0.35)',
            }}>{tomorrowLabel}</span>
          )}
        </div>
        {timeRangeLabel && (
          <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>{timeRangeLabel}</div>
        )}
      </div>

      {/* 4档选择按鈕：大涨 | 小涨 | 大跌 | 小跌 */}
      <div className="mx-4 mb-3 grid grid-cols-4 gap-2">
        {([
          { key: 'bigUp' as const,    label: '大涨', sub: `≥${tier4.X.toFixed(2)}%`, color: '#ff4d4d', glow: 'rgba(255,77,77,0.5)', bg: 'linear-gradient(135deg,#3a0000,#8b0000)', border: '#ff4d4d' },
          { key: 'smallUp' as const,  label: '小涨', sub: `0~${tier4.X.toFixed(2)}%`, color: '#ff7070', glow: 'rgba(255,112,112,0.4)', bg: 'linear-gradient(135deg,#1a0000,#4a1010)', border: '#ff7070' },
          { key: 'bigDown' as const,  label: '大跌', sub: `≥${tier4.Y.toFixed(2)}%`, color: '#00e676', glow: 'rgba(0,230,118,0.5)', bg: 'linear-gradient(135deg,#003a1a,#006633)', border: '#00e676' },
          { key: 'smallDown' as const, label: '小跌', sub: `0~${tier4.Y.toFixed(2)}%`, color: '#4caf50', glow: 'rgba(76,175,80,0.4)', bg: 'linear-gradient(135deg,#001a0a,#003318)', border: '#4caf50' },
        ] as const).map(btn => {
          const isSelected = tierChoice === btn.key;
          const tierOdds = parseFloat((1 / tier4[btn.key] * (1 - HOUSE_EDGE)).toFixed(2));
          return (
            <button
              key={btn.key}
              onClick={() => setTierChoice(isSelected ? null : btn.key)}
              className="rounded-xl py-2.5 px-1 flex flex-col items-center gap-0.5 transition-all active:scale-95"
              style={{
                background: isSelected ? btn.bg : 'rgba(0,0,0,0.4)',
                border: `1.5px solid ${isSelected ? btn.border : 'rgba(255,255,255,0.15)'}`,
                boxShadow: isSelected ? `0 0 14px ${btn.glow}` : 'none',
              }}
            >
              <span className="text-sm font-black" style={{ color: isSelected ? btn.color : 'rgba(255,255,255,0.6)' }}>{btn.label}</span>
              <span className="font-bold" style={{ color: isSelected ? btn.color : 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>{btn.sub}</span>
              <span className="font-bold" style={{ color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>{tierOdds}x</span>
            </button>
          );
        })}
      </div>

      {/* 已选择时显示当前赔率卡 */}
      {tierChoice && (
        <div className="mx-4 mb-3 rounded-2xl px-4 py-3" style={{
          background: 'rgba(0,0,0,0.65)',
          border: `1px solid ${neon.border}`,
          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.5), 0 0 10px ${neon.glow}`,
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>已选区间</div>
              <div className="text-lg font-black" style={{ color: neon.main }}>{rangeLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>X</div>
              <div className="text-3xl font-black" style={{ color: neon.main, textShadow: `0 0 12px ${neon.glow}` }}>
                {odds > 0 ? `${odds}x` : '0'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 投入 → 预期获得 */}
          <div className="mx-4 mb-3 rounded-2xl px-4 py-3 flex items-center justify-between" style={{
            background: 'rgba(0,0,0,0.65)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
          }}>
            <div className="flex items-baseline gap-1">
              <div>
                <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>预算</div>
                <div className="flex items-baseline gap-1">
                  <input
                    type="number"
                    min={100}
                    max={Math.max(Math.floor(balance), 100)}
                    value={inputValue}
                    onChange={e => {
                      const raw = e.target.value;
                      setInputValue(raw);
                      const v = Number(raw);
                      if (!isNaN(v) && raw !== '') {
                        const maxByPayout = odds > 0 ? Math.floor(MAX_PAYOUT / odds) : Math.max(Math.floor(balance), 1);
                        setBetAmount(Math.min(Math.max(v, 100), Math.min(Math.max(Math.floor(balance), 100), maxByPayout)));
                      }
                    }}
                    onBlur={e => {
                      const v = Number(e.target.value);
                      const maxByPayout2 = odds > 0 ? Math.floor(MAX_PAYOUT / odds) : Math.max(Math.floor(balance), 1);
                    const clamped = isNaN(v) || e.target.value === '' ? 100 : Math.min(Math.max(v, 100), Math.min(Math.max(Math.floor(balance), 100), maxByPayout2));
                      setBetAmount(clamped);
                      setInputValue(String(clamped));
                    }}
                    className="text-xl font-bold bg-transparent border-b outline-none w-20 text-right"
                    style={{
                      color: '#ffffff',
                      borderColor: 'rgba(255,255,255,0.3)',
                      MozAppearance: 'textfield',
                    }}
                  />
                  <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.5)' }}>U</span>
                </div>
              </div>
            </div>

              <div className="text-right">
              <div className="flex items-center justify-end gap-1 mb-1">
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>预期获得</div>
                {isAtPayoutLimit && <div className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,80,80,0.25)', color: '#ff6b6b', fontSize: '0.6rem', fontWeight: 700 }}>已达上限</div>}
              </div>
              <div className="text-2xl font-black" style={{ color: neon.main, textShadow: `0 0 12px ${neon.glow}` }}>
                {payout > 0 ? payout : '-'}<span className="text-sm font-normal ml-1" style={{ color: 'rgba(255,255,255,0.4)' }}>U</span>
              </div>
            </div>
          </div>

          {/* 投注金额滑动条 */}
          <div className="mx-4 mb-4">
            <input
              type="range" min={100} max={Math.min(Math.max(Math.floor(balance), 100), maxBetByPayout > 0 ? maxBetByPayout : Math.max(Math.floor(balance), 100))} step={1} value={betAmount}
              onChange={e => { const v = Number(e.target.value); setBetAmount(v); setInputValue(String(v)); }}
              className="slider w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderBg(betAmount, 100, Math.min(Math.max(Math.floor(balance), 100), maxBetByPayout > 0 ? maxBetByPayout : Math.max(Math.floor(balance), 100)), '#d4af37'), accentColor: '#d4af37' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span>100 U</span>
              <span>余额 {Math.floor(balance).toLocaleString()} U &nbsp;/&nbsp; 可用 {Math.min(Math.max(Math.floor(balance), 100), maxBetByPayout > 0 && isFinite(maxBetByPayout) ? maxBetByPayout : Math.max(Math.floor(balance), 100)).toLocaleString()} U</span>
            </div>
          </div>

          {/* 确认按钮 */}
          <div className="mx-4 mb-4">
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={tierChoice === null || odds === 0 || betAmount <= 0 || betAmount > balance}
                className="w-full py-3.5 rounded-2xl text-white text-base font-black transition-all active:scale-95 disabled:opacity-30"
                style={{
                  background: neon.bg,
                  border: `2px solid ${neon.border}`,
                  boxShadow: `0 0 20px ${neon.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  letterSpacing: 1,
                }}
              >
                确认提交
              </button>
            ) : (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.35)' }}>
                <div className="text-sm mb-3 text-center" style={{ color: '#3d2000' }}>
                  确认买入 <span style={{ color: '#d4af37' }}>{betAmount} U</span>，{coinKey} 明日 <span style={{ color: neon.main }}>{rangeLabel}</span>？
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(0,0,0,0.15)', color: '#3d2000', border: '1px solid rgba(255,255,255,0.3)' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={placeBetMutation.isPending}
                    className="py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: neon.bg, border: `1px solid ${neon.border}`, color: 'white', boxShadow: `0 0 12px ${neon.glow}` }}
                  >
                    {placeBetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '确认'}
                  </button>
                </div>
              </div>
            )}
          </div>




    </div>
  );
}

function formatCoinQty(qty: number, coin: string): string {
  if (INTEGER_COINS_FIN.has(coin)) return Math.round(qty).toLocaleString('en-US');
  if (coin === 'BTC') return parseFloat(qty.toFixed(6)).toString();
  return parseFloat(qty.toFixed(4)).toString();
}

function formatPrice(p: string | number | undefined) {
  if (p === undefined || p === null) return "--";
  const n = typeof p === "string" ? parseFloat(p) : p;
  if (isNaN(n)) return "--";
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(2);
  return n.toFixed(4);
}
function formatVol(v: string | undefined) {
  if (!v) return "--";
  const n = parseFloat(v);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
function fmtProb(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return "0%";
  return `${(num * 100).toFixed(1)}%`;
}
function fmtEndDate(dateStr: string | null): string {
  if (!dateStr) return "长期";
  const d = new Date(dateStr);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "已截止";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天截止";
  if (days < 30) return `${days}天后截止`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月后截止`;
  return `${Math.floor(months / 12)}年后截止`;
}

// ─── 竞猜骨架屏 ───────────────────────────────────────────────
function EventCardSkeleton() {
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 p-4">
      <div className="h-4 bg-[#2A2E39] rounded-full w-full animate-pulse mb-2" />
      <div className="h-4 bg-[#2A2E39] rounded-full w-3/4 animate-pulse mb-3" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse mb-2" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse" />
    </div>
  );
}

// ─── 竞猜卡片 ─────────────────────────────────────────────────
interface PredictionEvent {
  id: number; question: string; outcomes: string[]; outcomePrices: string[];
  volume: string | null; endDate: string | null; imageUrl: string | null;
  myPrediction: { selectedOutcome: string; selectedIndex: number } | null;
}

function EventCard({ event, ledgerId, onPredicted }: {
  event: PredictionEvent; ledgerId: number; onPredicted: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(
    event.myPrediction ? event.myPrediction.selectedIndex : null
  );
  const [expanded, setExpanded] = useState(false);
  const submitMutation = trpc.prediction.submitPrediction.useMutation({
    onSuccess: () => { toast.success("预测已提交", { description: "你的观点已记录" }); onPredicted(); },
    onError: (e) => toast.error("提交失败", { description: e.message }),
  });
  const { data: statsData } = trpc.prediction.getEventStats.useQuery(
    { ledgerId, eventId: event.id }, { enabled: expanded }
  );
  function handleSelect(idx: number) {
    if (submitMutation.isPending) return;
    setSelected(idx);
    submitMutation.mutate({ ledgerId, eventId: event.id, selectedOutcome: event.outcomes[idx], selectedIndex: idx });
  }
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 relative">
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-medium text-white leading-relaxed">{event.question}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          {event.volume && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />{formatVol(event.volume)} 交易量
            </span>
          )}
          <span>{fmtEndDate(event.endDate)}</span>
        </div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {event.outcomes.map((outcome, idx) => {
          const prob = event.outcomePrices[idx];
          const probNum = parseFloat(prob || "0");
          const isSelected = selected === idx;
          const isYes = idx === 0;
          return (
            <button key={idx} onClick={() => handleSelect(idx)} disabled={submitMutation.isPending}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                isSelected
                  ? isYes ? "bg-[#26a69a]/20 border-[#26a69a]" : "bg-[#ef5350]/20 border-[#ef5350]"
                  : "bg-[#131722] border-[#2A2E39]"
              }`}>
              <div className="flex items-center gap-2">
                {submitMutation.isPending && isSelected
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  : isSelected
                    ? <CheckCircle2 className={`w-4 h-4 ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`} />
                    : <Circle className="w-4 h-4 text-gray-600" />}
                <span className={`text-sm font-medium ${isSelected ? (isYes ? "text-[#26a69a]" : "text-[#ef5350]") : "text-gray-300"}`}>
                  {outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full w-16 bg-[#2A2E39] overflow-hidden">
                  <div className={`h-full rounded-full ${isYes ? "bg-[#26a69a]" : "bg-[#ef5350]"}`}
                    style={{ width: `${Math.round(probNum * 100)}%` }} />
                </div>
                <span className={`text-xs font-semibold w-10 text-right ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {fmtProb(prob)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="border-t border-[#2A2E39]">
          <button onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" />
            {expanded ? "收起成员预测" : "查看成员预测分布"}
          </button>
          {expanded && statsData && (
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-500 mb-2">共 {statsData.total} 人预测</div>
              {event.outcomes.map((outcome, idx) => {
                const displayName = outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome;
                const count = statsData.distribution[outcome] || 0;
                const pct = statsData.total > 0 ? Math.round((count / statsData.total) * 100) : 0;
                return (
                  <div key={idx} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{displayName}</span>
                      <span className="text-gray-500">{count}人 ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-[#2A2E39] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${idx === 0 ? "bg-[#D32F2F]" : "bg-gray-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {submitMutation.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

// ─── 收益权档位详情组件 ──────────────────────────────────────
// 收益权计算逻辑：
// 基准(第0档) = 100 × 0.75 × 0.7 = 52.5 → 对客户显示 100%
// 第N档(N≥2) = 100 ÷ N × 0.7，再除以52.5得到对客户百分比
const TIER_LABELS = [
  { tier: 1, drop: '-10%', ratio: '1/2', pct: '66.7%' },
  { tier: 2, drop: '-20%', ratio: '1/3', pct: '44.4%' },
  { tier: 3, drop: '-30%', ratio: '1/4', pct: '33.3%' },
  { tier: 4, drop: '-40%', ratio: '1/5', pct: '26.7%' },
  { tier: 5, drop: '-50%', ratio: '1/6', pct: '22.2%' },
  { tier: 6, drop: '-60%', ratio: '1/7', pct: '19.0%' },
  { tier: 7, drop: '-70%', ratio: '1/8', pct: '16.7%' },
  { tier: 8, drop: '-80%', ratio: '1/9', pct: '14.8%' },
  { tier: 9, drop: '-90%', ratio: '1/10', pct: '13.3%' },
];

function OrderDetail({ order, timeStr, ledgerId, viewAsUserId }: {
  order: any; timeStr: string; ledgerId: number; viewAsUserId?: number;
}) {
  const { data: tierData, isLoading: tierLoading } = trpc.ledger.afGetTierData.useQuery(
    { orderId: order.id, ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: order.side === 'buy', staleTime: 120000, refetchOnWindowFocus: false, refetchOnMount: false } // 委托中和已成交的买单都查询，2分钟缓存避免重复加载
  );
  // 实时价格（用于计算当前市值）
  const coinSymbol = order.coin === 'BTC' ? 'BTCUSDT' : order.coin === 'ETH' ? 'ETHUSDT' : order.coin === 'SOL' ? 'SOLUSDT' : order.coin + 'USDT';
  const { data: liveTickerData } = trpc.ledger.getBinanceTicker.useQuery(
    { symbol: coinSymbol },
    { enabled: order.side === 'buy', staleTime: 30000, refetchInterval: 30000 }
  );
  const livePrice = liveTickerData ? parseFloat((liveTickerData as any).lastPrice || '0') : 0;
  const cancelMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => { toast.success('委托已撒销'); },
    onError: (e) => toast.error('撒单失败', { description: e.message }),
  });

  // 计算当前所在档位
  const triggeredTiers = new Set((tierData?.triggers || []).map((t: any) => t.tier));
  const maxTriggered = triggeredTiers.size > 0 ? Math.max(...Array.from(triggeredTiers)) : 0;
  const currentTier = maxTriggered; // 0 = 未触发任何档

  const isContract = !order.orderType || order.orderType === '无损合约';
  const isCompleted = order.status === 'completed';

  // 生成订单编号
  const orderDate = new Date(order.createdAt);
  const yy = String(orderDate.getFullYear()).slice(2);
  const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
  const dd = String(orderDate.getDate()).padStart(2, '0');
  const orderNo = `AF${yy}${mm}${dd}${String(order.id).padStart(6, '0')}`;

  return (
    <div className="mt-2 rounded-xl p-3 space-y-2 text-[13px]" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.06)' }}>
      {/* 基本信息 - 统一风格：左侧标签灰色，右侧数値深色，强调数据用品牌色 */}
      <div className="space-y-2">

        {/* 币种：带买/卖标签 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">币种</span>
          <span className="text-[#1E293B] font-medium">
            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
              style={{ backgroundColor: order.side === 'buy' ? '#EFF6FF' : '#FEF2F2', color: order.side === 'buy' ? '#1A56DB' : '#EF4444' }}>
              {order.side === 'buy' ? '买' : '卖'}
            </span>
            {order.coin}
          </span>
        </div>

        {/* 赠送订单：类型 + 来源 */}
        {order.isGift && (() => {
          const multiplier = (order as any).giftMultiplier || '1.5';
          const is10 = multiplier === '1.0';
          return (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">订单类型</span>
              <span className="text-[#1E293B] font-medium">
                {order.sourceUsername && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
                    style={{ backgroundColor: is10 ? '#FFFBEB' : '#EFF6FF', color: is10 ? '#D97706' : '#1A56DB' }}>
                    {order.sourceUsername}
                  </span>
                )}
                {is10 ? '间接推荐奖励' : '推荐人奖励'}
              </span>
            </div>
          );
        })()}

        {/* 价格信息 */}
        {order.isGift ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">成交价格</span>
              <span className="text-[#1E293B]">{parseFloat(order.limitPrice).toLocaleString()} USDT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">实际投入</span>
              <span className="text-[#1E293B]">{(order as any).sourceAmount ? parseFloat((order as any).sourceAmount).toFixed(2) : '--'} USDT</span>
            </div>
            {/* 赠送订单的成交价値（赠送市値）移到持仓数量上方 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">赠送市値</span>
              <span className="font-semibold" style={{ color: (order as any).giftMultiplier === '1.0' ? '#D97706' : '#EF4444' }}>
                {parseFloat(order.amount).toFixed(2)} USDT
                <span className="ml-1 text-[11px] font-normal opacity-70">({((order as any).sourceAmount ? (parseFloat(order.amount) / parseFloat((order as any).sourceAmount)).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : (order as any).giftMultiplier || '1.5')}倍)</span>
              </span>
            </div>
            {/* 持仓数量：计算过程小灰字 + 等号和结果同行显示 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">持仓数量</span>
              <span>
                <span className="text-[11px] text-[#9CA3AF]">{parseFloat(order.amount).toFixed(2)} ÷ {parseFloat(order.limitPrice).toLocaleString()} = </span>
                <span className="text-[#1E293B] font-medium">{parseFloat(order.quantity).toFixed(8).replace(/\.?0+$/, '')} {order.coin}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">{(order as any).originalLimitPrice && (order as any).originalLimitPrice !== order.limitPrice ? '委托价格' : '成交价格'}</span>
              <span className="text-[#1E293B]">{parseFloat((order as any).originalLimitPrice || order.limitPrice).toLocaleString()} USDT</span>
            </div>
            {(order as any).originalLimitPrice && (order as any).originalLimitPrice !== order.limitPrice && (
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">实际成交价</span>
                <span className="font-semibold text-[#1A56DB]">{parseFloat(order.limitPrice).toLocaleString()} USDT</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">实际投入</span>
              <span className="text-[#1E293B]">{parseFloat(order.amount).toFixed(2)} USDT</span>
            </div>
            {/* 成交价値：移到持仓数量上方 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">成交价値</span>
              <span className="font-semibold text-[#1A56DB]">
                {(parseFloat(order.amount) * 5.25).toFixed(2)} USDT
                <span className="ml-1 text-[11px] font-normal opacity-60">(×5.25)</span>
              </span>
            </div>
            {/* 持仓数量：计算过程小灰字 + 等号和结果同行显示 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">持仓数量</span>
              <span>
                <span className="text-[11px] text-[#9CA3AF]">{(parseFloat(order.amount) * 5.25).toFixed(2)} ÷ {parseFloat(order.limitPrice).toLocaleString()} = </span>
                <span className="text-[#1E293B] font-medium">{parseFloat(order.quantity).toFixed(8).replace(/\.?0+$/, '')} {order.coin}</span>
              </span>
            </div>
          </>
        )}

        {/* 管理费（仅已成交订单显示） */}
        {order.side === 'buy' && isContract && (() => {
          // 成交价値：普通订单 = amount×5.25，赠送订单 = amount（赠送市値）
          const amount = parseFloat(order.amount);
          const tradeValue = order.isGift ? amount : amount * 5.25;
          const dailyFee = tradeValue / 0.75 * 0.12 / 365;
          // 持仓天数：已卖出锁定到卖出成交日，否则实时到今天
          const startDate = new Date(order.createdAt);
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDate = order.sellStatus === 'sold' && order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          endDay.setHours(0,0,0,0);
          const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
          const totalFee = dailyFee * holdDays;
          const isSold = order.sellStatus === 'sold';
          return (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">管理费</span>
              <span className="text-[#1E293B] font-medium">
                {dailyFee.toFixed(4)}u × {holdDays}天 = {totalFee.toFixed(4)}u
              </span>
            </div>
          );
        })()}

        {/* 类型 + 状态 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">类型 / 状态</span>
          <span className="text-[#1E293B]">
            {order.orderType === '无损合约' ? '谷底增筹' : (order.orderType || '谷底增筹')}
            <span className="mx-1.5 text-[#CBD5E1]">·</span>
            <span style={{ color: 
              order.sellStatus === 'sold' ? '#6B7280' :
              order.sellStatus === 'selling' ? '#EF4444' :
              order.status === 'completed' ? '#0EA56A' : 
              order.status === 'cancelled' ? '#94A3B8' : '#F59E0B' 
            }}>
              {order.sellStatus === 'sold' ? '已卖出' :
               order.sellStatus === 'selling' ? '委卖中' :
               order.status === 'completed' ? '持仓中' : 
               order.status === 'cancelled' ? '已撒单' : '委买中'}
            </span>
          </span>
        </div>

        {/* 卖出信息（委卖中或已卖出时显示） */}
        {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">委卖价格</span>
            <span className="text-[#EF4444] font-medium">{parseFloat(order.sellPrice).toLocaleString()} USDT</span>
          </div>
        )}

        {/* 净利润和回报率（已卖出时显示，净利润 = 差价收益 - 管理费） */}
        {order.sellStatus === 'sold' && order.sellPrice && order.limitPrice && (() => {
          const buyPrice = parseFloat(order.limitPrice);
          const sellPrice = parseFloat(order.sellPrice);
          const quantity = parseFloat(order.quantity);
          const actualInvestment = parseFloat(order.amount);
          const grossProfit = (sellPrice - buyPrice) * quantity; // 差价收益（未扣管理费）
          // 重新计算管理费（与上方管理费区块保持一致）
          const tradeValue2 = order.isGift ? actualInvestment : actualInvestment * 5.25;
          const dailyFee2 = tradeValue2 / 0.75 * 0.12 / 365;
          const startDate2 = new Date(order.createdAt);
          const startDay2 = new Date(startDate2.getFullYear(), startDate2.getMonth(), startDate2.getDate());
          const endDate2 = order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
          const endDay2 = new Date(endDate2.getFullYear(), endDate2.getMonth(), endDate2.getDate());
          endDay2.setHours(0,0,0,0);
          const holdDays2 = Math.max(1, Math.floor((endDay2.getTime() - startDay2.getTime()) / (1000*60*60*24)) + 1);
          const totalFee2 = dailyFee2 * holdDays2;
          const netProfit = grossProfit - totalFee2; // 净利润 = 差价收益 - 管理费
          const profitRatio = actualInvestment > 0 ? (netProfit / actualInvestment) * 100 : 0;
          const priceGrowth = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0;
          const isPositive = netProfit >= 0;
          return (
            <>
              <div className="flex justify-between items-start">
                <span className="text-[#9CA3AF]">利润</span>
                <div className="flex flex-col items-end">
                  <span className={`font-bold ${grossProfit >= 0 ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{grossProfit >= 0 ? '+' : ''}{grossProfit.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USDT</span>
                  <span className="text-[10px] text-[#9CA3AF] mt-0.5">({sellPrice.toLocaleString()} - {buyPrice.toLocaleString()}) × {quantity.toFixed(4)} B</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">净利润</span>
                <span className={`font-bold ${isPositive ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{isPositive ? '+' : ''}{netProfit.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USDT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">利润比</span>
                <span className={`font-bold ${isPositive ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{isPositive ? '+' : ''}{profitRatio.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">涨幅</span>
                <span className={`font-bold ${priceGrowth >= 0 ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{priceGrowth >= 0 ? '+' : ''}{priceGrowth.toFixed(2)}%</span>
              </div>
            </>
          );
        })()}

        {/* 买入时间 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">买入时间</span>
          <span className="text-[#64748B]">{timeStr}</span>
        </div>
        {/* 卖出时间（已卖出时显示） */}
        {order.sellStatus === 'sold' && order.sellConfirmedAt && (
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">卖出时间</span>            <span className="text-[#64748B]">{order.sellConfirmedAt}</span>         </div>
        )}
        {/* 订单编号 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">订单编号</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#64748B] tracking-wide">{orderNo}</span>
            {(order.status === 'pending' || order.sellStatus === 'selling') && (
              <button
                onClick={() => { 
                  const msg = order.sellStatus === 'selling' ? '确认撒销委托卖出？' : '确认撒销该委托单？';
                  if (window.confirm(msg)) { cancelMutation.mutate({ ledgerId, orderId: order.id }); } 
                }}
                disabled={cancelMutation.isPending}
                className="text-xs font-medium px-2 py-0.5 rounded border"
                style={{ color: '#EF4444', borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
                {cancelMutation.isPending ? '撒销中...' : order.sellStatus === 'selling' ? '撒卖' : '撒单'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 收益权档位表（无损合约买单均显示，包括委托中） */}
      {isContract && order.side === 'buy' && (
        <div className="pt-2" style={{ borderTop: '1px solid #E0E8FF' }}>
          {/* 扫描状态栏 */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold" style={{ color: '#1A56DB' }}>收益权扫描</span>
            {order.sellStatus === 'sold' ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#6B7280' }} />
                <span style={{ color: '#6B7280' }}>已结束</span>
              </div>
            ) : tierData?.scanStatus ? (
              <div className="flex items-center gap-1">
                {tierData.scanStatus.scanning ? (
                  <><Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: '#F59E0B' }} />
                  <span style={{ color: '#F59E0B' }}>扫描中...</span></>
                ) : (
                  <><span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: '#0EA56A' }} />
                  <span style={{ color: '#0EA56A' }}>实时扫描中</span></>
                )}
              </div>
            ) : tierLoading ? (
              <span style={{ color: '#9CA3AF' }}>加载中...</span>
            ) : (
              <span style={{ color: '#9CA3AF' }}>等待扫描</span>
            )}
          </div>

          {/* 扫描信息 */}
          {(tierData?.scanStatus?.lastScanAt || (tierData?.scanCount ?? 0) > 0) ? (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#F5F7FF' }}>

              {/* 用 grid 布局：标签列 | 价格列 | 时间列 */}
              <div className="grid gap-y-1.5" style={{ gridTemplateColumns: '3.5rem 1fr auto' }}>

                {/* 累计扫描行 */}
                <span className="text-[#9CA3AF]">累计扫描</span>
                <span className="font-semibold text-[#1A56DB]">{tierData?.scanCount ?? 0} 次</span>
                <span className="text-[#94A3B8] text-right">每30秒一次</span>

                {/* 上次扫描行 */}
                {(tierData?.latestLowPrice || tierData?.scanStatus?.lastScanAt) && (
                  <>
                    <span className="text-[#9CA3AF]">上次扫描</span>
                    <span className="font-semibold text-[#EF4444]">
                      {tierData?.latestLowPrice ? `${parseFloat(tierData.latestLowPrice).toLocaleString()} USDT` : '--'}
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.scanStatus?.lastScanAt
                        ? new Date(tierData.scanStatus.lastScanAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                        : '--'}
                    </span>
                  </>
                )}

                {/* 历史最低行 */}
                {tierData?.allTimeLowPrice && (
                  <>
                    <span className="text-[#9CA3AF]">历史最低</span>
                    <span className="font-semibold text-[#EF4444]">
                      {parseFloat(tierData.allTimeLowPrice).toLocaleString()} USDT
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.allTimeLowAt
                        ? new Date(tierData.allTimeLowAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                        : '--'}
                    </span>
                  </>
                )}

              </div>
            </div>
          ) : !tierLoading && (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#F5F7FF' }}>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF] w-14 shrink-0">累计扫描</span>
                <span>
                  <span className="text-[#CBD5E1]">0 次</span>
                  <span className="text-[#CBD5E1] mx-1.5">·</span>
                  <span className="text-[#94A3B8]">每30秒一次</span>
                </span>
              </div>
            </div>
          )}

          {/* 收益权档位表 */}
          <div className="mb-1.5" style={{ color: '#6B7A9A' }}>收益权档位表</div>
          {/* 表头 */}
          <div className="grid grid-cols-4 text-xs mb-1 px-1" style={{ color: '#9CA3AF' }}>
            <span>跌幅档</span>
            <span className="text-center">收益权</span>
            <span className="text-center">触发时间</span>
            <span className="text-right">触发价格</span>
          </div>

          {/* 第0档：未触发，收益权100% */}
          <div className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
            style={currentTier === 0
              ? { backgroundColor: 'rgba(14,165,106,0.1)', border: '1px solid rgba(14,165,106,0.4)' }
              : { backgroundColor: '#F8FAFF' }}>
            <span style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF', fontWeight: currentTier === 0 ? 600 : 400 }}>基准</span>
            <span className="text-center font-semibold" style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF' }}>100%</span>
            <span className="text-center" style={{ color: '#C0C8D8' }}>--</span>
            <span className="text-right" style={{ color: '#C0C8D8' }}>{parseFloat(order.limitPrice).toLocaleString()}</span>
          </div>

          {/* 9档 */}
          {TIER_LABELS.map(({ tier, drop, ratio, pct }) => {
            const trigger = (tierData?.triggers || []).find((t: any) => t.tier === tier);
            const isCurrentTier = currentTier === tier;
            const isTriggered = triggeredTiers.has(tier);
            return (
              <div key={tier} className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
                style={isCurrentTier
                  ? { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }
                  : isTriggered
                  ? { backgroundColor: '#EEF2FF' }
                  : { backgroundColor: '#F8FAFF' }}>
                <span style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#6B7A9A' : '#C0C8D8', fontWeight: isCurrentTier ? 600 : 400 }}>{drop}</span>
                <span className="text-center font-semibold" style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#1A56DB' : '#C0C8D8' }}>{pct}</span>
                <span className="text-center text-xs" style={{ color: isTriggered ? '#9CA3AF' : '#D0DBFF' }}>
                  {trigger ? new Date(trigger.triggeredAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '--'}
                </span>
                <span className="text-right" style={{ color: isTriggered ? '#EF4444' : '#C0C8D8' }}>
                  {trigger
                    ? parseFloat(trigger.triggerPrice).toLocaleString()
                    : parseFloat(order.limitPrice) > 0
                      ? (parseFloat(order.limitPrice) * (1 - tier * 0.1)).toFixed(2)
                      : '--'
                  }
                </span>
              </div>
            );
          })}
          {/* 当前收益权摘要 + 市值 + 管理费 */}
          <div className="mt-2 rounded-lg p-3" style={{ backgroundColor: '#EEF2FF' }}>
            {(() => {
              const qty = parseFloat(order.quantity);
              const pctStr = currentTier === 0 ? '100%' : (TIER_LABELS[currentTier - 1]?.pct || '100%');
              const pct = parseFloat(pctStr) / 100;
              const remaining = qty * pct;
              const displayRemaining = remaining.toFixed(6).replace(/[.]?0+$/, '');
              const displayQty = qty.toFixed(6).replace(/[.]?0+$/, '');
              const scanPrice = tierData?.scanStatus?.lowestPrice ? parseFloat(String(tierData.scanStatus.lowestPrice))
                : (tierData?.latestLowPrice ? parseFloat(String(tierData.latestLowPrice)) : 0);
              const refPrice = livePrice > 0 ? livePrice : scanPrice;
              const refPriceLabel = livePrice > 0 ? '' : (scanPrice > 0 ? '扫描价' : '');
              const marketValue = refPrice > 0 ? remaining * refPrice : null;
              const amount = parseFloat(order.amount);
              const tradeValue = order.isGift ? amount : amount * 5.25;
              const dailyFee = tradeValue / 0.75 * 0.12 / 365;
              const startDate = new Date(order.createdAt);
              const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
              const endDate = order.sellStatus === 'sold' && order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
              const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              endDay.setHours(0,0,0,0);
              const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
              const totalFee = dailyFee * holdDays;
              const tierColor = currentTier === 0 ? '#0EA56A' : '#EF4444';
              const labelStyle = { color: '#6B7A9A' } as React.CSSProperties;
              const dimStyle = { color: '#9CA3AF' } as React.CSSProperties;
              return (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span style={labelStyle}>当前收益权</span>
                    <span className="font-semibold" style={{ color: tierColor }}>
                      {currentTier === 0 ? '100%' : TIER_LABELS[currentTier - 1]?.pct || '--'}
                      <span className="font-normal ml-1" style={dimStyle}>({currentTier === 0 ? '1/1' : TIER_LABELS[currentTier - 1]?.ratio || '--'})</span>
                    </span>
                  </div>
                  <div className="my-1.5" style={{ borderTop: '1px solid #D1D9F0' }} />
                  <div className="flex justify-between items-center text-xs">
                    <span style={labelStyle} className="shrink-0 mr-2">当前持仓数量</span>
                    <span style={dimStyle} className="text-right">{displayQty} × {pctStr} = <span className="font-semibold" style={{ color: '#1A2340' }}>{displayRemaining} {order.coin}</span></span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span style={labelStyle} className="shrink-0 mr-2">当前市值{refPriceLabel ? <span style={dimStyle}> ({refPriceLabel})</span> : null}</span>
                    {marketValue !== null
                      ? <span style={dimStyle} className="text-right">{displayRemaining} × {refPrice.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} = <span className="font-semibold" style={{ color: '#1A56DB' }}>{marketValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u</span></span>
                      : <span style={dimStyle}>--</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span style={labelStyle} className="shrink-0 mr-2">管理费</span>
                    <span style={dimStyle} className="text-right">{dailyFee.toFixed(4)}u × {holdDays}天 = <span className="font-semibold" style={{ color: '#1A2340' }}>{totalFee.toFixed(4)}u</span></span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────

// ─── 备注折叠面板（与资方管理 FunderNoteRow 一致）────────────────
interface FinanceNoteItem { text: string; time: string; }

function parseFinanceNotes(raw: string): FinanceNoteItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as FinanceNoteItem[];
  } catch {}
  return [{ text: raw, time: '' }];
}

function formatFinanceNoteTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${m}月${day}日 ${h}:${min}:${s}`;
}

const FinanceEditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

function NoteRow({ orderId, ledgerId, initialNote, onSaved }: {
  orderId: number;
  ledgerId: number;
  initialNote: string;
  onSaved: (note: string) => void;
}) {
  const [notes, setNotes] = useState<FinanceNoteItem[]>(() => parseFinanceNotes(initialNote));
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const updateNote = trpc.ledger.financeUpdatePublicNote.useMutation();

  const saveNotes = async (newNotes: FinanceNoteItem[]) => {
    setSaving(true);
    try {
      const raw = JSON.stringify(newNotes);
      await updateNote.mutateAsync({ id: orderId, ledgerId, publicNote: raw });
      setNotes(newNotes);
      onSaved(raw);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (idx: number) => {
    if (!editValue.trim()) return;
    const newNotes = notes.map((n, i) =>
      i === idx ? { text: editValue.trim(), time: new Date().toISOString() } : n
    );
    await saveNotes(newNotes);
    setEditingIdx(null);
  };

  const handleAddNote = () => {
    const newNotes = [...notes, { text: '', time: new Date().toISOString() }];
    setNotes(newNotes);
    setEditingIdx(newNotes.length - 1);
    setEditValue('');
    setExpanded(true);
  };

  const handleSaveNew = async (idx: number) => {
    if (!editValue.trim()) {
      setNotes(notes.filter((_, i) => i !== idx));
      setEditingIdx(null);
      return;
    }
    const newNotes = notes.map((n, i) =>
      i === idx ? { text: editValue.trim(), time: new Date().toISOString() } : n
    );
    await saveNotes(newNotes);
    setEditingIdx(null);
  };

  return (
    <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid #E8EFFF' }} onClick={e => e.stopPropagation()}>
      {/* 标题行：备注（左）+ 展开箭头（右） */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0" style={{ color: '#9CA3AF' }}>备注</span>
          {notes.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>{notes.length}</span>
          )}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* 展开状态：显示所有条目，条目间用横线分隔，最后一条下方有添加按钮 */}
      {expanded && (
        <div className="mt-1.5">
          {notes.length === 0 && (
            <div style={{ color: '#C0C8D8' }} className="py-1">暂无备注</div>
          )}
          {notes.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: '1px solid #E8EFFF' }} className="my-1" />}
              <div className="flex items-center gap-1 py-0.5">
                {editingIdx === idx ? (
                  <>
                    <input
                      autoFocus
                      className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none"
                      style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { note.text ? handleSaveEdit(idx) : handleSaveNew(idx); }
                        if (e.key === 'Escape') { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }
                      }}
                      placeholder="输入备注..."
                      maxLength={200}
                    />
                    <button
                      onClick={() => note.text ? handleSaveEdit(idx) : handleSaveNew(idx)}
                      disabled={saving}
                      className="shrink-0 text-xs px-2 py-0.5 rounded"
                      style={{ background: '#3B82F6', color: '#fff' }}
                    >{saving ? '...' : '保存'}</button>
                    <button
                      onClick={() => { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }}
                      className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: '#F3F4F6', color: '#6B7280' }}
                    >取消</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate" style={{ color: '#4B5563' }}>{note.text}</span>
                    {note.time && <span className="shrink-0 text-[10px]" style={{ color: '#C0C8D8' }}>{formatFinanceNoteTime(note.time)}</span>}
                    <button onClick={() => { setEditingIdx(idx); setEditValue(note.text); }} className="shrink-0" title="编辑">
                      <FinanceEditIcon />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {/* 添加按钮在最后一条下方 */}
          <div style={{ borderTop: notes.length > 0 ? '1px solid #E8EFFF' : 'none' }} className="mt-1 pt-1">
            <button
              type="button"
              onClick={handleAddNote}
              className="flex items-center gap-1"
              style={{ color: '#9CA3AF' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CryptoPrediction() {
  const [, params] = useRoute("/ledger/:id/crypto-prediction");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  const urlParams = new URLSearchParams(window.location.search);
  const viewAsUserId = urlParams.get("viewAs") ? parseInt(urlParams.get("viewAs")!) : undefined;
  const initialCoin = (urlParams.get("coin") || "BTC").toUpperCase();
  const coinKey = COIN_CONFIG[initialCoin] ? initialCoin : "BTC";
  const coin = COIN_CONFIG[coinKey];

  const [interval, setIntervalVal] = useState("1h");
  const initialTab = (() => {
    const t = urlParams.get("tab");
    if (t === "market" || t === "spot" || t === "contract" || t === "finance") return t;
    return "contract";
  })() as "contract" | "spot" | "market" | "finance";
  const [tab, setTab] = useState<"contract" | "spot" | "market" | "finance">(initialTab);

  // 委托交易面板状态
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  // 委卖时选中的买入订单 id（支持多选批量卖出）
  const [selectedSellOrderIds, setSelectedSellOrderIds] = useState<Set<number>>(new Set());
  // 订单详情展开状态
  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);
  // 账本信息（用于判断类型，定制 Tab 名称）
  const { data: ledgerInfo } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 60000 }
  );
  const isCustomAF = (ledgerInfo as any)?.type === 'custom_af';
  const isFunder = (ledgerInfo as any)?.userRole === 'funder';

  // 融资付息：订单列表（仅非资方用户在融资付息Tab时加载）
  const { data: financeOrdersData, refetch: refetchFinanceOrders, isFetching: financeOrdersFetching } = trpc.ledger.financeGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF && !isFunder && tab === 'finance' }
  );
  const financeOrders: any[] = (financeOrdersData as any)?.orders ?? [];
  // 融资付息：资产汇总
  const { data: financeAssetSummary } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: isCustomAF && !isFunder && tab === 'finance' }
  );
  // 融资付息：已结利息汇总
  const { data: financeInterestSummary } = trpc.ledger.financeGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds: financeOrders.map((o: any) => o.id) },
    { enabled: isCustomAF && !isFunder && tab === 'finance' && financeOrders.length > 0 }
  );
  // 融资付息：实时价格（与资金方共用同一个 localStorage key）
  const FINANCE_PRICE_CACHE_KEY = `funder_live_prices_${ledgerId}`;
  const freshFinancePrices: Record<string, number> = (financeAssetSummary as any)?.livePrices ?? {};
  // 先读缓存，再用新鲜价格覆盖（保证某个币种价格获取失败时仍显示上次的值）
  let cachedFinancePrices: Record<string, number> = {};
  try { cachedFinancePrices = JSON.parse(localStorage.getItem(FINANCE_PRICE_CACHE_KEY) || '{}'); } catch {}
  const financeLivePrices: Record<string, number> = { ...cachedFinancePrices, ...freshFinancePrices };
  // 有新鲜价格时更新缓存（合并写入，保留未刷新到的币种旧价格）
  if (Object.keys(freshFinancePrices).length > 0) {
    try { localStorage.setItem(FINANCE_PRICE_CACHE_KEY, JSON.stringify(financeLivePrices)); } catch {}
  }

  // 当前登录用户（用于权限判断）
  const { data: meData } = trpc.auth.me.useQuery();
  const currentUserId = (meData as any)?.id;
  const canSeeQQ = currentUserId === 870413 || currentUserId === 4957151;

  // 可用余额（账本总资产）
  const { data: assetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000 }
  );
  const availableUsdt = (assetData as any)?.total ?? 0;
  // 委托订单
  const utils = trpc.useUtils();
  const { data: ordersData, isLoading: ordersLoading } = trpc.ledger.afGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: 'always' }
  );
  const orders: any[] = (ordersData as any[]) || [];
  // 可卖数量（已成交买入 - 已成交卖出）
  const { data: availableSellData } = trpc.ledger.afGetAvailableSell.useQuery(
    { ledgerId, coin: coin.name, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: 'always' }
  );
  const availableSellQty = (availableSellData as any)?.available ?? 0;
  const submitOrderMutation = trpc.ledger.afSubmitOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已提交");
      setOrderAmount("");
      setOrderPrice("");
      setSliderPct(0);
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetAvailableSell.invalidate({ ledgerId, coin: coin.name });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("提交失败", { description: e.message }),
  });

  // 用户自助撤单
  const cancelOrderMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => {
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetAvailableSell.invalidate({ ledgerId, coin: coin.name });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("撤单失败", { description: e.message }),
  });

  // Binance 行情（后端代理）
  const { data: tickerData, isLoading: tickerLoading, refetch: refetchTicker } =
    trpc.ledger.getBinanceTicker.useQuery({ symbol: coin.symbol }, { staleTime: 30000, refetchInterval: 30000 });
  const { data: klinesData, isLoading: klinesLoading, refetch: refetchKlines } =
    trpc.ledger.getBinanceKlines.useQuery({ symbol: coin.symbol, interval, limit: 60 }, { staleTime: 30000 });

  const bars: KlineBar[] = (klinesData as KlineBar[] | undefined) || [];
  const ticker = tickerData as any;
  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isUp = priceChange >= 0;

  // 竞猜（行情评估 Tab）- 从数据库缓存读取，不依赖外网
  const predCoin = (coinKey === "SOL" ? "BTC" : coinKey) as "BTC" | "ETH";

  const { data: eventsData, isLoading: predLoading, error: predErrorRaw, refetch: refetchPredQuery } = trpc.prediction.listEvents.useQuery(
    { ledgerId: ledgerId!, coin: predCoin, limit: 20 },
    { enabled: !!ledgerId && tab === "market", staleTime: 30000, retry: 1 }
  );
  const predError = predErrorRaw ? (predErrorRaw instanceof Error ? predErrorRaw : new Error(predErrorRaw.message)) : null;
  const predFetching = false;

  // 把后端返回的事件格式转为前端 PredictionEvent 格式
  const events: PredictionEvent[] = ((eventsData as any)?.events || []).map((e: any) => ({
    id: e.id,
    question: e.question,
    outcomes: e.outcomes || [],
    outcomePrices: e.outcomePrices || [],
    volume: e.volume || null,
    endDate: e.endDate || null,
    imageUrl: e.imageUrl || null,
    myPrediction: null,
  }));

  // 可见事件列表（通过管理员设置控制）
  const { data: visibleData } = trpc.prediction.getVisibleQuestions.useQuery(
    { ledgerId: ledgerId!, coin: predCoin },
    { enabled: !!ledgerId && tab === "market", staleTime: 30000 }
  );
  const visibleQuestions: string[] = visibleData?.visibleQuestions || [];

  const refetchPred = () => { refetchPredQuery(); };

  // 技术指标
  const analysis = (() => {
    if (bars.length < 20) return null;
    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const n = 14;
    const gains: number[] = [], losses: number[] = [];
    for (let i = closes.length - n; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / n;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / n;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - ma20, 2), 0) / 20;
    const volatility = (Math.sqrt(variance) / ma20) * 100;
    let score = 50;
    if (last > ma5) score += 10;
    if (last > ma20) score += 10;
    if (ma5 > ma20) score += 10;
    if (rsi < 30) score += 15;
    if (rsi > 70) score -= 15;
    if (volatility < 2) score += 5;
    score = Math.min(95, Math.max(5, score));
    const sentiment = score >= 70 ? "偏多" : score >= 50 ? "中性偏多" : score >= 35 ? "中性偏空" : "偏空";
    return { ma5, ma20, rsi, volatility, score, sentiment, last };
  })();

  return (
    <div className="min-h-screen pb-20" style={{ background: '#F0F4FF', color: '#1A2340' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 px-4 pt-3 pb-2 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setLocation(`/ledger/${ledgerId}${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <img src={coin.imgUrl} alt={coin.name} className="w-6 h-6 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="text-base font-semibold">{coin.fullName}（{coin.name}）</span>
        </div>

      </div>

      {/* 视角切换横幅（固定底部） */}
      {viewAsUserId && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-4 py-3 flex items-center justify-between text-sm safe-area-bottom" style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}>
          <span className="font-medium">正在查看他人视角的订单</span>
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.delete('viewAs');
              const qs = params.toString();
              setLocation(`/ledger/${ledgerId}/crypto-prediction${qs ? '?' + qs : ''}`);
            }}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-800"
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="px-4 pt-3">
        <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: '#E8EEFF' }}>
          {(isCustomAF && !isFunder ? [
            { key: "contract", label: "谷底增筹" },
            { key: "finance", label: "融资付息" },
            { key: "market", label: "行情评估" },
          ] : [
            { key: "contract", label: isCustomAF ? "谷底增筹" : "无损合约" },
            { key: "market", label: "行情评估" },
          ]).map((t) => (
            <button key={t.key} onClick={() => {
              setTab(t.key as any);
            }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key ? "text-white shadow-sm" : "text-gray-500"
              }`}
              style={tab === t.key ? { backgroundColor: '#1A56DB' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="px-4 pt-3">

        {/* 无损合约 */}
        {tab === "contract" && (
          <div className="space-y-3 pb-4">
            {/* 委买 / 委卖 切换 */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #D0DBFF' }}>
              <button
                onClick={() => { setOrderSide("buy"); setOrderAmount(""); setSliderPct(0); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  orderSide === "buy" ? "text-white" : "text-gray-500"
                }`}
                style={orderSide === "buy" ? { backgroundColor: '#1A56DB' } : { backgroundColor: '#F0F4FF' }}>
                委买
              </button>
              <button
                onClick={() => { setOrderSide("sell"); setOrderAmount(""); setSliderPct(0); setSelectedSellOrderIds(new Set()); setOrderPrice(""); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  orderSide === "sell" ? "text-white" : "text-gray-500"
                }`}
                style={orderSide === "sell" ? { backgroundColor: '#EF4444' } : { backgroundColor: '#F0F4FF' }}>
                委卖
              </button>
            </div>

            {/* 限价委托价格下拉选择器 */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D0DBFF' }}>
              <span className="text-sm w-14 flex-shrink-0" style={{ color: '#6B7A9A' }}>限价委托</span>
              <select
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: orderPrice ? '#1A2340' : '#9CA3AF', appearance: 'none', WebkitAppearance: 'none' }}
              >
                <option value="">选择价格</option>
                {((orderSide === 'sell' ? SELL_PRICE_OPTIONS : BUY_PRICE_OPTIONS)[coin.name] || []).map((p) => (
                  <option key={p} value={p.toString()}>{p.toLocaleString()} USDT</option>
                ))}
              </select>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#9CA3AF' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>

            {/* 委买模式：金额输入 + 进度条 + 可用余额 */}
            {orderSide === "buy" && (
              <>
                {/* 金额输入框 */}
                <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D0DBFF' }}>
                  <span className="text-sm w-14" style={{ color: '#6B7A9A' }}>金额</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={orderAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOrderAmount(val);
                      const num = parseFloat(val);
                      if (!isNaN(num) && availableUsdt > 0) {
                        setSliderPct(Math.min(100, Math.round((num / availableUsdt) * 100)));
                      } else {
                        setSliderPct(0);
                      }
                    }}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: '#1A2340' }}
                  />
                  <span className="text-sm" style={{ color: '#9CA3AF' }}>USDT</span>
                </div>
                {/* 5档进度条 */}
                <div className="px-0">
                  <div className="relative h-8 flex items-center select-none">
                    <div className="absolute left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: '#D0DBFF' }} />
                    <div className="absolute left-0 h-0.5 rounded-full" style={{ width: `${sliderPct}%`, backgroundColor: "#1A56DB" }} />
                    {[0, 25, 50, 75, 100].map((pct, idx) => {
                      let leftPx: string;
                      if (idx === 0) leftPx = '0px';
                      else if (idx === 4) leftPx = 'calc(100% - 6px)';
                      else leftPx = `calc(${pct}% - 3px)`;
                      return (
                        <div key={pct} className="absolute w-1.5 h-1.5 rounded-full z-10 pointer-events-none"
                          style={{ left: leftPx, backgroundColor: sliderPct >= pct ? "#1A56DB" : "#D0DBFF" }} />
                      );
                    })}
                    <div className="absolute w-4 h-4 rounded-full shadow-lg z-20 pointer-events-none"
                      style={{ backgroundColor: '#1A56DB', left: sliderPct === 0 ? '0px' : sliderPct === 100 ? 'calc(100% - 16px)' : `calc(${sliderPct}% - 8px)` }} />
                    <input type="range" min={0} max={100} step={1} value={sliderPct}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSliderPct(val);
                        const amt = availableUsdt > 0 ? (availableUsdt * val / 100) : 0;
                        setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                      }}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer z-30" />
                  </div>
                  <div className="flex justify-between mt-1">
                    {["0%", "25%", "50%", "75%", "100%"].map((label) => (
                      <span key={label} className="text-xs text-gray-600">{label}</span>
                    ))}
                  </div>
                </div>
                {/* 可用金额 + 充値按钮 */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs" style={{ color: '#9CA3AF' }}>可用</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#1A2340' }}>
                      {availableUsdt > 0 ? availableUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
                    </span>
                    <button onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                      className="w-5 h-5 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: '#E8EEFF', color: '#1A56DB' }} title="充值">
                      <span className="text-xs leading-none">+</span>
                    </button>

                  </div>
                </div>
                {/* 可买数量 - 实时计算公式展示 */}
                <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#EEF2FF', border: '1px solid #D0DBFF' }}>
                  {(() => {
                    const amt = parseFloat(orderAmount);
                    const price = parseFloat(orderPrice);
                    const hasAmt = !isNaN(amt) && amt > 0;
                    const hasPrice = !isNaN(price) && price > 0;
                    const qty = hasAmt && hasPrice ? ((amt / price) * 5.25) : null;
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold" style={{ color: '#1A56DB' }}>可买数量（5.25倍收益）</span>
                          <span className="text-sm font-bold" style={{ color: qty !== null ? '#1A2340' : '#9CA3AF' }}>
                            {qty !== null ? `${qty.toFixed(6)} ${coin.name}` : `-- ${coin.name}`}
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: '#6B7A9A' }}>
                          {hasAmt && hasPrice ? (
                            <span>
                              {amt.toLocaleString('en-US', { maximumFractionDigits: 2 })} ÷ {price.toLocaleString()} × 5.25 = <span className="font-semibold" style={{ color: '#1A56DB' }}>{qty!.toFixed(6)} {coin.name}</span>
                            </span>
                          ) : hasAmt && !hasPrice ? (
                            <span style={{ color: '#EF4444' }}>请先选择委托价格</span>
                          ) : !hasAmt && hasPrice ? (
                            <span>请滑动选择金额</span>
                          ) : (
                            <span>选择价格并滑动金额后自动计算</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* 委卖模式：已成交买入订单列表选择 */}
            {orderSide === "sell" && (() => {
              const completedBuyOrders = (ordersData as any[] || []).filter(
                (o: any) => (o.status === 'completed' || o.status === 'pending') && o.coin === coin.name
                  && o.sellStatus !== 'selling'   // 排除委卖中（已挂单）
                  && o.sellStatus !== 'sold'       // 排除已卖出
                  // sell_cancelled（已撤销）和 null（未委卖过）都允许再次委卖
              );
              // 显示未卖出且未委托卖的订单（包括委托中和已成交的买单，含撤销后可重新委卖的）
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-xs text-gray-500">选择要卖出的订单（可多选批量卖出）</p>
                  {completedBuyOrders.length > 1 && (
                    <button
                      onClick={() => {
                        const availableIds = completedBuyOrders.map((o: any) => o.id);
                        if (selectedSellOrderIds.size === availableIds.length) {
                          setSelectedSellOrderIds(new Set());
                        } else {
                          setSelectedSellOrderIds(new Set(availableIds));
                        }
                      }}
                      className="text-[10px] text-[#1A56DB] underline"
                    >
                      {selectedSellOrderIds.size === completedBuyOrders.length ? '取消全选' : '全选'}
                    </button>
                  )}
                </div>
                  {completedBuyOrders.length === 0 ? (
                    <p className="text-xs text-gray-600 px-1">暂无已成交的买入订单</p>
                  ) : (
                    completedBuyOrders.map((o: any) => {
                      const isSelected = selectedSellOrderIds.has(o.id);
                      return (
                        <div
                          key={o.id}
                          onClick={() => {
                            const next = new Set(selectedSellOrderIds);
                            if (isSelected) { next.delete(o.id); } else { next.add(o.id); }
                            setSelectedSellOrderIds(next);
                          }}
                          className={`rounded-xl px-4 py-3 border transition-colors ${
                            isSelected
                              ? 'bg-[#2A1A1A] border-[#ef5350] cursor-pointer'
                              : 'bg-[#1C2127] border-transparent cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-[#ef5350] border-[#ef5350]' : 'border-gray-500'
                              }`}>
                                {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-white font-medium">{o.coin}</span>
                                  {o.status === 'pending' && <span className="text-[9px] px-1 py-0.5 rounded" style={{backgroundColor:'rgba(245,158,11,0.2)',color:'#F59E0B'}}>委托中</span>}
                                </div>
                                <span className="text-[10px] text-gray-500">买入价 {parseFloat(o.limitPrice).toLocaleString()} USDT</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-white">{(() => { const q = parseFloat(o.quantity); return q % 1 === 0 ? q.toString() : q.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''); })()} {o.coin}</span>
                              <span className="text-[10px] text-gray-500">金额 {parseFloat(o.amount).toFixed(2)} USDT</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {selectedSellOrderIds.size > 0 && (
                    <p className="text-[10px] text-[#ef5350] px-1">已选 {selectedSellOrderIds.size} 笔，将以相同价格批量委托卖出</p>
                  )}
                </div>
              );
            })()}

            {/* 确认按鈕 */}
            <button
              style={orderSide === "buy" ? { background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' } : { backgroundColor: '#EF4444' }}
              onClick={async () => {
                const price = parseFloat(orderPrice);
                if (!price || price <= 0) { toast.error("请输入委托价格"); return; }
                if (orderSide === "buy") {
                  const amt = parseFloat(orderAmount);
                  if (!amt || amt <= 0) { toast.error("请输入金额"); return; }
                  if (amt > availableUsdt) { toast.error("金额超过可用余额"); return; }
                  const qty = ((amt / price) * 5.25).toFixed(8);
                  submitOrderMutation.mutate({
                    ledgerId,
                    coin: coin.name,
                    side: 'buy',
                    limitPrice: price.toString(),
                    amount: amt.toFixed(2),
                    quantity: qty,
                    orderType: '无损合约',
                  });
                } else {
                  // 委卖：批量提交选中的所有订单
                  if (selectedSellOrderIds.size === 0) { toast.error("请选择要卖出的订单"); return; }
                  const selectedOrders = (ordersData as any[] || []).filter((o: any) => selectedSellOrderIds.has(o.id));
                  if (selectedOrders.length === 0) { toast.error("订单不存在"); return; }
                  // 逐条提交（复用现有单条接口）
                  let successCount = 0;
                  let failCount = 0;
                  for (const selectedOrder of selectedOrders) {
                    try {
                      await submitOrderMutation.mutateAsync({
                        ledgerId,
                        coin: coin.name,
                        side: 'sell',
                        limitPrice: price.toString(),
                        amount: parseFloat(selectedOrder.amount).toFixed(2),
                        quantity: parseFloat(selectedOrder.quantity).toFixed(8),
                        orderType: '无损合约',
                        sourceOrderId: selectedOrder.id,
                      });
                      successCount++;
                    } catch (e: any) {
                      failCount++;
                      console.error('[批量卖出] 订单', selectedOrder.id, '失败:', e.message);
                    }
                  }
                  if (successCount > 0 && failCount === 0) {
                    toast.success(`成功委托卖出 ${successCount} 笔订单`);
                  } else if (successCount > 0 && failCount > 0) {
                    toast.success(`${successCount} 笔成功，${failCount} 笔失败（可能已有委托）`);
                  } else {
                    toast.error(`委托失败，请检查是否已有委托卖出记录`);
                  }
                  setSelectedSellOrderIds(new Set());
                  return;
                }
              }}
              disabled={orderSide === "sell" && selectedSellOrderIds.size === 0}
              className={`w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-opacity ${(
                orderSide === "buy"
                  ? (!orderAmount || parseFloat(orderAmount) <= 0)
                  : selectedSellOrderIds.size === 0
              ) ? "opacity-50" : "opacity-100"}`}
            >
              {submitOrderMutation.isPending ? "提交中..." : orderSide === "buy" ? `买入 ${coin.name}` : selectedSellOrderIds.size > 1 ? `批量卖出 ${selectedSellOrderIds.size} 笔` : `卖出 ${coin.name}`}
            </button>
            {/* 当前委托订单列表 - 独立渲染，不依赖 K 线图加载状态 */}
            {/* 点击详情区域外关闭详情：透明覆盖层 */}
            {orderDetailId !== null && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOrderDetailId(null)}
              />
            )}
            <div className="mt-4 relative z-20">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>
                  当前订单{(!ordersLoading && orders.length > 0) ? `（${orders.length}单）` : ''}
                </span>
                {(!ordersLoading && orders.length > 0) && (() => {
                  const feeOrders = orders.filter((o: any) => o.side === 'buy' && o.status === 'completed' && (o.orderType === '无损合约' || !o.orderType || o.orderType === '谷底增筹'));
                  let unsettledFee = 0;
                  feeOrders.forEach((o: any) => {
                    const isSold = o.sellStatus === 'sold';
                    if (isSold) return;
                    const amount = parseFloat(o.amount);
                    const tradeValue = o.isGift ? amount : amount * 5.25;
                    const dailyFee = tradeValue / 0.75 * 0.12 / 365;
                    const startDate = new Date(o.createdAt);
                    const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                    const endDay = new Date();
                    endDay.setHours(0,0,0,0);
                    const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
                    unsettledFee += dailyFee * holdDays;
                  });
                  return (
                    <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>
                      管理费 <span style={{ color: '#0EA56A' }}>{unsettledFee.toFixed(2)}u</span>
                    </span>
                  );
                })()}
              </div>
              {ordersLoading ? (
                <div className="space-y-2 pt-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="grid items-center gap-1 py-1.5" style={{gridTemplateColumns:'10fr 3fr 2fr 3fr 3fr 2fr'}}>
                      {[90,60,55,65,55,40].map((w, j) => (
                        <div key={j} className={`h-2.5 bg-[#2A2E39] rounded-full animate-pulse ${j > 0 ? 'ml-auto' : ''}`} style={{width:`${w}%`}} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-5 text-gray-500 text-xs">暂无委托记录</div>
              ) : (
                <div>
                  {/* 表头 */}
                  <div className="grid text-xs pb-1.5 mb-0.5" style={{gridTemplateColumns:'7fr 2.5fr 3fr 3fr 2fr', color: '#9CA3AF', borderBottom: '1px solid #E0E8FF'}}>
                    <span>日期</span>
                    <span className="text-center">币种</span>
                    <span className="text-right">数量</span>
                    <span className="text-right">状态</span>
                    <span></span>
                  </div>
                  {orders.map((order) => {
                    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
                    const timeStr = createdAt ? (() => {
                      const y = createdAt.getFullYear();
                      const mo = String(createdAt.getMonth()+1).padStart(2,'0');
                      const d = String(createdAt.getDate()).padStart(2,'0');
                      const h = String(createdAt.getHours()).padStart(2,'0');
                      const mi = String(createdAt.getMinutes()).padStart(2,'0');
                      const s = String(createdAt.getSeconds()).padStart(2,'0');
                      return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
                    })() : '--';
                    return (
                      <div key={order.id} className="py-2" style={{ borderBottom: '1px solid #EEF2FF' }}>
                        <div className="grid text-xs items-center" style={{gridTemplateColumns:'7fr 2.5fr 3fr 3fr 2fr'}}>
                          <span className="whitespace-nowrap" style={{ color: '#6B7A9A' }}>{timeStr}</span>
                          <span className="font-medium text-center" style={{ color: '#1A2340' }}>
                            {order.coin}
                            {(order as any).isGift && <span className="ml-0.5 text-[#ef5350] font-bold animate-pulse">赠</span>}
                          </span>
                          <span className="text-right" style={{ color: '#1A2340' }}>{(() => { const q = parseFloat(order.quantity); return q % 1 === 0 ? q.toString() : q.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''); })()}</span>
                          <span className={`text-right ${
                            (order as any).sellStatus === 'sold' ? 'text-[#6B7280]' :
                            (order as any).sellStatus === 'selling' ? 'text-[#EF4444]' :
                            order.status === 'completed' ? 'text-[#0EA56A]' :
                            order.status === 'cancelled' ? 'text-gray-400' :
                            'text-[#F59E0B]'
                          }`}>
                            {(order as any).sellStatus === 'sold' ? '已卖出' :
                             (order as any).sellStatus === 'selling' ? '委卖中' :
                             order.status === 'completed' ? '持仓中' :
                             order.status === 'cancelled' ? '已撒' :
                             '委买中'}
                          </span>
                          <div className="flex flex-col items-end gap-0.5">
                            {/* 所有状态都显示详情按鈕，撒单移入详情内 */}
                            <button
                              onClick={() => setOrderDetailId(order.id === orderDetailId ? null : order.id)}
                              className="text-xs font-medium" style={{ color: '#1A56DB' }}>
                              详情
                            </button>
                          </div>
                        </div>
                        {/* 详情展开 */}
                        {orderDetailId === order.id && (
                          <OrderDetail order={order} timeStr={timeStr} ledgerId={ledgerId} viewAsUserId={viewAsUserId} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 无损现货 */}
        {tab === "spot" && (
          <div className="space-y-3">
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-sm font-semibold text-white mb-2">无损现货策略</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                通过网格交易与定投结合，在现货市场中分批建仓，利用价格波动自动低买高卖，降低持仓成本，实现无损增持。
              </div>
            </div>
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-xs text-gray-400 mb-3">实时行情</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">当前价</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{formatPrice(ticker?.lastPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H涨跌</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{isUp ? "+" : ""}{priceChange.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最高</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.highPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最低</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.lowPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">成交量</div>
                  <div className="text-sm text-white">{formatVol(ticker?.volume)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">加权均价</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.weightedAvgPrice)}</div>
                </div>
              </div>
            </div>
            {analysis && (
              <div className="bg-[#131722] rounded-2xl p-4">
                <div className="text-xs text-gray-400 mb-3">综合评分</div>
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#2A2E39" strokeWidth="6" />
                      <circle cx="32" cy="32" r="26" fill="none"
                        stroke={analysis.score >= 60 ? "#26a69a" : analysis.score >= 40 ? "#FFA000" : "#ef5350"}
                        strokeWidth="6"
                        strokeDasharray={`${(analysis.score / 100) * 163.4} 163.4`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{Math.round(analysis.score)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{analysis.sentiment}</div>
                    <div className="text-xs text-gray-400 mt-1">波动率 {analysis.volatility.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 融资付息 */}
        {tab === "finance" && (
          <div className="pb-4">
            {/* 融资资产汇总卡片 */}
            {(() => {
              const cb = (financeAssetSummary as any)?.coinBreakdown || {};
              const coins = ['ETH', 'BTC', 'SOL'];
              let totalMarketValue = 0;
              for (const c of coins) {
                const qty = cb[c]?.quantity || 0;
                const price = financeLivePrices[c] || 0;
                totalMarketValue += qty * price;
              }
              const cnyValue = totalMarketValue * 7.15;
              return (
                <div className="rounded-2xl p-4 mb-4" style={{ background: 'linear-gradient(135deg, #1a3a8a 0%, #3B5BDB 100%)' }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-white/70 text-xs">融资资产</span>
                    <span className="text-white/70 text-xs">总市值 {totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U ≈ {cnyValue >= 10000 ? (cnyValue / 10000).toFixed(2) + '万元' : cnyValue.toFixed(0) + '元'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-0">
                    {coins.map((coin, idx) => {
                      const info = cb[coin] || { quantity: 0, avgCost: 0 };
                      const price = financeLivePrices[coin] || 0;
                      const qty = info.quantity || 0;
                      const marketVal = qty * price;
                      return (
                        <div key={coin} className={`${idx < 2 ? 'border-r border-white/20' : ''} px-2`}>
                          <div className="text-white font-bold text-sm mb-1">{coin}</div>
                          <div className="text-white/60 text-[10px]">持有数量</div>
                          <div className="text-white text-xs font-medium">{formatCoinQty(qty, coin)}</div>
                          <div className="text-white/60 text-[10px] mt-1">平均成本</div>
                          <div className="text-white text-xs">{info.avgCost ? info.avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '0 U'}</div>
                          <div className="text-white/60 text-[10px] mt-1">当前价格</div>
                          <div className="text-white text-xs">{price ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '0 U'}</div>
                          <div className="text-white/60 text-[10px] mt-1">当前市值</div>
                          <div className="text-white text-xs">{marketVal ? marketVal.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' U' : '0 U'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {/* 融资订单列表 */}
            <div className="flex items-center mb-3">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>融资订单</h3>
              <span className="text-xs text-gray-400 ml-1.5">共 {financeOrders.length} 笔</span>
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'finance');
                  window.location.href = url.toString();
                }}
                className="ml-2 px-2.5 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: '#EEF2FF', color: '#3B82F6' }}
              >
                刷新
              </button>
            </div>
            {financeOrders.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <div className="text-gray-400 text-base mb-1">暂无融资订单</div>
                <div className="text-gray-400 text-sm">管理员将为您配置融资订单</div>
              </div>
            ) : (
              <div className="space-y-3">
                {financeOrders.map((order: any) => {
                  const paidInterest = (financeInterestSummary as any)?.[order.id] ?? 0;
                  const annualRate = parseFloat(order.interest_rate_annual || order.annualInterestRate || '0');
                  const isNegativeRate = true; // 融资付息页面用户均为付息方，利息一律显示为负数
                  const interestBaseRaw = parseFloat(order.interest_base || order.principal || '0');
                  // FG6127 特殊：interest_base 仅为50%部分，利息按全额（×2）计算；其他订单不变
                  const interestBase = order.order_no === 'FG6127' ? interestBaseRaw * 2 : interestBaseRaw;
                  const startDate = order.interest_start_date || order.startDate || null;
                  const coinQty = parseFloat(order.buy_quantity || order.coinQuantity || '0');
                  const buyPrice = parseFloat(order.buy_price || '0');
                  const buyValue = parseFloat(order.amount || '0');
                  const coinPrice = financeLivePrices[order.coin] || 0;
                  const marketValue = coinQty * coinPrice;
                  const statusLabel = order.status === 'active' ? '持有中' : order.status === 'settled' ? '已结算' : '已取消';
                  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                  const coinColorMap: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF' };
                  const cc = coinColorMap[order.coin] || '#6B7280';
                  // 精确计息（秒级）
                  const nowTs = Date.now();
                  const startTs = startDate ? new Date(startDate + (startDate.includes('T') ? '' : 'T00:00:00')).getTime() : 0;
                  const elapsedSeconds = startTs > 0 ? Math.max(0, (nowTs - startTs) / 1000) : 0;
                  const perSecond = interestBase && annualRate ? (interestBase * Math.abs(annualRate) / 100) / (365 * 24 * 3600) : 0;
                  const accruedInterest = perSecond * elapsedSeconds;
                  let unpaidInterest = Math.max(0, accruedInterest - paidInterest);
                  // 已卖出标记：从 admin_note 中读取 [代付:xxx] 固定代付利息值
                  const _adminNoteForInterest = String(order.admin_note || '');
                  if (_adminNoteForInterest.includes('[已卖出]')) {
                    const _m = _adminNoteForInterest.match(/\[代付:([\d.]+)\]/);
                    if (_m) unpaidInterest = parseFloat(_m[1]);
                  }
                  // 持有时长
                  const holdingLabel = (() => {
                    if (!order.buy_date || order.status !== 'active') return null;
                    // 已卖出标记：从 admin_note 中读取 [持有:xxx] 固定值，若无则默认"1个月"
                    const adminNote = String(order.admin_note || '');
                    if (adminNote.includes('[已卖出]')) {
                      const m = adminNote.match(/\[持有:([^\]]+)\]/);
                      return m ? m[1] : '1个月';
                    }
                    const elapsed = Date.now() - new Date(order.buy_date + 'T00:00:00').getTime();
                    if (elapsed < 0) return null;
                    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
                    const days = Math.floor(totalHours / 24);
                    const hours = totalHours % 24;
                    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                  })();
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl shadow-sm relative"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)', overflow: 'hidden' }}
                    >
                      {String(order.admin_note || '').includes('[已卖出]') && (
                        <div
                          className="absolute bottom-4 left-4 pointer-events-none select-none"
                          style={{ transform: 'rotate(-30deg)', zIndex: 10 }}
                        >
                          <div
                            style={{
                              border: '2px solid rgba(220,38,38,0.5)',
                              color: 'rgba(220,38,38,0.5)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '13px',
                              fontWeight: 700,
                              letterSpacing: '3px',
                              lineHeight: '1.4',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            已卖出
                          </div>
                        </div>
                      )}
                      {/* 顶部色条 */}
                      <div className="h-1" style={{ background: `linear-gradient(90deg, ${cc}, ${cc}55)` }} />

                      {/* 主体：左右两栏 */}
                      <div className="flex" style={{ minHeight: '100px' }}>

                        {/* 左栏：订单信息 */}
                        <div className="flex-1 p-4 pr-3">
                          {/* 标题：融资资产 */}                          <div className="text-[10px] mb-0.5" style={{ color: '#3B82F6' }}>融资资产<span className="text-gray-400">({order.finance_type === '自负盈亏' ? '自负盈亏 100%部分' : '保本分成 50%部分'})</span></div>
                          {/* 持币数量（大字突出） */}
                          <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-2xl font-bold tabular-nums" style={{ color: '#1A2340' }}>
                              {coinQty > 0 ? formatCoinQty(coinQty, order.coin) : '—'}
                            </span>
                            <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
                          </div>
                          {/* 订单详情列表 */}
                          <div className="space-y-0.5">
                            {buyPrice > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入币价</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{buyPrice.toLocaleString()} U</span>
                              </div>
                            )}
                            {buyValue > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入价值</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                              </div>
                            )}
                            {order.buy_date && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入时间</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 shrink-0">今日币价</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>
                                {coinPrice ? coinPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 shrink-0">当前价值</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>
                                {coinPrice && coinQty ? (coinQty * coinPrice).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
                              </span>
                            </div>

                            {order.order_no && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">订单编号</span>
                                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 中间分隔线 */}
                        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

                        {/* 右栏：利息信息 */}
                        <div className="w-44 p-4 pl-3 flex flex-col" style={{ alignSelf: 'stretch' }}>
                          <div className="flex flex-col h-full">
                            {/* 待付/待收利息 */}
                            <div className="flex flex-col justify-start">
                              <div className="flex items-center gap-1 mb-0.5" style={{ height: '16px' }}>
                                <span className="text-[10px]" style={{ color: '#3B82F6' }}>
                                  {isNegativeRate ? '待付利息' : '待收利息'}
                                </span>
                                <span className="text-[10px] text-gray-400">{isNegativeRate ? '(整体部分年化12%)' : `(年化 ${Math.abs(annualRate)}%)`}</span>
                              </div>
                              <div className="flex items-baseline gap-0.5 mb-1">
                                <span
                                  className="text-2xl font-bold tabular-nums leading-tight"
                                  style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                                >
                                  {unpaidInterest > 0 ? '-' : ''}{unpaidInterest.toFixed(2)}
                                </span>
                                <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>USDT</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">{isNegativeRate ? '已付利息' : '已收利息'}</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{paidInterest.toFixed(2)} USDT</span>
                              </div>
                              {startDate && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">计息日期</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {(() => {
                                      const d = startDate.replace(/^\d{4}-(\d{2})-(\d{2}).*$/, (_: string, m: string, dd: string) => `${parseInt(m)}月${parseInt(dd)}日`);
                                      return d;
                                    })()}
                                  </span>
                                </div>
                              )}
                              {holdingLabel && (
                                <div className="flex items-center justify-between mt-0.5 text-xs">
                                  <span className="text-gray-400">持有时长</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{holdingLabel}</span>
                                </div>
                              )}
                              {/* 已卖出：卖出价、卖出币数、订单利润 */}
                              {(() => {
                                const _an = String(order.admin_note || '');
                                if (!_an.includes('[已卖出]')) return null;
                                const sellPriceM = _an.match(/\[卖出价:([\d.]+)\]/);
                                const sellQtyM = _an.match(/\[卖出币数:([^\]]+)\]/);
                                const profitM = _an.match(/\[订单利润:([^\]]+)\]/);
                                return (
                                  <>
                                    {sellPriceM && (
                                      <div className="flex items-center justify-between mt-0.5 text-xs">
                                        <span className="text-gray-400">卖出价</span>
                                        <span className="font-medium" style={{ color: '#4B5563' }}>{sellPriceM[1]} U</span>
                                      </div>
                                    )}
                                    {sellQtyM && (
                                      <div className="flex items-center justify-between mt-0.5 text-xs">
                                        <span className="text-gray-400">卖出币数</span>
                                        <span className="font-medium" style={{ color: '#4B5563' }}>{sellQtyM[1]}</span>
                                      </div>
                                    )}
                                    {profitM && (
                                      <div className="flex items-center justify-between mt-0.5 text-xs">
                                        <span className="text-gray-400">订单利润</span>
                                        <span className="font-medium text-green-600">{profitM[1]}</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              {(() => {
                                const collCoin = order.collateral_coin;
                                const collQty = parseFloat(order.collateral_qty || '0');
                                const hasCollateral = collCoin && collQty > 0;
                                const collPrice = hasCollateral ? (financeLivePrices[collCoin] || 0) : 0;
                                const collValue = collQty * collPrice;
                                const financeType = order.finance_type || '保本分成';
                                // 担保缺口计算：
                                // 保本分成：净担保价值（担保价值 - 已产生利息）- 基数（买入价值 × 24%）
                                //   净担保价值 >= 基数 → 超过100%；否则显示负缺口（红色）
                                // 自负盈亏：当前市值 + 担保价值 - 买入价值（原逻辑）
                                let gap: number | null = null;
                                if (hasCollateral && collPrice > 0) {
                                  if (financeType === '保本分成') {
                                    // 基数 = 买入价值 × 24%
                                    const base = buyValue * 0.24;
                                    // 代付利息 = 待付利息（负利率时为代垫金额，即 unpaidInterest 的绝对值）
                                    // unpaidInterest 已是正数（isNegativeRate 时代表代付金额）
                                    const advancedInterest = isNegativeRate ? unpaidInterest : 0;
                                    // 净担保价值 = 担保价值 - 代付利息
                                    const netCollValue = collValue - advancedInterest;
                                    // 缺口 = 净担保价值 - 基数（负数表示不足）
                                    gap = netCollValue - base;
                                  } else {
                                    // 自负盈亏：
                                    // USDT（稳定币）：担保价值 - 买入价值 - 待收利息
                                    // 其他币种：当前市值 + 担保价值 - 买入价值 - 待收利息
                                    if (order.coin === 'USDT') {
                                      gap = collValue - buyValue - unpaidInterest;
                                    } else if (coinPrice > 0) {
                                      gap = marketValue + collValue - buyValue - unpaidInterest;
                                    }
                                  }
                                }
                                return hasCollateral ? (
                                  <>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保利息</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collQty % 1 === 0 ? collQty.toFixed(0) : collQty}{collCoin}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保价值</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collPrice > 0 ? `${collValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U` : '---'}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-gray-400">担保缺口</span>
                                        {gap !== null && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const modal = document.getElementById(`gap_modal_${order.id}`);
                                              if (modal) modal.style.display = 'flex';
                                            }}
                                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex-shrink-0"
                                            style={{ background: '#9CA3AF', lineHeight: 1 }}
                                          >
                                            ?
                                          </button>
                                        )}
                                      </div>
                                      <span className="font-medium" style={{ color: gap === null ? '#4B5563' : gap < 0 ? '#EF4444' : '#4B5563' }}>
                                        {gap === null ? '---' : gap >= 0 ? '超过100%' : `${gap.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                                      </span>
                                    </div>
                                    {gap !== null && (
                                      <div
                                        id={`gap_modal_${order.id}`}
                                        style={{ display: 'none', position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', alignItems: 'flex-end', justifyContent: 'center' }}
                                        onClick={(e) => {
                                          if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).style.display = 'none';
                                        }}
                                      >
                                        <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px' }}>
                                          <div className="flex items-center justify-between mb-4">
                                            <span className="font-semibold text-sm" style={{ color: '#1A2340' }}>担保缺口计算过程</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const modal = document.getElementById(`gap_modal_${order.id}`);
                                                if (modal) modal.style.display = 'none';
                                              }}
                                              className="text-gray-400 text-lg font-light leading-none"
                                              style={{ lineHeight: 1 }}
                                            >×</button>
                                          </div>
                                          {financeType === '保本分成' ? (
                                            <div className="space-y-2 text-sm" style={{ color: '#6B7280' }}>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>基数 = 买入价値 × 24%</div>
                                                <div style={{ color: '#1F2937' }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} × 24% = <span style={{ color: '#D97706', fontWeight: 600 }}>{(buyValue * 0.24).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保价値 = 担保数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{collQty % 1 === 0 ? collQty.toFixed(0) : collQty.toFixed(4)} {collCoin} × {collPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>代付利息 = 本金 × 年利率 / 365 × 天数</div>
                                                {isNegativeRate ? (() => {
                                                  const elapsedDays = elapsedSeconds / (24 * 3600);
                                                  return (
                                                    <div style={{ color: '#1F2937' }}>
                                                      {interestBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} × {Math.abs(annualRate)}% / 365 × {elapsedDays.toFixed(2)}天
                                                      {' = '}<span style={{ color: '#EF4444', fontWeight: 600 }}>{accruedInterest.toFixed(2)} U</span>
                                                      {paidInterest > 0 && (
                                                        <span style={{ color: '#9CA3AF', fontSize: '11px' }}>（已付 {paidInterest.toFixed(2)} U，待付 <span style={{ color: '#EF4444', fontWeight: 600 }}>{unpaidInterest.toFixed(2)} U</span>）</span>
                                                      )}
                                                    </div>
                                                  );
                                                })() : (
                                                  <div style={{ color: '#1F2937' }}><span style={{ color: '#EF4444', fontWeight: 600 }}>0.00 U</span></div>
                                                )}
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>净担保价値 = 担保价値 - 代付利息</div>
                                                <div style={{ color: '#1F2937' }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {isNegativeRate ? unpaidInterest.toFixed(2) : '0.00'} = <span style={{ color: '#D97706', fontWeight: 600 }}>{(collValue - (isNegativeRate ? unpaidInterest : 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: gap < 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${gap < 0 ? '#FECACA' : '#BBF7D0'}` }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 净担保价値 - 基数</div>
                                                <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{(collValue - (isNegativeRate ? unpaidInterest : 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} - {(buyValue * 0.24).toLocaleString(undefined, { maximumFractionDigits: 2 })} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-2 text-sm" style={{ color: '#6B7280' }}>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>当前市値 = 持币数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{coinQty % 1 === 0 ? coinQty.toFixed(0) : coinQty.toFixed(4)} × {coinPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保价値 = 担保数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{collQty % 1 === 0 ? collQty.toFixed(0) : collQty.toFixed(4)} {collCoin} × {collPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>买入价値</div>
                                                <div style={{ color: '#1F2937' }}><span style={{ color: '#D97706', fontWeight: 600 }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: gap < 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${gap < 0 ? '#FECACA' : '#BBF7D0'}` }}>
                                                {order.coin === 'USDT' ? (
                                                  <>
                                                    <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 担保价値 - 买入价値 - 待收利息</div>
                                                    <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {unpaidInterest.toFixed(2)} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                                  </>
                                                ) : (
                                                  <>
                                                    <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 当前市値 + 担保价値 - 买入价値 - 待收利息</div>
                                                    <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} + {collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {unpaidInterest.toFixed(2)} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                ) : null;
                              })()}
                              {order.counterparty && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">对手方</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.counterparty}</span>
                                </div>
                              )}

                            </div>
                          </div>
                        </div>

                      </div>
                      <NoteRow
                        orderId={order.id}
                        ledgerId={ledgerId}
                        initialNote={order.public_note || ''}
                        onSaved={(newNote: string) => {
                          order.public_note = newNote || null;
                          refetchFinanceOrders();
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 行情评估（竞猜） */}
        {tab === "market" && (
          <MarketBetPanelWithTabs ledgerId={ledgerId} />
        )}
      </div>

    </div>

  );
}
