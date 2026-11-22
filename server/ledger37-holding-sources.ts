import type { Ledger37HoldingClosedTrade, Ledger37HoldingPosition, Ledger37HoldingPositionChange, Ledger37HoldingSources } from '../shared/ledger37-ai-holdings';
import { readLedger37PresentationState, type Ledger37PresentationInput } from './ledger37-ai-presentation';
import { getMyLedger37MemberClosedTrades, getMyLedger37MemberHoldingSnapshot, getMyLedger37MemberPositionChanges, getMyLedger37R1HoldingSnapshot } from './ledger-stock-portfolio';
import { getExternalHoldingSources } from './holding-source-cache';

/** Read-only adapter. Never exports private participation, category, lot, order or JSON data. */
export async function getMyLedger37HoldingSources(input: Ledger37PresentationInput): Promise<Ledger37HoldingSources> {
  const state = await readLedger37PresentationState(input);
  if (input.ledgerId !== 37 || state.context.ledgerId !== 37 || state.context.viewerUserId !== input.userId) throw new Error('持仓展示身份不匹配');
  if (!state.isMember) throw new Error('您不是此账本的成员');
  if (!state.context.viewer || state.context.viewer.userId !== input.userId) throw new Error('持仓展示用户档案无效');
  if (!state.context.aiEnabled && !state.context.canManage) throw new Error('账本AI展示尚未开启');
  // Complete strict global authorization BEFORE the source-wide read. The reader
  // repeats this check and never uses personal allocations or project visibility.
  const snapshot = await getMyLedger37R1HoldingSnapshot(input);
  if (snapshot.viewerUserId !== input.userId || snapshot.aiEnabled !== state.context.aiEnabled) throw new Error('持仓展示状态已变化，请重试');
  const holdings: Ledger37HoldingPosition[] = [];
  const seen = new Set<string>();
  for (const stock of snapshot.holdings) {
    if (typeof stock.symbol !== 'string' || !stock.symbol.trim() || typeof stock.stockName !== 'string' || !stock.stockName.trim() || !['CNY', 'USD', 'USDT'].includes(stock.currency)) throw new Error('持仓来源股票无效');
    // Never stringify a Number and claim exactness. This path requires original
    // decimal strings, already summed without floating-point quantity arithmetic.
    if (typeof stock.shares !== 'string' || !/^\d+(?:\.\d{1,8})?$/.test(stock.shares) || !/[1-9]/.test(stock.shares)) throw new Error('持仓来源股数不可用');
    if (stock.weightPct !== null && (typeof stock.weightPct !== 'number' || !Number.isFinite(stock.weightPct) || stock.weightPct < 0 || stock.weightPct > 100)) throw new Error('持仓来源权重无效');
    const key = JSON.stringify([stock.symbol, stock.currency]);
    if (seen.has(key)) throw new Error('持仓来源尚未完成合并');
    seen.add(key);
    holdings.push({ symbol: stock.symbol, stockName: stock.stockName, currency: stock.currency, shares: stock.shares, weightPct: stock.weightPct });
  }
  const weighted = holdings.filter(stock => stock.weightPct !== null);
  if (weighted.length && (weighted.length !== holdings.length || !snapshot.valuationAsOf || !snapshot.reportingCurrency
    || Math.abs(weighted.reduce((total, stock) => total + stock.weightPct!, 0) - 100) > 0.000001)) throw new Error('持仓来源估值不完整');
  // The member allocation is independent of the source-wide holdings. Never
  // replace a failed/empty personal read with R1's total portfolio or wallet.
  const member = await getMyLedger37MemberHoldingSnapshot(input);
  if (member.viewerUserId !== input.userId || member.aiEnabled !== state.context.aiEnabled) throw new Error('个人持仓展示状态已变化，请重试');
  const memberHoldings: Ledger37HoldingPosition[] = [];
  const memberSeen = new Set<string>();
  for (const row of member.holdings) {
    if (typeof row.symbol !== 'string' || !row.symbol.trim() || typeof row.stockName !== 'string' || !row.stockName.trim()
      || !['CNY', 'USD', 'USDT'].includes(row.currency) || typeof row.shares !== 'string'
      || !/^\d+(?:\.\d{1,8})?$/.test(row.shares) || !/[1-9]/.test(row.shares)) throw new Error('个人持仓数量不可用');
    if (row.weightPct !== null && (typeof row.weightPct !== 'number' || !Number.isFinite(row.weightPct) || row.weightPct < 0 || row.weightPct > 100)) throw new Error('个人持仓比例无效');
    const key = JSON.stringify([row.symbol, row.currency]);
    if (memberSeen.has(key)) throw new Error('个人持仓尚未合并');
    memberSeen.add(key);
    const value = row.marketValue;
    if (value !== null && value !== undefined && (typeof value !== 'object' || Array.isArray(value))) throw new Error('个人持仓市值无效');
    if (value && (typeof value.amount !== 'string' || !/^\d{1,195}(?:\.\d{1,24})?$/.test(value.amount)
      || !['CNY', 'USD', 'USDT'].includes(value.currency) || value.currency !== member.reportingCurrency
      || value.asOf !== member.valuationAsOf || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)
      || !Number.isFinite(Date.parse(`${value.asOf}T00:00:00Z`))
      || new Date(`${value.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== value.asOf)) throw new Error('个人持仓市值无效');
    // Explicit safe market-price fields only: never spread entry/order/cost data.
    const quote = row.quote;
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const validQuote = quote && typeof quote === 'object' && !Array.isArray(quote)
      && typeof quote.amount === 'string' && /^\d{1,195}(?:\.\d{1,400})?$/.test(quote.amount) && /[1-9]/.test(quote.amount)
      && quote.currency === row.currency && typeof quote.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(quote.asOf)
      && quote.asOf <= today && Number.isFinite(Date.parse(`${quote.asOf}T00:00:00Z`))
      && new Date(`${quote.asOf}T00:00:00Z`).toISOString().slice(0, 10) === quote.asOf;
    memberHoldings.push({ symbol: row.symbol, stockName: row.stockName, currency: row.currency,
      shares: row.shares, weightPct: row.weightPct,
      marketValue: value ? { amount: value.amount, currency: value.currency, asOf: value.asOf } : null,
      quote: validQuote ? { amount: quote.amount, currency: quote.currency, asOf: quote.asOf } : null });
  }
  const memberWeighted = memberHoldings.filter(row => row.weightPct !== null);
  if (memberWeighted.length && (memberWeighted.length !== memberHoldings.length || !member.valuationAsOf || !member.reportingCurrency
    || memberHoldings.some(row => !row.marketValue) || Math.abs(memberWeighted.reduce((sum, row) => sum + row.weightPct!, 0) - 100) > 0.000001)) throw new Error('个人持仓估值不完整');
  if (!memberWeighted.length && memberHoldings.some(row => row.marketValue)) throw new Error('个人持仓估值不完整');
  const history = await getMyLedger37MemberClosedTrades(input);
  if (history.viewerUserId !== input.userId || history.aiEnabled !== state.context.aiEnabled) throw new Error('个人交易展示状态已变化，请重试');
  if (!Array.isArray(history.closedTrades)) throw new Error('个人交易历史不可用');
  const closedTrades: Ledger37HoldingClosedTrade[] = [];
  const validTradeDate = (date: unknown): boolean => date === null || (typeof date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date);
  for (const row of history.closedTrades) {
    if (!row || typeof row.symbol !== 'string' || !row.symbol.trim() || typeof row.stockName !== 'string' || !row.stockName.trim()
      || !validTradeDate(row.openedDate) || !validTradeDate(row.closedDate)) throw new Error('个人交易历史无效');
    // Each proven partial sale is its own row, even with identical display fields.
    closedTrades.push({ symbol: row.symbol, stockName: row.stockName, openedDate: row.openedDate, closedDate: row.closedDate });
  }
  const changes = await getMyLedger37MemberPositionChanges(input);
  if (changes.viewerUserId !== input.userId || changes.aiEnabled !== state.context.aiEnabled) throw new Error('个人仓位变动展示状态已变化，请重试');
  if (!Array.isArray(changes.positionChanges)) throw new Error('个人仓位变动不可用');
  const positionChanges: Ledger37HoldingPositionChange[] = [];
  for (const row of changes.positionChanges) {
    if (!row || typeof row.symbol !== 'string' || !row.symbol.trim() || typeof row.stockName !== 'string' || !row.stockName.trim()
      || !['new', 'increase', 'decrease'].includes(row.action)) throw new Error('个人仓位变动无效');
    // No spreading raw participations or audit data; preserve every proven event.
    positionChanges.push({ symbol: row.symbol, stockName: row.stockName, action: row.action });
  }
  const checkedAt = new Date().toISOString();
  return {
    viewerUserId: state.context.viewerUserId,
    aiEnabled: state.context.aiEnabled,
    sources: [{
      id: 'r1', displayName: 'R1持股', entityName: 'R1', kind: 'internal', status: 'available',
      asOf: checkedAt, publishedAt: null, checkedAt, sourceUrl: null,
      description: 'R1当前合并持股；不代表客户个人直接持仓或个人分配股数。',
      coverageNote: weighted.length
        ? `仅含当前未结束持仓，按股票代码及币种合并。比例为当前股数按${snapshot.valuationAsOf}统一日结行情估值，占全部当前持仓市值的比例（报告币种${snapshot.reportingCurrency}）；A股使用当日收盘，美股使用此前最近纽约交易日收盘。`
        : '仅含当前未结束持仓，按股票代码及币种合并。股数来自有效开仓减有效卖出；缺少完整同日结行情或可靠同报告币种汇率时，持仓比例留空，不能按股数估算。',
      holdings,
      memberPortfolio: { holdings: memberHoldings, valuationAsOf: member.valuationAsOf, reportingCurrency: member.reportingCurrency, closedTrades, positionChanges },
    }, ...getExternalHoldingSources()],
  };
}
