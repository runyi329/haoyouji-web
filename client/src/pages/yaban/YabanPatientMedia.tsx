import { useState, useRef, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { PageTag } from "@/components/PageTag";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Camera,
  ImageIcon,
  FileUp,
  X,
  Trash2,
  Pencil,
  ChevronLeft as ArrowLeft,
  ChevronRight as ArrowRight,
  Loader2,
  ImageOff,
  FileText,
} from "lucide-react";

// 影像分类（顺序即展示顺序），与后端档位映射保持一致
const CATEGORIES = [
  "面像照",
  "口内照",
  "X光片",
  "小牙片",
  "根尖片",
  "全景片",
  "CBCT",
  "内窥镜",
  "口扫模型",
  "文档图片",
  "知情同意书",
  "其他",
];

// 单条影像的类型（与后端 listMedia 返回结构对应）
interface MediaItem {
  id: number;
  customerId: number;
  category: string;
  fullUrl: string;
  thumbUrl: string;
  mime: string | null;
  fileSize: number | null;
  isLossless: boolean;
  fileName: string | null;
  remark: string | null;
  uploaderId: number | null;
  uploaderRole: string | null;
  takenAt: string | null;
  createdAt: string | null;
}

// 把 File 读成 dataURL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 取分组用日期：优先拍摄日期，否则创建日期
function groupDateOf(m: MediaItem): string {
  if (m.takenAt) return m.takenAt;
  if (m.createdAt) return String(m.createdAt).slice(0, 10);
  return "未知日期";
}

export default function YabanPatientMedia() {
  const [, navigate] = useLocation();
  const { current, currentTenantId } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [, params] = useRoute("/yaban/patient/:id/media");
  const customerId = params?.id ? Number(params.id) : 0;

  const { user } = useAuth();
  const { data: membership } = trpc.yabanRole.myMembership.useQuery({ tenantId: currentTenantId ?? undefined });
  const perms: string[] = membership?.permissions || [];
  const isSuper = user?.role === "super_admin" || !!membership?.isFounder;
  // 上传/编辑：media_upload 权限；删除：media_delete 权限
  const canUpload = isSuper || perms.includes("media_upload");
  const canDelete = isSuper || perms.includes("media_delete");

  const utils = trpc.useUtils();
  const listQuery = trpc.yabanCustomer.listMedia.useQuery(
    { customerId },
    { enabled: customerId > 0, refetchOnWindowFocus: false }
  );
  const items: MediaItem[] = (listQuery.data?.list as MediaItem[]) || [];

  // 顶部分类筛选（null 表示全部）
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 上传相关
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string>(CATEGORIES[0]);
  const [showCategoryPick, setShowCategoryPick] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // 大图查看
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // 编辑备注/分类
  const [editing, setEditing] = useState<MediaItem | null>(null);

  const uploadMutation = trpc.yabanCustomer.uploadMedia.useMutation();
  const updateMutation = trpc.yabanCustomer.updateMedia.useMutation();
  const deleteMutation = trpc.yabanCustomer.deleteMedia.useMutation();

  // 各分类计数
  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of items) map[m.category] = (map[m.category] || 0) + 1;
    return map;
  }, [items]);

  // 当前筛选后的列表
  const filtered = useMemo(() => {
    if (!activeCategory) return items;
    return items.filter((m) => m.category === activeCategory);
  }, [items, activeCategory]);

  // 按日期分组（保持后端已排好的倒序）
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, MediaItem[]> = {};
    for (const m of filtered) {
      const d = groupDateOf(m);
      if (!map[d]) {
        map[d] = [];
        order.push(d);
      }
      map[d].push(m);
    }
    return order.map((d) => ({ date: d, list: map[d] }));
  }, [filtered]);

  // 只展示有数据的分类作为筛选 chips
  const categoryChips = useMemo(
    () => CATEGORIES.filter((c) => (countByCategory[c] || 0) > 0),
    [countByCategory]
  );

  const handlePickAndUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      let ok = 0;
      let fail = 0;
      let lastErr = "";
      for (const file of Array.from(files)) {
        try {
          const dataUrl = await fileToDataUrl(file);
          await uploadMutation.mutateAsync({
            customerId,
            category: pendingCategory,
            dataUrl,
            fileName: file.name,
          });
          ok++;
        } catch (e: any) {
          fail++;
          lastErr = e?.message || "未知错误";
          // 单条失败继续下一条
        }
      }
      setUploading(false);
      if (ok > 0) toast.success(`已上传 ${ok} 张影像`);
      if (fail > 0) toast.error(`${fail} 张上传失败：${lastErr}`);
      utils.yabanCustomer.listMedia.invalidate({ customerId });
    },
    [customerId, pendingCategory, uploadMutation, utils]
  );

  const triggerInput = (type: "camera" | "album" | "file") => {
    setShowUploadMenu(false);
    // 先让用户确认分类，再唤起选择器
    setShowCategoryPick(true);
    // 记录待触发的输入类型
    pendingInputType.current = type;
  };
  const pendingInputType = useRef<"camera" | "album" | "file">("album");

  const confirmCategoryAndOpen = () => {
    setShowCategoryPick(false);
    const t = pendingInputType.current;
    if (t === "camera") cameraInputRef.current?.click();
    else if (t === "album") albumInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleDelete = async (m: MediaItem) => {
    if (!window.confirm(`确认删除这条影像吗？删除后不可恢复。`)) return;
    try {
      await deleteMutation.mutateAsync({ id: m.id });
      toast.success("已删除");
      setViewerIndex(null);
      utils.yabanCustomer.listMedia.invalidate({ customerId });
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  const handleSaveEdit = async (remark: string, category: string, takenAt: string) => {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        remark,
        category,
        takenAt: takenAt || undefined,
      });
      toast.success("已保存");
      setEditing(null);
      utils.yabanCustomer.listMedia.invalidate({ customerId });
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  // 大图查看器的左右切换基于 filtered 顺序
  const viewerItem = viewerIndex != null ? filtered[viewerIndex] : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${customerId}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">影像记录</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          {canUpload ? (
            <button onClick={() => setShowUploadMenu(true)} className="p-1">
              <Plus className="w-6 h-6" />
            </button>
          ) : (
            <span className="w-6" />
          )}
        </div>
      </div>

      {/* 分类筛选 chips（仅展示有数据的分类） */}
      {categoryChips.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-3 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 w-max">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1 rounded-full text-[13px] whitespace-nowrap ${
                activeCategory === null ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              全部 {items.length}
            </button>
            {categoryChips.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1 rounded-full text-[13px] whitespace-nowrap ${
                  activeCategory === c ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {c} {countByCategory[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1">
        {listQuery.isLoading ? (
          <div className="py-20 flex items-center justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-gray-400">
            <ImageOff className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无影像记录</p>
            {canUpload && (
              <button
                onClick={() => setShowUploadMenu(true)}
                className="mt-4 px-4 py-2 rounded-full bg-sky-500 text-white text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                上传影像
              </button>
            )}
          </div>
        ) : (
          <div className="pb-24">
            {grouped.map((g) => (
              <div key={g.date} className="mt-2">
                <div className="px-4 py-2 text-[13px] text-gray-500 font-medium">{g.date}</div>
                <div className="grid grid-cols-3 gap-1 px-1">
                  {g.list.map((m) => {
                    const globalIdx = filtered.indexOf(m);
                    const isDoc = m.mime != null && !m.mime.startsWith("image/");
                    return (
                      <button
                        key={m.id}
                        onClick={() => setViewerIndex(globalIdx)}
                        className="relative aspect-square bg-gray-100 overflow-hidden"
                      >
                        {isDoc ? (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                            <FileText className="w-8 h-8" />
                            <span className="mt-1 text-[10px] px-1 truncate max-w-full">
                              {m.fileName || "文件"}
                            </span>
                          </div>
                        ) : (
                          <img
                            src={m.thumbUrl}
                            alt={m.category}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                        {/* 分类角标 */}
                        <span className="absolute left-0 bottom-0 bg-black/50 text-white text-[10px] px-1 py-0.5 max-w-full truncate">
                          {m.category}
                        </span>
                        {m.remark && (
                          <span className="absolute right-1 top-1 w-2 h-2 rounded-full bg-amber-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 上传动作菜单 */}
      {showUploadMenu && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowUploadMenu(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 text-center text-[13px] text-gray-400 border-b border-gray-100">
              选择上传方式
            </div>
            <button
              onClick={() => triggerInput("camera")}
              className="w-full px-4 py-4 flex items-center gap-3 text-gray-800 border-b border-gray-50"
            >
              <Camera className="w-5 h-5 text-sky-500" />
              拍照
            </button>
            <button
              onClick={() => triggerInput("album")}
              className="w-full px-4 py-4 flex items-center gap-3 text-gray-800 border-b border-gray-50"
            >
              <ImageIcon className="w-5 h-5 text-sky-500" />
              从相册选择
            </button>
            <button
              onClick={() => triggerInput("file")}
              className="w-full px-4 py-4 flex items-center gap-3 text-gray-800 border-b border-gray-50"
            >
              <FileUp className="w-5 h-5 text-sky-500" />
              选择文件（CBCT/口扫/文档）
            </button>
            <button
              onClick={() => setShowUploadMenu(false)}
              className="w-full px-4 py-4 text-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 上传前选择分类 */}
      {showCategoryPick && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCategoryPick(false)} />
          <div className="relative bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
              <span className="text-[15px] font-medium text-gray-800">选择影像分类</span>
              <button onClick={() => setShowCategoryPick(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setPendingCategory(c)}
                  className={`px-2 py-2 rounded-lg text-[13px] ${
                    pendingCategory === c
                      ? "bg-sky-500 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={confirmCategoryAndOpen}
                className="w-full py-3 rounded-full bg-sky-500 text-white text-[15px]"
              >
                确定并选择文件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handlePickAndUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePickAndUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePickAndUpload(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 上传中遮罩 */}
      {uploading && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-5 flex flex-col items-center">
            <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
            <span className="mt-2 text-sm text-gray-600">上传中…</span>
          </div>
        </div>
      )}

      {/* 大图查看器 */}
      {viewerItem && viewerIndex != null && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <button onClick={() => setViewerIndex(null)} className="p-1">
              <X className="w-6 h-6" />
            </button>
            <span className="text-sm">
              {viewerIndex + 1} / {filtered.length}
            </span>
            {(canUpload || canDelete) ? (
              <div className="flex items-center gap-3">
                {canUpload && (
                  <button onClick={() => setEditing(viewerItem)} className="p-1">
                    <Pencil className="w-5 h-5" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDelete(viewerItem)} className="p-1">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ) : (
              <span className="w-12" />
            )}
          </div>

          <div className="flex-1 flex items-center justify-center relative overflow-auto">
            {viewerItem.mime && !viewerItem.mime.startsWith("image/") ? (
              <div className="flex flex-col items-center text-white px-6 text-center">
                <FileText className="w-16 h-16 mb-3" />
                <p className="text-sm break-all">{viewerItem.fileName || "文件"}</p>
                <a
                  href={viewerItem.fullUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 px-4 py-2 rounded-full bg-sky-500 text-white text-sm"
                >
                  下载/查看原文件
                </a>
              </div>
            ) : (
              <img
                src={viewerItem.fullUrl}
                alt={viewerItem.category}
                className="max-w-full max-h-full object-contain touch-pinch-zoom"
              />
            )}

            {/* 左右切换 */}
            {viewerIndex > 0 && (
              <button
                onClick={() => setViewerIndex(viewerIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 rounded-full text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            {viewerIndex < filtered.length - 1 && (
              <button
                onClick={() => setViewerIndex(viewerIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 rounded-full text-white"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* 备注底部浮层（不遮挡图片主体） */}
          <div className="px-4 py-3 bg-black/60 text-white">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="px-2 py-0.5 rounded bg-sky-500 text-white">{viewerItem.category}</span>
              {viewerItem.takenAt && <span className="text-gray-300">{viewerItem.takenAt}</span>}
              {viewerItem.isLossless && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-[11px]">无损</span>
              )}
            </div>
            {viewerItem.remark && (
              <p className="mt-1 text-[13px] text-gray-200">{viewerItem.remark}</p>
            )}
          </div>
        </div>
      )}

      {/* 编辑备注/分类弹层 */}
      {editing && (
        <EditMediaSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
          saving={updateMutation.isPending}
        />
      )}

      <PageTag code="P327" />
    </div>
  );
}

// ============ 编辑影像弹层 ============
function EditMediaSheet({
  item,
  onClose,
  onSave,
  saving,
}: {
  item: MediaItem;
  onClose: () => void;
  onSave: (remark: string, category: string, takenAt: string) => void;
  saving: boolean;
}) {
  const [remark, setRemark] = useState(item.remark || "");
  const [category, setCategory] = useState(item.category);
  const [takenAt, setTakenAt] = useState(item.takenAt || "");

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <span className="text-[15px] font-medium text-gray-800">编辑影像信息</span>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[13px] text-gray-500 mb-1">分类</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[13px] ${
                    category === c ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] text-gray-500 mb-1">拍摄/就诊日期</label>
            <input
              type="date"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[13px] text-gray-500 mb-1">备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="补充影像说明，如部位、诊断要点等"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[14px] resize-none"
            />
          </div>
          <button
            onClick={() => onSave(remark, category, takenAt)}
            disabled={saving}
            className="w-full py-3 rounded-full bg-sky-500 text-white text-[15px] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
