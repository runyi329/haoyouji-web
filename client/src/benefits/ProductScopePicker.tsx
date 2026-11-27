import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skuSelectable, type CatalogProduct, type Scope } from "./types";

type Props = {
  products: CatalogProduct[];
  scope: Scope;
  targets: string[];
  onSelect: (scope: Scope, targets: string[]) => void;
};
export default function ProductScopePicker({ products, scope, targets, onSelect }: Props) {
  const selectedProduct = products.find(p => scope === "product" ? targets.includes(p.id) : p.skus.some(s => targets.includes(s.id)));
  const [series, setSeries] = useState(selectedProduct?.series || "");
  const [productId, setProductId] = useState(selectedProduct?.id || "");
  const [search, setSearch] = useState("");
  const product = products.find(p => p.id === productId);
  const groups = Array.from(new Set(products.map(p => p.series)));
  const listed = products.filter(p => p.series === series && [p.name, p.category, ...p.skus.map(s => s.name)].join(" ").includes(search.trim()));

  useEffect(() => {
    if (productId && !products.some(p => p.id === productId)) setProductId("");
    if (series && !products.some(p => p.series === series)) setSeries("");
  }, [products, productId, series]);

  function chooseProduct(p: CatalogProduct) {
    setProductId(p.id);
    setSearch("");
    // Selecting a different product never carries over a SKU from the previous product.
    onSelect("product", [p.id]);
  }
  return <div className="product-picker">
    <div className="catalog-trail"><span>限时商城</span>{series && <><ChevronRight size={13} /><b>{series}</b></>}{product && <><ChevronRight size={13} /><b>商品规格</b></>}</div>
    {!series ? <>
      <h4>先选择精选栏目</h4>
      <div className="catalog-rows">{groups.map(group => {
        const count = products.filter(p => p.series === group).length;
        return <button key={group} className="catalog-row" onClick={() => { setSeries(group); setProductId(""); onSelect(scope, []); }}>
          <div><b>{group}</b><small>{count}款商品</small></div><ChevronRight size={18} />
        </button>;
      })}</div>
    </> : !product ? <>
      <button className="text-link catalog-back" onClick={() => { setSeries(""); setSearch(""); onSelect(scope, []); }}><ArrowLeft size={15} />换一个栏目</button>
      <label className="search-field"><Search size={16} /><input aria-label="搜索限时商品" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索商品或规格" maxLength={80} /></label>
      <div className="catalog-rows">{listed.map(p => {
        const active = p.skus.filter(skuSelectable);
        return <button key={p.id} data-product-id={p.id} className="catalog-row" disabled={!active.length} onClick={() => chooseProduct(p)}>
          <div><b>{p.name}</b><small>{p.category} · {p.skus.length}种规格{active.length ? ` · ¥${Math.min(...active.map(s => s.price)).toFixed(2)}起` : " · 暂不可售"}</small></div><ChevronRight size={18} />
        </button>;
      })}</div>
      {!listed.length && <p className="helper">没有找到商品，试试其他关键词。</p>}
    </> : <>
      <button className="text-link catalog-back" onClick={() => { setProductId(""); onSelect(scope, []); }}><ArrowLeft size={15} />更换商品</button>
      <div className="picked-product"><b>{product.name}</b><small>{product.series} · {product.category}</small></div>
      <h4>选择适用规格</h4>
      <div className="targets catalog-specs">
        <label className={scope === "product" && targets.includes(product.id) ? "chosen" : ""}>
          <input type="radio" name="catalog-spec" checked={scope === "product" && targets.includes(product.id)} onChange={() => onSelect("product", [product.id])} />
          <span><b>全部规格</b><small>当前{product.skus.filter(skuSelectable).length}种可售规格；以后新增规格自动适用</small></span>
          {scope === "product" && <Check size={17} />}
        </label>
        {product.skus.map(s => <label key={s.id} data-sku-id={s.id} className={`${scope === "sku" && targets.includes(s.id) ? "chosen" : ""} ${!skuSelectable(s) ? "unavailable" : ""}`}>
          <input type="radio" name="catalog-spec" disabled={!skuSelectable(s)} checked={scope === "sku" && targets.includes(s.id)} onChange={() => onSelect("sku", [s.id])} />
          <span><b>{s.name}</b><small>正常价 ¥{s.price.toFixed(2)}/{s.unitLabel || "份"} · 一{ s.unitLabel || "份" }作为1份{!skuSelectable(s) ? " · 暂不可售" : ""}</small></span>
          {scope === "sku" && targets.includes(s.id) && <Check size={17} />}
        </label>)}
      </div>
      <p className="helper">“全部规格”绑定这款商品；选单个规格则只对该规格生效，不会因新增规格自动扩大。</p>
    </>}
  </div>;
}
