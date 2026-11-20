import type { Ledger37AiStockPoolRow } from "@shared/ledger37-ai-presentation";

// 与管理员股票名称汇总使用同一环形图配色；颜色仅区分股票，不表示涨跌。
const poolColors = ["#426AB3", "#D89446", "#50A58F", "#A277B7", "#DC7D87", "#65A9C0", "#A3A85B", "#AF795D", "#788AAF", "#89B39C"];
export type Ledger37AiPoolChartRow = Ledger37AiStockPoolRow & { key: string; label: string; color: string; share: number | null };

export function buildLedger37AiStockPoolChart(stocks: Ledger37AiStockPoolRow[]): {
  rows: Ledger37AiPoolChartRow[]; gradient: string | null; hasPending: boolean;
} {
  const rows: Ledger37AiPoolChartRow[] = stocks.map((stock, index) => {
    const hasParticipation = stock.hasParticipation === true;
    const pnlCny = hasParticipation && typeof stock.pnlCny === "number" && Number.isFinite(stock.pnlCny) ? stock.pnlCny : null;
    return {
      symbol: stock.symbol, stockName: stock.stockName, currency: stock.currency,
      status: stock.status, hasParticipation, pnlCny,
      key: `${stock.currency}:${stock.symbol}`, label: stock.stockName.trim() || stock.symbol,
      color: poolColors[index % poolColors.length], share: null,
    };
  });
  // 先缩放，避免大额收益相加溢出；不改变金额、不重算或倒转收益方向。
  let maxAbs = 0;
  for (const row of rows) if (row.pnlCny !== null) maxAbs = Math.max(maxAbs, Math.abs(row.pnlCny));
  let normalizedTotal = 0;
  if (maxAbs > 0) for (const row of rows) if (row.pnlCny !== null) normalizedTotal += Math.abs(row.pnlCny) / maxAbs;
  if (normalizedTotal > 0) for (const row of rows) if (row.pnlCny !== null) row.share = Math.abs(row.pnlCny) / maxAbs / normalizedTotal * 100;
  const segments = rows.filter(row => row.share !== null && row.share > 0);
  let cursor = 0;
  const stops = segments.map((row, index) => {
    const start = cursor;
    cursor = index === segments.length - 1 ? 100 : cursor + row.share!;
    return `${row.color} ${start}% ${cursor}%`;
  });
  return {
    rows, gradient: stops.length ? `conic-gradient(from -90deg, ${stops.join(", ")})` : null,
    hasPending: rows.some(row => row.hasParticipation && row.pnlCny === null),
  };
}
