import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Phone,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

const G = {
  bg: "#0d0d0d",
  card: "#141414",
  cardBorder: "rgba(201,168,76,0.22)",
  gold: "#C9A84C",
  goldLight: "#F5D78E",
  goldDim: "rgba(201,168,76,0.45)",
  goldFaint: "rgba(201,168,76,0.12)",
  white: "rgba(255,255,255,0.88)",
  whiteDim: "rgba(255,255,255,0.48)",
  whiteFaint: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.06)",
};

async function copyWalletReceiveValue(value: string, label: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast.success(`${label}已复制`);
}

export default function WalletReceive() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const identityQuery = trpc.recharge.getMyWalletPaymentIdentity.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const identity = identityQuery.data as {
    paymentId: string;
    name: string;
    nickname: string;
    username: string;
    phone: string | null;
  } | undefined;

  const backToWallet = () => {
    const params = new URLSearchParams();
    const account = searchParams.get("account");
    const fromLedger = searchParams.get("fromLedger");
    const viewAs = searchParams.get("viewAs");
    if (account === "CNY" || account === "CRYPTO") params.set("account", account);
    if (fromLedger === "37" || fromLedger === "52") params.set("fromLedger", fromLedger);
    if (viewAs) params.set("viewAs", viewAs);
    setLocation(`/wallet${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const copy = async (value: string, field: string, label: string) => {
    await copyWalletReceiveValue(value, label);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField((current) => current === field ? null : current), 1600);
  };

  const identityRows = identity ? [
    {
      key: "paymentId",
      icon: KeyRound,
      label: "收款码",
      value: identity.paymentId,
      copyLabel: "收款码",
      mono: true,
    },
    {
      key: "username",
      icon: UserRound,
      label: "用户名",
      value: identity.username || "未设置用户名",
      copyValue: identity.username || "",
      copyLabel: "用户名",
      mono: false,
    },
    {
      key: "nickname",
      icon: UserRound,
      label: "昵称",
      value: identity.nickname || "未设置昵称",
      copyValue: identity.nickname || "",
      copyLabel: "昵称",
      mono: false,
    },
    {
      key: "phone",
      icon: Phone,
      label: "手机号",
      value: identity.phone || "暂未绑定手机号",
      copyValue: identity.phone || "",
      copyLabel: "手机号",
      mono: false,
    },
  ] : [];

  return (
    <div className="min-h-screen px-4 pb-10" style={{ background: G.bg, paddingTop: "calc(env(safe-area-inset-top, 44px) + 12px)" }}>
      <div className="mx-auto w-full max-w-[480px]">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={backToWallet}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold active:scale-[0.98]"
            style={{ color: G.goldLight, background: G.goldFaint, border: `1px solid ${G.cardBorder}` }}
          >
            <ArrowLeft className="h-4 w-4" />
            返回钱包
          </button>
          <div className="text-sm font-semibold" style={{ color: G.white }}>收款</div>
          <div className="w-[82px]" aria-hidden="true" />
        </header>

        {identityQuery.isLoading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-[10px]" style={{ background: G.card, border: `1px solid ${G.cardBorder}` }}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: G.gold }} />
            <span className="text-sm" style={{ color: G.whiteDim }}>正在生成收款信息</span>
          </div>
        ) : identityQuery.error || !identity ? (
          <div className="rounded-[10px] px-5 py-8 text-center" style={{ background: G.card, border: `1px solid rgba(248,113,113,0.28)` }}>
            <div className="text-sm font-semibold" style={{ color: G.white }}>暂时无法读取收款信息</div>
            <div className="mt-2 text-xs leading-5" style={{ color: G.whiteDim }}>{identityQuery.error?.message || "请返回钱包后重试"}</div>
            <button type="button" onClick={() => void identityQuery.refetch()} className="mt-5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: G.goldLight, background: G.goldFaint, border: `1px solid ${G.cardBorder}` }}>重新加载</button>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[10px]" style={{ background: G.card, border: `1px solid ${G.cardBorder}` }}>
              {identityRows.map(({ key, icon: Icon, label, value, copyValue, copyLabel, mono }, index) => {
                const copyTarget = copyValue ?? value;
                const copyable = copyTarget && !copyTarget.includes("未设置") && !copyTarget.includes("暂未绑定");
                return (
                  <div key={key} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: index < identityRows.length - 1 ? `1px solid ${G.divider}` : "none" }}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: G.goldFaint, color: G.gold }}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px]" style={{ color: G.whiteDim }}>{label}</div>
                      <div className={`mt-0.5 truncate text-sm font-medium ${mono ? "font-mono tracking-[0.12em]" : ""}`} style={{ color: G.white }}>{value}</div>
                    </div>
                    {copyable && <button type="button" onClick={() => void copy(copyTarget, key, copyLabel)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: G.whiteFaint, color: copiedField === key ? "#34d399" : G.goldLight, border: `1px solid ${G.cardBorder}` }} aria-label={`复制${label}`}>
                      {copiedField === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
