/**
 * DepositManage.tsx
 * 保证金管理页（仅 37 号账本 / owner+admin 可访问）
 * UI重设计：蓝色渐变主题，与订单管理/管理费明细风格统一
 *
 * 数据与初始金额管理完全联动：
 *   读取：ledger.adminGetAllInitialBalances → balancesMap[userId][tagName__margin / tagName__marginCoin]
 *   写入：ledger.adminSetMemberInitialBalances（保留所有其他字段，只更新 margin/marginCoin）
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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

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

  const [filterHasDeposit, setFilterHasDeposit] = useState(false);
  const [hideEmptyTags, setHideEmptyTags] = useState<Record<number, boolean>>({});
  // 默认全部折叠，key=userId, true=展开
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

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: "#F0F4FF" }}>
      {/* 蓝色渐变顶部 */}
      <div
        className="sticky top-0 z-20 px-4 pt-4 pb-5"
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
            <div className="text-xs text-blue-200">{members.length} 人 · {stats.totalCount} 笔</div>
          </div>
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
        </div>
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
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
                {/* 成员头部 — 点击展开/折叠 */}
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

                {/* 标签行 — 仅展开时显示 */}
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

      {/* 底部Sheet编辑态 */}
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
