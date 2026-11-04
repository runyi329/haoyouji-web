// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation, useSearch } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Package,
  BookOpen,
  Heart,
  Users,
  ShoppingCart,
  Trash2,
  User,
  ChevronRight,
  TrendingUp,
  Copy,
  Settings,
  MapPin,
  Truck,
  ExternalLink,
  Clock,
  Star,
  CheckCircle2,
  Eye,
  EyeOff,
  Search,
  X,
} from "lucide-react";
import AddressBook from "./AddressBook";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";

function dedupeAddress(addr: string): string {
  return (addr ?? "").replace(/(北京市|上海市|天津市|重庆市)\1/, "$1");
}

// ─── 状态映射 ─────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待发货", color: "text-white bg-orange-600" },
  processing: { label: "处理中", color: "text-white bg-blue-600" },
  confirmed: { label: "已确认", color: "text-white bg-blue-600" },
  packing: { label: "打包中", color: "text-white bg-purple-600" },
  shipped: { label: "已发货", color: "text-white bg-green-600" },
  delivered: { label: "已送达", color: "text-white bg-gray-600" },
  cancelled: { label: "已取消", color: "text-white bg-red-600" },
};

const PERSONAL_ORDER_STATUS_TABS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待发货" },
  { value: "shipped", label: "已发货" },
  { value: "delivered", label: "已收货" },
  { value: "cancelled", label: "已取消" },
] as const;

function getPersonalOrderStatus(status: string) {
  return ["pending", "processing", "confirmed", "packing"].includes(status)
    ? "pending"
    : status;
}

function normalizeOrderKeyword(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

function getPersonalOrderSearchText(order: Record<string, any>) {
  const values: string[] = [];
  const collect = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number") values.push(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object") Object.entries(value).forEach(([key, item]) => {
      // 搜索业务内容，不把头像或商品图片URL中的随机文件名作为订单关键词。
      if (key !== "ingredients" && !/avatar|image|img|url|link/i.test(key)) collect(item);
    });
  };
  collect(order);
  try {
    const ingredients = JSON.parse(order.ingredients || "[]");
    collect(ingredients);
    if (Array.isArray(ingredients)) ingredients.forEach(item => {
      if (item?.quantity && item?.unitLabel) values.push(`${item.quantity}${item.unitLabel}`);
    });
  } catch { /* 旧订单快照格式异常不影响其余信息搜索。 */ }
  for (const key of ["totalPrice", "walletDeductCny", "walletDeductUsdt", "totalWeightJin"]) {
    if (order[key] !== null && order[key] !== undefined && Number.isFinite(Number(order[key]))) values.push(Number(order[key]).toFixed(2));
  }
  const paidCny = Math.max(0, Number(order.walletDeductCny || 0));
  const paidUsdt = Math.max(0, Number(order.walletDeductUsdt || 0));
  const total = Math.max(0, Number(order.totalPrice || 0));
  const rate = Math.max(0, Number(order.usdtCnyRateAtOrder || 0)) || (paidUsdt > 0 && total > paidCny ? (total - paidCny) / paidUsdt : 0);
  values.push(`${paidUsdt.toFixed(2)}U`);
  if (rate > 0) values.push(`${(total / rate).toFixed(2)}U`, `${(paidUsdt + paidCny / rate).toFixed(2)}U`);
  values.push(STATUS_MAP[order.status]?.label || "", PERSONAL_ORDER_STATUS_TABS.find(tab => tab.value === getPersonalOrderStatus(order.status))?.label || "");
  for (const key of ["createdAt", "scheduledShipDate", "shippedAt", "deliveredAt"]) {
    if (!order[key]) continue;
    const date = new Date(order[key]);
    if (Number.isNaN(date.getTime())) continue;
    values.push(new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date));
    values.push(new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai",year:"numeric",month:"long",day:"numeric"}).format(date));
  }
  return normalizeOrderKeyword(values.join(" "));
}

// ─── 我的订单 Tab ─────────────────────────────────────────────────────────────
function OrdersTab() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const orderCardRefs = useRef(new Map<number, { current: HTMLDivElement | null }>());
  const getOrderCardRef = (orderId: number) => {
    if (!orderCardRefs.current.has(orderId)) orderCardRefs.current.set(orderId, { current: null });
    return orderCardRefs.current.get(orderId)!;
  };
  const {
    data: orders,
    isLoading,
    isError,
    refetch: refetchOrders,
  } = mtrpc.order.myOrders.useQuery(undefined, { enabled: isAuthenticated });
  const confirmMutation = mtrpc.order.confirmReceipt.useMutation({
    onSuccess: () => {
      toast.success("确认收货成功！");
      refetchOrders();
    },
    onError: (e: any) => toast.error(e.message ?? "操作失败"),
  });
  const updateAddressMutation = mtrpc.order.updateAddress.useMutation({
    onSuccess: () => {
      toast.success("地址修改成功！");
      refetchOrders();
      setEditAddressOrderId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "修改失败"),
  });
  // 售后申请
  const aftersaleMut = mtrpc.aftersale.submit.useMutation({
    onSuccess: () => {
      toast.success("售后申请已提交，客服将尽快处理");
      setAftersaleOrderId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "申请失败"),
  });
  const [now, setNow] = useState(Date.now());
  const [showPrivacy, setShowPrivacy] = useState(true);
  const [editAddressOrderId, setEditAddressOrderId] = useState<number | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  // 售后申请弹窗
  const [aftersaleOrderId, setAftersaleOrderId] = useState<number | null>(null);
  const [aftersaleOrderNo, setAftersaleOrderNo] = useState<string>("");
  const [aftersaleType, setAftersaleType] = useState<
    "refund" | "exchange" | "complaint"
  >("refund");
  const [aftersaleReason, setAftersaleReason] = useState<string>("");
  // ⚠️ 必须在所有条件性 return 之前声明，否则违反 React hooks 规则
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const orderSearchIndex = useMemo(() => new Map((orders ?? []).map(order => [
    order.id,
    getPersonalOrderSearchText({
      ...order,
      userName: order.userName || user?.name || user?.username || "本人",
      userUsername: order.userUsername || user?.username || "",
    }),
  ])), [orders, user?.name, user?.username]);

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  if (isError && !orders)
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Package className="w-10 h-10 mb-3 text-gray-300" />
        <p className="text-[13px] text-gray-500 mb-5">订单加载失败，请重试</p>
        <button
          onClick={() => refetchOrders()}
          className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
          style={{ background: "#FF6900" }}
        >
          重新加载
        </button>
      </div>
    );

  // 只统计本人接口返回的订单；订阅每一期都是一笔，不以折叠卡片数或商品件数计数。
  const allOrders = orders ?? [];
  const searchTerms = normalizeOrderKeyword(searchText).trim().split(/\s+/).filter(Boolean);
  const hasSearch = searchTerms.length > 0;
  const matchingOrders = hasSearch ? allOrders.filter(order => {
    const content = orderSearchIndex.get(order.id) || "";
    return searchTerms.every(term => content.includes(term));
  }) : allOrders;
  const statusCounts = Object.fromEntries(PERSONAL_ORDER_STATUS_TABS.map(tab => [
    tab.value,
    tab.value === "all" ? matchingOrders.length : matchingOrders.filter(order => getPersonalOrderStatus(order.status) === tab.value).length,
  ]));
  const filteredOrders = statusFilter === "all"
    ? matchingOrders
    : matchingOrders.filter(order => getPersonalOrderStatus(order.status) === statusFilter);

  // ─── 订阅分组：将同一 subscriptionGroupId 的订单合并 ───────────────────────
  type OrderItem = (typeof orders)[0] & {
    subscriptionGroupId?: string;
    subscriptionMonths?: number;
    subscriptionIndex?: number;
    scheduledShipDate?: string;
  };

  const { singleOrders, subscriptionGroups } = (() => {
    const singles: OrderItem[] = [];
    const groups: Map<string, OrderItem[]> = new Map();
    for (const o of filteredOrders as OrderItem[]) {
      // 查看具体状态时直接显示每期订单，避免藏在订阅折叠中，让数量与列表一致。
      if (o.subscriptionGroupId && statusFilter === "all" && !hasSearch) {
        const g = groups.get(o.subscriptionGroupId) ?? [];
        g.push(o);
        groups.set(o.subscriptionGroupId, g);
      } else {
        singles.push(o);
      }
    }
    // 每组内按 subscriptionIndex 排序
    for (const [k, v] of groups.entries()) {
      groups.set(
        k,
        v.sort(
          (a, b) => (a.subscriptionIndex ?? 0) - (b.subscriptionIndex ?? 0)
        )
      );
    }
    return { singleOrders: singles, subscriptionGroups: groups };
  })();

  // 将订阅组和单次订单合并成一个渲染列表（订阅组按第1期的 createdAt 排序）
  const renderList: Array<
    | { type: "single"; order: OrderItem }
    | { type: "group"; groupId: string; orders: OrderItem[] }
  > = [];
  for (const [groupId, groupOrders] of subscriptionGroups.entries()) {
    renderList.push({ type: "group", groupId, orders: groupOrders });
  }
  for (const o of singleOrders) {
    renderList.push({ type: "single", order: o });
  }
  // 按最新时间排序（取第一条订单的 createdAt）
  renderList.sort((a, b) => {
    const aTime =
      a.type === "single"
        ? new Date(a.order.createdAt).getTime()
        : new Date(a.orders[0].createdAt).getTime();
    const bTime =
      b.type === "single"
        ? new Date(b.order.createdAt).getTime()
        : new Date(b.orders[0].createdAt).getTime();
    return bTime - aTime;
  });

  // 单个订单卡片渲染函数（提取出来供订阅展开时复用）
  const renderOrderCard = (order: OrderItem, isSubChild = false) => {
    const status = STATUS_MAP[order.status] ?? {
      label: order.status,
      color: "text-gray-500 bg-gray-100",
    };
    const autoConfirmAt = order.autoConfirmAt
      ? new Date(order.autoConfirmAt).getTime()
      : null;
    const shippedAt = order.shippedAt
      ? new Date(order.shippedAt).getTime()
      : null;
    const confirmDeadline =
      autoConfirmAt ??
      (shippedAt ? shippedAt + 30 * 24 * 60 * 60 * 1000 : null);
    const msLeft = confirmDeadline ? Math.max(0, confirmDeadline - now) : 0;
    const totalMinutes = Math.floor(msLeft / (1000 * 60));
    const daysLeft = Math.min(30, Math.floor(totalMinutes / (60 * 24)));
    const hoursLeft = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minsLeft = totalMinutes % 60;
    const countdownText =
      msLeft > 0
        ? daysLeft > 0
          ? `${daysLeft}天${hoursLeft}小时${minsLeft}分后自动确认`
          : hoursLeft > 0
            ? `${hoursLeft}小时${minsLeft}分后自动确认`
            : `${minsLeft}分钟后自动确认`
        : "即将自动确认收货";
    const ingredients: any[] = (() => {
      try {
        return JSON.parse(order.ingredients ?? "[]");
      } catch {
        return [];
      }
    })();
    const limitedProductLines = ingredients.filter(
      (item: any) => item?.kind === "limited_product"
    );
    const isLimitedProduct = limitedProductLines.length > 0;
    const limitedProductQuantity = limitedProductLines.reduce(
      (sum: number, item: any) => sum + Number(item.quantity || 0),
      0
    );
    const itemQuantityLabel = isLimitedProduct
      ? limitedProductLines.length === 1
        ? `${limitedProductLines[0].quantity}${limitedProductLines[0].unitLabel}`
        : `${limitedProductLines.length}款 · 共${limitedProductQuantity}件`
      : `${order.totalWeightJin} 斤`;
    const hasTracking = !!(order.trackingNo || order.trackingNumber);
    const trackingNo = order.trackingNo || order.trackingNumber || "";
    const trackingCompany = order.trackingCompany || "";
    const companyCodeMap: Record<string, string> = {
      顺丰: "shunfeng",
      SF: "shunfeng",
      圆通: "yuantong",
      中通: "zhongtong",
      韵达: "yunda",
      申通: "shentong",
      邮政: "youzhengguonei",
      EMS: "ems",
      京东: "jd",
      极兔: "jtexpress",
      菜鸟: "cainiao",
    };
    const companyCode =
      Object.entries(companyCodeMap).find(([k]) =>
        trackingCompany.includes(k)
      )?.[1] ?? "";
    const trackingUrl = companyCode
      ? `https://www.kuaidi100.com/chaxun?com=${companyCode}&nu=${trackingNo}`
      : `https://www.kuaidi100.com/chaxun?nu=${trackingNo}`;

    // 与管理员卡片使用同一成交快照口径，不用当前汇率重估历史订单。
    const orderTotalCny = Math.max(0, Number(order.totalPrice ?? 0));
    const paidCny = Math.max(0, Number(order.walletDeductCny ?? 0));
    const paidUsdt = Math.max(0, Number(order.walletDeductUsdt ?? 0));
    const displayOrderRate = Math.max(0, Number(order.usdtCnyRateAtOrder ?? 0)) ||
      (paidUsdt > 0 && orderTotalCny > paidCny ? (orderTotalCny - paidCny) / paidUsdt : 0);
    const orderTotalUsdt = displayOrderRate > 0 ? orderTotalCny / displayOrderRate : null;
    const singleLine = limitedProductLines.length === 1 ? limitedProductLines[0] : null;
    const singleQuantity = Number(singleLine?.quantity ?? 0);
    const singleUnit = singleLine?.unitLabel || "件";
    // 再来一单只进入商品/下单页面，用户仍需重新确认数量、地址与支付。
    const reorderHref = singleLine?.productKey
      ? `/p/proj_hzxm2t/limited/${encodeURIComponent(singleLine.productKey)}${singleLine.skuId ? `?sku=${encodeURIComponent(singleLine.skuId)}` : ""}`
      : isLimitedProduct ? "/p/proj_hzxm2t/limited"
      : String(order.recipeName ?? "").includes("天桂梨") ? "/p/proj_hzxm2t/pear/tiangui"
      : "/p/proj_hzxm2t/diy";
    const renderReorderButton = () => (
      <button
        data-card-export-hide="true"
        onClick={() => navigate(reorderHref)}
        className="flex h-7 items-center justify-center rounded-[3px] bg-emerald-600 px-2.5 text-[11px] font-semibold text-white max-[360px]:px-1.5"
      >
        再来一单
      </button>
    );
    const renderSaveImageButton = () => (
      <span data-card-export-hide="true" className="inline-flex shrink-0 [&>button]:rounded-[3px] [&>button]:text-[11px] [&>button]:px-1.5 [&>button]:gap-0.5 [&>button>svg]:h-3 [&>button>svg]:w-3 [&>button]:!bg-violet-600 [&>button]:!text-white [&>button]:!border-0">
        <OrderCardImageDownload
          targetRef={getOrderCardRef(order.id)}
          currentUser={user}
          orderNo={order.orderNo || order.id}
          color="#FFFFFF"
          buttonLabel="保存图片"
          captureFullContent
          outerPadding={12}
          fullContentHorizontalBleed={0}
          fullContentBottomPadding={12}
          exportBackground="#FFFFFF"
          watermarkMode="time-only"
          filenamePrefix="米伴个人订单"
          previewTitle="订单图片预览"
          previewHint="保留至下单时间及订单状态，不包含操作按钮"
        />
      </span>
    );
    const orderAmountSummary = orderTotalUsdt !== null
      ? singleLine && singleQuantity > 0
        ? `${(orderTotalUsdt / singleQuantity).toFixed(2)}U/${singleUnit} × ${singleQuantity}${singleUnit} = ${orderTotalUsdt.toFixed(2)}U`
        : `= ${orderTotalUsdt.toFixed(2)}U`
      : `¥${orderTotalCny.toFixed(2)}`;
    const hasWalletPaymentRecord = paidCny > 0.001 || paidUsdt > 0.000001;
    const walletEquivalent = displayOrderRate > 0
      ? paidUsdt + paidCny / displayOrderRate
      : paidCny <= 0.001 && paidUsdt > 0 ? paidUsdt : null;
    const walletPaymentSummary = walletEquivalent !== null ? `${walletEquivalent.toFixed(2)}U`
      : paidCny > 0 && paidUsdt <= 0 ? `¥${paidCny.toFixed(2)}` : "待核实";
    const ordererName = String(order.userName || user?.name || user?.username || "本人");
    const ordererUsername = String(order.userUsername || user?.username || "");
    const ordererAvatar = order.userAvatar || user?.avatar;
    const createdAtLabel = order.createdAt
      ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(new Date(order.createdAt)) : "--";

    return (
      <div
        key={order.id}
        ref={getOrderCardRef(order.id)}
        data-personal-order-id={order.id}
        className={`bg-white overflow-hidden ${isSubChild ? "border-l-2 border-orange-200 ml-2" : "rounded-2xl shadow-sm border border-gray-100"}`}
      >
        <div className="p-4 space-y-3">
          {/* 与管理员卡片一致的商品缩略图、名称、规格与成交价格。 */}
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-[#fcfcfc]">
            <div className="flex min-h-[64px]">
              {order.productImg ? (
                <img
                  src={order.productImg}
                  alt={order.recipeName || "商品图片"}
                  className="w-[76px] shrink-0 self-stretch object-cover"
                />
              ) : (
                <div className="flex w-[76px] shrink-0 self-stretch items-center justify-center bg-orange-50 text-orange-300">
                  <Package className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1 py-2.5 px-2.5">
                <h3 className="break-words text-[13px] font-bold leading-5 text-gray-800">
                  {order.recipeName || "定制米"}
                </h3>
                {isLimitedProduct ? (
                  <div className="mt-1 space-y-0.5">
                    {limitedProductLines.map((line: any, index: number) => (
                      <div key={`${line.productKey || line.name}-${line.skuId || index}`} className="flex min-w-0 items-start gap-1 text-[10px] leading-4">
                        <span className="min-w-0 flex-1 break-words text-gray-500">
                          {limitedProductLines.length > 1
                            ? Array.from(new Set([line.name, line.skuName, line.netContentText].filter(Boolean))).join(" · ")
                            : line.netContentText || line.skuName || line.name}
                          {` × ${line.quantity}${line.unitLabel}`}
                        </span>
                        {index === 0 && (
                          <span className="shrink-0 whitespace-nowrap font-bold text-[#FF6900]">
                            {limitedProductLines.length > 1 ? "合计 " : ""}¥{orderTotalCny.toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-gray-500">
                    {itemQuantityLabel}
                    <span className="ml-2 font-bold text-[#FF6900]">¥{orderTotalCny.toFixed(2)}</span>
                  </div>
                )}
                {(order.subscriptionIndex || order.scheduledShipDate) && (
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-orange-500">
                    {order.subscriptionIndex && <span>第{order.subscriptionIndex}期</span>}
                    {order.scheduledShipDate && <span>计划发货：{order.scheduledShipDate}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 配比功能保留，默认折叠使普通米订单也保持简洁。 */}
          {!isLimitedProduct && ingredients.length > 0 && (
            <details className="border-b border-gray-100 pb-2">
              <summary className="cursor-pointer text-[11px] font-medium text-gray-400">米种配比明细</summary>
              <div className="pt-3">
                {(() => {
              const totalW =
                ingredients.reduce(
                  (s: number, ing: any) => s + (ing.weightJin || 0),
                  0
                ) ||
                Number(order.totalWeightJin) ||
                1;
              const slices = ingredients.map((ing: any) => ({
                ...ing,
                pct:
                  ing.percentage ?? Math.round((ing.weightJin / totalW) * 100),
                color: ing.colorHex ?? "#C8A87A",
              }));
              const R = 44;
              const cx = 52;
              const cy = 52;
              let cumAngle = -Math.PI / 2;
              const paths = slices.map((s: any) => {
                const angle = (s.pct / 100) * 2 * Math.PI;
                const x1 = cx + R * Math.cos(cumAngle);
                const y1 = cy + R * Math.sin(cumAngle);
                cumAngle += angle;
                const x2 = cx + R * Math.cos(cumAngle);
                const y2 = cy + R * Math.sin(cumAngle);
                const large = angle > Math.PI ? 1 : 0;
                const d =
                  slices.length === 1
                    ? `M ${cx} ${cy} m -${R} 0 a ${R} ${R} 0 1 1 ${R * 2} 0 a ${R} ${R} 0 1 1 -${R * 2} 0`
                    : `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
                return { ...s, d };
              });
              return (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <svg width="104" height="104" viewBox="0 0 104 104">
                      {paths.map((p: any, i: number) => (
                        <path
                          key={i}
                          d={p.d}
                          fill={p.color}
                          stroke="white"
                          strokeWidth="1.5"
                        />
                      ))}
                      <circle cx={cx} cy={cy} r="22" fill="white" />
                      <text
                        x={cx}
                        y={cy - 5}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#999"
                        fontFamily="system-ui"
                      >
                        总计
                      </text>
                      <text
                        x={cx}
                        y={cy + 8}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="bold"
                        fill="#333"
                        fontFamily="system-ui"
                      >
                        {totalW}斤
                      </text>
                    </svg>
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {slices.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="text-[12px] text-gray-700 flex-1 truncate">
                          {s.name}
                        </span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {s.weightJin}斤
                        </span>
                        <span
                          className="text-[11px] font-bold flex-shrink-0 w-8 text-right"
                          style={{ color: s.color }}
                        >
                          {s.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
                })()}
              </div>
            </details>
          )}

          {/* ── 收货信息 ── */}
          <div className="space-y-2 border-t border-gray-100 pt-2.5">
            <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2 text-[12px] leading-4">
              <span className="flex items-center gap-1 font-medium text-gray-400">
                收货人
                <button
                  data-card-export-hide="true"
                  onClick={() => setShowPrivacy(v => !v)}
                  aria-label={showPrivacy ? "显示收货详情" : "隐藏收货详情"}
                  title={showPrivacy ? "显示收货详情" : "隐藏收货详情"}
                  className="text-gray-400 active:opacity-70 transition-opacity"
                >
                  {showPrivacy ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                </button>
              </span>
              <span className="min-w-0 break-words text-right font-semibold text-gray-700">
                {order.receiverName || "未填写收货人"}
                {order.receiverPhone && <span className="ml-2">
                  {showPrivacy
                    ? (order.receiverPhone ?? "").replace(
                        /(\d{3})\d{4}(\d{4})/,
                        "$1****$2"
                      )
                    : order.receiverPhone}
                </span>}
              </span>
            </div>
            <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2 text-[12px] leading-4">
              <span className="font-medium text-gray-400">收货地址</span>
              <span className="min-w-0 break-words text-right font-semibold text-gray-700">
                {showPrivacy
                  ? (() => {
                      const a = dedupeAddress(order.receiverAddress ?? "");
                      if (a.length <= 10) return a || "未填写收货地址";
                      return a.slice(0, 8) + "***" + a.slice(-6);
                    })()
                  : dedupeAddress(order.receiverAddress ?? "") || "未填写收货地址"}
              </span>
            </div>
            {order.userNote && (
              <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2 text-[12px] leading-4">
                <span className="font-medium text-gray-400">订单备注</span>
                <span className="min-w-0 break-words text-right font-medium text-amber-700">{order.userNote}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t border-gray-100 pt-2.5 text-[11px] leading-4">
            <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
              <span className="font-medium text-gray-400">订单金额</span>
              <span className="min-w-0 break-words text-right font-semibold text-gray-700">{orderAmountSummary}</span>
            </div>
            <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
              <span className="font-medium text-gray-400">
                {order.status === "cancelled" ? "原钱包实扣" : hasWalletPaymentRecord ? "钱包实扣" : "支付记录"}
              </span>
              <span className={`min-w-0 break-words text-right font-semibold ${order.status === "cancelled" ? "text-red-600" : "text-gray-700"}`}>
                {hasWalletPaymentRecord ? walletPaymentSummary : "待核实"}
              </span>
            </div>
          </div>

          <div className="flex items-stretch justify-between gap-2 border-t border-gray-100 pt-2.5">
            <div className="min-w-0 flex-1 space-y-1 text-[11px] leading-4">
              <div className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-2">
                <span className="font-medium text-gray-400">订单号</span>
                <span className="min-w-0 break-all text-right font-semibold text-gray-600">{order.orderNo || `#${order.id}`}</span>
              </div>
              <div className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-2">
                <span className="font-medium text-gray-400">下单人</span>
                <span className="flex w-full min-w-0 items-center justify-end gap-1.5 text-right font-semibold text-gray-600">
                  {ordererAvatar ? (
                    <img src={ordererAvatar} alt={`${ordererName}头像`} className="h-4 w-4 shrink-0 rounded-full border border-gray-100 object-cover" onError={event => { event.currentTarget.style.display = "none"; }} />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400"><User className="h-2.5 w-2.5" /></span>
                  )}
                  <span className="min-w-0 break-words text-right">
                    {ordererName}
                    {ordererUsername && ordererUsername !== ordererName && (
                      <span className="font-normal text-gray-400">{`（${ordererUsername}）`}</span>
                    )}
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-2">
                <span className="font-medium text-gray-400">下单时间</span>
                <span className="min-w-0 break-words text-right font-semibold text-gray-600">{createdAtLabel}</span>
              </div>
            </div>
            {/* 个人页仅消费订单状态，不开放管理员状态下拉或删单功能。 */}
            {order.status !== "pending" && (
              <div className="flex shrink-0 items-end">
                <span className={`flex h-7 items-center justify-center rounded-[3px] px-2.5 text-[11px] font-semibold ${status.color}`}>
                  {status.label}
                </span>
              </div>
            )}
          </div>

          {/* ── 物流信息 ── */}
          {hasTracking ? (
            <div data-card-export-hide="true" className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-green-500" />
                <div>
                  <span className="text-[12px] font-medium text-gray-700">
                    {trackingCompany || "快递"}
                  </span>
                  <span className="text-[11px] text-gray-400 ml-1.5 font-mono">
                    {trackingNo}
                  </span>
                </div>
              </div>
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                style={{ background: "#FF6900" }}
              >
                查物流 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            order.status !== "pending" &&
            order.status !== "cancelled" &&
            order.status !== "delivered" && (
              <div data-card-export-hide="true" className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-gray-300" />
                  <span className="text-[11px] text-gray-400">
                    配货完成后将更新物流信息
                  </span>
                </div>
              </div>
            )
          )}

          {order.status === "pending" && (
            <div data-personal-order-footer="true" className="flex items-center justify-end gap-1.5 border-t border-gray-100 pt-2 max-[360px]:gap-1">
              <span className={`flex h-7 items-center justify-center rounded-[3px] px-2.5 text-[11px] font-semibold max-[360px]:px-1.5 ${status.color}`}>
                {status.label}
              </span>
              <button
                data-card-export-hide="true"
                onClick={() => {
                  setEditAddressOrderId(order.id);
                  setEditName(order.receiverName ?? "");
                  setEditPhone(order.receiverPhone ?? "");
                  setEditAddress(order.receiverAddress ?? "");
                }}
                className="flex h-7 items-center justify-center rounded-[3px] bg-sky-600 px-2.5 text-[11px] font-semibold text-white max-[360px]:px-1.5"
              >
                修改地址
              </button>
              {renderReorderButton()}
              {renderSaveImageButton()}
            </div>
          )}

          {/* ── 管理员备注 ── */}
          {order.adminNote && (
            <div data-card-export-hide="true" className="bg-amber-50 rounded-xl px-3 py-2 flex items-start gap-1.5">
              <span className="text-[11px] text-amber-600 font-semibold flex-shrink-0">
                客服备注：
              </span>
              <span className="text-[11px] text-amber-700">
                {order.adminNote}
              </span>
            </div>
          )}

          {/* ── 确认收货（已发货状态） ── */}
          {order.status === "shipped" && (
            <div data-card-export-hide="true" className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-amber-600">
                    {countdownText}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("确认已收到货物？")) {
                      confirmMutation.mutate({ orderId: order.id });
                    }
                  }}
                  disabled={confirmMutation.isPending}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white active:scale-95 transition-transform disabled:opacity-60"
                  style={{ background: "#FF6900" }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  确认收货
                </button>
              </div>
            </div>
          )}

          {/* ── 去评价（已送达状态；静态限时商品首发暂不开评价） ── */}
          {order.status === "delivered" && !isLimitedProduct && (
            <div data-card-export-hide="true" className="pt-2 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => {
                  window.location.href = `/p/proj_hzxm2t/review?orderId=${order.id}`;
                }}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-[12px] font-semibold active:scale-95 transition-transform border border-amber-400 text-amber-600 bg-amber-50"
              >
                <Star className="w-3.5 h-3.5" />
                去评价
              </button>
            </div>
          )}
          {/* ── 申请售后（已发货/已送达状态） ── */}
          {order.status !== "pending" && (
            <div data-card-export-hide="true" className="flex items-center justify-end gap-1.5 pt-1">
              {(order.status === "shipped" || order.status === "delivered") && (
                <button
                  onClick={() => {
                    setAftersaleOrderId(order.id);
                    setAftersaleOrderNo(order.orderNo ?? "");
                    setAftersaleType("refund");
                    setAftersaleReason("");
                  }}
                  className="flex h-7 items-center justify-center rounded-[3px] bg-slate-600 px-2.5 text-[11px] font-semibold text-white"
                >
                  申请售后
                </button>
              )}
              {renderReorderButton()}
              {renderSaveImageButton()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="订单状态筛选" className="grid grid-cols-5 gap-1">
        {PERSONAL_ORDER_STATUS_TABS.map(tab => {
          const selected = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${tab.label}，${statusCounts[tab.value]}笔订单`}
              data-order-status-filter={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-[3px] py-2 transition-colors ${selected ? "bg-orange-600 text-white" : "bg-white text-gray-500"}`}
            >
              <span className={`text-[18px] font-bold leading-5 ${selected ? "text-white" : "text-gray-700"}`}>{statusCounts[tab.value]}</span>
              <span className="whitespace-nowrap text-[11px] leading-4">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div role="search" className="flex items-center gap-2 rounded-[3px] border border-gray-200 bg-white px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="search"
          aria-label="搜索订单关键词"
          placeholder="搜索订单内任意关键词"
          value={searchText}
          onChange={event => setSearchText(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-gray-700 outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {searchText && (
          <button type="button" aria-label="清空订单搜索" onClick={() => setSearchText("")} className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {hasSearch && <p className="text-[11px] text-gray-400">当前筛选 {filteredOrders.length} 笔订单</p>}
      {filteredOrders.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Package className="mb-3 h-10 w-10 text-gray-200" />
          <p className="text-[13px] text-gray-400">{!allOrders.length ? "还没有订单记录" : hasSearch ? "没有匹配的订单，试试其他关键词或状态" : "暂无对应状态订单"}</p>
          {!allOrders.length && (
            <Link href="/p/proj_hzxm2t/diy">
              <button className="mt-5 rounded-[3px] bg-orange-600 px-5 py-2 text-[13px] font-semibold text-white">去 DIY 工坊下单</button>
            </Link>
          )}
        </div>
      )}
      {renderList.map(item => {
        if (item.type === "single") {
          return renderOrderCard(item.order);
        }
        // ── 订阅组卡片 ──
        const { groupId, orders: groupOrders } = item;
        const firstOrder = groupOrders[0];
        const subMonths = firstOrder.subscriptionMonths ?? groupOrders.length;
        const totalGroupPrice = groupOrders.reduce(
          (s, o) => s + Number(o.totalPrice),
          0
        );
        const isExpanded = expandedGroups.has(groupId);
        const completedCount = groupOrders.filter(
          o => o.status === "delivered"
        ).length;
        const shippedCount = groupOrders.filter(
          o => o.status === "shipped"
        ).length;
        const pendingCount = groupOrders.filter(
          o => o.status === "pending"
        ).length;
        return (
          <div
            key={groupId}
            className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden"
          >
            {/* 订阅组头部 */}
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-[#FF6900]">
                    订阅计划
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">
                    {subMonths}期
                  </span>
                  <span className="text-[11px] text-gray-400">
                    共{groupOrders.length}单
                  </span>
                </div>
                <span className="text-[16px] font-bold text-black">
                  ¥{totalGroupPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[11px] text-gray-500">
                  {firstOrder.recipeName || "定制米"} ·{" "}
                  {firstOrder.totalWeightJin}斤/期
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {completedCount > 0 && (
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      已完成{completedCount}
                    </span>
                  )}
                  {shippedCount > 0 && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                      运输中{shippedCount}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                      待发货{pendingCount}
                    </span>
                  )}
                </div>
              </div>
              {/* 进度条 */}
              <div className="mt-2 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF6900] rounded-full transition-all"
                  style={{
                    width: `${(completedCount / groupOrders.length) * 100}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-400">
                  进度 {completedCount}/{groupOrders.length}
                </span>
                <button
                  onClick={() =>
                    setExpandedGroups(prev => {
                      const next = new Set(prev);
                      if (next.has(groupId)) next.delete(groupId);
                      else next.add(groupId);
                      return next;
                    })
                  }
                  className="flex items-center gap-1 text-[11px] text-[#FF6900] font-semibold active:opacity-70"
                >
                  {isExpanded ? "收起" : "展开明细"}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
              </div>
            </div>
            {/* 展开的子订单列表 */}
            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {groupOrders.map(o => renderOrderCard(o, true))}
              </div>
            )}
          </div>
        );
      })}

      {/* 修改地址弹窗 */}
      {editAddressOrderId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setEditAddressOrderId(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[16px] font-bold text-black">修改收货地址</h3>
              <button
                onClick={() => setEditAddressOrderId(null)}
                className="text-gray-400 text-[20px] leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">
                  收货人
                </label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="姓名"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">
                  手机号
                </label>
                <input
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="手机号"
                  type="tel"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">
                  收货地址
                </label>
                <textarea
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  placeholder="请输入完整收货地址"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-orange-400 resize-none"
                />
              </div>
            </div>
            <button
              onClick={() =>
                updateAddressMutation.mutate({
                  orderId: editAddressOrderId,
                  receiverName: editName,
                  receiverPhone: editPhone,
                  receiverAddress: editAddress,
                })
              }
              disabled={
                updateAddressMutation.isPending ||
                !editName.trim() ||
                !editPhone.trim() ||
                !editAddress.trim()
              }
              className="w-full py-3 rounded-xl text-[15px] font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: "#FF6900" }}
            >
              {updateAddressMutation.isPending ? "提交中..." : "确认修改"}
            </button>
          </div>
        </div>
      )}
      {/* 售后申请弹窗 */}
      {aftersaleOrderId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setAftersaleOrderId(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[16px] font-bold text-black">申请售后</h3>
              <button
                onClick={() => setAftersaleOrderId(null)}
                className="text-gray-400 text-[20px] leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-[12px] text-gray-400">
              订单号：{aftersaleOrderNo}
            </p>
            {/* 售后类型 */}
            <div>
              <label className="text-[12px] text-gray-500 mb-2 block">
                售后类型
              </label>
              <div className="flex gap-2">
                {(
                  [
                    ["refund", "退款"],
                    ["exchange", "换货"],
                    ["complaint", "投诉"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setAftersaleType(k)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-medium border transition-colors"
                    style={{
                      background: aftersaleType === k ? "#FF6900" : "#fff",
                      color: aftersaleType === k ? "#fff" : "#6b7280",
                      borderColor: aftersaleType === k ? "#FF6900" : "#e5e7eb",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {/* 原因 */}
            <div>
              <label className="text-[12px] text-gray-500 mb-1 block">
                问题描述
              </label>
              <textarea
                value={aftersaleReason}
                onChange={e => setAftersaleReason(e.target.value)}
                placeholder="请详细描述您遇到的问题，以便我们尽快处理"
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-orange-400 resize-none"
              />
            </div>
            <button
              onClick={() => {
                if (!aftersaleReason.trim()) {
                  toast.error("请填写问题描述");
                  return;
                }
                aftersaleMut.mutate({
                  orderId: aftersaleOrderId,
                  orderNo: aftersaleOrderNo,
                  type: aftersaleType,
                  reason: aftersaleReason,
                });
              }}
              disabled={aftersaleMut.isPending}
              className="w-full py-3 rounded-xl text-[15px] font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: "#FF6900" }}
            >
              {aftersaleMut.isPending ? "提交中..." : "提交申请"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 我的配方 Tab ─────────────────────────────────────────────────────────────
function RecipesTab() {
  const { isAuthenticated } = useAuth();
  const {
    data: recipes,
    isLoading,
    refetch,
  } = mtrpc.recipe.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteMutation = mtrpc.recipe.delete.useMutation({
    onSuccess: () => {
      toast.success("配方已删除");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  if (!recipes?.length)
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <BookOpen className="w-10 h-10 mb-3 text-gray-200" />
        <p className="text-[13px] text-gray-400 mb-5">还没有保存任何配方</p>
        <Link href="/p/proj_hzxm2t/diy">
          <button
            className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
            style={{ background: "#FF6900" }}
          >
            去 DIY 工坊创建
          </button>
        </Link>
      </div>
    );

  return (
    <div className="space-y-3">
      {(recipes ?? []).map((recipe: any) => {
        const ingredients: any[] = (() => {
          try {
            return JSON.parse(recipe.ingredients ?? "[]");
          } catch {
            return [];
          }
        })();
        return (
          <div
            key={recipe.id}
            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-[15px] font-bold text-black">
                  {recipe.name}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(recipe.createdAt).toLocaleDateString("zh-CN")} 保存
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/p/proj_hzxm2t/diy`}>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                    style={{ background: "#FF6900" }}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    再次购买
                  </button>
                </Link>
                <button
                  onClick={() => deleteMutation.mutate({ id: recipe.id })}
                  className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {ingredients.length > 0 && (
              <div>
                <div className="h-2 rounded-full overflow-hidden flex mb-2">
                  {ingredients.map((ing: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        width: `${ing.percentage}%`,
                        backgroundColor: ing.colorHex ?? "#C8A87A",
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ingredients.map((ing: any, i: number) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-[11px] text-gray-400"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }}
                      />
                      {ing.name} {ing.percentage}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recipe.totalPricePerJin && (
              <p
                className="text-[14px] font-bold mt-3"
                style={{ color: "#FF6900" }}
              >
                ¥{Number(recipe.totalPricePerJin).toFixed(2)}
                <span className="text-[11px] font-normal text-gray-400">
                  /斤
                </span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 我的收藏 Tab（含喜欢的米 + 我的配方）─────────────────────────────────────
function FavoritesTab() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [subTab, setSubTab] = useState<"rice" | "recipe">("rice");

  // 商品收藏
  const { data: favProducts, refetch: refetchFavProducts } =
    mtrpc.favorite.myList.useQuery(undefined, { enabled: isAuthenticated });
  const toggleFav = mtrpc.favorite.toggle.useMutation({
    onSuccess: () => {
      refetchFavProducts();
      toast.success("已取消收藏");
    },
  });

  // 配方收藏
  const {
    data: savedRecipes,
    isLoading: savedLoading,
    refetch: refetchSaved,
  } = mtrpc.savedRecipes.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteSaved = mtrpc.savedRecipes.delete.useMutation({
    onSuccess: () => {
      toast.success("已取消斖藏");
      refetchSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // 我的配方（DIY保存）
  const {
    data: myRecipes,
    isLoading: recipesLoading,
    refetch: refetchRecipes,
  } = mtrpc.recipe.list.useQuery(undefined, { enabled: isAuthenticated });
  const deleteRecipe = mtrpc.recipe.delete.useMutation({
    onSuccess: () => {
      toast.success("配方已删除");
      refetchRecipes();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const addToCart = mtrpc.cart.addBatch.useMutation({
    onSuccess: () => toast.success("已加入购物车"),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* 子分类切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("rice")}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            background: subTab === "rice" ? "#FF6900" : "#F0F0F0",
            color: subTab === "rice" ? "#fff" : "#888",
          }}
        >
          ❤️ 喜欢的米
        </button>
        <button
          onClick={() => setSubTab("recipe")}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            background: subTab === "recipe" ? "#FF6900" : "#F0F0F0",
            color: subTab === "recipe" ? "#fff" : "#888",
          }}
        >
          📝 我的配方
        </button>
      </div>

      {subTab === "rice" && (
        <div className="space-y-4">
          {/* 商品收藏分区 */}
          <div>
            <h3 className="text-[13px] font-bold text-gray-500 mb-2">
              收藏商品
            </h3>
            {!favProducts || favProducts.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 text-center">
                <Heart className="w-8 h-8 mb-2 text-gray-200 mx-auto" />
                <p className="text-[12px] text-gray-400">还没有收藏任何商品</p>
              </div>
            ) : (
              <div className="space-y-2">
                {favProducts.map((item: any) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm"
                  >
                    {item.productImg ? (
                      <img
                        src={item.productImg}
                        alt={item.productName}
                        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Heart className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-black truncate">
                        {item.productName}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(item.createdAt).toLocaleDateString("zh-CN")}{" "}
                        收藏
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.productUrl && (
                        <button
                          onClick={() => navigate(item.productUrl)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                          style={{ background: "#FF6900" }}
                        >
                          查看
                        </button>
                      )}
                      <button
                        onClick={() =>
                          toggleFav.mutate({
                            productKey: item.productKey,
                            productName: item.productName,
                          })
                        }
                        className="p-1.5 text-red-400 active:text-red-600 transition-colors"
                      >
                        <Heart
                          className="w-4 h-4"
                          style={{ fill: "#FF3B30", color: "#FF3B30" }}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "recipe" && (
        <div className="space-y-3">
          {(recipesLoading || savedLoading) && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          )}
          {/* DIY保存的配方 */}
          {(myRecipes ?? []).map((recipe: any) => {
            const ingredients: any[] = (() => {
              try {
                return JSON.parse(recipe.ingredients ?? "[]");
              } catch {
                return [];
              }
            })();
            return (
              <div
                key={recipe.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-black">
                      {recipe.name}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(recipe.createdAt).toLocaleDateString("zh-CN")}{" "}
                      保存
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => deleteRecipe.mutate({ id: recipe.id })}
                      className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {ingredients.length > 0 && (
                  <div>
                    <div className="h-2 rounded-full overflow-hidden flex mb-2">
                      {ingredients.map((ing: any, i: number) => (
                        <div
                          key={i}
                          style={{
                            width: `${ing.percentage}%`,
                            backgroundColor: ing.colorHex ?? "#C8A87A",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ingredients.map((ing: any, i: number) => (
                        <span
                          key={i}
                          className="flex items-center gap-1 text-[11px] text-gray-400"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: ing.colorHex ?? "#C8A87A",
                            }}
                          />
                          {ing.name} {ing.percentage}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {recipe.totalPricePerJin && (
                  <p
                    className="text-[14px] font-bold mt-3"
                    style={{ color: "#FF6900" }}
                  >
                    ¥{Number(recipe.totalPricePerJin).toFixed(2)}
                    <span className="text-[11px] font-normal text-gray-400">
                      /斤
                    </span>
                  </p>
                )}
              </div>
            );
          })}
          {/* 收藏的配方 */}
          {(savedRecipes ?? []).map((recipe: any) => {
            const items: any[] = (() => {
              try {
                return JSON.parse(recipe.items ?? "[]");
              } catch {
                return [];
              }
            })();
            return (
              <div
                key={recipe.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-black">
                      {recipe.recipeName || "收藏配方"}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(recipe.savedAt).toLocaleDateString("zh-CN")}{" "}
                      收藏
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!items.length) return;
                        addToCart.mutate({
                          recipeName: recipe.recipeName,
                          recipeId: recipe.recipeId,
                          items: items.map((it: any) => ({
                            riceId: it.riceId,
                            riceName: it.riceName,
                            weightJin: it.weightJin ?? 2,
                            pricePerJin: it.pricePerJin ?? 8,
                            ratio: it.ratio ?? 0,
                          })),
                        });
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                      style={{ background: "#FF6900" }}
                    >
                      <ShoppingCart className="w-3 h-3" />
                      加购
                    </button>
                    <button
                      onClick={() => deleteSaved.mutate({ id: recipe.id })}
                      className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((it: any, i: number) => (
                      <span
                        key={i}
                        className="text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100"
                      >
                        {it.riceName} {it.ratio}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!recipesLoading &&
            !savedLoading &&
            !myRecipes?.length &&
            !savedRecipes?.length && (
              <div className="flex flex-col items-center py-16 text-center">
                <BookOpen className="w-10 h-10 mb-3 text-gray-200" />
                <p className="text-[13px] text-gray-400 mb-5">
                  还没有保存任何配方
                </p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

// ─── 我的钱包 Tab ─────────────────────────────────────────────────────────────
// ─── 我的售后 Tab ─────────────────────────────────────────────────────────────
const MY_AFTERSALE_STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  approved: "已审批",
  rejected: "已拒绝",
  completed: "已完成",
};
const MY_AFTERSALE_STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50",
  approved: "text-blue-600 bg-blue-50",
  rejected: "text-red-500 bg-red-50",
  completed: "text-green-600 bg-green-50",
};
const MY_AFTERSALE_TYPE_LABELS: Record<string, string> = {
  refund: "退款",
  exchange: "换货",
  complaint: "投诉",
};

function MyAftersaleTab() {
  const { isAuthenticated } = useAuth();
  const { data: requests, isLoading } = mtrpc.aftersale.myRequests.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );

  if (!requests?.length)
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <ShoppingCart className="w-10 h-10 mb-3 text-gray-200" />
        <p className="text-[13px] text-gray-400 mb-2">暂无售后申请记录</p>
        <p className="text-[11px] text-gray-300">
          在已发货/已送达的订单中点"申请售后"
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {(requests as any[]).map((r: any) => (
        <div
          key={r.id}
          className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                  {MY_AFTERSALE_TYPE_LABELS[r.type] ?? r.type}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${MY_AFTERSALE_STATUS_COLORS[r.status] ?? "text-gray-500 bg-gray-100"}`}
                >
                  {MY_AFTERSALE_STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
              <p className="text-[12px] font-semibold text-black font-mono">
                {r.orderNo}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{r.reason}</p>
            </div>
            <p className="text-[10px] text-gray-300 flex-shrink-0">
              {new Date(r.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
          {r.adminReply && (
            <div className="bg-blue-50 rounded-xl px-3 py-2">
              <p className="text-[11px] text-blue-600">
                客服回复：{r.adminReply}
              </p>
            </div>
          )}
          {r.refundAmount && (
            <p className="text-[11px] text-green-600 mt-1">
              退款金额：¥{Number(r.refundAmount).toFixed(2)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamTab() {
  const { data: stats, isLoading: statsLoading } =
    mtrpc.agent.myMonthlyStats.useQuery();
  const { data: commissions, isLoading: commissionsLoading } =
    mtrpc.agent.myCommissions.useQuery();
  const { data: referrals, isLoading: referralsLoading } =
    mtrpc.agent.myReferrals.useQuery();
  const { data: inviteInfo } = mtrpc.invite.getMyInviteInfo.useQuery();

  const inviteLink =
    inviteInfo?.inviteLink ??
    (inviteInfo?.inviteCode
      ? `https://jiangyuchen.cn/login?invite=${inviteInfo.inviteCode}`
      : "");

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => toast.success("邀请链接已复制"));
  }

  return (
    <div className="space-y-4">
      {/* 本月收益统计 */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-4 text-white"
            style={{ background: "#FF6900" }}
          >
            <p className="text-[11px] text-white/70 mb-1">本月总佣金</p>
            <p className="text-[22px] font-bold">
              ¥{Number(stats?.totalCommission ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">待结算</p>
            <p className="text-[22px] font-bold text-amber-500">
              ¥{Number(stats?.pendingCommission ?? 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-300 mt-0.5">订单完成后结算</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">已结算</p>
            <p className="text-[22px] font-bold text-green-500">
              ¥{Number(stats?.settledCommission ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100">
            <p className="text-[11px] text-gray-400 mb-1">本月订单数</p>
            <p className="text-[22px] font-bold text-gray-800">
              {stats?.orderCount ?? 0}
              <span className="text-[13px] font-normal text-gray-400 ml-1">
                单
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 邀请码 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-start gap-4 mb-3">
          {/* 二维码 - 前端直接生成，无需后端请求 */}
          <div className="flex-shrink-0">
            {inviteLink ? (
              <div className="w-20 h-20 rounded-xl border border-gray-100 overflow-hidden p-1 bg-white">
                <QRCodeSVG value={inviteLink} size={68} level="M" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                <Skeleton className="w-20 h-20 rounded-xl" />
              </div>
            )}
          </div>
          {/* 邀请码 + 人数 */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 mb-1">我的邀请码</p>
            <p
              className="text-[26px] font-mono font-bold tracking-[0.2em] leading-none mb-2"
              style={{ color: "#FF6900" }}
            >
              {inviteInfo?.inviteCode ?? "——"}
            </p>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Users className="w-3.5 h-3.5" />
              已推荐{" "}
              <span className="font-semibold text-gray-700">
                {inviteInfo?.inviteCount ?? 0}
              </span>{" "}
              人
            </div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <p className="text-[11px] text-gray-400 flex-1 truncate">
            {inviteLink || "生成中…"}
          </p>
          <button
            onClick={copyLink}
            className="flex items-center gap-1 text-[12px] font-semibold flex-shrink-0 active:scale-95 transition-transform"
            style={{ color: "#FF6900" }}
          >
            <Copy className="w-3.5 h-3.5" />
            复制链接
          </button>
        </div>
      </div>

      {/* 推荐用户列表 */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">
          推荐用户 {referrals ? `(${referrals.length})` : ""}
        </h3>
        {referralsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : !referrals?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">
            暂无推荐用户
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((u: any) => (
              <div
                key={u.id}
                className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                  style={{ background: "#FF6900" }}
                >
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate">
                    {u.name ?? "匿名用户"}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString("zh-CN")
                      : ""}{" "}
                    加入
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-gray-400">已推荐</p>
                  <p className="text-[13px] font-medium text-gray-600">
                    {u.inviteCount} 人
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 佣金明细 */}
      <div>
        <h3 className="text-[13px] font-semibold text-gray-700 mb-3">
          佣金明细 {commissions ? `(${commissions.length})` : ""}
        </h3>
        {commissionsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : !commissions?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">
            暂无佣金记录
          </div>
        ) : (
          <div className="space-y-2">
            {commissions.map((c: any) => (
              <div
                key={c.id}
                className="bg-white border border-gray-100 rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] text-gray-400 font-mono">
                    {c.orderNo}
                  </p>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      c.status === "settled"
                        ? "bg-green-50 text-green-600"
                        : c.status === "cancelled"
                          ? "bg-red-50 text-red-500"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {c.status === "settled"
                      ? "已结算"
                      : c.status === "cancelled"
                        ? "已取消"
                        : "待结算"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400">
                    订单 ¥{Number(c.orderAmount).toFixed(2)} · 比例{" "}
                    {(Number(c.commissionRate) * 100).toFixed(1)}%
                  </p>
                  <p
                    className="text-[15px] font-bold"
                    style={{ color: "#FF6900" }}
                  >
                    +¥{Number(c.commissionAmount).toFixed(2)}
                  </p>
                </div>
                <p className="text-[10px] text-gray-300 mt-1">
                  {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
type TabKey =
  | "orders"
  | "recipes"
  | "favorites"
  | "team"
  | "address"
  | "aftersale";

export default function MyOrders() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab");
  const initialTab = (requestedTab === "wallet" ? "orders" : requestedTab as TabKey) || "orders";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // 钱包已独立，兼容以前的收藏链接与充值回跳。
  useEffect(() => {
    if (requestedTab === "wallet") setLocation("/p/proj_hzxm2t/wallet", { replace: true });
  }, [requestedTab, setLocation]);
  // 是否显示团队业绩 Tab（业务员/团队长/管理员）
  const showTeamTab =
    (user as any)?.mibanRole === "parent" ||
    (user as any)?.username === "jiang";
  const isAdmin = (user as any)?.username === "jiang";

  if (!isAuthenticated) {
    return (
      <div className="bg-white min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "#FF6900" }}
        >
          <User className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-[22px] font-bold text-black mb-2">我的</h1>
        <p className="text-[13px] text-gray-400 mb-8">
          登录后查看订单、配方等信息
        </p>
        <button
          onClick={() =>
            (window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`)
          }
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-semibold text-white active:scale-95 transition-transform"
          style={{ background: "#FF6900" }}
        >
          <User className="w-4 h-4" />
          登录后查看
        </button>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "orders", label: "订单", icon: <Package className="w-4 h-4" /> },
    { key: "favorites", label: "收藏", icon: <Heart className="w-4 h-4" /> },
    ...(showTeamTab
      ? [
          {
            key: "team" as TabKey,
            label: "团队",
            icon: <Users className="w-4 h-4" />,
          },
        ]
      : []),
    {
      key: "aftersale" as TabKey,
      label: "售后",
      icon: <ShoppingCart className="w-4 h-4" />,
    },
    {
      key: "address" as TabKey,
      label: "地址",
      icon: <MapPin className="w-4 h-4" />,
    },
  ];

  return (
    <div className="bg-[#F8F6F3] min-h-screen">
      {/* Tab 导航 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-gray-100">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: activeTab === tab.key ? "#fff" : "transparent",
                color: activeTab === tab.key ? "#FF6900" : "#888",
                boxShadow:
                  activeTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="px-4 py-4 pb-24">
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "favorites" && <FavoritesTab />}
        {activeTab === "team" && showTeamTab && <TeamTab />}
        {activeTab === "aftersale" && <MyAftersaleTab />}
        {activeTab === "address" && <AddressBook mode="manage" />}
      </div>
    </div>
  );
}
