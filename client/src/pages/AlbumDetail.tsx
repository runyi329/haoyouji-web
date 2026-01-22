import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useParams } from "wouter";
import { ArrowLeft, Plus, Image as ImageIcon, X, MessageCircle, Send, Trash2, LayoutGrid, Square, Grid2X2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

type LayoutMode = "1" | "2" | "3";

export default function AlbumDetail() {
  const params = useParams<{ id: string }>();
  const albumId = parseInt(params.id || "0");
  const { user, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);
  
  // 布局模式状态，从localStorage读取用户偏好
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("albumLayoutMode") as LayoutMode) || "2";
    }
    return "2";
  });

  // 保存布局偏好到localStorage
  useEffect(() => {
    localStorage.setItem("albumLayoutMode", layoutMode);
  }, [layoutMode]);

  // 公开访问：无需登录即可查看相册和照片
  const { data: album } = trpc.albums.get.useQuery({ id: albumId });
  const { data: photos, refetch: refetchPhotos } = trpc.photos.list.useQuery({ albumId });
  const { data: photoDetail } = trpc.photos.get.useQuery(
    { id: selectedPhoto! },
    { enabled: selectedPhoto !== null }
  );
  const { data: comments, refetch: refetchComments } = trpc.photos.getComments.useQuery(
    { photoId: selectedPhoto! },
    { enabled: selectedPhoto !== null }
  );

  const uploadPhoto = trpc.photos.upload.useMutation({
    onSuccess: () => {
      toast.success("照片上传成功！");
      refetchPhotos();
      setUploading(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setUploading(false);
    },
  });

  const addComment = trpc.photos.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      refetchComments();
    },
    onError: (error) => {
      toast.error(error.message || "评论失败，请先登录");
    },
  });

  const deletePhoto = trpc.photos.delete.useMutation({
    onSuccess: () => {
      toast.success("照片已删除");
      setSelectedPhoto(null);
      refetchPhotos();
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadPhoto.mutate({
        albumId,
        fileData: base64,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !selectedPhoto) return;
    if (!isAuthenticated) {
      toast.error("请先登录后再评论");
      return;
    }
    addComment.mutate({
      photoId: selectedPhoto,
      content: newComment,
    });
  };

  // 根据布局模式返回对应的grid类名
  const getGridClassName = () => {
    switch (layoutMode) {
      case "1":
        return "grid grid-cols-1 gap-4";
      case "2":
        return "grid grid-cols-2 gap-3";
      case "3":
        return "grid grid-cols-3 gap-2";
      default:
        return "grid grid-cols-2 gap-3";
    }
  };

  // 根据布局模式返回对应的图片高宽比类名
  const getAspectClassName = () => {
    switch (layoutMode) {
      case "1":
        return "aspect-[4/3]"; // 一行一张时使用4:3比例，更大更清晰
      case "2":
        return "aspect-square"; // 一行两张时使用正方形
      case "3":
        return "aspect-square"; // 一行三张时使用正方形
      default:
        return "aspect-square";
    }
  };

  // 检查当前用户是否是相册所有者
  const isOwner = isAuthenticated && album && user?.id === album.userId;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/albums">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg truncate">{album?.name || "相册"}</h1>
          </div>
          {/* 只有登录用户才能上传照片 */}
          {isAuthenticated && (
            <>
              <Button
                size="sm"
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Plus className="w-4 h-4 mr-1" />
                {uploading ? "上传中..." : "添加"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </>
          )}
        </div>
      </header>

      <main className="container py-6">
        {/* 相册描述 */}
        {album?.description && (
          <Card className="p-4 mb-6 bg-gradient-to-br from-pink-50 to-rose-50 border-0">
            <p className="text-sm text-muted-foreground">{album.description}</p>
          </Card>
        )}

        {/* 布局切换控制栏 */}
        {photos && photos.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">
              共 {photos.length} 张照片
            </span>
            <ToggleGroup
              type="single"
              value={layoutMode}
              onValueChange={(value) => value && setLayoutMode(value as LayoutMode)}
              className="bg-muted/50 rounded-lg p-1"
            >
              <ToggleGroupItem
                value="1"
                aria-label="一行一张"
                className="data-[state=on]:bg-white data-[state=on]:shadow-sm px-3 py-1.5"
              >
                <Square className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="2"
                aria-label="一行两张"
                className="data-[state=on]:bg-white data-[state=on]:shadow-sm px-3 py-1.5"
              >
                <Grid2X2 className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="3"
                aria-label="一行三张"
                className="data-[state=on]:bg-white data-[state=on]:shadow-sm px-3 py-1.5"
              >
                <LayoutGrid className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* 照片网格 */}
        {photos && photos.length > 0 ? (
          <div className={getGridClassName()}>
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`${getAspectClassName()} rounded-xl overflow-hidden cursor-pointer card-hover shadow-soft`}
                onClick={() => setSelectedPhoto(photo.id)}
              >
                <img
                  src={photo.url}
                  alt={photo.description || "照片"}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-pink-50 flex items-center justify-center">
              <ImageIcon className="w-10 h-10 text-pink-300" />
            </div>
            <h3 className="font-bold text-lg mb-2">还没有照片</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAuthenticated ? "上传第一张照片，开始记录美好" : "这个相册还没有照片"}
            </p>
            {isAuthenticated && (
              <Button
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="w-4 h-4 mr-1" />
                上传照片
              </Button>
            )}
          </div>
        )}
      </main>

      {/* 照片详情弹窗 */}
      <Dialog open={selectedPhoto !== null} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {photoDetail && (
            <>
              {/* 照片 */}
              <div className="relative">
                <img
                  src={photoDetail.url}
                  alt={photoDetail.description || "照片"}
                  className="w-full max-h-[50vh] object-contain bg-black"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* 信息和评论 */}
              <div className="p-4 space-y-4">
                {/* 描述 */}
                {photoDetail.description && (
                  <p className="text-sm">{photoDetail.description}</p>
                )}

                {/* 时间 */}
                <p className="text-xs text-muted-foreground">
                  {new Date(photoDetail.createdAt).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>

                {/* 删除按钮 - 只有相册所有者或管理员可以删除 */}
                {isAuthenticated && (isOwner || user?.role === "super_admin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("确定要删除这张照片吗？")) {
                        deletePhoto.mutate({ id: selectedPhoto! });
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除照片
                  </Button>
                )}

                {/* 评论区 */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-4 h-4" />
                    <span className="font-medium text-sm">评论</span>
                  </div>

                  {/* 评论列表 */}
                  <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
                    {comments && comments.length > 0 ? (
                      comments.map((comment) => (
                        <div key={comment.id} className="bg-muted rounded-lg p-3">
                          <p className="text-sm">{comment.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(comment.createdAt).toLocaleString("zh-CN")}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        还没有评论，来说点什么吧
                      </p>
                    )}
                  </div>

                  {/* 添加评论 - 登录用户才能评论 */}
                  {isAuthenticated ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder="写下你的评论..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      />
                      <Button
                        size="icon"
                        className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                        onClick={handleAddComment}
                        disabled={addComment.isPending}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      <Link href="/login" className="text-pink-500 hover:underline">登录</Link> 后可以发表评论
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
