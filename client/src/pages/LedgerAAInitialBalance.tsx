/**
 * LedgerAAInitialBalance.tsx
 * 定制账本(AA) 初始金额管理页
 * 仅账本创建人(owner)和管理员(admin)可访问
 *
 * 每个成员 × 每个标签 可设置：
 *  - 显示开关（visible）：是否在该用户界面显示该标签
 *  - 开始日期（startDate）：该标签对该用户生效的起始日期
 *  - 初始比例（ratio）：0%~100%
 *  - 初始金额（amount）：¥
 *  - 初始保证金（margin）：数字币数量 or 人民币
 *  - 保证金币种（marginCoin）：BTC/ETH/SOL/LDO/""（空=人民币）
 *
 * JSON key 规则（存入 ledger_members.initial_balances）：
 *   tagName                → 初始金额（人民币）
 *   tagName__ratio         → 初始比例
 *   tagName__margin        → 初始保证金数量（数字币数量 or 人民币金额）
 *   tagName__marginCoin    → 保证金币种（BTC/ETH/SOL/LDO，空=人民币）
 *   tagName__startDate     → 开始日期 (YYYY-MM-DD)
 *   tagName__visible       → 显示开关 (1 = 显示, 0 = 隐藏)
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

// 支持的数字币配置（使用OKX API格式）
const CRYPTO_COINS = [
  { symbol: "BTC-USDT", name: "BTC", label: "比特币" },
  { symbol: "ETH-USDT", name: "ETH", label: "以太坊" },
  { symbol: "SOL-USDT", name: "SOL", label: "索拉纳" },
  { symbol: "LDO-USDT", name: "LDO", label: "LDO" },
];

// 价格缓存（模块级，跨组件实例共享）
let cryptoPriceCache: Record<string, number> = {};
let cnyRateCache = 0;
let lastFetchTime = 0;
const CACHE_TTL = 10 * 1000; // 10秒刷新一次（Binance API，不占用服务器资源）

async function fetchCryptoPrices(): Promise<{ prices: Record<string, number>; cnyRate: number }> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL && cnyRateCache > 0 && Object.keys(cryptoPriceCache).length > 0) {
    return { prices: cryptoPriceCache, cnyRate: cnyRateCache };
  }
  try {
    // 使用OKX API（国内可访问），USDT/CNY汇率固定7.0
    const CNY_RATE = 7.0;
    const results = await Promise.all(
      CRYPTO_COINS.map((c) =>
        fetch(`https://www.okx.com/api/v5/market/ticker?instId=${c.symbol}`)
          .then((r) => r.json())
          .catch(() => null)
      )
    );
    const prices: Record<string, number> = {};
    CRYPTO_COINS.forEach((coin, i) => {
      const r = results[i];
      const last = r?.data?.[0]?.last;
      if (last) prices[coin.name] = parseFloat(last) * CNY_RATE;
    });
    cryptoPriceCache = prices;
    cnyRateCache = CNY_RATE;
    lastFetchTime = now;
    return { prices, cnyRate: CNY_RATE };
  } catch {
    return { prices: cryptoPriceCache, cnyRate: cnyRateCache || 7.25 };
  }
}

interface TagEntry {
  amount: string;
  ratio: string;
  margin: string;
  marginCoin: string; // "" = 人民币, "BTC"/"ETH"/"SOL"/"LDO" = 数字币
  startDate: string;
  visible: boolean;
}

const defaultEntry = (): TagEntry => ({
  amount: "",
  ratio: "",
  margin: "",
  marginCoin: "",
  startDate: "",
  visible: true,
});

export default function LedgerAAInitialBalance() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

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

  const [editState, setEditState] = useState<
    Record<number, Record<string, TagEntry>>
  >({});
  const [dirtyUsers, setDirtyUsers] = useState<Set<number>>(new Set());
  const [savingUsers, setSavingUsers] = useState<Set<number>>(new Set());

  // 数字币价格（CNY）
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>(cryptoPriceCache);
  const fetchingRef = useRef(false);

  const loadPrices = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { prices } = await fetchCryptoPrices();
      setCryptoPrices({ ...prices });
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadPrices();
    const timer = window.setInterval(loadPrices, CACHE_TTL);
    return () => window.clearInterval(timer);
  }, [loadPrices]);

  useEffect(() => {
    if (!allBalancesData) return;
    const initial: Record<number, Record<string, TagEntry>> = {};
    for (const member of (allBalancesData as any).members) {
      const balances =
        (allBalancesData as any).balancesMap[member.userId] ?? {};
      initial[member.userId] = {};
      for (const cat of categories) {
        const n = cat.name;
        initial[member.userId][n] = {
          amount:
            balances[n] !== undefined ? String(balances[n]) : "",
          ratio:
            balances[`${n}__ratio`] !== undefined
              ? String(balances[`${n}__ratio`])
              : "",
          margin:
            balances[`${n}__margin`] !== undefined
              ? String(balances[`${n}__margin`])
              : "",
          marginCoin: balances[`${n}__marginCoin`] ?? "",
          startDate: balances[`${n}__startDate`] ?? "",
          visible:
            balances[`${n}__visible`] !== undefined
              ? Number(balances[`${n}__visible`]) !== 0
              : true,
        };
      }
    }
    setEditState(initial);
    setDirtyUsers(new Set());
  }, [allBalancesData, categories]);

  const setMutation = trpc.ledger.adminSetMemberInitialBalances.useMutation({
    onSuccess: (_, variables) => {
      setSavingUsers((prev) => {
        const next = new Set(prev);
        next.delete(variables.targetUserId);
        return next;
      });
      setDirtyUsers((prev) => {
        const next = new Set(prev);
        next.delete(variables.targetUserId);
        return next;
      });
      toast.success("已保存");
      refetch();
    },
    onError: (err, variables) => {
      setSavingUsers((prev) => {
        const next = new Set(prev);
        next.delete(variables.targetUserId);
        return next;
      });
      toast.error((err as any).message || "保存失败");
    },
  });

  const updateEntry = (
    userId: number,
    catName: string,
    patch: Partial<TagEntry>
  ) => {
    setEditState((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [catName]: {
          ...(prev[userId]?.[catName] ?? defaultEntry()),
          ...patch,
        },
      },
    }));
    setDirtyUsers((prev) => new Set(prev).add(userId));
  };

  const handleSaveMember = (userId: number) => {
    const userEdit = editState[userId] ?? {};
    const balances: Record<string, number | string> = {};
    for (const cat of categories) {
      const n = cat.name;
      const entry = userEdit[n] ?? defaultEntry();

      if (entry.amount !== "") {
        const num = parseFloat(entry.amount);
        if (!isNaN(num)) balances[n] = num;
      }
      if (entry.ratio !== "") {
        const num = parseFloat(entry.ratio);
        if (!isNaN(num)) balances[`${n}__ratio`] = Math.min(100, Math.max(0, num));
      }
      if (entry.margin !== "") {
        const num = parseFloat(entry.margin);
        if (!isNaN(num)) balances[`${n}__margin`] = num;
      }
      // 保存币种（空字符串表示人民币）
      balances[`${n}__marginCoin`] = entry.marginCoin;
      if (entry.startDate) {
        balances[`${n}__startDate`] = entry.startDate;
      }
      balances[`${n}__visible`] = entry.visible ? 1 : 0;
    }
    setSavingUsers((prev) => new Set(prev).add(userId));
    setMutation.mutate({
      ledgerId,
      targetUserId: userId,
      balances: balances as Record<string, number>,
    });
  };

  // 计算保证金人民币价值
  const calcMarginCNY = (margin: string, coin: string): string | null => {
    const num = parseFloat(margin);
    if (isNaN(num) || num === 0) return null;
    if (!coin) return null; // 法币模式不需要折算
    const price = cryptoPrices[coin];
    if (!price) return null;
    const cny = num * price;
    return `≈ ¥${cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  };

  const canAccess =
    ledgerData?.userRole === "owner" || ledgerData?.userRole === "admin";

  if (!ledgerData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#FAF3ED" }}
      >
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#FAF3ED" }}
      >
        <div className="text-gray-500">无权限访问</div>
      </div>
    );
  }

  const members = (allBalancesData as any)?.members ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF3ED" }}>
      {/* 顶部导航栏 */}
      <div
        className="flex items-center px-4 py-3 sticky top-0 z-10"
        style={{ backgroundColor: "#D32F2F" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          className="mr-3 text-white"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-white font-semibold text-base flex-1">
          初始金额管理
        </h1>
        {/* 价格状态指示 */}
        <div className="text-xs text-white/60">
          {Object.keys(cryptoPrices).length > 0 ? "价格已加载" : "加载价格..."}
        </div>
      </div>

      {/* 说明文字 */}
      <div className="mx-4 mt-3 mb-2 text-xs text-gray-500 leading-relaxed">
        为每位成员设置各标签的显示开关、开始日期、初始比例（0%~100%）、初始金额和初始保证金。保证金支持数字币（BTC/ETH/SOL/LDO），将实时显示人民币价值。
      </div>

      {categories.length === 0 ? (
        <div className="mx-4 mt-6 text-center text-gray-400 text-sm">
          该账本暂无标签，请先在分类管理中添加标签
        </div>
      ) : (
        <div className="pb-8">
          {members.length === 0 ? (
            <div className="mx-4 mt-6 text-center text-gray-400 text-sm">
              暂无成员
            </div>
          ) : (
            members.map((member: any) => {
              const userId = member.userId;
              const userEdit = editState[userId] ?? {};
              const isDirty = dirtyUsers.has(userId);
              const isSaving = savingUsers.has(userId);

              return (
                <div
                  key={userId}
                  className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm"
                  style={{ backgroundColor: "#FFFFFF" }}
                >
                  {/* 成员头部 */}
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid #F0E8E0" }}
                  >
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        username={member.username}
                        avatar={member.avatar}
                        nickname={member.nickname}
                        size="sm"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {member.nickname || member.username || "未知用户"}
                        </div>
                        <div className="text-xs text-gray-400">
                          {member.role === "owner"
                            ? "创建人"
                            : member.role === "admin"
                            ? "管理员"
                            : "成员"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveMember(userId)}
                      disabled={!isDirty || isSaving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor:
                          isDirty && !isSaving ? "#D32F2F" : "#E0E0E0",
                        color:
                          isDirty && !isSaving ? "#FFFFFF" : "#9E9E9E",
                      }}
                    >
                      <Save size={12} />
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>

                  {/* 标签行 */}
                  <div className="px-4 py-2 space-y-4">
                    {categories.map((cat: any) => {
                      const entry = userEdit[cat.name] ?? defaultEntry();
                      const marginCNY = calcMarginCNY(entry.margin, entry.marginCoin);
                      return (
                        <div
                          key={cat.id}
                          className="rounded-xl py-3 px-3 space-y-2"
                          style={{ backgroundColor: "#FAF3ED" }}
                        >
                          {/* 行1：标签名 + 显示开关 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: cat.color || "#D32F2F",
                                }}
                              />
                              <span className="text-sm font-semibold text-gray-800">
                                {cat.name}
                              </span>
                            </div>
                            {/* 显示开关 */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {entry.visible ? "显示" : "隐藏"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateEntry(userId, cat.name, {
                                    visible: !entry.visible,
                                  })
                                }
                                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                                style={{
                                  backgroundColor: entry.visible
                                    ? "#D32F2F"
                                    : "#D1D5DB",
                                }}
                              >
                                <span
                                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                                  style={{
                                    transform: entry.visible
                                      ? "translateX(18px)"
                                      : "translateX(2px)",
                                  }}
                                />
                              </button>
                            </div>
                          </div>

                          {/* 行2：开始日期 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                              开始日期
                            </span>
                            <input
                              type="date"
                              value={entry.startDate}
                              onChange={(e) =>
                                updateEntry(userId, cat.name, {
                                  startDate: e.target.value,
                                })
                              }
                              className="flex-1 text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                              style={{
                                borderColor: "#E0E0E0",
                                backgroundColor: "#FFFFFF",
                                color: "#222222",
                              }}
                            />
                          </div>

                          {/* 行3：初始比例 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                              初始比例
                            </span>
                            <div className="flex items-center gap-1 flex-1">
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                min={0}
                                max={100}
                                value={entry.ratio}
                                onChange={(e) =>
                                  updateEntry(userId, cat.name, {
                                    ratio: e.target.value,
                                  })
                                }
                                className="flex-1 text-right text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                                style={{
                                  borderColor: "#E0E0E0",
                                  backgroundColor: "#FFFFFF",
                                  color: "#222222",
                                }}
                              />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          </div>

                          {/* 行4：初始金额 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                              初始金额
                            </span>
                            <div className="flex items-center gap-1 flex-1">
                              <span className="text-xs text-gray-400">¥</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={entry.amount}
                                onChange={(e) =>
                                  updateEntry(userId, cat.name, {
                                    amount: e.target.value,
                                  })
                                }
                                className="flex-1 text-right text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                                style={{
                                  borderColor: "#E0E0E0",
                                  backgroundColor: "#FFFFFF",
                                  color: "#222222",
                                }}
                              />
                            </div>
                          </div>

                          {/* 行5：初始保证金（支持数字币） */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 w-full overflow-hidden">
                              <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                                初始保证金
                              </span>
                              {/* 币种选择器 */}
                              <select
                                value={entry.marginCoin}
                                onChange={(e) =>
                                  updateEntry(userId, cat.name, {
                                    marginCoin: e.target.value,
                                  })
                                }
                                className="text-xs border rounded-lg px-1 py-1 outline-none focus:border-red-400 flex-shrink-0"
                                style={{
                                  borderColor: "#E0E0E0",
                                  backgroundColor: "#FFFFFF",
                                  color: entry.marginCoin ? "#D32F2F" : "#9E9E9E",
                                  width: "60px",
                                }}
                              >
                                <option value="">¥法币</option>
                                {CRYPTO_COINS.map((c) => (
                                  <option key={c.name} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              {/* 数量输入 */}
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={entry.margin}
                                onChange={(e) =>
                                  updateEntry(userId, cat.name, {
                                    margin: e.target.value,
                                  })
                                }
                                className="min-w-0 flex-1 text-right text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                                style={{
                                  borderColor: "#E0E0E0",
                                  backgroundColor: "#FFFFFF",
                                  color: "#222222",
                                }}
                              />
                            </div>
                            {/* 人民币折算显示 */}
                            {marginCNY && (
                              <div className="flex justify-end">
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: "#FFF0F0",
                                    color: "#D32F2F",
                                  }}
                                >
                                  {marginCNY}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="h-3" />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
