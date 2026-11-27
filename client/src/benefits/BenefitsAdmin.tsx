import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BadgePercent, Calculator, ChevronRight, Eye, History, Plus, Search, ShieldCheck, Ticket, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BenefitCatalogProvider, useBenefitCatalog } from "./BenefitCatalogContext";
import BenefitEditor from "./BenefitEditor";
import BenefitSimulator from "./BenefitSimulator";
import { useUserDirectory } from "./useUserDirectory";
import { STOREFRONT, isCoupon, status, scopeText, valueText, mutationError, type BenefitUser, type Rule, type UserFilter } from "./types";
import "./benefits.css";

type Tab = "rights" | "coupons" | "records" | "trial";
type Editor = { mode: "right" | "coupon"; editing?: Rule };
type StateAction = { rule: Rule; next: "active" | "paused" | "revoked" };
const tabs: { key: Tab; name: string }[] = [{ key: "rights", name: "专属优惠" }, { key: "coupons", name: "优惠券" }, { key: "records", name: "记录" }, { key: "trial", name: "试算" }];
const BASE = "/p/proj_hzxm2t";

export default function BenefitsAdmin({ embedded = false, onLockChange }: { embedded?: boolean; onLockChange?: (locked: boolean) => void }) {
  const auth = useAuth();
  if (auth.loading) return <div className="miban-benefits directory-status" role="status">正在验证管理员权限…</div>;
  if (auth.error) return <div className="miban-benefits error" role="alert">账户验证失败。<Button onClick={() => void auth.refresh()}>重新验证</Button></div>;
  if (!auth.user || auth.user.role !== "super_admin") return <div className="miban-benefits empty"><ShieldCheck size={30} /><h2>优惠设置仅限超级管理员</h2><p>请使用本人已授权的管理员账户；后台仍会复验权限。</p><Link href={`${BASE}/admin/panel`}>返回管理中心</Link></div>;
  return <BenefitCatalogProvider key={auth.user.id}><BenefitsWorkspace embedded={embedded} onLockChange={onLockChange} /></BenefitCatalogProvider>;
}

function BenefitsWorkspace({ embedded, onLockChange }: { embedded: boolean; onLockChange?: (locked: boolean) => void }) {
  const catalog = useBenefitCatalog();
  const utils = trpc.useUtils();
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const directory = useUserDirectory(keyword, filter);
  const [user, setUser] = useState<BenefitUser | null>(null);
  const [detail, setDetail] = useState(false);
  const [tab, setTab] = useState<Tab>("rights");
  const [listFilter, setListFilter] = useState("全部");
  const [recordFilter, setRecordFilter] = useState("全部");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [action, setAction] = useState<StateAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [customer, setCustomer] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const input = { storefront: STOREFRONT, userId: Number(user?.id ?? 0) };
  const rulesQuery = trpc.benefits.rules.useQuery(input, { enabled: !!user, retry: false, staleTime: 0, refetchOnWindowFocus: !editor });
  const auditsQuery = trpc.benefits.audits.useQuery(input, { enabled: !!user && tab === "records", retry: false, staleTime: 0 });
  const saveMutation = trpc.benefits.save.useMutation();
  const stateMutation = trpc.benefits.state.useMutation();
  const pending = saveMutation.isPending || stateMutation.isPending;
  const locked = !!editor || pending || !!action;
  useEffect(() => { onLockChange?.(locked); return () => onLockChange?.(false); }, [locked, onLockChange]);
  useEffect(() => {
    if (!locked) return;
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      if (pending || !window.confirm("当前设置尚未保存，离开后会丢失。确认离开？")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    document.addEventListener("click", leave, true);
    window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", leave, true); window.removeEventListener("beforeunload", unload); };
  }, [locked, pending]);
  const rules = rulesQuery.error ? [] : rulesQuery.data ?? [];
  const rights = rules.filter(rule => !isCoupon(rule));
  const coupons = rules.filter(isCoupon);
  const activeRights = rights.filter(rule => status(rule) === "生效中");
  const availableCoupons = coupons.filter(rule => status(rule) === "生效中");
  function closeEditor() { if (!pending) { setEditor(null); setSaveError(""); } }
  function openEditor(mode: Editor["mode"], editing?: Rule) { requestId.current = crypto.randomUUID(); setSaveError(""); setEditor({ mode, editing }); window.scrollTo(0, 0); }
  function selectUser(next: BenefitUser) {
    if (pending || (editor && !window.confirm("放弃当前未保存的设置并切换用户？"))) return;
    closeEditor(); setUser(next); setDetail(true); setTab("rights"); setListFilter("全部"); window.scrollTo(0, 0);
  }
  function goList() {
    if (pending || (editor && !window.confirm("放弃当前未保存的设置并返回列表？"))) return;
    closeEditor(); setDetail(false); window.scrollTo(0, 0);
  }
  async function invalidate() {
    await Promise.all([utils.benefits.rules.invalidate(input), utils.benefits.audits.invalidate(input), utils.benefits.users.invalidate(), utils.benefits.my.invalidate(), utils.benefits.preview.invalidate()]);
  }
  async function save(rule: Rule, count: number) {
    if (!user || pending) return;
    setSaveError("");
    try {
      await saveMutation.mutateAsync({ ...input, rule, count, requestId: requestId.current });
      setEditor(null); setTab(isCoupon(rule) ? "coupons" : "rights"); setListFilter("全部");
      toast.success(isCoupon(rule) ? "优惠券已发放" : "专属优惠已保存");
      await invalidate();
    } catch (error: unknown) { setSaveError(mutationError(error)); }
  }
  async function reloadEditor() {
    if (pending || !window.confirm("重新载入会放弃当前填写，确认载入最新保存版本？")) return;
    const result = await rulesQuery.refetch();
    if (result.error) { setSaveError(result.error.message); return; }
    const editing = editor?.editing ? result.data?.find(rule => rule.id === editor.editing?.id) : undefined;
    if (editor?.editing && !editing) { setSaveError("原优惠已不存在，请关闭后重新选择。"); return; }
    if (editor) { setEditor({ ...editor, editing }); setEditorRevision(value => value + 1); requestId.current = crypto.randomUUID(); setSaveError(""); }
  }
  async function applyAction() {
    if (!action || pending) return;
    if (!reason.trim()) { setActionError("请填写操作原因。"); return; }
    setActionError("");
    try {
      await stateMutation.mutateAsync({ ...input, ruleId: action.rule.id, version: action.rule.version, next: action.next, reason: reason.trim() });
      setAction(null); toast.success("优惠状态已更新"); await invalidate();
    } catch (error: unknown) { setActionError(mutationError(error)); }
  }
  const listed = (tab === "coupons" ? coupons : rights).filter(rule => listFilter === "全部" || status(rule) === (listFilter === "可用" ? "生效中" : listFilter));
  return <div className={`miban-benefits ${detail ? "is-user-detail" : ""} ${editor ? "is-editing" : ""} ${embedded ? "is-embedded" : ""}`}>
    {!embedded && <header className="benefits-header"><Link href={`${BASE}/admin/panel`}><ArrowLeft size={18} />管理中心</Link><span className="store-badge">米伴 · 限时商城</span></header>}
    <main className="benefits-main">
      <div className="page-heading"><div><h1>优惠设置</h1><p>为选定用户设置专属优惠与优惠券。</p></div><BadgePercent size={24} /></div>
      <div className="store-boundary"><ShieldCheck size={16} /><p>当前范围：<b>限时商城</b>。优惠不跨其他商城，后台按商城与管理员身份复验。</p></div>
      {catalog.error && <div className="error" role="alert">商品目录读取失败：{catalog.error}<Button variant="outline" onClick={() => void catalog.refresh()}>重新读取商品目录</Button></div>}
      <div className={`benefits-layout ${detail ? "show-detail" : ""}`}>
        <section className="user-list"><div className="list-heading"><h2>选择用户</h2><span>{directory.loading ? "查询中…" : `${directory.total}位用户`}</span></div>
          <label className="search-field"><Search size={18} /><input aria-label="搜索用户" placeholder="姓名、用户名或用户ID" value={keyword} maxLength={80} onChange={event => setKeyword(event.target.value)} />{keyword && <button aria-label="清空搜索" onClick={() => setKeyword("")}><X size={16} /></button>}</label>
          <div className="small-filters">{([{ key: "all", name: "全部用户" }, { key: "with", name: "有优惠" }, { key: "without", name: "暂无优惠" }] as const).map(item => <button key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? "selected" : ""} onClick={() => setFilter(item.key)}>{item.name}</button>)}</div>
          <p className="directory-hint">搜索覆盖全部注册用户，不受当前分页数量限制；筛选以真实已保存优惠为准。</p>
          <div className="user-items">{directory.items.map(item => <button key={item.id} data-user-id={item.id} className={`user-row ${user?.id === item.id ? "selected" : ""}`} onClick={() => selectUser(item)} disabled={pending}><span className="avatar orange">{item.name.slice(-1)}</span><div><b className="user-name">{item.name}</b><small>{item.account ? `@${item.account}` : "未设置用户名"} · {item.id}</small></div><ChevronRight size={18} /></button>)}
            {directory.loading && <p role="status" className="directory-status">正在查询用户…</p>}
            {directory.error && <div role="alert" className="directory-status">{directory.error}<Button onClick={directory.reload}>重新查询</Button></div>}
            {directory.hasMore && !directory.loading && !directory.error && <Button className="directory-more" variant="outline" onClick={directory.loadMore}>加载更多用户（已显示{directory.items.length}位）</Button>}
            {!directory.loading && !directory.error && !directory.items.length && <Empty title="没有找到用户" text="请核对姓名、用户名或用户ID，或清空搜索和筛选。" />}
          </div>
        </section>
        <section className="user-detail" aria-label="用户优惠档案"><button className="mobile-back text-link" onClick={goList} disabled={pending}><ArrowLeft size={16} />返回用户列表</button>
          {!user ? <Empty title="先选择一个用户" text="选择用户后查看其真实已保存优惠。" /> : editor ? <BenefitEditor key={`${user.id}-${editor.editing?.id ?? "new"}-${editorRevision}`} user={user} mode={editor.mode} editing={editor.editing} rules={rules} onSave={(rule, count) => void save(rule, count)} onClose={closeEditor} pending={pending} saveError={saveError} onReload={() => void reloadEditor()} /> : <>
            <div className="detail-header"><div className="detail-identity"><span className="avatar large orange">{user.name.slice(-1)}</span><div><h2>{user.name}</h2><p>{user.account ? `@${user.account}` : "未设置用户名"} · {user.id}</p></div></div><button className="text-link" disabled={rulesQuery.isFetching || !!rulesQuery.error} onClick={() => setCustomer(true)}><Eye size={16} />用户端预览</button></div>
            <div className="stats-row"><div><small>生效专属优惠</small><b>{rulesQuery.isFetching ? "—" : activeRights.length}<em>项</em></b></div><div><small>可用优惠券</small><b>{rulesQuery.isFetching ? "—" : availableCoupons.length}<em>张</em></b></div><div><small>优惠适用商城</small><b className="scope-stat">限时商城</b></div></div>
            <div className="detail-tabs" role="tablist">{tabs.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? "active" : ""} onClick={() => { setTab(item.key); setListFilter("全部"); }}>{item.key === "trial" && <Calculator size={14} />}{item.name}</button>)}</div>
            {rulesQuery.isLoading && <p className="directory-status" role="status">正在读取已保存优惠…</p>}
            {rulesQuery.error && <div className="error" role="alert">优惠读取失败：{rulesQuery.error.message}<Button onClick={() => void rulesQuery.refetch()}>重新读取优惠</Button></div>}
            {(tab === "rights" || tab === "coupons") && !rulesQuery.isLoading && !rulesQuery.error && <>
              <div className="section-toolbar"><div><h3>{tab === "rights" ? "专属优惠" : "发给这个人的券"}</h3><p>{tab === "rights" ? "不叠加，按最终应付价择优" : "每张一次，每次结算最多一张"}</p></div><Button disabled={catalog.loading || !!catalog.error || !catalog.revision || rulesQuery.isFetching || pending} onClick={() => openEditor(tab === "rights" ? "right" : "coupon")}><Plus size={16} />{tab === "rights" ? "新增优惠" : "发优惠券"}</Button></div>
              <div className="small-filters scrollable">{(tab === "rights" ? ["全部", "生效中", "未开始", "已停用", "已过期", "次数用尽"] : ["全部", "可用", "已使用", "未开始", "已过期", "已撤销", "次数用尽"]).map(name => <button key={name} className={listFilter === name ? "selected" : ""} onClick={() => setListFilter(name)}>{name}</button>)}</div>
              <div className="rule-list">{listed.map(rule => <RuleCard key={rule.id} rule={rule} pending={pending || rulesQuery.isFetching} onEdit={() => openEditor("right", rule)} onAction={next => { setAction({ rule, next }); setReason(""); setActionError(""); }} />)}</div>
              {!listed.length && <Empty title={tab === "rights" ? "暂无专属优惠" : "暂无优惠券"} text={listFilter === "全部" ? "此用户尚未保存这类优惠，可使用上方按钮新增。" : "当前状态没有优惠，可切换其他状态。"} />}
              <div className="policy-note"><ShieldCheck size={16} /><p>同一商品优惠不叠加，价格相同优先不消耗券。停用和编辑不改变历史订单。</p></div>
            </>}
            {tab === "records" && <><div className="section-toolbar"><h3>使用与操作记录</h3><History size={18} /></div><div className="small-filters">{["全部", "订单使用", "设置操作"].map(name => <button key={name} className={recordFilter === name ? "selected" : ""} onClick={() => setRecordFilter(name)}>{name}</button>)}</div>{auditsQuery.isFetching && <p role="status">正在读取记录…</p>}{auditsQuery.error && <div className="error" role="alert">{auditsQuery.error.message}<Button onClick={() => void auditsQuery.refetch()}>重新读取记录</Button></div>}{!auditsQuery.error && (auditsQuery.data ?? []).filter(audit => recordFilter === "全部" || (recordFilter === "订单使用" ? !!audit.order : !audit.order)).map(audit => <article key={audit.id} className="audit"><History size={16} /><div><div className="audit-heading"><b>{audit.action}</b><small>{audit.time}</small></div><p>{audit.detail}</p>{audit.order && <small>订单：{audit.order}</small>}{audit.saved !== undefined && <small>实际节省 ¥{audit.saved.toFixed(2)}</small>}</div></article>)}{!auditsQuery.isFetching && !auditsQuery.error && !auditsQuery.data?.length && <Empty title="暂无记录" text="成功保存、发券或订单使用后会保留真实记录。" />}</>}
            {tab === "trial" && <BenefitSimulator key={user.id} userId={Number(user.id)} userName={user.name} />}
          </>}
        </section>
      </div>
    </main>
    {!editor && <nav className="benefits-bottom" aria-label="优惠页面导航"><Link href={`${BASE}/admin/panel`}><ShieldCheck size={17} />管理中心</Link><button disabled={pending} onClick={goList}><Users size={17} />用户列表</button><span><BadgePercent size={17} />优惠设置</span></nav>}
    <Dialog open={!!action} onOpenChange={open => { if (!open && !pending) setAction(null); }}><DialogContent className="miban-benefits miban-benefits-dialog" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}><DialogHeader><DialogTitle>{action?.next === "revoked" ? "撤销优惠券？" : action?.next === "paused" ? "停用专属优惠？" : "恢复专属优惠？"}</DialogTitle><DialogDescription>{action?.rule.name}。仅影响后续订单，不改变历史成交记录；撤销优惠券不可恢复。</DialogDescription></DialogHeader><label className="field">操作原因<textarea aria-label="操作原因" maxLength={200} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} /></label>{actionError && <div className="error" role="alert">{actionError}{/重新载入/.test(actionError) && <Button disabled={pending} onClick={() => { setAction(null); void rulesQuery.refetch(); }}>重新载入优惠列表</Button>}</div>}<div className="dialog-actions"><Button disabled={pending} variant="outline" onClick={() => setAction(null)}>取消</Button><Button disabled={pending} onClick={() => void applyAction()}>{pending ? "处理中…" : "确认操作"}</Button></div></DialogContent></Dialog>
    <Dialog open={customer} onOpenChange={setCustomer}><DialogContent className="miban-benefits miban-benefits-dialog customer-dialog"><DialogHeader><DialogTitle>用户端预览</DialogTitle><DialogDescription>{user?.name} · 真实已保存优惠，仅查看，不发券、不扣款。</DialogDescription></DialogHeader><h3>我的专属优惠</h3>{activeRights.map(rule => <div className="customer-right" key={rule.id}><BadgePercent size={20} /><div><b>{rule.name}</b><p>{scopeText(rule, catalog.products, true)}</p></div><strong>{valueText(rule)}</strong></div>)}{!activeRights.length && <p className="muted">暂无生效专属优惠</p>}<h3>可用优惠券 · {availableCoupons.length}张</h3>{availableCoupons.map(rule => <div className="coupon-preview small ticket" key={rule.id}><strong>{valueText(rule)}</strong><div><h4>{rule.name}</h4><p>{scopeText(rule, catalog.products, true)}</p><small>有效至{rule.ends} · 每张一次</small></div></div>)}{!availableCoupons.length && <p className="muted">暂无可用优惠券</p>}<p className="helper">仅限限时商城。此处不展示内部管理备注。</p></DialogContent></Dialog>
  </div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><BadgePercent size={28} /><h3>{title}</h3><p>{text}</p></div>; }
function RuleCard({ rule, pending, onEdit, onAction }: { rule: Rule; pending: boolean; onEdit: () => void; onAction: (next: StateAction["next"]) => void }) {
  const catalog = useBenefitCatalog();
  const state = status(rule);
  const coupon = isCoupon(rule);
  const mutableRight = !coupon && rule.state !== "revoked" && !["已过期", "次数用尽"].includes(state);
  const revocable = coupon && rule.uses === 0 && rule.state === "active" && ["生效中", "未开始"].includes(state);
  return <article data-rule-id={rule.id} className={`rule-card ${coupon ? "is-coupon" : ""} ${state === "生效中" ? "" : "inactive"}`}><div className="rule-card-heading">{coupon ? <Ticket size={18} /> : <BadgePercent size={18} />}<b>{rule.name}</b><span className={`pill ${state === "生效中" ? "green" : "neutral"}`}>{coupon && state === "生效中" ? "可用" : state}</span></div><div className="rule-body"><div className="rule-value">{valueText(rule)}</div><div className="rule-scope"><b>{scopeText(rule, catalog.products, true)}</b><p>{rule.starts}起 · {rule.unlimited ? "长期有效" : `至${rule.ends}`}</p><p>{coupon ? "每张限用一次" : rule.maxUses ? `已用${rule.uses}/${rule.maxUses}次` : "有效期内不限次数"} · 版本{rule.version}</p></div></div><div className="rule-card-foot"><small>平台承担 · 不叠加择优</small><div>{mutableRight && <button disabled={pending || !!catalog.error} onClick={onEdit}>编辑</button>}{mutableRight && rule.state === "active" && <button disabled={pending} onClick={() => onAction("paused")}>停用</button>}{mutableRight && rule.state === "paused" && <button disabled={pending} onClick={() => onAction("active")}>恢复</button>}{revocable && <button disabled={pending} onClick={() => onAction("revoked")}>撤销</button>}</div></div></article>;
}
