import { useEffect, useRef, useState } from "react";
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
type WalletAccountAsset = WalletTransferAsset | "CRYPTO" | "FOREIGN";
// 数字币账户内，USDT 与其他数字资产共用一个总览；USDT 仍是默认明细口径。
type DigitalAssetHistoryCode = "USDT" | AiWalletSettlementAsset;
type DigitalHistoryFilter = "ALL" | DigitalAssetHistoryCode;

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
  return String(value || "")
    .replace(/^\[CNY\]\s*/i, "")
    .replace(/\[站内转账\]\s*/g, "")
    .trim();
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
  onCompleted: () => void;
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
      onCompleted();
    },
  });
  const multiAssetTransferMutation = trpc.recharge.transferMultiAssetBalance.useMutation({
    onSuccess: (result: any) => {
      setCompleted({ transferNo: String(result.transferNo), amount: String(result.amount) });
      onCompleted();
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
            <div className="flex justify-between gap-4"><span>收款 ID</span><span className="text-right font-mono tracking-[0.12em]" style={{ color: G.goldLight }}>{recipient.paymentId}</span></div>
            <div className="flex justify-between gap-4"><span>昵称</span><span className="text-right" style={{ color: G.white }}>{recipient.nickname || recipient.name}</span></div>
            <div className="flex justify-between gap-4"><span>用户名</span><span className="text-right" style={{ color: G.white }}>@{recipient.username}</span></div>
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
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>收款 ID（邀请码）</div>
        <div className="flex gap-2">
          <input
            value={recipientInput}
            onChange={(event) => {
              setRecipientInput(event.target.value);
              setLookupIdentifier("");
              setConfirming(false);
              setRequestId("");
            }}
            placeholder="请输入六码收款 ID"
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
        <p className="mt-1.5 text-[11px] leading-4" style={{ color: G.whiteDim }}>收款 ID 与专属邀请码一致；也支持完整用户名或完整昵称核验，不提供模糊搜索。</p>
      </div>

      {lookupIdentifier && !recipientQuery.isFetching && recipientResult?.status === "not_found" && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>未找到该用户，请核对六码收款 ID、完整用户名或昵称。</div>
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
            <span style={{ color: G.whiteDim }}>收款 ID</span><span className="font-mono tracking-[0.14em]" style={{ color: G.goldLight }}>{recipient.paymentId}</span>
            <span style={{ color: G.whiteDim }}>昵称</span><span style={{ color: G.white }}>{recipient.nickname || recipient.name}</span>
            <span style={{ color: G.whiteDim }}>用户名</span><span style={{ color: G.white }}>@{recipient.username}</span>
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
  // 52号账本的钱包把稳定币和其他数字资产合并到同一“数字币账户”。
  const isLedger52WalletEntry = searchParams.get("fromLedger") === "52";
  const appendViewAs = (path: string) => viewAsUserId
    ? `${path}${path.includes("?") ? "&" : "?"}viewAs=${viewAsUserId}`
    : path;
  // 钱包详情页会离开本组件；把账户类别保存在 URL 中，返回时才能保持原来的账户上下文。
  const accountFromRoute = searchParams.get("account");
  // 外币独立账本尚未开通真实余额与流水；入口先保留为禁用态，后续接入 USD/HKD/JPY 等资产后再自动激活。
  // 该常量必须在账户路由初始化之前声明，避免旧热更新模块引用未初始化的账户能力。
  const foreignAccountsEnabled = false;
  const initialAccount: WalletAccountAsset = accountFromRoute === "CNY"
    ? "CNY"
    : accountFromRoute === "CRYPTO"
      ? "CRYPTO"
      : accountFromRoute === "FOREIGN"
        ? "FOREIGN"
        : isLedger52WalletEntry
          ? "CRYPTO"
          : "USDT";
  const appendWalletAccount = (path: string, account: WalletAccountAsset) => appendViewAs(
    `${path}${path.includes("?") ? "&" : "?"}account=${account}`,
  );
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [activeAsset, setActiveAsset] = useState<WalletAccountAsset>(initialAccount);
  useEffect(() => {
    setActiveAsset(initialAccount);
  }, [initialAccount]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [transferAsset, setTransferAsset] = useState<WalletTransferAsset>("USDT");
  const [digitalHistoryFilter, setDigitalHistoryFilter] = useState<DigitalHistoryFilter>("USDT");
  // 进入数字币账户时由最近一笔真实流水决定默认筛选；用户主动切换后不自动夺回选择权。
  const autoDigitalHistoryFilterRef = useRef(true);
  useEffect(() => {
    if (activeAsset !== "CRYPTO") autoDigitalHistoryFilterRef.current = true;
  }, [activeAsset]);
  // 转账能力是全局统一钱包能力；当前仅由52号账本首页以该上下文开放按钮。
  const walletReturnPath = appendViewAs(isLedger52WalletEntry ? "/ledger/52" : "/");
  const walletPolicyQuery = trpc.aiWallet.runtimeProfile.useQuery(
    { targetKey: "ledger:52" },
    { enabled: isLedger52WalletEntry, staleTime: 30_000 },
  );
  // 非52入口沿用既有通用钱包显示；52入口严格按项目档案决定是否显示新资金入口。
  const canRecharge = !isLedger52WalletEntry || walletPolicyQuery.data?.allowRecharge === true;
  const canWithdraw = !isLedger52WalletEntry || walletPolicyQuery.data?.allowWithdrawal === true;
  // 52号账本已有转账授权时，配置仍在加载阶段先展示入口；档案明确关闭时才隐藏，服务端也会二次校验。
  const canTransfer = isLedger52WalletEntry && walletPolicyQuery.data?.allowTransfer !== false;

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  // 详情页展示最近 10 笔，因此每个资金来源保留足够的候选记录后再统一排序。
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 20 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 20 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 20 });
  const recentBalanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 20 });
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 20 });
  const multiAssetBalancesQuery = trpc.recharge.getMultiAssetBalances.useQuery(
    viewAsUserId ? { viewAsUserId } : undefined,
    {
    enabled: isLedger52WalletEntry,
    staleTime: 15_000,
    },
  );
  // 多币种按币种分组显示各自最近 10 笔；取足够总量避免单币种被其他币种挤出。
  const multiAssetHistoryQuery = trpc.recharge.getMultiAssetHistory.useQuery({
    limit: 100,
    ...(viewAsUserId ? { viewAsUserId } : {}),
  }, {
    enabled: isLedger52WalletEntry,
    staleTime: 15_000,
  });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const usdtToCny = balance * 7.25;
  const multiAssetBalances = (multiAssetBalancesQuery.data ?? []) as any[];
  const multiAssetHistory = (multiAssetHistoryQuery.data ?? []) as any[];
  const configuredSettlementAssets = new Set(
    ((walletPolicyQuery.data?.visibleAssets ?? []) as string[]).map((asset) => String(asset).toUpperCase()),
  );
  // 数字币账户只收纳项目允许且用户实际持有的币种；冻结担保也属于持有资产，不能因可用额为0而消失。
  const visibleMultiAssetBalances = multiAssetBalances.filter((asset) =>
    configuredSettlementAssets.has(String(asset.assetCode || "").toUpperCase())
    && Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0))) > 0,
  );
  // 稳定币也是数字资产：有 USDT 时固定置顶；0 余额不占用资产列表位置。
  const visibleDigitalAssetBalances = [
    ...(balance > 0 ? [{
      assetCode: "USDT",
      totalBalance: balance,
      availableBalance: balance,
      frozenBalance: 0,
      priceUsdt: 1,
      isStablecoin: true,
    }] : []),
    ...visibleMultiAssetBalances.filter((asset) => String(asset.assetCode || "").toUpperCase() !== "USDT"),
  ];
  const hasDigitalAssets = visibleDigitalAssetBalances.length > 0;
  const digitalHistoryAssetCodes = Array.from(new Set([
    "USDT",
    ...visibleMultiAssetBalances.map((asset) => String(asset.assetCode || "").toUpperCase()),
    ...multiAssetHistory.map((item) => String(item.assetCode || "").toUpperCase()),
  ])).filter((asset): asset is DigitalAssetHistoryCode => (
    asset === "USDT" || ((AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(asset)
      && configuredSettlementAssets.has(asset))
  ));
  const cryptoTotalUsdt = visibleMultiAssetBalances.reduce(
    (total, asset) => total + Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0))) * Number(asset.priceUsdt ?? 0),
    0,
  );
  const digitalTotalUsdt = balance + cryptoTotalUsdt;
  const digitalAvailableUsdt = balance + visibleMultiAssetBalances.reduce(
    (total, asset) => total + Number(asset.availableBalance ?? 0) * Number(asset.priceUsdt ?? 0),
    0,
  );
  const digitalFrozenUsdt = visibleMultiAssetBalances.reduce(
    (total, asset) => total + Number(asset.frozenBalance ?? 0) * Number(asset.priceUsdt ?? 0),
    0,
  );
  const cryptoAccountLabel = hasDigitalAssets ? `数字币账户 · ${visibleDigitalAssetBalances.length} 项` : "数字币账户 · 暂无资产";
  const foreignAccountLabel = foreignAccountsEnabled ? "外币账户" : "外币账户 · 暂无资产";
  const accountMenuItems: Array<{ value: WalletAccountAsset; label: string; enabled: boolean }> = isLedger52WalletEntry
    ? [
      // 数字币账户始终可进入：即使当前没有资产，也可以使用其中的 USDT 充值通道。
      { value: "CRYPTO", label: cryptoAccountLabel, enabled: true },
      { value: "CNY", label: "人民币账户 · CNY", enabled: true },
      { value: "FOREIGN", label: foreignAccountLabel, enabled: foreignAccountsEnabled },
    ]
    : [
      { value: "USDT", label: "稳定币账户 · USDT", enabled: true },
      { value: "CNY", label: "人民币账户 · CNY", enabled: true },
    ];
  const currentAccountLabel = accountMenuItems.find((item) => item.value === activeAsset)?.label || (isLedger52WalletEntry ? "数字币账户" : "稳定币账户 · USDT");
  const activeAssetDetailsPath = activeAsset === "USDT"
    ? appendWalletAccount("/wallet/transactions?fromLedger=52", "USDT")
    : activeAsset === "CNY"
      ? appendWalletAccount("/wallet/cny-transactions?fromLedger=52", "CNY")
      : activeAsset === "CRYPTO"
        ? appendWalletAccount("/wallet/crypto-transactions?fromLedger=52", "CRYPTO")
        : "";

  const recentUsdtTx = (() => {
    const recharges = (recentRechargeQuery.data ?? []).map((r: any) => ({
      id: `r-${r.id}`, sourceType: "recharge",
      amount: Number(r.amount), status: r.status, createdAt: r.createdAt,
      note: "", wcCode: null,
    }));
    const withdraws = (recentWithdrawQuery.data ?? []).map((w: any) => ({
      id: `w-${w.id}`, sourceType: "withdraw",
      amount: -Math.abs(Number(w.amount)), status: w.status, createdAt: w.createdAt,
      note: "", wcCode: null,
    }));
    const manuals = (recentManualQuery.data ?? [])
      .filter((m: any) => !(m.note || "").startsWith("[CNY]"))
      .map((m: any) => {
        const note = String(m.note || "");
        const amount = Number(m.amount);
        return {
          id: `m-${m.id}`,
          sourceType: "manual",
          amount, status: "completed" as const,
          note,
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
  // 先合并、排序所有真实数字币流水：最近一笔决定首次打开时的智能筛选币种。
  // 担保冻结/解冻属于余额内部状态搬移，不作为用户资金流水展示；冻结金额仍在资产卡片中可见。
  const allRecentDigitalTx = [
    ...recentUsdtTx.map((item) => ({ ...item, assetCode: "USDT", flowKind: "usdt" as const })),
    ...multiAssetHistory
      .filter((item: any) => configuredSettlementAssets.has(String(item.assetCode || "").toUpperCase()))
      .filter((item: any) => item.eventType !== "collateral_lock" && item.eventType !== "collateral_release")
      .map((item: any) => ({ ...item, flowKind: "asset" as const })),
  ]
    .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const latestDigitalHistoryAsset = String(allRecentDigitalTx[0]?.assetCode || "").toUpperCase() as DigitalAssetHistoryCode | "";
  // 交易所式顺序：全部、USDT 固定在前；最近变动币种固定第三位，其余币种顺延。
  const digitalHistoryFilterOptions: DigitalHistoryFilter[] = [
    "ALL",
    "USDT",
    ...(latestDigitalHistoryAsset && latestDigitalHistoryAsset !== "USDT" ? [latestDigitalHistoryAsset] : []),
    ...digitalHistoryAssetCodes.filter((code) => code !== "USDT" && code !== latestDigitalHistoryAsset),
  ];
  useEffect(() => {
    if (activeAsset === "CRYPTO" && autoDigitalHistoryFilterRef.current) {
      setDigitalHistoryFilter(latestDigitalHistoryAsset || "USDT");
    }
  }, [activeAsset, latestDigitalHistoryAsset]);
  const recentDigitalTx = allRecentDigitalTx
    .filter((item: any) => digitalHistoryFilter === "ALL" || String(item.assetCode || "").toUpperCase() === digitalHistoryFilter)
    .slice(0, 10);

  const mask = (v: string) => hideBalance ? "••••••" : v;

  // 账户卡片通用渲染
  const AccountCard = ({
    icon, label, balance: bal, unit, subLine, balanceCaption,
    txPath, onRefresh, onRecharge, onWithdraw, onTransfer, onDetails,
    txList, isUsdt, readOnly = false, showDetails = true, rechargeDisabled = false, withdrawDisabled = false, transferProminent = false, balanceFontSize = "2rem",
  }: {
    icon: string; label: string; balance: string; unit: string; subLine?: React.ReactNode; balanceCaption?: string;
    txPath: string; onRefresh: () => void; onRecharge?: () => void; onWithdraw?: () => void; onTransfer?: () => void; onDetails?: () => void;
    txList: React.ReactNode; isUsdt: boolean; readOnly?: boolean; showDetails?: boolean;
    rechargeDisabled?: boolean; withdrawDisabled?: boolean; transferProminent?: boolean; balanceFontSize?: string;
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
              aria-label="返回52号账本"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: G.goldLight }} />
            </button>
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
                        onClick={() => {
                          setActiveAsset(item.value);
                          setIsAccountMenuOpen(false);
                          // 同步地址，确保进入币种详情后返回仍保留当前账户，不回落到稳定币账户。
                          const params = new URLSearchParams(searchParams);
                          if (item.value === "USDT") params.delete("account");
                          else params.set("account", item.value);
                          setLocation(`/wallet${params.toString() ? `?${params.toString()}` : ""}`);
                        }}
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

        {/* 操作按钮：项目档案关闭入口后不渲染，服务端仍会二次校验。 */}
        {(onRecharge || onWithdraw || onTransfer) && (
          <div className={`grid gap-2 mb-0.5 ${[onRecharge, onWithdraw, onTransfer].filter(Boolean).length === 3 ? "grid-cols-3" : [onRecharge, onWithdraw, onTransfer].filter(Boolean).length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
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
                style={transferProminent ? {
                  background: `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 50%, ${G.gold} 100%)`,
                  boxShadow: "0 2px 8px rgba(201,168,76,0.28)",
                  color: "#000",
                  opacity: readOnly ? 0.45 : 1,
                } : { background: G.goldFaint, border: `1px solid ${G.goldDim}`, color: G.goldLight, opacity: readOnly ? 0.45 : 1 }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>转账</span>
              </button>
            )}
          </div>
        )}
        {readOnly && (onRecharge || onWithdraw || onTransfer) && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10px] leading-4" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${G.divider}`, color: G.whiteDim }}>
            <Eye className="mt-0.5 h-3 w-3 shrink-0" style={{ color: G.goldDim }} />
            <span>成员只读视角：资金操作仅该成员本人可用；“明细”和“刷新”仍可正常使用。</span>
          </div>
        )}
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
          balance={mask(balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          subLine={!hideBalance && (
            <div className="flex items-center space-x-1 mt-0.5" style={{ color: G.goldDim }}>
              <span className="text-xs">≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
            </div>
          )}
          txPath="/wallet/transactions"
          onRefresh={() => balanceQuery.refetch()}
          onRecharge={canRecharge ? () => setModal("recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("withdraw") : undefined}
          onTransfer={canTransfer ? () => { setTransferAsset("USDT"); setModal("transfer"); } : undefined}
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
                        {!(tx as any).wcCode && (
                          <div className="text-xs font-medium" style={{ color: G.white }}>
                            {presentation.label}
                          </div>
                        )}
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
            <span className="text-xs" style={{ color: G.goldDim }}>≈ {(cnyBalance / 7.25).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          )}
          txPath="/wallet/cny-transactions"
          onRefresh={() => cnyBalanceQuery.refetch()}
          onRecharge={canRecharge ? () => setModal("cny-recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("cny-withdraw") : undefined}
          onTransfer={canTransfer ? () => { setTransferAsset("CNY"); setModal("transfer"); } : undefined}
          isUsdt={false}
          readOnly={isReadOnlyMemberView}
          txList={
            recentCnyTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                {recentCnyTx.map((tx, idx) => (
                  <div
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
                        {!(tx as any).wcCode && (
                          <div className="text-xs font-medium" style={{ color: G.white }}>
                            {tx.note || (tx.isIn ? "充值" : "提现")}
                          </div>
                        )}
                        <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div
                      className="text-sm font-bold tabular-nums"
                      style={{ color: tx.isIn ? G.green : G.red }}
                    >
                      {tx.isIn ? "+" : "-"}{mask(tx.amount.toFixed(2))} CNY
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: `1px solid ${G.divider}`, color: G.whiteDim }}>
                暂无交易记录
              </div>
            )
          }
        />}

        {/* 数字币汇总入口：下拉不再随持币种类无限增长；每个币种保留独立余额和流水。 */}
        {isLedger52WalletEntry && activeAsset === "CRYPTO" && <AccountCard
          icon="₿"
          label="数字币账户"
          balance={mask(digitalTotalUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          balanceCaption="总资产估值"
          subLine={!hideBalance && <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${G.divider}` }}>
              <div className="text-[10px]" style={{ color: G.whiteDim }}>可用资产</div>
              <div className="mt-0.5 text-xs font-semibold tabular-nums" style={{ color: G.white }}>≈ {digitalAvailableUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u</div>
            </div>
            <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${G.divider}` }}>
              <div className="text-[10px]" style={{ color: G.whiteDim }}>资产构成</div>
              <div className="mt-0.5 text-xs font-semibold" style={{ color: G.white }}>{visibleDigitalAssetBalances.length} 种资产{digitalFrozenUsdt > 0 ? ` · 冻结 ≈ ${digitalFrozenUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} u` : ""}</div>
            </div>
            <div className="col-span-2 flex items-center justify-between px-0.5 text-[10px]" style={{ color: G.goldDim }}>
              <span>≈ ¥{(digitalTotalUsdt * 7.25).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
              <span>按实时行情估值</span>
            </div>
          </div>}
          txPath=""
          onRefresh={() => { void balanceQuery.refetch(); void recentRechargeQuery.refetch(); void recentWithdrawQuery.refetch(); void recentManualQuery.refetch(); void recentBalanceHistoryQuery.refetch(); void multiAssetBalancesQuery.refetch(); void multiAssetHistoryQuery.refetch(); }}
          // USDT 已并入数字币账户，充值和提现仍按 USDT 的既有真实通道执行。
          onRecharge={canRecharge ? () => setModal("recharge") : undefined}
          onWithdraw={canWithdraw ? () => setModal("withdraw") : undefined}
          onTransfer={canTransfer ? () => setModal("crypto-transfer-select") : undefined}
          onDetails={() => setLocation(appendWalletAccount("/wallet/crypto-transactions?fromLedger=52", "CRYPTO"))}
          isUsdt={false}
          readOnly={isReadOnlyMemberView}
          transferProminent
          balanceFontSize="1.65rem"
          txList={
            <div id="digital-wallet-history" className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
              <div className="mb-2 flex items-center justify-between px-1 text-xs">
                <span className="font-semibold" style={{ color: G.white }}>我的数字资产</span>
                <span style={{ color: G.whiteDim }}>数量 / 估值（u）</span>
              </div>
              <div className="overflow-hidden rounded-xl" style={{ background: "rgba(0,0,0,0.14)", border: `1px solid ${G.divider}` }}>
              {visibleDigitalAssetBalances.map((asset: any, index: number) => {
                const assetCode = String(asset.assetCode || "").toUpperCase() as DigitalAssetHistoryCode;
                const amount = Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0)));
                const availableAmount = Number(asset.availableBalance ?? 0);
                const frozenAmount = Number(asset.frozenBalance ?? 0);
                const valueUsdt = amount * Number(asset.priceUsdt ?? 0);
                const assetDigits = assetCode === "USDT" ? 2 : 8;
                const assetAccent = assetCode === "USDT" ? "#26A17B" : assetCode === "ETH" ? "#627EEA" : assetCode === "BTC" ? "#F7931A" : assetCode === "SOL" ? "#A55CFF" : assetCode === "BNB" ? "#F3BA2F" : assetCode === "SUI" ? "#4DA2FF" : "#8AA0B8";
                const assetIconSrc = getCryptoAssetIconSrc(assetCode);
                return (
                  <div key={assetCode} className="px-3 py-3" style={{ borderBottom: index < visibleDigitalAssetBalances.length - 1 ? `1px solid ${G.divider}` : "none" }}>
                    <div className="flex w-full min-w-0 items-center justify-between gap-2 text-left">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold" style={{ background: `${assetAccent}25`, color: assetAccent, border: `1px solid ${assetAccent}55` }}>
                          {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : assetCode.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" style={{ color: G.white }}>{assetCode}</div>
                          <div className="mt-0.5 text-[10px]" style={{ color: G.whiteDim }}>可用 {mask(availableAmount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits }))} {assetCode}</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-right">
                        <div>
                        <div className="text-lg font-bold tabular-nums" style={{ color: G.white }}>{mask(amount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits }))} <span className="text-[11px] font-semibold" style={{ color: G.whiteDim }}>{assetCode}</span></div>
                        <div className="text-[11px]" style={{ color: G.whiteDim }}>{Number(asset.priceUsdt ?? 0) > 0 ? `≈ ${mask(valueUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))} u` : "行情加载中"}</div>
                        {frozenAmount > 0 && <div className="mt-0.5 text-[10px]" style={{ color: G.goldDim }}>担保冻结 {mask(frozenAmount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits }))}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold" style={{ color: G.white }}>最近资金明细</span>
                    <span className="ml-1.5 text-[10px]" style={{ color: G.whiteDim }}>仅显示最近 10 笔</span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: G.whiteFaint, color: G.whiteDim }}>按币种筛选</span>
                </div>
                <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="筛选数字币资金明细">
                  {digitalHistoryFilterOptions.map((code) => {
                    const selected = digitalHistoryFilter === code;
                    const assetIconSrc = code === "ALL" ? null : getCryptoAssetIconSrc(code);
                    return <button
                      key={code}
                      type="button"
                      onClick={() => {
                        autoDigitalHistoryFilterRef.current = false;
                        setDigitalHistoryFilter(code);
                      }}
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors"
                      style={{
                        background: selected ? "linear-gradient(135deg, #F5D78E 0%, #C9A84C 100%)" : G.whiteFaint,
                        color: selected ? "#15110A" : G.whiteDim,
                        border: selected ? "1px solid transparent" : `1px solid ${G.cardBorder}`,
                        boxShadow: selected ? "0 2px 8px rgba(201,168,76,0.22)" : "none",
                      }}
                    >
                      {assetIconSrc && <img src={assetIconSrc} alt="" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full object-contain" />}
                      {code === "ALL" ? "全部" : code}
                    </button>;
                  })}
                </div>
                {recentDigitalTx.length > 0 ? recentDigitalTx.map((item: any, index: number) => {
                  const change = Number(item.amount ?? 0);
                  const assetCode = String(item.assetCode || "").toUpperCase();
                  const presentation = item.flowKind === "usdt" ? getUsdtFlowPresentation(item) : getDigitalFlowPresentation(item);
                  // 转账对象已经提升到主标题；不要再把编号、金额等审计元数据挤到预览第一屏。
                  const flowDetail = presentation.detail || (item.flowKind === "usdt" ? undefined : cleanWalletFlowNote(item.note));
                  const amountDigits = assetCode === "USDT" ? 2 : 8;
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
                          <div className="text-xs font-medium" style={{ color: G.white }}>{presentation.label} · {assetCode}</div>
                          <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(item.createdAt)}</div>
                          {flowDetail && <div className="mt-0.5 max-w-48 truncate text-[10px]" style={{ color: G.whiteDim }}>{flowDetail}</div>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold tabular-nums" style={{ color: presentation.isIn ? G.green : G.red }}>
                          {presentation.isIn ? "+" : "-"}{mask(Math.abs(change).toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: amountDigits }))} {assetCode}
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: G.whiteDim }}>{presentation.status || statusText(item.status || "completed")}</div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-4 text-center text-xs" style={{ color: G.whiteDim }}>暂无数字币资金明细</div>
                )}
              </div>
            </div>
          }
        />}

      </div>

      {/* ── 弹窗 ── */}
      {modal === "recharge" && (
        <div className="fixed inset-0 z-50">
          <Recharge ledgerId={isLedger52WalletEntry ? 52 : undefined} onClose={() => setModal(null)} />
        </div>
      )}
      {modal === "withdraw" && (
        <div className="fixed inset-0 z-50">
          <Withdraw ledgerId={isLedger52WalletEntry ? 52 : undefined} onClose={() => setModal(null)} />
        </div>
      )}
      {modal === "cny-recharge" && (
        <BottomSheet title="人民币充值" onClose={() => setModal(null)}>
          <CnyRechargeContent onClose={() => setModal(null)} />
        </BottomSheet>
      )}
      {modal === "cny-withdraw" && (
        <BottomSheet title="人民币提现" onClose={() => setModal(null)}>
          <CnyWithdrawContent cnyBalance={cnyBalance} onClose={() => setModal(null)} />
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
              const assetDigits = assetCode === "USDT" ? 2 : 8;
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
                      <div className="mt-0.5 text-[11px]" style={{ color: G.whiteDim }}>{frozenAmount > 0 ? `可转 ${amount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits })} · 担保冻结 ${frozenAmount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits })}` : Number(asset.priceUsdt ?? 0) > 0 ? `≈ ${valueUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} u` : "行情加载中"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold tabular-nums" style={{ color: G.goldLight }}>{amount.toLocaleString("zh-CN", { minimumFractionDigits: assetCode === "USDT" ? 2 : 0, maximumFractionDigits: assetDigits })}</span>
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
              ? cnyBalance
              : transferAsset === "USDT"
                ? balance
                : Number(multiAssetBalances.find((asset: any) => String(asset.assetCode || "").toUpperCase() === transferAsset)?.availableBalance ?? 0)}
            sourceLedgerId={52}
            onClose={() => setModal(null)}
            onCompleted={() => {
              void balanceQuery.refetch();
              void cnyBalanceQuery.refetch();
              void recentManualQuery.refetch();
              void recentBalanceHistoryQuery.refetch();
              void multiAssetBalancesQuery.refetch();
              void multiAssetHistoryQuery.refetch();
            }}
          />
        </BottomSheet>
      )}
    </div>
  );
}
