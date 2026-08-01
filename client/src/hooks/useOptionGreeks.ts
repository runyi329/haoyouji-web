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
      staleTime: 5 * 60 * 1000,   // 5 分钟内不重新请求
      refetchInterval: 5 * 60 * 1000, // 每 5 分钟自动刷新
      retry: 1,
    }
  );

  return {
    data: query.data as OptionGreeksData | null | undefined,
    loading: query.isLoading || query.isFetching,
    error: query.error?.message ?? null,
  };
}
