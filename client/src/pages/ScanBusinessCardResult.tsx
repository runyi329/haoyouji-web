import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type RecognizedInfo = {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  wechat: string;
  website: string;
};

export default function ScanBusinessCardResult() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState<RecognizedInfo>({
    name: "",
    company: "",
    title: "",
    phone: "",
    email: "",
    address: "",
    wechat: "",
    website: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // 从URL参数获取识别结果
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataStr = params.get("data");
    if (dataStr) {
      try {
        const data = JSON.parse(decodeURIComponent(dataStr));
        setFormData(data);
      } catch (error) {
        console.error("解析识别结果失败:", error);
        toast.error("无法解析识别结果");
      }
    }
  }, []);

  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      toast.success("联系人已添加");
      setLocation("/parent/contacts/list");
    },
    onError: (error) => {
      setIsSaving(false);
      toast.error(error.message || "保存失败,请重试");
    },
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("请输入联系人姓名");
      return;
    }

    setIsSaving(true);
    createContactMutation.mutate({
      name: formData.name,
      company: formData.company || undefined,
      title: formData.title || undefined,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      address: formData.address || undefined,
      wechat: formData.wechat || undefined,
      website: formData.website || undefined,
    });
  };

  const handleChange = (field: keyof RecognizedInfo, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/parent/contacts/scan-card")}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">识别结果</h1>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">请检查并编辑信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="name" className="text-base">
                姓名 *
              </Label>
              <Input
                id="name"
                className="h-12 text-base mt-2"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="请输入姓名"
              />
            </div>

            <div>
              <Label htmlFor="company" className="text-base">
                公司
              </Label>
              <Input
                id="company"
                className="h-12 text-base mt-2"
                value={formData.company}
                onChange={(e) => handleChange("company", e.target.value)}
                placeholder="请输入公司名称"
              />
            </div>

            <div>
              <Label htmlFor="title" className="text-base">
                职位
              </Label>
              <Input
                id="title"
                className="h-12 text-base mt-2"
                value={formData.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="请输入职位"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-base">
                电话
              </Label>
              <Input
                id="phone"
                type="tel"
                className="h-12 text-base mt-2"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="请输入电话号码"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-base">
                邮箱
              </Label>
              <Input
                id="email"
                type="email"
                className="h-12 text-base mt-2"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="请输入邮箱地址"
              />
            </div>

            <div>
              <Label htmlFor="wechat" className="text-base">
                微信
              </Label>
              <Input
                id="wechat"
                className="h-12 text-base mt-2"
                value={formData.wechat}
                onChange={(e) => handleChange("wechat", e.target.value)}
                placeholder="请输入微信号"
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-base">
                地址
              </Label>
              <Input
                id="address"
                className="h-12 text-base mt-2"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="请输入地址"
              />
            </div>

            <div>
              <Label htmlFor="website" className="text-base">
                网站
              </Label>
              <Input
                id="website"
                type="url"
                className="h-12 text-base mt-2"
                value={formData.website}
                onChange={(e) => handleChange("website", e.target.value)}
                placeholder="请输入网站地址"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 底部固定按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-12 text-base"
            onClick={() => setLocation("/parent/contacts/scan-card")}
            disabled={isSaving}
          >
            重新扫描
          </Button>
          <Button
            size="lg"
            className="flex-1 h-12 text-base"
            onClick={handleSave}
            disabled={isSaving || !formData.name.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                保存中...
              </>
            ) : (
              "保存到联系人"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
