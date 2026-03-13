/**
 * PromptLibrary.tsx - AD型定制账本：提示词库
 * 功能：按分类（图片/视频/PPT）管理提示词，支持粘贴批量导入，多选合并复制
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Copy,
  Trash2,
  CheckSquare,
  Square,
  ClipboardList,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const PROMPT_CATEGORIES = [
  { key: "image", label: "图片", color: "#1E88E5" },
  { key: "video", label: "视频", color: "#E53935" },
  { key: "ppt",   label: "PPT",  color: "#43A047" },
];

interface PromptItem {
  id: number;
  category: string;
  content: string;
  createdAt: string;
}

interface Props {
  ledgerId: number;
}

export default function PromptLibrary({ ledgerId }: Props) {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState("image");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const utils = trpc.useUtils();

  const { data: prompts = [], isLoading } = trpc.ledger.getPrompts.useQuery(
    { ledgerId, category: activeCategory },
    { enabled: !!ledgerId, staleTime: 0, refetchOnMount: true }
  );

  const createMutation = trpc.ledger.createPrompts.useMutation({
    onSuccess: () => {
      toast.success("提示词已保存");
      setPasteText("");
      setShowAdd(false);
      utils.ledger.getPrompts.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.ledger.deletePrompt.useMutation({
    onSuccess: () => {
      utils.ledger.getPrompts.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSavePrompts = () => {
    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      toast.error("请输入至少一条提示词");
      return;
    }
    createMutation.mutate({ ledgerId, category: activeCategory, contents: lines });
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyOne = (content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success("已复制"));
  };

  const copySelected = () => {
    const items = (prompts as PromptItem[]).filter((p) => selected.has(p.id));
    if (items.length === 0) { toast.error("请先选择提示词"); return; }
    const text = items.map((p) => p.content).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`已合并复制 ${items.length} 条提示词`);
      setSelected(new Set());
    });
  };

  const catColor = PROMPT_CATEGORIES.find((c) => c.key === activeCategory)?.color || "#D32F2F";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 text-white" style={{ backgroundColor: catColor }}>
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-medium flex-1 text-center">提示词库</h1>
          <div className="w-8" />
        </div>

        {/* 分类 Tab */}
        <div className="flex px-4 pb-3 gap-2">
          {PROMPT_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setSelected(new Set()); }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeCategory === cat.key
                  ? "bg-white text-gray-800 shadow-sm"
                  : "bg-white/20 text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 多选操作栏 */}
      {selected.size > 0 && (
        <div className="sticky top-[104px] z-10 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between shadow-sm">
          <span className="text-sm text-gray-600">已选 <span className="font-bold" style={{ color: catColor }}>{selected.size}</span> 条</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="flex items-center gap-1 text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200"
            >
              <X className="w-3.5 h-3.5" /> 取消
            </button>
            <button
              onClick={copySelected}
              className="flex items-center gap-1 text-sm text-white px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: catColor }}
            >
              <Copy className="w-3.5 h-3.5" /> 合并复制
            </button>
          </div>
        </div>
      )}

      {/* 提示词列表 */}
      <div className="px-4 py-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">加载中...</div>
        ) : (prompts as PromptItem[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ClipboardList className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">还没有提示词，点击右下角 + 添加</p>
          </div>
        ) : (
          (prompts as PromptItem[]).map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl px-4 py-3 flex items-start gap-3 border transition-all ${
                  isSelected ? "border-2" : "border-gray-100"
                }`}
                style={isSelected ? { borderColor: catColor } : {}}
              >
                {/* 多选框 */}
                <button
                  onClick={() => toggleSelect(p.id)}
                  className="mt-0.5 flex-shrink-0"
                  style={{ color: isSelected ? catColor : "#D1D5DB" }}
                >
                  {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </button>

                {/* 内容 */}
                <p className="flex-1 text-sm text-gray-700 leading-relaxed break-all">{p.content}</p>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => copyOne(p.content)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                    title="复制"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ id: p.id })}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 悬浮新建按钮 */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center z-20"
        style={{ backgroundColor: catColor }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* 添加提示词弹窗 */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setPasteText(""); } }}>
        <DialogContent className="mx-4 rounded-2xl p-0 overflow-hidden max-w-sm w-full">
          <div className="px-5 py-4 text-white" style={{ backgroundColor: catColor }}>
            <DialogTitle className="text-base font-semibold text-white">
              添加{PROMPT_CATEGORIES.find((c) => c.key === activeCategory)?.label}提示词
            </DialogTitle>
            <p className="text-xs mt-1 opacity-80">每行一条，支持粘贴批量导入</p>
          </div>

          <div className="px-5 py-4 space-y-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"在此粘贴或输入提示词\n每行一条，可批量导入\n\n例如：\n一只猫坐在窗台上，阳光照射\n赛博朋克城市夜景，霓虹灯"}
              className="w-full h-48 text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none resize-none text-gray-700 placeholder-gray-400"
              style={{ lineHeight: "1.6" }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowAdd(false); setPasteText(""); }}
              >
                取消
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: catColor }}
                onClick={handleSavePrompts}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
