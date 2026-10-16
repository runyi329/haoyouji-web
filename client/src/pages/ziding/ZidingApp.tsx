import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, BarChart3, Bell, Check, ChevronRight, Download, FileImage,
  Home, ImagePlus, LayoutDashboard, MapPin, Menu, Package, Plus, ReceiptText,
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
      navigate("/login");
    } catch {
      alert("退出登录失败，请稍后重试。");
    }
  };
  if (loading || context.isLoading) return <div className="min-h-screen grid place-items-center text-sm" style={{ background: C.canvas, color: C.muted }}>正在进入紫鼎商业联盟…</div>;
  if (!user || context.error) return <LoginGate />;
  if (path.startsWith("/product-style")) return <ProductLongDetail product={{ id: 0, name: "养源归序早餐粉", subtitle: "一组四包", description: "为有节奏的清晨准备的便捷冲调食品。", imageUrl: COS_PRODUCT_IMAGES.breakfast, price: 0 }} onClose={() => go("")} preview />;
  if (path.startsWith("/admin")) return <AdminApp go={go} onExit={() => go("")} />;
  if (path.startsWith("/orders")) return <OrdersApp go={go} />;
  if (path.startsWith("/me")) return <ProfileApp go={go} />;
  return <Storefront go={go} context={context.data as any} profile={user as any} onLogout={exit} />;
}

function LoginGate() {
  return <div className="min-h-screen flex items-center justify-center p-7" style={{ background: C.canvas }}><Panel className="max-w-sm text-center"><ShieldCheck className="mx-auto mb-3" size={26} style={{ color: C.gold }} /><h1 className="text-lg font-bold" style={{ color: C.ink }}>请先登录</h1><p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>登录后即可查看紫鼎商业联盟专属商品、订单和本月积分。</p><a href="/login" className="mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.ink }}>前往登录</a></Panel></div>;
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
    go("/orders?checkout=1");
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
    {showCart && <CartSheet rows={rows} total={total} onClose={() => setShowCart(false)} onChange={change} onCheckout={() => { setShowCart(false); go("/orders?checkout=1"); }} />}
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

function OrdersApp({ go }: { go: (path?: string) => void }) {
  const [status, setStatus] = useState("all"); const [selectedId, setSelectedId] = useState<number | null>(null);
  const context = trpc.zidingCommerce.myContext.useQuery();
  const orders = trpc.zidingCommerce.myOrders.useQuery({ status }); const detail = trpc.zidingCommerce.myOrderDetail.useQuery({ id: selectedId! }, { enabled: !!selectedId });
  const addresses = trpc.zidingCommerce.listAddresses.useQuery(); const [showCheckout, setShowCheckout] = useState(new URLSearchParams(window.location.search).get("checkout") === "1");
  const [orderError, setOrderError] = useState("");
  const closeCheckout = () => { setShowCheckout(false); const params = new URLSearchParams(window.location.search); params.delete("checkout"); window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); };
  const create = trpc.zidingCommerce.createOrder.useMutation({
    onSuccess: (result) => { localStorage.removeItem("ziding-cart"); setOrderError(""); closeCheckout(); orders.refetch(); setSelectedId(result.id); },
    onError: (error) => {
      const message = error.message || "订单创建失败，请稍后重试";
      const isTechnicalFailure = error.data?.code === "INTERNAL_SERVER_ERROR" || /beginTransaction|rollback|commit|is not a function|ECONN/i.test(message);
      setOrderError(isTechnicalFailure ? "订单服务暂时不可用，请稍后重试" : message);
    },
  });
  const productQuery = trpc.zidingCommerce.listProducts.useQuery(); const rawCart = (() => { try { return JSON.parse(localStorage.getItem("ziding-cart") || "{}"); } catch { return {}; } })() as Cart;
  const cartItems = (productQuery.data || []).filter((p: any) => rawCart[p.id]).map((p: any) => ({ productId: p.id, quantity: rawCart[p.id] }));
  const submit = (addressId: number) => { setOrderError(""); if (!cartItems.length) { setOrderError("购物车为空，请先返回首页选择商品"); return; } create.mutate({ addressId, items: cartItems }); };
  return <div className="min-h-screen pb-24" style={{ background: C.canvas }}><Header title="我的订单" back={() => go("")} /><main className="mx-auto max-w-md px-4 pt-4"><div className="mb-4 flex gap-2 overflow-x-auto">{[["all","全部"],["awaiting_proof","待上传"],["proof_submitted","待确认"],["confirmed","待发货"],["shipped","已发货"],["completed","已完成"]].map(([key,label]) => <button key={key} onClick={() => setStatus(key)} className="shrink-0 rounded-full px-3 py-1.5 text-xs" style={{ background: status === key ? C.ink : C.paper, color: status === key ? "white" : C.muted, border: `1px solid ${status === key ? C.ink : C.line}` }}>{label}</button>)}</div>{orders.isLoading ? <div className="py-16 text-center text-sm" style={{ color: C.muted }}>正在加载订单…</div> : (orders.data || []).length === 0 ? <Panel className="py-12 text-center"><ReceiptText className="mx-auto mb-3" size={25} style={{ color: C.gold }} /><div className="font-semibold" style={{ color: C.ink }}>暂时没有订单</div><p className="mt-2 text-xs" style={{ color: C.muted }}>商品拍下后，会在这里显示订单进度。</p></Panel> : <div className="space-y-3">{(orders.data || []).map((order: any) => <OrderRow key={order.id} order={order} onClick={() => setSelectedId(order.id)} />)}</div>}</main><BottomNav active="orders" go={go} />{selectedId && detail.data && <OrderDetailSheet order={detail.data as any} paymentInstruction={(context.data as any)?.paymentInstruction || ""} isAdmin={false} onClose={() => setSelectedId(null)} onRefresh={() => { detail.refetch(); orders.refetch(); }} />}{showCheckout && <CheckoutSheet addresses={(addresses.data || []) as any[]} cartCount={cartItems.length} paymentInstruction={(context.data as any)?.paymentInstruction || ""} submitting={create.isPending} loadingProducts={productQuery.isLoading} error={orderError} onClose={closeCheckout} onSubmit={submit} />}</div>;
}

function OrderRow({ order, onClick }: { order: any; onClick: () => void }) { const tone = statusTone(order.status); return <button onClick={onClick} className="w-full rounded-[20px] border p-4 text-left" style={{ background: C.paper, borderColor: C.line }}><div className="flex justify-between gap-3"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{order.orderNo}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{dateTime(order.createdAt)}</div></div><span className="h-fit rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: tone.color, background: tone.bg }}>{tone.text}</span></div><div className="mt-4 flex items-center justify-between border-t pt-3 text-sm" style={{ borderColor: C.line }}><span style={{ color: C.muted }}>订单金额</span><strong style={{ color: C.ink }}>{money(order.totalAmount)}</strong></div></button>; }

function CheckoutSheet({ addresses, cartCount, paymentInstruction, submitting, loadingProducts, error, onClose, onSubmit }: { addresses: any[]; cartCount: number; paymentInstruction: string; submitting: boolean; loadingProducts: boolean; error: string; onClose: () => void; onSubmit: (addressId: number) => void }) {
  const utils = trpc.useUtils(); const [addressError, setAddressError] = useState("");
  const [picked, setPicked] = useState<number | null>(addresses.find((a) => a.isDefault)?.id || addresses[0]?.id || null); const [createAddress, setCreateAddress] = useState(!addresses.length); const saveAddress = trpc.zidingCommerce.saveAddress.useMutation({ onSuccess: async (result) => { setPicked(result.id); setCreateAddress(false); await utils.zidingCommerce.listAddresses.invalidate(); }, onError: (saveError) => setAddressError(saveError.message || "地址保存失败，请稍后重试") });
  const [form, setForm] = useState({ receiverName: "", receiverPhone: "", province: "", city: "", district: "", detail: "", labelName: "常用地址", isDefault: true });
  const update = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const isDirectRegion = DIRECT_DISTRICT_REGIONS.has(form.province);
  const cityOptions = form.province ? getZidingCities(form.province) : [];
  const districtOptions = form.province ? getZidingDistricts(form.province, isDirectRegion ? form.province : form.city) : [];
  const canSaveAddress = Boolean(form.receiverName.trim() && form.receiverPhone.trim() && form.province && form.city && form.detail.trim());
  const selectClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-45";
  const selectStyle = { borderColor: C.line, background: "#FFFEFC", color: C.ink };
  return <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={onClose}><div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(e) => e.stopPropagation()} style={{ background: C.canvas }}><div className="flex items-center justify-between"><h3 className="text-lg font-bold" style={{ color: C.ink }}>确认订单</h3><button onClick={onClose}><X size={20} /></button></div><p className="mt-1 text-xs" style={{ color: C.muted }}>共 {cartCount} 件商品。拍下后上传付款凭证，管理员人工确认。</p>{(error || addressError) && <div className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5" style={{ color: C.danger, borderColor: "#EACACA", background: "#FFF8F8" }}>{error || addressError}</div>}{!createAddress && addresses.length > 0 ? <div className="mt-4 space-y-2">{addresses.map((a) => <button key={a.id} onClick={() => setPicked(a.id)} className="w-full rounded-xl border p-3 text-left" style={{ background: picked === a.id ? "#F4EEF4" : C.paper, borderColor: picked === a.id ? C.plum : C.line }}><div className="text-sm font-semibold" style={{ color: C.ink }}>{a.receiverName}　{a.receiverPhone}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{a.province}{a.city}{a.district}{a.detail}</div></button>)}</div> : <div className="mt-4 grid grid-cols-2 gap-3"><div><Label>收件人</Label><TextInput value={form.receiverName} onChange={(e) => update("receiverName", e.target.value)} placeholder="请输入收件人姓名" /></div><div><Label>联系电话</Label><TextInput type="tel" value={form.receiverPhone} onChange={(e) => update("receiverPhone", e.target.value)} placeholder="请输入手机号码" /></div><div className="col-span-2"><Label>所在地区</Label><div className="grid grid-cols-2 gap-3"><select value={form.province} onChange={(e) => { const province = e.target.value; setForm((old) => ({ ...old, province, city: DIRECT_DISTRICT_REGIONS.has(province) ? province : "", district: "" })); }} className={selectClass} style={selectStyle}><option value="">省 / 直辖市 / 自治区</option>{ZIDING_REGIONS.map((region) => <option key={region.n} value={region.n}>{region.n}</option>)}</select>{!isDirectRegion && <select value={form.city} disabled={!form.province} onChange={(e) => setForm((old) => ({ ...old, city: e.target.value, district: "" }))} className={selectClass} style={selectStyle}><option value="">市 / 地区</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select>}<select value={form.district} disabled={!form.province || (!isDirectRegion && !form.city)} onChange={(e) => update("district", e.target.value)} className={`${selectClass} ${isDirectRegion ? "" : "col-span-2"}`} style={selectStyle}><option value="">区 / 县（选填）</option>{districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}</select></div></div><div className="col-span-2"><Label>详细地址</Label><TextInput value={form.detail} onChange={(e) => update("detail", e.target.value)} placeholder="街道、门牌号、楼栋和房间号" /></div></div>}<div className="mt-4 rounded-xl border p-3 text-xs leading-5" style={{ background: "#FFFEFC", borderColor: C.line, color: C.muted }}><div className="mb-1 font-semibold" style={{ color: C.ink }}>付款与凭证说明</div>{paymentInstruction || "请在订单创建后按管理员说明完成付款，并上传清晰付款凭证。"}</div><div className="mt-4 flex justify-between gap-3"><Button kind="quiet" onClick={() => setCreateAddress((v) => !v)}>{createAddress ? "选择已有地址" : "新增地址"}</Button>{createAddress ? <Button disabled={saveAddress.isPending || !canSaveAddress} onClick={() => { setAddressError(""); saveAddress.mutate(form); }}><Save size={14} />保存地址</Button> : <Button disabled={!picked || submitting || loadingProducts || cartCount === 0} onClick={() => picked && onSubmit(picked)}>{loadingProducts ? "正在加载商品…" : cartCount === 0 ? "购物车为空" : submitting ? "正在创建…" : "确认拍下"}<ChevronRight size={15} /></Button>}</div></div></div>;
}

function OrderDetailSheet({ order, paymentInstruction, isAdmin, onClose, onRefresh }: { order: any; paymentInstruction: string; isAdmin: boolean; onClose: () => void; onRefresh: () => void }) {
  const uploadProof = trpc.zidingCommerce.uploadPaymentProof.useMutation({ onSuccess: onRefresh }); const cancel = trpc.zidingCommerce.cancelMyOrder.useMutation({ onSuccess: onRefresh }); const receipt = trpc.zidingCommerce.confirmReceipt.useMutation({ onSuccess: onRefresh }); const utils = trpc.useUtils();
  const proof = async (proofId: number, download = false) => { try { const result = await utils.zidingCommerce.getPaymentProofUrl.fetch({ proofId, download }); window.open(result.url, "_blank", "noopener,noreferrer"); } catch (error: any) { alert(error.message || "凭证打开失败"); } };
  const readFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { alert("单张图片不能超过 10 兆"); return; } const reader = new FileReader(); reader.onload = () => uploadProof.mutate({ orderId: order.id, imageData: String(reader.result) }); reader.readAsDataURL(file); };
  const tone = statusTone(order.status); return <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={onClose}><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(e) => e.stopPropagation()} style={{ background: C.canvas }}><div className="flex justify-between"><div><div className="text-lg font-bold" style={{ color: C.ink }}>订单详情</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{order.orderNo}</div></div><button onClick={onClose}><X size={20} /></button></div><span className="mt-3 inline-block rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: tone.color, background: tone.bg }}>{order.statusLabel}</span><div className="mt-4 space-y-2">{order.items.map((item: any) => <div key={item.id} className="flex justify-between rounded-xl border p-3" style={{ background: C.paper, borderColor: C.line }}><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{item.name}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{money(item.unitPrice)} × {item.quantity}</div></div><strong className="text-sm" style={{ color: C.ink }}>{money(item.lineTotal)}</strong></div>)}</div><Panel className="mt-3"><div className="text-sm font-semibold" style={{ color: C.ink }}>收货信息</div><div className="mt-2 text-xs leading-5" style={{ color: C.muted }}>{order.receiver.name}　{order.receiver.phone}<br />{order.receiver.province}{order.receiver.city}{order.receiver.district}{order.receiver.detail}</div></Panel><Panel className="mt-3"><div className="flex justify-between"><div className="text-sm font-semibold" style={{ color: C.ink }}>付款凭证</div>{!isAdmin && ["awaiting_proof", "proof_rejected"].includes(order.status) && <label className="cursor-pointer text-xs font-semibold" style={{ color: C.plum }}><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={readFile} />{uploadProof.isPending ? "上传中…" : "上传图片"}</label>}</div>{!isAdmin && ["awaiting_proof", "proof_rejected"].includes(order.status) && <div className="mt-3 rounded-xl border p-3 text-[11px] leading-5" style={{ borderColor: C.line, color: C.muted }}><strong style={{ color: C.ink }}>付款说明</strong><br />{paymentInstruction || "请按管理员说明完成付款后上传凭证。"}</div>}<p className="mt-2 text-[11px] leading-5" style={{ color: C.muted }}>凭证仅下单用户与紫鼎项目订单管理员可查看。单笔最多 3 张。</p>{order.proofs.length ? <div className="mt-3 flex flex-wrap gap-2">{order.proofs.map((p: any) => <div key={p.id} className="rounded-xl border px-2.5 py-2" style={{ borderColor: C.line }}><Button kind="quiet" onClick={() => proof(p.id)} className="border-0 p-0 text-xs"><FileImage size={14} />预览</Button><button onClick={() => proof(p.id, true)} className="ml-2 align-middle" title="下载 / 保存图片"><Download size={15} style={{ color: C.plum }} /></button></div>)}</div> : <div className="mt-3 text-xs" style={{ color: C.muted }}>暂未上传凭证</div>}</Panel>{order.shippingCompany && <Panel className="mt-3"><div className="flex gap-2"><Truck size={17} style={{ color: C.gold }} /><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{order.shippingCompany}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{order.trackingNo}</div></div></div></Panel>}<Panel className="mt-3"><div className="text-sm font-semibold" style={{ color: C.ink }}>订单进度</div><div className="mt-3 space-y-3">{order.timeline.map((item: any, index: number) => <div key={`${item.type}-${index}`} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: index === order.timeline.length - 1 ? C.gold : C.line }} /><div><div className="text-xs font-medium" style={{ color: C.ink }}>{item.text}</div><div className="mt-0.5 text-[10px]" style={{ color: C.muted }}>{dateTime(item.createdAt)}</div></div></div>)}</div></Panel>{!isAdmin && <div className="mt-4 flex gap-2">{["awaiting_proof", "proof_rejected"].includes(order.status) && <Button kind="quiet" onClick={() => { if (confirm("确认取消这笔订单吗？")) cancel.mutate({ id: order.id }); }}>取消订单</Button>}{order.status === "shipped" && <Button onClick={() => { if (confirm("确认已经收到商品吗？")) receipt.mutate({ id: order.id }); }}>确认收货</Button>}</div>}</div></div>;
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

function AdminOrders() { const [status, setStatus] = useState("all"); const [id, setId] = useState<number | null>(null); const list = trpc.zidingCommerce.adminListOrders.useQuery({ status }); const detail = trpc.zidingCommerce.adminOrderDetail.useQuery({ id: id! }, { enabled: !!id }); const review = trpc.zidingCommerce.adminReviewOrder.useMutation({ onSuccess: () => { detail.refetch(); list.refetch(); } }); const ship = trpc.zidingCommerce.adminShipOrder.useMutation({ onSuccess: () => { detail.refetch(); list.refetch(); } }); const utils = trpc.useUtils(); const proof = async (proofId: number, download = false) => { try { const result = await utils.zidingCommerce.getPaymentProofUrl.fetch({ proofId, download }); window.open(result.url, "_blank", "noopener,noreferrer"); } catch (error: any) { alert(error.message || "凭证打开失败"); } }; const action = (order: any) => { if (order.status === "proof_submitted") { const ok = confirm("确认已核验收款吗？选择取消可填写驳回原因。"); if (ok) review.mutate({ id: order.id, action: "confirm", remark: "" }); else { const reason = prompt("请填写需要补充的内容：", "请补充清晰付款凭证"); if (reason) review.mutate({ id: order.id, action: "reject", remark: reason }); } } else if (order.status === "confirmed") { const company = prompt("物流公司：", ""); const trackingNo = company ? prompt("物流单号：", "") : null; if (company && trackingNo) ship.mutate({ id: order.id, shippingCompany: company, trackingNo }); } }; return <div><div className="mb-3 flex gap-2 overflow-x-auto">{[["all","全部"],["proof_submitted","待确认"],["confirmed","待发货"],["shipped","已发货"]].map(([key,label]) => <button key={key} onClick={() => setStatus(key)} className="shrink-0 rounded-full px-3 py-1.5 text-xs" style={{ background: status === key ? C.ink : C.paper, color: status === key ? "white" : C.muted, border: `1px solid ${status === key ? C.ink : C.line}` }}>{label}</button>)}</div><div className="space-y-3">{(list.data || []).map((order: any) => <button key={order.id} onClick={() => setId(order.id)} className="w-full rounded-[20px] border p-4 text-left" style={{ background: C.paper, borderColor: C.line }}><div className="flex justify-between"><div><div className="text-sm font-semibold" style={{ color: C.ink }}>{order.orderNo}</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{order.user.name}　{money(order.totalAmount)}</div></div><span className="text-xs" style={{ color: statusTone(order.status).color }}>{order.statusLabel}</span></div></button>)}</div>{id && detail.data && <div className="fixed inset-0 z-50 flex items-end bg-black/35" onClick={() => setId(null)}><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] p-5" onClick={(e) => e.stopPropagation()} style={{ background: C.canvas }}><div className="flex justify-between"><div><div className="text-lg font-bold" style={{ color: C.ink }}>订单审核</div><div className="mt-1 text-xs" style={{ color: C.muted }}>{detail.data.orderNo}</div></div><button onClick={() => setId(null)}><X size={20}/></button></div><div className="mt-4 space-y-2">{detail.data.items.map((item: any) => <div key={item.id} className="rounded-xl border p-3 text-sm" style={{ background: C.paper,borderColor:C.line }}>{item.name} × {item.quantity}<span className="float-right">{money(item.lineTotal)}</span></div>)}</div><Panel className="mt-3"><div className="text-sm font-semibold" style={{ color: C.ink }}>付款凭证</div><div className="mt-3 flex flex-wrap gap-2">{detail.data.proofs.map((p: any) => <div key={p.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{borderColor:C.line}}><Button kind="quiet" className="border-0 p-0 text-xs" onClick={() => proof(p.id)}><FileImage size={14}/>预览</Button><button onClick={() => proof(p.id,true)} title="下载 / 保存图片"><Download size={15} style={{color:C.plum}} /></button></div>)}{!detail.data.proofs.length && <span className="text-xs" style={{color:C.muted}}>尚未上传</span>}</div></Panel><Panel className="mt-3"><div className="text-xs" style={{color:C.muted}}>{detail.data.receiver.name}　{detail.data.receiver.phone}<br />{detail.data.receiver.province}{detail.data.receiver.city}{detail.data.receiver.district}{detail.data.receiver.detail}</div></Panel><div className="mt-4 flex gap-2">{detail.data.status === "proof_submitted" && <Button onClick={() => action(detail.data)}><Check size={15}/>确认收款</Button>}{detail.data.status === "confirmed" && <Button onClick={() => action(detail.data)}><Truck size={15}/>登记发货</Button>}</div></div></div>}</div>; }

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

function AdminMembers() { const members=trpc.zidingCommerce.adminListMembers.useQuery(); const [keyword,setKeyword]=useState(""); const search=trpc.zidingCommerce.adminSearchUsers.useQuery({keyword:keyword||"_"},{enabled:false}); const save=trpc.zidingCommerce.adminSaveMember.useMutation({onSuccess:()=>members.refetch()}); const [found,setFound]=useState<any[]>([]); const find=async()=>{if(!keyword.trim())return;const r=await search.refetch();setFound((r.data||[]).filter((u:any)=>u.name.includes(keyword)||u.username.includes(keyword)))}; const choose=(u:any)=>save.mutate({userId:u.userId,tier:"junior",role:"user",isActive:true}); return <div><Panel><div className="text-sm font-semibold" style={{color:C.ink}}>添加或搜索用户</div><div className="mt-3 flex gap-2"><TextInput placeholder="姓名或账号" value={keyword} onChange={e=>setKeyword(e.target.value)}/><Button onClick={find}>搜索</Button></div>{found.map((u:any)=><button key={u.userId} onClick={()=>choose(u)} className="mt-2 w-full rounded-lg border p-2 text-left text-xs" style={{borderColor:C.line,color:C.ink}}><Plus size={13} className="mr-1 inline"/>{u.name}　{u.username}</button>)}</Panel><div className="mt-4 space-y-3">{(members.data||[]).map((m:any)=><Panel key={m.userId}><div className="flex items-center justify-between"><div><div className="text-sm font-semibold" style={{color:C.ink}}>{m.name}</div><div className="mt-1 text-xs" style={{color:C.muted}}>{m.username||`编号 ${m.userId}`}</div></div><span className="text-xs" style={{color:m.isActive?C.success:C.danger}}>{m.isActive?"已启用":"已停用"}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><select value={m.tier} onChange={e=>save.mutate({userId:m.userId,tier:e.target.value as any,role:m.role,isActive:m.isActive})} className="rounded-lg border px-2 py-2 text-xs" style={{borderColor:C.line}}><option value="junior">初级会员</option><option value="senior">高级会员</option></select><select value={m.role} onChange={e=>save.mutate({userId:m.userId,tier:m.tier,role:e.target.value as any,isActive:m.isActive})} className="rounded-lg border px-2 py-2 text-xs" style={{borderColor:C.line}}><option value="user">普通用户</option><option value="order_admin">订单管理员</option><option value="catalog_admin">商品管理员</option><option value="owner">项目负责人</option></select><Button kind={m.isActive?"quiet":"danger"} onClick={()=>save.mutate({userId:m.userId,tier:m.tier,role:m.role,isActive:!m.isActive})}>{m.isActive?"停用":"启用"}</Button></div></Panel>)}</div></div>; }

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
