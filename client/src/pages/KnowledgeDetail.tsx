import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "wouter";
import { ArrowLeft, Eye, ChevronRight, BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Streamdown } from "streamdown";

export default function KnowledgeDetail() {
  const params = useParams<{ id: string }>();
  const categoryId = parseInt(params.id || "0");
  
  const { data: categories } = trpc.knowledge.getCategories.useQuery();
  const { data: items, isLoading } = trpc.knowledge.getItems.useQuery({ categoryId });
  
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const { data: itemDetail } = trpc.knowledge.getItem.useQuery(
    { id: selectedItem! },
    { enabled: selectedItem !== null }
  );

  const category = categories?.find((c) => c.id === categoryId);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center h-14">
          <Link href="/knowledge">
            <Button variant="ghost" size="icon" className="mr-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xl">{category?.icon || "📚"}</span>
            <h1 className="font-bold text-lg">{category?.name || "知识"}</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* 分类介绍 */}
        {category && (
          <Card className="p-4 mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-0">
            <p className="text-sm text-muted-foreground">{category.description}</p>
          </Card>
        )}

        {/* 内容列表 */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 h-24 animate-pulse bg-muted" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item) => (
              <Card
                key={item.id}
                className="card-hover p-4 border-0 bg-white shadow-soft cursor-pointer"
                onClick={() => setSelectedItem(item.id)}
              >
                <div className="flex gap-4">
                  {item.coverImage ? (
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-8 h-8 text-blue-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base mb-1 line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {item.content.slice(0, 100)}...
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      <span>{item.viewCount} 次阅读</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-bold text-lg mb-2">暂无内容</h3>
            <p className="text-sm text-muted-foreground">这个分类还没有内容哦</p>
          </div>
        )}
      </main>

      {/* 内容详情弹窗 */}
      <Dialog open={selectedItem !== null} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{itemDetail?.title}</DialogTitle>
          </DialogHeader>
          {itemDetail && (
            <div className="space-y-4">
              {itemDetail.coverImage && (
                <img
                  src={itemDetail.coverImage}
                  alt={itemDetail.title}
                  className="w-full h-48 rounded-xl object-cover"
                />
              )}
              <div className="prose prose-sm max-w-none">
                <Streamdown>{itemDetail.content}</Streamdown>
              </div>
              {itemDetail.images && itemDetail.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {itemDetail.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`图片 ${i + 1}`}
                      className="w-full h-32 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
