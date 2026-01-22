import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Trash2, BookOpen, Camera, FileText, Keyboard, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
// import { storagePut } from "@/lib/storage"; // 不再使用，改用tRPC客户端
import { VocabularyStatsPreview } from "@/components/VocabularyStatsPreview";
import { MasteryLevelBadge } from "@/components/MasteryLevelBadge";

type AddMode = "manual" | "camera" | "paste";

export default function VocabularyManagement() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [activeTab, setActiveTab] = useState<"chinese" | "english">("chinese");
  const [chineseSubTab, setChineseSubTab] = useState<"character" | "word">("character");
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 检查功能权限
  const { data: canUsePhoto } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/拍照取词" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUsePaste } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/粘贴输入" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUseManual } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/手动输入" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUseChinese } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/中文词库" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUseChineseCharacter } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/中文词库/字" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUseChineseWord } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/中文词库/词" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  const { data: canUseEnglish } = trpc.admin.checkPermission.useQuery(
    { path: "家长/宝宝词库/英文词库" },
    { enabled: !!user && user.role !== "super_admin" }
  );
  
  // 超级管理员默认拥有所有权限
  const hasPhotoPermission = user?.role === "super_admin" || canUsePhoto;
  const hasPastePermission = user?.role === "super_admin" || canUsePaste;
  const hasManualPermission = user?.role === "super_admin" || canUseManual;
  const hasChinesePermission = user?.role === "super_admin" || canUseChinese;
  const hasChineseCharacterPermission = user?.role === "super_admin" || canUseChineseCharacter;
  const hasChineseWordPermission = user?.role === "super_admin" || canUseChineseWord;
  const hasEnglishPermission = user?.role === "super_admin" || canUseEnglish;
  
  // 获取词库统计数据（用于底部概览卡片）
  const { data: stats } = trpc.vocabulary.stats.useQuery(
    { kidId: selectedKidId },
    { enabled: !!user }
  );
  
  // OCR识别状态
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [extractedWords, setExtractedWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  
  // 表单状态
  const [formData, setFormData] = useState({
    word: "",
    language: "chinese" as "chinese" | "english",
    translation: "",
    pinyin: "",
    pronunciation: "",
    category: "general",
    difficulty: "easy" as "easy" | "medium" | "hard",
    customNote: "",
  });
  // 获取家庭中的宝宝列表
  const { data: kids } = trpc.specialKids.list.useQuery();

  // 获取家长词库列表
  const { data: chineseCharacters, refetch: refetchChineseCharacters } = trpc.vocabulary.familyList.useQuery(
    { language: "chinese", kidId: selectedKidId, wordType: "character" },
    { enabled: !!user }
  );

  const { data: chineseWords, refetch: refetchChineseWords } = trpc.vocabulary.familyList.useQuery(
    { language: "chinese", kidId: selectedKidId, wordType: "word" },
    { enabled: !!user }
  );

  const { data: englishVocabulary, refetch: refetchEnglish } = trpc.vocabulary.familyList.useQuery(
    { language: "english", kidId: selectedKidId },
    { enabled: !!user }
  );

  // OCR识别
  const recognizeMutation = trpc.vocabulary.recognizeImage.useMutation();
  const extractWordsMutation = trpc.vocabulary.extractWords.useMutation();
  const uploadFileMutation = trpc.upload.file.useMutation();

  // 添加词汇
  const addMutation = trpc.vocabulary.familyAdd.useMutation({
    onSuccess: () => {
      toast.success("词汇添加成功！");
      refetchChineseCharacters();
      refetchChineseWords();
      refetchEnglish();
    },
    onError: (error) => {
      toast.error(error.message || "添加失败，请重试");
    },
  });

  // 删除词汇
  const removeMutation = trpc.vocabulary.familyRemove.useMutation({
    onSuccess: () => {
      toast.success("词汇已删除");
      refetchChineseCharacters();
      refetchChineseWords();
      refetchEnglish();
    },
    onError: (error) => {
      toast.error(error.message || "删除失败，请重试");
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
      customNote: "",
    });
    setRecognizedText("");
    setExtractedWords([]);
    setSelectedWords(new Set());
  };

  const handleOpenAddDialog = (mode: AddMode) => {
    resetForm();
    setAddMode(mode);
    setShowAddDialog(true);
  };

  // 处理拍照上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（限制20MB）
    const maxSizeMB = 20;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(`图片大小为 ${fileSizeMB}MB，超过了 ${maxSizeMB}MB 的限制。请选择较小的图片或压缩后再上传。`);
      return;
    }

    setIsRecognizing(true);
    try {
      // 读取文件内容并转换为base64
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // 分块处理大文件，避免栈溢出
      const chunkSize = 8192;
      let binaryString = '';
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
        binaryString += String.fromCharCode(...Array.from(chunk));
      }
      const base64Data = btoa(binaryString);

      // 上传图片到S3
      const { url } = await uploadFileMutation.mutateAsync({
        base64Data,
        contentType: file.type,
        prefix: "vocabulary-ocr",
      });

      // 根据当前Tab决定过滤类型
      let contentType: "character" | "word" | "english" | undefined;
      if (activeTab === "chinese") {
        contentType = chineseSubTab; // "character" 或 "word"
      } else if (activeTab === "english") {
        contentType = "english";
      }
      
      // 调用OCR识别，传递contentType参数
      const result = await recognizeMutation.mutateAsync({ 
        imageUrl: url,
        contentType,
      });
      
      setRecognizedText(result.text);
      setExtractedWords(result.words);
      toast.success(`识别成功！提取了 ${result.words.length} 个词汇`);
    } catch (error: any) {
      toast.error(error.message || "图片识别失败");
    } finally {
      setIsRecognizing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 处理粘贴文本
  const handlePasteText = async () => {
    if (!recognizedText.trim()) {
      toast.error("请输入或粘贴文本内容");
      return;
    }

    setIsRecognizing(true);
    try {
      const result = await extractWordsMutation.mutateAsync({
        text: recognizedText,
        useLLM: false,
      });
      
      setExtractedWords(result.words);
      toast.success(`提取了 ${result.words.length} 个词汇`);
    } catch (error: any) {
      toast.error(error.message || "词汇提取失败");
    } finally {
      setIsRecognizing(false);
    }
  };

  // 切换词汇选择
  const toggleWordSelection = (word: string) => {
    const newSelected = new Set(selectedWords);
    if (newSelected.has(word)) {
      newSelected.delete(word);
    } else {
      newSelected.add(word);
    }
    setSelectedWords(newSelected);
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedWords.size === extractedWords.length) {
      // 已全选，则取消全选
      setSelectedWords(new Set());
    } else {
      // 未全选，则全选
      setSelectedWords(new Set(extractedWords));
    }
  };

  // 批量添加选中的词汇（保存按钮调用）
  const handleBatchAddWords = async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }

    if (selectedWords.size === 0) {
      toast.error("请至少选择一个词汇");
      return;
    }

    const successCount = selectedWords.size;
    let failedCount = 0;

    // 显示加载提示
    toast.loading(`正在添加 ${successCount} 个词汇...`);

    for (const word of selectedWords) {
      try {
        await addMutation.mutateAsync({
          kidId: selectedKidId,
          word,
          language: activeTab,
          wordType: activeTab === "chinese" ? chineseSubTab : "word",
          translation: "",
          pinyin: "",
          pronunciation: "",
          category: "general",
          difficulty: "easy",
          customNote: "",
        });
      } catch (error) {
        failedCount++;
      }
    }

    if (failedCount === 0) {
      toast.success(`成功添加 ${successCount} 个词汇！`);
      setShowAddDialog(false);
      resetForm();
    } else {
      toast.warning(`添加了 ${successCount - failedCount} 个词汇，${failedCount} 个失败`);
    }
  };

  // 手动添加词汇
  const handleManualAdd = async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }

    if (!formData.word.trim()) {
      toast.error("请输入词汇");
      return;
    }

    try {
      await addMutation.mutateAsync({
        kidId: selectedKidId,
        ...formData,
        wordType: formData.language === "chinese" ? chineseSubTab : "word",
      });
      setShowAddDialog(false);
      resetForm();
    } catch (error) {
      // 错误已在onError中处理
    }
  };

  const handleRemoveVocabulary = async (vocabularyId: number) => {
    if (!user) return;

    if (!confirm("确定要从宝宝词库中删除这个词汇吗？")) {
      return;
    }

    try {
      await removeMutation.mutateAsync({
        vocabularyId,
      });
    } catch (error) {
      // 错误已在onError中处理
    }
  };

  // 切换学习进度
  const updateMasteryLevelMutation = trpc.vocabulary.updateMasteryLevel.useMutation({
    onSuccess: () => {
      utils.vocabulary.familyList.invalidate();
      utils.vocabulary.stats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "更新学习进度失败");
    },
  });

  const handleToggleMasteryLevel = async (vocabularyId: number, currentLevel: string) => {
    if (!user) return;

    // 循环切换：not_started -> learning -> mastered -> not_started
    const nextLevel = 
      currentLevel === "not_started" ? "learning" :
      currentLevel === "learning" ? "mastered" :
      "not_started";

    try {
      await updateMasteryLevelMutation.mutateAsync({
        vocabularyId,
        masteryLevel: nextLevel as "not_started" | "learning" | "mastered",
      });
    } catch (error) {
      // 错误已在onError中处理
    }
  };

  // 当切换Tab时，更新表单语言
  useEffect(() => {
    setFormData(prev => ({ ...prev, language: activeTab }));
  }, [activeTab]);

  if (!user || (user.role !== "parent" && user.role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p className="text-center text-muted-foreground">您没有权限访问此页面</p>
          <Button onClick={() => navigate("/")} className="mt-4 w-full">
            返回首页
          </Button>
        </Card>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            宝宝词库
          </h1>
          <div className="w-24"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        {/* 词库统计概览 - 移到页面顶部 */}
        {user && stats && (
          <div className="mb-6">
            <VocabularyStatsPreview 
              stats={stats} 
              onViewDetails={() => navigate("/parent/vocabulary/stats")} 
            />
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chinese" | "english")} className="w-full">
          {/* 移动端优化布局 */}
          <div className="space-y-4 mb-6">
            {/* 第一行：宝宝选择器 + 中英文Tab */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* 宝宝选择器 */}
              {kids && kids.length > 0 && (
                <Select
                  value={selectedKidId?.toString() || "all"}
                  onValueChange={(value) => setSelectedKidId(value === "all" ? null : Number(value))}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="选择宝宝" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部宝宝</SelectItem>
                    {kids.map((kid) => (
                      <SelectItem key={kid.id} value={kid.id.toString()}>
                        {kid.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {/* 中英文Tab */}
              <TabsList className="grid w-full sm:w-56 grid-cols-2">
                <TabsTrigger value="chinese">中文词库</TabsTrigger>
                <TabsTrigger value="english">英文词库</TabsTrigger>
              </TabsList>
            </div>
            
            {/* 第二行：添加按钮组（根据权限显示） */}
            <div className="flex flex-wrap gap-2">
              {hasPhotoPermission && (
                <Button onClick={() => handleOpenAddDialog("camera")} variant="outline" className="flex-1 sm:flex-none gap-2">
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">拍照识别</span>
                  <span className="sm:hidden">拍照</span>
                </Button>
              )}
              {hasPastePermission && (
                <Button onClick={() => handleOpenAddDialog("paste")} variant="outline" className="flex-1 sm:flex-none gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">粘贴文本</span>
                  <span className="sm:hidden">粘贴</span>
                </Button>
              )}
              {hasManualPermission && (
                <Button onClick={() => handleOpenAddDialog("manual")} className="flex-1 sm:flex-none gap-2">
                  <Keyboard className="w-4 h-4" />
                  <span className="hidden sm:inline">手动输入</span>
                  <span className="sm:hidden">输入</span>
                </Button>
              )}
            </div>
          </div>

          {/* 中文词库 */}
          {hasChinesePermission && (
            <TabsContent value="chinese">
              <Tabs value={chineseSubTab} onValueChange={(v) => setChineseSubTab(v as "character" | "word")} className="w-full">
                <TabsList className="grid w-48 grid-cols-2 mb-4">
                  {hasChineseCharacterPermission && <TabsTrigger value="character">字</TabsTrigger>}
                  {hasChineseWordPermission && <TabsTrigger value="word">词</TabsTrigger>}
                </TabsList>
              
              {hasChineseCharacterPermission && (
                <TabsContent value="character">
                  <VocabularyList
                    vocabulary={chineseCharacters}
                    onRemove={handleRemoveVocabulary}
                    onToggleMasteryLevel={handleToggleMasteryLevel}
                  />
                </TabsContent>
              )}
              
              {hasChineseWordPermission && (
                <TabsContent value="word">
                  <VocabularyList
                    vocabulary={chineseWords}
                    onRemove={handleRemoveVocabulary}
                    onToggleMasteryLevel={handleToggleMasteryLevel}
                  />
                </TabsContent>
              )}
              </Tabs>
            </TabsContent>
          )}

          {/* 英文词库 */}
          {hasEnglishPermission && (
            <TabsContent value="english">
              <VocabularyList
                vocabulary={englishVocabulary}
                onRemove={handleRemoveVocabulary}
                onToggleMasteryLevel={handleToggleMasteryLevel}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* 添加词汇对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addMode === "camera" && "拍照识别添加"}
              {addMode === "paste" && "粘贴文本添加"}
              {addMode === "manual" && `手动添加${activeTab === "chinese" ? "中文" : "英文"}词汇`}
            </DialogTitle>
          </DialogHeader>

          {/* 拍照模式 */}
          {addMode === "camera" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-sm text-muted-foreground mb-4">
                  点击按钮拍照或选择图片
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRecognizing}
                >
                  {isRecognizing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      识别中...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      选择图片
                    </>
                  )}
                </Button>
              </div>

              {recognizedText && (
                <div>
                  <Label>识别的文本</Label>
                  <Textarea
                    value={recognizedText}
                    readOnly
                    rows={4}
                    className="mt-2 bg-gray-50"
                  />
                </div>
              )}

              {extractedWords.length > 0 && (
                <WordSelectionList
                  words={extractedWords}
                  selectedWords={selectedWords}
                  onToggle={toggleWordSelection}
                  onSelectAll={handleSelectAll}
                  onSave={handleBatchAddWords}
                />
              )}
            </div>
          )}

          {/* 粘贴模式 */}
          {addMode === "paste" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="pasteText">粘贴或输入文本</Label>
                <Textarea
                  id="pasteText"
                  placeholder="在这里粘贴文本内容..."
                  value={recognizedText}
                  onChange={(e) => setRecognizedText(e.target.value)}
                  rows={6}
                  className="mt-2"
                />
              </div>

              <Button
                onClick={handlePasteText}
                disabled={isRecognizing || !recognizedText.trim()}
                className="w-full"
              >
                {isRecognizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    提取中...
                  </>
                ) : (
                  "提取词汇"
                )}
              </Button>

              {extractedWords.length > 0 && (
                <WordSelectionList
                  words={extractedWords}
                  selectedWords={selectedWords}
                  onToggle={toggleWordSelection}
                  onSelectAll={handleSelectAll}
                  onSave={handleBatchAddWords}
                />
              )}
            </div>
          )}

          {/* 手动输入模式 */}
          {addMode === "manual" && (
            <ManualInputForm formData={formData} setFormData={setFormData} />
          )}

          {/* 只有手动输入模式才显示DialogFooter，其他模式的保存按钮已在WordSelectionList组件内部 */}
          {addMode === "manual" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                取消
              </Button>
              <Button onClick={handleManualAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? "添加中..." : "添加"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}



// 词汇列表组件
function VocabularyList({ vocabulary, onRemove, onToggleMasteryLevel }: { 
  vocabulary: any[]; 
  onRemove: (id: number) => void;
  onToggleMasteryLevel: (vocabularyId: number, currentLevel: string) => void;
}) {
  if (!vocabulary || vocabulary.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">还没有词汇，点击上方按钮开始添加吧！</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {vocabulary.map((item) => (
        <Card key={item.id} className="p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-1">{item.vocabulary.word}</h3>
              {item.vocabulary.pinyin && (
                <p className="text-sm text-muted-foreground mb-1">{item.vocabulary.pinyin}</p>
              )}
              {item.vocabulary.pronunciation && (
                <p className="text-sm text-muted-foreground mb-1">[{item.vocabulary.pronunciation}]</p>
              )}
              {item.vocabulary.translation && (
                <p className="text-sm text-gray-600 mb-2">{item.vocabulary.translation}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item.vocabularyId)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
              {item.vocabulary.category}
            </span>
            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
              {item.vocabulary.difficulty === "easy" ? "简单" : item.vocabulary.difficulty === "medium" ? "中等" : "困难"}
            </span>
          </div>
          {/* 学习进度标签 */}
          <MasteryLevelBadge
            masteryLevel={item.masteryLevel}
            onToggle={() => onToggleMasteryLevel(item.vocabularyId, item.masteryLevel)}
          />
          {item.customNote && (
            <p className="mt-2 text-sm text-gray-600 italic">备注：{item.customNote}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

// 词汇选择列表组件（卡片式布局，方便手机点击）
function WordSelectionList({ words, selectedWords, onToggle, onSelectAll, onSave }: {
  words: string[];
  selectedWords: Set<string>;
  onToggle: (word: string) => void;
  onSelectAll: () => void;
  onSave: () => void;
}) {
  const allSelected = selectedWords.size === words.length;
  
  return (
    <div>
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between mb-3">
        <Label>选择要添加的词汇 ({selectedWords.size}/{words.length})</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            className="text-xs"
          >
            {allSelected ? "取消全选" : "全选"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={selectedWords.size === 0}
            className="text-xs"
          >
            保存 ({selectedWords.size})
          </Button>
        </div>
      </div>
      
      {/* 词汇卡片网格 */}
      <div className="mt-2 max-h-96 overflow-y-auto border rounded-lg p-3">
        <div className="flex flex-wrap gap-2">
          {words.map((word, index) => {
            const isSelected = selectedWords.has(word);
            return (
              <button
                key={index}
                type="button"
                onClick={() => onToggle(word)}
                className={`
                  relative min-w-[60px] px-4 py-3 rounded-lg border-2 transition-all
                  text-lg font-medium
                  ${isSelected 
                    ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  }
                `}
              >
                {/* 勾选标记 */}
                {isSelected && (
                  <span className="absolute top-1 right-1 text-white text-xs">✓</span>
                )}
                {word}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 手动输入表单组件
function ManualInputForm({ formData, setFormData }: {
  formData: any;
  setFormData: (data: any) => void;
}) {
  return (
    <div className="space-y-4">
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
          onValueChange={(value) => setFormData({ ...formData, difficulty: value as "easy" | "medium" | "hard" })}
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
        <Label htmlFor="customNote">备注（可选）</Label>
        <Textarea
          id="customNote"
          placeholder="添加一些自定义备注..."
          value={formData.customNote}
          onChange={(e) => setFormData({ ...formData, customNote: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}
