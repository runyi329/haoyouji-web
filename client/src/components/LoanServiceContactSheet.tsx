import { Clock3, ExternalLink, PhoneCall, Route, ShieldCheck, X } from "lucide-react";
import type { LoanServiceContact } from "@/lib/loanServiceContacts";

interface LoanServiceContactSheetProps {
  contact: LoanServiceContact;
  open: boolean;
  onClose: () => void;
}

const toTelHref = (phone?: string) => phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;

export function LoanServiceContactSheet({ contact, open, onClose }: LoanServiceContactSheetProps) {
  if (!open) return null;
  const telHref = toTelHref(contact.primaryPhone);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(0, 0, 0, 0.52)" }}>
      <div className="w-full max-w-[480px] rounded-t-2xl bg-white px-4 pb-8 pt-4 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-[#1A2B4A]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>官方服务信息</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{contact.provider}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{contact.businessLabel}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="关闭服务电话说明">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500"><PhoneCall className="h-3.5 w-3.5" /><span>官方客服电话</span></div>
            {contact.primaryPhone ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-lg font-bold tracking-wide text-[#1A2B4A]">{contact.primaryPhone}</p>{contact.phoneLabel && <p className="mt-1 text-[11px] leading-4 text-slate-500">{contact.phoneLabel}</p>}</div>
                <a href={telHref} className="shrink-0 rounded-lg bg-[#1A2B4A] px-3 py-2 text-xs font-semibold text-white">拨打</a>
              </div>
            ) : <p className="mt-2 text-sm leading-5 text-slate-600">该分类暂未提供单一官方号码，请按下方说明核对具体机构。</p>}
          </div>

          <div className="grid grid-cols-[20px_1fr] gap-x-2 rounded-xl border border-slate-100 p-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
            <div><p className="text-xs text-slate-400">人工服务时间</p><p className="mt-1 text-sm leading-5 text-slate-700">{contact.serviceHours}</p></div>
          </div>

          <div className="grid grid-cols-[20px_1fr] gap-x-2 rounded-xl border border-slate-100 p-3">
            <Route className="mt-0.5 h-4 w-4 text-slate-400" />
            <div><p className="text-xs text-slate-400">人工服务指引</p><p className="mt-1 text-sm leading-5 text-slate-700">{contact.humanGuide}</p></div>
          </div>

          {contact.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">{contact.note}</p>}
          {contact.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700"><span className="truncate">官方来源：{contact.sourceTitle || "查看官方说明"}</span><ExternalLink className="ml-2 h-3.5 w-3.5 shrink-0" /></a>}
        </div>
      </div>
    </div>
  );
}
