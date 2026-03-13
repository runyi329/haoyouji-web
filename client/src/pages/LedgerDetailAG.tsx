/**
 * LedgerDetailAG.tsx - AG型定制账本：共享图片助记词（只读浏览模式）
 *
 * 布局参照 OpenNana 卡片风格：
 *   - 图片有圆角，左右有边距（不贴边），按原始比例完整显示
 *   - 图片下方一行：标题文字 + 右侧复制图标
 *   - 点击图片可全屏查看大图
 *
 * 权限：
 *   - 所有成员只读浏览，可复制提示词
 *   - 内容由管理员在后台批量导入
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Settings,
  Copy,
  Check,
  ImageIcon,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

interface Props {
  ledgerId: number;
  ledgerData: any;
  membersData: any[];
  user: any;
}

interface PromptImage {
  id: number;
  ledgerId: number;
  imageUrl: string;
  imageKey: string;
  promptText: string | null;
  title: string | null;
  uploadedBy: number;
  createdAt: string;
}

export default function LedgerDetailAG({ ledgerId, ledgerData, membersData, user }: Props) {
  const [, setLocation] = useLocation();
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PromptImage | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 获取图片列表
  const { data: images = [], isLoading } = trpc.ledger.getAgPromptImages.useQuery(
    { ledgerId },
    { refetchOnMount: true }
  );

  // 复制提示词
  const copyPrompt = (id: number, text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast.success("提示词已复制");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const memberCount = membersData?.length || 0;

  // 提取标题（去掉 # 标签部分，只显示主标题）
  const getShortTitle = (title: string | null) => {
    if (!title) return "";
    const hashIdx = title.indexOf("  #");
    return hashIdx > 0 ? title.slice(0, hashIdx) : title;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ===== 顶部红色区域 ===== */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        {/* 导航栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={() => setLocation("/ledger/list")}
            className="flex items-center gap-1 text-white/90 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>
          <h1 className="text-base font-semibold text-white truncate max-w-[180px]">
            {ledgerData?.name || "提示词图库"}
          </h1>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="text-white/90 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 成员头像 + 数量 */}
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowMembersDialog(true)}
            className="flex items-center gap-2"
          >
            <div className="flex -space-x-2">
              {(membersData || []).slice(0, 5).map((m: any) => (
                <div key={m.id} className="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-200">
                  <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                </div>
              ))}
            </div>
            <span className="text-xs text-white/80 ml-1">
              <span className="font-semibold" style={{ color: "#FFD700" }}>{memberCount}</span> 人共享
            </span>
            <Users className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>

        {/* 金色标签 */}
        <div className="px-4 pb-3">
          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "rgba(203,164,113,0.2)", color: "#CBA471", border: "1px solid rgba(203,164,113,0.4)" }}>
            Nano Banana Pro · 提示词图库
          </span>
        </div>
      </div>

      {/* ===== 图片列表 ===== */}
      <div className="pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-gray-400">加载中...</div>
          </div>
        ) : (images as PromptImage[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#FFEBEE" }}>
              <ImageIcon className="w-10 h-10" style={{ color: "#D32F2F" }} />
            </div>
            <p className="text-base font-medium text-gray-700 mb-1">图库正在建设中</p>
            <p className="text-sm text-gray-400 text-center">管理员正在整理 Nano Banana Pro 精选案例</p>
          </div>
        ) : (
          <div className="pt-3 space-y-3">
            {(images as PromptImage[]).map((img) => {
              const shortTitle = getShortTitle(img.title);

              return (
                <div
                  key={img.id}
                  className="mx-3 bg-white overflow-hidden"
                  style={{ borderRadius: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
                >
                  {/* 图片区域：按原始比例完整显示，不裁剪 */}
                  <div
                    className="relative w-full cursor-pointer"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={img.imageUrl}
                      alt={shortTitle || "提示词案例"}
                      className="w-full h-auto block"
                      style={{ display: "block" }}
                      loading="lazy"
                    />
                    {/* 右下角放大图标 */}
                    <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
                      <ZoomIn className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>

                  {/* 底部：标题 + 复制图标（一行） */}
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <p className="text-sm text-gray-800 leading-snug flex-1 truncate" style={{ fontWeight: 500 }}>
                      {shortTitle || "提示词案例"}
                    </p>
                    {img.promptText && (
                      <button
                        onClick={(e) => copyPrompt(img.id, img.promptText!, e)}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full"
                        style={{
                          backgroundColor: copiedId === img.id ? "#E8F5E9" : "#FFF8F0",
                          color: copiedId === img.id ? "#4CAF50" : "#CBA471",
                        }}
                        title="复制提示词"
                      >
                        {copiedId === img.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 全屏图片查看器 ===== */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <button onClick={() => setSelectedImage(null)} className="text-white">
              <X className="w-6 h-6" />
            </button>
            {selectedImage.title && (
              <span className="text-white text-sm font-medium flex-1 text-center mx-4 truncate">
                {getShortTitle(selectedImage.title)}
              </span>
            )}
            {selectedImage.promptText && (
              <button
                onClick={(e) => copyPrompt(selectedImage.id, selectedImage.promptText!, e)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
                style={{ backgroundColor: "rgba(203,164,113,0.25)", color: "#CBA471" }}
              >
                {copiedId === selectedImage.id ? (
                  <><Check className="w-3 h-3" />已复制</>
                ) : (
                  <><Copy className="w-3 h-3" />复制</>
                )}
              </button>
            )}
          </div>

          {/* 大图 */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img
              src={selectedImage.imageUrl}
              alt={getShortTitle(selectedImage.title) || "提示词案例"}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* 底部提示词 */}
          {selectedImage.promptText && (
            <div className="px-4 py-4 max-h-52 overflow-y-auto"
              style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
              <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">
                {selectedImage.promptText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 成员列表弹层 */}
      {showMembersDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowMembersDialog(false)}>
          <div className="w-full bg-white rounded-t-2xl p-4 max-h-80 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-800 mb-3">账本成员 ({memberCount}人)</div>
            <div className="space-y-2">
              {(membersData || []).map((m: any) => (
                <div key={m.id || m.userId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                    <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                  </div>
                  <span className="text-sm text-gray-700">{m.nickname || m.username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
