import { useMemo, useState } from "react";
import { Calculator, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useBenefitCatalog } from "./BenefitCatalogContext";
import { STOREFRONT, flattenCatalog, skuSelectable, money } from "./types";

type TrialItem = { productKey: string; skuId: string; quantity: number };
export default function BenefitSimulator({ userId, userName }: { userId: number; userName: string }) {
  const catalog = useBenefitCatalog();
  const skus = useMemo(() => flattenCatalog(catalog.products).filter(skuSelectable), [catalog.products]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [trial, setTrial] = useState<{ items: TrialItem[]; mode: "once" | "annual" } | null>(null);
  const [mode, setMode] = useState<"once" | "annual">("once");
  const [error, setError] = useState("");
  const query = trpc.benefits.preview.useQuery({ storefront: STOREFRONT, userId, items: trial?.items ?? [], mode: trial?.mode ?? "once" }, { enabled: !!trial, retry: false, staleTime: 0, refetchOnWindowFocus: false });
  function calculate() {
    const entries = skus.filter(sku => Number(quantities[sku.id]) > 0);
    if (!entries.length) { setError("请先填写至少一个可售规格的数量。"); return; }
    if (entries.some(sku => !/^\d+$/.test(quantities[sku.id] ?? "") || Number(quantities[sku.id]) > 20)) { setError("数量请输入1至20的整数。"); return; }
    setError("");
    const items = entries.map(sku => ({ productKey: sku.productKey ?? sku.productId.replace(/^limited:/, ""), skuId: sku.skuId ?? sku.id.slice(`${sku.productId}:`.length), quantity: Number(quantities[sku.id]) }));
    setTrial({ items, mode });
    if (trial && JSON.stringify(trial) === JSON.stringify({ items, mode })) void query.refetch();
  }
  return <section className="simulator"><div className="section-toolbar"><div><h3>{userName}的效果试算</h3><p>按真实已保存优惠与当前目录计算。</p></div><Calculator size={20} /></div><div className="policy-note"><ShieldCheck size={17} /><p><b>只读试算，不扣款、不下单、不消耗券或优惠次数。</b>实付以正式下单时后台重新校验为准，不含运费。</p></div>
    <div className="segmented"><button className={mode === "once" ? "selected" : ""} onClick={() => { setMode("once"); setTrial(null); }}>单次商品</button><button className={mode === "annual" ? "selected" : ""} onClick={() => { setMode("annual"); setTrial(null); }}>年付产品</button></div>
    {catalog.loading && <p role="status" className="directory-status">正在读取商品目录…</p>}
    {catalog.error && <div className="error" role="alert">{catalog.error}<Button onClick={() => void catalog.refresh()}>重新读取目录</Button></div>}
    {!catalog.error && <div className="panel trial-products">{skus.map(sku => <label className="trial-item" key={sku.id}><div><b>{sku.productName} · {sku.name}</b><small>正常价 ¥{sku.price.toFixed(2)}/{sku.unitLabel || "份"}</small></div><input aria-label={`${sku.productName} ${sku.name}数量`} inputMode="numeric" placeholder="0" value={quantities[sku.id] ?? ""} disabled={query.isFetching} onChange={event => { setQuantities(previous => ({ ...previous, [sku.id]: event.target.value })); setTrial(null); }} /></label>)}</div>}
    <Button className="trial-submit" disabled={catalog.loading || !!catalog.error || !catalog.revision || query.isFetching} onClick={calculate}>{query.isFetching ? "试算中…" : "开始只读试算"}</Button>
    {error && <div className="error" role="alert">{error}</div>}{query.error && <div className="error" role="alert">试算失败：{query.error.message}</div>}
    {trial && query.data && !query.isFetching && !query.error && <div className="checkout-preview" aria-label="服务端试算结果"><h3>服务端试算结果</h3><dl className="summary"><div><dt>正常商品金额</dt><dd>¥{money(query.data.result.originalCents)}</dd></div><div><dt>最优方案</dt><dd>{query.data.result.summary}</dd></div><div><dt>预计节省</dt><dd>¥{money(query.data.result.savedCents)}</dd></div><div className="payment-total"><dt>预计商品实付</dt><dd>¥{money(query.data.result.totalCents)}</dd></div></dl>{query.data.result.lines.map(line => <div className="calculation-line" key={`${line.productKey}:${line.skuId}`}><b>{skus.find(sku => (sku.productKey ?? sku.productId.replace(/^limited:/, "")) === line.productKey && (sku.skuId ?? sku.id.slice(`${sku.productId}:`.length)) === line.skuId)?.productName ?? line.productKey} · {line.quantity}份</b><div>¥{money(line.originalCents)} → ¥{money(line.totalCents)}</div><small>{line.ruleName ?? "正常价/活动价择优"}</small></div>)}<p className="helper">此结果来自已保存优惠的后台试算，不消耗优惠券。</p></div>}
  </section>;
}
