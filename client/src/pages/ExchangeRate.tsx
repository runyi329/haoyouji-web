import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, ChevronDown } from "lucide-react";

const CURRENCIES = [
  { code: "CNY", name: "人民币", flag: "🇨🇳" },
  { code: "USD", name: "美元", flag: "🇺🇸" },
  { code: "EUR", name: "欧元", flag: "🇪🇺" },
  { code: "GBP", name: "英镑", flag: "🇬🇧" },
  { code: "JPY", name: "日元", flag: "🇯🇵" },
  { code: "HKD", name: "港币", flag: "🇭🇰" },
  { code: "MOP", name: "澳门币", flag: "🇲🇴" },
  { code: "KRW", name: "韩元", flag: "🇰🇷" },
  { code: "AUD", name: "澳元", flag: "🇦🇺" },
  { code: "CAD", name: "加元", flag: "🇨🇦" },
  { code: "SGD", name: "新加坡元", flag: "🇸🇬" },
  { code: "CHF", name: "瑞士法郎", flag: "🇨🇭" },
  { code: "THB", name: "泰铢", flag: "🇹🇭" },
  { code: "MYR", name: "令吉", flag: "🇲🇾" },
  { code: "RUB", name: "卢布", flag: "🇷🇺" },
  { code: "AED", name: "迪拉姆", flag: "🇦🇪" },
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
    <div className="flex flex-col" style={{ height: "100dvh", background: "#F2F2F7", overflow: "hidden" }}>

      {/* 顶部红色区域（固定不动） */}
      <div style={{ background: "linear-gradient(135deg, #C0392B 0%, #96281B 100%)", flexShrink: 0 }}>
        {/* 导航栏 */}
        <div className="px-4 pt-3 pb-2 flex items-center">
          <Link href="/ledger">
            <button className="p-2 -ml-2 rounded-lg active:bg-white/10">
              <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          </Link>
          <h1 className="flex-1 text-base font-semibold text-center text-white">汇率计算器</h1>
          <button
            onClick={() => { delete ratesCache[fromCurrency]; loadRates(fromCurrency); }}
            className="p-2 -mr-2 rounded-lg active:bg-white/10"
          >
            <RefreshCw className={`w-5 h-5 text-white/80 ${isLoading ? "animate-spin" : ""}`} strokeWidth={2} />
          </button>
        </div>

        {/* 输入区 */}
        <div className="px-4 pb-6 pt-2">
          {/* 货币选择按钮 */}
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 mb-4 active:opacity-80"
          >
            <span className="text-2xl leading-none">{fromInfo.flag}</span>
            <span className="text-lg font-bold text-white">{fromInfo.code}</span>
            <span className="text-sm text-white/60">{fromInfo.name}</span>
            <ChevronDown className="w-4 h-4 text-white/60 ml-0.5" />
          </button>

          {/* 金额输入 */}
          <div className="flex items-end gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 min-w-0 text-4xl font-bold text-white bg-transparent outline-none border-b border-white/30 pb-1 placeholder-white/30"
              placeholder="0"
              style={{ caretColor: "white" }}
            />
            <span className="text-base text-white/50 pb-1.5 flex-shrink-0">{fromInfo.code}</span>
          </div>

          {/* 更新时间 */}
          <div className="mt-3 text-xs text-white/40">
            {isLoading ? "获取汇率中..." : `数据更新于 ${lastUpdated}`}
          </div>
        </div>
      </div>

      {/* 货币列表（可滚动） */}
      <div className="px-3 pt-3 pb-6 overflow-y-auto" style={{ flex: 1, WebkitOverflowScrolling: "touch" }}>
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          {isLoading ? (
            <div>
              {otherCurrencies.map((c) => (
                <div key={c.code} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                    <div>
                      <div className="w-8 h-3 bg-gray-100 rounded animate-pulse mb-1" />
                      <div className="w-14 h-2.5 bg-gray-50 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="w-16 h-3.5 bg-gray-100 rounded animate-pulse mb-1 ml-auto" />
                    <div className="w-20 h-2.5 bg-gray-50 rounded animate-pulse ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {otherCurrencies.map((currency, idx) => {
                const rate = rates[currency.code];
                const converted = rate !== undefined ? inputAmount * rate : null;
                const isLast = idx === otherCurrencies.length - 1;
                return (
                  <div
                    key={currency.code}
                    className={`flex items-center justify-between px-4 py-2.5 active:bg-gray-50 transition-colors ${!isLast ? "border-b border-gray-50" : ""}`}
                  >
                    {/* 左侧：国旗 + 货币信息 */}
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none flex-shrink-0">{currency.flag}</span>
                      <div>
                        <div className="text-sm font-semibold text-[#1a1a1a] leading-tight">{currency.code}</div>
                        <div className="text-xs text-gray-400 leading-tight">{currency.name}</div>
                      </div>
                    </div>
                    {/* 右侧：换算金额 + 汇率 */}
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#1a1a1a] leading-tight tabular-nums">
                        {converted !== null && !isNaN(converted) ? fmt(converted) : "—"}
                      </div>
                      <div className="text-xs text-gray-400 leading-tight tabular-nums">
                        {rate !== undefined ? `1 = ${fmt(rate)}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-3" style={{ color: "#AEAEB2" }}>
          汇率每日更新，仅供参考
        </p>
      </div>

      {/* 货币选择弹窗 */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowPicker(false)}
        >
          <div
            className="bg-white w-full rounded-t-2xl overflow-hidden"
            style={{ maxHeight: "72vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
              <span className="text-base font-semibold text-[#1a1a1a]">选择基准货币</span>
              <button
                onClick={() => setShowPicker(false)}
                className="text-sm px-3 py-1 rounded-lg active:bg-gray-100"
                style={{ color: "#C0392B" }}
              >
                完成
              </button>
            </div>
            {/* 货币列表 */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(72vh - 52px)" }}>
              {CURRENCIES.map((currency) => {
                const isSelected = fromCurrency === currency.code;
                return (
                  <button
                    key={currency.code}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${
                      isSelected ? "bg-red-50" : "active:bg-gray-50"
                    }`}
                    onClick={() => {
                      setFromCurrency(currency.code);
                      setShowPicker(false);
                    }}
                  >
                    <span className="text-2xl flex-shrink-0">{currency.flag}</span>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-semibold ${isSelected ? "text-[#C0392B]" : "text-[#1a1a1a]"}`}>
                        {currency.code}
                      </div>
                      <div className="text-xs text-gray-400">{currency.name}</div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#C0392B" }}>
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
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
