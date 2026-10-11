import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';

export interface OptionGreeksData {
  instrumentName: string;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  markPrice: number | null;
  indexPrice?: number | null;
  error?: string;
  fetchedAt?: number;
}

interface UseOptionGreeksParams {
  currency: 'BTC' | 'ETH';
  exerciseDate: string;
  strikePrice: number;
  direction: 'long_call' | 'long_put' | 'short_call' | 'short_put';
  enabled?: boolean;
}

export type OptionMarkPriceDirection = 'up' | 'down' | 'same';

const OPTION_MARK_PRICE_STORAGE_KEY = 'haoyouji_option_mark_price_v1';
const OPTION_GREEKS_REFRESH_MS = 3 * 1000;

type MarkPriceCache = Record<string, number>;

/** MySQL 日期可能以 UTC ISO 字符串下发；行情合约键始终使用北京时间的 YYYY-MM-DD。 */
function normalizeOptionExerciseDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** 未到期的期权报价必须是正数；0/空值属于行情源暂缺，不能覆盖最近一次有效报价。 */
function hasUsableOptionMarkPrice(value: unknown): boolean {
  const markPrice = Number(value);
  return Number.isFinite(markPrice) && markPrice > 0;
}

function readPersistedMarkPrices(): MarkPriceCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPTION_MARK_PRICE_STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => hasUsableOptionMarkPrice(value))
    ) as MarkPriceCache;
  } catch {
    return {};
  }
}

function persistMarkPrice(instrumentKey: string, markPrice: number) {
  if (typeof window === 'undefined' || !hasUsableOptionMarkPrice(markPrice)) return;
  try {
    const cache = readPersistedMarkPrices();
    cache[instrumentKey] = markPrice;
    window.localStorage.setItem(OPTION_MARK_PRICE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // 浏览器隐私模式或存储额度不足时，当前会话的 ref 仍会维持涨跌方向。
  }
}

/**
 * 统一读取期权 Greeks 与合约标记价。
 * 标记价沿用项目的 Gate.io 主源 / Deribit 备用接口，每 3 秒刷新。
 * 涨跌比较的是同一份期权合约标记价，而非 BTC / ETH 现货价格。
 */
export function useOptionGreeks({
  currency,
  exerciseDate,
  strikePrice,
  direction,
  enabled = true,
}: UseOptionGreeksParams) {
  const normalizedExerciseDate = normalizeOptionExerciseDate(exerciseDate);
  const query = trpc.ledger.deribitGetGreeks.useQuery(
    { currency, exerciseDate: normalizedExerciseDate, strikePrice, direction },
    {
      enabled: enabled && !!normalizedExerciseDate && !!strikePrice,
      staleTime: OPTION_GREEKS_REFRESH_MS,
      refetchInterval: OPTION_GREEKS_REFRESH_MS,
      retry: 1,
    }
  );

  const rawData = query.data as OptionGreeksData | null | undefined;
  const contractKey = `${currency}-${normalizedExerciseDate}-${strikePrice}-${direction}`;
  const hasCurrentMarkPrice = hasUsableOptionMarkPrice(rawData?.markPrice);
  const lastValidDataRef = useRef<{ contractKey: string; data: OptionGreeksData } | null>(null);
  const fallbackData = lastValidDataRef.current?.contractKey === contractKey ? lastValidDataRef.current.data : null;
  const persistedMarkPrice = readPersistedMarkPrices()[contractKey];
  const persistedFallbackData: OptionGreeksData | null = hasUsableOptionMarkPrice(persistedMarkPrice)
    ? {
      instrumentName: rawData?.instrumentName ?? contractKey,
      delta: rawData?.delta ?? null,
      gamma: rawData?.gamma ?? null,
      theta: rawData?.theta ?? null,
      vega: rawData?.vega ?? null,
      iv: rawData?.iv ?? null,
      markPrice: Number(persistedMarkPrice),
      indexPrice: rawData?.indexPrice ?? null,
      error: rawData?.error,
      fetchedAt: rawData?.fetchedAt,
    }
    : null;
  // 行情源短暂没有报价时，先用本会话、再用上次页面保存的有效标记价；绝不把期权价值直接归零。
  const data = hasCurrentMarkPrice ? rawData : (fallbackData ?? persistedFallbackData ?? rawData);
  const currentMarkPrice = Number(data?.markPrice);
  const [markPriceDirection, setMarkPriceDirection] = useState<OptionMarkPriceDirection>('same');
  const previousMarkPriceRef = useRef<{ contractKey: string; markPrice: number | null }>({ contractKey: '', markPrice: null });

  useEffect(() => {
    if (hasCurrentMarkPrice && rawData) {
      lastValidDataRef.current = { contractKey, data: rawData };
    }
  }, [contractKey, hasCurrentMarkPrice, rawData]);

  useEffect(() => {
    if (!enabled || !Number.isFinite(currentMarkPrice) || currentMarkPrice < 0) {
      setMarkPriceDirection('same');
      return;
    }

    if (previousMarkPriceRef.current.contractKey !== contractKey) {
      const cachedMarkPrice = readPersistedMarkPrices()[contractKey];
      previousMarkPriceRef.current = {
        contractKey,
        markPrice: hasUsableOptionMarkPrice(cachedMarkPrice) ? cachedMarkPrice : null,
      };
    }

    const previous = previousMarkPriceRef.current.markPrice;
    const nextDirection: OptionMarkPriceDirection = previous === null
      ? 'same'
      : currentMarkPrice > previous
        ? 'up'
        : currentMarkPrice < previous
          ? 'down'
          : 'same';

    setMarkPriceDirection(previousDirection => previousDirection === nextDirection ? previousDirection : nextDirection);
    previousMarkPriceRef.current = { contractKey, markPrice: currentMarkPrice };
    persistMarkPrice(contractKey, currentMarkPrice);
  }, [contractKey, currentMarkPrice, enabled]);

  return {
    data,
    loading: query.isLoading || query.isFetching,
    error: query.error?.message ?? null,
    markPriceDirection,
  };
}
