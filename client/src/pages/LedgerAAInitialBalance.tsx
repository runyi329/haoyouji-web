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
import { ChevronLeft, ChevronDown, Save, Tag, Users, Trash2, CheckCircle2, EyeOff, Pause } from "lucide-react";
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

const CNY_RATE_FALLBACK = 7.0; // 居底备用，实际汇率从接口实时获取

interface PauseHistoryItem {
  pauseDate: string;   // 暂停日期 YYYY-MM-DD
  resumeDate?: string; // 重启日期 YYYY-MM-DD（空表示尚未重启）
}
interface TagEntry {
  amount: string;
  ratio: string;
  margin: string;
  marginCoin: string; // "" = 人民币, "BTC"/"ETH"/"SOL"/"LDO" = 数字币
  startDate: string;
  pauseDate: string;
  endDate: string;
  visible: boolean;
  targetAmount: string; // 目标金额（用户级）
  pauseHistory: PauseHistoryItem[]; // 多次暂停/重启历史
}

const defaultEntry = (): TagEntry => ({
  amount: "",
  ratio: "",
  margin: "",
  marginCoin: "",
  startDate: "",
  pauseDate: "",
  endDate: "",
  visible: true,
  targetAmount: "",
  pauseHistory: [],
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

  // 数字币价格（走服务器tRPC，price-scanner缓存，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  // 使用接口返回的实时 USDT/CNY 汇率，居底用 CNY_RATE_FALLBACK
  const cryptoPrices: Record<string, number> = {};
  if (cryptoPricesRaw) {
    const cnyRate = (cryptoPricesRaw as any)?.usdtCnyRate ?? CNY_RATE_FALLBACK;
    const pricesMap = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
    for (const [coin, usdtPrice] of Object.entries(pricesMap as Record<string, number>)) {
      cryptoPrices[coin] = usdtPrice * cnyRate;
    }
    cryptoPrices['USDT'] = cnyRate; // USDT 直接是实时汇率
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
          pauseDate: balances[`${n}__pauseDate`] ?? "",
          endDate: balances[`${n}__endDate`] ?? "",
          visible:
            balances[`${n}__visible`] !== undefined
              ? Number(balances[`${n}__visible`]) !== 0
              : true,
          targetAmount: balances[`${n}__targetAmount`] !== undefined ? String(balances[`${n}__targetAmount`]) : "",
          pauseHistory: (() => {
            // 优先读取 pauseHistory，如果没有则兼容旧 pauseDate 迁移
            const raw = balances[`${n}__pauseHistory`];
            if (raw) {
              try { return JSON.parse(String(raw)) as PauseHistoryItem[]; } catch { /* fall through */ }
            }
            const legacyPause = balances[`${n}__pauseDate`];
            if (legacyPause) return [{ pauseDate: String(legacyPause) }];
            return [];
          })(),
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
        if (!isNaN(num)) balances[`${n}__ratio`] = Math.max(0, num);
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
      // 保存 pauseHistory（多次暂停/重启）
      if (entry.pauseHistory && entry.pauseHistory.length > 0) {
        balances[`${n}__pauseHistory`] = JSON.stringify(entry.pauseHistory);
        // 同时更新旧字段 pauseDate 为最新一次暂停的日期（兼容旧逻辑）
        const lastPause = entry.pauseHistory[entry.pauseHistory.length - 1];
        const isCurrentlyPaused = !lastPause.resumeDate;
        if (isCurrentlyPaused) {
          balances[`${n}__pauseDate`] = lastPause.pauseDate;
        } else {
          // 已重启，清空旧字段
          // （不写入 pauseDate，让它保持为空）
        }
      } else if (entry.pauseDate) {
        balances[`${n}__pauseDate`] = entry.pauseDate;
      }
      if (entry.endDate) {
        balances[`${n}__endDate`] = entry.endDate;
      }
      balances[`${n}__visible`] = entry.visible ? 1 : 0;
      if (entry.targetAmount !== "") {
        const num = parseFloat(entry.targetAmount);
        if (!isNaN(num)) balances[`${n}__targetAmount`] = num;
      }
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
    const price = cryptoPrices[coin] ?? (coin === 'USDT' ? CNY_RATE_FALLBACK : 0);
    if (!price) return null;
    const cny = num * price;
    return `≈ ¥${cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  };

  // 视角切换："user"=用户视角（原有），"tag"=标签视角
  const [viewMode, setViewMode] = useState<"user" | "tag">("tag");
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set()); // 默认全部折叠
  // 用户视图：每个用户下展开的标签，key = `${userId}__${catName}`
  const [expandedUserTags, setExpandedUserTags] = useState<Set<string>>(new Set());
  // 标签维度双击编辑弹窗
  const [tagEditModal, setTagEditModal] = useState<{ userId: number; tagName: string; catColor: string } | null>(null);
  // 批量选择模式
  const [batchSelectMode, setBatchSelectMode] = useState(false);
  const [batchSelectedUsers, setBatchSelectedUsers] = useState<Set<number>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  // 标签下拉框开关
  const [tagDropOpenState, setTagDropOpenState] = useState(false);
  const [tagDropRect, setTagDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const tagDropBtnRef = { current: null as HTMLButtonElement | null };
  // 凑整工具：目标总金额输入
  const [targetTotalInput, setTargetTotalInput] = useState('');
  // 目标总金额独立编辑状态
  const [tagTargetTotalEditing, setTagTargetTotalEditing] = useState(false);
  const [tagTargetTotalInput, setTagTargetTotalInput] = useState('');
  const [tagTargetTotalSaved, setTagTargetTotalSaved] = useState<string | null>(null);

  // 保证金备注功能
  const [showMarginNoteModal, setShowMarginNoteModal] = useState<{ userId: number; userName: string; tagName: string } | null>(null);
  const [newMarginNoteContent, setNewMarginNoteContent] = useState("");

  const { data: marginNotesData, refetch: refetchMarginNotes } = trpc.getAdminNotes.useQuery(
    { ledgerId, type: 'margin' as const, userId: showMarginNoteModal?.userId ?? 0, tagName: showMarginNoteModal?.tagName ?? '' },
    { enabled: !!ledgerId && !!showMarginNoteModal }
  );

  // 全部成员各标签的保证金备注数量（key: `${userId}|${tagName}`）
  const { data: marginNoteCountsData, refetch: refetchMarginNoteCounts } = trpc.getAdminNoteCounts.useQuery(
    { ledgerId, type: 'margin' as const, allMembers: true },
    { enabled: !!ledgerId }
  );
  const marginNoteCounts = (marginNoteCountsData?.counts ?? {}) as Record<string, number>;

  const addMarginNoteMutation = trpc.adminAddNote.useMutation({
    onSuccess: () => {
      toast.success("备注已添加");
      setNewMarginNoteContent("");
      refetchMarginNotes();
      refetchMarginNoteCounts();
    },
    onError: (err) => { toast.error((err as any).message || "添加失败"); },
  });

  const deleteMarginNoteMutation = trpc.adminDeleteNote.useMutation({
    onSuccess: () => {
      toast.success("备注已删除");
      refetchMarginNotes();
      refetchMarginNoteCounts();
    },
    onError: (err) => { toast.error((err as any).message || "删除失败"); },
  });

  // 标签配置相关状态
  const [tagConfigForm, setTagConfigForm] = useState<{
    settlementAmount: string;
    interestMode: 'fixed' | 'profit_only';
    interestRate: string;
    interestBaseAmount: string;
    interestStartDate: string;
    pauseDate: string;
    endDate: string;
    note: string;
    pnlNote: string;
    originalAmount: string;
    targetTotal: string;
  }>({
    settlementAmount: '',
    interestMode: 'fixed',
    interestRate: '',
    interestBaseAmount: '',
    interestStartDate: '',
    pauseDate: '',
    endDate: '',
    note: '',
    pnlNote: '',
    originalAmount: '',
    targetTotal: '',
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

  // categories 加载完成后自动初始化 selectedTagName（防止标签页默认为空）
  useEffect(() => {
    if (categories.length > 0 && !selectedTagName) {
      setSelectedTagName(categories[0].name);
    }
  }, [categories]);

  // 当标签配置数据加载时，同步到表单
  useEffect(() => {
    if (tagConfigData) {
      setTagConfigForm({
        settlementAmount: tagConfigData.settlement_amount ?? '',
        interestMode: (tagConfigData.interest_mode as 'fixed' | 'profit_only') ?? 'fixed',
        interestRate: tagConfigData.interest_rate ?? '',
        interestBaseAmount: tagConfigData.interest_base_amount ?? '',
        interestStartDate: tagConfigData.interest_start_date ?? '',
        pauseDate: tagConfigData.pause_date ?? '',
        endDate: tagConfigData.end_date ?? '',
        note: tagConfigData.note ?? '',
        pnlNote: tagConfigData.pnl_note ?? '',
        originalAmount: tagConfigData.original_amount ?? '',
        targetTotal: (tagConfigData as any).target_total ?? '',
      });
    } else if (selectedTagName) {
      setTagConfigForm({ settlementAmount: '', interestMode: 'fixed', interestRate: '', interestBaseAmount: '', interestStartDate: '', pauseDate: '', endDate: '', note: '', pnlNote: '', originalAmount: '', targetTotal: '' });
    }
    // 切换标签时重置编辑模式
    setTagConfigEditing(false);
    // 同步目标总金额（从 tagConfigData 直接同步）
    if (tagConfigData !== undefined) {
      const tt = (tagConfigData as any)?.target_total ?? null;
      setTagTargetTotalSaved(tt);
    }
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
      pauseDate: tagConfigForm.pauseDate || undefined,
      endDate: tagConfigForm.endDate || undefined,
      note: tagConfigForm.note || undefined,
      marginByCoin: marginByCoinJson,
      pnlManual: pnlManualJson,
      pnlNote: tagConfigForm.pnlNote || undefined,
      originalAmount: tagConfigForm.originalAmount || undefined,
      targetTotal: tagConfigForm.targetTotal || undefined,
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
    const result: Record<string, Array<{ member: any; ratio: number; amount: string; visible: boolean; pauseStatus: 'paused' | 'running' | 'none' }>> = {};
    for (const cat of categories) {
      const n = cat.name;
      const rows: Array<{ member: any; ratio: number; amount: string; visible: boolean; pauseStatus: 'paused' | 'running' | 'none' }> = [];
      for (const member of (allBalancesData as any).members) {
        const balances = (allBalancesData as any).balancesMap[member.userId] ?? {};
        const ratio = balances[`${n}__ratio`] !== undefined ? parseFloat(String(balances[`${n}__ratio`])) : 0;
        const amount = balances[n] !== undefined ? String(balances[n]) : "";
        const visible = balances[`${n}__visible`] !== undefined ? Number(balances[`${n}__visible`]) !== 0 : true;
        // 计算暂停状态
        let pauseStatus: 'paused' | 'running' | 'none' = 'none';
        const phRaw = balances[`${n}__pauseHistory`];
        if (phRaw) {
          try {
            const ph = JSON.parse(String(phRaw));
            if (Array.isArray(ph) && ph.length > 0) {
              const last = ph[ph.length - 1];
              pauseStatus = last.resumeDate ? 'running' : 'paused';
            }
          } catch { /* ignore */ }
        } else if (balances[`${n}__pauseDate`]) {
          pauseStatus = 'paused';
        } else if (balances[`${n}__startDate`]) {
          pauseStatus = 'running';
        }
        rows.push({ member, ratio: isNaN(ratio) ? 0 : ratio, amount, visible, pauseStatus });
      }
      result[n] = rows.sort((a, b) => {
        // 不可见的用户排到最后
        if (a.visible !== b.visible) return a.visible ? -1 : 1;
        return b.ratio - a.ratio;
      });
    }
    return result;
  }, [allBalancesData, categories]);

  const members = (allBalancesData as any)?.members ?? [];


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
        </div>
      </div>


      {categories.length === 0 ? (
        <div className="mx-4 mt-6 text-center text-gray-400 text-sm">
          该账本暂无标签，请先在分类管理中添加标签
        </div>
      ) : viewMode === "tag" ? (
        /* ===== 标签视角 ===== */
        <div className="pb-8">
          {/* 标签自定义下拉框 */}
          {(() => {
            const [tagDropOpen, setTagDropOpen] = [tagDropOpenState, setTagDropOpenState];
            const selectedCat = categories.find((c: any) => c.name === selectedTagName);
            return (
              <div className="px-4 mt-3 mb-3 relative" style={{ zIndex: 20 }}>
                {/* 触发按鈕 */}
                <button
                  type="button"
                  ref={(el) => { tagDropBtnRef.current = el; }}
                  onClick={() => {
                    if (!tagDropOpenState && tagDropBtnRef.current) {
                      const r = tagDropBtnRef.current.getBoundingClientRect();
                      setTagDropRect({ top: r.bottom, left: r.left, width: r.width });
                    }
                    setTagDropOpen(!tagDropOpen);
                  }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm border rounded-xl"
                  style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: selectedTagName ? '#222222' : '#9E9E9E' }}
                >
                  <div className="flex items-center gap-2">
                    {selectedCat && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color || '#D32F2F' }} />}
                    <span>{selectedTagName ? (() => {
                      const rows = tagRatioView[selectedTagName] ?? [];
                      const total = rows.reduce((s: number, r: any) => s + r.ratio, 0);
                      const isComplete = Math.abs(total - 100) < 0.01;
                      const isOver = total > 100.01;
                      return `${selectedTagName}${isComplete ? ' ✓' : isOver ? ' !' : ''}  ${total.toFixed(2)}%`;
                    })() : '— 请选择标签 —'}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: tagDropOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0, color: '#9E9E9E' }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {/* 下拉列表 */}
                {tagDropOpen && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 19 }} onClick={() => setTagDropOpen(false)} />
                    <div
                      className="fixed border rounded-b-xl overflow-hidden shadow-lg"
                      style={{
                        top: tagDropRect?.top ?? 0,
                        left: tagDropRect?.left ?? 0,
                        width: tagDropRect?.width ?? 'auto',
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E0E0E0',
                        zIndex: 21,
                        maxHeight: 260,
                        overflowY: 'auto'
                      }}
                    >
                      {[...categories].sort((a: any, b: any) => {
                        // 有任意用户有暂停日期的标签排到最后
                        const aMembers = Object.values(editState) as Record<string, TagEntry>[];
                        const aPaused = aMembers.some(u => !!(u as any)[a.name]?.pauseDate);
                        const bPaused = aMembers.some(u => !!(u as any)[b.name]?.pauseDate);
                        if (aPaused && !bPaused) return 1;
                        if (!aPaused && bPaused) return -1;
                        return 0;
                      }).map((cat: any) => {
                        const rows = tagRatioView[cat.name] ?? [];
                        const total = rows.reduce((s: number, r: any) => s + r.ratio, 0);
                        const isComplete = Math.abs(total - 100) < 0.01;
                        const isOver = total > 100.01;
                        const isSelected = selectedTagName === cat.name;
                        // 检测暂停：找到最早的暂停日期
                        const allUsers = Object.values(editState) as Record<string, TagEntry>[];
                        const pauseDates = allUsers.map(u => (u as any)[cat.name]?.pauseDate).filter(Boolean) as string[];
                        const earliestPause = pauseDates.sort()[0] ?? null;
                        let pauseInfo = '';
                        if (earliestPause) {
                          const [, m, d] = earliestPause.split('-');
                          const pauseD = new Date(earliestPause);
                          const today = new Date();
                          const diffDays = Math.floor((today.getTime() - pauseD.getTime()) / 86400000);
                          pauseInfo = `(${Number(m)}月${Number(d)}日暂停，已${diffDays}天)`;
                        }
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => { setSelectedTagName(cat.name); setTagDropOpen(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left"
                            style={{ backgroundColor: isSelected ? '#FFF5F5' : '#FFFFFF', borderBottom: '1px solid #F5F5F5' }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#D32F2F' }} />
                              <span style={{ color: isSelected ? (cat.color || '#D32F2F') : '#222222', fontWeight: isSelected ? 600 : 400 }}>{cat.name}</span>
                              {pauseInfo && <span style={{ fontSize: 11, color: '#1565C0', flexShrink: 0 }}>{pauseInfo}</span>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: isComplete ? '#E8F5E9' : isOver ? '#FFEBEE' : '#FFF3E0',
                                  color: isComplete ? '#2E7D32' : isOver ? '#C62828' : '#E65100',
                                }}
                              >
                                {isComplete ? '✓ ' : isOver ? '! ' : ''}{total.toFixed(2)}%
                              </span>
                              {!earliestPause && (() => {
                                const totalAmt = rows.reduce((s: number, r: any) => {
                                  const a = parseFloat(r.amount);
                                  const share = !isNaN(a) && a > 0 ? a * r.ratio / 100 : 0;
                                  return s + share;
                                }, 0);
                                return totalAmt > 0 ? (
                                  <span className="text-xs" style={{ color: '#757575' }}>
                                    ({totalAmt >= 10000 ? `${(totalAmt/10000).toFixed(1)}万` : Math.round(totalAmt).toLocaleString('zh-CN')})
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* 选中标签的详情 */}
          {selectedTagName && (() => {
            const cat = categories.find((c: any) => c.name === selectedTagName);
            const rows = tagRatioView[selectedTagName] ?? [];
            const total = rows.reduce((s, r) => s + r.ratio, 0);
            const isComplete = Math.abs(total - 100) < 0.01;
            const isOver = total > 100.01;
            // 所有人份额金额之和
            const totalShareAmt = rows.reduce((s, r) => {
              const totalAmt = r.amount ? parseFloat(r.amount) : NaN;
              const share = !isNaN(totalAmt) && totalAmt !== 0 ? totalAmt * r.ratio / 100 : 0;
              return s + share;
            }, 0);
            const totalShareStr = totalShareAmt > 0 ? `（${Math.round(totalShareAmt).toLocaleString('zh-CN')}）` : '';
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
                  {/* 合计状态 + 批量按鈕 */}
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: isComplete ? "#E8F5E9" : isOver ? "#FFEBEE" : "#FFF3E0",
                        color: isComplete ? "#2E7D32" : isOver ? "#C62828" : "#E65100",
                      }}
                    >
                      <span>合计 {total.toFixed(2)}%{totalShareStr}</span>
                    </div>
                    {/* 批量按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (batchSelectMode) {
                          // 退出批量模式，清空选中
                          setBatchSelectMode(false);
                          setBatchSelectedUsers(new Set());
                        } else {
                          setBatchSelectMode(true);
                          setBatchSelectedUsers(new Set());
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: batchSelectMode ? '#D32F2F' : '#FFF0F0',
                        color: batchSelectMode ? '#FFFFFF' : '#D32F2F',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>{batchSelectMode ? '退出' : '批量'}</span>
                    </button>
                  </div>
                </div>

                {/* 各用户占比列表 */}
                <div className="px-4 py-2 space-y-2">
                  {rows.map(({ member, ratio, amount, visible, pauseStatus }) => {
                    const pct = ratio;
                    // 每人独立计算：基准 = max(100, 自己的比例)
                    const base = Math.max(100, pct);
                    // 灰色轨道宽度：100%占基准的比例（未超100时=100%满格，超过时缩短）
                    const grayWidth = (100 / base) * 100;
                    // 红色条宽度：实际值占基准的比例（未超100时按比例，超过时=100%满格）
                    const redWidth = (pct / base) * 100;
                    // 只有自己超过100%时才显示超出效果
                    const isPersonOver = pct > 100;
                    return (
                      <div
                        key={member.userId}
                        className="flex items-center gap-3 py-2 rounded-xl"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        {/* 用户信息 - 批量模式下点击头像切换选中，普通模式下点击头像触发编辑 */}
                        <div className="flex items-center gap-2 w-28 flex-shrink-0">
                          {(() => {
                            // 批量模式下，展示 editState 中的实时 visible（已被点击修改的）
                            const batchVisible = batchSelectMode
                              ? (editState[member.userId]?.[selectedTagName!]?.visible ?? visible)
                              : visible;
                            return (
                              <div
                                className="cursor-pointer flex-shrink-0 relative"
                                onClick={() => {
                                  if (batchSelectMode) {
                                    // 批量模式：直接切换该用户的 visible 状态
                                    const currentVisible = editState[member.userId]?.[selectedTagName!]?.visible ?? visible;
                                    updateEntry(member.userId, selectedTagName!, { visible: !currentVisible });
                                    // 记录该用户已被修改（用于底部保存按鈕显示变动数）
                                    setBatchSelectedUsers(prev => {
                                      const next = new Set(prev);
                                      next.add(member.userId);
                                      return next;
                                    });
                                  } else {
                                    // 普通模式：打开编辑弹窗
                                    const savedTT = (tagConfigData as any)?.target_total ?? null;
                                    setTagEditModal({ userId: member.userId, tagName: selectedTagName!, catColor: cat?.color || '#D32F2F' });
                                    setTagTargetTotalSaved(savedTT);
                                    setTagTargetTotalInput(savedTT ?? '');
                                  }
                                }}
                                style={{
                                  filter: batchVisible ? 'none' : 'grayscale(100%)',
                                  opacity: batchVisible ? 1 : 0.45,
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <UserAvatar
                                  username={member.username}
                                  avatar={member.avatar}
                                  nickname={member.nickname}
                                  size="sm"
                                />
                                {/* 暂停/运行状态角标（批量模式下也正常显示） */}
                                {pauseStatus === 'paused' && (
                                  <span
                                    className="absolute bottom-0 right-0 flex items-center justify-center rounded-full"
                                    style={{ width: 14, height: 14, backgroundColor: '#1976D2', border: '1.5px solid #fff', fontSize: 7, color: '#fff', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}
                                  >&#10074;&#10074;</span>
                                )}
                                {pauseStatus === 'running' && (
                                  <span
                                    className="absolute bottom-0 right-0 flex items-center justify-center rounded-full"
                                    style={{ width: 14, height: 14, backgroundColor: '#388E3C', border: '1.5px solid #fff', fontSize: 8, color: '#fff', fontWeight: 900, lineHeight: 1 }}
                                  >&#9654;</span>
                                )}
                              </div>
                            );
                          })()}
                          <span className="text-xs text-gray-700 truncate">
                            {member.nickname || member.username || "未知"}
                          </span>
                        </div>
                        {/* 进度条 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold" style={{ color: pct > 0 ? (cat?.color || "#D32F2F") : "#BDBDBD" }}>
                              {pct > 0 ? (() => {
                                const totalAmt = amount ? parseFloat(amount) : NaN;
                                const shareAmt = !isNaN(totalAmt) && totalAmt !== 0 ? totalAmt * pct / 100 : NaN;
                                const shareStr = !isNaN(shareAmt)
                                  ? `（${Math.round(shareAmt).toLocaleString('zh-CN')}）`
                                  : '';
                                return `${pct.toFixed(2)}%${shareStr}`;
                              })() : "—"}
                            </span>
                            {amount && (
                              <span className="text-xs text-gray-400">¥{parseFloat(amount).toLocaleString("zh-CN")}</span>
                            )}
                          </div>
                          {pct > 0 ? (
                            <div className="relative h-2">
                              {isPersonOver ? (
                                <>
                                  {/* 超过100%：红色在底层（满格），灰色在上层作参照 */}
                                  <div
                                    className="absolute top-0 left-0 h-full rounded-full"
                                    style={{ width: "100%", backgroundColor: cat?.color || "#D32F2F" }}
                                  />
                                  <div
                                    className="absolute top-0 left-0 h-full rounded-full"
                                    style={{ width: `${grayWidth}%`, backgroundColor: "#E0E0E0", zIndex: 1 }}
                                  />
                                  {/* 100刻度标记：在灰色轨道右端 */}
                                  <div
                                    className="absolute flex items-center"
                                    style={{ left: `${grayWidth}%`, top: "-2px", bottom: "-2px", zIndex: 2, transform: "translateX(-50%)" }}
                                  >
                                    <div className="w-px h-full bg-gray-600" />
                                  </div>
                                  <span
                                    className="absolute text-gray-500"
                                    style={{ left: `${grayWidth}%`, top: "10px", fontSize: 8, transform: "translateX(-50%)", whiteSpace: "nowrap", zIndex: 2 }}
                                  >100</span>
                                </>
                              ) : (
                                <>
                                  {/* 未超过100%：灰色满格（代表100%），红色在内部按比例 */}
                                  <div
                                    className="absolute top-0 left-0 h-full rounded-full"
                                    style={{ width: "100%", backgroundColor: "#E0E0E0" }}
                                  />
                                  <div
                                    className="absolute top-0 left-0 h-full rounded-full"
                                    style={{ width: `${redWidth}%`, backgroundColor: cat?.color || "#D32F2F", zIndex: 1 }}
                                  />
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="h-2 rounded-full" style={{ backgroundColor: "#F5F5F5" }} />
                          )}
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
                    {total.toFixed(2)}% / 100%
                  </span>
                </div>

                {/* 批量操作栏（批量模式且有选中时显示） */}
                {batchSelectMode && (
                  <div className="mx-4 mb-4 flex items-center gap-2">
                    <div className="flex-1 text-xs text-gray-500">
                      {batchSelectedUsers.size > 0 ? `已修改 ${batchSelectedUsers.size} 人` : '点击头像切换显示/隐藏'}
                    </div>
                    {batchSelectedUsers.size > 0 && (
                      <button
                        type="button"
                        disabled={batchSaving}
                        onClick={() => {
                          if (!selectedTagName) return;
                          setBatchSaving(true);
                          const userIds = Array.from(batchSelectedUsers);
                          // editState 已在点击头像时实时更新，直接逐一保存
                          setTimeout(() => {
                            for (const uid of userIds) {
                              handleSaveMember(uid);
                            }
                            setBatchSaving(false);
                            setBatchSelectMode(false);
                            setBatchSelectedUsers(new Set());
                            toast.success(`已保存 ${userIds.length} 人的显示设置`);
                          }, 50);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: batchSaving ? '#BDBDBD' : '#D32F2F', color: '#FFFFFF' }}
                      >
                        <Save size={12} />
                        <span>{batchSaving ? '保存中...' : '保存'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        // 退出批量模式时恢复原始数据（放弃未保存的修改）
                        refetch();
                        setBatchSelectMode(false);
                        setBatchSelectedUsers(new Set());
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ backgroundColor: '#F5F5F5', color: '#757575' }}
                    >
                      取消
                    </button>
                  </div>
                )}
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
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">目标总金额</span>
                                <span className="text-xs text-gray-700">
                                  {(tagConfigData as any)?.target_total
                                    ? `¥${parseFloat((tagConfigData as any).target_total).toLocaleString('zh-CN')}`
                                    : <span className="text-gray-400">未设置</span>}
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
                        <div>
                          <div className="text-xs text-gray-400 mb-1">目标总金额（凑整工具基准）</div>
                          <input
                            type="number"
                            value={tagConfigForm.targetTotal}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, targetTotal: e.target.value }))}
                            placeholder="如：5000000"
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
                        {tagConfigForm.pauseDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">暂停日期</span>
                            <span className="text-xs font-medium" style={{ color: '#F59E0B' }}>{tagConfigForm.pauseDate}</span>
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
                        <div className="mt-2">
                          <div className="text-xs mb-1 font-medium" style={{ color: '#B45309' }}>暂停日期</div>
                          <input
                            type="date"
                            value={tagConfigForm.pauseDate}
                            onChange={e => setTagConfigForm(prev => ({ ...prev, pauseDate: e.target.value }))}
                            className="w-full rounded-xl px-3 py-2 text-sm border outline-none"
                            style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}
                          />
                          <div className="text-xs text-gray-400 mt-1">设置后，该日期及之后的日历格子显示暂停标志，无法新增记录</div>
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

              const toggleUserTag = (catName: string) => {
                const key = `${userId}__${catName}`;
                setExpandedUserTags(prev => {
                  const s = new Set(prev);
                  s.has(key) ? s.delete(key) : s.add(key);
                  return s;
                });
              };
              const isUserExpanded = expandedUsers.has(userId);
              const toggleUserExpand = () => setExpandedUsers(prev => {
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
                  {/* 用户头部：可点击收起/展开所有标签 */}
                  <div
                    className="flex items-center justify-between px-4 pt-3 pb-2 cursor-pointer"
                    style={{ borderBottom: isUserExpanded ? '1px solid #F0E8E0' : 'none' }}
                    onClick={toggleUserExpand}
                  >
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        username={member.username}
                        avatar={member.avatar}
                        nickname={member.nickname}
                        size="sm"
                      />
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {member.nickname || member.username || "未知用户"}
                        </div>
                        {!isUserExpanded ? (() => {
                          let running = 0, paused = 0;
                          for (const cat of categories) {
                            const e = userEdit[(cat as any).name] ?? defaultEntry();
                            if (!e.visible) continue;
                            let isPaused = false;
                            if (e.pauseHistory && e.pauseHistory.length > 0) {
                              const last = e.pauseHistory[e.pauseHistory.length - 1];
                              isPaused = !last.resumeDate;
                            } else if (e.pauseDate) {
                              isPaused = true;
                            }
                            isPaused ? paused++ : running++;
                          }
                          const parts = [];
                          if (running > 0) parts.push(`${running}个运行中`);
                          if (paused > 0) parts.push(`${paused}个暂停`);
                          return <div className="text-xs text-gray-400 mt-0.5">{parts.length > 0 ? parts.join('·') : '无活跃标签'}</div>;
                        })() : (
                          <div className="text-xs text-gray-400">
                            {member.role === "owner" ? "创建人" : member.role === "admin" ? "管理员" : "成员"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDirty && (
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
                      <ChevronDown
                        size={16}
                        className="text-gray-400 transition-transform flex-shrink-0"
                        style={{ transform: isUserExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </div>
                  </div>

                  {/* 标签列表：只在用户展开时显示 */}
                  {isUserExpanded && <div className="pb-2">
                    {[...categories].sort((a: any, b: any) => {
                      const getOrder = (catName: string) => {
                        const e = userEdit[catName] ?? defaultEntry();
                        if (!e.visible) return 2; // 隐藏排最后
                        // 判断暂停状态
                        let isPaused = false;
                        if (e.pauseHistory && e.pauseHistory.length > 0) {
                          const last = e.pauseHistory[e.pauseHistory.length - 1];
                          isPaused = !last.resumeDate;
                        } else if (e.pauseDate) {
                          isPaused = true;
                        }
                        return isPaused ? 1 : 0; // 暂停排中间，正常运行排最前
                      };
                      return getOrder(a.name) - getOrder(b.name);
                    }).map((cat: any) => {
                      const entry = userEdit[cat.name] ?? defaultEntry();
                      const marginCNY = calcMarginCNY(entry.margin, entry.marginCoin);
                      const tagKey = `${userId}__${cat.name}`;
                      const isCatExpanded = expandedUserTags.has(tagKey);
                      const hasRatio = entry.ratio !== '' && entry.ratio !== '0';
                      const hasAmount = entry.amount !== '' && entry.amount !== '0';
                      const amtNum = parseFloat(entry.amount);
                      const amtStr = !isNaN(amtNum)
                        ? amtNum >= 10000 ? `¥${(amtNum / 10000).toFixed(1)}万` : `¥${amtNum.toLocaleString('zh-CN')}`
                        : '';
                      // 计算暂停状态
                      let catPauseStatus: 'paused' | 'running' | 'none' = 'none';
                      if (entry.pauseHistory && entry.pauseHistory.length > 0) {
                        const last = entry.pauseHistory[entry.pauseHistory.length - 1];
                        catPauseStatus = last.resumeDate ? 'running' : 'paused';
                      } else if (entry.pauseDate) {
                        catPauseStatus = 'paused';
                      } else if (entry.startDate) {
                        catPauseStatus = 'running';
                      }
                      return (
                        <div key={cat.id} className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ backgroundColor: "#FAF3ED" }}>
                          {/* 标签行头部：可点击展开该标签 */}
                          <div
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
                            onClick={() => toggleUserTag(cat.name)}
                          >
                            <div className="flex items-center gap-2">
                              {catPauseStatus === 'paused'
                                ? <Pause size={12} className="flex-shrink-0" style={{ color: '#F59E0B' }} />
                                : <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#D32F2F' }} />
                              }
                              <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                              {!entry.visible && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#9E9E9E' }}>隐藏</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {hasRatio && <span className="text-xs text-gray-500">{parseFloat(entry.ratio).toFixed(2)}%</span>}
                              {hasAmount && amtStr && <span className="text-xs font-medium text-gray-700">{amtStr}</span>}
                              <ChevronDown
                                size={14}
                                className="text-gray-400 transition-transform flex-shrink-0"
                                style={{ transform: isCatExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                              />
                            </div>
                          </div>
                          {/* 展开内容 */}
                          {isCatExpanded && <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid #F0E8E0' }}>
                          {/* 显示开关 */}
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs text-gray-400">显示开关</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{entry.visible ? "显示" : "隐藏"}</span>
                              <button
                                type="button"
                                onClick={() => updateEntry(userId, cat.name, { visible: !entry.visible })}
                                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                                style={{ backgroundColor: entry.visible ? "#D32F2F" : "#D1D5DB" }}
                              >
                                <span
                                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                                  style={{ transform: entry.visible ? "translateX(18px)" : "translateX(2px)" }}
                                />
                              </button>
                            </div>
                          </div>

                          {/* 行2：开始日期 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                              开始日期
                            </span>
                            <div className="flex-1 flex items-center gap-1">
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
                              {entry.startDate && (
                                <button
                                  type="button"
                                  onClick={() => updateEntry(userId, cat.name, { startDate: '' })}
                                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                  style={{ fontSize: 12 }}
                                >×</button>
                              )}
                            </div>
                          </div>

                          {/* 行2b：暂停日期 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs w-16 flex-shrink-0 font-medium" style={{ color: '#B45309' }}>
                              暂停日期
                            </span>
                            <div className="flex-1 flex items-center gap-1">
                              <input
                                type="date"
                                value={entry.pauseDate}
                                onChange={(e) =>
                                  updateEntry(userId, cat.name, {
                                    pauseDate: e.target.value,
                                  })
                                }
                                className="flex-1 text-sm border rounded-lg px-2 py-1 outline-none"
                                style={{
                                  borderColor: '#FDE68A',
                                  backgroundColor: '#FFFBEB',
                                  color: '#92400E',
                                }}
                              />
                              {entry.pauseDate && (
                                <button
                                  type="button"
                                  onClick={() => updateEntry(userId, cat.name, { pauseDate: '' })}
                                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-amber-100"
                                  style={{ fontSize: 12, color: '#B45309' }}
                                >×</button>
                              )}
                            </div>
                          </div>

                          {/* 行3：初始比例 + 初始金额（同一行） */}
                          <div className="flex items-center gap-1 w-full overflow-hidden">
                            {/* 初始比例 */}
                            <span className="text-xs text-gray-400 flex-shrink-0">比例</span>
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
                              className="text-right text-sm border rounded-lg px-1 py-1 outline-none focus:border-red-400"
                              style={{
                                borderColor: "#E0E0E0",
                                backgroundColor: "#FFFFFF",
                                color: "#222222",
                                width: '52px',
                                minWidth: 0,
                              }}
                            />
                            <span className="text-xs text-gray-400 flex-shrink-0">%</span>
                            {/* 分隔线 */}
                            <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-1" />
                            {/* 初始金额 */}
                            <span className="text-xs text-gray-400 flex-shrink-0">金额¥</span>
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
                              className="flex-1 min-w-0 text-right text-sm border rounded-lg px-1 py-1 outline-none focus:border-red-400"
                              style={{
                                borderColor: "#E0E0E0",
                                backgroundColor: "#FFFFFF",
                                color: "#222222",
                              }}
                            />
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
                            {/* 保证金标签备注入口 */}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowMarginNoteModal({ userId, userName: member.nickname || member.username || `用户${userId}`, tagName: cat.name }); }}
                                className="text-xs font-medium"
                                style={{ color: '#1565C0', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '2px' }}
                              >保证金备注{(marginNoteCounts[`${userId}|${cat.name}`] ?? 0) > 0 ? ` (${marginNoteCounts[`${userId}|${cat.name}`]})` : ''}</button>
                            </div>
                          </div>
                          </div>}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 标签维度双击编辑弹窗 */}
      {tagEditModal && (() => {
        const { userId, tagName, catColor } = tagEditModal;
        const member = members.find((m: any) => m.userId === userId);
        const entry = editState[userId]?.[tagName] ?? defaultEntry();
        const marginCNY = calcMarginCNY(entry.margin, entry.marginCoin);
        const isSaving = savingUsers.has(userId);
        return (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => { setTagEditModal(null); setTargetTotalInput(''); }}
          >
            <div
              className="w-full rounded-t-2xl overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0E8E0' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                  <span className="text-sm font-semibold text-gray-800">{tagName}</span>
                  <span className="text-xs text-gray-400">· {member?.nickname || member?.username || `用户${userId}`}</span>
                </div>
                <button onClick={() => { setTagEditModal(null); setTargetTotalInput(''); }} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
              </div>
              {/* 内容区 */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                {/* 显示开关 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">显示开关</span>
                  <span className="text-xs text-gray-400">{entry.visible ? '显示' : '隐藏'}</span>
                  <button
                    type="button"
                    onClick={() => updateEntry(userId, tagName, { visible: !entry.visible })}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                    style={{ backgroundColor: entry.visible ? catColor : '#D1D5DB' }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: entry.visible ? 'translateX(18px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>

                {/* 开始日期 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 flex-shrink-0">开始日期</span>
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="date"
                      value={entry.startDate}
                      onChange={e => updateEntry(userId, tagName, { startDate: e.target.value })}
                      className="flex-1 text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400"
                      style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                    />
                    {entry.startDate && (
                      <button type="button" onClick={() => updateEntry(userId, tagName, { startDate: '' })} className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400" style={{ fontSize: 12 }}>×</button>
                    )}
                  </div>
                </div>
                {/* 目标金额 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 flex-shrink-0">目标金额</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-xs text-gray-400">¥</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={entry.targetAmount}
                      onChange={e => updateEntry(userId, tagName, { targetAmount: e.target.value })}
                      className="flex-1 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400"
                      style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                    />
                  </div>
                </div>
                {/* 暂停/重启历史 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: '#B45309' }}>暂停/重启历史</span>
                    {/* 操作按钮：根据当前状态显示不同按钮 */}
                    {(() => {
                      const history = entry.pauseHistory ?? [];
                      const lastItem = history[history.length - 1];
                      const isCurrentlyPaused = lastItem && !lastItem.resumeDate;
                      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                      if (isCurrentlyPaused) {
                        // 当前已暂停：显示“添加重启”按钮
                        return (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}
                            onClick={() => {
                              const newHistory = history.map((item, idx) =>
                                idx === history.length - 1 ? { ...item, resumeDate: today } : item
                              );
                              updateEntry(userId, tagName, { pauseHistory: newHistory });
                            }}
                          >
                            + 添加重启
                          </button>
                        );
                      } else {
                        // 当前未暂停（或无历史）：显示“添加暂停”按钮
                        return (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
                            onClick={() => {
                              const newHistory = [...history, { pauseDate: today }];
                              updateEntry(userId, tagName, { pauseHistory: newHistory });
                            }}
                          >
                            + 添加暂停
                          </button>
                        );
                      }
                    })()}
                  </div>
                  {/* 历史列表 */}
                  {(entry.pauseHistory ?? []).length === 0 ? (
                    <div className="text-xs text-gray-400 py-1">无暂停记录</div>
                  ) : (
                    <div className="space-y-1.5">
                      {(entry.pauseHistory ?? []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ backgroundColor: item.resumeDate ? '#F1F8E9' : '#FFFBEB', border: `1px solid ${item.resumeDate ? '#C5E1A5' : '#FDE68A'}` }}>
                          {/* 暂停日期 */}
                          <span className="text-xs font-medium" style={{ color: '#92400E', minWidth: 16 }}>暂</span>
                          <input
                            type="date"
                            value={item.pauseDate}
                            onChange={e => {
                              const newHistory = (entry.pauseHistory ?? []).map((h, i) => i === idx ? { ...h, pauseDate: e.target.value } : h);
                              updateEntry(userId, tagName, { pauseHistory: newHistory });
                            }}
                            className="text-xs border rounded px-1 py-0.5 outline-none"
                            style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#92400E', width: 110 }}
                          />
                          {/* 重启日期 */}
                          {item.resumeDate ? (
                            <>
                              <span className="text-xs font-medium" style={{ color: '#2E7D32', minWidth: 16 }}>启</span>
                              <input
                                type="date"
                                value={item.resumeDate}
                                onChange={e => {
                                  const newHistory = (entry.pauseHistory ?? []).map((h, i) => i === idx ? { ...h, resumeDate: e.target.value } : h);
                                  updateEntry(userId, tagName, { pauseHistory: newHistory });
                                }}
                                className="text-xs border rounded px-1 py-0.5 outline-none"
                                style={{ borderColor: '#C5E1A5', backgroundColor: '#F1F8E9', color: '#2E7D32', width: 110 }}
                              />
                            </>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>暂停中</span>
                          )}
                          {/* 删除按钮 */}
                          <button
                            type="button"
                            className="ml-auto w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0"
                            style={{ color: '#9E9E9E', fontSize: 12 }}
                            onClick={() => {
                              const newHistory = (entry.pauseHistory ?? []).filter((_, i) => i !== idx);
                              updateEntry(userId, tagName, { pauseHistory: newHistory });
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* 初始比例 + 初始金额（同一行） */}
                <div className="flex items-center gap-1 w-full overflow-hidden">
                  <span className="text-xs text-gray-400 flex-shrink-0">比例</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    min={0}
                    max={100}
                    value={entry.ratio}
                    onChange={e => updateEntry(userId, tagName, { ratio: e.target.value })}
                    className="text-right text-sm border rounded-lg px-1 py-1.5 outline-none focus:border-red-400"
                    style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222', width: '52px', minWidth: 0 }}
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">%</span>
                  <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-1" />
                  <span className="text-xs text-gray-400 flex-shrink-0">金额¥</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={entry.amount}
                    onChange={e => updateEntry(userId, tagName, { amount: e.target.value })}
                    className="flex-1 min-w-0 text-right text-sm border rounded-lg px-1 py-1.5 outline-none focus:border-red-400"
                    style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                  />
                </div>
                {/* 凑整工具：用目标金额计算剩余并填入比例 */}
                {(() => {
                  const tt = parseFloat(entry.targetAmount ?? '');
                  const ttValid = !isNaN(tt) && tt > 0;
                  const rows = tagRatioView[tagName] ?? [];
                  const othersShareAmt = rows.reduce((s: number, r: any) => {
                    if (r.member.userId === userId) return s;
                    const rAmt = r.amount ? parseFloat(r.amount) : NaN;
                    const share = !isNaN(rAmt) && rAmt !== 0 ? rAmt * r.ratio / 100 : 0;
                    return s + share;
                  }, 0);
                  const remain = ttValid ? Math.max(0, tt - othersShareAmt) : 0;
                  const myAmt = entry.amount ? parseFloat(String(entry.amount)) : NaN;
                  const myAmtValid = !isNaN(myAmt) && myAmt > 0;
                  return (
                    <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#F8F8FF', border: '1px solid #E8E8FF' }}>
                      <span className="text-xs font-medium" style={{ color: '#5C6BC0' }}>凑整工具</span>
                      {/* 参考信息 */}
                      {ttValid && (
                        <div className="text-xs text-gray-500 space-y-1 pb-1" style={{ borderBottom: '1px solid #E0E0FF' }}>
                          <div className="flex justify-between">
                            <span>目标金额</span>
                            <span className="font-medium" style={{ color: '#222' }}>¥{tt.toLocaleString('zh-CN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>其他人已分</span>
                            <span>¥{Math.round(othersShareAmt).toLocaleString('zh-CN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>剩余</span>
                            <span className="font-semibold" style={{ color: '#5C6BC0' }}>¥{Math.round(remain).toLocaleString('zh-CN')}</span>
                          </div>
                        </div>
                      )}
                      {/* 模式一：输入此人分配金额 → 反推比例 */}
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400">模式一：输入分配金额 → 反推比例</div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">¥</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="此人分配金额"
                            id={`roundAmt-${userId}-${tagName}`}
                            className="flex-1 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                            style={{ borderColor: '#C5CAE9', backgroundColor: '#FFFFFF', color: '#222' }}
                          />
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: ttValid ? '#5C6BC0' : '#BDBDBD', color: '#fff' }}
                            onClick={() => {
                              const el = document.getElementById(`roundAmt-${userId}-${tagName}`) as HTMLInputElement;
                              const v = parseFloat(el?.value ?? '');
                              if (!isNaN(v) && v > 0 && ttValid) {
                                updateEntry(userId, tagName, { ratio: (v / tt * 100).toFixed(4) });
                              }
                            }}
                          >填入比例</button>
                        </div>
                      </div>
                      {/* 模式二：输入比例 → 反推分配金额 */}
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400">模式二：输入比例 → 反推分配金额</div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="比例%"
                            id={`roundRatio-${userId}-${tagName}`}
                            className="flex-1 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                            style={{ borderColor: '#C5CAE9', backgroundColor: '#FFFFFF', color: '#222' }}
                          />
                          <span className="text-xs text-gray-400">%</span>
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: '#5C6BC0', color: '#fff' }}
                            onClick={() => {
                              const el = document.getElementById(`roundRatio-${userId}-${tagName}`) as HTMLInputElement;
                              const r = parseFloat(el?.value ?? '');
                              if (!isNaN(r) && r > 0 && ttValid) {
                                // 分配金额 = 目标金额 × 比例%
                                updateEntry(userId, tagName, { ratio: String(r) });
                              }
                            }}
                          >计算并填入</button>
                        </div>
                      </div>
                      {/* 快捷：剩余全部分给此人 */}
                      {ttValid && myAmtValid && (
                        <button
                          type="button"
                          className="w-full text-xs py-1.5 rounded-lg"
                          style={{ backgroundColor: '#EEF0FF', color: '#5C6BC0' }}
                          onClick={() => {
                            const ratio = (remain / tt * 100);
                            updateEntry(userId, tagName, { ratio: ratio.toFixed(4) });
                          }}
                        >剩余全部分给此人（¥{Math.round(remain).toLocaleString('zh-CN')}，占{(remain/tt*100).toFixed(2)}%）</button>
                      )}
                    </div>
                  );
                })()}
                {/* 初始保证金 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 w-full overflow-hidden">
                    <span className="text-xs text-gray-400 w-16 flex-shrink-0">初始保证金</span>
                    <select
                      value={entry.marginCoin}
                      onChange={e => updateEntry(userId, tagName, { marginCoin: e.target.value })}
                      className="text-xs border rounded-lg px-1 py-1.5 outline-none flex-shrink-0"
                      style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: entry.marginCoin ? catColor : '#9E9E9E', width: '60px' }}
                    >
                      <option value="">¥法币</option>
                      {CRYPTO_COINS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={entry.margin}
                      onChange={e => updateEntry(userId, tagName, { margin: e.target.value })}
                      className="min-w-0 flex-1 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400"
                      style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                    />
                  </div>
                  {marginCNY && (
                    <div className="flex justify-end">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF0F0', color: catColor }}>{marginCNY}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* 弹窗底部保存按鈕 */}
              <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid #F0E8E0' }}>
                <button
                  onClick={() => {
                    handleSaveMember(userId);
                    setTagEditModal(null);
                  }}
                  disabled={isSaving}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: isSaving ? '#BDBDBD' : catColor, color: '#FFFFFF' }}
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 保证金备注弹窗 */}
      {showMarginNoteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowMarginNoteModal(null)}
        >
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxWidth: 480, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#1A1A1A' }}>保证金备注 - {showMarginNoteModal.userName} · {showMarginNoteModal.tagName}</span>
              <button onClick={() => setShowMarginNoteModal(null)} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
            </div>

            <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: '50vh' }}>
              {/* 添加新备注 */}
              <div className="flex gap-2 mb-4 items-start">
                <textarea
                  placeholder="输入备注内容（可输入多行）"
                  value={newMarginNoteContent}
                  onChange={e => setNewMarginNoteContent(e.target.value)}
                  rows={3}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none border resize-y"
                  style={{ borderColor: '#E0E0E0', color: '#1A1A1A', minHeight: 72, lineHeight: 1.5 }}
                />
                <button
                  onClick={() => {
                    if (!newMarginNoteContent.trim()) return toast.error("请输入备注内容");
                    addMarginNoteMutation.mutate({ ledgerId, userId: showMarginNoteModal.userId, tagName: showMarginNoteModal.tagName, type: 'margin', content: newMarginNoteContent.trim() });
                  }}
                  disabled={addMarginNoteMutation.isPending}
                  className="px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
                >
                  添加
                </button>
              </div>

              {/* 备注列表 */}
              {(marginNotesData?.notes ?? []).length === 0 ? (
                <div className="text-center py-6" style={{ color: '#BDBDBD' }}>暂无备注</div>
              ) : (
                <div className="space-y-2">
                  {(marginNotesData?.notes ?? []).map((note: any) => (
                    <div key={note.id} className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FAFAFA' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs" style={{ color: '#9E9E9E' }}>
                          {new Date(note.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </div>
                        <div className="text-sm mt-0.5" style={{ color: '#1A1A1A', whiteSpace: 'pre-wrap' }}>{note.content}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('确认删除此备注？')) {
                            deleteMarginNoteMutation.mutate({ ledgerId, noteId: note.id });
                          }
                        }}
                        className="p-1 rounded flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#EF5350' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
