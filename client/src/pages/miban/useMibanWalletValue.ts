import { useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  calculateMibanWalletValue,
  type MibanWalletValue,
} from "@shared/miban-wallet-value";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 本人所有钱包资产按统一行情折合；不接收 ledgerId 或 viewAsUserId。 */
export function useMibanWalletValue() {
  const auth = useAuth();
  const { isAuthenticated } = auth;
  const balanceOptions = {
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 30_000,
  };
  const usdtQuery = trpc.recharge.getUsdtBalanceSummary.useQuery(
    undefined,
    balanceOptions
  );
  const cnyQuery = trpc.recharge.getCnyBalanceSummary.useQuery(
    undefined,
    balanceOptions
  );
  const assetsQuery = trpc.recharge.getMultiAssetBalances.useQuery(
    undefined,
    balanceOptions
  );
  const pricesQuery = trpc.getCryptoPrices.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10_000,
    staleTime: 10_000,
  });
  const queryError =
    auth.error ??
    usdtQuery.error ??
    cnyQuery.error ??
    assetsQuery.error ??
    pricesQuery.error;
  const calculation = useMemo<{
    value: MibanWalletValue | null;
    error: string | null;
  }>(() => {
    if (queryError) return { value: null, error: errorMessage(queryError) };
    if (
      !isAuthenticated ||
      usdtQuery.data === undefined ||
      cnyQuery.data === undefined ||
      assetsQuery.data === undefined ||
      pricesQuery.data === undefined
    ) {
      return { value: null, error: null };
    }
    try {
      return {
        value: calculateMibanWalletValue({
          usdt: usdtQuery.data,
          cny: cnyQuery.data,
          assets: assetsQuery.data,
          prices: pricesQuery.data.prices,
          usdtCnyRate: pricesQuery.data.usdtCnyRate,
        }),
        error: null,
      };
    } catch (error: unknown) {
      return { value: null, error: errorMessage(error) };
    }
  }, [
    isAuthenticated,
    queryError,
    usdtQuery.data,
    cnyQuery.data,
    assetsQuery.data,
    pricesQuery.data,
  ]);

  const { refetch: refetchUsdt } = usdtQuery;
  const { refetch: refetchCny } = cnyQuery;
  const { refetch: refetchAssets } = assetsQuery;
  const { refetch: refetchPrices } = pricesQuery;
  const refresh = useCallback(async () => {
    // 手动 refetch 会绕过 enabled，因此未登录时也需显式阻止余额请求。
    if (!isAuthenticated) return;
    await Promise.all([
      refetchUsdt(),
      refetchCny(),
      refetchAssets(),
      refetchPrices(),
    ]);
  }, [isAuthenticated, refetchUsdt, refetchCny, refetchAssets, refetchPrices]);

  return {
    value: calculation.value,
    isLoading:
      auth.loading ||
      (isAuthenticated &&
        (usdtQuery.isLoading ||
          cnyQuery.isLoading ||
          assetsQuery.isLoading ||
          pricesQuery.isLoading)),
    error: calculation.error,
    refresh,
    isAuthenticated,
  };
}

export type MibanWalletValueHookResult = ReturnType<typeof useMibanWalletValue>;
