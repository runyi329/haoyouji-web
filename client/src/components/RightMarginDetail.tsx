/**
 * RightMarginDetail.tsx
 * 右侧保证金详情只读组件
 * 复用 DepositManage.tsx 中的展开详情 UI，去掉所有编辑入口
 * Props: ledgerId, tagName
 */
import React, { useMemo } from "react";
import { trpc } from "@/lib/trpc";

const CNY_RATE_FALLBACK = 6.8;

function toCNY(margin: string | number, coin: string, prices: Record<string, number>): number {
  const num = typeof margin === "number" ? margin : parseFloat(margin);
  if (isNaN(num) || num === 0) return 0;
  if (!coin || coin === "人民币" || coin === "元") return num;
  const price = prices[coin];
  if (!price) return 0;
  return num * price;
}

interface Props {
  ledgerId: number;
  tagName: string;
}

export function RightMarginDetail({ ledgerId, tagName }: Props) {
  // ── 数据查询 ──
  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  const categories = useMemo(() => {
    if (!rawCategories) return [];
    return (rawCategories as any[]).filter((c: any) => !c.isDefault);
  }, [rawCategories]);

  const { data: rightTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId, tagName },
    { enabled: !!ledgerId && !!tagName }
  );

  const { data: rightTagSummary } = (trpc.ledger as any).getTagSummary.useQuery(
    { ledgerId, tagName },
    { enabled: !!ledgerId && !!tagName }
  );

  const selectedTagCategoryId = useMemo(() => {
    if (!tagName || !categories.length) return null;
    const cat = (categories as any[]).find((c: any) => c.name === tagName);
    return cat?.id ?? null;
  }, [tagName, categories]);

  const { data: transferRecordsData } = trpc.ledger.getTransactions.useQuery(
    { ledgerId, type: "transfer" as any, categoryId: selectedTagCategoryId ?? undefined, limit: 200 },
    { enabled: !!ledgerId && !!selectedTagCategoryId }
  );

  const transferRecords = useMemo(() => {
    const withdraws: { date: string; amount: number; description: string }[] = [];
    const capitals: { date: string; amount: number; description: string }[] = [];
    (transferRecordsData as any[] || []).forEach((group: any) => {
      group.records?.forEach((r: any) => {
        const item = { date: r.recordDate || group.date || "", amount: Number(r.amount) || 0, description: r.description || "" };
        if (r.description?.startsWith("capital_")) {
          capitals.push(item);
        } else {
          withdraws.push(item);
        }
      });
    });
    return {
      withdraws: withdraws.sort((a, b) => a.date.localeCompare(b.date)),
      capitals: capitals.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [transferRecordsData]);

  // 走服务器tRPC获取价格（price-scanner缓存，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  const cryptoPrices: Record<string, number> = useMemo(() => {
    const result: Record<string, number> = {};
    if (cryptoPricesRaw) {
      const cnyRate = (cryptoPricesRaw as any)?.usdtCnyRate ?? CNY_RATE_FALLBACK;
      const pricesMap = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
      if (typeof pricesMap === "object") {
        for (const [k, v] of Object.entries(pricesMap)) {
          result[k] = Number(v) * cnyRate;
        }
      }
      result["USDT"] = cnyRate;
    }
    return result;
  }, [cryptoPricesRaw]);

  // ── 解析保证金数据 ──
  const rightMarginData = useMemo(() => {
    if (!rightTagConfig?.margin_by_coin) return [];
    try {
      const parsed = JSON.parse(rightTagConfig.margin_by_coin as string);
      if (Array.isArray(parsed)) {
        return parsed.map((e: any) => ({ coin: e.coin || "元", amount: Number(e.amount), label: e.label || "", date: e.date || "" }));
      }
      return Object.entries(parsed).map(([coin, amount]) => ({ coin, amount: Number(amount), label: "", date: "" }));
    } catch { return []; }
  }, [rightTagConfig]);

  const rightTotalCNY = useMemo(() => {
    return rightMarginData.reduce((sum, { coin, amount }) => sum + toCNY(String(amount), coin, cryptoPrices), 0);
  }, [rightMarginData, cryptoPrices]);

  // ── 账户信息计算 ──
  const latestBalance = (rightTagSummary as any)?.latestBalance;
  const autoBalanceNum = latestBalance?.balance ? parseFloat(String(latestBalance.balance)) : null;
  const autoBalanceDate = latestBalance?.recordDate as string | undefined;

  const _nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
  const _todayBJ = _nowBJ.toISOString().slice(0, 10);
  const _hourBJ = _nowBJ.getUTCHours();
  const _dowBJ = _nowBJ.getUTCDay();
  const _isTradeDay = _dowBJ >= 1 && _dowBJ <= 5;
  const _isStale = _isTradeDay && _hourBJ >= 15 && autoBalanceDate !== _todayBJ;

  const savedInitial = rightTagConfig?.initial_amount as string | undefined;
  const savedMultiplier = rightTagConfig?.account_multiplier as string | undefined;
  const savedMarginBase = (rightTagConfig as any)?.margin_base as string | undefined;
  const initialNum = parseFloat(savedInitial || "0") || 0;
  const multiplierNum = parseFloat(savedMultiplier || "1") || 1;
  const marginBaseNum = parseFloat(savedMarginBase || "0") || 0;
  const _cnyRate = cryptoPrices["USDT"] ?? CNY_RATE_FALLBACK;
  const pnl = autoBalanceNum !== null ? (autoBalanceNum - initialNum) * multiplierNum : null;
  const remainingMargin = pnl !== null ? pnl + rightTotalCNY : null;
  const marginBasePct = marginBaseNum > 0 && remainingMargin !== null ? (remainingMargin / marginBaseNum * 100) : null;
  const marginPct = autoBalanceNum !== null && autoBalanceNum > 0 ? (rightTotalCNY / autoBalanceNum * 100) : null;

  return (
    <div className="text-xs space-y-3" style={{ color: "#4B5563" }}>
      {/* ── 保证金记录 ── */}
      <div className="rounded-xl p-3" style={{ backgroundColor: "#F8FBFF", border: "1px solid #DBEAFE" }}>
        {rightMarginData.length === 0 ? (
          <div className="text-xs text-gray-400 py-2 text-center">暂未设置右侧保证金</div>
        ) : (
          <div className="space-y-2">
            {(rightMarginData as Array<{ coin: string; amount: number; label: string; date: string }>).map(({ coin, amount, label, date }, _i) => {
              const cnyVal = coin !== "元" ? toCNY(String(Math.abs(amount)), coin, cryptoPrices) : Math.abs(amount);
              return (
                <div key={_i} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-700">保证金</span>
                      <span className="text-xs" style={{ color: "#2563EB" }}>{date ? date.slice(5) : "--"}</span>
                      <span
                        className="text-[10px] font-medium px-1 py-0.5 rounded"
                        style={{ backgroundColor: amount < 0 ? "#DCFCE7" : "#EFF6FF", color: amount < 0 ? "#16A34A" : "#2563EB" }}
                      >
                        {amount < 0 ? "减少" : "增加"}
                      </span>
                    </div>
                    {label ? <span className="text-[10px] text-gray-400 mt-0.5 break-all" style={{ maxWidth: "160px" }}>{label}</span> : null}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold" style={{ color: amount < 0 ? "#388E3C" : "#1A2340" }}>
                      {amount >= 0 ? "+" : ""}{amount.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}
                      <span className="text-xs text-gray-500 ml-1">{coin}</span>
                    </span>
                    {(coin === "元" || coin === "人民币") && cryptoPrices["USDT"] > 0 && (
                      <span className="text-xs text-gray-400">
                        ≈{(Math.abs(amount) / cryptoPrices["USDT"] >= 0 ? (amount < 0 ? "-" : "") : "")}{(Math.abs(amount) / cryptoPrices["USDT"]).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} U
                      </span>
                    )}
                    {coin !== "元" && coin !== "人民币" && (
                      <span className="text-xs" style={{ color: amount < 0 ? "#388E3C" : "#6B7280" }}>
                        {amount < 0 ? "-" : ""}¥{cnyVal.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* 合计行 */}
            <div className="flex items-end justify-between pt-1" style={{ borderTop: "1px solid #DBEAFE" }}>
              <span className="text-xs text-gray-500">合计</span>
              <div className="flex flex-col items-end">
                {Object.entries(
                  (rightMarginData as Array<{ coin: string; amount: number }>).reduce((acc, { coin, amount }) => {
                    acc[coin] = (acc[coin] || 0) + amount;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([coin, total]) => (
                  <span key={coin} className="text-xs font-semibold" style={{ color: (total as number) < 0 ? "#388E3C" : "#1A2340" }}>
                    {(total as number) >= 0 ? "+" : ""}{(total as number).toLocaleString("zh-CN", { maximumFractionDigits: 4 })} {coin}
                  </span>
                ))}
                <span className="text-sm font-bold text-blue-700">
                  ¥{rightTotalCNY.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 历史提现 ── */}
      <div className="rounded-xl p-3" style={{ backgroundColor: "#FFFBF0", border: "1px solid #FDE68A" }}>
        <div className="text-xs text-amber-700 font-medium mb-2">历史提现</div>
        {transferRecords.withdraws.length === 0 ? (
          <div className="text-xs text-gray-400 py-2 text-center">暂无历史提现记录</div>
        ) : (
          <div className="space-y-2">
            {transferRecords.withdraws.map((record, _i) => (
              <div key={_i} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid #FDE68A" }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-700">提现</span>
                  <span className="text-xs" style={{ color: "#D97706" }}>{record.date ? record.date.slice(5) : "--"}</span>
                  <span className="text-[10px] font-medium px-1 py-0.5 rounded" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>
                    {record.amount < 0 ? "提出" : "转入"}
                  </span>
                </div>
                <span className="text-sm font-semibold" style={{ color: "#D97706" }}>
                  {record.amount >= 0 ? "+" : ""}¥{record.amount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
            <div className="flex items-end justify-between pt-1" style={{ borderTop: "1px solid #FDE68A" }}>
              <span className="text-xs text-gray-500">累计提现</span>
              <span className="text-sm font-bold" style={{ color: "#D97706" }}>
                ¥{transferRecords.withdraws.reduce((s, r) => s + r.amount, 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 增减本金 ── */}
      <div className="rounded-xl p-3" style={{ backgroundColor: "#F5F3FF", border: "1px solid #DDD6FE" }}>
        <div className="text-xs font-medium mb-2" style={{ color: "#7C3AED" }}>增减本金</div>
        {transferRecords.capitals.length === 0 ? (
          <div className="text-xs text-gray-400 py-2 text-center">暂无增减本金记录</div>
        ) : (
          <div className="space-y-2">
            {transferRecords.capitals.map((record, _i) => {
              const isAdd = record.description === "capital_add";
              return (
                <div key={_i} className="flex items-start justify-between py-2" style={{ borderBottom: "1px solid #DDD6FE" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-700">{isAdd ? "增加本金" : "减少本金"}</span>
                    <span className="text-xs" style={{ color: "#7C3AED" }}>{record.date ? record.date.slice(5) : "--"}</span>
                    <span className="text-[10px] font-medium px-1 py-0.5 rounded" style={{ backgroundColor: "#EDE9FE", color: "#7C3AED" }}>本金</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "#7C3AED" }}>
                    {record.amount >= 0 ? "+" : ""}¥{record.amount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              );
            })}
            <div className="flex items-end justify-between pt-1" style={{ borderTop: "1px solid #DDD6FE" }}>
              <span className="text-xs text-gray-500">累计本金变动</span>
              <span className="text-sm font-bold" style={{ color: "#7C3AED" }}>
                {transferRecords.capitals.reduce((s, r) => s + r.amount, 0) >= 0 ? "+" : ""}¥{transferRecords.capitals.reduce((s, r) => s + r.amount, 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 账户余额 / 初始金额 / 倍数 / 保证金基数 ── */}
      <div className="rounded-xl p-3" style={{ backgroundColor: "#F8FBFF", border: "1px solid #DBEAFE" }}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              账户余额
              {autoBalanceDate && (
                <span className="ml-1" style={{ color: _isStale ? "#B45309" : "#2563EB" }}>
                  {autoBalanceDate.slice(5)}
                </span>
              )}
            </span>
            <span className="text-sm font-semibold text-gray-700">
              {autoBalanceNum !== null ? `¥${autoBalanceNum.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">初始金额</span>
            <span className="text-sm font-semibold text-gray-700">
              {savedInitial ? `¥${parseFloat(savedInitial).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">倍数</span>
            <span className="text-sm font-semibold text-gray-700">{savedMultiplier || "1"}x</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">保证金基数</span>
            <span className="text-sm font-semibold text-gray-700">
              {savedMarginBase ? `¥${parseFloat(savedMarginBase).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
            </span>
          </div>
          {autoBalanceNum !== null && savedInitial && (
            <div style={{ borderTop: "1px solid #DBEAFE", paddingTop: 6 }}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">盈亏净值 (余额-初始)×倍数</span>
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ color: pnl !== null && pnl >= 0 ? "#D32F2F" : "#388E3C" }}>
                    {pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                  </div>
                  {pnl !== null && _cnyRate > 0 && (
                    <div className="text-xs text-gray-400">
                      ≈{(pnl / _cnyRate >= 0 ? "+" : "")}{(pnl / _cnyRate).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} U
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">剩余保证金 (净值+已付保证金)</span>
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ color: remainingMargin !== null && remainingMargin >= 0 ? "#D32F2F" : "#388E3C" }}>
                    {remainingMargin !== null ? `${remainingMargin >= 0 ? "+" : ""}${remainingMargin.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                  </div>
                  {remainingMargin !== null && _cnyRate > 0 && (
                    <div className="text-xs text-gray-400">
                      ≈{(remainingMargin / _cnyRate >= 0 ? "+" : "")}{(remainingMargin / _cnyRate).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} U
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">剩余保证金占基数比</span>
                <span className="text-sm font-bold text-blue-700">
                  {marginBasePct !== null ? `${marginBasePct.toFixed(1)}%` : (marginPct !== null ? `${marginPct.toFixed(1)}%(占余额)` : "--")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
