import { useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useDemandCryptoQuotes } from "@/hooks/useDemandCryptoQuotes";
import { isCryptoAssetCode } from "@shared/crypto-asset-catalog";
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
  // 总持仓包括冻结；只租约实际非零余额，绝不把目录或证券代码当数字币需求。
  const demandQuotes = useDemandCryptoQuotes(
    (assetsQuery.data ?? [])
      .filter(asset => {
        const code = String(asset.assetCode || '').trim().toUpperCase();
        const total = Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0)));
        return code !== 'USDT' && isCryptoAssetCode(code) && Number.isFinite(total) && total !== 0;
      })
      .map(asset => asset.assetCode),
    isAuthenticated && assetsQuery.data !== undefined,
  );
  // 此接口只读缓存，保留证券报价与USDT/CNY汇率兼容，不取数字币价格。
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
    pricesQuery.error ??
    demandQuotes.error;
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
    const usdtCnyRate = pricesQuery.data.usdtCnyRate;
    if (usdtCnyRate === null || pricesQuery.data.usdtCnyFx?.stale === true) {
      return { value: null, error: "人民币汇率暂不可用" };
    }
    try {
      const compatibilityPrices = Object.fromEntries(
        Object.entries(pricesQuery.data.prices)
          .filter(([code]) => !isCryptoAssetCode(code.trim().toUpperCase()))
          .map(([code, price]) => [code.trim().toUpperCase(), price]),
      );
      return {
        value: calculateMibanWalletValue({
          usdt: usdtQuery.data,
          cny: cnyQuery.data,
          assets: assetsQuery.data,
          prices: { ...compatibilityPrices, ...demandQuotes.prices },
          usdtCnyRate,
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
    demandQuotes.prices,
  ]);

  const { refetch: refetchUsdt } = usdtQuery;
  const { refetch: refetchCny } = cnyQuery;
  const { refetch: refetchAssets } = assetsQuery;
  const { refetch: refetchPrices } = pricesQuery;
  const { refetch: refetchDemandQuotes, symbols: demandSymbols } = demandQuotes;
  const refresh = useCallback(async () => {
    // 手动 refetch 会绕过 enabled，因此未登录时也需显式阻止余额请求。
    if (!isAuthenticated) return;
    await Promise.all([
      refetchUsdt(),
      refetchCny(),
      refetchAssets(),
      refetchPrices(),
      ...(demandSymbols.length > 0 ? [refetchDemandQuotes()] : []),
    ]);
  }, [isAuthenticated, refetchUsdt, refetchCny, refetchAssets, refetchPrices, refetchDemandQuotes, demandSymbols.length]);

  return {
    value: calculation.value,
    isLoading:
      auth.loading ||
      (isAuthenticated &&
        (usdtQuery.isLoading ||
          cnyQuery.isLoading ||
          assetsQuery.isLoading ||
          pricesQuery.isLoading ||
          (demandSymbols.length > 0 && demandQuotes.isLoading))),
    error: calculation.error,
    refresh,
    isAuthenticated,
  };
}

export type MibanWalletValueHookResult = ReturnType<typeof useMibanWalletValue>;
