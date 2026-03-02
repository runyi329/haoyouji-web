import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, ArrowLeftRight, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

// 常用货币列表（优先展示）
const COMMON_CURRENCIES = [
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
  { code: "MYR", name: "马来西亚令吉", flag: "🇲🇾" },
  { code: "TWD", name: "新台币", flag: "🇹🇼" },
  { code: "RUB", name: "俄罗斯卢布", flag: "🇷🇺" },
  { code: "AED", name: "迪拉姆", flag: "🇦🇪" },
];

export default function ExchangeRate() {
  const [fromCurrency, setFromCurrency] = useState("CNY");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<number | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const { data, isLoading, refetch } = trpc.exchange.getRates.useQuery(
    { base: fromCurrency },
    { staleTime: 5 * 60 * 1000 }
  );

  useEffect(() => {
    if (data?.rates && toCurrency) {
      const rate = data.rates[toCurrency];
      if (rate && amount) {
        setResult(parseFloat(amount) * rate);
      }
      if (data.lastUpdated) {
        setLastUpdated(data.lastUpdated);
      }
    }
  }, [data, toCurrency, amount]);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const getCurrencyInfo = (code: string) => {
    return COMMON_CURRENCIES.find(c => c.code === code) || { code, name: code, flag: "💱" };
  };

  const fromInfo = getCurrencyInfo(fromCurrency);
  const toInfo = getCurrencyInfo(toCurrency);
  const currentRate = data?.rates?.[toCurrency];

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-white px-4 py-3 flex items-center sticky top-0 z-10 border-b border-gray-100">
        <Link href="/ledger">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-[#222222]" strokeWidth={2} />
          </button>
        </Link>
        <h1 className="flex-1 text-lg font-medium text-center text-[#222222]">汇率计算器</h1>
        <button
          onClick={() => refetch()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="刷新汇率"
        >
          <RefreshCw className={`w-5 h-5 text-[#222222] ${isLoading ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 汇率展示卡片 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#C0392B]" />
              <span className="text-sm text-gray-500">实时汇率</span>
            </div>
            {lastUpdated && (
              <span className="text-xs text-gray-400">更新于 {lastUpdated}</span>
            )}
          </div>

          {/* 汇率核心显示 */}
          <div className="text-center py-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">获取汇率中...</span>
              </div>
            ) : currentRate ? (
              <div>
                <div className="text-3xl font-bold text-[#C0392B]">
                  {currentRate < 0.01
                    ? currentRate.toFixed(6)
                    : currentRate < 1
                    ? currentRate.toFixed(4)
                    : currentRate.toFixed(4)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  1 {fromCurrency} = {currentRate < 0.01 ? currentRate.toFixed(6) : currentRate.toFixed(4)} {toCurrency}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-sm">暂无汇率数据</div>
            )}
          </div>
        </div>

        {/* 金额输入区 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          {/* 源货币 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-2 block">从</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowFromPicker(true); setShowToPicker(false); }}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 min-w-[110px] hover:bg-gray-100 transition-colors"
              >
                <span className="text-xl">{fromInfo.flag}</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-[#222222]">{fromInfo.code}</div>
                  <div className="text-xs text-gray-400">{fromInfo.name}</div>
                </div>
              </button>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 text-right text-2xl font-bold text-[#222222] bg-transparent outline-none border-b-2 border-[#C0392B] pb-1"
                placeholder="0"
              />
            </div>
          </div>

          {/* 交换按钮 */}
          <div className="flex justify-center my-4">
            <button
              onClick={handleSwap}
              className="w-10 h-10 bg-[#C0392B] rounded-full flex items-center justify-center shadow-md hover:bg-[#a93226] transition-colors active:scale-95"
            >
              <ArrowLeftRight className="w-4 h-4 text-white" strokeWidth={2.5} />
            </button>
          </div>

          {/* 目标货币 */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">到</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowToPicker(true); setShowFromPicker(false); }}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 min-w-[110px] hover:bg-gray-100 transition-colors"
              >
                <span className="text-xl">{toInfo.flag}</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-[#222222]">{toInfo.code}</div>
                  <div className="text-xs text-gray-400">{toInfo.name}</div>
                </div>
              </button>
              <div className="flex-1 text-right">
                <div className="text-2xl font-bold text-[#C0392B]">
                  {result !== null && !isNaN(result)
                    ? result < 0.01
                      ? result.toFixed(6)
                      : result.toFixed(2)
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 常用货币快速换算 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-3">常用金额换算</h3>
          <div className="grid grid-cols-2 gap-2">
            {[100, 500, 1000, 5000, 10000, 50000].map((val) => {
              const converted = currentRate ? val * currentRate : null;
              return (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className={`flex justify-between items-center px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    amount === val.toString()
                      ? "bg-[#C0392B] text-white"
                      : "bg-gray-50 text-[#222222] hover:bg-gray-100"
                  }`}
                >
                  <span className="font-medium">{val.toLocaleString()} {fromCurrency}</span>
                  <span className={amount === val.toString() ? "text-white/80" : "text-gray-400"}>
                    {converted !== null
                      ? converted < 0.01
                        ? converted.toFixed(4)
                        : converted.toFixed(2)
                      : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 主要货币汇率一览 */}
        {data?.rates && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-3">主要货币汇率（基准：{fromCurrency}）</h3>
            <div className="divide-y divide-gray-50">
              {COMMON_CURRENCIES.filter(c => c.code !== fromCurrency).map((currency) => {
                const rate = data.rates[currency.code];
                if (!rate) return null;
                return (
                  <div
                    key={currency.code}
                    className="flex items-center justify-between py-2.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                    onClick={() => setToCurrency(currency.code)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{currency.flag}</span>
                      <div>
                        <div className="text-sm font-medium text-[#222222]">{currency.code}</div>
                        <div className="text-xs text-gray-400">{currency.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${toCurrency === currency.code ? "text-[#C0392B]" : "text-[#222222]"}`}>
                        {rate < 0.01 ? rate.toFixed(6) : rate.toFixed(4)}
                      </div>
                      {toCurrency === currency.code && (
                        <div className="text-xs text-[#C0392B]">当前选中</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          汇率数据来源于 ExchangeRate-API，每日更新
        </div>
      </div>

      {/* 货币选择器弹窗 */}
      {(showFromPicker || showToPicker) && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => { setShowFromPicker(false); setShowToPicker(false); }}
        >
          <div
            className="bg-white w-full rounded-t-2xl max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100">
              <h3 className="text-base font-medium text-center text-[#222222]">
                选择{showFromPicker ? "源" : "目标"}货币
              </h3>
            </div>
            <div className="p-4 space-y-1">
              {COMMON_CURRENCIES.map((currency) => (
                <button
                  key={currency.code}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    if (showFromPicker) setFromCurrency(currency.code);
                    else setToCurrency(currency.code);
                    setShowFromPicker(false);
                    setShowToPicker(false);
                  }}
                >
                  <span className="text-2xl">{currency.flag}</span>
                  <div className="text-left flex-1">
                    <div className="text-sm font-semibold text-[#222222]">{currency.code}</div>
                    <div className="text-xs text-gray-400">{currency.name}</div>
                  </div>
                  {((showFromPicker && fromCurrency === currency.code) ||
                    (showToPicker && toCurrency === currency.code)) && (
                    <div className="w-2 h-2 bg-[#C0392B] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
