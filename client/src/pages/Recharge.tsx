import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Copy, Check, Clock, AlertCircle, CheckCircle2, History, ChevronDown, ChevronUp, FileImage, Link2, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { autoCompressImage } from "../utils/imageUtils";
import QRCode from "qrcode";

const RECHARGE_NETWORKS = [
  { code: "TRC20", label: "TRC20", enabled: true },
  { code: "APTOS", label: "Aptos", enabled: true },
  { code: "SOLANA", label: "Solana", enabled: false },
  { code: "BEP20", label: "BEP20", enabled: false },
  { code: "ERC20", label: "ERC20", enabled: false },
] as const;

type RechargeNetwork = (typeof RECHARGE_NETWORKS)[number]["code"];
const MIN_RECHARGE_AMOUNT = 500;

function formatRechargeAmount(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return raw || "0";
  const [integer, fraction = ""] = raw.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${integer}.${trimmedFraction}` : integer;
}

interface RechargeProps {
  hideHeader?: boolean;
  hideBalance?: boolean;
  theme?: "yaban";
  onClose?: () => void;
  onOperationSubmitted?: (operation: { amount: number; currency: "USDT"; referenceNo: string }) => void;
  ledgerId?: number;
}

export default function Recharge({ hideHeader = false, hideBalance = false, theme, onClose, onOperationSubmitted, ledgerId }: RechargeProps = {}) {
  const isYaban = theme === "yaban";
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const fromLedger = searchParams.get('from') === 'ledger';
  const fromLedgerId = searchParams.get('ledgerId');
  const effectiveLedgerId = ledgerId ?? (fromLedgerId ? Number(fromLedgerId) : undefined);
  const viewAsUserId = searchParams.get('viewAs');
  const returnTo = searchParams.get('returnTo');
  const rechargeHistoryPath = fromLedgerId
    ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`
    : '/recharge/history';
  // 仅普通用户充值记录允许恢复待支付订单；订单详情仍在服务端按本人归属校验。
  const resumeOrderNo = !isYaban && !fromLedgerId ? searchParams.get('orderNo') : null;
  const handleBack = () => {
    if (onClose) { onClose(); return; }
    if (returnTo) {
      setLocation(decodeURIComponent(returnTo));
    } else if (resumeOrderNo) {
      setLocation(rechargeHistoryPath);
    } else if (fromLedger && fromLedgerId) {
      setLocation(`/ledger/${fromLedgerId}${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`);
    } else {
      window.history.back();
    }
  };
  // 充值记录入口：牙伴下走 onClose 回钱包再让用户从明细查看；否则原逻辑
  const goHistory = () => {
    if (isYaban && onClose) { onClose(); return; }
    setLocation(rechargeHistoryPath);
  };
  const [amount, setAmount] = useState<string>("");
  const [network, setNetwork] = useState<RechargeNetwork>("TRC20");
  const [order, setOrder] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPaymentProof, setShowPaymentProof] = useState(false);
  const [userTxnHash, setUserTxnHash] = useState("");
  const [paymentProofImage, setPaymentProofImage] = useState("");
  const [paymentProofPreview, setPaymentProofPreview] = useState("");
  const [compressingProofImage, setCompressingProofImage] = useState(false);
  const [showLedgerHistory, setShowLedgerHistory] = useState(false);

  const { data: ledgerHistoryData, isLoading: ledgerHistoryLoading } = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: Number(fromLedgerId), ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}) },
    { enabled: !!fromLedgerId && showLedgerHistory, staleTime: 30000 }
  );
  const ledgerHistoryList: any[] = (ledgerHistoryData as any[]) || [];

  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const submitTransferMutation = trpc.recharge.submitTransfer.useMutation();
  const cancelPendingOrderMutation = trpc.recharge.cancelPendingOrder.useMutation();
  const resumeOrderQuery = trpc.recharge.getOrder.useQuery(
    { orderNo: resumeOrderNo ?? '' },
    { enabled: !!resumeOrderNo }
  );
  const activeOrdersQuery = trpc.recharge.getMyOrders.useQuery(
    { limit: 10 },
    { enabled: !fromLedgerId && !resumeOrderNo }
  );
  const balanceQuery = trpc.recharge.getBalance.useQuery(
    fromLedgerId
      ? { ledgerId: Number(fromLedgerId), ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}) }
      : (viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : undefined)
  );
  const displayBalance = balanceQuery.data;
  const activeRechargeOrder = ((activeOrdersQuery.data as any[]) || []).find((item: any) => {
    return (item.status === 'pending' || item.status === 'submitted')
      && new Date(item.expiresAt).getTime() > Date.now();
  });
  const activeOrderHint = activeRechargeOrder?.status === 'submitted'
    ? '当前有一笔确认中的订单，请等待到账结果后再充值'
    : '当前有一笔待支付订单，请先完成或取消后再充值';

  const leaveConfirmation = () => {
    if (resumeOrderNo) {
      setLocation(rechargeHistoryPath);
      return;
    }
    setOrder(null);
    setShowPaymentProof(false);
    setUserTxnHash("");
    setPaymentProofImage("");
    setPaymentProofPreview("");
  };

  const handleCreateOrder = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < MIN_RECHARGE_AMOUNT) {
      alert(`最低充值金额为 ${MIN_RECHARGE_AMOUNT} USDT`);
      return;
    }
    try {
      const result = await createOrderMutation.mutateAsync({
        amount: numAmount,
        network,
        ...(effectiveLedgerId ? { ledgerId: effectiveLedgerId } : {}),
        ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}),
      });
      setOrder(result);
      setShowPaymentProof(false);
      setUserTxnHash("");
      setPaymentProofImage("");
      setPaymentProofPreview("");
      if (result.walletAddress) {
        const qr = await QRCode.toDataURL(result.walletAddress);
        setQrCode(qr);
      }
      const expiresAt = new Date(result.expiresAt).getTime();
      const now = Date.now();
      setTimeLeft(Math.floor((expiresAt - now) / 1000));
    } catch (error: any) {
      alert(error.message || "创建订单失败");
    }
  };

  const handleSubmitTransfer = async () => {
    if (!order?.orderNo) return;
    setSubmitting(true);
    try {
      const result = await submitTransferMutation.mutateAsync({
        orderNo: order.orderNo,
        ...(userTxnHash.trim() ? { userTxnHash: userTxnHash.trim() } : {}),
        ...(paymentProofImage ? { paymentProofImage } : {}),
      });
      setOrder((current: any) => current ? {
        ...current,
        userTxnHash: (result as any).userTxnHash ?? null,
        paymentProofUrl: (result as any).paymentProofUrl ?? null,
      } : current);
      onOperationSubmitted?.({
        amount: Number(order.amount),
        currency: "USDT",
        referenceNo: String(order.orderNo),
      });
      setSubmitted(true);
    } catch (error: any) {
      alert(error.message || "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentProofImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请上传付款记录截图，仅支持图片文件");
      return;
    }
    setCompressingProofImage(true);
    try {
      const compressed = await autoCompressImage(file, "receipt");
      if (compressed.size > 1024 * 1024) {
        alert("截图压缩后仍超过 1MB，请截取付款信息区域后重试");
        return;
      }
      setPaymentProofImage(compressed.base64);
      setPaymentProofPreview(compressed.base64);
    } catch (error: any) {
      alert(error?.message || "截图处理失败，请重试");
    } finally {
      setCompressingProofImage(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order?.orderNo) return;
    const confirmed = window.confirm('确定取消此充值订单吗？若已发起链上转账，请勿取消；取消后该笔到账将无法自动识别。');
    if (!confirmed) return;

    try {
      await cancelPendingOrderMutation.mutateAsync({ orderNo: order.orderNo });
      setOrder(null);
      setQrCode('');
      setTimeLeft(0);
      setLocation(rechargeHistoryPath);
    } catch (error: any) {
      alert(error.message || '取消订单失败，请稍后重试');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    const savedOrder = resumeOrderQuery.data as any;
    if (!resumeOrderNo || !savedOrder || savedOrder.status !== 'pending') return;
    let cancelled = false;

    const restorePendingOrder = async () => {
      const expiresAt = new Date(savedOrder.expiresAt).getTime();
      const remainingSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const restoredQrCode = savedOrder.walletAddress ? await QRCode.toDataURL(savedOrder.walletAddress) : '';
      if (cancelled) return;
      setOrder(savedOrder);
      setQrCode(restoredQrCode);
      setTimeLeft(remainingSeconds);
      setSubmitted(false);
    };

    restorePendingOrder().catch(() => {
      if (!cancelled) alert('订单恢复失败，请返回充值记录后重试');
    });
    return () => { cancelled = true; };
  }, [resumeOrderNo, resumeOrderQuery.data]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderPaymentProofEntry = (mode: "light" | "dark") => {
    const dark = mode === "dark";
    const accent = dark ? "#CBA471" : "#1E88D6";
    const border = dark ? "#333" : "#E1ECF5";
    const panel = dark ? "rgba(0,0,0,0.22)" : "#F8FCFF";
    const muted = dark ? "text-gray-500" : "text-[#7190A5]";

    return (
      <div className="border-t p-3" style={{ borderColor: dark ? "#2a2a2a" : "#edf2f7" }}>
        <button
          type="button"
          onClick={() => setShowPaymentProof((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: dark ? "rgba(203,164,113,0.12)" : "#EAF4FE" }}>
              <Link2 className="h-4 w-4" style={{ color: accent }} />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${dark ? "text-gray-200" : "text-gray-600"}`}>提交付款凭证 <span className="font-normal text-xs">（可选）</span></span>
              <span className={`block truncate text-[11px] ${muted}`}>粘贴 TxID 可加速核对；支持附付款截图</span>
            </span>
          </span>
          {showPaymentProof ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: accent }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: accent }} />}
        </button>

        {showPaymentProof && (
          <div className="mt-3 space-y-2.5">
            <div>
              <label className={`mb-1 block text-xs font-medium ${dark ? "text-gray-300" : "text-gray-600"}`}>交易哈希（TxID）或 Aptos 交易版本号</label>
              <input
                value={userTxnHash}
                onChange={(event) => setUserTxnHash(event.target.value)}
                placeholder="复制后粘贴，选填"
                maxLength={100}
                className={`w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none placeholder:font-sans ${dark ? "bg-black/30 text-gray-100 placeholder:text-gray-600" : "bg-white text-gray-700 placeholder:text-gray-400"}`}
                style={{ borderColor: border }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-xs font-medium ${dark ? "text-gray-300" : "text-gray-600"}`} style={{ borderColor: accent, background: panel }}>
                <FileImage className="h-4 w-4" style={{ color: accent }} />
                <span>{compressingProofImage ? "图片处理中…" : paymentProofPreview ? "更换付款截图" : "上传付款截图"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={compressingProofImage} onChange={(event) => handlePaymentProofImage(event.target.files?.[0])} />
              </label>
              {paymentProofPreview && (
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: border }}>
                  <img src={paymentProofPreview} alt="付款截图预览" className="h-full w-full object-cover" />
                  <button type="button" aria-label="移除付款截图" onClick={() => { setPaymentProofImage(""); setPaymentProofPreview(""); }} className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/70 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <p className={`text-[10px] leading-4 ${muted}`}>订单创建后 30 分钟内持续扫描。截图仅用于异常核验，最终以链上交易为准。</p>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // ============ 牙伴蓝白主题（theme === "yaban"） ============
  // ============================================================
  if (isYaban) {
    const blueBtn = "w-full py-4 rounded-xl font-semibold text-white tracking-wide";
    const blueBtnStyle = { background: "linear-gradient(135deg,#2196C8,#1E88D6)", boxShadow: "0 6px 18px rgba(30,136,214,0.35)" } as const;
    const ybNav = (title: string, onBack: () => void) => (
      <div className="sticky top-0 z-10" style={{ background: "linear-gradient(135deg,#2196C8,#3BA9E0)" }}>
        <div className="flex items-center px-4 py-3">
          <button onClick={onBack} className="mr-3 flex items-center justify-center w-9 h-9 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
        </div>
      </div>
    );

    // 提交成功页
    if (submitted && order) {
      return (
        <div className="min-h-screen pb-20" style={{ background: "#F4F8FB" }}>
          {ybNav("提交成功", () => { setOrder(null); setSubmitted(false); })}
          <div className="p-4 space-y-4">
            <div className="rounded-2xl p-6 text-center bg-white" style={{ boxShadow: "0 4px 16px rgba(33,150,200,0.12)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(34,197,94,0.12)" }}>
                <CheckCircle2 className="w-9 h-9 text-green-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">转账确认已提交</h2>
              <p className="text-sm text-gray-500">系统将在订单创建后的 30 分钟内扫描链上交易，确认到账后自动入账</p>
            </div>
            <div className="rounded-2xl p-4 space-y-3 bg-white" style={{ boxShadow: "0 4px 16px rgba(33,150,200,0.1)" }}>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-400 text-sm">订单号</span>
                <span className="font-mono text-sm text-gray-700">{order.orderNo}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-400 text-sm">充值金额</span>
                <span className="font-bold tabular-nums text-[#1E88D6]">{formatRechargeAmount(order.amount)} USDT</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-400 text-sm">网络</span>
                <span className="text-gray-700">{order.network}</span>
              </div>
              {(order.userTxnHash || order.paymentProofUrl) && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-400 text-sm">付款凭证</span>
                  <span className="text-xs font-medium text-green-600">{order.userTxnHash ? 'TxID 已提交' : '截图已提交'}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-400 text-sm">状态</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1E88D6]">
                  <Clock className="w-3 h-3 mr-1" />确认中
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <button onClick={() => { if (onClose) onClose(); }} className={blueBtn} style={blueBtnStyle}>
                完成
              </button>
              <button onClick={() => { setOrder(null); setSubmitted(false); }} className="w-full py-4 rounded-xl font-semibold text-[#1E88D6] bg-white border border-[#1E88D6]">
                继续充值
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 确认支付页
    if (order) {
      return (
        <div className="min-h-screen pb-20" style={{ background: "#F4F8FB" }}>
          {ybNav("确认支付", leaveConfirmation)}
          <div className="p-3 space-y-3">
            <div className="overflow-hidden rounded-2xl p-[1px]" style={{ background: timeLeft > 0 ? "linear-gradient(135deg,#2196C8,#8DD4EF,#2196C8)" : "#F7C5C5", boxShadow: "0 4px 16px rgba(33,150,200,0.12)" }}>
              <div className="overflow-hidden rounded-[15px] bg-white">
              {timeLeft > 0 ? (
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F8FCFF" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "#EAF4FE" }}>
                      <Clock className="h-5 w-5 text-[#1E88D6]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#176A9A]">订单待支付</div>
                      <div className="mt-0.5 text-xs text-[#7190A5]">请在有效期内完成链上转账</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#7190A5]">剩余时间</div>
                    <div className="mt-0.5 text-xl font-bold tabular-nums tracking-wide text-[#1E88D6]">{formatTime(timeLeft)}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start px-4 py-3.5" style={{ background: "#FDECEC" }}>
                  <AlertCircle className="mr-3 mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div>
                    <div className="font-medium text-red-500">订单已过期</div>
                    <div className="mt-1 text-xs text-red-400/80">请重新创建充值订单</div>
                  </div>
                </div>
              )}
              <div className="p-3 text-center">
                <div className="mb-1 text-sm text-gray-400">应付金额</div>
                <div className="mb-1 whitespace-nowrap text-[clamp(1.5rem,7vw,2.25rem)] font-bold leading-none tabular-nums text-[#1E88D6]">{formatRechargeAmount(order.amount)}</div>
                <div className="text-sm text-gray-400">USDT</div>
              </div>
              <div className="border-t border-gray-100 p-3">
                <div className="mb-2 text-base font-medium text-gray-500">付款信息</div>
                <div className="mb-2 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#F4F8FB", border: "1px solid #E1ECF5" }}>
                  <span className="text-sm text-gray-500">支付网络</span>
                  <span className="font-bold tabular-nums text-[#1E88D6]">{order.network}</span>
                </div>
                <div className="mb-1.5 text-sm font-medium text-gray-500">付款地址</div>
                <div className="flex items-center rounded-xl p-3" style={{ background: "#F4F8FB", border: "1px solid #E1ECF5" }}>
                  <div className="mr-3 flex-1 break-all font-mono text-base leading-relaxed text-gray-700">{order.walletAddress}</div>
                  <button onClick={() => copyToClipboard(order.walletAddress)} className="flex-shrink-0 rounded-lg p-2.5" style={{ background: copied ? "rgba(34,197,94,0.12)" : "#EAF4FE" }}>
                    {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-[#1E88D6]" />}
                  </button>
                </div>
              </div>
              <div className="border-t border-gray-100 p-3 text-center">
                <div className="mb-2 text-sm text-gray-400">扫码支付</div>
                {qrCode && (
                  <div className="inline-block rounded-xl border border-gray-100 bg-white p-1.5">
                    <img src={qrCode} alt="QR Code" className="h-32 w-32" />
                  </div>
                )}
              </div>
              {renderPaymentProofEntry("light")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleCancelOrder} disabled={cancelPendingOrderMutation.isPending || timeLeft === 0} className="rounded-xl border border-gray-200 bg-white py-3.5 font-semibold text-gray-500 disabled:opacity-50">
                {cancelPendingOrderMutation.isPending ? '取消中...' : '取消订单'}
              </button>
              <button onClick={handleSubmitTransfer} disabled={submitting || timeLeft === 0} className={blueBtn + " py-3.5 disabled:opacity-50"} style={blueBtnStyle}>
                {submitting ? '提交中...' : '我已完成转账'}
              </button>
            </div>
            <div className="rounded-xl p-3" style={{ background: "#FDECEC", border: "1px solid #F7C5C5" }}>
              <div className="mb-1 text-sm font-medium text-red-500">重要提示</div>
              <ul className="space-y-1 text-xs text-red-400">
                <li>· 如您使用OKX（欧易）提币，请务必选择「链上提币」方式</li>
                <li>· 若付款地址同为OKX用户，可能触发「内部转账」，此方式不走链上，系统将无法自动识别到账</li>
                <li>· 提币时如出现"内部转账"提示，请取消并改用链上转账</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    // 主页面
    const quickAmountsY = [500, 1000, 5000, 10000];
    return (
      <div className="min-h-screen pb-20" style={{ background: "#F4F8FB" }}>
        {!hideHeader && (
          <div className="sticky top-0 z-10" style={{ background: "linear-gradient(135deg,#2196C8,#3BA9E0)" }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center">
                <button onClick={handleBack} className="mr-3 flex items-center justify-center w-9 h-9 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-lg font-semibold text-white">充值</h1>
              </div>
              <button onClick={goHistory} className="flex items-center text-sm text-white opacity-90">
                <History className="w-4 h-4 mr-1" />记录
              </button>
            </div>
          </div>
        )}
        <div className="p-4 space-y-4">
          {!hideBalance && (
            <div className="rounded-2xl p-5 bg-white" style={{ boxShadow: "0 4px 16px rgba(33,150,200,0.12)" }}>
              <div className="text-gray-400 text-sm mb-1">当前余额</div>
              <div className="text-3xl font-bold text-[#0E5A9E]">
                {displayBalance != null ? parseFloat(String(displayBalance)).toFixed(2) : '0.00'}
                <span className="text-base font-normal text-gray-400 ml-2">USDT</span>
              </div>
            </div>
          )}
          <div className="rounded-2xl p-4 bg-white" style={{ boxShadow: "0 4px 16px rgba(33,150,200,0.1)" }}>
            <div className="text-sm text-gray-400 mb-3">选择网络</div>
            <div className="flex flex-wrap gap-2">
              {RECHARGE_NETWORKS.filter((item) => item.enabled).map((item) => (
                <button key={item.code} onClick={() => setNetwork(item.code)} className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={network === item.code ? { background: "linear-gradient(135deg,#2196C8,#1E88D6)", color: "#fff" } : { background: "#EAF4FE", color: "#5A7A92" }}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="mb-2 text-[11px] text-gray-400">暂未开放</div>
              <div className="flex flex-wrap gap-2">
                {RECHARGE_NETWORKS.filter((item) => !item.enabled).map((item) => (
                  <button key={item.code} type="button" disabled className="cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-4 bg-white" style={{ boxShadow: "0 4px 16px rgba(33,150,200,0.1)" }}>
            <div className="text-sm text-gray-400 mb-3">充值金额</div>
            <div className="flex items-center rounded-xl px-4 py-3 mb-3" style={{ background: "#F4F8FB", border: "1px solid #E1ECF5" }}>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="请输入金额（≥ 500 USDT）"
                className="flex-1 min-w-0 text-xl font-bold outline-none bg-transparent text-gray-800 placeholder:text-sm placeholder:font-normal placeholder-gray-300" step="1" min={MIN_RECHARGE_AMOUNT} />
              <span className="text-[#1E88D6] text-sm font-medium ml-2">USDT</span>
            </div>
            <div className="flex gap-2">
              {quickAmountsY.map(q => (
                <button key={q} onClick={() => setAmount(String(q))} className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={amount === String(q) ? { background: "#EAF4FE", color: "#1E88D6", border: "1px solid #1E88D6" } : { background: "#F4F8FB", color: "#8AA0B2", border: "1px solid #E1ECF5" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
          {activeRechargeOrder && (
            <button onClick={goHistory} className="w-full rounded-xl border border-[#B9DEF2] bg-[#F5FBFF] px-4 py-3 text-left text-xs text-[#417D9F]">
              <span>{activeOrderHint}</span>
              <span className="ml-2 font-semibold text-[#1E88D6]">前往处理</span>
            </button>
          )}
          <button onClick={handleCreateOrder} disabled={createOrderMutation.isPending || Number(amount) < MIN_RECHARGE_AMOUNT || !!activeRechargeOrder} className={blueBtn + " disabled:opacity-50"} style={blueBtnStyle}>
            {createOrderMutation.isPending ? '创建中...' : activeRechargeOrder ? '已有处理中订单' : '立即充值'}
          </button>
          <div className="rounded-2xl p-4" style={{ background: "#EAF4FE" }}>
            <div className="text-sm font-medium text-[#1E88D6] mb-2">充值说明</div>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li>· 请确认选择正确的网络，转错网络资产无法找回</li>
              <li>· 最低充值金额为 {MIN_RECHARGE_AMOUNT} USDT</li>
              <li>· 充值到账时间通常为1-3分钟</li>
              <li>· 请勿向上述地址转入非 USDT 资产</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ============ 原黑金主题（其它入口，保持不变） ============
  // ============================================================
  const darkBg = "min-h-screen pb-20" ;
  const darkNavBar = "sticky top-0 z-10 border-b border-[#2a2a2a]";

  if (submitted && order) {
    return (
      <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
        <div className={darkNavBar} style={{background:'#111111'}}>
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history')} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
            </button>
            <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">提交成功</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-2xl p-6 text-center" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background:'linear-gradient(135deg,#1a3a1a,#2d5a2d)'}}>
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">转账确认已提交</h2>
            <p className="text-sm text-gray-400">系统将在订单创建后的 30 分钟内扫描链上交易，确认到账后自动入账</p>
          </div>
          <div className="rounded-2xl p-4 space-y-3" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">订单号</span>
              <span className="font-mono text-sm text-white">{order.orderNo}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">充值金额</span>
              <span className="font-bold tabular-nums text-[#CBA471]">{formatRechargeAmount(order.amount)} USDT</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">网络</span>
              <span className="text-white">{order.network}</span>
            </div>
            {(order.userTxnHash || order.paymentProofUrl) && (
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
                <span className="text-gray-400 text-sm">付款凭证</span>
                <span className="text-xs font-medium text-green-400">{order.userTxnHash ? 'TxID 已提交' : '截图已提交'}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400 text-sm">状态</span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-700/50">
                <Clock className="w-3 h-3 mr-1" />确认中
              </span>
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{background:'rgba(203,164,113,0.08)',border:'1px solid rgba(203,164,113,0.2)'}}>
            <div className="text-sm font-medium text-[#CBA471] mb-2">温馨提示</div>
            <ul className="text-xs text-gray-400 space-y-1.5">
              <li>• 通常1-3分钟内即可确认到账</li>
              <li>• 您可以在充值记录中查看订单状态</li>
              <li>• 订单创建满30分钟后将停止自动扫描，后续到账需人工核验</li>
            </ul>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => {
                if (onClose) { onClose(); return; }
                setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history');
              }}
              className="w-full py-4 rounded-xl font-semibold text-black tracking-widest"
              style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
            >
              {onClose ? '返回钱包' : '查看充值记录'}
            </button>
            <button
              onClick={() => { setOrder(null); setSubmitted(false); }}
              className="w-full py-4 rounded-xl font-semibold text-[#CBA471]"
              style={{background:'transparent',border:'1px solid #CBA471'}}
            >
              继续充值
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (order) {
    return (
      <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
        <div className={darkNavBar} style={{background:'#111111'}}>
          <div className="flex items-center px-4 py-3">
            <button onClick={leaveConfirmation} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
            </button>
            <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">确认支付</h1>
          </div>
        </div>
        <div className="p-3 space-y-3">
          <div className="overflow-hidden rounded-2xl p-[1px]" style={{background:timeLeft > 0 ? 'linear-gradient(135deg,rgba(203,164,113,0.9),rgba(232,201,138,0.55),rgba(203,164,113,0.9))' : 'rgba(244,67,54,0.45)',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
            <div className="overflow-hidden rounded-[15px]" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)'}}>
            {timeLeft > 0 ? (
              <div className="flex items-center justify-between px-4 py-3" style={{background:'linear-gradient(135deg,#1b1b1b,#232323)'}}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{background:'rgba(203,164,113,0.14)',border:'1px solid rgba(203,164,113,0.24)'}}>
                    <Clock className="h-5 w-5 text-[#CBA471]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#E8C98A]">订单待支付</div>
                    <div className="mt-0.5 text-xs text-gray-500">请在有效期内完成链上转账</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-500">剩余时间</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums tracking-wide text-[#E8C98A]" style={{textShadow:'0 0 16px rgba(203,164,113,0.25)'}}>{formatTime(timeLeft)}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start px-4 py-3.5" style={{background:'rgba(244,67,54,0.08)'}}>
                <AlertCircle className="mr-3 mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <div className="font-medium text-red-300">订单已过期</div>
                  <div className="mt-1 text-xs text-red-500/80">请重新创建充值订单</div>
                </div>
              </div>
            )}
            <div className="p-3 text-center">
              <div className="mb-1 text-sm text-gray-400">应付金额</div>
              <div className="mb-1 whitespace-nowrap text-[clamp(1.5rem,7vw,2.25rem)] font-bold leading-none tabular-nums text-[#CBA471]" style={{textShadow:'0 0 20px rgba(203,164,113,0.4)'}}>
                {formatRechargeAmount(order.amount)}
              </div>
              <div className="text-gray-400 text-sm">USDT</div>
            </div>
            <div className="border-t border-[#2a2a2a] p-3">
              <div className="mb-2 text-base font-medium text-gray-300">付款信息</div>
              <div className="mb-2 flex items-center justify-between rounded-xl px-3 py-2.5" style={{background:'rgba(0,0,0,0.3)',border:'1px solid #333'}}>
                <span className="text-sm text-gray-400">支付网络</span>
                <span className="font-bold tabular-nums text-[#CBA471]">{order.network}</span>
              </div>
              <div className="mb-1.5 text-sm font-medium text-gray-300">付款地址</div>
              <div className="flex items-center rounded-xl p-3" style={{background:'rgba(0,0,0,0.3)',border:'1px solid #333'}}>
                <div className="mr-3 flex-1 break-all font-mono text-base leading-relaxed text-gray-100">
                  {order.walletAddress}
                </div>
                <button
                  onClick={() => copyToClipboard(order.walletAddress)}
                  className="flex-shrink-0 rounded-lg p-2.5 transition-colors"
                  style={{background: copied ? 'rgba(76,175,80,0.2)' : 'rgba(203,164,113,0.15)',border:`1px solid ${copied ? '#4CAF50' : '#CBA471'}`}}
                >
                  {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5 text-[#CBA471]" />}
                </button>
              </div>
            </div>
            <div className="border-t border-[#2a2a2a] p-3 text-center">
              <div className="mb-2 text-sm text-gray-400">扫码支付</div>
              {qrCode && (
                <div className="inline-block rounded-xl bg-white p-1.5">
                  <img src={qrCode} alt="QR Code" className="h-32 w-32" />
                </div>
              )}
            </div>
            {renderPaymentProofEntry("dark")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCancelOrder}
              disabled={cancelPendingOrderMutation.isPending || timeLeft === 0}
              className="rounded-xl py-3.5 font-semibold tracking-wide text-gray-400 disabled:opacity-50"
              style={{background:'rgba(255,255,255,0.03)',border:'1px solid #3a3a3a'}}
            >
              {cancelPendingOrderMutation.isPending ? '取消中...' : '取消订单'}
            </button>
            <button
              onClick={handleSubmitTransfer}
              disabled={submitting || timeLeft === 0}
              className="rounded-xl py-3.5 font-semibold text-black tracking-widest disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
            >
              {submitting ? '提交中...' : '我已完成转账'}
            </button>
          </div>
          <div className="rounded-xl p-3" style={{background:'rgba(244,67,54,0.08)',border:'1px solid rgba(244,67,54,0.25)'}}>
            <div className="mb-1 text-sm font-medium text-red-300">重要提示</div>
            <ul className="space-y-1 text-xs text-red-400/90">
              <li>• 如您使用OKX（欧易）提币，请务必选择<span className="font-bold text-red-300">「链上提币」</span>方式</li>
              <li>• 若付款地址同为OKX用户，OKX可能自动触发<span className="font-bold text-red-300">「内部转账」</span>，此方式不走链上，系统将无法自动识别到账</li>
              <li>• 提币时如出现"内部转账"提示，请取消并改用链上转账</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const quickAmounts = [500, 1000, 5000, 10000];

  return (
    <>
    <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
      {!hideHeader && (
        <div className={darkNavBar} style={{background:'#111111'}}>
          <div style={{height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <button onClick={handleBack} className="mr-3">
                <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
              </button>
              <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">充值</h1>
            </div>
            <button
              onClick={() => setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history')}
              className="flex items-center text-sm text-[#CBA471] opacity-80"
            >
              <History className="w-4 h-4 mr-1" />记录
            </button>
          </div>
        </div>
      )}
      <div className="p-4 space-y-4">
        {!hideBalance && (
          <div className="rounded-2xl p-5 relative overflow-hidden" style={{background:'linear-gradient(135deg,#1a1a1a 0%,#222222 50%,#1a1a1a 100%)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(203,164,113,0.15)'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
            <div className="text-gray-400 text-sm mb-1">当前余额</div>
            <div className="text-3xl font-bold text-[#CBA471]" style={{textShadow:'0 0 20px rgba(203,164,113,0.4)'}}>
              {displayBalance != null ? parseFloat(String(displayBalance)).toFixed(2) : '0.00'}
              <span className="text-base font-normal text-gray-400 ml-2">USDT</span>
            </div>
          </div>
        )}
        <div className="rounded-2xl p-4" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          <div className="text-sm text-gray-400 mb-3">选择网络</div>
          <div className="flex flex-wrap gap-2">
            {RECHARGE_NETWORKS.filter((item) => item.enabled).map((item) => (
              <button
                key={item.code}
                onClick={() => setNetwork(item.code)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={network === item.code
                  ? {background:'linear-gradient(135deg,#CBA471,#e8c98a)',color:'#111',boxShadow:'0 4px 12px rgba(203,164,113,0.4)'}
                  : {background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid #333'}
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-[#2a2a2a] pt-3">
            <div className="mb-2 text-[11px] text-gray-500">暂未开放</div>
            <div className="flex flex-wrap gap-2">
              {RECHARGE_NETWORKS.filter((item) => !item.enabled).map((item) => (
                <button key={item.code} type="button" disabled className="cursor-not-allowed rounded-xl border border-[#303030] bg-[#171717] px-4 py-2 text-sm font-medium text-[#555]">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-2xl p-4" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          <div className="text-sm text-gray-400 mb-3">充值金额</div>
          <div className="flex items-center rounded-xl px-4 py-3 mb-3" style={{background:'rgba(0,0,0,0.3)',border:'1px solid #333'}}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="请输入金额（≥ 500 USDT）"
              className="flex-1 min-w-0 text-xl font-bold outline-none bg-transparent text-white placeholder:text-sm placeholder:font-normal placeholder-gray-600"
              step="1"
              min={MIN_RECHARGE_AMOUNT}
            />
            <span className="text-[#CBA471] text-sm font-medium ml-2">USDT</span>
          </div>
          <div className="flex gap-2">
            {quickAmounts.map(q => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={amount === String(q)
                  ? {background:'rgba(203,164,113,0.2)',color:'#CBA471',border:'1px solid #CBA471'}
                  : {background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid #333'}
                }
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        {activeRechargeOrder && (
          <button onClick={goHistory} className="w-full rounded-xl px-4 py-3 text-left text-xs text-gray-400" style={{background:'rgba(203,164,113,0.06)',border:'1px solid rgba(203,164,113,0.22)'}}>
            <span>{activeOrderHint}</span>
            <span className="ml-2 font-semibold text-[#CBA471]">前往处理</span>
          </button>
        )}
        <button
          onClick={handleCreateOrder}
          disabled={createOrderMutation.isPending || Number(amount) < MIN_RECHARGE_AMOUNT || !!activeRechargeOrder}
          className="w-full py-4 rounded-xl font-semibold text-black tracking-widest disabled:opacity-50"
          style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
        >
          {createOrderMutation.isPending ? '创建中...' : activeRechargeOrder ? '已有处理中订单' : '立即充值'}
        </button>
        <div className="rounded-2xl p-4" style={{background:'rgba(203,164,113,0.06)',border:'1px solid rgba(203,164,113,0.15)'}}>
          <div className="text-sm font-medium text-[#CBA471] mb-2">充值说明</div>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li>• 请确认选择正确的网络，转错网络资产无法找回</li>
            <li>• 最低充值金额为 {MIN_RECHARGE_AMOUNT} USDT</li>
            <li>• 充值到账时间通常为1-3分钟</li>
            <li>• 请勿向上述地址转入非 USDT 资产</li>
          </ul>
        </div>
        {fromLedgerId && (
          <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a'}}>
            <button
              className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => setShowLedgerHistory(v => !v)}
            >
              <span className="text-sm font-medium text-[#CBA471]">账本充值记录</span>
              {showLedgerHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showLedgerHistory && (
              <div className="border-t border-[#2a2a2a]">
                {ledgerHistoryLoading ? (
                  <div className="p-6 text-center text-gray-500 text-sm">加载中...</div>
                ) : ledgerHistoryList.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">暂无记录</div>
                ) : (
                  <div className="divide-y divide-[#2a2a2a]">
                    {(() => {
                      let runningBalance = 0;
                      const sorted = [...ledgerHistoryList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                      const balances = sorted.map(item => {
                        const amt = parseFloat(String(item.amount));
                        runningBalance += amt;
                        return runningBalance;
                      });
                      return sorted.slice().reverse().map((item, i) => {
                        const revIdx = sorted.length - 1 - i;
                        const amt = parseFloat(String(item.amount));
                        const isPositive = amt >= 0;
                        const date = new Date(item.createdAt);
                        const dateStr = `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                        const rawNote = item.note || '';
                        const orderNoMatch = rawNote.match(/AF\d{12}/);
                        const orderNo = orderNoMatch ? orderNoMatch[0] : null;
                        const cleanNote = rawNote.replace(/\s*AF\d{12}/, '').trim();
                        const typeLabel = item.sourceType === 'recharge'
                          ? (item.status === 'completed' ? '充值到账' : item.status === 'submitted' ? '确认中' : item.status === 'pending' ? '待支付' : cleanNote || '充值')
                          : (cleanNote ? cleanNote.replace('管理员调账', '调账').replace('管理员', '') : '调账');
                        const balanceAfter = balances[revIdx];
                        const showBalance = item.sourceType === 'manual' || (item.sourceType === 'recharge' && item.status === 'completed');
                        return (
                          <div key={item.id || i} className="flex items-start justify-between px-4 py-3">
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="text-gray-300 text-xs leading-snug" style={{wordBreak:'break-all',whiteSpace:'normal',overflowWrap:'anywhere'}}>{typeLabel}</div>
                              <div className="text-gray-600 text-xs mt-0.5">{dateStr}{orderNo && <span className="ml-1">{orderNo}</span>}</div>
                            </div>
                            <div className="flex flex-col items-end">
                              <div className={`text-sm font-semibold whitespace-nowrap ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U
                              </div>
                              {showBalance && (
                                <div className="text-gray-600 text-xs mt-0.5 whitespace-nowrap">余额 {balanceAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
