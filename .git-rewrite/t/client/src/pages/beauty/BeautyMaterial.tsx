/**
 * 奢贝美容院 - 素材展示
 * 路径: /beauty/material
 * 功能: 照片对比展示，每张照片支持文字说明，横向滑动轮播
 */
import { Link } from "wouter";
import {
  ChevronLeft,
  ImageIcon,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
  Edit2,
  Share2,
  Copy,
  Settings,
  AlignLeft,
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";


// ===== 裁剪工具函数 =====
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  maxWidth = 800
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  let outW = pixelCrop.width;
  let outH = pixelCrop.height;
  const maxSide = Math.max(outW, outH);
  if (maxSide > maxWidth) {
    const scale = maxWidth / maxSide;
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  canvas.width = outW;
  canvas.height = outH;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  );

  return canvas.toDataURL("image/jpeg", 0.72);
}

// ===== 比例选项 =====
const ASPECT_OPTIONS = [
  { label: "横 16:9", value: 16 / 9 },
  { label: "横 4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "竖 9:16", value: 9 / 16 },
  { label: "竖 3:4", value: 3 / 4 },
] as const;

// ===== 裁剪弹窗组件 =====
function CropDialog({
  imageSrc,
  onConfirm,
  onCancel,
}: {
  imageSrc: string;
  onConfirm: (croppedBase64: string) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState(3 / 4);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleAspectChange = (aspect: number) => {
    setSelectedAspect(aspect);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const croppedBase64 = await getCroppedImg(imageSrc, croppedAreaPixels);
      onConfirm(croppedBase64);
    } catch (e) {
      console.error("裁剪失败:", e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white text-sm font-medium">调整显示区域</span>
        <button
          onClick={handleConfirm}
          disabled={processing}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
        >
          {processing ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Check className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-black/80">
        {ASPECT_OPTIONS.map((opt) => {
          const isActive = selectedAspect === opt.value;
          return (
            <button
              key={opt.label}
              onClick={() => handleAspectChange(opt.value)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: isActive
                  ? "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)"
                  : "rgba(255,255,255,0.12)",
                color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                border: isActive ? "none" : "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={selectedAspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={true}
          style={{
            containerStyle: { background: "#000" },
            cropAreaStyle: { border: "2px solid #E91E63" },
          }}
        />
      </div>

      <div className="px-8 py-4 bg-black/80">
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs">缩小</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1 accent-pink-500"
          />
          <span className="text-white/60 text-xs">放大</span>
        </div>
        <p className="text-white/40 text-xs text-center mt-2">
          拖动照片调整位置，双指缩放调整大小
        </p>
      </div>
    </div>
  );
}

// ===== 自适应比例的照片卡片（带文字说明） =====
function AutoAspectPhotoWithCaption({
  src,
  caption,
  fixedHeight = 240,
}: {
  src: string;
  caption?: string | null;
  fixedHeight?: number;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const computedWidth = dims
    ? Math.round((dims.w / dims.h) * fixedHeight)
    : fixedHeight * 0.75;

  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: `${computedWidth}px` }}>
      <div
        className="rounded-xl overflow-hidden bg-gray-100"
        style={{ width: `${computedWidth}px`, height: `${fixedHeight}px` }}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
        />
      </div>
      {caption && (
        <p className="text-xs text-gray-600 mt-1.5 px-0.5 leading-snug line-clamp-2">
          {caption}
        </p>
      )}
    </div>
  );
}

// ===== 照片组管理页面（带文字说明编辑） =====
function MaterialGroupManager() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const groupsQuery = trpc.beauty.material.listGroups.useQuery();
  const createGroupMutation = trpc.beauty.material.createGroup.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const uploadPhotoMutation = trpc.beauty.material.uploadPhoto.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const deleteGroupMutation = trpc.beauty.material.deleteGroup.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const deletePhotoMutation = trpc.beauty.material.deletePhoto.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const updateTitleMutation = trpc.beauty.material.updateGroupTitle.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const updateCaptionMutation = trpc.beauty.material.updatePhotoCaption.useMutation({
    onSuccess: () => utils.beauty.material.listGroups.invalidate(),
  });
  const generateShareTokenMutation = trpc.beauty.material.generateShareToken.useMutation();

  const [cropImage, setCropImage] = useState<string | null>(null);
  const [uploadingGroupId, setUploadingGroupId] = useState<number | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editingCaptionPhotoId, setEditingCaptionPhotoId] = useState<number | null>(null);
  const [editCaptionValue, setEditCaptionValue] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = groupsQuery.data || [];

  const handleCreateGroup = async () => {
    await createGroupMutation.mutateAsync({ title: "新照片组" });
  };

  const handleSelectImage = (groupId: number) => {
    setUploadingGroupId(groupId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropConfirm = async (croppedBase64: string) => {
    if (uploadingGroupId === null) return;
    setCropImage(null);
    try {
      const group = groups.find((g) => g.id === uploadingGroupId);
      const sortOrder = group?.photos?.length || 0;
      await uploadPhotoMutation.mutateAsync({
        groupId: uploadingGroupId,
        imageData: croppedBase64,
        sortOrder,
      });
    } catch (err) {
      console.error("上传失败:", err);
    }
    setUploadingGroupId(null);
  };

  const handleStartEditTitle = (groupId: number, currentTitle: string) => {
    setEditingTitleId(groupId);
    setEditTitleValue(currentTitle || "");
  };

  const handleSaveTitle = async () => {
    if (editingTitleId === null) return;
    await updateTitleMutation.mutateAsync({
      groupId: editingTitleId,
      title: editTitleValue,
    });
    setEditingTitleId(null);
  };

  const handleStartEditCaption = (photoId: number, currentCaption: string | null) => {
    setEditingCaptionPhotoId(photoId);
    setEditCaptionValue(currentCaption || "");
  };

  const handleSaveCaption = async () => {
    if (editingCaptionPhotoId === null) return;
    await updateCaptionMutation.mutateAsync({
      photoId: editingCaptionPhotoId,
      caption: editCaptionValue,
    });
    setEditingCaptionPhotoId(null);
  };

  const handleShareGroup = async (groupId: number) => {
    try {
      const { token } = await generateShareTokenMutation.mutateAsync({ groupId });
      const url = `${window.location.origin}/beauty/material/share?token=${token}`;
      const group = groups.find((g) => g.id === groupId);
      const title = group?.title || "照片对比";
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} - 奢贝美容院素材展示`, url });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }
      setShareUrl(url);
    } catch (err) {
      console.error("生成分享链接失败:", err);
      alert("生成分享链接失败，请重试");
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("链接已复制到剪贴板");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("链接已复制到剪贴板");
      } catch {
        // 弹窗里已经有链接可以手动复制
      }
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-gray-500">请先登录后管理照片组</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      {/* 分享链接弹窗 */}
      {shareUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShareUrl(null)}
        >
          <div
            className="bg-white rounded-2xl mx-6 p-5 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">分享链接</h3>
              <button
                onClick={() => setShareUrl(null)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-600 break-all select-all">{shareUrl}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyShareUrl}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)" }}
              >
                <Copy className="w-4 h-4" />
                复制链接
              </button>
              <button
                onClick={() => window.open(shareUrl, "_blank")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
              >
                打开预览
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文字说明编辑弹窗 */}
      {editingCaptionPhotoId !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50"
          onClick={() => setEditingCaptionPhotoId(null)}
        >
          <div
            className="bg-white rounded-t-2xl w-full p-5 pb-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">编辑照片说明</h3>
              <button
                onClick={() => setEditingCaptionPhotoId(null)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <textarea
              value={editCaptionValue}
              onChange={(e) => setEditCaptionValue(e.target.value)}
              placeholder="输入照片说明文字（可选）"
              className="w-full border border-pink-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-400 resize-none"
              rows={3}
              autoFocus
              maxLength={200}
            />
            <p className="text-xs text-gray-400 text-right mt-1">{editCaptionValue.length}/200</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setEditingCaptionPhotoId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={handleSaveCaption}
                disabled={updateCaptionMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
              >
                {updateCaptionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  "保存"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 裁剪弹窗 */}
      {cropImage && (
        <CropDialog
          imageSrc={cropImage}
          onConfirm={handleCropConfirm}
          onCancel={() => {
            setCropImage(null);
            setUploadingGroupId(null);
          }}
        />
      )}

      {/* 新建照片组按钮 */}
      <button
        onClick={handleCreateGroup}
        disabled={createGroupMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white"
        style={{
          background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)",
          boxShadow: "0 4px 12px rgba(233,30,99,0.3)",
        }}
      >
        {createGroupMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        新建照片组
      </button>

      {groupsQuery.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#E91E63" }} />
        </div>
      )}

      {groups.map((group) => (
        <div
          key={group.id}
          className="rounded-2xl overflow-hidden"
          style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
        >
          {/* 组头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            {editingTitleId === group.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  className="flex-1 text-sm border border-pink-200 rounded-lg px-2 py-1 outline-none focus:border-pink-400"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "#E91E63" }}
                >
                  <Check className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => setEditingTitleId(null)}
                  className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    {group.title || "未命名"}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {group.photos?.length || 0}张
                  </span>
                  <button
                    onClick={() => handleStartEditTitle(group.id, group.title || "")}
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <Edit2 className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleShareGroup(group.id)}
                    disabled={generateShareTokenMutation.isPending}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: "#E3F2FD" }}
                    title="分享这组照片"
                  >
                    {generateShareTokenMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#1976D2" }} />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" style={{ color: "#1976D2" }} />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("确定删除这个照片组及其所有照片?")) {
                        deleteGroupMutation.mutate({ groupId: group.id });
                      }
                    }}
                    className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 组内照片 - 横向滚动，带文字说明编辑 */}
          <div className="px-4 py-3">
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {group.photos?.map((photo) => (
                <div key={photo.id} className="flex-shrink-0 flex flex-col" style={{ width: 96 }}>
                  <div className="relative w-24 h-32 rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={photo.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <button
                      onClick={() => {
                        if (window.confirm("确定删除这张照片?")) {
                          deletePhotoMutation.mutate({ photoId: photo.id });
                        }
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  {/* 文字说明 */}
                  <button
                    onClick={() => handleStartEditCaption(photo.id, (photo as any).caption || null)}
                    className="mt-1 flex items-center gap-0.5 text-left"
                  >
                    {(photo as any).caption ? (
                      <p className="text-xs text-gray-600 leading-snug line-clamp-2 flex-1">
                        {(photo as any).caption}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300 flex items-center gap-0.5">
                        <AlignLeft className="w-3 h-3" />
                        添加说明
                      </span>
                    )}
                  </button>
                </div>
              ))}

              {/* 添加照片按钮 */}
              {(!group.photos || group.photos.length < 50) && (
                <button
                  onClick={() => handleSelectImage(group.id)}
                  disabled={uploadPhotoMutation.isPending && uploadingGroupId === group.id}
                  className="flex-shrink-0 w-24 h-32 rounded-lg border-2 border-dashed border-pink-200 flex flex-col items-center justify-center gap-1 bg-pink-50/50"
                >
                  {uploadPhotoMutation.isPending && uploadingGroupId === group.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#E91E63" }} />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" style={{ color: "#E91E63" }} />
                      <span className="text-xs" style={{ color: "#E91E63" }}>
                        添加
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {!groupsQuery.isLoading && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)" }}
          >
            <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
          </div>
          <p className="text-sm font-medium text-gray-700">还没有照片组</p>
          <p className="text-xs text-gray-400 mt-1">点击上方按钮创建第一个照片组</p>
        </div>
      )}
    </div>
  );
}

// ===== 照片展示页面（多组横向轮播，带文字说明） =====
function MaterialShowcase() {
  const groupsQuery = trpc.beauty.material.listGroups.useQuery();
  const generateShareTokenMutation = trpc.beauty.material.generateShareToken.useMutation();
  const groups = (groupsQuery.data || []).filter(
    (g) => g.photos && g.photos.length > 0
  );

  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleShare = async (groupId: number) => {
    try {
      const { token } = await generateShareTokenMutation.mutateAsync({ groupId });
      const url = `${window.location.origin}/beauty/material/share?token=${token}`;
      const group = groups.find((g) => g.id === groupId);
      const title = group?.title || "照片对比";
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} - 奢贝美容院素材展示`, url });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }
      setShareUrl(url);
    } catch {
      alert("生成分享链接失败，请重试");
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("链接已复制到剪贴板");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("链接已复制到剪贴板");
      } catch {
        // 弹窗里已经有链接可以手动复制
      }
    }
  };

  if (groupsQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#E91E63" }} />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)" }}
        >
          <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
        </div>
        <p className="text-sm font-medium text-gray-700">暂无素材数据</p>
        <p className="text-xs text-gray-400 mt-1">管理员可在管理模式下添加照片组</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 分享链接弹窗 */}
      {shareUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShareUrl(null)}
        >
          <div
            className="bg-white rounded-2xl mx-6 p-5 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">分享链接</h3>
              <button
                onClick={() => setShareUrl(null)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-600 break-all select-all">{shareUrl}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyShareUrl}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)" }}
              >
                <Copy className="w-4 h-4" />
                复制链接
              </button>
              <button
                onClick={() => window.open(shareUrl, "_blank")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
              >
                打开预览
              </button>
            </div>
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id}>
          {/* 组标题 + 分享按钮 */}
          <div className="px-4 mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">{group.title || "未命名"}</h3>
            <button
              onClick={() => handleShare(group.id)}
              disabled={generateShareTokenMutation.isPending}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "#E3F2FD" }}
              title="分享这组照片"
            >
              {generateShareTokenMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#1976D2" }} />
              ) : (
                <Share2 className="w-3.5 h-3.5" style={{ color: "#1976D2" }} />
              )}
            </button>
          </div>

          {/* 横向滑动轮播（照片+文字说明一起滑动） */}
          <Carousel
            className="w-full"
            opts={{ loop: false, align: "start", dragFree: true }}
          >
            <CarouselContent className="-ml-2 pl-4">
              {group.photos?.map((photo) => (
                <CarouselItem key={photo.id} className="pl-2 basis-auto">
                  <AutoAspectPhotoWithCaption
                    src={photo.imageUrl}
                    caption={(photo as any).caption}
                    fixedHeight={240}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="px-4 mt-1.5">
            <p className="text-xs text-gray-400">
              左右滑动查看 ({group.photos?.length || 0}张)
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== 主页面 =====
export default function BeautyMaterial() {
  const { user } = useAuth();
  const [isManaging, setIsManaging] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          background: "linear-gradient(135deg, #E91E63 0%, #F06292 100%)",
          boxShadow: "0 2px 8px rgba(233,30,99,0.2)",
        }}
      >
        <Link href="/beauty">
          <button className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        </Link>
        <h1 className="text-white font-bold text-base">素材展示</h1>
        {user ? (
          <button
            onClick={() => setIsManaging(!isManaging)}
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: isManaging ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
              color: isManaging ? "#E91E63" : "#fff",
            }}
          >
            {isManaging ? "完成" : "管理"}
          </button>
        ) : (
          <div className="w-14" />
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 pt-4 pb-8">
        {isManaging ? <MaterialGroupManager /> : <MaterialShowcase />}
      </div>
    </div>
  );
}
