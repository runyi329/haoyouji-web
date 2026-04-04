/**
 * 量化回测服务 v2.1 - 纯 Node.js 实现
 * 数据源：
 *   A 股 → 新浪财经 API（免费，无需 key）
 *   美股 → Twelve Data API（免费额度）
 * 功能：AI 策略解析、回测计算、图表数据、PDF 报告
 */
import { Router } from 'express';

const router = Router();

// ─── 类型定义 ─────────────────────────────────────────────────
interface ParsedStrategy {
  symbol: string;
  start_date: string;
  end_date: string;
  strategy_type: string;
  fast_period: number;
  slow_period: number;
  rsi_period: number;
  rsi_buy: number;
  rsi_sell: number;
  stop_loss: number;
  take_profit: number;
  description_summary: string;
}

interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  holding_days: number;
}

// ─── 技术指标计算 ─────────────────────────────────────────────

function sma(prices: number[], period: number): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function rsi(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(period).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function maxDrawdown(equity: number[]): number {
  let peak = equity[0];
  let maxDD = 0;
  for (const val of equity) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function sharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

// ─── 股票代码解析 ─────────────────────────────────────────────

interface SymbolInfo {
  type: 'a_share' | 'us_stock';
  sinaSymbol?: string;   // 新浪格式：sh600519 / sz000858
  usSymbol?: string;     // 美股代码：AAPL
  displayCode: string;   // 显示用代码
}

function parseSymbol(input: string): SymbolInfo {
  const s = input.trim().toUpperCase();

  // A 股判断
  if (/^(SH|SZ)?\d{6}$/.test(s) || /\.(SH|SS|SZ)$/.test(s)) {
    let code = s.replace(/\.(SH|SS|SZ)$/, '').replace(/^(SH|SZ)/, '');
    if (!/^\d{6}$/.test(code)) code = code.slice(-6);
    const prefix = code.startsWith('6') ? 'sh' : 'sz';
    return { type: 'a_share', sinaSymbol: `${prefix}${code}`, displayCode: `${prefix.toUpperCase()}${code}` };
  }

  // 纯6位数字
  if (/^\d{6}$/.test(s)) {
    const prefix = s.startsWith('6') ? 'sh' : 'sz';
    return { type: 'a_share', sinaSymbol: `${prefix}${s}`, displayCode: `${prefix.toUpperCase()}${s}` };
  }

  // 美股
  return { type: 'us_stock', usSymbol: s, displayCode: s };
}

// ─── A 股数据（新浪财经）─────────────────────────────────────

async function fetchSinaAShare(sinaSymbol: string, startDate: string, endDate: string): Promise<DailyBar[]> {
  // 计算需要获取的数据条数（从今天到 startDate 的交易日数 * 1.5 作为缓冲）
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();
  const daysFromStart = Math.ceil((today.getTime() - start.getTime()) / 86400000);
  const datalen = Math.min(Math.ceil(daysFromStart * 0.75) + 50, 1500); // 约75%为交易日

  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=5&datalen=${datalen}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.sina.com.cn/',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`新浪财经请求失败: ${res.status}`);
  const json: any[] = await res.json();
  if (!Array.isArray(json)) throw new Error('新浪财经返回数据格式错误');

  const bars: DailyBar[] = json
    .filter(item => item.day >= startDate && item.day <= endDate)
    .map(item => ({
      date: item.day,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return bars;
}

// ─── 美股数据（Twelve Data）─────────────────────────────────

async function fetchTwelveDataUS(symbol: string, startDate: string, endDate: string): Promise<DailyBar[]> {
  // Twelve Data 免费 key（demo）
  const apiKey = process.env.TWELVE_DATA_API_KEY || 'demo';

  // 计算需要的数据条数
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const outputsize = Math.min(Math.ceil(days * 0.75) + 10, 5000);

  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&start_date=${startDate}&end_date=${endDate}&outputsize=${outputsize}&apikey=${apiKey}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`Twelve Data 请求失败: ${res.status}`);
  const json: any = await res.json();

  if (json.status === 'error') throw new Error(`Twelve Data 错误: ${json.message}`);
  if (!json.values || !Array.isArray(json.values)) throw new Error('Twelve Data 返回数据为空');

  const bars: DailyBar[] = json.values
    .map((item: any) => ({
      date: item.datetime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume) || 0,
    }))
    .sort((a: DailyBar, b: DailyBar) => a.date.localeCompare(b.date));

  return bars;
}

// ─── 统一数据获取入口 ─────────────────────────────────────────

async function fetchStockData(symbol: string, startDate: string, endDate: string): Promise<{ bars: DailyBar[]; info: SymbolInfo }> {
  const info = parseSymbol(symbol);

  if (info.type === 'a_share') {
    const bars = await fetchSinaAShare(info.sinaSymbol!, startDate, endDate);
    return { bars, info };
  } else {
    const bars = await fetchTwelveDataUS(info.usSymbol!, startDate, endDate);
    return { bars, info };
  }
}

// ─── 回测引擎 ─────────────────────────────────────────────────

interface BacktestParams {
  bars: DailyBar[];
  strategy_type: string;
  fast_period: number;
  slow_period: number;
  rsi_period: number;
  rsi_buy: number;
  rsi_sell: number;
  stop_loss: number;
  take_profit: number;
  initial_cash: number;
}

interface BacktestOutput {
  metrics: {
    total_return: number;
    annual_return: number;
    max_drawdown: number;
    sharpe_ratio: number;
    win_rate: number;
    avg_holding_days: number;
    trade_count: number;
    final_value: number;
    initial_cash: number;
  };
  equity_curve: { date: string; value: number }[];
  trades: Trade[];
  buy_signals: string[];
  sell_signals: string[];
}

function runBacktest(p: BacktestParams): BacktestOutput {
  const { bars, strategy_type, fast_period, slow_period, rsi_period, rsi_buy, rsi_sell, stop_loss, take_profit, initial_cash } = p;
  const closes = bars.map(b => b.close);
  const dates = bars.map(b => b.date);

  const fastMA = sma(closes, fast_period);
  const slowMA = sma(closes, slow_period);
  const rsiValues = rsi(closes, rsi_period);

  let cash = initial_cash;
  let position = 0;
  let entryPrice = 0;
  let entryDate = '';
  const equityCurve: { date: string; value: number }[] = [];
  const trades: Trade[] = [];
  const buySignals: string[] = [];
  const sellSignals: string[] = [];

  for (let i = 1; i < bars.length; i++) {
    const price = closes[i];
    const equity = cash + position * price;
    equityCurve.push({ date: dates[i], value: Math.round(equity * 100) / 100 });

    // 止损止盈检查
    if (position > 0) {
      const pnlPct = (price - entryPrice) / entryPrice * 100;
      if ((stop_loss > 0 && pnlPct <= -stop_loss) || (take_profit > 0 && pnlPct >= take_profit)) {
        cash += position * price;
        trades.push({
          entry_date: entryDate, exit_date: dates[i],
          entry_price: entryPrice, exit_price: price,
          pnl_pct: Math.round(pnlPct * 100) / 100,
          holding_days: Math.round((new Date(dates[i]).getTime() - new Date(entryDate).getTime()) / 86400000),
        });
        sellSignals.push(dates[i]);
        position = 0; entryPrice = 0; entryDate = '';
        continue;
      }
    }

    let buySignal = false;
    let sellSignal = false;

    if (strategy_type === 'ma_cross') {
      const f = fastMA[i], s = slowMA[i], fP = fastMA[i - 1], sP = slowMA[i - 1];
      if (f !== null && s !== null && fP !== null && sP !== null) {
        buySignal = fP <= sP && f > s;
        sellSignal = fP >= sP && f < s;
      }
    } else if (strategy_type === 'rsi') {
      const r = rsiValues[i], rP = rsiValues[i - 1];
      if (r !== null && rP !== null) {
        buySignal = rP <= rsi_buy && r > rsi_buy;
        sellSignal = rP >= rsi_sell && r < rsi_sell;
      }
    } else if (strategy_type === 'price_breakout') {
      const lookback = fast_period;
      if (i >= lookback) {
        const highN = Math.max(...closes.slice(i - lookback, i));
        const lowN = Math.min(...closes.slice(i - lookback, i));
        buySignal = position === 0 && closes[i] > highN;
        sellSignal = position > 0 && closes[i] < lowN;
      }
    }

    if (buySignal && position === 0 && cash > 0) {
      position = Math.floor(cash / price);
      if (position > 0) {
        cash -= position * price;
        entryPrice = price; entryDate = dates[i];
        buySignals.push(dates[i]);
      }
    }

    if (sellSignal && position > 0) {
      const pnlPct = (price - entryPrice) / entryPrice * 100;
      cash += position * price;
      trades.push({
        entry_date: entryDate, exit_date: dates[i],
        entry_price: entryPrice, exit_price: price,
        pnl_pct: Math.round(pnlPct * 100) / 100,
        holding_days: Math.round((new Date(dates[i]).getTime() - new Date(entryDate).getTime()) / 86400000),
      });
      sellSignals.push(dates[i]);
      position = 0; entryPrice = 0; entryDate = '';
    }
  }

  // 期末强制平仓
  if (position > 0 && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const price = lastBar.close;
    const pnlPct = (price - entryPrice) / entryPrice * 100;
    cash += position * price;
    trades.push({
      entry_date: entryDate, exit_date: lastBar.date,
      entry_price: entryPrice, exit_price: price,
      pnl_pct: Math.round(pnlPct * 100) / 100,
      holding_days: Math.round((new Date(lastBar.date).getTime() - new Date(entryDate).getTime()) / 86400000),
    });
  }

  const finalValue = cash;
  const totalReturn = (finalValue - initial_cash) / initial_cash * 100;
  const dayCount = equityCurve.length;
  const annualReturn = dayCount > 0 ? (Math.pow(finalValue / initial_cash, 365 / dayCount) - 1) * 100 : 0;
  const equityValues = equityCurve.map(e => e.value);
  const maxDD = maxDrawdown(equityValues.length > 0 ? equityValues : [initial_cash]) * 100;
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityValues.length; i++) {
    dailyReturns.push((equityValues[i] - equityValues[i - 1]) / equityValues[i - 1]);
  }
  const sharpe = sharpeRatio(dailyReturns);
  const winTrades = trades.filter(t => t.pnl_pct > 0).length;
  const winRate = trades.length > 0 ? (winTrades / trades.length) * 100 : 0;
  const avgHoldingDays = trades.length > 0 ? trades.reduce((a, t) => a + t.holding_days, 0) / trades.length : 0;

  return {
    metrics: {
      total_return: Math.round(totalReturn * 100) / 100,
      annual_return: Math.round(annualReturn * 100) / 100,
      max_drawdown: Math.round(maxDD * 100) / 100,
      sharpe_ratio: Math.round(sharpe * 100) / 100,
      win_rate: Math.round(winRate * 100) / 100,
      avg_holding_days: Math.round(avgHoldingDays * 10) / 10,
      trade_count: trades.length,
      final_value: Math.round(finalValue * 100) / 100,
      initial_cash,
    },
    equity_curve: equityCurve,
    trades,
    buy_signals: buySignals,
    sell_signals: sellSignals,
  };
}

// ─── 图表数据生成 ─────────────────────────────────────────────

function buildChartJson(
  bars: DailyBar[],
  equityCurve: { date: string; value: number }[],
  buySignals: string[],
  sellSignals: string[],
  initialCash: number
): string {
  const dates = equityCurve.map(e => e.date);
  const equity = equityCurve.map(e => e.value);
  const buyPoints = dates.map((d, i) => buySignals.includes(d) ? equity[i] : null);
  const sellPoints = dates.map((d, i) => sellSignals.includes(d) ? equity[i] : null);
  const firstClose = bars[0]?.close ?? 1;
  const benchmarkEquity = bars.slice(1).map(b => Math.round((b.close / firstClose) * initialCash * 100) / 100);

  const chartData = {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: '策略净值',
          data: equity,
          borderColor: '#D32F2F',
          backgroundColor: 'rgba(211,47,47,0.08)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
        },
        {
          label: '基准（持有不动）',
          data: benchmarkEquity,
          borderColor: '#1565C0',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.1,
        },
        {
          label: '买入信号',
          data: buyPoints,
          borderColor: '#1B5E20',
          backgroundColor: '#1B5E20',
          pointRadius: 6,
          pointStyle: 'triangle',
          showLine: false,
          type: 'scatter',
        },
        {
          label: '卖出信号',
          data: sellPoints,
          borderColor: '#B71C1C',
          backgroundColor: '#B71C1C',
          pointRadius: 6,
          pointStyle: 'triangle',
          rotation: 180,
          showLine: false,
          type: 'scatter',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { callback: 'function(v){return "¥"+v.toLocaleString()}' } },
      },
    },
  };

  return JSON.stringify(chartData);
}

// ─── AI 策略解析 ─────────────────────────────────────────────

async function parseStrategyWithAI(userInput: string): Promise<ParsedStrategy> {
  const today = new Date().toISOString().slice(0, 10);
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-82bd31e2b19d49b4a5521da40df6582c';

  const systemPrompt = `你是量化交易策略解析器。将用户描述解析为结构化 JSON。

规则：
- symbol: A股用纯6位数字（如600519），美股用英文代码（如AAPL）
- start_date / end_date: YYYY-MM-DD 格式
- strategy_type: "ma_cross"（均线交叉）/ "rsi"（RSI策略）/ "price_breakout"（价格突破）
- fast_period: 快速均线周期（默认20）
- slow_period: 慢速均线周期（默认60）
- rsi_period: RSI周期（默认14）
- rsi_buy: RSI买入阈值（默认30）
- rsi_sell: RSI卖出阈值（默认70）
- stop_loss: 止损百分比（0表示不设，如5表示5%止损）
- take_profit: 止盈百分比（0表示不设）
- description_summary: 一句话策略摘要（中文）

只返回 JSON，不要其他文字。`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `今天是 ${today}。解析：\n${userInput}` },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) throw new Error(`AI 解析失败: ${response.status}`);
  const json: any = await response.json();
  const content = json.choices?.[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式错误');
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    symbol: parsed.symbol || '600519',
    start_date: parsed.start_date || threeYearsAgo,
    end_date: parsed.end_date || today,
    strategy_type: parsed.strategy_type || 'ma_cross',
    fast_period: parsed.fast_period || 20,
    slow_period: parsed.slow_period || 60,
    rsi_period: parsed.rsi_period || 14,
    rsi_buy: parsed.rsi_buy || 30,
    rsi_sell: parsed.rsi_sell || 70,
    stop_loss: parsed.stop_loss || 0,
    take_profit: parsed.take_profit || 0,
    description_summary: parsed.description_summary || userInput.slice(0, 50),
  };
}

// ─── Express 路由 ─────────────────────────────────────────────

router.get('/api/quant/health', (_req, res) => {
  res.json({ status: 'ok', engine: 'nodejs', version: '2.1', data_sources: ['sina_finance', 'twelve_data'] });
});

router.post('/api/quant/parse-strategy', async (req, res) => {
  try {
    const { user_input, description } = req.body;
    const user_input_final = user_input || description;
    if (!user_input_final) return res.status(400).json({ detail: '请提供策略描述' });
    const parsed = await parseStrategyWithAI(user_input_final);
    res.json(parsed);
  } catch (err: any) {
    console.error('[Quant] parse-strategy error:', err);
    res.status(500).json({ detail: `策略解析失败: ${err.message}` });
  }
});

router.post('/api/quant/backtest', async (req, res) => {
  try {
    const params: ParsedStrategy & { initial_cash?: number } = req.body;
    const {
      symbol, start_date, end_date, strategy_type = 'ma_cross',
      fast_period = 20, slow_period = 60,
      rsi_period = 14, rsi_buy = 30, rsi_sell = 70,
      initial_cash = 100000,
    } = params;
    const rawStopLoss = params.stop_loss ?? 0;
    const rawTakeProfit = params.take_profit ?? 0;
    const stop_loss = rawStopLoss > 0 && rawStopLoss < 1 ? rawStopLoss * 100 : rawStopLoss;
    const take_profit = rawTakeProfit > 0 && rawTakeProfit < 1 ? rawTakeProfit * 100 : rawTakeProfit;

    if (!symbol || !start_date || !end_date) {
      return res.status(400).json({ detail: '缺少必要参数（symbol, start_date, end_date）' });
    }

    const { bars, info } = await fetchStockData(symbol, start_date, end_date);

    if (bars.length < 30) {
      return res.status(400).json({
        detail: `数据不足（仅 ${bars.length} 条），请扩大时间范围或检查股票代码。支持格式：A股（如600519、000858），美股（如AAPL、TSLA）`,
      });
    }

    const result = runBacktest({
      bars, strategy_type, fast_period, slow_period,
      rsi_period, rsi_buy, rsi_sell, stop_loss, take_profit, initial_cash,
    });

    const chartJson = buildChartJson(bars, result.equity_curve, result.buy_signals, result.sell_signals, initial_cash);

    res.json({
      metrics: result.metrics,
      chart_json: chartJson,
      trades: result.trades.slice(-20), // 最近20笔交易
      symbol: info.displayCode,
      symbol_type: info.type,
      start_date,
      end_date,
      data_points: bars.length,
    });
  } catch (err: any) {
    console.error('[Quant] backtest error:', err);
    res.status(500).json({ detail: `回测失败: ${err.message}` });
  }
});

router.post('/api/quant/export-pdf', async (req, res) => {
  try {
    const { metrics, symbol, start_date, end_date, strategy_type, trades = [] } = req.body;
    if (!metrics) return res.status(400).json({ detail: '缺少回测结果' });

    const strategyLabels: Record<string, string> = {
      ma_cross: '均线交叉策略',
      rsi: 'RSI 策略',
      price_breakout: '价格突破策略',
    };

    const tradesHtml = trades.length > 0 ? `
<h2 style="margin-top:30px;color:#D32F2F;font-size:16px;">交易记录（最近${trades.length}笔）</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px;">
  <thead>
    <tr style="background:#F5F5F5;">
      <th style="padding:6px;border:1px solid #ddd;text-align:left;">买入日期</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:left;">卖出日期</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:right;">买入价</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:right;">卖出价</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:right;">收益率</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:right;">持仓天数</th>
    </tr>
  </thead>
  <tbody>
    ${trades.map((t: Trade) => `
    <tr>
      <td style="padding:6px;border:1px solid #ddd;">${t.entry_date}</td>
      <td style="padding:6px;border:1px solid #ddd;">${t.exit_date}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;">${t.entry_price.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;">${t.exit_price.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;color:${t.pnl_pct >= 0 ? '#D32F2F' : '#2E7D32'};">${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct}%</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;">${t.holding_days}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '';

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>量化回测报告 - ${symbol}</title>
<style>
  body { font-family: "Microsoft YaHei", Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
  h1 { color: #D32F2F; border-bottom: 2px solid #D32F2F; padding-bottom: 10px; font-size: 22px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
  .card { background: #F9F9F9; border-radius: 6px; padding: 14px; }
  .card-label { font-size: 11px; color: #888; margin-bottom: 4px; }
  .card-value { font-size: 20px; font-weight: 700; }
  .positive { color: #D32F2F; }
  .negative { color: #2E7D32; }
  .disclaimer { background: #FFF8F8; border-radius: 6px; padding: 14px; margin-top: 24px; font-size: 12px; color: #B71C1C; border-left: 3px solid #D32F2F; }
  .footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 32px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>量化回测分析报告</h1>
<div class="meta">
  <strong>标的：</strong>${symbol} &nbsp;|&nbsp;
  <strong>策略：</strong>${strategyLabels[strategy_type] || strategy_type} &nbsp;|&nbsp;
  <strong>区间：</strong>${start_date} ~ ${end_date} &nbsp;|&nbsp;
  <strong>生成时间：</strong>${new Date().toLocaleString('zh-CN')}
</div>
<div class="grid">
  <div class="card">
    <div class="card-label">总收益率</div>
    <div class="card-value ${metrics.total_return >= 0 ? 'positive' : 'negative'}">${metrics.total_return >= 0 ? '+' : ''}${metrics.total_return}%</div>
  </div>
  <div class="card">
    <div class="card-label">年化收益率</div>
    <div class="card-value ${metrics.annual_return >= 0 ? 'positive' : 'negative'}">${metrics.annual_return >= 0 ? '+' : ''}${metrics.annual_return}%</div>
  </div>
  <div class="card">
    <div class="card-label">最大回撤</div>
    <div class="card-value negative">-${metrics.max_drawdown}%</div>
  </div>
  <div class="card">
    <div class="card-label">夏普比率</div>
    <div class="card-value ${metrics.sharpe_ratio >= 1 ? 'positive' : ''}">${metrics.sharpe_ratio}</div>
  </div>
  <div class="card">
    <div class="card-label">胜率</div>
    <div class="card-value ${metrics.win_rate >= 50 ? 'positive' : ''}">${metrics.win_rate}%</div>
  </div>
  <div class="card">
    <div class="card-label">交易次数</div>
    <div class="card-value">${metrics.trade_count} 次</div>
  </div>
  <div class="card">
    <div class="card-label">平均持仓天数</div>
    <div class="card-value">${metrics.avg_holding_days} 天</div>
  </div>
  <div class="card">
    <div class="card-label">最终资产</div>
    <div class="card-value ${metrics.final_value >= metrics.initial_cash ? 'positive' : 'negative'}">¥${metrics.final_value.toLocaleString()}</div>
  </div>
</div>
${tradesHtml}
<div class="disclaimer">
  <strong>风险提示：</strong>历史回测结果不代表未来收益，量化策略存在过拟合风险。投资有风险，入市需谨慎。本报告仅供参考，不构成任何投资建议。
</div>
<div class="footer">由脉动网量化分析工具生成 · ${new Date().toLocaleDateString('zh-CN')}</div>
</body>
</html>`;

    res.json({
      html,
      filename: `quant_report_${symbol}_${start_date}_${end_date}.html`,
    });
  } catch (err: any) {
    console.error('[Quant] export-pdf error:', err);
    res.status(500).json({ detail: `报告生成失败: ${err.message}` });
  }
});

export default router;
