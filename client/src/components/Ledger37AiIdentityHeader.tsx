import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import AnimatedWalletLogo from "@/components/AnimatedWalletLogo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Ledger37PresentationContext, Ledger37AiViewer } from "@shared/ledger37-ai-presentation";

type AiWalletValue = { viewerUserId: number; availableCny: number | null };

/** 头像与钱包必须属于同一有效身份；不从 auth.me 借用管理员头像。 */
export function resolveLedger37AiViewer(context: Ledger37PresentationContext | undefined, viewerUserId: number): Ledger37AiViewer | null {
  if (!Number.isSafeInteger(viewerUserId) || viewerUserId <= 0
    || context?.viewerUserId !== viewerUserId || context.viewer?.userId !== viewerUserId) return null;
  return {
    userId: viewerUserId,
    username: typeof context.viewer.username === "string" ? context.viewer.username : null,
    nickname: typeof context.viewer.nickname === "string" ? context.viewer.nickname : null,
    avatar: typeof context.viewer.avatar === "string" ? context.viewer.avatar : null,
  };
}

/** 钱包沿用37号统一入口；米瓣 from 参数会清除代看，故只借用外观、不借用入口语义。 */
export function ledger37AiWalletHref(context: Ledger37PresentationContext | undefined, viewerUserId: number): string | null {
  if (!resolveLedger37AiViewer(context, viewerUserId) || typeof context?.isViewingAs !== "boolean") return null;
  return `/wallet?fromLedger=37${context.isViewingAs ? `&viewAs=${viewerUserId}` : ""}`;
}

/** 返回只放在头像菜单中；身份读取失败时仍允许返回，不触发任何数据或资金操作。 */
export function Ledger37AiAvatarMenu({ viewer, onBack }: { viewer: Ledger37AiViewer | null; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  const name = viewer?.nickname || viewer?.username || "";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={name ? `打开${name}的账户操作` : "打开账户操作"} title="点击头像：返回" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087987]">
        {viewer ? <UserAvatar key={viewer.userId} username={viewer.username} nickname={viewer.nickname} avatar={viewer.avatar} size="md" className="shrink-0" style={{ backgroundColor: "#087987" }} />
          : <span aria-label="正在读取用户头像" className="h-10 w-10 shrink-0 rounded-full border-2 border-[#DCE7F0] bg-[#F2F6FA]" />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} className="w-32 rounded-xl border-[#DCE7F0] bg-white p-1 text-[#142A3F] shadow-sm">
      <button type="button" onClick={() => { setOpen(false); onBack(); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm hover:bg-[#EAF2F7]">返回</button>
    </PopoverContent>
  </Popover>;
}

export function Ledger37AiIdentityHeaderRenderer({ context, viewerUserId, onBack, wallet, walletLoading = false, walletError = false }: {
  context?: Ledger37PresentationContext; viewerUserId: number; onBack: () => void;
  wallet?: AiWalletValue; walletLoading?: boolean; walletError?: boolean;
}) {
  const viewer = resolveLedger37AiViewer(context, viewerUserId);
  const walletHref = ledger37AiWalletHref(context, viewerUserId);
  const ownWallet = walletHref && viewer && wallet?.viewerUserId === viewerUserId ? wallet : undefined;
  const value = typeof ownWallet?.availableCny === "number" && Number.isFinite(ownWallet.availableCny) ? ownWallet.availableCny : null;
  const amount = value !== null ? `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : walletError ? "暂不可用" : walletLoading || !ownWallet ? "加载中…" : "估值待更新";
  const title = walletError && value !== null ? "钱包暂时未更新，保留最近成功显示；点击查看钱包" : "全部资产剔除冻结后的可用余额，折合人民币";
  const info = <>
    <span aria-hidden="true" className="h-[26px] w-px shrink-0 bg-[#DCE7F0]" />
    <div className="grid min-w-0 flex-1 grid-cols-[8px_minmax(0,1fr)] gap-x-0.5 gap-y-0.5 pl-1 text-left">
      <h1 className="col-span-2 col-start-1 row-start-1 break-words text-[13px] font-semibold leading-5 text-[#142A3F]">{viewer ? viewer.nickname || viewer.username || "用户" : "用户"}</h1>
      <span className="col-start-1 row-start-2 block h-5 w-5 self-end origin-bottom -translate-x-[11px] -translate-y-[3px]"><AnimatedWalletLogo /></span>
      <span className="col-start-2 row-start-2 block min-w-0 text-[13px] font-bold leading-5 text-[#087987] tabular-nums [overflow-wrap:anywhere]" data-header-wallet-balance aria-label="钱包可用余额" title={title}>{amount}</span>
      <span className="sr-only">可用余额{viewer?.username ? ` · @${viewer.username}` : ""}{walletError && value !== null ? "，最近成功值" : ""}</span>
    </div>
  </>;
  return <header aria-label="用户与钱包" className="border-b border-[#DCE7F0] bg-[#F2F6FA] text-[#61758A]" style={{ background: "#F2F6FA" }}>
    <div className="mx-auto flex max-w-[480px] items-center gap-2 px-3 py-3">
      <div data-wallet-avatar-group="true" className="inline-flex min-h-[52px] min-w-0 max-w-full flex-1 items-center gap-2 rounded-lg border border-[#DCE7F0] bg-white py-1.5 pl-2 pr-2.5 shadow-none">
        <Ledger37AiAvatarMenu key={viewerUserId} viewer={viewer} onBack={onBack} />
        {walletHref ? <a key={viewerUserId} href={walletHref} aria-label="查看此用户的钱包" title={title} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087987]">{info}</a>
          : <button type="button" disabled aria-label="钱包身份待确认" className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md opacity-60">{info}</button>}
      </div>
    </div>
  </header>;
}

export default function Ledger37AiIdentityHeader({ viewerUserId, onBack }: { viewerUserId: number; onBack: () => void }) {
  const query = trpc.ledger.getLedger37PresentationContext.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: Number.isSafeInteger(viewerUserId) && viewerUserId > 0, placeholderData: undefined, retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true },
  );
  const context = !query.error && query.isFetchedAfterMount && query.data?.viewerUserId === viewerUserId ? query.data : undefined;
  const walletQuery = trpc.ledger.getMyLedger37AiWalletValue.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: Boolean(ledger37AiWalletHref(context, viewerUserId)), placeholderData: undefined, retry: false, staleTime: 30_000, refetchOnMount: "always", refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  // 初次重新确认前不展示同key旧缓存；后台失败可保留同一用户已经确认的最近成功值。
  const wallet = ledger37AiWalletHref(context, viewerUserId) && walletQuery.isFetchedAfterMount && walletQuery.data?.viewerUserId === viewerUserId ? walletQuery.data : undefined;
  return <Ledger37AiIdentityHeaderRenderer context={context} viewerUserId={viewerUserId} onBack={onBack} wallet={wallet} walletLoading={!wallet && !walletQuery.error} walletError={Boolean(walletQuery.error)} />;
}
