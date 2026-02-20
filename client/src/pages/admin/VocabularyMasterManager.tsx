import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, Edit, Search } from "lucide-react";
import { toast } from "sonner";

interface VocabularyMasterManagerProps {
  defaultTab?: "chinese" | "english";
}

export default function VocabularyMasterManager({ defaultTab = "chinese" }: VocabularyMasterManagerProps = {}) {
  const [activeTab, setActiveTab] = useState<"chinese" | "english">(defaultTab);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // 表单状态
  const [formData, setFormData] = useState({
    word: "",
    language: "chinese" as "chinese" | "english",
    translation: "",
    pinyin: "",
    pronunciation: "",
    category: "general",
    difficulty: "easy" as "easy" | "medium" | "hard",
    example: "",
  });

  // 获取总词库列表
  const { data: chineseVocabulary, refetch: refetchChinese } = trpc.vocabulary.masterList.useQuery({
    language: "chinese",
    search: searchTerm || undefined,
  });

  const { data: englishVocabulary, refetch: refetchEnglish } = trpc.vocabulary.masterList.useQuery({
    language: "english",
    search: searchTerm || undefined,
  });

  // 创建词汇
  const createMutation = trpc.vocabulary.masterCreate.useMutation({
    onSuccess: () => {
      toast.success("词汇添加成功！");
      setShowAddDialog(false);
      resetForm();
      refetchChinese();
      refetchEnglish();
    },
    onError: (error) => {
      toast.error(error.message || "添加失败");
    },
  });

  // 更新词汇
  const updateMutation = trpc.vocabulary.masterUpdate.useMutation({
    onSuccess: () => {
      toast.success("词汇更新成功！");
      setShowEditDialog(false);
      setEditingId(null);
      resetForm();
      refetchChinese();
      refetchEnglish();
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 删除词汇
  const deleteMutation = trpc.vocabulary.masterDelete.useMutation({
    onSuccess: () => {
      toast.success("词汇已删除");
      refetchChinese();
      refetchEnglish();
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  const resetForm = () => {
    setFormData({
      word: "",
      language: activeTab,
      translation: "",
      pinyin: "",
      pronunciation: "",
      category: "general",
      difficulty: "easy",
      example: "",
    });
  };

  const handleAdd = async () => {
    if (!formData.word.trim()) {
      toast.error("请输入词汇");
      return;
    }

    await createMutation.mutateAsync(formData);
  };

  const handleEdit = (vocab: any) => {
    setEditingId(vocab.id);
    setFormData({
      word: vocab.word,
      language: vocab.language,
      translation: vocab.translation || "",
      pinyin: vocab.pinyin || "",
      pronunciation: vocab.pronunciation || "",
      category: vocab.category || "general",
      difficulty: vocab.difficulty || "easy",
      example: vocab.example || "",
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    await updateMutation.mutateAsync({
      id: editingId,
      ...formData,
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个词汇吗？删除后将从所有家庭词库中移除。")) {
      return;
    }

    await deleteMutation.mutateAsync({ id });
  };

  const currentVocabulary = activeTab === "chinese" ? chineseVocabulary : englishVocabulary;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">总词库管理</h2>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            添加词汇
          </Button>
        </div>

        {/* 搜索框 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索词汇或翻译..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 语言切换 */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chinese" | "english")}>
          <TabsList className="grid w-64 grid-cols-2">
            <TabsTrigger value="chinese">中文词库</TabsTrigger>
            <TabsTrigger value="english">英文词库</TabsTrigger>
          </TabsList>

          {/* 中文词库 */}
          <TabsContent value="chinese" className="mt-6">
            {!currentVocabulary || currentVocabulary.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                暂无中文词汇
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentVocabulary.map((vocab) => (
                  <Card key={vocab.id} className="p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold mb-1">{vocab.word}</h3>
                        {vocab.pinyin && (
                          <p className="text-sm text-muted-foreground mb-1">{vocab.pinyin}</p>
                        )}
                        {vocab.translation && (
                          <p className="text-sm text-gray-600 mb-2">{vocab.translation}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(vocab)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(vocab.id)}
                          className="text-[#D32F2F] hover:text-[#D32F2F] hover:bg-[#FFEBEE]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 bg-[#F5F5F5] text-blue-700 rounded">
                        {vocab.category}
                      </span>
                      <span className="px-2 py-1 bg-[#FFEBEE] text-[#D32F2F]-dark rounded">
                        {vocab.difficulty === "easy" ? "简单" : vocab.difficulty === "medium" ? "中等" : "困难"}
                      </span>
                    </div>
                    {vocab.example && (
                      <p className="mt-2 text-sm text-gray-600 italic">例句：{vocab.example}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 英文词库 */}
          <TabsContent value="english" className="mt-6">
            {!currentVocabulary || currentVocabulary.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                暂无英文词汇
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentVocabulary.map((vocab) => (
                  <Card key={vocab.id} className="p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold mb-1">{vocab.word}</h3>
                        {vocab.pronunciation && (
                          <p className="text-sm text-muted-foreground mb-1">[{vocab.pronunciation}]</p>
                        )}
                        {vocab.translation && (
                          <p className="text-sm text-gray-600 mb-2">{vocab.translation}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(vocab)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(vocab.id)}
                          className="text-[#D32F2F] hover:text-[#D32F2F] hover:bg-[#FFEBEE]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 bg-[#F5F5F5] text-blue-700 rounded">
                        {vocab.category}
                      </span>
                      <span className="px-2 py-1 bg-[#FFEBEE] text-[#D32F2F]-dark rounded">
                        {vocab.difficulty === "easy" ? "简单" : vocab.difficulty === "medium" ? "中等" : "困难"}
                      </span>
                    </div>
                    {vocab.example && (
                      <p className="mt-2 text-sm text-gray-600 italic">例句：{vocab.example}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 添加词汇对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>添加{formData.language === "chinese" ? "中文" : "英文"}词汇</DialogTitle>
          </DialogHeader>
          <VocabularyForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑词汇对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑词汇</DialogTitle>
          </DialogHeader>
          <VocabularyForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "更新中..." : "更新"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// 词汇表单组件
function VocabularyForm({ formData, setFormData }: {
  formData: any;
  setFormData: (data: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="language">语言 *</Label>
        <Select
          value={formData.language}
          onValueChange={(value) => setFormData({ ...formData, language: value })}
        >
          <SelectTrigger id="language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chinese">中文</SelectItem>
            <SelectItem value="english">英文</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="word">词汇 *</Label>
        <Input
          id="word"
          placeholder={formData.language === "chinese" ? "例如：苹果" : "例如：apple"}
          value={formData.word}
          onChange={(e) => setFormData({ ...formData, word: e.target.value })}
        />
      </div>

      {formData.language === "chinese" ? (
        <div>
          <Label htmlFor="pinyin">拼音</Label>
          <Input
            id="pinyin"
            placeholder="例如：píng guǒ"
            value={formData.pinyin}
            onChange={(e) => setFormData({ ...formData, pinyin: e.target.value })}
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="pronunciation">音标</Label>
          <Input
            id="pronunciation"
            placeholder="例如：/ˈæpl/"
            value={formData.pronunciation}
            onChange={(e) => setFormData({ ...formData, pronunciation: e.target.value })}
          />
        </div>
      )}

      <div>
        <Label htmlFor="translation">翻译</Label>
        <Input
          id="translation"
          placeholder={formData.language === "chinese" ? "英文翻译" : "中文翻译"}
          value={formData.translation}
          onChange={(e) => setFormData({ ...formData, translation: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="category">分类</Label>
        <Input
          id="category"
          placeholder="例如：水果、动物、颜色等"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="difficulty">难度</Label>
        <Select
          value={formData.difficulty}
          onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
        >
          <SelectTrigger id="difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">简单</SelectItem>
            <SelectItem value="medium">中等</SelectItem>
            <SelectItem value="hard">困难</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="example">例句（可选）</Label>
        <Textarea
          id="example"
          placeholder="添加一个例句..."
          value={formData.example}
          onChange={(e) => setFormData({ ...formData, example: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}
