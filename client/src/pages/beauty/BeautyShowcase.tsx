/**
 * 奢贝美容院 - 数据展示
 * 路径: /beauty/showcase
 * 功能:
 * 1. 照片对比Tab: 进入管理页面，用户可添加多组照片（每组2-5张）
 *    - 上传时弹出裁剪框（固定3:4比例），用户自行调整显示区域
 *    - 裁剪后压缩上传到COS
 * 2. PPT对比Tab: 展示PPT前后对比（待实现）
 * 3. 展示页: 每组照片显示为独立横向滑动轮播列表
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

  // 限制输出尺寸，保持3:4比例
  let outW = pixelCrop.width;
  let outH = pixelCrop.height;
  if (outW > maxWidth) {
    const scale = maxWidth / outW;
    outW = maxWidth;
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

  return canvas.toDataURL("image/jpeg", 0.85);
}

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

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

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

      {/* 裁剪区域 */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={3 / 4}
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

              {/* 添加照片按钮（每组最多5张） */}
              {(!group.photos || group.photos.length < 5) && (
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
                  <div
                    className="rounded-xl overflow-hidden bg-gray-100"
                    style={{ width: "180px", height: "240px" }}
                  >
                    <img
                      src={photo.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
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
            数据展示
          </h1>
          {/* 切换展示/管理模式 */}
          {activeTab === "photo" && (
            <button
              onClick={() =>
                setViewMode(viewMode === "showcase" ? "manage" : "showcase")
              }
              className="px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white"
            >
              {viewMode === "showcase" ? "管理" : "展示"}
            </button>
          )}
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
          <div className="px-4">
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{
                  background:
                    "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
                }}
              >
                <Presentation
                  className="w-7 h-7"
                  style={{ color: "#E91E63" }}
                />
              </div>
              <p className="text-sm font-medium text-gray-700">
                PPT对比数据准备中
              </p>
              <p className="text-xs text-gray-400 mt-1">
                即将上线，敬请期待
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
