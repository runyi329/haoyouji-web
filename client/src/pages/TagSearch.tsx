import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Tag, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TagSearch() {
  const [, setLocation] = useLocation();
  const [keyword, setKeyword] = useState("");
  
  // 搜索标签
  const { data: tags = [], isLoading } = trpc.tags.search.useQuery({ keyword });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* 头部 */}
      <div className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              标签搜索
            </h1>
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="container py-6">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索标签名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-10 h-12 text-lg"
          />
        </div>
      </div>

      {/* 标签列表 */}
      <div className="container pb-8">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : tags.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">
              {keyword ? "未找到匹配的标签" : "暂无标签"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {tags.map((tag) => (
              <Card
                key={tag.id}
                className="p-6 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => setLocation(`/parent/contacts/list?tag=${tag.id}`)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <h3 className="font-semibold text-lg group-hover:text-purple-600 transition-colors">
                      {tag.name}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Tag className="h-4 w-4" />
                  <span>{tag.contactCount} 位人脉</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
