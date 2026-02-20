import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Sparkles, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

export default function ReadingConfig() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryContent, setNewStoryContent] = useState("");
  const [aiTheme, setAiTheme] = useState("");
  const [wordCount, setWordCount] = useState(100);
  
  const utils = trpc.useUtils();
  
  // 获取故事列表
  const { data: stories, isLoading } = trpc.readingGame.getStories.useQuery({
    kidId: 120013, // TODO: 使用实际的kidId
  });
  
  // 创建故事
  const createStoryMutation = trpc.readingGame.createStory.useMutation({
    onSuccess: () => {
      toast.success("故事添加成功！");
      setIsAddDialogOpen(false);
      setNewStoryTitle("");
      setNewStoryContent("");
      utils.readingGame.getStories.invalidate();
    },
    onError: (error) => {
      toast.error("添加失败：" + error.message);
    },
  });
  
  // AI生成故事
  const generateStoryMutation = trpc.readingGame.generateStory.useMutation({
    onSuccess: (data) => {
      toast.success(`AI故事《${data.title}》生成成功！`);
      setAiTheme("");
      setIsAIGenerating(false);
      utils.readingGame.getStories.invalidate();
    },
    onError: (error) => {
      toast.error("生成失败：" + error.message);
      setIsAIGenerating(false);
    },
  });
  
  // 删除故事
  const deleteStoryMutation = trpc.readingGame.deleteStory.useMutation({
    onSuccess: () => {
      toast.success("故事已删除");
      utils.readingGame.getStories.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败：" + error.message);
    },
  });
  
  const handleAddStory = () => {
    if (!newStoryTitle.trim()) {
      toast.error("请输入故事标题");
      return;
    }
    if (!newStoryContent.trim()) {
      toast.error("请输入故事内容");
      return;
    }
    if (newStoryContent.length > 5000) {
      toast.error("故事内容最多5000字");
      return;
    }
    
    createStoryMutation.mutate({
      title: newStoryTitle,
      content: newStoryContent,
      type: "custom",
      kidId: 120013, // TODO: 使用实际的kidId
    });
  };
  
  const handleGenerateAI = () => {
    setIsAIGenerating(true);
    generateStoryMutation.mutate({
      kidId: 120013, // TODO: 使用实际的kidId
      theme: aiTheme.trim() || undefined,
      wordCount,
    });
  };
  
  const handleDeleteStory = (id: number, title: string) => {
    if (confirm(`确定要删除故事《${title}》吗？`)) {
      deleteStoryMutation.mutate({ id });
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50 to-red-50 flex items-center justify-center">
        <div className="text-2xl text-[#D32F2F]">加载中...</div>
      </div>
    );
  }
  
  // 分类故事
  const templateStories = stories?.filter((s) => s.type === "template") || [];
  const customStories = stories?.filter((s) => s.type !== "template") || [];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50 to-red-50 p-4">
      {/* 顶部导航 */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <Link href="/games/reading">
          <Button variant="ghost" size="lg" className="text-[#D32F2F]">
            <ArrowLeft className="w-6 h-6 mr-2" />
            返回
          </Button>
        </Link>
      </div>
      
      {/* 页面标题 */}
      <div className="max-w-6xl mx-auto mb-8 text-center">
        <h1 className="text-5xl font-bold text-[#D32F2F] mb-4">📚 阅读识字设置</h1>
        <p className="text-xl text-[#757575]">
          管理故事内容，为孩子创建个性化的阅读材料
        </p>
      </div>
      
      {/* 操作按钮 */}
      <div className="max-w-6xl mx-auto mb-8 flex gap-4 justify-center">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="bg-[#1976D2] hover:bg-[#1976D2]">
              <Plus className="w-5 h-5 mr-2" />
              添加自定义故事
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">添加自定义故事</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">故事标题</label>
                <Input
                  value={newStoryTitle}
                  onChange={(e) => setNewStoryTitle(e.target.value)}
                  placeholder="例如：小兔子的冒险"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  故事内容（最多5000字）
                </label>
                <Textarea
                  value={newStoryContent}
                  onChange={(e) => setNewStoryContent(e.target.value)}
                  placeholder="在这里粘贴或输入故事内容..."
                  rows={12}
                  maxLength={5000}
                  className="resize-none"
                />
                <div className="text-sm text-[#757575] mt-1 text-right">
                  {newStoryContent.length} / 5000 字
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleAddStory}
                  disabled={createStoryMutation.isPending}
                >
                  {createStoryMutation.isPending ? "添加中..." : "确认添加"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button size="lg" className="bg-gradient-to-r from-[#A80000] to-[#d44] hover:from-[#A80000] hover:to-pink-600">
              <Sparkles className="w-5 h-5 mr-2" />
              AI生成故事
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-2xl">AI生成故事</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  故事主题（可选）
                </label>
                <Input
                  value={aiTheme}
                  onChange={(e) => setAiTheme(e.target.value)}
                  placeholder="例如：勇敢的小狗、友谊、分享..."
                  disabled={isAIGenerating}
                />
                <p className="text-sm text-[#757575] mt-2">
                  留空则由AI随机选择适合孩子的主题
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  故事长度：{wordCount}字
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="50"
                    value={wordCount}
                    onChange={(e) => setWordCount(Number(e.target.value))}
                    disabled={isAIGenerating}
                    className="flex-1 h-2 bg-[#D32F2F] rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="flex justify-between text-xs text-[#757575] mt-1">
                  <span>50字</span>
                  <span>100字</span>
                  <span>200字</span>
                  <span>300字</span>
                  <span>400字</span>
                  <span>500字</span>
                </div>
              </div>
              <Button
                onClick={handleGenerateAI}
                disabled={isAIGenerating}
                className="w-full bg-gradient-to-r from-[#A80000] to-[#d44]"
                size="lg"
              >
                {isAIGenerating ? (
                  <>
                    <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                    AI正在创作中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    立即生成
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* 故事列表 */}
      <div className="max-w-6xl mx-auto space-y-12">
        {/* 模板故事 */}
        {templateStories.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-[#424242] mb-4">
              📖 预设故事模板 ({templateStories.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templateStories.map((story) => (
                <Card key={story.id} className="p-4 border-2 border-[#1976D2]">
                  <h3 className="text-lg font-bold text-[#424242] mb-2">
                    {story.title}
                  </h3>
                  <p className="text-sm text-[#757575] line-clamp-2 mb-2">
                    {story.content}
                  </p>
                  <div className="text-xs text-[#757575]">
                    {story.wordCount} 字
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        
        {/* 自定义故事 */}
        {customStories.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-[#424242] mb-4">
              ✨ 我的故事 ({customStories.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customStories.map((story) => (
                <Card key={story.id} className="p-4 border-2 border-[#D32F2F]">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-bold text-[#424242] flex-1">
                      {story.title}
                      {story.type === "ai_generated" && (
                        <span className="ml-2 text-xs bg-gradient-to-r from-[#A80000] to-[#d44] text-white px-2 py-1 rounded">
                          AI生成
                        </span>
                      )}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteStory(story.id, story.title)}
                      className="text-[#D32F2F] hover:text-[#D32F2F] hover:bg-[#FFEBEE]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-[#757575] line-clamp-3 mb-2">
                    {story.content}
                  </p>
                  <div className="text-xs text-[#757575]">
                    {story.wordCount} 字
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
