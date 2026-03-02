import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, ArrowLeftRight, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

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
  { code: "TWD", name: "新台币", flag: "🇹🇼" },
  { code: "RUB", name: "卢布", flag: "🇷🇺" },
  { code: "AED", name: "迪拉姆", flag: "🇦🇪" },
];

const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000, 50000];

function fmt(val: number): string {
  if (val === 0) return "0";
  if (val < 0.001) return val.toFixed(6);
  if (val < 0.01) return val.toFixed(5);
  if (val < 1) return val.toFixed(4);
  return val.toFixed(2);
}

function getCurrencyInfo(code: string) {
  return CURRENCIES.find(c => c.code === code) || { code, name: code, flag: "💱" };
}

export default function ExchangeRate() {
  const [fromCurrency, setFromCurrency] = useState("CNY");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState("100");
  const [showPicker, setShowPicker] = useState<"from" | "to" | null>(null);

  const { data, isLoading, refetch } = trpc.exchange.getRates.useQuery(
    { base: fromCurrency },
    { staleTime: 5 * 60 * 1000 }
  );

  const rate = data?.rates?.[toCurrency] ?? null;
  const result = rate !== null && amount ? parseFloat(amount) * rate : null;
  const fromInfo = getCurrencyInfo(fromCurrency);
  const toInfo = getCurrencyInfo(toCurrency);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;

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
        <button onClick={() => refetch()} className="p-2 -mr-2 hover:bg-gray-100 rounded-lg">
          <RefreshCw className={`w-5 h-5 text-[#222] ${isLoading ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      </div>

      <div className="p-4 space-y-3">

        {/* 汇率展示 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#C0392B]" />
              <span className="text-sm text-gray-500 font-medium">实时汇率</span>
            </div>
            <span className="text-xs text-gray-400">天行数据 · {data?.lastUpdated || dateStr}</span>
          </div>
          <div className="text-center py-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">获取汇率中...</span>
              </div>
            ) : rate !== null ? (
              <>
                <div className="text-4xl font-bold text-[#C0392B]">{fmt(rate)}</div>
                <div className="text-sm text-gray-400 mt-1">
                  1 {fromCurrency} = {fmt(rate)} {toCurrency}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-sm py-2">暂无汇率数据</div>
            )}
          </div>
        </div>

        {/* 金额换算 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {/* 源货币行 */}
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1.5">从</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPicker("from")}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 active:bg-gray-100"
                style={{ minWidth: 0, flexShrink: 0 }}
              >
                <span className="text-lg leading-none">{fromInfo.flag}</span>
                <span className="text-sm font-bold text-[#222]">{fromInfo.code}</span>
                <span className="text-xs text-gray-400 hidden sm:inline">{fromInfo.name}</span>
              </button>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 min-w-0 text-right text-2xl font-bold text-[#222] bg-transparent outline-none border-b-2 border-[#C0392B] pb-0.5"
                placeholder="0"
              />
            </div>
          </div>

          {/* 互换按钮 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-100" />
            <button
              onClick={handleSwap}
              className="w-9 h-9 bg-[#C0392B] rounded-full flex items-center justify-center shadow active:scale-95 transition-transform"
            >
              <ArrowLeftRight className="w-4 h-4 text-white" strokeWidth={2.5} />
            </button>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* 目标货币行 */}
          <div>
            <div className="text-xs text-gray-400 mb-1.5">到</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPicker("to")}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 active:bg-gray-100"
                style={{ minWidth: 0, flexShrink: 0 }}
              >
                <span className="text-lg leading-none">{toInfo.flag}</span>
                <span className="text-sm font-bold text-[#222]">{toInfo.code}</span>
                <span className="text-xs text-gray-400 hidden sm:inline">{toInfo.name}</span>
              </button>
              <div className="flex-1 text-right">
                <span className="text-2xl font-bold text-[#C0392B]">
                  {result !== null && !isNaN(result) ? fmt(result) : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 常用金额 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-3">常用金额换算</div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_AMOUNTS.map((val) => {
              const converted = rate !== null ? val * rate : null;
              const isActive = amount === val.toString();
              return (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className={`flex justify-between items-center px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    isActive ? "bg-[#C0392B] text-white" : "bg-gray-50 text-[#222] active:bg-gray-100"
                  }`}
                >
                  <span className="font-medium">{val.toLocaleString()}</span>
                  <span className={`text-xs ${isActive ? "text-white/80" : "text-gray-400"}`}>
                    {converted !== null ? fmt(converted) : "—"} {toCurrency}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 汇率一览 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-3">主要货币（基准：{fromCurrency}）</div>
          <div className="space-y-0">
            {CURRENCIES.filter(c => c.code !== fromCurrency).map((currency) => {
              const r = data?.rates?.[currency.code];
              const isSelected = toCurrency === currency.code;
              return (
                <div
                  key={currency.code}
                  onClick={() => setToCurrency(currency.code)}
                  className={`flex items-center justify-between py-2.5 px-2 -mx-2 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? "bg-red-50" : "active:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{currency.flag}</span>
                    <div>
                      <div className={`text-sm font-medium ${isSelected ? "text-[#C0392B]" : "text-[#222]"}`}>
                        {currency.code}
                      </div>
                      <div className="text-xs text-gray-400">{currency.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${isSelected ? "text-[#C0392B]" : "text-[#222]"}`}>
                      {r !== undefined ? fmt(r) : <span className="text-gray-300">—</span>}
                    </div>
                    {isSelected && <div className="text-xs text-[#C0392B]">已选中</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pb-4">
          汇率数据来源于天行数据，每日更新，仅供参考
        </div>
      </div>

      {/* 货币选择弹窗 */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowPicker(null)}
        >
          <div
            className="bg-white w-full rounded-t-2xl overflow-hidden"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-base font-semibold text-[#222]">
                选择{showPicker === "from" ? "源" : "目标"}货币
              </span>
              <button onClick={() => setShowPicker(null)} className="text-gray-400 text-sm">关闭</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 52px)" }}>
              {CURRENCIES.map((currency) => {
                const isSelected = showPicker === "from"
                  ? fromCurrency === currency.code
                  : toCurrency === currency.code;
                return (
                  <button
                    key={currency.code}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 transition-colors ${
                      isSelected ? "bg-red-50" : "active:bg-gray-50"
                    }`}
                    onClick={() => {
                      if (showPicker === "from") setFromCurrency(currency.code);
                      else setToCurrency(currency.code);
                      setShowPicker(null);
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
