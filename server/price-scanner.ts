/**
 * 实时价格扫描器
 * 每3秒从 Gate.io / 火币 / OKX 获取 BTC/ETH/SOL 的最新价格
 * 股票类合约：OKX SWAP → 新浪财经（兜底）
 * Yahoo 美股：Yahoo Finance → 新浪财经（兜底）
 * 内存缓存供盈亏计算使用
 * 数据源优先级与 af-tier-scanner 保持一致：Gate.io > 火币 > OKX
 * 持久化：每次更新后写入本地文件，服务重启时自动恢复上次价格
 */

import fs from 'fs';
import path from 'path';

// 持久化缓存文件路径（服务器本地）
const CACHE_FILE = path.join(process.cwd(), 'price-cache.json');

// 内存价格缓存（含今日开盘价、24h高低价、成交量）
const latestPrices: Record<string, { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number; updatedAt: string }> = {};

// USDT/CNY 实时汇率缓存（默认 7.0 兜底）
let usdtCnyRate: number = 7.0;

/** 从 Gate.io 获取 USDT/CNY 实时汇率（USDT_CNY 交易对） */
async function fetchUsdtCnyRate(): Promise<number | null> {
  try {
    const r = await fetch(
      'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=USDT_CNY',
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (Array.isArray(j) && j[0]?.last) {
        const rate = parseFloat(j[0].last);
        if (rate > 5 && rate < 10) return rate; // 合理范围校验
      }
    }
  } catch {}
  // 备用：OKX 现货 USDT-CNY
  try {
    const r2 = await fetch(
      'https://www.okx.com/api/v5/market/ticker?instId=USDT-CNY',
      { signal: AbortSignal.timeout(5000) }
    );
    if (r2.ok) {
      const j2: any = await r2.json();
      if (j2.code === '0' && j2.data?.[0]?.last) {
        const rate = parseFloat(j2.data[0].last);
        if (rate > 5 && rate < 10) return rate;
      }
    }
  } catch {}
  return null;
}

/** 获取当前 USDT/CNY 汇率（实时，失败时返回上次缓存值） */
export function getUsdtCnyRate(): number {
  return usdtCnyRate;
}

const COINS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM', 'SEI', 'PLUME'];
// 股票类合约（优先 OKX SWAP，兜底新浪财经）
const STOCK_COINS = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG'];
// 优先 Yahoo Finance，兜底新浪财经
const YAHOO_STOCKS = ['CRCL', 'DRAM', 'MU', 'MSTR'];

// 新浪财经美股代码映射（所有股票统一用新浪兜底）
const SINA_CODE_MAP: Record<string, string> = {
  TSLA: 'gb_tsla', NVDA: 'gb_nvda', AAPL: 'gb_aapl', MSFT: 'gb_msft',
  GOOGL: 'gb_googl', META: 'gb_meta', AMZN: 'gb_amzn', SPY: 'gb_spy',
  QQQ: 'gb_qqq', NFLX: 'gb_nflx', ORCL: 'gb_orcl', TSM: 'gb_tsm',
  AMD: 'gb_amd', CL: 'gb_cl', NG: 'gb_ng',
  CRCL: 'gb_crcl', DRAM: 'gb_dram', MU: 'gb_mu', MSTR: 'gb_mstr',
};

// 从文件恢复缓存（服务启动时调用）
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cached = JSON.parse(raw);
      for (const coin of [...COINS, ...STOCK_COINS, ...YAHOO_STOCKS]) {
        if (cached[coin]?.price && cached[coin]?.updatedAt) {
          latestPrices[coin] = { price: cached[coin].price, todayOpen: cached[coin].todayOpen ?? 0, changePercent: cached[coin].changePercent ?? 0, high24h: cached[coin].high24h ?? 0, low24h: cached[coin].low24h ?? 0, volume24h: cached[coin].volume24h ?? 0, quoteVolume24h: cached[coin].quoteVolume24h ?? 0, updatedAt: cached[coin].updatedAt };
        }
      }
      const coins = Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', ');
      if (coins) console.log('[价格扫描] 从缓存文件恢复价格:', coins);
    }
  } catch (e) {
    console.warn('[价格扫描] 读取缓存文件失败（忽略）:', (e as Error).message);
  }
}

// 将当前价格写入文件
function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(latestPrices, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[价格扫描] 写入缓存文件失败（忽略）:', (e as Error).message);
  }
}

/**
 * 获取当日开盘价（火币日K，北京时间 00:00 对齐）
 * 火币日K线的 id 就是当天北京时间 00:00 的 Unix 时间戳
 */
async function fetchTodayOpen(coin: string): Promise<number | null> {
  try {
    const sym = `${coin.toLowerCase()}usdt`;
    const r = await fetch(
      `https://api.huobi.pro/market/history/kline?symbol=${sym}&period=1day&size=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.data?.[0]?.open) {
        return j.data[0].open;
      }
    }
  } catch {}
  return null;
}

async function fetchPriceWithChange(coin: string): Promise<{ price: number; todayOpen: number | null; changePercent: number | null; high24h: number | null; low24h: number | null; volume24h: number | null; quoteVolume24h: number | null } | null> {
  let price: number | null = null;
  let high24h: number | null = null;
  let low24h: number | null = null;
  let volume24h: number | null = null;
  let quoteVolume24h: number | null = null;

  // Gate.io 主用（取价格 + 高低价 + 成交量）
  try {
    const pair = `${coin}_USDT`;
    const r = await fetch(
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0 && data[0].last) {
        const p = parseFloat(data[0].last);
        if (!isNaN(p) && p > 0) {
          price = p;
          if (data[0].high_24h) high24h = parseFloat(data[0].high_24h);
          if (data[0].low_24h) low24h = parseFloat(data[0].low_24h);
          if (data[0].base_volume) volume24h = parseFloat(data[0].base_volume);
          if (data[0].quote_volume) quoteVolume24h = parseFloat(data[0].quote_volume);
        }
      }
    }
  } catch {}

  // 火币备用（获取价格 + 高低价 + 成交量）
  if (!price) {
    try {
      const sym = `${coin.toLowerCase()}usdt`;
      const r = await fetch(
        `https://api.huobi.pro/market/detail/merged?symbol=${sym}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const j: any = await r.json();
        if (j.status === 'ok' && j.tick?.close) {
          price = j.tick.close;
          if (j.tick.high) high24h = j.tick.high;
          if (j.tick.low) low24h = j.tick.low;
          if (j.tick.amount) volume24h = j.tick.amount;
          if (j.tick.vol) quoteVolume24h = j.tick.vol;
        }
      }
    } catch {}
  }

  // OKX 备用（获取价格 + 高低价 + 成交量）
  if (!price) {
    try {
      const instId = `${coin}-USDT`;
      const r = await fetch(
        `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const j: any = await r.json();
        if (j.code === '0' && j.data?.[0]?.last) {
          price = parseFloat(j.data[0].last);
          if (j.data[0].high24h) high24h = parseFloat(j.data[0].high24h);
          if (j.data[0].low24h) low24h = parseFloat(j.data[0].low24h);
          if (j.data[0].vol) volume24h = parseFloat(j.data[0].vol);
          if (j.data[0].volCcy) quoteVolume24h = parseFloat(j.data[0].volCcy);
        }
      }
    } catch {}
  }

  if (!price) return null;

  // 用火币日K线开盘价计算当日涨跌幅（北京时间 00:00 对齐）
  const todayOpen = await fetchTodayOpen(coin);
  // 查不到开盘价时返回 null，让上层保留上次缓存的 changePercent
  const changePercent = todayOpen && todayOpen > 0
    ? ((price - todayOpen) / todayOpen) * 100
    : null;

  return { price, todayOpen, changePercent, high24h, low24h, volume24h, quoteVolume24h };
}

async function fetchPrice(coin: string): Promise<number | null> {
  const result = await fetchPriceWithChange(coin);
  return result ? result.price : null;
}

// Yahoo Finance 专用：获取美股实时价（美元，直接当 USDT 计价）。
// query1 / query2 两个域名互为备用，保证至少一个能拉到。
async function fetchYahooStockPrice(coin: string): Promise<number | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const r = await fetch(
        `https://${host}/v8/finance/chart/${coin}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const j: any = await r.json();
        const meta = j?.chart?.result?.[0]?.meta;
        const p = meta?.regularMarketPrice;
        if (typeof p === 'number' && p > 0) return p;
      }
    } catch {}
  }
  return null;
}

// 股票类合约专用：通过 OKX SWAP 接口获取价格
async function fetchStockPrice(coin: string): Promise<number | null> {
  try {
    const instId = `${coin}-USDT-SWAP`;
    const r = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.code === '0' && j.data?.[0]?.last) {
        return parseFloat(j.data[0].last);
      }
    }
  } catch {}
  return null;
}

/**
 * 新浪财经批量获取美股价格（最后兜底）
 * 格式：var hq_str_gb_tsla="特斯拉,375.53,..."
 * 第2个字段（index=1）是最新价格
 * 国内服务器（腾讯云等）可直接访问，无需翻墙
 */
async function fetchSinaStockPrices(coins: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const validCoins = coins.filter(c => SINA_CODE_MAP[c]);
  if (validCoins.length === 0) return result;

  try {
    const sinaSyms = validCoins.map(c => SINA_CODE_MAP[c]).join(',');
    const r = await fetch(
      `https://hq.sinajs.cn/list=${sinaSyms}`,
      {
        headers: {
          'Referer': 'https://finance.sina.com.cn',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!r.ok) return result;

    const text = await r.text();
    for (const line of text.split('\n')) {
      if (!line.includes('hq_str_gb_')) continue;
      // 解析 sina key: gb_tsla
      const sinaKey = line.split('hq_str_')[1]?.split('=')[0]?.trim();
      if (!sinaKey) continue;
      const val = line.split('"')[1] ?? '';
      const parts = val.split(',');
      // 第1个字段是名称，第2个字段是价格
      const priceStr = parts[1];
      if (!priceStr) continue;
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        // 反查 coin 名
        const coin = Object.entries(SINA_CODE_MAP).find(([, v]) => v === sinaKey)?.[0];
        if (coin) result[coin] = price;
      }
    }
  } catch {}

  return result;
}

async function scanPrices() {
  let updated = false;

  // ── 加密货币：Gate.io > 火币 > OKX ──
  for (const coin of COINS) {
    try {
      const result = await fetchPriceWithChange(coin);
      if (result !== null && result.price > 0) {
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
        latestPrices[coin] = {
          price: result.price,
          todayOpen: result.todayOpen !== null ? result.todayOpen : prevOpen,
          changePercent: result.changePercent !== null ? result.changePercent : prevChange,
          high24h: result.high24h !== null ? result.high24h : (latestPrices[coin]?.high24h ?? 0),
          low24h: result.low24h !== null ? result.low24h : (latestPrices[coin]?.low24h ?? 0),
          volume24h: result.volume24h !== null ? result.volume24h : (latestPrices[coin]?.volume24h ?? 0),
          quoteVolume24h: result.quoteVolume24h !== null ? result.quoteVolume24h : (latestPrices[coin]?.quoteVolume24h ?? 0),
          updatedAt: new Date().toISOString()
        };
        updated = true;
      }
    } catch (err) {
      console.error(`[价格扫描] ${coin} 获取失败:`, err);
    }
  }

  // ── 股票类合约：OKX SWAP 主用，新浪财经兜底 ──
  // 先尝试 OKX，记录哪些失败了
  const stockMissing: string[] = [];
  for (const coin of STOCK_COINS) {
    try {
      const price = await fetchStockPrice(coin);
      if (price !== null && price > 0) {
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
        latestPrices[coin] = { price, todayOpen: prevOpen, changePercent: prevChange, high24h: latestPrices[coin]?.high24h ?? 0, low24h: latestPrices[coin]?.low24h ?? 0, volume24h: latestPrices[coin]?.volume24h ?? 0, quoteVolume24h: latestPrices[coin]?.quoteVolume24h ?? 0, updatedAt: new Date().toISOString() };
        updated = true;
      } else {
        stockMissing.push(coin);
      }
    } catch {
      stockMissing.push(coin);
    }
  }
  // OKX 失败的股票，批量用新浪财经兜底
  if (stockMissing.length > 0) {
    try {
      const sinaResult = await fetchSinaStockPrices(stockMissing);
      for (const coin of stockMissing) {
        const price = sinaResult[coin];
        if (price && price > 0) {
          const prevChange = latestPrices[coin]?.changePercent ?? 0;
          const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
          latestPrices[coin] = { price, todayOpen: prevOpen, changePercent: prevChange, high24h: latestPrices[coin]?.high24h ?? 0, low24h: latestPrices[coin]?.low24h ?? 0, volume24h: latestPrices[coin]?.volume24h ?? 0, quoteVolume24h: latestPrices[coin]?.quoteVolume24h ?? 0, updatedAt: new Date().toISOString() };
          updated = true;
        }
      }
    } catch (err) {
      console.error('[价格扫描] 新浪财经股票兜底失败:', err);
    }
  }

  // ── Yahoo 美股：Yahoo Finance 主用，新浪财经兜底 ──
  const yahooMissing: string[] = [];
  for (const coin of YAHOO_STOCKS) {
    try {
      const price = await fetchYahooStockPrice(coin);
      if (price !== null && price > 0) {
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
        latestPrices[coin] = { price, todayOpen: prevOpen, changePercent: prevChange, high24h: latestPrices[coin]?.high24h ?? 0, low24h: latestPrices[coin]?.low24h ?? 0, volume24h: latestPrices[coin]?.volume24h ?? 0, quoteVolume24h: latestPrices[coin]?.quoteVolume24h ?? 0, updatedAt: new Date().toISOString() };
        updated = true;
      } else {
        yahooMissing.push(coin);
      }
    } catch {
      yahooMissing.push(coin);
    }
  }
  // Yahoo 失败的股票，批量用新浪财经兜底
  if (yahooMissing.length > 0) {
    try {
      const sinaResult = await fetchSinaStockPrices(yahooMissing);
      for (const coin of yahooMissing) {
        const price = sinaResult[coin];
        if (price && price > 0) {
          const prevChange = latestPrices[coin]?.changePercent ?? 0;
          const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
          latestPrices[coin] = { price, todayOpen: prevOpen, changePercent: prevChange, high24h: latestPrices[coin]?.high24h ?? 0, low24h: latestPrices[coin]?.low24h ?? 0, volume24h: latestPrices[coin]?.volume24h ?? 0, quoteVolume24h: latestPrices[coin]?.quoteVolume24h ?? 0, updatedAt: new Date().toISOString() };
          updated = true;
        }
      }
    } catch (err) {
      console.error('[价格扫描] 新浪财经Yahoo兜底失败:', err);
    }
  }

  // 有更新时持久化到文件
  if (updated) saveCacheToFile();

  // 同步更新 USDT/CNY 实时汇率
  try {
    const rate = await fetchUsdtCnyRate();
    if (rate !== null) {
      usdtCnyRate = rate;
    }
  } catch {}
}

export function getLatestPrice(coin: string): number | null {
  // USDT 是稳定币，固定价格为 1 美元
  if (coin.toUpperCase() === 'USDT') return 1.0;
  // CNY 是法币，固定价格为 1（1元人民币 = 1元人民币）
  if (coin.toUpperCase() === 'CNY') return 1.0;
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  // 只要有缓存价格就返回，不设过期限制
  // 服务器无法访问境外API时，至少用上一次持久化缓存的价格显示资产
  return entry.price;
}

export function getAllLatestPrices(): Record<string, { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number; updatedAt: string }> {
  return { ...latestPrices };
}

export function getLatestChangePercent(coin: string): number | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  return entry.changePercent;
}

export function getLatestTickerData(coin: string): { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number } | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  return { price: entry.price, todayOpen: entry.todayOpen, changePercent: entry.changePercent, high24h: entry.high24h, low24h: entry.low24h, volume24h: entry.volume24h, quoteVolume24h: entry.quoteVolume24h };
}

/** 测试任意币种是否能从服务器拉到价格（供管理页面查询新币种使用）
 * 服务器在香港，可直接访问 Gate.io / 火币 / OKX，不受国内网络限制
 */
export async function testCoinPrice(symbol: string): Promise<{ price: number; source: string; supported: boolean }> {
  const coin = symbol.toUpperCase().trim();
  // 先试 Gate.io
  try {
    const r = await fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${coin}_USDT`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0 && data[0].last) {
        const p = parseFloat(data[0].last);
        if (!isNaN(p) && p > 0) return { price: p, source: 'Gate.io', supported: true };
      }
    }
  } catch {}
  // 再试火币
  try {
    const r = await fetch(`https://api.huobi.pro/market/detail/merged?symbol=${coin.toLowerCase()}usdt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.tick?.close) return { price: j.tick.close, source: '火币', supported: true };
    }
  } catch {}
  // 再试 OKX
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j: any = await r.json();
      if (j.code === '0' && j.data?.[0]?.last) {
        const p = parseFloat(j.data[0].last);
        if (!isNaN(p) && p > 0) return { price: p, source: 'OKX', supported: true };
      }
    }
  } catch {}
  return { price: 0, source: 'none', supported: false };
}

export function startPriceScanner() {
  // 先从文件恢复上次的价格（避免重启后短暂显示---）
  loadCacheFromFile();
  // 立即执行一次扫描更新到最新价格
  scanPrices().then(() => {
    console.log('[价格扫描] 首次扫描完成:', Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', '));
  });
  // 每3秒扫描一次（规范：crypto-price-unified，前端 refetchInterval: 3000）
  setInterval(() => {
    scanPrices().catch(err => console.error('[价格扫描] 定时扫描失败:', err));
  }, 3 * 1000);
  console.log('[价格扫描] 已启动，每3秒刷新加密货币+股票合约价格（含新浪财经兜底+文件持久化）');
}
