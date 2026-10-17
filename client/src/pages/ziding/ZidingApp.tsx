import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, BarChart3, Bell, Check, ChevronRight, Copy, Download, FileImage,
  Home, ImagePlus, LayoutDashboard, MapPin, Menu, Package, Plus, ReceiptText, ZoomIn,
  LogOut, Save, ScanLine, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Truck, UserRound, Wallet,
  UsersRound, X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import VersionSwitcher from "@/components/VersionSwitcher";
import zidingRegionData from "./ziding-region-data.json";

const BASE = "/p/proj_stn4q7";
const C = {
  ink: "#28152F", plum: "#765777", gold: "#B89A68", canvas: "#F8F5F1",
  paper: "#FFFFFF", line: "#E9E1D8", muted: "#897C88", success: "#3F715D", danger: "#B95252",
};
type ZidingRegionNode = { n: string; d?: ZidingRegionNode[] };
const ZIDING_REGIONS = zidingRegionData as ZidingRegionNode[];
const DIRECT_DISTRICT_REGIONS = new Set(["北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区"]);
const getZidingRegion = (province: string) => ZIDING_REGIONS.find((region) => region.n === province);
const getZidingCities = (province: string) => {
  const region = getZidingRegion(province);
  if (!region || DIRECT_DISTRICT_REGIONS.has(province)) return [];
  return region.d?.length ? region.d.map((city) => city.n) : [province];
};
const getZidingDistricts = (province: string, city: string) => {
  const region = getZidingRegion(province);
  if (!region) return [];
  if (DIRECT_DISTRICT_REGIONS.has(province)) return region.d?.map((district) => district.n) || [];
  return region.d?.find((item) => item.n === city)?.d?.map((district) => district.n) || [];
};

type Cart = Record<number, number>;
type ProductNarrative = { image: string; headline: string; summary: string; highlights: string[]; specification: string; guidance: string; notice: string };
const COS_PRODUCT_IMAGES = {
  breakfast: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/1-yangyuan-breakfast-powder.webp",
  peptide: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/2-yingbintang-soy-peptide.webp",
  gene14: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/3-gene14.webp",
  patch: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/4-fushangmi-patch.webp",
  vinegar: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/5-tianyi-women-vinegar.webp",
  nutrition: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ziding-commercial-alliance/products/6-pqq-glucosamine-hyaluronate.webp",
};
const PRODUCT_NARRATIVES: Array<{ match: string[]; content: ProductNarrative }> = [
  { match: ["养源归序", "早餐粉"], content: { image: COS_PRODUCT_IMAGES.breakfast, headline: "为有节奏的清晨，留一份从容的开始", summary: "以独立小包装收纳日常早餐时刻；不论在家或出行，都能更从容地安排每一份早晨。", highlights: ["一组四包，独立收纳", "适合日常冲调场景", "具体配料以包装为准"], specification: "一组四包", guidance: "请依照产品包装标注的冲调方式、食用建议与保存条件使用。", notice: "食品类商品的配料、净含量、食用方式及注意事项均以实物包装与说明书为准。" } },
  { match: ["迎彬堂", "大豆小分子肽"], content: { image: COS_PRODUCT_IMAGES.peptide, headline: "把日常营养管理，安放进有序的节奏", summary: "精致盒装组合，适合纳入日常的营养管理安排。每一份细节，以包装标注与使用说明为准。", highlights: ["一组三盒，盒装组合", "日常营养管理之选", "请按包装建议使用"], specification: "一组三盒", guidance: "请阅读产品包装的配料、建议食用量、适用人群与注意事项后使用。", notice: "本页仅作商品展示，不构成健康或医疗建议。" } },
  { match: ["基因十四", "基因Gene14", "Gene14"], content: { image: COS_PRODUCT_IMAGES.gene14, headline: "一盒轻盈安排，融入每天的生活节奏", summary: "简洁盒装，便于收纳与日常取用；为重视生活秩序的人，准备一份安静而清晰的选择。", highlights: ["一盒装", "便于收纳与取用", "使用说明以包装为准"], specification: "一盒装", guidance: "请按外包装标注的保存、冲调或饮用方式使用。", notice: "产品配方、规格信息及适用建议以实物包装和说明书为准。" } },
  { match: ["负熵密码", "理敷贴"], content: { image: COS_PRODUCT_IMAGES.patch, headline: "留给自己一段安静、专注的护理时间", summary: "独立包装便于日常护理与外出携带。以清晰的使用步骤，照顾每一次自我呵护的仪式感。", highlights: ["一盒四贴，独立包装", "日常面部护理", "使用前请阅读说明"], specification: "一盒四贴", guidance: "请按包装标注的使用步骤、使用时长与注意事项进行护理。", notice: "敏感肌或特殊人群请先阅读产品说明；如有不适，请停止使用。" } },
  { match: ["天乙女人醋", "女人醋"], content: { image: COS_PRODUCT_IMAGES.vinegar, headline: "一份雅致心意，记录从容的日常时刻", summary: "礼盒式包装与日常饮用场景相融，适合为自己或重要的人准备一份有分寸的心意。", highlights: ["一盒装礼盒", "日常饮用场景", "风味与方式以包装为准"], specification: "一盒装", guidance: "请按照产品包装标注的饮用方式、储存条件与注意事项食用。", notice: "风味、配料、适用人群和注意事项均以产品包装及说明书为准。" } },
  { match: ["吡咯喹啉醌", "透明质酸钠", "PQQ"], content: { image: COS_PRODUCT_IMAGES.nutrition, headline: "以清晰的日常选择，陪伴每一次自我关照", summary: "简洁盒装设计，适合作为日常营养管理的备选商品；每一份安排，都应从阅读清楚包装开始。", highlights: ["一盒装", "复合营养类商品", "请按包装规范使用"], specification: "一盒装", guidance: "请按实物包装的配料、建议食用量、适用人群和注意事项使用。", notice: "本品不能替代药物；产品资料请以实物包装和说明书为准。" } },
];
const DEFAULT_NARRATIVE: ProductNarrative = { image: "", headline: "一份为日常而准备的细致选择", summary: "以简洁、清晰的方式呈现产品信息，让每一次选择都更从容。", highlights: ["精选商品", "清晰展示", "信息以实物为准"], specification: "具体规格以商品说明为准", guidance: "请依照商品包装和说明书的使用方式、保存条件及注意事项使用。", notice: "商品图片、规格与说明以实际发货商品为准。" };
const getProductNarrative = (product: any): ProductNarrative => {
  const name = String(product?.name || "");
  return PRODUCT_NARRATIVES.find((item) => item.match.some((word) => name.includes(word)))?.content || DEFAULT_NARRATIVE;
};
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value: unknown) => value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(String(value))) : "—";
const statusTone = (status: string) => ({
  awaiting_proof: { text: "待上传", color: C.plum, bg: "#F1ECF1" }, proof_submitted: { text: "待确认", color: "#8B651E", bg: "#F8F0E0" },
  proof_rejected: { text: "待补充", color: C.danger, bg: "#FCEEEE" }, confirmed: { text: "待发货", color: C.plum, bg: "#F1ECF1" },
  shipped: { text: "已发货", color: "#32658A", bg: "#EAF3F8" }, completed: { text: "已完成", color: C.success, bg: "#EAF4EE" },
  cancelled: { text: "已取消", color: C.muted, bg: "#F1F0EF" },
} as any)[status] || { text: status, color: C.muted, bg: "#F1F0EF" };

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[22px] border p-4 ${className}`} style={{ background: C.paper, borderColor: C.line }}>{children}</section>;
}
function Button({ children, onClick, kind = "primary", className = "", disabled = false, type = "button" }: { children: React.ReactNode; onClick?: () => void; kind?: "primary" | "quiet" | "danger"; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const tone = kind === "primary" ? { background: C.ink, color: "white", borderColor: C.ink } : kind === "danger" ? { background: "#FFF5F5", color: C.danger, borderColor: "#F1CECE" } : { background: "transparent", color: C.ink, borderColor: C.line };
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition disabled:opacity-45 ${className}`} style={tone}>{children}</button>;
}
function Label({ children }: { children: React.ReactNode }) { return <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em]" style={{ color: C.muted }}>{children}</label>; }
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${props.className || ""}`} style={{ borderColor: C.line, background: "#FFFEFC", color: C.ink }} />; }
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${props.className || ""}`} style={{ borderColor: C.line, background: "#FFFEFC", color: C.ink }} />; }

function Header({ title, right, back }: { title?: string; right?: React.ReactNode; back?: () => void }) {
  return <header className="sticky top-0 z-30 border-b px-4" style={{ background: "rgba(248,245,241,.94)", borderColor: C.line, backdropFilter: "blur(16px)" }}>
    <div className="mx-auto flex h-[58px] max-w-md items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        {back ? <button onClick={back} className="-ml-1 rounded-full p-1.5"><ArrowLeft size={19} style={{ color: C.ink }} /></button> : <VersionSwitcher variant="inline" currentVersionKey="proj_stn4q7" menuAlign="left" />}
        <div className="min-w-0"><div className="truncate text-[15px] font-bold" style={{ color: C.ink }}>{title || "紫鼎商业联盟"}</div></div>
      </div>{right}
    </div>
  </header>;
}

export default function ZidingApp() {
  const [location, navigate] = useLocation();
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: false });
  const context = trpc.zidingCommerce.myContext.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const path = location.startsWith(BASE) ? (location.slice(BASE.length) || "/") : "/";
  const go = (suffix = "") => navigate(`${BASE}${suffix}`);
  const exit = async () => {
    try {
      await logout();
      try { sessionStorage.removeItem("_viewing_version"); } catch { /* 忽略受限环境的存储异常 */ }
      navigate(`/login?project=proj_stn4q7&from=${encodeURIComponent(BASE)}`);
    } catch {
      alert("退出登录失败，请稍后重试。");
    }
  };
  if (loading || context.isLoading) return <div className="min-h-screen grid place-items-center text-sm" style={{ background: C.canvas, color: C.muted }}>正在进入紫鼎商业联盟…</div>;
  if (!user || context.error) return <LoginGate />;
  if (path.startsWith("/product-style")) return <ProductLongDetail product={{ id: 0, name: "养源归序早餐粉", subtitle: "一组四包", description: "为有节奏的清晨准备的便捷冲调食品。", imageUrl: COS_PRODUCT_IMAGES.breakfast, price: 0 }} onClose={() => go("")} preview />;
  if (path.startsWith("/checkout")) return <CheckoutPage go={go} />;
  if (path.startsWith("/payment")) return <PaymentProofPage go={go} />;
  if (path.startsWith("/admin")) return <AdminApp go={go} onExit={() => go("")} />;
  if (path.startsWith("/orders")) return <OrdersApp go={go} />;
  if (path.startsWith("/me")) return <ProfileApp go={go} />;
  return <Storefront go={go} context={context.data as any} profile={user as any} onLogout={exit} />;
}

function LoginGate() {
  return <div className="min-h-screen flex items-center justify-center p-7" style={{ background: C.canvas }}><Panel className="max-w-sm text-center"><ShieldCheck className="mx-auto mb-3" size={26} style={{ color: C.gold }} /><h1 className="text-lg font-bold" style={{ color: C.ink }}>请先登录</h1><p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>请使用管理员开通的账号登录。紫鼎商业联盟会员不支持自主注册。</p><a href={`/login?project=proj_stn4q7&from=${encodeURIComponent(BASE)}`} className="mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.ink }}>前往登录</a></Panel></div>;
}

function Storefront({ go, context, profile, onLogout }: { go: (suffix?: string) => void; context: any; profile: any; onLogout: () => Promise<void> }) {
  const products = trpc.zidingCommerce.listProducts.useQuery();
  // 入口按项目角色显示；所有管理写入仍由服务端的 requireAdmin 二次校验。
  const canManage = ["owner", "order_admin", "catalog_admin"].includes(String(context.member?.role || ""));
  const [cart, setCart] = useState<Cart>(() => { try { return JSON.parse(localStorage.getItem("ziding-cart") || "{}"); } catch { return {}; } });
  const [showCart, setShowCart] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [addedName, setAddedName] = useState("");
  useEffect(() => { localStorage.setItem("ziding-cart", JSON.stringify(cart)); }, [cart]);
  const list = (products.data || []) as any[];
  const rows = useMemo(() => list.filter((p) => cart[p.id]).map((p) => ({ ...p, quantity: cart[p.id] })), [list, cart]);
  const count = rows.reduce((sum, row) => sum + row.quantity, 0);
  const total = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const orderSummary = context.orderSummary || { awaitingConfirmation: 0, awaitingShipment: 0, awaitingReceipt: 0 };
  const nickname = profile?.nickname || profile?.name || "紫鼎会员";
  const username = profile?.username || profile?.userName || profile?.email || "";
  const avatar = profile?.avatar || profile?.avatarUrl || profile?.profileImage || "";
  const membershipLabel = context.member.tier === "senior" ? "高级会员" : "初级会员";
  const add = (id: number) => setCart((old) => ({ ...old, [id]: Math.min((old[id] || 0) + 1, 99) }));
  const change = (id: number, next: number) => setCart((old) => { const copy = { ...old }; if (next <= 0) delete copy[id]; else copy[id] = Math.min(next, 99); return copy; });
  const isPurchasable = (product: any) => Number(product.price || 0) > 0 && Number(product.stock || 0) > 0;
  const quickAdd = (product: any) => {
    if (!isPurchasable(product)) return;
    add(product.id);
    setAddedName(product.name);
    window.setTimeout(() => setAddedName(""), 1800);
  };
  const buyNow = (product: any) => {
    if (!isPurchasable(product)) return;
    const nextCart = { [product.id]: 1 };
    setCart(nextCart);
    localStorage.setItem("ziding-cart", JSON.stringify(nextCart));
    setDetailProduct(null);
    go("/checkout");
  };
  return <div className="min-h-screen pb-8" style={{ background: C.canvas }}>
    <Header right={<button onClick={() => setShowQuickMenu(true)} className="grid h-9 w-9 place-items-center rounded-full" aria-label="打开功能菜单" style={{ background: "#F3EEE9", color: C.ink }}><Menu size={20} /></button>} />
    <main className="mx-auto max-w-md px-4 pt-5">
      <section className="border-b pb-5" style={{ borderColor: C.line }}>
        <div className="flex min-w-0 items-center gap-2.5"><div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full" style={{ background: "#EEE4EA", color: C.plum }}>{avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <UserRound size={17} />}</div><div className="flex min-w-0 items-center gap-1.5 text-sm"><span className="truncate font-semibold" style={{ color: C.ink }}>{nickname}</span>{username && <span className="truncate text-xs" style={{ color: C.muted }}>{username}</span>}<span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#F2EAF0", color: C.plum }}>{membershipLabel}</span></div></div>
        <div className="mt-4 grid grid-cols-3 divide-x border-y py-3" style={{ borderColor: C.line }}><div className="pr-3"><div className="text-[10px]" style={{ color: C.muted }}>本月已获积分</div><div className="mt-1 text-lg font-semibold" style={{ color: C.ink }}>{Number(context.points.earned).toLocaleString("zh-CN")}</div></div><div className="px-3"><div className="text-[10px]" style={{ color: C.muted }}>当前加权系数</div><div className="mt-1 text-lg font-semibold" style={{ color: C.ink }}>{Number(context.points.currentMultiplier).toFixed(2)}×</div></div><div className="pl-3"><div className="text-[10px]" style={{ color: C.muted }}>本月有效订购额</div><div className="mt-1 text-base font-semibold" style={{ color: C.ink }}>{money(context.points.qualifiedAmount)}</div></div></div>
        {context.points.amountToNext != null && <div className="mt-3 text-right text-[11px]" style={{ color: C.muted }}>距下一档还差 <strong style={{ color: C.ink }}>{money(context.points.amountToNext)}</strong></div>}
      </section>
      <div className="mt-7 mb-3 flex items-end justify-between"><div><div className="text-[11px] font-semibold tracking-[.14em]" style={{ color: C.gold }}>甄选好物</div><h2 className="mt-1 text-xl font-bold" style={{ color: C.ink }}>精选产品</h2></div><button className="text-xs" style={{ color: C.plum }}>查看全部</button></div>
      {products.isLoading ? <div className="py-12 text-center text-sm" style={{ color: C.muted }}>正在加载商品…</div> : list.length === 0 ? <EmptyProductState isAdmin={canManage} go={go} /> : <div className="-mx-3 grid grid-cols-2 gap-2">{list.map((product) => <ProductCard key={product.id} product={product} purchasable={isPurchasable(product)} onQuickAdd={() => quickAdd(product)} onOpen={() => setDetailProduct(product)} />)}</div>}
    </main>
    {showCart && <CartSheet rows={rows} total={total} onClose={() => setShowCart(false)} onChange={change} onCheckout={() => { setShowCart(false); go("/checkout"); }} />}
    {showQuickMenu && <QuickMenuDrawer profile={profile} identityLabel={Boolean(context.member?.isAdmin) ? "管理员" : context.member?.tier === "senior" ? "高级会员" : "初级会员"} orderSummary={orderSummary} canConfigure={Boolean(context.member?.isAdmin)} onClose={() => setShowQuickMenu(false)} onOrders={() => { setShowQuickMenu(false); go("/orders"); }} onSettings={() => { setShowQuickMenu(false); go("/admin"); }} onScan={() => { setShowQuickMenu(false); setShowScanner(true); }} onLogout={onLogout} />}
    {showScanner && <ScannerSheet onClose={() => setShowScanner(false)} />}
    {detailProduct && <ProductLongDetail product={detailProduct} onClose={() => setDetailProduct(null)} onBuyNow={() => buyNow(detailProduct)} />}
    {addedName && <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-lg" style={{ background: C.ink }}>已加入购物车：{addedName}</div>}
  </div>;
}

function EmptyProductState({ isAdmin, go }: { isAdmin: boolean; go: (path?: string) => void }) {
  return <Panel className="py-10 text-center"><Package className="mx-auto mb-3" size={25} style={{ color: C.gold }} /><h3 className="font-semibold" style={{ color: C.ink }}>商品正在准备中</h3><p className="mx-auto mt-2 max-w-[260px] text-xs leading-5" style={{ color: C.muted }}>首版已搭建完成。管理员上架商品后，用户将自动看到对应身份价格与库存。</p>{isAdmin && <Button onClick={() => go("/admin?tab=products")} className="mt-4"><Plus size={15} />上架首个商品</Button>}</Panel>;
}

function ProductCard({ product, purchasable, onQuickAdd, onOpen }: { product: any; purchasable: boolean; onQuickAdd: () => void; onOpen: () => void }) {
  return <article className="overflow-hidden rounded-[4px]" style={{ background: C.paper }}><button onClick={onOpen} className="block w-full text-left"><div className="aspect-[.92] bg-[#F1ECE9]">{product.imageUrl ? <img src={product.imageUrl} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package size={28} style={{ color: "#C9BFC5" }} /></div>}</div></button><div className="flex items-start gap-2 px-3 pb-5 pt-3"><button onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="line-clamp-2 text-sm font-semibold leading-5" style={{ color: C.ink }}>{product.name}</div></button><button disabled={!purchasable} onClick={onQuickAdd} aria-label={`将${product.name}加入购物车`} title="加入购物车" className="grid h-7 w-7 shrink-0 place-items-center rounded-full shadow-sm disabled:opacity-40" style={{ color: "#E7C778", background: "linear-gradient(135deg,#3D1747,#765183)" }}><ShoppingCart size={15} /></button></div></article>;
}
function ProductLongDetail({ product, onClose, onBuyNow, preview = false }: { product: any; onClose: () => void; onBuyNow?: () => void; preview?: boolean }) {
  const content = getProductNarrative(product); const image = product.imageUrl || content.image; const subtitle = product.subtitle || content.specification; const purchasable = !preview && Number(product.price || 0) > 0 && Number(product.stock || 0) > 0; const pendingConfiguration = !preview && Number(product.price || 0) === 0 && Number(product.stock || 0) === 0;
  return <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: C.canvas }}><Header title="商品详情" back={onClose} right={<button onClick={onClose} className="text-xs font-semibold" style={{ color: C.plum }}>返回</button>} /><main className="mx-auto max-w-md overflow-hidden pb-24">
    <section className="px-5 pt-6"><div className="mb-4 flex items-center gap-2 text-[10px] font-semibold tracking-[.16em]" style={{ color: C.plum }}><span className="h-px w-7" style={{ background: C.gold }} />紫鼎甄选</div><h1 className="max-w-[290px] text-[27px] font-semibold leading-[1.28]" style={{ color: C.ink }}>{product.name}</h1><p className="mt-2 text-sm" style={{ color: C.muted }}>{subtitle}</p><div className="mt-5 overflow-hidden rounded-[28px]" style={{ background: "#F1ECE9" }}>{image ? <img src={image} className="block aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center"><Package size={34} style={{ color: C.muted }} /></div>}</div></section>
    <section className="px-6 py-12 text-center"><div className="text-[10px] font-semibold tracking-[.18em]" style={{ color: C.gold }}>日常之选</div><h2 className="mx-auto mt-3 max-w-[290px] text-[23px] font-semibold leading-[1.45]" style={{ color: C.ink }}>{content.headline}</h2><p className="mx-auto mt-4 max-w-[310px] text-[13px] leading-7" style={{ color: C.muted }}>{content.summary}</p></section>
    <section className="border-y px-5 py-9" style={{ borderColor: C.line, background: "#FFFEFC" }}><div className="mb-6 text-center"><div className="text-[10px] font-semibold tracking-[.18em]" style={{ color: C.gold }}>为你准备</div><h2 className="mt-2 text-xl font-semibold" style={{ color: C.ink }}>看得见的细致安排</h2></div><div className="grid grid-cols-3 divide-x" style={{ borderColor: C.line }}>{content.highlights.map((item, index) => <div key={item} className="px-3 text-center"><div className="text-[10px] font-semibold" style={{ color: C.gold }}>0{index + 1}</div><p className="mt-2 text-[11px] leading-5" style={{ color: C.ink }}>{item}</p></div>)}</div></section>
    <section className="px-5 py-10"><div className="text-[10px] font-semibold tracking-[.16em]" style={{ color: C.gold }}>产品信息</div><div className="mt-4 divide-y border-y" style={{ borderColor: C.line }}><div className="flex gap-5 py-4 text-sm"><span className="w-16 shrink-0" style={{ color: C.muted }}>规格</span><span style={{ color: C.ink }}>{subtitle}</span></div><div className="flex gap-5 py-4 text-sm"><span className="w-16 shrink-0" style={{ color: C.muted }}>说明</span><span className="leading-6" style={{ color: C.ink }}>{product.description || content.guidance}</span></div><div className="flex gap-5 py-4 text-sm"><span className="w-16 shrink-0" style={{ color: C.muted }}>提示</span><span className="leading-6" style={{ color: C.ink }}>{content.notice}</span></div></div></section>
    <section className="px-6 py-12 text-center" style={{ background: C.ink }}><div className="text-[10px] font-semibold tracking-[.18em]" style={{ color: "#DCC69F" }}>紫鼎商业联盟</div><h2 className="mt-3 text-xl font-semibold text-white">认真呈现每一份日常选择</h2><p className="mx-auto mt-3 max-w-[286px] text-[12px] leading-6 text-white/65">商品图、规格及说明以实际发货商品为准。下单后，请按订单页面指引完成付款凭证上传。</p></section>
  </main><div className="fixed bottom-0 left-0 right-0 z-10 border-t px-4 py-3" style={{ background: "rgba(255,254,252,.97)", borderColor: C.line, backdropFilter: "blur(14px)" }}><div className="mx-auto flex max-w-md items-center justify-between gap-3"><div>{!preview && purchasable && <><div className="text-[10px]" style={{ color: C.muted }}>会员专属价格</div><strong className="text-lg" style={{ color: C.ink }}>{money(product.price)}</strong></>}{preview && <div className="text-xs" style={{ color: C.muted }}>商品详情长页设计预览</div>}{pendingConfiguration && <div className="text-xs" style={{ color: C.muted }}>价格与库存待管理员设置</div>}{!preview && !pendingConfiguration && !purchasable && <div className="text-xs" style={{ color: C.muted }}>暂时无货</div>}</div><Button disabled={!preview && !purchasable} onClick={preview ? onClose : onBuyNow} className="min-w-28">{preview ? "返回首页" : "立即购买"}<ChevronRight size={15} /></Button></div></div></div>;
}
function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <div className="flex items-center rounded-lg border" style={{ borderColor: C.line }}><button onClick={() => onChange(value - 1)} className="px-2 py-1.5 text-sm" style={{ color: C.ink }}>−</button><span className="w-5 text-center text-xs font-semibold" style={{ color: C.ink }}>{value}</span><button onClick={() => onChange(value + 1)} className="px-2 py-1.5 text-sm" style={{ color: C.ink }}>+</button></div>; }

function CartSheet({ rows, total, onClose, onChange, onCheckout }: { rows: any[]; total: number; onClose: () => void; onChange: (id: number, next: number) => void; onCheckout: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={onClose}><div className="w-full rounded-t-[28px] p-5" onClick={(e) => e.stopPropagation()} style={{ background: C.canvas }}><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold" style={{ color: C.ink }}>购物车</h3><button onClick={onClose}><X size={20} /></button></div>{rows.map((row) => <div className="mb-3 flex items-center justify-between rounded-xl border p-3" style={{ background: C.paper, borderColor: C.line }} key={row.id}><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{row.name}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{money(row.price)}</div></div><Stepper value={row.quantity} onChange={(next) => onChange(row.id, next)} /></div>)}<div className="mt-5 flex items-center justify-between"><div><div className="text-xs" style={{ color: C.muted }}>合计</div><div className="text-xl font-bold" style={{ color: C.ink }}>{money(total)}</div></div><Button onClick={onCheckout} disabled={!rows.length}>去填写订单<ChevronRight size={15} /></Button></div></div></div>;
}
function QuickMenuDrawer({ profile, identityLabel, orderSummary, canConfigure, onClose, onOrders, onSettings, onScan, onLogout }: { profile: any; identityLabel: string; orderSummary: { awaitingConfirmation: number; awaitingShipment: number; awaitingReceipt: number }; canConfigure: boolean; onClose: () => void; onOrders: () => void; onSettings: () => void; onScan: () => void; onLogout: () => Promise<void> }) {
  const statuses = [["待确认", orderSummary.awaitingConfirmation], ["待发货", orderSummary.awaitingShipment], ["待收货", orderSummary.awaitingReceipt]] as const;
  const pendingTotal = statuses.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const nickname = String(profile?.name || profile?.username || "会员");
  const username = String(profile?.username || "—");
  const avatar = String(profile?.avatar || "").trim();
  return <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose}><aside className="ml-auto flex h-full w-[80vw] max-w-[360px] flex-col px-5 pb-7 pt-5 shadow-2xl" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}>
    <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: C.line }}><div className="flex min-w-0 items-center gap-2.5">{avatar ? <img src={avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ background: "#EEE4EA" }} /> : <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: C.plum, color: "white" }}>{nickname.slice(0, 1)}</div>}<div className="min-w-0"><div className="flex items-center gap-1.5"><div className="truncate text-sm font-semibold" style={{ color: C.ink }}>{nickname}</div><span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "#F2EAF0", color: C.plum }}>{identityLabel}</span></div><div className="mt-0.5 truncate text-[11px]" style={{ color: C.muted }}>{username}</div></div></div><button onClick={onScan} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold" style={{ background: "#F3EEE9", color: C.ink }}><ScanLine size={16} />扫一扫</button></div>
    <section className="mt-5 border-y" style={{ borderColor: C.line }}><button onClick={onOrders} className="flex w-full items-center gap-3 py-4 text-left"><ReceiptText size={20} style={{ color: C.ink }} /><div className="min-w-0 flex-1"><div className="text-[15px] font-semibold" style={{ color: C.ink }}>我的订单</div>{pendingTotal > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{statuses.filter(([, count]) => count > 0).map(([label, count]) => <span key={label} className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: C.plum, background: "#F2EAF0" }}>{label} {count}</span>)}</div> : <div className="mt-1 text-[11px]" style={{ color: C.muted }}>暂无待处理订单</div>}</div><ChevronRight size={17} style={{ color: C.muted }} /></button><div className="flex items-center gap-3 border-t py-4 opacity-45" style={{ borderColor: C.line }}><Wallet size={20} style={{ color: C.muted }} /><div className="flex-1"><div className="text-[15px] font-semibold" style={{ color: C.muted }}>我的钱包</div><div className="mt-1 text-[11px]" style={{ color: C.muted }}>暂未开放</div></div></div>{canConfigure && <button onClick={onSettings} className="flex w-full items-center gap-3 border-t py-4 text-left" style={{ borderColor: C.line }}><Settings size={20} style={{ color: C.ink }} /><span className="flex-1 text-[15px] font-semibold" style={{ color: C.ink }}>后台管理</span><ChevronRight size={17} style={{ color: C.muted }} /></button>}<button onClick={onLogout} className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-[11px] font-semibold" style={{ borderColor: C.line, color: C.muted }}><LogOut size={13} />退出登录</button></section>
  </aside></div>;
}
function ScannerSheet({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [status, setStatus] = useState("正在打开后置相机…");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let frame = 0;
    let stream: MediaStream | null = null;
    const stop = () => { stream?.getTracks().forEach((track) => track.stop()); };
    const start = async () => {
      setResult(""); setError(""); setStatus("正在打开后置相机…");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器无法调用相机。");
        const BarcodeDetectorConstructor = (window as any).BarcodeDetector;
        if (!BarcodeDetectorConstructor) throw new Error("当前浏览器暂不支持网页扫码，请使用新版手机浏览器打开。");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive || !videoRef.current) { stop(); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new BarcodeDetectorConstructor({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"] });
        setStatus("将二维码或条形码放入取景框");
        const detect = async () => {
          if (!alive || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = String(codes?.[0]?.rawValue || "").trim();
            if (value) { setResult(value); setStatus("识别成功"); stop(); return; }
          } catch { /* 取景未稳定时继续扫描 */ }
          frame = window.requestAnimationFrame(detect);
        };
        frame = window.requestAnimationFrame(detect);
      } catch (caught: any) {
        setError(caught?.name === "NotAllowedError" ? "未获得相机权限。请在浏览器设置中允许使用相机后重试。" : (caught?.message || "相机启动失败，请稍后重试。"));
        setStatus("无法启动扫码");
        stop();
      }
    };
    start();
    return () => { alive = false; if (frame) window.cancelAnimationFrame(frame); stop(); };
  }, [scanKey]);
  const copyResult = async () => { try { await navigator.clipboard.writeText(result); setStatus("扫码内容已复制"); } catch { setStatus("复制失败，请长按内容复制"); } };
  return <div className="fixed inset-0 z-[80] overflow-y-auto" style={{ background: C.canvas }}><Header title="扫一扫" back={onClose} /><main className="mx-auto max-w-md px-5 pb-10 pt-6"><div className="overflow-hidden rounded-[28px]" style={{ background: C.ink }}><div className="relative aspect-square"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{!result && <><div className="absolute inset-[13%] rounded-[22px] border-2 border-white/80" /><div className="absolute left-1/2 top-1/2 h-px w-[58%] -translate-x-1/2 bg-white/80" /></>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-5 pt-14 text-center text-xs text-white/85">{status}</div></div></div><p className="mt-5 text-center text-xs leading-6" style={{ color: C.muted }}>支持二维码及常见商品条码。首次使用时，请在浏览器弹窗中允许使用相机。</p>{error && <div className="mt-5 rounded-2xl border p-4 text-sm leading-6" style={{ color: C.danger, borderColor: "#EACACA", background: "#FFF8F8" }}>{error}</div>}{result && <div className="mt-5 border-y py-4" style={{ borderColor: C.line }}><div className="text-[11px]" style={{ color: C.muted }}>扫码结果</div><div className="mt-2 break-all text-sm leading-6" style={{ color: C.ink }}>{result}</div></div>}<div className="mt-6 flex gap-2"><Button kind="quiet" onClick={onClose} className="flex-1">返回</Button>{result ? <Button onClick={copyResult} className="flex-1">复制结果</Button> : <Button onClick={() => setScanKey((key) => key + 1)} className="flex-1">重新扫码</Button>}</div></main></div>;
}
function BottomNav({ active, go, cartCount, onCart }: { active: "home" | "orders" | "me"; go: (path?: string) => void; cartCount?: number; onCart?: () => void }) {
  const nav = [{ key: "home", text: "首页", icon: Home, target: "" }, { key: "orders", text: "订单", icon: ReceiptText, target: "/orders" }, { key: "me", text: "我的", icon: UserRound, target: "/me" }];
  return <nav className="fixed bottom-0 left-0 right-0 z-30 border-t px-5" style={{ background: "rgba(255,254,252,.96)", borderColor: C.line, backdropFilter: "blur(16px)" }}><div className="mx-auto flex h-[64px] max-w-md items-center justify-around">{nav.map((item) => { const Icon = item.icon; return <button key={item.key} onClick={() => go(item.target)} className="relative flex min-w-12 flex-col items-center gap-1 text-[10px]" style={{ color: active === item.key ? C.ink : C.muted }}><Icon size={19} strokeWidth={active === item.key ? 2.4 : 1.8} />{item.text}</button>; })}{onCart && <button onClick={onCart} className="relative flex min-w-12 flex-col items-center gap-1 text-[10px]" style={{ color: C.muted }}><ShoppingBag size={19} />购物车{cartCount ? <span className="absolute right-0 top-[-4px] grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] text-white" style={{ background: C.ink }}>{cartCount}</span> : null}</button>}</div></nav>;
}

function CheckoutProgress({ current }: { current: 1 | 2 }) {
  return (
    <div
      className="mb-5 flex items-center gap-2 text-[11px] font-semibold"
      style={{ color: C.muted }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-white"
          style={{ background: current > 1 ? C.success : C.ink }}
        >
          {current > 1 ? <Check size={14} /> : "1"}
        </span>
        <span style={{ color: current === 1 ? C.ink : C.muted }}>确认订单</span>
      </div>
      <span className="h-px flex-1" style={{ background: C.line }} />
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 place-items-center rounded-full border"
          style={{
            background: current === 2 ? C.ink : C.paper,
            color: current === 2 ? "white" : C.muted,
            borderColor: current === 2 ? C.ink : C.line,
          }}
        >
          2
        </span>
        <span style={{ color: current === 2 ? C.ink : C.muted }}>提交凭证</span>
      </div>
    </div>
  );
}

function OrdersApp({ go }: { go: (path?: string) => void }) {
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const context = trpc.zidingCommerce.myContext.useQuery();
  const orders = trpc.zidingCommerce.myOrders.useQuery({ status });
  const detail = trpc.zidingCommerce.myOrderDetail.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );
  return (
    <div className="min-h-screen pb-24" style={{ background: C.canvas }}>
      <Header title="我的订单" back={() => go("")} />
      <main className="mx-auto max-w-md px-4 pt-4">
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {[
            ["all", "全部"],
            ["awaiting_proof", "待上传"],
            ["proof_submitted", "待确认"],
            ["confirmed", "待发货"],
            ["shipped", "已发货"],
            ["completed", "已完成"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs"
              style={{
                background: status === key ? C.ink : C.paper,
                color: status === key ? "white" : C.muted,
                border: `1px solid ${status === key ? C.ink : C.line}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {orders.isLoading ? (
          <div className="py-16 text-center text-sm" style={{ color: C.muted }}>
            正在加载订单…
          </div>
        ) : (orders.data || []).length === 0 ? (
          <Panel className="py-12 text-center">
            <ReceiptText
              className="mx-auto mb-3"
              size={25}
              style={{ color: C.gold }}
            />
            <div className="font-semibold" style={{ color: C.ink }}>
              暂时没有订单
            </div>
            <p className="mt-2 text-xs" style={{ color: C.muted }}>
              商品拍下后，会在这里显示订单进度。
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {(orders.data || []).map((order: any) => (
              <OrderRow
                key={order.id}
                order={order}
                onClick={() => setSelectedId(order.id)}
              />
            ))}
          </div>
        )}
      </main>
      <BottomNav active="orders" go={go} />
      {selectedId && detail.data && (
        <OrderDetailSheet
          order={detail.data as any}
          paymentInstruction={String((context.data as any)?.paymentInstruction || "").trim().replace(/管理员/g, "收款方")}
          isAdmin={false}
          onClose={() => setSelectedId(null)}
          onRefresh={() => {
            void detail.refetch();
            void orders.refetch();
          }}
          onSubmitProof={() => {
            const orderId = Number((detail.data as any)?.id || selectedId);
            setSelectedId(null);
            go(`/payment?orderId=${orderId}`);
          }}
        />
      )}
    </div>
  );
}

function OrderRow({ order, onClick }: { order: any; onClick: () => void }) {
  const tone = statusTone(order.status);
  return (
    <button
      onClick={onClick}
      className="w-full rounded-[20px] border p-4 text-left"
      style={{ background: C.paper, borderColor: C.line }}
    >
      <div className="flex justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            {order.orderNo}
          </div>
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            {dateTime(order.createdAt)}
          </div>
        </div>
        <span
          className="h-fit rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{ color: tone.color, background: tone.bg }}
        >
          {tone.text}
        </span>
      </div>
      <div
        className="mt-4 flex items-center justify-between border-t pt-3 text-sm"
        style={{ borderColor: C.line }}
      >
        <span style={{ color: C.muted }}>订单金额</span>
        <strong style={{ color: C.ink }}>{money(order.totalAmount)}</strong>
      </div>
    </button>
  );
}

function CheckoutPage({ go }: { go: (path?: string) => void }) {
  const products = trpc.zidingCommerce.listProducts.useQuery();
  const addressesQuery = trpc.zidingCommerce.listAddresses.useQuery();
  const utils = trpc.useUtils();
  const rawCart = (() => {
    try {
      return JSON.parse(localStorage.getItem("ziding-cart") || "{}");
    } catch {
      return {};
    }
  })() as Cart;
  const rows = useMemo(
    () =>
      (products.data || [])
        .filter((product: any) => rawCart[product.id])
        .map((product: any) => ({
          ...product,
          quantity: Number(rawCart[product.id] || 0),
        })),
    [products.data, rawCart]
  );
  const cartItems = rows
    .filter((row: any) => row.quantity > 0)
    .map((row: any) => ({
      productId: Number(row.id),
      quantity: Number(row.quantity),
    }));
  const total = rows.reduce(
    (sum: number, row: any) =>
      sum + Number(row.price || 0) * Number(row.quantity || 0),
    0
  );
  const addresses = (addressesQuery.data || []) as any[];
  const [picked, setPicked] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [form, setForm] = useState({
    receiverName: "",
    receiverPhone: "",
    province: "",
    city: "",
    district: "",
    detail: "",
    labelName: "常用地址",
    isDefault: true,
  });
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  useEffect(() => {
    if (!showAddressForm && !picked && addresses.length)
      setPicked(
        addresses.find(address => address.isDefault)?.id ||
          addresses[0]?.id ||
          null
      );
  }, [addresses, picked, showAddressForm]);
  const saveAddress = trpc.zidingCommerce.saveAddress.useMutation({
    onSuccess: async result => {
      setPicked(result.id);
      setShowAddressForm(false);
      setAddressError("");
      await utils.zidingCommerce.listAddresses.invalidate();
    },
    onError: saveError =>
      setAddressError(saveError.message || "地址保存失败，请稍后重试"),
  });
  const createOrder = trpc.zidingCommerce.createOrder.useMutation({
    onSuccess: result => {
      localStorage.removeItem("ziding-cart");
      go(`/payment?orderId=${result.id}`);
    },
    onError: createError => {
      const message = createError.message || "订单创建失败，请稍后重试";
      const isTechnicalFailure =
        createError.data?.code === "INTERNAL_SERVER_ERROR" ||
        /beginTransaction|rollback|commit|is not a function|ECONN/i.test(
          message
        );
      setError(isTechnicalFailure ? "订单服务暂时不可用，请稍后重试" : message);
    },
  });
  const update = (key: string, value: string) =>
    setForm(old => ({ ...old, [key]: value }));
  const isDirectRegion = DIRECT_DISTRICT_REGIONS.has(form.province);
  const cityOptions = form.province ? getZidingCities(form.province) : [];
  const districtOptions = form.province
    ? getZidingDistricts(
        form.province,
        isDirectRegion ? form.province : form.city
      )
    : [];
  const canSaveAddress = Boolean(
    form.receiverName.trim() &&
      form.receiverPhone.trim() &&
      form.province &&
      form.city &&
      form.detail.trim()
  );
  const hasSavedAddresses = addresses.length > 0;
  const needsNewAddress = showAddressForm || !hasSavedAddresses;
  const selectClass =
    "w-full rounded-xl border px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-45";
  const selectStyle = {
    borderColor: C.line,
    background: "#FFFEFC",
    color: C.ink,
  };
  const confirmOrder = () => {
    setError("");
    if (!cartItems.length) {
      setError("购物车为空，请先返回首页选择商品");
      return;
    }
    if (!picked) {
      setError("请先选择或保存收货信息");
      return;
    }
    createOrder.mutate({ addressId: picked, items: cartItems });
  };
  return (
    <div className="min-h-screen pb-7" style={{ background: C.canvas }}>
      <Header title="确认订单" back={() => go("")} />
      <main className="mx-auto max-w-md px-4 pb-6 pt-4">
        <CheckoutProgress current={1} />
        <section
          className="rounded-[22px] border p-4"
          style={{ background: C.paper, borderColor: C.line }}
        >
          <div className="flex items-center gap-2">
            <Package size={17} style={{ color: C.plum }} />
            <h1 className="text-base font-bold" style={{ color: C.ink }}>
              购买商品
            </h1>
          </div>
          <div className="mt-3 space-y-3">
            {products.isLoading ? (
              <div
                className="py-4 text-center text-sm"
                style={{ color: C.muted }}
              >
                正在核对商品信息…
              </div>
            ) : rows.length ? (
              rows.map((row: any) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                  style={{ borderColor: C.line }}
                >
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl"
                    style={{ background: "#F1ECE9" }}
                  >
                    {row.imageUrl ? (
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package size={19} style={{ color: C.muted }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm font-semibold"
                      style={{ color: C.ink }}
                    >
                      {row.name}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: C.muted }}>
                      {row.subtitle || "商品信息以实际发货为准"}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: C.muted }}>
                      {money(row.price)} × {row.quantity}
                    </div>
                  </div>
                  <strong className="text-sm" style={{ color: C.ink }}>
                    {money(Number(row.price) * Number(row.quantity))}
                  </strong>
                </div>
              ))
            ) : (
              <div
                className="py-4 text-center text-sm"
                style={{ color: C.muted }}
              >
                购物车为空，请返回首页重新选择商品。
              </div>
            )}
          </div>
          <div
            className="mt-4 flex items-center justify-between border-t pt-3"
            style={{ borderColor: C.line }}
          >
            <span className="text-sm" style={{ color: C.muted }}>
              订单合计
            </span>
            <strong className="text-xl" style={{ color: C.ink }}>
              {money(total)}
            </strong>
          </div>
        </section>
        <section
          className="mt-4 rounded-[22px] border p-4"
          style={{ background: C.paper, borderColor: C.line }}
        >
          <div className="flex items-center gap-2">
            <MapPin size={17} style={{ color: C.plum }} />
            <h2 className="text-base font-bold" style={{ color: C.ink }}>
              收货信息
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            请确认收件人、联系电话和详细地址，订单创建后用于安排发货。
          </p>
          {(error || addressError) && (
            <div
              className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5"
              style={{
                color: C.danger,
                borderColor: "#EACACA",
                background: "#FFF8F8",
              }}
            >
              {error || addressError}
            </div>
          )}
          {!needsNewAddress && (
            <div className="mt-4 space-y-2">
              {addresses.map(address => (
                <button
                  key={address.id}
                  onClick={() => setPicked(address.id)}
                  className="w-full rounded-xl border p-3 text-left"
                  style={{
                    background: picked === address.id ? "#F4EEF4" : C.paper,
                    borderColor: picked === address.id ? C.plum : C.line,
                  }}
                >
                  <div
                    className="text-sm font-semibold"
                    style={{ color: C.ink }}
                  >
                    {address.receiverName}　{address.receiverPhone}
                  </div>
                  <div
                    className="mt-1 text-xs leading-5"
                    style={{ color: C.muted }}
                  >
                    {address.province}
                    {address.city}
                    {address.district}
                    {address.detail}
                  </div>
                </button>
              ))}
            </div>
          )}
          {needsNewAddress && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label>收件人</Label>
                <TextInput
                  value={form.receiverName}
                  onChange={event => update("receiverName", event.target.value)}
                  placeholder="请输入收件人姓名"
                />
              </div>
              <div>
                <Label>联系电话</Label>
                <TextInput
                  type="tel"
                  value={form.receiverPhone}
                  onChange={event =>
                    update("receiverPhone", event.target.value)
                  }
                  placeholder="请输入手机号码"
                />
              </div>
              <div className="col-span-2">
                <Label>所在地区</Label>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={form.province}
                    onChange={event => {
                      const province = event.target.value;
                      setForm(old => ({
                        ...old,
                        province,
                        city: DIRECT_DISTRICT_REGIONS.has(province)
                          ? province
                          : "",
                        district: "",
                      }));
                    }}
                    className={selectClass}
                    style={selectStyle}
                  >
                    <option value="">省 / 直辖市 / 自治区</option>
                    {ZIDING_REGIONS.map(region => (
                      <option key={region.n} value={region.n}>
                        {region.n}
                      </option>
                    ))}
                  </select>
                  {!isDirectRegion && (
                    <select
                      value={form.city}
                      disabled={!form.province}
                      onChange={event =>
                        setForm(old => ({
                          ...old,
                          city: event.target.value,
                          district: "",
                        }))
                      }
                      className={selectClass}
                      style={selectStyle}
                    >
                      <option value="">市 / 地区</option>
                      {cityOptions.map(city => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={form.district}
                    disabled={!form.province || (!isDirectRegion && !form.city)}
                    onChange={event => update("district", event.target.value)}
                    className={`${selectClass} ${isDirectRegion ? "" : "col-span-2"}`}
                    style={selectStyle}
                  >
                    <option value="">区 / 县（选填）</option>
                    {districtOptions.map(district => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="col-span-2">
                <Label>详细地址</Label>
                <TextInput
                  value={form.detail}
                  onChange={event => update("detail", event.target.value)}
                  placeholder="街道、门牌号、楼栋和房间号"
                />
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {hasSavedAddresses && (
              <Button
                kind="quiet"
                onClick={() => {
                  setAddressError("");
                  setShowAddressForm(value => !value);
                }}
                className="flex-1"
              >
                {needsNewAddress ? "选择已有地址" : "新增收货地址"}
              </Button>
            )}
            {needsNewAddress && (
              <Button
                onClick={() => {
                  setAddressError("");
                  saveAddress.mutate(form);
                }}
                disabled={!canSaveAddress || saveAddress.isPending}
                className="flex-1"
              >
                <Save size={15} />
                {saveAddress.isPending ? "保存中…" : "保存地址"}
              </Button>
            )}
          </div>
        </section>
        <div
          className="sticky bottom-3 mt-5 rounded-2xl border p-3 shadow-lg"
          style={{
            background: "rgba(255,254,252,.97)",
            borderColor: C.line,
            backdropFilter: "blur(14px)",
          }}
        >
          <Button
            className="w-full"
            disabled={
              !cartItems.length ||
              !picked ||
              createOrder.isPending ||
              products.isLoading
            }
            onClick={confirmOrder}
          >
            {createOrder.isPending
              ? "正在确认订单…"
              : `确认订单 · ${money(total)}`}
            <ChevronRight size={16} />
          </Button>
        </div>
      </main>
    </div>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择"));
    reader.readAsDataURL(file);
  });
}

function PaymentProofPage({ go }: { go: (path?: string) => void }) {
  const orderId = Number(
    new URLSearchParams(window.location.search).get("orderId") || 0
  );
  const detail = trpc.zidingCommerce.myOrderDetail.useQuery(
    { id: orderId },
    { enabled: Number.isInteger(orderId) && orderId > 0 }
  );
  const context = trpc.zidingCommerce.myContext.useQuery();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const localPreviewUrls = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);
  useEffect(() => () => { localPreviewUrls.forEach(url => URL.revokeObjectURL(url)); }, [localPreviewUrls]);
  const submitProofs = trpc.zidingCommerce.submitPaymentProofs.useMutation({
    onSuccess: () => {
      localStorage.removeItem("ziding-cart");
      go("/orders");
    },
    onError: submitError =>
      setError(submitError.message || "付款凭证提交失败，请稍后重试"),
  });
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("单张付款凭证不能超过 10 兆");
      return;
    }
    if (files.length >= remaining) {
      setError(`本订单还可提交 ${Math.max(0, remaining - files.length)} 张付款凭证`);
      return;
    }
    setError("");
    setFiles(items => [...items, file]);
  };
  if (!orderId || !Number.isInteger(orderId))
    return (
      <div className="min-h-screen" style={{ background: C.canvas }}>
        <Header title="提交转账凭证" back={() => go("/orders")} />
        <main className="mx-auto max-w-md px-4 pt-6">
          <Panel className="py-10 text-center">
            <ReceiptText
              className="mx-auto mb-3"
              size={26}
              style={{ color: C.gold }}
            />
            <div className="font-semibold" style={{ color: C.ink }}>
              未找到待付款订单
            </div>
            <Button className="mt-4" onClick={() => go("/orders")}>
              查看我的订单
            </Button>
          </Panel>
        </main>
      </div>
    );
  if (detail.isLoading)
    return (
      <div className="min-h-screen" style={{ background: C.canvas }}>
        <Header title="提交转账凭证" back={() => go("/orders")} />
        <div className="py-20 text-center text-sm" style={{ color: C.muted }}>
          正在加载订单…
        </div>
      </div>
    );
  if (!detail.data)
    return (
      <div className="min-h-screen" style={{ background: C.canvas }}>
        <Header title="提交转账凭证" back={() => go("/orders")} />
        <main className="mx-auto max-w-md px-4 pt-6">
          <Panel className="py-10 text-center">
            <div className="font-semibold" style={{ color: C.ink }}>
              订单暂不可查看
            </div>
            <Button className="mt-4" onClick={() => go("/orders")}>
              返回订单列表
            </Button>
          </Panel>
        </main>
      </div>
    );
  const order = detail.data as any;
  const paymentInstruction = String((context.data as any)?.paymentInstruction || "").trim().replace(/管理员/g, "收款方");
  const remaining = Math.max(0, 3 - Number(order.proofs?.length || 0));
  const canSubmit =
    ["awaiting_proof", "proof_rejected"].includes(order.status) &&
    remaining > 0;
  const canAddMore = canSubmit && files.length < remaining;
  const submit = async () => {
    setError("");
    if (!files.length) {
      setError("请先选择至少一张转账凭证图片");
      return;
    }
    if (files.length > remaining) {
      setError(`本订单还可提交 ${remaining} 张付款凭证`);
      return;
    }
    try {
      const images = await Promise.all(files.map(fileToDataUrl));
      submitProofs.mutate({
        orderId,
        images,
        transferNote: transferNote.trim() || undefined,
      });
    } catch (readError: any) {
      setError(readError?.message || "图片读取失败，请重新选择");
    }
  };
  return (
    <div className="min-h-screen pb-7" style={{ background: C.canvas }}>
      <Header title="提交转账凭证" back={() => go("/orders")} />
      <main className="mx-auto max-w-md px-4 pb-6 pt-4">
        <CheckoutProgress current={2} />
        <section
          className="rounded-[22px] border p-5"
          style={{ background: C.paper, borderColor: C.line }}
        >
          <div
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "#F2EAF0", color: C.plum }}
          >
            <ReceiptText size={22} />
          </div>
          <h1 className="mt-4 text-xl font-bold" style={{ color: C.ink }}>
            订单已确认
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
            请在完成汇款后提交清晰的转账凭证。保存成功后，可在“我的订单”中查看处理状态。
          </p>
          <div
            className="mt-4 border-y"
            style={{ borderColor: C.line }}
          >
            {order.items.slice(0, 2).map((item: any) => <div key={item.id} className="flex items-center gap-3 py-3 first:pt-3" style={{ borderBottom: "1px solid " + C.line }}>
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: "#F1ECE9" }}>{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={22} style={{ color: C.muted }} />}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" style={{ color: C.ink }}>{item.name}</div>{item.subtitle && <div className="mt-1 truncate text-xs" style={{ color: C.muted }}>{item.subtitle}</div>}<div className="mt-1 text-xs" style={{ color: C.muted }}>数量 × {item.quantity}</div></div>
              <strong className="shrink-0 text-sm" style={{ color: C.ink }}>{money(item.lineTotal)}</strong>
            </div>)}
            {order.items.length > 2 && <div className="py-2 text-right text-[11px]" style={{ color: C.muted }}>另有 {order.items.length - 2} 种商品</div>}
            <div className="flex items-center justify-between py-3 text-sm"><span style={{ color: C.muted }}>共 {order.items.reduce((total: number, item: any) => total + Number(item.quantity || 0), 0)} 件商品</span><div className="flex items-baseline gap-2"><span style={{ color: C.muted }}>应付</span><strong className="text-base" style={{ color: C.ink }}>{money(order.totalAmount)}</strong></div></div>
          </div>
          <div className="mt-2 text-[10px]" style={{ color: C.muted }}>订单编号 {order.orderNo}</div>
        </section>
        {paymentInstruction && (<section
          className="mt-4 rounded-[22px] border p-4"
          style={{ background: C.paper, borderColor: C.line }}
        >
          <div className="flex items-center gap-2">
            <Wallet size={17} style={{ color: C.plum }} />
            <h2 className="text-base font-bold" style={{ color: C.ink }}>
              汇款说明
            </h2>
          </div>
          <p
            className="mt-3 whitespace-pre-wrap text-sm leading-6"
            style={{ color: C.muted }}
          >
            {paymentInstruction}
          </p>
        </section>)}
        <section
          className="mt-4 rounded-[22px] border p-4"
          style={{ background: C.paper, borderColor: C.line }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold" style={{ color: C.ink }}>
                转账凭证
              </h2>
              <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                支持 JPG、PNG、WebP，单张不超过 10MB；最多 3 张。
              </p>
            </div>
          </div>
          {error && (
            <div
              className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5"
              style={{
                color: C.danger,
                borderColor: "#EACACA",
                background: "#FFF8F8",
              }}
            >
              {error}
            </div>
          )}
          {canSubmit ? (
            <>
              {files.length === 0 ? (
                <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-7 text-center" style={{ borderColor: "#D7BBC8", background: "#FCF6F7", color: C.plum }}>
                  <ImagePlus size={20} />
                  <span className="text-sm font-semibold">选择转账凭证图片</span>
                  <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} />
                </label>
              ) : (
                <>
                  <div className="mt-4 space-y-3">
                    {files.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="relative aspect-[4/3] overflow-hidden rounded-2xl border" style={{ borderColor: C.line, background: "#F1ECE9" }}>
                      <img src={localPreviewUrls[index]} alt={`转账凭证 ${index + 1}`} className="h-full w-full object-contain" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-10">
                        <span className="truncate text-xs font-semibold text-white">凭证 {index + 1}</span>
                        <div className="flex items-center gap-2"><button onClick={() => setPreviewIndex(index)} className="grid h-8 w-8 place-items-center rounded-full bg-white/90" style={{ color: C.plum }} aria-label={`放大查看凭证 ${index + 1}`}><ZoomIn size={16} /></button><button onClick={() => { setFiles(items => items.filter((_, itemIndex) => itemIndex !== index)); setPreviewIndex(current => current === index ? null : current !== null && current > index ? current - 1 : current); }} className="grid h-8 w-8 place-items-center rounded-full bg-white/90" style={{ color: C.muted }} aria-label={`移除凭证 ${index + 1}`}><X size={15} /></button></div>
                      </div>
                    </div>)}
                    {canAddMore && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-center" style={{ borderColor: "#D7BBC8", background: "#FCF6F7", color: C.plum }}><Plus size={19} /><span className="text-sm font-semibold">继续添加转账凭证</span><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} /></label>}
                  </div>
                  <p className="mt-2 text-[11px]" style={{ color: C.muted }}>{canAddMore ? `已添加 ${files.length} 张，还可添加 ${remaining - files.length} 张` : `已添加 ${files.length} 张`}</p>
                </>
              )}
              <div className="mt-4">
                <Label>转账备注 / 流水号（选填）</Label>
                <TextInput
                  value={transferNote}
                  onChange={event => setTransferNote(event.target.value)}
                  maxLength={200}
                  placeholder="例如：付款人姓名、转账流水号后四位"
                />
              </div>
              <Button
                className="mt-4 w-full"
                disabled={!files.length || submitProofs.isPending}
                onClick={submit}
              >
                {submitProofs.isPending ? "正在提交凭证…" : "提交凭证"}
              </Button>
            </>
          ) : (
            <div
              className="mt-4 rounded-xl border px-3 py-4 text-sm leading-6"
              style={{
                borderColor: C.line,
                background: "#FFFEFC",
                color: C.muted,
              }}
            >
              {order.status === "proof_submitted"
                ? "付款凭证已提交，等待收款确认。"
                : "当前订单暂不需要继续提交付款凭证。"}
              <Button
                kind="quiet"
                className="mt-3 w-full"
                onClick={() => go("/orders")}
              >
                查看订单状态
              </Button>
            </div>
          )}
        </section>
        <div
          className="mt-4 text-center text-[11px] leading-5"
          style={{ color: C.muted }}
        >
          付款凭证仅供订单本人及授权人员查看。
        </div>
      {previewIndex !== null && localPreviewUrls[previewIndex] && <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "rgba(20,13,20,.94)" }} onClick={() => setPreviewIndex(null)}><div className="flex items-center justify-between px-5 pb-3 pt-5"><div className="text-sm font-semibold text-white">转账凭证 {previewIndex + 1}</div><button onClick={() => setPreviewIndex(null)} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white" aria-label="关闭大图"><X size={19} /></button></div><div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-8" onClick={event => event.stopPropagation()}><img src={localPreviewUrls[previewIndex]} alt={`转账凭证 ${previewIndex + 1} 大图`} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" /></div></div>}
      </main>
    </div>
  );
}

function OrderDetailSheet({
  order,
  paymentInstruction,
  isAdmin,
  onClose,
  onRefresh,
  onSubmitProof,
}: {
  order: any;
  paymentInstruction: string;
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSubmitProof: () => void;
}) {
  const cancel = trpc.zidingCommerce.cancelMyOrder.useMutation({
    onSuccess: onRefresh,
  });
  const receipt = trpc.zidingCommerce.confirmReceipt.useMutation({
    onSuccess: onRefresh,
  });
  const utils = trpc.useUtils();
  const [proofUrls, setProofUrls] = useState<Record<number, string>>({});
  const [previewProof, setPreviewProof] = useState<{
    id: number;
    url: string;
  } | null>(null);
  const [proofError, setProofError] = useState("");
  const proofKey = (order.proofs || []).map((proof: any) => proof.id).join(",");
  const getProofUrl = async (proofId: number, download = false) => {
    const result = await utils.zidingCommerce.getPaymentProofUrl.fetch({
      proofId,
      download,
    });
    return result.url;
  };
  useEffect(() => {
    let active = true;
    const proofs = order.proofs || [];
    setProofUrls({});
    setProofError("");
    if (!proofs.length)
      return () => {
        active = false;
      };
    Promise.all(
      proofs.map(async (proof: any) => {
        try {
          return [
            Number(proof.id),
            await getProofUrl(Number(proof.id)),
          ] as const;
        } catch {
          return null;
        }
      })
    ).then(items => {
      if (!active) return;
      setProofUrls(
        Object.fromEntries(items.filter(Boolean) as Array<[number, string]>)
      );
    });
    return () => {
      active = false;
    };
  }, [order.id, proofKey]);
  const openProof = async (proofId: number) => {
    try {
      const url = proofUrls[proofId] || (await getProofUrl(proofId));
      setProofUrls(old => ({ ...old, [proofId]: url }));
      setPreviewProof({ id: proofId, url });
    } catch (error: any) {
      setProofError(error.message || "凭证打开失败，请稍后重试");
    }
  };
  const downloadProof = async (proofId: number) => {
    try {
      window.open(
        await getProofUrl(proofId, true),
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error: any) {
      setProofError(error.message || "凭证下载失败，请稍后重试");
    }
  };
  const tone = statusTone(order.status);
  const canSubmitProof =
    !isAdmin &&
    ["awaiting_proof", "proof_rejected"].includes(order.status) &&
    order.proofs.length < 3;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/35"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] p-5"
        onClick={e => e.stopPropagation()}
        style={{ background: C.canvas }}
      >
        <div className="flex justify-between">
          <div>
            <div className="text-lg font-bold" style={{ color: C.ink }}>
              订单详情
            </div>
            <div className="mt-1 text-xs" style={{ color: C.muted }}>
              {order.orderNo}
            </div>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <span
          className="mt-3 inline-block rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{ color: tone.color, background: tone.bg }}
        >
          {order.statusLabel}
        </span>
        <div className="mt-4 space-y-2">
          {order.items.map((item: any) => (
            <div
              key={item.id}
              className="flex justify-between rounded-xl border p-3"
              style={{ background: C.paper, borderColor: C.line }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: C.ink }}>
                  {item.name}
                </div>
                <div className="mt-1 text-xs" style={{ color: C.muted }}>
                  {money(item.unitPrice)} × {item.quantity}
                </div>
              </div>
              <strong className="text-sm" style={{ color: C.ink }}>
                {money(item.lineTotal)}
              </strong>
            </div>
          ))}
        </div>
        <section
          className="mt-3 rounded-[22px] border p-4"
          style={{ background: "#FCF6F7", borderColor: "#E6CBD5" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: "#F0DFE6", color: C.plum }}
              >
                <ReceiptText size={16} />
              </span>
              <div>
                <div className="text-sm font-semibold" style={{ color: C.ink }}>
                  付款凭证
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: C.muted }}>
                  {order.proofs.length
                    ? `已上传 ${order.proofs.length} / 3 张`
                    : "完成付款后请上传凭证"}
                </div>
              </div>
            </div>
            {canSubmitProof && (
              <Button onClick={onSubmitProof} className="shrink-0">
                <ImagePlus size={14} />
                提交凭证
              </Button>
            )}
          </div>
          {!isAdmin &&
            ["awaiting_proof", "proof_rejected"].includes(order.status) &&
            paymentInstruction && (
              <div
                className="mt-3 rounded-xl border px-3 py-2.5 text-[11px] leading-5"
                style={{
                  borderColor: "#E6CBD5",
                  background: "rgba(255,255,255,.72)",
                  color: C.muted,
                }}
              >
                <strong style={{ color: C.ink }}>付款说明</strong>
                <br />
                {paymentInstruction}
              </div>
            )}
          {proofError && (
            <div
              className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5"
              style={{
                color: C.danger,
                borderColor: "#EACACA",
                background: "#FFF8F8",
              }}
            >
              {proofError}
            </div>
          )}
          {order.proofs.length ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {order.proofs.map((proof: any, index: number) => (
                  <div
                    key={proof.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border"
                    style={{ background: "#F0EAEB", borderColor: "#E1CFD6" }}
                  >
                    {proofUrls[proof.id] ? (
                      <img
                        src={proofUrls[proof.id]}
                        alt={`付款凭证 ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="grid h-full place-items-center text-[10px]"
                        style={{ color: C.muted }}
                      >
                        加载凭证…
                      </div>
                    )}
                    <button
                      onClick={() => openProof(Number(proof.id))}
                      className="absolute inset-0 grid place-items-center bg-black/5"
                      aria-label={`放大查看付款凭证 ${index + 1}`}
                    >
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm"
                        style={{ color: C.plum }}
                      >
                        <ZoomIn size={17} />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px]" style={{ color: C.muted }}>
                点击放大镜查看大图并保存。
              </div>
            </>
          ) : (
            <div
              className="mt-3 rounded-xl border border-dashed px-3 py-4 text-center text-xs leading-5"
              style={{ borderColor: "#DCC5CE", color: C.muted }}
            >
              {canSubmitProof
                ? "尚未提交付款凭证，请前往独立页面完成上传。"
                : "暂未上传付款凭证"}
            </div>
          )}
          {!isAdmin &&
            order.proofs.length >= 3 &&
            ["awaiting_proof", "proof_rejected"].includes(order.status) && (
              <div className="mt-2 text-[10px]" style={{ color: C.muted }}>
                已达到单笔订单最多 3 张凭证的上限。
              </div>
            )}
        </section>
        <Panel className="mt-3">
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            收货信息
          </div>
          <div className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            {order.receiver.name}　{order.receiver.phone}
            <br />
            {order.receiver.province}
            {order.receiver.city}
            {order.receiver.district}
            {order.receiver.detail}
          </div>
        </Panel>
        {order.shippingCompany && (
          <Panel className="mt-3">
            <div className="flex gap-2">
              <Truck size={17} style={{ color: C.gold }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: C.ink }}>
                  {order.shippingCompany}
                </div>
                <div className="mt-1 text-xs" style={{ color: C.muted }}>
                  {order.trackingNo}
                </div>
              </div>
            </div>
          </Panel>
        )}
        <Panel className="mt-3">
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            订单进度
          </div>
          <div className="mt-3 space-y-3">
            {order.timeline.map((item: any, index: number) => (
              <div key={`${item.type}-${index}`} className="flex gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      index === order.timeline.length - 1 ? C.gold : C.line,
                  }}
                />
                <div>
                  <div className="text-xs font-medium" style={{ color: C.ink }}>
                    {item.text}
                  </div>
                  <div
                    className="mt-0.5 text-[10px]"
                    style={{ color: C.muted }}
                  >
                    {dateTime(item.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        {!isAdmin && (
          <div className="mt-4 flex gap-2">
            {["awaiting_proof", "proof_rejected"].includes(order.status) && (
              <Button
                kind="quiet"
                onClick={() => {
                  if (confirm("确认取消这笔订单吗？"))
                    cancel.mutate({ id: order.id });
                }}
              >
                取消订单
              </Button>
            )}
            {order.status === "shipped" && (
              <Button
                onClick={() => {
                  if (confirm("确认已经收到商品吗？"))
                    receipt.mutate({ id: order.id });
                }}
              >
                确认收货
              </Button>
            )}
          </div>
        )}
      </div>
      {previewProof && (
        <div
          className="fixed inset-0 z-[70] flex flex-col"
          style={{ background: "rgba(20,13,20,.94)" }}
          onClick={() => setPreviewProof(null)}
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div className="text-sm font-semibold text-white">付款凭证大图</div>
            <button
              onClick={() => setPreviewProof(null)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white"
              aria-label="关闭大图"
            >
              <X size={19} />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3"
            onClick={event => event.stopPropagation()}
          >
            <img
              src={previewProof.url}
              alt="付款凭证大图"
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
          <div className="flex justify-center px-5 pb-7 pt-2">
            <button
              onClick={() => downloadProof(previewProof.id)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold"
              style={{ color: C.ink }}
            >
              <Download size={16} />
              保存大图
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileApp({ go }: { go: (path?: string) => void }) { const context = trpc.zidingCommerce.myContext.useQuery(); const notices = trpc.zidingCommerce.listNotifications.useQuery(); return <div className="min-h-screen pb-24" style={{ background: C.canvas }}><Header title="我的" back={() => go("")} /><main className="mx-auto max-w-md space-y-4 px-4 pt-4"><Panel><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full text-white" style={{ background: C.ink }}><UserRound size={20} /></div><div><div className="font-bold" style={{ color: C.ink }}>{context.data?.member.tier === "senior" ? "高级会员" : "初级会员"}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>紫鼎商业联盟会员</div></div></div></Panel><Panel><div className="flex items-center justify-between"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>本月积分</div><div className="mt-2 text-2xl font-bold" style={{ color: C.ink }}>{Number(context.data?.points.earned || 0).toLocaleString()}</div></div><div className="text-right text-xs leading-5" style={{ color: C.muted }}>有效订购额 {money(context.data?.points.qualifiedAmount)}<br />当前系数 {Number(context.data?.points.currentMultiplier || 1).toFixed(2)}×</div></div></Panel><Panel><div className="mb-3 flex justify-between"><h3 className="text-sm font-semibold" style={{ color: C.ink }}>消息通知</h3><Bell size={16} style={{ color: C.gold }} /></div>{(notices.data || []).length ? <div className="space-y-3">{(notices.data || []).slice(0,8).map((notice: any) => <div key={notice.id} className="border-t pt-3" style={{ borderColor: C.line }}><div className="text-xs font-semibold" style={{ color: C.ink }}>{notice.title}</div><div className="mt-1 text-[11px] leading-5" style={{ color: C.muted }}>{notice.content}</div></div>)}</div> : <div className="text-xs" style={{ color: C.muted }}>暂时没有新消息。</div>}</Panel><Button kind="quiet" onClick={() => go("/orders")} className="w-full"><ReceiptText size={15} />查看我的订单</Button></main><BottomNav active="me" go={go} /></div>; }

type AdminWorkspaceTab = "orders" | "points" | "members" | "products";
function AdminApp({ onExit }: { go: (path?: string) => void; onExit: () => void }) {
  const requestedTab = new URLSearchParams(window.location.search).get("tab") || "orders";
  const allowedTabs: AdminWorkspaceTab[] = ["orders", "points", "members", "products"];
  const [tab, setTab] = useState<AdminWorkspaceTab>(allowedTabs.includes(requestedTab as AdminWorkspaceTab) ? requestedTab as AdminWorkspaceTab : "orders");
  const tabs: Array<{ value: AdminWorkspaceTab; label: string }> = [
    { value: "orders", label: "订单管理" },
    { value: "products", label: "商品管理" },
    { value: "points", label: "积分管理" },
    { value: "members", label: "会员管理" },
  ];
  return <div className="min-h-screen" style={{ background: C.canvas }}>
    <main className="mx-auto max-w-md px-4 py-5">
      <nav className="grid grid-cols-5 overflow-hidden rounded-[14px] border" style={{ borderColor: C.line }}>
        {tabs.map(({ value, label }, index) => <button key={value} onClick={() => setTab(value)} className={`min-h-11 px-1 text-center text-[12px] font-semibold ${index ? "border-l" : ""}`} style={{ borderColor: C.line, background: tab === value ? C.plum : C.paper, color: tab === value ? "white" : C.ink }}>{label}</button>)}
        <button onClick={onExit} className="min-h-11 border-l px-1 text-center text-[12px] font-semibold" style={{ borderColor: C.line, background: C.paper, color: C.ink }}>返回</button>
      </nav>
      <section className="pt-5">
        {tab === "orders" && <AdminOrders />}
        {tab === "points" && <AdminPoints />}
        {tab === "members" && <AdminMembers />}
        {tab === "products" && <AdminProducts />}
      </section>
    </main>
  </div>;
}

function AdminOrders() {
  const [status, setStatus] = useState("all");
  const [id, setId] = useState<number | null>(null);
  const [reviewAction, setReviewAction] = useState<"fulfill" | "ship" | "reject" | null>(null);
  const [reviewRemark, setReviewRemark] = useState("");
  const [shippingForm, setShippingForm] = useState({ shippingCompany: "", trackingNo: "" });
  const [reviewError, setReviewError] = useState("");
  const [feedback, setFeedback] = useState("");
  const list = trpc.zidingCommerce.adminListOrders.useQuery({ status });
  const detail = trpc.zidingCommerce.adminOrderDetail.useQuery({ id: id! }, { enabled: !!id });
  const closeOrder = () => {
    setId(null);
    setReviewAction(null);
    setReviewRemark("");
    setShippingForm({ shippingCompany: "", trackingNo: "" });
    setReviewError("");
  };
  const rejectProof = trpc.zidingCommerce.adminReviewOrder.useMutation({
    onSuccess: () => {
      setFeedback("已驳回付款凭证，会员可补充后重新上传。");
      setStatus("all");
      closeOrder();
      void list.refetch();
    },
    onError: (error) => setReviewError(error.message || "驳回失败，请稍后重试"),
  });
  const fulfill = trpc.zidingCommerce.adminConfirmAndShipOrder.useMutation({
    onSuccess: () => {
      setFeedback("订单已发货。");
      setStatus("shipped");
      closeOrder();
      void list.refetch();
    },
    onError: (error) => setReviewError(error.message || "确认收款并发货失败，请稍后重试"),
  });
  const utils = trpc.useUtils();
  const proof = async (proofId: number, download = false) => {
    try {
      const result = await utils.zidingCommerce.getPaymentProofUrl.fetch({ proofId, download });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      alert(error.message || "凭证打开失败");
    }
  };
  const openReview = (action: "fulfill" | "ship" | "reject") => {
    setReviewAction(action);
    setReviewError("");
    setReviewRemark(action === "reject" ? "请补充清晰付款凭证" : "");
    setShippingForm({ shippingCompany: "", trackingNo: "" });
  };
  const submitReview = () => {
    if (!detail.data || !reviewAction) return;
    if (reviewAction === "fulfill" || reviewAction === "ship") {
      fulfill.mutate({ id: detail.data.id, shippingCompany: shippingForm.shippingCompany, trackingNo: shippingForm.trackingNo, remark: "" });
    } else {
      rejectProof.mutate({ id: detail.data.id, action: "reject", remark: reviewRemark });
    }
  };
  const isSubmitting = rejectProof.isPending || fulfill.isPending;
  const canSubmit = reviewAction !== "reject"
    ? Boolean(shippingForm.shippingCompany.trim() && shippingForm.trackingNo.trim())
    : Boolean(reviewRemark.trim());

  return <div>
    <div className="mb-3 flex gap-2 overflow-x-auto">{[["all", "全部"], ["awaiting_proof", "待凭证"], ["proof_submitted", "待处理"], ["shipped", "已发货"]].map(([key, label]) => <button key={key} onClick={() => setStatus(key)} className="shrink-0 rounded-full px-3 py-1.5 text-xs" style={{ background: status === key ? C.ink : C.paper, color: status === key ? "white" : C.muted, border: `1px solid ${status === key ? C.ink : C.line}` }}>{label}</button>)}</div>
    {feedback && <div className="mb-3 flex items-center justify-between rounded-xl border px-3 py-2 text-xs" style={{ color: C.success, borderColor: "#B9DDC4", background: "#F4FBF6" }}><span>{feedback}</span><button onClick={() => setFeedback("")} aria-label="关闭提示"><X size={15} /></button></div>}
    <div className="space-y-3">{(list.data || []).map((order: any) => <button key={order.id} onClick={() => { setFeedback(""); setId(order.id); }} className="w-full rounded-[20px] border p-4 text-left" style={{ background: C.paper, borderColor: C.line }}><div className="flex justify-between"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{order.orderNo}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{order.user.name}　{money(order.totalAmount)}</div></div><span className="text-xs" style={{ color: statusTone(order.status).color }}>{order.statusLabel}</span></div></button>)}</div>
    {id && detail.data && <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={closeOrder}><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}><div className="flex justify-between"><div><div className="text-lg font-bold" style={{ color: C.ink }}>订单处理</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{detail.data.orderNo}</div></div><button onClick={closeOrder}><X size={20} /></button></div><div className="mt-4 space-y-2">{detail.data.items.map((item: any) => <div key={item.id} className="rounded-xl border p-3 text-sm" style={{ background: C.paper, borderColor: C.line }}>{item.name} × {item.quantity}<span className="float-right">{money(item.lineTotal)}</span></div>)}</div><Panel className="mt-3"><div className="text-sm font-semibold" style={{ color: C.ink }}>付款凭证</div><div className="mt-3 flex flex-wrap gap-2">{detail.data.proofs.map((proofItem: any) => <div key={proofItem.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: C.line }}><Button kind="quiet" className="border-0 p-0 text-xs" onClick={() => proof(proofItem.id)}><FileImage size={14} />预览</Button><button onClick={() => proof(proofItem.id, true)} title="下载 / 保存图片"><Download size={15} style={{ color: C.plum }} /></button></div>)}{!detail.data.proofs.length && <span className="text-xs" style={{ color: C.muted }}>尚未上传</span>}</div></Panel><Panel className="mt-3"><div className="text-xs" style={{ color: C.muted }}>{detail.data.receiver.name}　{detail.data.receiver.phone}<br />{detail.data.receiver.province}{detail.data.receiver.city}{detail.data.receiver.district}{detail.data.receiver.detail}</div></Panel>{reviewAction && <Panel className="mt-3"><div className="text-sm font-semibold" style={{ color: C.ink }}>{reviewAction === "reject" ? "驳回付款凭证" : reviewAction === "ship" ? "登记发货" : "确认收款并发货"}</div><p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>{reviewAction === "reject" ? "驳回后会员可按说明补充付款凭证并重新提交。" : reviewAction === "ship" ? "这是此前旧流程中已确认收款的订单，补充发货信息后即可直接发货。" : "填写发货信息后一次提交，即代表已确认收款，订单会直接进入已发货。"}</p>{reviewAction !== "reject" ? <div className="mt-3 space-y-3"><div><Label>物流公司</Label><TextInput value={shippingForm.shippingCompany} placeholder="例如：顺丰速运" onChange={(event) => setShippingForm((old) => ({ ...old, shippingCompany: event.target.value }))} /></div><div><Label>物流单号</Label><TextInput value={shippingForm.trackingNo} placeholder="请输入物流单号" onChange={(event) => setShippingForm((old) => ({ ...old, trackingNo: event.target.value }))} /></div></div> : <div className="mt-3"><Label>驳回说明</Label><TextArea rows={3} value={reviewRemark} onChange={(event) => setReviewRemark(event.target.value)} /></div>}{reviewError && <div className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5" style={{ color: C.danger, borderColor: "#EACACA", background: "#FFF8F8" }}>{reviewError}</div>}<div className="mt-4 flex gap-2"><Button kind="quiet" disabled={isSubmitting} onClick={() => { setReviewAction(null); setReviewError(""); }}>返回</Button><Button kind={reviewAction === "reject" ? "danger" : "default"} disabled={isSubmitting || !canSubmit} onClick={submitReview}>{isSubmitting ? "正在处理…" : reviewAction === "reject" ? "确认驳回" : reviewAction === "ship" ? "登记发货" : "确认收款并发货"}</Button></div></Panel>}<div className="mt-4 flex gap-2">{detail.data.status === "proof_submitted" && !reviewAction && <><Button kind="quiet" onClick={() => openReview("reject")}>驳回凭证</Button><Button onClick={() => openReview("fulfill")}><Truck size={15} />确认收款并发货</Button></>}{detail.data.status === "confirmed" && !reviewAction && <Button onClick={() => openReview("ship")}><Truck size={15} />登记发货</Button>}</div></div></div>}
  </div>;
}

function AdminProducts() {
  const products = trpc.zidingCommerce.adminListProducts.useQuery();
  const save = trpc.zidingCommerce.adminSaveProduct.useMutation({ onSuccess: () => { products.refetch(); setOpen(false); } });
  const upload = trpc.zidingCommerce.adminUploadProductImage.useMutation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const initial = () => ({ name: "", subtitle: "", description: "", imageUrl: "", priceJunior: "", priceSenior: "", originalPrice: "", stock: "0", earnsPoints: true, status: true, sortOrder: "0" });
  const [form, setForm] = useState<any>(initial());
  const start = (product?: any) => {
    setEditing(product || null);
    setForm(product ? { ...product, priceJunior: String(product.priceJunior), priceSenior: product.priceSenior == null ? "" : String(product.priceSenior), originalPrice: product.originalPrice == null ? "" : String(product.originalPrice), stock: String(product.stock), sortOrder: String(product.sortOrder) } : initial());
    setOpen(true);
  };
  const update = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }));
  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => upload.mutate({ imageData: String(reader.result) }, { onSuccess: (result) => update("imageUrl", result.url) });
    reader.readAsDataURL(file);
  };
  const downloadImage = async (url: string, name: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("图片读取失败");
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = localUrl;
      link.download = `${name.replace(/[\\/:*?"<>|]/g, "-") || "商品图片"}.webp`;
      link.click();
      URL.revokeObjectURL(localUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  const submit = () => save.mutate({ id: editing?.id, name: form.name, subtitle: form.subtitle, description: form.description, imageUrl: form.imageUrl, priceJunior: Number(form.priceJunior), priceSenior: form.priceSenior === "" ? null : Number(form.priceSenior), originalPrice: form.originalPrice === "" ? null : Number(form.originalPrice), stock: Number(form.stock), earnsPoints: form.earnsPoints, status: form.status, sortOrder: Number(form.sortOrder) });

  return <div>
    <div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>商品资料</div><div className="mt-1 text-[11px]" style={{ color: C.muted }}>可上传商品图、下载原图或编辑商品资料。</div></div><Button onClick={() => start()}><Plus size={15} />添加商品</Button></div>
    <div className="border-y" style={{ borderColor: C.line }}>{(products.data || []).map((product: any, index: number) => <div key={product.id} className={`flex items-center gap-3 py-3 ${index ? "border-t" : ""}`} style={{ borderColor: C.line }}>
      <button onClick={() => start(product)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: "#F1ECE9" }}>{product.imageUrl ? <img src={product.imageUrl} className="h-full w-full object-cover" /> : <Package size={18} style={{ color: C.muted }} />}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" style={{ color: C.ink }}>{product.name}</div><div className="mt-1 truncate text-xs" style={{ color: C.muted }}>初级 {money(product.priceJunior)}　高级 {product.priceSenior == null ? "—" : money(product.priceSenior)}</div></div></button>
      {product.imageUrl && <button onClick={() => downloadImage(product.imageUrl, product.name)} title="下载商品图片" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "#F3EEE9", color: C.plum }}><Download size={15} /></button>}
      <button onClick={() => start(product)} className="grid h-8 w-6 shrink-0 place-items-center" aria-label={`编辑${product.name}`}><ChevronRight size={16} style={{ color: C.muted }} /></button>
    </div>)}</div>
    {!products.isLoading && !(products.data || []).length && <div className="py-12 text-center text-sm" style={{ color: C.muted }}>暂未添加商品</div>}
    {open && <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={() => setOpen(false)}><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}><div className="flex justify-between"><h3 className="text-lg font-bold" style={{ color: C.ink }}>{editing ? "编辑商品" : "添加商品"}</h3><button onClick={() => setOpen(false)}><X size={20} /></button></div><div className="mt-4 space-y-3"><div><Label>商品名称</Label><TextInput value={form.name} onChange={(event) => update("name", event.target.value)} /></div><div><Label>副标题 / 规格</Label><TextInput value={form.subtitle} onChange={(event) => update("subtitle", event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>初级会员价格</Label><TextInput type="number" value={form.priceJunior} onChange={(event) => update("priceJunior", event.target.value)} /></div><div><Label>高级会员价格（选填）</Label><TextInput type="number" value={form.priceSenior} onChange={(event) => update("priceSenior", event.target.value)} /></div><div><Label>库存</Label><TextInput type="number" value={form.stock} onChange={(event) => update("stock", event.target.value)} /></div><div><Label>排序</Label><TextInput type="number" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></div></div><div><Label>商品说明</Label><TextArea rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} /></div><div><Label>商品图片</Label><div className="flex gap-3"><label className="grid h-16 w-16 cursor-pointer place-items-center overflow-hidden rounded-xl border" style={{ borderColor: C.line }}>{form.imageUrl ? <img src={form.imageUrl} className="h-full w-full object-cover" /> : <ImagePlus size={18} style={{ color: C.muted }} />}<input className="hidden" type="file" accept="image/*" onChange={chooseImage} /></label><p className="pt-2 text-xs leading-5" style={{ color: C.muted }}>{upload.isPending ? "图片上传中…" : "点击图片即可上传或替换；商品图会压缩后保存至腾讯云 COS。"}</p></div></div><div className="flex gap-5 text-sm" style={{ color: C.ink }}><label className="flex items-center gap-2"><input type="checkbox" checked={form.earnsPoints} onChange={(event) => update("earnsPoints", event.target.checked)} />参与积分</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.status} onChange={(event) => update("status", event.target.checked)} />上架</label></div><Button className="w-full" disabled={save.isPending || !form.name || form.priceJunior === ""} onClick={submit}><Save size={15} />{save.isPending ? "保存中…" : "保存商品"}</Button></div></div></div>}
  </div>;
}

function AdminMembers() {
  const members = trpc.zidingCommerce.adminListMembers.useQuery();
  const [keyword, setKeyword] = useState("");
  const search = trpc.zidingCommerce.adminSearchUsers.useQuery({ keyword: keyword || "_" }, { enabled: false });
  const [editingMember, setEditingMember] = useState<any>(null);
  const [memberForm, setMemberForm] = useState<any>(null);
  const [isMemberEditMode, setIsMemberEditMode] = useState(false);
  const [showExistingAdd, setShowExistingAdd] = useState(false);
  const save = trpc.zidingCommerce.adminSaveMember.useMutation({
    onSuccess: () => {
      members.refetch();
      setEditingMember(null);
      setMemberForm(null);
    },
    onError: (error) => alert(error.message),
  });
  const create = trpc.zidingCommerce.adminCreateMember.useMutation({
    onSuccess: (result) => {
      members.refetch();
      setNewMember({ username: "", nickname: "" });
      setCredentials(result);
      setCopied(false);
    },
    onError: (error) => alert(error.message),
  });
  const [found, setFound] = useState<any[]>([]);
  const [newMember, setNewMember] = useState({ username: "", nickname: "" });
  const [credentials, setCredentials] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const roleLabel = (role: string) => ({ user: "普通用户", order_admin: "订单管理员", catalog_admin: "商品管理员", owner: "项目负责人" } as Record<string, string>)[role] || "普通用户";
  const tierLabel = (tier: string) => tier === "senior" ? "高级会员" : "初级会员";
  const find = async () => {
    if (!keyword.trim()) return;
    const result = await search.refetch();
    setFound((result.data || []).filter((user: any) => user.name.includes(keyword) || user.username.includes(keyword)));
  };
  const choose = (user: any) => save.mutate({ userId: user.userId, tier: "junior", role: "user", isActive: true });
  const openEditor = (member: any) => {
    if (!isMemberEditMode) return;
    setEditingMember(member);
    setMemberForm({ userId: member.userId, tier: member.tier, role: member.role, isActive: member.isActive });
  };
  const copyLoginInfo = async () => {
    if (!credentials) return;
    const content = `紫鼎商业联盟登录信息\n用户名：${credentials.username}\n初始密码：${credentials.initialPassword}\n登录方式：微信小程序搜索“人脉涌动”`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("复制失败，请手动记录账号和初始密码。");
    }
  };

  return <div>
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-sm font-semibold" style={{ color: C.ink }}>开通新会员</div><p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>紫鼎会员仅由管理员开通。新账号默认是初级会员，初始密码会随机生成六位数字。</p></div>
        <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "#F2EAF0", color: C.plum }}>管理员操作</span>
      </div>
      <div className="mt-4 space-y-3">
        <div><Label>用户名</Label><TextInput maxLength={20} placeholder="汉字、字母、数字或下划线" value={newMember.username} onChange={(event) => setNewMember({ ...newMember, username: event.target.value })} /></div>
        <div><Label>昵称（选填）</Label><TextInput maxLength={50} placeholder="不填写时，默认使用用户名" value={newMember.nickname} onChange={(event) => setNewMember({ ...newMember, nickname: event.target.value })} /></div>
        <Button className="w-full" disabled={create.isPending || !newMember.username.trim()} onClick={() => create.mutate({ username: newMember.username, nickname: newMember.nickname })}><Plus size={15} />{create.isPending ? "正在开通…" : "开通会员并生成登录信息"}</Button>
      </div>
      <div className="mt-4 border-t pt-3" style={{ borderColor: C.line }}><button onClick={() => setShowExistingAdd(!showExistingAdd)} className="text-xs font-semibold" style={{ color: C.plum }}>{showExistingAdd ? "收起已有账号添加" : "添加已有平台账号"}</button>{showExistingAdd && <div className="mt-3"><p className="text-xs leading-5" style={{ color: C.muted }}>搜索已有平台账号并加入紫鼎，启用后会自动获得紫鼎入口。</p><div className="mt-2 flex gap-2"><TextInput placeholder="昵称或用户名" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Button onClick={find}>搜索</Button></div>{found.map((user: any) => <button key={user.userId} onClick={() => choose(user)} className="mt-2 flex w-full items-center gap-2 border-t py-3 text-left text-xs" style={{ borderColor: C.line, color: C.ink }}><Plus size={14} style={{ color: C.plum }} /><span className="min-w-0 flex-1 truncate">{user.name}</span><span className="shrink-0" style={{ color: C.muted }}>{user.username}</span></button>)}</div>}</div>
    </Panel>

    <div className="mt-6 flex items-center justify-between"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>已开通会员</div><p className="mt-1 text-[11px]" style={{ color: C.muted }}>{isMemberEditMode ? "点击某位会员进入编辑。" : "展示当前会员等级与项目身份。"}</p></div><div className="flex items-center gap-3"><span className="text-xs" style={{ color: C.muted }}>{(members.data || []).length} 人</span><Button kind="quiet" onClick={() => setIsMemberEditMode(!isMemberEditMode)}>{isMemberEditMode ? "完成" : "编辑"}</Button></div></div>
    <div className="mt-3 border-y" style={{ borderColor: C.line }}>{(members.data || []).map((member: any, index: number) => <button key={member.userId} disabled={!isMemberEditMode} onClick={() => openEditor(member)} className={`flex w-full items-center gap-3 py-3.5 text-left disabled:cursor-default ${index ? "border-t" : ""}`} style={{ borderColor: C.line }}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: "#F2EAF0", color: C.plum }}>{String(member.name || "会").slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold" style={{ color: C.ink }}>{member.name}</span><span className="shrink-0 text-[10px]" style={{ color: member.isActive ? C.success : C.danger }}>{member.isActive ? "已启用" : "已停用"}</span></div><div className="mt-1 truncate text-xs" style={{ color: C.muted }}>{member.username || `编号 ${member.userId}`}　·　{tierLabel(member.tier)}　·　{roleLabel(member.role)}</div></div>{isMemberEditMode && <ChevronRight size={17} className="shrink-0" style={{ color: C.plum }} />}</button>)}</div>

    {editingMember && memberForm && <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={() => { setEditingMember(null); setMemberForm(null); }}><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold" style={{ color: C.ink }}>编辑会员</h3><p className="mt-1 text-xs" style={{ color: C.muted }}>修改后需点击保存才会生效。</p></div><button onClick={() => { setEditingMember(null); setMemberForm(null); }} aria-label="关闭"><X size={20} style={{ color: C.muted }} /></button></div><div className="mt-5 rounded-2xl border p-4" style={{ background: C.paper, borderColor: C.line }}><div className="text-sm font-semibold" style={{ color: C.ink }}>{editingMember.name}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{editingMember.username || `编号 ${editingMember.userId}`}</div></div><div className="mt-4 space-y-4"><div><Label>会员等级</Label><select value={memberForm.tier} onChange={(event) => setMemberForm({ ...memberForm, tier: event.target.value })} className="w-full rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: C.line, background: "#FFFEFC", color: C.ink }}><option value="junior">初级会员</option><option value="senior">高级会员</option></select></div><div><Label>项目身份</Label><select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })} className="w-full rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: C.line, background: "#FFFEFC", color: C.ink }}><option value="user">普通用户</option><option value="order_admin">订单管理员</option><option value="catalog_admin">商品管理员</option><option value="owner">项目负责人</option></select></div><div className="rounded-2xl border p-4" style={{ borderColor: C.line, background: C.paper }}><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>紫鼎访问</div><p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>{memberForm.isActive ? "当前可进入紫鼎商城；停用后不影响该账号的其他项目。" : "当前无法进入紫鼎商城；恢复后可重新使用紫鼎功能。"}</p></div><Button kind={memberForm.isActive ? "danger" : "quiet"} onClick={() => setMemberForm({ ...memberForm, isActive: !memberForm.isActive })}>{memberForm.isActive ? "停用紫鼎访问" : "恢复紫鼎访问"}</Button></div></div><Button className="w-full" disabled={save.isPending} onClick={() => save.mutate(memberForm)}><Save size={15} />{save.isPending ? "保存中…" : "保存修改"}</Button></div></div></div>}

    {credentials && <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3 sm:items-center sm:justify-center" onClick={() => setCredentials(null)}><div className="w-full max-w-sm rounded-[28px] p-5" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold" style={{ color: C.ink }}>新会员已开通</h3><p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>初始密码只在本次显示，请立即复制并发送给会员。</p></div><button onClick={() => setCredentials(null)} aria-label="关闭"><X size={20} style={{ color: C.muted }} /></button></div><div className="mt-5 overflow-hidden rounded-2xl border" style={{ borderColor: C.line, background: C.paper }}><div className="flex items-center justify-between px-4 py-3"><span className="text-xs" style={{ color: C.muted }}>用户名</span><code className="text-sm font-bold" style={{ color: C.ink }}>{credentials.username}</code></div><div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: C.line }}><span className="text-xs" style={{ color: C.muted }}>六位初始密码</span><code className="text-base font-bold tracking-[0.18em]" style={{ color: C.plum }}>{credentials.initialPassword}</code></div></div><p className="mt-3 text-xs leading-5" style={{ color: C.muted }}>请在微信小程序搜索“人脉涌动”，使用管理员提供的账号密码登录。紫鼎会员不支持自主注册。</p><Button className="mt-4 w-full" onClick={copyLoginInfo}><Copy size={15} />{copied ? "已复制登录信息" : "一键复制登录信息"}</Button><Button kind="quiet" className="mt-2 w-full" onClick={() => setCredentials(null)}>我已发送，关闭</Button></div></div>}
  </div>;
}

function AdminPoints() {
  const rules = trpc.zidingCommerce.adminListPointRules.useQuery();
  const save = trpc.zidingCommerce.adminSavePointRule.useMutation({ onSuccess: () => { rules.refetch(); setOpen(false); } });
  const emptyForm = () => ({ id: undefined as number | undefined, minAmount: "", multiplier: "1", ruleNote: "", effectiveMonth: new Date().toISOString().slice(0, 7), enabled: true, sortOrder: "0" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const start = (rule?: any) => {
    setForm(rule ? { id: rule.id, minAmount: String(rule.minAmount), multiplier: String(rule.multiplier), ruleNote: rule.ruleNote || "", effectiveMonth: rule.effectiveMonth, enabled: Boolean(rule.enabled), sortOrder: String(rule.sortOrder) } : emptyForm());
    setOpen(true);
  };
  const submit = () => save.mutate({ id: form.id, minAmount: Number(form.minAmount), multiplier: Number(form.multiplier), ruleNote: form.ruleNote, effectiveMonth: form.effectiveMonth, enabled: form.enabled, sortOrder: Number(form.sortOrder) });

  return <div>
    <div className="border-b pb-4" style={{ borderColor: C.line }}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>月度阶梯加权积分</div><p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>确认收款后，系统按当月累计额命中最高档，并自动补发跨档差额。</p></div><Button onClick={() => start()}><Plus size={14} />新增阶梯</Button></div></div>
    <div className="border-b" style={{ borderColor: C.line }}>{(rules.data || []).map((rule: any, index: number) => <button key={rule.id} onClick={() => start(rule)} className={`flex w-full items-center gap-3 py-4 text-left ${index ? "border-t" : ""}`} style={{ borderColor: C.line }}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: "#F2EAF0", color: C.plum }}>{Number(rule.multiplier).toFixed(2)}×</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold" style={{ color: C.ink }}>满 {money(rule.minAmount)} 加权</div><div className="mt-1 truncate text-[11px]" style={{ color: C.muted }}>生效：{rule.effectiveMonth}　{rule.ruleNote || "未填写说明"}</div></div><span className="text-[11px]" style={{ color: rule.enabled ? C.success : C.muted }}>{rule.enabled ? "启用" : "停用"}</span><ChevronRight size={16} style={{ color: C.muted }} /></button>)}</div>
    {!rules.isLoading && !(rules.data || []).length && <div className="py-12 text-center text-sm" style={{ color: C.muted }}>暂未设置积分阶梯</div>}
    {open && <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={() => setOpen(false)}><div className="w-full rounded-t-[28px] p-5" onClick={(event) => event.stopPropagation()} style={{ background: C.canvas }}><div className="flex justify-between"><h3 className="text-lg font-bold" style={{ color: C.ink }}>{form.id ? "编辑积分阶梯" : "新增积分阶梯"}</h3><button onClick={() => setOpen(false)}><X size={20} /></button></div><div className="mt-4 grid grid-cols-2 gap-3"><div><Label>门槛金额</Label><TextInput type="number" value={form.minAmount} onChange={(event) => setForm({ ...form, minAmount: event.target.value })} /></div><div><Label>加权系数</Label><TextInput type="number" step="0.01" value={form.multiplier} onChange={(event) => setForm({ ...form, multiplier: event.target.value })} /></div><div><Label>生效月份</Label><TextInput type="month" value={form.effectiveMonth} onChange={(event) => setForm({ ...form, effectiveMonth: event.target.value })} /></div><div><Label>排序</Label><TextInput type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></div><div className="col-span-2"><Label>规则说明</Label><TextInput value={form.ruleNote} onChange={(event) => setForm({ ...form, ruleNote: event.target.value })} /></div></div><label className="mt-4 flex items-center gap-2 text-sm" style={{ color: C.ink }}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用此积分阶梯</label><Button className="mt-4 w-full" disabled={save.isPending || form.minAmount === "" || form.multiplier === ""} onClick={submit}><Save size={15} />{save.isPending ? "保存中…" : "保存积分阶梯"}</Button></div></div>}
  </div>;
}

function AdminSettings() { const settings=trpc.zidingCommerce.adminGetSettings.useQuery(); const save=trpc.zidingCommerce.adminSaveSettings.useMutation({onSuccess:()=>settings.refetch()}); const [form,setForm]=useState<any>(null); useEffect(()=>{if(settings.data&&!form)setForm(settings.data)},[settings.data,form]); if(!form)return <div className="py-16 text-center text-sm" style={{color:C.muted}}>正在加载设置…</div>; return <div><Panel><div className="text-sm font-semibold" style={{color:C.ink}}>线下付款与履约设置</div><p className="mt-1 text-xs leading-5" style={{color:C.muted}}>收款说明会展示给拍下订单的用户；不在此处保存付款凭证图片。</p><div className="mt-4"><Label>收款说明</Label><TextArea rows={6} value={form.paymentInstruction} onChange={e=>setForm({...form,paymentInstruction:e.target.value})}/></div><div className="mt-3 grid grid-cols-2 gap-3"><div><Label>未上传凭证占库存时长（小时）</Label><TextInput type="number" value={form.stockHoldHours} onChange={e=>setForm({...form,stockHoldHours:Number(e.target.value)})}/></div><div><Label>发货后自动确认（天）</Label><TextInput type="number" value={form.autoConfirmDays} onChange={e=>setForm({...form,autoConfirmDays:Number(e.target.value)})}/></div></div><Button className="mt-4 w-full" disabled={save.isPending} onClick={()=>save.mutate(form)}><Save size={15}/>{save.isPending?"保存中…":"保存设置"}</Button></Panel></div>; }
