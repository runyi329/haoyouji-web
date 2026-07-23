/**
 * ProjectConsole - 项目总控台（伪独立项目管理后台）
 *
 * 入口伪装：个人中心「隐私设置」按钮。普通用户点击只会看到「功能开发中」，
 * 仅超级管理员点击才会进入本页。
 *
 * 安全：本页前端先做 super_admin 校验，非超管一律展示 404 式「页面不存在」，
 * 不暴露页面真实用途。后端 version 写接口同样强校验 super_admin。
 *
 * 数据来源：直接读写后端 site_versions（trpc version.*）。
 *  - 项目列表 = listVersions（含未启用）
 *  - 新建项目 = saveVersion（自动生成随机 versionKey，落地 /p/{key}，loginUi=maidong）
 *  - 改名     = saveVersion（带 id 更新 name）
 *  - 删除     = deleteVersion（系统默认版本不可删；前端二次确认）
 * 新建后该版本会自动出现在「版本管理」与用户版本设置下拉中。
 *
 * 风格：脉动红金白，移动端优先，使用 lucide-react 图标，严禁 Emoji。
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Plus,
  Users,
  ScrollText,
  ShieldCheck,
  Link2,
  Copy,
  Check,
  Pencil,
  X,
  UserPlus,
  ChevronRight,
  Hash,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 正式对外域名（腾讯云部署）
const SITE_ORIGIN = "https://www.jiangyuchen.cn";

// 生成随机 versionKey（小写字母/数字/下划线，符合后端正则 ^[a-z0-9_]+$）
function genVersionKey(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `proj_${s}`;
}

// 拼出完整链接地址（正式域名 + 落地页路径）
function fullUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${p}`;
}

type VersionRow = {
  id: number;
  versionKey: string;
  name: string;
  loginUi: string;
  landingPath: string;
  customUrl: string | null;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
};

export default function ProjectConsole() {
  const [, navigate] = useLocation();
  // 规则3：从哪来回哪去（来源栈）。从 A055 进就回 A055，从个人中心进就回个人中心；栈空兑底回管理员个人中心。
  const goBack = useSmartBack("/profile");
  const { data: user, isLoading: userLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isSuperAdmin = !!user && (user as any).role === "super_admin";

  const versionsQuery = trpc.version.listVersions.useQuery(
    { includeDisabled: true },
    { enabled: isSuperAdmin, refetchOnWindowFocus: false },
  );
  const utils = trpc.useUtils();

  const saveMutation = trpc.version.saveVersion.useMutation();
  const deleteMutation = trpc.version.deleteVersion.useMutation();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingCustomUrlId, setEditingCustomUrlId] = useState<number | null>(null);
  const [draftCustomUrl, setDraftCustomUrl] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VersionRow | null>(null);
  const [creating, setCreating] = useState(false);

  const projects: VersionRow[] = useMemo(
    () => (versionsQuery.data as VersionRow[] | undefined) ?? [],
    [versionsQuery.data],
  );

  const refresh = () => utils.version.listVersions.invalidate();

  const startEdit = (p: VersionRow) => {
    setEditingId(p.id);
    setDraftName(p.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
  };
  const startEditCustomUrl = (p: VersionRow) => {
    setEditingCustomUrlId(p.id);
    setDraftCustomUrl(p.customUrl || "");
  };
  const cancelEditCustomUrl = () => {
    setEditingCustomUrlId(null);
    setDraftCustomUrl("");
  };
  const saveCustomUrl = async (p: VersionRow) => {
    const url = draftCustomUrl.trim();
    try {
      await saveMutation.mutateAsync({
        id: p.id,
        versionKey: p.versionKey,
        name: p.name,
        loginUi: p.loginUi || "maidong",
        landingPath: p.landingPath || "/",
        customUrl: url || null,
        enabled: p.enabled,
        sortOrder: p.sortOrder,
      });
      await refresh();
      toast.success(url ? "自定义链接已保存" : "已清除自定义链接");
      cancelEditCustomUrl();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    }
  };

  const saveEdit = async (p: VersionRow) => {
    const name = draftName.trim();
    if (!name) {
      toast.error("项目名称不能为空");
      return;
    }
    if (name === p.name) {
      cancelEdit();
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: p.id,
        versionKey: p.versionKey,
        name,
        loginUi: p.loginUi || "maidong",
        landingPath: p.landingPath || "/",
        customUrl: p.customUrl ?? null,
        enabled: p.enabled,
        sortOrder: p.sortOrder,
      });
      await refresh();
      toast.success("已保存");
      cancelEdit();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    }
  };

  const addProject = async () => {
    if (creating) return;
    setCreating(true);
    const key = genVersionKey();
    const nextOrder =
      projects.reduce((m, p) => Math.max(m, p.sortOrder), 0) + 1;
    try {
      await saveMutation.mutateAsync({
        versionKey: key,
        name: "新项目",
        loginUi: "maidong",
        landingPath: `/p/${key}`,
        enabled: true,
        sortOrder: nextOrder,
      });
      const list = await utils.version.listVersions.fetch({ includeDisabled: true });
      toast.success("已新建项目");
      // 新建后自动进入改名
      const created = (list as VersionRow[]).find((v) => v.versionKey === key);
      if (created) {
        setEditingId(created.id);
        setDraftName(created.name);
      }
    } catch (e: any) {
      toast.error(e?.message || "新建失败");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync({ id: pendingDelete.id });
      await refresh();
      toast.success("项目已删除");
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    } finally {
      setPendingDelete(null);
    }
  };

  const copyLink = async (p: VersionRow) => {
    const url = p.customUrl || fullUrl(p.landingPath);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
    setCopiedKey(p.versionKey);
    toast.success("链接已复制");
    window.setTimeout(() => setCopiedKey((k) => (k === p.versionKey ? null : k)), 1500);
  };

  // 进入项目首页：默认版本(脉动)落地 /，牙伴落地 /yaban/intro，其余落地各自 landingPath
  const enterHome = (p: VersionRow) => navigate(p.landingPath || "/");

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-6 h-6 animate-spin text-[#D32F2F]" />
      </div>
    );
  }

  // 非超管：404 式拦截，不暴露页面用途；超级管理员正常进入
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA] px-6 text-center">
        <div className="text-6xl font-bold text-gray-300 mb-3">404</div>
        <div className="text-gray-500 mb-6">页面不存在</div>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 rounded-full bg-[#D32F2F] text-white text-sm font-medium active:scale-[0.97] transition-transform"
        >
          返回首页
        </button>
      </div>
    );
  }

  const enabledCount = projects.filter((p) => p.enabled).length;
  const stats = [
    { label: "项目总数", value: String(projects.length), icon: LayoutGrid, color: "text-[#D32F2F]", bg: "bg-[#FDECEC]" },
    { label: "已启用", value: String(enabledCount), icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50" },
    { label: "操作日志", value: "—", icon: ScrollText, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-12">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1.5 rounded-full active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">项目总控台</h1>
          <button
            onClick={() => navigate("/admin/rules")}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#FAF3ED] text-[#CBA471] text-xs font-medium active:scale-95 transition-transform"
            aria-label="规则"
            title="规则库"
          >
            规则
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-[#CBA471] bg-[#FAF3ED] px-2 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            超管
          </span>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4 max-w-xl mx-auto">
        {/* 概览统计 */}
        <section className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon className={`w-[18px] h-[18px] ${s.color}`} />
              </div>
              <div className="text-lg font-bold text-gray-900 leading-none">{s.value}</div>
              <div className="text-[11px] text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* 快捷入口：邀请 / 版本设置（跳后台邀请 Tab） */}
        <button
          onClick={() => navigate("/admin?tab=invitations")}
          className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#FAF3ED] flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-[#CBA471]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">邀请 / 版本设置</div>
            <div className="text-[11px] text-gray-500 mt-0.5 truncate">
              给每个用户设置首页进入后看到的版本
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>

        {/* 项目列表 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">项目列表</h2>
            <button
              onClick={addProject}
              disabled={creating}
              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#D32F2F] px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              新建项目
            </button>
          </div>

          {versionsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">暂无项目，点击右上角「新建项目」</div>
          ) : (
            <ul className="space-y-2.5">
              {projects.map((p) => {
                const isEditing = editingId === p.id;
                const displayUrl = p.customUrl || fullUrl(p.landingPath);
                const isEditingCustomUrl = editingCustomUrlId === p.id;
                return (
                  <li key={p.id} className="p-3 rounded-xl border border-gray-100 bg-white">
                    {/* 第一行：logo（可点击进首页） + 名称 + 状态 + 操作 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => enterHome(p)}
                        className="w-9 h-9 rounded-xl bg-[#FDECEC] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                        aria-label={`进入${p.name}首页`}
                      >
                        <LayoutGrid className="w-[18px] h-[18px] text-[#D32F2F]" />
                      </button>

                      {isEditing ? (
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(p);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          maxLength={30}
                          className="flex-1 min-w-0 text-sm font-semibold text-gray-900 border-b border-[#D32F2F] outline-none px-0.5 py-0.5"
                          placeholder="请输入项目名称"
                        />
                      ) : (
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">{p.name}</span>
                          {p.isDefault ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-[#FAF3ED] text-[#CBA471]">
                              默认
                            </span>
                          ) : null}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                              p.enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {p.enabled ? "已启用" : "已停用"}
                          </span>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => saveEdit(p)}
                            disabled={saveMutation.isPending}
                            className="p-1.5 rounded-lg bg-[#D32F2F] text-white active:scale-95 transition-transform disabled:opacity-60"
                            aria-label="保存"
                          >
                            {saveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-transform"
                            aria-label="取消"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#D32F2F] active:scale-95 transition-transform"
                            aria-label="编辑名称"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!p.isDefault && (
                            <button
                              onClick={() => setPendingDelete(p)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 active:scale-95 transition-transform"
                              aria-label="删除项目"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 第二行：链接地址（完整显示、自动换行） + 一键复制 */}
                    <div className="mt-2.5 bg-[#FAFAFA] rounded-lg px-2.5 py-2">
                      <div className="flex items-start gap-2">
                        <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <span className="flex-1 min-w-0 text-xs text-gray-500 break-all leading-relaxed">
                          {displayUrl}
                          {p.customUrl && (
                            <span className="ml-1.5 text-[10px] text-blue-500 bg-blue-50 px-1 py-0.5 rounded">手动绑定</span>
                          )}
                        </span>
                      </div>
                      {isEditingCustomUrl && (
                        <div className="mt-2">
                          <input
                            autoFocus
                            value={draftCustomUrl}
                            onChange={(e) => setDraftCustomUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveCustomUrl(p);
                              if (e.key === "Escape") cancelEditCustomUrl();
                            }}
                            placeholder="输入自定义链接（留空则清除绑定）"
                            className="w-full text-xs border border-blue-300 rounded-md px-2 py-1.5 outline-none focus:border-blue-500 bg-white"
                          />
                          <div className="mt-1.5 flex gap-1.5 justify-end">
                            <button
                              onClick={cancelEditCustomUrl}
                              className="text-xs px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 active:scale-95 transition-transform"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => saveCustomUrl(p)}
                              disabled={saveMutation.isPending}
                              className="text-xs px-2.5 py-1 rounded-md bg-blue-500 text-white active:scale-95 transition-transform disabled:opacity-60"
                            >
                              {saveMutation.isPending ? "保存中…" : "保存"}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => isEditingCustomUrl ? cancelEditCustomUrl() : startEditCustomUrl(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 bg-blue-50 px-2.5 py-1 rounded-md active:scale-95 transition-transform mr-1.5"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {p.customUrl ? "修改绑定" : "手动绑定"}
                        </button>
                        <button
                          onClick={() => copyLink(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#D32F2F] bg-[#FDECEC] px-2.5 py-1 rounded-md active:scale-95 transition-transform"
                        >
                          {copiedKey === p.versionKey ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              复制链接
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 合作方占位提示 */}
          <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
            <Users className="w-3.5 h-3.5" />
            合作方指派、归属配置等将在后续阶段开放
          </div>
        </section>
      </main>

      {/* 删除二次确认 */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会从版本列表中永久删除此项目，且无法恢复。删除后用户版本设置中将不再可选此版本。请确认。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-[#D32F2F] hover:bg-[#b71c1c]"
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
