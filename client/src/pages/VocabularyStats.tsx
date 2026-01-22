import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { VocabularyStatsCard } from "@/components/VocabularyStatsCard";

export default function VocabularyStats() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  
  // 获取词库统计数据
  const { data: stats, isLoading } = trpc.vocabulary.stats.useQuery(
    { kidId: selectedKidId },
    { enabled: !!user }
  );
  
  // 获取家庭中的宝宝列表
  const { data: kids } = trpc.specialKids.list.useQuery();

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
            onClick={() => navigate("/parent/vocabulary")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回词库</span>
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            词库统计详情
          </h1>
          <div className="w-24"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        {/* 宝宝选择器 */}
        {kids && kids.length > 0 && (
          <div className="mb-6">
            <Select
              value={selectedKidId?.toString() || "all"}
              onValueChange={(value) => setSelectedKidId(value === "all" ? null : Number(value))}
            >
              <SelectTrigger className="w-full sm:w-64">
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
          </div>
        )}

        {/* 统计详情卡片 */}
        {isLoading ? (
          <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <h3 className="text-lg font-semibold text-green-800 mb-4">词库概览</h3>
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
          </Card>
        ) : stats ? (
          <VocabularyStatsCard stats={stats} />
        ) : (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">暂无统计数据</p>
          </Card>
        )}

        {/* 学习进度统计 */}
        {stats && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <div className="text-center">
                <div className="text-sm text-blue-700 mb-2">未学习</div>
                <div className="text-3xl font-bold text-blue-600">
                  {stats.notStartedCount || 0}
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <div className="text-center">
                <div className="text-sm text-amber-700 mb-2">学习中</div>
                <div className="text-3xl font-bold text-amber-600">
                  {stats.learningCount || 0}
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="text-center">
                <div className="text-sm text-green-700 mb-2">已掌握</div>
                <div className="text-3xl font-bold text-green-600">
                  {stats.masteredCount || 0}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
