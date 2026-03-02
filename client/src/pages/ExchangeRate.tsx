import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, TrendingUp, ChevronDown } from "lucide-react";

const CURRENCIES = [
  { code: "CNY", name: "人民币", flag: "🇨🇳" },
  { code: "USD", name: "美元", flag: "🇺🇸" },
  { code: "EUR", name: "欧元", flag: "🇪🇺" },
  { code: "GBP", name: "英镑", flag: "🇬🇧" },
  { code: "JPY", name: "日元", flag: "🇯🇵" },
  { code: "HKD", name: "港币", flag: "🇭🇰" },
  { code: "KRW", name: "韩元", flag: "🇰🇷" },
  { code: "AUD", name: "澳元", flag: "🇦🇺" },
  { code: "CAD", name: "加元", flag: "🇨🇦" },
  { code: "SGD", name: "新加坡元", flag: "🇸🇬" },
  { code: "CHF", name: "瑞士法郎", flag: "🇨🇭" },
  { code: "THB", name: "泰铢", flag: "🇹🇭" },
  { code: "MYR", name: "令吉", flag: "🇲🇾" },
  { code: "RUB", name: "卢布", flag: "🇷🇺" },
  { code: "AED", name: "迪拉姆", flag: "🇦🇪" },
  { code: "MOP", name: "澳门币", flag: "🇲🇴" },
];

function fmt(val: number): string {
  if (val === 0) return "0";
  if (val < 0.001) return val.toFixed(6);
  if (val < 0.01) return val.toFixed(5);
  if (val < 1) return val.toFixed(4);
  if (val >= 10000) return val.toLocaleString("en", { maximumFractionDigits: 2 });
  return val.toFixed(2);
}

function getCurrencyInfo(code: string) {
  return CURRENCIES.find(c => c.code === code) || { code, name: code, flag: "💱" };
}

const ratesCache: Record<string, { rates: Record<string, number>; lastUpdated: string; fetchedAt: number }> = {};

async function fetchRates(base: string): Promise<{ rates: Record<string, number>; lastUpdated: string } | null> {
  const cached = ratesCache[base];
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return { rates: cached.rates, lastUpdated: cached.lastUpdated };
  }
  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await resp.json();
    if (data.result === "success") {
      const d = new Date(data.time_last_update_utc);
      const lastUpdated = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      ratesCache[base] = { rates: data.rates, lastUpdated, fetchedAt: Date.now() };
      return { rates: data.rates, lastUpdated };
    }
    return null;
  } catch {
    return null;
  }
}

export default function ExchangeRate() {
  const [fromCurrency, setFromCurrency] = useState("CNY");
  const [amount, setAmount] = useState("100");
  const [showPicker, setShowPicker] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [lastUpdated, setLastUpdated] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadRates = async (base: string) => {
    setIsLoading(true);
    const result = await fetchRates(base);
    if (result) {
      setRates(result.rates);
      setLastUpdated(result.lastUpdated);
    } else {
      setRates({});
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadRates(fromCurrency);
  }, [fromCurrency]);

  const fromInfo = getCurrencyInfo(fromCurrency);
  const inputAmount = parseFloat(amount) || 0;
  const otherCurrencies = CURRENCIES.filter(c => c.code !== fromCurrency);

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-100">
        <Link href="/ledger">
          <button className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-5 h-5 text-[#222]" strokeWidth={2} />
          </button>
        </Link>
        <h1 className="flex-1 text-base font-semibold text-center text-[#222]">汇率计算器</h1>
        <button onClick={() => loadRates(fromCurrency)} className="p-2 -mr-2 hover:bg-gray-100 rounded-lg">
          <RefreshCw className={`w-5 h-5 text-[#222] ${isLoading ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      </div>

      {/* 输入区 —— 固定在顶部 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-5">
        {/* 数据来源标注 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#C0392B]" />
            <span className="text-sm text-gray-500 font-medium">实时汇率</span>
          </div>
          <span className="text-xs text-gray-400">
            {isLoading ? "获取中..." : `每日更新 · ${lastUpdated}`}
          </span>
        </div>

        {/* 货币选择 + 金额输入 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100 active:bg-gray-100 flex-shrink-0"
          >
            <span className="text-2xl leading-none">{fromInfo.flag}</span>
            <div className="text-left">
              <div className="text-base font-bold text-[#222] leading-tight">{fromInfo.code}</div>
              <div className="text-xs text-gray-400 leading-tight">{fromInfo.name}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 text-right text-3xl font-bold text-[#222] bg-transparent outline-none border-b-2 border-[#C0392B] pb-1"
            placeholder="0"
          />
        </div>
      </div>

      {/* 货币列表 —— 联动显示 */}
      <div className="px-4 pt-3 pb-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            // 骨架屏
            <div className="divide-y divide-gray-50">
              {otherCurrencies.map((c) => (
                <div key={c.code} className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-gray-100 rounded-full animate-pulse" />
                    <div>
                      <div className="w-10 h-3.5 bg-gray-100 rounded animate-pulse mb-1" />
                      <div className="w-14 h-2.5 bg-gray-50 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {otherCurrencies.map((currency) => {
                const rate = rates[currency.code];
                const converted = rate !== undefined ? inputAmount * rate : null;
                return (
                  <div
                    key={currency.code}
                    className="flex items-center justify-between px-4 py-2 active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none">{currency.flag}</span>
                      <div>
                        <div className="text-sm font-semibold text-[#222]">{currency.code}</div>
                        <div className="text-xs text-gray-400">{currency.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#222]">
                        {converted !== null && !isNaN(converted) ? fmt(converted) : "—"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {rate !== undefined ? `1 ${fromCurrency} = ${fmt(rate)}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-center text-xs text-gray-400 mt-3">
          汇率数据每日更新，仅供参考
        </div>
      </div>

      {/* 货币选择弹窗 */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="bg-white w-full rounded-t-2xl overflow-hidden"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-base font-semibold text-[#222]">选择基准货币</span>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 text-sm">关闭</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 52px)" }}>
              {CURRENCIES.map((currency) => {
                const isSelected = fromCurrency === currency.code;
                return (
                  <button
                    key={currency.code}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 transition-colors ${
                      isSelected ? "bg-red-50" : "active:bg-gray-50"
                    }`}
                    onClick={() => {
                      setFromCurrency(currency.code);
                      setShowPicker(false);
                    }}
                  >
                    <span className="text-2xl">{currency.flag}</span>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-semibold ${isSelected ? "text-[#C0392B]" : "text-[#222]"}`}>
                        {currency.code}
                      </div>
                      <div className="text-xs text-gray-400">{currency.name}</div>
                    </div>
                    {isSelected && <div className="w-2 h-2 bg-[#C0392B] rounded-full flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
