/**
 * LedgerDetailAG.tsx - AG型定制账本：共享图片助记词
 *
 * 布局设计：
 *   顶部红色区域（不变）：账本名称 + 成员头像
 *   白色内容区：全屏宽图片 + 图片下方提示词文字
 *
 * 交互：
 *   - 点击右下角 + 按钮上传图片
 *   - 图片全屏宽展示，宽高比约 4:3
 *   - 图片下方显示提示词文字（可点击编辑）
 *   - 长按图片可删除
 */
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Settings,
  Copy,
  Trash2,
  Pencil,
  X,
  Check,
  ImageIcon,
  Users,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import MembersDialog from "@/components/MembersDialog";

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
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<PromptImage | null>(null);
  const [uploadImageData, setUploadImageData] = useState<string | null>(null);
  const [uploadPromptText, setUploadPromptText] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // 获取图片列表
  const { data: images = [], isLoading } = trpc.ledger.getAgPromptImages.useQuery(
    { ledgerId },
    { refetchOnMount: true }
  );

  // 上传图片 mutation
  const uploadMutation = trpc.ledger.uploadAgPromptImage.useMutation({
    onSuccess: () => {
      toast.success("图片上传成功");
      setShowUploadDialog(false);
      setUploadImageData(null);
      setUploadPreviewUrl(null);
      setUploadPromptText("");
      setUploadTitle("");
      utils.ledger.getAgPromptImages.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  // 更新提示词 mutation
  const updateMutation = trpc.ledger.updateAgPromptImage.useMutation({
    onSuccess: () => {
      toast.success("提示词已更新");
      setEditingId(null);
      utils.ledger.getAgPromptImages.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  // 删除图片 mutation
  const deleteMutation = trpc.ledger.deleteAgPromptImage.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      setDeleteConfirmId(null);
      setSelectedImage(null);
      utils.ledger.getAgPromptImages.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  // 选择图片文件
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setUploadImageData(base64);
      setUploadPreviewUrl(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  // 提交上传
  const handleUpload = () => {
    if (!uploadImageData) {
      toast.error("请先选择图片");
      return;
    }
    uploadMutation.mutate({
      ledgerId,
      imageData: uploadImageData,
      promptText: uploadPromptText.trim() || undefined,
      title: uploadTitle.trim() || undefined,
    });
  };

  // 复制提示词
  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("已复制到剪贴板"));
  };

  // 成员数量
  const memberCount = membersData?.length || 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF3ED" }}>
      {/* ===== 顶部红色区域（保持不变）===== */}
      <div className="pb-4" style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
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
            {ledgerData?.name || "AG账本"}
          </h1>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="text-white/90 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 成员头像区 */}
        <div className="px-4 pt-1 pb-2">
          <button
            onClick={() => setShowMembersDialog(true)}
            className="flex items-center gap-2"
          >
            <div className="flex -space-x-2">
              {(membersData || []).slice(0, 5).map((m: any) => (
                <div key={m.id} className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-gray-200">
                  <UserAvatar user={m} size={32} />
                </div>
              ))}
            </div>
            <span className="text-xs text-white/80 ml-1">
              <span className="text-white font-medium">{memberCount}</span> 人共享
            </span>
            <Users className="w-3.5 h-3.5 text-white/70" />
          </button>
        </div>

        {/* 账本说明 */}
        {ledgerData?.description && (
          <div className="px-4 pb-1">
            <p className="text-xs text-white/70 line-clamp-2">{ledgerData.description}</p>
          </div>
        )}

        {/* 金色副标题 */}
        <div className="px-4 pt-1">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(203,164,113,0.25)", color: "#CBA471" }}>
            共享图片助记词
          </span>
        </div>
      </div>

      {/* ===== 白色内容区：图片列表 ===== */}
      <div className="pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-gray-400">加载中...</div>
          </div>
        ) : (images as PromptImage[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#FFEBEE" }}>
              <ImageIcon className="w-10 h-10" style={{ color: "#D32F2F" }} />
            </div>
            <p className="text-base font-medium text-gray-700 mb-1">还没有图片助记词</p>
            <p className="text-sm text-gray-400 text-center">点击右下角 + 按钮上传第一张图片</p>
          </div>
        ) : (
          /* 全屏宽图片列表 */
          <div className="space-y-0">
            {(images as PromptImage[]).map((img) => (
              <div key={img.id} className="bg-white border-b border-gray-100">
                {/* 全屏宽图片 */}
                <div
                  className="relative w-full cursor-pointer"
                  style={{ aspectRatio: "4/3" }}
                  onClick={() => setSelectedImage(img)}
                >
                  <img
                    src={img.imageUrl}
                    alt={img.title || "图片助记词"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* 右上角操作按钮 */}
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    {img.uploadedBy === user?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(img.id); }}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 提示词区域 */}
                <div className="px-4 py-3">
                  {img.title && (
                    <p className="text-sm font-medium text-gray-800 mb-1">{img.title}</p>
                  )}

                  {editingId === img.id ? (
                    /* 编辑模式 */
                    <div className="space-y-2">
                      <textarea
                        value={editPromptText}
                        onChange={(e) => setEditPromptText(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none text-gray-700"
                        rows={4}
                        placeholder="输入提示词..."
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200"
                        >
                          <X className="w-3 h-3" /> 取消
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: img.id, promptText: editPromptText })}
                          className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: "#D32F2F" }}
                          disabled={updateMutation.isPending}
                        >
                          <Check className="w-3 h-3" /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 显示模式 */
                    <div>
                      {img.promptText ? (
                        <div className="relative group">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-all pr-16">
                            {img.promptText}
                          </p>
                          {/* 操作按钮 */}
                          <div className="flex gap-1.5 mt-2">
                            <button
                              onClick={() => copyPrompt(img.promptText!)}
                              className="flex items-center gap-1 text-xs text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200 hover:border-gray-300"
                            >
                              <Copy className="w-3 h-3" /> 复制
                            </button>
                            {img.uploadedBy === user?.id && (
                              <button
                                onClick={() => { setEditingId(img.id); setEditPromptText(img.promptText || ""); }}
                                className="flex items-center gap-1 text-xs text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200 hover:border-gray-300"
                              >
                                <Pencil className="w-3 h-3" /> 编辑
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* 无提示词时显示添加按钮 */
                        img.uploadedBy === user?.id ? (
                          <button
                            onClick={() => { setEditingId(img.id); setEditPromptText(""); }}
                            className="flex items-center gap-1.5 text-sm py-1"
                            style={{ color: "#CBA471" }}
                          >
                            <Plus className="w-4 h-4" />
                            <span>添加提示词</span>
                          </button>
                        ) : (
                          <p className="text-sm text-gray-400 italic">暂无提示词</p>
                        )
                      )}
                    </div>
                  )}

                  {/* 上传者信息 */}
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-200">
                      <UserAvatar user={membersData?.find((m: any) => m.userId === img.uploadedBy)} size={20} />
                    </div>
                    <span className="text-xs text-gray-400">
                      {membersData?.find((m: any) => m.userId === img.uploadedBy)?.nickname ||
                       membersData?.find((m: any) => m.userId === img.uploadedBy)?.name ||
                       "成员"} · {new Date(img.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== 右下角上传按钮 ===== */}
      <button
        onClick={() => setShowUploadDialog(true)}
        className="fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center z-20"
        style={{ backgroundColor: "#D32F2F" }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ===== 上传图片弹窗 ===== */}
      <Dialog open={showUploadDialog} onOpenChange={(v) => {
        if (!v) {
          setShowUploadDialog(false);
          setUploadImageData(null);
          setUploadPreviewUrl(null);
          setUploadPromptText("");
          setUploadTitle("");
        }
      }}>
        <DialogContent className="mx-4 rounded-2xl p-0 overflow-hidden max-w-sm w-full">
          <div className="px-5 py-4 text-white" style={{ backgroundColor: "#D32F2F" }}>
            <DialogTitle className="text-base font-semibold text-white">上传图片助记词</DialogTitle>
            <p className="text-xs mt-1 opacity-80">上传图片并添加对应的提示词</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* 图片选择区 */}
            <div
              className="w-full rounded-xl overflow-hidden border-2 border-dashed border-gray-200 cursor-pointer flex items-center justify-center"
              style={{ aspectRatio: "4/3", backgroundColor: "#FAFAFA" }}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadPreviewUrl ? (
                <img src={uploadPreviewUrl} alt="预览" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <ImageIcon className="w-10 h-10" />
                  <span className="text-sm">点击选择图片</span>
                  <span className="text-xs">支持 JPG、PNG、WebP，最大10MB</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* 标题（可选） */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">标题（可选）</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="如：赛博朋克城市夜景"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none text-gray-700"
              />
            </div>

            {/* 提示词 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">提示词（可选，可上传后再填写）</label>
              <textarea
                value={uploadPromptText}
                onChange={(e) => setUploadPromptText(e.target.value)}
                placeholder={"在此粘贴或输入提示词\n\n例如：\ncyberpunk city at night, neon lights, rain, 8k, highly detailed"}
                className="w-full h-28 text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none resize-none text-gray-700 placeholder-gray-400"
                style={{ lineHeight: "1.6" }}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowUploadDialog(false)}
              >
                取消
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: "#D32F2F" }}
                onClick={handleUpload}
                disabled={uploadMutation.isPending || !uploadImageData}
              >
                {uploadMutation.isPending ? "上传中..." : "上传"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 删除确认弹窗 ===== */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-8">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl">
            <h3 className="text-base font-semibold text-gray-800 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-5">删除后无法恢复，确定要删除这张图片吗？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleteConfirmId })}
                className="flex-1 py-2.5 rounded-xl text-sm text-white font-medium"
                style={{ backgroundColor: "#D32F2F" }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 全屏图片查看器 ===== */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setSelectedImage(null)} className="text-white">
              <X className="w-6 h-6" />
            </button>
            {selectedImage.title && (
              <span className="text-white text-sm font-medium">{selectedImage.title}</span>
            )}
            <div className="w-6" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <img
              src={selectedImage.imageUrl}
              alt={selectedImage.title || "图片"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          {selectedImage.promptText && (
            <div className="px-4 py-4 bg-black/80">
              <p className="text-gray-300 text-sm leading-relaxed">{selectedImage.promptText}</p>
              <button
                onClick={() => copyPrompt(selectedImage.promptText!)}
                className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(203,164,113,0.25)", color: "#CBA471" }}
              >
                <Copy className="w-3 h-3" /> 复制提示词
              </button>
            </div>
          )}
        </div>
      )}

      {/* 成员弹窗 */}
      {showMembersDialog && (
        <MembersDialog
          ledgerId={ledgerId}
          onClose={() => setShowMembersDialog(false)}
        />
      )}
    </div>
  );
}
