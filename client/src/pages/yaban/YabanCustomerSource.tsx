/**
 * 牙伴齿科管理 - 顾客来源设置
 * 路由：/yaban/settings/customer-source
 * 权限：院长 + 创始人可见
 * 功能：查看/新增/编辑/删除顾客来源渠道，支持上下移动排序
 * 医院：通过顶部帽檐切换，所有操作均针对当前选中医院
 */
import { useState } from "react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

export default function YabanCustomerSource() {
  const goBack = useSmartBack("/yaban/settings/website-features");
  const utils = trpc.useUtils();
  const { currentTenantId } = useYabanClinic();

  const { data: sources = [], isLoading } = trpc.yabanCustomer.listCustomerSources.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );

  const addMutation = trpc.yabanCustomer.addCustomerSource.useMutation({
    onSuccess: () => {
      toast.success("已添加");
      utils.yabanCustomer.listCustomerSources.invalidate();
      setAddingLabel("");
      setIsAdding(false);
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateMutation = trpc.yabanCustomer.updateCustomerSource.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      utils.yabanCustomer.listCustomerSources.invalidate();
      setEditingId(null);
      setEditingLabel("");
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const deleteMutation = trpc.yabanCustomer.deleteCustomerSource.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.yabanCustomer.listCustomerSources.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const reorderMutation = trpc.yabanCustomer.reorderCustomerSources.useMutation({
    onSuccess: () => utils.yabanCustomer.listCustomerSources.invalidate(),
    onError: (e) => toast.error(e.message || "排序失败"),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [addingLabel, setAddingLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const handleAdd = () => {
    const label = addingLabel.trim();
    if (!label) { toast.error("来源名称不能为空"); return; }
    addMutation.mutate({ label, tenantId: currentTenantId ?? undefined });
  };

  const handleUpdate = () => {
    if (editingId === null) return;
    const label = editingLabel.trim();
    if (!label) { toast.error("来源名称不能为空"); return; }
    updateMutation.mutate({ id: editingId, label });
  };

  const handleDelete = (id: number, label: string) => {
    if (!window.confirm(`确定删除「${label}」？`)) return;
    deleteMutation.mutate({ id });
  };

  const handleMove = (idx: number, dir: "up" | "down") => {
    const arr = [...sources];
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
    const payload = arr.map((s, i) => ({ id: s.id, sortOrder: i + 1 }));
    reorderMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-20">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">顾客来源设置</span>
        </div>
        {/* 医院切换帽檐 */}
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-3">
        {/* 说明 */}
        <p className="text-xs text-gray-400 px-1">
          以下选项将显示在新建顾客的「顾客来源」下拉框中，可自由增删改排序。
        </p>

        {/* 来源列表 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-[#1E88D6] animate-spin" />
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">暂无来源，点击下方添加</div>
          ) : (
            sources.map((src, idx) => (
              <div
                key={src.id}
                className={`flex items-center gap-2 px-4 py-3 ${
                  idx < sources.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                {editingId === src.id ? (
                  /* 编辑态 */
                  <>
                    <input
                      autoFocus
                      className="flex-1 text-sm border border-[#1E88D6] rounded-lg px-3 h-9 outline-none bg-white"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                    />
                    <button
                      onClick={handleUpdate}
                      disabled={updateMutation.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E88D6] text-white flex-shrink-0"
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditingLabel(""); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  /* 展示态 */
                  <>
                    {/* 排序箭头 */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleMove(idx, "up")}
                        disabled={idx === 0 || reorderMutation.isPending}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-300 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(idx, "down")}
                        disabled={idx === sources.length - 1 || reorderMutation.isPending}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-300 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 text-sm text-gray-800">{src.label}</span>
                    <button
                      onClick={() => { setEditingId(src.id); setEditingLabel(src.label); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 flex-shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(src.id, src.label)}
                      disabled={deleteMutation.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* 新增区域 */}
        {isAdding ? (
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 text-sm border border-[#1E88D6] rounded-lg px-3 h-9 outline-none bg-white"
              placeholder="输入来源名称，如：朋友介绍"
              value={addingLabel}
              onChange={(e) => setAddingLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E88D6] text-white flex-shrink-0"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setIsAdding(false); setAddingLabel(""); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-2 bg-white rounded-2xl py-3.5 shadow-sm text-[#1E88D6] text-sm font-medium active:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            添加来源渠道
          </button>
        )}
      </div>
    </div>
  );
}
