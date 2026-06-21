/**
 * 企业微信账号绑定管理组件
 * 功能：查看绑定列表、手动绑定、解绑、搜索、统计概览
 * 适用于：WecomAdmin.tsx 的"账号绑定"Tab
 */

import { useState, useEffect, useCallback } from "react";
import {
  Link2, Link2Off, Search, RefreshCw, Plus, X, User,
  ChevronRight, AlertCircle, CheckCircle2, Loader2, Edit2
} from "lucide-react";
import { toast } from "sonner";

// ─── 类型定义 ────────────────────────────────────────────────────────────────
interface BindingRecord {
  id: number;
  wecom_user_id: string;
  provider: string;
  site_username: string;
  site_user_id: number;
  bound_by: string;
  bind_note: string | null;
  bound_at: string;
  updated_at: string;
  user_real_name: string | null;
  user_phone: string | null;
  user_role: string | null;
  wecom_nickname: string | null;
  wecom_name: string | null;
  wecom_avatar: string | null;
}

interface BindingStats {
  total_bound: number;
  today_new: number;
  unbound_active: number;
}

interface UnboundWecomUser {
  wecom_user_id: string;
  nickname: string | null;
  wecom_name: string | null;
  wecom_avatar: string | null;
  last_active: string;
}

interface SiteUser {
  id: number;
  username: string;
  name: string | null;
  phone: string | null;
  role: string;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function getSessionToken(): string {
  return document.cookie
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith("session_token="))
    ?.split("=")[1] || "";
}

// ─── 统计卡片 ────────────────────────────────────────────────────────────────
function StatsBar({ stats, loading }: { stats: BindingStats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl p-3 text-center animate-pulse">
            <div className="h-6 bg-gray-100 rounded mb-1" />
            <div className="h-3 bg-gray-100 rounded w-3/4 mx-auto" />
          </div>
        ))}
      </div>
    );
  }
  if (!stats) return null;
  const items = [
    { label: "已绑定", value: stats.total_bound, color: "text-blue-600" },
    { label: "今日新增", value: stats.today_new, color: "text-green-600" },
    { label: "待绑定", value: stats.unbound_active, color: "text-orange-500" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      {items.map(item => (
        <div key={item.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
          <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 绑定记录卡片 ────────────────────────────────────────────────────────────
function BindingCard({
  record,
  onUnbind,
  onEditNote,
}: {
  record: BindingRecord;
  onUnbind: (id: number, label: string) => void;
  onEditNote: (record: BindingRecord) => void;
}) {
  const displayName = record.wecom_name || record.wecom_nickname || record.wecom_user_id;
  const siteDisplay = record.user_real_name || record.user_phone || record.site_username;

  return (
    <div className="bg-white rounded-xl mx-4 mb-2 shadow-sm overflow-hidden">
      <div className="p-3">
        {/* 企微用户 → 脉动网账号 */}
        <div className="flex items-center gap-2 mb-2">
          {record.wecom_avatar ? (
            <img src={record.wecom_avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
            <div className="text-xs text-gray-400 truncate">{record.wecom_user_id}</div>
          </div>
          <Link2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-right">
            <div className="text-sm font-medium text-gray-900 truncate">{siteDisplay}</div>
            <div className="text-xs text-gray-400 truncate">@{record.site_username}</div>
          </div>
        </div>

        {/* 绑定信息 */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
          <span>
            {record.bound_by ? `由 ${record.bound_by} 绑定` : "自动绑定"}
            {" · "}
            {formatDate(record.bound_at).split(" ")[0]}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditNote(record)}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
              title="编辑备注"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUnbind(record.id, displayName)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="解除绑定"
            >
              <Link2Off className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 备注 */}
        {record.bind_note && (
          <div className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
            备注：{record.bind_note}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 手动绑定弹窗 ────────────────────────────────────────────────────────────
function BindDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"select-wecom" | "select-site" | "confirm">("select-wecom");
  const [unboundUsers, setUnboundUsers] = useState<UnboundWecomUser[]>([]);
  const [siteUsers, setSiteUsers] = useState<SiteUser[]>([]);
  const [selectedWecom, setSelectedWecom] = useState<UnboundWecomUser | null>(null);
  const [selectedSite, setSelectedSite] = useState<SiteUser | null>(null);
  const [siteKeyword, setSiteKeyword] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const token = getSessionToken();

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/wecom/unbound-users", {
      headers: { "x-session-token": token },
      credentials: "include",
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setUnboundUsers(d.data); })
      .finally(() => setLoading(false));
  }, []);

  const searchSiteUser = useCallback(async (kw: string) => {
    if (!kw.trim()) { setSiteUsers([]); return; }
    const r = await fetch(`/api/admin/wecom/search-site-user?keyword=${encodeURIComponent(kw)}`, {
      headers: { "x-session-token": token },
      credentials: "include",
    });
    const d = await r.json();
    if (d.ok) setSiteUsers(d.data);
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => searchSiteUser(siteKeyword), 400);
    return () => clearTimeout(timer);
  }, [siteKeyword, searchSiteUser]);

  const handleSubmit = async () => {
    if (!selectedWecom || !selectedSite) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/wecom/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": token },
        credentials: "include",
        body: JSON.stringify({
          wecom_user_id: selectedWecom.wecom_user_id,
          site_user_id: selectedSite.id,
          bind_note: note || undefined,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success(d.message || "绑定成功");
        onSuccess();
        onClose();
      } else {
        toast.error(d.error || "绑定失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">手动绑定账号</h3>
          <button onClick={onClose} className="p-1 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 步骤 1：选择企微用户 */}
          {step === "select-wecom" && (
            <div>
              <p className="text-sm text-gray-500 mb-3">选择要绑定的企微用户（未绑定的活跃用户）：</p>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : unboundUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">暂无未绑定的企微用户</div>
              ) : (
                <div className="space-y-2">
                  {unboundUsers.map(u => (
                    <button
                      key={u.wecom_user_id}
                      onClick={() => { setSelectedWecom(u); setStep("select-site"); }}
                      className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors text-left"
                    >
                      {u.wecom_avatar ? (
                        <img src={u.wecom_avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{u.wecom_name || u.nickname || u.wecom_user_id}</div>
                        <div className="text-xs text-gray-400 truncate">{u.wecom_user_id}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 步骤 2：搜索脉动网用户 */}
          {step === "select-site" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setStep("select-wecom")} className="text-blue-500 text-sm">← 返回</button>
                <span className="text-sm text-gray-500">
                  已选企微用户：<strong>{selectedWecom?.wecom_name || selectedWecom?.wecom_user_id}</strong>
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-2">搜索脉动网账号（手机号/用户名/姓名）：</p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="输入手机号、用户名或姓名..."
                  value={siteKeyword}
                  onChange={e => setSiteKeyword(e.target.value)}
                  autoFocus
                />
              </div>
              {siteUsers.length > 0 && (
                <div className="space-y-2">
                  {siteUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedSite(u); setStep("confirm"); }}
                      className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{u.name || u.username}</div>
                        <div className="text-xs text-gray-400">{u.phone || ""} @{u.username}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  ))}
                </div>
              )}
              {siteKeyword && siteUsers.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">未找到匹配用户</div>
              )}
            </div>
          )}

          {/* 步骤 3：确认绑定 */}
          {step === "confirm" && selectedWecom && selectedSite && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep("select-site")} className="text-blue-500 text-sm">← 返回</button>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 mb-4">
                <p className="text-sm font-medium text-blue-800 mb-3">确认绑定关系：</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-white rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500 mb-1">企微用户</div>
                    <div className="text-sm font-medium">{selectedWecom.wecom_name || selectedWecom.wecom_user_id}</div>
                  </div>
                  <Link2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 bg-white rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500 mb-1">脉动网账号</div>
                    <div className="text-sm font-medium">{selectedSite.name || selectedSite.username}</div>
                    <div className="text-xs text-gray-400">{selectedSite.phone}</div>
                  </div>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-sm text-gray-600 mb-1 block">备注（可选）</label>
                <input
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="例如：客户本人确认，两个微信号均为本人"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                确认绑定
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 编辑备注弹窗 ────────────────────────────────────────────────────────────
function EditNoteDialog({
  record,
  onClose,
  onSuccess,
}: {
  record: BindingRecord;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [note, setNote] = useState(record.bind_note || "");
  const [saving, setSaving] = useState(false);
  const token = getSessionToken();

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/wecom/bindings/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-session-token": token },
        credentials: "include",
        body: JSON.stringify({ bind_note: note }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("备注已保存");
        onSuccess();
        onClose();
      } else {
        toast.error(d.error || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">编辑备注</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <textarea
          className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm border-0 outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          rows={3}
          placeholder="输入备注内容..."
          value={note}
          onChange={e => setNote(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 主组件：账号绑定管理
// ═══════════════════════════════════════════════════════════════════════════════
export default function WecomBindingManager() {
  const [stats, setStats] = useState<BindingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [bindings, setBindings] = useState<BindingRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showBindDialog, setShowBindDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BindingRecord | null>(null);
  const token = getSessionToken();
  const PAGE_SIZE = 20;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/wecom/binding-stats", {
        headers: { "x-session-token": token },
        credentials: "include",
      });
      const d = await r.json();
      if (d.ok) setStats(d.data);
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  const fetchBindings = useCallback(async (kw: string, pg: number) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        keyword: kw,
        page: String(pg),
        pageSize: String(PAGE_SIZE),
      });
      const r = await fetch(`/api/admin/wecom/bindings?${params}`, {
        headers: { "x-session-token": token },
        credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        setBindings(d.data);
        setTotal(d.total);
      }
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchBindings(keyword, 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [keyword, fetchBindings]);

  useEffect(() => {
    fetchBindings(keyword, page);
  }, [page, fetchBindings]);

  const handleUnbind = async (id: number, label: string) => {
    if (!window.confirm(`确认解除「${label}」的绑定关系？`)) return;
    try {
      const r = await fetch(`/api/admin/wecom/bindings/${id}`, {
        method: "DELETE",
        headers: { "x-session-token": token },
        credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("已解除绑定");
        fetchBindings(keyword, page);
        fetchStats();
      } else {
        toast.error(d.error || "解除失败");
      }
    } catch {
      toast.error("网络错误");
    }
  };

  const handleRefresh = () => {
    fetchStats();
    fetchBindings(keyword, page);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="pb-4">
      {/* 统计概览 */}
      <StatsBar stats={stats} loading={statsLoading} />

      {/* 搜索栏 + 操作按钮 */}
      <div className="px-4 mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-sm shadow-sm border-0 outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="搜索企微ID、用户名、手机号..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
        </div>
        <button
          onClick={handleRefresh}
          className="p-2.5 bg-white rounded-xl shadow-sm text-gray-500 hover:text-blue-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowBindDialog(true)}
          className="p-2.5 bg-blue-600 rounded-xl text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 绑定列表 */}
      {listLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : bindings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Link2Off className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{keyword ? "未找到匹配的绑定记录" : "暂无绑定记录"}</p>
        </div>
      ) : (
        <>
          <div className="space-y-0">
            {bindings.map(record => (
              <BindingCard
                key={record.id}
                record={record}
                onUnbind={handleUnbind}
                onEditNote={setEditingRecord}
              />
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4 px-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-white rounded-lg shadow-sm disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm bg-white rounded-lg shadow-sm disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}

          <div className="text-center mt-2 text-xs text-gray-400">共 {total} 条绑定记录</div>
        </>
      )}

      {/* 手动绑定弹窗 */}
      {showBindDialog && (
        <BindDialog
          onClose={() => setShowBindDialog(false)}
          onSuccess={() => { fetchBindings(keyword, page); fetchStats(); }}
        />
      )}

      {/* 编辑备注弹窗 */}
      {editingRecord && (
        <EditNoteDialog
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSuccess={() => fetchBindings(keyword, page)}
        />
      )}
    </div>
  );
}
