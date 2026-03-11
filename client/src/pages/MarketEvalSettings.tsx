import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export default function MarketEvalSettings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;
  const [coin, setCoin] = useState<"BTC" | "ETH">("BTC");

  const utils = trpc.useUtils();

  // 获取管理员视角的所有事件（含勾选状态）
  const { data: adminData, isLoading } = trpc.prediction.listEventsForAdmin.useQuery({
    ledgerId,
    coin,
  });

  // 切换可见性
  const toggleMutation = trpc.prediction.setEventVisibility.useMutation({
    onSuccess: () => {
      utils.prediction.listEventsForAdmin.invalidate({ ledgerId, coin });
      utils.prediction.getVisibleQuestions.invalidate({ ledgerId, coin });
    },
    onError: (e) => {
      toast.error("设置失败", { description: e.message });
    },
  });

  const handleToggle = (question: string, currentVisible: boolean) => {
    toggleMutation.mutate({
      ledgerId,
      coin,
      question,
      visible: !currentVisible,
    });
  };

  const events = adminData?.events || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-[#B71C1C] text-white">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold">行情评估设置</span>
          <div className="w-9" />
        </div>
      </div>

      {/* 币种切换 */}
      <div className="flex gap-2 px-4 py-3">
        {(["BTC", "ETH"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              coin === c
                ? "bg-[#B71C1C] text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 说明 */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-500 leading-relaxed">
          勾选后，对应的 Polymarket 事件将在行情评估页面中显示给所有成员。默认全部不显示。
        </p>
      </div>

      {/* 事件列表 */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">正在加载事件列表...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">暂无 {coin} 相关事件</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-xl p-4 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed break-words">
                    {event.question}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {event.volume && (
                      <span className="text-xs text-gray-400">
                        交易量: ${Number(event.volume).toLocaleString()}
                      </span>
                    )}
                    {event.endDate && (
                      <span className="text-xs text-gray-400">
                        截止: {new Date(event.endDate).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={event.visible}
                  onCheckedChange={() => handleToggle(event.question, event.visible)}
                  disabled={toggleMutation.isPending}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
