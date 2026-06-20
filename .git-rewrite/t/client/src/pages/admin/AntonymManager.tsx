import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

interface AntonymPair {
  id: number;
  word: string;
  antonym: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  isActive: boolean;
}

export default function AntonymManagement() {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [editingPair, setEditingPair] = useState<AntonymPair | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: pairs, isLoading, refetch } = trpc.antonym.getAllPairs.useQuery();
  const createMutation = trpc.antonym.createPair.useMutation();
  const updateMutation = trpc.antonym.updatePair.useMutation();
  const deleteMutation = trpc.antonym.deletePair.useMutation();

  const filteredPairs = pairs?.filter((pair) => {
    const matchesDifficulty = selectedDifficulty === "all" || pair.difficulty === selectedDifficulty;
    const matchesSearch = searchText === "" || 
      pair.word.toLowerCase().includes(searchText.toLowerCase()) ||
      pair.antonym.toLowerCase().includes(searchText.toLowerCase());
    return matchesDifficulty && matchesSearch;
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      await createMutation.mutateAsync({
        word: formData.get("word") as string,
        antonym: formData.get("antonym") as string,
        category: formData.get("category") as string,
        difficulty: formData.get("difficulty") as "easy" | "medium" | "hard",
      });
      
      toast.success("添加成功！");
      setIsAddDialogOpen(false);
      refetch();
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast.error(error.message || "添加失败");
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPair) return;
    
    const formData = new FormData(e.currentTarget);
    
    try {
      await updateMutation.mutateAsync({
        id: editingPair.id,
        word: formData.get("word") as string,
        antonym: formData.get("antonym") as string,
        category: formData.get("category") as string,
        difficulty: formData.get("difficulty") as "easy" | "medium" | "hard",
      });
      
      toast.success("更新成功！");
      setIsEditDialogOpen(false);
      setEditingPair(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "更新失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个反义词对吗？")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("删除成功！");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "删除失败");
    }
  };

  const difficultyMap = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">反义词题库管理</h1>
          <p className="text-muted-foreground mt-2">
            总计 <span className="font-semibold text-primary">{pairs?.length || 0}</span> 个反义词
            {(selectedDifficulty !== "all" || searchText !== "") && (
              <span>
                ，当前显示 <span className="font-semibold text-primary">{filteredPairs?.length || 0}</span> 个
              </span>
            )}
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} />
              添加反义词
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加新反义词</DialogTitle>
              <DialogDescription>填写反义词信息</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="word">词语</Label>
                <Input id="word" name="word" required placeholder="例如：大" />
              </div>
              <div>
                <Label htmlFor="antonym">反义词</Label>
                <Input id="antonym" name="antonym" required placeholder="例如：小" />
              </div>
              <div>
                <Label htmlFor="category">分类</Label>
                <Input id="category" name="category" defaultValue="general" placeholder="例如：形容词" />
              </div>
              <div>
                <Label htmlFor="difficulty">难度</Label>
                <Select name="difficulty" defaultValue="easy">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">简单</SelectItem>
                    <SelectItem value="medium">中等</SelectItem>
                    <SelectItem value="hard">困难</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "添加中..." : "添加"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label>筛选难度</Label>
          <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="easy">简单</SelectItem>
              <SelectItem value="medium">中等</SelectItem>
              <SelectItem value="hard">困难</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>搜索反义词</Label>
          <Input
            placeholder="输入词语或反义词搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="grid gap-4">
          {filteredPairs?.map((pair) => (
            <Card key={pair.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold">{pair.word}</span>
                    <span className="text-gray-400">←→</span>
                    <span className="text-lg font-semibold">{pair.antonym}</span>
                  </div>
                  <div className="flex gap-2 mt-2 text-sm text-muted-foreground">
                    <span className="px-2 py-1 bg-[#F5F5F5] text-blue-700 rounded">
                      {pair.category}
                    </span>
                    <span className="px-2 py-1 bg-[#E8F5E9] text-green-700 rounded">
                      {difficultyMap[pair.difficulty]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPair(pair);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(pair.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          
          {filteredPairs?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              暂无数据
            </div>
          )}
        </div>
      )}

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑反义词</DialogTitle>
            <DialogDescription>修改反义词信息</DialogDescription>
          </DialogHeader>
          {editingPair && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <Label htmlFor="edit-word">词语</Label>
                <Input
                  id="edit-word"
                  name="word"
                  required
                  defaultValue={editingPair.word}
                />
              </div>
              <div>
                <Label htmlFor="edit-antonym">反义词</Label>
                <Input
                  id="edit-antonym"
                  name="antonym"
                  required
                  defaultValue={editingPair.antonym}
                />
              </div>
              <div>
                <Label htmlFor="edit-category">分类</Label>
                <Input
                  id="edit-category"
                  name="category"
                  defaultValue={editingPair.category}
                />
              </div>
              <div>
                <Label htmlFor="edit-difficulty">难度</Label>
                <Select name="difficulty" defaultValue={editingPair.difficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">简单</SelectItem>
                    <SelectItem value="medium">中等</SelectItem>
                    <SelectItem value="hard">困难</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "更新中..." : "更新"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
