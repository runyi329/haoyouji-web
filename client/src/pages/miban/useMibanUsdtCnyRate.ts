import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const FALLBACK_USDT_CNY_RATE = 7.2;

/**
 * 米伴商品页统一读取服务端 price-scanner 的 USDT/CNY 汇率。
 * 后端会保留最近成功行情；前端也保留最后一个有效汇率，避免展示价格短暂为空。
 */
export function useMibanUsdtCnyRate() {
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const liveRate = Number(cryptoPrices?.usdtCnyRate ?? 0);
  const isLiveRateValid = Number.isFinite(liveRate) && liveRate > 0;
  const [lastValidRate, setLastValidRate] = useState(FALLBACK_USDT_CNY_RATE);

  useEffect(() => {
    if (isLiveRateValid) setLastValidRate(liveRate);
  }, [isLiveRateValid, liveRate]);

  return isLiveRateValid ? liveRate : lastValidRate;
}

export function cnyToU(cnyAmount: number, usdtCnyRate: number) {
  const amount = Number(cnyAmount);
  const rate = Number(usdtCnyRate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return 0;
  return amount / rate;
}
