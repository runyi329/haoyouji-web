import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ticket } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc as appTrpc } from "@/lib/trpc";
import {
  MIBAN_BENEFITS_STOREFRONT,
  kindNames,
  status,
  valueText,
  type Rule,
} from "../../../../shared/miban-benefits";
import { getMibanLimitedProduct } from "../../../../shared/miban-limited-products";

export type MyBenefitRule = Omit<Rule, "note">;
// The actual protected endpoint accepts storefront only; user identity comes from the server session.
const trpc = appTrpc as unknown as {
  benefits: { my: { useQuery(input: { storefront: typeof MIBAN_BENEFITS_STOREFRONT }, options: {
    enabled: boolean; retry: false; refetchInterval: false; refetchOnWindowFocus: true;
  }): UseQueryResult<MyBenefitRule[], Error> } };
};
export function myBenefitScopeText(rule: MyBenefitRule): string {
  if (rule.scope === "all") return "限时商城全场";
  if (rule.scope === "category" || rule.scope === "series") return rule.targets.join("、") || "范围资料暂不可用";
  return rule.targets.map(target => {
    const match = /^limited:([^:]+)(?::(.+))?$/.exec(target);
    const product = match ? getMibanLimitedProduct(match[1]) : undefined;
    if (!product) return "原商品或规格已移除";
    if (rule.scope === "product") return `${product.detail.title} · 全部规格`;
    const sku = product.skus.find(item => item.id === match?.[2]);
    return sku ? `${product.detail.title} · ${sku.name}` : "原商品或规格已移除";
  }).join("、") || "范围资料暂不可用";
}

export function MyBenefitsList({ rules, userId }: { rules: MyBenefitRule[]; userId: string }) {
  const owned = rules.filter(rule => rule.userId === userId);
  if (!owned.length) return <p data-my-benefits-empty className="py-4 text-center text-[12px] text-gray-400">暂无专属优惠，限时商城按正常售价结算</p>;
  return <ul className="space-y-2">
    {owned.map(rule => <li key={rule.id} className="rounded-lg border border-gray-100 bg-white px-3 py-3 text-[11px] leading-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-[13px] font-semibold text-gray-800">{rule.name}</h3>
        <span className="shrink-0 rounded bg-gray-50 px-1.5 text-gray-500">{status({ ...rule, note: "" })}</span>
      </div>
      <p className="mt-1 font-semibold text-[#0D7A3E]">{kindNames[rule.kind]} · {valueText(rule)}</p>
      <p className="break-words text-gray-500">适用：{myBenefitScopeText(rule)}</p>
      <p className="text-gray-500">有效期：{rule.starts || "即日起"} 至 {rule.ends || "长期有效"}</p>
      <p className="text-gray-500">{rule.unlimited ? `不限次数 · 已用${rule.uses}次` : `可用${Math.max(0, rule.maxUses - rule.uses)}次 · 已用${rule.uses}/${rule.maxUses}次`}</p>
    </li>)}
  </ul>;
}

/** Inline personal-area section; no replacement of MyOrders, no admin link and no new route. */
export default function MyBenefits() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const owner = user?.id == null ? "" : String(user.id);
  const enabled = expanded && isAuthenticated && !authLoading && !!owner;
  const query = trpc.benefits.my.useQuery({ storefront: MIBAN_BENEFITS_STOREFRONT }, {
    enabled, retry: false, refetchInterval: false, refetchOnWindowFocus: true,
  });
  const [rules, setRules] = useState<{ owner: string; value: MyBenefitRule[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const identity = useRef(owner);
  identity.current = owner;
  const requestedOwner = useRef<string | null>(null);
  const reload = async () => {
    if (!enabled || checking) return;
    const requestOwner = owner;
    setChecking(true);
    setError(null);
    try {
      const fresh = await query.refetch({ cancelRefetch: false });
      if (identity.current !== requestOwner) return;
      if (fresh.isError || !Array.isArray(fresh.data)) throw new Error("本人优惠读取失败，请重试");
      setRules({ owner: requestOwner, value: fresh.data.filter(rule => rule.userId === requestOwner) });
    } catch {
      if (identity.current === requestOwner) setError("本人优惠读取失败，请重试");
    } finally {
      setChecking(false);
    }
  };
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    setRules(null);
    setError(null);
    requestedOwner.current = null;
  }, [owner, enabled]);
  useEffect(() => {
    if (!enabled || checking || requestedOwner.current === owner) return;
    requestedOwner.current = owner;
    void reloadRef.current();
  }, [enabled, owner, checking]);
  useEffect(() => {
    if (enabled && rules?.owner === owner && !query.isFetching && !query.isError && query.data) {
      setRules(current => current?.value === query.data ? current : { owner, value: query.data.filter(rule => rule.userId === owner) });
    }
  }, [enabled, owner, query.data, query.isFetching, query.isError]);
  if (!isAuthenticated || authLoading) return null;
  const ownedRules = rules?.owner === owner ? rules.value : null;
  const message = error ?? (query.isError ? "本人优惠读取失败，请重试" : null);
  return <section data-my-benefits className="mb-4 overflow-hidden rounded-xl border border-gray-100 bg-white">
    <button type="button" aria-expanded={expanded} aria-controls="my-miban-benefits-list" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
      <Ticket size={16} className="text-[#0D7A3E]" />
      <span className="flex-1 text-[14px] font-semibold text-gray-800">我的优惠</span>
      <ChevronDown size={16} className={`text-gray-400 ${expanded ? "rotate-180" : ""}`} />
    </button>
    {expanded && <div id="my-miban-benefits-list" className="border-t border-gray-100 px-3 pb-3 pt-2">
      <p className="mb-2 text-[11px] leading-5 text-gray-400">仅限米伴限时商城，结算自动选用最优优惠；不影响米种DIY或其他商城。</p>
      {message ? <div role="alert" className="py-3 text-center text-[12px] text-gray-500">{message}<button type="button" disabled={checking} onClick={() => { void reload(); }} className="ml-2 font-semibold text-[#0D7A3E] underline">重试</button></div>
        : !ownedRules ? <p role="status" className="py-4 text-center text-[12px] text-gray-400">正在读取本人优惠…</p>
        : <MyBenefitsList rules={ownedRules} userId={owner} />}
    </div>}
  </section>;
}
