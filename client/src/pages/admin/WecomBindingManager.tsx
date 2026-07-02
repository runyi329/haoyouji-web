/**
 * 用户绑定管理页面（重新设计）
 * 以企微用户为主体，展示所有企微用户及其绑定状态
 * - 脉动网钱包绑定（核心）
 * - Manus 任务绑定（辅助提示）
 * - 预留扩展区（积分等）
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Search, RefreshCw, Link2Off, User, Wallet,
  Bot, X, Check, Loader2, Plus, Pencil,
  MessageSquare, Clock, Unlink
} from "lucide-react";
import { toast } from "sonner";

// 获取认证 header（与其他接口保持一致）
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth-token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────
interface WecomUserRecord {
  wecom_user_id: string;
  nickname: string;
  manus_task_id: string;
  model_pref: string;
  wecom_enabled: number;
  wecom_status: string;
  first_seen_at: string;
  last_active_at: string;
  binding_id: number | null;
  site_username: string | null;
  site_user_id: number | null;
  bind_note: string | null;
  bound_by: string | null;
  bound_at: string | null;
  user_real_name: string | null;
  user_phone: string | null;
  user_role: string | null;
  user_balance_usdt: number | null;
  msg_count: number;
}

interface Stats {
  total_wecom_users: number;
  total_bound: number;
  today_active: number;
}

interface SiteUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  role: string;
  balance: number;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function formatTime(ts: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatBalance(balance: number | null): string {
  if (balance === null || balance === undefined) return "-";
  return `¥${Number(balance).toFixed(2)}`;
}

// ─── 统计栏 ──────────────────────────────────────────────────────────────────
function StatsBar({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-4 py-3 mb-2 flex gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-1 h-14 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  const items = [
    { label: "企微用户", value: stats?.total_wecom_users ?? 0, color: "text-blue-600" },
    { label: "已绑定", value: stats?.total_bound ?? 0, color: "text-green-600" },
    { label: "今日活跃", value: stats?.today_active ?? 0, color: "text-orange-500" },
  ];
  return (
    <div className="px-4 py-3 mb-2 flex gap-3">
      {items.map(item => (
        <div key={item.label} className="flex-1 bg-white rounded shadow-sm px-3 py-2.5 text-center">
          <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-xs text-gray-400 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 绑定弹窗 ────────────────────────────────────────────────────────────────
function BindDialog({
  wecomUserId,
  currentBinding,
  onClose,
  onSuccess,
}: {
  wecomUserId: string;
  currentBinding: { site_username: string | null; bind_note: string | null } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [keyword, setKeyword] = useState(currentBinding?.site_username || "");
  const [searchResults, setSearchResults] = useState<SiteUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SiteUser | null>(null);
  const [note, setNote] = useState(currentBinding?.bind_note || "");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<any>(null);

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/wecom/search-site-user?keyword=${encodeURIComponent(kw)}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (d.ok) setSearchResults(d.data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(searchTimer.current);
  }, [keyword, doSearch]);

  const handleSave = async () => {
    if (!selectedUser && !currentBinding?.site_username) {
      toast.error("请先选择要绑定的脉动网用户");
      return;
    }
    const username = selectedUser?.username || currentBinding?.site_username;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/wecom/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ wecom_user_id: wecomUserId, site_username: username, bind_note: note }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("绑定成功");
        onSuccess();
        onClose();
      } else {
        toast.error(d.error || "绑定失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-500" />
            {currentBinding?.site_username ? "修改绑定" : "绑定脉动网账号"}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 rounded-sm px-3 py-2">
          企微用户：<span className="font-medium text-gray-700">{wecomUserId}</span>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">搜索脉动网用户</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded text-sm outline-none focus:border-blue-400"
              placeholder="输入用户名、姓名或手机号..."
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setSelectedUser(null); }}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {searchResults.length > 0 && !selectedUser && (
            <div className="mt-1 border border-gray-100 rounded overflow-hidden shadow-sm">
              {searchResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setKeyword(u.username); setSearchResults([]); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{u.username}</div>
                    <div className="text-xs text-gray-400">{u.name || ""} {u.phone || ""}</div>
                  </div>
                  <div className="text-xs text-green-600 font-medium">{formatBalance(u.balance)}</div>
                </button>
              ))}
            </div>
          )}

          {selectedUser && (
            <div className="mt-2 flex items-center gap-3 bg-blue-50 rounded px-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-800">{selectedUser.username}</div>
                <div className="text-xs text-blue-500">{selectedUser.name} · 余额 {formatBalance(selectedUser.balance)}</div>
              </div>
              <button onClick={() => { setSelectedUser(null); setKeyword(""); }} className="text-blue-400 hover:text-blue-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">备注（可选）</label>
          <input
            className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm outline-none focus:border-blue-400"
            placeholder="如：VIP客户、内部测试..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || (!selectedUser && !currentBinding?.site_username)}
          className="w-full py-3 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          确认绑定
        </button>
      </div>
    </div>
  );
}

// ─── 用户卡片 ────────────────────────────────────────────────────────────────
function UserCard({
  record,
  onBind,
  onUnbind,
}: {
  record: WecomUserRecord;
  onBind: (r: WecomUserRecord) => void;
  onUnbind: (r: WecomUserRecord) => void;
}) {
  const isBound = !!record.binding_id;
  const hasManus = !!record.manus_task_id;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="bg-white mx-4 mb-3 rounded shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
          {(record.nickname || record.wecom_user_id).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">
              {record.nickname || record.wecom_user_id}
            </span>
            {record.nickname && (
              <span className="text-xs text-gray-400">{record.wecom_user_id}</span>
            )}
            {isBound && (
              <span className="text-xs text-green-600 font-medium">
                脉动网账号：{record.site_username}{record.user_real_name ? `（${record.user_real_name}）` : ""}
              </span>
            )}
            {!record.wecom_enabled && (
              <span className="text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">已禁用</span>
            )}
            {/* 铅笔图标 + 弹出菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-1 rounded-sm text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-7 z-20 bg-white rounded-sm shadow-md border border-gray-200 py-1 min-w-[90px]">
                  <button
                    onClick={() => { setMenuOpen(false); onBind(record); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    {isBound ? "改绑" : "绑定"}
                  </button>
                  {isBound && (
                    <button
                      onClick={() => { setMenuOpen(false); onUnbind(record); }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Unlink className="w-3.5 h-3.5 text-gray-500" />
                      解绑
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(record.last_active_at)}
            </span>
            {record.msg_count > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {record.msg_count} 条消息
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-50 mx-4" />

      <div className="px-4 py-3 space-y-2">
        {/* 脉动网钉包绑定（核心） */}
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 ${isBound ? "bg-green-100" : "bg-gray-100"}`}>
            <Wallet className={`w-3.5 h-3.5 ${isBound ? "text-green-600" : "text-gray-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            {isBound ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-600 font-medium">USDT {formatBalance(record.user_balance_usdt ?? 0)}</span>
                {record.user_phone && <span className="text-xs text-gray-400">{record.user_phone}</span>}
                {record.bind_note && <span className="text-xs text-gray-400 italic">{record.bind_note}</span>}
              </div>
            ) : (
              <span className="text-sm text-gray-400">脉动网账号未绑定</span>
            )}
          </div>
        </div>

        {/* Manus 绑定（辅助提示） */}
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 ${hasManus ? "bg-purple-100" : "bg-gray-100"}`}>
            <Bot className={`w-3.5 h-3.5 ${hasManus ? "text-purple-600" : "text-gray-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            {hasManus ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Manus 已绑定</span>
                <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">{record.model_pref || "manus-1.6"}</span>
                <span className="text-xs text-gray-400 font-mono truncate max-w-[80px]">{record.manus_task_id}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">Manus 未绑定</span>
            )}
          </div>
        </div>
        {/* TODO: 预留扩展区 - 积分、其他绑定等 */}
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function WecomBindingManager() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers] = useState<WecomUserRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [bindTarget, setBindTarget] = useState<WecomUserRecord | null>(null);
  const PAGE_SIZE = 20;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/wecom/binding-stats", { credentials: "include", headers: getAuthHeaders() });
      const d = await r.json();
      if (d.ok) setStats(d.data);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (kw: string, pg: number) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({ keyword: kw, page: String(pg), pageSize: String(PAGE_SIZE) });
      const r = await fetch(`/api/admin/wecom/users?${params}`, { credentials: "include", headers: getAuthHeaders() });
      const d = await r.json();
      if (d.ok) {
        setUsers(d.data);
        setTotal(d.total);
        setListError("");
      } else {
        console.error('[WecomBinding] fetchUsers failed:', d);
        setListError(d.error || `接口返回错误 (HTTP ${r.status})`);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); fetchUsers(keyword, 1); }, 400);
    return () => clearTimeout(timer);
  }, [keyword, fetchUsers]);

  useEffect(() => { fetchUsers(keyword, page); }, [page, fetchUsers]);

  const handleUnbind = async (record: WecomUserRecord) => {
    if (!window.confirm(`确认解除「${record.wecom_user_id}」与「${record.site_username}」的绑定？`)) return;
    try {
      const r = await fetch(`/api/admin/wecom/bindings/${encodeURIComponent(record.wecom_user_id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("已解除绑定");
        fetchUsers(keyword, page);
        fetchStats();
      } else {
        toast.error(d.error || "解绑失败");
      }
    } catch {
      toast.error("网络错误");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="pb-4">
      <StatsBar stats={stats} loading={statsLoading} />

      <div className="px-4 mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded text-sm shadow-sm border-0 outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="搜索企微ID、昵称、用户名、手机号..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
        </div>
        <button
          onClick={() => { fetchStats(); fetchUsers(keyword, page); }}
          className="p-2.5 bg-white rounded shadow-sm text-gray-500 hover:text-blue-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {listLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : listError ? (
        <div className="text-center py-12 text-red-400">
          <Link2Off className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">加载失败</p>
          <p className="text-xs mt-1">{listError}</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Link2Off className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{keyword ? "未找到匹配的用户" : "暂无企微用户记录"}</p>
        </div>
      ) : (
        <>
          {users.map(record => (
            <UserCard
              key={record.wecom_user_id}
              record={record}
              onBind={setBindTarget}
              onUnbind={handleUnbind}
            />
          ))}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 py-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-sm bg-white shadow-sm text-sm text-gray-600 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-sm bg-white shadow-sm text-sm text-gray-600 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {bindTarget && (
        <BindDialog
          wecomUserId={bindTarget.wecom_user_id}
          currentBinding={bindTarget.binding_id ? { site_username: bindTarget.site_username, bind_note: bindTarget.bind_note } : null}
          onClose={() => setBindTarget(null)}
          onSuccess={() => { fetchUsers(keyword, page); fetchStats(); }}
        />
      )}
    </div>
  );
}
