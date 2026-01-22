import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, BookOpen, Eye, ChevronRight, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useFamilyFeatures } from "@/hooks/useFamilyFeatures";

const categoryColors: Record<string, string> = {
  "动物世界": "from-orange-400 to-orange-600",
  "植物花园": "from-green-400 to-green-600",
  "太空探索": "from-purple-400 to-purple-600",
  "科学实验": "from-blue-400 to-blue-600",
  "历史故事": "from-amber-400 to-amber-600",
  "艺术天地": "from-pink-400 to-pink-600",
};

const categoryBgColors: Record<string, string> = {
  "动物世界": "bg-orange-50",
  "植物花园": "bg-green-50",
  "太空探索": "bg-purple-50",
  "科学实验": "bg-blue-50",
  "历史故事": "bg-amber-50",
  "艺术天地": "bg-pink-50",
};

export default function Knowledge() {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFamilyFeatures();
  const { data: categories, isLoading } = trpc.knowledge.getCategories.useQuery();
  
  // 根据权限过滤分类
  const filteredCategories = user?.role === 'super_admin'
    ? categories
    : categories?.filter(cat => isFeatureEnabled("知识", cat.name));

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center h-14">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-bold text-lg">知识宝库</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* 介绍区域 */}
        <section className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-600 mb-4">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">探索神奇的世界</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">选择一个主题</h2>
          <p className="text-muted-foreground text-sm">发现有趣的知识，开启探索之旅</p>
        </section>

        {/* 分类列表 */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-4 h-32 animate-pulse bg-muted" />
            ))}
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-4">
            {filteredCategories?.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </section>
        )}

        {/* 推荐内容 - 暂时隐藏，等待后续开发 */}
        {/* <section className="mt-8">
          <h3 className="font-bold text-lg mb-4">热门知识</h3>
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-0">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-3xl">
                🌟
              </div>
              <div className="flex-1">
                <h4 className="font-bold">每日一知</h4>
                <p className="text-sm text-muted-foreground">每天学习一个新知识</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </section> */}
      </main>
    </div>
  );
}

function CategoryCard({ category }: { category: { id: number; name: string; icon: string | null; description: string | null } }) {
  const { data: items } = trpc.knowledge.getItems.useQuery({ categoryId: category.id });
  const gradient = categoryColors[category.name] || "from-gray-400 to-gray-600";
  const bgColor = categoryBgColors[category.name] || "bg-gray-50";

  return (
    <Link href={`/knowledge/${category.id}`}>
      <Card className={`card-hover p-4 h-full ${bgColor} border-0`}>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-lg`}>
          <span className="text-2xl">{category.icon || "📚"}</span>
        </div>
        <h3 className="font-bold text-base mb-1">{category.name}</h3>
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{category.description}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="w-3 h-3" />
          <span>{items?.length || 0} 篇内容</span>
        </div>
      </Card>
    </Link>
  );
}
