/**
 * LedgerAAInitialBalance.tsx
 * 定制账本(AA) 初始金额管理页
 * 仅账本创建人(owner)和管理员(admin)可访问
 *
 * 功能：
 * - 列出账本所有真实成员
 * - 每个成员下列出所有标签（账本一级分类）
 * - 可为每个成员的每个标签设置初始比例（0%~100%）和初始金额
 * - 保存时调用 adminSetMemberInitialBalances 接口
 */
import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

export default function LedgerAAInitialBalance() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  // 获取账本详情（验证类型和权限）
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId }, { enabled: !!ledgerId });

  // 获取账本一级分类（标签）
  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  const categories = useMemo(() => {
    if (!rawCategories) return [];
    return rawCategories.filter((c: any) => !c.isDefault);
  }, [rawCategories]);

  // 获取所有成员及其初始金额
  const { data: allBalancesData, refetch } = trpc.ledger.adminGetAllInitialBalances.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 本地编辑状态：{ [userId]: { [categoryName]: { amount: string, ratio: string } } }
  const [editState, setEditState] = useState<Record<number, Record<string, { amount: string; ratio: string }>>>({});
  // 追踪哪些用户有未保存的修改
  const [dirtyUsers, setDirtyUsers] = useState<Set<number>>(new Set());
  // 追踪正在保存的用户
  const [savingUsers, setSavingUsers] = useState<Set<number>>(new Set());

  // 当数据加载完成后，初始化编辑状态
  useEffect(() => {
    if (!allBalancesData) return;
    const initial: Record<number, Record<string, { amount: string; ratio: string }>> = {};
    for (const member of allBalancesData.members) {
      const balances = allBalancesData.balancesMap[member.userId] ?? {};
      initial[member.userId] = {};
      for (const cat of categories) {
        const val = balances[cat.name];
        // ratio 存储在 key `${cat.name}__ratio` 中
        const ratioVal = balances[`${cat.name}__ratio`];
        initial[member.userId][cat.name] = {
          amount: val !== undefined ? String(val) : "",
          ratio: ratioVal !== undefined ? String(ratioVal) : "",
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
      toast.success("初始金额已保存");
      refetch();
    },
    onError: (err, variables) => {
      setSavingUsers((prev) => {
        const next = new Set(prev);
        next.delete(variables.targetUserId);
        return next;
      });
      toast.error(err.message || "保存失败");
    },
  });

  const handleAmountChange = (userId: number, catName: string, value: string) => {
    setEditState((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [catName]: {
          ...(prev[userId]?.[catName] ?? { amount: "", ratio: "" }),
          amount: value,
        },
      },
    }));
    setDirtyUsers((prev) => new Set(prev).add(userId));
  };

  const handleRatioChange = (userId: number, catName: string, value: string) => {
    // 限制 0~100
    let num = parseFloat(value);
    if (!isNaN(num)) {
      if (num < 0) num = 0;
      if (num > 100) num = 100;
      value = String(num);
    }
    setEditState((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [catName]: {
          ...(prev[userId]?.[catName] ?? { amount: "", ratio: "" }),
          ratio: value,
        },
      },
    }));
    setDirtyUsers((prev) => new Set(prev).add(userId));
  };

  const handleSaveMember = (userId: number) => {
    const userEdit = editState[userId] ?? {};
    const balances: Record<string, number> = {};
    for (const cat of categories) {
      const entry = userEdit[cat.name];
      if (entry?.amount !== undefined && entry.amount !== "") {
        const num = parseFloat(entry.amount);
        if (!isNaN(num)) {
          balances[cat.name] = num;
        }
      }
      // 比例存储在 key `${cat.name}__ratio`
      if (entry?.ratio !== undefined && entry.ratio !== "") {
        const ratioNum = parseFloat(entry.ratio);
        if (!isNaN(ratioNum)) {
          balances[`${cat.name}__ratio`] = ratioNum;
        }
      }
    }
    setSavingUsers((prev) => new Set(prev).add(userId));
    setMutation.mutate({ ledgerId, targetUserId: userId, balances });
  };

  // 权限检查
  const canAccess =
    ledgerData?.userRole === "owner" || ledgerData?.userRole === "admin";

  if (!ledgerData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF3ED" }}>
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF3ED" }}>
        <div className="text-gray-500">无权限访问</div>
      </div>
    );
  }

  const members = allBalancesData?.members ?? [];

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
        <h1 className="text-white font-semibold text-base flex-1">初始金额管理</h1>
      </div>

      {/* 说明文字 */}
      <div className="mx-4 mt-3 mb-2 text-xs text-gray-500 leading-relaxed">
        为每位成员设置各标签的初始比例（0%~100%）和初始金额。初始金额用于计算收益率和累计盈亏。
      </div>

      {/* 标签列表 */}
      {categories.length === 0 ? (
        <div className="mx-4 mt-6 text-center text-gray-400 text-sm">
          该账本暂无标签，请先在分类管理中添加标签
        </div>
      ) : (
        <div className="pb-8">
          {members.length === 0 ? (
            <div className="mx-4 mt-6 text-center text-gray-400 text-sm">暂无成员</div>
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
                    {/* 保存按钮 */}
                    <button
                      onClick={() => handleSaveMember(userId)}
                      disabled={!isDirty || isSaving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: isDirty && !isSaving ? "#D32F2F" : "#E0E0E0",
                        color: isDirty && !isSaving ? "#FFFFFF" : "#9E9E9E",
                      }}
                    >
                      <Save size={12} />
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>

                  {/* 列头 */}
                  <div
                    className="flex items-center px-4 py-1.5 text-xs text-gray-400"
                    style={{ borderBottom: "1px solid #F5F0EB" }}
                  >
                    <div className="flex-1">标签</div>
                    <div className="w-20 text-center">初始比例</div>
                    <div className="w-28 text-right">初始金额</div>
                  </div>

                  {/* 标签行 */}
                  <div className="px-4 py-2 space-y-2">
                    {categories.map((cat: any) => {
                      const entry = userEdit[cat.name] ?? { amount: "", ratio: "" };
                      return (
                        <div key={cat.id} className="flex items-center py-1">
                          {/* 标签名 */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cat.color || "#D32F2F" }}
                            />
                            <span className="text-sm text-gray-700 truncate">{cat.name}</span>
                          </div>

                          {/* 初始比例输入框 */}
                          <div className="flex items-center gap-0.5 w-20 justify-center">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0"
                              min={0}
                              max={100}
                              value={entry.ratio}
                              onChange={(e) => handleRatioChange(userId, cat.name, e.target.value)}
                              className="w-12 text-right text-sm border rounded-lg px-1.5 py-1 outline-none focus:border-red-400"
                              style={{
                                borderColor: "#E0E0E0",
                                backgroundColor: "#FAFAFA",
                                color: "#222222",
                              }}
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>

                          {/* 初始金额输入框 */}
                          <div className="flex items-center gap-1 w-28 justify-end">
                            <span className="text-sm text-gray-400">¥</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0"
                              value={entry.amount}
                              onChange={(e) => handleAmountChange(userId, cat.name, e.target.value)}
                              className="w-24 text-right text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                              style={{
                                borderColor: "#E0E0E0",
                                backgroundColor: "#FAFAFA",
                                color: "#222222",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
