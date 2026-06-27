/**
 * 牙伴齿科 - AI 提示词配置页面
 * 路由：/yaban/settings/ai-prompts
 * 功能：院长可自行调整 AI 分析提示词（售前售后沟通记录等）
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronDown, ChevronUp, Save, Loader2, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";

// 默认提示词
const DEFAULT_PROMPTS: Record<string, { label: string; description: string; defaultContent: string }> = {
  comm_voice_analysis: {
    label: "售前售后 · 语音分析",
    description: "AI 语音秘书分析沟通录音时使用的提示词，用于提取客户诉求、沟通要点、跟进事项和备注。",
    defaultContent: `你是一名专业的牙科诊所沟通记录助手。请根据以下对话转写内容，提取关键信息，输出 JSON 格式：

{
  "summaryDemand": "客户诉求（患者想解决什么问题，想做什么治疗）",
  "summaryKeyPoints": "沟通要点（本次沟通的核心内容，医生或顾问的建议）",
  "summaryFollowup": "跟进事项（需要后续跟进的事项，如复诊、报价、预约等）",
  "summaryRemark": "备注（其他需要记录的信息）"
}

注意：
1. 如果某项内容为空，对应字段输出空字符串 ""
2. 只输出 JSON，不要有其他内容
3. 语言简洁专业，每项不超过 100 字`,
  },
};

interface PromptItem {
  key: string;
  label: string;
  description: string;
  defaultContent: string;
  currentContent: string;
  expanded: boolean;
  dirty: boolean;
}

export default function YabanAIPrompts() {
  const [, navigate] = useLocation();
  const { currentTenantId } = useYabanClinic();
  const [items, setItems] = useState<PromptItem[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 查询所有提示词
  const { data: promptsData, isLoading, refetch } = trpc.yabanComm.listPrompts.useQuery(
    { tenantId: currentTenantId || 0 },
    { enabled: !!currentTenantId }
  );

  const savePromptMutation = trpc.yabanComm.savePrompt.useMutation({
    onSuccess: () => {
      toast.success("提示词已保存");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // 初始化 items
  useEffect(() => {
    const savedMap: Record<string, string> = {};
    if (promptsData?.prompts) {
      for (const p of promptsData.prompts as { prompt_key: string; prompt_content: string }[]) {
        savedMap[p.prompt_key] = p.prompt_content;
      }
    }
    setItems(
      Object.entries(DEFAULT_PROMPTS).map(([key, meta]) => ({
        key,
        label: meta.label,
        description: meta.description,
        defaultContent: meta.defaultContent,
        currentContent: savedMap[key] ?? meta.defaultContent,
        expanded: false,
        dirty: false,
      }))
    );
  }, [promptsData]);

  const toggleExpand = (key: string) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, expanded: !item.expanded } : item))
    );
  };

  const handleChange = (key: string, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, currentContent: value, dirty: true } : item
      )
    );
  };

  const handleReset = (key: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? { ...item, currentContent: item.defaultContent, dirty: true }
          : item
      )
    );
  };

  const handleSave = async (key: string) => {
    const item = items.find((i) => i.key === key);
    if (!item || !currentTenantId) return;
    setSavingKey(key);
    try {
      await savePromptMutation.mutateAsync({
        tenantId: currentTenantId,
        promptKey: key,
        promptContent: item.currentContent,
      });
      setItems((prev) =>
        prev.map((i) => (i.key === key ? { ...i, dirty: false } : i))
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/account")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">AI 提示词配置</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 说明卡片 */}
        <div className="bg-blue-50 rounded-2xl px-4 py-3 border border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            AI 提示词决定了 AI 秘书分析沟通内容时的行为方式。院长可根据诊所实际情况自行调整，修改后点击"保存"即可生效。
          </p>
        </div>

        {/* 提示词列表 */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
          </div>
        ) : (
          items.map((item) => (
            <div key={item.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 标题行 */}
              <button
                className="w-full flex items-center justify-between px-4 py-3.5"
                onClick={() => toggleExpand(item.key)}
              >
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                    {item.dirty && (
                      <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                        未保存
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pr-4">{item.description}</p>
                </div>
                {item.expanded ? (
                  <ChevronUp size={18} className="text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown size={18} className="text-gray-400 shrink-0" />
                )}
              </button>

              {/* 展开内容 */}
              {item.expanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                  <textarea
                    className="w-full text-sm text-gray-800 bg-gray-50 rounded-xl px-3 py-2.5 border-0 outline-none resize-none min-h-[200px] font-mono leading-relaxed"
                    value={item.currentContent}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                    placeholder="请输入提示词..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReset(item.key)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs"
                    >
                      <RotateCcw size={12} />
                      恢复默认
                    </button>
                    <button
                      onClick={() => handleSave(item.key)}
                      disabled={savingKey === item.key || !item.dirty}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {savingKey === item.key ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      {savingKey === item.key ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
