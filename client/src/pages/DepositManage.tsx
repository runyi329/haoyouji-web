/**
 * DepositManage.tsx
 * 保证金管理页（仅 37 号账本 / owner+admin 可访问）
 *
 * 数据与初始金额管理完全联动：
 *   读取：ledger.adminGetAllInitialBalances → balancesMap[userId][tagName__margin / tagName__marginCoin]
 *   写入：ledger.adminSetMemberInitialBalances（保留所有其他字段，只更新 margin/marginCoin）
 */
import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

const CRYPTO_COINS = ["BTC", "ETH", "SOL", "LDO", "USDT", "人民币"];
const CNY_RATE = 7.0;

interface DepositEntry {
  margin: string;
  marginCoin: string; // "" = 人民币
}

export default function DepositManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

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
    refetchInterval: 10000,
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
        result[coin] = usdtPrice * CNY_RATE;
      }
      result["USDT"] = CNY_RATE;
    }
    return result;
  }, [cryptoPricesRaw]);

  // 本地编辑状态：{ userId -> { tagName -> DepositEntry } }
  const [editState, setEditState] = useState<
    Record<number, Record<string, DepositEntry>>
  >({});
  // 当前正在编辑的行：{ userId, tagName } | null
  const [editingCell, setEditingCell] = useState<{
    userId: number;
    tagName: string;
  } | null>(null);
  // 编辑草稿
  const [draft, setDraft] = useState<DepositEntry>({ margin: "", marginCoin: "" });

  // 完整的 balancesMap（保留所有字段，用于写回时不丢失其他数据）
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

  // 开始编辑某行
  const startEdit = (userId: number, tagName: string) => {
    const entry = editState[userId]?.[tagName] ?? { margin: "", marginCoin: "" };
    setDraft({ ...entry });
    setEditingCell({ userId, tagName });
  };

  // 保存某行
  const saveCell = (userId: number, tagName: string) => {
    // 更新本地 editState
    setEditState((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [tagName]: { ...draft },
      },
    }));

    // 构造完整 balances（保留其他字段，只覆盖 margin/marginCoin）
    const full = { ...(fullBalancesMap[userId] ?? {}) };
    // 更新所有标签的保证金（只改当前 tag）
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

    setMutation.mutate({
      ledgerId,
      targetUserId: userId,
      balances: full,
    });
    setEditingCell(null);
  };

  // 清除某行保证金
  const clearCell = (userId: number, tagName: string) => {
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
    setMutation.mutate({
      ledgerId,
      targetUserId: userId,
      balances: full,
    });
    setEditingCell(null);
  };

  // 折算人民币
  const calcCNY = (margin: string, coin: string): string | null => {
    const num = parseFloat(margin);
    if (isNaN(num) || num === 0) return null;
    if (!coin) return `¥${num.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
    const price = coin === "USDT" ? CNY_RATE : cryptoPrices[coin];
    if (!price) return null;
    return `≈¥${(num * price).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  };

  const members = useMemo(
    () => (allBalancesData as any)?.members ?? [],
    [allBalancesData]
  );

  // 统计：有保证金的成员数
  const totalWithDeposit = useMemo(() => {
    return members.filter((m: any) => {
      const userEdit = editState[m.userId] ?? {};
      return categories.some((cat: any) => {
        const e = userEdit[cat.name];
        return e && e.margin && parseFloat(e.margin) > 0;
      });
    }).length;
  }, [members, editState, categories]);

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
        <div>
          <div className="text-base font-semibold text-gray-800">保证金管理</div>
          <div className="text-xs text-gray-400">
            {totalWithDeposit} 人已设置 · 共 {members.length} 人
          </div>
        </div>
      </div>

      {/* 说明 */}
      <div className="mx-4 mt-3 mb-2 text-xs text-gray-400 leading-relaxed">
        与初始金额管理中的保证金字段完全联动，修改此处会同步更新初始金额管理。
      </div>

      {/* 成员列表 */}
      {members.length === 0 ? (
        <div className="text-center text-gray-400 text-sm mt-12">暂无成员数据</div>
      ) : (
        <div className="mx-4 space-y-3">
          {members.map((member: any) => {
            const userEdit = editState[member.userId] ?? {};
            // 该成员所有有保证金的条目
            const depositEntries = categories
              .map((cat: any) => ({
                cat,
                entry: userEdit[cat.name] ?? { margin: "", marginCoin: "" },
              }))
              .filter(({ entry }) => entry.margin && parseFloat(entry.margin) > 0);

            const isEditing =
              editingCell?.userId === member.userId;

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
                    <span className="text-sm font-medium text-gray-800">
                      {member.nickname || member.username || "未知"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {depositEntries.length > 0
                      ? `${depositEntries.length} 项保证金`
                      : "暂无保证金"}
                  </div>
                </div>

                {/* 保证金条目列表 */}
                <div className="px-4 py-2 space-y-2">
                  {categories.map((cat: any) => {
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
                      <div key={cat.id} className="flex items-center gap-2 py-1.5">
                        {/* 标签色点 + 名称 */}
                        <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color || "#D32F2F" }}
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
                                setDraft((d) => ({ ...d, margin: e.target.value }))
                              }
                              placeholder="数量"
                              className="flex-1 min-w-0 text-sm border rounded-lg px-2 py-1 outline-none"
                              style={{ borderColor: "#E0D5CC" }}
                              autoFocus
                            />
                            <select
                              value={draft.marginCoin}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, marginCoin: e.target.value === "人民币" ? "" : e.target.value }))
                              }
                              className="text-xs border rounded-lg px-1 py-1 outline-none"
                              style={{ borderColor: "#E0D5CC" }}
                            >
                              {CRYPTO_COINS.map((c) => (
                                <option key={c} value={c === "人民币" ? "" : c}>
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
                                  {parseFloat(entry.margin).toLocaleString("zh-CN", {
                                    maximumFractionDigits: 4,
                                  })}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {entry.marginCoin || "元"}
                                </span>
                                {entry.marginCoin && (
                                  <span className="text-xs text-gray-400">
                                    {calcCNY(entry.margin, entry.marginCoin)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">未设置</span>
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(member.userId, cat.name)}
                                className="w-7 h-7 flex items-center justify-center rounded-full"
                                style={{ backgroundColor: "#FFF0F0" }}
                              >
                                <Pencil className="w-3 h-3 text-red-600" />
                              </button>
                              {hasValue && (
                                <button
                                  onClick={() => clearCell(member.userId, cat.name)}
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
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
