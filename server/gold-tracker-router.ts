/**
 * 黄金行情路由 - 使用 Yahoo Finance 获取 XAUUSD 数据
 * 数据源: Yahoo Finance GC=F (黄金期货，与现货价格高度一致)
 * 延迟: ~10-15分钟（交易所规定的免费数据延迟）
 * 稳定性: 服务器端访问稳定，用户无需翻墙
 */
import { Router } from "express";
import axios from "axios";

const router = Router();

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  "Accept": "application/json",
};

// 内存缓存，避免频繁请求 Yahoo Finance
let priceCache: { data: any; ts: number } | null = null;
const PRICE_CACHE_TTL = 60 * 1000; // 1分钟缓存

let barsCache: Map<string, { data: any; ts: number }> = new Map();
const BARS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * GET /api/gold/price
 * 获取黄金当前价格
 */
router.get("/api/gold/price", async (req, res) => {
  try {
    const now = Date.now();
    if (priceCache && now - priceCache.ts < PRICE_CACHE_TTL) {
      return res.json(priceCache.data);
    }

    const response = await axios.get(`${YF_BASE}/GC%3DF`, {
      params: { interval: "1m", range: "1d" },
      headers: YF_HEADERS,
      timeout: 10000,
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) throw new Error("No data from Yahoo Finance");

    const meta = result.meta;
    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const data = {
      symbol: "XAUUSD",
      name: "黄金现货",
      price: parseFloat(price.toFixed(2)),
      prevClose: parseFloat(prevClose.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      high: parseFloat((meta.regularMarketDayHigh || price).toFixed(2)),
      low: parseFloat((meta.regularMarketDayLow || price).toFixed(2)),
      open: parseFloat((meta.regularMarketOpen || price).toFixed(2)),
      volume: meta.regularMarketVolume || 0,
      marketState: meta.marketState || "CLOSED",
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : now,
      currency: "USD",
      unit: "troy oz",
    };

    priceCache = { data, ts: now };
    res.json(data);
  } catch (err: any) {
    console.error("[GoldTracker] price error:", err.message);
    // 如果有缓存，返回旧缓存
    if (priceCache) {
      return res.json({ ...priceCache.data, stale: true });
    }
    res.status(500).json({ error: "Failed to fetch gold price", message: err.message });
  }
});

/**
 * GET /api/gold/bars?interval=1d&range=1y
 * 获取历史K线数据
 * interval: 1m, 5m, 15m, 1h, 1d, 1wk, 1mo
 * range: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
 */
router.get("/api/gold/bars", async (req, res) => {
  try {
    const interval = (req.query.interval as string) || "1d";
    const range = (req.query.range as string) || "1y";
    const cacheKey = `${interval}_${range}`;
    const now = Date.now();

    const cached = barsCache.get(cacheKey);
    if (cached && now - cached.ts < BARS_CACHE_TTL) {
      return res.json(cached.data);
    }

    const response = await axios.get(`${YF_BASE}/GC%3DF`, {
      params: { interval, range },
      headers: YF_HEADERS,
      timeout: 15000,
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) throw new Error("No data from Yahoo Finance");

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const closes = quotes.close || [];
    const volumes = quotes.volume || [];

    // 过滤掉空值
    const bars = timestamps
      .map((ts: number, i: number) => ({
        time: ts * 1000,
        open: opens[i] ? parseFloat(opens[i].toFixed(2)) : null,
        high: highs[i] ? parseFloat(highs[i].toFixed(2)) : null,
        low: lows[i] ? parseFloat(lows[i].toFixed(2)) : null,
        close: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
        volume: volumes[i] || 0,
      }))
      .filter((b: any) => b.open && b.high && b.low && b.close);

    const data = {
      symbol: "XAUUSD",
      interval,
      range,
      bars,
      count: bars.length,
    };

    barsCache.set(cacheKey, { data, ts: now });
    res.json(data);
  } catch (err: any) {
    console.error("[GoldTracker] bars error:", err.message);
    const cacheKey = `${req.query.interval || "1d"}_${req.query.range || "1y"}`;
    const cached = barsCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached.data, stale: true });
    }
    res.status(500).json({ error: "Failed to fetch gold bars", message: err.message });
  }
});

export default router;
