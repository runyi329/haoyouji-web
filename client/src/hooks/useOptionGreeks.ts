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

type MarkPriceCache = Record<string, number>;

function readPersistedMarkPrices(): MarkPriceCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPTION_MARK_PRICE_STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
    ) as MarkPriceCache;
  } catch {
    return {};
  }
}

function persistMarkPrice(instrumentKey: string, markPrice: number) {
  if (typeof window === 'undefined') return;
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
 * 标记价沿用项目的 Gate.io 主源 / Deribit 备用接口，每 30 秒刷新。
 * 涨跌比较的是同一份期权合约标记价，而非 BTC / ETH 现货价格。
 */
export function useOptionGreeks({
  currency,
  exerciseDate,
  strikePrice,
  direction,
  enabled = true,
}: UseOptionGreeksParams) {
  const query = trpc.ledger.deribitGetGreeks.useQuery(
    { currency, exerciseDate, strikePrice, direction },
    {
      enabled: enabled && !!exerciseDate && !!strikePrice,
      staleTime: 30 * 1000,
      refetchInterval: 30 * 1000,
      retry: 1,
    }
  );

  const rawData = query.data as OptionGreeksData | null | undefined;
  const contractKey = `${currency}-${exerciseDate}-${strikePrice}-${direction}`;
  const hasCurrentMarkPrice = Number.isFinite(Number(rawData?.markPrice)) && Number(rawData?.markPrice) >= 0;
  const lastValidDataRef = useRef<{ contractKey: string; data: OptionGreeksData } | null>(null);
  const fallbackData = lastValidDataRef.current?.contractKey === contractKey ? lastValidDataRef.current.data : null;
  // 行情源短暂没有报价时，保留本会话上一笔有效标记价；绝不把期权价值直接归零。
  const data = hasCurrentMarkPrice ? rawData : (fallbackData ?? rawData);
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
        markPrice: Number.isFinite(cachedMarkPrice) ? cachedMarkPrice : null,
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
