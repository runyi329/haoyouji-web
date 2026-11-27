import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  BadgePercent,
  Ticket,
  Tag,
  ShoppingBag,
  Info,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBenefitCatalog } from "./BenefitCatalogContext";
import ProductScopePicker from "./ProductScopePicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  flattenCatalog,
  skuSelectable,
  currentDate,
  dateAfter,
  scopeNames,
  kindNames,
  scopeText as formatScope,
  isCoupon,
  valueText,
  type Rule,
  type Scope,
  type Kind,
  type BenefitUser,
} from "./types";

const definitions: Record<Kind, { icon: typeof Tag; hint: string }> = {
  rate: { icon: BadgePercent, hint: "持续享受，自动与商品价择优" },
  price: { icon: Tag, hint: "选商品和规格，设置多少钱一份" },
  cash: { icon: Ticket, hint: "不设门槛，本次结算减一次" },
  threshold: { icon: ShoppingBag, hint: "适用商品满指定金额减一次" },
};
export default function BenefitEditor({
  user,
  mode,
  editing,
  rules,
  onClose,
  onSave,
  pending,
  saveError,
  onReload,
}: {
  user: BenefitUser;
  mode: "right" | "coupon";
  editing?: Rule;
  rules: Rule[];
  onClose: () => void;
  onSave: (rule: Rule, count: number) => void;
  pending: boolean;
  saveError: string;
  onReload: () => void;
}) {
  const catalog = useBenefitCatalog();
  const products = catalog.products;
  const skus = useMemo(() => flattenCatalog(products), [products]);
  const scopeText = (r: Rule) => formatScope(r, products, catalog.limited);
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind>(
    editing?.kind || (mode === "coupon" ? "cash" : "rate")
  );
  const [scope, setScope] = useState<Scope>(editing?.scope || "all");
  const [targets, setTargets] = useState<string[]>(editing?.targets || []);
  const [value, setValue] = useState(
    editing ? String(editing.value) : ""
  );
  const [threshold, setThreshold] = useState(editing ? String(editing.threshold) : "");
  const [name, setName] = useState(editing?.name || "");
  const [starts, setStarts] = useState(editing?.starts || currentDate());
  const [ends, setEnds] = useState(editing?.ends || dateAfter(30));
  const [unlimited, setUnlimited] = useState(editing?.unlimited || false);
  const [maxUses, setMaxUses] = useState(
    editing?.maxUses ? String(editing.maxUses) : ""
  );
  const [count, setCount] = useState("1");
  const [note, setNote] = useState(editing?.note || "");
  const [error, setError] = useState("");
  const [leave, setLeave] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState("");
  useEffect(() => { void catalog.refresh(); }, [catalog.refresh]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, pending]);
  useEffect(() => {
    if (catalog.loading || catalog.error || !catalog.limited || !targets.length || scope === "all") return;
    const valid = scope === "sku" ? targets.filter(id => skus.some(s => s.id === id && skuSelectable(s)))
      : scope === "product" ? targets.filter(id => products.some(p => p.id === id && p.skus.some(skuSelectable)))
      : scope === "series" ? targets.filter(id => products.some(p => p.series === id))
      : targets.filter(id => products.some(p => p.category === id));
    if (valid.length !== targets.length) {
      setTargets(valid);
      setStep(1);
      setCatalogWarning("商品或规格已变更，失效范围已清除，请重新选择；不会自动换成其他商品或扩大范围。");
      setDirty(true);
    }
  }, [catalog.loading, catalog.error, catalog.revision, catalog.limited, products, skus, scope, targets]);
  const coupon = kind === "cash" || kind === "threshold";
  const rule: Rule = {
    id: editing?.id || "",
    userId: user.id,
    kind,
    scope,
    targets,
    name:
      name.trim() || `${scope === "all" ? "全场" : "定向"}${kindNames[kind]}`,
    value: Number(value),
    threshold: kind === "threshold" ? Number(threshold) : 0,
    starts,
    ends: unlimited && !coupon ? "" : ends,
    unlimited: unlimited && !coupon,
    maxUses: coupon ? 1 : Number(maxUses),
    uses: editing?.uses || 0,
    state: editing?.state || "active",
    note: note.trim(),
    created: editing?.created || new Date().toISOString(),
    version: editing?.version || 0,
  };
  const duplicate = rules.some(
    r =>
      r.id !== editing?.id &&
      r.userId === user.id &&
      r.state === "active" &&
      r.kind === kind &&
      r.scope === scope &&
      JSON.stringify([...r.targets].sort()) ===
        JSON.stringify([...targets].sort())
  );
  function changeKind(k: Kind) {
    setDirty(true);
    setKind(k);
    setError("");
    if (k === "price") {
      setScope(catalog.limited ? "product" : "sku");
      setTargets([]);
      setValue("");
    } else {
      setValue("");
    }
  }
  function validate() {
    if (catalog.limited && (catalog.loading || catalog.error || !catalog.revision)) return "请先成功读取最新商品目录后再继续。";
    if (!Number.isFinite(rule.value) || rule.value <= 0)
      return "请输入大于0的优惠数值。";
    if (kind === "rate" && (rule.value >= 10 || !/^\d+(\.\d)?$/.test(value)))
      return "折扣请输入0.1至9.9，最多一位小数，例如7.9折。";
    if (kind !== "rate" && !/^\d+(\.\d{1,2})?$/.test(value))
      return "金额最多保留两位小数。";
    if (scope !== "all" && targets.length === 0)
      return "请至少选择一个适用对象。";
    if (kind === "price" && (!["sku", "product"].includes(scope) || targets.length !== 1)) return "专属价请选择一款商品的全部规格或一个明确规格。";
    const selectedSkus = scope === "product" ? skus.filter(s => targets.includes(s.productId) && skuSelectable(s)) : skus.filter(s => targets.includes(s.id) && skuSelectable(s));
    if (["product", "sku"].includes(scope) && targets.length && !selectedSkus.length) return "选中的商品或规格暂不可售，请重新选择。";
    if (kind === "price" && Number(value) >= Math.min(...selectedSkus.map(s => s.price))) return scope === "product" ? "全部规格使用同一个专属单价，应低于每个可售规格的正常价；不同规格可分别设置。" : "专属价应低于该规格正常售价。";
    if (
      kind === "threshold" &&
      (!Number.isFinite(rule.threshold) ||
        rule.threshold <= rule.value ||
        !/^\d+(\.\d{1,2})?$/.test(threshold))
    )
      return "满减门槛应大于减免金额，最多两位小数。";
    if (step >= 2) {
      if (!starts || (!rule.unlimited && !ends)) return "请填写完整的有效期。";
      if (!rule.unlimited && ends < starts) return "结束日期不能早于开始日期。";
      if (!rule.unlimited && ends < currentDate())
        return "结束日期不能早于当前日期。";
      if (
        coupon &&
        (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 20)
      )
        return "一次发放1至20张券，每张使用一次。";
      if (
        !coupon &&
        maxUses &&
        (!/^\d+$/.test(maxUses) || Number(maxUses) <= rule.uses)
      )
        return "使用上限必须为整数且大于已经使用的次数。";
    }
    return "";
  }
  function next() {
    const err = validate();
    setError(err);
    if (!err) {
      setStep(s => s + 1);
      window.scrollTo(0, 0);
    }
  }
  function save() {
    const err = validate();
    setError(err);
    if (!err && !pending) onSave(rule, coupon ? Number(count) : 1);
  }
  function toggleTarget(id: string) {
    setDirty(true);
    setTargets(v =>
      kind === "price"
        ? [id]
        : v.includes(id)
          ? v.filter(x => x !== id)
          : [...v, id]
    );
  }
  const targetOptions =
    scope === "category"
      ? Array.from(new Set(products.map(p => p.category))).map(x => ({
          id: x,
          name: x,
        }))
    : scope === "series"
        ? Array.from(new Set(products.map(p => p.series))).map(x => ({
            id: x,
            name: x,
          }))
    : scope === "product"
          ? products.map(p => ({ id: p.id, name: p.name }))
          : skus.filter(skuSelectable).map(s => ({
              id: s.id,
              name: `${s.productName} · ${s.name} · ¥${s.price}`,
            }));
  return (
    <section className="editor">
      <div className="section-title">
        <button
          className="icon-button"
          aria-label="退出编辑"
          disabled={pending}
          onClick={() => (dirty ? setLeave(true) : onClose())}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2>
            {editing ? "编辑专属优惠" : coupon ? "发放优惠券" : "新增专属优惠"}
          </h2>
          <p>
            给 {user.account ? `@${user.account}` : user.name} · {user.id}
          </p>
        </div>
      </div>
      <div className="stepper" aria-label={`当前第${step}步`}>
        {["形式与范围", "有效期与限制", "核对确认"].map((x, i) => (
          <div
            key={x}
            className={step === i + 1 ? "current" : step > i + 1 ? "done" : ""}
          >
            <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
            <small>{x}</small>
          </div>
        ))}
      </div>
      <div className="identity-strip">
        <span className={`avatar ${user.color}`}>{user.name.slice(-1)}</span>
        <div>
          <b>{user.name}</b>
          <small>
            {user.account ? `@${user.account}` : "未设置用户名"} · {user.id}
          </small>
        </div>
        <span className="pill neutral">限时商城</span>
      </div>
      {catalog.limited && <div className="catalog-sync">
        <div><b>限时商城真实目录</b><small>{products.length}款商品 · {skus.length}种规格；进入设置和返回页面自动同步</small></div>
        <Button variant="outline" size="sm" disabled={catalog.loading} onClick={() => { void catalog.refresh(); }}>{catalog.loading ? "同步中…" : "刷新目录"}</Button>
      </div>}
      {catalog.error && <div className="error" role="alert">{catalog.error}<Button variant="outline" onClick={() => { void catalog.refresh(); }}>重新读取商品</Button></div>}
      {catalogWarning && <p className="warning" role="status">{catalogWarning}</p>}
      <fieldset disabled={pending} className="editor-fields">
      {step === 1 && (
        <div className="stack">
          <section className="panel">
            <h3>优惠形式</h3>
            <div className="type-grid">
              {(mode === "coupon"
                ? ["cash", "threshold"]
                : ["rate", "price"]
              ).map(k => {
                const Icon = definitions[k as Kind].icon;
                return (
                  <button
                    key={k}
                    className={`type-tile ${kind === k ? "selected" : ""}`}
                    aria-pressed={kind === k}
                    onClick={() => changeKind(k as Kind)}
                  >
                    <Icon size={22} />
                    <b>{kindNames[k as Kind]}</b>
                    <small>{definitions[k as Kind].hint}</small>
                    {kind === k && <Check className="tile-check" size={15} />}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="inline-title">
              <h3>适用范围</h3>
              <span className="pill neutral">{catalog.limited ? "限时商城" : "仅米伴商城"}</span>
            </div>
            <div className="segmented wrapping">
              {(kind === "price"
                ? catalog.limited ? ["product", "sku"] : ["sku"]
                : ["all", "category", "series", "product", "sku"]
              ).map(s => (
                <button
                  key={s}
                  className={scope === s ? "selected" : ""}
                  aria-pressed={scope === s}
                  onClick={() => {
                    setScope(s as Scope);
                    setTargets([]);
                    setDirty(true);
                  }}
                >
                  {scopeNames[s as Scope]
                    .replace("米伴", "")
                    .replace("指定", "")
                    .replace("精选系列", "精选栏目")}
                </button>
              ))}
            </div>
            {scope === "all" ? (
              <p className="helper">
                <Info size={14} />
                {catalog.limited ? "全场指限时商城内的商品，以后新增商品自动适用；不跨其他商城。" : "全场只指米伴，不包含将来新增的其他商城。"}
              </p>
            ) : catalog.limited && ["product", "sku"].includes(scope) ? (
              <ProductScopePicker products={products} scope={scope} targets={targets} onSelect={(nextScope, nextTargets) => { setScope(nextScope); setTargets(nextTargets); setDirty(true); setCatalogWarning(""); setError(""); }} />
            ) : (
              <div className="targets">
                {targetOptions.map(o => (
                  <label key={o.id}>
                    <input
                      type={kind === "price" ? "radio" : "checkbox"}
                      name="target"
                      checked={targets.includes(o.id)}
                      onChange={() => toggleTarget(o.id)}
                    />
                    <span>
                      {o.name}
                      <small>{catalog.limited ? "限时商城目录" : "限时商城目录"}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {catalog.limited && targets.length > 0 && <div className="selected-scope" aria-live="polite"><b>当前适用范围</b><p>{scopeText(rule)}</p>{scope === "product" && <small>绑定商品的全部规格，未来新增规格自动纳入</small>}</div>}
          </section>
          <section className="panel">
            <h3>
              {kind === "rate"
                ? "折扣力度"
                : kind === "price"
                  ? "多少钱一份"
                  : "优惠金额"}
            </h3>
            {kind === "threshold" && (
              <label className="field">
                适用商品满
                <input
                  aria-label="满减门槛"
                  inputMode="decimal"
                  value={threshold}
                  onChange={e => {
                    setThreshold(e.target.value);
                    setDirty(true);
                  }}
                />
                <small>按适用商品优惠前正常金额，不含运费</small>
              </label>
            )}
            <label className="amount-input">
              <span>{kind === "rate" ? "打" : "¥"}</span>
              <input
                aria-label={kind === "rate" ? "折扣" : "优惠金额"}
                inputMode="decimal"
                value={value}
                placeholder={kind === "price" ? "输入人民币单价" : undefined}
                onChange={e => {
                  setValue(e.target.value);
                  setDirty(true);
                }}
              />
              <span>
                {kind === "rate" ? "折" : kind === "price" ? "/份" : "元"}
              </span>
            </label>
            <p className="helper">
              {kind === "rate"
                ? "例如7.9折，即支付正常售价的79%，不是再减79%。"
                : kind === "price"
                  ? scope === "product" ? "这款商品全部规格统一按这个人民币单价；如果各规格价格不同，请分别设置。" : "仅作用于所选规格，每购买一份采用该人民币单价。"
                  : "一张券在一次结算中减一次，不按每件商品重复减。"}
            </p>
          </section>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <section className="panel">
            <h3>
              <Calendar size={17} />
              有效期
            </h3>
            {!coupon && (
              <label className="switch-row">
                <span>
                  长期有效<small>仍可随时停用，不影响已下订单</small>
                </span>
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={e => {
                    setUnlimited(e.target.checked);
                    setDirty(true);
                  }}
                />
              </label>
            )}
            <div className="date-grid">
              <label className="field">
                开始日期
                <input
                  aria-label="开始日期"
                  type="date"
                  value={starts}
                  onChange={e => {
                    setStarts(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              {!rule.unlimited && (
                <label className="field">
                  结束日期
                  <input
                    aria-label="结束日期"
                    type="date"
                    value={ends}
                    onChange={e => {
                      setEnds(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              )}
            </div>
            <p className="helper">
              日期按北京时间；截至结束日23:59:59，以当前真实日期判断。
            </p>
          </section>
          <section className="panel">
            <h3>使用限制</h3>
            {coupon ? (
              <>
                <label className="field">
                  发放张数
                  <input
                    aria-label="发放张数"
                    inputMode="numeric"
                    value={count}
                    onChange={e => {
                      setCount(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <small>每张限使用1次；每次结算最多使用1张券。</small>
                </label>
              </>
            ) : (
              <label className="field">
                最多享受次数
                <input
                  aria-label="最多享受次数"
                  placeholder="不填则不限制"
                  inputMode="numeric"
                  value={maxUses}
                  onChange={e => {
                    setMaxUses(e.target.value);
                    setDirty(true);
                  }}
                />
                <small>按一次结算计数，不因后台拆单重复计次。</small>
              </label>
            )}
          </section>
          <section className="panel">
            <h3>名称与管理备注</h3>
            <label className="field">
              优惠名称
              <input
                aria-label="优惠名称"
                maxLength={30}
                value={name}
                placeholder={rule.name}
                onChange={e => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label className="field">
              内部备注
              <textarea
                aria-label="内部备注"
                value={note}
                maxLength={200}
                placeholder="例如：回馈老客户，由平台承担优惠"
                onChange={e => {
                  setNote(e.target.value);
                  setDirty(true);
                }}
              />
              <small>备注仅管理员可见，不展示给用户。</small>
            </label>
          </section>
          <section className="policy-note">
            <ShieldCheck size={18} />
            <p>
              默认平台承担优惠，不改变供货商结算协议。叠加方式固定为“同范围不叠加，自动择优”。
            </p>
          </section>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <section className="panel">
            <h3>确认设置</h3>
            <dl className="summary">
              <div>
                <dt>用户</dt>
                <dd>
                  {user.name} · {user.account ? `@${user.account} · ` : ""}{user.id}
                </dd>
              </div>
              <div>
                <dt>优惠形式</dt>
                <dd>{kindNames[kind]}</dd>
              </div>
              <div>
                <dt>适用商城</dt>
                <dd>{catalog.limited ? "米伴 · 限时商城" : "仅米伴"}</dd>
              </div>
              <div>
                <dt>适用范围</dt>
                <dd>{scopeText(rule)}</dd>
              </div>
              <div>
                <dt>优惠</dt>
                <dd className="accent">
                  {valueText(rule)}
                  {kind === "price" ? "/份" : ""}
                </dd>
              </div>
              <div>
                <dt>有效期</dt>
                <dd>
                  {starts}起 · {rule.unlimited ? "长期有效" : `至${ends}`}
                </dd>
              </div>
              <div>
                <dt>使用限制</dt>
                <dd>
                  {coupon
                    ? `${count}张 · 每张1次`
                    : maxUses
                      ? `最多${maxUses}次`
                      : "有效期内不限次数"}
                </dd>
              </div>
              <div>
                <dt>费用承担</dt>
                <dd>平台承担</dd>
              </div>
              <div>
                <dt>优惠组合</dt>
                <dd>不叠加，按最终应付择优</dd>
              </div>
              {note && (
                <div>
                  <dt>管理备注</dt>
                  <dd>{note}</dd>
                </div>
              )}
            </dl>
          </section>
          <section>
            <div className="inline-title preview-label">
              <h3>用户看到的样子</h3>
              <span>待保存样式，不是已生效优惠</span>
            </div>
            <div className={`coupon-preview ${coupon ? "ticket" : ""}`}>
              <div>
                <small>{coupon ? "我的优惠券" : "我的专属优惠"}</small>
                <strong>
                  {valueText(rule)}
                  <em>{kind === "price" ? "/份" : ""}</em>
                </strong>
              </div>
              <div>
                <h4>{rule.name}</h4>
                <p>{scopeText(rule)}</p>
                <small>
                  {rule.unlimited ? "长期有效" : `${starts} — ${ends}`}
                </small>
                <small>结算时自动择优使用</small>
              </div>
            </div>
          </section>
          {duplicate && (
            <div className="warning">
              <Info size={18} />
              <p>
                此用户已有同类、同范围优惠。新增后不会叠加，结算会比较最终价格；如想替换，建议返回编辑原优惠。
              </p>
            </div>
          )}
          <div className="helper">
            确认后保存真实优惠，仅影响该用户后续限时商城订单，不改变历史订单。
          </div>
        </div>
      )}
      </fieldset>
      {saveError && <div className="error" role="alert">{saveError}{/CONFLICT|版本|重新载入/.test(saveError) && <Button disabled={pending} variant="outline" onClick={onReload}>重新载入最新优惠</Button>}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="editor-actions">
        {step > 1 ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setStep(s => s - 1);
              setError("");
            }}
          >
            上一步
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={pending}
          onClick={() => (dirty ? setLeave(true) : onClose())}
          >
            取消
          </Button>
        )}
        <Button disabled={pending || (catalog.loading || !!catalog.error || !catalog.revision)} onClick={step === 3 ? save : next}>
          {pending ? "保存中…" : step === 3 ? (coupon ? "确认发券" : "确认保存") : "下一步"}
          {step < 3 && <ArrowRight size={16} />}
        </Button>
      </div>
      <Dialog open={leave} onOpenChange={open => { if (!pending) setLeave(open); }}>
        <DialogContent className="miban-benefits miban-benefits-dialog">
          <DialogHeader>
            <DialogTitle>放弃未保存的设置？</DialogTitle>
            <DialogDescription>
              本次填写尚未保存，退出后会丢失。
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setLeave(false)}>
              继续编辑
            </Button>
            <Button disabled={pending} onClick={onClose}>放弃并返回</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
