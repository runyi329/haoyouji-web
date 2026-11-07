import { useEffect, useMemo, useState, type RefObject } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";

export type StockLatestQuote = {
  tsCode: string;
  price: number | null;
  changePercent: number | null;
  change: number | null;
  tradeDate: string | null;
  quoteTime: string | null;
  source: "tencent" | "daily" | "unavailable";
  status: "live" | "delayed" | "close" | "stale" | "unavailable";
};

function pollInterval() {
  const beijing = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  const weekday = beijing.getUTCDay() > 0 && beijing.getUTCDay() < 6;
  return weekday && ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900)) ? 20_000 : 60_000;
}

/** 行情是页面只读请求；只请求视口附近股票，离开页面/后台时停止刷新。 */
export function useVisibleStockQuotes(
  scrollRef: RefObject<HTMLDivElement | null>,
  tableRef: RefObject<HTMLTableElement | null>,
  itemCodes: string[],
) {
  const { id } = useParams<{ id: string }>();
  const ledgerId = id && Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  const itemsKey = itemCodes.join("|");
  const [visibleCodes, setVisibleCodes] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockLatestQuote>>({});
  useEffect(() => {
    const root = scrollRef.current;
    const table = tableRef.current;
    if (!root || !table) return;
    const visible = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const next = [...visible].sort().slice(0, 200);
      setVisibleCodes(previous => previous.join("|") === next.join("|") ? previous : next);
    };
    const bounds = root.getBoundingClientRect();
    const rows = [...table.querySelectorAll<HTMLElement>("[data-stock-grid-row]")];
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const code = row.dataset.stockGridRow;
      if (code && rect.bottom >= bounds.top - 80 && rect.top <= bounds.bottom + 80) visible.add(code);
    }
    update();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const code = (entry.target as HTMLElement).dataset.stockGridRow;
        if (!code) continue;
        if (entry.isIntersecting) visible.add(code); else visible.delete(code);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, 80);
    }, { root, rootMargin: "80px 0px" });
    rows.forEach(row => observer.observe(row));
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [itemsKey, scrollRef, tableRef]);

  const query = trpc.aiStockLatestQuotes.useQuery(
    { tsCodes: visibleCodes, ledgerId },
    {
      enabled: visibleCodes.length > 0,
      staleTime: 15_000,
      retry: 1,
      refetchInterval: pollInterval,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  );
  useEffect(() => {
    if (!query.data) return;
    const data = query.data as { items: StockLatestQuote[] };
    setQuotes(previous => {
      const next = { ...previous };
      for (const quote of data.items) {
        const last = previous[quote.tsCode];
        // 网络回退不应把今日有效行情替换为昨日收盘；保留原时间并停止实时指示。
        if (last?.price != null && last.tradeDate && (!quote.tradeDate || quote.tradeDate < last.tradeDate)) {
          next[quote.tsCode] = { ...last, status: last.status === "live" ? "delayed" : last.status };
        } else {
          next[quote.tsCode] = quote;
        }
      }
      return next;
    });
  }, [query.data]);

  const requested = useMemo(() => new Set(visibleCodes), [visibleCodes]);
  return { quotes, requested, refetch: query.refetch, isFetching: query.isFetching, isError: query.isError };
}
