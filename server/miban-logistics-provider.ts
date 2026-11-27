import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeTrackingCompany } from "../shared/miban-fulfillment";
import type { AdminLogisticsFeedback, LogisticsFeedbackCategory, LogisticsRecord } from "../shared/miban-logistics";

export const KUAIDI100_TIMEOUT_MS = 10_000;
export const KUAIDI100_MAX_RESPONSE_BYTES = 256 * 1024;
export const KUAIDI100_MAX_RECORDS = 200;
const QUERY_URL = "https://poll.kuaidi100.com/poll/query.do";
const SUBSCRIBE_URL = "https://poll.kuaidi100.com/poll";
const UNAVAILABLE = "物流服务暂不可用，请稍后重试";

export interface ProviderResult {
  ok: boolean;
  code: string;
  message: string;
  state: string | null;
  records: LogisticsRecord[];
}
export interface QueryKuaidi100Input {
  carrierCode: string;
  trackingNo: string;
  phone?: string;
}
export interface SubscribeKuaidi100Input extends QueryKuaidi100Input {
  callbackUrl: string;
  salt: string;
}
export interface SubscriptionResult {
  ok: boolean;
  code: string;
  message: string;
}
export interface ProviderEnvironment {
  KUAIDI100_KEY?: string;
  KUAIDI100_CUSTOMER?: string;
}
export interface ProviderDependencies {
  fetch?: typeof globalThis.fetch;
  env?: ProviderEnvironment | (() => ProviderEnvironment);
}

/** Server-only credentials. Never include this object in a router/client result. */
export function getProviderConfig(
  env: ProviderEnvironment = {
    KUAIDI100_KEY: process.env.KUAIDI100_KEY,
    KUAIDI100_CUSTOMER: process.env.KUAIDI100_CUSTOMER,
  }
) {
  const credential = (value: unknown): string =>
    typeof value === "string" && value.trim() && value.length <= 1024
      ? value.trim()
      : "";
  const key = credential(env.KUAIDI100_KEY);
  const customer = credential(env.KUAIDI100_CUSTOMER);
  return {
    key,
    customer,
    queryEnabled: Boolean(key && customer),
    subscriptionEnabled: Boolean(key),
  };
}

const CARRIER_CODES = new Map<string, string>([
  ["顺丰速运", "shunfeng"],
  ["中通快递", "zhongtong"],
  ["圆通速递", "yuantong"],
  ["申通快递", "shentong"],
  ["韵达快递", "yunda"],
  ["京东物流", "jd"],
  ["邮政快递", "youzhengguonei"],
  ["EMS", "ems"],
  ["极兔速递", "jtexpress"],
  ["德邦快递", "debangkuaidi"],
  ["百世快递", "huitongkuaidi"],
]);
const KNOWN_CODES = new Set(CARRIER_CODES.values());

/** Explicit allowlist only: unknown companies never trigger auto-detection. */
export function resolveCarrierCode(name: string): string | null {
  if (typeof name !== "string" || name.length > 128) return null;
  const code = name.normalize("NFKC").trim().toLowerCase();
  if (KNOWN_CODES.has(code)) return code;
  return CARRIER_CODES.get(normalizeTrackingCompany(name)) ?? null;
}

const phoneSchema = z
  .string()
  .max(64)
  .transform(value => {
    const text = value.normalize("NFKC").trim();
    // A documented virtual number is 11 mobile digits + '-' + four digits.
    // Never infer the last four digits from an ordinary mobile/landline number.
    const virtual = /^1[3-9]\d{9}-(\d{4})$/.exec(text);
    if (virtual) return virtual[1];
    return /^[\d\s()-]+$/.test(text) ? text.replace(/[\s()-]/g, "") : text;
  })
  .pipe(z.string().regex(/^\d{4,16}$/));

const inputSchema = z.object({
  carrierCode: z.string().trim().min(1).max(128),
  trackingNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,64}$/),
  // Do not block phone-less SF/ZTO requests: the official API decides validation.
  phone: phoneSchema.optional(),
});
const subscribeInputSchema = inputSchema.extend({
  callbackUrl: z
    .string()
    .max(2048)
    .url()
    .refine(value => {
      const url = new URL(value);
      return (
        url.protocol === "https:" && !url.username && !url.password && !url.hash
      );
    }),
  salt: z
    .string()
    .min(1)
    .max(256)
    .refine(value => Boolean(value.trim())),
});

/** Parse a carrier timestamp without relying on the host's timezone or Date rollover. */
function timestampValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
    value
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1970 || year > 9999) return null;
  const valueMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(valueMs);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
    ? valueMs
    : null;
}
const timestampSchema = z
  .string()
  .max(19)
  .refine(value => timestampValue(value) !== null);
const recordSchema = z.object({
  time: timestampSchema,
  ftime: timestampSchema.optional(),
  context: z.string().min(1).max(4096),
  status: z.string().max(128).optional(),
});
const codeSchema = z.string().regex(/^\d{3}$/);
const queryResponseSchema = z
  .object({
    status: codeSchema.optional(),
    returnCode: codeSchema.optional(),
    result: z.boolean().optional(),
    message: z.string().max(2048).optional(),
    com: z.string().max(128).optional(),
    nu: z.string().max(64).optional(),
    state: z
      .string()
      .regex(/^\d{1,4}$/)
      .nullable()
      .optional(),
    data: z.array(recordSchema).max(KUAIDI100_MAX_RECORDS).optional(),
  })
  .refine(value => Boolean(value.status || value.returnCode));
const subscriptionResponseSchema = z.object({
  result: z.boolean(),
  returnCode: codeSchema,
  message: z.string().max(2048).optional(),
});
// Unknown vendor metadata is stripped. Declared fields are never coerced.

type FeedbackMapping = { code: string; category: LogisticsFeedbackCategory; message: string };
type FeedbackTable = Record<string, readonly [LogisticsFeedbackCategory, string]>;
const COMMON_FEEDBACK: FeedbackTable = {
  INVALID_INPUT: ["invalid_request", "物流查询参数不正确"],
  UNSUPPORTED_CARRIER: ["invalid_request", "暂不支持该承运商，请联系商家核对快递公司"],
  NOT_CONFIGURED: ["authorization", "物流服务暂未配置，请联系商家"],
  INVALID_RESPONSE: ["provider", "物流服务返回异常，请稍后重试"],
  RESPONSE_TOO_LARGE: ["provider", "物流服务返回异常，请稍后重试"],
  RESPONSE_MISMATCH: ["invalid_request", "物流信息与订单不匹配，请联系商家核对"],
  SERVICE_UNAVAILABLE: ["provider", UNAVAILABLE],
  timeout: ["provider", UNAVAILABLE],
};
// Official APIs reuse codes with different meanings. Never classify raw vendor text.
const QUERY_FEEDBACK: FeedbackTable = {
  "200": ["success", "物流查询成功"],
  "201": ["no_data", "暂无物流记录，请稍后重试"],
  "400": ["invalid_request", "物流查询参数不完整或账号未充值，请联系商家核对"],
  "401": ["invalid_request", "暂不支持该承运商，请联系商家核对快递公司"],
  "408": ["phone", "承运商电话验证未通过，请联系商家核对订单收件电话"],
  "500": ["no_data", "暂无物流记录，请稍后重试"],
  "501": ["provider", "物流查询服务器错误，请稍后重试"],
  "502": ["provider", "物流查询服务繁忙，请稍后重试"],
  "503": ["authorization", "物流服务授权未通过，请联系商家"],
  "504": ["rate_limit", "物流查询过于频繁，请等待承运商24小时限制解除"],
  "601": ["quota", "物流查询授权已过期或无可用单量，请联系商家核对并充值"],
};
const SUBSCRIPTION_FEEDBACK: FeedbackTable = {
  "200": ["success", "物流订阅已提交，等待已验签回调（尚未确认收到推送）"],
  "408": ["phone", "承运商电话验证未通过，请联系商家核对订单收件电话"],
  "500": ["provider", "物流订阅服务器错误，请稍后重试"],
  "501": ["duplicate", "物流重复订阅，尚未验证本站回调是否正常"],
  "502": ["invalid_request", "物流订阅被安全规则拦截，请联系商家核对参数"],
  "600": ["authorization", "物流订阅授权Key出错或无可用单量，请联系商家核对授权与额度"],
  "601": ["quota", "物流订阅授权已过期或无可用单量，请联系商家核对并充值"],
  "700": ["invalid_request", "暂不支持该承运商，请联系商家核对快递公司"],
  "701": ["invalid_request", "物流订阅参数或回调配置错误，请联系商家核对"],
  "702": ["invalid_request", "物流订阅公司识别失败或无可用单量，请联系商家核对公司与额度"],
};

/** Restricted code allowlist and fixed messages, safe for administrator-only persistence. */
export function getLogisticsFeedbackMapping(operation: AdminLogisticsFeedback["operation"], value: unknown): FeedbackMapping {
  const code = typeof value === "string" ? value : "UNKNOWN";
  const table = operation === "query" ? QUERY_FEEDBACK : operation === "subscription" ? SUBSCRIPTION_FEEDBACK : {
    "200": ["success", "已验签物流回调已成功落盘"],
    ABORT: ["aborted", "已验签物流中止回调已成功落盘，请核对订阅状态"],
  } satisfies FeedbackTable;
  const mapping = Object.hasOwn(table, code) ? table[code] : operation !== "callback" && Object.hasOwn(COMMON_FEEDBACK, code) ? COMMON_FEEDBACK[code] : undefined;
  return mapping ? { code, category: mapping[0], message: mapping[1] } : { code: "UNKNOWN", category: "provider", message: UNAVAILABLE };
}

function failure(code: string): ProviderResult {
  return {
    ok: false,
    code,
    message: getLogisticsFeedbackMapping("query", code).message,
    state: null,
    records: [],
  };
}
class ProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (
    length &&
    /^\d+$/.test(length) &&
    Number(length) > KUAIDI100_MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError("RESPONSE_TOO_LARGE");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError("SERVICE_UNAVAILABLE");
  }
  if (!response.body) throw new ProviderError("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > KUAIDI100_MAX_RESPONSE_BYTES)
        throw new ProviderError("RESPONSE_TOO_LARGE");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    // Cancellation is best effort; it must not delay the hard deadline.
    void reader.cancel().catch(() => undefined);
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("INVALID_RESPONSE");
  } finally {
    reader.releaseLock();
  }
}

async function postForm(
  url: string,
  form: URLSearchParams,
  dependencies: ProviderDependencies
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderError("timeout"));
      }, KUAIDI100_TIMEOUT_MS);
    });
    const request = (async () => {
      const response = await (dependencies.fetch ?? globalThis.fetch)(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: form.toString(),
        signal: controller.signal,
        redirect: "error", // Never forward signed requests/secrets through redirects.
      });
      return await readBoundedJson(response);
    })();
    return await Promise.race([request, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function configFor(dependencies: ProviderDependencies) {
  return getProviderConfig(
    typeof dependencies.env === "function"
      ? dependencies.env()
      : dependencies.env
  );
}
function md5(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
}
function safeContext(value: string, secrets: string[]): string {
  let text = value;
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join("[已隐藏]");
  }
  // Redact carrier/courier phone numbers too, including landlines and +86 mobiles.
  return text.replace(
    /(?:\+?86[-\s]?)?\d(?:[-\s()]*\d){6,15}/g,
    "[电话已隐藏]"
  );
}
function safeFailure(error: unknown): ProviderResult {
  return failure(
    error instanceof ProviderError ? error.code : "SERVICE_UNAVAILABLE"
  );
}

export async function queryKuaidi100(
  input: QueryKuaidi100Input,
  dependencies: ProviderDependencies = {}
): Promise<ProviderResult> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return failure("INVALID_INPUT");
    const { trackingNo, phone } = parsed.data;
    const carrierCode = resolveCarrierCode(parsed.data.carrierCode);
    if (!carrierCode) return failure("UNSUPPORTED_CARRIER");
    const config = configFor(dependencies);
    if (!config.queryEnabled) return failure("NOT_CONFIGURED");
    const param = JSON.stringify({
      com: carrierCode,
      num: trackingNo,
      ...(phone ? { phone } : {}),
      show: "0",
      order: "desc",
      resultv2: "1",
    });
    const response = queryResponseSchema.safeParse(
      await postForm(
        QUERY_URL,
        new URLSearchParams({
          customer: config.customer,
          sign: md5(param + config.key + config.customer),
          param,
        }),
        dependencies
      )
    );
    if (!response.success) return failure("INVALID_RESPONSE");
    const value = response.data;
    const code = value.status ?? value.returnCode!;
    const data = value.data ?? [];
    // Even a failed response with records must be bound to the requested parcel.
    if (
      (value.com !== undefined && value.com !== carrierCode) ||
      (value.nu !== undefined && value.nu !== trackingNo) ||
      (data.length > 0 &&
        (value.com !== carrierCode || value.nu !== trackingNo))
    ) {
      return failure("RESPONSE_MISMATCH");
    }
    if (code !== "200") return failure(code);
    if (
      value.result === false ||
      (value.returnCode && value.returnCode !== "200")
    )
      return failure("INVALID_RESPONSE");
    if (!data.length) return failure("500");
    if (value.state == null) return failure("INVALID_RESPONSE");
    const secrets = [
      config.key,
      config.customer,
      phone ?? "",
      input.phone ?? "",
    ];
    const records: LogisticsRecord[] = data
      .map(record => ({
        time: record.ftime ?? record.time,
        context: safeContext(record.context, secrets),
        ...(record.status !== undefined
          ? { status: safeContext(record.status, secrets) }
          : {}),
      }))
      .sort((a, b) => timestampValue(b.time)! - timestampValue(a.time)!);
    return {
      ok: true,
      code: "200",
      message: "物流查询成功",
      state: value.state,
      records,
    };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function subscribeKuaidi100(
  input: SubscribeKuaidi100Input,
  dependencies: ProviderDependencies = {}
): Promise<SubscriptionResult> {
  try {
    const parsed = subscribeInputSchema.safeParse(input);
    if (!parsed.success) return subscriptionFailure("INVALID_INPUT");
    const { trackingNo, phone, callbackUrl, salt } = parsed.data;
    const carrierCode = resolveCarrierCode(parsed.data.carrierCode);
    if (!carrierCode) return subscriptionFailure("UNSUPPORTED_CARRIER");
    const config = configFor(dependencies);
    if (!config.subscriptionEnabled)
      return subscriptionFailure("NOT_CONFIGURED");
    const param = JSON.stringify({
      company: carrierCode,
      number: trackingNo,
      key: config.key,
      parameters: {
        callbackurl: callbackUrl,
        salt,
        ...(phone ? { phone } : {}),
        resultv2: "1",
      },
    });
    const response = subscriptionResponseSchema.safeParse(
      await postForm(
        SUBSCRIBE_URL,
        new URLSearchParams({ schema: "json", param }),
        dependencies
      )
    );
    if (!response.success) return subscriptionFailure("INVALID_RESPONSE");
    if (response.data.result && response.data.returnCode === "200") {
      return { ok: true, code: "200", message: getLogisticsFeedbackMapping("subscription", "200").message };
    }
    return subscriptionFailure(
      response.data.returnCode === "200"
        ? "INVALID_RESPONSE"
        : response.data.returnCode
    );
  } catch (error) {
    return subscriptionFailure(error instanceof ProviderError ? error.code : "SERVICE_UNAVAILABLE");
  }
}
function subscriptionFailure(code: string): SubscriptionResult {
  return { ok: false, code, message: getLogisticsFeedbackMapping("subscription", code).message };
}

/** Verify the raw, unchanged callback param before JSON parsing or processing. */
export function verifyKuaidi100Callback(
  param: string,
  sign: string,
  salt: string
): boolean {
  if (
    typeof param !== "string" ||
    !param ||
    Buffer.byteLength(param, "utf8") > KUAIDI100_MAX_RESPONSE_BYTES ||
    typeof salt !== "string" ||
    !salt.trim() ||
    salt.length > 256 ||
    typeof sign !== "string" ||
    !/^[a-fA-F0-9]{32}$/.test(sign)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(md5(param + salt), "ascii"),
    Buffer.from(sign.toUpperCase(), "ascii")
  );
}
