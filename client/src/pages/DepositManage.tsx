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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { PageTag } from "@/components/PageTag";

const CRYPTO_COINS = ["BTC", "ETH", "SOL", "LDO", "USDT", "元"];
const normalizeCoin = (coin: string) => (!coin || coin === "人民币") ? "元" : coin;
const CNY_RATE = 7.0;

interface DepositEntry {
  margin: string;
  marginCoin: string;
}

function toCNY(margin: string, coin: string, prices: Record<string, number>): number {
  const num = parseFloat(margin);
  if (isNaN(num) || num <= 0) return 0;
  if (!coin || coin === "人民币" || coin === "元") return num;
  if (coin === "USDT") return num * CNY_RATE;
  const price = prices[coin];
  if (!price) return 0;
  return num * price;
}

type SortMode = "amount" | "name";

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

  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 0,
    placeholderData: (prev: any) => prev,
  });
  const cryptoPrices: Record<string, number> = useMemo(() => {
    const result: Record<string, number> = {};
    if (cryptoPricesRaw) {
      const pricesMap = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
      for (const [coin, usdtPrice] of Object.entries(
        pricesMap as Record<string, number>
      )) {
        result[coin] = (usdtPrice as number) * CNY_RATE;
      }
      result["USDT"] = CNY_RATE;
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
    const price = coin === "USDT" ? CNY_RATE : cryptoPrices[coin];
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
  const [rightMarginEdits, setRightMarginEdits] = useState<Array<{ coin: string; amount: string }>>([]);
  const [rightEditMode, setRightEditMode] = useState(false);
  const [rightSaving, setRightSaving] = useState(false);
  // 账户余额、初始金额、倍数编辑状态
  const [rightBalanceEdit, setRightBalanceEdit] = useState("");
  const [rightInitialEdit, setRightInitialEdit] = useState("");
  const [rightMultiplierEdit, setRightMultiplierEdit] = useState("1");
  const [rightBalanceEditMode, setRightBalanceEditMode] = useState(false);

  const { data: rightTagConfig, refetch: refetchRightTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId, tagName: selectedTagForRight ?? "" },
    { enabled: !!ledgerId && !!selectedTagForRight }
  );

  const saveTagConfigMutation = trpc.ledger.saveTagConfig.useMutation({
    onSuccess: () => {
      toast.success("右侧保证金已保存");
      setRightSaving(false);
      setRightEditMode(false);
      refetchRightTagConfig();
    },
    onError: (err) => {
      toast.error((err as any).message || "保存失败");
      setRightSaving(false);
    },
  });

  // 切换标签时重置编辑状态
  useEffect(() => {
    setRightEditMode(false);
    setRightMarginEdits([]);
    setRightBalanceEditMode(false);
  }, [selectedTagForRight]);

  const handleStartRightEditing = () => {
    const savedMargin = rightTagConfig?.margin_by_coin
      ? (() => { try { return JSON.parse(rightTagConfig.margin_by_coin as string); } catch { return null; } })()
      : null;
    const entries = savedMargin
      ? Object.entries(savedMargin).map(([coin, amount]) => ({ coin, amount: String(amount) }))
      : [{ coin: "ETH", amount: "" }];
    setRightMarginEdits(entries);
    setRightEditMode(true);
  };

  const handleSaveRightMargin = () => {
    if (!selectedTagForRight) return;
    setRightSaving(true);
    const validEntries = rightMarginEdits.filter(e => e.amount && parseFloat(e.amount) > 0);
    const marginByCoinJson = validEntries.length > 0
      ? JSON.stringify(Object.fromEntries(validEntries.map(e => [e.coin || "元", parseFloat(e.amount) || 0])))
      : undefined;
    // 保留其他配置字段，只更新 marginByCoin
    saveTagConfigMutation.mutate({
      ledgerId,
      tagName: selectedTagForRight,
      marginByCoin: marginByCoinJson,
      accountBalance: rightTagConfig?.account_balance as string | undefined,
      balanceDate: rightTagConfig?.balance_date as string | undefined,
      initialAmount: rightTagConfig?.initial_amount as string | undefined,
      accountMultiplier: rightTagConfig?.account_multiplier as string | undefined,
    });
  };

  // 保存账户余额/初始金额/倍数
  const handleSaveBalanceInfo = () => {
    if (!selectedTagForRight) return;
    setRightSaving(true);
    // 获取北京时间今天日期
    const now = new Date();
    const bjOffset = 8 * 60;
    const bjTime = new Date(now.getTime() + (bjOffset - now.getTimezoneOffset()) * 60000);
    const todayStr = bjTime.toISOString().slice(0, 10);
    const validEntries = rightMarginData;
    const marginByCoinJson = validEntries.length > 0
      ? JSON.stringify(Object.fromEntries(validEntries.map(e => [e.coin, e.amount])))
      : (rightTagConfig?.margin_by_coin as string | undefined);
    saveTagConfigMutation.mutate({
      ledgerId,
      tagName: selectedTagForRight,
      marginByCoin: marginByCoinJson,
      accountBalance: rightBalanceEdit || undefined,
      balanceDate: rightBalanceEdit ? todayStr : (rightTagConfig?.balance_date as string | undefined),
      initialAmount: rightInitialEdit || undefined,
      accountMultiplier: rightMultiplierEdit || "1",
    });
    setRightBalanceEditMode(false);
  };

  const handleClearRightMargin = () => {
    if (!selectedTagForRight) return;
    showConfirm(
      "确认清空保证金",
      `确定要清空 [${selectedTagForRight}] 的右侧保证金吗？`,
      () => {
        setRightSaving(true);
        saveTagConfigMutation.mutate({
          ledgerId,
          tagName: selectedTagForRight,
          marginByCoin: undefined,
        });
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
      const obj = JSON.parse(rightTagConfig.margin_by_coin as string);
      return Object.entries(obj).map(([coin, amount]) => ({ coin, amount: Number(amount) }));
    } catch { return []; }
  }, [rightTagConfig]);

  const rightTotalCNY = useMemo(() => {
    return rightMarginData.reduce((sum, { coin, amount }) => {
      return sum + toCNY(String(amount), coin, cryptoPrices);
    }, 0);
  }, [rightMarginData, cryptoPrices]);

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: "#F0F4FF" }}>
      <PageTag code="P080" />
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
                      ? data.total * CNY_RATE
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
              categories.map((cat: any) => {
                const isSelected = selectedTagForRight === cat.name;
                return (
                  <div
                    key={cat.id}
                    className="rounded-2xl overflow-hidden shadow-sm"
                    style={{ backgroundColor: "#FFFFFF" }}
                  >
                    {/* 标签头部 */}
                    <button
                      className="w-full text-left px-4 py-3"
                      style={{
                        background: isSelected
                          ? "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
                          : "#FFFFFF",
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
                            <div className="text-sm font-bold text-gray-800">{cat.name}</div>
                            <div className="text-xs text-blue-500">
                              {isSelected && rightMarginData.length > 0
                                ? `${rightMarginData.length} 种币种 · ≈¥${rightTotalCNY.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
                                : "点击查看/编辑保证金"}
                            </div>
                          </div>
                        </div>
                        {isSelected
                          ? <ChevronUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                      </div>
                    </button>

                    {/* 展开内容 */}
                    {isSelected && (
                      <div className="px-4 py-3">
                        {/* 查看模式 */}
                        {!rightEditMode && (
                          <>
                            {rightMarginData.length === 0 ? (
                              <div className="text-xs text-gray-400 py-2 text-center">暂未设置右侧保证金</div>
                            ) : (
                              <div className="space-y-2 mb-3">
                                {rightMarginData.map(({ coin, amount }) => (
                                  <div
                                    key={coin}
                                    className="flex items-center justify-between py-1.5"
                                    style={{ borderBottom: "1px solid #F3F4F6" }}
                                  >
                                    <span className="text-sm font-semibold text-gray-800">
                                      {amount.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}
                                      <span className="text-xs text-gray-500 ml-1">{coin}</span>
                                    </span>
                                    {coin !== "元" && (
                                      <span className="text-xs text-gray-400">
                                        {calcCNYStr(String(amount), coin)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                <div className="flex items-center justify-between pt-1">
                                  <span className="text-xs text-gray-500">折合人民币合计</span>
                                  <span className="text-sm font-bold text-blue-700">
                                    ¥{rightTotalCNY.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={handleStartRightEditing}
                                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                                style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)" }}
                              >
                                <Pencil className="w-3.5 h-3.5 inline mr-1" />
                                编辑保证金
                              </button>
                              {rightMarginData.length > 0 && (
                                <button
                                  onClick={handleClearRightMargin}
                                  className="w-10 h-9 flex items-center justify-center rounded-xl"
                                  style={{ backgroundColor: "#FFF5F5" }}
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              )}
                            </div>

                            {/* ── 账户余额 / 初始金额 / 倍数 区块 ── */}
                            {(() => {
                              const now = new Date();
                              const bjOffset = 8 * 60;
                              const bjTime = new Date(now.getTime() + (bjOffset - now.getTimezoneOffset()) * 60000);
                              const todayStr = bjTime.toISOString().slice(0, 10);
                              const savedBalance = rightTagConfig?.account_balance as string | undefined;
                              const savedBalanceDate = rightTagConfig?.balance_date as string | undefined;
                              const savedInitial = rightTagConfig?.initial_amount as string | undefined;
                              const savedMultiplier = rightTagConfig?.account_multiplier as string | undefined;
                              const isToday = savedBalanceDate === todayStr;
                              const balanceNum = parseFloat(savedBalance || "0") || 0;
                              const initialNum = parseFloat(savedInitial || "0") || 0;
                              const multiplierNum = parseFloat(savedMultiplier || "1") || 1;
                              const pnl = (balanceNum - initialNum) * multiplierNum;
                              const marginPct = balanceNum > 0 ? (rightTotalCNY / balanceNum * 100) : null;
                              return (
                                <div className="mt-3 rounded-xl p-3 space-y-2" style={{ backgroundColor: "#F8FBFF", border: "1px solid #DBEAFE" }}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-600">账户余额登记</span>
                                    {!rightBalanceEditMode ? (
                                      <button
                                        onClick={() => {
                                          setRightBalanceEdit(savedBalance || "");
                                          setRightInitialEdit(savedInitial || "");
                                          setRightMultiplierEdit(savedMultiplier || "1");
                                          setRightBalanceEditMode(true);
                                        }}
                                        className="text-xs text-blue-500 flex items-center gap-0.5"
                                      >
                                        <Pencil className="w-3 h-3" />登记
                                      </button>
                                    ) : (
                                      <div className="flex gap-2">
                                        <button onClick={() => setRightBalanceEditMode(false)} className="text-xs text-gray-400">取消</button>
                                        <button onClick={handleSaveBalanceInfo} disabled={rightSaving} className="text-xs text-blue-600 font-bold">保存</button>
                                      </div>
                                    )}
                                  </div>
                                  {!rightBalanceEditMode ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">余额</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-bold text-gray-800">
                                            {savedBalance ? `¥${parseFloat(savedBalance).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "--"}
                                          </span>
                                          {savedBalance && (
                                            <span
                                              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                              style={{
                                                backgroundColor: isToday ? "#DCFCE7" : "#FEF9C3",
                                                color: isToday ? "#16A34A" : "#B45309",
                                              }}
                                            >
                                              {isToday ? "✓ 最新" : `⚠️ ${savedBalanceDate || "未知日期"}`}
                                            </span>
                                          )}
                                        </div>
                                      </div>
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
                                      {savedBalance && savedInitial && (
                                        <>
                                          <div style={{ borderTop: "1px solid #DBEAFE", paddingTop: 6 }}>
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs text-gray-500">盈亏差値 (余额-初始)×倍数</span>
                                              <span className="text-sm font-bold" style={{ color: pnl >= 0 ? "#D32F2F" : "#388E3C" }}>
                                                {pnl >= 0 ? "+" : ""}{pnl.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                              <span className="text-xs text-gray-500">保证金占余额比</span>
                                              <span className="text-sm font-bold text-blue-700">
                                                {marginPct !== null ? `${marginPct.toFixed(1)}%` : "--"}
                                              </span>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    <div className="space-y-2">
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">账户余额 (元)</div>
                                        <input
                                          type="number"
                                          value={rightBalanceEdit}
                                          onChange={e => setRightBalanceEdit(e.target.value)}
                                          placeholder="请输入当前余额"
                                          className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                                          style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
                                          autoFocus
                                        />
                                      </div>
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">初始金额 (元)</div>
                                        <input
                                          type="number"
                                          value={rightInitialEdit}
                                          onChange={e => setRightInitialEdit(e.target.value)}
                                          placeholder="请输入初始金额"
                                          className="w-full text-sm border rounded-lg px-3 py-2 outline-none"
                                          style={{ borderColor: "#BFDBFE", backgroundColor: "#FFFFFF" }}
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
                                      <div className="text-xs text-gray-400">登记日期将自动设为今日 ({todayStr})</div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}

                        {/* 编辑模式 */}
                        {rightEditMode && (
                          <>
                            <div className="space-y-2 mb-3">
                              {rightMarginEdits.map((entry, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  {/* 币种选择 */}
                                  <div className="flex gap-1 flex-wrap">
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
                                          backgroundColor: (entry.coin || "ETH") === c ? "#2563eb" : "#F0F4FF",
                                          color: (entry.coin || "ETH") === c ? "#FFFFFF" : "#374151",
                                        }}
                                      >
                                        {c}
                                      </button>
                                    ))}
                                  </div>
                                  {/* 数量输入 */}
                                  <input
                                    type="number"
                                    value={entry.amount}
                                    onChange={(e) => {
                                      const next = [...rightMarginEdits];
                                      next[idx] = { ...next[idx], amount: e.target.value };
                                      setRightMarginEdits(next);
                                    }}
                                    placeholder="数量"
                                    className="w-24 text-sm border rounded-lg px-2 py-1.5 outline-none"
                                    style={{ borderColor: "#BFDBFE", backgroundColor: "#F8FBFF" }}
                                  />
                                  {/* 删除行 */}
                                  {rightMarginEdits.length > 1 && (
                                    <button
                                      onClick={() => setRightMarginEdits(rightMarginEdits.filter((_, i) => i !== idx))}
                                      className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0"
                                      style={{ backgroundColor: "#FFF5F5" }}
                                    >
                                      <X className="w-3 h-3 text-red-400" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {/* 添加币种行 */}
                              <button
                                onClick={() => setRightMarginEdits([...rightMarginEdits, { coin: "ETH", amount: "" }])}
                                className="flex items-center gap-1 text-xs text-blue-500 mt-1"
                              >
                                <Plus className="w-3 h-3" />添加币种
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
