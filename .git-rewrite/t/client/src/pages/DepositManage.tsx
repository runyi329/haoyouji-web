/**
 * DepositManage.tsx
 * 保证金管理页（仅 37 号账本 / owner+admin 可访问）
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
  Check,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

const CRYPTO_COINS = ["BTC", "ETH", "SOL", "LDO", "USDT", "元"];
// 归一化币种：「人民币」「」都统一为「元」
const normalizeCoin = (coin: string) => (!coin || coin === "人民币") ? "元" : coin;
const CNY_RATE = 7.0;

interface DepositEntry {
  margin: string;
  marginCoin: string; // "" = 人民币
}

// 折算人民币数值（用于统计）
function toCNY(margin: string, coin: string, prices: Record<string, number>): number {
  const num = parseFloat(margin);
  if (isNaN(num) || num <= 0) return 0;
  if (!coin || coin === "人民币" || coin === "元") return num; // 元/人民币
  if (coin === "USDT") return num * CNY_RATE;
  const price = prices[coin];
  if (!price) return 0;
  return num * price;
}

export default function DepositManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // 全局开关：只显示有保证金的人
  const [filterHasDeposit, setFilterHasDeposit] = useState(false);
  // 各用户卡片的「隐藏空标签」开关，默认全部隐藏空标签
  const [hideEmptyTags, setHideEmptyTags] = useState<Record<number, boolean>>({});

  // 获取标签列表
  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  const categories = useMemo(() => {
    if (!rawCategories) return [];
    return (rawCategories as any[]).filter((c) => !c.isDefault);
  }, [rawCategories]);

  // 获取所有成员初始金额
  const { data: allBalancesData, refetch } =
    trpc.ledger.adminGetAllInitialBalances.useQuery(
      { ledgerId },
      { enabled: !!ledgerId }
    );

  // 实时价格
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

  // 本地编辑状态：{ userId -> { tagName -> DepositEntry } }
  const [editState, setEditState] = useState<
    Record<number, Record<string, DepositEntry>>
  >({});
  // 当前正在编辑的行
  const [editingCell, setEditingCell] = useState<{
    userId: number;
    tagName: string;
  } | null>(null);
  // 编辑草稿
  const [draft, setDraft] = useState<DepositEntry>({ margin: "", marginCoin: "" });
  // 完整 balancesMap（保留所有字段，写回时不丢失其他数据）
  const [fullBalancesMap, setFullBalancesMap] = useState<
    Record<number, Record<string, any>>
  >({});

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
          margin:
            balances[`${n}__margin`] !== undefined
              ? String(balances[`${n}__margin`])
              : "",
          marginCoin: balances[`${n}__marginCoin`] ?? "",
        };
      }
    }
    setEditState(initial);
    setFullBalancesMap(fullMap);
  }, [allBalancesData, categories]);

  const setMutation = trpc.ledger.adminSetMemberInitialBalances.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      refetch();
    },
    onError: (err) => {
      toast.error((err as any).message || "保存失败");
    },
  });

  const startEdit = (userId: number, tagName: string) => {
    const entry = editState[userId]?.[tagName] ?? { margin: "", marginCoin: "" };
    setDraft({ ...entry });
    setEditingCell({ userId, tagName });
  };

  const saveCell = (userId: number, tagName: string) => {
    setEditState((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [tagName]: { ...draft } },
    }));
    const full = { ...(fullBalancesMap[userId] ?? {}) };
    for (const cat of categories) {
      const n = cat.name;
      const entry =
        n === tagName
          ? draft
          : (editState[userId]?.[n] ?? { margin: "", marginCoin: "" });
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
    setEditingCell(null);
  };

  // 二次确认弹窗 state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    desc: string;
    onConfirm: () => void;
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
          [userId]: {
            ...(prev[userId] ?? {}),
            [tagName]: { margin: "", marginCoin: "" },
          },
        }));
        const full = { ...(fullBalancesMap[userId] ?? {}) };
        delete full[`${tagName}__margin`];
        full[`${tagName}__marginCoin`] = "";
        setMutation.mutate({ ledgerId, targetUserId: userId, balances: full });
        setEditingCell(null);
      }
    );
  };

  const calcCNYStr = (margin: string, coin: string): string | null => {
    const num = parseFloat(margin);
    if (isNaN(num) || num === 0) return null;
    if (!coin)
      return `¥${num.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
    const price = coin === "USDT" ? CNY_RATE : cryptoPrices[coin];
    if (!price) return null;
    return `≈¥${(num * price).toLocaleString("zh-CN", {
      maximumFractionDigits: 0,
    })}`;
  };

  const members = useMemo(
    () => (allBalancesData as any)?.members ?? [],
    [allBalancesData]
  );

  // ── 汇总统计 ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // 按币种统计
    const byCoin: Record<string, { count: number; total: number }> = {};
    // 按成员统计
    const byMember: Record<
      number,
      { name: string; count: number; totalCNY: number }
    > = {};

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
    const totalCNY = Object.values(byMember).reduce(
      (s, v) => s + v.totalCNY,
      0
    );

    return { byCoin, byMember, totalCount, totalCNY };
  }, [members, editState, categories, cryptoPrices]);

  // 过滤后的成员列表（按总保证金折算人民币从高到低排序）
  const filteredMembers = useMemo(() => {
    let list = members;
    if (filterHasDeposit) {
      list = members.filter((m: any) => {
        const userEdit = editState[m.userId] ?? {};
        return categories.some((cat: any) => {
          const e = userEdit[cat.name];
          return e && parseFloat(e.margin) > 0;
        });
      });
    }
    // 按总保证金（折算人民币）从高到低排序
    return [...list].sort((a: any, b: any) => {
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
  }, [members, editState, categories, filterHasDeposit, cryptoPrices]);

  return (
    <div
      className="min-h-screen pb-10"
      style={{ backgroundColor: "#F7F3EE", fontFamily: "sans-serif" }}
    >
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #F0E8E0" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "#F5F5F5" }}
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="text-base font-semibold text-gray-800">保证金管理</div>
          <div className="text-xs text-gray-400">
            共 {stats.totalCount} 笔 · {members.length} 人
          </div>
        </div>
        {/* 只显示有保证金的人 开关 */}
        <button
          onClick={() => setFilterHasDeposit((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{
            backgroundColor: filterHasDeposit ? "#D32F2F" : "#F5F5F5",
            color: filterHasDeposit ? "#FFFFFF" : "#666666",
          }}
        >
          {filterHasDeposit ? (
            <Eye className="w-3 h-3" />
          ) : (
            <EyeOff className="w-3 h-3" />
          )}
          {filterHasDeposit ? "有保证金" : "全部"}
        </button>
      </div>

      {/* ── 汇总统计卡片 ── */}
      <div className="mx-4 mt-3 space-y-2">
        {/* 总览行 */}
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="text-sm font-semibold text-gray-700">总计</div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-red-700">
                {stats.totalCount}
              </div>
              <div className="text-xs text-gray-400">笔保证金</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-800">
                ≈¥
                {stats.totalCNY.toLocaleString("zh-CN", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-xs text-gray-400">折合人民币</div>
            </div>
          </div>
        </div>

        {/* 按币种统计 */}
        {Object.keys(stats.byCoin).length > 0 && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <div className="text-xs font-semibold text-gray-500 mb-2">
              按币种
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(stats.byCoin)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([coin, data]) => (
                  <div
                    key={coin}
                    className="flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{ backgroundColor: "#FFF8F5" }}
                  >
                    <div>
                      <div className="text-xs font-semibold text-gray-700">
                        {coin}
                      </div>
                      <div className="text-xs text-gray-400">
                        {data.count} 笔
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-red-700">
                        {data.total.toLocaleString("zh-CN", {
                          maximumFractionDigits: 4,
                        })}
                      </div>
                      {coin !== "元" && (
                        <div className="text-xs text-gray-400">
                          {calcCNYStr(String(data.total), coin === "元" ? "" : coin)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 按成员统计（只显示有保证金的） */}
        {members.some(
          (m: any) => (stats.byMember[m.userId]?.count ?? 0) > 0
        ) && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <div className="text-xs font-semibold text-gray-500 mb-2">
              按成员
            </div>
            <div className="space-y-1.5">
              {members
                .filter((m: any) => (stats.byMember[m.userId]?.count ?? 0) > 0)
                .sort(
                  (a: any, b: any) =>
                    (stats.byMember[b.userId]?.totalCNY ?? 0) -
                    (stats.byMember[a.userId]?.totalCNY ?? 0)
                )
                .map((m: any) => {
                  const ms = stats.byMember[m.userId];
                  return (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          userId={m.userId}
                          nickname={m.nickname || m.username}
                          size={22}
                        />
                        <span className="text-xs text-gray-700">
                          {m.nickname || m.username}
                        </span>
                        <span className="text-xs text-gray-400">
                          {ms.count} 笔
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-gray-700">
                        ≈¥
                        {ms.totalCNY.toLocaleString("zh-CN", {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── 成员列表 ── */}
      <div className="mx-4 mt-3 space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-8">
            暂无有保证金的成员
          </div>
        ) : (
          filteredMembers.map((member: any) => {
            const userEdit = editState[member.userId] ?? {};
            const depositEntries = categories.filter((cat: any) => {
              const e = userEdit[cat.name];
              return e && parseFloat(e.margin) > 0;
            });
            const isHidingEmpty = hideEmptyTags[member.userId] !== false; // 默认隐藏空标签

            // 要展示的标签行
            const visibleCats = isHidingEmpty
              ? categories.filter((cat: any) => {
                  const e = userEdit[cat.name];
                  return e && parseFloat(e.margin) > 0;
                })
              : categories;

            return (
              <div
                key={member.userId}
                className="rounded-2xl overflow-hidden shadow-sm"
                style={{ backgroundColor: "#FFFFFF" }}
              >
                {/* 成员头部 */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #F7F3EE" }}
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      userId={member.userId}
                      nickname={member.nickname || member.username}
                      size={28}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {member.nickname || member.username || "未知"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {depositEntries.length > 0
                          ? `${depositEntries.length} 项保证金`
                          : "暂无保证金"}
                      </div>
                    </div>
                  </div>
                  {/* 隐藏空标签开关 */}
                  <button
                    onClick={() =>
                      setHideEmptyTags((prev) => ({
                        ...prev,
                        [member.userId]: !isHidingEmpty,
                      }))
                    }
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all"
                    style={{
                      backgroundColor: isHidingEmpty ? "#FFF0F0" : "#F5F5F5",
                      color: isHidingEmpty ? "#D32F2F" : "#999999",
                    }}
                  >
                    {isHidingEmpty ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronUp className="w-3 h-3" />
                    )}
                    {isHidingEmpty ? "展开全部" : "收起空项"}
                  </button>
                </div>

                {/* 标签行 */}
                <div className="px-4 py-2 space-y-2">
                  {visibleCats.length === 0 ? (
                    <div className="text-xs text-gray-300 py-1">暂无保证金</div>
                  ) : (
                    visibleCats.map((cat: any) => {
                      const entry = userEdit[cat.name] ?? {
                        margin: "",
                        marginCoin: "",
                      };
                      const isCellEditing =
                        editingCell?.userId === member.userId &&
                        editingCell?.tagName === cat.name;
                      const hasValue =
                        entry.margin && parseFloat(entry.margin) > 0;

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center gap-2 py-1.5"
                        >
                          {/* 标签色点 + 名称 */}
                          <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: cat.color || "#D32F2F",
                              }}
                            />
                            <span className="text-xs text-gray-600 truncate">
                              {cat.name}
                            </span>
                          </div>

                          {isCellEditing ? (
                            /* 编辑模式 */
                            <div className="flex-1 flex items-center gap-1.5">
                              <input
                                type="number"
                                value={draft.margin}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    margin: e.target.value,
                                  }))
                                }
                                placeholder="数量"
                                className="flex-1 min-w-0 text-sm border rounded-lg px-2 py-1 outline-none"
                                style={{ borderColor: "#E0D5CC" }}
                                autoFocus
                              />
                              <select
                                value={
                                  draft.marginCoin === "" || draft.marginCoin === "人民币" ? "元" : draft.marginCoin
                                }
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    marginCoin:
                                      e.target.value === "元"
                                        ? "元"
                                        : e.target.value,
                                  }))
                                }
                                className="text-xs border rounded-lg px-1 py-1 outline-none"
                                style={{ borderColor: "#E0D5CC" }}
                              >
                                {CRYPTO_COINS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => saveCell(member.userId, cat.name)}
                                className="w-7 h-7 flex items-center justify-center rounded-full"
                                style={{ backgroundColor: "#E8F5E9" }}
                              >
                                <Check className="w-3.5 h-3.5 text-green-700" />
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
                                className="w-7 h-7 flex items-center justify-center rounded-full"
                                style={{ backgroundColor: "#F5F5F5" }}
                              >
                                <X className="w-3.5 h-3.5 text-gray-500" />
                              </button>
                            </div>
                          ) : (
                            /* 查看模式 */
                            <div className="flex-1 flex items-center justify-between gap-2">
                              {hasValue ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-gray-800">
                                    {parseFloat(entry.margin).toLocaleString(
                                      "zh-CN",
                                      { maximumFractionDigits: 4 }
                                    )}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {entry.marginCoin || "元"}
                                  </span>
                                  {entry.marginCoin && (
                                    <span className="text-xs text-gray-400">
                                      {calcCNYStr(entry.margin, entry.marginCoin)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">
                                  未设置
                                </span>
                              )}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    startEdit(member.userId, cat.name)
                                  }
                                  className="w-7 h-7 flex items-center justify-center rounded-full"
                                  style={{ backgroundColor: "#FFF0F0" }}
                                >
                                  <Pencil className="w-3 h-3 text-red-600" />
                                </button>
                                {hasValue && (
                                  <button
                                    onClick={() =>
                                      clearCell(member.userId, cat.name, member.nickname || member.name || String(member.userId))
                                    }
                                    className="w-7 h-7 flex items-center justify-center rounded-full"
                                    style={{ backgroundColor: "#FFF5F5" }}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

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
