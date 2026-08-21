/**
 * 52号账本卖期权设置。
 * 管理员可批量创建同一到期日、同一方向的期权，并独立绑定到用户买入价格档位。
 */
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Link2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

// ETH 期权行权价和谷底增筹用户买入价格的可选档位（50 USDT 一档）
const PRICE_LEVELS = Array.from({ length: 19 }, (_, index) => 1300 + index * 50);
const BUY_PRICE_LEVELS = [...PRICE_LEVELS].reverse();

type OptionConfig = {
  id: number;
  coin: string;
  expiry_label: string;
  expiry_date: string | Date;
  strike_price: string | number;
  bind_buy_price?: string | number | null;
  option_type: "PUT" | "CALL";
  instrument_name: string;
  monthly_yield: string | number;
  enabled: number | boolean;
};

function toDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDateCN(dateStr: string): string {
  if (!dateStr) return "未设置日期";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function makeInstrumentName(dateStr: string, strike: number, optionType: "PUT" | "CALL"): string {
  return `ETH-${dateStr.replace(/-/g, "")}-${strike}-${optionType === "PUT" ? "P" : "C"}`;
}

function todayInBeijing(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function optionDescriptor(option: OptionConfig): string {
  return `${option.option_type} · 行权价 ${Number(option.strike_price).toLocaleString()} · ${formatDateCN(toDateOnly(option.expiry_date))}`;
}

export default function AfOptionSellSettings() {
  const [, params] = useRoute("/ledger/:id/option-sell-settings");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id || 52);
  const today = todayInBeijing();

  const configQuery = trpc.ledger.afGetOptionSellConfig.useQuery({ ledgerId });
  const migrateMutation = trpc.ledger.afMigrateOptionSellConfig.useMutation({
    onSuccess: (data) => {
      toast.success(`初始化完成：${data.results.join("；")}`);
      void configQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveMutation = trpc.ledger.afSaveOptionSellConfig.useMutation({
    onSuccess: () => {
      toast.success("期权已保存");
      void configQuery.refetch();
      setSelectedStrikes([]);
      setYieldByStrike({});
    },
    onError: (error) => toast.error(error.message),
  });
  const bindMutation = trpc.ledger.afBindOptionToBuyPrice.useMutation({
    onSuccess: () => {
      toast.success("买入价格绑定已更新");
      void configQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = trpc.ledger.afDeleteOptionSellConfig.useMutation({
    onSuccess: () => {
      toast.success("期权已删除");
      void configQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  // 批量新建表单：日期和方向共用，行权价可多选并分别设定收益率
  const [expiryDate, setExpiryDate] = useState("");
  const [optionType, setOptionType] = useState<"PUT" | "CALL">("PUT");
  const [selectedStrikes, setSelectedStrikes] = useState<number[]>([]);
  const [yieldByStrike, setYieldByStrike] = useState<Record<number, string>>({});
  const [showExpired, setShowExpired] = useState(false);

  const configs = (configQuery.data?.configs || []) as OptionConfig[];
  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => {
      const dateCompare = toDateOnly(a.expiry_date).localeCompare(toDateOnly(b.expiry_date));
      if (dateCompare !== 0) return dateCompare;
      const strikeCompare = Number(a.strike_price) - Number(b.strike_price);
      if (strikeCompare !== 0) return strikeCompare;
      return a.option_type.localeCompare(b.option_type);
    }),
    [configs],
  );
  const upcomingOptions = sortedConfigs.filter((option) => toDateOnly(option.expiry_date) >= today);
  const expiredOptions = sortedConfigs.filter((option) => toDateOnly(option.expiry_date) < today);

  // 一个买入价只能绑定一条未到期且启用的期权。
  const bindingByPrice = useMemo(() => {
    const bindings: Record<number, OptionConfig> = {};
    for (const option of upcomingOptions) {
      const bindPrice = option.bind_buy_price === null || option.bind_buy_price === undefined
        ? NaN
        : Number(option.bind_buy_price);
      if (option.enabled && Number.isFinite(bindPrice)) bindings[bindPrice] = option;
    }
    return bindings;
  }, [upcomingOptions]);

  const toggleStrike = (strike: number) => {
    setSelectedStrikes((previous) => {
      if (previous.includes(strike)) return previous.filter((item) => item !== strike);
      return [...previous, strike].sort((a, b) => a - b);
    });
  };

  const handleBatchCreate = () => {
    if (!expiryDate) {
      toast.error("请选择期权到期日");
      return;
    }
    if (selectedStrikes.length === 0) {
      toast.error("请至少选择一个行权价");
      return;
    }
    const invalidStrike = selectedStrikes.find((strike) => {
      const monthlyYield = Number.parseFloat(yieldByStrike[strike] || "");
      return !Number.isFinite(monthlyYield) || monthlyYield <= 0;
    });
    if (invalidStrike !== undefined) {
      toast.error(`请为行权价 ${invalidStrike} 填写大于 0 的月化收益率`);
      return;
    }

    saveMutation.mutate({
      ledgerId,
      configs: selectedStrikes.map((strike) => ({
        coin: "ETH",
        expiryLabel: expiryDate,
        expiryDate,
        strikePrice: strike,
        bindBuyPrice: null,
        optionType,
        instrumentName: makeInstrumentName(expiryDate, strike, optionType),
        monthlyYield: Number.parseFloat(yieldByStrike[strike]) / 100,
        enabled: true,
      })),
    });
  };

  const handleToggle = (option: OptionConfig) => {
    const expiry = toDateOnly(option.expiry_date);
    saveMutation.mutate({
      ledgerId,
      configs: [{
        coin: option.coin,
        expiryLabel: option.expiry_label || expiry,
        expiryDate: expiry,
        strikePrice: Number(option.strike_price),
        bindBuyPrice: option.bind_buy_price === null || option.bind_buy_price === undefined
          ? null
          : Number(option.bind_buy_price),
        optionType: option.option_type,
        instrumentName: option.instrument_name,
        monthlyYield: Number(option.monthly_yield),
        enabled: !Boolean(option.enabled),
      }],
    });
  };

  const handleBind = (buyPrice: number, optionIdValue: string) => {
    const optionId = Number(optionIdValue);
    if (!Number.isFinite(optionId)) {
      const existing = bindingByPrice[buyPrice];
      if (existing) bindMutation.mutate({ ledgerId, optionId: existing.id, buyPrice: null });
      return;
    }
    bindMutation.mutate({ ledgerId, optionId, buyPrice });
  };

  const renderOptionRow = (option: OptionConfig, archived = false) => {
    const expired = toDateOnly(option.expiry_date) < today;
    const yieldPercent = (Number(option.monthly_yield) * 100).toFixed(1);
    const bindPrice = option.bind_buy_price === null || option.bind_buy_price === undefined
      ? null
      : Number(option.bind_buy_price);

    return (
      <div key={option.id} className={`rounded-xl border px-3 py-3 ${archived ? "border-gray-100 bg-gray-50" : "border-gray-100 bg-white"}`}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 flex-shrink-0"
            onClick={() => handleToggle(option)}
            disabled={saveMutation.isPending || expired}
            title={expired ? "已到期期权不可再启用" : option.enabled ? "停用期权" : "启用期权"}
          >
            {option.enabled && !expired
              ? <ToggleRight className="h-5 w-5 text-blue-600" />
              : <ToggleLeft className="h-5 w-5 text-gray-300" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${option.option_type === "PUT" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                {option.option_type === "PUT" ? "PUT 看跌" : "CALL 看涨"}
              </span>
              <span className="font-mono text-sm font-semibold text-gray-800">行权价 {Number(option.strike_price).toLocaleString()}</span>
              <span className="text-xs font-semibold text-blue-600">月化 {yieldPercent}%</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">到期日：{formatDateCN(toDateOnly(option.expiry_date))}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-gray-400">{option.instrument_name}</p>
            {!archived && bindPrice !== null && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <Link2 className="h-3 w-3" /> 已绑定买入价 {bindPrice}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`确认删除 ${option.instrument_name} 吗？`)) {
                deleteMutation.mutate({ ledgerId, id: option.id });
              }
            }}
            disabled={deleteMutation.isPending}
            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500"
            title="删除期权"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button type="button" onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="text-gray-600" aria-label="返回设置">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">卖期权设置</h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => migrateMutation.mutate({ ledgerId })}
          disabled={migrateMutation.isPending}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600"
        >
          {migrateMutation.isPending ? "执行中..." : "初始化/更新表"}
        </button>
      </header>

      <main className="space-y-4 p-4">
        {/* 批量创建区 */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">批量添加期权</h2>
          </div>
          <p className="mb-4 text-xs leading-5 text-gray-400">币种固定为 ETH。选择一次到期日和方向后，可同时勾选多个行权价，并分别填写各档月化收益率。</p>

          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-500">币种</label>
            <div className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">ETH 以太坊</div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-500">到期日</label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                min={today}
                className="w-full rounded-lg border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </div>
            {expiryDate && <p className="mt-1 text-xs text-blue-600">{formatDateCN(expiryDate)}</p>}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-500">方向</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOptionType("PUT")} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${optionType === "PUT" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}>PUT 看跌</button>
              <button type="button" onClick={() => setOptionType("CALL")} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${optionType === "CALL" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>CALL 看涨</button>
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-gray-500">行权价（可多选）</label>
              <span className="text-xs text-blue-600">已选 {selectedStrikes.length} 档</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_LEVELS.map((price) => {
                const selected = selectedStrikes.includes(price);
                return (
                  <button
                    key={price}
                    type="button"
                    onClick={() => toggleStrike(price)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {price.toLocaleString()}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedStrikes.length > 0 && (
            <div className="mb-4 space-y-2 rounded-xl bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-800">逐档设置月化收益率</p>
              {selectedStrikes.map((strike) => (
                <div key={strike} className="flex items-center gap-3">
                  <span className="w-16 font-mono text-sm font-semibold text-gray-700">{strike}</span>
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.1"
                      value={yieldByStrike[strike] || ""}
                      onChange={(event) => setYieldByStrike((previous) => ({ ...previous, [strike]: event.target.value }))}
                      placeholder="月化收益率"
                      className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <span className="max-w-28 truncate font-mono text-[10px] text-gray-400">{expiryDate ? makeInstrumentName(expiryDate, strike, optionType) : "请先选日期"}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleBatchCreate}
            disabled={saveMutation.isPending || !expiryDate || selectedStrikes.length === 0}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            <Plus className="mr-1 inline h-4 w-4" />
            {saveMutation.isPending ? "保存中..." : `批量添加 ${selectedStrikes.length || ""} 条期权`}
          </button>
        </section>

        {/* 未到期期权：自动按日期升序 */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">有效期权</h2>
              <p className="mt-0.5 text-[11px] text-gray-400">按到期日从近到远自动排序，共 {upcomingOptions.length} 条</p>
            </div>
          </div>
          {upcomingOptions.length > 0 ? (
            <div className="space-y-2">{upcomingOptions.map((option) => renderOptionRow(option))}</div>
          ) : (
            <p className="py-4 text-center text-xs text-gray-400">暂无未到期的期权</p>
          )}
        </section>

        {/* 档位绑定区：清晰显示前端下单可选的每一个买入价 */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-800">买入价格 · 期权绑定</h2>
          </div>
          <p className="mb-3 text-xs leading-5 text-gray-400">只有绑定了有效期权的买入价格，前端才显示“锁定收益”标签与可选锁定勾选框。未绑定价格为普通委托，可随时撤单。</p>
          <div className="space-y-1.5">
            {BUY_PRICE_LEVELS.map((buyPrice) => {
              const boundOption = bindingByPrice[buyPrice];
              return (
                <div key={buyPrice} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${boundOption ? "border border-amber-200 bg-amber-50" : "bg-gray-50"}`}>
                  <span className={`w-12 font-mono text-sm font-semibold ${boundOption ? "text-gray-900" : "text-gray-400"}`}>{buyPrice}</span>
                  {boundOption && <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />}
                  <select
                    value={boundOption ? String(boundOption.id) : ""}
                    onChange={(event) => handleBind(buyPrice, event.target.value)}
                    disabled={bindMutation.isPending || upcomingOptions.length === 0}
                    className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-amber-400 disabled:bg-gray-100"
                  >
                    <option value="">不绑定（普通委托）</option>
                    {upcomingOptions.filter((option) => Boolean(option.enabled)).map((option) => (
                      <option key={option.id} value={option.id}>{optionDescriptor(option)} · 月化 {(Number(option.monthly_yield) * 100).toFixed(1)}%</option>
                    ))}
                  </select>
                  {boundOption && (
                    <button
                      type="button"
                      onClick={() => bindMutation.mutate({ ledgerId, optionId: boundOption.id, buyPrice: null })}
                      disabled={bindMutation.isPending}
                      className="rounded p-1 text-gray-400 hover:text-amber-700"
                      title="解除绑定"
                    >
                      <Unlink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 已到期期权：默认折叠，点开才看 */}
        {expiredOptions.length > 0 && (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowExpired((visible) => !visible)}>
              <div>
                <h2 className="text-sm font-semibold text-gray-500">已到期期权</h2>
                <p className="mt-0.5 text-[11px] text-gray-400">已自动隐藏，共 {expiredOptions.length} 条；点击展开查看历史</p>
              </div>
              <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showExpired ? "rotate-180" : ""}`} />
            </button>
            {showExpired && <div className="mt-3 space-y-2">{expiredOptions.map((option) => renderOptionRow(option, true))}</div>}
          </section>
        )}
      </main>
    </div>
  );
}
