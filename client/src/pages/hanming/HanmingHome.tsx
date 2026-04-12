/**
 * 汉明 - 公司产品详情页
 * 路径: /hanming
 * 汉明用户（userId=4957321）专属页面
 */
import { useState, useRef, useCallback } from "react";
import { Users, Images, Upload, Trash2, X, ZoomIn, ChevronLeft, Loader2, Package, Star, Phone } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type TabType = "products" | "members";

// ===== 会员图库组件 =====
function MemberGallery({ memberId, memberName, onBack }: { memberId: number; memberName: string; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { isAuthenticated } = useAuth();

  const utils = trpc.useUtils();
  const { data: images = [], isLoading } = trpc.hanmingGetMemberGallery.useQuery({ memberId });

  const uploadMutation = trpc.hanmingUploadMemberGallery.useMutation({
    onSuccess: () => {
      utils.hanmingGetMemberGallery.invalidate({ memberId });
      utils.hanmingGetMembers.invalidate();
      setUploading(false);
      toast.success("图片上传成功");
    },
    onError: (err) => {
      toast.error(err.message || "上传失败");
      setUploading(false);
    },
  });

  const deleteMutation = trpc.hanmingDeleteMemberGallery.useMutation({
    onSuccess: () => {
      utils.hanmingGetMemberGallery.invalidate({ memberId });
      utils.hanmingGetMembers.invalidate();
      toast.success("图片已删除");
    },
    onError: (err) => toast.error(err.message || "删除失败"),
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片不能超过 10MB");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      uploadMutation.mutate({
        memberId,
        imageBase64: base64,
        mimeType: file.type,
        title: file.name.replace(/\.[^.]+$/, ""),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [uploadMutation, memberId]);

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0D0D]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#0D0D0D] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <span className="text-white font-semibold text-sm">{memberName} 的图库</span>
        {isAuthenticated && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 bg-[#C62828] hover:bg-[#B71C1C] disabled:opacity-50 text-white rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "上传中..." : "上传"}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* 图库内容 */}
      <div className="flex-1 px-3 py-4 pb-28">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#C62828] animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Images className="w-14 h-14 text-white/15 mb-4" />
            <p className="text-white/40 text-sm">暂无图片</p>
            {isAuthenticated && <p className="text-white/25 text-xs mt-1.5">点击右上角「上传」添加图片</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative group rounded-xl overflow-hidden bg-white/5 aspect-[3/4]">
                <img
                  src={img.imageUrl}
                  alt={img.title || "图库图片"}
                  className="w-full h-full object-cover cursor-pointer transition-transform duration-200 active:scale-95"
                  loading="lazy"
                  onClick={() => setLightboxUrl(img.imageUrl)}
                />
                <div
                  className="absolute inset-0 bg-black/0 active:bg-black/20 flex items-center justify-center transition-colors"
                  onClick={() => setLightboxUrl(img.imageUrl)}
                >
                  <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                </div>
                {isAuthenticated && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("确认删除这张图片？")) deleteMutation.mutate({ id: img.id });
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                )}
                {img.title && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                    <p className="text-white text-xs truncate">{img.title}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 灯箱放大查看 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="放大查看"
            className="max-w-full max-h-full object-contain px-4"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ===== 会员列表组件 =====
function MembersTab() {
  const [selectedMember, setSelectedMember] = useState<{ id: number; name: string } | null>(null);
  const { data: members = [], isLoading } = trpc.hanmingGetMembers.useQuery();

  if (selectedMember) {
    return (
      <MemberGallery
        memberId={selectedMember.id}
        memberName={selectedMember.name}
        onBack={() => setSelectedMember(null)}
      />
    );
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2 mb-5">
        <Users className="w-5 h-5 text-[#C62828]" />
        <span className="text-white font-semibold text-base">会员列表</span>
        {!isLoading && <span className="text-white/40 text-xs">({members.length}人)</span>}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#C62828] animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-14 h-14 text-white/15 mb-4" />
          <p className="text-white/40 text-sm">暂无会员</p>
          <p className="text-white/25 text-xs mt-1.5">邀请好友加入后，会员将显示在这里</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelectedMember({ id: member.id, name: member.displayName })}
              className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-2xl px-4 py-3.5 transition-colors text-left"
            >
              {/* 头像 */}
              <div className="w-11 h-11 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                {member.avatar ? (
                  <img src={member.avatar} alt={member.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white/60 text-base font-semibold">
                    {(member.displayName || "?")[0].toUpperCase()}
                  </span>
                )}
              </div>
              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{member.displayName}</p>
                <p className="text-white/40 text-xs mt-0.5">@{member.username}</p>
              </div>
              {/* 图库数量 */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Images className="w-3.5 h-3.5 text-white/30" />
                <span className="text-white/50 text-xs">{member.galleryCount}</span>
                <ChevronLeft className="w-4 h-4 text-white/30 rotate-180" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 产品介绍占位符 =====
function ProductsTab() {
  return (
    <div className="px-4 py-6">
      {/* 占位符区块 - 品牌介绍 */}
      <div className="bg-white/5 rounded-2xl p-5 mb-4 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-[#C62828]" />
          <span className="text-white font-semibold text-sm">品牌介绍</span>
        </div>
        <p className="text-white/40 text-xs leading-relaxed">产品介绍内容即将上线，敬请期待...</p>
      </div>

      {/* 占位符区块 - 产品系列 */}
      <div className="bg-white/5 rounded-2xl p-5 mb-4 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-[#C62828]" />
          <span className="text-white font-semibold text-sm">产品系列</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {["系列一", "系列二", "系列三", "系列四"].map((name) => (
            <div
              key={name}
              onClick={() => toast("产品详情即将上线，敬请期待")}
              className="aspect-square bg-white/5 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer active:bg-white/10 transition-colors border border-white/5"
            >
              <Package className="w-8 h-8 text-white/20" />
              <span className="text-white/30 text-xs">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 占位符区块 - 联系方式 */}
      <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Phone className="w-4 h-4 text-[#C62828]" />
          <span className="text-white font-semibold text-sm">联系我们</span>
        </div>
        <p className="text-white/40 text-xs">联系方式即将更新...</p>
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function HanmingHome() {
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const [showMemberGallery, setShowMemberGallery] = useState(false);

  // 当进入会员图库子页面时，隐藏底部导航
  if (showMemberGallery) {
    return null; // 由MembersTab内部的MemberGallery处理
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0D0D]">
      {/* 顶部 Header */}
      <div className="sticky top-0 z-10 bg-[#0D0D0D] border-b border-white/10">
        {/* 品牌标识 */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#C62828] flex items-center justify-center">
              <span className="text-white text-xs font-bold">汉</span>
            </div>
            <div>
              <span className="text-white font-semibold tracking-wide text-sm">汉明</span>
              <p className="text-white/40 text-[10px]">产品详情页</p>
            </div>
          </div>
        </div>
        {/* Tab 导航 */}
        <div className="flex border-t border-white/10">
          {([
            { key: "products" as TabType, label: "产品介绍", icon: Package },
            { key: "members" as TabType, label: "会员", icon: Users },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-[#C62828] border-b-2 border-[#C62828]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 pb-24">
        {activeTab === "products" && <ProductsTab />}
        {activeTab === "members" && <MembersTab />}
      </div>

      {/* 底部导航 */}
      <BottomNav />
    </div>
  );
}
