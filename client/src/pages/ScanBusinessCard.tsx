import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Camera, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ScanBusinessCard() {
  const [, setLocation] = useLocation();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const uploadImageMutation = trpc.contacts.uploadBusinessCardImage.useMutation();
  const recognizeMutation = trpc.contacts.recognizeBusinessCard.useMutation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    // 读取图片并显示预览
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRecognize = async () => {
    if (!selectedImage) return;

    setIsRecognizing(true);
    try {
      // 1. 上传图片到S3
      const uploadResult = await uploadImageMutation.mutateAsync({
        imageData: selectedImage,
      });

      // 2. 调用识别接口
      const recognizeResult = await recognizeMutation.mutateAsync({
        imageUrl: uploadResult.url,
      });

      // 3. 跳转到识别结果页面
      setLocation(
        `/parent/contacts/scan-result?data=${encodeURIComponent(
          JSON.stringify(recognizeResult)
        )}`
      );
    } catch (error: any) {
      console.error("识别失败:", error);
      toast.error(error.message || "识别失败,请重试");
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/parent/contacts")}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">扫描名片</h1>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="p-4">
        {!selectedImage ? (
          // 未选择图片时显示上传选项
          <div className="space-y-6">
            <div className="text-center text-muted-foreground">
              <p className="text-base">请拍照或上传名片图片</p>
              <p className="text-sm mt-2">支持 JPG、PNG 格式,最大 10MB</p>
            </div>

            {/* 拍照按钮 */}
            <Card className="border-2 border-dashed hover:border-primary transition-colors">
              <CardContent className="p-0">
                <Button
                  variant="ghost"
                  className="w-full h-48 flex-col gap-4 text-base"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-16 w-16" />
                  <span className="text-lg font-medium">拍照</span>
                </Button>
              </CardContent>
            </Card>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* 上传按钮 */}
            <Card className="border-2 border-dashed hover:border-primary transition-colors">
              <CardContent className="p-0">
                <Button
                  variant="ghost"
                  className="w-full h-48 flex-col gap-4 text-base"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-16 w-16" />
                  <span className="text-lg font-medium">从相册选择</span>
                </Button>
              </CardContent>
            </Card>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          // 已选择图片时显示预览和操作按钮
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <img
                  src={selectedImage}
                  alt="名片预览"
                  className="w-full rounded-lg"
                />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-12 text-base"
                onClick={handleReset}
                disabled={isRecognizing}
              >
                重新选择
              </Button>
              <Button
                size="lg"
                className="flex-1 h-12 text-base"
                onClick={handleRecognize}
                disabled={isRecognizing}
              >
                {isRecognizing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    识别中...
                  </>
                ) : (
                  "开始识别"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
