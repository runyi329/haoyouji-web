import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface VocabularyStatsPreviewProps {
  stats: {
    chineseCharCount: number;
    chineseWordCount: number;
    englishCount: number;
    recentAddedCount: number;
  };
  onViewDetails: () => void;
}

export function VocabularyStatsPreview({ stats, onViewDetails }: VocabularyStatsPreviewProps) {
  const items = [
    { label: "中文字", count: stats.chineseCharCount },
    { label: "中文词", count: stats.chineseWordCount },
    { label: "英文单词", count: stats.englishCount },
    { label: "近七天新增", count: stats.recentAddedCount },
  ];

  return (
    <Card className="p-4 bg-gradient-to-br from-white to-white border-[#4CAF50]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-[#4CAF50]">私人定制词库概览</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewDetails}
          className="text-[#4CAF50] hover:text-[#4CAF50] hover:bg-[#E8F5E9] gap-1 h-8 px-2"
        >
          <span className="text-sm">详情</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex flex-col items-center justify-center p-3 bg-white/60 rounded-lg"
          >
            <span className="text-xs text-[#757575] mb-1">{item.label}</span>
            <span className="text-2xl font-bold text-[#4CAF50]">{item.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
