import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { ArrowLeft, Images, Plus, FolderOpen, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Albums() {
  const { isAuthenticated } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");

  // 公开访问：无需登录即可查看相册列表
  const { data: albums, isLoading, refetch } = trpc.albums.list.useQuery();

  const createAlbum = trpc.albums.create.useMutation({
    onSuccess: () => {
      toast.success("相册创建成功！");
      setShowCreateDialog(false);
      setNewAlbumName("");
      setNewAlbumDesc("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateAlbum = () => {
    if (!newAlbumName.trim()) {
      toast.error("请输入相册名称");
      return;
    }
    createAlbum.mutate({
      name: newAlbumName,
      description: newAlbumDesc,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                <Images className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-bold text-lg">成长相册</h1>
            </div>
          </div>
          {/* 只有登录用户才能创建相册 */}
          {isAuthenticated && (
            <Button
              size="sm"
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              新建
            </Button>
          )}
        </div>
      </header>

      <main className="container py-6">
        {/* 介绍区域 */}
        <section className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 text-pink-600 mb-4">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">珍藏美好回忆</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">成长相册</h2>
          <p className="text-muted-foreground text-sm">记录成长的每一个精彩瞬间</p>
        </section>

        {/* 相册列表 */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="aspect-square animate-pulse bg-muted" />
            ))}
          </div>
        ) : albums && albums.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {albums.map((album) => (
              <Link key={album.id} href={`/albums/${album.id}`}>
                <Card className="card-hover overflow-hidden border-0 shadow-soft">
                  <div className="aspect-square relative">
                    {album.coverImage ? (
                      <img
                        src={album.coverImage}
                        alt={album.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center">
                        <FolderOpen className="w-12 h-12 text-pink-300" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <h3 className="font-bold text-white text-sm">{album.name}</h3>
                      {album.description && (
                        <p className="text-white/80 text-xs line-clamp-1">{album.description}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-pink-50 flex items-center justify-center">
              <FolderOpen className="w-10 h-10 text-pink-300" />
            </div>
            <h3 className="font-bold text-lg mb-2">还没有相册</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAuthenticated ? "创建第一个相册，开始记录美好时光" : "暂时还没有相册内容"}
            </p>
            {isAuthenticated && (
              <Button
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                创建相册
              </Button>
            )}
          </div>
        )}
      </main>

      {/* 创建相册弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新相册</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">相册名称</label>
              <Input
                placeholder="例如：2024年暑假"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">相册描述（可选）</label>
              <Input
                placeholder="记录这段时光的故事..."
                value={newAlbumDesc}
                onChange={(e) => setNewAlbumDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0"
              onClick={handleCreateAlbum}
              disabled={createAlbum.isPending}
            >
              {createAlbum.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
