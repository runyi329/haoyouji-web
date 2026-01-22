import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Upload, Search } from "lucide-react";

export default function CharacterManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // 表单状态
  const [character, setCharacter] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [category, setCategory] = useState("数字");
  const [difficulty, setDifficulty] = useState(1);
  const [commonWords, setCommonWords] = useState("");

  // 获取汉字列表
  const { data: characters, refetch } = trpc.character.getAll.useQuery({
    category: filterCategory === "all" ? undefined : filterCategory,
  });

  // 获取汉字统计
  const { data: stats } = trpc.character.getStats.useQuery();

  // 创建汉字
  const createMutation = trpc.character.create.useMutation({
    onSuccess: () => {
      toast.success("汉字添加成功！");
      setShowCreateDialog(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // 更新汉字
  const updateMutation = trpc.character.update.useMutation({
    onSuccess: () => {
      toast.success("汉字更新成功！");
      setEditingCharacter(null);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // 删除汉字
  const deleteMutation = trpc.character.delete.useMutation({
    onSuccess: () => {
      toast.success("汉字删除成功！");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setCharacter("");
    setPinyin("");
    setImageFile(null);
    setImagePreview("");
    setCategory("数字");
    setDifficulty(1);
    setCommonWords("");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!character || !pinyin) {
      toast.error("请填写汉字和拼音");
      return;
    }

    // TODO: 实现图片上传到S3
    // 这里暂时使用占位图片URL
    const imageUrl = imagePreview || "https://via.placeholder.com/300";
    const fileKey = `characters/${character}-${Date.now()}.png`;

    const data = {
      character,
      pinyin,
      imageUrl,
      fileKey,
      category,
      difficulty,
      commonWords: commonWords ? commonWords.split(",").map((w) => w.trim()) : [],
    };

    if (editingCharacter) {
      updateMutation.mutate({ id: editingCharacter, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (char: { id: number; character: string; pinyin: string; imageUrl: string; category: string; difficulty: number; commonWords?: string[] }) => {
    setEditingCharacter(char.id);
    setCharacter(char.character);
    setPinyin(char.pinyin);
    setImagePreview(char.imageUrl);
    setCategory(char.category);
    setDifficulty(char.difficulty);
    setCommonWords(char.commonWords?.join(", ") || "");
    setShowCreateDialog(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除这个汉字吗？")) {
      deleteMutation.mutate({ id });
    }
  };

  const filteredCharacters = characters?.filter((char) =>
    char.character.includes(searchTerm) || char.pinyin.includes(searchTerm)
  );

  return (
    <Card className="p-6">
      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100">
            <div className="text-sm text-muted-foreground mb-1">总汉字数</div>
            <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          </Card>
          {Object.entries(stats.byCategory).slice(0, 3).map(([category, count]) => (
            <Card key={category} className="p-4">
              <div className="text-sm text-muted-foreground mb-1">{category}</div>
              <div className="text-2xl font-bold">{count}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-xl">汉字管理</h2>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              添加汉字
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCharacter ? "编辑汉字" : "添加汉字"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>汉字 *</Label>
                  <Input
                    value={character}
                    onChange={(e) => setCharacter(e.target.value)}
                    placeholder="例如：一"
                  />
                </div>
                <div>
                  <Label>拼音 *</Label>
                  <Input
                    value={pinyin}
                    onChange={(e) => setPinyin(e.target.value)}
                    placeholder="例如：yī"
                  />
                </div>
              </div>

              <div>
                <Label>图片</Label>
                <div className="mt-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="mb-2"
                  />
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="预览"
                      className="w-32 h-32 object-cover rounded border"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>分类</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="数字">数字</SelectItem>
                      <SelectItem value="动物">动物</SelectItem>
                      <SelectItem value="水果">水果</SelectItem>
                      <SelectItem value="自然">自然</SelectItem>
                      <SelectItem value="身体">身体</SelectItem>
                      <SelectItem value="日常">日常</SelectItem>
                      <SelectItem value="颜色">颜色</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>难度（1-5）</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <Label>常用词组（用逗号分隔）</Label>
                <Input
                  value={commonWords}
                  onChange={(e) => setCommonWords(e.target.value)}
                  placeholder="例如：一个,一天,一起"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmit}>
                  {editingCharacter ? "更新" : "添加"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索汉字或拼音..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="数字">数字</SelectItem>
            <SelectItem value="动物">动物</SelectItem>
            <SelectItem value="水果">水果</SelectItem>
            <SelectItem value="自然">自然</SelectItem>
            <SelectItem value="身体">身体</SelectItem>
            <SelectItem value="日常">日常</SelectItem>
            <SelectItem value="颜色">颜色</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 汉字列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCharacters?.map((char: any) => (
          <Card key={char.id} className="p-4">
            <div className="flex items-start gap-4">
              <img
                src={char.imageUrl}
                alt={char.character}
                className="w-20 h-20 object-cover rounded"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold">{char.character}</h3>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(char)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(char.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{char.pinyin}</p>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 bg-primary/10 rounded">{char.category}</span>
                  <span className="px-2 py-1 bg-secondary rounded">
                    难度 {char.difficulty}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredCharacters?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          暂无汉字数据
        </div>
      )}
    </Card>
  );
}
