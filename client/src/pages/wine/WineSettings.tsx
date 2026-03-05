import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Upload, Camera, Globe, Phone, MessageCircle, FileText, Image, Wine } from "lucide-react";
import { toast } from "sonner";

export default function WineSettings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // 权限拦截：仅 cx8618 可访问商家设置（§9.3 数据隔离规则）
  if (!user || user.username !== 'cx8618') {
    return (
      <div className="min-h-screen bg-[#1a0a0a] flex flex-col items-center justify-center gap-4 px-6">
        <Wine className="w-12 h-12 text-[#8B1A1A]/40" />
        <p className="text-[#8a7a6a] text-center">此页面仅限商家管理员访问</p>
        <button
          onClick={() => setLocation('/wine')}
          className="bg-[#8B1A1A] text-white px-6 py-2.5 rounded-xl text-sm"
        >
          返回首页
        </button>
      </div>
    );
  }


  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading, refetch } = trpc.merchant.getMerchantSettings.useQuery();

  const [form, setForm] = useState({
    shareTitle: "",
    shareDescription: "",
    contactWechat: "",
    contactPhone: "",
    aboutUs: "",
    officialWebsite: "",
  });
  const [formInitialized, setFormInitialized] = useState(false);

  // 当数据加载完成后初始化表单
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

  const updateMutation = trpc.merchant.updateMerchantSettings.useMutation({
    onSuccess: () => {
      toast.success("保存成功", { description: "商家设置已更新" });
      refetch();
    },
    onError: (e) => toast.error("保存失败", { description: e.message }),
  });

  const uploadLogoMutation = trpc.merchant.uploadMerchantLogo.useMutation({
    onSuccess: () => {
      toast.success("Logo上传成功");
      refetch();
    },
    onError: (e) => toast.error("上传失败", { description: e.message }),
  });

  const uploadCoverMutation = trpc.merchant.uploadMerchantCover.useMutation({
    onSuccess: () => {
      toast.success("封面图上传成功");
      refetch();
    },
    onError: (e) => toast.error("上传失败", { description: e.message }),
  });

  const handleImageUpload = async (file: File, type: "logo" | "cover") => {
    if (!file) return;
    // 限制文件大小 16MB
    if (file.size > 16 * 1024 * 1024) {
      toast.error("文件过大", { description: "请选择16MB以内的图片" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      if (type === "logo") {
        uploadLogoMutation.mutate({ base64, mimeType: file.type });
      } else {
        uploadCoverMutation.mutate({ base64, mimeType: file.type });
      }
    };
    reader.readAsDataURL(file);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a0a0a] flex items-center justify-center">
        <div className="text-[#c9a96e] text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0a0a] text-white pb-20">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#1a0a0a]/95 backdrop-blur-sm border-b border-[#722F37]/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/wine/profile")} className="p-1">
          <ChevronLeft className="w-6 h-6 text-[#c9a96e]" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">商家设置</h1>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-[#722F37] text-white text-sm px-4 py-1.5 rounded-full font-medium disabled:opacity-50"
        >
          {updateMutation.isPending ? "保存中..." : "保存"}
        </button>
      </div>

      <div className="px-4 pt-4 space-y-6">

        {/* 分享配置区域 */}
        <div className="bg-[#2a1010] rounded-2xl p-4 border border-[#722F37]/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-[#c9a96e] rounded-full" />
            <h2 className="text-[#c9a96e] font-semibold text-sm">分享配置</h2>
            <span className="text-xs text-gray-500 ml-1">· 分享链接时显示的信息</span>
          </div>

          {/* Logo上传 */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-2 block">商家 Logo <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl border-2 border-dashed border-[#722F37]/50 flex items-center justify-center overflow-hidden cursor-pointer bg-[#1a0a0a] hover:border-[#c9a96e]/50 transition-colors"
                onClick={() => logoInputRef.current?.click()}
              >
                {settings?.shareLogo ? (
                  <img src={settings.shareLogo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                ) : settings?.shopLogoUrl ? (
                  <img src={settings.shopLogoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <Camera className="w-6 h-6 text-[#722F37]/60" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">建议尺寸：400×400px</p>
                <p className="text-xs text-gray-500 mt-0.5">自动压缩为 WebP 格式</p>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadLogoMutation.isPending}
                  className="mt-2 text-xs text-[#c9a96e] border border-[#c9a96e]/30 px-3 py-1 rounded-full hover:bg-[#c9a96e]/10 transition-colors disabled:opacity-50"
                >
                  {uploadLogoMutation.isPending ? "上传中..." : "更换 Logo"}
                </button>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], "logo")}
            />
          </div>

          {/* 封面图上传 */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-2 block">分享封面图 <span className="text-red-400">*</span></label>
            <div
              className="w-full h-28 rounded-xl border-2 border-dashed border-[#722F37]/50 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[#1a0a0a] hover:border-[#c9a96e]/50 transition-colors relative"
              onClick={() => coverInputRef.current?.click()}
            >
              {settings?.shareCoverImage ? (
                <>
                  <img src={settings.shareCoverImage} alt="封面图" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs">点击更换</span>
                  </div>
                </>
              ) : (
                <>
                  <Image className="w-8 h-8 text-[#722F37]/40 mb-1" />
                  <span className="text-xs text-gray-500">点击上传分享封面图</span>
                  <span className="text-xs text-gray-600 mt-0.5">建议尺寸：1200×630px</span>
                </>
              )}
            </div>
            {uploadCoverMutation.isPending && (
              <p className="text-xs text-[#c9a96e] mt-1">上传中...</p>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], "cover")}
            />
          </div>

          {/* 分享标题 */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1.5 block">分享标题 <span className="text-red-400">*</span></label>
            <input
              type="text"
              maxLength={50}
              value={form.shareTitle}
              onChange={(e) => setForm(f => ({ ...f, shareTitle: e.target.value }))}
              placeholder="如：红酒文化商会"
              className="w-full bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50"
            />
            <p className="text-xs text-gray-600 mt-1 text-right">{form.shareTitle.length}/50</p>
          </div>

          {/* 分享描述 */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">分享描述语 <span className="text-red-400">*</span></label>
            <input
              type="text"
              maxLength={100}
              value={form.shareDescription}
              onChange={(e) => setForm(f => ({ ...f, shareDescription: e.target.value }))}
              placeholder="如：品味世界，汇聚同好"
              className="w-full bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50"
            />
            <p className="text-xs text-gray-600 mt-1 text-right">{form.shareDescription.length}/100</p>
          </div>
        </div>

        {/* 联系方式 */}
        <div className="bg-[#2a1010] rounded-2xl p-4 border border-[#722F37]/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-[#c9a96e] rounded-full" />
            <h2 className="text-[#c9a96e] font-semibold text-sm">联系方式</h2>
            <span className="text-xs text-gray-500 ml-1">· 可选</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-4 h-4 text-[#c9a96e] shrink-0" />
              <input
                type="text"
                maxLength={50}
                value={form.contactWechat}
                onChange={(e) => setForm(f => ({ ...f, contactWechat: e.target.value }))}
                placeholder="微信号"
                className="flex-1 bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-[#c9a96e] shrink-0" />
              <input
                type="tel"
                maxLength={20}
                value={form.contactPhone}
                onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="联系电话"
                className="flex-1 bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-[#c9a96e] shrink-0" />
              <input
                type="url"
                maxLength={200}
                value={form.officialWebsite}
                onChange={(e) => setForm(f => ({ ...f, officialWebsite: e.target.value }))}
                placeholder="官网地址（https://...）"
                className="flex-1 bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50"
              />
            </div>
          </div>
        </div>

        {/* 商家简介 */}
        <div className="bg-[#2a1010] rounded-2xl p-4 border border-[#722F37]/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-[#c9a96e] rounded-full" />
            <h2 className="text-[#c9a96e] font-semibold text-sm">关于我们</h2>
            <span className="text-xs text-gray-500 ml-1">· 可选</span>
          </div>
          <textarea
            maxLength={500}
            rows={4}
            value={form.aboutUs}
            onChange={(e) => setForm(f => ({ ...f, aboutUs: e.target.value }))}
            placeholder="介绍您的商家/品牌故事..."
            className="w-full bg-[#1a0a0a] border border-[#722F37]/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a96e]/50 resize-none"
          />
          <p className="text-xs text-gray-600 mt-1 text-right">{form.aboutUs.length}/500</p>
        </div>

        {/* 分享预览提示 */}
        <div className="bg-[#1a0a0a] rounded-2xl p-4 border border-[#c9a96e]/10">
          <div className="flex items-start gap-3">
            <Upload className="w-4 h-4 text-[#c9a96e] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[#c9a96e] font-medium mb-1">分享效果说明</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                设置完成后，当您或用户分享商家页面链接时，微信/浏览器预览卡片将显示您配置的 Logo、封面图、标题和描述，而非脉动平台的默认信息。
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
