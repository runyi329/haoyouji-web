import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { autoCompressImage } from "@/utils/imageUtils";

export default function BannerConfig() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: banner, refetch } = trpc.homeBanner.get.useQuery();
  const updateMutation = trpc.homeBanner.update.useMutation({
    onSuccess: () => {
      toast.success("横幅配置已保存！");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 初始化表单
  useState(() => {
    if (banner) {
      setTitle(banner.title || "");
      setDescription(banner.description || "");
      setImageUrl(banner.imageUrl || "");
    }
  });

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过5MB");
      return;
    }

    setUploading(true);

    try {
      // 自动压缩图片（Banner 用高清模式）
      const { base64 } = await autoCompressImage(file, 'hd');
      setImageUrl(base64);
      toast.success("图片上传成功！");
    } catch (error) {
      toast.error("图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-blue-50 pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回管理后台</span>
          </button>
          <h1 className="font-bold text-lg">首页横幅配置</h1>
          <div className="w-32"></div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="container py-6">
        <div className="max-w-2xl mx-auto">
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-6">编辑首页横幅</h2>

            <div className="space-y-6">
              {/* 标题 */}
              <div className="space-y-2">
                <Label>横幅标题</Label>
                <Input
                  placeholder="例如：旺旺喵喵成长基地"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  留空则不显示标题
                </p>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <Label>横幅描述</Label>
                <Textarea
                  placeholder="例如：这里有好玩的游戏、有趣的知识、珍贵的回忆，还有满满的爱和鼓励！"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  留空则不显示描述
                </p>
              </div>

              {/* 图片 */}
              <div className="space-y-2">
                <Label>横幅图片</Label>
                <div className="space-y-4">
                  {imageUrl && (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden border-2 border-border">
                      <img
                        src={imageUrl}
                        alt="横幅预览"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="图片URL"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    <label htmlFor="banner-upload">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploading}
                        asChild
                      >
                        <span>
                          {uploading ? (
                            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          上传图片
                        </span>
                      </Button>
                    </label>
                    <input
                      id="banner-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    留空则不显示图片。支持上传图片或直接输入图片URL
                  </p>
                </div>
              </div>

              {/* 预览 */}
              {(title || description || imageUrl) && (
                <div className="space-y-2">
                  <Label>预览效果</Label>
                  <Card className="p-6 bg-gradient-to-br from-blue-50 to-rose-50">
                    {imageUrl && (
                      <div className="mb-4 rounded-lg overflow-hidden">
                        <img
                          src={imageUrl}
                          alt="预览"
                          className="w-full h-32 object-cover"
                        />
                      </div>
                    )}
                    {title && (
                      <h3 className="text-2xl font-bold mb-2 text-center">{title}</h3>
                    )}
                    {description && (
                      <p className="text-muted-foreground text-center">{description}</p>
                    )}
                  </Card>
                </div>
              )}

              {/* 保存按钮 */}
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  className="flex-1"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "保存中..." : "保存配置"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/admin")}
                >
                  取消
                </Button>
              </div>
            </div>
          </Card>

          {/* 提示信息 */}
          <div className="mt-6 p-4 rounded-lg bg-[#F5F5F5] border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>提示：</strong>首页横幅会显示在所有用户的首页顶部。您可以设置标题、描述和图片，也可以全部留空来隐藏横幅。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
