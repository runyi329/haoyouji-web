/**
 * DepositManage.tsx
 * 保证金管理页（仅 37 号账本 / owner+admin 可访问）
 * UI重设计：蓝色渐变主题，与订单管理/管理费明细风格统一
 *
 * 分为两个 tab：
 *   左侧保证金：按成员×标签管理（原有逻辑）
 *   右侧保证金：按标签管理，多币种，存储在 tag_config.margin_by_coin
 */
import { useState, useMemo, useEffect } from "react";
import { useCryptoPrices } from "@/lib/useLivePrice"; // 规则G
import React from "react";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft,
  Pencil,
  X,
  Trash2,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  PauseCircle,
  PlayCircle,
  ScrollText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

const CRYPTO_COINS = ["BTC", "ETH", "SOL", "LDO", "USDT", "元"];
const normalizeCoin = (coin: string) => (!coin || coin === "人民币") ? "元" : coin;
const CNY_RATE_FALLBACK = 7.0; // 居底备用，实际汇率从接口实时获取

interface DepositEntry {
  margin: string;
  marginCoin: string;
}

function toCNY(margin: string | number, coin: string, prices: Record<string, number>): number {
  const num = typeof margin === 'number' ? margin : parseFloat(margin);
  if (isNaN(num) || num === 0) return 0;
  if (!coin || coin === "人民币" || coin === "元") return num;
  // USDT 和其他币种都通过 prices 映射表计算（prices["USDT"] 已是实时汇率）
  const price = prices[coin];
  if (!price) return 0;
  return num * price;
}

type SortMode = "amount" | "name";

// ── 备注面板（可折叠，一条一条增加，与资方管理 FunderNoteRow 一致）──
interface DepositNoteItem { text: string; time: string; }

function parseDepositNotes(raw: string): DepositNoteItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DepositNoteItem[];
  } catch {}
  return [{ text: raw, time: '' }];
}

function formatDepositNoteTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${m}月${day}日 ${h}:${min}:${s}`;
}

const NoteEditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

function DepositNoteRow({ ledgerId, tagName, initialNote, onSaved, onLogSaved }: {
  ledgerId: number;
  tagName: string;
  initialNote: string;
  onSaved: (note: string) => void;
  onLogSaved?: (action: string, detail: string) => void;
}) {
  const [notes, setNotes] = React.useState<DepositNoteItem[]>(() => parseDepositNotes(initialNote));
  const [expanded, setExpanded] = React.useState(false);
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const saveTagConfig = trpc.ledger.saveTagConfig.useMutation();

  const saveNotes = async (newNotes: DepositNoteItem[], logDetail?: string) => {
    setSaving(true);
    try {
      const raw = JSON.stringify(newNotes);
      await saveTagConfig.mutateAsync({ ledgerId, tagName, note: raw });
      setNotes(newNotes);
      onSaved(raw);
      if (onLogSaved && logDetail) onLogSaved('修改备注', logDetail);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (idx: number) => {
    if (!editValue.trim()) return;
    const newNotes = notes.map((n, i) =>
      i === idx ? { text: editValue.trim(), time: new Date().toISOString() } : n
    );
    await saveNotes(newNotes, `编辑备注: ${editValue.trim()}`);
    setEditingIdx(null);
  };

  const handleAddNote = () => {
    const newNotes = [...notes, { text: '', time: new Date().toISOString() }];
    setNotes(newNotes);
    setEditingIdx(newNotes.length - 1);
    setEditValue('');
    setExpanded(true);
  };

  const handleSaveNew = async (idx: number) => {
    if (!editValue.trim()) {
      setNotes(notes.filter((_, i) => i !== idx));
      setEditingIdx(null);
      return;
    }
    const newNotes = notes.map((n, i) =>
      i === idx ? { text: editValue.trim(), time: new Date().toISOString() } : n
    );
    await saveNotes(newNotes, `新增备注: ${editValue.trim()}`);
    setEditingIdx(null);
  };

  return (
    <div className="px-3 py-2 text-xs mt-2 rounded-xl" style={{ backgroundColor: '#F8FBFF', border: '1px solid #DBEAFE' }} onClick={e => e.stopPropagation()}>
      {/* 标题行：备注（左）+ 展开箭头（右） */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs font-bold" style={{ color: '#6B7280' }}>备注</span>
          {notes.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>{notes.length}</span>
          )}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {/* 展开状态 */}
      {expanded && (
        <div className="mt-1.5">
          {notes.length === 0 && (
            <div style={{ color: '#C0C8D8' }} className="py-1">暂无备注</div>
          )}
          {notes.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: '1px solid #E8EFFF' }} className="my-1" />}
              <div className="flex items-center gap-1 py-0.5">
                {editingIdx === idx ? (
                  <>
                    <input
                      autoFocus
                      className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none"
                      style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { note.text ? handleSaveEdit(idx) : handleSaveNew(idx); }
                        if (e.key === 'Escape') { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }
                      }}
                      placeholder="输入备注..."
                      maxLength={200}
                    />
                    <button
                      onClick={() => note.text ? handleSaveEdit(idx) : handleSaveNew(idx)}
                      disabled={saving}
                      className="shrink-0 text-xs px-2 py-0.5 rounded"
                      style={{ background: '#3B82F6', color: '#fff' }}
                    >{saving ? '...' : '保存'}</button>
                    <button
                      onClick={() => { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }}
                      className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: '#F3F4F6', color: '#6B7280' }}
                    >取消</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 break-all" style={{ color: '#4B5563' }}>{note.text}</span>
                    {note.time && <span className="shrink-0 text-[10px]" style={{ color: '#C0C8D8' }}>{formatDepositNoteTime(note.time)}</span>}
                    <button onClick={() => { setEditingIdx(idx); setEditValue(note.text); }} className="shrink-0" title="编辑">
                      <NoteEditIcon />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          <div style={{ borderTop: notes.length > 0 ? '1px solid #E8EFFF' : 'none' }} className="mt-1 pt-1">
            <button
              type="button"
              onClick={handleAddNote}
              className="flex items-center gap-1"
              style={{ color: '#9CA3AF' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DepositManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // ── Tab 状态 ──
  const [activeTab, setActiveTab] = useState<"left" | "right">("left");

  // ── 左侧保证金状态 ──
  const [filterHasDeposit, setFilterHasDeposit] = useState(false);
  const [hideEmptyTags, setHideEmptyTags] = useState<Record<number, boolean>>({});
  const [expandedMembers, setExpandedMembers] = useState<Record<number, boolean>>({});
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("amount");

  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  const categories = useMemo(() => {
    if (!rawCategories) return [];
    return (rawCategories as any[]).filter((c) => !c.isDefault);
  }, [rawCategories]);

  const { data: allBalancesData, refetch } =
    trpc.ledger.adminGetAllInitialBalances.useQuery(
      { ledgerId },
      { enabled: !!ledgerId }
    );

  // 规则G：数字币前端直连（老方案已封存：trpc.getCryptoPrices）
  const cryptoPricesRaw = useCryptoPrices(3000);
  const cryptoPrices: Record<string, number> = useMemo(() => {
    const result: Record<string, number> = {};
    if (cryptoPricesRaw) {
      // 使用接口返回的实时 USDT/CNY 汇率，居底用 CNY_RATE_FALLBACK
      const cnyRate = (cryptoPricesRaw as any)?.usdtCnyRate ?? CNY_RATE_FALLBACK;
      const pricesMap = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
      for (const [coin, usdtPrice] of Object.entries(
        pricesMap as Record<string, number>
      )) {
        result[coin] = (usdtPrice as number) * cnyRate;
      }
      result["USDT"] = cnyRate; // USDT 直接是实时汇率
    }
    return result;
  }, [cryptoPricesRaw]);

  const [editState, setEditState] = useState<Record<number, Record<string, DepositEntry>>>({});
  const [fullBalancesMap, setFullBalancesMap] = useState<Record<number, Record<string, any>>>({});

  const [editSheet, setEditSheet] = useState<{
    open: boolean;
    userId: number;
    tagName: string;
    memberName: string;
    tagColor: string;
  } | null>(null);
  const [draft, setDraft] = useState<DepositEntry>({ margin: "", marginCoin: "ETH" });

  useEffect(() => {
    if (!allBalancesData || categories.length === 0) return;
    const initial: Record<number, Record<string, DepositEntry>> = {};
    const fullMap: Record<number, Record<string, any>> = {};
    for (const member of (allBalancesData as any).members) {
      const balances = (allBalancesData as any).balancesMap[member.userId] ?? {};
      fullMap[member.userId] = balances;
      initial[member.userId] = {};
      for (const cat of categories) {
        const n = cat.name;
        initial[member.userId][n] = {
          margin: balances[`${n}__margin`] !== undefined ? String(balances[`${n}__margin`]) : "",
          marginCoin: balances[`${n}__marginCoin`] ?? "",
        };
      }
    }
    setEditState(initial);
    setFullBalancesMap(fullMap);
  }, [allBalancesData, categories]);

  const setMutation = trpc.ledger.adminSetMemberInitialBalances.useMutation({
    onSuccess: () => { toast.success("已保存"); refetch(); },
    onError: (err) => { toast.error((err as any).message || "保存失败"); },
  });

  const openEditSheet = (userId: number, tagName: string, memberName: string, tagColor: string) => {
    const entry = editState[userId]?.[tagName] ?? { margin: "", marginCoin: "ETH" };
    setDraft({ margin: entry.margin, marginCoin: normalizeCoin(entry.marginCoin) || "ETH" });
    setEditSheet({ open: true, userId, tagName, memberName, tagColor });
  };

  const saveSheet = () => {
    if (!editSheet) return;
    const { userId, tagName } = editSheet;
    setEditState((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [tagName]: { ...draft } },
    }));
    const full = { ...(fullBalancesMap[userId] ?? {}) };
    for (const cat of categories) {
      const n = cat.name;
      const entry = n === tagName ? draft : (editState[userId]?.[n] ?? { margin: "", marginCoin: "" });
      if (entry.margin !== "") {
        const num = parseFloat(entry.margin);
        if (!isNaN(num)) full[`${n}__margin`] = num;
        else delete full[`${n}__margin`];
      } else {
        delete full[`${n}__margin`];
      }
      full[`${n}__marginCoin`] = entry.marginCoin;
    }
    setMutation.mutate({ ledgerId, targetUserId: userId, balances: full });
    setEditSheet(null);
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; desc: string; onConfirm: () => void;
  }>({ open: false, title: "", desc: "", onConfirm: () => {} });

  const showConfirm = (title: string, desc: string, onConfirm: () => void) => {
    setConfirmDialog({ open: true, title, desc, onConfirm });
  };

  const clearCell = (userId: number, tagName: string, memberName?: string) => {
    showConfirm(
      "确认删除保证金",
      `确定要删除 ${memberName || userId} 在 [${tagName}] 标签下的保证金吗？此操作不可撤销。`,
      () => {
        setEditState((prev) => ({
          ...prev,
          [userId]: { ...(prev[userId] ?? {}), [tagName]: { margin: "", marginCoin: "" } },
        }));
        const full = { ...(fullBalancesMap[userId] ?? {}) };
        delete full[`${tagName}__margin`];
        full[`${tagName}__marginCoin`] = "";
        setMutation.mutate({ ledgerId, targetUserId: userId, balances: full });
        setEditSheet(null);
      }
    );
  };

  const calcCNYStr = (margin: string, coin: string): string | null => {
    const num = parseFloat(margin);
    if (isNaN(num) || num === 0) return null;
    if (!coin || coin === "元")
      return `¥${num.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
    const price = cryptoPrices[coin] ?? (coin === "USDT" ? CNY_RATE_FALLBACK : 0);
    if (!price) return null;
    return `≈¥${(num * price).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  };

  const members = useMemo(() => (allBalancesData as any)?.members ?? [], [allBalancesData]);

  const stats = useMemo(() => {
    const byCoin: Record<string, { count: number; total: number }> = {};
    const byMember: Record<number, { name: string; count: number; totalCNY: number }> = {};
    for (const member of members) {
      const userEdit = editState[member.userId] ?? {};
      let memberCount = 0;
      let memberCNY = 0;
      for (const cat of categories) {
        const entry = userEdit[cat.name] ?? { margin: "", marginCoin: "" };
        const num = parseFloat(entry.margin);
        if (!isNaN(num) && num > 0) {
          const coinKey = normalizeCoin(entry.marginCoin || "");
          if (!byCoin[coinKey]) byCoin[coinKey] = { count: 0, total: 0 };
          byCoin[coinKey].count += 1;
          byCoin[coinKey].total += num;
          memberCount += 1;
          memberCNY += toCNY(entry.margin, entry.marginCoin, cryptoPrices);
        }
      }
      byMember[member.userId] = {
        name: member.nickname || member.username || "未知",
        count: memberCount,
        totalCNY: memberCNY,
      };
    }
    const totalCount = Object.values(byCoin).reduce((s, v) => s + v.count, 0);
    const totalCNY = Object.values(byMember).reduce((s, v) => s + v.totalCNY, 0);
    return { byCoin, byMember, totalCount, totalCNY };
  }, [members, editState, categories, cryptoPrices]);

  const filteredMembers = useMemo(() => {
    let list = members;
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      list = list.filter((m: any) => (m.nickname || m.username || "").toLowerCase().includes(kw));
    }
    if (filterHasDeposit) {
      list = list.filter((m: any) => {
        const userEdit = editState[m.userId] ?? {};
        return categories.some((cat: any) => {
          const e = userEdit[cat.name];
          return e && parseFloat(e.margin) > 0;
        });
      });
    }
    return [...list].sort((a: any, b: any) => {
      if (sortMode === "name") {
        return (a.nickname || a.username || "").localeCompare(b.nickname || b.username || "", "zh");
      }
      const totalA = categories.reduce((sum: number, cat: any) => {
        const e = editState[a.userId]?.[cat.name];
        return sum + (e ? toCNY(e.margin, e.marginCoin, cryptoPrices) : 0);
      }, 0);
      const totalB = categories.reduce((sum: number, cat: any) => {
        const e = editState[b.userId]?.[cat.name];
        return sum + (e ? toCNY(e.margin, e.marginCoin, cryptoPrices) : 0);
      }, 0);
      return totalB - totalA;
    });
  }, [members, editState, categories, filterHasDeposit, cryptoPrices, searchText, sortMode]);

  // ── 右侧保证金状态 ──
  const [selectedTagForRight, setSelectedTagForRight] = useState<string | null>(null);
  const [rightMarginEdits, setRightMarginEdits] = useState<Array<{ coin: string; amount: string; label: string; date: string }>>([]);
  const [rightEditMode, setRightEditMode] = useState(false);
  const [rightSaving, setRightSaving] = useState(false);
  // 提现/入金相关状态
  const [fundFlowEdits, setFundFlowEdits] = useState<Array<{ coin: string; amount: string; label: string; date: string }>>([]);
  const [fundFlowEditMode, setFundFlowEditMode] = useState(false);
  const [fundFlowSaving, setFundFlowSaving] = useState(false);
  // 初始金额、倍数、保证金基数编辑状态（余额改为自动读取，不再手动登记）
  const [rightInitialEdit, setRightInitialEdit] = useState("");
  const [rightMultiplierEdit, setRightMultiplierEdit] = useState("1");
  const [rightMarginBaseEdit, setRightMarginBaseEdit] = useState("");
  const [rightBalanceEditMode, setRightBalanceEditMode] = useState(false);
  // ── 日志 & 暂停状态 ──
  const [marginLogExpanded, setMarginLogExpanded] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const { data: marginLogs, refetch: refetchMarginLogs } = (trpc.ledger as any).getMarginLogs.useQuery(
    { ledgerId, tagName: selectedTagForRight ?? "" },
    { enabled: !!ledgerId && !!selectedTagForRight }
  );
  const addMarginLogMutation = (trpc.ledger as any).addMarginLog.useMutation();
  const deleteMarginLogMutation = (trpc.ledger as any).deleteMarginLog.useMutation();
  const setTagMarginPauseMutation = trpc.ledger.setTagMarginPauseDate.useMutation();

  const { data: rightTagConfig, refetch: refetchRightTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId, tagName: selectedTagForRight ?? "" },
    { enabled: !!ledgerId && !!selectedTagForRight }
  );

  // 自动读取该标签在日历图（P117）里最新一条记录的余额和日期
  const { data: rightTagSummary, refetch: refetchRightTagSummary } = (trpc.ledger as any).getTagSummary.useQuery(
    { ledgerId, tagName: selectedTagForRight ?? "" },
    { enabled: !!ledgerId && !!selectedTagForRight }
  );

  // 查询当前选中标签的 transfer 记录（历史提现 + 增减本金），用于只读展示
  const selectedTagCategoryId = useMemo(() => {
    if (!selectedTagForRight || !categories.length) return null;
    const cat = (categories as any[]).find((c: any) => c.name === selectedTagForRight);
    return cat?.id ?? null;
  }, [selectedTagForRight, categories]);

  const { data: transferRecordsData } = trpc.ledger.getTransactions.useQuery(
    { ledgerId, type: 'transfer' as any, categoryId: selectedTagCategoryId ?? undefined, limit: 200 },
    { enabled: !!ledgerId && !!selectedTagCategoryId }
  );

  // 解析 transfer 记录：历史提现记录和增减本金记录
  const transferRecords = useMemo(() => {
    const withdraws: { date: string; amount: number; description: string }[] = [];
    const capitals: { date: string; amount: number; description: string }[] = [];
    (transferRecordsData as any[] || []).forEach((group: any) => {
      group.records?.forEach((r: any) => {
        const item = { date: r.recordDate || group.date || '', amount: Number(r.amount) || 0, description: r.description || '' };
        if (r.description?.startsWith('capital_')) {
          capitals.push(item);
        } else {
          withdraws.push(item);
        }
      });
    });
    return {
      withdraws: withdraws.sort((a, b) => a.date.localeCompare(b.date)),
      capitals: capitals.sort((a, b) => a.date.localeCompare(b.date)),
      all: [...withdraws, ...capitals].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [transferRecordsData]);

  // 批量查询所有标签的保证金摘要（用于折叠行右侧显示百分比）
  const { data: allTagsMarginSummary, refetch: refetchAllTagsMarginSummary } = (trpc.ledger as any).getAllTagsMarginSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, refetchInterval: 30000 }
  );

  const saveTagConfigMutation = trpc.ledger.saveTagConfig.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      setRightSaving(false);
      setRightEditMode(false);
      setFundFlowSaving(false);
      setFundFlowEditMode(false);
      refetchRightTagConfig();
      refetchRightTagSummary();
      refetchAllTagsMarginSummary();
    },
    onError: (err) => {
      toast.error((err as any).message || "保存失败");
      setRightSaving(false);
      setFundFlowSaving(false);
    },
  });

  // 切换标签时重置编辑状态
  useEffect(() => {
    setRightEditMode(false);
    setRightMarginEdits([]);
    setRightBalanceEditMode(false);
    setFundFlowEditMode(false);
    setFundFlowEdits([]);
  }, [selectedTagForRight]);

  const handleStartRightEditing = () => {
    const savedMargin = rightTagConfig?.margin_by_coin
      ? (() => { try { return JSON.parse(rightTagConfig.margin_by_coin as string); } catch { return null; } })()
      : null;
    const todayStr = new Date().toISOString().slice(0, 10);
    let entries: Array<{ coin: string; amount: string; label: string; date: string }>;
    if (!savedMargin) {
      entries = [{ coin: "ETH", amount: "", label: "", date: todayStr }];
    } else if (Array.isArray(savedMargin)) {
      // 新格式：数组
      entries = savedMargin.map((e: any) => ({ coin: e.coin || '元', amount: String(e.amount), label: e.label || '', date: e.date || todayStr }));
    } else {
      // 旧格式对象
      entries = Object.entries(savedMargin).map(([coin, amount]) => ({ coin, amount: String(amount), label: '', date: todayStr }));
    }
    setRightMarginEdits(entries);
    setRightEditMode(true);
  };

  const handleSaveRightMargin = async () => {
    if (!selectedTagForRight) return;
    setRightSaving(true);
    // 支持负数（给出保证金），过滤掉金额为空的行
    const todayStr = new Date().toISOString().slice(0, 10);
    const validEntries = rightMarginEdits.filter(e => e.amount !== '' && !isNaN(parseFloat(e.amount)));
    const marginByCoinJson = validEntries.length > 0
      ? JSON.stringify(validEntries.map(e => ({ coin: e.coin || '元', amount: parseFloat(e.amount), label: e.label || '', date: e.date || todayStr })))
      : undefined;
    // 保留其他配置字段，只更新 marginByCoin（余额改为自动读取，不保存 accountBalance/balanceDate）
    try {
      await saveTagConfigMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        marginByCoin: marginByCoinJson,
        initialAmount: rightTagConfig?.initial_amount as string | undefined,
        accountMultiplier: rightTagConfig?.account_multiplier as string | undefined,
        marginBase: (rightTagConfig as any)?.margin_base as string | undefined,
      });
      // 写入操作日志
      const detail = validEntries.length > 0
        ? validEntries.map(e => `${e.coin} ${e.amount}${e.label ? ' (' + e.label + ')' : ''}`).join('、')
        : '清空保证金';
      await addMarginLogMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        action: '修改保证金',
        detail,
      });
      refetchMarginLogs();
    } catch (_) { /* 错误已由 saveTagConfigMutation.onError 处理 */ }
  };

  // 保存初始金额/倍数/保证金基数（余额改为自动读取，不再保存）
  const handleSaveBalanceInfo = async () => {
    if (!selectedTagForRight) return;
    setRightSaving(true);
    // 保存时保持当前保证金数据不变
    const marginByCoinJson = rightTagConfig?.margin_by_coin as string | undefined;
    try {
      await saveTagConfigMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        marginByCoin: marginByCoinJson,
        initialAmount: rightInitialEdit || undefined,
        accountMultiplier: rightMultiplierEdit || "1",
        marginBase: rightMarginBaseEdit || undefined,
      });
      setRightBalanceEditMode(false);
      // 写入操作日志
      const parts = [];
      if (rightInitialEdit) parts.push(`初始金额: ${rightInitialEdit}`);
      if (rightMultiplierEdit) parts.push(`倍数: ${rightMultiplierEdit}x`);
      if (rightMarginBaseEdit) parts.push(`保证金基数: ${rightMarginBaseEdit}`);
      await addMarginLogMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        action: '修改设置',
        detail: parts.join('、') || '更新设置',
      });
      refetchMarginLogs();
    } catch (_) { /* 错误已由 saveTagConfigMutation.onError 处理 */ }
  };

  const handleClearRightMargin = () => {
    if (!selectedTagForRight) return;
    showConfirm(
      "确认清空保证金",
      `确定要清空 [${selectedTagForRight}] 的右侧保证金吗？`,
      async () => {
        setRightSaving(true);
        try {
          await saveTagConfigMutation.mutateAsync({
            ledgerId,
            tagName: selectedTagForRight,
            marginByCoin: undefined,
          });
          await addMarginLogMutation.mutateAsync({
            ledgerId,
            tagName: selectedTagForRight,
            action: '清空保证金',
            detail: '手动清空全部保证金记录',
          });
          refetchMarginLogs();
        } catch (_) {}
      }
    );
  };

  // 右侧保证金汇总（所有标签）
  const rightStats = useMemo(() => {
    // 这里只能用已加载的单个标签数据，汇总需要遍历所有标签
    // 简化：只显示当前选中标签的数据
    return null;
  }, []);

  // 解析右侧保证金数据（当前选中标签）
  const rightMarginData = useMemo(() => {
    if (!rightTagConfig?.margin_by_coin) return [];
    try {
      const parsed = JSON.parse(rightTagConfig.margin_by_coin as string);
      // 新格式：数组 [{ coin, amount, label? }]
      if (Array.isArray(parsed)) {
        return parsed.map((e: any) => ({ coin: e.coin || '元', amount: Number(e.amount), label: e.label || '', date: e.date || '' }));
      }
      // 旧格式向下兼容：对象 { coin: amount }
      return Object.entries(parsed).map(([coin, amount]) => ({ coin, amount: Number(amount), label: '', date: '' }));
    } catch { return []; }
  }, [rightTagConfig]);

  const rightTotalCNY = useMemo(() => {
    return rightMarginData.reduce((sum, { coin, amount }) => {
      return sum + toCNY(String(amount), coin, cryptoPrices);
    }, 0);
  }, [rightMarginData, cryptoPrices]);

  // 解析提现/入金数据（当前选中标签）
  const fundFlowData = useMemo(() => {
    if (!(rightTagConfig as any)?.fund_flow) return [];
    try {
      const parsed = JSON.parse((rightTagConfig as any).fund_flow as string);
      if (Array.isArray(parsed)) {
        return parsed.map((e: any) => ({ coin: e.coin || '元', amount: Number(e.amount), label: e.label || '', date: e.date || '' }));
      }
      return [];
    } catch { return []; }
  }, [rightTagConfig]);

  const fundFlowTotalCNY = useMemo(() => {
    return fundFlowData.reduce((sum, { coin, amount }) => {
      return sum + toCNY(String(amount), coin, cryptoPrices);
    }, 0);
  }, [fundFlowData, cryptoPrices]);

  const handleStartFundFlowEditing = () => {
    const saved = (rightTagConfig as any)?.fund_flow
      ? (() => { try { return JSON.parse((rightTagConfig as any).fund_flow as string); } catch { return null; } })()
      : null;
    const todayStr = new Date().toISOString().slice(0, 10);
    let entries: Array<{ coin: string; amount: string; label: string; date: string }>;
    if (!saved || !Array.isArray(saved)) {
      entries = [{ coin: "元", amount: "", label: "", date: todayStr }];
    } else {
      entries = saved.map((e: any) => ({ coin: e.coin || '元', amount: String(e.amount), label: e.label || '', date: e.date || todayStr }));
    }
    setFundFlowEdits(entries);
    setFundFlowEditMode(true);
  };

  const handleSaveFundFlow = async () => {
    if (!selectedTagForRight) return;
    setFundFlowSaving(true);
    const todayStr = new Date().toISOString().slice(0, 10);
    const validEntries = fundFlowEdits.filter(e => e.amount !== '' && !isNaN(parseFloat(e.amount)));
    const fundFlowJson = validEntries.length > 0
      ? JSON.stringify(validEntries.map(e => ({ coin: e.coin || '元', amount: parseFloat(e.amount), label: e.label || '', date: e.date || todayStr })))
      : undefined;
    try {
      await saveTagConfigMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        marginByCoin: rightTagConfig?.margin_by_coin as string | undefined,
        initialAmount: rightTagConfig?.initial_amount as string | undefined,
        accountMultiplier: rightTagConfig?.account_multiplier as string | undefined,
        marginBase: (rightTagConfig as any)?.margin_base as string | undefined,
        fundFlow: fundFlowJson,
      });
      const detail = validEntries.length > 0
        ? validEntries.map(e => `${e.coin} ${e.amount}${e.label ? ' (' + e.label + ')' : ''}`).join('、')
        : '清空提现/入金';
      await addMarginLogMutation.mutateAsync({
        ledgerId,
        tagName: selectedTagForRight,
        action: '修改提现/入金',
        detail,
      });
      refetchMarginLogs();
    } catch (_) {}
  };

  const handleClearFundFlow = () => {
    if (!selectedTagForRight) return;
    showConfirm(
      "确认清空提现/入金",
      `确定要清空 [${selectedTagForRight}] 的提现/入金记录吗？`,
      async () => {
        setFundFlowSaving(true);
        try {
          await saveTagConfigMutation.mutateAsync({
            ledgerId,
            tagName: selectedTagForRight,
            marginByCoin: rightTagConfig?.margin_by_coin as string | undefined,
            initialAmount: rightTagConfig?.initial_amount as string | undefined,
            accountMultiplier: rightTagConfig?.account_multiplier as string | undefined,
            marginBase: (rightTagConfig as any)?.margin_base as string | undefined,
            fundFlow: undefined,
          });
          await addMarginLogMutation.mutateAsync({
            ledgerId,
            tagName: selectedTagForRight,
            action: '清空提现/入金',
            detail: '手动清空全部提现/入金记录',
          });
          refetchMarginLogs();
        } catch (_) {}
      }
    );
  };

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: "#F0F4FF" }}>
      {/* 蓝色渐变顶部 */}
      <div
        className="sticky top-0 z-20 px-4 pt-4 pb-3"
        style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)" }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <div className="text-base font-bold text-white">保证金管理</div>
            <div className="text-xs text-blue-200">
              {activeTab === "left" ? `${members.length} 人 · ${stats.totalCount} 笔` : `${categories.length} 个标签`}
            </div>
          </div>
          {activeTab === "left" && (
            <button
              onClick={() => setFilterHasDeposit((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: filterHasDeposit ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)",
                color: "white",
                border: filterHasDeposit ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {filterHasDeposit ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {filterHasDeposit ? "有保证金" : "全部"}
            </button>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("left")}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              backgroundColor: activeTab === "left" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
              color: "white",
              border: activeTab === "left" ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            左侧保证金
          </button>
          <button
            onClick={() => setActiveTab("right")}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              backgroundColor: activeTab === "right" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
              color: "white",
              border: activeTab === "right" ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            右侧保证金
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          左侧保证金 Tab
      ══════════════════════════════════════ */}
      {activeTab === "left" && (
        <>
          {/* 汇总卡片 */}
          <div className="mx-4 mt-3">
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)" }}
            >
              <div>
                <div className="text-xs text-blue-200 mb-0.5">总折合人民币</div>
                <div className="text-2xl font-bold text-white">
                  ¥{stats.totalCNY.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-blue-200 mb-0.5">保证金笔数</div>
                <div className="text-2xl font-bold text-white">{stats.totalCount}</div>
              </div>
            </div>
          </div>

          {/* 横向滚动币种统计卡片 */}
          {Object.keys(stats.byCoin).length > 0 && (
            <div className="mt-3 px-4">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {Object.entries(stats.byCoin)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([coin, data]) => {
                    const cnyVal = coin === "元"
                      ? data.total
                      : coin === "USDT"
                      ? data.total * (cryptoPrices["USDT"] ?? CNY_RATE_FALLBACK)
                      : data.total * (cryptoPrices[coin] ?? 0);
                    return (
                      <div
                        key={coin}
                        className="flex-shrink-0 rounded-2xl px-4 py-3 min-w-[110px]"
                        style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)" }}
                      >
                        <div className="text-xs text-blue-200 mb-1">{coin}</div>
                        <div className="text-base font-bold text-white">
                          {data.total.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}
                        </div>
                        <div className="text-xs text-blue-300 mt-0.5">{data.count} 笔</div>
                        {coin !== "元" && cnyVal > 0 && (
                          <div className="text-xs text-blue-200 mt-0.5">
                            ≈¥{cnyVal.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 搜索栏 + 排序切换 */}
          <div className="mx-4 mt-3 flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "#FFFFFF" }}
            >
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索成员名称..."
                className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
              />
              {searchText && (
                <button onClick={() => setSearchText("")}>
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
            <button
              onClick={() => setSortMode((m) => m === "amount" ? "name" : "amount")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ backgroundColor: "#FFFFFF", color: "#2563eb" }}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortMode === "amount" ? "按金额" : "按名称"}
            </button>
          </div>

          {/* 成员列表 */}
          <div className="mx-4 mt-3 space-y-3">
            {filteredMembers.length === 0 ? (
              <div className="text-center text-gray-400 text-sm mt-8">
                {searchText ? "未找到匹配成员" : "暂无有保证金的成员"}
              </div>
            ) : (
              filteredMembers.map((member: any) => {
                const userEdit = editState[member.userId] ?? {};
                const depositEntries = categories.filter((cat: any) => {
                  const e = userEdit[cat.name];
                  return e && parseFloat(e.margin) > 0;
                });
                const isHidingEmpty = hideEmptyTags[member.userId] !== false;
                const visibleCats = isHidingEmpty
                  ? categories.filter((cat: any) => {
                      const e = userEdit[cat.name];
                      return e && parseFloat(e.margin) > 0;
                    })
                  : categories;
                const memberStats = stats.byMember[member.userId];
                const memberTotalCNY = memberStats?.totalCNY ?? 0;
                const isExpanded = expandedMembers[member.userId] === true;

                return (
                  <div
                    key={member.userId}
                    className="rounded-2xl overflow-hidden shadow-sm"
                    style={{ backgroundColor: "#FFFFFF" }}
                  >
                    <button
                      className="w-full text-left px-4 py-3"
                      style={{
                        background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                        borderBottom: isExpanded ? "1px solid #BFDBFE" : "none",
                      }}
                      onClick={() =>
                        setExpandedMembers((prev) => ({ ...prev, [member.userId]: !isExpanded }))
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            userId={member.userId}
                            nickname={member.nickname || member.username}
                            size={32}
                          />
                          <div>
                            <div className="text-sm font-bold text-gray-800">
                              {member.nickname || member.username || "未知"}
                            </div>
                            <div className="text-xs text-blue-500">
                              {depositEntries.length > 0 ? `${depositEntries.length} 项保证金` : "暂无保证金"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {memberTotalCNY > 0 ? (
                            <div className="text-right">
                              <div className="text-base font-bold text-blue-700">
                                ¥{memberTotalCNY.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                              </div>
                              <div className="text-xs text-blue-400">折合人民币</div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">—</div>
                          )}
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && <div className="px-4 py-2">
                      {categories.length > depositEntries.length && (
                        <button
                          onClick={() =>
                            setHideEmptyTags((prev) => ({ ...prev, [member.userId]: !isHidingEmpty }))
                          }
                          className="flex items-center gap-1 text-xs text-blue-500 mb-2"
                        >
                          {isHidingEmpty ? (
                            <><ChevronDown className="w-3 h-3" />展开全部标签</>
                          ) : (
                            <><ChevronUp className="w-3 h-3" />收起空标签</>
                          )}
                        </button>
                      )}
                      {visibleCats.length === 0 ? (
                        <div className="text-xs text-gray-300 py-2 text-center">暂无保证金</div>
                      ) : (
                        <div className="space-y-2">
                          {visibleCats.map((cat: any) => {
                            const entry = userEdit[cat.name] ?? { margin: "", marginCoin: "" };
                            const hasValue = entry.margin && parseFloat(entry.margin) > 0;
                            return (
                              <div
                                key={cat.id}
                                className="flex items-center gap-2 py-1.5"
                                style={{ borderBottom: "1px solid #F3F4F6" }}
                              >
                                <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                                  <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: cat.color || "#2563eb" }}
                                  />
                                  <span className="text-xs text-gray-600 truncate">{cat.name}</span>
                                </div>
                                <div className="flex-1 flex items-center gap-1.5">
                                  {hasValue ? (
                                    <>
                                      <span className="text-sm font-semibold text-gray-800">
                                        {parseFloat(entry.margin).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}
                                      </span>
                                      <span className="text-xs text-gray-500">{normalizeCoin(entry.marginCoin)}</span>
                                      {entry.marginCoin && entry.marginCoin !== "元" && (
                                        <span className="text-xs text-gray-400">
                                          {calcCNYStr(entry.margin, entry.marginCoin)}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-gray-300">未设置</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() =>
                                      openEditSheet(
                                        member.userId, cat.name,
                                        member.nickname || member.username || "未知",
                                        cat.color || "#2563eb"
                                      )
                                    }
                                    className="w-7 h-7 flex items-center justify-center rounded-full"
                                    style={{ backgroundColor: "#EFF6FF" }}
                                  >
                                    <Pencil className="w-3 h-3 text-blue-600" />
                                  </button>
                                  {hasValue && (
                                    <button
                                      onClick={() =>
                                        clearCell(member.userId, cat.name, member.nickname || member.username || String(member.userId))
                                      }
                                      className="w-7 h-7 flex items-center justify-center rounded-full"
                                      style={{ backgroundColor: "#FFF5F5" }}
                                    >
                                      <Trash2 className="w-3 h-3 text-red-400" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          右侧保证金 Tab
      ══════════════════════════════════════ */}
      {activeTab === "right" && (
        <>
          {/* 标签选择列表 */}
          <div className="mx-4 mt-3 space-y-2">
            {categories.length === 0 ? (
              <div className="text-center text-gray-400 text-sm mt-8">暂无标签</div>
            ) : (
                            [...categories].sort((a: any, b: any) => {
                const aPaused = !!(allTagsMarginSummary?.[a.name]?.marginPauseDate);
                const bPaused = !!(allTagsMarginSummary?.[b.name]?.marginPauseDate);
                if (aPaused && !bPaused) return 1;
                if (!aPaused && bPaused) return -1;
                return 0;
              }).map((cat: any) => {
                const isSelected = selectedTagForRight === cat.name;
                // 计算该标签的保证金占基数比（用于折叠行显示）
                // 仅在 cryptoPrices 已加载（有 USDT 汇率）时才计算，避免汇率未就绪导致计算错误
                const tagSummaryData = allTagsMarginSummary?.[cat.name];
                const isPaused = !!(tagSummaryData?.marginPauseDate);
                let collapseRatio: number | null = null;
                const hasPrices = Object.keys(cryptoPrices).length > 0;
                if (tagSummaryData && hasPrices) {
                  const marginBase = parseFloat(tagSummaryData.marginBase || '0') || 0;
                  if (marginBase > 0) {
                    // 解析 marginByCoin 计算已付保证金（与展开里 rightTotalCNY 逻辑完全一致）
                    let totalMarginCNY = 0;
                    if (tagSummaryData.marginByCoin) {
                      try {
                        const parsed = JSON.parse(tagSummaryData.marginByCoin);
                        if (Array.isArray(parsed)) {
                          // 与展开里 rightTotalCNY 一致：toCNY(String(amount), coin, cryptoPrices)
                          totalMarginCNY = parsed.reduce((s: number, e: any) => s + toCNY(String(e.amount), e.coin, cryptoPrices), 0);
                        }
                      } catch {}
                    }
                    // 盈亏净值（与展开里 pnl 逻辑完全一致）
                    const latestBal = tagSummaryData.latestBalance;
                    const balNum = latestBal ? parseFloat(String(latestBal.balance)) : 0;
                    const initialNum = parseFloat(tagSummaryData.initialAmount || '0') || 0;
                    const multiplierNum = parseFloat(tagSummaryData.accountMultiplier || '1') || 1;
                    const pnl = (balNum - initialNum) * multiplierNum;
                    const remaining = pnl + totalMarginCNY;
                    collapseRatio = marginBase > 0 ? (remaining / marginBase) * 100 : null;
                  }
                }
                const isWarning = collapseRatio !== null && collapseRatio < 10;

                return (
                  <div
                    key={cat.id}
                    className="rounded-2xl overflow-hidden shadow-sm"
                    style={{
                      backgroundColor: isPaused ? "#F3F4F6" : "#FFFFFF",
                      border: isPaused ? "1.5px solid #D1D5DB" : isWarning ? "1.5px solid #F97316" : "1.5px solid transparent",
                      opacity: isPaused ? 0.7 : 1,
                    }}
                  >
                    {/* 标签头部 */}
                    <button
                      className="w-full text-left px-4 py-3"
                      style={{
                        background: isSelected
                          ? "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
                          : isPaused ? "#F3F4F6"
                          : isWarning ? "#FFF7ED" : "#FFFFFF",
                        borderBottom: isSelected ? "1px solid #BFDBFE" : "none",
                      }}
                      onClick={() => setSelectedTagForRight(isSelected ? null : cat.name)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: cat.color ? `${cat.color}22` : "#EFF6FF" }}
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: cat.color || "#2563eb" }}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold" style={{ color: isPaused ? '#9CA3AF' : '#1F2937' }}>{cat.name}</span>
                              {isPaused && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#E5E7EB', color: '#6B7280' }}>已暂停</span>
                              )}
                            </div>
                            {!isSelected && (
                              <div className="text-xs" style={{ color: isPaused ? '#9CA3AF' : '#3B82F6' }}>{isPaused ? '已暂停查询' : '点击查看/编辑保证金'}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isSelected && collapseRatio !== null && (
                            <span
                              className="text-sm font-bold"
                              style={{ color: isWarning ? "#EA580C" : "#16A34A" }}
                            >
                              {collapseRatio.toFixed(1)}%
                            </span>
                          )}
                          {isSelected
                            ? <ChevronUp className="w-4 h-4 text-blue-400" />
                            : <ChevronDown className="w-4 h-4 text-blue-400" />}
                        </div>
                      </div>
                    </button>

                    {/* 展开内容 */}
                    {isSelected && (
                      <div className="px-4 py-3">
                        {/* 查看模式 */}
                        {!rightEditMode && (
                          <>
                            {/* 保证金内置容器 */}
                            <div className="rounded-xl p-3 mb-3 space-y-2" style={{ backgroundColor: '#F8FBFF', border: '1px solid #DBEAFE' }}>
                              {/* 标题行：右侧放编辑按钮 */}
                              <div className="flex justify-end items-center">
                                <button
                                  onClick={handleStartRightEditing}
                                  className="text-xs text-blue-500 flex items-center gap-0.5"
                                >
                                  <Pencil className="w-3 h-3" />编辑保证金
                                </button>
                              </div>
                              {rightMarginData.length === 0 ? (
                                <div className="text-xs text-gray-400 py-2 text-center">暂未设置右侧保证金</div>
                              ) : (
                                <div className="space-y-2">
                                  {(rightMarginData as Array<{ coin: string; amount: number; label: string; date: string }>).map(({ coin, amount, label, date }, _i) => {
                                    const cnyVal = coin !== '元' ? toCNY(String(Math.abs(amount)), coin, cryptoPrices) : Math.abs(amount);
                                    return (
                                      <div
                                        key={_i}
                                        className="flex items-start justify-between py-2"
                                        style={{ borderBottom: '1px solid #E5E7EB' }}
                                      >
                                        {/* 左：「保证金」 + 日期 + 增加/减少标签同一行 + 备注在下一行 */}
                                        <div className="flex flex-col min-w-0 flex-1 mr-2">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-medium text-gray-700">保证金</span>
                                            <span className="text-xs" style={{ color: '#2563EB' }}>
                                              {date ? date.slice(5) : '--'}
                                            </span>
                                            <span
                                              className="text-[10px] font-medium px-1 py-0.5 rounded"
                                              style={{
                                                backgroundColor: amount < 0 ? '#DCFCE7' : '#EFF6FF',
                                                color: amount < 0 ? '#16A34A' : '#2563EB',
                                              }}
                                            >
                                              {amount < 0 ? '减少' : '增加'}
                                            </span>
                                          </div>
                                          {label ? <span className="text-[10px] text-gray-400 mt-0.5 break-all" style={{ maxWidth: '160px' }}>{label}</span> : null}
                                        </div>
                                        {/* 右：上行原币金额，下行折合人民币（元）或折合 U（其他币种） */}
                                        <div className="flex flex-col items-end">
                                          <span className="text-sm font-semibold" style={{ color: amount < 0 ? '#388E3C' : '#1A2340' }}>
                                            {amount >= 0 ? '+' : ''}{amount.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}
                                            <span className="text-xs text-gray-500 ml-1">{coin}</span>
                                          </span>
                                          {/* 元/人民币：显示折合 U */}
                                          {(coin === '元' || coin === '人民币') && cryptoPrices['USDT'] > 0 && (
                                            <span className="text-xs text-gray-400">
                                              ≈{(Math.abs(amount) / cryptoPrices['USDT'] >= 0 ? (amount < 0 ? '-' : '') : '')}{(Math.abs(amount) / cryptoPrices['USDT']).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} U
                                            </span>
                                          )}
                                          {/* 其他币种：显示折合人民币 */}
                                          {coin !== '元' && coin !== '人民币' && (
                                            <span className="text-xs" style={{ color: amount < 0 ? '#388E3C' : '#6B7280' }}>
                                              {amount < 0 ? '-' : ''}¥{cnyVal.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {/* 合计行 */}
                                  <div className="flex items-end justify-between pt-1" style={{ borderTop: '1px solid #DBEAFE' }}>
                                    <span className="text-xs text-gray-500">合计</span>
                                    <div className="flex flex-col items-end">
                                      {Object.entries(
                                        (rightMarginData as Array<{ coin: string; amount: number }>).reduce((acc, { coin, amount }) => {
                                          acc[coin] = (acc[coin] || 0) + amount;
                                          return acc;
                                        }, {} as Record<string, number>)
                                      ).map(([coin, total]) => (
                                        <span key={coin} className="text-xs font-semibold" style={{ color: total < 0 ? '#388E3C' : '#1A2340' }}>
                                          {total >= 0 ? '+' : ''}{total.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} {coin}
                                        </span>
                                      ))}
                                      <span className="text-sm font-bold text-blue-700">
                                        ¥{rightTotalCNY.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* ── 历史提现区块（只读，联动P004录入的withdraw记录） ── */}
                            <div className="rounded-xl p-3 mb-3 space-y-2" style={{ backgroundColor: '#FFFBF0', border: '1px solid #FDE68A' }}>
                              <div className="text-xs text-amber-700 font-medium">历史提现</div>
                              {transferRecords.withdraws.length === 0 ? (
                                <div className="text-xs text-gray-400 py-2 text-center">暂无历史提现记录</div>
                              ) : (
                                <div className="space-y-2">
                                  {transferRecords.withdraws.map((record, _i) => (
                                    <div
                                      key={_i}
                                      className="flex items-start justify-between py-2"
                                      style={{ borderBottom: '1px solid #FDE68A' }}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-gray-700">提现</span>
                                        <span className="text-xs" style={{ color: '#D97706' }}>
                                          {record.date ? record.date.slice(5) : '--'}
                                        </span>
                                        <span className="text-[10px] font-medium px-1 py-0.5 rounded" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
                                          {record.amount < 0 ? '提出' : '转入'}
                                        </span>
                                      </div>
                                      <span className="text-sm font-semibold" style={{ color: '#D97706' }}>
                                        {record.amount >= 0 ? '+' : ''}¥{record.amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                  ))}
                                  <div className="flex items-end justify-between pt-1" style={{ borderTop: '1px solid #FDE68A' }}>
                                    <span className="text-xs text-gray-500">累计提现</span>
                                    <span className="text-sm font-bold" style={{ color: '#D97706' }}>
                                      ¥{transferRecords.withdraws.reduce((s, r) => s + r.amount, 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* ── 增减本金区块（只读，联动P004录入的capital_add/capital_reduce记录） ── */}
                            <div className="rounded-xl p-3 mb-3 space-y-2" style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                              <div className="text-xs font-medium" style={{ color: '#7C3AED' }}>增减本金</div>
                              {transferRecords.capitals.length === 0 ? (
                                <div className="text-xs text-gray-400 py-2 text-center">暂无增减本金记录</div>
                              ) : (
                                <div className="space-y-2">
                                  {transferRecords.capitals.map((record, _i) => {
                                    const isAdd = record.description === 'capital_add';
                                    return (
                                      <div
                                        key={_i}
                                        className="flex items-start justify-between py-2"
                                        style={{ borderBottom: '1px solid #DDD6FE' }}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-medium text-gray-700">{isAdd ? '增加本金' : '减少本金'}</span>
                                          <span className="text-xs" style={{ color: '#7C3AED' }}>
                                            {record.date ? record.date.slice(5) : '--'}
                                          </span>
                                          <span className="text-[10px] font-medium px-1 py-0.5 rounded" style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                                            本金
                                          </span>
                                        </div>
                                        <span className="text-sm font-semibold" style={{ color: '#7C3AED' }}>
                                          {record.amount >= 0 ? '+' : ''}¥{record.amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-end justify-between pt-1" style={{ borderTop: '1px solid #DDD6FE' }}>
                                    <span className="text-xs text-gray-500">累计本金变动</span>
                                    <span className="text-sm font-bold" style={{ color: '#7C3AED' }}>
                                      {transferRecords.capitals.reduce((s, r) => s + r.amount, 0) >= 0 ? '+' : ''}¥{transferRecords.capitals.reduce((s, r) => s + r.amount, 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* ── 账户余额（自动读取）/ 初始金额 / 倍数 区块 ── */}
                            {(() => {
                              // 自动读取最新余额和日期（来自 P117 日历图最新记录）
                              const latestBalance = (rightTagSummary as any)?.latestBalance;
                              const autoBalanceNum = latestBalance?.balance ? parseFloat(String(latestBalance.balance)) : null;
                              const autoBalanceDate = latestBalance?.recordDate as string | undefined;

                              // 北京时间交易日 15:00 判断
                              const _nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
                              const _todayBJ = _nowBJ.toISOString().slice(0, 10);
                              const _hourBJ = _nowBJ.getUTCHours();
                              const _dowBJ = _nowBJ.getUTCDay(); // 0=周日,6=周六
                              const _isTradeDay = _dowBJ >= 1 && _dowBJ <= 5;
                              const _isStale = _isTradeDay && _hourBJ >= 15 && autoBalanceDate !== _todayBJ;

                              const savedInitial = rightTagConfig?.initial_amount as string | undefined;
                              const savedMultiplier = rightTagConfig?.account_multiplier as string | undefined;
                              const savedMarginBase = (rightTagConfig as any)?.margin_base as string | undefined;
                              const initialNum = parseFloat(savedInitial || "0") || 0;
                              const multiplierNum = parseFloat(savedMultiplier || "1") || 1;
                              const marginBaseNum = parseFloat(savedMarginBase || "0") || 0;
                              // 盈亏净値 = (余额 - 初始金额) × 倍数
                              // 实时 USDT/CNY 汇率（用于盈亏净值折算为 U）
                              const _cnyRate = cryptoPrices["USDT"] ?? CNY_RATE_FALLBACK;
                              const pnl = autoBalanceNum !== null ? (autoBalanceNum - initialNum) * multiplierNum : null;
                              // 剩余保证金 = 盈亏净値 + 已付保证金（盈亏为负表示输给公司，加上保证金得剩余；盈亏为正表示赢了，加上保证金得总资产）
                              const remainingMargin = pnl !== null ? pnl + rightTotalCNY : null;
                              // 保证金占基数比 = 剩余保证金 / 保证金基数
                              const marginBasePct = marginBaseNum > 0 && remainingMargin !== null ? (remainingMargin / marginBaseNum * 100) : null;
                              // 保证金占余额比（降级备用）
                              const marginPct = autoBalanceNum !== null && autoBalanceNum > 0 ? (rightTotalCNY / autoBalanceNum * 100) : null;
                              return (
                                <div className="mt-3 rounded-xl p-3 space-y-2" style={{ backgroundColor: "#F8FBFF", border: "1px solid #DBEAFE" }}>
                                  {/* 设置按鈕单独一行，靠右 */}
                                  <div className="flex justify-end">
                                    {!rightBalanceEditMode ? (
                                      <button
                                        onClick={() => {
                                          setRightInitialEdit(savedInitial || "");
                                          setRightMultiplierEdit(savedMultiplier || "1");
                                          setRightMarginBaseEdit(savedMarginBase || "");
                                          setRightBalanceEditMode(true);
                                        }}
                                        className="text-xs text-blue-500 flex items-center gap-0.5"
                                      >
                                        <Pencil className="w-3 h-3" />设置
                                      </button>
                                    ) : (
                                      <div className="flex gap-2">
                                        <button onClick={() => setRightBalanceEditMode(false)} className="text-xs text-gray-400">取消</button>
                                        <button onClick={handleSaveBalanceInfo} disabled={rightSaving} className="text-xs text-blue-600 font-bold">保存</button>
                                      </div>
                                    )}
                                  </div>
                                  {/* 账户余额 + 简写日期 在左，金额在右，字体与初始金额一致 */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      账户余额
                                      {autoBalanceDate && (
                                        <span className="ml-1" style={{ color: _isStale ? '#B45309' : '#2563EB' }}>
                                          {autoBalanceDate.slice(5)}{/* MM-DD 简写 */}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-700">
                                      {autoBalanceNum !== null ? `¥${autoBalanceNum.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                    </span>
                                  </div>
                                  {/* 初始金额：查看模式显示保存值，编辑模式显示输入框 */}
                                  {!rightBalanceEditMode ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">初始金额</span>
                                        <span className="text-sm font-semibold text-gray-700">
                                          {savedInitial ? `¥${parseFloat(savedInitial).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">倍数</span>
                                        <span className="text-sm font-semibold text-gray-700">{savedMultiplier || "1"}x</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">保证金基数</span>
                                        <span className="text-sm font-semibold text-gray-700">
                                          {savedMarginBase ? `¥${parseFloat(savedMarginBase).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                        </span>
                                      </div>
                                      {autoBalanceNum !== null && savedInitial && (
                                        <>
                                          <div style={{ borderTop: "1px solid #DBEAFE", paddingTop: 6 }}>
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs text-gray-500">盈亏净値 (余额-初始)×倍数</span>
                                              <div className="text-right">
                                                <div className="text-sm font-bold" style={{ color: pnl !== null && pnl >= 0 ? "#D32F2F" : "#388E3C" }}>
                                                  {pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                                </div>
                                                 {pnl !== null && _cnyRate > 0 && (
                                                   <div className="text-xs text-gray-400">
                                                     ≈{(pnl / _cnyRate >= 0 ? "+" : "")}{(pnl / _cnyRate).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} U
                                                   </div>
                                                 )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                              <span className="text-xs text-gray-500">剩余保证金 (净値+已付保证金)</span>
                                              <div className="text-right">
                                                <div className="text-sm font-bold" style={{ color: remainingMargin !== null && remainingMargin >= 0 ? "#D32F2F" : "#388E3C" }}>
                                                  {remainingMargin !== null ? `${remainingMargin >= 0 ? "+" : ""}${remainingMargin.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                                </div>
                                                 {remainingMargin !== null && _cnyRate > 0 && (
                                                   <div className="text-xs text-gray-400">
                                                     ≈{(remainingMargin / _cnyRate >= 0 ? "+" : "")}{(remainingMargin / _cnyRate).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} U
                                                   </div>
                                                 )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                              <span className="text-xs text-gray-500">剩余保证金占基数比</span>
                                              <span className="text-sm font-bold text-blue-700">
                                                {marginBasePct !== null ? `${marginBasePct.toFixed(1)}%` : (marginPct !== null ? `${marginPct.toFixed(1)}%(占余额)` : "--")}
                                              </span>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    <div className="space-y-2">
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">初始金额 (元)</div>
                                        <input
                                          type="number"
                                          value={rightInitialEdit}
                                          onChange={e => setRightInitialEdit(e.target.value)}
                                          placeholder="请输入初始金额"
                                          className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                                          style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
                                          autoFocus
                                        />
                                      </div>
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">倍数</div>
                                        <input
                                          type="number"
                                          value={rightMultiplierEdit}
                                          onChange={e => setRightMultiplierEdit(e.target.value)}
                                          placeholder="默认1"
                                          className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                                          style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
                                        />
                                      </div>
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">保证金基数 (元)，用于计算占比</div>
                                        <input
                                          type="number"
                                          value={rightMarginBaseEdit}
                                          onChange={e => setRightMarginBaseEdit(e.target.value)}
                                          placeholder="请输入保证金基数"
                                          className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                                          style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}

                        {/* 备注面板（始终显示，不随编辑模式隐藏） */}
                        {!rightEditMode && selectedTagForRight && (
                          <DepositNoteRow
                            ledgerId={ledgerId}
                            tagName={selectedTagForRight}
                            initialNote={(rightTagConfig as any)?.note || ''}
                            onSaved={() => refetchRightTagConfig()}
                            onLogSaved={async (action, detail) => {
                              try {
                                await addMarginLogMutation.mutateAsync({ ledgerId, tagName: selectedTagForRight, action, detail });
                                refetchMarginLogs();
                              } catch (_) {}
                            }}
                          />
                        )}

                        {/* ── 日志区块（查看模式）── */}
                        {!rightEditMode && selectedTagForRight && (
                          <div className="mt-2 rounded-xl text-xs" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }} onClick={e => e.stopPropagation()}>
                            {/* 标题行 */}
                            <div
                              className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                              onClick={() => setMarginLogExpanded(v => !v)}
                            >
                              <div className="flex items-center gap-1.5">
                                <ScrollText className="w-3 h-3" style={{ color: '#16A34A' }} />
                                <span className="font-bold" style={{ color: '#15803D' }}>操作日志</span>
                                {marginLogs && marginLogs.length > 0 && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>{marginLogs.length}</span>
                                )}
                              </div>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: marginLogExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                            {/* 展开内容 */}
                            {marginLogExpanded && (
                              <div className="px-3 pb-2">
                                {(!marginLogs || marginLogs.length === 0) ? (
                                  <div style={{ color: '#C0C8D8' }} className="py-1">暂无操作日志</div>
                                ) : (
                                  <div className="space-y-1">
                                    {(marginLogs as any[]).map((log: any) => (
                                      <div key={log.id} className="flex items-start justify-between py-1" style={{ borderBottom: '1px solid #DCFCE7' }}>
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium" style={{ color: '#15803D' }}>{log.action}</span>
                                          {log.detail && <span className="ml-1" style={{ color: '#4B5563' }}>{log.detail}</span>}
                                          {log.remark && <span className="ml-1 text-[10px]" style={{ color: '#9CA3AF' }}>({log.remark})</span>}
                                          <div className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>
                                            {log.user_nickname || log.username || '未知'} · {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                          </div>
                                        </div>
                                        <button
                                          onClick={async () => {
                                            await deleteMarginLogMutation.mutateAsync({ ledgerId, logId: log.id });
                                            refetchMarginLogs();
                                          }}
                                          className="ml-2 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full"
                                          style={{ backgroundColor: '#FFF5F5' }}
                                          title="删除日志"
                                        >
                                          <X className="w-2.5 h-2.5 text-red-400" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── 暂停/恢复按鈕（查看模式）── */}
                        {!rightEditMode && selectedTagForRight && (() => {
                          const isPaused = !!(rightTagConfig as any)?.margin_pause_date;
                          return (
                            <div className="mt-3 flex justify-end">
                              <button
                                disabled={pauseSaving}
                                onClick={async () => {
                                  setPauseSaving(true);
                                  try {
                                    const newMarginPauseDate = isPaused ? null : new Date().toISOString().slice(0, 10);
                                    await                                     setTagMarginPauseMutation.mutateAsync({
                                      ledgerId,
                                      tagName: selectedTagForRight,
                                      marginPauseDate: newMarginPauseDate,
                                    });
                                    // 写入日志
                                    await addMarginLogMutation.mutateAsync({
                                      ledgerId,
                                      tagName: selectedTagForRight,
                                      action: isPaused ? '恢复查询' : '暂停查询',
                                      detail: isPaused ? '恢复账户余额查询' : `暂停账户余额查询（${new Date().toISOString().slice(0, 10)}）`,
                                    });
                                    refetchRightTagConfig();
                                    refetchAllTagsMarginSummary();
                                    refetchMarginLogs();
                                    toast.success(isPaused ? '已恢复查询' : '已暂停查询');
                                  } finally {
                                    setPauseSaving(false);
                                  }
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                                style={{
                                  backgroundColor: isPaused ? '#DCFCE7' : '#FFF7ED',
                                  color: isPaused ? '#15803D' : '#EA580C',
                                  border: isPaused ? '1px solid #BBF7D0' : '1px solid #FED7AA',
                                }}
                              >
                                {isPaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                                {pauseSaving ? '...' : (isPaused ? '恢复查询' : '暂停查询')}
                              </button>
                            </div>
                          );
                        })()}

                        {/* 编辑模式 */}
                        {rightEditMode && (
                          <>
                            <div className="space-y-3 mb-3">
                              {rightMarginEdits.map((entry, idx) => (
                                <div key={idx} className="rounded-xl p-2.5" style={{ backgroundColor: '#F0F4FF', border: '1px solid #DBEAFE' }}>
                                  {/* 币种选择行 */}
                                  <div className="flex gap-1 flex-wrap mb-2">
                                    {CRYPTO_COINS.map((c) => (
                                      <button
                                        key={c}
                                        onClick={() => {
                                          const next = [...rightMarginEdits];
                                          next[idx] = { ...next[idx], coin: c };
                                          setRightMarginEdits(next);
                                        }}
                                        className="px-2 py-1 rounded-lg text-xs font-medium"
                                        style={{
                                          backgroundColor: (entry.coin || "ETH") === c ? "#2563eb" : "#FFFFFF",
                                          color: (entry.coin || "ETH") === c ? "#FFFFFF" : "#374151",
                                        }}
                                      >
                                        {c}
                                      </button>
                                    ))}
                                  </div>
                                  {/* 第一行：金额 + 日期（各占一半） */}
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={entry.amount}
                                      onChange={(e) => {
                                        const next = [...rightMarginEdits];
                                        next[idx] = { ...next[idx], amount: e.target.value };
                                        setRightMarginEdits(next);
                                      }}
                                      placeholder="金额"
                                      className="flex-1 text-sm border rounded-lg px-2 py-1.5 outline-none"
                                      style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
                                    />
                                    <input
                                      type="date"
                                      value={entry.date || new Date().toISOString().slice(0, 10)}
                                      onChange={(e) => {
                                        const next = [...rightMarginEdits];
                                        next[idx] = { ...next[idx], date: e.target.value };
                                        setRightMarginEdits(next);
                                      }}
                                      className="flex-1 text-xs border rounded-lg px-2 py-1.5 outline-none"
                                      style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF", WebkitAppearance: 'none' }}
                                    />
                                  </div>
                                  {/* 第二行：备注（多行）+ 删除按鈕 */}
                                  <div className="flex items-start gap-2 mt-1.5">
                                    <textarea
                                      value={entry.label || ''}
                                      onChange={(e) => {
                                        const next = [...rightMarginEdits];
                                        next[idx] = { ...next[idx], label: e.target.value };
                                        setRightMarginEdits(next);
                                      }}
                                      placeholder="备注（可输入多行）"
                                      rows={2}
                                      className="flex-1 text-sm border rounded-lg px-2 py-1.5 outline-none resize-none"
                                      style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF", lineHeight: '1.5' }}
                                    />
                                    <button
                                      onClick={() => setRightMarginEdits(rightMarginEdits.filter((_, i) => i !== idx))}
                                      className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                                      style={{ backgroundColor: "#FFF5F5" }}
                                    >
                                      <X className="w-3 h-3 text-red-400" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {/* 添加一条保证金 */}
                              <button
                                onClick={() => setRightMarginEdits([...rightMarginEdits, { coin: "ETH", amount: "", label: "", date: new Date().toISOString().slice(0, 10) }])}
                                className="flex items-center gap-1 text-xs text-blue-500 mt-1"
                              >
                                <Plus className="w-3 h-3" />添加一条保证金
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setRightEditMode(false)}
                                className="flex-1 py-2 rounded-xl border text-sm text-gray-600 font-medium"
                                style={{ borderColor: "#E5E7EB" }}
                              >
                                取消
                              </button>
                              <button
                                onClick={handleSaveRightMargin}
                                disabled={rightSaving}
                                className="flex-1 py-2 rounded-xl text-white text-sm font-bold"
                                style={{
                                  background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                                  opacity: rightSaving ? 0.7 : 1,
                                }}
                              >
                                {rightSaving ? "保存中..." : "确认保存"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* 底部Sheet编辑态（左侧保证金用） */}
      {editSheet?.open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditSheet(null); }}
        >
          <div className="rounded-t-3xl px-5 pt-5 pb-8" style={{ backgroundColor: "#FFFFFF" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: editSheet.tagColor }} />
                <div>
                  <div className="text-sm font-bold text-gray-800">{editSheet.memberName}</div>
                  <div className="text-xs text-gray-500">{editSheet.tagName} · 编辑保证金</div>
                </div>
              </div>
              <button
                onClick={() => setEditSheet(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: "#F5F5F5" }}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1.5">保证金数量</div>
                <input
                  type="number"
                  value={draft.margin}
                  onChange={(e) => setDraft((d) => ({ ...d, margin: e.target.value }))}
                  placeholder="请输入数量"
                  className="w-full text-base border rounded-xl px-4 py-3 outline-none"
                  style={{ borderColor: "#BFDBFE", backgroundColor: "#F8FBFF" }}
                  autoFocus
                />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1.5">币种</div>
                <div className="flex gap-2 flex-wrap">
                  {CRYPTO_COINS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setDraft((d) => ({ ...d, marginCoin: c }))}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{
                        backgroundColor: (draft.marginCoin === "" ? "元" : draft.marginCoin) === c ? "#2563eb" : "#F0F4FF",
                        color: (draft.marginCoin === "" ? "元" : draft.marginCoin) === c ? "#FFFFFF" : "#374151",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {draft.margin && parseFloat(draft.margin) > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-sm text-blue-700"
                  style={{ backgroundColor: "#EFF6FF" }}
                >
                  折合人民币：<span className="font-bold">{calcCNYStr(draft.margin, draft.marginCoin) ?? "—"}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditSheet(null)}
                className="flex-1 py-3 rounded-xl border text-sm text-gray-600 font-medium"
                style={{ borderColor: "#E5E7EB" }}
              >
                取消
              </button>
              <button
                onClick={saveSheet}
                disabled={setMutation.isPending}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  opacity: setMutation.isPending ? 0.7 : 1,
                }}
              >
                {setMutation.isPending ? "保存中..." : "确认保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 二次确认弹窗 */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmDialog.desc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium"
              >
                取消
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((d) => ({ ...d, open: false }));
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
