import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Sparkles, Settings } from "lucide-react";

export default function ReadingStoryList() {
  // 获取故事列表
  const { data: stories, isLoading } = trpc.readingGame.getStories.useQuery({
    kidId: 120013, // TODO: 使用实际的kidId
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-2xl text-[#CBA471]">加载中...</div>
      </div>
    );
  }
  
  // 分类故事
  const templateStories = stories?.filter((s) => s.type === "template") || [];
  const customStories = stories?.filter((s) => s.type !== "template") || [];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-4">
      {/* 顶部导航 */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <Link href="/games">
          <Button variant="ghost" size="lg" className="text-[#CBA471]">
            <ArrowLeft className="w-6 h-6 mr-2" />
            返回游戏列表
          </Button>
        </Link>
        <Link href="/parent/reading-config">
          <Button variant="default" size="lg" className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark">
            <Settings className="w-5 h-5 mr-2" />
            家长设置
          </Button>
        </Link>
      </div>
      
      {/* 页面标题 */}
      <div className="max-w-6xl mx-auto mb-8 text-center">
        <h1 className="text-5xl font-bold text-[#CBA471] mb-4">📖 阅读识字</h1>
        <p className="text-xl text-[#757575]">
          选择一个故事，点击文字就能听到读音哦！
        </p>
      </div>
      
      {/* 故事模板 */}
      {templateStories.length > 0 && (
        <div className="max-w-6xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-[#424242] mb-6 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[#1976D2]" />
            故事模板
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templateStories.map((story) => (
              <Link key={story.id} href={`/games/reading/${story.id}`}>
                <Card className="overflow-hidden hover:shadow-xl transition-all cursor-pointer border-2 border-[#1976D2] hover:border-[#1976D2]">
                  {story.coverImageUrl && (
                    <div className="w-full h-48 overflow-hidden bg-gradient-to-br from-red-50 to-rose-50">
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      {!story.coverImageUrl && (
                        <div className="w-12 h-12 bg-[#F5F5F5] rounded-full flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-6 h-6 text-[#1976D2]" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-[#424242] mb-2">
                          {story.title}
                        </h3>
                        <p className="text-sm text-[#757575] line-clamp-2 mb-3">
                          {story.content.substring(0, 60)}...
                        </p>
                        <div className="flex items-center gap-4 text-sm text-[#757575]">
                          <span>{story.wordCount} 字</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
      
      {/* 自定义故事 */}
      {customStories.length > 0 && (
        <div className="max-w-6xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-[#424242] mb-6 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-[#D32F2F]" />
            我的故事
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customStories.map((story) => (
              <Link key={story.id} href={`/games/reading/${story.id}`}>
                <Card className="overflow-hidden hover:shadow-xl transition-all cursor-pointer border-2 border-[#D32F2F] hover:border-[#D32F2F]">
                  {story.coverImageUrl && (
                    <div className="w-full h-48 overflow-hidden bg-gradient-to-br from-red-50 to-rose-50">
                      <img
                        src={story.coverImageUrl}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      {!story.coverImageUrl && (
                        <div className="w-12 h-12 bg-[#FFEBEE] rounded-full flex items-center justify-center flex-shrink-0">
                          {story.type === "ai_generated" ? (
                            <Sparkles className="w-6 h-6 text-[#D32F2F]" />
                          ) : (
                            <BookOpen className="w-6 h-6 text-[#D32F2F]" />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-[#424242] mb-2">
                          {story.title}
                        </h3>
                        <p className="text-sm text-[#757575] line-clamp-2 mb-3">
                          {story.content.substring(0, 60)}...
                        </p>
                        <div className="flex items-center gap-4 text-sm text-[#757575]">
                          <span>{story.wordCount} 字</span>
                          {story.type === "ai_generated" && (
                            <span className="text-[#D32F2F] font-semibold">AI生成</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
      
      {/* 空状态 */}
      {(!stories || stories.length === 0) && (
        <Card className="max-w-2xl mx-auto p-12 text-center">
          <BookOpen className="w-20 h-20 text-[#757575] mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-[#757575] mb-4">还没有故事</h3>
          <p className="text-[#757575] mb-6">
            请家长在设置页面添加自定义故事或使用AI生成故事
          </p>
          <Link href="/parent/reading-config">
            <Button size="lg" className="bg-[#D32F2F] hover:bg-[#D32F2F]-dark">
              <Settings className="w-5 h-5 mr-2" />
              前往设置
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
