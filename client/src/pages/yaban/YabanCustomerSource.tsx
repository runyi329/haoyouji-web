/**
 * 牙伴齿科管理 - 顾客来源设置
 * 路由：/yaban/settings/customer-source
 * 权限：院长 + 创始人可见
 * 功能：管理来源主标题，每个主标题下可挂多个带颜色的副标签
 */
import { useState } from "react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Settings,
  Trash2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

// 可选颜色列表（12 色，差异明显）
const TAG_COLORS = [
  { label: "蓝", value: "#1E88D6" },
  { label: "绿", value: "#43A047" },
  { label: "橙", value: "#FB8C00" },
  { label: "红", value: "#E53935" },
  { label: "紫", value: "#7C4DFF" },
  { label: "青", value: "#00ACC1" },
  { label: "粉", value: "#E91E8C" },
  { label: "棕", value: "#795548" },
  { label: "黄", value: "#F9A825" },
  { label: "深绿", value: "#2E7D32" },
  { label: "靛", value: "#3949AB" },
  { label: "灰", value: "#757575" },
];

type SourceTag = { id: number; label: string; color: string | null; sort: number };
type Source = { id: number; label: string; color: string | null; sortOrder: number; tags: SourceTag[] };

// ========== 颜色选择器 ==========
function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {TAG_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
          style={{
            backgroundColor: c.value,
            borderColor: value === c.value ? "#1E88D6" : "transparent",
            boxShadow: value === c.value ? "0 0 0 2px #fff, 0 0 0 4px #1E88D6" : "none",
          }}
          title={c.label}
        />
      ))}
    </div>
  );
}

// ========== 副标签胶囊 ==========
function TagPill({ label, color, onDelete }: { label: string; color: string | null; onDelete?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color || "#9E9E9E" }}
    >
      {label}
      {onDelete && (
        <button onClick={onDelete} className="ml-0.5 opacity-80 hover:opacity-100">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ========== 设置弹窗 ==========
function SourceSettingDrawer({
  source,
  onClose,
  onRefresh,
}: {
  source: Source;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editingLabel, setEditingLabel] = useState(source.label);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagLabel, setEditingTagLabel] = useState("");
  const [editingTagColor, setEditingTagColor] = useState("");

  const updateSource = trpc.yabanCustomer.updateCustomerSource.useMutation({
    onSuccess: () => { toast.success("标题已保存"); onRefresh(); },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const addTag = trpc.yabanCustomer.addSourceTag.useMutation({
    onSuccess: () => {
      toast.success("副标签已添加");
      setAddingTag(false);
      setNewTagLabel("");
      setNewTagColor(TAG_COLORS[0].value);
      onRefresh();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateTag = trpc.yabanCustomer.updateSourceTag.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      setEditingTagId(null);
      onRefresh();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const deleteTag = trpc.yabanCustomer.deleteSourceTag.useMutation({
    onSuccess: () => { toast.success("已删除"); onRefresh(); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const handleSaveLabel = () => {
    const label = editingLabel.trim();
    if (!label) { toast.error("标题不能为空"); return; }
    if (label === source.label) { toast("未做修改"); return; }
    updateSource.mutate({ id: source.id, label });
  };

  const handleAddTag = () => {
    const label = newTagLabel.trim();
    if (!label) { toast.error("副标签名称不能为空"); return; }
    addTag.mutate({ sourceId: source.id, label, color: newTagColor });
  };

  const handleSaveTag = (tag: SourceTag) => {
    const label = editingTagLabel.trim();
    if (!label) { toast.error("副标签名称不能为空"); return; }
    updateTag.mutate({ id: tag.id, label, color: editingTagColor });
  };

  const handleDeleteTag = (tag: SourceTag) => {
    if (!window.confirm(`确定删除副标签「${tag.label}」？`)) return;
    deleteTag.mutate({ id: tag.id });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <span className="text-base font-bold text-gray-800">设置来源</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 标题编辑 */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">来源标题</p>
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 h-10 outline-none focus:border-[#1E88D6] bg-white"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
              />
              <button
                onClick={handleSaveLabel}
                disabled={updateSource.isPending}
                className="px-4 h-10 rounded-xl bg-[#1E88D6] text-white text-sm font-medium flex items-center gap-1 disabled:opacity-60"
              >
                {updateSource.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                保存
              </button>
            </div>
          </div>

          {/* 副标签列表 */}
          <div>
            <p className="text-xs text-gray-400 mb-2">
              副标签
              <span className="ml-1 text-gray-300">（可选，选来源时可进一步细分）</span>
            </p>

            {(source.tags ?? []).length === 0 && !addingTag && (
              <p className="text-xs text-gray-300 mb-2">暂无副标签</p>
            )}

            <div className="space-y-2">
              {(source.tags ?? []).map((tag) => (
                <div key={tag.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  {editingTagId === tag.id ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        className="w-full text-sm border border-[#1E88D6] rounded-lg px-3 h-9 outline-none bg-white"
                        value={editingTagLabel}
                        onChange={(e) => setEditingTagLabel(e.target.value)}
                      />
                      <ColorPicker value={editingTagColor} onChange={setEditingTagColor} />
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveTag(tag)}
                          disabled={updateTag.isPending}
                          className="flex-1 h-9 rounded-xl bg-[#1E88D6] text-white text-sm font-medium"
                        >
                          {updateTag.isPending ? "保存中…" : "保存"}
                        </button>
                        <button
                          onClick={() => setEditingTagId(null)}
                          className="h-9 px-4 rounded-xl bg-gray-100 text-gray-500 text-sm"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TagPill label={tag.label} color={tag.color} />
                      <span className="flex-1" />
                      <button
                        onClick={() => {
                          setEditingTagId(tag.id);
                          setEditingTagLabel(tag.label);
                          setEditingTagColor(tag.color || TAG_COLORS[0].value);
                        }}
                        className="text-xs text-gray-400 hover:text-[#1E88D6]"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag)}
                        disabled={deleteTag.isPending}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* 新增副标签表单 */}
              {addingTag ? (
                <div className="rounded-xl border border-[#1E88D6] bg-blue-50/30 px-3 py-3 space-y-2">
                  <input
                    autoFocus
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 h-9 outline-none focus:border-[#1E88D6] bg-white"
                    placeholder="副标签名称，如：路过"
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  />
                  <ColorPicker value={newTagColor} onChange={setNewTagColor} />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAddTag}
                      disabled={addTag.isPending}
                      className="flex-1 h-9 rounded-xl bg-[#1E88D6] text-white text-sm font-medium"
                    >
                      {addTag.isPending ? "添加中…" : "添加"}
                    </button>
                    <button
                      onClick={() => { setAddingTag(false); setNewTagLabel(""); }}
                      className="h-9 px-4 rounded-xl bg-gray-100 text-gray-500 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTag(true)}
                  className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm hover:border-[#1E88D6] hover:text-[#1E88D6] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加副标签
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 主页面 ==========
export default function YabanCustomerSource() {
  const goBack = useSmartBack("/yaban/settings/website-features");
  const utils = trpc.useUtils();
  const { currentTenantId } = useYabanClinic();

  const { data: sources = [], isLoading } = trpc.yabanCustomer.listCustomerSources.useQuery(
    undefined,
    { staleTime: 0 }
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
  const [settingSource, setSettingSource] = useState<Source | null>(null);

  const handleAdd = () => {
    const label = addingLabel.trim();
    if (!label) { toast.error("来源名称不能为空"); return; }
    addMutation.mutate({ label });
  };

  const handleDelete = (src: Source) => {
    const tags = src.tags ?? [];
    const msg = tags.length > 0
      ? `确定删除「${src.label}」及其 ${tags.length} 个副标签？`
      : `确定删除「${src.label}」？`;
    if (!window.confirm(msg)) return;
    deleteMutation.mutate({ id: src.id });
  };

  const handleMove = (idx: number, dir: "up" | "down") => {
    const arr = [...sources];
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
    const payload = arr.map((s, i) => ({ id: s.id, sortOrder: i + 1 }));
    reorderMutation.mutate(payload);
  };

  const refresh = () => utils.yabanCustomer.listCustomerSources.invalidate();

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
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-3">
        <p className="text-xs text-gray-400 px-1">
          以下选项将显示在新建顾客的「顾客来源」选择中。每个来源标题下可添加带颜色的副标签（如「到店」下设「路过」「家近」）。
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
                className={`px-4 py-3 ${idx < sources.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <div className="flex items-center gap-2">
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

                  {/* 标题 */}
                  <span className="flex-1 text-sm font-medium text-gray-800">{src.label}</span>

                  {/* 副标签预览（最多3个） */}
                  {(src.tags ?? []).length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(src.tags ?? []).slice(0, 3).map((t) => (
                        <TagPill key={t.id} label={t.label} color={t.color} />
                      ))}
                      {(src.tags ?? []).length > 3 && (
                        <span className="text-xs text-gray-400">+{(src.tags ?? []).length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* 设置按钮 */}
                  <button
                    onClick={() => setSettingSource(src)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 flex-shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => handleDelete(src)}
                    disabled={deleteMutation.isPending}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
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
        )}
      </div>

      {/* 设置弹窗 */}
      {settingSource && (
        <SourceSettingDrawer
          source={settingSource}
          onClose={() => setSettingSource(null)}
          onRefresh={() => {
            refresh();
            // 刷新后同步更新弹窗内的 source 数据
            setSettingSource(null);
          }}
        />
      )}
    </div>
  );
}
