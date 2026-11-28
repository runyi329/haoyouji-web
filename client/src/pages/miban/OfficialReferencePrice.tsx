import { cnyToUsdt, finitePositive, getUsdtCnyRateFromPrices } from "@shared/usdt-cny-display";
import { trpc } from "@/lib/trpc";

/** Same live quote as other selections; no fixed fallback or trading mutations. */
export function useOfficialUsdtCnyRate(): number | null {
  const { data } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  return getUsdtCnyRateFromPrices(data);
}

export function getOfficialReferencePrice(priceCny: unknown, rate: number | null): number | null {
  const amount = finitePositive(priceCny);
  return amount === null ? null : cnyToUsdt(amount, rate);
}

export default function OfficialReferencePrice({ priceCny, compact = false }: { priceCny?: number; compact?: boolean }) {
  const rate = useOfficialUsdtCnyRate();
  const amount = finitePositive(priceCny);
  const priceU = getOfficialReferencePrice(priceCny, rate);
  return (
    <div data-official-reference-price data-fx-rate={rate ?? ""} data-fx-status={priceU === null ? "pending" : "confirmed"} className="min-w-0">
      <p className={compact ? "text-[9px] leading-4 text-gray-500" : "text-[12px] font-semibold text-gray-500"}>折算参考价</p>
      <p data-official-price-u className={compact ? "whitespace-nowrap text-[20px] font-extrabold leading-7 text-[#C5423E]" : "mt-1 whitespace-nowrap text-[27px] font-extrabold leading-10 text-[#C5423E]"}>
        {priceU === null ? "--" : priceU.toFixed(2)}<span className={compact ? "ml-1 text-[11px] font-bold" : "ml-1.5 text-[15px] font-bold"}>U</span>
      </p>
      {amount !== null ? <p data-official-price-cny className={compact ? "whitespace-nowrap text-[9px] leading-4 text-gray-400" : "mt-1 text-[11px] leading-5 text-gray-500"}>{compact ? "≈ ¥" : "官网零售价 ¥"}{amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p> : <p className="text-[10px] leading-4 text-gray-400">官网价格待核实</p>}
      {amount !== null && priceU === null && <p className="text-[9px] leading-4 text-gray-400">汇率待更新</p>}
    </div>
  );
}
