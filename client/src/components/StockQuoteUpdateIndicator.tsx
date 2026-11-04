import { useEffect, useState } from 'react';

type Props = { updatedAt?: string | null; currency?: 'CNY' | 'USD'; text: string; title: string };

// Reuses the project's 2026 A-share closure calendar; weekends never trade.
const ashareClosedDates = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
]);

const marketParts = (date: Date, currency: 'CNY' | 'USD') => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: currency === 'USD' ? 'America/New_York' : 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};

export default function StockQuoteUpdateIndicator({ updatedAt, currency = 'CNY', text, title }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const current = marketParts(now, currency);
  const weekend = current.weekday === 'Sat' || current.weekday === 'Sun';
  const tradingHours = currency === 'USD'
    ? current.minutes >= 9 * 60 + 30 && current.minutes < 16 * 60
    : (current.minutes >= 9 * 60 + 30 && current.minutes < 11 * 60 + 30) || (current.minutes >= 13 * 60 && current.minutes < 15 * 60);
  const marketOpen = !weekend && !(currency === 'CNY' && ashareClosedDates.has(current.date)) && tradingHours;
  const quoteDate = updatedAt ? new Date(updatedAt) : null;
  const hasQuote = quoteDate !== null && !Number.isNaN(quoteDate.getTime());
  const sameTradingDate = hasQuote && marketParts(quoteDate!, currency).date === current.date;
  // The dot indicates the market session, not the age of the most recent quote.
  // Quote availability remains separate in the timestamp and tooltip.
  const active = marketOpen;
  const state = active ? hasQuote && sameTradingDate ? '开盘中，自动读取报价' : '开盘中，等待最新报价' : '休盘中，保留最后报价';
  const color = active ? 'bg-[#249B57]' : 'bg-[#D5A038]';

  return <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[9px] leading-4 text-gray-400" title={`${state} · ${title}`}>
    <span aria-label={state} className="relative inline-flex h-1.5 w-1.5 shrink-0">
      {active && <span aria-hidden="true" className="absolute -inset-0.5 rounded-full bg-[#7BCB9C]/60 motion-safe:animate-pulse" />}
      <span aria-hidden="true" className={`relative h-full w-full rounded-full ${color}`} />
    </span>
    <span>{text}</span>
  </span>;
}
