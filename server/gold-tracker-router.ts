/**
 * 黄金行情路由 - 使用新浪财经获取 XAUUSD 数据
 * 数据源: 新浪财经 hq.sinajs.cn (伦敦金现货，实时无延迟)
 * 稳定性: 国内腾讯云服务器直接访问，无需翻墙
 */
import { Router } from "express";
import axios from "axios";

const router = Router();

const SINA_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://finance.sina.com.cn/",
};

// 内存缓存
let priceCache: { data: any; ts: number } | null = null;
const PRICE_CACHE_TTL = 30 * 1000; // 30秒缓存

let barsCache: { data: any; ts: number } | null = null;
const BARS_CACHE_TTL = 10 * 60 * 1000; // 10分钟缓存（日K线变化慢）

/**
 * 解析新浪财经实时报价字符串
 * 格式: "当前价,昨收,当前价2,开盘,最高,最低,时间,买价,卖价,0,0,0,日期,名称"
 */
function parseSinaQuote(raw: string) {
  const match = raw.match(/hf_XAU="([^"]+)"/);
  if (!match) return null;
  const parts = match[1].split(",");
  if (parts.length < 14) return null;
  const price = parseFloat(parts[0]);
  const prevClose = parseFloat(parts[1]);
  const open = parseFloat(parts[3]);
  const high = parseFloat(parts[4]);
  const low = parseFloat(parts[5]);
  const time = parts[6];
  const date = parts[12];
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
  return {
    symbol: "XAUUSD",
    name: "伦敦金（现货黄金）",
    price: parseFloat(price.toFixed(2)),
    prevClose: parseFloat(prevClose.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    open: parseFloat(open.toFixed(2)),
    marketState: "REGULAR",
    timestamp: Date.now(),
    updateTime: `${date} ${time}`,
    currency: "USD",
    unit: "troy oz",
  };
}

/**
 * GET /api/gold/price
 * 获取黄金当前实时价格（新浪财经，实时无延迟）
 */
router.get("/api/gold/price", async (req, res) => {
  try {
    const now = Date.now();
    if (priceCache && now - priceCache.ts < PRICE_CACHE_TTL) {
      return res.json(priceCache.data);
    }

    const response = await axios.get(
      `https://hq.sinajs.cn/rn=${now}&list=hf_XAU`,
      { headers: SINA_HEADERS, timeout: 8000, responseType: "text" }
    );

    const data = parseSinaQuote(response.data);
    if (!data) throw new Error("Failed to parse Sina quote");

    priceCache = { data, ts: now };
    res.json(data);
  } catch (err: any) {
    console.error("[GoldTracker] price error:", err.message);
    if (priceCache) {
      return res.json({ ...priceCache.data, stale: true });
    }
    res.status(500).json({ error: "Failed to fetch gold price", message: err.message });
  }
});

/**
 * GET /api/gold/bars?range=1y
 * 获取历史K线数据（新浪财经日K线，从2006年至今）
 * range: 1mo, 3mo, 6mo, 1y, 2y, 5y, max
 */
router.get("/api/gold/bars", async (req, res) => {
  try {
    const range = (req.query.range as string) || "1y";
    const now = Date.now();

    // 日K线缓存10分钟
    if (barsCache && now - barsCache.ts < BARS_CACHE_TTL) {
      const filtered = filterBarsByRange(barsCache.data.allBars, range);
      return res.json({ symbol: "XAUUSD", interval: "1d", range, bars: filtered, count: filtered.length });
    }

    // 获取新浪财经日K线（全量，从2006年至今）
    const ts = Date.now();
    const response = await axios.get(
      `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_XAU_240_${ts}=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU&_=${ts}`,
      { headers: SINA_HEADERS, timeout: 15000, responseType: "text" }
    );

    // 解析 JSONP 格式
    const jsonpText = response.data as string;
    const jsonMatch = jsonpText.match(/\(\[(.+)\]\)/s);
    if (!jsonMatch) throw new Error("Failed to parse Sina JSONP");

    const rawBars = JSON.parse(`[${jsonMatch[1]}]`);
    const allBars = rawBars
      .map((b: any) => ({
        time: new Date(b.date).getTime(),
        open: parseFloat(b.open),
        high: parseFloat(b.high),
        low: parseFloat(b.low),
        close: parseFloat(b.close),
        volume: parseInt(b.volume) || 0,
      }))
      .filter((b: any) => b.open > 0 && b.close > 0);

    barsCache = { data: { allBars }, ts: now };

    const filtered = filterBarsByRange(allBars, range);
    res.json({ symbol: "XAUUSD", interval: "1d", range, bars: filtered, count: filtered.length });
  } catch (err: any) {
    console.error("[GoldTracker] bars error:", err.message);
    if (barsCache) {
      const filtered = filterBarsByRange(barsCache.data.allBars, req.query.range as string || "1y");
      return res.json({ symbol: "XAUUSD", interval: "1d", range: req.query.range || "1y", bars: filtered, count: filtered.length, stale: true });
    }
    res.status(500).json({ error: "Failed to fetch gold bars", message: err.message });
  }
});

function filterBarsByRange(allBars: any[], range: string): any[] {
  if (!allBars || allBars.length === 0) return [];
  const now = Date.now();
  const rangeMap: Record<string, number> = {
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
    "max": 99999,
  };
  const days = rangeMap[range] || 365;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return allBars.filter((b: any) => b.time >= cutoff);
}

export default router;
