import { useState, useEffect, useRef } from 'react';

export interface OptionGreeksData {
  instrumentName: string;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  markPrice: number | null;
  error?: string;
  fetchedAt?: number;
}

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5分钟
const REFETCH_INTERVAL_MS = 5 * 60 * 1000; // 每5分钟自动刷新

// 内存缓存（同一会话内多个卡片共享）
const memCache: Record<string, { data: OptionGreeksData; fetchedAt: number }> = {};

function buildInstrumentName(
  currency: 'BTC' | 'ETH',
  exerciseDate: string, // YYYY-MM-DD
  strikePrice: number,
  direction: 'long_call' | 'long_put' | 'short_call' | 'short_put'
): string {
  const isCall = direction === 'long_call' || direction === 'short_call';
  const optionType = isCall ? 'C' : 'P';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dt = new Date(exerciseDate + 'T08:00:00Z');
  const dd = dt.getUTCDate();
  const mon = months[dt.getUTCMonth()];
  const yy = String(dt.getUTCFullYear()).slice(2);
  return `${currency}-${dd}${mon}${yy}-${strikePrice}-${optionType}`;
}

async function fetchGreeks(instrumentName: string): Promise<OptionGreeksData> {
  const url = `https://www.deribit.com/api/v2/public/get_order_book?instrument_name=${instrumentName}&depth=1`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message || '合约不存在');
  const r = data.result;
  return {
    instrumentName,
    delta: r.greeks?.delta ?? null,
    gamma: r.greeks?.gamma ?? null,
    theta: r.greeks?.theta ?? null,
    vega: r.greeks?.vega ?? null,
    iv: r.mark_iv ?? null,
    markPrice: r.mark_price ?? null,
    fetchedAt: Date.now(),
  };
}

interface UseOptionGreeksParams {
  currency: 'BTC' | 'ETH';
  exerciseDate: string;
  strikePrice: number;
  direction: 'long_call' | 'long_put' | 'short_call' | 'short_put';
  enabled?: boolean;
}

export function useOptionGreeks({
  currency,
  exerciseDate,
  strikePrice,
  direction,
  enabled = true,
}: UseOptionGreeksParams) {
  const [data, setData] = useState<OptionGreeksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const instrumentName = exerciseDate && strikePrice
    ? buildInstrumentName(currency, exerciseDate, strikePrice, direction)
    : null;

  const doFetch = async (name: string) => {
    // 先检查内存缓存
    const cached = memCache[name];
    if (cached && Date.now() - cached.fetchedAt < CACHE_DURATION_MS) {
      setData(cached.data);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchGreeks(name);
      memCache[name] = { data: result, fetchedAt: Date.now() };
      setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message || '获取失败');
      // fallback 到旧缓存
      if (cached) setData(cached.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled || !instrumentName) return;

    doFetch(instrumentName);

    timerRef.current = setInterval(() => {
      doFetch(instrumentName);
    }, REFETCH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentName, enabled]);

  return { data, loading, error };
}
