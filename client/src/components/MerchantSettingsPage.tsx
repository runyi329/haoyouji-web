/**
 * 通用商家设置页面组件
 * 规范：§10.1 所有商家共用同一套设置 UI，通过 merchantCode 区分数据
 *
 * 使用方式：
 *   <MerchantSettingsPage
 *     merchantCode="jiang"
 *     adminUsername="jiang"
 *     accentColor="#D32F2F"
 *     bgColor="#0A0A0F"
 *     cardBgColor="#0d0d14"
 *     borderColor="#D32F2F"
 *     backPath="/jiang/profile"
 *   />
 */
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft, Camera, Globe, Phone, MessageCircle,
  FileText, Image, Settings, X, Check, Crop
} from "lucide-react";
import { toast } from "sonner";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface MerchantSettingsPageProps {
  /** 商家编码，对应 merchants 表的 merchantCode 字段 */
  merchantCode: string;
  /** 仅允许此用户名访问管理设置 */
  adminUsername: string;
  /** 主题强调色，默认 #D32F2F */
  accentColor?: string;
  /** 页面背景色，默认 #0A0A0F */
  bgColor?: string;
  /** 卡片背景色，默认 #0d0d14 */
  cardBgColor?: string;
  /** 边框色，默认与 accentColor 相同 */
  borderColor?: string;
  /** 返回按钮目标路径，默认 /{merchantCode}/profile */
  backPath?: string;
}

/** 从 canvas 导出裁剪后的 base64 */
function getCroppedBase64(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  mimeType: string
): string {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = pixelCrop.width * scaleX;
  canvas.height = pixelCrop.height * scaleY;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
  // 统一输出 JPEG（质量 0.92），避免 PNG 过大
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return dataUrl.split(",")[1];
}

export default function MerchantSettingsPage({
  merchantCode,
  adminUsername,
  accentColor = "#D32F2F",
  bgColor = "#0A0A0F",
  cardBgColor = "#0d0d14",
  borderColor,
  backPath,
}: MerchantSettingsPageProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const resolvedBorderColor = borderColor || accentColor;
  const resolvedBackPath = backPath || `/${merchantCode}/profile`;

  // 权限拦截：仅管理员可访问
  if (!user || user.username !== adminUsername) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
        style={{ backgroundColor: bgColor }}
      >
        <Settings className="w-12 h-12 opacity-30" style={{ color: accentColor }} />
        <p className="text-gray-400 text-center text-sm">此页面仅限商家管理员访问</p>
        <button
          onClick={() => setLocation(`/${merchantCode}`)}
          className="text-white px-6 py-2.5 rounded-xl text-sm"
          style={{ backgroundColor: accentColor }}
        >
          返回首页
        </button>
      </div>
    );
  }

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const { data: settings, isLoading, refetch } = trpc.merchant.getMerchantSettings.useQuery();
  const utils = trpc.useUtils();
  const invalidateShareInfo = () => utils.merchant.getMerchantShareInfo.invalidate({ merchantCode });

  const [form, setForm] = useState({
    shareTitle: "",
    shareDescription: "",
    contactWechat: "",
    contactPhone: "",
    aboutUs: "",
    officialWebsite: "",
  });
  const [formInitialized, setFormInitialized] = useState(false);

  if (settings && !formInitialized) {
    setForm({
      shareTitle: settings.shareTitle || settings.shopName || "",
      shareDescription: settings.shareDescription || settings.shopDescription || "",
      contactWechat: settings.contactWechat || "",
      contactPhone: settings.contactPhone || "",
      aboutUs: settings.aboutUs || "",
      officialWebsite: settings.officialWebsite || "",
    });
    setFormInitialized(true);
  }

  // ===== 裁剪弹窗状态 =====
  const [cropModal, setCropModal] = useState<{
    open: boolean;
    src: string;
    type: "logo" | "cover";
    mimeType: string;
  }>({ open: false, src: "", type: "logo", mimeType: "image/jpeg" });
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  // 图片加载完成后设置默认裁剪区域
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const aspect = cropModal.type === "logo" ? 1 : 1200 / 630;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  }, [cropModal.type]);

  const updateMutation = trpc.merchant.updateMerchantSettings.useMutation({
    onSuccess: () => {
      toast.success("保存成功", { description: "商家设置已更新" });
      refetch();
      invalidateShareInfo();
    },
    onError: (e) => toast.error("保存失败", { description: e.message }),
  });

  const uploadLogoMutation = trpc.merchant.uploadMerchantLogo.useMutation({
    onSuccess: () => { toast.success("Logo 上传成功"); refetch(); invalidateShareInfo(); },
    onError: (e) => toast.error("上传失败", { description: e.message }),
  });

  const uploadCoverMutation = trpc.merchant.uploadMerchantCover.useMutation({
    onSuccess: () => { toast.success("封面图上传成功"); refetch(); invalidateShareInfo(); },
    onError: (e) => toast.error("上传失败", { description: e.message }),
  });

  // 选择文件后打开裁剪弹窗
  const handleFileSelect = (file: File, type: "logo" | "cover") => {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("文件过大", { description: "请选择 16MB 以内的图片" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCropModal({ open: true, src: e.target?.result as string, type, mimeType: file.type });
      setCrop(undefined);
      setCompletedCrop(undefined);
    };
    reader.readAsDataURL(file);
  };

  // 确认裁剪并上传
  const handleCropConfirm = () => {
    if (!completedCrop || !imgRef.current) return;
    const base64 = getCroppedBase64(imgRef.current, completedCrop, cropModal.mimeType);
    if (cropModal.type === "logo") {
      uploadLogoMutation.mutate({ base64, mimeType: "image/jpeg" });
    } else {
      uploadCoverMutation.mutate({ base64, mimeType: "image/jpeg" });
    }
    setCropModal(m => ({ ...m, open: false }));
  };

  const handleSave = () => {
    updateMutation.mutate({
      shareTitle: form.shareTitle || undefined,
      shareDescription: form.shareDescription || undefined,
      contactWechat: form.contactWechat || undefined,
      contactPhone: form.contactPhone || undefined,
      aboutUs: form.aboutUs || undefined,
      officialWebsite: form.officialWebsite || undefined,
    });
  };

  const isUploading = uploadLogoMutation.isPending || uploadCoverMutation.isPending;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="text-sm" style={{ color: accentColor }}>加载中...</div>
      </div>
    );
  }

  const inputClass = `w-full border rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none`;
  const inputStyle = {
    backgroundColor: bgColor,
    borderColor: `${resolvedBorderColor}30`,
  };

  return (
    <div className="min-h-screen text-white pb-20" style={{ backgroundColor: bgColor }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: `${bgColor}f5`, borderColor: `${resolvedBorderColor}30` }}
      >
        <button onClick={() => setLocation(resolvedBackPath)} className="p-1">
          <ChevronLeft className="w-6 h-6" style={{ color: accentColor }} />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">商家设置</h1>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="text-white text-sm px-4 py-1.5 rounded-full font-medium disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {updateMutation.isPending ? "保存中..." : "保存"}
        </button>
      </div>

      <div className="px-4 pt-4 space-y-6">

        {/* 分享配置 */}
        <div
          className="rounded-2xl p-4 border"
          style={{ backgroundColor: cardBgColor, borderColor: `${resolvedBorderColor}20` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
            <h2 className="font-semibold text-sm" style={{ color: accentColor }}>分享配置</h2>
            <span className="text-xs text-gray-500 ml-1">· 分享链接时显示的信息</span>
          </div>

          {/* Logo 上传 */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-2 block">商家 Logo <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors relative group"
                style={{ borderColor: `${resolvedBorderColor}50`, backgroundColor: bgColor }}
                onClick={() => logoInputRef.current?.click()}
              >
                {settings?.shareLogo || settings?.shopLogoUrl ? (
                  <>
                    <img src={settings.shareLogo || settings.shopLogoUrl!} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                      <Crop className="w-5 h-5 text-white" />
                    </div>
                  </>
                ) : (
                  <Camera className="w-6 h-6 opacity-40" style={{ color: resolvedBorderColor }} />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">建议尺寸：400×400px</p>
                <p className="text-xs text-gray-500 mt-0.5">上传后可裁剪选取区域</p>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploading}
                  className="mt-2 text-xs border px-3 py-1 rounded-full transition-colors disabled:opacity-50"
                  style={{ color: accentColor, borderColor: `${accentColor}30` }}
                >
                  {uploadLogoMutation.isPending ? "上传中..." : "更换 Logo"}
                </button>
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) { handleFileSelect(e.target.files[0], "logo"); e.target.value = ""; } }} />
          </div>

          {/* 封面图上传 */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-2 block">分享封面图 <span className="text-red-400">*</span></label>
            <div
              className="w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer relative group"
              style={{ borderColor: `${resolvedBorderColor}50`, backgroundColor: bgColor }}
              onClick={() => coverInputRef.current?.click()}
            >
              {settings?.shareCoverImage ? (
                <>
                  <img src={settings.shareCoverImage} alt="封面图" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <Crop className="w-6 h-6 text-white" />
                    <span className="text-white text-xs">点击更换/裁剪</span>
                  </div>
                </>
              ) : (
                <>
                  <Image className="w-8 h-8 opacity-40 mb-1" style={{ color: resolvedBorderColor }} />
                  <span className="text-xs text-gray-500">点击上传分享封面图</span>
                  <span className="text-xs text-gray-600 mt-0.5">上传后可裁剪选取区域</span>
                </>
              )}
            </div>
            {uploadCoverMutation.isPending && <p className="text-xs mt-1" style={{ color: accentColor }}>上传中...</p>}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) { handleFileSelect(e.target.files[0], "cover"); e.target.value = ""; } }} />
          </div>

          {/* 分享标题 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1.5 block">分享标题 <span className="text-red-400">*</span></label>
            <input type="text" maxLength={50} value={form.shareTitle}
              onChange={(e) => setForm(f => ({ ...f, shareTitle: e.target.value }))}
              placeholder="如：润仪算力研发中心"
              className={inputClass} style={inputStyle} />
            <p className="text-xs text-gray-600 mt-1 text-right">{form.shareTitle.length}/50</p>
          </div>

          {/* 分享描述 */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">分享描述语 <span className="text-red-400">*</span></label>
            <input type="text" maxLength={100} value={form.shareDescription}
              onChange={(e) => setForm(f => ({ ...f, shareDescription: e.target.value }))}
              placeholder="如：AI 全链路驱动，算力加工，让 AI 为你落地"
              className={inputClass} style={inputStyle} />
            <p className="text-xs text-gray-600 mt-1 text-right">{form.shareDescription.length}/100</p>
          </div>
        </div>

        {/* 联系方式 */}
        <div
          className="rounded-2xl p-4 border"
          style={{ backgroundColor: cardBgColor, borderColor: `${resolvedBorderColor}20` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
            <h2 className="font-semibold text-sm" style={{ color: accentColor }}>联系方式</h2>
            <span className="text-xs text-gray-500 ml-1">· 可选</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <input type="text" maxLength={50} value={form.contactWechat}
                onChange={(e) => setForm(f => ({ ...f, contactWechat: e.target.value }))}
                placeholder="微信号" className={inputClass} style={inputStyle} />
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <input type="tel" maxLength={20} value={form.contactPhone}
                onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="联系电话" className={inputClass} style={inputStyle} />
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <input type="url" maxLength={100} value={form.officialWebsite}
                onChange={(e) => setForm(f => ({ ...f, officialWebsite: e.target.value }))}
                placeholder="官网地址（https://...）" className={inputClass} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* 关于我们 */}
        <div
          className="rounded-2xl p-4 border"
          style={{ backgroundColor: cardBgColor, borderColor: `${resolvedBorderColor}20` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
            <h2 className="font-semibold text-sm" style={{ color: accentColor }}>关于我们</h2>
            <span className="text-xs text-gray-500 ml-1">· 可选</span>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 shrink-0 mt-2.5" style={{ color: accentColor }} />
            <textarea
              maxLength={500}
              value={form.aboutUs}
              onChange={(e) => setForm(f => ({ ...f, aboutUs: e.target.value }))}
              placeholder="介绍你的品牌、团队或服务..."
              rows={4}
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1 text-right">{form.aboutUs.length}/500</p>
        </div>

        {/* 底部保存按钮 */}
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full text-white py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {updateMutation.isPending ? "保存中..." : "保存所有设置"}
        </button>
      </div>

      {/* ===== 裁剪弹窗 ===== */}
      {cropModal.open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.95)" }}>
          {/* 弹窗顶部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <button
              onClick={() => setCropModal(m => ({ ...m, open: false }))}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="text-center">
              <p className="text-white text-sm font-medium">
                {cropModal.type === "logo" ? "裁剪 Logo" : "裁剪封面图"}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">
                {cropModal.type === "logo" ? "拖拽选取正方形区域" : "拖拽选取 1200×630 比例区域"}
              </p>
            </div>
            <button
              onClick={handleCropConfirm}
              disabled={!completedCrop || isUploading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: accentColor }}
            >
              <Check className="w-4 h-4" />
              确认
            </button>
          </div>

          {/* 裁剪区域 */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={cropModal.type === "logo" ? 1 : 1200 / 630}
              minWidth={50}
              minHeight={50}
              keepSelection
            >
              <img
                ref={imgRef}
                src={cropModal.src}
                alt="裁剪预览"
                onLoad={onImageLoad}
                style={{ maxWidth: "100%", maxHeight: "calc(100vh - 160px)", objectFit: "contain" }}
              />
            </ReactCrop>
          </div>

          {/* 底部提示 */}
          <div className="px-4 py-3 text-center border-t border-white/10">
            <p className="text-gray-500 text-xs">双指捏合可缩放图片 · 拖拽边角调整裁剪框</p>
          </div>
        </div>
      )}
    </div>
  );
}
