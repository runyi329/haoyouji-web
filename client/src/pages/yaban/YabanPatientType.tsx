/**
 * 牙伴齿科管理 - 顾客类型设置
 * 路由：/yaban/settings/patient-type
 * 权限：院长 + 创始人可见
 * 功能：管理顾客类型选项（增删改排序）
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
import YabanClinicHeader from "./YabanClinicHeader";

type PatientType = { id: number; label: string; sortOrder: number };

export default function YabanPatientType() {
  const goBack = useSmartBack("/yaban/settings/website-features");

  const utils = trpc.useUtils();
  const { data: types = [], isLoading } = trpc.yabanCustomer.listPatientTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // 新增
  const [isAdding, setIsAdding] = useState(false);
  const [addingLabel, setAddingLabel] = useState("");

  // 编辑
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const addMutation = trpc.yabanCustomer.addPatientType.useMutation({
    onSuccess: () => {
      toast.success("已添加");
      utils.yabanCustomer.listPatientTypes.invalidate();
      setAddingLabel("");
      setIsAdding(false);
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateMutation = trpc.yabanCustomer.updatePatientType.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      utils.yabanCustomer.listPatientTypes.invalidate();
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const deleteMutation = trpc.yabanCustomer.deletePatientType.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.yabanCustomer.listPatientTypes.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const reorderMutation = trpc.yabanCustomer.reorderPatientTypes.useMutation({
    onSuccess: () => utils.yabanCustomer.listPatientTypes.invalidate(),
    onError: (e) => toast.error(e.message || "排序失败"),
  });

  function handleAdd() {
    const label = addingLabel.trim();
    if (!label) return;
    addMutation.mutate({ label });
  }

  function handleUpdate(id: number) {
    const label = editingLabel.trim();
    if (!label) return;
    updateMutation.mutate({ id, label });
  }

  function handleDelete(id: number, label: string) {
    if (!confirm(`确定删除「${label}」吗？`)) return;
    deleteMutation.mutate({ id });
  }

  function handleMove(idx: number, dir: -1 | 1) {
    const newArr = [...types];
    const target = idx + dir;
    if (target < 0 || target >= newArr.length) return;
    [newArr[idx], newArr[target]] = [newArr[target], newArr[idx]];
    reorderMutation.mutate({ ids: newArr.map((t) => t.id) });
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">顾客类型设置</span>
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-3">
        <p className="text-xs text-gray-400 px-1">
          以下选项将显示在新建顾客的「顾客类型」选择中，可增删改排序。
        </p>

        {/* 类型列表 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#1E88D6]" />
            </div>
          ) : types.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">暂无类型，点击右上角「+」添加</div>
          ) : (
            types.map((t, idx) => (
              <div key={t.id} className={`px-4 py-3 flex items-center gap-3 ${idx < types.length - 1 ? "border-b border-gray-100" : ""}`}>
                {/* 排序按钮 */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center rounded text-gray-300 active:text-[#1E88D6] disabled:opacity-20"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === types.length - 1}
                    className="w-6 h-5 flex items-center justify-center rounded text-gray-300 active:text-[#1E88D6] disabled:opacity-20"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 编辑态 or 显示态 */}
                {editingId === t.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      autoFocus
                      className="flex-1 text-sm border border-[#1E88D6] rounded-lg px-3 h-9 outline-none bg-white"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate(t.id)}
                    />
                    <button
                      onClick={() => handleUpdate(t.id)}
                      disabled={updateMutation.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1E88D6] text-white flex-shrink-0"
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-800">{t.label}</span>
                    <button
                      onClick={() => { setEditingId(t.id); setEditingLabel(t.label); setIsAdding(false); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 active:text-[#1E88D6] active:bg-blue-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.label)}
                      disabled={deleteMutation.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 active:text-red-500 active:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* 新增输入框（仅 isAdding 时显示） */}
        {isAdding && (
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 text-sm border border-[#1E88D6] rounded-lg px-3 h-9 outline-none bg-white"
              placeholder="输入类型名称，如：VIP"
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
        )}
      </div>
    </div>
  );
}
