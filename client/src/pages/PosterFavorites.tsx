import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Filter,
  Grid3x3,
  Loader2,
  Image as ImageIcon,
  X,
} from "lucide-react";

// 分类选项
const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'marketing', label: '营销类' },
  { value: 'product_tutorial', label: '产品教程' },
  { value: 'target_audience', label: '特定对象' },
  { value: 'brand', label: '品牌宣传' },
  { value: 'event', label: '活动类' },
  { value: 'other', label: '其他' },
];

export default function PosterFavorites() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPoster, setSelectedPoster] = useState<any | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 获取海报列表
  const { data, isLoading, refetch } = trpc.posterFavorites.getMyPosters.useQuery(
    selectedCategory === 'all' ? {} : { category: selectedCategory as any },
    {
      retry: 1,
      staleTime: 30000,
    }
  );

  // 删除海报
  const deleteMutation = trpc.posterFavorites.deletePoster.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      refetch();
      setIsPreviewOpen(false);
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  // 处理海报点击
  const handlePosterClick = (poster: any) => {
    setSelectedPoster(poster);
    setIsPreviewOpen(true);
  };

  // 下载海报
  const handleDownload = async (url: string, title: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${title}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success("下载成功");
    } catch (error) {
      toast.error("下载失败");
      console.error('下载失败:', error);
    }
  };

  // 处理删除
  const handleDelete = (id: number) => {
    if (confirm("确定要删除这张海报吗？")) {
      deleteMutation.mutate({ id });
    }
  };

  const posters = data?.posters || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate("/parent/profile")}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">我的收藏</h1>
          <div className="w-9" /> {/* 占位保持居中 */}
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="bg-white px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-gray-500" />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 海报列表 */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
          </div>
        ) : posters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ImageIcon className="w-16 h-16 mb-4" />
            <p className="text-sm">暂无收藏的海报</p>
            <p className="text-xs mt-2">快去创建你的第一张海报吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {posters.map((poster: any) => (
              <div
                key={poster.id}
                onClick={() => handlePosterClick(poster)}
                className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="aspect-[9/16] relative bg-gray-100">
                  <img
                    src={poster.thumbnailUrl}
                    alt={poster.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate">{poster.title}</h3>
                  {poster.seriesName && (
                    <p className="text-xs text-gray-500 truncate mt-1">
                      {poster.seriesName}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {CATEGORIES.find(c => c.value === poster.category)?.label || '其他'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 海报预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {selectedPoster && (
            <>
              <DialogHeader className="p-4 pb-2">
                <DialogTitle>{selectedPoster.title}</DialogTitle>
                {selectedPoster.seriesName && (
                  <DialogDescription>{selectedPoster.seriesName}</DialogDescription>
                )}
              </DialogHeader>
              
              <div className="relative bg-gray-100 max-h-[60vh] overflow-auto">
                <img
                  src={selectedPoster.fullUrl}
                  alt={selectedPoster.title}
                  className="w-full h-auto"
                />
              </div>

              <div className="p-4 pt-2 space-y-2">
                {selectedPoster.description && (
                  <p className="text-sm text-gray-600">{selectedPoster.description}</p>
                )}
                
                {selectedPoster.tags && selectedPoster.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedPoster.tags.map((tag: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleDownload(selectedPoster.fullUrl, selectedPoster.title)}
                    className="flex-1 bg-[#A80000] hover:bg-[#8B0000]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载海报
                  </Button>
                  <Button
                    onClick={() => handleDelete(selectedPoster.id)}
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
