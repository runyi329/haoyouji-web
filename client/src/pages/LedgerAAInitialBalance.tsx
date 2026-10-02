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
 *  - 押金（margin）：数字币数量 or 人民币
 *  - 押金币种（marginCoin）：BTC/ETH/SOL/LDO/""（空=人民币）
 *
 * JSON key 规则（存入 ledger_members.initial_balances）：
 *   tagName                → 初始金额（人民币）
 *   tagName__ratio         → 初始比例
 *   tagName__margin        → 押金数量（数字币数量 or 人民币金额）
 *   tagName__marginCoin    → 押金币种（BTC/ETH/SOL/LDO，空=人民币）
 *   tagName__startDate     → 开始日期 (YYYY-MM-DD)
 *   tagName__visible       → 显示开关 (1 = 显示, 0 = 隐藏)
 */
import { Fragment, useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, ChevronDown, Save, Tag, Users, Trash2, CheckCircle2, Eye, EyeOff, Pause, Plus, ChartNoAxesCombined, WalletCards, LockKeyhole, Unlock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { ReadonlyWalletSnapshot } from "@/components/ReadonlyWalletSnapshot";
import { useAuth } from "@/_core/hooks/useAuth";
import { COIN_OPTIONS } from "@/components/FunderOrderCard";
import { AI_WALLET_CRYPTO_MARKET_ASSETS } from "@shared/ai-wallet-assets";

// 与52号融资付息订单保持同一币种覆盖范围；CNY 统一表示人民币。
const MARGIN_COIN_OPTIONS = ['CNY', ...COIN_OPTIONS.filter((coin) => coin !== 'CNY')];
// 37号保证金只接收人民币、USDT及全局钱包已启用的数字币；证券和商品资产不进入本账本。
const LEDGER_37_WALLET_CRYPTO_CODES = new Set<string>(AI_WALLET_CRYPTO_MARKET_ASSETS);

type MarginNote = {
  id: string;
  content: string;
  createdAt: string;
};

type WalletBalanceSnapshot = {
  assetCode: string;
  total: string;
  frozen: string;
  available: string;
  capturedAt?: string;
};

type MarginEntry = {
  id: string;
  coin: string;
  amount: string;
  createdAt: string;
  notes: MarginNote[];
  source?: 'wallet_hold' | 'manual';
  holdId?: number;
  status?: 'active' | 'released';
  releasedAmount?: string;
  remainingAmount?: string;
  migratedFrom?: 'manual';
  migrationNo?: string;
  walletBalanceSnapshot?: WalletBalanceSnapshot;
};

const createMarginEntry = (seed?: Partial<MarginEntry>): MarginEntry => ({
  id: seed?.id || `margin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  coin: normalizeMarginCoin(seed?.coin ?? 'CNY'),
  // 新建记录默认留空，避免移动端输入框被前端强制回填为 0；历史和手动输入的 0 仍原样保留。
  amount: seed?.amount === undefined || seed?.amount === null ? '' : String(seed.amount),
  // 只有新建明细记录当前时间；历史单笔若无来源时间，明确保留为空而不伪造时间。
  createdAt: seed && Object.prototype.hasOwnProperty.call(seed, 'createdAt') ? String(seed.createdAt ?? '') : new Date().toISOString(),
  notes: Array.isArray(seed?.notes) ? seed.notes : [],
  source: seed?.source,
  holdId: seed?.holdId,
  status: seed?.status,
  releasedAmount: seed?.releasedAmount === undefined || seed?.releasedAmount === null ? undefined : String(seed.releasedAmount),
  remainingAmount: seed?.remainingAmount === undefined || seed?.remainingAmount === null ? undefined : String(seed.remainingAmount),
  migratedFrom: seed?.migratedFrom,
  migrationNo: seed?.migrationNo,
  walletBalanceSnapshot: seed?.walletBalanceSnapshot,
});

const normalizeMarginCoin = (coin: unknown): string => {
  const value = String(coin ?? '').trim().toUpperCase();
  return value === '人民币' || value === 'RMB' || value === '元' || value === '' ? 'CNY' : value;
};

const formatSignedMarginAmount = (value: number, maximumFractionDigits = 2) => {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits })}`;
};

// 新格式优先读取 tagName__margins；历史单笔 margin/marginCoin 自动兼容为一笔明细。
const readMarginEntries = (balances: Record<string, any>, tagName: string, migratedAt?: string | null): MarginEntry[] => {
  const raw = balances[`${tagName}__margins`];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item === 'object')
          .map((item, index) => createMarginEntry({
            id: typeof item.id === 'string' ? item.id : `legacy_${tagName}_${index}`,
            coin: normalizeMarginCoin(item.coin),
            amount: String(item.amount ?? '0'),
            // 已保存为新版明细、却保留 legacy ID 且缺失时间的记录，
            // 使用成员配置的真实保存时间回填；真正旧单笔仍保留为空以明确降级。
            createdAt: typeof item.createdAt === 'string' && item.createdAt
              ? item.createdAt
              : (typeof item.id === 'string' && item.id.startsWith('legacy_') && migratedAt ? migratedAt : ''),
            notes: Array.isArray(item.notes)
              ? item.notes
                .filter((note: any) => note && typeof note.content === 'string')
                .map((note: any, noteIndex: number) => ({
                  id: typeof note.id === 'string' ? note.id : `legacy_note_${tagName}_${index}_${noteIndex}`,
                  content: note.content,
                  createdAt: typeof note.createdAt === 'string' ? note.createdAt : '',
                }))
              : [],
            source: item.source === 'wallet_hold' ? 'wallet_hold' : undefined,
            holdId: Number.isFinite(Number(item.holdId)) ? Number(item.holdId) : undefined,
            status: item.status === 'released' ? 'released' : item.status === 'active' ? 'active' : undefined,
            releasedAmount: item.releasedAmount === undefined || item.releasedAmount === null ? undefined : String(item.releasedAmount),
            remainingAmount: item.remainingAmount === undefined || item.remainingAmount === null ? undefined : String(item.remainingAmount),
            migratedFrom: item.migratedFrom === 'manual' ? 'manual' : undefined,
            migrationNo: typeof item.migrationNo === 'string' ? item.migrationNo : undefined,
            walletBalanceSnapshot: item.walletBalanceSnapshot && typeof item.walletBalanceSnapshot === 'object'
              && typeof item.walletBalanceSnapshot.assetCode === 'string'
              && typeof item.walletBalanceSnapshot.total === 'string'
              && typeof item.walletBalanceSnapshot.frozen === 'string'
              && typeof item.walletBalanceSnapshot.available === 'string'
              ? {
                assetCode: item.walletBalanceSnapshot.assetCode,
                total: item.walletBalanceSnapshot.total,
                frozen: item.walletBalanceSnapshot.frozen,
                available: item.walletBalanceSnapshot.available,
                capturedAt: typeof item.walletBalanceSnapshot.capturedAt === 'string' ? item.walletBalanceSnapshot.capturedAt : undefined,
              }
              : undefined,
          }));
      }
    } catch {
      // 新字段异常时继续兼容旧单笔字段，避免历史数据无法查看。
    }
  }
  const legacyAmount = balances[`${tagName}__margin`];
  if (legacyAmount === undefined || legacyAmount === null || String(legacyAmount) === '') return [];
  return [createMarginEntry({
    id: `legacy_${tagName}_0`,
    coin: normalizeMarginCoin(balances[`${tagName}__marginCoin`]),
    amount: String(legacyAmount),
    createdAt: '',
    notes: [],
  })];
};

const CNY_RATE_FALLBACK = 6.8; // 居底备用，实际汇率从接口实时获取

interface PauseHistoryItem {
  pauseDate: string;   // 暂停日期 YYYY-MM-DD
  resumeDate?: string; // 重启日期 YYYY-MM-DD（空表示尚未重启）
}
type PauseWalletHandling = {
  userId: number;
  tagName: string;
  pauseDate: string;
  action: 'retain' | 'release_wallet_holds';
};
interface TagEntry {
  amount: string;
  ratio: string;
  // 保留旧字段仅用于兼容历史保存；所有新编辑统一写入 margins 明细数组。
  margin: string;
  marginCoin: string;
  margins: MarginEntry[];
  // 尚存于旧 ledger_admin_notes 表的按标签备注；本次成员保存成功后将归档至首笔押金。
  legacyMarginNoteIds: number[];
  startDate: string;
  pauseDate: string;
  endDate: string;
  visible: boolean;
  // 兼容既有 `${tagName}__targetAmount` 存储键：现用于记录该用户在本标签的实际占用金额。
  targetAmount: string;
  pauseHistory: PauseHistoryItem[]; // 多次暂停/重启历史
}

const defaultEntry = (): TagEntry => ({
  amount: "",
  ratio: "",
  margin: "",
  marginCoin: "",
  margins: [],
  legacyMarginNoteIds: [],
  startDate: "",
  pauseDate: "",
  endDate: "",
  visible: true,
  targetAmount: "",
  pauseHistory: [],
});

export default function LedgerAAInitialBalance() {
  // 本地热预览复用生产只读数据，不能把试填比例、价格或可见性写回正式账本。
  const isLocalHotPreview = import.meta.env.DEV;
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();

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
  const isStockPortfolioTag = (category: any) => (
    category?.accountingMode === 'stock_portfolio' || category?.accounting_mode === 'stock_portfolio'
  );

  const { data: allBalancesData, refetch } =
    trpc.ledger.adminGetAllInitialBalances.useQuery(
      { ledgerId },
      { enabled: !!ledgerId }
    );
  // 37号初始金额管理的「用户」视图：胡大叔可从成员头像读取同款只读钱包快照。
  const [walletSnapshotUser, setWalletSnapshotUser] = useState<{ id: number; name: string; username?: string } | null>(null);
  const canViewLedger37WalletSnapshot = ledgerId === 37 && Number(user?.id) === 870413;
  const walletSnapshotQuery = trpc.adminGetLedger37MemberWalletSnapshot.useQuery(
    { ledgerId: 37, targetUserId: walletSnapshotUser?.id || 0 },
    {
      enabled: canViewLedger37WalletSnapshot && !!walletSnapshotUser?.id,
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  );
  const [walletMarginDraft, setWalletMarginDraft] = useState<{ userId: number; tagName: string; assetCode: string; amount: string } | null>(null);
  const [walletMarginReleaseDraft, setWalletMarginReleaseDraft] = useState<{ holdId: number; assetCode: string; maxAmount: string; amount: string } | null>(null);
  const [manualMarginMigrationDraft, setManualMarginMigrationDraft] = useState<{ userId: number; tagName: string; marginEntryId: string; assetCode: string; amount: string } | null>(null);
  // 暂停标签前先选择保证金去向；真正的暂停和解冻均在“保存”时才执行。
  const [pauseWalletHandlingDraft, setPauseWalletHandlingDraft] = useState<PauseWalletHandling | null>(null);
  const [pauseWalletPlans, setPauseWalletPlans] = useState<Record<string, PauseWalletHandling>>({});
  const walletMarginContextTargetUserId = walletMarginDraft?.userId ?? pauseWalletHandlingDraft?.userId;
  const walletMarginContext = trpc.ledger.getLedger37WalletMarginContext.useQuery(
    walletMarginContextTargetUserId ? { targetUserId: walletMarginContextTargetUserId } : undefined,
    // 热预览可只读查看真实可用余额；冻结/解冻 mutation 仍由服务端明确拒绝，绝不写入资金。
    { enabled: ledgerId === 37 && !!walletMarginContextTargetUserId, staleTime: 10_000 },
  );
  const walletMarginAvailableAssets = useMemo(() => {
    const context = walletMarginContext.data as any;
    if (!context) return [] as Array<{ assetCode: string; label: string; available: number; frozen: number; total: number }>;
    const assets: Array<{ assetCode: string; label: string; available: number; frozen: number; total: number }> = [];
    const addAsset = (assetCode: string, label: string, source: any) => {
      const available = Number(source?.available ?? source?.availableBalance ?? 0);
      // 只允许从可用余额冻结：余额为零或已全部冻结的资产不展示在下拉内。
      if (!Number.isFinite(available) || available <= 0) return;
      assets.push({
        assetCode,
        label,
        available,
        frozen: Number(source?.frozen ?? source?.frozenBalance ?? 0),
        total: Number(source?.total ?? source?.totalBalance ?? available),
      });
    };
    addAsset('CNY', '人民币 CNY', context.cny);
    addAsset('USDT', 'USDT', context.usdt);
    for (const balance of (context.multiAssetBalances ?? []) as any[]) {
      const assetCode = String(balance?.assetCode || '').trim().toUpperCase();
      if (!assetCode || assetCode === 'CNY' || assetCode === 'USDT' || !LEDGER_37_WALLET_CRYPTO_CODES.has(assetCode)) continue;
      addAsset(assetCode, assetCode, balance);
    }
    return assets;
  }, [walletMarginContext.data]);
  const selectedWalletMarginAsset = walletMarginAvailableAssets.find((asset) => asset.assetCode === walletMarginDraft?.assetCode) ?? null;
  const pauseWalletReleaseAssets = useMemo(() => {
    if (!pauseWalletHandlingDraft || pauseWalletHandlingDraft.action !== 'release_wallet_holds') return [] as Array<{ assetCode: string; amount: number }>;
    const byAsset = new Map<string, number>();
    for (const hold of ((walletMarginContext.data as any)?.holds ?? []) as any[]) {
      if (String(hold?.tagName || '') !== pauseWalletHandlingDraft.tagName || String(hold?.status || '') !== 'active') continue;
      const amount = Number(hold?.remainingAmount ?? hold?.amount ?? 0);
      if (!(amount > 0.00000001)) continue;
      const assetCode = String(hold?.assetCode || '').toUpperCase();
      byAsset.set(assetCode, (byAsset.get(assetCode) ?? 0) + amount);
    }
    return Array.from(byAsset.entries()).map(([assetCode, amount]) => ({ assetCode, amount }));
  }, [pauseWalletHandlingDraft, walletMarginContext.data]);
  const formatWalletMarginAssetBalance = (amount: number, assetCode: string) => {
    const formatted = Number(amount || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: assetCode === 'CNY' ? 2 : 0,
      maximumFractionDigits: assetCode === 'CNY' ? 2 : 8,
    });
    return assetCode === 'CNY' ? `¥${formatted}` : `${formatted} ${assetCode}`;
  };
  useEffect(() => {
    if (!walletMarginDraft || walletMarginContext.isLoading || walletMarginAvailableAssets.length === 0) return;
    if (walletMarginAvailableAssets.some((asset) => asset.assetCode === walletMarginDraft.assetCode)) return;
    const nextAsset = walletMarginAvailableAssets[0];
    setWalletMarginDraft((previous) => previous && previous.userId === walletMarginDraft.userId && previous.tagName === walletMarginDraft.tagName
      ? { ...previous, assetCode: nextAsset.assetCode, amount: '' }
      : previous);
  }, [walletMarginDraft?.assetCode, walletMarginDraft?.tagName, walletMarginDraft?.userId, walletMarginContext.isLoading, walletMarginAvailableAssets]);
  const freezeWalletMarginMutation = trpc.ledger.freezeLedger37MarginFromWallet.useMutation({
    onSuccess: async () => {
      toast.success('保证金已从全局钱包冻结');
      setWalletMarginDraft(null);
      await Promise.all([refetch(), walletMarginContext.refetch()]);
    },
    onError: (error) => toast.error(error.message || '冻结失败'),
  });
  const releaseWalletMarginMutation = trpc.ledger.releaseLedger37MarginToWallet.useMutation({
    onSuccess: async (result) => {
      toast.success(result.fullyReleased ? '该笔保证金已全部解冻并恢复可用' : '保证金已部分解冻并恢复可用');
      setWalletMarginReleaseDraft(null);
      await Promise.all([refetch(), walletMarginContext.refetch()]);
    },
    onError: (error) => toast.error(error.message || '解冻失败'),
  });
  const releasePausedTagMarginsMutation = trpc.ledger.releaseLedger37PausedTagMarginsToWallet.useMutation({
    onSuccess: async (result) => {
      const count = result.releases.length;
      toast.success(count > 0 ? `暂停标签的 ${count} 笔钱包保证金已解冻并回到成员账户` : '该暂停标签没有仍在冻结中的钱包保证金');
      await Promise.all([refetch(), walletMarginContext.refetch()]);
    },
    onError: (error) => toast.error(error.message || '暂停后的保证金解冻失败；该标签已暂停，保证金仍保持冻结'),
  });
  const migrateManualMarginMutation = trpc.ledger.migrateLedger37ManualMarginToWalletHold.useMutation({
    onSuccess: async (result) => {
      toast.success(result.alreadyCompleted ? '该笔历史保证金已迁入钱包冻结' : '历史保证金已迁入钱包并冻结；成员可用余额未增加');
      setManualMarginMigrationDraft(null);
      await Promise.all([refetch(), walletMarginContext.refetch()]);
    },
    onError: (error) => toast.error(error.message || '历史保证金迁入失败'),
  });

  const [editState, setEditState] = useState<
    Record<number, Record<string, TagEntry>>
  >({});
  const [dirtyUsers, setDirtyUsers] = useState<Set<number>>(new Set());
  const [savingUsers, setSavingUsers] = useState<Set<number>>(new Set());
  // 逐笔押金备注的未提交输入，按用户、标签和押金明细ID隔离。
  const [marginNoteDrafts, setMarginNoteDrafts] = useState<Record<string, string>>({});

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
        const legacyMarginNotes = ((allBalancesData as any).marginNotesMap?.[`${member.userId}|${n}`] ?? []) as Array<{ id: number; content: string; created_at: string }>;
        let marginEntries = readMarginEntries(balances, n, member.updatedAt ? new Date(member.updatedAt).toISOString() : null);
        if (legacyMarginNotes.length > 0) {
          const legacyNotes: MarginNote[] = legacyMarginNotes.map((note) => ({
            id: `legacy_note_${note.id}`,
            content: note.content,
            createdAt: note.created_at,
          }));
          const firstEntry = marginEntries[0] ?? createMarginEntry({ id: `legacy_${n}_0`, createdAt: '', notes: [] });
          const knownNoteIds = new Set((firstEntry.notes ?? []).map((note) => note.id));
          marginEntries = [{ ...firstEntry, notes: [...(firstEntry.notes ?? []), ...legacyNotes.filter((note) => !knownNoteIds.has(note.id))] }, ...marginEntries.slice(1)];
        }
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
          margins: marginEntries,
          legacyMarginNoteIds: legacyMarginNotes.map((note) => note.id),
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

  // 比例、初始金额、实际占用金额三联动：任意修改一项时，使用已存在的另一项反推第三项。
  // 优先以“初始金额”为基数；空值只清空当前项，不覆盖用户尚未完成的输入。
  const formatLinkedNumber = (value: number, maximumFractionDigits = 4) => {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(maximumFractionDigits)));
  };

  const allocationKey = (userId: number, tagName: string) => `${userId}__${tagName}`;
  const isCloseAllocationValue = (left: number, right: number) => Math.abs(left - right) < 0.005;

  // 用于展示：历史字段为空或保留旧零值时，直接展示可由另两项推算的实际结果。
  // 推算只发生在界面层；用户再次输入任一字段时，仍通过 updateAllocationLink 写入正确的三联动值。
  const resolveAllocationDisplay = (entry: TagEntry, userId: number, tagName: string) => {
    const amount = Number(entry.amount);
    const ratio = Number(entry.ratio);
    const actualAmount = Number(entry.targetAmount);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const hasRatio = Number.isFinite(ratio) && ratio >= 0;
    const hasActualAmount = Number.isFinite(actualAmount) && actualAmount >= 0;
    const key = allocationKey(userId, tagName);
    let derivedField: 'amount' | 'ratio' | 'targetAmount' | null = derivedAllocationFields[key] ?? null;
    const display = { amount: entry.amount, ratio: entry.ratio, targetAmount: entry.targetAmount };

    const canDeriveActual = hasAmount && hasRatio;
    const canDeriveRatio = hasAmount && hasActualAmount;
    const canDeriveAmount = hasRatio && ratio > 0 && hasActualAmount;
    const applyDerived = (field: 'amount' | 'ratio' | 'targetAmount') => {
      if (field === 'targetAmount' && canDeriveActual) display.targetAmount = formatLinkedNumber(amount * ratio / 100, 2);
      if (field === 'ratio' && canDeriveRatio) display.ratio = formatLinkedNumber(actualAmount / amount * 100);
      if (field === 'amount' && canDeriveAmount) display.amount = formatLinkedNumber(actualAmount / ratio * 100, 2);
    };

    if (derivedField === 'targetAmount' && canDeriveActual) applyDerived(derivedField);
    else if (derivedField === 'ratio' && canDeriveRatio) applyDerived(derivedField);
    else if (derivedField === 'amount' && canDeriveAmount) applyDerived(derivedField);
    else {
      derivedField = null;
      // 兼容旧数据：优先使用初始金额与比例推算实际权益，解决历史 targetAmount 为 0 的显示差异。
      if (canDeriveActual && (!hasActualAmount || !isCloseAllocationValue(actualAmount, amount * ratio / 100))) {
        derivedField = 'targetAmount';
        applyDerived(derivedField);
      } else if (canDeriveRatio && (!hasRatio || !isCloseAllocationValue(ratio, actualAmount / amount * 100))) {
        derivedField = 'ratio';
        applyDerived(derivedField);
      } else if (canDeriveAmount && (!hasAmount || !isCloseAllocationValue(amount, actualAmount / ratio * 100))) {
        derivedField = 'amount';
        applyDerived(derivedField);
      }
    }

    return { ...display, derivedField };
  };

  const updateAllocationLink = (
    userId: number,
    tagName: string,
    changedField: 'amount' | 'ratio' | 'targetAmount',
    rawValue: string,
  ) => {
    const current = editState[userId]?.[tagName] ?? defaultEntry();
    const next = { amount: current.amount, ratio: current.ratio, targetAmount: current.targetAmount, [changedField]: rawValue };
    const key = allocationKey(userId, tagName);
    if (rawValue.trim() === '') {
      setDerivedAllocationFields(prev => {
        const nextDerived = { ...prev };
        delete nextDerived[key];
        return nextDerived;
      });
      updateEntry(userId, tagName, { [changedField]: rawValue });
      return;
    }

    const amount = Number(next.amount);
    const ratio = Number(next.ratio);
    const actualAmount = Number(next.targetAmount);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const hasRatio = Number.isFinite(ratio) && ratio >= 0;
    const hasActualAmount = Number.isFinite(actualAmount) && actualAmount >= 0;
    let derivedField: 'amount' | 'ratio' | 'targetAmount' | null = null;

    if (changedField === 'amount') {
      if (hasRatio) {
        next.targetAmount = formatLinkedNumber(amount * ratio / 100, 2);
        derivedField = 'targetAmount';
      } else if (hasActualAmount) {
        next.ratio = formatLinkedNumber(actualAmount / amount * 100);
        derivedField = 'ratio';
      }
    } else if (changedField === 'ratio') {
      if (hasAmount) {
        next.targetAmount = formatLinkedNumber(amount * ratio / 100, 2);
        derivedField = 'targetAmount';
      } else if (hasActualAmount && ratio > 0) {
        next.amount = formatLinkedNumber(actualAmount / ratio * 100, 2);
        derivedField = 'amount';
      }
    } else if (hasAmount) {
      next.ratio = formatLinkedNumber(actualAmount / amount * 100);
      derivedField = 'ratio';
    } else if (hasRatio && ratio > 0) {
      next.amount = formatLinkedNumber(actualAmount / ratio * 100, 2);
      derivedField = 'amount';
    }

    setDerivedAllocationFields(prev => {
      const nextDerived = { ...prev };
      if (derivedField) nextDerived[key] = derivedField;
      else delete nextDerived[key];
      return nextDerived;
    });
    updateEntry(userId, tagName, next);
  };

  const handleSaveMember = async (userId: number) => {
    const userEdit = editState[userId] ?? {};
    const balances: Record<string, number | string> = {};
    for (const cat of categories) {
      const n = cat.name;
      const entry = userEdit[n] ?? defaultEntry();
      const isStockTag = isStockPortfolioTag(cat);

      if (!isStockTag && entry.amount !== "") {
        const num = parseFloat(entry.amount);
        if (!isNaN(num)) balances[n] = num;
      }
      if (!isStockTag && entry.ratio !== "") {
        const num = parseFloat(entry.ratio);
        if (!isNaN(num)) balances[`${n}__ratio`] = Math.max(0, num);
      }
      // 新格式：同一标签可保存多笔不同币种押金。金额为0仍保留，避免管理员的零值记录被误删。
      const marginEntries = (entry.margins ?? [])
        .map((item) => ({
          id: item.id || `margin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          coin: normalizeMarginCoin(item.coin),
          amount: String(item.amount ?? '').trim(),
          createdAt: item.createdAt || '',
          notes: (item.notes ?? [])
            .filter((note) => note && note.content.trim() !== '')
            .map((note) => ({ id: note.id, content: note.content.trim(), createdAt: note.createdAt || '' })),
          source: item.source,
          holdId: item.holdId,
          status: item.status,
          releasedAmount: item.releasedAmount,
          remainingAmount: item.remainingAmount,
          migratedFrom: item.migratedFrom,
          migrationNo: item.migrationNo,
        }))
        .filter((item) => item.amount !== '' && Number.isFinite(Number(item.amount)));
      balances[`${n}__margins`] = JSON.stringify(marginEntries.map((item) => ({
        id: item.id,
        coin: item.coin,
        amount: Number(item.amount),
        createdAt: item.createdAt,
        notes: item.notes,
        source: item.source,
        holdId: item.holdId,
        status: item.status,
        releasedAmount: item.releasedAmount,
        remainingAmount: item.remainingAmount,
        migratedFrom: item.migratedFrom,
        migrationNo: item.migrationNo,
      })));
      // 旧字段保留为首笔明细，供尚未升级的历史读取入口安全兼容；新展示以 __margins 为准。
      const legacyMargin = marginEntries[0];
      balances[`${n}__margin`] = legacyMargin ? Number(legacyMargin.amount) : 0;
      balances[`${n}__marginCoin`] = legacyMargin ? legacyMargin.coin : '';
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
      if (!isStockTag && entry.targetAmount !== "") {
        const num = parseFloat(entry.targetAmount);
        if (!isNaN(num)) balances[`${n}__targetAmount`] = num;
      }
    }
    const memberPausePlans = Object.values(pauseWalletPlans).filter((plan) => plan.userId === userId);
    // 热预览可以读取真实金额，但暂停与解冻均不允许落库或改动真实资金。
    if (isLocalHotPreview && memberPausePlans.length > 0) {
      toast.info('热预览仅展示暂停后的保证金处理，不会暂停标签或解冻真实钱包资金');
      return;
    }
    setSavingUsers((prev) => new Set(prev).add(userId));
    const migratedMarginNoteIds = categories.flatMap((cat: any) => userEdit[cat.name]?.legacyMarginNoteIds ?? []);
    try {
      // 先持久化暂停状态；只有保存成功后才允许退回钱包，避免“钱已退、标签仍运行”的状态。
      await setMutation.mutateAsync({
        ledgerId,
        targetUserId: userId,
        balances: balances as Record<string, number>,
        migratedMarginNoteIds,
      });
      const releasePlans = memberPausePlans.filter((plan) => plan.action === 'release_wallet_holds');
      if (releasePlans.length > 0) {
        setSavingUsers((previous) => new Set(previous).add(userId));
        try {
          for (const plan of releasePlans) {
            await releasePausedTagMarginsMutation.mutateAsync({ ledgerId: 37, targetUserId: userId, tagName: plan.tagName });
          }
        } finally {
          setSavingUsers((previous) => {
            const next = new Set(previous);
            next.delete(userId);
            return next;
          });
        }
      }
      if (memberPausePlans.length > 0) {
        setPauseWalletPlans((previous) => {
          const next = { ...previous };
          for (const [key, plan] of Object.entries(next)) if (plan.userId === userId) delete next[key];
          return next;
        });
      }
    } catch {
      // 各 mutation 已给出错误提示；草稿与暂停选择均保留，方便管理员修正后重试。
    }
  };

  const getMarginEntryCNY = (entry: MarginEntry): number | null => {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) return null;
    const coin = normalizeMarginCoin(entry.coin);
    if (coin === 'CNY') return amount;
    const price = cryptoPrices[coin] ?? (coin === 'USDT' ? CNY_RATE_FALLBACK : 0);
    return Number.isFinite(price) && price > 0 ? amount * price : null;
  };

  const summarizeMargins = (margins: MarginEntry[]) => {
    let totalCNY = 0;
    let validCount = 0;
    const unpricedCoins: string[] = [];
    for (const entry of margins) {
      if (String(entry.amount ?? '').trim() === '') continue;
      validCount += 1;
      const cnyValue = getMarginEntryCNY(entry);
      if (cnyValue === null) unpricedCoins.push(normalizeMarginCoin(entry.coin));
      else totalCNY += cnyValue;
    }
    return { totalCNY, validCount, unpricedCoins };
  };

  const updateMarginEntry = (userId: number, tagName: string, index: number, patch: Partial<MarginEntry>) => {
    const current = editState[userId]?.[tagName] ?? defaultEntry();
    // 空押金的首行也使用稳定ID，首次输入时不会因 key 变化重建 input 并丢失手机焦点。
    const nextMargins = current.margins.length > 0
      ? [...current.margins]
      : [createMarginEntry({ id: `draft_margin_${userId}_${tagName}`, createdAt: new Date().toISOString() })];
    nextMargins[index] = { ...nextMargins[index], ...patch };
    updateEntry(userId, tagName, { margins: nextMargins });
  };

  // 手机小数键盘通常没有负号。方向由明确的“存入+/转出−”按钮决定，
  // 输入框始终只接收绝对金额数字，系统在保存状态中自动写入正负号。
  const setMarginEntryDirection = (userId: number, tagName: string, index: number, currentAmount: string, direction: 'inflow' | 'outflow') => {
    const raw = String(currentAmount ?? '').trim();
    const magnitude = raw.replace(/^-/, '');
    // 空白转出暂存为单独的负号，让本次输入状态保持“转出”；保存时会自动排除未填写金额的草稿。
    updateMarginEntry(userId, tagName, index, { amount: direction === 'outflow' ? `-${magnitude}` : magnitude });
  };

  const addMarginEntry = (userId: number, tagName: string) => {
    const current = editState[userId]?.[tagName] ?? defaultEntry();
    const currentMargins = current.margins.length > 0
      ? current.margins
      : [createMarginEntry({ id: `draft_margin_${userId}_${tagName}`, createdAt: new Date().toISOString() })];
    updateEntry(userId, tagName, { margins: [...currentMargins, createMarginEntry()] });
  };

  const removeMarginEntry = (userId: number, tagName: string, index: number) => {
    const current = editState[userId]?.[tagName] ?? defaultEntry();
    updateEntry(userId, tagName, { margins: current.margins.filter((_, itemIndex) => itemIndex !== index) });
  };

  const openWalletMargin = (userId: number, tagName: string) => {
    setWalletMarginDraft({ userId, tagName, assetCode: 'CNY', amount: '' });
  };

  const submitWalletMargin = () => {
    if (!walletMarginDraft) return;
    if (!walletMarginDraft.amount || Number(walletMarginDraft.amount) <= 0) {
      toast.error('请输入有效的冻结金额');
      return;
    }
    if (!selectedWalletMarginAsset) {
      toast.error('该成员没有可用于冻结的人民币或数字币余额');
      return;
    }
    if (Number(walletMarginDraft.amount) - selectedWalletMarginAsset.available > 0.00000001) {
      toast.error(`冻结数量不能超过可用余额 ${formatWalletMarginAssetBalance(selectedWalletMarginAsset.available, selectedWalletMarginAsset.assetCode)}`);
      return;
    }
    if (isLocalHotPreview) {
      toast.info('热预览仅展示钱包冻结流程，不会操作真实资金');
      return;
    }
    freezeWalletMarginMutation.mutate({
      ledgerId: 37,
      targetUserId: walletMarginDraft.userId,
      tagName: walletMarginDraft.tagName,
      assetCode: walletMarginDraft.assetCode,
      amount: walletMarginDraft.amount,
    });
  };

  const openWalletMarginRelease = (holdId: number | undefined, assetCode: string, remainingAmount: string) => {
    if (!holdId || Number(remainingAmount) <= 0) return;
    setWalletMarginReleaseDraft({ holdId, assetCode, maxAmount: remainingAmount, amount: '' });
  };

  const submitWalletMarginRelease = () => {
    if (!walletMarginReleaseDraft) return;
    const amount = Number(walletMarginReleaseDraft.amount);
    const maximum = Number(walletMarginReleaseDraft.maxAmount);
    if (!(amount > 0)) {
      toast.error('请输入需要减少的保证金数量');
      return;
    }
    if (amount - maximum > 0.00000001) {
      toast.error(`本笔最多可解冻 ${formatWalletMarginAssetBalance(maximum, walletMarginReleaseDraft.assetCode)}`);
      return;
    }
    if (isLocalHotPreview) {
      toast.info('热预览仅展示保证金减少与解冻流程，不会操作真实资金');
      return;
    }
    releaseWalletMarginMutation.mutate({ ledgerId: 37, holdId: walletMarginReleaseDraft.holdId, amount: walletMarginReleaseDraft.amount });
  };

  const openManualMarginMigration = (userId: number, tagName: string, marginEntry: MarginEntry) => {
    const amount = String(marginEntry.amount ?? '').trim();
    if (!(Number(amount) > 0)) {
      toast.error('仅正数历史手工保证金可迁入钱包；转出或平移记录需保留线下核对');
      return;
    }
    if (dirtyUsers.has(userId)) {
      toast.error('请先保存该成员当前的标签修改，再迁入历史手工保证金');
      return;
    }
    setManualMarginMigrationDraft({
      userId,
      tagName,
      marginEntryId: marginEntry.id,
      assetCode: normalizeMarginCoin(marginEntry.coin),
      amount,
    });
  };

  const submitManualMarginMigration = () => {
    if (!manualMarginMigrationDraft) return;
    if (isLocalHotPreview) {
      toast.info('热预览仅展示历史保证金迁入冻结流程，不会写入真实钱包资金');
      return;
    }
    migrateManualMarginMutation.mutate({
      ledgerId: 37,
      targetUserId: manualMarginMigrationDraft.userId,
      tagName: manualMarginMigrationDraft.tagName,
      marginEntryId: manualMarginMigrationDraft.marginEntryId,
    });
  };

  const MarginEntriesEditor = ({ userId, tagName, entry, accentColor, compact = false }: {
    userId: number;
    tagName: string;
    entry: TagEntry;
    accentColor: string;
    compact?: boolean;
  }) => {
    const rows = entry.margins.length > 0
      ? entry.margins
      : ledgerId === 37 ? [] : [createMarginEntry({ id: `draft_margin_${userId}_${tagName}`, createdAt: '' })];
    const summary = summarizeMargins(entry.margins);
    const formatRecordedAt = (value: string) => {
      if (!value) return '历史记录';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '历史记录' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const addNote = (index: number, marginEntry: MarginEntry) => {
      const key = `${userId}|${tagName}|${marginEntry.id}`;
      const content = (marginNoteDrafts[key] ?? '').trim();
      if (!content) return;
      const note: MarginNote = { id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, content, createdAt: new Date().toISOString() };
      updateMarginEntry(userId, tagName, index, { notes: [...(marginEntry.notes ?? []), note] });
      setMarginNoteDrafts((previous) => ({ ...previous, [key]: '' }));
    };
    return (
      <div className="space-y-2">
        {rows.map((marginEntry, index) => {
          const noteKey = `${userId}|${tagName}|${marginEntry.id}`;
          const cnyValue = getMarginEntryCNY(marginEntry);
          const rawAmount = String(marginEntry.amount ?? '').trim();
          const isOutflow = rawAmount.startsWith('-');
          const isWalletHold = ledgerId === 37 && marginEntry.source === 'wallet_hold';
          const isLegacyReadOnly = ledgerId === 37;
          if (isWalletHold) {
            const isReleased = marginEntry.status === 'released' || isOutflow;
            const originalFrozenAmount = rawAmount.replace(/^-/, '');
            const remainingFrozenAmount = String(marginEntry.remainingAmount ?? originalFrozenAmount);
            const releasedFromThisHold = Number(marginEntry.releasedAmount || 0);
            const isPartialRelease = !isReleased && releasedFromThisHold > 0.00000001;
            const isReleaseEditing = !isReleased && walletMarginReleaseDraft?.holdId === marginEntry.holdId;
            const displayedCnyValue = isPartialRelease && cnyValue !== null && Number(originalFrozenAmount) > 0
              ? cnyValue * Number(remainingFrozenAmount) / Number(originalFrozenAmount)
              : cnyValue;
            return (
              <div key={marginEntry.id || `${tagName}-margin-${index}`} className="rounded-xl px-2 py-2" style={{ backgroundColor: isReleased ? '#FAFAFA' : '#F2F8FF', border: `1px solid ${isReleased ? '#F0F0F0' : '#CDE1F7'}` }}>
                <div className="flex items-center gap-1.5">
                  <div className="h-7 w-7 flex items-center justify-center rounded-lg" style={{ backgroundColor: isReleased ? '#ECEFF1' : '#E2F0FF', color: isReleased ? '#78909C' : '#1565C0' }}>
                    {isReleased ? <Unlock size={14} /> : <LockKeyhole size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium" style={{ color: '#37474F' }}>{marginEntry.migratedFrom === 'manual' ? '历史手工迁入 · ' : '钱包'}{isReleased ? '解冻' : '冻结'} · {normalizeMarginCoin(marginEntry.coin)}</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: isReleased ? '#78909C' : '#1565C0' }}>{isReleased ? '−' : ''}{isReleased ? originalFrozenAmount : remainingFrozenAmount}</span>
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: '#78909C' }}>记录时间：{formatRecordedAt(marginEntry.createdAt)}{displayedCnyValue !== null ? ` · ≈ ¥${formatSignedMarginAmount(displayedCnyValue, 0)}` : ''}{isPartialRelease ? ` · 已解冻 ${marginEntry.releasedAmount}` : ''}{marginEntry.migrationNo ? ` · 迁移单 ${marginEntry.migrationNo}` : ''}</div>
                  </div>
                  {!isReleased && (
                    <button type="button" onClick={() => openWalletMarginRelease(marginEntry.holdId, normalizeMarginCoin(marginEntry.coin), remainingFrozenAmount)} disabled={releaseWalletMarginMutation.isPending} className="h-7 rounded-lg px-2 text-[10px] font-medium disabled:opacity-50" style={{ backgroundColor: '#FFFFFF', color: '#1565C0', border: '1px solid #B8D7F3' }}>
                      减少/解冻
                    </button>
                  )}
                </div>
                {isReleaseEditing && walletMarginReleaseDraft && (
                  <div className="mt-2 rounded-lg p-2" style={{ backgroundColor: '#FFFFFF', border: '1px solid #B8D7F3' }}>
                    <div className="text-[10px]" style={{ color: '#78909C' }}>本笔当前冻结 {formatWalletMarginAssetBalance(Number(remainingFrozenAmount), walletMarginReleaseDraft.assetCode)}；减少后立即回到该成员同币种可用余额。</div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input type="text" inputMode="decimal" value={walletMarginReleaseDraft.amount} onChange={(event) => /^\d*\.?\d*$/.test(event.target.value) && setWalletMarginReleaseDraft({ ...walletMarginReleaseDraft, amount: event.target.value })} placeholder="减少数量" className="h-7 min-w-0 flex-1 rounded-lg border px-2 text-right text-xs outline-none" style={{ borderColor: '#B8D7F3' }} />
                      <button type="button" onClick={() => setWalletMarginReleaseDraft({ ...walletMarginReleaseDraft, amount: walletMarginReleaseDraft.maxAmount })} className="h-7 rounded-lg px-2 text-[10px] font-medium" style={{ backgroundColor: '#EAF3FF', color: '#1565C0' }}>全部</button>
                    </div>
                    <div className="mt-1.5 flex justify-end gap-2"><button type="button" onClick={() => setWalletMarginReleaseDraft(null)} className="h-7 px-2 text-[10px]" style={{ color: '#78909C' }}>取消</button><button type="button" onClick={submitWalletMarginRelease} disabled={releaseWalletMarginMutation.isPending} className="h-7 rounded-lg px-2.5 text-[10px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#1565C0' }}>确认减少</button></div>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={marginEntry.id || `${tagName}-margin-${index}`} className="rounded-xl px-2 py-2" style={{ backgroundColor: '#FAFAFA', border: '1px solid #F0F0F0' }}>
              <div className="flex items-center gap-1.5 w-full min-w-0">
                <span className="text-xs text-gray-400 w-10 flex-shrink-0">{index === 0 ? '押金' : `第${index + 1}笔`}</span>
                <div className="flex rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: '#E0E0E0' }} aria-label="选择押金方向">
                  <button
                    type="button"
                    disabled={isLegacyReadOnly}
                    onClick={() => setMarginEntryDirection(userId, tagName, index, rawAmount, 'inflow')}
                    className="h-7 px-1.5 text-[10px] font-medium"
                    style={!isOutflow ? { backgroundColor: '#EAF3FF', color: '#1565C0' } : { backgroundColor: '#FFFFFF', color: '#9E9E9E' }}
                    title="存入：本笔作为正数计入押金"
                  >
                    存入 +
                  </button>
                  <button
                    type="button"
                    disabled={isLegacyReadOnly}
                    onClick={() => setMarginEntryDirection(userId, tagName, index, rawAmount, 'outflow')}
                    className="h-7 px-1.5 text-[10px] font-medium border-l"
                    style={isOutflow ? { borderColor: '#F3CDD1', backgroundColor: '#FFF1F2', color: '#D32F2F' } : { borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#9E9E9E' }}
                    title="转出：本笔作为负数从押金中扣减或平移"
                  >
                    转出 −
                  </button>
                </div>
                <select
                  value={normalizeMarginCoin(marginEntry.coin)}
                  disabled={isLegacyReadOnly}
                  onChange={(event) => updateMarginEntry(userId, tagName, index, { coin: event.target.value })}
                  className="text-xs border rounded-lg px-1 py-1.5 outline-none flex-shrink-0"
                  style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: normalizeMarginCoin(marginEntry.coin) === 'CNY' ? '#9E9E9E' : accentColor, width: compact ? '56px' : '66px' }}
                >
                  {MARGIN_COIN_OPTIONS.map((coin) => (
                    <option key={coin} value={coin}>{coin === 'CNY' ? '人民币' : coin}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                  placeholder={isOutflow ? '输入转出金额' : '输入存入金额'}
                  value={rawAmount.replace(/^-/, '')}
                  disabled={isLegacyReadOnly}
                  onChange={(event) => {
                    const nextMagnitude = event.target.value;
                    if (/^(?:\d*\.?\d*)?$/.test(nextMagnitude)) {
                      updateMarginEntry(userId, tagName, index, { amount: isOutflow ? `-${nextMagnitude}` : nextMagnitude });
                    }
                  }}
                  className="min-w-0 flex-1 text-right text-sm border rounded-lg px-2 py-1.5 outline-none focus:border-red-400"
                  style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: isOutflow ? '#D32F2F' : '#222222' }}
                />
                {ledgerId === 37 && !isOutflow && Number(rawAmount) > 0 && (
                  <button type="button" onClick={() => openManualMarginMigration(userId, tagName, marginEntry)} className="h-7 rounded-lg px-2 text-[10px] font-medium flex-shrink-0" style={{ backgroundColor: '#EAF3FF', color: '#1565C0', border: '1px solid #B8D7F3' }}>
                    迁入冻结
                  </button>
                )}
                {rows.length > 1 && !isLegacyReadOnly && (
                  <button type="button" aria-label="删除该笔押金" onClick={() => removeMarginEntry(userId, tagName, index)} className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: '#EF5350', backgroundColor: '#FFF5F5' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {ledgerId === 37 && manualMarginMigrationDraft?.userId === userId && manualMarginMigrationDraft.tagName === tagName && manualMarginMigrationDraft.marginEntryId === marginEntry.id && (
                <div className="ml-10 mt-2 rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: '#F2F8FF', border: '1px solid #B8D7F3' }}>
                  <div className="text-xs font-semibold" style={{ color: '#1565C0' }}>迁入全局钱包并冻结</div>
                  <div className="text-[10px] leading-4" style={{ color: '#607D8B' }}>确认将本笔 {formatWalletMarginAssetBalance(Number(manualMarginMigrationDraft.amount), manualMarginMigrationDraft.assetCode)} 迁入成员全局钱包，并立刻冻结给「{tagName}」。钱包总额会纳入该笔历史资金，但可用余额不会增加；标签暂停选择解冻时才恢复可用。</div>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setManualMarginMigrationDraft(null)} className="h-7 px-2 text-[10px]" style={{ color: '#78909C' }}>取消</button><button type="button" onClick={submitManualMarginMigration} disabled={migrateManualMarginMutation.isPending} className="h-7 rounded-lg px-2.5 text-[10px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#1565C0' }}>确认迁入并冻结</button></div>
                </div>
              )}
              <div className="ml-10 mt-1 flex items-center justify-between gap-2 text-xs">
                <span style={{ color: '#9E9E9E' }}>记录时间：{formatRecordedAt(marginEntry.createdAt)}</span>
                <span style={{ color: cnyValue === null ? '#B26A00' : isOutflow ? '#D32F2F' : '#757575' }}>{cnyValue === null ? '暂无可靠报价' : `≈ ¥${formatSignedMarginAmount(cnyValue, 0)}`}</span>
              </div>
              <div className="ml-10 mt-1.5 space-y-1.5">
                {(marginEntry.notes ?? []).map((note) => (
                  <div key={note.id} className="flex items-start gap-1.5 rounded-lg px-2 py-1.5" style={{ backgroundColor: '#FFFFFF' }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs" style={{ color: '#9E9E9E' }}>{formatRecordedAt(note.createdAt)}</div>
                      <div className="text-xs whitespace-pre-wrap" style={{ color: '#424242' }}>{note.content}</div>
                    </div>
                    <button type="button" aria-label="删除该笔押金备注" onClick={() => updateMarginEntry(userId, tagName, index, { notes: (marginEntry.notes ?? []).filter((item) => item.id !== note.id) })} className="p-0.5 flex-shrink-0" style={{ color: '#EF5350' }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={marginNoteDrafts[noteKey] ?? ''}
                    onChange={(event) => setMarginNoteDrafts((previous) => ({ ...previous, [noteKey]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNote(index, marginEntry); } }}
                    placeholder="添加本笔押金备注"
                    className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs outline-none focus:border-red-400"
                    style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                  />
                  <button type="button" onClick={() => addNote(index, marginEntry)} className="px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0" style={{ backgroundColor: '#FFF0F0', color: accentColor }}>添加</button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between pl-10 gap-2">
          {ledgerId === 37 ? (
            <button type="button" onClick={() => openWalletMargin(userId, tagName)} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#1565C0' }}>
              <WalletCards size={13} /> 从钱包冻结保证金
            </button>
          ) : (
            <button type="button" onClick={() => addMarginEntry(userId, tagName)} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: accentColor }}>
              <Plus size={13} /> 新增一笔押金流水
            </button>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full text-right" style={{ backgroundColor: '#FFF0F0', color: accentColor }}>
            {summary.validCount}笔 · 净额 ≈ ¥{formatSignedMarginAmount(summary.totalCNY, 0)}
          </span>
        </div>
        {ledgerId === 37 ? (
          <div className="pl-10 text-xs" style={{ color: '#78909C' }}>新保证金从全局钱包冻结：总额不变、可用额减少；解冻后恢复可用。历史手工保证金可逐笔迁入钱包并冻结，暂停后可按原币种解冻。</div>
        ) : (
          <div className="pl-10 text-xs" style={{ color: '#9E9E9E' }}>正数为存入，负数为转出或平移；每笔流水与备注均会保留。</div>
        )}
        {ledgerId === 37 && walletMarginDraft?.userId === userId && walletMarginDraft.tagName === tagName && (
          <div className="ml-10 rounded-lg p-2.5 space-y-2" style={{ backgroundColor: '#F2F8FF', border: '1px solid #CDE1F7' }}>
            <div className="text-xs font-medium" style={{ color: '#1565C0' }}>从全局钱包冻结保证金</div>
            <div className="grid grid-cols-[92px_1fr] gap-2">
              <select value={selectedWalletMarginAsset?.assetCode ?? ''} disabled={walletMarginContext.isLoading || walletMarginAvailableAssets.length === 0} onChange={(event) => setWalletMarginDraft({ ...walletMarginDraft, assetCode: event.target.value, amount: '' })} className="h-8 rounded-lg border bg-white px-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" style={{ borderColor: '#B8D7F3' }}>
                {walletMarginContext.isLoading ? (
                  <option value="">读取余额…</option>
                ) : walletMarginAvailableAssets.length > 0 ? (
                  walletMarginAvailableAssets.map((asset) => <option key={asset.assetCode} value={asset.assetCode}>{asset.label}</option>)
                ) : (
                  <option value="">无可用资产</option>
                )}
              </select>
              <input type="text" inputMode="decimal" disabled={!selectedWalletMarginAsset} value={walletMarginDraft.amount} onChange={(event) => /^\d*\.?\d*$/.test(event.target.value) && setWalletMarginDraft({ ...walletMarginDraft, amount: event.target.value })} placeholder={selectedWalletMarginAsset ? `冻结数量（可用 ${formatWalletMarginAssetBalance(selectedWalletMarginAsset.available, selectedWalletMarginAsset.assetCode)}）` : '暂无可冻结余额'} className="h-8 min-w-0 rounded-lg border bg-white px-2 text-right text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60" style={{ borderColor: '#B8D7F3' }} />
            </div>
            {walletMarginContext.isError ? (
              <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: '#C62828' }}><span>钱包余额读取失败</span><button type="button" onClick={() => walletMarginContext.refetch()} className="font-medium underline">重试</button></div>
            ) : walletMarginContext.isLoading ? (
              <div className="text-[10px]" style={{ color: '#78909C' }}>正在读取该成员的全局钱包可用余额…</div>
            ) : selectedWalletMarginAsset ? (
              <div className="text-[10px] tabular-nums" style={{ color: '#78909C' }}>可用 <span className="font-semibold" style={{ color: '#1565C0' }}>{formatWalletMarginAssetBalance(selectedWalletMarginAsset.available, selectedWalletMarginAsset.assetCode)}</span> · 已冻结 {formatWalletMarginAssetBalance(selectedWalletMarginAsset.frozen, selectedWalletMarginAsset.assetCode)} · 总额 {formatWalletMarginAssetBalance(selectedWalletMarginAsset.total, selectedWalletMarginAsset.assetCode)}</div>
            ) : (
              <div className="text-[10px]" style={{ color: '#78909C' }}>该成员没有可用于冻结的人民币或数字币余额；已全部冻结的资产不会显示。</div>
            )}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setWalletMarginDraft(null)} className="h-7 px-2 text-xs" style={{ color: '#78909C' }}>取消</button><button type="button" onClick={submitWalletMargin} disabled={freezeWalletMarginMutation.isPending || !selectedWalletMarginAsset} className="h-7 rounded-lg px-3 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#1565C0' }}>确认冻结</button></div>
          </div>
        )}
        {summary.unpricedCoins.length > 0 && (
          <div className="pl-10 text-xs" style={{ color: '#B26A00' }}>
            {Array.from(new Set(summary.unpricedCoins)).join('、')} 暂无可靠报价，未计入人民币汇总
          </div>
        )}
      </div>
    );
  };

  // 股票标签没有标签级“初始金额”。此处是所有成员共享的“股票批次 × 参与股数”矩阵：
  // 默认收起每笔持仓；只有管理员点击某一持仓的「编辑」后才展开成员输入，并由该持仓单独保存。
  const renderStockParticipationEditor = ({ selectedUserId, accentColor }: { selectedUserId: number; accentColor: string }) => {
    if (stockParticipationError) {
      return (
        <section className="rounded-xl p-3 text-xs" style={{ backgroundColor: '#FFF7F7', border: '1px solid #F5C2C7', color: '#A33A3A' }}>
          <div>股票批次分配载入失败：{stockParticipationError.message || '请稍后重试'}</div>
          <button type="button" onClick={() => refetchStockParticipationMatrix()} className="mt-2 rounded-md px-2 py-1 text-xs" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5A6AD' }}>重新载入</button>
        </section>
      );
    }
    if (!stockParticipationMatrix) {
      return <section className="rounded-xl p-3 text-xs text-gray-400" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E8E8E8' }}>正在载入股票批次与参与分配…</section>;
    }
    const matrix = stockParticipationMatrix as any;
    const formatNumber = (value: number, digits = 2) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });
    const formatTradeTime = (value?: string | null) => {
      if (!value) return '历史批次';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(date).replaceAll('/', '-');
    };
    const dateInputValue = (value?: string | null) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    };
    return (
      <section className="space-y-2">
        {matrix.lots.length === 0 ? (
          <div className="rounded-lg bg-white px-3 py-4 text-center text-xs text-gray-400">该标签还没有登记股票；请先在股票账户页新增买入或加仓。</div>
        ) : matrix.lots.map((lot: any, lotIndex: number) => {
          const globalClosed = lot.status === 'closed';
          const lotId = Number(lot.id);
          const lotNumber = String(lotIndex + 1).padStart(2, '0');
          const isExpanded = expandedStockLots.has(lotId);
          const isEditing = editingStockLots.has(lotId);
          const isSaving = savingStockLots.has(lotId);
          const activeParticipations = lot.participations.filter((item: any) => Number(item.remainingQuantity || 0) > 0);
          const totalAllocatedQuantity = activeParticipations.reduce((total: number, item: any) => total + Number(item.remainingQuantity || 0), 0);
          const holdingTotal = Number(lot.initialQuantity || 0) * Number(lot.unitCost || 0);
          const marketValue = lot.marketPrice === null || lot.marketPrice === undefined
            ? null
            : Number(lot.currentQuantity || 0) * Number(lot.marketPrice || 0);
          // 当前市值按尚未卖出的持仓计算；盈亏也以相同的剩余数量对比该批次均价，避免部分卖出后混入历史已实现收益。
          const marketPnl = marketValue === null
            ? null
            : marketValue - Number(lot.currentQuantity || 0) * Number(lot.unitCost || 0);
          const tradeTimestamp = formatTradeTime(lot.actualTradedAt || lot.openedAt);
          const startLotSave = async () => {
            if (!matrix.canEdit || globalClosed || isSaving) return;
            const proposedRows: Array<{ targetUserId: number; quantity: number; previousQuantity: number; entryPrice?: number; startDate: string; pauseDate: string }> = [];
            let proposedTotal = 0;
            for (const member of matrix.members as any[]) {
              const participation = lot.participations.find((item: any) => Number(item.userId) === Number(member.userId));
              const previousQuantity = Number(participation?.remainingQuantity || 0);
              const share = lot.currentQuantity > 0 ? previousQuantity / lot.currentQuantity * 100 : 0;
              const savedEntryPrice = Number(participation?.entryPrice || lot.unitCost || lot.openingReferencePrice || 0);
              const defaultStartDate = dateInputValue(lot.actualTradedAt || lot.openedAt);
              const savedStartDate = participation?.startDate || defaultStartDate;
              const savedPauseDate = participation?.pauseDate || '';
              const draftKey = `${lot.id}:${member.userId}`;
              const fallbackDraft = { percentage: share ? String(Math.round(share)) : '', entryPrice: savedEntryPrice ? String(savedEntryPrice) : '', startDate: savedStartDate, pauseDate: savedPauseDate };
              const savedDraft = stockParticipationDrafts[draftKey];
              const draft = savedDraft ?? fallbackDraft;
              const percentage = Math.round(Math.max(0, Math.min(100, Number(draft.percentage) || 0)));
              // 历史份额可能不是整数百分比。未触碰比例时保留其原始股数，日期或入场价单独修改绝不因为界面显示的整数比例而改仓。
              const percentageChanged = savedDraft?.percentage !== undefined && savedDraft.percentage !== fallbackDraft.percentage;
              const quantity = percentageChanged ? lot.currentQuantity * percentage / 100 : previousQuantity;
              const entryPrice = Number(draft.entryPrice);
              const effectiveEntryPrice = Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : savedEntryPrice;
              const startDate = draft.startDate || defaultStartDate;
              const pauseDate = draft.pauseDate || '';
              if (pauseDate && startDate && pauseDate < startDate) {
                toast.error(`${member.name} 的暂停日期不能早于开始日期`);
                return;
              }
              if (quantity > 0 && (!Number.isFinite(effectiveEntryPrice) || effectiveEntryPrice <= 0)) {
                toast.error(`${member.name} 的入场参考价必须大于 0`);
                return;
              }
              proposedTotal += quantity;
              const priceChanged = quantity > 0 && Number.isFinite(effectiveEntryPrice) && effectiveEntryPrice > 0 && Math.abs(effectiveEntryPrice - savedEntryPrice) >= 0.00000001;
              const datesChanged = startDate !== savedStartDate || pauseDate !== savedPauseDate;
              const quantityChanged = Math.abs(quantity - previousQuantity) >= 0.00000001;
              if (quantityChanged || priceChanged || datesChanged) {
                proposedRows.push({ targetUserId: Number(member.userId), quantity, previousQuantity, entryPrice: effectiveEntryPrice > 0 ? effectiveEntryPrice : undefined, startDate, pauseDate });
              }
            }
            if (proposedTotal - Number(lot.currentQuantity || 0) > 0.00000001) {
              toast.error(`持仓编号 ${lotNumber} 的合计参与股数不能超过当前余量 ${formatNumber(lot.currentQuantity, 4)} 股`);
              return;
            }
            if (proposedRows.length === 0) {
              toast.info(`持仓编号 ${lotNumber} 没有待保存的更改`);
              finishStockLotEditing(lotId, true);
              return;
            }
            if (isLocalHotPreview) {
              toast.info('热预览仅演示交互，不会写入正式股票数据');
              return;
            }
            setSavingStockLots((previous) => new Set(previous).add(lotId));
            try {
              // 减仓／清零先提交，随后再增加其他成员，保证同一批次调整份额时不会被余量校验误拦截。
              for (const row of proposedRows.sort((left, right) => (left.quantity - left.previousQuantity) - (right.quantity - right.previousQuantity))) {
                await setStockParticipationMutation.mutateAsync({
                  ledgerId: 37,
                  categoryId: Number(activeStockParticipationCategoryId),
                  lotId,
                  targetUserId: row.targetUserId,
                  quantity: row.quantity,
                  entryPrice: row.entryPrice,
                  startDate: row.startDate,
                  pauseDate: row.pauseDate,
                });
              }
              toast.success(`持仓编号 ${lotNumber} 已单独保存`);
              discardStockLotDrafts(lotId);
              finishStockLotEditing(lotId);
              await refetchStockParticipationMatrix();
            } catch {
              // mutation 的 onError 已给出明确错误提示，保留当前草稿供管理员修正。
            } finally {
              setSavingStockLots((previous) => {
                const next = new Set(previous);
                next.delete(lotId);
                return next;
              });
            }
          };
          return (
            <div key={lot.id} className="overflow-hidden rounded-xl bg-white" style={{ border: `1px solid ${isEditing ? accentColor : '#E3E9ED'}` }}>
              <div className="flex items-start gap-2 px-2.5 py-2.5" style={{ backgroundColor: isEditing ? '#F4FAFC' : '#FFFFFF' }}>
                <button type="button" onClick={() => toggleStockLotExpanded(lotId)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="text-sm font-semibold leading-5 text-gray-800 break-words">{lot.stockName}</span>
                    <span className="shrink-0 text-sm font-semibold leading-5 text-gray-800">{lot.symbol}</span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: accentColor }}>持仓编号 {lotNumber}</span>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={isExpanded ? `收起持仓编号 ${lotNumber}` : `展开持仓编号 ${lotNumber}`} onClick={() => toggleStockLotExpanded(lotId)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                    <ChevronDown size={15} className="transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 border-t px-2.5 py-1.5 text-[11px]" style={{ borderColor: '#E8EEF1', backgroundColor: '#FFFDFC' }}>
                <span className="shrink-0 text-gray-400">批次备注</span>
                <span className={lot.note ? 'min-w-0 break-words text-gray-700' : 'text-gray-400'}>{lot.note || '未填写（可在管理员日历页编辑）'}</span>
              </div>
              <div className="grid grid-cols-3 gap-px border-y text-[10px]" style={{ borderColor: '#E8EEF1', backgroundColor: '#E8EEF1' }}>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500"><span>持仓</span><b className="ml-1 font-semibold text-gray-700">{formatNumber(lot.initialQuantity, 4)} 股</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500"><span>持仓均价</span><b className="ml-1 font-semibold text-gray-700">{formatNumber(lot.unitCost, 4)}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500"><span>总额</span><b className="ml-1 font-semibold text-gray-700">{formatNumber(holdingTotal, 2)}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500"><span>市值</span><b className="ml-1 font-semibold text-gray-700">{marketValue === null ? '待更新' : formatNumber(marketValue, 2)}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500"><span>盈亏</span><b className="ml-1 font-semibold" style={{ color: marketPnl === null ? '#6B7280' : marketPnl >= 0 ? '#D32F2F' : '#2E7D32' }}>{marketPnl === null ? '待更新' : `${marketPnl >= 0 ? '+' : ''}${formatNumber(marketPnl, 2)}`}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500">可分配 <b className="ml-0.5 font-semibold text-gray-700">{formatNumber(lot.availableForParticipation, 4)} 股</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500">当前余量 <b className="ml-0.5 text-gray-700">{formatNumber(lot.currentQuantity, 4)}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500">已分配 <b className="ml-0.5 text-gray-700">{formatNumber(totalAllocatedQuantity, 4)}</b></div>
                <div className="bg-[#F8FAFB] px-1 py-1.5 text-center text-gray-500">成员 <b className="ml-0.5 text-gray-700">{activeParticipations.length}</b> 人</div>
              </div>
              {isExpanded && <div className="space-y-1.5 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-[10px]" style={{ backgroundColor: isEditing ? '#EAF4F7' : '#F8FAFB', color: '#61727B' }}>
                  <span>{isEditing ? '编辑完成后点击本持仓页尾「保存」统一提交。' : '成员持仓摘要；收起后点击右侧「编辑」可调整。'}</span>
                  <span>参考价 {lot.marketPrice === null ? '待更新' : `¥${formatNumber(lot.marketPrice, 4)}`}</span>
                </div>
                <div className="space-y-1.5">
                {[...matrix.members].sort((left: any, right: any) => {
                  // 编辑时，比例框失焦后按全部草稿比例重排。输入过程中不移动当前行，避免移动端键盘与焦点跳失。
                  const sortByDraft = isEditing && stockLotsSortedByDraft.has(lotId);
                  const quantityForSort = (member: any) => {
                    const savedQuantity = Number(lot.participations.find((item: any) => Number(item.userId) === Number(member.userId))?.remainingQuantity || 0);
                    if (!sortByDraft) return savedQuantity;
                    const draftPercentage = stockParticipationDrafts[`${lot.id}:${member.userId}`]?.percentage;
                    if (draftPercentage === undefined) return savedQuantity;
                    return Number(lot.currentQuantity || 0) * Math.max(0, Math.min(100, Number(draftPercentage) || 0)) / 100;
                  };
                  const leftQuantity = quantityForSort(left);
                  const rightQuantity = quantityForSort(right);
                  return rightQuantity - leftQuantity;
                }).map((member: any) => {
                  const participation = lot.participations.find((item: any) => Number(item.userId) === Number(member.userId));
                  const hasSoldHistory = Number(participation?.closedQuantity || 0) > 0;
                  const isReadonly = globalClosed || hasSoldHistory || !matrix.canEdit || !isEditing;
                  const currentQuantity = Number(participation?.remainingQuantity || 0);
                  const share = lot.currentQuantity > 0 ? currentQuantity / lot.currentQuantity * 100 : 0;
                  const stockTagName = categories.find((category: any) => Number(category.id) === Number(activeStockParticipationCategoryId))?.name;
                  const isMemberVisible = stockTagName ? (editState[Number(member.userId)]?.[stockTagName]?.visible ?? true) : true;
                  const allocatedToOthers = lot.participations.reduce((total: number, item: any) => (
                    Number(item.userId) === Number(member.userId) ? total : total + Number(item.remainingQuantity || 0)
                  ), 0);
                  const maxQuantity = Math.max(0, Number(lot.currentQuantity || 0) - allocatedToOthers);
                  const maxPercentage = Math.max(0, Math.min(100, Math.floor(lot.currentQuantity > 0 ? maxQuantity / lot.currentQuantity * 100 : 0)));
                  const draftKey = `${lot.id}:${member.userId}`;
                  // 首次分配默认沿用该股票批次的实际买入价；中途转让时仍可手动覆盖。
                  const savedEntryPrice = Number(participation?.entryPrice || lot.unitCost || lot.openingReferencePrice || 0);
                  const defaultStartDate = dateInputValue(lot.actualTradedAt || lot.openedAt);
                  const savedStartDate = participation?.startDate || defaultStartDate;
                  const savedPauseDate = participation?.pauseDate || '';
                  const fallbackDraft = { percentage: share ? String(Math.round(share)) : '', entryPrice: savedEntryPrice ? String(savedEntryPrice) : '', startDate: savedStartDate, pauseDate: savedPauseDate };
                  const draft = stockParticipationDrafts[draftKey] ?? fallbackDraft;
                  const draftEntryPrice = Number(draft.entryPrice) > 0 ? Number(draft.entryPrice) : savedEntryPrice;
                  const draftStartDate = draft.startDate || defaultStartDate;
                  const showPauseDate = Boolean(draft.pauseDate) || (isEditing && expandedStockPauseDateFields.has(draftKey));
                  return (
                    <div key={member.userId} className="rounded-lg px-2 py-2" style={{ backgroundColor: !isMemberVisible ? '#F7F7F7' : Number(member.userId) === Number(selectedUserId) ? '#F4FAFC' : '#FAFAFA', opacity: isMemberVisible ? 1 : 0.7 }}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <span className="min-w-0 truncate text-xs" style={{ color: Number(member.userId) === Number(selectedUserId) ? accentColor : '#4B5563' }}>{member.name}{Number(member.userId) === Number(selectedUserId) ? '（当前）' : ''}</span>
                          <button
                            type="button"
                            disabled={!matrix.canEdit || !isEditing || !stockTagName || setMutation.isPending}
                            aria-label={isMemberVisible ? `隐藏${member.name}的股票标签` : `显示${member.name}的股票标签`}
                            title={isMemberVisible ? '对该成员可见，点击隐藏' : '对该成员不可见，点击显示'}
                            onClick={() => stockTagName && saveStockTagVisibility(Number(member.userId), stockTagName, !isMemberVisible)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed"
                            style={{ color: isMemberVisible ? accentColor : '#A0A7AF', backgroundColor: isMemberVisible ? '#EAF4F7' : '#ECEFF1' }}
                          >
                            {isMemberVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                        </div>
                        <span className="text-[10px] whitespace-nowrap text-gray-500"><b className="font-semibold" style={{ color: !isEditing && currentQuantity > 0 ? '#D32F2F' : '#6B7280' }}>{formatNumber(share, 0)}%</b> · {formatNumber(currentQuantity, 4)} 股 · ¥{formatNumber(currentQuantity * savedEntryPrice, 2)}</span>
                        {hasSoldHistory && <span className="text-[10px] whitespace-nowrap" style={{ color: '#8A5A00' }}>已卖 {formatNumber(participation.closedQuantity, 4)} · 只读</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <label className="flex items-center gap-1">
                          <span className="shrink-0 text-[10px] text-gray-400">我的买入价</span>
                          <div className="flex h-7 min-w-0 items-center overflow-hidden rounded-md border bg-white" style={{ borderColor: isReadonly ? '#ECECEC' : '#D9E8EE' }}>
                            <span className="pl-1.5 text-[10px] text-gray-400">¥</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft.entryPrice}
                              disabled={isReadonly}
                              placeholder={savedEntryPrice ? String(savedEntryPrice) : '买入价'}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (/^(?:\d*\.?\d*)?$/.test(value)) setStockParticipationDraft(draftKey, { entryPrice: value }, fallbackDraft);
                              }}
                              className="h-full w-[clamp(5rem,22vw,6rem)] min-w-0 bg-transparent px-1 text-right text-xs font-medium outline-none disabled:text-gray-400"
                              style={{ color: !isEditing ? '#1F2937' : isReadonly ? '#9CA3AF' : '#4B5563' }}
                            />
                          </div>
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="shrink-0 text-[10px] text-gray-400">开始日期</span>
                          <input
                            type="date"
                            value={draftStartDate}
                            disabled={isReadonly}
                            onChange={(event) => setStockParticipationDraft(draftKey, { startDate: event.target.value }, fallbackDraft)}
                            className="h-7 w-[clamp(5rem,22vw,6rem)] min-w-0 shrink-0 rounded-md border bg-white px-0.5 text-[9px] outline-none disabled:text-gray-400"
                            style={{ borderColor: isReadonly ? '#ECECEC' : '#D9E8EE', color: !isEditing ? '#1F2937' : isReadonly ? '#9CA3AF' : '#4B5563', minWidth: 0 }}
                          />
                        </label>
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {showPauseDate ? (
                          <label className="flex items-center justify-between gap-2">
                            <span className="shrink-0 text-[10px] text-[#B45309]">暂停日期</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <input
                                type="date"
                                value={draft.pauseDate}
                                disabled={isReadonly}
                                onChange={(event) => setStockParticipationDraft(draftKey, { pauseDate: event.target.value }, fallbackDraft)}
                                className="h-7 w-24 rounded-md border bg-[#FFFBEB] px-1 text-[10px] outline-none disabled:text-gray-400"
                                style={{ borderColor: isReadonly ? '#ECECEC' : '#FDE68A', color: !isEditing ? '#1F2937' : isReadonly ? '#9CA3AF' : '#92400E', minWidth: 0 }}
                              />
                              {!isReadonly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (draft.pauseDate) setStockParticipationDraft(draftKey, { pauseDate: '' }, fallbackDraft);
                                    setExpandedStockPauseDateFields((previous) => {
                                      const next = new Set(previous);
                                      next.delete(draftKey);
                                      return next;
                                    });
                                  }}
                                  className="h-7 rounded-md px-1.5 text-[10px]"
                                  style={{ color: '#B45309', backgroundColor: '#FFFBEB' }}
                                >
                                  {draft.pauseDate ? '解除' : '取消'}
                                </button>
                              )}
                            </div>
                          </label>
                        ) : !isReadonly ? (
                          <button
                            type="button"
                            onClick={() => setExpandedStockPauseDateFields((previous) => new Set(previous).add(draftKey))}
                            className="flex items-center gap-1 text-[10px]"
                            style={{ color: '#B45309' }}
                          >
                            <span className="text-sm leading-none">+</span> 设置暂停日期
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t pt-1.5" style={{ borderColor: '#E8EEF1' }}>
                        <div>
                          <div className="text-[11px] font-medium text-gray-600">参与比例</div>
                          <div className="mt-0.5 text-[10px] text-gray-400">剩余可参与 {formatNumber(maxQuantity, 4)} 股（{maxPercentage}%）</div>
                        </div>
                        <div className="flex h-8 items-center overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: isReadonly ? '#ECECEC' : '#9CCBDD' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={draft.percentage}
                            disabled={isReadonly}
                            placeholder="0"
                            maxLength={3}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (/^\d*$/.test(value)) {
                                const clamped = value === '' ? '' : String(Math.min(maxPercentage, Math.max(0, Number(value))));
                                setStockParticipationDraft(draftKey, { percentage: clamped }, fallbackDraft);
                              }
                            }}
                            onBlur={() => setStockLotsSortedByDraft((previous) => new Set(previous).add(lotId))}
                            className="h-full w-12 bg-transparent px-2 text-right text-sm font-semibold outline-none disabled:text-gray-400"
                            style={{ color: !isEditing ? '#D32F2F' : isReadonly ? '#9CA3AF' : accentColor }}
                          />
                          <span className="flex h-full w-7 items-center justify-center border-l text-xs font-semibold text-gray-400" style={{ borderColor: isReadonly ? '#ECECEC' : '#D9E8EE' }}>%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>}
              {!isEditing ? (
                <div className="flex w-full items-center justify-between px-2.5 py-2 text-[11px] text-gray-500">
                  <span>成交时间 {tradeTimestamp}</span>
                  {!isExpanded && matrix.canEdit && !globalClosed && (
                    <button type="button" onClick={() => startStockLotEditing(lotId)} className="font-medium" style={{ color: accentColor }}>编辑</button>
                  )}
                </div>
              ) : matrix.canEdit && !globalClosed && (
                <div className="border-t px-2.5 py-2" style={{ borderColor: '#E8EEF1', backgroundColor: isEditing ? '#F4FAFC' : '#FCFEFF' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-500">成交时间 {tradeTimestamp}</span>
                    <div className="flex items-center gap-2">
                    <button type="button" disabled={isSaving} onClick={() => finishStockLotEditing(lotId, true)} className="h-8 rounded-lg px-3 text-xs text-gray-500 disabled:opacity-50">取消</button>
                    <button type="button" disabled={isSaving} onClick={() => void startLotSave()} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: accentColor }}>
                      <Save size={13} /> {isSaving ? '保存中' : `保存持仓编号 ${lotNumber}`}
                    </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  // 视角切换："user"=用户视角（原有），"tag"=标签视角
  const [viewMode, setViewMode] = useState<"user" | "tag">("tag");
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set()); // 默认全部折叠
  // 用户视图：每个用户下展开的标签，key = `${userId}__${catName}`
  const [expandedUserTags, setExpandedUserTags] = useState<Set<string>>(new Set());
  // 用户视图：已关闭可见标签默认汇总，按用户按需展开。
  const [expandedHiddenTagGroups, setExpandedHiddenTagGroups] = useState<Set<number>>(new Set());
  // 三联动字段本次由系统反推的来源，仅影响当前编辑会话的展示颜色，不改变历史数据结构。
  const [derivedAllocationFields, setDerivedAllocationFields] = useState<Record<string, 'amount' | 'ratio' | 'targetAmount'>>({});
  // 标签维度双击编辑弹窗
  const [tagEditModal, setTagEditModal] = useState<{ userId: number; tagName: string; catColor: string } | null>(null);
  const [activeStockParticipationCategoryId, setActiveStockParticipationCategoryId] = useState<number | null>(null);
  const { data: stockParticipationMatrix, error: stockParticipationError, refetch: refetchStockParticipationMatrix } = trpc.ledger.getStockLotParticipationMatrix.useQuery(
    { ledgerId: 37, categoryId: Number(activeStockParticipationCategoryId || 0) },
    { enabled: ledgerId === 37 && !!activeStockParticipationCategoryId },
  );
  const setStockParticipationMutation = trpc.ledger.setStockLotParticipation.useMutation({
    // 单一批次的多位成员在同一个「保存」动作中顺序提交；全部成功后再统一刷新，避免中途重绘覆盖草稿。
    onError: (error) => toast.error(error.message || '保存股票参与分配失败'),
  });
  // 默认只展示每个持仓编号的摘要；成员份额在展开后才显示，编辑与保存也严格按单个批次隔离。
  const [expandedStockLots, setExpandedStockLots] = useState<Set<number>>(new Set());
  const [editingStockLots, setEditingStockLots] = useState<Set<number>>(new Set());
  const [savingStockLots, setSavingStockLots] = useState<Set<number>>(new Set());
  // 移动端输入保持在本地草稿中，避免每次输入都触发查询重渲染而丢失键盘焦点。
  const [stockParticipationDrafts, setStockParticipationDrafts] = useState<Record<string, { percentage: string; entryPrice: string; startDate: string; pauseDate: string }>>({});
  // 暂停日期仅在成员确实暂停，或管理员主动设置暂停时展示；避免为每位正常持仓成员占用一行表单。
  const [expandedStockPauseDateFields, setExpandedStockPauseDateFields] = useState<Set<string>>(new Set());
  // 比例编辑过程先稳定当前行；失焦后才按全部草稿比例重新排序。
  const [stockLotsSortedByDraft, setStockLotsSortedByDraft] = useState<Set<number>>(new Set());
  const setStockParticipationDraft = (key: string, patch: Partial<{ percentage: string; entryPrice: string; startDate: string; pauseDate: string }>, fallback: { percentage: string; entryPrice: string; startDate: string; pauseDate: string }) => {
    setStockParticipationDrafts((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? fallback), ...patch },
    }));
  };
  const discardStockLotDrafts = (lotId: number) => {
    const prefix = `${lotId}:`;
    setStockParticipationDrafts((previous) => Object.fromEntries(
      Object.entries(previous).filter(([key]) => !key.startsWith(prefix)),
    ));
    setExpandedStockPauseDateFields((previous) => new Set(
      Array.from(previous).filter((key) => !key.startsWith(prefix)),
    ));
    setStockLotsSortedByDraft((previous) => {
      const next = new Set(previous);
      next.delete(lotId);
      return next;
    });
  };
  const toggleStockLotExpanded = (lotId: number) => {
    setExpandedStockLots((previous) => {
      const next = new Set(previous);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  };
  const startStockLotEditing = (lotId: number) => {
    setExpandedStockLots((previous) => new Set(previous).add(lotId));
    setEditingStockLots((previous) => new Set(previous).add(lotId));
  };
  const finishStockLotEditing = (lotId: number, discardDrafts = false) => {
    setEditingStockLots((previous) => {
      const next = new Set(previous);
      next.delete(lotId);
      return next;
    });
    if (discardDrafts) discardStockLotDrafts(lotId);
  };
  const saveStockTagVisibility = (targetUserId: number, tagName: string, nextVisible: boolean) => {
    const previousVisible = editState[targetUserId]?.[tagName]?.visible ?? true;
    updateEntry(targetUserId, tagName, { visible: nextVisible });
    if (isLocalHotPreview) {
      toast.info('热预览仅切换本地显示，不会修改正式成员可见性');
      return;
    }
    setSavingUsers((previous) => new Set(previous).add(targetUserId));
    setMutation.mutate({
      ledgerId,
      targetUserId,
      balances: { [`${tagName}__visible`]: nextVisible ? 1 : 0 },
      migratedMarginNoteIds: [],
    }, {
      onError: () => updateEntry(targetUserId, tagName, { visible: previousVisible }),
    });
  };
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
  // 押金手动编辑状态：{ coin: string, amount: string }[]
  const [marginEdits, setMarginEdits] = useState<Array<{ coin: string; amount: string }>>([]);

  // 获取标签配置
  const { data: tagConfigData, refetch: refetchTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId, tagName: selectedTagName ?? '' },
    { enabled: !!ledgerId && !!selectedTagName }
  );

  // 获取标签押金汇总和最新市值
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

  useEffect(() => {
    const selectedCategory = categories.find((category: any) => category.name === selectedTagName);
    if (selectedCategory && isStockPortfolioTag(selectedCategory)) {
      setActiveStockParticipationCategoryId(Number(selectedCategory.id));
    }
  }, [categories, selectedTagName]);

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
    // 押金：仅从已保存的配置读取（纯手动，不自动计算）
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
                    <span>{selectedTagName ? (isStockPortfolioTag(selectedCat) ? `${selectedTagName} · 股票批次分配` : (() => {
                      const rows = tagRatioView[selectedTagName] ?? [];
                      const total = rows.reduce((s: number, r: any) => s + r.ratio, 0);
                      const isComplete = Math.abs(total - 100) < 0.01;
                      const isOver = total > 100.01;
                      return `${selectedTagName}${isComplete ? ' ✓' : isOver ? ' !' : ''}  ${total.toFixed(2)}%`;
                    })()) : '— 请选择标签 —'}</span>
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
            if (isStockPortfolioTag(cat)) {
              return (
                <div className="mx-4">
                  <div className="flex items-center gap-2 px-1 pb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat?.color || '#2F6F85' }} />
                    <span className="text-sm font-semibold text-gray-800">{selectedTagName}</span>
                    <span className="ml-auto text-xs" style={{ color: '#2F6F85' }}>股票批次参与管理</span>
                  </div>
                  {renderStockParticipationEditor({ selectedUserId: 0, accentColor: cat?.color || '#2F6F85' })}
                </div>
              );
            }
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
            const totalShareAmountText = `¥${Math.round(totalShareAmt).toLocaleString('zh-CN')}`;
            return (
              <>
              <div className="mx-4 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                {/* 标签头部：名称第一行，合计与金额第二行；批量操作单独右对齐。 */}
                <div
                  className="flex items-end gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #F0E8E0" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat?.color || "#D32F2F" }}
                      />
                      <span className="text-sm font-semibold text-gray-800 truncate">{selectedTagName}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                        style={{
                          backgroundColor: isComplete ? "#E8F5E9" : isOver ? "#FFEBEE" : "#FFF3E0",
                          color: isComplete ? "#2E7D32" : isOver ? "#C62828" : "#E65100",
                        }}
                      >
                        合计 {total.toFixed(2)}%
                      </span>
                      <span className="text-gray-500 tabular-nums whitespace-nowrap">金额 {totalShareAmountText}</span>
                    </div>
                  </div>
                  {/* 批量按钮：与第二行统计信息对齐，不干扰标签名称阅读。 */}
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
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: batchSelectMode ? '#D32F2F' : '#FFF0F0',
                      color: batchSelectMode ? '#FFFFFF' : '#D32F2F',
                    }}
                  >
                    <CheckCircle2 size={12} />
                    <span>{batchSelectMode ? '退出' : '批量'}</span>
                  </button>
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
                                    if (isStockPortfolioTag(cat)) setActiveStockParticipationCategoryId(Number(cat.id));
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
                  {/* 押金汇总 */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1.5">押金汇总</div>
                    {!tagConfigEditing || ledgerId === 37 ? (
                      /* 37号统一读取成员钱包冻结；其他账本保留历史手工汇总。 */
                      <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "#FAF3ED" }}>
                        {ledgerId === 37 && (
                          <div className="mb-2 flex items-start gap-1.5 text-xs" style={{ color: '#1565C0' }}>
                            <WalletCards size={13} className="mt-0.5 flex-shrink-0" />
                            <span>新保证金请在「用户」视图对应标签中从全局钱包冻结；此处不再支持手工输入。</span>
                          </div>
                        )}
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
                            <span className="text-xs text-gray-400">{ledgerId === 37 ? '暂无历史手工押金记录' : '暂无押金数据，点「编辑」手动录入'}</span>
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
              const hiddenTags = categories.filter((cat: any) => !(userEdit[cat.name] ?? defaultEntry()).visible);
              const visibleTagCount = categories.length - hiddenTags.length;
              const userTagStatusSummary = (() => {
                let running = 0;
                let paused = 0;
                for (const cat of categories) {
                  const entry = userEdit[(cat as any).name] ?? defaultEntry();
                  if (!entry.visible) continue;
                  const lastPause = entry.pauseHistory?.[entry.pauseHistory.length - 1];
                  const isPaused = lastPause ? !lastPause.resumeDate : Boolean(entry.pauseDate);
                  isPaused ? paused++ : running++;
                }
                const parts = [`共${visibleTagCount}个`];
                if (running > 0) parts.push(`${running}个运行中`);
                if (paused > 0) parts.push(`${paused}个暂停`);
                return parts.join(' · ');
              })();
              const isHiddenTagGroupExpanded = expandedHiddenTagGroups.has(userId);
              const toggleHiddenTagGroup = () => setExpandedHiddenTagGroups(prev => {
                const next = new Set(prev);
                next.has(userId) ? next.delete(userId) : next.add(userId);
                return next;
              });
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
                      {canViewLedger37WalletSnapshot ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setWalletSnapshotUser({
                              id: Number(userId),
                              name: member.nickname || member.realName || member.username || `用户${userId}`,
                              username: member.username || undefined,
                            });
                          }}
                          className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2"
                          title={`查看 ${member.nickname || member.username || `用户${userId}`} 的只读钱包快照`}
                          aria-label={`查看 ${member.nickname || member.username || `用户${userId}`} 的只读钱包快照`}
                        >
                          <UserAvatar
                            username={member.username}
                            avatar={member.avatar}
                            nickname={member.nickname}
                            size="sm"
                          />
                        </button>
                      ) : (
                        <UserAvatar
                          username={member.username}
                          avatar={member.avatar}
                          nickname={member.nickname}
                          size="sm"
                        />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {member.nickname || member.username || "未知用户"}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{userTagStatusSummary}</div>
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
                    }).filter((cat: any) => {
                      const entry = userEdit[cat.name] ?? defaultEntry();
                      return entry.visible || isHiddenTagGroupExpanded;
                    }).map((cat: any, renderedIndex: number) => {
                      const entry = userEdit[cat.name] ?? defaultEntry();
                      const isStockTag = isStockPortfolioTag(cat);
                      const allocationDisplay = resolveAllocationDisplay(entry, userId, cat.name);
                      // 可见标签在排序结果中恒位于隐藏标签之前，因此编号仅随当前列表顺序连续变化。
                      const visibleTagNumber = entry.visible ? renderedIndex + 1 : null;
                      const isFirstHiddenTag = !entry.visible && cat.name === hiddenTags[0]?.name;
                      const tagKey = `${userId}__${cat.name}`;
                      const isCatExpanded = expandedUserTags.has(tagKey);
                      const ratioNum = parseFloat(entry.ratio);
                      const amountNum = parseFloat(entry.amount);
                      const hasRatio = Number.isFinite(ratioNum);
                      const hasAmount = Number.isFinite(amountNum);
                      const formatSummaryAmount = (value: number) => value >= 10000
                        ? `${(value / 10000).toFixed(1)}万`
                        : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
                      const amountText = hasAmount ? formatSummaryAmount(amountNum) : '—';
                      const ratioText = hasRatio ? `${ratioNum.toFixed(2)}%` : '—';
                      // 折叠行始终按“初始金额 × 比例”展示实际权益，保证与三联动口径一致。
                      const allocatedAmount = hasAmount && hasRatio ? amountNum * ratioNum / 100 : NaN;
                      const allocatedAmountText = Number.isFinite(allocatedAmount) ? formatSummaryAmount(allocatedAmount) : '—';
                      // 保证金摘要沿用用户详情页口径：应交 = 实际权益 × 20%，实交为逐笔保证金按实时人民币价格折算后的净额。
                      const marginSummary = summarizeMargins(entry.margins);
                      const requiredMargin = Number.isFinite(allocatedAmount) ? Math.max(0, allocatedAmount * 0.2) : NaN;
                      const marginGap = Number.isFinite(requiredMargin) ? requiredMargin - marginSummary.totalCNY : NaN;
                      const formatMarginSummary = (value: number) => `${value < 0 ? '−' : ''}¥${formatSummaryAmount(Math.abs(value))}`;
                      const requiredMarginText = Number.isFinite(requiredMargin) ? formatMarginSummary(requiredMargin) : '—';
                      const actualMarginText = formatMarginSummary(marginSummary.totalCNY);
                      const marginGapLabel = !Number.isFinite(marginGap)
                        ? '差额'
                        : marginGap > 0.005 ? '缺'
                          : marginGap < -0.005 ? '超'
                            : '已足';
                      const marginGapText = Number.isFinite(marginGap) ? formatMarginSummary(Math.abs(marginGap)) : '—';
                      const marginGapColor = !Number.isFinite(marginGap)
                        ? '#757575'
                        : marginGap > 0.005 ? '#D32F2F'
                          : marginGap < -0.005 ? '#2E7D32'
                            : '#2E7D32';
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
                        <Fragment key={cat.id}>
                          {isFirstHiddenTag && isHiddenTagGroupExpanded && (
                            <button
                              type="button"
                              onClick={toggleHiddenTagGroup}
                              className="mx-3 mt-1 mb-2 w-[calc(100%-1.5rem)] flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                              style={{ color: '#757575', backgroundColor: '#F7F7F7', border: '1px dashed #DADADA' }}
                            >
                              <span>收起已隐藏标签</span>
                              <ChevronDown size={14} className="transition-transform" style={{ transform: 'rotate(180deg)' }} />
                            </button>
                          )}
                          <div className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ backgroundColor: "#FAF3ED" }}>
                          {/* 标签折叠行：首行名称和开关，次行紧凑展示初始金额、占比与实际权益。 */}
                          <div
                            className="px-3 py-2.5 cursor-pointer"
                            onClick={() => {
                              toggleUserTag(cat.name);
                              if (isStockTag) setActiveStockParticipationCategoryId(Number(cat.id));
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {visibleTagNumber !== null && (
                                  <span className="w-4 flex-shrink-0 text-right text-[11px] tabular-nums" style={{ color: '#9E9E9E' }}>{visibleTagNumber}</span>
                                )}
                                {catPauseStatus === 'paused'
                                  ? <Pause size={12} className="flex-shrink-0" style={{ color: '#F59E0B' }} />
                                  : <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#D32F2F' }} />
                                }
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{cat.name}</span>
                                <button
                                  type="button"
                                  aria-label={entry.visible ? '隐藏该标签' : '显示该标签'}
                                  onClick={(event) => { event.stopPropagation(); updateEntry(userId, cat.name, { visible: !entry.visible }); }}
                                  className="relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors flex-shrink-0"
                                  style={{ backgroundColor: entry.visible ? '#D32F2F' : '#D1D5DB' }}
                                >
                                  <span
                                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                                    style={{ transform: entry.visible ? 'translateX(17px)' : 'translateX(2px)' }}
                                  />
                                </button>
                                {!entry.visible && <span className="text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#F5F5F5', color: '#9E9E9E' }}>隐藏</span>}
                              </div>
                              <ChevronDown
                                size={14}
                                className="text-gray-400 transition-transform flex-shrink-0"
                                style={{ transform: isCatExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                              />
                            </div>
                            {isStockTag ? (
                              <div className="mt-1.5 flex items-center gap-1.5 text-xs"><ChartNoAxesCombined size={12} style={{ color: cat.color || '#2F6F85' }} /><span className="text-gray-500">股票持仓 · 按股票批次分配参与股数</span></div>
                            ) : (
                              <>
                                <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs tabular-nums whitespace-nowrap overflow-hidden">
                                  <span className="text-gray-400 flex-shrink-0">初始 <span className="text-gray-700">{amountText}</span></span>
                                  <span className="text-gray-400 flex-shrink-0">占比 <span className="text-gray-700">{ratioText}</span></span>
                                  <span className="min-w-0 truncate text-gray-400">实际权益 <span className="font-medium text-gray-800">{allocatedAmountText}</span></span>
                                </div>
                                <div className="mt-1 flex items-center gap-x-2.5 text-[11px] tabular-nums whitespace-nowrap overflow-hidden">
                                  <span className="text-gray-400 flex-shrink-0">应交 <span className="font-medium" style={{ color: '#1565C0' }}>{requiredMarginText}</span></span>
                                  <span className="text-gray-400 flex-shrink-0">实交 <span className="font-medium text-gray-700" title={marginSummary.unpricedCoins.length > 0 ? `${Array.from(new Set(marginSummary.unpricedCoins)).join('、')} 暂无可靠报价，未计入实交汇总` : undefined}>{actualMarginText}{marginSummary.unpricedCoins.length > 0 ? '*' : ''}</span></span>
                                  <span className="min-w-0 truncate text-gray-400">{marginGapLabel} <span className="font-semibold" style={{ color: marginGapColor }}>{marginGapText}</span></span>
                                </div>
                              </>
                            )}
                          </div>
                          {/* 展开内容 */}
                          {isCatExpanded && <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid #F0E8E0' }}>
                          {/* 手工标签沿用标签级日期；股票标签改为每个“成员 × 批次”的日期，在下方批次行内管理。 */}
                          {!isStockTag && <section className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E8E8E8' }}>
                            <div className="text-xs font-medium text-gray-700">日期设置</div>
                            <div className="grid grid-cols-2 gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-gray-400 mb-1">开始日期</div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={entry.startDate}
                                  onChange={(event) => updateEntry(userId, cat.name, { startDate: event.target.value })}
                                  className="min-w-0 flex-1 text-xs border rounded-lg px-1.5 py-1 outline-none focus:border-red-400"
                                  style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                                />
                                {entry.startDate && (
                                  <button type="button" onClick={() => updateEntry(userId, cat.name, { startDate: '' })} className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100" style={{ fontSize: 11 }}>×</button>
                                )}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs mb-1" style={{ color: '#B45309' }}>暂停日期</div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={entry.pauseDate}
                                  onChange={(event) => {
                                    if (ledgerId === 37 && event.target.value) {
                                      setPauseWalletHandlingDraft({ userId, tagName: cat.name, pauseDate: event.target.value, action: 'retain' });
                                    } else {
                                      updateEntry(userId, cat.name, { pauseDate: event.target.value });
                                      if (!event.target.value) {
                                        setPauseWalletPlans((previous) => {
                                          const key = `${userId}|${cat.name}`;
                                          if (!previous[key]) return previous;
                                          const next = { ...previous };
                                          delete next[key];
                                          return next;
                                        });
                                      }
                                    }
                                  }}
                                  className="min-w-0 flex-1 text-xs border rounded-lg px-1.5 py-1 outline-none"
                                  style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#92400E' }}
                                />
                                {entry.pauseDate && (
                                  <button type="button" onClick={() => {
                                    updateEntry(userId, cat.name, { pauseDate: '' });
                                    setPauseWalletPlans((previous) => {
                                      const key = `${userId}|${cat.name}`;
                                      if (!previous[key]) return previous;
                                      const next = { ...previous };
                                      delete next[key];
                                      return next;
                                    });
                                  }} className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-amber-100" style={{ fontSize: 11, color: '#B45309' }}>×</button>
                                )}
                              </div>
                              </div>
                            </div>
                            {ledgerId === 37 && pauseWalletHandlingDraft?.userId === userId && pauseWalletHandlingDraft!.tagName === cat.name && (
                              <div className="rounded-xl p-2.5 space-y-2" style={{ backgroundColor: '#F2F8FF', border: '1px solid #B8D7F3' }}>
                                <div className="text-xs font-semibold" style={{ color: '#1565C0' }}>暂停后的保证金处理</div>
                                <div className="text-[10px]" style={{ color: '#607D8B' }}>暂停保存后，可保留保证金等待手动处理，或把本标签仍冻结的钱包保证金原币种退回成员可用余额。</div>
                                <input type="date" value={pauseWalletHandlingDraft!.pauseDate} onChange={(event) => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft!, pauseDate: event.target.value })} className="h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none" style={{ borderColor: '#B8D7F3', color: '#1565C0' }} />
                                <div className="grid grid-cols-2 gap-2">
                                  <button type="button" onClick={() => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft!, action: 'retain' })} className="rounded-lg p-2 text-left" style={{ backgroundColor: pauseWalletHandlingDraft!.action === 'retain' ? '#EAF3FF' : '#FFFFFF', border: `1px solid ${pauseWalletHandlingDraft!.action === 'retain' ? '#6FA8DC' : '#DCE9F5'}` }}><div className="text-xs font-semibold" style={{ color: '#1565C0' }}>保留保证金</div><div className="mt-0.5 text-[10px] leading-4" style={{ color: '#607D8B' }}>继续冻结，之后可逐笔手动减少或解冻。</div></button>
                                  <button type="button" onClick={() => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft!, action: 'release_wallet_holds' })} className="rounded-lg p-2 text-left" style={{ backgroundColor: pauseWalletHandlingDraft!.action === 'release_wallet_holds' ? '#EAF3FF' : '#FFFFFF', border: `1px solid ${pauseWalletHandlingDraft!.action === 'release_wallet_holds' ? '#6FA8DC' : '#DCE9F5'}` }}><div className="text-xs font-semibold" style={{ color: '#1565C0' }}>暂停并解冻</div><div className="mt-0.5 text-[10px] leading-4" style={{ color: '#607D8B' }}>保存暂停后，将本标签的冻结保证金退回钱包。</div></button>
                                </div>
                                {pauseWalletHandlingDraft!.action === 'release_wallet_holds' && <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ backgroundColor: '#FFFFFF', color: '#45616F' }}>{walletMarginContext.isLoading ? '正在核算本标签可解冻的保证金…' : walletMarginContext.isError ? '保证金读取失败；请改为保留保证金后稍后手动处理。' : pauseWalletReleaseAssets.length > 0 ? <>保存暂停后将解冻：{pauseWalletReleaseAssets.map((asset) => formatWalletMarginAssetBalance(asset.amount, asset.assetCode)).join(' · ')}</> : '本标签没有仍冻结的钱包保证金；历史手工押金不会自动退回钱包。'}</div>}
                                <div className="flex justify-end gap-2"><button type="button" onClick={() => setPauseWalletHandlingDraft(null)} className="h-7 px-2 text-[10px]" style={{ color: '#78909C' }}>取消</button><button type="button" onClick={() => {
                                  const plan = pauseWalletHandlingDraft!;
                                  if (!plan.pauseDate) { toast.error('请选择暂停日期'); return; }
                                  updateEntry(userId, cat.name, { pauseDate: plan.pauseDate });
                                  setPauseWalletPlans((previous) => ({ ...previous, [`${userId}|${cat.name}`]: plan }));
                                  setPauseWalletHandlingDraft(null);
                                }} className="h-7 rounded-lg px-2.5 text-[10px] font-medium text-white" style={{ backgroundColor: '#1565C0' }}>确认暂停方案</button></div>
                              </div>
                            )}
                            {ledgerId === 37 && pauseWalletPlans[`${userId}|${cat.name}`] && <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ backgroundColor: '#F2F8FF', color: '#45616F' }}>已选择：{pauseWalletPlans[`${userId}|${cat.name}`].action === 'release_wallet_holds' ? '暂停保存后，解冻本标签仍冻结的钱包保证金并退回成员账户' : '暂停保存后，继续保留保证金冻结'}。</div>}
                          </section>}

                          {isStockTag ? renderStockParticipationEditor({ selectedUserId: userId, accentColor: cat.color || '#2F6F85' }) : <section className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E8E8E8' }}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-gray-700">金额与比例</div>
                              <span className="text-[11px] text-gray-400 whitespace-nowrap">任意两项自动反推第三项</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="min-w-0">
                                <span className="block text-[11px] text-gray-400 mb-1">初始金额</span>
                                <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                                  <span className="text-xs text-gray-400 flex-shrink-0">¥</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={allocationDisplay.amount}
                                    onChange={e => updateAllocationLink(userId, cat.name, 'amount', e.target.value)}
                                    className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                                    style={{ color: allocationDisplay.derivedField === 'amount' ? '#2F6F85' : '#222222' }}
                                  />
                                </div>
                              </label>
                              <label className="min-w-0">
                                <span className="block text-[11px] text-gray-400 mb-1">比例</span>
                                <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="0"
                                    min={0}
                                    max={100}
                                    value={allocationDisplay.ratio}
                                    onChange={e => updateAllocationLink(userId, cat.name, 'ratio', e.target.value)}
                                    className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                                    style={{ color: allocationDisplay.derivedField === 'ratio' ? '#2F6F85' : '#222222' }}
                                  />
                                  <span className="text-xs text-gray-400 flex-shrink-0">%</span>
                                </div>
                              </label>
                              <label className="min-w-0">
                                <span className="block text-[11px] text-gray-400 mb-1">实际权益</span>
                                <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                                  <span className="text-xs text-gray-400 flex-shrink-0">¥</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={allocationDisplay.targetAmount}
                                    onChange={e => updateAllocationLink(userId, cat.name, 'targetAmount', e.target.value)}
                                    className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                                    style={{ color: allocationDisplay.derivedField === 'targetAmount' ? '#2F6F85' : '#222222' }}
                                  />
                                </div>
                              </label>
                            </div>
                          </section>}

                          {/* 行5：押金（可新增多笔，不同币种独立记录） */}
                          <div className="space-y-1.5">
                            {MarginEntriesEditor({ userId, tagName: cat.name, entry, accentColor: "#D32F2F", compact: true })}
                          </div>
                          </div>}
                          </div>
                        </Fragment>
                      );
                    })}
                    {hiddenTags.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleHiddenTagGroup}
                        className="mx-3 mt-1 w-[calc(100%-1.5rem)] flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                        style={{ color: '#757575', backgroundColor: '#F7F7F7', border: '1px dashed #DADADA' }}
                      >
                        <span>{isHiddenTagGroupExpanded ? '收起已隐藏标签' : `已隐藏 ${hiddenTags.length} 个标签`}</span>
                        <ChevronDown
                          size={14}
                          className="transition-transform"
                          style={{ transform: isHiddenTagGroupExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        />
                      </button>
                    )}
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
        const isStockTag = isStockPortfolioTag(categories.find((category: any) => category.name === tagName));
        const allocationDisplay = resolveAllocationDisplay(entry, userId, tagName);
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
                  <button
                    type="button"
                    aria-label={entry.visible ? '隐藏该标签' : '显示该标签'}
                    onClick={() => updateEntry(userId, tagName, { visible: !entry.visible })}
                    className="relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors flex-shrink-0"
                    style={{ backgroundColor: entry.visible ? catColor : '#D1D5DB' }}
                  >
                    <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform" style={{ transform: entry.visible ? 'translateX(17px)' : 'translateX(2px)' }} />
                  </button>
                  <span className="text-xs text-gray-400">· {member?.nickname || member?.username || `用户${userId}`}</span>
                </div>
                <button onClick={() => { setTagEditModal(null); setTargetTotalInput(''); }} className="text-sm" style={{ color: '#9E9E9E' }}>关闭</button>
              </div>
              {/* 内容区 */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                {/* 手工标签使用标签级日期；股票标签在每笔成员参与记录内设置日期。 */}
                {!isStockTag && <section className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E8E8E8' }}>
                  <div className="text-xs font-medium text-gray-700">日期设置</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0">
                      <span className="block text-xs text-gray-400 mb-1">开始日期</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={entry.startDate}
                          onChange={e => updateEntry(userId, tagName, { startDate: e.target.value })}
                          className="min-w-0 flex-1 text-xs border rounded-lg px-1.5 py-1 outline-none focus:border-red-400"
                          style={{ borderColor: '#E0E0E0', backgroundColor: '#FFFFFF', color: '#222222' }}
                        />
                        {entry.startDate && (
                          <button type="button" onClick={() => updateEntry(userId, tagName, { startDate: '' })} className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-gray-400" style={{ fontSize: 11 }}>×</button>
                        )}
                      </div>
                    </label>
                    <label className="min-w-0">
                      <span className="block text-xs mb-1" style={{ color: '#B45309' }}>暂停日期</span>
                      {(() => {
                        const history = entry.pauseHistory ?? [];
                        const latestIndex = history.length - 1;
                        const latest = latestIndex >= 0 ? history[latestIndex] : null;
                        return (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={latest?.pauseDate ?? entry.pauseDate ?? ''}
                              onChange={e => {
                                if (latest) {
                                  const nextHistory = history.map((item, index) => index === latestIndex ? { ...item, pauseDate: e.target.value } : item);
                                  updateEntry(userId, tagName, { pauseHistory: nextHistory });
                                  setPauseWalletPlans((previous) => {
                                    const key = `${userId}|${tagName}`;
                                    return previous[key] ? { ...previous, [key]: { ...previous[key], pauseDate: e.target.value } } : previous;
                                  });
                                } else if (ledgerId === 37 && e.target.value) {
                                  setPauseWalletHandlingDraft({ userId, tagName, pauseDate: e.target.value, action: 'retain' });
                                } else {
                                  updateEntry(userId, tagName, { pauseDate: e.target.value });
                                }
                              }}
                              className="min-w-0 flex-1 text-xs border rounded-lg px-1.5 py-1 outline-none"
                              style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#92400E' }}
                            />
                            {(latest?.pauseDate || entry.pauseDate) && (
                              <button type="button" onClick={() => {
                                if (latest) {
                                  const nextHistory = history.map((item, index) => index === latestIndex ? { ...item, pauseDate: '' } : item);
                                  updateEntry(userId, tagName, { pauseHistory: nextHistory });
                                  setPauseWalletPlans((previous) => {
                                    const key = `${userId}|${tagName}`;
                                    if (!previous[key]) return previous;
                                    const next = { ...previous };
                                    delete next[key];
                                    return next;
                                  });
                                } else {
                                  updateEntry(userId, tagName, { pauseDate: '' });
                                }
                              }} className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full" style={{ fontSize: 11, color: '#B45309' }}>×</button>
                            )}
                          </div>
                        );
                      })()}
                    </label>
                  </div>
                  {/* 暂停/重启记录 */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-end">
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
                              if (ledgerId === 37) {
                                setPauseWalletHandlingDraft({ userId, tagName, pauseDate: today, action: 'retain' });
                              } else {
                                const newHistory = [...history, { pauseDate: today }];
                                updateEntry(userId, tagName, { pauseHistory: newHistory });
                              }
                            }}
                          >
                            + 添加暂停
                          </button>
                        );
                      }
                    })()}
                  </div>
                  {ledgerId === 37 && pauseWalletHandlingDraft?.userId === userId && pauseWalletHandlingDraft.tagName === tagName && (
                    <div className="rounded-xl p-2.5 space-y-2" style={{ backgroundColor: '#F2F8FF', border: '1px solid #B8D7F3' }}>
                      <div className="text-xs font-semibold" style={{ color: '#1565C0' }}>暂停后的保证金处理</div>
                      <div className="text-[10px]" style={{ color: '#607D8B' }}>暂停保存后，可保留保证金等待手动处理，或把本标签仍冻结的钱包保证金原币种退回成员可用余额。</div>
                      <input type="date" value={pauseWalletHandlingDraft.pauseDate} onChange={(event) => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft, pauseDate: event.target.value })} className="h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none" style={{ borderColor: '#B8D7F3', color: '#1565C0' }} />
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft, action: 'retain' })} className="rounded-lg p-2 text-left" style={{ backgroundColor: pauseWalletHandlingDraft.action === 'retain' ? '#EAF3FF' : '#FFFFFF', border: `1px solid ${pauseWalletHandlingDraft.action === 'retain' ? '#6FA8DC' : '#DCE9F5'}` }}>
                          <div className="text-xs font-semibold" style={{ color: '#1565C0' }}>保留保证金</div>
                          <div className="mt-0.5 text-[10px] leading-4" style={{ color: '#607D8B' }}>继续冻结，之后可逐笔手动减少或解冻。</div>
                        </button>
                        <button type="button" onClick={() => setPauseWalletHandlingDraft({ ...pauseWalletHandlingDraft, action: 'release_wallet_holds' })} className="rounded-lg p-2 text-left" style={{ backgroundColor: pauseWalletHandlingDraft.action === 'release_wallet_holds' ? '#EAF3FF' : '#FFFFFF', border: `1px solid ${pauseWalletHandlingDraft.action === 'release_wallet_holds' ? '#6FA8DC' : '#DCE9F5'}` }}>
                          <div className="text-xs font-semibold" style={{ color: '#1565C0' }}>暂停并解冻</div>
                          <div className="mt-0.5 text-[10px] leading-4" style={{ color: '#607D8B' }}>保存暂停后，将本标签的冻结保证金退回钱包。</div>
                        </button>
                      </div>
                      {pauseWalletHandlingDraft.action === 'release_wallet_holds' && (
                        <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ backgroundColor: '#FFFFFF', color: '#45616F' }}>
                          {walletMarginContext.isLoading ? '正在核算本标签可解冻的保证金…' : walletMarginContext.isError ? '保证金读取失败；请改为保留保证金后稍后手动处理。' : pauseWalletReleaseAssets.length > 0 ? <>保存暂停后将解冻：{pauseWalletReleaseAssets.map((asset) => formatWalletMarginAssetBalance(asset.amount, asset.assetCode)).join(' · ')}</> : '本标签没有仍冻结的钱包保证金；历史手工押金不会自动退回钱包。'}
                        </div>
                      )}
                      <div className="flex justify-end gap-2"><button type="button" onClick={() => setPauseWalletHandlingDraft(null)} className="h-7 px-2 text-[10px]" style={{ color: '#78909C' }}>取消</button><button type="button" onClick={() => {
                        const plan = pauseWalletHandlingDraft;
                        if (!plan.pauseDate) { toast.error('请选择暂停日期'); return; }
                        const newHistory = [...(entry.pauseHistory ?? []), { pauseDate: plan.pauseDate }];
                        updateEntry(userId, tagName, { pauseHistory: newHistory, pauseDate: '' });
                        setPauseWalletPlans((previous) => ({ ...previous, [`${userId}|${tagName}`]: plan }));
                        setPauseWalletHandlingDraft(null);
                      }} className="h-7 rounded-lg px-2.5 text-[10px] font-medium text-white" style={{ backgroundColor: '#1565C0' }}>确认暂停方案</button></div>
                    </div>
                  )}
                  {ledgerId === 37 && pauseWalletPlans[`${userId}|${tagName}`] && (
                    <div className="rounded-lg px-2 py-1.5 text-[10px]" style={{ backgroundColor: '#F2F8FF', color: '#45616F' }}>
                      已选择：{pauseWalletPlans[`${userId}|${tagName}`].action === 'release_wallet_holds' ? '暂停保存后，解冻本标签仍冻结的钱包保证金并退回成员账户' : '暂停保存后，继续保留保证金冻结'}。
                    </div>
                  )}
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
                              if (idx === (entry.pauseHistory ?? []).length - 1 && !item.resumeDate) {
                                setPauseWalletPlans((previous) => {
                                  const key = `${userId}|${tagName}`;
                                  if (!previous[key]) return previous;
                                  const next = { ...previous };
                                  delete next[key];
                                  return next;
                                });
                              }
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </section>}
                {isStockTag ? renderStockParticipationEditor({ selectedUserId: userId, accentColor: catColor }) : <>
                {/* 比例、初始金额、实际权益三联动 */}
                <section className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E8E8E8' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-gray-700">金额与比例</div>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">任意两项自动反推第三项</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="min-w-0">
                      <span className="block text-[11px] text-gray-400 mb-1">初始金额</span>
                      <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                        <span className="text-xs text-gray-400 flex-shrink-0">¥</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={allocationDisplay.amount}
                          onChange={e => updateAllocationLink(userId, tagName, 'amount', e.target.value)}
                          className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                          style={{ color: allocationDisplay.derivedField === 'amount' ? '#2F6F85' : '#222222' }}
                        />
                      </div>
                    </label>
                    <label className="min-w-0">
                      <span className="block text-[11px] text-gray-400 mb-1">比例</span>
                      <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          min={0}
                          max={100}
                          value={allocationDisplay.ratio}
                          onChange={e => updateAllocationLink(userId, tagName, 'ratio', e.target.value)}
                          className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                          style={{ color: allocationDisplay.derivedField === 'ratio' ? '#2F6F85' : '#222222' }}
                        />
                        <span className="text-xs text-gray-400 flex-shrink-0">%</span>
                      </div>
                    </label>
                    <label className="min-w-0">
                      <span className="block text-[11px] text-gray-400 mb-1">实际权益</span>
                      <div className="flex items-center rounded-lg border bg-white px-2" style={{ borderColor: '#E0E0E0' }}>
                        <span className="text-xs text-gray-400 flex-shrink-0">¥</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={allocationDisplay.targetAmount}
                          onChange={e => updateAllocationLink(userId, tagName, 'targetAmount', e.target.value)}
                          className="min-w-0 w-full bg-transparent text-right text-sm py-1.5 outline-none"
                          style={{ color: allocationDisplay.derivedField === 'targetAmount' ? '#2F6F85' : '#222222' }}
                        />
                      </div>
                    </label>
                  </div>
                </section>
                </>}
                {/* 押金：与用户展开区使用同一套多笔多币种编辑器 */}
                {MarginEntriesEditor({ userId, tagName, entry, accentColor: catColor, compact: true })}
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

      {walletSnapshotUser && (
        walletSnapshotQuery.isLoading ? (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65" onClick={() => setWalletSnapshotUser(null)}>
            <div className="rounded-2xl px-6 py-5 text-center" style={{ background: '#151515', border: '1px solid rgba(201,168,76,.5)' }} onClick={(event) => event.stopPropagation()}>
              <div className="text-sm font-semibold text-[#f5d78e]">正在读取钱包实时快照…</div>
              <div className="mt-1 text-xs text-white/45">仅加载该37号账本成员的只读资产与资金明细</div>
            </div>
          </div>
        ) : walletSnapshotQuery.error ? (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 px-6" onClick={() => setWalletSnapshotUser(null)}>
            <div className="w-full max-w-sm rounded-2xl px-5 py-5 text-center" style={{ background: '#151515', border: '1px solid rgba(248,113,113,.55)' }} onClick={(event) => event.stopPropagation()}>
              <div className="text-sm font-semibold text-red-300">钱包快照暂时无法读取</div>
              <div className="mt-1 text-xs leading-5 text-white/55">{walletSnapshotQuery.error.message || '请稍后重新打开，不会影响成员钱包或初始金额配置。'}</div>
              <div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => walletSnapshotQuery.refetch()} className="rounded-lg bg-[#C9A84C] px-4 py-2 text-xs font-semibold text-[#151515]">重新读取</button><button type="button" onClick={() => setWalletSnapshotUser(null)} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white/70">关闭</button></div>
            </div>
          </div>
        ) : walletSnapshotQuery.data ? (
          <ReadonlyWalletSnapshot snapshot={walletSnapshotQuery.data} onClose={() => setWalletSnapshotUser(null)} />
        ) : null
      )}

    </div>
  );
}
