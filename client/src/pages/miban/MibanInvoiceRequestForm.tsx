import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import "./miban-checkout.css";
import {
  mibanInvoiceRequestSchema,
  type MibanInvoiceRequest,
} from "../../../../shared/miban-invoice";

export type MibanInvoiceDraft = {
  enabled: boolean;
  type: MibanInvoiceRequest["type"];
  title: string;
  taxNo: string;
};

export type MibanInvoiceErrors = {
  title?: string;
  taxNo?: string;
  form?: string;
};

export const MIBAN_INVOICE_UNAVAILABLE_NOTICE =
  "当前暂无法提交发票申请，请稍后重试；尚未下单或扣款。";

export function createMibanInvoiceDraft(): MibanInvoiceDraft {
  return { enabled: false, type: "personal", title: "个人", taxNo: "" };
}

/** 父级付款前调用；关闭时不验证，个人申请绝不携带历史公司税号。 */
export function validateMibanInvoiceRequest(draft: MibanInvoiceDraft):
  | { success: true; invoiceRequest?: MibanInvoiceRequest }
  | { success: false; errors: MibanInvoiceErrors; message: string } {
  if (!draft.enabled) return { success: true };
  const candidate = {
    type: draft.type,
    // 清理首尾空白由schema负责，不能先trim掩盖其控制字符校验。
    title: draft.title,
    ...(draft.type === "company" ? { taxNo: draft.taxNo } : {}),
  };
  const result = mibanInvoiceRequestSchema.safeParse(candidate);
  if (result.success) {
    const invoiceRequest: MibanInvoiceRequest = {
      type: result.data.type,
      title: result.data.title,
      ...(result.data.type === "company" ? { taxNo: result.data.taxNo } : {}),
    };
    return { success: true, invoiceRequest };
  }
  const errors: MibanInvoiceErrors = {};
  for (const issue of result.error.issues) {
    if (issue.path[0] === "title") {
      errors.title = !draft.title.trim() ? "请填写发票抬头"
        : issue.message.includes("控制字符") ? "发票抬头请勿包含换行等特殊字符"
        : "请填写有效发票抬头";
    } else if (issue.path[0] === "taxNo") {
      errors.taxNo = !draft.taxNo.trim() ? "请填写公司税号"
        : issue.message.includes("控制字符") ? "税号请勿包含换行等特殊字符"
        : "请填写有效税号";
    } else {
      errors.form = "请核对发票抬头和税号";
    }
  }
  const message = errors.title || errors.taxNo || errors.form || "请核对发票信息";
  return { success: false, errors, message };
}

export default function MibanInvoiceRequestForm({
  draft,
  onChange,
  errors = {},
  disabled = false,
  accent = "#0D7A3E",
  className = "",
}: {
  draft: MibanInvoiceDraft;
  onChange: (draft: MibanInvoiceDraft) => void;
  errors?: MibanInvoiceErrors;
  disabled?: boolean;
  accent?: string;
  className?: string;
}) {
  const id = useId();
  const change = (next: MibanInvoiceDraft) => {
    if (!disabled) onChange(next);
  };
  const changeType = (type: MibanInvoiceDraft["type"]) => {
    if (type === draft.type) return;
    // 不在两种抬头之间复用公司信息；切回个人立即清空公司税号。
    change({ enabled: true, type, title: type === "personal" ? "个人" : "", taxNo: "" });
  };

  return (
    <section
      aria-label="索取发票"
      className={`min-w-0 rounded-[4px] border border-gray-200 bg-white px-4 py-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <label htmlFor={`${id}-enabled`} className="text-[13px] font-bold text-gray-800">
            索取发票
          </label>
          <p className="mt-0.5 text-[11px] text-gray-400">选填，关闭时不提交发票申请</p>
        </div>
        <Switch
          id={`${id}-enabled`}
          aria-label="索取发票"
          checked={draft.enabled}
          disabled={disabled}
          onCheckedChange={enabled => change(enabled
            ? { ...createMibanInvoiceDraft(), enabled: true }
            : createMibanInvoiceDraft())}
          style={{ backgroundColor: draft.enabled ? accent : undefined }}
        />
      </div>
      {draft.enabled && (
        <fieldset disabled={disabled} className="mt-3 min-w-0 space-y-3 border-t border-gray-100 pt-3">
          <legend className="sr-only">发票信息</legend>
          <div role="group" aria-label="发票类型" className="grid grid-cols-2 gap-2">
            {([
              { type: "personal", label: "个人" },
              { type: "company", label: "公司" },
            ] as const).map(option => (
              <button
                key={option.type}
                type="button"
                aria-pressed={draft.type === option.type}
                disabled={disabled}
                onClick={() => changeType(option.type)}
                className="min-h-9 rounded-[4px] border px-3 py-2 text-[12px] font-semibold disabled:cursor-not-allowed"
                style={{
                  color: draft.type === option.type ? accent : "#6b7280",
                  borderColor: draft.type === option.type ? accent : "#e5e7eb",
                  backgroundColor: draft.type === option.type ? `${accent}0D` : "#ffffff",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor={`${id}-title`} className="text-[12px] font-semibold text-gray-600">
              发票抬头 <span className="font-normal text-gray-400">（必填）</span>
            </label>
            <input
              id={`${id}-title`}
              value={draft.title}
              onChange={event => change({ ...draft, title: event.target.value.slice(0, 200) })}
              placeholder={draft.type === "personal" ? "个人或实际姓名" : "请输入公司全称"}
              maxLength={200}
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${id}-title-error` : undefined}
              className="mt-1.5 h-10 w-full min-w-0 rounded-[4px] border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-gray-400 disabled:text-gray-500"
            />
            {errors.title && <p id={`${id}-title-error`} role="alert" className="mt-1 text-[11px] text-red-500">{errors.title}</p>}
          </div>
          {draft.type === "company" && (
            <div>
              <label htmlFor={`${id}-tax-no`} className="text-[12px] font-semibold text-gray-600">
                税号 <span className="font-normal text-gray-400">（必填）</span>
              </label>
              <input
                id={`${id}-tax-no`}
                value={draft.taxNo}
                onChange={event => change({ ...draft, taxNo: event.target.value.slice(0, 100) })}
                placeholder="请输入公司税号"
                maxLength={100}
                autoCapitalize="characters"
                required
                aria-invalid={Boolean(errors.taxNo)}
                aria-describedby={errors.taxNo ? `${id}-tax-no-error` : undefined}
                className="mt-1.5 h-10 w-full min-w-0 rounded-[4px] border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-gray-400 disabled:text-gray-500"
              />
              {errors.taxNo && <p id={`${id}-tax-no-error`} role="alert" className="mt-1 text-[11px] text-red-500">{errors.taxNo}</p>}
            </div>
          )}
          {errors.form && <p role="alert" className="text-[11px] text-red-500">{errors.form}</p>}
          <p className="text-[10px] leading-4 text-gray-400">请核对抬头；提交申请不代表已开票。</p>
        </fieldset>
      )}
    </section>
  );
}
