import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Star, Camera, Edit, Check, X, Trash2, Plus } from "lucide-react";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function KidsManagement() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [editingKid, setEditingKid] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKidName, setNewKidName] = useState("");
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [currentKidId, setCurrentKidId] = useState<number | null>(null);

  const { data: specialKids, refetch: refetchKids } = trpc.specialKids.list.useQuery({ forManagement: true });
  const uploadAvatarMutation = trpc.specialKids.uploadAvatar.useMutation();
  const updateKidMutation = trpc.specialKids.update.useMutation({
    onSuccess: () => {
      toast.success("更新成功！");
      setEditingKid(null);
      refetchKids();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const createKidMutation = trpc.specialKids.create.useMutation({
    onSuccess: (data) => {
      // 显示账户信息
      toast.success(
        `宝贝添加成功！\n账户：${data.account.username}\n密码：${data.account.password}`,
        { duration: 10000 }
      );
      setNewKidName("");
      setShowAddForm(false);
      refetchKids();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deleteKidMutation = trpc.specialKids.delete.useMutation({
    onSuccess: () => {
      toast.success("宝贝已删除");
      refetchKids();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 检查权限
  if (user?.role !== "parent" && user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">权限不足</h2>
          <p className="text-muted-foreground mb-4">只有家长可以访问此页面</p>
          <Button onClick={() => navigate("/")}>返回首页</Button>
        </Card>
      </div>
    );
  }

  const handleFileSelect = (kidId: number, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过5MB");
      return;
    }

    // 读取文件并打开裁剪对话框
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageToCrop(dataUrl);
      setCurrentKidId(kidId);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!currentKidId) return;

    setUploadingAvatar(currentKidId);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(buffer);

      try {
        const uploadResult = await uploadAvatarMutation.mutateAsync({
          id: currentKidId,
          filename: "avatar.jpg",
          contentType: "image/jpeg",
          fileData: uint8Array,
        });

        if (uploadResult.url) {
          refetchKids();
          toast.success("头像上传成功！");
        }
      } catch (uploadError) {
        toast.error("上传失败，请重试");
      }
      setUploadingAvatar(null);
      setCurrentKidId(null);
    };
    reader.readAsArrayBuffer(croppedBlob);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/parent")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回家长中心</span>
          </button>
          <h1 className="text-xl font-bold">宝贝档案</h1>
          <div className="w-32"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">我的宝贝</h2>
            <Button
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              添加宝贝
            </Button>
          </div>

          {/* 添加宝贝表单 */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold mb-3">添加新宝贝</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="输入宝贝名称"
                  value={newKidName}
                  onChange={(e) => setNewKidName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newKidName.trim()) {
                      createKidMutation.mutate({ name: newKidName.trim() });
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (newKidName.trim()) {
                      createKidMutation.mutate({ name: newKidName.trim() });
                    }
                  }}
                  disabled={!newKidName.trim() || createKidMutation.isPending}
                >
                  {createKidMutation.isPending ? "添加中..." : "确定"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewKidName("");
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {!specialKids || specialKids.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>还没有宝贝档案</p>
              {user?.role === "super_admin" ? (
                <p className="text-sm mt-2">点击上方"添加宝贝"按钮来添加第一个宝贝</p>
              ) : (
                <p className="text-sm mt-2">请联系管理员添加宝贝信息</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {specialKids.map((kid) => (
                <Card key={kid.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col items-center">
                    {/* 头像 */}
                    <div className="relative mb-4">
                      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg">
                        {kid.avatar ? (
                          <img
                            src={kid.avatar}
                            alt={kid.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-3xl font-bold">
                            {kid.name[0]}
                          </div>
                        )}
                      </div>

                      {/* 上传头像按钮 */}
                      <label
                        htmlFor={`avatar-upload-${kid.id}`}
                        className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        {uploadingAvatar === kid.id ? (
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Camera className="w-4 h-4 text-gray-600" />
                        )}
                      </label>
                      <input
                        id={`avatar-upload-${kid.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(kid.id, file);
                        }}
                      />
                    </div>

                    {/* 名称编辑 */}
                    {editingKid === kid.id ? (
                      <div className="flex items-center gap-2 mb-4">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-center"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          onClick={() => {
                            if (editName.trim()) {
                              updateKidMutation.mutate({
                                id: kid.id,
                                name: editName.trim(),
                              });
                            }
                          }}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          onClick={() => setEditingKid(null)}
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-4">
                        <h3 className="font-bold text-xl">{kid.name}</h3>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          onClick={() => {
                            setEditingKid(kid.id);
                            setEditName(kid.name);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm(`确定要删除 ${kid.name} 吗？\n\n删除后将同时删除该宝贝的登录账户，此操作不可恢复！`)) {
                              deleteKidMutation.mutate({ id: kid.id });
                            }
                          }}
                          disabled={deleteKidMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    {/* 五角星数量 */}
                    <div className="flex items-center gap-2 text-amber-500 mb-4">
                      <Star className="w-6 h-6 fill-current" />
                      <span className="text-2xl font-bold">{kid.stars}</span>
                      <span className="text-sm text-muted-foreground">颗星星</span>
                    </div>

                    {/* 登录账号 */}
                    {kid.userId && (
                      <div className="w-full text-left bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">登录账号：</p>
                        <p className="text-sm font-mono text-gray-700 break-all">{(kid as any).username || "暂无"}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 提示信息 */}
          <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>提示：</strong>点击头像右下角的相机图标可以上传照片，点击名称旁边的编辑图标可以修改名称。
              点击垃圾桶图标可以删除宝贝（删除后将同时删除该宝贝的登录账户）。
              星星可以通过游戏获胜自动获得。
            </p>
          </div>
        </Card>
      </div>

      {/* 图片裁剪对话框 */}
      {imageToCrop && (
        <ImageCropDialog
          open={cropDialogOpen}
          onClose={() => {
            setCropDialogOpen(false);
            setImageToCrop(null);
            setCurrentKidId(null);
          }}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
