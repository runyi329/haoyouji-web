import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  QrCode,
  TrendingUp,
  Wallet as WalletIcon,
  Send,
  UserRound,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { restoreLedgerViewAsState } from "../lib/authIdentity";
import { getInternalTransferPresentation } from "../lib/walletTransferPresentation";
import { getCryptoAssetIconSrc } from "../lib/cryptoAssetIcons";
import Recharge from "./Recharge";
import Withdraw from "./Withdraw";
import { AI_WALLET_SETTLEMENT_ASSETS, type AiWalletSettlementAsset } from "@shared/ai-wallet-assets";

// 从交易备注中提取世界杯球队 code（小写），如 [ES] → 'es'
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes('世界杯投注') || note.includes('订单作废-退回投注');
  if (!isWcRelated) return null;
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
  const nameToCode: Record<string, string> = {
    '西班牙': 'es', '法国': 'fr', '英格兰': 'gb-eng', '巴西': 'br', '阿根廷': 'ar',
    '葡萄牙': 'pt', '德国': 'de', '荷兰': 'nl', '挪威': 'no', '比利时': 'be',
    '哥伦比亚': 'co', '摩洛哥': 'ma', '日本': 'jp', '美国': 'us', '瑞士': 'ch',
    '乌拉圭': 'uy', '墨西哥': 'mx', '厄瓜多尔': 'ec', '克罗地亚': 'hr', '土耳其': 'tr',
    '塞内加尔': 'sn', '瑞典': 'se', '奥地利': 'at', '苏格兰': 'gb-sct', '加拿大': 'ca',
    '科特迪瓦': 'ci', '巴拉圭': 'py', '捷克': 'cz', '埃及': 'eg', '波黑': 'ba',
    '韩国': 'kr', '阿尔及利亚': 'dz', '加纳': 'gh', '澳大利亚': 'au', '突尼斯': 'tn',
    '伊朗': 'ir', '刚果民主共和国': 'cd', '南非': 'za', '沙特阿拉伯': 'sa', '巴拿马': 'pa',
    '卡塔尔': 'qa', '佛得角': 'cv', '新西兰': 'nz', '伊拉克': 'iq', '乌兹别克斯坦': 'uz',
    '库拉索': 'cw', '约旦': 'jo', '海地': 'ht',
  };
  for (const [name, code] of Object.entries(nameToCode)) {
    if (note.includes(name)) return code;
  }
  return null;
}

// ─── 黑金色系 Token ───────────────────────────────────────────
const G = {
  bg: "#0d0d0d",          // 页面底色
  card: "#141414",        // 卡片底色
  cardBorder: "rgba(201,168,76,0.22)", // 卡片边框
  gold: "#C9A84C",        // 主金色
  goldLight: "#F5D78E",   // 亮金色
  goldDim: "rgba(201,168,76,0.45)",
  goldFaint: "rgba(201,168,76,0.12)",
  white: "rgba(255,255,255,0.88)",
  whiteDim: "rgba(255,255,255,0.45)",
  whiteFaint: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.06)",
  green: "#34d399",       // 入账绿
  red: "#f87171",         // 出账红
};

type ModalType = "recharge" | "withdraw" | "cny-recharge" | "cny-withdraw" | "transfer" | "crypto-transfer-select" | null;
type WalletTransferAsset = "USDT" | "CNY" | AiWalletSettlementAsset;
type WalletAccountAsset = WalletTransferAsset | "CRYPTO";
// 数字币账户内，USDT 与其他数字资产共用一个总览；USDT 仍是默认明细口径。
type DigitalAssetHistoryCode = "USDT" | AiWalletSettlementAsset;

function getDigitalAssetDisplayDigits(assetCode: string, amount: number): number {
  if (assetCode === "USDT") return 2;
  const absoluteAmount = Math.abs(amount);
  if (absoluteAmount >= 1_000) return 2;
  if (absoluteAmount >= 1) return 4;
  if (absoluteAmount >= 0.01) return 6;
  return 8;
}

function formatDigitalAssetAmount(assetCode: string, amount: number): string {
  const maximumFractionDigits = getDigitalAssetDisplayDigits(assetCode, amount);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: assetCode === "USDT" ? 2 : 0,
    maximumFractionDigits,
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved")
    return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: G.green }} />;
  if (status === "pending" || status === "processing")
    return <Clock className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />;
  if (status === "rejected" || status === "failed")
    return <XCircle className="w-3.5 h-3.5" style={{ color: G.red }} />;
  return <Clock className="w-3.5 h-3.5" style={{ color: G.whiteDim }} />;
}

function statusText(s: string) {
  return ({ completed: "已完成", approved: "已完成", pending: "处理中", processing: "处理中", rejected: "已拒绝", failed: "已失败" } as any)[s] ?? s;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "时间未知";
  const pad = (value: number) => String(value).padStart(2, "0");
  // 钱包流水必须可审计：每一笔都展示绝对日期和时间，不使用“几天前”。
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cleanWalletFlowNote(value: unknown) {
  const note = String(value || "")
    .replace(/^\[CNY\]\s*/i, "")
    .replace(/\[站内转账\]\s*/g, "")
    // 操作身份不属于客户资金明细；保留业务动作和用户实际填写的备注即可。
    .replace(/[（(]\s*管理员[^）)]*[）)]/g, "")
    .replace(/管理员/g, "")
    .trim();
  // 未填写备注的手动调账不展示占位文案，避免把后台操作上下文暴露给客户。
  return /^(?:手动)?调账[（(]未填写备注[）)]$/.test(note) ? "" : note;
}

function hasOrderContext(note: string) {
  return /(订单|谷底|征筹|增筹|净收益|卖出|成交|结算|委托|融资)/.test(note);
}

type WalletFlowPresentation = {
  label: string;
  detail?: string;
  status?: string;
  isIn: boolean;
};

function getUsdtFlowPresentation(item: { sourceType?: string; type?: string; amount?: number; note?: string }): WalletFlowPresentation {
  const amount = Number(item.amount ?? 0);
  const isIn = amount >= 0;
  const note = cleanWalletFlowNote(item.note);
  const isInternalTransfer = String(item.note || "").includes("[站内转账]");
  if (isInternalTransfer) {
    const transfer = getInternalTransferPresentation(item.note, isIn ? "in" : "out");
    return { label: transfer?.primary || (isIn ? "站内转账收款" : "站内转账汇款"), detail: transfer?.secondary, isIn };
  }
  if (item.sourceType === "recharge") return { label: "充值到账", detail: note, isIn: true };
  if (item.sourceType === "withdraw") return { label: "提现", detail: note, isIn: false };
  if (item.sourceType === "opening") return { label: "历史期初余额", detail: note, isIn };
  if (item.sourceType === "manual") {
    return { label: isIn ? (hasOrderContext(note) ? "订单入账" : "入账") : (hasOrderContext(note) ? "订单扣除" : "扣除"), detail: note, isIn };
  }
  if (item.sourceType === "balance_history") {
    if (hasOrderContext(note)) return { label: isIn ? "订单入账" : "订单扣除", detail: note, isIn };
    const labels: Record<string, string> = { consume: "消费", refund: "退款", reward: "入账", withdraw: "提现", reward_clawback: "入账回退" };
    return { label: labels[String(item.type || "")] || "资金流水", detail: note, isIn };
  }
  return { label: isIn ? "入账" : "扣除", detail: note, isIn };
}

function getDigitalFlowPresentation(item: { eventType?: string; amount?: number; note?: string; counterpartyName?: string | null }): WalletFlowPresentation {
  const isIn = Number(item.amount ?? 0) > 0;
  switch (item.eventType) {
    case "collateral_lock":
      return { label: "担保冻结", status: "已参与联合担保", isIn: false };
    case "collateral_release":
      return { label: "担保解冻", status: "已解冻入账", isIn: true };
    case "transfer_in":
    case "transfer_out": {
      const transfer = getInternalTransferPresentation(item.note, item.eventType === "transfer_in" ? "in" : "out", item.counterpartyName);
      return {
        label: transfer?.primary || (item.eventType === "transfer_in" ? "站内转账收款" : "站内转账汇款"),
        detail: transfer?.secondary,
        status: item.eventType === "transfer_in" ? "已入账" : "已扣除",
        isIn: item.eventType === "transfer_in",
      };
    }
    default:
      return { label: isIn ? "入账" : "扣除", status: isIn ? "已入账" : "已扣除", isIn };
  }
}

type WalletFlowBadge = {
  label: string;
  color: string;
  background: string;
  border: string;
};

function getWalletFlowBadge(label: string, note: string | undefined, isIn: boolean): WalletFlowBadge {
  const context = `${label} ${note || ""}`;
  if (/股票分红|分红/.test(context)) return { label: "分红", color: "#D8B4FE", background: "rgba(168,85,247,0.13)", border: "rgba(216,180,254,0.22)" };
  if (/解担保|保证金解冻|担保解冻|解冻|释放/.test(context)) return { label: "解担保", color: "#7DD3FC", background: "rgba(56,189,248,0.12)", border: "rgba(125,211,252,0.22)" };
  if (/担保|保证金/.test(context)) return { label: "担保", color: G.goldLight, background: "rgba(201,168,76,0.12)", border: "rgba(245,215,142,0.20)" };
  if (/提现/.test(context)) return { label: "提现", color: "#FCA5A5", background: "rgba(248,113,113,0.12)", border: "rgba(252,165,165,0.20)" };
  if (/充值/.test(context)) return { label: "充值", color: "#86EFAC", background: "rgba(52,211,153,0.12)", border: "rgba(134,239,172,0.20)" };
  if (/转账|汇款|收款|站内/.test(context)) return { label: "转账", color: "#93C5FD", background: "rgba(96,165,250,0.12)", border: "rgba(147,197,253,0.20)" };
  if (/退款/.test(context)) return { label: "退款", color: "#86EFAC", background: "rgba(52,211,153,0.12)", border: "rgba(134,239,172,0.20)" };
  if (/订单/.test(context)) return { label: "订单", color: "#C4B5FD", background: "rgba(139,92,246,0.12)", border: "rgba(196,181,253,0.20)" };
  return isIn
    ? { label: "入账", color: "#86EFAC", background: "rgba(52,211,153,0.12)", border: "rgba(134,239,172,0.20)" }
    : { label: "支出", color: "#FDA4AF", background: "rgba(244,63,94,0.12)", border: "rgba(253,164,175,0.20)" };
}

function WalletFlowTypeBadge({ label, note, isIn }: { label: string; note?: string; isIn: boolean }) {
  const badge = getWalletFlowBadge(label, note, isIn);
  return <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ color: badge.color, background: badge.background, border: `1px solid ${badge.border}` }}>{badge.label}</span>;
}

type WalletOperationReceipt = {
  id: string;
  account: "CNY" | "DIGITAL";
  operation: "充值" | "提现" | "转账";
  amount: number;
  currency: WalletTransferAsset;
  status: "已完成" | "确认已提交" | "申请已提交";
  referenceNo?: string;
  balanceState: "refreshed" | "pending";
  createdAt: string;
};

function WalletOperationReceiptCard({
  receipt,
  hidden,
  onDismiss,
  onDetails,
}: {
  receipt: WalletOperationReceipt;
  hidden: boolean;
  onDismiss: () => void;
  onDetails: () => void;
}) {
  const amount = receipt.currency === "CNY"
    ? receipt.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatDigitalAssetAmount(receipt.currency, receipt.amount);
  const pending = receipt.balanceState === "pending";
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: pending ? "rgba(201,168,76,0.08)" : "rgba(52,211,153,0.08)", border: `1px solid ${pending ? "rgba(201,168,76,0.24)" : "rgba(52,211,153,0.20)"}` }}>
      {pending ? <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: G.goldLight }} /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: G.green }} />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold" style={{ color: G.white }}>{receipt.operation}{receipt.status} · {hidden ? "••••••" : `${amount} ${receipt.currency}`}</div>
        <div className="mt-0.5 text-[10px] leading-4" style={{ color: G.whiteDim }}>
          {pending ? "余额将在处理完成后自动更新" : `余额已刷新 · ${formatTime(receipt.createdAt)}`}
          {receipt.referenceNo ? ` · 编号 ${receipt.referenceNo}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[10px]">
        <button type="button" onClick={onDetails} style={{ color: G.goldLight }}>明细</button>
        <button type="button" onClick={onDismiss} style={{ color: G.whiteDim }}>关闭</button>
      </div>
    </div>
  );
}

// 底部弹窗（黑金风）
function BottomSheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div
        className="rounded-t-3xl mt-auto overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #111 0%, #1c1c1c 100%)",
          border: `1px solid ${G.cardBorder}`,
          borderBottom: "none",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: G.goldFaint }} />
        </div>
        {/* 标题行 */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${G.divider}` }}>
          <span className="text-base font-semibold" style={{ color: G.goldLight }}>{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: G.whiteFaint, color: G.whiteDim }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 金色输入框
function GoldInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string;
}) {
  return (
    <div>
      <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>{label}</div>
      <div
        className="flex items-center rounded-xl px-4 py-3"
        style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)` }}
      >
        {type === "number" && (
          <span className="text-lg font-bold mr-2" style={{ color: G.goldDim }}>¥</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none tabular-nums"
          style={{
            color: G.white,
            fontSize: type === "number" ? "1.25rem" : "0.875rem",
            fontWeight: type === "number" ? 700 : 400,
          }}
        />
      </div>
    </div>
  );
}

// 金色主按钮
function GoldBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
      style={{
        background: `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 50%, ${G.gold} 100%)`,
        boxShadow: "0 4px 16px rgba(201,168,76,0.35)",
        color: "#000",
      }}
    >{children}</button>
  );
}

// 成功状态
function SuccessState({ msg, sub, onClose }: { msg: string; sub: string; onClose: () => void }) {
  return (
    <div className="px-5 py-10 flex flex-col items-center space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
        <CheckCircle2 className="w-9 h-9" style={{ color: G.green }} />
      </div>
      <div className="text-base font-semibold" style={{ color: G.white }}>{msg}</div>
      <div className="text-sm text-center" style={{ color: G.whiteDim }}>{sub}</div>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl text-sm font-medium"
        style={{ background: G.whiteFaint, color: G.whiteDim }}
      >关闭</button>
    </div>
  );
}

// CNY 充值弹窗
function CnyRechargeContent({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <SuccessState msg="充值申请已提交" sub="请按照收款信息完成转账，到账后将自动更新余额" onClose={onClose} />;

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      {/* 收款信息卡 */}
      <div className="rounded-2xl p-4 space-y-2.5" style={{ background: G.goldFaint, border: `1px solid rgba(201,168,76,0.25)` }}>
        <div className="text-xs font-semibold mb-1" style={{ color: G.goldDim }}>收款信息</div>
        {[
          { label: "收款账户", value: "招商银行 6214 **** **** 8888" },
          { label: "收款人", value: "张三" },
          { label: "转账备注", value: "请务必填写您的用户ID" },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span style={{ color: G.whiteDim }}>{label}</span>
            <span style={{ color: G.white, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      <GoldInput label="充值金额（元）" value={amount} onChange={setAmount} placeholder="0.00" type="number" />
      <GoldInput label="备注（可选）" value={note} onChange={setNote} placeholder="如有特殊说明请填写" />

      <GoldBtn onClick={() => {
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { alert("请输入有效金额"); return; }
        setSubmitted(true);
      }}>提交充值申请</GoldBtn>
    </div>
  );
}

// CNY 提现弹窗
function CnyWithdrawContent({ cnyBalance, onClose }: { cnyBalance: number; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <SuccessState msg="提现申请已提交" sub="预计 1-3 个工作日到账" onClose={onClose} />;

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      {/* 可用余额 */}
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.15)` }}
      >
        <span className="text-sm" style={{ color: G.whiteDim }}>可用余额</span>
        <span className="text-base font-bold" style={{ color: G.goldLight }}>¥ {cnyBalance.toFixed(2)}</span>
      </div>

      {/* 金额输入 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>提现金额（元）</div>
        <div
          className="flex items-center rounded-xl px-4 py-3"
          style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)` }}
        >
          <span className="text-lg font-bold mr-2" style={{ color: G.goldDim }}>¥</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums"
            style={{ color: G.white }}
          />
          <button
            onClick={() => setAmount(cnyBalance.toFixed(2))}
            className="text-xs px-2.5 py-1 rounded-lg ml-2 font-medium"
            style={{ background: G.goldFaint, color: G.gold }}
          >全部</button>
        </div>
      </div>

      {/* 收款账户 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>收款账户信息</div>
        <textarea
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          placeholder="请填写银行卡号、开户行、户名等信息"
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{
            background: G.whiteFaint,
            border: `1px solid rgba(201,168,76,0.2)`,
            color: G.white,
          }}
        />
      </div>

      <GoldBtn onClick={() => {
        const num = Number(amount);
        if (!amount || isNaN(num) || num <= 0) { alert("请输入有效金额"); return; }
        if (num > cnyBalance) { alert("提现金额不能超过可用余额"); return; }
        if (!bankInfo.trim()) { alert("请填写收款账户信息"); return; }
        setSubmitted(true);
      }}>提交提现申请</GoldBtn>
    </div>
  );
}

// 全局内部钱包划转：入口当前只从52号账本的黑色钱包开放；实际结算与审计由服务端统一处理。
function WalletTransferContent({
  currency,
  availableBalance,
  sourceLedgerId,
  onClose,
  onCompleted,
}: {
  currency: WalletTransferAsset;
  availableBalance: number;
  sourceLedgerId: number;
  onClose: () => void;
  onCompleted: (operation: { amount: number; currency: WalletTransferAsset; referenceNo: string }) => void;
}) {
  const [recipientInput, setRecipientInput] = useState("");
  const [lookupIdentifier, setLookupIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [completed, setCompleted] = useState<{ transferNo: string; amount: string } | null>(null);
  const recipientQuery = trpc.recharge.lookupWalletTransferRecipient.useQuery(
    { identifier: lookupIdentifier },
    { enabled: lookupIdentifier.length > 0, retry: false, refetchOnWindowFocus: false },
  );
  const favoritesQuery = trpc.recharge.getWalletTransferFavorites.useQuery(undefined, {
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const recipientResult = recipientQuery.data as any;
  const recipient = recipientResult?.status === "found" ? recipientResult.recipient : null;
  const favorites = (favoritesQuery.data as any[] | undefined) || [];
  const recipientIsFavorite = !!recipient && favorites.some((favorite: any) => Number(favorite.id) === Number(recipient.id));
  const addFavoriteMutation = trpc.recharge.addWalletTransferFavorite.useMutation({
    onSuccess: () => {
      void favoritesQuery.refetch();
      toast.success('已加入转账白名单');
    },
  });
  const transferMutation = trpc.recharge.transferWalletBalance.useMutation({
    onSuccess: (result: any) => {
      setCompleted({ transferNo: String(result.transferNo), amount: String(result.amount) });
      onCompleted({ amount: Number(result.amount), currency, referenceNo: String(result.transferNo) });
    },
  });
  const multiAssetTransferMutation = trpc.recharge.transferMultiAssetBalance.useMutation({
    onSuccess: (result: any) => {
      setCompleted({ transferNo: String(result.transferNo), amount: String(result.amount) });
      onCompleted({ amount: Number(result.amount), currency, referenceNo: String(result.transferNo) });
    },
  });
  const amountNumber = Number(amount);
  const isMultiAsset = (AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(currency);
  const amountDigits = currency === "CNY" ? 2 : isMultiAsset ? 8 : 4;
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber <= availableBalance + 1e-8;
  const amountDisplay = amountValid ? amountNumber.toFixed(amountDigits) : "0";

  const lookupRecipient = () => {
    const identifier = recipientInput.trim();
    setConfirming(false);
    if (!identifier) return;
    if (identifier === lookupIdentifier) {
      void recipientQuery.refetch();
    } else {
      setLookupIdentifier(identifier);
    }
  };
  const beginConfirm = () => {
    if (!recipient) return;
    if (!amountValid) return;
    if (!requestId) {
      setRequestId(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now()}${Math.random().toString(36).slice(2, 14)}`);
    }
    setConfirming(true);
  };
  const submitTransfer = () => {
    if (!recipient || !amountValid || !requestId) return;
    if (isMultiAsset) {
      multiAssetTransferMutation.mutate({
        toUserId: Number(recipient.id),
        assetCode: currency as AiWalletSettlementAsset,
        amount: amount.trim(),
        requestId,
        sourceLedgerId,
      });
      return;
    }
    transferMutation.mutate({
      toUserId: Number(recipient.id),
      currency: currency as "CNY" | "USDT",
      amount: amountNumber,
      requestId,
      sourceLedgerId,
    });
  };

  if (completed) {
    return (
      <div className="px-5 py-10 flex flex-col items-center space-y-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
          <CheckCircle2 className="w-9 h-9" style={{ color: G.green }} />
        </div>
        <div className="text-base font-semibold" style={{ color: G.white }}>转账完成</div>
        <div className="text-sm text-center leading-6" style={{ color: G.whiteDim }}>
          已向 {recipient?.nickname || recipient?.name || "收款人"} 转账 {Number(completed.amount).toFixed(amountDigits)} {currency}。<br />转账编号：{completed.transferNo}
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-medium"
          style={{ background: G.whiteFaint, color: G.whiteDim }}
        >关闭</button>
      </div>
    );
  }

  if (confirming && recipient) {
    return (
      <div className="px-5 pb-8 pt-4 space-y-4">
        <div className="rounded-2xl p-4 space-y-2" style={{ background: G.goldFaint, border: `1px solid rgba(201,168,76,0.3)` }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: G.goldLight }}>
            <AlertTriangle className="w-4 h-4" /> 请再次核对转账信息
          </div>
          <div className="pt-1 space-y-1.5 text-xs" style={{ color: G.whiteDim }}>
            <div className="flex justify-between gap-4"><span>收款码</span><span className="text-right font-mono tracking-[0.12em]" style={{ color: G.goldLight }}>{recipient.paymentId}</span></div>
            <div className="flex justify-between gap-4"><span>昵称</span><span className="text-right" style={{ color: G.white }}>{recipient.nickname || recipient.name}</span></div>
            <div className="flex justify-between gap-4"><span>用户名</span><span className="text-right" style={{ color: G.white }}>{recipient.username}</span></div>
            <div className="flex justify-between gap-4"><span>转账金额</span><span className="text-right font-bold" style={{ color: G.goldLight }}>{amountDisplay} {currency}</span></div>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-xs leading-5" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.22)' }}>
          转账一经确认将立即从您的钱包扣除并存入对方钱包，<strong>不可撤回</strong>。请确认收款人和金额无误。
        </div>
        {(transferMutation.error || multiAssetTransferMutation.error) && <p className="text-center text-xs text-red-300">{transferMutation.error?.message || multiAssetTransferMutation.error?.message || '转账失败，请稍后重试'}</p>}
        <GoldBtn onClick={submitTransfer} disabled={transferMutation.isPending || multiAssetTransferMutation.isPending}>
          {transferMutation.isPending || multiAssetTransferMutation.isPending ? "正在转账…" : `确认并立即转账 ${amountDisplay} ${currency}`}
        </GoldBtn>
        <button type="button" onClick={() => setConfirming(false)} className="w-full py-2 text-sm" style={{ color: G.whiteDim }}>返回修改</button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.15)` }}>
        <span className="text-sm" style={{ color: G.whiteDim }}>当前可转余额</span>
        <span className="text-base font-bold" style={{ color: G.goldLight }}>{availableBalance.toFixed(amountDigits)} {currency}</span>
      </div>

      {favorites.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: G.whiteDim }}>
            <span>转账白名单</span>
            <span className="text-[10px]">最近添加优先</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {favorites.map((favorite: any) => (
              <button
                key={favorite.id}
                type="button"
                onClick={() => {
                  setRecipientInput(String(favorite.paymentId));
                  setLookupIdentifier(String(favorite.paymentId));
                  setConfirming(false);
                  setRequestId("");
                }}
                className="shrink-0 rounded-xl px-3 py-2 text-left active:scale-[0.98]"
                style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.18)` }}
              >
                <div className="max-w-24 truncate text-xs font-semibold" style={{ color: G.white }}>{favorite.nickname || favorite.name}</div>
                <div className="mt-0.5 font-mono text-[10px] tracking-[0.1em]" style={{ color: G.goldDim }}>{favorite.paymentId}</div>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-4" style={{ color: G.whiteDim }}>选择白名单用户后，仍须核验收款人、填写金额并再次确认，不会直接转账。</p>
        </div>
      )}

      <div>
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>收款人</div>
        <div className="flex gap-2">
          <input
            value={recipientInput}
            onChange={(event) => {
              setRecipientInput(event.target.value);
              setLookupIdentifier("");
              setConfirming(false);
              setRequestId("");
            }}
            placeholder="收款码、用户名、昵称或手机号"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl px-3 py-3 text-sm outline-none"
            style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)`, color: G.white }}
          />
          <button
            type="button"
            onClick={lookupRecipient}
            disabled={!recipientInput.trim() || recipientQuery.isFetching}
            className="shrink-0 rounded-xl px-3 text-xs font-semibold disabled:opacity-50"
            style={{ background: G.goldFaint, border: `1px solid ${G.goldDim}`, color: G.goldLight }}
          >{recipientQuery.isFetching ? "核验中" : "核验"}</button>
        </div>
        <p className="mt-1.5 text-[11px] leading-4" style={{ color: G.whiteDim }}>支持完整六码收款码、用户名、昵称或手机号核验；不提供模糊搜索。</p>
      </div>

      {lookupIdentifier && !recipientQuery.isFetching && recipientResult?.status === "not_found" && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>未找到该用户，请核对六码收款码、完整用户名、昵称或手机号。</div>
      )}
      {lookupIdentifier && !recipientQuery.isFetching && recipientResult?.status === "self" && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>不能转账给自己，请输入其他用户。</div>
      )}
      {lookupIdentifier && !recipientQuery.isFetching && recipientResult?.status === "ambiguous" && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(251,191,36,0.1)', color: '#fde68a' }}>该昵称存在多个用户，请改用六码收款 ID 或完整用户名核验。</div>
      )}
      {recipient && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: G.green }}><UserRound className="w-4 h-4" />已确认收款用户</div>
          <div className="mt-2 grid grid-cols-[56px_1fr] gap-y-1.5 text-xs">
            <span style={{ color: G.whiteDim }}>收款码</span><span className="font-mono tracking-[0.14em]" style={{ color: G.goldLight }}>{recipient.paymentId}</span>
            <span style={{ color: G.whiteDim }}>昵称</span><span style={{ color: G.white }}>{recipient.nickname || recipient.name}</span>
            <span style={{ color: G.whiteDim }}>用户名</span><span style={{ color: G.white }}>{recipient.username}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'rgba(52,211,153,0.18)' }}>
            <span className="text-[11px] leading-4" style={{ color: G.whiteDim }}>白名单仅用于下次快速带入收款人，仍需再次确认。</span>
            {recipientIsFavorite ? (
              <span className="shrink-0 text-xs font-medium" style={{ color: G.green }}>已在白名单</span>
            ) : (
              <button
                type="button"
                onClick={() => addFavoriteMutation.mutate({ recipientUserId: Number(recipient.id) })}
                disabled={addFavoriteMutation.isPending}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.35)', color: G.green }}
              >{addFavoriteMutation.isPending ? '添加中…' : '加入白名单'}</button>
            )}
          </div>
          {addFavoriteMutation.error && <p className="mt-2 text-xs text-red-300">{addFavoriteMutation.error.message || '添加白名单失败，请稍后重试'}</p>}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: G.whiteDim }}>
          <span>转账金额（{currency}）</span>
          <button type="button" onClick={() => setAmount(availableBalance.toFixed(amountDigits))} style={{ color: G.gold }}>全部转出</button>
        </div>
        <div className="flex items-center rounded-xl px-4 py-3" style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)` }}>
          <input
            type="number"
            min="0"
            step={currency === 'CNY' ? '0.01' : isMultiAsset ? '0.00000001' : '0.0001'}
            value={amount}
            onChange={(event) => { setAmount(event.target.value); setConfirming(false); setRequestId(""); }}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none tabular-nums"
            style={{ color: G.white }}
          />
          <span className="ml-2 text-sm font-semibold" style={{ color: G.goldDim }}>{currency}</span>
        </div>
        {amount && !amountValid && <p className="mt-1.5 text-[11px] text-red-300">金额应大于 0 且不超过当前可转余额。</p>}
      </div>

      <div className="rounded-xl px-3 py-2.5 text-[11px] leading-5" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.18)' }}>
        此为站内内部转账。确认后即时到账、不可撤回；双方资金明细都会显示汇款人、收款人和转账编号。
      </div>
      {recipientQuery.error && <p className="text-center text-xs text-red-300">{recipientQuery.error.message || '用户核验失败，请稍后重试'}</p>}
      <GoldBtn onClick={beginConfirm} disabled={!recipient || !amountValid}>确认转账信息</GoldBtn>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────
export default function Wallet() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  // 账本页卸载时会清理临时身份；钱包作为其子页面需从 URL 恢复已授权的查看用户。
  const viewAsUserId = restoreLedgerViewAsState(searchParams.get("viewAs"));
  const isReadOnlyMemberView = !!viewAsUserId;
  // 52、37号账本均进入同一个全局钱包视图；账本来源只决定返回位置和 URL 上下文。
  const isLedger52WalletEntry = searchParams.get("fromLedger") === "52";
  const isLedger37WalletEntry = searchParams.get("fromLedger") === "37";
  const isGlobalWalletLedgerEntry = isLedger52WalletEntry || isLedger37WalletEntry;
  // 钱包资产仅按用户隔离，不按进入的项目隔离；任意入口均显示同一套数字币和人民币账户。
  const isGlobalWalletView = true;
  const walletEntryLedgerId = isLedger52WalletEntry ? "52" : isLedger37WalletEntry ? "37" : null;
  const appendViewAs = (path: string) => viewAsUserId
    ? `${path}${path.includes("?") ? "&" : "?"}viewAs=${viewAsUserId}`
    : path;
  // 钱包详情页会离开本组件；把账户类别保存在 URL 中，返回时才能保持原来的账户上下文。
  const accountFromRoute = searchParams.get("account");
  const initialAccount: WalletAccountAsset = accountFromRoute === "CNY"
    ? "CNY"
    : "CRYPTO";
  const appendWalletAccount = (path: string, account: WalletAccountAsset) => appendViewAs(
    `${path}${path.includes("?") ? "&" : "?"}account=${account}${walletEntryLedgerId ? `&fromLedger=${walletEntryLedgerId}` : ""}`,
  );
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [activeAsset, setActiveAsset] = useState<WalletAccountAsset>(initialAccount);
  // 全局钱包固定以数字币账户作为默认首页；仅用户通过地址或双标签主动选择时切换账户。
  useEffect(() => {
    setActiveAsset(initialAccount);
  }, [initialAccount]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [transferAsset, setTransferAsset] = useState<WalletTransferAsset>("USDT");
  const [operationReceipt, setOperationReceipt] = useState<WalletOperationReceipt | null>(null);
  useEffect(() => {
    if (!operationReceipt) return;
    const timer = window.setTimeout(() => setOperationReceipt(null), 15_000);
    return () => window.clearTimeout(timer);
  }, [operationReceipt?.id]);
  // 转账能力属于全局统一钱包；从37、52号账本进入时使用同一套钱包档案与操作入口。
  const walletReturnPath = appendViewAs(
    isLedger52WalletEntry ? "/ledger/52" : isLedger37WalletEntry ? "/ledger/37" : "/",
  );
  const walletPolicyQuery = trpc.aiWallet.runtimeProfile.useQuery(
    { targetKey: "ledger:52" },
    { enabled: isGlobalWalletLedgerEntry, staleTime: 30_000 },
  );
  // 从两个项目入口进入的都是全局钱包，因此共用同一套资金权限和资产可见范围。
  const canRecharge = !walletEntryLedgerId || walletPolicyQuery.data?.allowRecharge === true;
  const canWithdraw = !walletEntryLedgerId || walletPolicyQuery.data?.allowWithdrawal === true;
  // 配置仍在加载阶段先展示入口；档案明确关闭时才隐藏，服务端也会二次校验。
  const canTransfer = !walletEntryLedgerId || walletPolicyQuery.data?.allowTransfer !== false;

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  // 详情页展示最近 10 笔，因此每个资金来源保留足够的候选记录后再统一排序。
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 20 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 20 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery(
    isGlobalWalletLedgerEntry
      ? { limit: 500, ledgerId: 52, ...(viewAsUserId ? { viewAsUserId } : {}) }
      : { limit: 500 },
  );
  const recentBalanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 20 });
  // 两个项目入口的数字币账户与“资金明细”共用同一条全局 USDT 流水；首页仅在最后截取最近10笔。
  // 非项目入口仍保留既有短列表，避免改变通用钱包的展示。
  const ledger52UsdtHistoryQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: 52, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isGlobalWalletView, staleTime: 30_000 },
  );
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyBalanceSummaryQuery = trpc.recharge.getCnyBalanceSummary.useQuery();
  const cnyBalanceBreakdownQuery = trpc.recharge.getCnyBalanceBreakdown.useQuery(undefined, { staleTime: 15_000 });
  const usdtBalanceSummaryQuery = trpc.recharge.getUsdtBalanceSummary.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 20 });
  const multiAssetBalancesQuery = trpc.recharge.getMultiAssetBalances.useQuery(
    viewAsUserId ? { viewAsUserId } : undefined,
    {
    enabled: isGlobalWalletView,
    staleTime: 15_000,
    },
  );
  // 多币种按币种分组显示各自最近 10 笔；取足够总量避免单币种被其他币种挤出。
  const multiAssetHistoryQuery = trpc.recharge.getMultiAssetHistory.useQuery({
    limit: 100,
    ...(viewAsUserId ? { viewAsUserId } : {}),
  }, {
    enabled: isGlobalWalletView,
    staleTime: 15_000,
  });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const usdtSummary = usdtBalanceSummaryQuery.data ?? { total: balance, frozen: 0, available: balance };
  const usdtTotalBalance = Number(usdtSummary.total ?? balance);
  const usdtAvailableBalance = Number(usdtSummary.available ?? balance);
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const cnySummary = cnyBalanceSummaryQuery.data ?? { total: cnyBalance, frozen: 0, available: cnyBalance };
  const cnyAvailableBalance = Number(cnySummary.available ?? cnyBalance);
  const cnyFrozenByLedger = Array.isArray(cnyBalanceBreakdownQuery.data?.frozenByLedger)
    ? cnyBalanceBreakdownQuery.data.frozenByLedger
      .map((item: any) => ({ ledgerId: Number(item.ledgerId), amount: Number(item.amount), holdCount: Number(item.holdCount) }))
      .filter((item: { ledgerId: number; amount: number; holdCount: number }) => item.ledgerId > 0 && item.amount > 0)
    : [];
  const knownCnyFrozen = cnyFrozenByLedger.reduce((total: number, item: { amount: number }) => total + item.amount, 0);
  const otherCnyFrozen = Math.max(0, Number(cnySummary.frozen ?? 0) - knownCnyFrozen);
  const usdtToCny = usdtTotalBalance * 7.25;
  const multiAssetBalances = (multiAssetBalancesQuery.data ?? []) as any[];
  const multiAssetHistory = (multiAssetHistoryQuery.data ?? []) as any[];
  // 所有数字币均按用户全局余额展示；冻结担保也属于持有资产，不能因可用额为0而消失。
  const visibleMultiAssetBalances = multiAssetBalances.filter((asset) =>
    Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0))) > 0,
  );
  // 稳定币是数字资产主计价单位：有余额时始终固定首位，其余资产按真实 USDT 估值从高到低排列。
  const visibleDigitalAssetBalances = [
    ...(usdtTotalBalance > 0 ? [{
      assetCode: "USDT",
      totalBalance: usdtTotalBalance,
      availableBalance: usdtAvailableBalance,
      frozenBalance: Number(usdtSummary.frozen ?? 0),
      priceUsdt: 1,
      isStablecoin: true,
    }] : []),
    ...visibleMultiAssetBalances.filter((asset) => String(asset.assetCode || "").toUpperCase() !== "USDT"),
  ].sort((left: any, right: any) => {
    const leftCode = String(left.assetCode || "").toUpperCase();
    const rightCode = String(right.assetCode || "").toUpperCase();
    if (leftCode === "USDT" && rightCode !== "USDT") return -1;
    if (rightCode === "USDT" && leftCode !== "USDT") return 1;
    const leftValueUsdt = Number(left.totalBalance ?? (Number(left.availableBalance ?? 0) + Number(left.frozenBalance ?? 0))) * Number(left.priceUsdt ?? 0);
    const rightValueUsdt = Number(right.totalBalance ?? (Number(right.availableBalance ?? 0) + Number(right.frozenBalance ?? 0))) * Number(right.priceUsdt ?? 0);
    if (rightValueUsdt !== leftValueUsdt) return rightValueUsdt - leftValueUsdt;
    return leftCode.localeCompare(rightCode);
  });
  const cryptoTotalUsdt = visibleMultiAssetBalances.reduce(
    (total, asset) => total + Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0))) * Number(asset.priceUsdt ?? 0),
    0,
  );
  const digitalTotalUsdt = usdtTotalBalance + cryptoTotalUsdt;
  // 钱包为全局共享账户；当前仅开放数字币和人民币两类账户。
  const cryptoAccountLabel = "数字币账户";
  const accountMenuItems: Array<{ value: WalletAccountAsset; label: string; enabled: boolean }> = [
    { value: "CRYPTO", label: cryptoAccountLabel, enabled: true },
    { value: "CNY", label: "人民币账户", enabled: true },
  ];
  const currentAccountLabel = accountMenuItems.find((item) => item.value === activeAsset)?.label || "数字币账户";
  const activeAssetDetailsPath = activeAsset === "USDT"
    ? appendWalletAccount("/wallet/transactions", "USDT")
    : activeAsset === "CNY"
      ? appendWalletAccount("/wallet/cny-transactions", "CNY")
      : activeAsset === "CRYPTO"
        ? appendWalletAccount("/wallet/crypto-transactions", "CRYPTO")
        : "";
  const selectWalletAccount = (account: WalletAccountAsset) => {
    setActiveAsset(account);
    setIsAccountMenuOpen(false);
    const params = new URLSearchParams(searchParams);
    const isDefaultAccount = account === "CRYPTO";
    if (isDefaultAccount) params.delete("account");
    else params.set("account", account);
    setLocation(`/wallet${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const recentUsdtTx = (() => {
    if (isGlobalWalletView) {
      const byFingerprint = new Map<string, any>();
      const put = (item: any) => {
        const amount = Number(item.amount ?? 0);
        const createdAt = item.createdAt ?? item.created_at;
        const note = String(item.note || item.description || "");
        const fingerprint = [amount.toFixed(8), String(createdAt || ""), note].join("|");
        if (!byFingerprint.has(fingerprint)) {
          byFingerprint.set(fingerprint, {
            ...item,
            amount,
            createdAt,
            note,
            wcCode: extractWcTeamCode(note),
          });
        }
      };
      // 与 CryptoWalletTransactions 完整明细页保持相同的主源与安全回退顺序。
      (ledger52UsdtHistoryQuery.data ?? []).forEach(put);
      (recentManualQuery.data ?? [])
        .filter((item: any) => !String(item.note || "").startsWith("[CNY]") && !String(item.note || "").startsWith("[BALANCE_BASE]"))
        .forEach((item: any) => put({
          ...item,
          id: `manual-fallback-${item.id}`,
          sourceType: "manual",
          createdAt: item.createdAt ?? item.created_at,
        }));
      return Array.from(byFingerprint.values())
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 10);
    }
    const recharges = (recentRechargeQuery.data ?? []).map((r: any) => ({
      id: `r-${r.id}`, sourceType: "recharge",
      amount: Number(r.amount), status: r.status, createdAt: r.createdAt,
      note: "", wcCode: null,
    }));
    const withdraws = (recentWithdrawQuery.data ?? []).map((w: any) => ({
      id: `w-${w.id}`, sourceType: "withdraw",
      withdrawalId: Number(w.relatedId ?? 0),
      amount: -Math.abs(Number(w.amount)), status: w.status, createdAt: w.createdAt,
      note: "", wcCode: null,
    }));
    const withdrawalHistoryIds = new Set(
      withdraws
        .map((item) => Number(item.withdrawalId))
        .filter((withdrawalId) => Number.isFinite(withdrawalId) && withdrawalId > 0),
    );
    const manuals = (recentManualQuery.data ?? [])
      .filter((m: any) => !(m.note || "").startsWith("[CNY]"))
      // 提现冻结与提现审计行代表同一个动作，首页只保留“提现”这一条。
      .filter((m: any) => {
        const withdrawalMatch = String(m.note || "").match(/^提现申请冻结\s+#(\d+)\b/);
        return !withdrawalMatch || !withdrawalHistoryIds.has(Number(withdrawalMatch[1]));
      })
      .map((m: any) => {
        const note = String(m.note || "");
        const withdrawalMatch = note.match(/^提现申请冻结\s+#(\d+)\b/);
        const amount = Number(m.amount);
        return {
          id: `m-${m.id}`,
          sourceType: withdrawalMatch ? "withdraw" : "manual",
          amount, status: "completed" as const,
          note: withdrawalMatch ? note.replace(/^提现申请冻结\s+/, "提现申请 ") : note,
          wcCode: extractWcTeamCode(note),
          createdAt: m.created_at,
        };
      });
    // balance_history 包含世界杯投注/退款记录（type: consume/refund）
    const balanceHistoryItems = (recentBalanceHistoryQuery.data ?? [])
      .filter((h: any) => h.type === 'consume' || h.type === 'refund')
      .map((h: any) => ({
        id: `bh-${h.id}`,
        sourceType: "balance_history", type: h.type,
        amount: h.type === 'consume' ? -Math.abs(Number(h.amount)) : Math.abs(Number(h.amount)), status: "completed" as const,
        note: h.description || "",
        wcCode: extractWcTeamCode(h.description || ""),
        createdAt: h.createdAt,
      }));
    return [...recharges, ...withdraws, ...manuals, ...balanceHistoryItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  })();

  const recentCnyTx = (cnyHistoryQuery.data ?? []).slice(0, 10).map((m: any) => ({
    id: `cny-${m.id}`,
    amount: Math.abs(Number(m.amount)),
    isIn: Number(m.amount) > 0,
    note: (m.note || "").replace(/^\[CNY\]/, ""),
    wcCode: extractWcTeamCode((m.note || "").replace(/^\[CNY\]/, "")),
    createdAt: m.created_at,
  }));
  // 先合并、排序所有真实数字币流水；快览统一展示最近十笔，不提供币种筛选。
  // 担保冻结/解冻属于余额内部状态搬移，不作为用户资金流水展示；冻结金额仍在资产卡片中可见。
  const allRecentDigitalTx = [
    ...recentUsdtTx.map((item) => ({ ...item, assetCode: "USDT", flowKind: "usdt" as const })),
    ...multiAssetHistory
      .filter((item: any) => item.eventType !== "collateral_lock" && item.eventType !== "collateral_release")
      .map((item: any) => ({ ...item, flowKind: "asset" as const })),
  ]
    .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const recentDigitalTx = allRecentDigitalTx.slice(0, 10);

  const mask = (v: string) => hideBalance ? "••••••" : v;
  const refreshWalletData = () => {
    void balanceQuery.refetch();
    void usdtBalanceSummaryQuery.refetch();
    void cnyBalanceQuery.refetch();
    void cnyBalanceSummaryQuery.refetch();
    void cnyBalanceBreakdownQuery.refetch();
    void recentRechargeQuery.refetch();
    void recentWithdrawQuery.refetch();
    void recentManualQuery.refetch();
    void recentBalanceHistoryQuery.refetch();
    void ledger52UsdtHistoryQuery.refetch();
    void cnyHistoryQuery.refetch();
    void multiAssetBalancesQuery.refetch();
    void multiAssetHistoryQuery.refetch();
  };
  const recordOperationReceipt = (receipt: Omit<WalletOperationReceipt, "id" | "createdAt">) => {
    setOperationReceipt({
      ...receipt,
      id: `wallet-operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    });
    if (receipt.balanceState === "refreshed") refreshWalletData();
  };
  const renderOperationReceipt = (account: WalletOperationReceipt["account"]) => {
    if (!operationReceipt || operationReceipt.account !== account) return undefined;
    const detailsPath = account === "CNY"
      ? appendWalletAccount("/wallet/cny-transactions", "CNY")
      : isGlobalWalletView
        ? appendWalletAccount("/wallet/crypto-transactions", "CRYPTO")
        : appendWalletAccount("/wallet/transactions", "USDT");
    return <WalletOperationReceiptCard
      receipt={operationReceipt}
      hidden={hideBalance}
      onDismiss={() => setOperationReceipt(null)}
      onDetails={() => { setOperationReceipt(null); setLocation(detailsPath); }}
    />;
  };

  // 账户卡片通用渲染
  const AccountCard = ({
    icon, label, balance: bal, unit, subLine, balanceCaption,
    txPath, onRefresh, onRecharge, onWithdraw, onTransfer, onReceive, onDetails,
    preActionsContent, operationReceipt: receipt, txList, isUsdt, readOnly = false, showDetails = true, rechargeDisabled = false, withdrawDisabled = false, balanceFontSize = "2rem",
  }: {
    icon: string; label: string; balance: string; unit: string; subLine?: React.ReactNode; balanceCaption?: string;
    txPath: string; onRefresh: () => void; onRecharge?: () => void; onWithdraw?: () => void; onTransfer?: () => void; onReceive?: () => void; onDetails?: () => void;
    preActionsContent?: React.ReactNode; operationReceipt?: React.ReactNode; txList: React.ReactNode; isUsdt: boolean; readOnly?: boolean; showDetails?: boolean;
    rechargeDisabled?: boolean; withdrawDisabled?: boolean; balanceFontSize?: string;
  }) => (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: G.card,
        border: `1px solid ${G.cardBorder}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* 顶部金线 */}
      <div
        className="h-px"
        style={{
          background: `linear-gradient(90deg, transparent 5%, ${G.gold} 40%, ${G.goldLight} 60%, transparent 95%)`,
        }}
      />
      <div className="p-5">
        {/* 所有导航和操作都收在钱包容器内；账户名称本身就是币种下拉入口。 */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex min-w-0 items-center space-x-2">
            <button
              onClick={() => setLocation(walletReturnPath)}
              className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: G.whiteFaint, border: `1px solid ${G.cardBorder}` }}
              aria-label={isLedger37WalletEntry ? "返回37号账本" : isLedger52WalletEntry ? "返回52号账本" : "返回首页"}
            >
              <ArrowLeft className="w-4 h-4" style={{ color: G.goldLight }} />
            </button>
            {isGlobalWalletView ? (
              <div className="grid h-9 w-[144px] grid-cols-2 overflow-hidden rounded-lg border p-0.5" style={{ borderColor: "rgba(201,168,76,0.32)", background: "rgba(255,255,255,0.045)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)" }} aria-label="切换全局钱包账户">
                {accountMenuItems.map((item) => {
                  const selected = item.value === activeAsset;
                  const shortLabel = item.value === "CRYPTO" ? "数字币" : "人民币";
                  return <button
                    key={item.value}
                    type="button"
                    onClick={() => selectWalletAccount(item.value)}
                    className="w-full rounded-md px-1 text-[11px] font-semibold transition-all duration-200"
                    style={{
                      background: selected ? "linear-gradient(135deg, #F8E3A4 0%, #D4B15A 55%, #BD963D 100%)" : "rgba(255,255,255,0.012)",
                      color: selected ? "#171109" : "rgba(255,255,255,0.48)",
                      boxShadow: selected ? "0 2px 8px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.38)" : "none",
                      textShadow: selected ? "0 1px 0 rgba(255,255,255,0.2)" : "none",
                    }}
                    aria-pressed={selected}
                    title={item.label}
                  >{shortLabel}</button>;
                })}
              </div>
            ) : (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAccountMenuOpen((open) => !open)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold whitespace-nowrap"
                  style={{ borderColor: G.cardBorder, background: G.whiteFaint, color: G.goldLight }}
                  aria-label="切换钱包账户"
                  aria-expanded={isAccountMenuOpen}
                >
                  <span>{currentAccountLabel}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isAccountMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {isAccountMenuOpen && (
                  <div
                    className="absolute left-0 top-10 z-30 w-[218px] overflow-hidden rounded-xl p-1.5 shadow-2xl"
                    style={{ background: "linear-gradient(160deg, #202020 0%, #121212 100%)", border: `1px solid ${G.cardBorder}`, boxShadow: "0 12px 28px rgba(0,0,0,0.58)" }}
                  >
                    <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-medium tracking-wide" style={{ color: G.goldDim }}>切换账户</div>
                    {accountMenuItems.map((item) => {
                      const selected = item.value === activeAsset;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          disabled={!item.enabled}
                          onClick={() => selectWalletAccount(item.value)}
                          className="flex h-10 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed"
                          style={{
                            background: selected ? G.goldFaint : "transparent",
                            color: item.enabled ? (selected ? G.goldLight : G.white) : G.whiteDim,
                            opacity: item.enabled ? 1 : 0.42,
                          }}
                        >
                          <span>{item.label}</span>
                          {selected && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: G.gold }} />}
                          {!item.enabled && <span className="shrink-0 text-[10px]" style={{ color: G.whiteDim }}>未开通</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setHideBalance((v) => !v)}
              className="w-6 h-6 shrink-0 flex items-center justify-center"
              aria-label={hideBalance ? "显示余额" : "隐藏余额"}
            >
              {hideBalance
                ? <EyeOff className="w-3.5 h-3.5" style={{ color: G.goldDim }} />
                : <Eye className="w-3.5 h-3.5" style={{ color: G.goldDim }} />
              }
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showDetails && <button
              onClick={onDetails || (() => setLocation(activeAssetDetailsPath))}
              className="h-7 rounded-lg px-2 text-xs font-medium"
              style={{ background: G.goldFaint, color: G.goldLight, border: `1px solid rgba(201,168,76,0.55)`, boxShadow: "0 1px 5px rgba(201,168,76,0.12)" }}
            >
              明细
            </button>}
            <button
              onClick={() => window.location.reload()}
              className="h-7 rounded-lg px-2 text-xs font-medium"
              style={{ background: G.goldFaint, color: G.goldLight, border: `1px solid rgba(201,168,76,0.55)`, boxShadow: "0 1px 5px rgba(201,168,76,0.12)" }}
            >
              刷新
            </button>
          </div>
        </div>

        {/* 余额 */}
        <div className="mb-1">
          {balanceCaption && <div className="mb-1 text-[10px] font-medium tracking-[0.08em] uppercase" style={{ color: G.goldDim }}>{balanceCaption}</div>}
          <div className="flex items-baseline space-x-2">
            <span
              className="tabular-nums font-bold"
              style={{
                fontSize: balanceFontSize,
                lineHeight: 1.1,
                color: G.goldLight,
                textShadow: "0 0 20px rgba(245,215,142,0.25)",
              }}
            >{bal}</span>
            <span className="text-sm font-medium" style={{ color: G.goldDim }}>{unit}</span>
          </div>
        </div>
        {subLine && <div className="mb-4">{subLine}</div>}
        {preActionsContent}

        {/* 操作按钮：项目档案关闭入口后不渲染，服务端仍会二次校验。 */}
        {(onRecharge || onWithdraw || onTransfer || onReceive) && (
          <div className={`grid gap-2 mb-0.5 ${preActionsContent ? "mt-3" : ""} ${[onRecharge, onWithdraw, onTransfer, onReceive].filter(Boolean).length === 4 ? "grid-cols-4" : [onRecharge, onWithdraw, onTransfer, onReceive].filter(Boolean).length === 3 ? "grid-cols-3" : [onRecharge, onWithdraw, onTransfer, onReceive].filter(Boolean).length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {onRecharge && (
              <button
                onClick={onRecharge}
                disabled={readOnly || rechargeDisabled}
                className="flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-bold leading-none active:scale-[0.97] transition-transform"
                style={{
                  background: rechargeDisabled ? "rgba(255,255,255,0.055)" : `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 50%, ${G.gold} 100%)`,
                  border: rechargeDisabled ? "1px solid rgba(255,255,255,0.09)" : "none",
                  boxShadow: rechargeDisabled ? "none" : "0 2px 8px rgba(201,168,76,0.28)",
                  color: rechargeDisabled ? "rgba(255,255,255,0.32)" : "#000",
                  opacity: readOnly ? 0.45 : 1,
                }}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span>充值</span>
              </button>
            )}
            {onWithdraw && (
              <button
                onClick={onWithdraw}
                disabled={readOnly || withdrawDisabled}
                className="flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-bold leading-none active:scale-[0.97] transition-transform"
                style={{
                  background: withdrawDisabled ? "rgba(255,255,255,0.055)" : "transparent",
                  border: withdrawDisabled ? "1px solid rgba(255,255,255,0.09)" : `1px solid ${G.gold}`,
                  color: withdrawDisabled ? "rgba(255,255,255,0.32)" : G.goldLight,
                  opacity: readOnly ? 0.45 : 1,
                }}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>提现</span>
              </button>
            )}
            {onTransfer && (
              <button
                onClick={onTransfer}
                disabled={readOnly}
                className="flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-bold leading-none active:scale-[0.97] transition-transform"
                style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${G.divider}`, color: G.whiteDim, opacity: readOnly ? 0.45 : 1 }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>转账</span>
              </button>
            )}
            {onReceive && (
              <button
                onClick={onReceive}
                disabled={readOnly}
                className="flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-bold leading-none active:scale-[0.97] transition-transform"
                style={{ background: G.whiteFaint, border: `1px solid ${G.cardBorder}`, color: G.goldLight, opacity: readOnly ? 0.45 : 1 }}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>收款</span>
              </button>
            )}
          </div>
        )}
        {readOnly && (onRecharge || onWithdraw || onTransfer || onReceive) && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10px] leading-4" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${G.divider}`, color: G.whiteDim }}>
            <Eye className="mt-0.5 h-3 w-3 shrink-0" style={{ color: G.goldDim }} />
            <span>成员只读视角：资金操作仅该成员本人可用；“明细”和“刷新”仍可正常使用。</span>
          </div>
        )}
        {receipt}
        {/* 流水 */}
        {txList}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: G.bg }}>

      {/* ── 账户卡片 ── */}
      <div
        className="px-4 pb-24 space-y-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 44px) + 12px)" }}
      >

        {/* USDT */}
        {activeAsset === "USDT" && <AccountCard
          icon="$"
          label="USDT 账户"
          balance={mask(usdtTotalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          subLine={!hideBalance && (
            <div className="flex items-center space-x-1 mt-0.5" style={{ color: G.goldDim }}>
              <span className="text-xs">≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
              <span className="text-xs">· 可用 {usdtAvailableBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {Number(usdtSummary.frozen) > 0 && <span className="text-xs" style={{ color: '#B0BEC5' }}>· 冻结 {Number(usdtSummary.frozen).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
            </div>
          )}
          txPath="/wallet/transactions"
          onRefresh={refreshWalletData}
          onRecharge={canRecharge ? () => setModal("recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("withdraw") : undefined}
          onTransfer={canTransfer ? () => { setTransferAsset("USDT"); setModal("transfer"); } : undefined}
          onReceive={() => setLocation(appendWalletAccount("/wallet/receive", "USDT"))}
          operationReceipt={renderOperationReceipt("DIGITAL")}
          isUsdt={true}
          readOnly={isReadOnlyMemberView}
          txList={
            recentUsdtTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                {recentUsdtTx.map((tx, idx) => {
                  const presentation = getUsdtFlowPresentation(tx);
                  return <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentUsdtTx.length - 1 ? `1px solid ${G.divider}` : "none" }}
                  >
                    <div className="flex items-center space-x-2">
                      {/* 世界杯交易显示国旗，否则显示文字 */}
                      {(tx as any).wcCode ? (
                        <img
                          src={`/flags/${(tx as any).wcCode}.png`}
                          alt={(tx as any).wcCode}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : null}
                      <div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <WalletFlowTypeBadge label={presentation.label} note={presentation.detail || (tx as any).note} isIn={presentation.isIn} />
                          {!(tx as any).wcCode && <span className="truncate text-xs font-medium" style={{ color: G.white }}>{presentation.label}</span>}
                        </div>
                        <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(tx.createdAt)}</div>
                        {presentation.detail && <div className="mt-0.5 max-w-48 truncate text-[10px]" style={{ color: G.whiteDim }}>{presentation.detail}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums"
                        style={{ color: presentation.isIn ? G.green : G.red }}>
                        {presentation.isIn ? "+" : "-"}
                        {mask(Math.abs(Number(tx.amount)).toFixed(2))} USDT
                      </div>
                      <div className="flex items-center justify-end space-x-0.5 mt-0.5">
                        <StatusIcon status={tx.status} />
                        <span className="text-xs" style={{ color: G.whiteDim }}>{statusText(tx.status)}</span>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            ) : null
          }
        />}

        {/* CNY */}
        {activeAsset === "CNY" && <AccountCard
          icon="¥"
          label="CNY 账户"
          balance={mask(cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="CNY"
          subLine={!hideBalance && (
            <div className="mt-1 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: G.goldDim }}>可用 ¥{cnyAvailableBalance.toFixed(2)}</span>
                {Number(cnySummary.frozen || 0) > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: G.goldLight, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.28)" }}>占用合计 ¥{Number(cnySummary.frozen).toFixed(2)}</span>}
              </div>
              {(cnyFrozenByLedger.length > 0 || otherCnyFrozen > 0) && <div className="flex flex-wrap gap-1.5">
                {cnyFrozenByLedger.map((item: { ledgerId: number; amount: number; holdCount: number }) => <span key={item.ledgerId} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ color: G.goldLight, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.16)" }}>{item.ledgerId === 37 ? "37号担保" : `${item.ledgerId}号担保`} ¥{item.amount.toFixed(2)} · {item.holdCount}笔</span>)}
                {otherCnyFrozen > 0 && <span className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ color: G.whiteDim, background: G.whiteFaint, border: `1px solid ${G.divider}` }}>其他冻结 ¥{otherCnyFrozen.toFixed(2)}</span>}
              </div>}
            </div>
          )}
          txPath="/wallet/cny-transactions"
          onRefresh={() => { void cnyBalanceQuery.refetch(); void cnyBalanceSummaryQuery.refetch(); void cnyBalanceBreakdownQuery.refetch(); void cnyHistoryQuery.refetch(); }}
          onRecharge={canRecharge ? () => setModal("cny-recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("cny-withdraw") : undefined}
          onTransfer={canTransfer ? () => { setTransferAsset("CNY"); setModal("transfer"); } : undefined}
          onReceive={() => setLocation(appendWalletAccount("/wallet/receive", "CNY"))}
          operationReceipt={renderOperationReceipt("CNY")}
          isUsdt={false}
          readOnly={isReadOnlyMemberView}
          txList={
            recentCnyTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                {recentCnyTx.map((tx, idx) => {
                  const flowLabel = tx.note || (tx.isIn ? "充值" : "提现");
                  return <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentCnyTx.length - 1 ? `1px solid ${G.divider}` : "none" }}
                  >
                    <div className="flex items-center space-x-2">
                      {/* 世界杯交易显示国旗 */}
                      {(tx as any).wcCode ? (
                        <img
                          src={`/flags/${(tx as any).wcCode}.png`}
                          alt={(tx as any).wcCode}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : null}
                      <div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <WalletFlowTypeBadge label={flowLabel} note={tx.note} isIn={tx.isIn} />
                          {!(tx as any).wcCode && <span className="max-w-48 truncate text-xs font-medium" style={{ color: G.white }}>{flowLabel}</span>}
                        </div>
                        <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div
                      className="text-sm font-bold tabular-nums"
                      style={{ color: tx.isIn ? G.green : G.red }}
                    >
                      {tx.isIn ? "+" : "-"}{mask(tx.amount.toFixed(2))} CNY
                    </div>
                  </div>;
                })}
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: `1px solid ${G.divider}`, color: G.whiteDim }}>
                暂无交易记录
              </div>
            )
          }
        />}

        {/* 全局数字币汇总：下拉不再随持币种类无限增长；每个币种保留独立余额和流水。 */}
        {isGlobalWalletView && activeAsset === "CRYPTO" && <AccountCard
          icon="₿"
          label="数字币账户"
          balance={mask(digitalTotalUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          balanceCaption="总资产估值"
          subLine={!hideBalance && <div className="mt-2 text-xs" style={{ color: G.goldDim }}>
            ≈ ¥{(digitalTotalUsdt * 7.25).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币
          </div>}
          txPath=""
          onRefresh={refreshWalletData}
          // USDT 已并入数字币账户，充值和提现仍按 USDT 的既有真实通道执行。
          onRecharge={canRecharge ? () => setModal("recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("withdraw") : undefined}
          onTransfer={canTransfer ? () => setModal("crypto-transfer-select") : undefined}
          onReceive={() => setLocation(appendWalletAccount("/wallet/receive", "CRYPTO"))}
          onDetails={() => setLocation(appendWalletAccount("/wallet/crypto-transactions", "CRYPTO"))}
          operationReceipt={renderOperationReceipt("DIGITAL")}
          isUsdt={false}
          readOnly={isReadOnlyMemberView}
          balanceFontSize="1.65rem"
          preActionsContent={
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between px-1 text-xs">
                <span className="font-semibold" style={{ color: G.white }}>我的数字资产</span>
                <span style={{ color: G.whiteDim }}>{visibleDigitalAssetBalances.length > 0 ? "数量 / 估值" : "暂无持仓"}</span>
              </div>
              {visibleDigitalAssetBalances.length > 0 ? <div className="overflow-hidden rounded-xl" style={{ background: "rgba(0,0,0,0.14)", border: `1px solid ${G.divider}` }}>
              {visibleDigitalAssetBalances.map((asset: any, index: number) => {
                const assetCode = String(asset.assetCode || "").toUpperCase() as DigitalAssetHistoryCode;
                const amount = Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0)));
                const availableAmount = Number(asset.availableBalance ?? 0);
                const frozenAmount = Number(asset.frozenBalance ?? 0);
                const valueUsdt = amount * Number(asset.priceUsdt ?? 0);
                const valueCny = valueUsdt * 7.25;
                const hasCollateral = frozenAmount > 0;
                const assetAccent = assetCode === "USDT" ? "#26A17B" : assetCode === "ETH" ? "#627EEA" : assetCode === "BTC" ? "#F7931A" : assetCode === "SOL" ? "#A55CFF" : assetCode === "BNB" ? "#F3BA2F" : assetCode === "SUI" ? "#4DA2FF" : "#8AA0B8";
                const assetIconSrc = getCryptoAssetIconSrc(assetCode);
                return (
                  <div key={assetCode} className="relative px-3 py-3" style={{ background: hasCollateral ? "linear-gradient(90deg, rgba(201,168,76,0.075) 0%, rgba(201,168,76,0.018) 42%, transparent 72%)" : "transparent", borderBottom: index < visibleDigitalAssetBalances.length - 1 ? "1px solid rgba(255,255,255,0.10)" : "none" }}>
                    {hasCollateral && <div className="absolute inset-y-3 left-0 w-px rounded-full" style={{ background: "linear-gradient(180deg, transparent, rgba(245,215,142,0.82), transparent)" }} />}
                    <div className="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] grid-rows-[1.25rem_1rem_1rem] items-start gap-x-2.5 text-left">
                      <div className="row-span-3 flex h-9 w-9 shrink-0 items-center justify-center self-start overflow-hidden rounded-full text-xs font-bold" style={{ background: `${assetAccent}25`, color: assetAccent, border: `1px solid ${assetAccent}55` }}>
                        {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : assetCode.slice(0, 1)}
                      </div>
                      <div className="min-w-0 truncate text-sm font-semibold leading-5" style={{ color: G.white }}>{assetCode}</div>
                      <div className="shrink-0 text-right text-xl font-bold leading-5 tabular-nums" style={{ color: G.white }}>{mask(formatDigitalAssetAmount(assetCode, amount))}</div>
                      <div className="min-w-0 truncate text-[10px] leading-4 tabular-nums" style={{ color: G.whiteDim }}>可用 {mask(formatDigitalAssetAmount(assetCode, availableAmount))} {assetCode}</div>
                      <div className="shrink-0 text-right text-[11px] leading-4 tabular-nums" style={{ color: G.whiteDim }}>{Number(asset.priceUsdt ?? 0) > 0 ? `≈ ${mask(valueUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))} u` : "行情加载中"}</div>
                      <div className="min-w-0 truncate text-[10px] leading-4 tabular-nums" style={{ color: hasCollateral ? G.goldLight : G.whiteDim }}>担保 {mask(formatDigitalAssetAmount(assetCode, frozenAmount))} {assetCode}</div>
                      <div className="shrink-0 text-right text-[11px] leading-4 tabular-nums" style={{ color: G.whiteDim }}>{Number(asset.priceUsdt ?? 0) > 0 ? `≈ ${mask(valueCny.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))}元` : "—"}</div>
                    </div>
                    </div>
                );
              })}
              </div> : <div className="flex min-h-28 flex-col items-center justify-center rounded-xl px-5 py-4 text-center" style={{ background: "rgba(255,255,255,0.025)", border: `1px dashed ${G.divider}` }}>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.20)" }}>
                  <WalletIcon className="h-4 w-4" style={{ color: G.goldDim }} />
                </div>
                <p className="text-xs font-medium" style={{ color: G.whiteDim }}>暂无持仓资产</p>
                <p className="mt-1 text-[10px] leading-4" style={{ color: G.whiteDim }}>数字币到账后，将在这里展示数量、估值与担保占用。</p>
              </div>}
            </div>
          }
          txList={
              <div id="digital-wallet-history" className="mt-3 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                <div className="mb-2 flex items-center gap-2">
                  <div>
                    <span className="text-xs font-semibold" style={{ color: G.white }}>明细快览</span>
                    <span className="ml-1.5 text-[10px]" style={{ color: G.whiteDim }}>最近 10 笔</span>
                  </div>
                </div>
                {recentDigitalTx.length > 0 ? recentDigitalTx.map((item: any, index: number) => {
                  const change = Number(item.amount ?? 0);
                  const assetCode = String(item.assetCode || "").toUpperCase();
                  const presentation = item.flowKind === "usdt" ? getUsdtFlowPresentation(item) : getDigitalFlowPresentation(item);
                  // 转账对象已经提升到主标题；不要再把编号、金额等审计元数据挤到预览第一屏。
                  const flowDetail = presentation.detail || (item.flowKind === "usdt" ? undefined : cleanWalletFlowNote(item.note));
                  const assetIconSrc = getCryptoAssetIconSrc(assetCode);
                  return (
                    <div
                      key={`digital-flow-${item.id ?? index}`}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left"
                      style={{ borderBottom: index < recentDigitalTx.length - 1 ? `1px solid ${G.divider}` : "none" }}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${G.cardBorder}` }}>
                          {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : <span className="text-[10px] font-bold" style={{ color: G.goldLight }}>{assetCode.slice(0, 1)}</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <WalletFlowTypeBadge label={presentation.label} note={flowDetail || item.note} isIn={presentation.isIn} />
                            <span className="truncate text-xs font-medium" style={{ color: G.white }}>{presentation.label} · {assetCode}</span>
                          </div>
                          <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(item.createdAt)}</div>
                          {flowDetail && <div className="mt-0.5 max-w-48 truncate text-[10px]" style={{ color: G.whiteDim }}>{flowDetail}</div>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold tabular-nums" style={{ color: presentation.isIn ? G.green : G.red }}>
                          {presentation.isIn ? "+" : "-"}{mask(formatDigitalAssetAmount(assetCode, Math.abs(change)))} {assetCode}
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: G.whiteDim }}>{presentation.status || statusText(item.status || "completed")}</div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-4 text-center text-xs" style={{ color: G.whiteDim }}>暂无数字币资金明细</div>
                )}
              </div>
          }
        />}

      </div>

      {/* ── 弹窗 ── */}
      {modal === "recharge" && (
        <div className="fixed inset-0 z-50">
          <Recharge
            ledgerId={isGlobalWalletLedgerEntry ? 52 : undefined}
            onClose={() => setModal(null)}
            onOperationSubmitted={({ amount, currency, referenceNo }) => recordOperationReceipt({
              account: "DIGITAL", operation: "充值", amount, currency, referenceNo,
              status: "确认已提交", balanceState: "pending",
            })}
          />
        </div>
      )}
      {modal === "withdraw" && (
        <div className="fixed inset-0 z-50">
          <Withdraw
            ledgerId={isGlobalWalletLedgerEntry ? 52 : undefined}
            onClose={() => setModal(null)}
            onOperationSubmitted={({ amount, currency, referenceNo }) => recordOperationReceipt({
              account: "DIGITAL", operation: "提现", amount, currency, referenceNo,
              status: "申请已提交", balanceState: "pending",
            })}
          />
        </div>
      )}
      {modal === "cny-recharge" && (
        <BottomSheet title="人民币充值" onClose={() => setModal(null)}>
          <CnyRechargeContent onClose={() => setModal(null)} />
        </BottomSheet>
      )}
      {modal === "cny-withdraw" && (
        <BottomSheet title="人民币提现" onClose={() => setModal(null)}>
          <CnyWithdrawContent cnyBalance={cnyAvailableBalance} onClose={() => setModal(null)} />
        </BottomSheet>
      )}
      {modal === "crypto-transfer-select" && (
        <BottomSheet title="选择转账币种" onClose={() => setModal(null)}>
          <div className="space-y-2 px-5 pb-7 pt-4">
            <p className="text-xs leading-5" style={{ color: G.whiteDim }}>请选择要进行站内转账的币种；每种数字资产独立记账、独立校验余额。</p>
            {visibleDigitalAssetBalances.map((asset: any) => {
              const assetCode = String(asset.assetCode || "").toUpperCase() as DigitalAssetHistoryCode;
              const amount = Number(asset.availableBalance ?? 0);
              const frozenAmount = Number(asset.frozenBalance ?? 0);
              const valueUsdt = amount * Number(asset.priceUsdt ?? 0);
              const assetIconSrc = getCryptoAssetIconSrc(assetCode);
              return (
                <button
                  key={`transfer-${assetCode}`}
                  type="button"
                  disabled={amount <= 0}
                  onClick={() => { setTransferAsset(assetCode); setModal("transfer"); }}
                  className="flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left active:scale-[0.99] disabled:opacity-45"
                  style={{ background: G.whiteFaint, border: `1px solid ${G.cardBorder}` }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${G.cardBorder}` }}>
                      {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : <span className="text-xs font-bold" style={{ color: G.goldLight }}>{assetCode.slice(0, 1)}</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: G.white }}>{assetCode}</div>
                      <div className="mt-0.5 text-[11px]" style={{ color: G.whiteDim }}>{frozenAmount > 0 ? `可转 ${formatDigitalAssetAmount(assetCode, amount)} · 担保冻结 ${formatDigitalAssetAmount(assetCode, frozenAmount)}` : Number(asset.priceUsdt ?? 0) > 0 ? `≈ ${valueUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} u` : "行情加载中"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold tabular-nums" style={{ color: G.goldLight }}>{formatDigitalAssetAmount(assetCode, amount)}</span>
                    <ChevronRight className="h-4 w-4" style={{ color: G.goldDim }} />
                  </div>
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}
      {modal === "transfer" && (
        <BottomSheet title="站内转账" onClose={() => setModal(null)}>
          <WalletTransferContent
            currency={transferAsset}
            availableBalance={transferAsset === "CNY"
              ? cnyAvailableBalance
              : transferAsset === "USDT"
                ? usdtAvailableBalance
                : Number(multiAssetBalances.find((asset: any) => String(asset.assetCode || "").toUpperCase() === transferAsset)?.availableBalance ?? 0)}
            sourceLedgerId={52}
            onClose={() => setModal(null)}
            onCompleted={({ amount, currency, referenceNo }) => recordOperationReceipt({
              account: currency === "CNY" ? "CNY" : "DIGITAL",
              operation: "转账",
              amount,
              currency,
              referenceNo,
              status: "已完成",
              balanceState: "refreshed",
            })}
          />
        </BottomSheet>
      )}
    </div>
  );
}
