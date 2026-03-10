/**
 * Polymarket API Proxy - Cloudflare Worker
 * 
 * 用途：代理 Polymarket Gamma API，供腾讯云服务器调用
 * 接口：GET /events?coin=BTC&limit=30
 *       GET /events?coin=ETH&limit=30
 * 
 * 部署后 URL 示例：https://polymarket-proxy.your-name.workers.dev/events?coin=BTC
 */

const POLYMARKET_API = "https://gamma-api.polymarket.com";

// BTC 和 ETH 关键词
const COIN_KEYWORDS = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth"],
};

// 允许调用的来源（你的 haoyouji 服务器域名）
// 设置为 * 表示允许所有来源，生产环境可以改为具体域名
const ALLOWED_ORIGINS = "*";

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 路由：GET /events
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

    // 健康检查
    if (pathname === "/" || pathname === "/health") {
      return jsonResponse({ status: "ok", service: "polymarket-proxy", time: new Date().toISOString() });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

async function fetchPolymarketEvents(coin, limit) {
  const keywords = COIN_KEYWORDS[coin];
  const results = [];

  // 拉取 crypto 分类下最热门的 50 个活跃事件
  const res = await fetch(
    `${POLYMARKET_API}/events?limit=50&active=true&closed=false&order=volume&ascending=false&tag_slug=crypto`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; polymarket-proxy/1.0)",
        "Accept": "application/json",
      },
      // Cloudflare Workers 默认 30s 超时，无需额外设置
    }
  );

  if (!res.ok) {
    throw new Error(`Polymarket API returned ${res.status}`);
  }

  const data = await res.json();

  for (const event of data) {
    const title = (event.title || "").toLowerCase();
    const isMatch = keywords.some((kw) => title.includes(kw));
    if (!isMatch) continue;

    for (const market of event.markets || []) {
      if (market.closed) continue;

      // 解析 outcomes 和 outcomePrices（可能是字符串或数组）
      let outcomes, outcomePrices;
      try {
        outcomes = typeof market.outcomes === "string"
          ? JSON.parse(market.outcomes)
          : market.outcomes || ["Yes", "No"];
        outcomePrices = typeof market.outcomePrices === "string"
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices || ["0.5", "0.5"];
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
      "Cache-Control": "public, max-age=120", // 缓存 2 分钟
    },
  });
}
