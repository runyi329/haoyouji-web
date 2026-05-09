/**
 * GujianPage.tsx
 * 谷间优筹 — 美股精选保本增值计划
 * 布局：顶部导航 → 行情选股 → 下单面板 → 我的订单列表
 */
import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, TrendingUp, TrendingDown, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";

// ─── 精选股票池配置 ────────────────────────────────────────────────
const US_STOCKS = [
  { symbol: "NVDA",  name: "NVIDIA",          nameCn: "英伟达",       logo: "https://logo.clearbit.com/nvidia.com" },
  { symbol: "AAPL",  name: "Apple",           nameCn: "苹果",         logo: "https://logo.clearbit.com/apple.com" },
  { symbol: "MSFT",  name: "Microsoft",       nameCn: "微软",         logo: "https://logo.clearbit.com/microsoft.com" },
  { symbol: "TSLA",  name: "Tesla",           nameCn: "特斯拉",       logo: "https://logo.clearbit.com/tesla.com" },
  { symbol: "AMZN",  name: "Amazon",          nameCn: "亚马逊",       logo: "https://logo.clearbit.com/amazon.com" },
  { symbol: "META",  name: "Meta",            nameCn: "Meta",         logo: "https://logo.clearbit.com/meta.com" },
  { symbol: "GOOGL", name: "Google",          nameCn: "谷歌",         logo: "https://logo.clearbit.com/google.com" },
  { symbol: "NFLX",  name: "Netflix",         nameCn: "奈飞",         logo: "https://logo.clearbit.com/netflix.com" },
  { symbol: "AMD",   name: "AMD",             nameCn: "超微半导体",   logo: "https://logo.clearbit.com/amd.com" },
  { symbol: "INTC",  name: "Intel",           nameCn: "英特尔",       logo: "https://logo.clearbit.com/intel.com" },
  { symbol: "COIN",  name: "Coinbase",        nameCn: "Coinbase",     logo: "https://logo.clearbit.com/coinbase.com" },
  { symbol: "PLTR",  name: "Palantir",        nameCn: "Palantir",     logo: "https://logo.clearbit.com/palantir.com" },
  { symbol: "ORCL",  name: "Oracle",          nameCn: "甲骨文",       logo: "https://logo.clearbit.com/oracle.com" },
  { symbol: "MSTR",  name: "MicroStrategy",   nameCn: "微策略",       logo: "https://logo.clearbit.com/microstrategy.com" },
  { symbol: "TSM",   name: "TSMC",            nameCn: "台积电",       logo: "https://logo.clearbit.com/tsmc.com" },
  { symbol: "HOOD",  name: "Robinhood",       nameCn: "Robinhood",    logo: "https://logo.clearbit.com/robinhood.com" },
  { symbol: "WDC",   name: "Western Digital", nameCn: "西部数据",     logo: "https://logo.clearbit.com/westerndigital.com" },
  { symbol: "SNDK",  name: "SanDisk",         nameCn: "闪迪",         logo: "https://logo.clearbit.com/sandisk.com" },
];

// 分配规则（上行分成）
const PROFIT_RULES = [
  { months: 12, growth: 100, ratio: 95 },
  { months: 9,  growth: 75,  ratio: 85 },
  { months: 6,  growth: 50,  ratio: 75 },
  { months: 3,  growth: 25,  ratio: 65 },
];

// 保本规则（下行保障）
const PROTECT_RULES = [
  { months: 12, protect: 100 },
  { months: 9,  protect: 75 },
  { months: 6,  protect: 50 },
  { months: 3,  protect: 25 },
];

// 计算当前应得分成比例
function calcCurrentRatio(createdAt: string | Date, buyPrice: number, currentPrice: number) {
  const start = new Date(createdAt);
  const now = new Date();
  const monthsHeld = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const growthPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
  // 按规则从高到低匹配
  for (const rule of PROFIT_RULES) {
    if (monthsHeld >= rule.months || growthPct >= rule.growth) {
      return { ratio: rule.ratio, monthsHeld: Math.floor(monthsHeld), growthPct };
    }
  }
  // 未达到最低档
  return { ratio: 0, monthsHeld: Math.floor(monthsHeld), growthPct };
}

// 计算保本比例
function calcProtectRatio(createdAt: string | Date) {
  const start = new Date(createdAt);
  const now = new Date();
  const monthsHeld = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
  for (const rule of PROTECT_RULES) {
    if (monthsHeld >= rule.months) return rule.protect;
  }
  return 0;
}

export default function GujianPage() {
  const [, params] = useRoute("/ledger/:id/gujian");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  // 选中的股票
  const [selectedStock, setSelectedStock] = useState(US_STOCKS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 下单面板
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // 行情
  const { data: priceData, isLoading: priceLoading, refetch: refetchPrice } = trpc.getUsStockPrice.useQuery(
    { symbol: selectedStock.symbol },
    { staleTime: 30000, refetchInterval: 30000 }
  );
  const currentPrice = (priceData as any)?.price ?? 0;
  const priceChange = (priceData as any)?.change ?? 0;
  const isUp = priceChange >= 0;

  // 余额
  const { data: assetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 30000 }
  );
  const availableUsdt = (assetData as any)?.total ?? 0;

  // 订单列表
  const utils = trpc.useUtils();
  const { data: ordersData, isLoading: ordersLoading } = trpc.ledger.afGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: "always" }
  );
  const allOrders: any[] = (ordersData as any[]) || [];
  // 只显示谷间优筹的订单
  const gujianOrders = allOrders.filter((o: any) => o.orderType === "谷间优筹");

  // 下单
  const submitOrderMutation = trpc.ledger.afSubmitOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已提交");
      setOrderAmount("");
      setOrderPrice("");
      setSliderPct(0);
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("下单失败", { description: e.message }),
  });

  // 撤单
  const cancelMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已撤销");
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("撤单失败", { description: e.message }),
  });

  // 当前价格变化时，更新委托价格输入框（仅当为空时）
  useEffect(() => {
    if (currentPrice > 0 && !orderPrice) {
      setOrderPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice]);

  // 滑块金额计算
  const sliderAmount = availableUsdt > 0 ? (availableUsdt * sliderPct / 100) : 0;

  const handleSubmit = () => {
    const price = parseFloat(orderPrice);
    if (!price || price <= 0) { toast.error("请输入委托价格"); return; }
    const amt = parseFloat(orderAmount) || sliderAmount;
    if (!amt || amt <= 0) { toast.error("请输入金额"); return; }
    if (amt > availableUsdt) { toast.error("金额超过可用余额"); return; }
    // 股票数量 = 金额 / 价格（1:1，不加杠杆）
    const qty = (amt / price).toFixed(6);
    submitOrderMutation.mutate({
      ledgerId,
      coin: selectedStock.symbol,
      side: "buy",
      limitPrice: price.toString(),
      amount: amt.toFixed(2),
      quantity: qty,
      orderType: "谷间优筹",
    });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F0F4FF" }}>
      {/* 顶部导航 */}
      <div className="flex-shrink-0 text-white px-4 pt-safe" style={{ background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" }}>
        <div className="flex items-center justify-between h-12">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="flex items-center gap-1 text-white/80 active:text-white">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>
          <div className="text-center">
            <div className="font-bold text-base">谷间优筹</div>
            <div className="text-[10px] text-white/70">美股精选保本增值计划</div>
          </div>
          <button onClick={() => refetchPrice()} className="text-white/70 active:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 space-y-3 mt-3">

          {/* 股票选择下拉框 + 实时行情 */}
          <div className="rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E0E8FF" }}>
            {/* 下拉选股 */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50"
              >
                <img
                  src={selectedStock.logo}
                  alt={selectedStock.name}
                  className="w-9 h-9 rounded-full object-contain border border-gray-100 flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedStock.symbol}&background=1A56DB&color=fff&size=36`; }}
                />
                <div className="flex-1 text-left">
                  <div className="font-semibold text-sm" style={{ color: "#1A2340" }}>{selectedStock.name}</div>
                  <div className="text-xs" style={{ color: "#6B7280" }}>{selectedStock.nameCn} · {selectedStock.symbol}</div>
                </div>
                {/* 实时价格 */}
                <div className="text-right mr-1">
                  {priceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <div className="font-bold text-base" style={{ color: "#1A2340" }}>
                        ${currentPrice > 0 ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}
                      </div>
                      <div className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? "text-[#0EA56A]" : "text-[#EF4444]"}`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isUp ? "+" : ""}{priceChange.toFixed(2)}%
                      </div>
                    </>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} style={{ color: "#9CA3AF" }} />
              </button>

              {/* 下拉列表 */}
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-50 bg-white shadow-xl rounded-b-2xl border-t border-gray-100 max-h-64 overflow-y-auto">
                  {US_STOCKS.map((stock) => (
                    <button
                      key={stock.symbol}
                      onClick={() => {
                        setSelectedStock(stock);
                        setDropdownOpen(false);
                        setOrderPrice(""); // 清空价格，让新行情填入
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 active:bg-blue-50 ${selectedStock.symbol === stock.symbol ? "bg-blue-50" : ""}`}
                    >
                      <img
                        src={stock.logo}
                        alt={stock.name}
                        className="w-8 h-8 rounded-full object-contain border border-gray-100 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${stock.symbol}&background=1A56DB&color=fff&size=32`; }}
                      />
                      <div className="flex-1 text-left">
                        <span className="font-medium text-sm" style={{ color: "#1A2340" }}>{stock.name}</span>
                        <span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>{stock.nameCn}</span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: "#6B7280" }}>{stock.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 下单面板 */}
          <div className="rounded-2xl bg-white shadow-sm px-4 py-4 space-y-3" style={{ border: "1px solid #E0E8FF" }}>
            {/* 买入/卖出切换 */}
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#E0E8FF" }}>
              <button
                onClick={() => setOrderSide("buy")}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${orderSide === "buy" ? "text-white" : "text-gray-500"}`}
                style={orderSide === "buy" ? { background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" } : { backgroundColor: "#F8FAFF" }}
              >
                委托买入
              </button>
              <button
                onClick={() => setOrderSide("sell")}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${orderSide === "sell" ? "text-white" : "text-gray-500"}`}
                style={orderSide === "sell" ? { backgroundColor: "#EF4444" } : { backgroundColor: "#F8FAFF" }}
              >
                委托卖出
              </button>
            </div>

            {orderSide === "buy" && (
              <>
                {/* 可用余额 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>可用余额</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: "#1A2340" }}>
                      {availableUsdt > 0 ? availableUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
                    </span>
                    <button
                      onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}`)}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: "#E8EEFF", color: "#1A56DB" }}
                    >+</button>
                  </div>
                </div>

                {/* 委托价格 */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>委托价格（USD）</label>
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    placeholder={currentPrice > 0 ? `当前 $${currentPrice.toFixed(2)}` : "请输入委托价格"}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                  />
                </div>

                {/* 金额输入 */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>投入金额（USDT）</label>
                  <input
                    type="number"
                    value={orderAmount}
                    onChange={(e) => {
                      setOrderAmount(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && availableUsdt > 0) {
                        setSliderPct(Math.min(100, Math.round((num / availableUsdt) * 100)));
                      }
                    }}
                    placeholder="请输入投入金额"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                  />
                </div>

                {/* 滑块 */}
                <div>
                  <input
                    type="range" min={0} max={100} value={sliderPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setSliderPct(val);
                      const amt = availableUsdt > 0 ? (availableUsdt * val / 100) : 0;
                      setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                    }}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>

                {/* 可买数量预览 */}
                {(() => {
                  const amt = parseFloat(orderAmount) || sliderAmount;
                  const price = parseFloat(orderPrice);
                  const qty = amt > 0 && price > 0 ? (amt / price) : null;
                  return (
                    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "#EEF2FF", border: "1px solid #D0DBFF" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold" style={{ color: "#1A56DB" }}>预计买入数量</span>
                        <span className="text-sm font-bold" style={{ color: qty !== null ? "#1A2340" : "#9CA3AF" }}>
                          {qty !== null ? `${qty.toFixed(4)} ${selectedStock.symbol}` : `-- ${selectedStock.symbol}`}
                        </span>
                      </div>
                      {qty !== null && (
                        <div className="text-xs mt-1" style={{ color: "#6B7A9A" }}>
                          {(parseFloat(orderAmount) || sliderAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ÷ {parseFloat(orderPrice).toLocaleString()} = {qty.toFixed(4)} 股
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 提交按钮 */}
                <button
                  onClick={handleSubmit}
                  disabled={submitOrderMutation.isPending}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" }}
                >
                  {submitOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  确认委托买入
                </button>
              </>
            )}

            {orderSide === "sell" && (
              <>
                {/* 可委卖的订单 */}
                <div className="text-xs mb-1" style={{ color: "#6B7280" }}>选择要卖出的订单</div>
                {(() => {
                  const sellableOrders = gujianOrders.filter(
                    (o: any) => (o.status === "completed" || o.status === "pending")
                      && o.sellStatus !== "selling" && o.sellStatus !== "sold"
                  );
                  if (sellableOrders.length === 0) {
                    return <div className="text-xs text-gray-400 py-2">暂无可卖出的持仓订单</div>;
                  }
                  return (
                    <div className="space-y-2">
                      {sellableOrders.map((o: any) => (
                        <div
                          key={o.id}
                          className="rounded-xl px-3 py-2.5"
                          style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF" }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold" style={{ color: "#1A2340" }}>{o.coin}</span>
                              <span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>买入价 ${parseFloat(o.limitPrice).toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium" style={{ color: "#1A2340" }}>{parseFloat(o.quantity).toFixed(4)} 股</div>
                              <div className="text-xs" style={{ color: "#9CA3AF" }}>{parseFloat(o.amount).toFixed(2)} USDT</div>
                            </div>
                          </div>
                          <div className="mt-2">
                            <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>委卖价格（USD）</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder={currentPrice > 0 ? `当前 $${currentPrice.toFixed(2)}` : "委卖价格"}
                                className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                style={{ backgroundColor: "#FFFFFF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                                id={`sell-price-${o.id}`}
                              />
                              <button
                                onClick={() => {
                                  const priceInput = document.getElementById(`sell-price-${o.id}`) as HTMLInputElement;
                                  const price = parseFloat(priceInput?.value || "");
                                  if (!price || price <= 0) { toast.error("请输入委卖价格"); return; }
                                  submitOrderMutation.mutate({
                                    ledgerId,
                                    coin: o.coin,
                                    side: "sell",
                                    limitPrice: price.toString(),
                                    amount: o.amount,
                                    quantity: o.quantity,
                                    orderType: "谷间优筹",
                                    sourceOrderId: o.id,
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs text-white font-medium"
                                style={{ backgroundColor: "#EF4444" }}
                              >
                                委卖
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* 我的订单列表 */}
          <div className="rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E0E8FF" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: "#E0E8FF" }}>
              <span className="font-semibold text-sm" style={{ color: "#1A2340" }}>我的订单</span>
              <span className="text-xs ml-2" style={{ color: "#9CA3AF" }}>{gujianOrders.length} 笔</span>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : gujianOrders.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: "#9CA3AF" }}>暂无订单，快去下单吧</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#F0F4FF" }}>
                {gujianOrders.map((order: any) => {
                  const isExpanded = expandedOrderId === order.id;
                  const statusLabel =
                    order.sellStatus === "sold" ? "已卖出" :
                    order.sellStatus === "selling" ? "委卖中" :
                    order.status === "completed" ? "持仓中" :
                    order.status === "cancelled" ? "已撤单" : "委买中";
                  const statusColor =
                    order.sellStatus === "sold" ? "#6B7280" :
                    order.sellStatus === "selling" ? "#EF4444" :
                    order.status === "completed" ? "#0EA56A" :
                    order.status === "cancelled" ? "#94A3B8" : "#F59E0B";

                  // 当前价格（如果选中了同一股票）
                  const livePrice = selectedStock.symbol === order.coin ? currentPrice : 0;
                  const { ratio, monthsHeld, growthPct } = livePrice > 0
                    ? calcCurrentRatio(order.createdAt, parseFloat(order.limitPrice), livePrice)
                    : { ratio: 0, monthsHeld: 0, growthPct: 0 };
                  const protectRatio = calcProtectRatio(order.createdAt);

                  // 订单时间
                  const timeStr = new Date(order.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  });

                  return (
                    <div key={order.id}>
                      {/* 订单摘要行 */}
                      <button
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-50 text-left"
                      >
                        <img
                          src={US_STOCKS.find(s => s.symbol === order.coin)?.logo || ""}
                          alt={order.coin}
                          className="w-8 h-8 rounded-full object-contain border border-gray-100 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${order.coin}&background=1A56DB&color=fff&size=32`; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm" style={{ color: "#1A2340" }}>{order.coin}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>{statusLabel}</span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>${parseFloat(order.limitPrice).toLocaleString()} · {timeStr}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold" style={{ color: "#1A2340" }}>{parseFloat(order.amount).toFixed(2)} U</div>
                          <div className="text-xs" style={{ color: "#9CA3AF" }}>{parseFloat(order.quantity).toFixed(4)} 股</div>
                        </div>
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} style={{ color: "#9CA3AF" }} />
                      </button>

                      {/* 展开详情 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2" style={{ backgroundColor: "#F8FAFF" }}>
                          <div className="h-px" style={{ backgroundColor: "#E0E8FF" }} />

                          {/* 基本信息 */}
                          {[
                            { label: "股票代码", value: order.coin },
                            { label: "委托价格", value: `$${parseFloat(order.limitPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
                            { label: "投入金额", value: `${parseFloat(order.amount).toFixed(2)} USDT` },
                            { label: "持股数量", value: `${parseFloat(order.quantity).toFixed(4)} 股` },
                            { label: "类型/状态", value: `谷间优筹 · ${statusLabel}` },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>{label}</span>
                              <span style={{ color: "#1A2340" }}>{value}</span>
                            </div>
                          ))}

                          {/* 持仓中：显示实时收益分配 */}
                          {order.status === "completed" && order.sellStatus !== "sold" && livePrice > 0 && (
                            <div className="rounded-xl p-3 mt-2" style={{ backgroundColor: "#EEF2FF", border: "1px solid #D0DBFF" }}>
                              <div className="text-xs font-semibold mb-2" style={{ color: "#1A56DB" }}>实时收益预估</div>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span style={{ color: "#6B7280" }}>当前价格</span>
                                  <span className={`font-medium ${isUp ? "text-[#0EA56A]" : "text-[#EF4444]"}`}>
                                    ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                    <span className="ml-1">({growthPct >= 0 ? "+" : ""}{growthPct.toFixed(2)}%)</span>
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: "#6B7280" }}>持有时长</span>
                                  <span style={{ color: "#1A2340" }}>{monthsHeld} 个月</span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: "#6B7280" }}>当前分成比例</span>
                                  <span className="font-semibold" style={{ color: ratio > 0 ? "#0EA56A" : "#9CA3AF" }}>
                                    {ratio > 0 ? `客户得 ${ratio}%` : "未达最低档"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: "#6B7280" }}>下行保障</span>
                                  <span className="font-semibold" style={{ color: protectRatio > 0 ? "#1A56DB" : "#9CA3AF" }}>
                                    {protectRatio > 0 ? `亏损 ${protectRatio}% 补足` : "未达保障档"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 卖出信息 */}
                          {order.sellStatus === "selling" && (
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>委卖价格</span>
                              <span className="font-medium" style={{ color: "#EF4444" }}>${parseFloat(order.sellPrice).toLocaleString()}</span>
                            </div>
                          )}
                          {order.sellStatus === "sold" && (
                            <>
                              <div className="flex justify-between items-center text-sm">
                                <span style={{ color: "#9CA3AF" }}>卖出价格</span>
                                <span className="font-medium" style={{ color: "#0EA56A" }}>${parseFloat(order.sellPrice).toLocaleString()}</span>
                              </div>
                              {order.sellConfirmedAt && (
                                <div className="flex justify-between items-center text-sm">
                                  <span style={{ color: "#9CA3AF" }}>卖出时间</span>
                                  <span style={{ color: "#6B7280" }}>{order.sellConfirmedAt}</span>
                                </div>
                              )}
                            </>
                          )}

                          {/* 买入时间 */}
                          <div className="flex justify-between items-center text-sm">
                            <span style={{ color: "#9CA3AF" }}>买入时间</span>
                            <span style={{ color: "#6B7280" }}>{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                          </div>

                          {/* 撤单按钮（委买中可撤） */}
                          {order.status === "pending" && order.sellStatus !== "selling" && (
                            <button
                              onClick={() => cancelMutation.mutate({ orderId: order.id, ledgerId })}
                              disabled={cancelMutation.isPending}
                              className="w-full mt-2 py-2 rounded-xl text-xs font-medium border active:opacity-80"
                              style={{ borderColor: "#E0E8FF", color: "#9CA3AF" }}
                            >
                              撤销委托
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部说明 */}
          <div className="text-center text-[10px] pb-4" style={{ color: "#9CA3AF" }}>
            投资有风险，入市需谨慎。本产品不构成任何投资建议，过往业绩不代表未来表现。
          </div>
        </div>
      </div>
    </div>
  );
}
