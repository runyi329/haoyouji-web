import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  History,
  Landmark,
  Network,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type AnyRecord = Record<string, any>;

// 统一按OKX合约挂单口径估算：手续费率 × 默认30%节点净手续费返佣。
const OKX_VIP_TIER_OPTIONS = [
  { value: "regular", label: "普通用户", rebateRatePct: 0.006, rebateRateLabel: "0.0060%" },
  { value: "vip1", label: "VIP 1", rebateRatePct: 0.0048, rebateRateLabel: "0.0048%" },
  { value: "vip2", label: "VIP 2", rebateRatePct: 0.0045, rebateRateLabel: "0.0045%" },
  { value: "vip3", label: "VIP 3", rebateRatePct: 0.003, rebateRateLabel: "0.0030%" },
  { value: "vip4", label: "VIP 4", rebateRatePct: 0.0024, rebateRateLabel: "0.0024%" },
  { value: "vip5", label: "VIP 5", rebateRatePct: 0.0015, rebateRateLabel: "0.0015%" },
] as const;
type OkxVipTier = typeof OKX_VIP_TIER_OPTIONS[number]["value"];
const OKX_CONTRACT_MAKER_TIER_RULES = [
  { tier: "普通用户", makerRate: "0.0200%", rebatePerTenThousand: "0.60 U" },
  { tier: "VIP 1", makerRate: "0.0160%", rebatePerTenThousand: "0.48 U" },
  { tier: "VIP 2", makerRate: "0.0150%", rebatePerTenThousand: "0.45 U" },
  { tier: "VIP 3", makerRate: "0.0100%", rebatePerTenThousand: "0.30 U" },
  { tier: "VIP 4", makerRate: "0.0080%", rebatePerTenThousand: "0.24 U" },
  { tier: "VIP 5", makerRate: "0.0050%", rebatePerTenThousand: "0.15 U" },
] as const;

type GlobalUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
  role?: string | null;
  inviteCode?: string | null;
  invitedByUserId?: number | null;
};

type CommissionMember = {
  userId: number;
  name: string;
  username: string;
  role: string;
  globalUser?: GlobalUser;
};

type ReferralStatus = "idle" | "loading" | "ready" | "no-referrer" | "dangling" | "loop";

type ReferralResult = {
  status: ReferralStatus;
  chain: GlobalUser[];
  issueUserId?: number;
};

type CommissionRegistration = {
  id: string;
  registeredAt: string;
  transactionCumulative: number;
  transactionIncrement: number;
  rebateRate: number | null;
  paidCommission: number | null;
  expectedCommission: number | null;
};

type CommissionAccount = {
  id: string;
  userId: number;
  customerName: string;
  username: string;
  avatar: string | null;
  okxUid: string;
  okxLogin: string;
  vipTier: OkxVipTier;
  allocationSnapshot: Array<{
    userId: number;
    name: string;
    inviteCode: string | null;
    percentage: number;
  }>;
  personalExpectedCommissionTotal: number;
  teamSummary: {
    customerCount: number;
    cumulativeTurnover: number;
    expectedCommissionTotal: number;
    totalExpectedCommission: number;
    members: Array<{
      userId: number;
      customerName: string;
      username: string;
      cumulativeTurnover: number;
      expectedCommissionTotal: number;
    }>;
  };
  monthlyCommission: Array<{
    month: string;
    personalExpectedCommissionTotal: number;
    teamExpectedCommissionTotal: number;
    totalExpectedCommission: number;
  }>;
  records: CommissionRegistration[];
};

type CommissionTeamRegistration = {
  id: string;
  registeredAt: string;
  transactionCumulative: number;
  transactionIncrement: number;
  allocationPct: number;
  expectedCommission: number | null;
  paidCommission: number | null;
};

type CommissionTeamCustomer = {
  userId: number;
  customerName: string;
  username: string;
  vipTier: OkxVipTier;
  allocationPct: number;
  registrationCount: number;
  expectedCommissionTotal: number;
  paidCommissionKnownTotal: number;
  paidCommissionUnknownCount: number;
  latestRegistration: CommissionTeamRegistration | null;
  records: CommissionTeamRegistration[];
};

type CommissionTeam = {
  hasTeam: boolean;
  customers: CommissionTeamCustomer[];
  summary: {
    customerCount: number;
    registrationCount: number;
    cumulativeTurnover: number;
    latestIncrementTotal: number;
    expectedCommissionTotal: number;
    paidCommissionKnownTotal: number;
    paidCommissionUnknownCount: number;
  };
};

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function isAdministrativeRole(role: unknown): boolean {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "super_admin" || normalized === "admin" || normalized === "owner";
}

function normalizeOkxVipTier(value: unknown): OkxVipTier {
  const tier = String(value ?? "").trim().toLowerCase();
  return OKX_VIP_TIER_OPTIONS.some((option) => option.value === tier)
    ? tier as OkxVipTier
    : "regular";
}

function getOkxVipTierOption(value: unknown) {
  const tier = normalizeOkxVipTier(value);
  return OKX_VIP_TIER_OPTIONS.find((option) => option.value === tier) || OKX_VIP_TIER_OPTIONS[0];
}

function getOkxVipTierShortLabel(value: unknown): string {
  const tier = normalizeOkxVipTier(value);
  return tier === "regular" ? "普" : `V${tier.slice(3)}`;
}

function formatAmount(value: number | null, fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function nowLocalDateTimeString(): string {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(month: string, offset: number): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return currentMonthKey();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月` : month;
}

function formatRecordMonthDay(value: string): string {
  const date = value.split("T")[0] || value;
  return date.length >= 10 ? date.slice(5).replace("-", "/") : date;
}

function createClientRequestId(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random}`.slice(0, 64);
}

function displayUser(user: Pick<GlobalUser, "id" | "name" | "username"> | undefined): string {
  if (!user) return "未知用户";
  return firstText(user.name, user.username, "未命名用户");
}

function referrerInviteCode(user: GlobalUser | undefined, usersById: Map<number, GlobalUser>): string {
  const referrerId = numberOrNull(user?.invitedByUserId);
  if (referrerId === null || referrerId <= 0) return "—";
  return firstText(usersById.get(referrerId)?.inviteCode, "—");
}

function buildGlobalReferralChain(
  selectedUser: GlobalUser | undefined,
  usersById: Map<number, GlobalUser>,
  directoryReady: boolean,
): ReferralResult {
  if (!selectedUser) return { status: directoryReady ? "idle" : "loading", chain: [] };
  if (!directoryReady) return { status: "loading", chain: [] };

  const parentValue = numberOrNull(selectedUser.invitedByUserId);
  if (parentValue === null || parentValue <= 0) return { status: "no-referrer", chain: [] };

  const chain: GlobalUser[] = [];
  const visited = new Set<number>([selectedUser.id]);
  let parentId: number | null = parentValue;
  while (parentId !== null && parentId > 0 && chain.length < 20) {
    if (visited.has(parentId)) return { status: "loop", chain, issueUserId: parentId };
    visited.add(parentId);
    const parent = usersById.get(parentId);
    if (!parent) return { status: "dangling", chain, issueUserId: parentId };
    chain.push(parent);
    parentId = numberOrNull(parent.invitedByUserId);
  }
  return { status: chain.length >= 20 ? "loop" : "ready", chain };
}

function MetricCard({ label, value, unit, accent = "#173F4B", expandable = false, expanded = false }: { label: string; value: string; unit?: string; accent?: string; expandable?: boolean; expanded?: boolean }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
      <div className="flex items-center justify-center gap-0.5 truncate text-[10px]" style={{ color: "#789199" }}><span className="truncate">{label}</span>{expandable && <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}</div>
      <div className="mt-1 flex items-baseline justify-center gap-1 whitespace-nowrap">
        <span className="truncate text-sm font-bold tabular-nums" style={{ color: accent }}>{value}</span>
        {unit && <span className="text-[10px] font-medium" style={{ color: "#68828A" }}>{unit}</span>}
      </div>
    </div>
  );
}

function RebateRuleDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="返佣规则" onClick={onClose}>
      <section className="max-h-[82dvh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-sm sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="flex items-center gap-2"><BadgePercent className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-sm font-semibold" style={{ color: "#173F4B" }}>返佣规则</span></div><button type="button" onClick={onClose} className="p-1.5" aria-label="关闭返佣规则" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
        <div className="max-h-[70dvh] space-y-3 overflow-y-auto px-4 py-4"><div><div className="text-xs font-semibold" style={{ color: "#173F4B" }}>OKX 合约标准组 · 统一按挂单结算</div><p className="mt-1 text-[11px] leading-5" style={{ color: "#789199" }}>不采用吃单费率。每万元预估返佣以节点基础返佣比例 30% 计算。</p></div><div className="overflow-hidden rounded-md border" style={{ borderColor: "#E2EEF0" }}><div className="grid grid-cols-[0.8fr_1fr_1.15fr] border-b px-3 py-2 text-[10px] font-semibold" style={{ borderColor: "#E2EEF0", background: "#F4FBFC", color: "#68828A" }}><span>等级</span><span className="text-right">挂单费率</span><span className="text-right">每万元预计返佣</span></div>{OKX_CONTRACT_MAKER_TIER_RULES.map((rule) => <div key={rule.tier} className="grid grid-cols-[0.8fr_1fr_1.15fr] border-b px-3 py-2 last:border-b-0" style={{ borderColor: "#EDF4F5" }}><span className="text-xs font-semibold" style={{ color: "#173F4B" }}>{rule.tier}</span><span className="text-right text-xs font-semibold tabular-nums" style={{ color: "#45636C" }}>{rule.makerRate}</span><span className="text-right text-xs font-bold tabular-nums" style={{ color: "#DC2626" }}>{rule.rebatePerTenThousand}</span></div>)}</div><div className="border-t pt-3 text-[11px] leading-5" style={{ borderColor: "#E2EEF0", color: "#68828A" }}>预计返佣按用户实际产生的正净挂单手续费计算；VIP 5 受平台月度返佣上限约束。</div></div>
      </section>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  const colors = tone === "ok"
    ? { background: "#ECFDF5", border: "#A7F3D0", text: "#047857" }
    : tone === "warn"
      ? { background: "#FFF7ED", border: "#FED7AA", text: "#C2410C" }
      : { background: "#F1F5F9", border: "#CBD5E1", text: "#475569" };
  return <span className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ background: colors.background, borderColor: colors.border, color: colors.text }}>{children}</span>;
}

export function OkxCommissionPreview({
  ledgerId,
  ledgerInfo,
  currentUser,
  viewAsUserId,
  onEnterUserView,
  onExitUserView,
}: {
  ledgerId: number;
  ledgerInfo: any;
  currentUser: any;
  viewAsUserId?: number;
  onEnterUserView?: (userId: number) => void;
  onExitUserView?: () => void;
}) {
  const utils = trpc.useUtils();
  const isViewingAsMember = Number.isFinite(viewAsUserId) && Number(viewAsUserId) > 0;
  // 仅作为查询缓存隔离键，后端完全按当前会话/代入身份确定实际读取范围。
  const viewerScopeUserId = numberOrNull(isViewingAsMember ? viewAsUserId : currentUser?.id) ?? undefined;
  const commissionQuery = trpc.ledger.okxCommissionGetDashboard.useQuery(
    { ledgerId: 52, viewAsUserId: isViewingAsMember ? Number(viewAsUserId) : undefined, viewerScopeUserId },
    { enabled: ledgerId === 52, staleTime: 10_000 },
  );
  const dashboard = commissionQuery.data as AnyRecord | undefined;
  const isManager = dashboard?.viewerMode === "admin" && !isViewingAsMember;
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [showPayoutConfirmation, setShowPayoutConfirmation] = useState(false);
  const [selectedPayoutUserIds, setSelectedPayoutUserIds] = useState<number[]>([]);
  const pendingPayoutsQuery = trpc.ledger.okxCommissionGetPendingPayouts.useQuery(
    { ledgerId: 52 },
    { enabled: ledgerId === 52 && isManager && showPayoutDialog, staleTime: 0, refetchOnMount: "always" },
  );
  const canReadGlobalDirectory = Boolean(isManager && currentUser?.role === "super_admin");
  const globalDirectoryQuery = trpc.invitePermission.getAllUsersInvitePermission.useQuery(undefined, {
    enabled: canReadGlobalDirectory,
    staleTime: 5 * 60 * 1000,
  });
  const upsertCustomerMutation = trpc.ledger.okxCommissionUpsertCustomer.useMutation({
    onSuccess: async (result) => {
      await utils.ledger.okxCommissionGetDashboard.invalidate({ ledgerId: 52 });
      await utils.ledger.getById.invalidate({ ledgerId: 52 });
      setShowRegistration(false);
      setSelectedRegisteredUserId(null);
      toast.success(result?.joinedLedger ? "客户设置已保存，并已加入52号账本" : "客户设置已真实保存");
    },
    onError: (error) => toast.error(error.message || "客户资料保存失败"),
  });
  const createRegistrationMutation = trpc.ledger.okxCommissionCreateRegistration.useMutation({
    onSuccess: async () => {
      await utils.ledger.okxCommissionGetDashboard.invalidate({ ledgerId: 52 });
      setRegistrationTime(nowLocalDateTimeString());
      setTurnoverVolume("");
      toast.success("本次累计交易额已保存，返佣已进入待发清单");
    },
    onError: (error) => toast.error(error.message || "交易量登记保存失败"),
  });
  const issuePayoutsMutation = trpc.ledger.okxCommissionIssuePayouts.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.ledger.okxCommissionGetDashboard.invalidate({ ledgerId: 52 }),
        utils.ledger.okxCommissionGetPendingPayouts.invalidate({ ledgerId: 52 }),
      ]);
      setShowPayoutConfirmation(false);
      setShowPayoutDialog(false);
      setSelectedPayoutUserIds([]);
      toast.success(`已向 ${result?.recipientCount || 0} 位用户钱包发放 ${formatAmount(numberOrNull(result?.totalAmount) ?? 0, 2)} U`);
    },
    onError: (error) => toast.error(error.message || "佣金发放失败"),
  });
  const updateGlobalReferrerMutation = trpc.invitePermission.updateUserReferrer.useMutation({
    onSuccess: async () => {
      await utils.invitePermission.getAllUsersInvitePermission.invalidate();
      await utils.ledger.okxCommissionGetDashboard.invalidate({ ledgerId: 52 });
      await globalDirectoryQuery.refetch();
      setSelectedQuickReferrerUserId(null);
      setReferrerSearch("");
      toast.success("全局推荐人已设置，请继续确认返佣分配");
    },
    onError: (error) => toast.error(error.message || "推荐人设置失败"),
  });

  const globalUsers = useMemo<GlobalUser[]>(() => {
    const source = Array.isArray(globalDirectoryQuery.data) ? globalDirectoryQuery.data : [];
    return source.map((user: any) => ({
      id: Number(user.id),
      username: user.username ?? null,
      name: user.name ?? null,
      avatar: user.avatar ?? null,
      role: user.role ?? null,
      inviteCode: user.inviteCode ?? null,
      invitedByUserId: numberOrNull(user.invitedByUserId),
    })).filter((user) => Number.isFinite(user.id) && user.id > 0);
  }, [globalDirectoryQuery.data]);
  const usersById = useMemo(() => new Map(globalUsers.map((user) => [user.id, user])), [globalUsers]);
  const members = useMemo<CommissionMember[]>(() => {
    const source = Array.isArray((ledgerInfo as AnyRecord)?.members) ? (ledgerInfo as AnyRecord).members : [];
    const seen = new Set<number>();
    return source.flatMap((member: any) => {
      const userId = numberOrNull(member.userId ?? member.user_id ?? member.memberUserId);
      if (userId === null || userId <= 0 || seen.has(userId)) return [];
      seen.add(userId);
      const globalUser = usersById.get(userId);
      return [{
        userId,
        name: firstText(globalUser?.name, member.realName, member.nickname, member.name, member.username, "未命名客户"),
        username: firstText(globalUser?.username, member.username),
        role: String(member.role || "member"),
        globalUser,
      }];
    }).filter((member) => member.role !== "owner" && member.role !== "admin" && !isAdministrativeRole(member.globalUser?.role));
  }, [ledgerInfo, usersById]);
  const accounts = useMemo<CommissionAccount[]>(() => {
    const source = Array.isArray(dashboard?.accounts) ? dashboard.accounts : [];
    return source.map((account: any) => ({
      id: String(account.id),
      userId: Number(account.userId),
      customerName: String(account.customerName || "未命名客户"),
      username: String(account.username || ""),
      avatar: String(account.avatar || "") || null,
      okxUid: String(account.okxUid || ""),
      okxLogin: String(account.okxLogin || ""),
      vipTier: normalizeOkxVipTier(account.vipTier),
      allocationSnapshot: Array.isArray(account.allocationSnapshot) ? account.allocationSnapshot : [],
      personalExpectedCommissionTotal: numberOrNull(account.personalExpectedCommissionTotal) ?? 0,
      teamSummary: {
        customerCount: numberOrNull(account.teamSummary?.customerCount) ?? 0,
        cumulativeTurnover: numberOrNull(account.teamSummary?.cumulativeTurnover) ?? 0,
        expectedCommissionTotal: numberOrNull(account.teamSummary?.expectedCommissionTotal) ?? 0,
        totalExpectedCommission: numberOrNull(account.teamSummary?.totalExpectedCommission) ?? 0,
        members: Array.isArray(account.teamSummary?.members) ? account.teamSummary.members.flatMap((member: any) => {
          const userId = numberOrNull(member?.userId);
          if (userId === null || userId <= 0) return [];
          return [{
            userId,
            customerName: String(member.customerName || `客户 #${userId}`),
            username: String(member.username || ""),
            cumulativeTurnover: numberOrNull(member.cumulativeTurnover) ?? 0,
            expectedCommissionTotal: numberOrNull(member.expectedCommissionTotal) ?? 0,
          }];
        }) : [],
      },
      monthlyCommission: Array.isArray(account.monthlyCommission) ? account.monthlyCommission.flatMap((entry: any) => {
        const month = String(entry?.month || "");
        if (!/^\d{4}-\d{2}$/.test(month)) return [];
        const personalExpectedCommissionTotal = numberOrNull(entry.personalExpectedCommissionTotal) ?? 0;
        const teamExpectedCommissionTotal = numberOrNull(entry.teamExpectedCommissionTotal) ?? 0;
        return [{
          month,
          personalExpectedCommissionTotal,
          teamExpectedCommissionTotal,
          totalExpectedCommission: numberOrNull(entry.totalExpectedCommission) ?? personalExpectedCommissionTotal + teamExpectedCommissionTotal,
        }];
      }) : [],
      records: Array.isArray(account.records) ? account.records : [],
    })).filter((account) => Number.isInteger(account.userId) && account.userId > 0);
  }, [dashboard?.accounts]);
  const viewAsMembers = useMemo(() => {
    const accountsByUserId = new Map(accounts.map((account) => [account.userId, account]));
    const cumulativeTurnoverByUserId = new Map(accounts.map((account) => {
      const latest = account.records[account.records.length - 1];
      return [account.userId, Number(latest?.transactionCumulative || 0)];
    }));
    return [...members]
      .map((member, index) => {
        const cumulativeTurnover = cumulativeTurnoverByUserId.get(member.userId) || 0;
        return {
          member,
          cumulativeTurnover,
          index,
          // 有交易量优先；其后是已通过“添加用户”完成佣金建档但暂无交易量的用户；最后才是其他成员。
          priority: cumulativeTurnover > 0 ? 0 : accountsByUserId.has(member.userId) ? 1 : 2,
        };
      })
      .sort((left, right) => left.priority - right.priority || right.cumulativeTurnover - left.cumulativeTurnover || left.index - right.index);
  }, [accounts, members]);
  const loadedTeam = useMemo<CommissionTeam>(() => {
    const source = (dashboard?.team || {}) as AnyRecord;
    const summarySource = (source.summary || {}) as AnyRecord;
    const customers = (Array.isArray(source.customers) ? source.customers : []).flatMap((customer: any) => {
      const userId = numberOrNull(customer.userId);
      if (userId === null || userId <= 0) return [];
      const latest = customer.latestRegistration as AnyRecord | null | undefined;
      return [{
        userId,
        customerName: String(customer.customerName || `客户 #${userId}`),
        username: String(customer.username || ""),
        vipTier: normalizeOkxVipTier(customer.vipTier),
        allocationPct: numberOrNull(customer.allocationPct) ?? 0,
        registrationCount: numberOrNull(customer.registrationCount) ?? 0,
        expectedCommissionTotal: numberOrNull(customer.expectedCommissionTotal) ?? 0,
        paidCommissionKnownTotal: numberOrNull(customer.paidCommissionKnownTotal) ?? 0,
        paidCommissionUnknownCount: numberOrNull(customer.paidCommissionUnknownCount) ?? 0,
        latestRegistration: latest ? {
          id: String(latest.id || ""),
          registeredAt: String(latest.registeredAt || ""),
          transactionCumulative: numberOrNull(latest.transactionCumulative) ?? 0,
          transactionIncrement: numberOrNull(latest.transactionIncrement) ?? 0,
          allocationPct: numberOrNull(latest.allocationPct) ?? 0,
          expectedCommission: numberOrNull(latest.expectedCommission),
          paidCommission: numberOrNull(latest.paidCommission),
        } : null,
        records: (Array.isArray(customer.records) ? customer.records : []).flatMap((record: any) => {
          const id = String(record?.id || "");
          if (!id) return [];
          return [{
            id,
            registeredAt: String(record.registeredAt || ""),
            transactionCumulative: numberOrNull(record.transactionCumulative) ?? 0,
            transactionIncrement: numberOrNull(record.transactionIncrement) ?? 0,
            allocationPct: numberOrNull(record.allocationPct) ?? 0,
            expectedCommission: numberOrNull(record.expectedCommission),
            paidCommission: numberOrNull(record.paidCommission),
          }];
        }),
      }];
    });
    return {
      hasTeam: Boolean(source.hasTeam) && customers.length > 0,
      customers,
      summary: {
        customerCount: numberOrNull(summarySource.customerCount) ?? customers.length,
        registrationCount: numberOrNull(summarySource.registrationCount) ?? 0,
        cumulativeTurnover: numberOrNull(summarySource.cumulativeTurnover) ?? 0,
        latestIncrementTotal: numberOrNull(summarySource.latestIncrementTotal) ?? 0,
        expectedCommissionTotal: numberOrNull(summarySource.expectedCommissionTotal) ?? 0,
        paidCommissionKnownTotal: numberOrNull(summarySource.paidCommissionKnownTotal) ?? 0,
        paidCommissionUnknownCount: numberOrNull(summarySource.paidCommissionUnknownCount) ?? 0,
      },
    };
  }, [dashboard?.team]);
  // 团队数据仅来源于已保存的真实佣金档案、登记记录及冻结分佣快照。
  const team = loadedTeam;

  const [showRegistration, setShowRegistration] = useState(false);
  const [clientSection, setClientSection] = useState<"personal" | "team">("personal");
  const [showRebateRules, setShowRebateRules] = useState(false);
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(viewAsUserId ?? null);
  const [selectedRegisteredUserId, setSelectedRegisteredUserId] = useState<number | null>(null);
  const [okxUid, setOkxUid] = useState("");
  const [okxLogin, setOkxLogin] = useState("");
  const [vipTier, setVipTier] = useState<OkxVipTier>("regular");
  const [registrationTime, setRegistrationTime] = useState(nowLocalDateTimeString);
  const [turnoverVolume, setTurnoverVolume] = useState("");
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [referrerSearch, setReferrerSearch] = useState("");
  const [selectedQuickReferrerUserId, setSelectedQuickReferrerUserId] = useState<number | null>(null);
  const [uidDisclosure, setUidDisclosure] = useState<CommissionAccount | null>(null);
  const [teamDisclosure, setTeamDisclosure] = useState<CommissionAccount | null>(null);
  const [personalCommissionDisclosure, setPersonalCommissionDisclosure] = useState<CommissionAccount | null>(null);
  const [expandedTeamMemberUserId, setExpandedTeamMemberUserId] = useState<number | null>(null);
  const [showPersonalRecordDetails, setShowPersonalRecordDetails] = useState(false);
  const [commissionStatsDisclosure, setCommissionStatsDisclosure] = useState<CommissionAccount | null>(null);
  const [commissionStatsMonth, setCommissionStatsMonth] = useState(currentMonthKey);

  const selectedMember = useMemo(() => {
    const ledgerMember = members.find((member) => member.userId === selectedUserId);
    if (ledgerMember) return ledgerMember;
    const globalUser = selectedUserId ? usersById.get(selectedUserId) : undefined;
    if (!globalUser || isAdministrativeRole(globalUser.role)) return undefined;
    return {
      userId: globalUser.id,
      name: firstText(globalUser.name, globalUser.username, "未命名客户"),
      username: firstText(globalUser.username),
      role: "member",
      globalUser,
    } satisfies CommissionMember;
  }, [members, selectedUserId, usersById]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.userId === selectedUserId),
    [accounts, selectedUserId],
  );
  const selectedGlobalUser = selectedMember?.globalUser ?? (selectedUserId ? usersById.get(selectedUserId) : undefined);
  const referral = useMemo(
    () => buildGlobalReferralChain(selectedGlobalUser, usersById, globalDirectoryQuery.isSuccess),
    [globalDirectoryQuery.isSuccess, selectedGlobalUser, usersById],
  );
  const distributionUsers = useMemo(() => {
    if (!selectedGlobalUser) return [];
    const firstAdministratorIndex = referral.chain.findIndex((user) => isAdministrativeRole(user.role));
    const referralChainBeforeAdministrator = firstAdministratorIndex < 0
      ? referral.chain
      : referral.chain.slice(0, firstAdministratorIndex);
    return [selectedGlobalUser, ...referralChainBeforeAdministrator].filter((user) => !isAdministrativeRole(user.role));
  }, [referral.chain, selectedGlobalUser]);

  useEffect(() => {
    if (!selectedUserId || !showRegistration) return;
    setAllocations((previous) => {
      const next: Record<number, string> = {};
      for (const [index, user] of distributionUsers.entries()) {
        next[user.id] = previous[user.id] ?? (index === 0 ? "100" : "0");
      }
      return next;
    });
  }, [distributionUsers, selectedUserId, showRegistration]);

  useEffect(() => {
    setShowPersonalRecordDetails(false);
    if (viewAsUserId && Number.isFinite(viewAsUserId)) {
      setSelectedUserId(viewAsUserId);
    } else {
      // 从用户视角返回管理员工作台时，不能保留被代入用户的本地表单/展开状态。
      setSelectedUserId(null);
      setSelectedRegisteredUserId(null);
      setShowRegistration(false);
      setShowViewAsPicker(false);
      setTeamDisclosure(null);
      setPersonalCommissionDisclosure(null);
      setExpandedTeamMemberUserId(null);
      setCommissionStatsDisclosure(null);
    }
  }, [viewAsUserId]);

  const filteredMembers = useMemo(() => {
    const term = memberSearch.trim().toLocaleLowerCase();
    if (!term) return [];
    return globalUsers
      .filter((user) => !isAdministrativeRole(user.role))
      .filter((user) => `${user.name || ""} ${user.username || ""} ${user.inviteCode || ""}`.toLocaleLowerCase().includes(term))
      .map((user) => ({
        userId: user.id,
        name: firstText(user.name, user.username, "未命名客户"),
        username: firstText(user.username),
        role: "member",
        globalUser: user,
      } satisfies CommissionMember))
      .slice(0, 10);
  }, [globalUsers, memberSearch]);
  const referrerCandidates = useMemo(() => {
    const term = referrerSearch.trim().toLocaleLowerCase();
    if (!selectedGlobalUser || !term) return [];
    return globalUsers
      .filter((user) => user.id !== selectedGlobalUser.id)
      .filter((user) => !isAdministrativeRole(user.role))
      .filter((user) => `${user.name || ""} ${user.username || ""} ${user.inviteCode || ""}`.toLocaleLowerCase().includes(term))
      .slice(0, 8);
  }, [globalUsers, referrerSearch, selectedGlobalUser]);
  const selectedQuickReferrer = useMemo(
    () => globalUsers.find((user) => user.id === selectedQuickReferrerUserId),
    [globalUsers, selectedQuickReferrerUserId],
  );
  const directReferrer = selectedGlobalUser ? usersById.get(numberOrNull(selectedGlobalUser.invitedByUserId) ?? 0) : undefined;
  const canConfigureReferrer = Boolean(selectedMember && selectedGlobalUser && referral.status !== "loading" && referral.status !== "loop");
  const missingReferrerCount = useMemo(() => (
    members.filter((member) => member.globalUser && numberOrNull(member.globalUser.invitedByUserId) === null).length
  ), [members]);

  const selectedRegistrationHistory = selectedAccount?.records || [];
  const previousRegistration = selectedRegistrationHistory[selectedRegistrationHistory.length - 1];
  const registeredCustomerRows = useMemo(() => accounts.map((account) => {
    const latestRegistration = account.records[account.records.length - 1];
    const cumulativeTurnover = latestRegistration
      ? Number(latestRegistration.transactionCumulative || 0)
      : null;
    return { ...account, cumulativeTurnover };
  }), [accounts]);
  const registeredCumulativeTurnover = useMemo(
    () => registeredCustomerRows.reduce((sum, row) => sum + (row.cumulativeTurnover ?? 0), 0),
    [registeredCustomerRows],
  );
  const hasSelectedCustomerProfile = Boolean(selectedAccount);
  const showSelectedCustomerDetail = hasSelectedCustomerProfile && selectedRegisteredUserId === selectedUserId;

  const turnoverValue = numberOrNull(turnoverVolume);
  const hasWeeklyDraft = turnoverVolume.trim() !== "";
  const previousCumulativeTotal = previousRegistration?.transactionCumulative ?? 0;
  const transactionIncrement = turnoverValue === null ? null : turnoverValue - previousCumulativeTotal;
  const currentCumulativeTotal = turnoverValue ?? 0;
  const currentIncrementTotal = transactionIncrement ?? 0;
  const hasCumulativeDecrease = transactionIncrement !== null && transactionIncrement < 0;
  const currentVipTier = getOkxVipTierOption(selectedAccount?.vipTier ?? vipTier);
  const expectedCommission = turnoverValue === null ? null : currentIncrementTotal * currentVipTier.rebateRatePct / 100;
  const allocationTotal = distributionUsers.reduce((sum, user) => sum + (numberOrNull(allocations[user.id]) ?? 0), 0);
  const selectedPreviewName = selectedMember?.name || selectedAccount?.customerName || firstText(currentUser?.name, currentUser?.username, "当前客户");

  const selectMember = (member: CommissionMember) => {
    const existingAccount = accounts.find((account) => account.userId === member.userId);
    setSelectedUserId(member.userId);
    setSelectedRegisteredUserId(null);
    setMemberSearch("");
    setTurnoverVolume("");
    setReferrerSearch("");
    setSelectedQuickReferrerUserId(null);
    if (existingAccount) {
      setOkxUid(existingAccount.okxUid);
      setOkxLogin(existingAccount.okxLogin);
      setVipTier(existingAccount.vipTier);
      setAllocations(Object.fromEntries(existingAccount.allocationSnapshot.map((entry) => [entry.userId, String(entry.percentage)])));
    } else {
      setOkxUid("");
      setOkxLogin("");
      setVipTier("regular");
      setAllocations({});
    }
  };

  const enterUserView = (member: CommissionMember) => {
    if (!onEnterUserView) {
      toast.error("当前页面暂不支持切换用户视角");
      return;
    }
    setShowViewAsPicker(false);
    onEnterUserView(member.userId);
  };

  const openNewCustomer = () => {
    setSelectedUserId(null);
    setSelectedRegisteredUserId(null);
    setOkxUid("");
    setOkxLogin("");
    setVipTier("regular");
    setMemberSearch("");
    setAllocations({});
    setReferrerSearch("");
    setSelectedQuickReferrerUserId(null);
    setShowRegistration(true);
  };

  const editRegisteredCustomer = (profile: CommissionAccount) => {
    const globalUser = usersById.get(profile.userId);
    const member = members.find((candidate) => candidate.userId === profile.userId) || (globalUser && !isAdministrativeRole(globalUser.role) ? {
      userId: globalUser.id,
      name: firstText(globalUser.name, globalUser.username, profile.customerName),
      username: firstText(globalUser.username, profile.username),
      role: "member",
      globalUser,
    } satisfies CommissionMember : undefined);
    if (!member) {
      toast.error("客户资料正在加载，请稍后再试");
      return;
    }
    selectMember(member);
    setShowRegistration(true);
  };

  const openRegisteredCustomer = (profile: CommissionAccount) => {
    setSelectedUserId(profile.userId);
    setSelectedRegisteredUserId((previous) => previous === profile.userId ? null : profile.userId);
    setShowRegistration(false);
    setMemberSearch("");
    setOkxUid(profile.okxUid);
    setOkxLogin(profile.okxLogin);
    setVipTier(profile.vipTier);
    setRegistrationTime(nowLocalDateTimeString());
    setTurnoverVolume("");
  };

  const openCommissionStats = (profile: CommissionAccount) => {
    const thisMonth = currentMonthKey();
    const latestMonth = profile.monthlyCommission[profile.monthlyCommission.length - 1]?.month;
    setCommissionStatsMonth(profile.monthlyCommission.some((entry) => entry.month === thisMonth) ? thisMonth : (latestMonth || thisMonth));
    setCommissionStatsDisclosure(profile);
  };

  const saveCustomer = () => {
    if (!selectedMember) {
      toast.error("请先输入并选择客户");
      return;
    }
    const normalizedOkxUid = okxUid.trim();
    if (!/^\d{17,20}$/.test(normalizedOkxUid)) {
      toast.error("OKX UID需填写17至20位数字");
      return;
    }
    if (!selectedGlobalUser || globalDirectoryQuery.isLoading) {
      toast.error("正在读取全局推荐链，请稍后确认保存");
      return;
    }
    if (Math.abs(allocationTotal - 100) > 0.001) {
      toast.error("返佣分配合计必须为100%");
      return;
    }
    upsertCustomerMutation.mutate({
      ledgerId: 52,
      memberUserId: selectedMember.userId,
      okxUid: normalizedOkxUid,
      okxLogin: okxLogin.trim() || undefined,
      vipTier,
      allocations: distributionUsers.map((user) => ({
        beneficiaryUserId: user.id,
        percentage: String(numberOrNull(allocations[user.id]) ?? 0),
      })),
      clientRequestId: createClientRequestId("okxcustomer"),
    });
  };

  const saveRegistration = () => {
    if (!selectedAccount) {
      toast.error("请先从登记列表选择客户");
      return;
    }
    if (turnoverValue === null) {
      toast.error("请填写累计交易额");
      return;
    }
    if (hasCumulativeDecrease) {
      toast.error("累计交易量不能低于上一笔已保存登记值");
      return;
    }
    createRegistrationMutation.mutate({
      ledgerId: 52,
      accountId: selectedAccount.id,
      recordedAt: registrationTime,
      cumulativeTurnover: turnoverVolume.trim(),
      clientRequestId: createClientRequestId("okxrecord"),
    });
  };

  const referralNotice = () => {
    if (referral.status === "no-referrer") return "该成员尚未设置全局推荐人";
    if (referral.status === "dangling") return "推荐人未能在全局用户目录中找到";
    if (referral.status === "loop") return "推荐关系存在循环或层级超过上限";
    return "全局推荐关系已就绪";
  };

  const copyOkxUid = async (okxUid: string) => {
    try {
      await navigator.clipboard.writeText(okxUid);
      toast.success("OKX UID 已复制");
    } catch {
      toast.error("复制失败，请手动复制 UID");
    }
  };

  const clientView = !isManager || isViewingAsMember;
  const clientAccount = accounts[0];
  const clientRecords = clientAccount?.records || [];
  const clientLatestRecord = clientRecords[clientRecords.length - 1];
  const clientPendingCommission = clientLatestRecord?.expectedCommission === null || clientLatestRecord?.expectedCommission === undefined
    ? null
    : Math.max(0, clientLatestRecord.expectedCommission - (clientLatestRecord.paidCommission ?? 0));
  const hasTeamMembers = team.customers.length > 0;
  const isTeamSection = clientSection === "team";
  const clientIsOpen = Boolean(clientAccount || hasTeamMembers);
  const rebateRuleDialog = showRebateRules ? <RebateRuleDialog onClose={() => setShowRebateRules(false)} /> : null;
  useEffect(() => {
    // 仅把当前用户实际可分得佣金的成员视为团队；进入或切换用户时按此结果设定默认页签。
    setClientSection(hasTeamMembers ? "team" : "personal");
  }, [hasTeamMembers, viewAsUserId]);
  const pendingPayoutGroups = useMemo(() => {
    const rawGroups = Array.isArray((pendingPayoutsQuery.data as AnyRecord | undefined)?.groups)
      ? (pendingPayoutsQuery.data as AnyRecord).groups
      : [];
    return rawGroups.flatMap((raw: AnyRecord) => {
      const beneficiaryUserId = numberOrNull(raw?.beneficiaryUserId);
      if (!beneficiaryUserId) return [];
      const allocations = Array.isArray(raw?.allocations) ? raw.allocations.flatMap((item: AnyRecord) => {
        const allocationId = String(item?.allocationId || "");
        if (!/^\d+$/.test(allocationId)) return [];
        return [{
          allocationId,
          recordId: String(item?.recordId || ""),
          sourceCustomerName: firstText(item?.sourceCustomerName, "未命名客户"),
          sourceUsername: firstText(item?.sourceUsername),
          recordedAt: firstText(item?.recordedAt),
          amount: numberOrNull(item?.amount) ?? 0,
        }];
      }) : [];
      return [{
        beneficiaryUserId,
        beneficiaryName: firstText(raw?.beneficiaryName, `客户 #${beneficiaryUserId}`),
        beneficiaryUsername: firstText(raw?.beneficiaryUsername),
        allocationCount: numberOrNull(raw?.allocationCount) ?? allocations.length,
        totalAmount: numberOrNull(raw?.totalAmount) ?? 0,
        allocations,
      }];
    });
  }, [pendingPayoutsQuery.data]);
  const selectedPayoutGroups = useMemo(
    () => pendingPayoutGroups.filter((group) => selectedPayoutUserIds.includes(group.beneficiaryUserId)),
    [pendingPayoutGroups, selectedPayoutUserIds],
  );
  const selectedPayoutAllocationIds = useMemo(
    () => selectedPayoutGroups.flatMap((group) => group.allocations.map((allocation) => allocation.allocationId)),
    [selectedPayoutGroups],
  );
  const selectedPayoutTotal = useMemo(
    () => selectedPayoutGroups.reduce((sum, group) => sum + group.totalAmount, 0),
    [selectedPayoutGroups],
  );
  const openPayoutDialog = () => {
    setShowPayoutConfirmation(false);
    setSelectedPayoutUserIds([]);
    setShowPayoutDialog(true);
  };
  const togglePayoutRecipient = (userId: number) => {
    setSelectedPayoutUserIds((previous) => previous.includes(userId)
      ? previous.filter((id) => id !== userId)
      : [...previous, userId]);
  };

  if (commissionQuery.isLoading) {
    return <div className="rounded-md border bg-white px-4 py-8 text-center text-sm" style={{ borderColor: "#C8DEE3", color: "#789199" }}>正在读取交易所佣金业务…</div>;
  }

  if (clientView) {
    return (
      <section className="space-y-3" aria-label="OKX交易所佣金业务">
        {isViewingAsMember && (
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2" style={{ borderColor: "#C8DEE3", background: "#F4FBFC" }}>
            <div className="min-w-0 text-xs" style={{ color: "#45636C" }}>正在以 {selectedPreviewName} 的用户视角查看</div>
            <button type="button" onClick={onExitUserView} className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: "#9AC5CE", color: "#276B78", background: "#FFFFFF" }}>返回管理</button>
          </div>
        )}
        <div className="overflow-hidden rounded-md border shadow-sm" style={{ borderColor: "#B9D8DE", background: "linear-gradient(135deg, #1D4E5C, #315D84)" }}>
          <div className="flex items-center gap-3 px-4 py-4 text-white">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-bold" style={{ borderColor: "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.12)" }}>{clientAccount?.avatar ? <img src={clientAccount.avatar} alt="用户头像" className="h-full w-full object-cover" /> : firstText(clientAccount?.customerName, "C").slice(0, 1)}</div>
            <div className="min-w-0 flex-1"><div className="text-base font-semibold">{getOkxVipTierOption(clientAccount?.vipTier).label}</div></div>
            <div className="flex shrink-0 items-center gap-1.5"><span className="inline-flex rounded-[4px] border px-2 py-1 text-[10px] font-semibold" style={clientIsOpen ? { background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" } : { background: "#F1F5F9", borderColor: "#CBD5E1", color: "#475569" }}>{clientIsOpen ? "正常" : "未开通"}</span><button type="button" onClick={() => setShowRebateRules(true)} className="rounded-[4px] border px-2 py-1 text-[10px] font-semibold active:opacity-70" style={{ borderColor: "rgba(255,255,255,0.30)", color: "#FFFFFF", background: "rgba(255,255,255,0.08)" }}>等级</button></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border bg-slate-50 p-1" style={{ borderColor: "#D9E9EC" }}>{hasTeamMembers ? <><button type="button" onClick={() => setClientSection("team")} className={`h-8 rounded-sm text-sm font-semibold transition ${isTeamSection ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>团队（{team.summary.customerCount}）</button><button type="button" onClick={() => setClientSection("personal")} className={`h-8 rounded-sm text-sm font-semibold transition ${!isTeamSection ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>个人</button></> : <><button type="button" onClick={() => setClientSection("personal")} className={`h-8 rounded-sm text-sm font-semibold transition ${!isTeamSection ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>个人</button><button type="button" onClick={() => setClientSection("team")} className={`h-8 rounded-sm text-sm font-semibold transition ${isTeamSection ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>团队（0）</button></>}</div>

        {!isTeamSection ? <><div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border" style={{ borderColor: "#C8DEE3", background: "#E2EEF0" }}>
          <button type="button" onClick={() => setShowPersonalRecordDetails((previous) => !previous)} aria-expanded={showPersonalRecordDetails} className="min-w-0 text-left active:opacity-70"><MetricCard label="累计交易额" value={formatAmount(clientLatestRecord?.transactionCumulative ?? null)} unit="USDT" expandable expanded={showPersonalRecordDetails} /></button>
          <button type="button" onClick={() => setShowPersonalRecordDetails((previous) => !previous)} aria-expanded={showPersonalRecordDetails} className="min-w-0 text-left active:opacity-70"><MetricCard label="本次新增交易额" value={formatAmount(clientLatestRecord?.transactionIncrement ?? null)} unit="USDT" expandable expanded={showPersonalRecordDetails} /></button>
          <MetricCard label="待返佣" value={formatAmount(clientPendingCommission)} unit="USDT" accent="#DC2626" />
          <MetricCard label="已发佣金" value={formatAmount(clientLatestRecord?.paidCommission ?? 0)} unit="USDT" accent="#B45309" />
        </div>

        {showPersonalRecordDetails && (() => {
          const records = [...clientRecords].sort((left, right) => right.registeredAt.localeCompare(left.registeredAt));
          let runningCommission = 0;
          const cumulativeCommissionByRecordId = new Map([...records].reverse().map((record) => {
            runningCommission += record.expectedCommission ?? 0;
            return [record.id, runningCommission] as const;
          }));
          return <section className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "#C8DEE3" }}>
            <div className="flex items-center justify-end border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><span className="text-[11px]" style={{ color: "#68828A" }}>再次点击交易额收起</span></div>
            {records.length === 0 ? <div className="py-4 text-center text-[11px]" style={{ color: "#789199" }}>暂无登记记录</div> : <div className="divide-y px-3" style={{ borderColor: "#EDF4F5" }}>
              <div className="grid gap-0 py-1.5 text-[8px]" style={{ gridTemplateColumns: "36px repeat(4, minmax(0, 1fr))", color: "#789199" }}><span className="border-r pr-1 text-right" style={{ borderColor: "#D9E9EC" }}>日期</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>新增交易额(U)</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>累计交易额(U)</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>新增分佣(U)</span><span className="pl-1 text-right">累计分佣(U)</span></div>
              {records.map((record) => { const expected = record.expectedCommission ?? 0; const paid = record.paidCommission ?? 0; const fullyPaid = expected > 0 && paid + 0.00000001 >= expected; const cumulativeCommission = cumulativeCommissionByRecordId.get(record.id) ?? 0; return <div key={record.id} className="grid gap-0 py-2 text-[9px] tabular-nums" style={{ gridTemplateColumns: "36px repeat(4, minmax(0, 1fr))" }}><span className="whitespace-nowrap border-r pr-1 text-right font-semibold" style={{ color: "#45636C", borderColor: "#D9E9EC" }}>{formatRecordMonthDay(record.registeredAt)}</span><span className="whitespace-nowrap border-r px-1 text-right" style={{ color: "#0F172A", borderColor: "#D9E9EC" }}>{formatAmount(record.transactionIncrement, 2)}</span><span className="whitespace-nowrap border-r px-1 text-right" style={{ color: "#0F172A", borderColor: "#D9E9EC" }}>{formatAmount(record.transactionCumulative, 2)}</span><span className="flex min-w-0 items-center justify-end gap-0.5 border-r px-1 text-right" style={{ color: "#DC2626", borderColor: "#D9E9EC" }}><span className="shrink-0 rounded-full px-1 py-px text-[7px] font-semibold leading-none text-white" style={{ background: fullyPaid ? "#059669" : "#D97706" }}>{fullyPaid ? "已发" : "待发"}</span><span className="min-w-0 truncate">{formatAmount(expected, 2)}</span></span><span className="whitespace-nowrap pl-1 text-right" style={{ color: "#DC2626" }}>{formatAmount(cumulativeCommission, 2)}</span></div>; })}
            </div>}
          </section>;
        })()}
        </> : <><div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border" style={{ borderColor: "#C8DEE3", background: "#E2EEF0" }}>
          <div className="min-w-0 px-2.5 py-2.5 text-center" style={{ background: "#FFFFFF" }}><div className="truncate text-[10px]" style={{ color: "#789199" }}>团队人数</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#173F4B" }}>{team.summary.customerCount} 人</div></div>
          <div className="min-w-0 px-2.5 py-2.5 text-center" style={{ background: "#FFFFFF" }}><div className="truncate text-[10px]" style={{ color: "#789199" }}>累计交易额(U)</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#0F172A" }}>{formatAmount(team.summary.cumulativeTurnover)}</div></div>
          <div className="min-w-0 px-2.5 py-2.5 text-center" style={{ background: "#FFFFFF" }}><div className="truncate text-[10px]" style={{ color: "#789199" }}>我的分佣(U)</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(team.summary.paidCommissionKnownTotal)}</div></div>
        </div>
        {team.customers.length > 0 && <section className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "#C8DEE3" }}>
          <div className="flex items-center justify-end border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><span className="text-[11px]" style={{ color: "#68828A" }}>点击成员展开</span></div>
          <div className="space-y-2 p-2.5">{team.customers.map((customer) => {
            const records = [...customer.records].sort((left, right) => right.registeredAt.localeCompare(left.registeredAt));
            let runningCommission = 0;
            const cumulativeCommissionByRecordId = new Map([...records].reverse().map((record) => {
              runningCommission += record.expectedCommission ?? 0;
              return [record.id, runningCommission] as const;
            }));
            const latest = records[0] || customer.latestRegistration;
            const detailOpen = expandedTeamMemberUserId === customer.userId;
            const latestTurnover = latest?.transactionCumulative ?? 0;
            return <div key={customer.userId} className="overflow-hidden rounded border bg-white shadow-sm" style={{ borderColor: "#D7E6E9" }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <div className="min-w-0 border-r px-1 py-2 text-center" style={{ borderColor: "#E2EEF0" }}><div className="truncate text-[9px] leading-tight" style={{ color: "#94a3b8" }}>用户名（{getOkxVipTierShortLabel(customer.vipTier)}）</div><div className="mt-0.5 truncate text-[11px] font-bold leading-tight" style={{ color: "#0f172a" }}>{customer.username || customer.customerName}</div></div>
                <div className="min-w-0 border-r px-1 py-2 text-center" style={{ borderColor: "#E2EEF0" }}><div className="truncate text-[9px] leading-tight" style={{ color: "#94a3b8" }}>分佣比例（我）</div><div className="mt-0.5 truncate text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(customer.allocationPct, 2)}%</div></div>
                <button type="button" onClick={() => setExpandedTeamMemberUserId((previous) => previous === customer.userId ? null : customer.userId)} aria-expanded={detailOpen} className="min-w-0 border-r px-1 py-2 text-center active:opacity-70" style={{ borderColor: "#E2EEF0" }}><span className="block truncate text-[9px] leading-tight" style={{ color: "#94a3b8" }}>累计交易额(U)</span><span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#0F172A" }}>{formatAmount(latestTurnover, 2)}</span></button>
                <button type="button" onClick={() => setExpandedTeamMemberUserId((previous) => previous === customer.userId ? null : customer.userId)} aria-expanded={detailOpen} className="min-w-0 px-1 py-2 text-center active:opacity-70"><span className="block truncate text-[9px] leading-tight" style={{ color: "#94a3b8" }}>我的分佣(U)</span><span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(customer.paidCommissionKnownTotal, 2)}</span></button>
              </div>
              {detailOpen && <div className="border-t px-3 py-3" style={{ borderColor: "#E2EEF0", background: "#F8FCFC" }}>
                <div className="mb-2"><span className="text-[11px] font-semibold" style={{ color: "#45636C" }}>登记记录</span></div>
                {records.length === 0 ? <div className="py-2 text-center text-[11px]" style={{ color: "#789199" }}>暂无登记记录</div> : <div className="divide-y border-t" style={{ borderColor: "#D9E9EC" }}>
                  <div className="grid gap-0 py-1.5 text-[8px]" style={{ gridTemplateColumns: "36px repeat(4, minmax(0, 1fr))", color: "#789199" }}><span className="border-r pr-1 text-right" style={{ borderColor: "#D9E9EC" }}>日期</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>新增交易额(U)</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>累计交易额(U)</span><span className="border-r px-1 text-right" style={{ borderColor: "#D9E9EC" }}>新增分佣(U)</span><span className="pl-1 text-right">累计分佣(U)</span></div>
                  {records.map((record) => { const expected = record.expectedCommission ?? 0; const paid = record.paidCommission ?? 0; const fullyPaid = expected > 0 && paid + 0.00000001 >= expected; const cumulativeCommission = cumulativeCommissionByRecordId.get(record.id) ?? 0; return <div key={record.id} className="grid gap-0 py-2 text-[9px] tabular-nums" style={{ gridTemplateColumns: "36px repeat(4, minmax(0, 1fr))" }}><span className="whitespace-nowrap border-r pr-1 text-right font-semibold" style={{ color: "#45636C", borderColor: "#D9E9EC" }}>{formatRecordMonthDay(record.registeredAt)}</span><span className="whitespace-nowrap border-r px-1 text-right" style={{ color: "#0F172A", borderColor: "#D9E9EC" }}>{formatAmount(record.transactionIncrement, 2)}</span><span className="whitespace-nowrap border-r px-1 text-right" style={{ color: "#0F172A", borderColor: "#D9E9EC" }}>{formatAmount(record.transactionCumulative, 2)}</span><span className="flex min-w-0 items-center justify-end gap-0.5 border-r px-1 text-right" style={{ color: "#DC2626", borderColor: "#D9E9EC" }}><span className="shrink-0 rounded-full px-1 py-px text-[7px] font-semibold leading-none text-white" style={{ background: fullyPaid ? "#059669" : "#D97706" }}>{fullyPaid ? "已发" : "待发"}</span><span className="min-w-0 truncate">{formatAmount(expected, 2)}</span></span><span className="whitespace-nowrap pl-1 text-right" style={{ color: "#DC2626" }}>{formatAmount(cumulativeCommission, 2)}</span></div>; })}
                </div>}
              </div>}
            </div>;
          })}</div>
        </section>}</>}

        {rebateRuleDialog}
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="OKX交易所佣金业务管理">
      <div className="overflow-hidden rounded-md border shadow-sm" style={{ borderColor: "#B9D8DE", background: "linear-gradient(135deg, #1D4E5C, #315D84)" }}>
        <div className="flex items-center gap-3 px-4 py-4 text-white">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border text-lg font-bold" style={{ borderColor: "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.12)" }}>C</div>
          <div className="flex-1" />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"><button type="button" onClick={() => setShowRebateRules(true)} className="rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold active:opacity-70" style={{ borderColor: "rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.1)", color: "#FFFFFF" }}>等级</button><button type="button" onClick={openPayoutDialog} className="rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold active:opacity-70" style={{ borderColor: "rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.1)", color: "#FFFFFF" }}>发放佣金</button><button type="button" onClick={() => setShowViewAsPicker(true)} className="rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold" style={{ borderColor: "rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.1)", color: "#FFFFFF" }}>用户视角</button></div>
        </div>
        <div className="grid grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.14)" }}>
          <div className="px-3 py-2.5" style={{ background: "rgba(255,255,255,0.08)" }}><div className="text-[10px]" style={{ color: "rgba(255,255,255,0.66)" }}>登记客户</div><div className="mt-1 text-sm font-bold tabular-nums">{registeredCustomerRows.length}</div></div>
          <div className="px-3 py-2.5" style={{ background: "rgba(255,255,255,0.08)" }}><div className="text-[10px]" style={{ color: "rgba(255,255,255,0.66)" }}>无推荐人提醒</div><div className="mt-1 text-sm font-bold tabular-nums">{globalDirectoryQuery.isSuccess ? missingReferrerCount : "--"}</div></div>
          <div className="px-3 py-2.5" style={{ background: "rgba(255,255,255,0.08)" }}><div className="text-[10px]" style={{ color: "rgba(255,255,255,0.66)" }}>累计交易额</div><div className="mt-1 overflow-x-auto whitespace-nowrap text-xs font-bold tabular-nums [scrollbar-width:none]">{formatAmount(registeredCumulativeTurnover)}</div></div>
        </div>
      </div>

      <section className="space-y-2" aria-label="佣金客户登记列表">
        <div className="flex items-center justify-between px-1 py-1.5">
          <div className="flex items-center gap-2"><WalletCards className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-sm font-semibold" style={{ color: "#173F4B" }}>登记列表</span></div>
          <div className="flex items-center gap-2"><span className="text-[12px]" style={{ color: "#789199" }}>{registeredCustomerRows.length} 位客户</span><button type="button" aria-label="新增客户" onClick={openNewCustomer} className="flex h-7 w-7 items-center justify-center rounded-sm border" style={{ borderColor: "#9AC5CE", color: "#276B78", background: "#F4FBFC" }}><Plus className="h-4 w-4" /></button></div>
        </div>
        {registeredCustomerRows.length === 0 ? <div className="rounded bg-white px-4 py-7 text-center shadow-sm"><Landmark className="mx-auto h-6 w-6" style={{ color: "#9AB6BD" }} /><div className="mt-2 text-sm font-semibold" style={{ color: "#45636C" }}>暂无登记客户</div><p className="mt-1 text-xs leading-5" style={{ color: "#789199" }}>点击右上角加号，输入客户后登记 OKX UID。</p></div> : <div className="space-y-2">{registeredCustomerRows.map((row) => {
          const uidTail = row.okxUid ? row.okxUid.slice(-4) : "----";
          const isOpen = selectedRegisteredUserId === row.userId;
          const openCustomer = () => openRegisteredCustomer(row);
          const teamSummary = row.teamSummary || { customerCount: 0, cumulativeTurnover: 0, expectedCommissionTotal: 0, totalExpectedCommission: row.personalExpectedCommissionTotal || 0, members: [] };
          return <div key={row.userId} className="overflow-hidden rounded bg-white shadow-sm">
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setUidDisclosure(row)} aria-label={`查看${row.customerName}的返佣分配`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#fff" }}><span className="max-w-full truncate text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>用户名（{getOkxVipTierShortLabel(row.vipTier)}）</span><span className="w-full truncate text-center text-[11px] font-bold leading-tight" style={{ color: "#0f172a" }}>{row.username || row.customerName}</span></button>
              <button type="button" onClick={() => setUidDisclosure(row)} aria-label={`查看${row.customerName}的返佣分配与OKX UID`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#fff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>OKX UID</span><span className="w-full truncate text-center font-mono text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#276B78" }}>{uidTail}</span></button>
              <button type="button" onClick={() => setTeamDisclosure(row)} aria-label={`查看${row.customerName}的团队成员`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#f8fbff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>团队人数</span><span className="w-full truncate text-center text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#334155" }}>{teamSummary.customerCount}人</span></button>
              <button type="button" onClick={() => openCommissionStats(row)} aria-label={`查看${row.customerName}的月度返佣统计`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ background: "#fff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>合计返佣(U)</span><span className="w-full truncate text-center text-[11px] font-bold leading-tight tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(teamSummary.totalExpectedCommission, 2)}</span></button>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <button type="button" onClick={openCustomer} aria-expanded={isOpen} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#fff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>个人累计交易额(U)</span><span className="w-full truncate text-center text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#B45309" }}>{formatAmount(row.cumulativeTurnover ?? 0, 2)}</span></button>
              <button type="button" onClick={() => setPersonalCommissionDisclosure(row)} aria-label={`查看${row.customerName}的个人返佣记录`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#fff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>个人累计返佣(U)</span><span className="w-full truncate text-center text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(row.personalExpectedCommissionTotal, 2)}</span></button>
              <button type="button" onClick={() => setTeamDisclosure(row)} aria-label={`查看${row.customerName}的团队成员`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ borderRight: "1px solid #e2e8f0", background: "#f8fbff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>团队累计交易额(U)</span><span className="w-full truncate text-center text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#B45309" }}>{formatAmount(teamSummary.cumulativeTurnover, 2)}</span></button>
              <button type="button" onClick={() => setTeamDisclosure(row)} aria-label={`查看${row.customerName}的团队成员`} className="flex flex-col items-center px-1 py-1.5 active:opacity-70" style={{ background: "#fff" }}><span className="text-[9px] leading-tight mb-0.5" style={{ color: "#94a3b8" }}>团队累计返佣(U)</span><span className="w-full truncate text-center text-[11px] font-semibold leading-tight tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(teamSummary.expectedCommissionTotal, 2)}</span></button>
            </div>
          </div>;
        })}</div>}      </section>

      {uidDisclosure && (() => {
        const allocationTotal = uidDisclosure.allocationSnapshot.reduce((sum, allocation) => sum + (numberOrNull(allocation.percentage) ?? 0), 0);
        const visibleAllocations = uidDisclosure.allocationSnapshot.map((allocation, index) => ({ allocation, index })).filter(({ allocation }) => (
          (numberOrNull(allocation.percentage) ?? 0) > 0 && !isAdministrativeRole(usersById.get(allocation.userId)?.role)
        ));
        return <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="返佣分配" onClick={() => setUidDisclosure(null)}>
          <section className="max-h-[82dvh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-sm sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{uidDisclosure.customerName} 的佣金设置</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>当前已保存配置 · 分配合计 100%</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { const profile = uidDisclosure; setUidDisclosure(null); editRegisteredCustomer(profile); }} className="text-[11px] font-semibold" style={{ color: "#276B78" }}>编辑分佣 / VIP</button><button type="button" onClick={() => setUidDisclosure(null)} className="p-1.5" aria-label="关闭佣金设置" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div></div>
            <div className="border-b px-4 py-3" style={{ borderColor: "#E2EEF0", background: "#F8FCFC" }}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[10px]" style={{ color: "#789199" }}>OKX UID</div><div className="mt-1 truncate font-mono text-sm font-bold tabular-nums" style={{ color: "#173F4B" }}>{uidDisclosure.okxUid}</div></div><button type="button" onClick={() => copyOkxUid(uidDisclosure.okxUid)} className="flex shrink-0 items-center gap-1 text-[11px] font-semibold" style={{ color: "#276B78" }}><Copy className="h-3.5 w-3.5" />复制</button></div></div>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0", background: "#F8FCFC" }}><span className="text-xs" style={{ color: "#68828A" }}>VIP 等级</span><span className="text-sm font-bold" style={{ color: "#173F4B" }}>{getOkxVipTierOption(uidDisclosure.vipTier).label}</span></div>
            <div className="max-h-[54dvh] overflow-y-auto px-4 py-3"><div className="mb-2 flex items-center gap-2"><Network className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-xs font-semibold" style={{ color: "#173F4B" }}>收益返佣 100% 分配</span></div>{visibleAllocations.length === 0 ? <div className="rounded-md border px-3 py-6 text-center text-xs" style={{ borderColor: "#E2EEF0", color: "#789199" }}>暂无已分配的返佣对象</div> : <div className="overflow-hidden rounded-md border" style={{ borderColor: "#E2EEF0" }}>{visibleAllocations.map(({ allocation, index }) => { const isSelf = allocation.userId === uidDisclosure.userId; return <div key={`${allocation.userId}-${index}`} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0" style={{ borderColor: "#EDF4F5" }}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: isSelf ? "#276B78" : "#E2EEF0", color: isSelf ? "#FFFFFF" : "#45636C" }}>{isSelf ? "本" : index}</span><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold" style={{ color: "#173F4B" }}>{allocation.name}</div><div className="mt-0.5 truncate text-[10px]" style={{ color: "#789199" }}>{isSelf ? "本人" : `推荐链上级 · 第${index}级`}</div></div><div className="shrink-0 text-right"><div className="text-[10px]" style={{ color: "#789199" }}>分配比例</div><div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(numberOrNull(allocation.percentage) ?? 0, 2)}%</div></div></div>; })}<div className="flex items-center justify-between px-3 py-2.5" style={{ background: "#F8FCFC" }}><span className="text-xs" style={{ color: "#68828A" }}>分配合计</span><span className="text-sm font-bold tabular-nums" style={{ color: Math.abs(allocationTotal - 100) < 0.001 ? "#047857" : "#DC2626" }}>{formatAmount(allocationTotal, 2)}%</span></div></div>}</div>
          </section>
        </div>;
      })()}

      {personalCommissionDisclosure && (() => {
        const records = [...personalCommissionDisclosure.records].reverse();
        const expectedTotal = records.reduce((sum, record) => sum + (numberOrNull(record.expectedCommission) ?? 0), 0);
        const paidTotal = records.reduce((sum, record) => sum + (numberOrNull(record.paidCommission) ?? 0), 0);
        const unpaidTotal = records.reduce((sum, record) => {
          const expected = numberOrNull(record.expectedCommission) ?? 0;
          const paid = numberOrNull(record.paidCommission) ?? 0;
          return sum + Math.max(expected - paid, 0);
        }, 0);
        return <div className="fixed inset-0 z-[106] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="个人返佣记录" onClick={() => setPersonalCommissionDisclosure(null)}>
          <section className="max-h-[82dvh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-md sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{personalCommissionDisclosure.customerName} 的个人返佣记录</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>共 {records.length} 笔已登记记录</div></div><button type="button" onClick={() => setPersonalCommissionDisclosure(null)} className="p-1.5" aria-label="关闭个人返佣记录" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-3 gap-px border-b" style={{ borderColor: "#E2EEF0", background: "#E2EEF0" }}><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>累计返佣</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(expectedTotal, 2)}</div></div><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>累计已返</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#B45309" }}>{formatAmount(paidTotal, 2)}</div></div><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>累计未返</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#047857" }}>{formatAmount(unpaidTotal, 2)}</div></div></div>
            <div className="max-h-[55dvh] overflow-y-auto">{records.length === 0 ? <div className="px-4 py-9 text-center"><History className="mx-auto h-6 w-6" style={{ color: "#9AB6BD" }} /><div className="mt-2 text-sm font-semibold" style={{ color: "#45636C" }}>暂无返佣记录</div><p className="mt-1 text-xs leading-5" style={{ color: "#789199" }}>登记交易额后，会在这里逐笔显示返佣情况。</p></div> : <div className="divide-y" style={{ borderColor: "#EDF4F5" }}>{records.map((record) => { const expected = numberOrNull(record.expectedCommission) ?? 0; const paid = numberOrNull(record.paidCommission) ?? 0; const unpaid = Math.max(expected - paid, 0); return <div key={record.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold tabular-nums" style={{ color: "#173F4B" }}>{record.registeredAt.replace("T", " ")}</span><span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "#45636C" }}>登记 {formatAmount(record.transactionIncrement, 2)} U</span></div><div className="mt-2 grid grid-cols-3 divide-x border-t pt-2.5" style={{ borderColor: "#E2EEF0" }}>{[["当时返佣", expected, "#DC2626"], ["已返佣", paid, "#B45309"], ["未返佣", unpaid, "#047857"]].map(([label, amount, color]) => <div key={String(label)} className="min-w-0 px-2 first:pl-0 last:pr-0"><div className="truncate text-[10px]" style={{ color: "#789199" }}>{label}</div><div className="mt-1 truncate text-[12px] font-bold tabular-nums" style={{ color: String(color) }}>{formatAmount(Number(amount), 2)}<span className="ml-0.5 text-[9px] font-medium" style={{ color: "#789199" }}>U</span></div></div>)}</div></div>; })}</div>}</div>
          </section>
        </div>;
      })()}

      {commissionStatsDisclosure && (() => {
        const earliestMonth = commissionStatsDisclosure.monthlyCommission[0]?.month || currentMonthKey();
        const monthStats = commissionStatsDisclosure.monthlyCommission.find((entry) => entry.month === commissionStatsMonth) || {
          month: commissionStatsMonth,
          personalExpectedCommissionTotal: 0,
          teamExpectedCommissionTotal: 0,
          totalExpectedCommission: 0,
        };
        const chartMax = Math.max(monthStats.personalExpectedCommissionTotal, monthStats.teamExpectedCommissionTotal, 1);
        const personalBarHeight = monthStats.personalExpectedCommissionTotal <= 0 ? 3 : Math.max(12, Math.round(monthStats.personalExpectedCommissionTotal / chartMax * 100));
        const teamBarHeight = monthStats.teamExpectedCommissionTotal <= 0 ? 3 : Math.max(12, Math.round(monthStats.teamExpectedCommissionTotal / chartMax * 100));
        const canGoPrevious = commissionStatsMonth > earliestMonth;
        const canGoNext = commissionStatsMonth < currentMonthKey();
        return <div className="fixed inset-0 z-[108] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="月度返佣统计" onClick={() => setCommissionStatsDisclosure(null)}>
          <section className="w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-sm sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{commissionStatsDisclosure.customerName} 的返佣统计</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>按每笔登记时冻结的分配快照统计</div></div><button type="button" onClick={() => setCommissionStatsDisclosure(null)} className="p-1.5" aria-label="关闭月度返佣统计" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0", background: "#F8FCFC" }}><button type="button" disabled={!canGoPrevious} onClick={() => setCommissionStatsMonth((month) => shiftMonthKey(month, -1))} className="flex h-8 w-8 items-center justify-center rounded-sm disabled:opacity-30" aria-label="上一个月" style={{ color: "#276B78", background: "#FFFFFF" }}><ChevronRight className="h-4 w-4 rotate-180" /></button><span className="text-sm font-semibold tabular-nums" style={{ color: "#173F4B" }}>{formatMonthLabel(commissionStatsMonth)}</span><button type="button" disabled={!canGoNext} onClick={() => setCommissionStatsMonth((month) => shiftMonthKey(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-sm disabled:opacity-30" aria-label="下一个月" style={{ color: "#276B78", background: "#FFFFFF" }}><ChevronRight className="h-4 w-4" /></button></div>
            <div className="p-4"><div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border" style={{ borderColor: "#E2EEF0", background: "#E2EEF0" }}><div className="px-2.5 py-2.5" style={{ background: "#FFFFFF" }}><div className="text-[10px]" style={{ color: "#789199" }}>个人返佣</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(monthStats.personalExpectedCommissionTotal, 2)}</div></div><div className="px-2.5 py-2.5" style={{ background: "#FFFFFF" }}><div className="text-[10px]" style={{ color: "#789199" }}>团队返佣</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#BE123C" }}>{formatAmount(monthStats.teamExpectedCommissionTotal, 2)}</div></div><div className="px-2.5 py-2.5" style={{ background: "#FFFFFF" }}><div className="text-[10px]" style={{ color: "#789199" }}>合计返佣</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(monthStats.totalExpectedCommission, 2)}</div></div></div><div className="mt-4 overflow-hidden rounded-md border px-3 pb-2 pt-3" style={{ borderColor: "#E2EEF0", background: "#FFFFFF" }}><div className="mb-1 text-[11px] font-semibold" style={{ color: "#45636C" }}>个人与团队返佣对比</div><div className="grid grid-cols-[42px_1fr] gap-2"><div className="flex h-32 flex-col justify-between py-1 text-right text-[9px] tabular-nums" style={{ color: "#789199" }}><span>{formatAmount(chartMax, 2)}</span><span>0.00</span></div><div className="relative flex h-32 items-end justify-around border-b" style={{ borderColor: "#94A3B8" }}><div className="flex h-full w-24 flex-col items-center justify-end"><span className="mb-1 text-[10px] font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(monthStats.personalExpectedCommissionTotal, 2)}</span><div className="w-10 rounded-t-sm" style={{ height: `${personalBarHeight}%`, background: "#DC2626" }} /></div><div className="flex h-full w-24 flex-col items-center justify-end"><span className="mb-1 text-[10px] font-bold tabular-nums" style={{ color: "#BE123C" }}>{formatAmount(monthStats.teamExpectedCommissionTotal, 2)}</span><div className="w-10 rounded-t-sm" style={{ height: `${teamBarHeight}%`, background: "#BE123C" }} /></div></div></div><div className="ml-[50px] mt-1 grid grid-cols-2 text-center text-[11px] font-semibold" style={{ color: "#45636C" }}><span>个人返佣</span><span>团队返佣</span></div></div><p className="mt-3 text-[11px] leading-5" style={{ color: "#789199" }}>本月数据按该客户及其团队每笔登记时保存的返佣分配计算；之后调整比例不会改写历史月份。</p></div>
          </section>
        </div>;
      })()}

            {teamDisclosure && <div className="fixed inset-0 z-[105] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="团队成员明细" onClick={() => setTeamDisclosure(null)}>
        <section className="max-h-[82dvh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-md sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{teamDisclosure.customerName} 的团队</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>按已冻结返佣分配汇总</div></div><button type="button" onClick={() => setTeamDisclosure(null)} className="p-1.5" aria-label="关闭团队成员明细" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-3 gap-px border-b" style={{ borderColor: "#E2EEF0", background: "#E2EEF0" }}><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>团队人数</div><div className="mt-1 text-sm font-bold tabular-nums" style={{ color: "#173F4B" }}>{teamDisclosure.teamSummary.customerCount}人</div></div><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>团队交易额</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#B45309" }}>{formatAmount(teamDisclosure.teamSummary.cumulativeTurnover, 2)}</div></div><div className="px-3 py-2.5" style={{ background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>团队返佣</div><div className="mt-1 truncate text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(teamDisclosure.teamSummary.expectedCommissionTotal, 2)}</div></div></div>
          <div className="max-h-[55dvh] overflow-y-auto">{teamDisclosure.teamSummary.members.length === 0 ? <div className="px-4 py-9 text-center"><Network className="mx-auto h-6 w-6" style={{ color: "#9AB6BD" }} /><div className="mt-2 text-sm font-semibold" style={{ color: "#45636C" }}>暂无团队成员</div><p className="mt-1 text-xs leading-5" style={{ color: "#789199" }}>下级产生登记并冻结分配给该用户后，会在这里显示。</p></div> : <div className="divide-y" style={{ borderColor: "#EDF4F5" }}>{teamDisclosure.teamSummary.members.map((member) => <div key={member.userId} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{member.customerName}</div>{member.username && <div className="mt-0.5 truncate text-[11px]" style={{ color: "#789199" }}>@{member.username}</div>}</div><div className="shrink-0 text-right"><div className="text-[10px]" style={{ color: "#789199" }}>累计交易额</div><div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "#B45309" }}>{formatAmount(member.cumulativeTurnover, 2)}<span className="ml-1 text-[9px] font-medium" style={{ color: "#789199" }}>U</span></div></div></div><div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px]" style={{ borderColor: "#EDF4F5" }}><span style={{ color: "#789199" }}>自动分配给上级的累计返佣</span><span className="font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(member.expectedCommissionTotal, 2)} U</span></div></div>)}</div>}</div>
        </section>
      </div>}

      {showViewAsPicker && <div className="fixed inset-0 z-[110] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="切换用户视角" onClick={() => setShowViewAsPicker(false)}>
        <section className="max-h-[78vh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-md sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="flex items-center gap-2"><UserPlus className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-sm font-semibold" style={{ color: "#173F4B" }}>选择用户视角</span></div><button type="button" onClick={() => setShowViewAsPicker(false)} className="p-1.5" aria-label="关闭用户视角选择" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
          <div className="max-h-[62vh] overflow-y-auto px-4 py-3">{globalDirectoryQuery.isLoading ? <div className="py-8 text-center text-xs" style={{ color: "#789199" }}>正在读取可切换客户…</div> : viewAsMembers.length === 0 ? <div className="py-8 text-center text-xs" style={{ color: "#789199" }}>暂无可切换客户</div> : <div className="grid grid-cols-2 border-y" style={{ borderColor: "#E2EEF0" }} aria-label="用户视角列表">{viewAsMembers.map(({ member, cumulativeTurnover }, index) => <button key={member.userId} type="button" onClick={() => enterUserView(member)} title={member.name} className={`flex h-14 min-w-0 flex-col items-center justify-center px-2 text-center transition active:opacity-70 ${index % 2 === 0 ? "border-r" : ""} ${index + 2 < viewAsMembers.length ? "border-b" : ""}`} style={{ borderColor: "#E2EEF0", background: "#FFFFFF", color: "#173F4B" }}><span className="flex max-w-full items-center justify-center gap-1"><span className="max-w-[58%] truncate text-xs font-semibold">{member.name}</span>{member.username && <span className="max-w-[38%] truncate text-[10px]" style={{ color: "#789199" }}>@{member.username}</span>}</span><span className="mt-0.5 max-w-full truncate text-[10px] tabular-nums" style={{ color: "#45636C" }}>交易量 {formatAmount(cumulativeTurnover)} U</span></button>)}</div>}</div>
        </section>
      </div>}

      {showRegistration && <section className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "#C8DEE3" }}><div className="space-y-3 p-4">
        <div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#89A3AA" }} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="搜索全局用户" className="h-10 w-full rounded-md border bg-white pl-9 pr-9 text-sm outline-none" style={{ borderColor: "#B9D8DE", color: "#173F4B" }} />{memberSearch && <button type="button" aria-label="清除客户搜索" onClick={() => setMemberSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: "#789199" }}><X className="h-4 w-4" /></button>}</div></div>
        {memberSearch.trim() && <div className="max-h-40 overflow-y-auto rounded-md border" style={{ borderColor: "#E2EEF0" }}>{globalDirectoryQuery.isLoading ? <div className="px-3 py-4 text-center text-xs" style={{ color: "#789199" }}>正在读取全局用户与推荐关系…</div> : filteredMembers.length === 0 ? <div className="px-3 py-4 text-center text-xs" style={{ color: "#789199" }}>未找到可选择的用户</div> : filteredMembers.map((member) => { const active = member.userId === selectedUserId; const noReferrer = member.globalUser && numberOrNull(member.globalUser.invitedByUserId) === null; const alreadyInLedger = members.some((ledgerMember) => ledgerMember.userId === member.userId); const nickname = firstText(member.globalUser?.name, member.name, member.username, "未命名客户"); const username = firstText(member.globalUser?.username, member.username, "未设置用户名"); return <button key={member.userId} type="button" onClick={() => selectMember(member)} className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left last:border-b-0" style={{ borderColor: "#EDF4F5", background: active ? "#F0F9FA" : "#FFFFFF" }}><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold" style={{ background: active ? "#276B78" : "#E2EEF0", color: active ? "#FFFFFF" : "#45636C" }}>{member.globalUser?.avatar ? <img src={member.globalUser.avatar} alt="用户头像" className="h-full w-full object-cover" /> : nickname.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" style={{ color: "#173F4B" }}>{nickname}</span><span className="block truncate text-[11px]" style={{ color: "#789199" }}>@{username} · 推荐码 {referrerInviteCode(member.globalUser, usersById)}</span></span>{noReferrer ? <StatusPill tone="warn">无推荐人</StatusPill> : active ? <StatusPill tone="ok">已选</StatusPill> : alreadyInLedger ? <StatusPill>已入账本</StatusPill> : <StatusPill tone="ok">保存后加入</StatusPill>}</button>; })}</div>}
        {selectedMember && <>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-md border px-3 py-2.5" style={{ borderColor: "#D9E9EC", background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>邀请人推荐码</div><div className="mt-1 text-sm font-bold tabular-nums" style={{ color: "#173F4B" }}>{referrerInviteCode(selectedGlobalUser, usersById)}</div></div><div className="rounded-md border px-3 py-2.5" style={{ borderColor: "#D9E9EC", background: "#F8FCFC" }}><div className="text-[10px]" style={{ color: "#789199" }}>平台</div><div className="mt-1 text-sm font-bold" style={{ color: "#173F4B" }}>OKX</div></div></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>OKX UID</span><input value={okxUid} onChange={(event) => setOkxUid(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" maxLength={20} placeholder="17–20位数字" className="h-10 w-full rounded-md border px-3 font-mono text-sm outline-none" style={{ borderColor: "#B9D8DE", color: "#173F4B" }} /></label><label className="block"><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>OKX 登录账号（选填）</span><input value={okxLogin} onChange={(event) => setOkxLogin(event.target.value)} placeholder="选填，不收密码" className="h-10 w-full rounded-md border px-3 text-sm outline-none" style={{ borderColor: "#B9D8DE", color: "#173F4B" }} /></label></div>
          <label className="block"><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>VIP 等级</span><div className="flex h-10 items-center gap-2 rounded-md border bg-white px-3" style={{ borderColor: "#B9D8DE" }}><select value={vipTier} onChange={(event) => setVipTier(normalizeOkxVipTier(event.target.value))} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" style={{ color: "#173F4B" }}>{OKX_VIP_TIER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="shrink-0 text-[10px] tabular-nums" style={{ color: "#789199" }}>挂单返佣 {getOkxVipTierOption(vipTier).rebateRateLabel}</span></div></label>
          <div className="overflow-hidden rounded-md border" style={{ borderColor: "#C8DEE3" }}><div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "#E2EEF0" }}><Network className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-sm font-semibold" style={{ color: "#173F4B" }}>全局推荐链与返佣分配</span></div><div className="space-y-3 p-3"><div className="flex items-start gap-2 rounded-md px-3 py-2.5" style={{ background: referral.status === "ready" ? "#F0FDF9" : "#FFF7ED" }}>{referral.status === "ready" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#047857" }} /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#C2410C" }} />}<div className="min-w-0"><div className="text-xs font-semibold" style={{ color: referral.status === "ready" ? "#047857" : "#9A5B13" }}>{referral.status === "loading" ? "正在读取全局推荐关系" : referralNotice()}</div><div className="mt-0.5 text-[11px] leading-4" style={{ color: referral.status === "ready" ? "#37856F" : "#9A6F36" }}>{hasSelectedCustomerProfile ? "可调整比例并重新保存；已登记历史保持不变。" : "新增客户必须将100%返佣比例分配完毕后才能保存。"}</div></div></div>{canConfigureReferrer && <div className="space-y-2 rounded-md border px-3 py-3" style={{ borderColor: "#F6C98B", background: "#FFF9ED" }}><div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#C2410C" }} /><div className="min-w-0"><div className="text-xs font-semibold" style={{ color: "#9A5B13" }}>{directReferrer ? "调整全局直接上级" : "该客户尚未设置全局推荐人"}</div><div className="mt-0.5 text-[11px] leading-4" style={{ color: "#9A6F36" }}>{directReferrer ? `当前直接上级：${displayUser(directReferrer)}。选择新用户并确认后才会更新全局推荐树。` : "可直接搜索现有用户并设为推荐人，保存后即可在下方分配返佣比例。"}</div></div></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#A67D3C" }} /><input value={referrerSearch} onChange={(event) => { setReferrerSearch(event.target.value); setSelectedQuickReferrerUserId(null); }} placeholder="搜索姓名、用户名或推荐码" className="h-9 w-full rounded-md border bg-white pl-9 pr-3 text-xs outline-none" style={{ borderColor: "#E7C989", color: "#173F4B" }} /></div>{referrerSearch.trim() && !selectedQuickReferrer && <div className="max-h-32 overflow-y-auto rounded-md border bg-white" style={{ borderColor: "#E7D7B5" }}>{referrerCandidates.length === 0 ? <div className="px-3 py-3 text-center text-[11px]" style={{ color: "#9A6F36" }}>未找到匹配的全局用户</div> : referrerCandidates.map((user) => <button key={user.id} type="button" onClick={() => { setSelectedQuickReferrerUserId(user.id); setReferrerSearch(firstText(user.name, user.username)); }} className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0" style={{ borderColor: "#F2E5CA", color: "#173F4B" }}><span className="min-w-0 truncate font-semibold">{displayUser(user)}</span><span className="shrink-0 text-[10px]" style={{ color: "#9A6F36" }}>推荐码 {user.inviteCode || "—"}</span></button>)}</div>}{selectedQuickReferrer && <div className="flex items-center justify-between gap-2 rounded-sm border bg-white px-3 py-2"><span className="min-w-0 truncate text-xs" style={{ color: "#173F4B" }}>设为直接上级：<strong>{displayUser(selectedQuickReferrer)}</strong></span><button type="button" onClick={() => { setSelectedQuickReferrerUserId(null); setReferrerSearch(""); }} className="shrink-0 text-[11px] font-semibold" style={{ color: "#276B78" }}>更换</button></div>}<button type="button" disabled={!selectedMember || !selectedQuickReferrer || updateGlobalReferrerMutation.isPending} onClick={() => { if (selectedMember && selectedQuickReferrer) updateGlobalReferrerMutation.mutate({ userId: selectedMember.userId, referrerId: selectedQuickReferrer.id }); }} className="flex h-9 w-full items-center justify-center rounded-sm text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45" style={{ background: "#A16207" }}>{updateGlobalReferrerMutation.isPending ? "设置中…" : directReferrer ? "确认更新上级" : "确认设为推荐人"}</button></div>}{distributionUsers.length > 0 && <div className="overflow-hidden rounded-md border" style={{ borderColor: "#E2EEF0" }}>{distributionUsers.map((user, index) => <div key={user.id} className="flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: "#EDF4F5" }}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: index === 0 ? "#276B78" : "#E2EEF0", color: index === 0 ? "#FFFFFF" : "#45636C" }}>{index === 0 ? "本" : index}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold" style={{ color: "#173F4B" }}>{displayUser(user)}</span><span className="block truncate text-[10px]" style={{ color: "#789199" }}>{index === 0 ? "交易来源客户" : `第${index}级上级 · 推荐码 ${user.inviteCode || "—"}`}</span></span><label className="flex h-8 w-[82px] items-center rounded-sm border bg-white px-2" style={{ borderColor: "#B9D8DE" }}><input aria-label={`${displayUser(user)}分配比例`} value={allocations[user.id] ?? "0"} onChange={(event) => setAllocations((previous) => ({ ...previous, [user.id]: event.target.value }))} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold outline-none" style={{ color: "#173F4B" }} /><span className="ml-1 text-[10px]" style={{ color: "#789199" }}>%</span></label></div>)}<div className="flex items-center justify-between px-3 py-2" style={{ background: "#F8FCFC" }}><span className="text-xs" style={{ color: "#68828A" }}>分配合计</span><span className="text-xs font-bold tabular-nums" style={{ color: Math.abs(allocationTotal - 100) < 0.001 ? "#047857" : allocationTotal > 100 ? "#DC2626" : "#B45309" }}>{formatAmount(allocationTotal, 1)}%</span></div></div>}</div></div>
          <button type="button" onClick={saveCustomer} disabled={!selectedGlobalUser || globalDirectoryQuery.isLoading || Math.abs(allocationTotal - 100) > 0.001 || upsertCustomerMutation.isPending} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 active:opacity-90" style={{ background: "#276B78" }}><Save className="h-4 w-4" />{upsertCustomerMutation.isPending ? "保存中…" : hasSelectedCustomerProfile ? "保存客户设置" : "确认客户设置"}</button>
        </>}
      </div></section>}

      {showSelectedCustomerDetail && <section className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "#C8DEE3" }}>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" style={{ color: "#276B78" }} /><span className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>登记 OKX 累计交易额</span></div>{selectedAccount && <button type="button" onClick={() => editRegisteredCustomer(selectedAccount)} className="flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: "#9AC5CE", color: "#276B78", background: "#F4FBFC" }}><Pencil className="h-3.5 w-3.5" />编辑客户</button>}</div>
        <div className="space-y-3 p-4"><label className="block"><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>本次登记时间</span><div className="flex h-10 min-w-0 items-center overflow-hidden rounded-md border px-3" style={{ borderColor: "#B9D8DE" }}><input type="datetime-local" value={registrationTime} onChange={(event) => setRegistrationTime(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-right text-sm outline-none" style={{ maxWidth: "100%", color: "#173F4B" }} /></div></label><label className="block"><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>累计交易额</span><div className="flex h-10 items-center rounded-md border px-3" style={{ borderColor: "#B9D8DE" }}><input value={turnoverVolume} onChange={(event) => setTurnoverVolume(event.target.value)} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent text-sm outline-none" style={{ color: "#173F4B" }} /><span className="text-[10px]" style={{ color: "#789199" }}>USDT</span></div></label><div><span className="mb-1.5 block text-xs font-medium" style={{ color: "#45636C" }}>当前VIP返佣率</span><div className="flex h-10 items-center justify-between rounded-md border px-3" style={{ borderColor: "#B9D8DE", background: "#F8FCFC" }}><span className="text-sm font-semibold tabular-nums" style={{ color: "#DC2626" }}>{currentVipTier.rebateRateLabel}</span><span className="text-[10px]" style={{ color: "#789199" }}>{currentVipTier.label} · 挂单 · 登记后进入待发清单</span></div></div><div className="overflow-hidden rounded-md border" style={{ borderColor: "#D9E9EC", background: "#F4FBFC" }}>
          <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5" style={{ borderBottom: "1px solid #D9E9EC" }}><span className="min-w-0 text-[11px]" style={{ color: "#68828A" }}>上次已登记累计</span><span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums" style={{ color: "#173F4B" }}>{formatAmount(previousCumulativeTotal)}<span className="ml-1 text-[10px] font-medium" style={{ color: "#789199" }}>USDT</span></span></div>
          <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5" style={{ borderBottom: "1px solid #D9E9EC" }}><span className="min-w-0 text-[11px]" style={{ color: "#68828A" }}>本次登记累计</span><span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums" style={{ color: "#173F4B" }}>{hasWeeklyDraft ? formatAmount(currentCumulativeTotal) : "--"}<span className="ml-1 text-[10px] font-medium" style={{ color: "#789199" }}>USDT</span></span></div>
          <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5"><span className="min-w-0 text-[11px]" style={{ color: "#68828A" }}>本次新增交易额</span><span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums" style={{ color: hasCumulativeDecrease ? "#15803D" : "#B45309" }}>{hasWeeklyDraft ? formatAmount(currentIncrementTotal) : "--"}<span className="ml-1 text-[10px] font-medium" style={{ color: "#789199" }}>USDT</span></span></div>
        </div><div className="flex items-center justify-between rounded-md border px-3 py-2.5" style={{ borderColor: "#D9E9EC", background: "#FFFFFF" }}><span className="text-xs" style={{ color: "#68828A" }}>按本次新增预计返佣</span><span className="text-sm font-bold tabular-nums" style={{ color: "#B45309" }}>{expectedCommission === null ? "--" : formatAmount(expectedCommission)}<span className="ml-1 text-[10px] font-medium" style={{ color: "#789199" }}>USDT</span></span></div>{hasCumulativeDecrease && <div className="rounded-sm px-3 py-2 text-xs leading-5" style={{ background: "#F0FDF4", color: "#15803D" }}>本次累计值低于上次登记值，请核对交易所累计数据后再登记。</div>}<button type="button" disabled={!selectedAccount || createRegistrationMutation.isPending} onClick={saveRegistration} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 active:opacity-90" style={{ background: "#276B78" }}><BadgePercent className="h-4 w-4" />{createRegistrationMutation.isPending ? "保存中…" : "保存本次登记"}</button></div>
      </section>}

      {showSelectedCustomerDetail && <section className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "#C8DEE3" }}><div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="flex items-center gap-2"><History className="h-4 w-4" style={{ color: "#276B78" }} /><span className="text-sm font-semibold" style={{ color: "#173F4B" }}>历史登记与已发佣金</span></div><span className="text-[11px]" style={{ color: "#789199" }}>{selectedRegistrationHistory.length} 笔</span></div>{selectedRegistrationHistory.length === 0 ? <div className="px-4 py-7 text-center"><Landmark className="mx-auto h-6 w-6" style={{ color: "#9AB6BD" }} /><div className="mt-2 text-sm font-semibold" style={{ color: "#45636C" }}>暂无已登记记录</div><p className="mt-1 text-xs leading-5" style={{ color: "#789199" }}>后续每次登记都会保存累计快照，并按固定挂单返佣率展示预计返佣与实际已发佣金。</p></div> : <div className="divide-y" style={{ borderColor: "#EDF4F5" }}>{[...selectedRegistrationHistory].reverse().map((entry) => <div key={entry.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold" style={{ color: "#173F4B" }}>{entry.registeredAt.replace("T", " ")}</span><span className="text-xs font-bold tabular-nums" style={{ color: "#B45309" }}>新增 {formatAmount(entry.transactionIncrement)} USDT</span></div><div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[11px]" style={{ color: "#68828A" }}><span>累计交易额：{formatAmount(entry.transactionCumulative)}</span><span className="text-right">已发 {entry.paidCommission === null ? "--" : formatAmount(entry.paidCommission)} USDT</span></div></div>)}</div>}</section>}
      {showPayoutDialog && <div className="fixed inset-0 z-[130] flex items-end bg-slate-950/45 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="待发佣金" onClick={() => { if (!issuePayoutsMutation.isPending) { setShowPayoutConfirmation(false); setShowPayoutDialog(false); } }}>
        <section className="max-h-[86dvh] w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-md sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div className="min-w-0"><div className="text-sm font-semibold" style={{ color: "#173F4B" }}>待发佣金</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>按用户勾选；进入确认后才会发放到钱包</div></div><button type="button" onClick={() => { setShowPayoutConfirmation(false); setShowPayoutDialog(false); }} disabled={issuePayoutsMutation.isPending} className="p-1.5 disabled:opacity-40" aria-label="关闭待发佣金" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
          <div className="max-h-[55dvh] overflow-y-auto px-3 py-3">{pendingPayoutsQuery.isLoading ? <div className="py-10 text-center text-sm" style={{ color: "#789199" }}>正在读取待发佣金…</div> : pendingPayoutGroups.length === 0 ? <div className="py-10 text-center"><WalletCards className="mx-auto h-7 w-7" style={{ color: "#9AB6BD" }} /><div className="mt-2 text-sm font-semibold" style={{ color: "#45636C" }}>暂无待发佣金</div><p className="mx-auto mt-1 max-w-xs text-xs leading-5" style={{ color: "#789199" }}>后续登记累计交易额后，会按当时冻结的分配比例进入这里。</p></div> : <div className="space-y-2">{pendingPayoutGroups.map((group) => { const selected = selectedPayoutUserIds.includes(group.beneficiaryUserId); return <label key={group.beneficiaryUserId} className="block overflow-hidden rounded-md border" style={{ borderColor: selected ? "#78B7C3" : "#D9E9EC", background: selected ? "#F4FBFC" : "#FFFFFF" }}><div className="flex items-center gap-3 px-3 py-3"><input type="checkbox" checked={selected} onChange={() => togglePayoutRecipient(group.beneficiaryUserId)} className="h-4 w-4 shrink-0 accent-[#276B78]" aria-label={`选择${group.beneficiaryName}的待发佣金`} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" style={{ color: "#173F4B" }}>{group.beneficiaryName}{group.beneficiaryUsername ? <span className="ml-1 text-[11px] font-normal" style={{ color: "#789199" }}>@{group.beneficiaryUsername}</span> : null}</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>待发 {group.allocationCount} 笔</div></div><div className="shrink-0 text-right"><div className="text-[10px]" style={{ color: "#789199" }}>本次可发</div><div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(group.totalAmount, 2)}<span className="ml-0.5 text-[9px] font-medium" style={{ color: "#789199" }}>U</span></div></div></div><div className="divide-y border-t" style={{ borderColor: "#EDF4F5" }}>{group.allocations.map((allocation) => <div key={allocation.allocationId} className="grid grid-cols-[66px_1fr_auto] items-center gap-2 px-3 py-2 text-[10px]" style={{ color: "#68828A" }}><span className="tabular-nums">{allocation.recordedAt || "—"}</span><span className="truncate">{allocation.sourceCustomerName}{allocation.sourceUsername ? ` @${allocation.sourceUsername}` : ""}</span><span className="text-right font-semibold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(allocation.amount, 2)} U</span></div>)}</div></label>; })}</div>}</div>
          {pendingPayoutGroups.length > 0 && <div className="border-t px-4 py-3" style={{ borderColor: "#E2EEF0", background: "#F8FCFC" }}><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs" style={{ color: "#68828A" }}>已选 {selectedPayoutGroups.length} 位 · {selectedPayoutAllocationIds.length} 笔</span><span className="text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(selectedPayoutTotal, 2)} U</span></div><button type="button" disabled={selectedPayoutAllocationIds.length === 0 || pendingPayoutsQuery.isLoading} onClick={() => setShowPayoutConfirmation(true)} className="flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 active:opacity-90" style={{ background: "#276B78" }}>进入发放确认</button></div>}
        </section>
      </div>}
      {showPayoutDialog && showPayoutConfirmation && <div className="fixed inset-0 z-[140] flex items-end bg-slate-950/55 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="确认发放佣金" onClick={() => { if (!issuePayoutsMutation.isPending) setShowPayoutConfirmation(false); }}>
        <section className="w-full overflow-hidden rounded-t-md border bg-white shadow-2xl sm:max-w-sm sm:rounded-md" style={{ borderColor: "#B9D8DE" }} onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2EEF0" }}><div><div className="text-sm font-semibold" style={{ color: "#173F4B" }}>确认发放佣金</div><div className="mt-0.5 text-[11px]" style={{ color: "#789199" }}>本操作会真实写入用户钱包</div></div><button type="button" disabled={issuePayoutsMutation.isPending} onClick={() => setShowPayoutConfirmation(false)} className="p-1.5 disabled:opacity-40" aria-label="返回待发清单" style={{ color: "#45636C" }}><X className="h-4 w-4" /></button></div>
          <div className="max-h-[45dvh] space-y-3 overflow-y-auto px-4 py-4"><p className="text-xs leading-5" style={{ color: "#45636C" }}>确认后将向以下 {selectedPayoutGroups.length} 位用户的52号USDT钱包发放佣金，并生成可追踪的发放批次和钱包流水。已发记录不会再次发放。</p><div className="overflow-hidden rounded-md border" style={{ borderColor: "#E2EEF0" }}>{selectedPayoutGroups.map((group) => <div key={group.beneficiaryUserId} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: "#EDF4F5" }}><div className="min-w-0"><div className="truncate text-xs font-semibold" style={{ color: "#173F4B" }}>{group.beneficiaryName}</div><div className="mt-0.5 text-[10px]" style={{ color: "#789199" }}>{group.allocationCount} 笔待发佣金</div></div><div className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(group.totalAmount, 2)} U</div></div>)}</div><div className="flex items-center justify-between rounded-md border px-3 py-3" style={{ borderColor: "#F4B5B5", background: "#FFF7F7" }}><span className="text-xs font-semibold" style={{ color: "#9F1D1D" }}>本次实际入账合计</span><span className="text-base font-bold tabular-nums" style={{ color: "#DC2626" }}>{formatAmount(selectedPayoutTotal, 2)} U</span></div></div>
          <div className="grid grid-cols-2 gap-2 border-t px-4 py-3" style={{ borderColor: "#E2EEF0" }}><button type="button" disabled={issuePayoutsMutation.isPending} onClick={() => setShowPayoutConfirmation(false)} className="h-10 rounded-md border text-sm font-semibold disabled:opacity-40" style={{ borderColor: "#B9D8DE", color: "#45636C", background: "#FFFFFF" }}>返回修改</button><button type="button" disabled={issuePayoutsMutation.isPending || selectedPayoutAllocationIds.length === 0} onClick={() => issuePayoutsMutation.mutate({ ledgerId: 52, allocationIds: selectedPayoutAllocationIds, clientRequestId: createClientRequestId("okxpayout") })} className="h-10 rounded-md text-sm font-semibold text-white disabled:opacity-45" style={{ background: "#B91C1C" }}>{issuePayoutsMutation.isPending ? "发放中…" : "确认发放到钱包"}</button></div>
        </section>
      </div>}
      {rebateRuleDialog}

    </section>
  );
}
