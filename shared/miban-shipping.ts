import { z } from "zod";

// 与商城既有订单接口保持11—20位范围；只清理粘贴排版符号，不补号、不猜号。
export function normalizeMibanReceiverPhone(value: string): string {
  return value.normalize("NFKC").trim().replace(/[\s()（）\-‐‑–—]/g, "");
}

export const MIBAN_RECEIVER_PHONE_REQUIRED = "请填写收货手机号";
export const MIBAN_RECEIVER_PHONE_TOO_SHORT = "收货手机号不足11位，请核对并补全后再付款";
export const MIBAN_RECEIVER_PHONE_INVALID = "请填写完整、真实的收货联系电话，不要使用星号或其他文字";

export const mibanReceiverPhoneSchema = z.string().transform(normalizeMibanReceiverPhone).pipe(
  z.string()
    .min(1, MIBAN_RECEIVER_PHONE_REQUIRED)
    .min(11, MIBAN_RECEIVER_PHONE_TOO_SHORT)
    .max(20, "收货联系电话过长，请核对后重新填写")
    .regex(/^\+?\d+$/, MIBAN_RECEIVER_PHONE_INVALID)
    .refine(value => value.replace(/^\+/, "").length >= 11, MIBAN_RECEIVER_PHONE_TOO_SHORT)
);

export function getMibanReceiverPhoneError(value: string): string | null {
  const result = mibanReceiverPhoneSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? MIBAN_RECEIVER_PHONE_INVALID;
}

// tRPC的输入校验有时直接把Zod issues数组放进message，不能将原始JSON弹给用户。
// 业务错误（余额不足、库存不足等）仍保留服务端原文，绝不把失败伪装成成功。
export function formatMibanCheckoutError(error: unknown, fallback = "提交订单失败，请稍后再试"): string {
  const message = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String(error.message ?? "")
      : "";
  if (!message.trim()) return fallback;
  try {
    const parsed: unknown = JSON.parse(message);
    if (Array.isArray(parsed)) {
      const issues = parsed.filter((issue): issue is { path?: unknown[]; message?: string; code?: string; minimum?: number } =>
        issue !== null && typeof issue === "object"
      );
      const phoneIssue = issues.find(issue => issue.path?.some(part => part === "receiverPhone" || part === "phone"));
      if (phoneIssue) {
        if (phoneIssue.message && /[\u3400-\u9fff]/.test(phoneIssue.message)) return phoneIssue.message;
        return phoneIssue.code === "too_small" ? MIBAN_RECEIVER_PHONE_TOO_SHORT : MIBAN_RECEIVER_PHONE_INVALID;
      }
      const addressIssue = issues.find(issue => issue.path?.some(part => part === "receiverAddress" || part === "detail"));
      if (addressIssue) return "请补全收货地址后再付款";
      const nameIssue = issues.find(issue => issue.path?.some(part => part === "receiverName" || part === "name"));
      if (nameIssue) return "请填写收货人姓名";
      const chineseMessage = issues.find(issue => typeof issue.message === "string" && /[\u3400-\u9fff]/.test(issue.message));
      return chineseMessage?.message ?? fallback;
    }
  } catch {
    // 普通业务错误无需JSON解析。
  }
  return message;
}
