/**
 * YabanMyPage.tsx
 * 牙伴齿科 · 员工端「我的」页面
 *
 * 功能：
 *  - 展示员工个人信息卡
 *  - 待签约合同列表（含手写签名弹窗）
 *  - 签约历史记录
 *
 * 路由：/yaban/my
 *
 * 接口依赖（需主沙箱补充，见文件末尾 TODO）：
 *  - trpc.yabanStaff.myPendingContracts
 *  - trpc.yabanStaff.signContract
 *  - trpc.yabanStaff.rejectContract
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, FileText, PenLine, CheckCircle, X, AlertCircle, Clock } from "lucide-react";

// ─── 牙伴 UI 规范色值 ────────────────────────────────────────────────────────
const C = {
  brand: "#1E88D6",
  brandGrad: "linear-gradient(135deg,#1E88D6 0%,#3D9FD6 100%)",
  bg: "#F6F8FA",
  white: "#FFFFFF",
  line100: "#ECEFF3",
  line200: "#DBE1E8",
  textWeak: "#9AA7B5",
  textSub: "#647386",
  textMain: "#26303C",
  okBg: "#EAF2EC", okFg: "#3D7A53",
  warnBg: "#F5EEDD", warnFg: "#9A6E1F",
  dangerBg: "#F7E9E7", dangerFg: "#A8463C",
  infoBg: "#E9F1F8", infoFg: "#1B6FA8",
} as const;

// ─── Mock 数据 ─────────────────────────────────────────────────────────────────
// TODO: 替换为 trpc.yabanStaff.myPendingContracts.useQuery({ staffId: currentUser.staffId })
const MOCK_STAFF = {
  name: "洪紫钥",
  role: "院长",
  clinic: "恒愿口腔",
  joinDate: "2019-03-15",
};

const MOCK_PENDING = [
  {
    id: 1,
    type: "劳动合同",
    startDate: "2025-03-15",
    endDate: "2028-03-14",
    initiatedBy: "人事部",
    initiatedAt: "2025-03-10",
    remark: "三年期劳动合同续签，请确认后签署",
    status: "pending",
  },
];

const MOCK_HISTORY = [
  {
    id: 2,
    type: "保密协议",
    startDate: "2019-03-15",
    endDate: "长期有效",
    signedAt: "2019-03-15",
    status: "signed",
  },
];

// ─── 手写签名画布 ─────────────────────────────────────────────────────────────
function SignatureCanvas({ onSigned, onClear }: {
  onSigned: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasSigned, setHasSigned] = useState(false);

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#26303C";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasSigned(true);
  }

  function endDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    drawing.current = false;
    lastPos.current = null;
    if (hasSigned) {
      onSigned(canvasRef.current!.toDataURL());
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    onClear();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px]" style={{ color: C.textSub }}>请在下方手写签名</span>
        <button onClick={clear} className="text-[12px]" style={{ color: C.infoFg }}>清除重签</button>
      </div>
      <div
        className="rounded-[12px] overflow-hidden relative"
        style={{ backgroundColor: "#FAFBFC", border: `1.5px dashed ${C.line200}` }}
      >
        <canvas
          ref={canvasRef}
          width={380}
          height={120}
          style={{ display: "block", width: "100%", height: 120, touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSigned && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-1">
              <PenLine size={20} strokeWidth={1} style={{ color: C.textWeak, opacity: 0.4 }} />
              <span className="text-[11px]" style={{ color: C.textWeak }}>在此处手写签名</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 签约弹窗 ─────────────────────────────────────────────────────────────────
function SignModal({ contract, onClose, onSign, onReject }: {
  contract: typeof MOCK_PENDING[0];
  onClose: () => void;
  onSign: (id: number, signatureUrl: string) => void;
  onReject: (id: number) => void;
}) {
  const [signatureUrl, setSignatureUrl] = useState("");
  const [step, setStep] = useState<"review" | "sign">("review");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white pb-8 max-h-[90vh] overflow-y-auto" style={{ boxShadow: `0 6px 22px rgba(0,80,140,.10)` }}>
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-4 sticky top-0 bg-white" style={{ borderBottom: `1px solid ${C.line100}`, zIndex: 1 }}>
          <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>
            {step === "review" ? "合同详情" : "手写签名"}
          </span>
          <button onClick={onClose} className="p-1">
            <X size={18} strokeWidth={1.5} style={{ color: C.textSub }} />
          </button>
        </div>

        <div className="px-4 pt-4">
          {step === "review" ? (
            <>
              {/* 合同信息 */}
              <div className="rounded-[14px] p-4 mb-4" style={{ backgroundColor: C.bg }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>{contract.type}</span>
                  <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ backgroundColor: C.warnBg, color: C.warnFg }}>
                    待签署
                  </span>
                </div>
                {[
                  { label: "合同期限", value: `${contract.startDate} 至 ${contract.endDate}` },
                  { label: "发起方", value: contract.initiatedBy },
                  { label: "发起时间", value: contract.initiatedAt },
                ].map(item => (
                  <div key={item.label} className="flex items-start py-2" style={{ borderBottom: `1px solid ${C.line200}` }}>
                    <span className="w-20 flex-shrink-0 text-[12px]" style={{ color: C.textSub }}>{item.label}</span>
                    <span className="flex-1 text-[13px] font-bold" style={{ color: C.textMain }}>{item.value}</span>
                  </div>
                ))}
                {contract.remark && (
                  <div className="mt-3 text-[12px]" style={{ color: C.textSub }}>{contract.remark}</div>
                )}
              </div>

              {/* 提示 */}
              <div className="rounded-[10px] p-3 mb-4 flex items-start gap-2" style={{ backgroundColor: C.infoBg }}>
                <AlertCircle size={14} strokeWidth={1.5} style={{ color: C.infoFg, flexShrink: 0, marginTop: 1 }} />
                <div className="text-[12px]" style={{ color: C.infoFg }}>
                  请仔细阅读合同条款，确认无误后点击「同意并签署」进行手写签名。签署后合同即刻生效。
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => onReject(contract.id)}
                  className="flex-1 h-11 rounded-full text-[13px] font-bold transition-all duration-150 active:scale-[0.97]"
                  style={{ backgroundColor: C.dangerBg, color: C.dangerFg, border: `1px solid ${C.dangerFg}20` }}
                >
                  拒签
                </button>
                <button
                  onClick={() => setStep("sign")}
                  className="flex-[2] h-11 rounded-full text-[14px] font-extrabold text-white transition-all duration-150 active:scale-[0.97]"
                  style={{ background: C.brandGrad, boxShadow: `0 4px 14px rgba(30,136,214,.32)` }}
                >
                  同意并签署
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 text-[13px]" style={{ color: C.textSub }}>
                合同：<span className="font-bold" style={{ color: C.textMain }}>{contract.type}</span>
              </div>

              <SignatureCanvas
                onSigned={url => setSignatureUrl(url)}
                onClear={() => setSignatureUrl("")}
              />

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setStep("review")}
                  className="flex-1 h-11 rounded-full text-[13px] font-bold transition-all duration-150 active:scale-[0.97]"
                  style={{ backgroundColor: C.bg, color: C.textSub, border: `1px solid ${C.line200}` }}
                >
                  返回
                </button>
                <button
                  disabled={!signatureUrl}
                  onClick={() => onSign(contract.id, signatureUrl)}
                  className="flex-[2] h-11 rounded-full text-[14px] font-extrabold text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
                  style={{ background: C.brandGrad, boxShadow: signatureUrl ? `0 4px 14px rgba(30,136,214,.32)` : "none" }}
                >
                  确认签署
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function YabanMyPage() {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(MOCK_PENDING);
  const [history, setHistory] = useState(MOCK_HISTORY);
  const [activeContract, setActiveContract] = useState<typeof MOCK_PENDING[0] | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "warn" } | null>(null);

  function showToast(msg: string, type: "ok" | "warn" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  function handleSign(id: number, _signatureUrl: string) {
    // TODO: trpc.yabanStaff.signContract.mutate({ signRequestId: id, signatureUrl })
    const contract = pending.find(p => p.id === id);
    if (contract) {
      setPending(prev => prev.filter(p => p.id !== id));
      setHistory(prev => [{ ...contract, status: "signed", signedAt: new Date().toISOString().slice(0, 10) } as any, ...prev]);
    }
    setActiveContract(null);
    showToast("签署成功，合同已生效");
  }

  function handleReject(id: number) {
    // TODO: trpc.yabanStaff.rejectContract.mutate({ signRequestId: id })
    setPending(prev => prev.filter(p => p.id !== id));
    setActiveContract(null);
    showToast("已拒签，人事部将收到通知", "warn");
  }

  return (
    <div
      className="min-h-screen"
      style={{ maxWidth: 480, margin: "0 auto", backgroundColor: C.bg, fontFamily: "Nunito, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}
    >
      {/* ── 顶栏 ── */}
      <div style={{ background: C.brandGrad }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/staff")} className="p-1 -ml-1">
            <ChevronLeft size={22} strokeWidth={2} style={{ color: "#fff" }} />
          </button>
          <span className="text-[18px] font-extrabold text-white">我的</span>
          <div className="w-8" />
        </div>

        {/* 个人信息卡 */}
        <div className="px-4 pb-5 flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[22px] font-extrabold flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" }}
          >
            {MOCK_STAFF.name[0]}
          </div>
          <div>
            <div className="text-[18px] font-extrabold text-white">{MOCK_STAFF.name}</div>
            <div className="text-[12px] text-white/70 mt-0.5">
              {MOCK_STAFF.clinic} · {MOCK_STAFF.role} · 入职 {MOCK_STAFF.joinDate}
            </div>
          </div>
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="px-4 py-3 flex flex-col gap-3">

        {/* 待签约 */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
            <div className="flex items-center gap-2">
              <Clock size={15} strokeWidth={1.5} style={{ color: C.brand }} />
              <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>待签约合同</span>
            </div>
            {pending.length > 0 && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-extrabold text-white"
                style={{ backgroundColor: C.dangerFg }}
              >
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <CheckCircle size={28} strokeWidth={1} style={{ color: C.okFg, opacity: 0.5 }} />
              <div className="text-[13px] font-bold" style={{ color: C.okFg }}>暂无待签约合同</div>
            </div>
          ) : (
            <div className="px-4">
              {pending.map((c, i) => (
                <div
                  key={c.id}
                  className="py-3 flex items-center gap-3"
                  style={{ borderBottom: i < pending.length - 1 ? `1px solid ${C.line100}` : "none" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: C.warnBg }}
                  >
                    <FileText size={18} strokeWidth={1.5} style={{ color: C.warnFg }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold" style={{ color: C.textMain }}>{c.type}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.textSub }}>
                      {c.startDate} 至 {c.endDate}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveContract(c)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-bold transition-all duration-150 active:scale-[0.97]"
                    style={{ background: C.brandGrad, color: "#fff", boxShadow: `0 2px 8px rgba(30,136,214,.28)` }}
                  >
                    签署
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 签约历史 */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
            <CheckCircle size={15} strokeWidth={1.5} style={{ color: C.brand }} />
            <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>签约历史</span>
          </div>
          <div className="px-4">
            {history.length === 0 ? (
              <div className="py-6 text-center text-[12px]" style={{ color: C.textWeak }}>暂无签约记录</div>
            ) : (
              history.map((c: any, i: number) => (
                <div
                  key={c.id}
                  className="py-3 flex items-center gap-3"
                  style={{ borderBottom: i < history.length - 1 ? `1px solid ${C.line100}` : "none" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: C.okBg }}
                  >
                    <FileText size={18} strokeWidth={1.5} style={{ color: C.okFg }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold" style={{ color: C.textMain }}>{c.type}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.textSub }}>
                      {c.startDate} 至 {c.endDate}
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ backgroundColor: C.okBg, color: C.okFg }}>
                    已签署
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── 签约弹窗 ── */}
      {activeContract && (
        <SignModal
          contract={activeContract}
          onClose={() => setActiveContract(null)}
          onSign={handleSign}
          onReject={handleReject}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-[13px] font-bold text-white shadow-lg transition-all duration-300"
          style={{
            backgroundColor: toast.type === "ok" ? C.okFg : C.warnFg,
            maxWidth: 320,
            zIndex: 100,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/*
 * TODO: 接口需求单（需主沙箱补充）
 *
 * 1. trpc.yabanStaff.myPendingContracts
 *    入参: { staffId: number }
 *    出参: Array<{ id, type, startDate, endDate, initiatedBy, initiatedAt, remark, status }>
 *
 * 2. trpc.yabanStaff.signContract
 *    入参: { signRequestId: number; signatureUrl: string }
 *    出参: { success: boolean; contractId: number }
 *
 * 3. trpc.yabanStaff.rejectContract
 *    入参: { signRequestId: number; reason?: string }
 *    出参: { success: boolean }
 */
