/**
 * LedgerDetailAG.tsx - AG型定制账本：共享图片助记词（只读浏览模式）
 *
 * 布局：
 *   顶部红色区域：账本名称 + 成员头像
 *   白色内容区：全屏宽图片（4:3）+ 下方提示词文字 + 复制按钮
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
  ChevronDown,
  ChevronUp,
  X,
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
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PromptImage | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 获取图片列表
  const { data: images = [], isLoading } = trpc.ledger.getAgPromptImages.useQuery(
    { ledgerId },
    { refetchOnMount: true }
  );

  // 复制提示词
  const copyPrompt = (id: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast.success("提示词已复制");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // 展开/收起提示词
  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const memberCount = membersData?.length || 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAFAFA" }}>
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
              <span className="text-white font-semibold" style={{ color: "#FFD700" }}>{memberCount}</span> 人共享
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
          <div>
            {/* 数量提示 */}
            <div className="px-4 py-2.5 text-xs text-gray-400 border-b border-gray-100">
              共 {(images as PromptImage[]).length} 个案例
            </div>

            {(images as PromptImage[]).map((img) => {
              const isExpanded = expandedIds.has(img.id);
              const promptPreview = img.promptText
                ? img.promptText.slice(0, 120) + (img.promptText.length > 120 ? "..." : "")
                : null;

              return (
                <div key={img.id} className="bg-white border-b border-gray-100">
                  {/* 全屏宽图片 */}
                  <div
                    className="relative w-full cursor-pointer"
                    style={{ aspectRatio: "4/3" }}
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.title || "提示词案例"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* 右下角放大提示 */}
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs text-white"
                      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
                      点击查看大图
                    </div>
                  </div>

                  {/* 标题 + 提示词区域 */}
                  <div className="px-4 py-3">
                    {/* 标题 */}
                    {img.title && (
                      <p className="text-sm font-semibold text-gray-800 mb-2 leading-snug">
                        {img.title}
                      </p>
                    )}

                    {/* 提示词 */}
                    {img.promptText ? (
                      <div>
                        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-all"
                          style={{ lineHeight: "1.7" }}>
                          {isExpanded ? img.promptText : promptPreview}
                        </p>

                        <div className="flex items-center gap-2 mt-2.5">
                          {/* 展开/收起 */}
                          {img.promptText.length > 120 && (
                            <button
                              onClick={() => toggleExpand(img.id)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="w-3 h-3" />收起</>
                              ) : (
                                <><ChevronDown className="w-3 h-3" />展开全文</>
                              )}
                            </button>
                          )}

                          {/* 复制按钮 */}
                          <button
                            onClick={() => copyPrompt(img.id, img.promptText!)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ml-auto"
                            style={{
                              backgroundColor: copiedId === img.id ? "#E8F5E9" : "#FFF8F0",
                              color: copiedId === img.id ? "#4CAF50" : "#CBA471",
                              border: `1px solid ${copiedId === img.id ? "#A5D6A7" : "rgba(203,164,113,0.4)"}`,
                            }}
                          >
                            {copiedId === img.id ? (
                              <><Check className="w-3 h-3" />已复制</>
                            ) : (
                              <><Copy className="w-3 h-3" />复制提示词</>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">提示词整理中...</p>
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
                {selectedImage.title}
              </span>
            )}
            {selectedImage.promptText && (
              <button
                onClick={() => copyPrompt(selectedImage.id, selectedImage.promptText!)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
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
              alt={selectedImage.title || "提示词案例"}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* 底部提示词 */}
          {selectedImage.promptText && (
            <div className="px-4 py-4 max-h-48 overflow-y-auto"
              style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
              <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">
                {selectedImage.promptText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 成员列表简单弹层 */}
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
