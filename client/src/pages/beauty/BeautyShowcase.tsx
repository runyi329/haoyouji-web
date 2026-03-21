/**
 * 奢贝美容院 - 素材展示
 * 路径: /beauty/showcase
 * 功能:
 * 1. 照片对比Tab: 管理多组照片，裁剪上传，横向滑动展示
 * 2. PPT对比Tab: 上传2个PPT，自动转成逐页图片，上下排列同步横向滑动对比
 * 3. 展示页: 每组照片/PPT显示为独立横向滑动轮播列表
 */
import { Link } from "wouter";
import {
  ChevronLeft,
  ImageIcon,
  Presentation,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
  Edit2,
  Upload,
  FileUp,
} from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
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

  // 限制输出尺寸，限制最长边不超过maxWidth（横竖图都适用）
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
  { label: "横 16:9", value: 16 / 9, icon: "\u2B1C" },
  { label: "横 4:3", value: 4 / 3, icon: "\u2B1C" },
  { label: "1:1", value: 1, icon: "\u2B1B" },
  { label: "竖 9:16", value: 9 / 16, icon: "\u25AE" },
  { label: "竖 3:4", value: 3 / 4, icon: "\u25AE" },
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
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white text-sm font-medium">
          调整显示区域
        </span>
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

      {/* 比例选择栏 */}
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
              {opt.value > 1 ? (
                <span style={{ display: "inline-block", width: 14, height: 9, border: "1.5px solid currentColor", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />
              ) : (
                <span style={{ display: "inline-block", width: 9, height: 14, border: "1.5px solid currentColor", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />
              )}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 裁剪区域 */}
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

      {/* 缩放滑块 */}
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

// ===== 照片组管理页面 =====
function PhotoGroupManager() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const groupsQuery = trpc.beauty.showcase.listGroups.useQuery();
  const createGroupMutation = trpc.beauty.showcase.createGroup.useMutation({
    onSuccess: () => utils.beauty.showcase.listGroups.invalidate(),
  });
  const uploadPhotoMutation = trpc.beauty.showcase.uploadPhoto.useMutation({
    onSuccess: () => utils.beauty.showcase.listGroups.invalidate(),
  });
  const deleteGroupMutation = trpc.beauty.showcase.deleteGroup.useMutation({
    onSuccess: () => utils.beauty.showcase.listGroups.invalidate(),
  });
  const deletePhotoMutation = trpc.beauty.showcase.deletePhoto.useMutation({
    onSuccess: () => utils.beauty.showcase.listGroups.invalidate(),
  });
  const updateTitleMutation = trpc.beauty.showcase.updateGroupTitle.useMutation({
    onSuccess: () => utils.beauty.showcase.listGroups.invalidate(),
  });

  const [cropImage, setCropImage] = useState<string | null>(null);
  const [uploadingGroupId, setUploadingGroupId] = useState<number | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = groupsQuery.data || [];

  // 新建照片组
  const handleCreateGroup = async () => {
    await createGroupMutation.mutateAsync({ title: "新照片组" });
  };

  // 选择图片（触发文件选择器）
  const handleSelectImage = (groupId: number) => {
    setUploadingGroupId(groupId);
    fileInputRef.current?.click();
  };

  // 文件选择后读取为base64，弹出裁剪框
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // 重置input以允许重复选择同一文件
    e.target.value = "";
  };

  // 裁剪确认后上传
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

  // 编辑标题
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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-gray-500">请先登录后管理照片组</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
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

      {/* 加载中 */}
      {groupsQuery.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#E91E63" }} />
        </div>
      )}

      {/* 照片组列表 */}
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
                    onClick={() =>
                      handleStartEditTitle(group.id, group.title || "")
                    }
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <Edit2 className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
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
              </>
            )}
          </div>

          {/* 组内照片 - 横向滚动 */}
          <div className="px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {group.photos?.map((photo) => (
                <div
                  key={photo.id}
                  className="relative flex-shrink-0 w-24 h-32 rounded-lg overflow-hidden bg-gray-100"
                >
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
              ))}

              {/* 添加照片按钮（每组最多50张） */}
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

      {/* 空状态 */}
      {!groupsQuery.isLoading && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{
              background: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
            }}
          >
            <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
          </div>
          <p className="text-sm font-medium text-gray-700">
            还没有照片组
          </p>
          <p className="text-xs text-gray-400 mt-1">
            点击上方按钮创建第一个照片组
          </p>
        </div>
      )}
    </div>
  );
}

// ===== 自适应比例的照片卡片 =====
function AutoAspectPhoto({ src, fixedHeight = 240 }: { src: string; fixedHeight?: number }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // 根据图片原始比例计算宽度
  const computedWidth = dims
    ? Math.round((dims.w / dims.h) * fixedHeight)
    : fixedHeight * 0.75; // 默认3:4占位

  return (
    <div
      className="rounded-xl overflow-hidden bg-gray-100 flex-shrink-0"
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
  );
}

// ===== 照片展示页面（多组横向轮播） =====
function PhotoShowcase() {
  const groupsQuery = trpc.beauty.showcase.listGroups.useQuery();
  const groups = (groupsQuery.data || []).filter(
    (g) => g.photos && g.photos.length > 0
  );

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
          style={{
            background: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
          }}
        >
          <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
        </div>
        <p className="text-sm font-medium text-gray-700">暂无照片数据</p>
        <p className="text-xs text-gray-400 mt-1">
          请在"照片对比"中添加照片组
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          {/* 组标题 */}
          {group.title && (
            <div className="px-4 mb-2">
              <h3 className="text-sm font-bold text-gray-800">
                {group.title}
              </h3>
            </div>
          )}

          {/* 横向滑动轮播 */}
          <Carousel
            className="w-full"
            opts={{
              loop: false,
              align: "start",
              dragFree: true,
            }}
          >
            <CarouselContent className="-ml-2 pl-4">
              {group.photos?.map((photo) => (
                <CarouselItem
                  key={photo.id}
                  className="pl-2 basis-auto"
                >
                  <AutoAspectPhoto src={photo.imageUrl} fixedHeight={240} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* 滑动提示 */}
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

// ===== PPT对比管理页面 =====
function PptCompareManager() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const groupsQuery = trpc.beauty.pptCompare.listGroups.useQuery();
  const createGroupMutation = trpc.beauty.pptCompare.createGroup.useMutation({
    onSuccess: () => utils.beauty.pptCompare.listGroups.invalidate(),
  });
  const uploadPageMutation = trpc.beauty.pptCompare.uploadPage.useMutation();
  const clearSideMutation = trpc.beauty.pptCompare.clearSide.useMutation();
  const deleteGroupMutation = trpc.beauty.pptCompare.deleteGroup.useMutation({
    onSuccess: () => utils.beauty.pptCompare.listGroups.invalidate(),
  });
  const updateGroupMutation = trpc.beauty.pptCompare.updateGroup.useMutation({
    onSuccess: () => utils.beauty.pptCompare.listGroups.invalidate(),
  });

  const [uploadingSide, setUploadingSide] = useState<{ groupId: number; side: 'A' | 'B' } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 裁剪队列状态
  const [cropQueue, setCropQueue] = useState<string[]>([]); // 待裁剪的base64图片队列
  const [cropQueueIndex, setCropQueueIndex] = useState(0); // 当前裁剪到第几张
  const [croppedResults, setCroppedResults] = useState<string[]>([]); // 已裁剪完的结果
  const [isCropMode, setIsCropMode] = useState(false); // 是否在裁剪模式

  const groups = groupsQuery.data || [];

  const handleCreateGroup = async () => {
    await createGroupMutation.mutateAsync({ title: "新对比组" });
  };

  const handleSelectImages = (groupId: number, side: 'A' | 'B') => {
    setUploadingSide({ groupId, side });
    fileInputRef.current?.click();
  };

  // 将图片文件读取为base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 文件选择后，读取所有图片为base64，进入裁剪队列
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !uploadingSide) return;
    e.target.value = "";

    // 读取所有文件为base64
    const base64List: string[] = [];
    for (const file of files) {
      const b64 = await readFileAsBase64(file);
      base64List.push(b64);
    }

    // 进入裁剪队列模式
    setCropQueue(base64List);
    setCropQueueIndex(0);
    setCroppedResults([]);
    setIsCropMode(true);
  };

  // 裁剪队列：完成当前张，继续下一张
  const handleCropQueueConfirm = async (croppedDataUrl: string) => {
    const newResults = [...croppedResults, croppedDataUrl];
    setCroppedResults(newResults);

    if (cropQueueIndex + 1 < cropQueue.length) {
      setCropQueueIndex(cropQueueIndex + 1);
    } else {
      setIsCropMode(false);
      // 传入当前已有图片数量，用于追加pageNum
      const existingCount = uploadingSide
        ? (pptGroups?.find((g: any) => g.id === uploadingSide.groupId)?.[uploadingSide.side === 'A' ? 'pagesA' : 'pagesB']?.length || 0)
        : 0;
      handleUploadCroppedImages(newResults, existingCount);
    }
  };

  // 裁剪队列：取消（跳过当前张，继续下一张）
  const handleCropQueueCancel = () => {
    if (cropQueueIndex + 1 < cropQueue.length) {
      setCropQueueIndex(cropQueueIndex + 1);
    } else {
      // 全部跳过或取消，如果有已裁剪的就上传，否则取消
      setIsCropMode(false);
      if (croppedResults.length > 0) {
        handleUploadCroppedImages(croppedResults);
      } else {
        setUploadingSide(null);
        setCropQueue([]);
        setCroppedResults([]);
      }
    }
  };

  // 上传已裁剪的图片列表（追加模式，不清空旧图片）
  const handleUploadCroppedImages = async (images: string[], existingCount: number = 0) => {
    if (!uploadingSide || images.length === 0) return;
    const { groupId, side } = uploadingSide;
    setUploadProgress({ current: 0, total: images.length });

    try {
      for (let i = 0; i < images.length; i++) {
        await uploadPageMutation.mutateAsync({
          groupId,
          side,
          imageData: images[i],
          pageNum: existingCount + i + 1,
        });
        setUploadProgress({ current: i + 1, total: images.length });
      }

      await utils.beauty.pptCompare.listGroups.invalidate();
    } catch (err) {
      console.error("上传失败:", err);
      alert("上传失败，请重试");
    } finally {
      setUploadingSide(null);
      setUploadProgress(null);
      setCropQueue([]);
      setCroppedResults([]);
    }
  };

  const handleStartEditTitle = (groupId: number, currentTitle: string) => {
    setEditingTitleId(groupId);
    setEditTitleValue(currentTitle || "");
  };

  const handleSaveTitle = async () => {
    if (editingTitleId === null) return;
    await updateGroupMutation.mutateAsync({
      groupId: editingTitleId,
      title: editTitleValue,
    });
    setEditingTitleId(null);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-gray-500">请先登录后管理对比组</p>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      {/* 裁剪弹窗：逐张裁剪队列 */}
      {isCropMode && cropQueue.length > 0 && (
        <div className="fixed inset-0 z-[200] flex flex-col">
          {/* 顶部进度提示 */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-safe" style={{ paddingTop: 'env(safe-area-inset-top, 12px)' }}>
            <div className="mt-2 px-3 py-1 rounded-full text-xs text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>
              第 {cropQueueIndex + 1} / {cropQueue.length} 张
            </div>
            <button
              onClick={() => {
                setIsCropMode(false);
                if (croppedResults.length > 0) {
                  handleUploadCroppedImages(croppedResults);
                } else {
                  setUploadingSide(null);
                  setCropQueue([]);
                  setCroppedResults([]);
                }
              }}
              className="mt-2 px-3 py-1 rounded-full text-xs text-white"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            >
              完成({croppedResults.length}张)
            </button>
          </div>
          <CropDialog
            imageSrc={cropQueue[cropQueueIndex]}
            onConfirm={handleCropQueueConfirm}
            onCancel={handleCropQueueCancel}
          />
        </div>
      )}

      {/* 隐藏的图片多选输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 新建对比组 */}
      <button
        onClick={handleCreateGroup}
        disabled={createGroupMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white"
        style={{
          background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)",
          boxShadow: "0 4px 12px rgba(233,30,99,0.3)",
        }}
      >
        <Plus className="w-4 h-4" />
        新建对比组
      </button>

      {/* 对比组列表 */}
      {groups.map((group) => (
        <div
          key={group.id}
          className="rounded-2xl bg-white p-4 space-y-3"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
        >
          {/* 组标题 */}
          <div className="flex items-center gap-2">
            {editingTitleId === group.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  className="flex-1 text-sm border rounded-lg px-2 py-1"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
                >
                  <Check className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <>
                <Presentation className="w-4 h-4" style={{ color: "#E91E63" }} />
                <span className="text-sm font-bold text-gray-800 flex-1">
                  {group.title || "未命名对比"}
                </span>
                <button
                  onClick={() => handleStartEditTitle(group.id, group.title || "")}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("确定删除该对比组？")) {
                      deleteGroupMutation.mutate({ groupId: group.id });
                    }
                  }}
                  className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </>
            )}
          </div>

          {/* A侧 和 B侧 上传区域 */}
          {(['A', 'B'] as const).map((side) => {
            const pages = side === 'A' ? group.pagesA : group.pagesB;
            const sideTitle = side === 'A' ? (group.titleA || '方案A') : (group.titleB || '方案B');
            const isUploading = uploadingSide?.groupId === group.id && uploadingSide?.side === side;

            return (
              <div key={side} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{
                    background: side === 'A' ? '#E3F2FD' : '#FFF3E0',
                    color: side === 'A' ? '#1565C0' : '#E65100',
                  }}>
                    {sideTitle}
                  </span>
                  <span className="text-xs text-gray-400">
                    {pages && pages.length > 0 ? `${pages.length}张图片` : '未上传'}
                  </span>
                </div>

                {pages && pages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {pages.map((page: any) => (
                      <div key={page.id} className="flex-shrink-0 rounded-lg overflow-hidden bg-gray-100" style={{ width: '80px', height: '60px' }}>
                        <img src={page.imageUrl} alt={`第${page.pageNum}张`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                )}

                {/* 上传按鈕 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSelectImages(group.id, side)}
                    disabled={isUploading || (pages && pages.length >= 50)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border-2 border-dashed transition-all"
                    style={{
                      borderColor: isUploading ? '#E91E63' : (pages && pages.length >= 50) ? '#E0E0E0' : '#E91E63',
                      color: isUploading ? '#E91E63' : (pages && pages.length >= 50) ? '#ccc' : '#E91E63',
                      background: isUploading ? '#FFF5F7' : (pages && pages.length >= 50) ? '#FAFAFA' : '#FFF5F7',
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {uploadProgress ? `上传中 ${uploadProgress.current}/${uploadProgress.total}...` : '上传中...'}
                      </>
                    ) : (pages && pages.length >= 50) ? (
                      <span>已达上限50张</span>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {pages && pages.length > 0 ? `继续添加图片（${pages.length}/50）` : '上传图片（最多50张）'}
                      </>
                    )}
                  </button>
                  {pages && pages.length > 0 && !isUploading && (
                    <button
                      onClick={async () => {
                        if (!confirm('确定清空所有图片重新上传？')) return;
                        await clearSideMutation.mutateAsync({ groupId: group.id, side });
                        await utils.beauty.pptCompare.listGroups.invalidate();
                      }}
                      className="px-3 py-2.5 rounded-xl text-xs border border-gray-200 text-gray-400 bg-gray-50"
                    >
                      清空
                    </button>
                  )}
                </div>
                {!isUploading && !(pages && pages.length >= 50) && (
                  <p className="text-center text-xs text-gray-400">支持同时选择多张，按顺序追加</p>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Presentation className="w-10 h-10 mb-3" style={{ color: '#E91E63', opacity: 0.4 }} />
          <p className="text-sm text-gray-400">点击上方按鈕创建对比组</p>
        </div>
      )}
    </div>
  );
}

// ===== PPT对比展示页面（上下排列同步滑动） =====
function PptCompareShowcase() {
  const groupsQuery = trpc.beauty.pptCompare.listGroups.useQuery();
  const groups = (groupsQuery.data || []).filter(
    (g) => (g.pagesA && g.pagesA.length > 0) || (g.pagesB && g.pagesB.length > 0)
  );

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
          <Presentation className="w-7 h-7" style={{ color: "#E91E63" }} />
        </div>
        <p className="text-sm font-medium text-gray-700">暂无PPT对比数据</p>
        <p className="text-xs text-gray-400 mt-1">请在"管理"模式中上传PPT</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <PptCompareGroupView key={group.id} group={group} />
      ))}
    </div>
  );
}

// 单个PPT对比组的展示（上下同步滑动）
function PptCompareGroupView({ group }: { group: any }) {
  const scrollRefA = useRef<HTMLDivElement>(null);
  const scrollRefB = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  // 同步滑动
  const handleScroll = useCallback((source: 'A' | 'B') => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    const srcRef = source === 'A' ? scrollRefA : scrollRefB;
    const tgtRef = source === 'A' ? scrollRefB : scrollRefA;
    if (srcRef.current && tgtRef.current) {
      tgtRef.current.scrollLeft = srcRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const maxPages = Math.max(group.pagesA?.length || 0, group.pagesB?.length || 0);
  const SLIDE_W = 280;
  const SLIDE_H = 158; // 16:9比例

  return (
    <div>
      {/* 组标题 */}
      {group.title && (
        <div className="px-4 mb-2">
          <h3 className="text-sm font-bold text-gray-800">{group.title}</h3>
        </div>
      )}

      {/* PPT-A */}
      {group.pagesA && group.pagesA.length > 0 && (
        <div className="mb-1">
          <div className="px-4 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#E3F2FD', color: '#1565C0' }}>
              {group.titleA || 'PPT-A'}
            </span>
          </div>
          <div
            ref={scrollRefA}
            onScroll={() => handleScroll('A')}
            className="flex gap-2 overflow-x-auto px-4 pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {group.pagesA.map((page: any) => (
              <div key={page.id} className="flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 shadow-sm" style={{ width: `${SLIDE_W}px`, height: `${SLIDE_H}px` }}>
                <img src={page.imageUrl} alt={`第${page.pageNum}页`} className="w-full h-full object-contain bg-white" loading="lazy" decoding="async" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PPT-B */}
      {group.pagesB && group.pagesB.length > 0 && (
        <div className="mb-1">
          <div className="px-4 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FFF3E0', color: '#E65100' }}>
              {group.titleB || 'PPT-B'}
            </span>
          </div>
          <div
            ref={scrollRefB}
            onScroll={() => handleScroll('B')}
            className="flex gap-2 overflow-x-auto px-4 pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {group.pagesB.map((page: any) => (
              <div key={page.id} className="flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 shadow-sm" style={{ width: `${SLIDE_W}px`, height: `${SLIDE_H}px` }}>
                <img src={page.imageUrl} alt={`第${page.pageNum}页`} className="w-full h-full object-contain bg-white" loading="lazy" decoding="async" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 主页面 =====
export default function BeautyShowcase() {
  const [activeTab, setActiveTab] = useState<"photo" | "ppt">("photo");
  const [viewMode, setViewMode] = useState<"showcase" | "manage">("showcase");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
      {/* 顶部导航栏 */}
      <div
        className="sticky top-0 z-50 px-4 pt-3 pb-3"
        style={{
          background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link href="/beauty">
            <button className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          </Link>
          <h1 className="text-lg font-bold text-white tracking-wide flex-1">
            素材展示
          </h1>
          {/* 切换展示/管理模式 */}
          <button
            onClick={() =>
              setViewMode(viewMode === "showcase" ? "manage" : "showcase")
            }
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white"
          >
            {viewMode === "showcase" ? "管理" : "展示"}
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("photo")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background:
                activeTab === "photo"
                  ? "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)"
                  : "#fff",
              color: activeTab === "photo" ? "#fff" : "#666",
              boxShadow:
                activeTab === "photo"
                  ? "0 4px 12px rgba(233,30,99,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <ImageIcon className="w-4 h-4" />
            照片对比
          </button>
          <button
            onClick={() => setActiveTab("ppt")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background:
                activeTab === "ppt"
                  ? "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)"
                  : "#fff",
              color: activeTab === "ppt" ? "#fff" : "#666",
              boxShadow:
                activeTab === "ppt"
                  ? "0 4px 12px rgba(233,30,99,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <Presentation className="w-4 h-4" />
            PPT对比
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="pb-24 pt-2">
        {activeTab === "photo" && (
          <>
            {viewMode === "manage" ? (
              <PhotoGroupManager />
            ) : (
              <PhotoShowcase />
            )}
          </>
        )}

        {activeTab === "ppt" && (
          <>
            {viewMode === "manage" ? (
              <PptCompareManager />
            ) : (
              <PptCompareShowcase />
            )}
          </>
        )}
      </div>
    </div>
  );
}
