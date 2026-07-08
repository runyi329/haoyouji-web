/**
 * Cloudflare Worker — 脉动网行情代理
 * 
 * 规则 G：金融数据获取规则（脉动网规则库 005-G）
 * 通道二：美股/港股/黄金/石油/汇率/指数 → 本 Worker 代理新浪财经/Yahoo Finance
 * 
 * 路由：
 *   GET /events              → Polymarket 预测市场（原有功能）
 *   GET /market/gold         → 黄金价格（新浪财经 XAU）
 *   GET /market/oil          → 石油价格（新浪财经 上海原油期货）
 *   GET /market/dxy          → 美元指数（Yahoo Finance DX-Y.NYB）
 *   GET /market/usdcnh       → 离岸人民币 USD/CNH（新浪财经）
 *   GET /market/usdcny       → 在岸人民币 USD/CNY（新浪财经）
 *   GET /market/sh           → 上证指数（新浪财经 sh000001）
 *   GET /market/hsi          → 恒生指数（新浪财经 hkHSI）
 *   GET /market/sp500        → 标普500（Yahoo Finance ^GSPC）
 *   GET /market/us?symbol=XX → 美股个股（Yahoo Finance）
 *   GET /market/hk?symbol=XX → 港股个股（Yahoo Finance）
 */

const POLYMARKET_API = "https://gamma-api.polymarket.com";
const ALLOWED_ORIGINS = "*";

const COIN_KEYWORDS = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth"],
};

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // ===== 原有功能：Polymarket =====
    if (pathname === "/events" && request.method === "GET") {
      const coin = (url.searchParams.get("coin") || "BTC").toUpperCase();
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
      if (coin !== "BTC" && coin !== "ETH") {
        return jsonResponse({ error: "coin must be BTC or ETH" }, 400);
      }
      try {
        const events = await fetchPolymarketEvents(coin, limit);
        return jsonResponse({ events, coin, count: events.length });
      } catch (err) {
        return jsonResponse({ error: err.message, events: [] }, 500);
      }
    }

    // ===== 新功能：市场行情代理 =====
    if (pathname.startsWith("/market/")) {
      const market = pathname.replace("/market/", "");
      try {
        switch (market) {
          case "gold":    return jsonResponse(await fetchGoldPrice());
          case "oil":     return jsonResponse(await fetchOilPrice());
          case "dxy":     return jsonResponse(await fetchYahooPrice("DX-Y.NYB"));
          case "usdcnh":  return jsonResponse(await fetchSinaForex("USDCNH", "USDCNY"));
          case "usdcny":  return jsonResponse(await fetchSinaForex("USDCNY", "USDCNH"));
          case "sh":      return jsonResponse(await fetchSinaIndex("sh000001"));
          case "hsi":     return jsonResponse(await fetchSinaIndex("hkHSI"));
          case "sp500":   return jsonResponse(await fetchYahooPrice("^GSPC"));
          case "us": {
            const symbol = url.searchParams.get("symbol");
            if (!symbol) return jsonResponse({ error: "symbol required" }, 400);
            return jsonResponse(await fetchYahooPrice(symbol.toUpperCase()));
          }
          case "hk": {
            const symbol = url.searchParams.get("symbol");
            if (!symbol) return jsonResponse({ error: "symbol required" }, 400);
            // 港股代码格式：0700.HK
            const hkSymbol = symbol.includes(".") ? symbol : `${symbol}.HK`;
            return jsonResponse(await fetchYahooPrice(hkSymbol));
          }
          default:
            return jsonResponse({ error: "Unknown market endpoint" }, 404);
        }
      } catch (err) {
        return jsonResponse({ success: false, error: err.message, price: 0, prevClose: 0, change: 0, changePercent: 0 }, 500);
      }
    }

    // 健康检查
    if (pathname === "/" || pathname === "/health") {
      return jsonResponse({ status: "ok", service: "haoyouji-market-proxy", time: new Date().toISOString() });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

// ===== 新浪财经：黄金（XAU） =====
async function fetchGoldPrice() {
  const res = await fetch("https://hq.sinajs.cn/list=hf_XAU", {
    headers: { "Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error("parse failed");
  const parts = match[1].split(",");
  const price = parseFloat(parts[0]) || 0;
  const prev = parseFloat(parts[7]) || 0;
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev * 100) : 0;
  return { price, prevClose: prev, change, changePercent, success: price > 0 };
}

// ===== 新浪财经：上海原油期货 =====
async function fetchOilPrice() {
  const res = await fetch("https://hq.sinajs.cn/list=nf_SC0", {
    headers: { "Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error("parse failed");
  const parts = match[1].split(",");
  const price = parseFloat(parts[6]) || parseFloat(parts[3]) || 0;
  const prev = parseFloat(parts[2]) || 0;
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev * 100) : 0;
  return { price, prevClose: prev, change, changePercent, success: price > 0 };
}

// ===== 新浪财经：外汇（USDCNH/USDCNY） =====
async function fetchSinaForex(primary, fallback) {
  const res = await fetch(`https://hq.sinajs.cn/list=${primary},${fallback}`, {
    headers: { "Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  const matchPrimary = text.match(new RegExp(`hq_str_${primary}="([^"]+)"`));
  const matchFallback = text.match(new RegExp(`hq_str_${fallback}="([^"]+)"`));
  const raw = matchPrimary?.[1] || matchFallback?.[1];
  if (!raw) throw new Error("parse failed");
  const parts = raw.split(",");
  const price = parseFloat(parts[1]) || 0;
  const prev = parseFloat(parts[5]) || 0;
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev * 100) : 0;
  return { price, prevClose: prev, change, changePercent, success: price > 0 };
}

// ===== 新浪财经：A股/港股指数 =====
async function fetchSinaIndex(code) {
  const res = await fetch(`https://hq.sinajs.cn/list=${code}`, {
    headers: { "Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error("parse failed");
  const parts = match[1].split(",");
  // 格式因指数而异，取通用字段
  const price = parseFloat(parts[3]) || parseFloat(parts[1]) || 0;
  const prev = parseFloat(parts[2]) || 0;
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev * 100) : 0;
  return { price, prevClose: prev, change, changePercent, success: price > 0 };
}

// ===== Yahoo Finance：美股/港股/指数 =====
async function fetchYahooPrice(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  const d = await res.json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("no meta");
  const price = meta.regularMarketPrice || 0;
  const prev = meta.chartPreviousClose || meta.previousClose || 0;
  const change = price - prev;
  const changePercent = prev > 0 ? (change / prev * 100) : 0;
  return { price, prevClose: prev, change, changePercent, success: price > 0 };
}

// ===== Polymarket（原有功能）=====
async function fetchPolymarketEvents(coin, limit) {
  const keywords = COIN_KEYWORDS[coin];
  const results = [];
  const res = await fetch(
    `${POLYMARKET_API}/events?limit=50&active=true&closed=false&order=volume&ascending=false&tag_slug=crypto`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; polymarket-proxy/1.0)", "Accept": "application/json" } }
  );
  if (!res.ok) throw new Error(`Polymarket API returned ${res.status}`);
  const data = await res.json();
  for (const event of data) {
    const title = (event.title || "").toLowerCase();
    const isMatch = keywords.some((kw) => title.includes(kw));
    if (!isMatch) continue;
    for (const market of event.markets || []) {
      if (market.closed) continue;
      let outcomes, outcomePrices;
      try {
        outcomes = typeof market.outcomes === "string" ? JSON.parse(market.outcomes) : market.outcomes || ["Yes", "No"];
        outcomePrices = typeof market.outcomePrices === "string" ? JSON.parse(market.outcomePrices) : market.outcomePrices || ["0.5", "0.5"];
      } catch {
        outcomes = ["Yes", "No"];
        outcomePrices = ["0.5", "0.5"];
      }
      results.push({
        polymarketEventId: String(event.id),
        polymarketMarketId: String(market.id),
        coin,
        question: market.question || event.title,
        outcomes,
        outcomePrices: outcomePrices.map(String),
        volume: String(market.volume || "0"),
        endDate: market.endDate || event.endDate || null,
        imageUrl: market.image || market.icon || null,
      });
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return results;
}

// ===== 工具函数 =====
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=5",
    },
  });
}

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
