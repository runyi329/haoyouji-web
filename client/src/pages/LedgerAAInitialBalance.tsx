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
import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, ChevronDown, Save, Tag, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

// 支持的数字币配置
const CRYPTO_COINS = [
  { name: "BTC", label: "比特币" },
  { name: "ETH", label: "以太坊" },
  { name: "SOL", label: "索拉纳" },
  { name: "LDO", label: "LDO" },
  { name: "USDT", label: "USDT" },
];

// USDT/CNY 汇率（固定）
const CNY_RATE = 7.0;

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

  // 数字币价格（USDT），统一走后端代理（规范：crypto-price-unified）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 30000 });
  // 价格单位为 USDT，需乘以 CNY_RATE 转换为人民币
  const cryptoPrices: Record<string, number> = {};
  if (cryptoPricesRaw) {
    // 适配新的返回结构 { prices: {...}, changes: {...} }
    const pricesMap = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
    for (const [coin, usdtPrice] of Object.entries(pricesMap as Record<string, number>)) {
      cryptoPrices[coin] = usdtPrice * CNY_RATE;
    }
    // USDT 稳定币价格固定为 1 USDT = CNY_RATE 元
    cryptoPrices['USDT'] = CNY_RATE;
  }

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
    // USDT 稳定币，用固定汇率 7.0 折算
    const price = coin === 'USDT' ? CNY_RATE : cryptoPrices[coin];
    if (!price) return null;
    const cny = num * price;
    return `≈ ¥${cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  };

  // 视角切换："user"=用户视角（原有），"tag"=标签视角
  const [viewMode, setViewMode] = useState<"user" | "tag">("user");
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set()); // 默认全部折叠

  // 标签配置相关状态
  const [tagConfigForm, setTagConfigForm] = useState<{
    settlementAmount: string;
    interestMode: 'fixed' | 'profit_only';
    interestRate: string;
    interestBaseAmount: string;
    interestStartDate: string;
    note: string;
    pnlNote: string;
    originalAmount: string;
  }>({
    settlementAmount: '',
    interestMode: 'fixed',
    interestRate: '',
    interestBaseAmount: '',
    interestStartDate: '',
    note: '',
    pnlNote: '',
    originalAmount: '',
  });
  // 盈亏手动补充编辑状态（多条，每条有原因和金额）
  const [pnlManualEdits, setPnlManualEdits] = useState<Array<{ reason: string; amount: string }>>([]);
  const [tagConfigSaving, setTagConfigSaving] = useState(false);
  // 标签配置是否处于编辑模式
  const [tagConfigEditing, setTagConfigEditing] = useState(false);
  // 保证金手动编辑状态：{ coin: string, amount: string }[]
  const [marginEdits, setMarginEdits] = useState<Array<{ coin: string; amount: string }>>([]);

  // 获取标签配置
  const { data: tagConfigData, refetch: refetchTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId, tagName: selectedTagName ?? '' },
    { enabled: !!ledgerId && !!selectedTagName }
  );

  // 获取标签保证金汇总和最新市值
  const { data: tagSummaryData } = trpc.ledger.getTagSummary.useQuery(
    { ledgerId, tagName: selectedTagName ?? '' },
    { enabled: !!ledgerId && !!selectedTagName }
  );

  // 当标签配置数据加载时，同步到表单
  useEffect(() => {
    if (tagConfigData) {
      setTagConfigForm({
        settlementAmount: tagConfigData.settlement_amount ?? '',
        interestMode: (tagConfigData.interest_mode as 'fixed' | 'profit_only') ?? 'fixed',
        interestRate: tagConfigData.interest_rate ?? '',
        interestBaseAmount: tagConfigData.interest_base_amount ?? '',
        interestStartDate: tagConfigData.interest_start_date ?? '',
        note: tagConfigData.note ?? '',
        pnlNote: tagConfigData.pnl_note ?? '',
        originalAmount: tagConfigData.original_amount ?? '',
      });
    } else if (selectedTagName) {
      setTagConfigForm({ settlementAmount: '', interestMode: 'fixed', interestRate: '', interestBaseAmount: '', interestStartDate: '', note: '', pnlNote: '', originalAmount: '' });
    }
    // 切换标签时重置编辑模式
    setTagConfigEditing(false);
  }, [tagConfigData, selectedTagName]);

  // 保存标签配置
  const saveTagConfigMutation = trpc.ledger.saveTagConfig.useMutation({
    onSuccess: () => {
      toast.success('标签配置已保存');
      setTagConfigSaving(false);
      setTagConfigEditing(false);
      refetchTagConfig();
    },
    onError: (err) => {
      toast.error((err as any).message || '保存失败');
      setTagConfigSaving(false);
    },
  });

  const handleSaveTagConfig = () => {
    if (!selectedTagName) return;
    setTagConfigSaving(true);
    // 将 marginEdits 转换为 JSON 字符串保存
    const marginByCoinJson = marginEdits.filter(e => e.amount).length > 0
      ? JSON.stringify(Object.fromEntries(marginEdits.filter(e => e.amount).map(e => [e.coin, parseFloat(e.amount) || 0])))
      : undefined;
    // 将 pnlManualEdits 转换为 JSON 数组字符串保存 [{reason, amount}]
    const validPnlEdits = pnlManualEdits.filter(e => e.amount);
    const pnlManualJson = validPnlEdits.length > 0
      ? JSON.stringify(validPnlEdits.map(e => ({ reason: e.reason || '', amount: parseFloat(e.amount) || 0 })))
      : undefined;
    saveTagConfigMutation.mutate({
      ledgerId,
      tagName: selectedTagName,
      settlementAmount: tagConfigForm.settlementAmount || undefined,
      interestMode: tagConfigForm.interestMode,
      interestRate: tagConfigForm.interestRate || undefined,
      interestBaseAmount: tagConfigForm.interestBaseAmount || undefined,
      interestStartDate: tagConfigForm.interestStartDate || undefined,
      note: tagConfigForm.note || undefined,
      marginByCoin: marginByCoinJson,
      pnlManual: pnlManualJson,
      pnlNote: tagConfigForm.pnlNote || undefined,
      originalAmount: tagConfigForm.originalAmount || undefined,
    });
  };

  // 进入编辑模式时，初始化编辑数据
  const handleStartEditing = () => {
    // 保证金：仅从已保存的配置读取（纯手动，不自动计算）
    const savedMargin = tagConfigData?.margin_by_coin
      ? (() => { try { return JSON.parse(tagConfigData.margin_by_coin); } catch { return null; } })()
      : null;
    const marginEntries = savedMargin
      ? Object.entries(savedMargin).map(([coin, amount]) => ({ coin, amount: String(amount) }))
      : [{ coin: '', amount: '' }];
    setMarginEdits(marginEntries);
    // 盈亏手动补充：从已保存的配置读取（兼容旧格式{coin:amount}和新格式[{reason,amount}]）
    const savedPnl = tagConfigData?.pnl_manual
      ? (() => { try { return JSON.parse(tagConfigData.pnl_manual); } catch { return null; } })()
      : null;
    let pnlEntries: Array<{ reason: string; amount: string }>;
    if (Array.isArray(savedPnl)) {
      // 新格式：[{reason, amount}]
      pnlEntries = savedPnl.map((e: any) => ({ reason: String(e.reason ?? ''), amount: String(e.amount ?? '') }));
    } else if (savedPnl && typeof savedPnl === 'object') {
      // 旧格式：{coin: amount} → 转换为新格式
      pnlEntries = Object.entries(savedPnl).map(([key, val]) => ({ reason: key, amount: String(val) }));
    } else {
      pnlEntries = [{ reason: '', amount: '' }];
    }
    setPnlManualEdits(pnlEntries);
    setTagConfigEditing(true);
  };

  // 标签视角：计算每个标签下各用户的占比
  const tagRatioView = useMemo(() => {
    if (!allBalancesData || categories.length === 0) return {};
    const result: Record<string, Array<{ member: any; ratio: number; amount: string }>> = {};
    for (const cat of categories) {
      const n = cat.name;
      const rows: Array<{ member: any; ratio: number; amount: string }> = [];
      for (const member of (allBalancesData as any).members) {
        const balances = (allBalancesData as any).balancesMap[member.userId] ?? {};
        const ratio = balances[`${n}__ratio`] !== undefined ? parseFloat(String(balances[`${n}__ratio`])) : 0;
        const amount = balances[n] !== undefined ? String(balances[n]) : "";
        rows.push({ member, ratio: isNaN(ratio) ? 0 : ratio, amount });
      }
      result[n] = rows.sort((a, b) => b.ratio - a.ratio); // 按占比从高到低排序
    }
    return result;
  }, [allBalancesData, categories]);

  const members = (allBalancesData as any)?.members ?? [];

  // 找到 jiang 用户的 userId（展开占比充到100%）
  const jiangUserId = useMemo(() => {
    const m = members.find((m: any) =>
      (m.username ?? '').toLowerCase() === 'jiang' ||
      (m.nickname ?? '').toLowerCase() === 'jiang'
    );
    return m ? m.userId : null;
  }, [members]);

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

  // 包装 updateEntry：当非-jiang 用户修改某标签的 ratio 时，自动计算 jiang 的剩余占比
  const updateEntryWithAutoJiang = (
    userId: number,
    catName: string,
    patch: Partial<TagEntry>
  ) => {
    updateEntry(userId, catName, patch);
    // 只有修改了 ratio 字段，且操作的不是 jiang 本人，才自动计算
    if ('ratio' in patch && jiangUserId !== null && userId !== jiangUserId) {
      // 延迟一小步等 setEditState 生效
      setTimeout(() => {
        setEditState(prev => {
          const newRatio = parseFloat(patch.ratio as string);
          if (isNaN(newRatio)) return prev;
          // 计算所有非-jiang 用户在该标签下的占比之和
          let othersTotal = 0;
          for (const m of members) {
            if (m.userId === jiangUserId) continue;
            const uid = m.userId;
            const r = uid === userId
              ? newRatio
              : parseFloat((prev[uid]?.[catName]?.ratio) ?? '0') || 0;
            othersTotal += r;
          }
          const jiangRatio = Math.max(0, 100 - othersTotal);
          return {
            ...prev,
            [jiangUserId]: {
              ...(prev[jiangUserId] ?? {}),
              [catName]: {
                ...(prev[jiangUserId]?.[catName] ?? defaultEntry()),
                ratio: String(parseFloat(jiangRatio.toFixed(2))),
              },
            },
          };
        });
        setDirtyUsers(prev => new Set(prev).add(jiangUserId!));
      }, 0);
    }
  };

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
        {/* 视角切换按钮 */}
        <div className="flex items-center gap-1 bg-white/20 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("user")}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: viewMode === "user" ? "#FFFFFF" : "transparent",
              color: viewMode === "user" ? "#D32F2F" : "rgba(255,255,255,0.8)",
            }}
          >
            <Users size={12} />
            用户
          </button>
          <button
            onClick={() => { setViewMode("tag"); if (!selectedTagName && categories.length > 0) setSelectedTagName(categories[0].name); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: viewMode === "tag" ? "#FFFFFF" : "transparent",
              color: viewMode === "tag" ? "#D32F2F" : "rgba(255,255,255,0.8)",
            }}
          >
            <Tag size={12} />
            标签
          </button>
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
      ) : viewMode === "tag" ? (
        /* ===== 标签视角 ===== */
        <div className="pb-8">
          {/* 标签选择横向滚动列表 */}
          <div className="px-4 mt-3 mb-3">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {categories.map((cat: any) => {
                const rows = tagRatioView[cat.name] ?? [];
                const total = rows.reduce((s, r) => s + r.ratio, 0);
                const isSelected = selectedTagName === cat.name;
                const isComplete = Math.abs(total - 100) < 0.01;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedTagName(cat.name)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
                    style={{
                      backgroundColor: isSelected ? (cat.color || "#D32F2F") : "#FFFFFF",
                      color: isSelected ? "#FFFFFF" : "#555555",
                      borderColor: isSelected ? (cat.color || "#D32F2F") : "#E0E0E0",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : (cat.color || "#D32F2F") }}
                    />
                    {cat.name}
                    <span
                      className="ml-0.5 px-1 rounded-full text-xs"
                      style={{
                        backgroundColor: isSelected ? "rgba(255,255,255,0.25)" : (isComplete ? "#E8F5E9" : "#FFF3E0"),
                        color: isSelected ? "#FFFFFF" : (isComplete ? "#2E7D32" : "#E65100"),
                      }}
                    >
                      {total.toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 选中标签的详情 */}
          {selectedTagName && (() => {
            const cat = categories.find((c: any) => c.name === selectedTagName);
            const rows = tagRatioView[selectedTagName] ?? [];
            const total = rows.reduce((s, r) => s + r.ratio, 0);
            const isComplete = Math.abs(total - 100) < 0.01;
            const isOver = total > 100.01;
            return (
              <>
              <div className="mx-4 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                {/* 标签头部 */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #F0E8E0" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat?.color || "#D32F2F" }}
                    />
                    <span className="text-sm font-semibold text-gray-800">{selectedTagName}</span>
                  </div>
                  {/* 合计状态 */}
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: isComplete ? "#E8F5E9" : isOver ? "#FFEBEE" : "#FFF3E0",
                      color: isComplete ? "#2E7D32" : isOver ? "#C62828" : "#E65100",
                    }}
                  >
                    <span>合计 {total.toFixed(1)}%</span>
                    <span>{isComplete ? "✓ 已满" : isOver ? "⚠ 超出" : `还差 ${(100 - total).toFixed(1)}%`}</span>
                  </div>
                </div>

                {/* 各用户占比列表 */}
                <div className="px-4 py-2 space-y-2">
                  {rows.map(({ member, ratio, amount }) => {
                    const pct = ratio;
                    return (
                      <div key={member.userId} className="flex items-center gap-3 py-2">
                        {/* 用户信息 */}
                        <div className="flex items-center gap-2 w-28 flex-shrink-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: cat?.color || "#D32F2F" }}
                          >
                            {(member.nickname || member.username || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-700 truncate">
                            {member.nickname || member.username || "未知"}
                          </span>
                        </div>
                        {/* 进度条 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold" style={{ color: pct > 0 ? (cat?.color || "#D32F2F") : "#BDBDBD" }}>
                              {pct > 0 ? `${pct.toFixed(1)}%` : "—"}
                            </span>
                            {amount && (
                              <span className="text-xs text-gray-400">¥{parseFloat(amount).toLocaleString("zh-CN")}</span>
                            )}
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F5F5F5" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: pct > 0 ? (cat?.color || "#D32F2F") : "transparent",
                                opacity: pct > 0 ? 1 : 0,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 底部合计条 */}
                <div
                  className="mx-4 mb-4 mt-1 rounded-xl px-4 py-2 flex items-center justify-between"
                  style={{ backgroundColor: isComplete ? "#E8F5E9" : isOver ? "#FFEBEE" : "#FFF8E1" }}
                >
                  <span className="text-xs text-gray-500">共 {rows.filter(r => r.ratio > 0).length} 人参与</span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: isComplete ? "#2E7D32" : isOver ? "#C62828" : "#E65100" }}
                  >
                    {total.toFixed(1)}% / 100%
                  </span>
                </div>
              </div>

              {/* ===== 标签配置框 ===== */}
              <div className="mx-4 mt-3 mb-6 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                {/* 标签配置头部 */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #F0E8E0" }}
                >
                  <span className="text-sm font-semibold text-gray-800">标签配置</span>
                  {!tagConfigEditing ? (
                    <button
                      onClick={handleStartEditing}
                      className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{ backgroundColor: "#FFF0F0", color: "#D32F2F" }}
                    >
                      编辑
                    </button>
                  ) : (
                    <button
                      onClick={() => setTagConfigEditing(false)}
                      className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{ backgroundColor: "#F5F5F5", color: "#757575" }}
                    >
                      取消
                    </button>
                  )}
                </div>

                <div className="px-4 py-3 space-y-4">
                  {/* 保证金汇总 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">保证金汇总</div>
                    {!tagConfigEditing ? (
                      /* 查看模式：仅显示手动录入的保证金 */
                      <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "#FAF3ED" }}>
                        {(() => {
                          const savedMargin = tagConfigData?.margin_by_coin
                            ? (() => { try { return JSON.parse(tagConfigData.margin_by_coin); } catch { return null; } })()
                            : null;
                          const entries = savedMargin
                            ? Object.entries(savedMargin).filter(([, v]) => Number(v) > 0)
                            : [];
                          return entries.length > 0 ? (
                            <div className="space-y-1">
                              {entries.map(([coin, amount]) => (
                                <div key={coin} className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">{coin || '人民币'}</span>
                                  <span className="text-sm font-semibold text-gray-800">
                                    {Number(amount).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}
                                    {coin ? ` ${coin}` : ' 元'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">暂无保证金数据，点「编辑」手动录入</span>
                          );
                        })()}
                      </div>
                    ) : (
                      /* 编辑模式：可编辑列表 */
                      <div className="space-y-2">
                        {marginEdits.map((entry, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={entry.coin}
                              onChange={e => setMarginEdits(prev => prev.map((x, i) => i === idx ? { ...x, coin: e.target.value } : x))}
                              placeholder="币种（如BTC或留空表示人民币）"
                              className="w-24 rounded-lg px-2 py-1.5 text-xs border outline-none flex-shrink-0"
                              style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                            />
                            <input
                              type="number"
                              value={entry.amount}
                              onChange={e => setMarginEdits(prev => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                              placeholder="金额"
                              className="flex-1 rounded-lg px-2 py-1.5 text-xs border outline-none"
                              style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                            />
                            <button
                              onClick={() => setMarginEdits(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-400 hover:text-red-500 flex-shrink-0 text-sm"
                            >×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => setMarginEdits(prev => [...prev, { coin: '', amount: '' }])}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >+ 添加一行</button>
                      </div>
                    )}
                  </div>

                  {/* 最新股票市值 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">最新股票市值（自动读取）</div>
                    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "#FAF3ED" }}>
                      {tagSummaryData?.latestBalance ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{tagSummaryData.latestBalance.recordDate}</span>
                          <span className="text-sm font-semibold text-gray-800">
                            ¥{parseFloat(String(tagSummaryData.latestBalance.balance)).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">暂无市值数据（请先登记账目记录）</span>
                      )}
                    </div>
                  </div>

                  {/* 盈亏情况 - 市值下方 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">盈亏情况</div>
                    {!tagConfigEditing ? (
                      /* 查看模式：显示汇总（市值 - 原始金额 + 手动调剂） */
                      <div className="rounded-xl px-3 py-2 space-y-1.5" style={{ backgroundColor: "#FAF3ED" }}>
                        {(() => {
                          // 市值（自动读取）
                          const marketVal = tagSummaryData?.latestBalance?.balance
                            ? parseFloat(String(tagSummaryData.latestBalance.balance))
                            : null;
                          // 原始金额（手动录入）
                          const origAmt = tagConfigData?.original_amount
                            ? parseFloat(String(tagConfigData.original_amount))
                            : null;
                          // 手动调剂（兼容新旧格式）
                          const savedPnl = tagConfigData?.pnl_manual
                            ? (() => { try { return JSON.parse(tagConfigData.pnl_manual); } catch { return null; } })()
                            : null;
                          let pnlItems: Array<{ reason: string; amount: number }> = [];
                          if (Array.isArray(savedPnl)) {
                            pnlItems = savedPnl.map((e: any) => ({ reason: String(e.reason ?? ''), amount: Number(e.amount ?? 0) }));
                          } else if (savedPnl && typeof savedPnl === 'object') {
                            pnlItems = Object.entries(savedPnl).map(([key, val]) => ({ reason: key, amount: Number(val) }));
                          }
                          const pnlAdjust = pnlItems.reduce((s, e) => s + e.amount, 0);
                          // 利息实时计算
                          const interestRate = tagConfigData?.interest_rate ? parseFloat(String(tagConfigData.interest_rate)) : 0;
                          const interestBase = tagConfigData?.interest_base_amount ? parseFloat(String(tagConfigData.interest_base_amount)) : null;
                          const interestStartStr = tagConfigData?.interest_start_date ?? '';
                          const interestMode = tagConfigData?.interest_mode ?? 'fixed';
                          let interestDays = 0;
                          let interestAmount = 0;
                          if (interestBase !== null && interestRate > 0 && interestStartStr) {
                            const startDate = new Date(interestStartStr + 'T00:00:00');
                            const now = new Date();
                            interestDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
                            const dailyRate = interestRate / 100 / 365;
                            interestAmount = interestBase * dailyRate * interestDays;
                          }
                          // 盈利才收模式：先算出盈亏（不含利息），亏损时利息为0
                          const hasEnough = marketVal !== null && origAmt !== null;
                          const rawPnl: number | null = hasEnough ? (marketVal! - origAmt! + pnlAdjust) : null;
                          // 盈利才收模式下，亏损时利息自动为0
                          const effectiveInterest = (interestMode === 'profit_only' && rawPnl !== null && rawPnl <= 0) ? 0 : interestAmount;
                          // 盈亏汇总 = 市值 - 原始金额 + 手动调剂 - 利息
                          const totalPnl: number | null = hasEnough ? (rawPnl! - effectiveInterest) : null;
                          return (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">市值</span>
                                <span className="text-xs text-gray-700">
                                  {marketVal !== null ? `¥${marketVal.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : <span className="text-gray-400">未记录</span>}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">原始金额</span>
                                <span className="text-xs text-gray-700">
                                  {origAmt !== null ? `¥${origAmt.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : <span className="text-gray-400">未录入</span>}
                                </span>
                              </div>
                              {/* 逐条显示手动调剂明细 */}
                              {pnlItems.length > 0 && (
                                <div className="space-y-0.5">
                                  <div className="text-xs text-gray-500 font-medium">手动调剂明细</div>
                                  {pnlItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between pl-2">
                                      <span className="text-xs text-gray-400 truncate max-w-[60%]">{item.reason || `调剂项${idx + 1}`}</span>
                                      <span className="text-xs" style={{ color: item.amount >= 0 ? '#388E3C' : '#D32F2F' }}>
                                        {item.amount >= 0 ? '+' : ''}{item.amount.toLocaleString('zh-CN')}
                                      </span>
                                    </div>
                                  ))}
                                  {pnlItems.length > 1 && (
                                    <div className="flex items-center justify-between pl-2 pt-0.5" style={{ borderTop: '1px dashed #E0D0C0' }}>
                                      <span className="text-xs text-gray-500">调剂合计</span>
                                      <span className="text-xs font-medium" style={{ color: pnlAdjust >= 0 ? '#388E3C' : '#D32F2F' }}>
                                        {pnlAdjust >= 0 ? '+' : ''}{pnlAdjust.toLocaleString('zh-CN')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* 利息明细 */}
                              {effectiveInterest > 0 && (
                                <div className="space-y-0.5">
                                  <div className="text-xs text-gray-500 font-medium">利息计算</div>
                                  <div className="flex items-center justify-between pl-2">
                                    <span className="text-xs text-gray-400">基数</span>
                                    <span className="text-xs text-gray-600">¥{interestBase!.toLocaleString('zh-CN')}</span>
                                  </div>
                                  <div className="flex items-center justify-between pl-2">
                                    <span className="text-xs text-gray-400">年化{interestRate}% × {interestDays}天</span>
                                    <span className="text-xs" style={{ color: '#D32F2F' }}>
                                      -¥{effectiveInterest.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {interestMode === 'profit_only' && effectiveInterest === 0 && interestAmount > 0 && (
                                <div className="text-xs text-gray-400 pl-2">盈利才收模式：当前亏损，利息为 0</div>
                              )}
                              <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid #E8D8C8' }}>
                                <span className="text-xs font-semibold text-gray-700">盈亏汇总</span>
                                <span className="text-sm font-bold" style={{ color: totalPnl === null ? '#9E9E9E' : totalPnl >= 0 ? '#388E3C' : '#D32F2F' }}>
                                  {totalPnl === null
                                    ? '数据不全'
                                    : `${totalPnl >= 0 ? '+' : ''}¥${totalPnl.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
                                  }
                                </span>
                              </div>
                              {tagConfigData?.pnl_note && (
                                <div className="text-xs text-gray-400 pt-0.5">{tagConfigData.pnl_note}</div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      /* 编辑模式：原始金额 + 手动调剂 */
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">原始金额（初始投入金额）</div>
                          <input
                            type="number"
                            value={tagConfigForm.originalAmount}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, originalAmount: e.target.value }))}
                            placeholder="如：1000000"
                            className="w-full rounded-lg px-2 py-1.5 text-sm border outline-none"
                            style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-2 mb-1">手动调剂（可添加多条，每条填写原因和金额）</div>
                        {pnlManualEdits.map((entry, idx) => (
                          <div key={idx} className="rounded-lg p-2 space-y-1.5" style={{ backgroundColor: '#F9F5F0', border: '1px solid #EDE5DC' }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 font-medium">第{idx + 1}条</span>
                              <button
                                onClick={() => setPnlManualEdits(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-400 hover:text-red-500 text-xs px-1"
                              >删除</button>
                            </div>
                            <input
                              type="text"
                              value={entry.reason}
                              onChange={e => setPnlManualEdits(prev => prev.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))}
                              placeholder="原因（如：其他资产收益、手续费、分红...)"
                              className="w-full rounded-lg px-2 py-1.5 text-xs border outline-none"
                              style={{ borderColor: "#E0E0E0", backgroundColor: "#FFFFFF" }}
                            />
                            <input
                              type="number"
                              value={entry.amount}
                              onChange={e => setPnlManualEdits(prev => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                              placeholder="金额（正数表示盈利，负数表示亏损）"
                              className="w-full rounded-lg px-2 py-1.5 text-xs border outline-none"
                              style={{ borderColor: "#E0E0E0", backgroundColor: "#FFFFFF" }}
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => setPnlManualEdits(prev => [...prev, { reason: '', amount: '' }])}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg"
                          style={{ color: '#D32F2F', backgroundColor: '#FFF0F0' }}
                        >+ 添加调剂项</button>
                        <div className="mt-1">
                          <div className="text-xs text-gray-400 mb-1">盈亏备注</div>
                          <input
                            type="text"
                            value={tagConfigForm.pnlNote}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, pnlNote: e.target.value }))}
                            placeholder="如：已扣除手续费、包含利息收益..."
                            className="w-full rounded-lg px-2 py-1.5 text-xs border outline-none"
                            style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 结算规则 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">结算规则（±X万）</div>
                    {!tagConfigEditing ? (
                      <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "#FAF3ED" }}>
                        <span className="text-sm text-gray-700">
                          {tagConfigForm.settlementAmount || <span className="text-gray-400">未设置</span>}
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={tagConfigForm.settlementAmount}
                        onChange={e => setTagConfigForm(prev => ({ ...prev, settlementAmount: e.target.value }))}
                        placeholder="如：±3 表示±3万"
                        className="w-full rounded-xl px-3 py-2 text-sm border outline-none"
                        style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                      />
                    )}
                  </div>

                  {/* 利息规则 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">利息规则</div>
                    {!tagConfigEditing ? (
                      /* 查看模式 */
                      <div className="rounded-xl px-3 py-2 space-y-1" style={{ backgroundColor: "#FAF3ED" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {tagConfigForm.interestMode === 'fixed' ? '固定年化' : '盈利才收'}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {tagConfigForm.interestRate ? `${tagConfigForm.interestRate}%` : <span className="text-gray-400">未设置</span>}
                          </span>
                        </div>
                        {tagConfigForm.interestBaseAmount && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">计息基数</span>
                            <span className="text-xs text-gray-700">¥{parseFloat(tagConfigForm.interestBaseAmount).toLocaleString('zh-CN')}</span>
                          </div>
                        )}
                        {tagConfigForm.interestStartDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">起息日</span>
                            <span className="text-xs text-gray-700">{tagConfigForm.interestStartDate}</span>
                          </div>
                        )}
                        {tagConfigForm.interestMode === 'profit_only' && (
                          <div className="mt-1 text-xs text-gray-400">亏损时利息自动为 0%（依据盈亏汇总判断）</div>
                        )}
                      </div>
                    ) : (
                      /* 编辑模式 */
                      <>
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => setTagConfigForm(prev => ({ ...prev, interestMode: 'fixed' }))}
                            className="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                            style={{
                              backgroundColor: tagConfigForm.interestMode === 'fixed' ? '#D32F2F' : '#FAFAFA',
                              color: tagConfigForm.interestMode === 'fixed' ? '#FFFFFF' : '#555555',
                              borderColor: tagConfigForm.interestMode === 'fixed' ? '#D32F2F' : '#E0E0E0',
                            }}
                          >固定年化</button>
                          <button
                            onClick={() => setTagConfigForm(prev => ({ ...prev, interestMode: 'profit_only' }))}
                            className="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                            style={{
                              backgroundColor: tagConfigForm.interestMode === 'profit_only' ? '#D32F2F' : '#FAFAFA',
                              color: tagConfigForm.interestMode === 'profit_only' ? '#FFFFFF' : '#555555',
                              borderColor: tagConfigForm.interestMode === 'profit_only' ? '#D32F2F' : '#E0E0E0',
                            }}
                          >盈利才收</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={tagConfigForm.interestRate}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, interestRate: e.target.value }))}
                            placeholder="年化利率"
                            className="flex-1 rounded-xl px-3 py-2 text-sm border outline-none"
                            style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                        <div className="mt-2">
                          <div className="text-xs text-gray-400 mb-1">利息计算基数（元）</div>
                          <input
                            type="number"
                            value={tagConfigForm.interestBaseAmount}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, interestBaseAmount: e.target.value }))}
                            placeholder="如：1000000"
                            className="w-full rounded-xl px-3 py-2 text-sm border outline-none"
                            style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                          />
                        </div>
                        <div className="mt-2">
                          <div className="text-xs text-gray-400 mb-1">起息日</div>
                          <input
                            type="date"
                            value={tagConfigForm.interestStartDate}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, interestStartDate: e.target.value }))}
                            className="w-full rounded-xl px-3 py-2 text-sm border outline-none"
                            style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                          />
                        </div>
                        {tagConfigForm.interestMode === 'profit_only' && (
                          <div className="mt-1.5 text-xs text-gray-400">亏损时利息自动为 0%（依据盈亏汇总判断）</div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 备注 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">备注</div>
                    {!tagConfigEditing ? (
                      <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "#FAF3ED" }}>
                        <span className="text-sm text-gray-700">
                          {tagConfigForm.note || <span className="text-gray-400">无</span>}
                        </span>
                      </div>
                    ) : (
                      <textarea
                        value={tagConfigForm.note}
                        onChange={e => setTagConfigForm(prev => ({ ...prev, note: e.target.value }))}
                        placeholder="其他说明..."
                        rows={2}
                        className="w-full rounded-xl px-3 py-2 text-sm border outline-none resize-none"
                        style={{ borderColor: "#E0E0E0", backgroundColor: "#FAFAFA" }}
                      />
                    )}
                  </div>

                  {/* 保存按钮：仅编辑模式显示 */}
                  {tagConfigEditing && (
                    <button
                      onClick={handleSaveTagConfig}
                      disabled={tagConfigSaving}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: tagConfigSaving ? "#BDBDBD" : "#D32F2F",
                        color: "#FFFFFF",
                      }}
                    >
                      {tagConfigSaving ? '保存中...' : '保存标签配置'}
                    </button>
                  )}
                </div>
              </div>
              </>
            );
          })()
        }
      </div>
      ) : (
        /* ===== 用户视角（原有） ===== */
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

              const isExpanded = expandedUsers.has(userId);
              const toggleExpand = () => setExpandedUsers(prev => {
                const s = new Set(prev);
                s.has(userId) ? s.delete(userId) : s.add(userId);
                return s;
              });

              return (
                <div
                  key={userId}
                  className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-sm"
                  style={{ backgroundColor: "#FFFFFF" }}
                >
                  {/* 成员头部 - 可点击展开/折叠 */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    style={{ borderBottom: isExpanded ? "1px solid #F0E8E0" : "none" }}
                    onClick={toggleExpand}
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
                    <div className="flex items-center gap-2">
                      {isDirty && isExpanded && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSaveMember(userId); }}
                          disabled={isSaving}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            backgroundColor: !isSaving ? "#D32F2F" : "#E0E0E0",
                            color: !isSaving ? "#FFFFFF" : "#9E9E9E",
                          }}
                        >
                          <Save size={12} />
                          {isSaving ? "保存中..." : "保存"}
                        </button>
                      )}
                      {isDirty && !isExpanded && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="有未保存修改" />
                      )}
                      <ChevronDown
                        size={16}
                        className="text-gray-400 transition-transform flex-shrink-0"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </div>
                  </div>

                  {/* 标签行 - 只在展开时显示 */}
                  {isExpanded && <div className="px-4 py-2 space-y-4">
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
                                  updateEntryWithAutoJiang(userId, cat.name, {
                                    ratio: e.target.value,
                                  })
                                }
                                readOnly={userId === jiangUserId}
                                className="flex-1 text-right text-sm border rounded-lg px-2 py-1 outline-none focus:border-red-400"
                                style={{
                                  borderColor: userId === jiangUserId ? "#FFB74D" : "#E0E0E0",
                                  backgroundColor: userId === jiangUserId ? "#FFF8F0" : "#FFFFFF",
                                  color: userId === jiangUserId ? "#E65100" : "#222222",
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
                  </div>}

                  {isExpanded && <div className="h-3" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
