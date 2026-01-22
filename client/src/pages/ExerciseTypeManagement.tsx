import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

export default function ExerciseTypeManagement() {
  // const { toast } = useToast(); // 已改用sonner的toast
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<{ id: number; name: string; icon: string } | null>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIcon, setNewTypeIcon] = useState("💪");

  // 获取锻炼项目列表
  const { data: exerciseTypes = [], isLoading } = trpc.exercise.getTypes.useQuery();

  // 创建锻炼项目
  const createMutation = trpc.exercise.createType.useMutation({
    onSuccess: () => {
      toast.success("锻炼项目已创建");
      utils.exercise.getTypes.invalidate();
      setIsAddDialogOpen(false);
      setNewTypeName("");
      setNewTypeIcon("💪");
    },
    onError: (error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });

  // 更新锻炼项目
  const updateMutation = trpc.exercise.updateType.useMutation({
    onSuccess: () => {
      toast.success("锻炼项目已更新");
      utils.exercise.getTypes.invalidate();
      setIsEditDialogOpen(false);
      setEditingType(null);
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  // 删除锻炼项目
  const deleteMutation = trpc.exercise.deleteType.useMutation({
    onSuccess: () => {
      toast.success("锻炼项目已删除");
      utils.exercise.getTypes.invalidate();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (!newTypeName.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    createMutation.mutate({ name: newTypeName.trim(), icon: newTypeIcon });
  };

  const handleUpdate = () => {
    if (!editingType) return;
    if (!editingType.name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    updateMutation.mutate({
      id: editingType.id,
      name: editingType.name.trim(),
      icon: editingType.icon,
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`确定要删除"${name}"吗？`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleEdit = (type: { id: number; name: string; icon: string }) => {
    setEditingType(type);
    setIsEditDialogOpen(true);
  };

  // 常用emoji列表
  const commonEmojis = ["💪", "🏃", "🤸", "🏋️", "🚴", "🏊", "⚽", "🏀", "🎾", "🏐", "🧘", "🤾"];

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center">加载中...</div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">锻炼项目管理</h1>
          <p className="text-muted-foreground mt-2">管理孩子的锻炼项目类型</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加项目
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加锻炼项目</DialogTitle>
              <DialogDescription>创建一个新的锻炼项目类型</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">项目名称</Label>
                <Input
                  id="name"
                  placeholder="例如：跳绳、俯卧撑"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>选择图标</Label>
                <div className="grid grid-cols-6 gap-2">
                  {commonEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`text-3xl p-2 rounded border-2 hover:border-primary transition-colors ${
                        newTypeIcon === emoji ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      onClick={() => setNewTypeIcon(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {exerciseTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg mb-4">还没有锻炼项目</p>
            <p className="text-sm">点击"添加项目"按钮创建第一个锻炼项目</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {exerciseTypes.map((type) => (
            <Card key={type.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{type.icon}</div>
                    <div>
                      <CardTitle>{type.name}</CardTitle>
                      <CardDescription>
                        创建于 {new Date(type.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit({ id: type.id, name: type.name, icon: type.icon || "💪" })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(type.id, type.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑锻炼项目</DialogTitle>
            <DialogDescription>修改锻炼项目的名称和图标</DialogDescription>
          </DialogHeader>
          {editingType && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">项目名称</Label>
                <Input
                  id="edit-name"
                  value={editingType.name}
                  onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>选择图标</Label>
                <div className="grid grid-cols-6 gap-2">
                  {commonEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`text-3xl p-2 rounded border-2 hover:border-primary transition-colors ${
                        editingType.icon === emoji ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      onClick={() => setEditingType({ ...editingType, icon: emoji })}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
