import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft, Plus, Pencil, Trash2, RefreshCw, Search, X,
  Clock, CheckCircle2, XCircle, ExternalLink,
  Activity, AlertTriangle, TrendingUp, Wrench,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
  CheckCheck, Copy, User, Phone, Timer, Minus
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "@/pages/miban/mibanTrpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { UserAvatar } from "@/components/UserAvatar";

type LedgerDatePreset = "all" | "today" | "this_month" | "last_month" | "custom";

const formatLedgerDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLedgerDateRange = (preset: LedgerDatePreset, customStart: string, customEnd: string) => {
  const now = new Date();
  if (preset === "today") {
    const today = formatLedgerDate(now);
    return { startDate: today, endDate: today };
  }
  if (preset === "this_month") {
    return {
      startDate: formatLedgerDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: formatLedgerDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === "last_month") {
    return {
      startDate: formatLedgerDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: formatLedgerDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === "custom") {
    return { startDate: customStart || undefined, endDate: customEnd || undefined };
  }
  return { startDate: undefined, endDate: undefined };
};

function LedgerFlowFilters({
  keyword,
  datePreset,
  customStart,
  customEnd,
  onKeywordChange,
  onDatePresetChange,
  onCustomStartChange,
  onCustomEndChange,
  onClear,
}: {
  keyword: string;
  datePreset: LedgerDatePreset;
  customStart: string;
  customEnd: string;
  onKeywordChange: (value: string) => void;
  onDatePresetChange: (preset: LedgerDatePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onClear: () => void;
}) {
  const isFiltered = keyword.trim().length > 0 || datePreset !== "all";
  const dateOptions: Array<{ key: LedgerDatePreset; label: string }> = [
    { key: "all", label: "全部" },
    { key: "today", label: "今天" },
    { key: "this_month", label: "本月" },
    { key: "last_month", label: "上月" },
    { key: "custom", label: "自定义" },
  ];
  return (
    <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 focus-within:border-orange-400">
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索备注、类型、金额…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-gray-700 outline-none placeholder:text-gray-400"
        />
        {keyword && (
          <button type="button" onClick={() => onKeywordChange("")} className="p-0.5 text-gray-400" aria-label="清除搜索">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
        {dateOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onDatePresetChange(option.key)}
            className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
              datePreset === option.key
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-100"
            }`}
          >
            {option.label}
          </button>
        ))}
        {isFiltered && (
          <button type="button" onClick={onClear} className="ml-auto shrink-0 px-1 text-[10px] text-orange-500">
            清除
          </button>
        )}
      </div>
      {datePreset === "custom" && (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <input type="date" value={customStart} onChange={(event) => onCustomStartChange(event.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-600 outline-none focus:border-orange-400" />
          <span className="text-[10px] text-gray-400">至</span>
          <input type="date" value={customEnd} onChange={(event) => onCustomEndChange(event.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-600 outline-none focus:border-orange-400" />
        </div>
      )}
    </div>
  );
}

export default function AfRechargeManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  // 直接从 URL 路径解析 ledgerId，避免 wouter params 在嵌套路由中取值错误
  const ledgerId = (() => {
    const m = typeof window !== 'undefined' ? window.location.pathname.match(/\/ledger\/(\d+)/) : null;
    if (m) return parseInt(m[1]);
    if (params?.id) return parseInt(params.id);
    return 1;
  })();

  // 主 Tab：adjust=手动调账 | records=充值记录 | monitor=充值监控。
  // 充值管理默认打开手动调账；若其他入口显式传入 tab，仍按其原有目标页签打开。
  const [mainTab, setMainTab] = useState<"records" | "monitor" | "adjust">(() => {
    if (typeof window === 'undefined') return "adjust";
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    return requestedTab === 'records' || requestedTab === 'monitor' || requestedTab === 'adjust'
      ? requestedTab
      : 'adjust';
  });

  // ===== 充值记录 Tab 状态 =====
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showManualConfirmDialog, setShowManualConfirmDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [txnHash, setTxnHash] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [showBulkClearConfirm, setShowBulkClearConfirm] = useState(false);
  // ===== 撤回相关状态 =====
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<
    | { type: 'order'; orderId: number; amount: number }
    | { type: 'manual'; manualId: number; amount: number; currency: string }
    | { type: 'history'; historyId: number; amount: number; currency: string }
    | null
  >(null);
  // ===== 编辑备注相关状态 =====
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteTarget, setNoteTarget] = useState<{ historyId?: number; manualId?: number; currentNote: string } | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteSelectedCommonNote, setNoteSelectedCommonNote] = useState<string | null>(null);

  // ===== 充值监控 Tab 状态 =====
  const [showFixLogs, setShowFixLogs] = useState(false);
  const [fixLogs, setFixLogs] = useState<string[]>([]);
  const [showDiagLogs, setShowDiagLogs] = useState(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  // 监控Tab中的手动确认
  const [monitorSelectedOrder, setMonitorSelectedOrder] = useState<any>(null);
  const [monitorTxnHash, setMonitorTxnHash] = useState("");
  const [monitorActualAmount, setMonitorActualAmount] = useState("");
  const [showMonitorConfirmDialog, setShowMonitorConfirmDialog] = useState(false);

  // ===== 内嵌调账 Tab 状态 =====
  const [adjSearch, setAdjSearch] = useState("");
  const [adjShowDropdown, setAdjShowDropdown] = useState(false);
  const [adjSelectedUser, setAdjSelectedUser] = useState<any>(null);
  const [adjCurrency, setAdjCurrency] = useState<"USDT" | "CNY">("USDT");
  const [adjDirection, setAdjDirection] = useState<"add" | "sub">("add");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjSelectedCommonNote, setAdjSelectedCommonNote] = useState<string | null>(null);
  // 成功调账过的用户保存在当前账本、当前设备，优先于普通用户列表展示。
  const recentAdjUserStorageKey = `af-recharge-adjust-recent-users-v1:${ledgerId}`;
  const [recentAdjUserIds, setRecentAdjUserIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(window.localStorage.getItem(recentAdjUserStorageKey) || "[]");
      return Array.isArray(stored)
        ? stored.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, 10)
        : [];
    } catch {
      return [];
    }
  });
  // 常用备注仅保存到当前账本、当前设备，避免额外管理页面和跨账本混用。
  const commonAdjNoteStorageKey = `af-recharge-adjust-common-notes-v1:${ledgerId}`;
  const [adjCommonNotes, setAdjCommonNotes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(window.localStorage.getItem(commonAdjNoteStorageKey) || "[]");
      return Array.isArray(stored)
        ? stored.filter((note): note is string => typeof note === "string" && note.trim().length > 0).slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const [adjFlowTab, setAdjFlowTab] = useState<"user" | "global">("user");
  const [adjLogPage, setAdjLogPage] = useState(1);
  const [adjUserFlowKeyword, setAdjUserFlowKeyword] = useState("");
  const [adjUserFlowDatePreset, setAdjUserFlowDatePreset] = useState<LedgerDatePreset>("all");
  const [adjUserFlowCustomStart, setAdjUserFlowCustomStart] = useState("");
  const [adjUserFlowCustomEnd, setAdjUserFlowCustomEnd] = useState("");
  const [adjGlobalFlowKeyword, setAdjGlobalFlowKeyword] = useState("");
  const [adjGlobalFlowDatePreset, setAdjGlobalFlowDatePreset] = useState<LedgerDatePreset>("all");
  const [adjGlobalFlowCustomStart, setAdjGlobalFlowCustomStart] = useState("");
  const [adjGlobalFlowCustomEnd, setAdjGlobalFlowCustomEnd] = useState("");
  const ADJ_PAGE_SIZE = 10;
  // ===== 数据查询 =====
  const ordersQuery = trpc.recharge.adminGetAllOrders.useQuery({ limit: 200 }, {
    refetchInterval: 30000,
  });
  const pendingOrdersQuery = trpc.recharge.adminGetPendingOrders.useQuery();
  const statsQuery = trpc.recharge.adminGetSystemStats.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const heartbeatQuery = trpc.recharge.adminGetScannerHeartbeat.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const unmatchedQuery = trpc.recharge.adminGetUnmatchedTransactions.useQuery();

  // ===== 内嵌调账 Tab 数据查询 =====
  const adjUtils = mtrpc.useUtils();
  const { data: adjAllUsers = [] } = mtrpc.adminUser.list.useQuery();
  // 与用户自己进入全局钱包看到的明细使用完全相同的合并、去重和逐笔余额口径。
  const adjHistoryQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ...(adjSelectedUser?.id ? { viewAsUserId: Number(adjSelectedUser.id) } : {}) },
    { enabled: !!adjSelectedUser, staleTime: 0 }
  );
  const adjHistory = (adjHistoryQuery.data as any[]) ?? [];
  const refetchAdjHistory = adjHistoryQuery.refetch;
  const adjUserDateRange = getLedgerDateRange(adjUserFlowDatePreset, adjUserFlowCustomStart, adjUserFlowCustomEnd);
  const adjUserKeyword = adjUserFlowKeyword.trim().toLocaleLowerCase();
  const adjFilteredHistory = adjHistory.filter((record: any) => {
    const occurredAt = new Date(record.createdAt);
    const occurredDate = Number.isNaN(occurredAt.getTime()) ? '' : formatLedgerDate(occurredAt);
    const inDateRange =
      (!adjUserDateRange.startDate || occurredDate >= adjUserDateRange.startDate) &&
      (!adjUserDateRange.endDate || occurredDate <= adjUserDateRange.endDate);
    if (!inDateRange) return false;
    if (!adjUserKeyword) return true;
    return [
      record.note,
      record.description,
      record.type,
      record.sourceType,
      record.status,
      record.currency,
      record.amount,
      record.balanceAfter,
    ].some((value) => String(value ?? '').toLocaleLowerCase().includes(adjUserKeyword));
  });
  const adjGlobalDateRange = getLedgerDateRange(adjGlobalFlowDatePreset, adjGlobalFlowCustomStart, adjGlobalFlowCustomEnd);
  const { data: adjGlobalLog, refetch: refetchAdjGlobal } = mtrpc.adminUser.walletGlobalHistory.useQuery(
    {
      page: adjLogPage,
      pageSize: ADJ_PAGE_SIZE,
      ...(adjGlobalFlowKeyword.trim() ? { keyword: adjGlobalFlowKeyword.trim() } : {}),
      ...(adjGlobalDateRange.startDate ? { startDate: adjGlobalDateRange.startDate } : {}),
      ...(adjGlobalDateRange.endDate ? { endDate: adjGlobalDateRange.endDate } : {}),
    }
  );
  const { data: adjRecentHistory } = mtrpc.adminUser.walletGlobalHistory.useQuery(
    { page: 1, pageSize: 10 },
    { staleTime: 30_000 }
  );
  const adjLogItems = adjGlobalLog?.items ?? [];
  const adjRecentHistoryItems = adjRecentHistory?.items ?? [];
  const adjLogTotal = adjGlobalLog?.total ?? 0;
  const adjLogTotalPages = Math.max(1, Math.ceil(adjLogTotal / ADJ_PAGE_SIZE));
  const persistRecentAdjUsers = (nextIds: number[]) => {
    const normalized = Array.from(new Set(nextIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 10);
    setRecentAdjUserIds(normalized);
    try {
      window.localStorage.setItem(recentAdjUserStorageKey, JSON.stringify(normalized));
    } catch {
      // 本机存储不可用时仍在当前页面会话保留最近用户。
    }
  };
  const rememberRecentAdjUser = (userId: number) => {
    persistRecentAdjUsers([userId, ...recentAdjUserIds.filter((id) => id !== userId)]);
  };
  const adjMutation = mtrpc.adminUser.walletAdjust.useMutation({
    onSuccess: () => {
      toast.success("调账成功");
      if (adjSelectedUser?.id) rememberRecentAdjUser(Number(adjSelectedUser.id));
      setAdjAmount("");
      setAdjNote("");
      adjUtils.adminUser.list.invalidate();
      refetchAdjHistory();
      setAdjLogPage(1);
      refetchAdjGlobal();
    },
    onError: (e: any) => toast.error(e.message || "调账失败"),
  });
  // 同步 adjSelectedUser 余额（调账后刷新）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const adjUserList = adjAllUsers as any[];
  // 先使用当前设备的成功调账记录；不足时补充全局流水里最近出现的用户。
  const adjRecentUserIds = Array.from(new Set([
    ...recentAdjUserIds,
    ...adjRecentHistoryItems.map((record: any) => Number(record.userId)).filter((id: number) => Number.isInteger(id) && id > 0),
  ]));
  const adjRecentRank = new Map(adjRecentUserIds.map((id, index) => [id, index]));
  const sortUsersByRecent = (users: any[]) => [...users].sort((a, b) => {
    const aRank = adjRecentRank.get(Number(a.id));
    const bRank = adjRecentRank.get(Number(b.id));
    if (aRank != null && bRank != null) return aRank - bRank;
    if (aRank != null) return -1;
    if (bRank != null) return 1;
    return 0;
  });
  const adjRecentUsers = adjRecentUserIds
    .map((id) => adjUserList.find((user: any) => Number(user.id) === id))
    .filter(Boolean) as any[];
  const adjMatchedUsers = adjSearch.trim().length > 0
    ? sortUsersByRecent(adjUserList.filter((u: any) => {
        const q = adjSearch.trim().toLowerCase();
        return (
          String(u.name ?? "").toLowerCase().includes(q) ||
          String(u.username ?? "").toLowerCase().includes(q) ||
          String(u.id).includes(q)
        );
      }))
    : [];
  const adjDropdownUsers = (adjSearch.trim().length > 0
    ? adjMatchedUsers
    : (adjRecentUsers.length > 0 ? adjRecentUsers : adjUserList.slice(0, 10))
  ).slice(0, 10);
  const handleAdjSubmit = () => {
    if (!adjSelectedUser) { toast.error("请先选择用户"); return; }
    const amt = parseFloat(adjAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("请输入大于 0 的金额"); return; }
    // 临时 Manus 预览复用生产 API；禁止在预览中误写真实钱包余额。
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('.manus.computer')) {
      toast.info('临时预览仅用于查看界面，确认调账不会提交到生产数据。');
      return;
    }
    const finalAmt = adjDirection === "sub" ? -amt : amt;
    // 备注允许留空；服务端会以审计默认说明补全空值。
    adjMutation.mutate({ userId: adjSelectedUser.id, currency: adjCurrency, amount: finalAmt, note: adjNote.trim() });
  };
  const persistAdjCommonNotes = (nextNotes: string[]) => {
    const normalized = nextNotes.slice(0, 8);
    setAdjCommonNotes(normalized);
    try {
      window.localStorage.setItem(commonAdjNoteStorageKey, JSON.stringify(normalized));
    } catch {
      // 本机存储不可用时仍保留当前页面会话内的常用备注。
    }
  };
  const saveCurrentAdjNoteAsCommon = () => {
    const note = adjNote.trim();
    if (!note) return;
    const alreadySaved = adjCommonNotes.includes(note);
    persistAdjCommonNotes([note, ...adjCommonNotes.filter((item) => item !== note)]);
    setAdjSelectedCommonNote(note);
    toast.success(alreadySaved ? "已置顶到常用备注" : "已加入常用备注");
  };
  const removeAdjCommonNote = (note: string) => {
    persistAdjCommonNotes(adjCommonNotes.filter((item) => item !== note));
    setAdjSelectedCommonNote(null);
    if (noteSelectedCommonNote === note) setNoteSelectedCommonNote(null);
  };
  const saveNoteContentAsCommon = () => {
    const note = noteContent.trim();
    if (!note) return;
    const alreadySaved = adjCommonNotes.includes(note);
    persistAdjCommonNotes([note, ...adjCommonNotes.filter((item) => item !== note)]);
    setNoteSelectedCommonNote(note);
    toast.success(alreadySaved ? '已置顶到常用备注' : '已加入常用备注');
  };
  const removeSelectedNoteCommon = () => {
    if (!noteSelectedCommonNote) return;
    persistAdjCommonNotes(adjCommonNotes.filter((item) => item !== noteSelectedCommonNote));
    if (adjSelectedCommonNote === noteSelectedCommonNote) setAdjSelectedCommonNote(null);
    setNoteSelectedCommonNote(null);
  };
  const saveNoteReplacement = () => {
    if (!noteTarget) return;
    // 临时 Manus 预览复用生产 API；禁止在预览中误写真实流水备注。
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('.manus.computer')) {
      toast.info('临时预览仅用于查看界面，保存不会提交到生产数据。');
      return;
    }
    updateNoteMutation.mutate({
      historyId: noteTarget.historyId,
      manualId: noteTarget.manualId,
      note: noteContent,
    });
  };
  const clearAdjUser = () => { setAdjSelectedUser(null); setAdjSearch(""); };

  // ===== Mutations =====
  const confirmMutation = trpc.recharge.adminConfirmRecharge.useMutation({
    onSuccess: (data) => {
      toast.success(`充值确认成功！用户ID ${data.userId} 已到账 ${data.amount} USDT`);
      setShowManualConfirmDialog(false);
      setSelectedOrder(null);
      setTxnHash("");
      setActualAmount("");
      ordersQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => { toast.error(err.message || "确认失败"); },
  });
  const monitorConfirmMutation = trpc.recharge.adminConfirmRecharge.useMutation({
    onSuccess: (data) => {
      toast.success(`充值确认成功！用户ID ${data.userId} 已到账 ${data.amount} USDT`);
      setShowMonitorConfirmDialog(false);
      setMonitorSelectedOrder(null);
      setMonitorTxnHash("");
      setMonitorActualAmount("");
      pendingOrdersQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => { toast.error(err.message || "确认失败"); },
  });
  const cancelMutation = trpc.recharge.adminCancelOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已取消");
      setShowCancelConfirm(false);
      setCancelTarget(null);
      ordersQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "取消失败"),
  });
  const bulkClearMutation = trpc.recharge.adminBulkClearOrders.useMutation({
    onSuccess: (res) => {
      toast.success(`已清除 ${res.count} 条记录`);
      setShowBulkClearConfirm(false);
      ordersQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "清除失败"),
  });
  const revokeMutation = trpc.recharge.adminRevokeRecharge.useMutation({
    onSuccess: () => {
      toast.success('撤回成功，余额已还原');
      setShowRevokeDialog(false);
      setRevokeTarget(null);
      ordersQuery.refetch();
      statsQuery.refetch();
      refetchAdjHistory();
      adjUtils.adminUser.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message || '撤回失败'),
  });
  const revokeManualMutation = trpc.recharge.adminRevokeManualBalance.useMutation({
    onSuccess: () => {
      toast.success('撤回成功，余额已还原');
      setShowRevokeDialog(false);
      setRevokeTarget(null);
      refetchAdjHistory();
      refetchAdjGlobal();
      adjUtils.adminUser.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message || '撤回失败'),
  });
  const revokeHistoryMutation = trpc.recharge.adminRevokeBalanceHistory.useMutation({
    onSuccess: () => {
      toast.success('撤回成功，余额已还原');
      setShowRevokeDialog(false);
      setRevokeTarget(null);
      refetchAdjHistory();
      refetchAdjGlobal();
      adjUtils.adminUser.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message || '撤回失败'),
  });
  const updateNoteMutation = trpc.recharge.adminUpdateNote.useMutation({
    onSuccess: () => {
      toast.success('备注已更新');
      setShowNoteDialog(false);
      setNoteTarget(null);
      setNoteContent('');
      refetchAdjHistory();
      refetchAdjGlobal();
    },
    onError: (e: any) => toast.error(e.message || '更新失败'),
  });
  const fixScannerMutation = trpc.recharge.adminFixScanner.useMutation();
  const triggerScanMutation = trpc.recharge.adminTriggerScan.useMutation();
  const diagnoseMutation = trpc.recharge.adminDiagnose.useMutation();

    // ===== 工具函数 =====
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const getExplorerUrl = (network: string, hash: string) => {
    if (!hash) return null;
    switch (network) {
      case 'TRC20': return `https://tronscan.org/#/transaction/${hash}`;
      case 'ERC20': return `https://etherscan.io/tx/${hash}`;
      case 'BEP20': return `https://bscscan.com/tx/${hash}`;
      case 'APTOS': return `https://explorer.aptoslabs.com/txn/${hash}?network=mainnet`;
      case 'SOLANA': return `https://solscan.io/tx/${hash}`;
      default: return null;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (seconds < 60) return `${seconds}秒前`;
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return formatDate(dateStr);
  };

  // 扫描器状态
  const getScannerStatus = () => {
    const heartbeat = heartbeatQuery.data;
    if (!heartbeat) return { status: 'unknown', text: '未知', color: 'bg-gray-100 text-gray-800' };
    const lastScanTime = new Date(heartbeat.lastScanAt).getTime();
    const now = Date.now();
    const diffMinutes = (now - lastScanTime) / 1000 / 60;
    if (diffMinutes < 2) return { status: 'running', text: '✅ 正常运行', color: 'bg-green-100 text-green-800' };
    if (diffMinutes < 5) return { status: 'warning', text: '⚠️ 响应迟缓', color: 'bg-yellow-100 text-yellow-800' };
    return { status: 'stopped', text: '❌ 已停止', color: 'bg-red-100 text-red-800' };
  };

  // 监控Tab刷新
  const handleMonitorRefresh = () => {
    statsQuery.refetch();
    heartbeatQuery.refetch();
    pendingOrdersQuery.refetch();
    unmatchedQuery.refetch();
  };

  // 一键修复扫描器
  const handleFixScanner = async () => {
    try {
      toast.loading('正在修复扫描器...');
      const result = await fixScannerMutation.mutateAsync();
      setFixLogs(result.logs);
      setShowFixLogs(true);
      if (result.success) {
        toast.success('修复成功！');
        setTimeout(() => handleMonitorRefresh(), 2000);
      } else {
        toast.error('修复失败，请查看详细日志');
      }
    } catch (error) {
      toast.error('修复失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 诊断扫描器
  const handleDiagnose = async () => {
    try {
      toast.loading('正在诊断...');
      const result = await diagnoseMutation.mutateAsync();
      setDiagLogs(result.logs);
      setShowDiagLogs(true);
      if (result.success) {
        toast.success('诊断完成');
      } else {
        toast.error('诊断发现问题');
      }
    } catch (error) {
      toast.error('诊断失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 手动触发扫描
  const handleTriggerScan = async () => {
    try {
      toast.loading('正在扫描区块链...');
      const result = await triggerScanMutation.mutateAsync();
      if (result.success) {
        toast.success('扫描完成！');
        setTimeout(() => handleMonitorRefresh(), 1000);
      } else {
        toast.error('扫描失败: ' + result.message);
      }
    } catch (error) {
      toast.error('扫描失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 手动确认充值（充值记录Tab）
  const handleConfirm = () => {
    if (!selectedOrder) return;
    if (!actualAmount || parseFloat(actualAmount) <= 0) {
      toast.error("请输入实际到账金额");
      return;
    }
    confirmMutation.mutate({
      orderId: selectedOrder.id,
      txnHash: txnHash.trim(),
      actualAmount: parseFloat(actualAmount),
    });
  };

  // 手动确认充值（监控Tab）
  const handleMonitorConfirm = () => {
    if (!monitorSelectedOrder) return;
    if (!monitorActualAmount || parseFloat(monitorActualAmount) <= 0) {
      toast.error("请输入实际到账金额");
      return;
    }
    monitorConfirmMutation.mutate({
      orderId: monitorSelectedOrder.id,
      txnHash: monitorTxnHash.trim(),
      actualAmount: parseFloat(monitorActualAmount),
    });
  };

  // 打开监控Tab的手动确认弹窗
  const openMonitorConfirm = (order: any) => {
    setMonitorSelectedOrder(order);
    if (order) {
      setMonitorActualAmount(order.amount);
    } else {
      setMonitorActualAmount("");
    }
    setMonitorTxnHash("");
    setShowMonitorConfirmDialog(true);
  };

  // 充值记录数据
  const orders = ordersQuery.data || [];
  const filteredOrders = filterStatus === "all"
    ? orders
    : orders.filter((o: any) => o.status === filterStatus);
  const statusCounts = orders.reduce((acc: any, order: any) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待支付', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    submitted: { label: '确认中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
    completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    expired: { label: '已过期', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: XCircle },
    cancelled: { label: '已取消', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
    revoked: { label: '已撤回', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: XCircle },
  };

  const stats = statsQuery.data;
  const pendingOrders = pendingOrdersQuery.data || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">充值管理</h1>
          <div className="w-10" />
        </div>
        {/* 主 Tab 切换 */}
        <div className="flex border-b border-gray-100">
          {[
            { key: "adjust", label: "手动调账" },
            { key: "records", label: "记录" },
            { key: "monitor", label: "监控" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key as any)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mainTab === tab.key
                  ? "text-red-600 border-b-2 border-red-600"
                  : "text-gray-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 充值记录 Tab ===== */}
      {mainTab === "records" && (
        <div className="p-4 space-y-3">

          {/* 状态筛选 Tab */}
          <div className="bg-white rounded-xl p-3 shadow-sm">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === "all"
                    ? "bg-[#D32F2F] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                全部 ({orders.length})
              </button>
              {Object.entries(statusConfig).map(([status, config]) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterStatus === status
                      ? "bg-[#D32F2F] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {config.label} ({statusCounts[status] || 0})
                </button>
              ))}
            </div>
          </div>

          {/* 一键清除按钮（已过期/已取消时显示） */}
          {(filterStatus === 'expired' || filterStatus === 'cancelled') && filteredOrders.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowBulkClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                一键清除 ({filteredOrders.length} 条)
              </button>
            </div>
          )}

          {/* 订单列表 */}
          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            {ordersQuery.isLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">加载中...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm">暂无订单</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredOrders.map((order: any) => {
                  const config = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const hash = order.txnHash || order.txn_hash;
                  const explorerUrl = getExplorerUrl(order.network, hash);
                  return (
                    <div key={order.id} className={`relative px-4 py-3.5 border-l-4 transition-colors ${
                      order.status === 'completed' ? 'border-l-green-400' :
                      order.status === 'submitted' ? 'border-l-blue-400' :
                      order.status === 'pending' ? 'border-l-orange-400' :
                      'border-l-gray-200'
                    }`}>
                      {/* 第一行：金额 + 状态 + 网络 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-gray-900 tracking-tight">
                            {Number(order.amount).toFixed(2)} <span className="text-xs font-medium text-gray-500">USDT</span>
                          </span>
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{order.network}</span>
                      </div>
                      {/* 第二行：用户信息 */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {order.realName || order.userName || order.username || `用户${order.user_id || order.userId}`}
                            </span>
                            {order.username && (order.realName || order.userName) && (
                              <span className="text-xs text-gray-400">@{order.username}</span>
                            )}
                            <span className="text-xs text-gray-400">#{order.user_id || order.userId}</span>
                          </div>
                          {order.phone && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{order.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 第三行：详细信息网格 */}
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5 text-xs mb-2.5">
                        {/* 收款地址 */}
                        {(order.walletAddress || order.wallet_address) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">收款地址</span>
                            <button
                              className="font-mono text-gray-700 hover:text-blue-600 flex items-center gap-1 min-w-0"
                              onClick={() => {
                                const addr = order.walletAddress || order.wallet_address;
                                navigator.clipboard.writeText(addr).then(() => toast.success('地址已复制'));
                              }}
                            >
                              <span className="truncate">
                                {(() => {
                                  const addr = order.walletAddress || order.wallet_address;
                                  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
                                })()}
                              </span>
                              <Copy className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            </button>
                          </div>
                        )}
                        {/* 到期时间（pending状态显示） */}
                        {order.status === 'pending' && (order.expiresAt || order.expires_at) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">到期时间</span>
                            <span className={`flex items-center gap-1 font-medium ${
                              new Date(order.expiresAt || order.expires_at).getTime() - Date.now() < 10 * 60 * 1000
                                ? 'text-red-500' : 'text-orange-500'
                            }`}>
                              <Timer className="w-3 h-3" />
                              {formatDate(order.expiresAt || order.expires_at)}
                            </span>
                          </div>
                        )}
                        {/* 创建时间 */}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 w-16 flex-shrink-0">创建时间</span>
                          <span className="text-gray-600">{formatDate(order.createdAt || order.created_at)}</span>
                        </div>
                        {/* 完成时间 */}
                        {(order.completedAt || order.completed_at) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">完成时间</span>
                            <span className="text-gray-600">{formatDate(order.completedAt || order.completed_at)}</span>
                          </div>
                        )}
                        {/* 交易哈希 */}
                        {hash && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">交易哈希</span>
                            {explorerUrl ? (
                              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                                className="font-mono text-blue-600 hover:underline flex items-center gap-1">
                                {hash.slice(0, 6)}…{hash.slice(-6)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="font-mono text-gray-600">{hash.slice(0, 6)}…{hash.slice(-6)}</span>
                            )}
                          </div>
                        )}
                        {/* 订单号 */}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 w-16 flex-shrink-0">订单号</span>
                          <span className="font-mono text-gray-500 text-[10px]">{order.orderNo || order.order_no}</span>
                        </div>
                      </div>
                      {/* 操作按钮 */}
                      {(order.status === 'pending' || order.status === 'submitted') && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setActualAmount(order.amount);
                              setTxnHash("");
                              setShowManualConfirmDialog(true);
                            }}
                            className="flex-1 py-2 text-xs font-medium text-[#D32F2F] border border-[#D32F2F] rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all"
                          >
                            手动确认到账
                          </button>
                          <button
                            onClick={() => { setCancelTarget(order); setShowCancelConfirm(true); }}
                            className="flex items-center justify-center gap-1 px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            取消
                          </button>
                        </div>
                      )}
                      {order.status === 'completed' && (
                        <button
                          onClick={() => {
                            setRevokeTarget({ type: 'order', orderId: order.id, amount: Number(order.actual_amount ?? order.amount) });
                            setShowRevokeDialog(true);
                          }}
                          className="w-full py-2 text-xs font-medium text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-50 active:scale-[0.98] transition-all"
                        >
                          撤回此笔充值
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 充值监控 Tab ===== */}
      {mainTab === "monitor" && (
        <div className="p-4 space-y-4">

          {/* 扫描器状态 */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-[#D32F2F]" />
                扫描器状态
              </h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScannerStatus().color}`}>
                {getScannerStatus().text}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              {heartbeatQuery.data && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">最后扫描</span>
                    <span className="font-medium">{formatRelativeTime(heartbeatQuery.data.lastScanAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-gray-100">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">扫描次数</div>
                      <div className="text-lg font-semibold text-gray-900">{heartbeatQuery.data.scanCount}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">成功率</div>
                      <div className="text-lg font-semibold text-green-600">
                        {(heartbeatQuery.data.scanCount ?? 0) > 0
                          ? Math.round((heartbeatQuery.data.successCount! / (heartbeatQuery.data.scanCount ?? 1)) * 100)
                          : 0}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">已匹配</span>
                      <span className="font-medium text-green-600">{stats?.matchedOrdersCount ?? heartbeatQuery.data.matchedOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">未匹配</span>
                      <span className="font-medium text-orange-600">{stats?.unmatchedCount ?? heartbeatQuery.data.unmatchedTransactions}</span>
                    </div>
                  </div>
                  {heartbeatQuery.data.lastError && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                      <div className="font-medium">最后错误：</div>
                      <div className="mt-1">{heartbeatQuery.data.lastError}</div>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-600">启用地址数</span>
                <span className="font-medium">{stats?.walletAddresses?.length || 0} 个</span>
              </div>
              {stats?.walletAddresses && stats.walletAddresses.length > 0 && (
                <div className="space-y-1">
                  {stats.walletAddresses.map((wa: any) => (
                    <div key={wa.id} className="flex justify-between items-center">
                      <span className="text-gray-500 text-xs">{wa.label || wa.network}</span>
                      <span className="font-mono text-xs">{wa.address.slice(0, 8)}...{wa.address.slice(-6)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 mt-2">
                <button
                  onClick={handleTriggerScan}
                  disabled={triggerScanMutation.isPending}
                  className="w-full py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {triggerScanMutation.isPending ? '正在扫描...' : '手动扫描一次'}
                </button>
                {(getScannerStatus().status === 'unknown' || getScannerStatus().status === 'stopped') && (
                  <button
                    onClick={handleFixScanner}
                    disabled={fixScannerMutation.isPending}
                    className="w-full py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Wrench className="w-4 h-4" />
                    {fixScannerMutation.isPending ? '正在修复...' : '一键修复扫描器'}
                  </button>
                )}
                <button
                  onClick={handleDiagnose}
                  disabled={diagnoseMutation.isPending}
                  className="w-full py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  {diagnoseMutation.isPending ? '正在诊断...' : '诊断扫描器（查看API数据）'}
                </button>
                <button
                  onClick={() => setLocation('/admin/wallet-addresses')}
                  className="w-full py-2 text-sm text-[#D32F2F] border border-[#D32F2F] rounded-lg hover:bg-red-50 transition-colors"
                >
                  管理收款地址
                </button>
              </div>
            </div>
          </div>

          {/* 今日统计 */}
          <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-xl p-5 text-white shadow-sm">
            <div className="flex items-center mb-2">
              <TrendingUp className="w-5 h-5 mr-2" />
              <span className="text-sm opacity-90">今日充值统计</span>
            </div>
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-3xl font-bold">{stats?.todayTotalAmount?.toFixed(2) || '0.00'}</div>
                <div className="text-sm opacity-90">USDT</div>
              </div>
              <div className="text-lg opacity-90">{stats?.todayCount || 0} 笔</div>
            </div>
          </div>

          {/* 订单状态统计 */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">订单状态统计</h2>
            <div className="grid grid-cols-2 gap-3">
              {stats?.orderStats?.map((stat: any) => {
                const config = statusConfig[stat.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <div key={stat.status} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{config.label}</span>
                      <StatusIcon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="text-xl font-bold text-gray-900">{stat.count}</div>
                    <div className="text-xs text-gray-500">{stat.totalAmount.toFixed(2)} USDT</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 未匹配交易警告 */}
          {stats && stats.unmatchedCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-yellow-900">{stats.unmatchedCount} 笔交易未匹配</div>
                  <div className="text-sm text-yellow-700 mt-1">
                    总金额: {stats.unmatchedTotalAmount.toFixed(2)} USDT，需要手动处理
                  </div>
                  <button
                    onClick={() => setLocation("/admin/recharge/unmatched")}
                    className="mt-2 text-sm text-yellow-800 underline"
                  >
                    查看详情 →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 待处理订单列表（含手动确认按钮） */}
          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">待处理订单</h2>
              <span className="text-xs text-gray-500">{pendingOrders.length} 笔</span>
            </div>
            {pendingOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">暂无待处理订单</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {pendingOrders.map((order: any) => {
                  const config = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const hash = order.txnHash || order.txn_hash;
                  const explorerUrl = getExplorerUrl(order.network, hash);
                  return (
                    <div key={order.id} className={`relative px-4 py-3.5 border-l-4 transition-colors ${
                      order.status === 'submitted' ? 'border-l-blue-400' : 'border-l-orange-400'
                    }`}>
                      {/* 第一行：金额 + 状态 + 网络 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-gray-900 tracking-tight">
                            {Number(order.amount).toFixed(2)} <span className="text-xs font-medium text-gray-500">USDT</span>
                          </span>
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{order.network}</span>
                      </div>
                      {/* 第二行：用户信息 */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {order.realName || order.userName || order.username || `用户${order.user_id || order.userId}`}
                            </span>
                            {order.username && (order.realName || order.userName) && (
                              <span className="text-xs text-gray-400">@{order.username}</span>
                            )}
                            <span className="text-xs text-gray-400">#{order.user_id || order.userId}</span>
                          </div>
                          {order.phone && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{order.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 第三行：详细信息 */}
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5 text-xs mb-2.5">
                        {/* 收款地址 */}
                        {(order.walletAddress || order.wallet_address) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">收款地址</span>
                            <button
                              className="font-mono text-gray-700 hover:text-blue-600 flex items-center gap-1"
                              onClick={() => {
                                const addr = order.walletAddress || order.wallet_address;
                                navigator.clipboard.writeText(addr).then(() => toast.success('地址已复制'));
                              }}
                            >
                              {(() => {
                                const addr = order.walletAddress || order.wallet_address;
                                return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
                              })()}
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        )}
                        {/* 到期时间 */}
                        {(order.expiresAt || order.expires_at) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">到期时间</span>
                            <span className={`flex items-center gap-1 font-medium ${
                              new Date(order.expiresAt || order.expires_at).getTime() - Date.now() < 10 * 60 * 1000
                                ? 'text-red-500' : 'text-orange-500'
                            }`}>
                              <Timer className="w-3 h-3" />
                              {formatDate(order.expiresAt || order.expires_at)}
                            </span>
                          </div>
                        )}
                        {/* 创建时间 */}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 w-16 flex-shrink-0">创建时间</span>
                          <span className="text-gray-600">{formatDate(order.createdAt || order.created_at)}</span>
                        </div>
                        {/* 交易哈希 */}
                        {hash && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 w-16 flex-shrink-0">交易哈希</span>
                            {explorerUrl ? (
                              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                                className="font-mono text-blue-600 hover:underline flex items-center gap-1">
                                {hash.slice(0, 6)}…{hash.slice(-6)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="font-mono text-gray-600">{hash.slice(0, 6)}…{hash.slice(-6)}</span>
                            )}
                          </div>
                        )}
                        {/* 订单号 */}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 w-16 flex-shrink-0">订单号</span>
                          <span className="font-mono text-gray-500 text-[10px]">{order.orderNo || order.order_no}</span>
                        </div>
                      </div>
                      {/* 手动确认按钮 */}
                      <button
                        onClick={() => openMonitorConfirm(order)}
                        className="w-full py-2 text-xs font-medium text-[#D32F2F] border border-[#D32F2F] rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        手动确认此订单
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 未匹配交易入口 */}
          <button
            onClick={() => setLocation("/admin/recharge/unmatched")}
            className="w-full bg-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm"
          >
            <span className="text-sm font-medium text-gray-700">查看未匹配交易</span>
            <span className="text-xs text-gray-400">→</span>
          </button>
        </div>
      )}
      {/* ===== 手动调账 Tab ===== */}
      {mainTab === "adjust" && (
        <div className="px-4 py-4 space-y-4">
          {/* 用户选择与调账参数合并为同一张紧凑表单卡。 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-black">手动调账</p>
              <span className="text-[10px] text-gray-400">选择用户后填写金额</span>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1">调账用户</p>
            {adjSelectedUser ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-black">{adjSelectedUser.name || adjSelectedUser.username}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">ID: {adjSelectedUser.id} · @{adjSelectedUser.username}</p>
                  </div>
                  <button onClick={clearAdjUser} className="text-[11px] text-orange-500 font-semibold px-2 py-1 rounded-lg bg-orange-100 active:bg-orange-200">
                    更换
                  </button>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <div className="flex-1 bg-white rounded-lg px-2.5 py-1.5 border border-orange-100">
                    <p className="text-[10px] text-gray-400 mb-0.5">USDT 余额</p>
                    <p className="text-[15px] font-bold text-orange-500">{Number(adjSelectedUser.usdtBalance ?? 0).toFixed(4)}</p>
                  </div>
                  <div className="flex-1 bg-white rounded-lg px-2.5 py-1.5 border border-orange-100">
                    <p className="text-[10px] text-gray-400 mb-0.5">CNY 余额</p>
                    <p className="text-[15px] font-bold text-green-600">¥{Number(adjSelectedUser.cnyBalance ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-orange-400">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={adjSearch}
                    onChange={(e) => { setAdjSearch(e.target.value); setAdjShowDropdown(true); }}
                    onFocus={() => setAdjShowDropdown(true)}
                    onClick={() => setAdjShowDropdown(true)}
                    onBlur={() => setTimeout(() => setAdjShowDropdown(false), 150)}
                    placeholder="点击查看最近用户，或搜索昵称 / 用户 / ID"
                    className="flex-1 text-[13px] bg-transparent focus:outline-none"
                  />
                  {adjSearch && (
                    <button onClick={() => setAdjSearch("")} className="p-0.5">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
                {adjShowDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-[11px] font-medium text-gray-500">
                        {adjSearch.trim() ? '匹配用户' : (adjRecentUsers.length > 0 ? '最近调账用户' : '用户列表')}
                      </p>
                      <span className="text-[10px] text-gray-400">最多显示 10 位</span>
                    </div>
                    {adjDropdownUsers.length === 0 ? (
                      <p className="text-center text-[12px] text-gray-400 py-6">
                        {adjSearch.trim() ? '未找到匹配用户' : '暂无可选用户'}
                      </p>
                    ) : (
                      adjDropdownUsers.map((u: any) => (
                        <button
                          key={u.id}
                          onMouseDown={() => { setAdjSelectedUser(u); setAdjFlowTab("user"); setAdjSearch(""); setAdjShowDropdown(false); }}
                          className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-orange-50 active:bg-orange-100 border-b border-gray-50 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-black">
                              <span className="text-gray-400 font-normal">昵称：</span>{u.name || '未设置昵称'}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-gray-500">
                              <span className="text-gray-400">用户：</span>{u.username ? `@${u.username}` : `用户${u.id}`} <span className="text-gray-300">· ID {u.id}</span>
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-[11px] text-orange-500 font-medium">USDT {Number(u.usdtBalance ?? 0).toFixed(2)}</p>
                            <p className="text-[10px] text-gray-400">CNY ¥{Number(u.cnyBalance ?? 0).toFixed(2)}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
            {/* 货币与调账方向：手机端并列为一行，缩短表单高度。 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 mb-1">货币</p>
                <div className="flex h-9 rounded-xl overflow-hidden border border-gray-200">
                  <button onClick={() => setAdjCurrency("USDT")}
                    className={`flex-1 min-w-0 text-[12px] font-medium transition-colors ${adjCurrency === "USDT" ? "bg-orange-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    USDT
                  </button>
                  <button onClick={() => setAdjCurrency("CNY")}
                    className={`flex-1 min-w-0 text-[12px] font-medium transition-colors ${adjCurrency === "CNY" ? "bg-green-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    CNY
                  </button>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 mb-1">方向</p>
                <div className="flex h-9 rounded-xl overflow-hidden border border-gray-200">
                  <button onClick={() => setAdjDirection("add")}
                    className={`flex-1 min-w-0 text-[12px] font-medium transition-colors ${adjDirection === "add" ? "bg-green-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    + 增加
                  </button>
                  <button onClick={() => setAdjDirection("sub")}
                    className={`flex-1 min-w-0 text-[12px] font-medium transition-colors ${adjDirection === "sub" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    − 扣款
                  </button>
                </div>
              </div>
            </div>
            {/* 金额 */}
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">金额（{adjCurrency}）</p>
              <input
                type="number"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="请输入正数金额"
                min="0"
                className="w-full text-[16px] font-semibold px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-orange-400"
              />
            </div>
            {/* 备注 */}
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">备注（选填）</p>
              <div className="relative">
                <input
                  type="text"
                  value={adjNote}
                  onChange={(e) => {
                    setAdjNote(e.target.value);
                    if (e.target.value !== adjSelectedCommonNote) setAdjSelectedCommonNote(null);
                  }}
                  placeholder="如：充值确认、手动退款等（可不填）"
                  className="w-full text-[13px] px-3 py-2.5 pr-[4.5rem] rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-orange-400"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={saveCurrentAdjNoteAsCommon}
                    disabled={!adjNote.trim()}
                    title="将当前备注加入常用"
                    aria-label="将当前备注加入常用备注"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-orange-500 hover:bg-orange-100 active:bg-orange-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => adjSelectedCommonNote && removeAdjCommonNote(adjSelectedCommonNote)}
                    disabled={!adjSelectedCommonNote}
                    title={adjSelectedCommonNote ? `移除常用备注：${adjSelectedCommonNote}` : "请先选择一个常用备注"}
                    aria-label={adjSelectedCommonNote ? `移除常用备注：${adjSelectedCommonNote}` : "请先选择一个常用备注"}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-orange-500 hover:bg-orange-100 active:bg-orange-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {adjCommonNotes.length > 0 && (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span className="pt-1 text-[10px] text-gray-400 shrink-0">常用</span>
                  <div className="flex flex-wrap gap-1">
                    {adjCommonNotes.map((note) => (
                      <button
                        key={note}
                        type="button"
                        onClick={() => {
                          setAdjNote(note);
                          setAdjSelectedCommonNote(note);
                        }}
                        title="填入并选中此备注"
                        className={`max-w-[180px] truncate rounded-md border px-1.5 py-0.5 text-[10px] leading-4 transition-colors ${
                          adjSelectedCommonNote === note
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-orange-100 bg-orange-50 text-orange-700 hover:bg-orange-100"
                        }`}
                      >
                        {note}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleAdjSubmit}
              disabled={adjMutation.isPending || !adjSelectedUser}
              className="w-full py-3 rounded-2xl text-[14px] font-bold text-white disabled:opacity-40 transition-opacity"
              style={{ background: "#FF6900" }}
            >
              {adjMutation.isPending ? "处理中..." : `确认${adjDirection === "add" ? "充值" : "扣款"} ${adjCurrency}`}
            </button>
          </div>

          {/* 钱包流水左右 Tab */}
          <div className="flex p-1 bg-gray-100 rounded-2xl">
            <button
              onClick={() => setAdjFlowTab("user")}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${adjFlowTab === "user" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500"}`}
            >当前用户流水</button>
            <button
              onClick={() => setAdjFlowTab("global")}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${adjFlowTab === "global" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500"}`}
            >全局流水</button>
          </div>

          {/* 当前用户全局钱包明细：与用户自己进入钱包时使用同一接口和口径 */}
          {adjFlowTab === "user" && (adjSelectedUser ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-bold text-black">{adjSelectedUser.name || adjSelectedUser.username} 的全部钱包流水</p>
                <span className="text-[11px] text-gray-400">
                  {adjFilteredHistory.length === adjHistory.length ? `共 ${adjHistory.length} 条` : `${adjFilteredHistory.length} / ${adjHistory.length} 条`}
                </span>
              </div>
              <LedgerFlowFilters
                keyword={adjUserFlowKeyword}
                datePreset={adjUserFlowDatePreset}
                customStart={adjUserFlowCustomStart}
                customEnd={adjUserFlowCustomEnd}
                onKeywordChange={setAdjUserFlowKeyword}
                onDatePresetChange={setAdjUserFlowDatePreset}
                onCustomStartChange={setAdjUserFlowCustomStart}
                onCustomEndChange={setAdjUserFlowCustomEnd}
                onClear={() => {
                  setAdjUserFlowKeyword("");
                  setAdjUserFlowDatePreset("all");
                  setAdjUserFlowCustomStart("");
                  setAdjUserFlowCustomEnd("");
                }}
              />
              {adjHistoryQuery.isLoading ? (
                <p className="text-center text-[12px] text-gray-300 py-6">明细加载中...</p>
              ) : adjFilteredHistory.length === 0 ? (
                <p className="text-center text-[12px] text-gray-300 py-6">
                  {adjHistory.length === 0 ? '暂无钱包流水' : '未找到符合条件的流水'}
                </p>
              ) : (
                <div className="space-y-2">
                  {adjFilteredHistory.map((r: any, i: number) => {
                    const typeLabel: Record<string, string> = { recharge: '充值到账', consume: '消费', refund: '退款', reward: '奖励', withdraw: '提现', reward_clawback: '奖励回收', commission: '佣金' };
                    const sourceType = String(r.sourceType ?? '');
                    const sourceId = Number(String(r.id ?? '').split('_')[1] || 0);
                    const amount = Number(r.amount ?? 0);
                    const noteText = String(r.note ?? r.description ?? '').replace(/\[.*?\]/g, '').trim();
                    const label = sourceType === 'recharge'
                      ? '充值到账'
                      : sourceType === 'manual'
                        ? '手动调账'
                        : sourceType === 'opening'
                          ? '历史期初余额'
                          : typeLabel[r.type] ?? r.type ?? '系统流水';
                    const historyId = sourceType === 'recharge' ? Number(r.historyId || 0) : sourceType === 'balance_history' ? sourceId : 0;
                    const canRevoke = sourceId > 0 && sourceType !== 'opening' && !noteText.includes('撤回误操作');
                    const canEdit = sourceType === 'manual' ? sourceId > 0 : historyId > 0;
                    return (
                      <div key={r.id ?? i} className="py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">USDT</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{label}</span>
                            </div>
                            <p className="text-[12px] text-gray-600 truncate">{noteText || '—'}</p>
                            <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</p>
                            {r.balanceAfter != null && (
                              <p className="text-[10px] text-gray-400 mt-0.5">余额 {Number(r.balanceAfter).toFixed(2)} USDT</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                            <p className={`text-[14px] font-bold ${amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {amount >= 0 ? '+' : ''}{amount.toFixed(4)}
                            </p>
                            {canRevoke && (
                              <button
                                onClick={() => {
                                  if (sourceType === 'recharge') {
                                    setRevokeTarget({ type: 'order', orderId: sourceId, amount: Math.abs(amount) });
                                  } else if (sourceType === 'manual') {
                                    setRevokeTarget({ type: 'manual', manualId: sourceId, amount: Math.abs(amount), currency: 'USDT' });
                                  } else {
                                    setRevokeTarget({ type: 'history', historyId: sourceId, amount: Math.abs(amount), currency: 'USDT' });
                                  }
                                  setShowRevokeDialog(true);
                                }}
                                className="text-[10px] text-purple-500 border border-purple-200 px-2 py-0.5 rounded-full hover:bg-purple-50"
                              >撤回</button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setNoteTarget(sourceType === 'manual'
                                    ? { manualId: sourceId, currentNote: noteText }
                                    : { historyId, currentNote: noteText });
                                  setNoteContent(noteText);
                                  setNoteSelectedCommonNote(adjCommonNotes.includes(noteText) ? noteText : null);
                                  setShowNoteDialog(true);
                                }}
                                className="text-[10px] text-blue-500 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-50"
                              >编辑备注</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
              <p className="text-[13px] text-gray-500">请先在上方选择用户</p>
              <p className="text-[11px] text-gray-300 mt-1">选择后显示该用户的全部钱包流水</p>
            </div>
          ))}

          {/* 全局流水 */}
          {adjFlowTab === "global" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold text-black">全局流水日志</p>
              <span className="text-[11px] text-gray-400">共 {adjLogTotal} 条</span>
            </div>
            <LedgerFlowFilters
              keyword={adjGlobalFlowKeyword}
              datePreset={adjGlobalFlowDatePreset}
              customStart={adjGlobalFlowCustomStart}
              customEnd={adjGlobalFlowCustomEnd}
              onKeywordChange={(value) => { setAdjGlobalFlowKeyword(value); setAdjLogPage(1); }}
              onDatePresetChange={(preset) => { setAdjGlobalFlowDatePreset(preset); setAdjLogPage(1); }}
              onCustomStartChange={(value) => { setAdjGlobalFlowCustomStart(value); setAdjLogPage(1); }}
              onCustomEndChange={(value) => { setAdjGlobalFlowCustomEnd(value); setAdjLogPage(1); }}
              onClear={() => {
                setAdjGlobalFlowKeyword("");
                setAdjGlobalFlowDatePreset("all");
                setAdjGlobalFlowCustomStart("");
                setAdjGlobalFlowCustomEnd("");
                setAdjLogPage(1);
              }}
            />
            {adjLogItems.length === 0 ? (
              <p className="text-center text-[12px] text-gray-300 py-6">
                {adjGlobalFlowKeyword.trim() || adjGlobalFlowDatePreset !== 'all' ? '未找到符合条件的流水' : '暂无调账记录'}
              </p>
            ) : (
              <div className="space-y-2">
                {adjLogItems.map((r: any, i: number) => {
                  const typeLabel: Record<string, string> = { recharge: '充值', consume: '消费', refund: '退款', reward: '奖励', withdraw: '扣款', reward_clawback: '奖励回收', commission: '佣金' };
                  return (
                    <div key={r.id ?? i} className="py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span className="text-[12px] font-semibold text-black">{r.userName}</span>
                            <span className="text-[10px] text-gray-400">@{r.username}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${r.currency === 'CNY' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{r.currency}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{typeLabel[r.type] ?? r.type}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">{String(r.note ?? "").replace(/\[.*?\]/g, "").trim() || "—"}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{new Date(r.createdAt).toLocaleString("zh-CN")}</p>
                          {r.balance != null && (
                            <p className="mt-0.5 text-[10px] text-gray-400">
                              调后余额 {r.currency === "CNY" ? "¥" : ""}{Number(r.balance).toFixed(r.currency === "CNY" ? 2 : 4)} {r.currency === "CNY" ? "CNY" : "USDT"}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                          <p className={`text-[14px] font-bold ${Number(r.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {Number(r.amount) >= 0 ? "+" : ""}{r.currency === "CNY" ? "¥" : ""}{Number(r.amount).toFixed(r.currency === "CNY" ? 2 : 4)}
                          </p>
                          {!String(r.note ?? '').includes('撤回误操作') && (
                            <button
                              onClick={() => { setRevokeTarget({ type: 'history', historyId: r.id, amount: Math.abs(Number(r.amount)), currency: r.currency }); setShowRevokeDialog(true); }}
                              className="text-[10px] text-purple-500 border border-purple-200 px-2 py-0.5 rounded-full hover:bg-purple-50"
                            >撤回</button>
                          )}
                          <button
                            onClick={() => {
                              const raw = String(r.note ?? '').replace(/\[.*?\]/g, '').trim();
                              setNoteTarget({ historyId: r.id, currentNote: raw });
                              setNoteContent(raw);
                              setNoteSelectedCommonNote(adjCommonNotes.includes(raw) ? raw : null);
                              setShowNoteDialog(true);
                            }}
                            className="text-[10px] text-blue-500 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-50"
                          >编辑备注</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {adjLogTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setAdjLogPage(p => Math.max(1, p - 1))}
                  disabled={adjLogPage <= 1}
                  className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30"
                >
                  <PrevIcon className="w-3.5 h-3.5" />上一页
                </button>
                <span className="text-[12px] text-gray-400">{adjLogPage} / {adjLogTotalPages}</span>
                <button
                  onClick={() => setAdjLogPage(p => Math.min(adjLogTotalPages, p + 1))}
                  disabled={adjLogPage >= adjLogTotalPages}
                  className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30"
                >
                  下一页<NextIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      )}
            {/* ===== 手动确认充值弹窗（充值记录Tab） ===== */}
      <Dialog open={showManualConfirmDialog} onOpenChange={(open) => {
        setShowManualConfirmDialog(open);
        if (!open) { setSelectedOrder(null); setTxnHash(""); setActualAmount(""); }
      }}>
        <DialogContent className="mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogTitle>手动确认充值</DialogTitle>
          <div className="space-y-4">
            {/* 待确认订单列表 */}
            <div>
              <p className="text-xs text-gray-500 mb-2">选择需要确认的订单（待支付/确认中）：</p>
              <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {orders.filter((o: any) => o.status === 'pending' || o.status === 'submitted').length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">暂无待确认订单</div>
                ) : (
                  <div className="divide-y">
                    {orders.filter((o: any) => o.status === 'pending' || o.status === 'submitted').map((order: any) => {
                      const isSelected = selectedOrder?.id === order.id;
                      const config = statusConfig[order.status] || statusConfig.pending;
                      return (
                        <div
                          key={order.id}
                          onClick={() => { setSelectedOrder(order); setActualAmount(order.amount); setTxnHash(""); }}
                          className={`px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-red-50 border-l-4 border-[#D32F2F]' : 'hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{order.amount} USDT</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>{config.label}</span>
                            </div>
                            <span className="text-xs text-gray-400">{order.network}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {order.realName && <span className="mr-1">{order.realName}</span>}
                            {order.userName && !order.realName && <span className="mr-1">{order.userName}</span>}
                            {order.username && <span className="text-gray-400 mr-1">@{order.username}</span>}
                            <span className="text-gray-400">ID:{order.user_id || order.userId}</span>
                          </div>
                          <div className="text-xs text-gray-400">{formatDate(order.createdAt || order.created_at)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 确认表单 */}
            {selectedOrder && (
              <div className="space-y-3 border-t pt-3">
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">订单金额</span>
                    <span className="font-medium">{selectedOrder.amount} USDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">网络</span>
                    <span className="font-medium">{selectedOrder.network}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易哈希 <span className="text-gray-400 text-xs font-normal">（选填）</span>
                  </label>
                  <input
                    type="text"
                    value={txnHash}
                    onChange={(e) => setTxnHash(e.target.value)}
                    placeholder="粘贴区块链交易哈希"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    实际到账金额 (USDT) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    placeholder="输入实际到账金额"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={confirmMutation.isPending}
                  className="w-full py-3 bg-[#D32F2F] text-white rounded-xl font-medium hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmMutation.isPending ? "处理中..." : "确认充值"}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 手动确认充值弹窗（监控Tab） ===== */}
      <Dialog open={showMonitorConfirmDialog} onOpenChange={(open) => {
        setShowMonitorConfirmDialog(open);
        if (!open) { setMonitorSelectedOrder(null); setMonitorTxnHash(""); setMonitorActualAmount(""); }
      }}>
        <DialogContent className="mx-4 rounded-2xl">
          <DialogTitle>手动确认充值</DialogTitle>
          <div className="space-y-4">
            {monitorSelectedOrder ? (
              <>
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">订单金额</span>
                    <span className="font-medium">{monitorSelectedOrder.amount} USDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">网络</span>
                    <span className="font-medium">{monitorSelectedOrder.network}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">用户</span>
                    <span className="font-medium">
                      {monitorSelectedOrder.realName || monitorSelectedOrder.userName || `ID:${monitorSelectedOrder.user_id || monitorSelectedOrder.userId}`}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易哈希 <span className="text-gray-400 text-xs font-normal">（选填）</span>
                  </label>
                  <input
                    type="text"
                    value={monitorTxnHash}
                    onChange={(e) => setMonitorTxnHash(e.target.value)}
                    placeholder="粘贴区块链交易哈希"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    实际到账金额 (USDT) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={monitorActualAmount}
                    onChange={(e) => setMonitorActualAmount(e.target.value)}
                    placeholder="输入实际到账金额"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleMonitorConfirm}
                  disabled={monitorConfirmMutation.isPending}
                  className="w-full py-3 bg-[#D32F2F] text-white rounded-xl font-medium hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {monitorConfirmMutation.isPending ? "处理中..." : "确认充值"}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">选择需要确认的订单：</p>
                <div className="border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {pendingOrders.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">暂无待处理订单</div>
                  ) : (
                    <div className="divide-y">
                      {pendingOrders.map((order: any) => (
                        <div
                          key={order.id}
                          onClick={() => { setMonitorSelectedOrder(order); setMonitorActualAmount(order.amount); setMonitorTxnHash(""); }}
                          className="px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{order.amount} USDT</span>
                            <span className="text-xs text-gray-400">{order.network}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {order.realName || order.userName || `ID:${order.user_id || order.userId}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 取消订单确认 ===== */}
      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={(open) => { setShowCancelConfirm(open); if (!open) setCancelTarget(null); }}
      >
        <AlertDialogContent className="mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消订单</AlertDialogTitle>
            <AlertDialogDescription>
              取消后该订单将无法恢复，确认取消吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">返回</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget.id })}
            >
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== 批量清除确认 ===== */}
      {showBulkClearConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认一键清除</h3>
            <p className="text-sm text-gray-500 mb-4">
              将删除所有「{filterStatus === 'expired' ? '已过期' : '已取消'}」订单，共 {filteredOrders.length} 条，操作不可恢复。
            </p>
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4">删除后数据将永久移除，请确认。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkClearConfirm(false)}
                className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={() => bulkClearMutation.mutate({ status: filterStatus as 'cancelled' | 'expired' })}
                disabled={bulkClearMutation.isPending}
                className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-xl disabled:opacity-50"
              >
                {bulkClearMutation.isPending ? "清除中..." : "确认清除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 诊断日志弹窗 ===== */}
      {showDiagLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-lg">诊断结果</h3>
              <button onClick={() => setShowDiagLogs(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2 font-mono text-xs">
                {diagLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      log.includes('✅') ? 'bg-green-50 text-green-800' :
                      log.includes('⚠️') ? 'bg-yellow-50 text-yellow-800' :
                      log.includes('❌') ? 'bg-red-50 text-red-800' :
                      log.includes('---') ? 'bg-blue-50 text-blue-800 font-bold' :
                      'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t">
              <button onClick={() => setShowDiagLogs(false)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 撤回确认弹窗 ===== */}
      {showRevokeDialog && revokeTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">撤回误操作</h3>
            <p className="text-sm text-gray-500 mb-1">
              {revokeTarget.type === 'order'
                ? `订单金额：${revokeTarget.amount.toFixed(4)} USDT`
                : `流水金额：${revokeTarget.amount.toFixed(revokeTarget.currency === 'CNY' ? 2 : 4)} ${revokeTarget.currency}`
              }
            </p>
            <p className="text-xs text-gray-400 mb-4">请选择撤回方式：</p>
            <div className="space-y-3 mb-5">
              <button
                onClick={() => {
                  if (revokeTarget.type === 'order') {
                    revokeMutation.mutate({ orderId: revokeTarget.orderId, mode: 'reverse' });
                  } else if (revokeTarget.type === 'manual') {
                    revokeManualMutation.mutate({ manualId: revokeTarget.manualId, mode: 'reverse' });
                  } else {
                    revokeHistoryMutation.mutate({ historyId: revokeTarget.historyId, mode: 'reverse' });
                  }
                }}
                disabled={revokeMutation.isPending || revokeManualMutation.isPending || revokeHistoryMutation.isPending}
                className="w-full py-3 text-sm font-medium text-green-700 border border-green-200 rounded-xl bg-green-50 hover:bg-green-100 active:scale-[0.98] transition-all text-left px-4"
              >
                <div className="font-semibold">✅ 写入反向记录（推荐）</div>
                <div className="text-xs text-green-600 mt-0.5">余额还原，保留原记录并新增一条反向流水，可审计</div>
              </button>
              <button
                onClick={() => {
                  if (revokeTarget.type === 'order') {
                    revokeMutation.mutate({ orderId: revokeTarget.orderId, mode: 'delete' });
                  } else if (revokeTarget.type === 'manual') {
                    revokeManualMutation.mutate({ manualId: revokeTarget.manualId, mode: 'delete' });
                  } else {
                    revokeHistoryMutation.mutate({ historyId: revokeTarget.historyId, mode: 'delete' });
                  }
                }}
                disabled={revokeMutation.isPending || revokeManualMutation.isPending || revokeHistoryMutation.isPending}
                className="w-full py-3 text-sm font-medium text-red-700 border border-red-200 rounded-xl bg-red-50 hover:bg-red-100 active:scale-[0.98] transition-all text-left px-4"
              >
                <div className="font-semibold">❌ 直接删除原记录</div>
                <div className="text-xs text-red-500 mt-0.5">余额按原流水金额反向还原，删除原流水条目，不留痕迹</div>
              </button>
            </div>
            <button
              onClick={() => { setShowRevokeDialog(false); setRevokeTarget(null); }}
              className="w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ===== 编辑备注弹窗 ===== */}
      {showNoteDialog && noteTarget && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#F7F8FA]" role="dialog" aria-modal="true" aria-label="编辑流水备注">
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => { setShowNoteDialog(false); setNoteTarget(null); setNoteContent(''); setNoteSelectedCommonNote(null); }}
              className="flex min-w-14 items-center gap-1 text-[14px] font-medium text-gray-600"
            >
              <ChevronLeft className="h-4 w-4" />返回
            </button>
            <h3 className="text-[17px] font-bold text-gray-900">编辑备注</h3>
            <button
              type="button"
              onClick={saveNoteReplacement}
              disabled={updateNoteMutation.isPending}
              className="min-w-14 text-right text-[14px] font-semibold text-blue-600 disabled:text-gray-300"
            >{updateNoteMutation.isPending ? '保存中' : '保存'}</button>
          </header>
          <main className="flex-1 overflow-y-auto px-4 py-5">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] font-semibold text-gray-900">流水备注</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-gray-400">保存后直接替换当前备注，不再追加新的备注内容。</p>
                </div>
                <span className="shrink-0 text-[12px] text-gray-400">{noteContent.length}/1000</span>
              </div>
              <textarea
                value={noteContent}
                onChange={(e) => {
                  const next = e.target.value.slice(0, 1000);
                  setNoteContent(next);
                  if (next !== noteSelectedCommonNote) setNoteSelectedCommonNote(null);
                }}
                placeholder="输入备注内容（可留空）"
                rows={8}
                autoFocus
                className="min-h-56 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-[17px] leading-7 text-gray-800 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </section>
            <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] font-semibold text-gray-900">常用备注</p>
                  <p className="mt-0.5 text-[12px] text-gray-400">点标签填入并选中；选中后可点减号删除。</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={saveNoteContentAsCommon}
                    disabled={!noteContent.trim()}
                    title="将当前备注加入常用"
                    aria-label="将当前备注加入常用备注"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 text-orange-500 hover:bg-orange-50 disabled:border-gray-100 disabled:text-gray-300"
                  ><Plus className="h-4 w-4" /></button>
                  <button
                    type="button"
                    onClick={removeSelectedNoteCommon}
                    disabled={!noteSelectedCommonNote}
                    title={noteSelectedCommonNote ? `移除常用备注：${noteSelectedCommonNote}` : '请先选择一个常用备注'}
                    aria-label={noteSelectedCommonNote ? `移除常用备注：${noteSelectedCommonNote}` : '请先选择一个常用备注'}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 text-orange-500 hover:bg-orange-50 disabled:border-gray-100 disabled:text-gray-300"
                  ><Minus className="h-4 w-4" /></button>
                </div>
              </div>
              {adjCommonNotes.length === 0 ? (
                <p className="mt-3 text-[13px] text-gray-400">输入备注后点击右上角 +，即可收藏为常用备注。</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {adjCommonNotes.map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => { setNoteContent(note); setNoteSelectedCommonNote(note); }}
                      className={`max-w-full rounded-lg border px-2.5 py-1.5 text-[13px] leading-5 transition-colors ${
                        noteSelectedCommonNote === note
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-orange-100 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      }`}
                    >{note}</button>
                  ))}
                </div>
              )}
            </section>
          </main>
          <footer className="border-t border-gray-200 bg-white px-4 py-3 pb-6">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowNoteDialog(false); setNoteTarget(null); setNoteContent(''); setNoteSelectedCommonNote(null); }}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-[15px] font-medium text-gray-600"
              >取消</button>
              <button
                type="button"
                onClick={saveNoteReplacement}
                disabled={updateNoteMutation.isPending}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
              >{updateNoteMutation.isPending ? '保存中...' : '保存修改'}</button>
            </div>
          </footer>
        </div>
      )}

      {/* ===== 修复日志弹窗 ===== */}
      {showFixLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-lg">修复日志</h3>
              <button onClick={() => setShowFixLogs(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2 font-mono text-xs">
                {fixLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      log.includes('✅') ? 'bg-green-50 text-green-800' :
                      log.includes('⚠️') ? 'bg-yellow-50 text-yellow-800' :
                      log.includes('❌') ? 'bg-red-50 text-red-800' :
                      'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t">
              <button onClick={() => setShowFixLogs(false)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
