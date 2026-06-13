/**
 * 牙伴齿科商城 - 后台运营管理（评价管理 + 首页Banner管理）
 * 路由：/yaban/shop/admin/ops
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Loader2, Star, MessageSquare, Image as ImageIcon,
  X, ImagePlus, Trash2, Plus,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";

type Tab = "reviews" | "banners";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? "text-[#FFB400] fill-[#FFB400]" : "text-gray-200 fill-gray-200"}`} />
      ))}
    </span>
  );
}

export default function YabanShopAdminOps() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("reviews");

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P314" />
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">运营管理</span>
        </div>
        <div className="flex px-3 pb-0">
          {[
            { key: "reviews" as Tab, label: "评价管理", icon: MessageSquare },
            { key: "banners" as Tab, label: "首页Banner", icon: ImageIcon },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                tab === t.key ? "border-white font-semibold" : "border-transparent text-white/70"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "reviews" ? <ReviewsPanel /> : <BannersPanel />}
    </div>
  );
}

function ReviewsPanel() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanShopOps.adminListReviews.useQuery({ limit: 100 });
  const reviews = (data ?? []) as any[];
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const reply = trpc.yabanShopOps.adminReplyReview.useMutation({
    onSuccess: () => { setReplyId(null); setReplyText(""); utils.yabanShopOps.adminListReviews.invalidate(); },
    onError: (e) => alert(e.message),
  });
  const setStatus = trpc.yabanShopOps.adminSetReviewStatus.useMutation({
    onSuccess: () => utils.yabanShopOps.adminListReviews.invalidate(),
    onError: (e) => alert(e.message),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...</div>;
  }
  if (reviews.length === 0) {
    return <div className="text-center py-24 text-gray-400 text-sm">暂无评价</div>;
  }

  return (
    <div className="px-3 pt-3 space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{r.userName}</span>
              <Stars rating={r.rating} />
            </div>
            <button
              onClick={() => setStatus.mutate({ id: r.id, status: r.status === 1 ? 0 : 1 })}
              className={`text-xs px-2 py-0.5 rounded-full ${r.status === 1 ? "bg-[#D1FAE5] text-[#059669]" : "bg-gray-100 text-gray-500"}`}
            >
              {r.status === 1 ? "已展示" : "已隐藏"}
            </button>
          </div>
          {r.content && <p className="text-[13px] text-gray-600 mt-2 leading-relaxed">{r.content}</p>}
          {r.images.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {r.images.map((img: string, i: number) => (
                <img key={i} src={img} alt="晒单" className="w-14 h-14 rounded-lg object-cover" />
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-300 mt-1.5">订单 {r.orderNo} · {r.createdAt}</p>

          {r.reply ? (
            <div className="mt-2 bg-[#F5F7FA] rounded-lg px-3 py-2">
              <p className="text-[12px] text-gray-500"><span className="text-[#2196C8] font-medium">商家回复：</span>{r.reply}</p>
              <button onClick={() => { setReplyId(r.id); setReplyText(r.reply); }} className="text-xs text-[#2196C8] mt-1">修改回复</button>
            </div>
          ) : (
            <button onClick={() => { setReplyId(r.id); setReplyText(""); }} className="text-xs text-[#2196C8] mt-2">回复</button>
          )}

          {replyId === r.id && (
            <div className="mt-2 space-y-2">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} placeholder="输入回复内容"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setReplyId(null)} className="flex-1 py-2 rounded-full bg-gray-100 text-gray-600 text-sm">取消</button>
                <button onClick={() => reply.mutate({ id: r.id, reply: replyText })} disabled={reply.isPending}
                  className="flex-1 py-2 rounded-full bg-[#2196C8] text-white text-sm disabled:opacity-50">保存回复</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BannersPanel() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanShopOps.adminListBanners.useQuery();
  const banners = (data ?? []) as any[];
  const [editing, setEditing] = useState<any | null>(null);

  const del = trpc.yabanShopOps.adminDeleteBanner.useMutation({
    onSuccess: () => utils.yabanShopOps.adminListBanners.invalidate(),
    onError: (e) => alert(e.message),
  });

  return (
    <div className="px-3 pt-3 space-y-3">
      <button
        onClick={() => setEditing({ id: 0, title: "", image: "", linkType: "none", linkValue: "", sortOrder: 0, status: 1 })}
        className="w-full py-2.5 rounded-full bg-[#2196C8] text-white text-sm font-medium flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" /> 新增 Banner
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">暂无 Banner，新增后将在商城首页轮播</div>
      ) : (
        banners.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl overflow-hidden">
            <img src={b.image} alt={b.title} className="w-full aspect-[2/1] object-cover" />
            <div className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-gray-700 truncate">{b.title || "（无标题）"}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  排序 {b.sortOrder} · {b.status === 1 ? "启用" : "停用"}
                  {b.linkType !== "none" ? ` · 跳转：${b.linkType}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditing(b)} className="text-xs text-[#2196C8]">编辑</button>
                <button onClick={() => { if (confirm("确认删除该 Banner？")) del.mutate({ id: b.id }); }} className="text-gray-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {editing && (
        <BannerEditor banner={editing} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); utils.yabanShopOps.adminListBanners.invalidate(); }} />
      )}
    </div>
  );
}

function BannerEditor({ banner, onClose, onDone }: { banner: any; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(banner.title || "");
  const [image, setImage] = useState(banner.image || "");
  const [linkType, setLinkType] = useState(banner.linkType || "none");
  const [linkValue, setLinkValue] = useState(banner.linkValue || "");
  const [sortOrder, setSortOrder] = useState(Number(banner.sortOrder || 0));
  const [status, setStatus] = useState(Number(banner.status ?? 1));
  const [uploading, setUploading] = useState(false);

  const upload = trpc.yabanProduct.uploadProductImage.useMutation();
  const save = trpc.yabanShopOps.adminSaveBanner.useMutation({
    onSuccess: () => onDone(),
    onError: (e) => alert(e.message),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((res, rej) => {
        reader.onload = () => res(String(reader.result));
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const r = await upload.mutateAsync({ imageData: dataUrl });
      if ((r as any)?.url) setImage((r as any).url);
    } catch (err: any) {
      alert("图片上传失败：" + (err?.message || ""));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-base font-bold text-gray-800">{banner.id ? "编辑 Banner" : "新增 Banner"}</span>
          <button onClick={onClose} aria-label="关闭"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-4 py-4 space-y-3" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
          {/* 图片 */}
          <div>
            <label className="text-sm text-gray-600">Banner 图片（建议 2:1）</label>
            {image ? (
              <div className="relative mt-2">
                <img src={image} alt="预览" className="w-full aspect-[2/1] object-cover rounded-lg" />
                <label className="absolute bottom-2 right-2 px-3 py-1 rounded-full bg-black/50 text-white text-xs cursor-pointer">
                  更换
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
              </div>
            ) : (
              <label className="mt-2 w-full aspect-[2/1] rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer">
                {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                <span className="text-xs mt-1">{uploading ? "上传中..." : "点击上传图片"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
              </label>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-600">标题（选填）</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="活动标题"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          </div>

          <div>
            <label className="text-sm text-gray-600">点击跳转</label>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="none">不跳转</option>
              <option value="product">商品详情（填商品编码）</option>
              <option value="coupon">领券中心</option>
              <option value="url">外部链接（填网址）</option>
            </select>
          </div>

          {(linkType === "product" || linkType === "url") && (
            <div>
              <label className="text-sm text-gray-600">{linkType === "product" ? "商品编码" : "链接地址"}</label>
              <input value={linkValue} onChange={(e) => setLinkValue(e.target.value)}
                placeholder={linkType === "product" ? "如 db5" : "https://..."}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-600">排序（小在前）</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-sm text-gray-600">状态</label>
              <select value={status} onChange={(e) => setStatus(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value={1}>启用</option>
                <option value={0}>停用</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              if (!image) { alert("请先上传 Banner 图片"); return; }
              save.mutate({
                id: banner.id || undefined,
                title, image, linkType: linkType as any,
                linkValue, sortOrder, status,
              });
            }}
            disabled={save.isPending}
            className="w-full py-3 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-semibold disabled:opacity-50"
          >
            {save.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
