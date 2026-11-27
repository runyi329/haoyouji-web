import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLogisticsStateLabel,
  type LogisticsDetails,
} from "../shared/miban-logistics";
import {
  getLogisticsFeedbackMapping,
  getProviderConfig,
  KUAIDI100_MAX_RECORDS,
  KUAIDI100_MAX_RESPONSE_BYTES,
  KUAIDI100_TIMEOUT_MS,
  queryKuaidi100,
  resolveCarrierCode,
  subscribeKuaidi100,
  verifyKuaidi100Callback,
  type ProviderDependencies,
} from "./miban-logistics-provider";

// Fixtures are exclusively offline tests; no production/client fake events.
const ENV = {
  KUAIDI100_KEY: "offline-test-key",
  KUAIDI100_CUSTOMER: "offline-test-customer",
};
const INPUT = { carrierCode: "shunfeng", trackingNo: "000012345678901" };
const SUBSCRIPTION = {
  ...INPUT,
  callbackUrl: "https://merchant.example/logistics/callback",
  salt: "offline-callback-salt",
};
const record = {
  time: "2026-11-27 10:00:00",
  ftime: "2026-11-27 10:00:00",
  context: "包裹正在派送",
  status: "派送中",
};
const success = (extra: Record<string, unknown> = {}) => ({
  status: "200",
  message: "ok",
  com: INPUT.carrierCode,
  nu: INPUT.trackingNo,
  state: "5",
  data: [{ ...record }],
  ...extra,
});
function responseMock(value: unknown, options?: ResponseInit) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(value), options));
}
function dependencies(
  mockFetch: typeof fetch,
  env = ENV
): ProviderDependencies {
  return { fetch: mockFetch, env };
}
function digest(value: string) {
  return createHash("md5").update(value).digest("hex").toUpperCase();
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real network forbidden in offline tests");
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("carrier allowlist and shared DTO", () => {
  it.each([
    ["顺丰速运", "shunfeng"],
    [" s-f ", "shunfeng"],
    ["SFEXPRESS", "shunfeng"],
    ["中通", "zhongtong"],
    ["ZTO", "zhongtong"],
    ["圆通速递", "yuantong"],
    ["YTO", "yuantong"],
    ["申通快递", "shentong"],
    ["STO", "shentong"],
    ["韵达快递", "yunda"],
    ["京东物流", "jd"],
    ["中国邮政", "youzhengguonei"],
    ["邮政快递包裹", "youzhengguonei"],
    ["EMS", "ems"],
    ["邮政EMS", "ems"],
    ["极兔速递", "jtexpress"],
    ["J&T", "jtexpress"],
    ["德邦快递", "debangkuaidi"],
    ["DEPPON", "debangkuaidi"],
    ["百世汇通", "huitongkuaidi"],
    ["BEST", "huitongkuaidi"],
    [" SHUNFENG ", "shunfeng"],
    ["zhongtong", "zhongtong"],
    ["youzhengguonei", "youzhengguonei"],
  ])("maps %s explicitly to %s", (name, code) => {
    expect(resolveCarrierCode(name)).toBe(code);
  });
  it.each([
    "",
    "未知快递",
    "顺丰国际未知业务",
    "auto",
    "constructor",
    "__proto__",
    "a".repeat(129),
  ])("does not guess unknown %s", name =>
    expect(resolveCarrierCode(name)).toBeNull()
  );
  it("distinguishes carrier delivery, collection, and dispatch without order settlement", () => {
    expect(getLogisticsStateLabel("3")).toBe("承运商已签收");
    expect(getLogisticsStateLabel("302")).toBe("他人代收");
    expect(getLogisticsStateLabel("304")).toBe("代收点签收");
    expect(getLogisticsStateLabel("5")).toBe("派送中");
    expect(getLogisticsStateLabel("502")).toBe("待取件");
    const dto: LogisticsDetails = {
      trackingCompany: "顺丰速运",
      trackingNo: INPUT.trackingNo,
      carrierCode: "shunfeng",
      state: null,
      stateLabel: getLogisticsStateLabel(null),
      records: [],
      updatedAt: null,
      source: null,
      stale: false,
      message: null,
      subscriptionStatus: "disabled",
      canRetryAt: null,
    };
    expect(dto.stateLabel).toBe("暂无物流状态");
    expect(getLogisticsStateLabel("9999")).toBe("物流状态待确认");
  });
});

describe("provider configuration", () => {
  it("reads injected env without exposing it through provider results", () => {
    expect(getProviderConfig({})).toEqual({
      key: "",
      customer: "",
      queryEnabled: false,
      subscriptionEnabled: false,
    });
    expect(
      getProviderConfig({ KUAIDI100_KEY: " test ", KUAIDI100_CUSTOMER: " c " })
    ).toEqual({
      key: "test",
      customer: "c",
      queryEnabled: true,
      subscriptionEnabled: true,
    });
  });
  it("permits key-only subscription but not query", async () => {
    const env = { KUAIDI100_KEY: ENV.KUAIDI100_KEY, KUAIDI100_CUSTOMER: "" };
    const mock = responseMock({ result: true, returnCode: "200" });
    expect((await queryKuaidi100(INPUT, dependencies(mock, env))).code).toBe(
      "NOT_CONFIGURED"
    );
    expect(
      (await subscribeKuaidi100(SUBSCRIPTION, dependencies(mock, env))).ok
    ).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("reads runtime env on each invocation rather than capturing it during import", async () => {
    vi.stubEnv("KUAIDI100_KEY", ENV.KUAIDI100_KEY);
    vi.stubEnv("KUAIDI100_CUSTOMER", ENV.KUAIDI100_CUSTOMER);
    const mock = responseMock(success());
    expect((await queryKuaidi100(INPUT, { fetch: mock })).ok).toBe(true);
    vi.stubEnv("KUAIDI100_KEY", "");
    expect((await queryKuaidi100(INPUT, { fetch: mock })).code).toBe(
      "NOT_CONFIGURED"
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("accepts an env function for dependency injection", async () => {
    const env = vi.fn(() => ENV);
    expect(
      (await queryKuaidi100(INPUT, { fetch: responseMock(success()), env })).ok
    ).toBe(true);
    expect(env).toHaveBeenCalledTimes(1);
  });
});

describe("official real-time query request and responses", () => {
  it("POSTs form customer/sign/param with exact official signature and optional phone", async () => {
    const mock = responseMock(success());
    const result = await queryKuaidi100(
      { ...INPUT, carrierCode: "SF", phone: "1234" },
      dependencies(mock)
    );
    expect(result).toMatchObject({ ok: true, code: "200", state: "5" });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://poll.kuaidi100.com/poll/query.do");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(init?.body as string);
    expect([...form.keys()].sort()).toEqual(["customer", "param", "sign"]);
    expect(form.get("customer")).toBe(ENV.KUAIDI100_CUSTOMER);
    expect(form.get("sign")).toBe(
      digest(form.get("param")! + ENV.KUAIDI100_KEY + ENV.KUAIDI100_CUSTOMER)
    );
    expect(JSON.parse(form.get("param")!)).toEqual({
      com: "shunfeng",
      num: INPUT.trackingNo,
      phone: "1234",
      show: "0",
      order: "desc",
      resultv2: "1",
    });
  });
  it.each(["shunfeng", "zhongtong"])(
    "does not pre-block phone-less %s or enumerate phone digits",
    async carrierCode => {
      const mock = responseMock({
        status: "408",
        message: "caller phone rejected",
      });
      const result = await queryKuaidi100(
        { ...INPUT, carrierCode },
        dependencies(mock)
      );
      expect(result).toEqual({
        ok: false,
        code: "408",
        message: "承运商电话验证未通过，请联系商家核对订单收件电话",
        state: null,
        records: [],
      });
      const body = JSON.parse(
        new URLSearchParams(mock.mock.calls[0][1]?.body as string).get("param")!
      );
      expect(body).not.toHaveProperty("phone");
      expect(mock).toHaveBeenCalledTimes(1);
    }
  );
  it("sorts newest first using carrier timestamps, not upstream ordering", async () => {
    const mock = responseMock(
      success({
        data: [
          {
            ...record,
            time: "2026-11-25 10:00:00",
            ftime: "2026-11-25 10:00:00",
            context: "已揽收",
          },
          { ...record },
          { time: "2026-11-26 10:00:00", context: "运输中" },
        ],
      })
    );
    const result = await queryKuaidi100(INPUT, dependencies(mock));
    expect(result.records.map(item => item.time)).toEqual([
      "2026-11-27 10:00:00",
      "2026-11-26 10:00:00",
      "2026-11-25 10:00:00",
    ]);
    expect(result.records[2]).not.toHaveProperty("ftime");
  });
  it.each([
    ["408", "承运商电话验证未通过，请联系商家核对订单收件电话"],
    ["601", "物流查询授权已过期或无可用单量，请联系商家核对并充值"],
    ["503", "物流服务授权未通过，请联系商家"],
    ["500", "暂无物流记录，请稍后重试"],
    ["999", "物流服务暂不可用，请稍后重试"],
  ])(
    "maps error %s to a fixed message, without requiring parcel fields when no data",
    async (code, message) => {
      const mock = responseMock({
        returnCode: code,
        result: false,
        message: "PRIVATE_RAW_UPSTREAM",
      });
      expect(await queryKuaidi100(INPUT, dependencies(mock))).toEqual({
        ok: false,
        code,
        message,
        state: null,
        records: [],
      });
    }
  );
  it("maps empty success with omitted parcel fields to no records", async () => {
    expect(
      (
        await queryKuaidi100(
          INPUT,
          dependencies(responseMock({ status: "200", data: [] }))
        )
      ).code
    ).toBe("500");
  });
  it.each([
    { com: "zhongtong" },
    { com: "SHUNFENG" },
    { nu: "another" },
    { com: undefined },
    { nu: undefined },
    { nu: 123456 },
  ])("rejects mismatch or wrong/missing identity %j", async extra => {
    const result = await queryKuaidi100(
      INPUT,
      dependencies(responseMock(success(extra)))
    );
    expect(result.ok).toBe(false);
    expect(result.records).toEqual([]);
    expect(["RESPONSE_MISMATCH", "INVALID_RESPONSE"]).toContain(result.code);
  });
  it("does not expose mismatched error response records", async () => {
    const result = await queryKuaidi100(
      INPUT,
      dependencies(responseMock(success({ status: "408", com: undefined })))
    );
    expect(result.code).toBe("RESPONSE_MISMATCH");
    expect(result.records).toEqual([]);
  });
  it.each([
    { state: 5 },
    { state: "text" },
    { state: null },
    { state: undefined },
    { status: 200 },
    { data: {} },
    { data: [{ time: "bad", context: "bad" }] },
    { data: [{ time: "2026-02-30 10:00:00", context: "bad" }] },
    { data: [{ time: record.time, context: 1 }] },
    { data: [{ time: record.time, context: "x".repeat(4097) }] },
    { data: [{ ...record, status: { unsafe: "object" } }] },
    { result: false },
    { returnCode: "503" },
  ])("strictly rejects malformed or contradictory schema %j", async extra => {
    const result = await queryKuaidi100(
      INPUT,
      dependencies(responseMock(success(extra)))
    );
    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_RESPONSE",
      records: [],
    });
  });
  it("strips unknown metadata and redacts keys, input phone, and courier phones in records", async () => {
    const privateText = `${ENV.KUAIDI100_KEY};${ENV.KUAIDI100_CUSTOMER};1234;联系13800138000或010-87654321`;
    const result = await queryKuaidi100(
      { ...INPUT, phone: "1234" },
      dependencies(
        responseMock(
          success({
            message: privateText,
            token: ENV.KUAIDI100_KEY,
            data: [
              {
                ...record,
                context: privateText,
                status: "电话1234",
                secret: ENV.KUAIDI100_KEY,
              },
            ],
          })
        )
      )
    );
    expect(result.ok).toBe(true);
    for (const secret of [
      ENV.KUAIDI100_KEY,
      ENV.KUAIDI100_CUSTOMER,
      "1234",
      "13800138000",
      "010-87654321",
    ]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(Object.keys(result)).toEqual([
      "ok",
      "code",
      "message",
      "state",
      "records",
    ]);
    expect(Object.keys(result.records[0])).toEqual([
      "time",
      "context",
      "status",
    ]);
  });
  it.each([
    { trackingNo: "" },
    { trackingNo: "1;DROP" },
    { trackingNo: "1".repeat(65) },
    { trackingNo: 123 },
    { phone: "abc" },
    { carrierCode: "auto" },
  ])(
    "rejects invalid/unsupported inputs before any request %j",
    async extra => {
      const mock = responseMock(success());
      const result = await queryKuaidi100(
        { ...INPUT, ...extra } as typeof INPUT,
        dependencies(mock)
      );
      expect(result.ok).toBe(false);
      expect(mock).not.toHaveBeenCalled();
    }
  );
});

describe("bounded response and deadline", () => {
  it("rejects excessive record count rather than silently returning a truncated history", async () => {
    const mock = responseMock(
      success({
        data: Array.from({ length: KUAIDI100_MAX_RECORDS + 1 }, () => ({
          ...record,
        })),
      })
    );
    expect((await queryKuaidi100(INPUT, dependencies(mock))).code).toBe(
      "INVALID_RESPONSE"
    );
  });
  it("accepts exactly the record limit", async () => {
    const mock = responseMock(
      success({
        data: Array.from({ length: KUAIDI100_MAX_RECORDS }, () => ({
          ...record,
        })),
      })
    );
    expect(
      (await queryKuaidi100(INPUT, dependencies(mock))).records
    ).toHaveLength(KUAIDI100_MAX_RECORDS);
  });
  it("rejects oversized content-length before consuming the body", async () => {
    const mock = responseMock(success(), {
      headers: { "content-length": String(KUAIDI100_MAX_RESPONSE_BYTES + 1) },
    });
    expect((await queryKuaidi100(INPUT, dependencies(mock))).code).toBe(
      "RESPONSE_TOO_LARGE"
    );
  });
  it("enforces byte limit even with no content-length and multibyte text", async () => {
    const mock = responseMock({
      ignored: "中".repeat(KUAIDI100_MAX_RESPONSE_BYTES),
    });
    expect((await queryKuaidi100(INPUT, dependencies(mock))).code).toBe(
      "RESPONSE_TOO_LARGE"
    );
  });
  it("rejects malformed JSON without returning its body", async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("RAW_PRIVATE_BODY_NOT_JSON"));
    expect(await queryKuaidi100(INPUT, dependencies(mock))).toMatchObject({
      ok: false,
      code: "INVALID_RESPONSE",
    });
  });
  it("rejects invalid UTF-8 rather than replacing bytes", async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([0xff, 0xfe])));
    expect((await queryKuaidi100(INPUT, dependencies(mock))).code).toBe(
      "INVALID_RESPONSE"
    );
  });
  it("returns a friendly error for HTTP failure and never leaks raw response", async () => {
    const mock = responseMock({ message: "STACK_KEY_PHONE" }, { status: 502 });
    expect(await queryKuaidi100(INPUT, dependencies(mock))).toEqual({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "物流服务暂不可用，请稍后重试",
      state: null,
      records: [],
    });
  });
  it("never forwards thrown fetch errors or stacks", async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new Error(`${ENV.KUAIDI100_KEY} 13800138000 STACK_SECRET`)
      );
    const result = await queryKuaidi100(INPUT, dependencies(mock));
    expect(result.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(result)).not.toMatch(
      /offline-test-key|13800138000|STACK_SECRET|stack/
    );
  });
  it("aborts at 10 seconds even if injected fetch ignores the abort signal", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const pending = queryKuaidi100(INPUT, dependencies(mock));
    const signal = mock.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(KUAIDI100_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({
      ok: false,
      code: "timeout",
      message: "物流服务暂不可用，请稍后重试",
    });
    expect(signal?.aborted).toBe(true);
  });
  it("covers a hung response body in the same 10 second timeout", async () => {
    vi.useFakeTimers();
    const mock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start() {
            /* offline hung body */
          },
        })
      )
    );
    const pending = queryKuaidi100(INPUT, dependencies(mock));
    await vi.advanceTimersByTimeAsync(KUAIDI100_TIMEOUT_MS);
    expect((await pending).code).toBe("timeout");
    expect(mock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("clears deadline on successful completion", async () => {
    vi.useFakeTimers();
    const mock = responseMock(success());
    expect((await queryKuaidi100(INPUT, dependencies(mock))).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("official subscription", () => {
  it("posts schema=json and exact key/parameters shape to /poll", async () => {
    const mock = responseMock({
      result: true,
      returnCode: "200",
      message: "contains private upstream body",
    });
    const result = await subscribeKuaidi100(
      { ...SUBSCRIPTION, phone: "1234" },
      dependencies(mock)
    );
    expect(result).toEqual({
      ok: true,
      code: "200",
      message: "物流订阅已提交，等待已验签回调（尚未确认收到推送）",
    });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://poll.kuaidi100.com/poll");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const form = new URLSearchParams(init?.body as string);
    expect([...form.keys()].sort()).toEqual(["param", "schema"]);
    expect(form.get("schema")).toBe("json");
    expect(JSON.parse(form.get("param")!)).toEqual({
      company: "shunfeng",
      number: INPUT.trackingNo,
      key: ENV.KUAIDI100_KEY,
      parameters: {
        callbackurl: SUBSCRIPTION.callbackUrl,
        salt: SUBSCRIPTION.salt,
        phone: "1234",
        resultv2: "1",
      },
    });
    expect(JSON.stringify(result)).not.toContain(ENV.KUAIDI100_KEY);
  });
  it("omits absent phone and does not enumerate for subscription", async () => {
    const mock = responseMock({ result: true, returnCode: "200" });
    expect(
      (await subscribeKuaidi100(SUBSCRIPTION, dependencies(mock))).ok
    ).toBe(true);
    expect(
      JSON.parse(
        new URLSearchParams(mock.mock.calls[0][1]?.body as string).get("param")!
      ).parameters
    ).not.toHaveProperty("phone");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { callbackUrl: "http://merchant.example/callback" },
    { callbackUrl: "not-url" },
    { callbackUrl: "https://user:secret@merchant.example/callback" },
    { callbackUrl: "https://merchant.example/callback#fragment" },
    { salt: "" },
    { salt: " " },
    { carrierCode: "unknown" },
  ])("rejects unsafe subscription input %j without fetch", async extra => {
    const mock = responseMock({ result: true, returnCode: "200" });
    expect(
      (
        await subscribeKuaidi100(
          { ...SUBSCRIPTION, ...extra },
          dependencies(mock)
        )
      ).ok
    ).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([
    { result: "true", returnCode: "200" },
    { result: true, returnCode: 200 },
    { result: true },
    { result: false, returnCode: "200" },
  ])("rejects malformed subscription response %j", async value => {
    expect(
      (
        await subscribeKuaidi100(
          SUBSCRIPTION,
          dependencies(responseMock(value))
        )
      ).code
    ).toBe("INVALID_RESPONSE");
  });
  it("uses friendly carrier phone validation errors for subscription too", async () => {
    expect(
      await subscribeKuaidi100(
        SUBSCRIPTION,
        dependencies(
          responseMock({
            result: false,
            returnCode: "408",
            message: ENV.KUAIDI100_KEY,
          })
        )
      )
    ).toEqual({
      ok: false,
      code: "408",
      message: "承运商电话验证未通过，请联系商家核对订单收件电话",
    });
  });
  it("uses same deadline for subscriptions", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const pending = subscribeKuaidi100(SUBSCRIPTION, dependencies(mock));
    await vi.advanceTimersByTimeAsync(KUAIDI100_TIMEOUT_MS);
    expect(await pending).toEqual({
      ok: false,
      code: "timeout",
      message: "物流服务暂不可用，请稍后重试",
    });
    expect(mock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe("operation-specific official error semantics", () => {
  it.each([
    ["400", "invalid_request", "参数不完整或账号未充值"],
    ["401", "invalid_request", "暂不支持"],
    ["408", "phone", "电话验证"],
    ["500", "no_data", "暂无物流记录"],
    ["501", "provider", "服务器错误"],
    ["502", "provider", "繁忙"],
    ["503", "authorization", "授权未通过"],
    ["504", "rate_limit", "24小时"],
    ["601", "quota", "授权已过期或无可用单量"],
  ])("query %s keeps its own meaning", async (code, category, message) => {
    const result = await queryKuaidi100(INPUT, dependencies(responseMock({ status: code, message: "RAW_SECRET_KEY_PHONE" })));
    expect(result.message).toContain(message);
    expect(getLogisticsFeedbackMapping("query", code).category).toBe(category);
    expect(JSON.stringify(result)).not.toContain("RAW_SECRET");
  });
  it.each([
    ["500", "provider", "服务器错误"],
    ["501", "duplicate", "尚未验证本站回调"],
    ["502", "invalid_request", "安全规则"],
    ["600", "authorization", "授权Key出错或无可用单量"],
    ["601", "quota", "授权已过期或无可用单量"],
    ["700", "invalid_request", "暂不支持"],
    ["701", "invalid_request", "参数或回调"],
    ["702", "invalid_request", "公司识别失败或无可用单量"],
  ])("subscription %s does not reuse query meaning", async (code, category, message) => {
    const result = await subscribeKuaidi100(SUBSCRIPTION, dependencies(responseMock({ result: false, returnCode: code, message: "RAW_SECRET_KEY_PHONE" })));
    expect(result).toMatchObject({ ok: false, code });
    expect(result.message).toContain(message);
    expect(getLogisticsFeedbackMapping("subscription", code).category).toBe(category);
    expect(result.message).not.toContain("暂无物流记录");
    expect(JSON.stringify(result)).not.toContain("RAW_SECRET");
  });
  it.each(["999", "constructor", "__proto__", "RAW_SECRET", "601-private", "X".repeat(1000), null])("restricts unrecognized health code %j", code => {
    expect(getLogisticsFeedbackMapping("query", code)).toMatchObject({ code: "UNKNOWN", category: "provider" });
  });
});

describe("callback verification", () => {
  const param = '{"status":"polling","lastResult":{"com":"shunfeng"}}';
  const salt = "offline-callback-salt";
  it("matches MD5(raw param + salt) with constant-time comparison", () => {
    const sign = digest(param + salt);
    expect(verifyKuaidi100Callback(param, sign, salt)).toBe(true);
    expect(verifyKuaidi100Callback(param, sign.toLowerCase(), salt)).toBe(true);
    expect(verifyKuaidi100Callback(`${param} `, sign, salt)).toBe(false);
    expect(verifyKuaidi100Callback(param, sign, `${salt}different`)).toBe(
      false
    );
    expect(verifyKuaidi100Callback(param, "0".repeat(32), salt)).toBe(false);
  });
  it.each(["", " ", "\t\n"])("refuses empty/blank salt %j", invalidSalt => {
    expect(
      verifyKuaidi100Callback(param, digest(param + invalidSalt), invalidSalt)
    ).toBe(false);
  });
  it.each(["", "short", "x".repeat(32), "0".repeat(31), "0".repeat(33)])(
    "rejects malformed sign %s without throwing",
    sign => {
      expect(verifyKuaidi100Callback(param, sign, salt)).toBe(false);
    }
  );
  it("rejects oversized raw callback and empty param", () => {
    expect(
      verifyKuaidi100Callback(
        "中".repeat(KUAIDI100_MAX_RESPONSE_BYTES),
        "0".repeat(32),
        salt
      )
    ).toBe(false);
    expect(verifyKuaidi100Callback("", digest(salt), salt)).toBe(false);
  });
});

describe("shared phone preprocessing for query and subscription", () => {
  it.each([
    ["13800138000-1234", "1234"],
    [" (0123) 4567-8901 ", "012345678901"],
    ["（０１２３）４５６７－８９０１", "012345678901"],
    ["13800138000", "13800138000"],
    ["1234567890123456", "1234567890123456"],
    ["1234", "1234"],
  ])(
    "normalizes %s to %s once, without guessing or enumerating",
    async (phone, expected) => {
      const queryMock = responseMock(success());
      expect(
        (await queryKuaidi100({ ...INPUT, phone }, dependencies(queryMock))).ok
      ).toBe(true);
      const queryForm = new URLSearchParams(
        queryMock.mock.calls[0][1]?.body as string
      );
      expect(JSON.parse(queryForm.get("param")!).phone).toBe(expected);
      expect(queryMock).toHaveBeenCalledTimes(1);

      const subscribeMock = responseMock({ result: true, returnCode: "200" });
      expect(
        (
          await subscribeKuaidi100(
            { ...SUBSCRIPTION, phone },
            dependencies(subscribeMock)
          )
        ).ok
      ).toBe(true);
      const subscribeForm = new URLSearchParams(
        subscribeMock.mock.calls[0][1]?.body as string
      );
      expect(JSON.parse(subscribeForm.get("param")!).parameters.phone).toBe(
        expected
      );
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    "123",
    "12345678901234567",
    "138xxx-1234",
    "13800138000/ext1234",
    "+8613800138000",
    "   ",
  ])("rejects invalid phone format %s without requests", async phone => {
    const mock = responseMock(success());
    expect(
      (await queryKuaidi100({ ...INPUT, phone }, dependencies(mock))).code
    ).toBe("INVALID_INPUT");
    expect(
      (await subscribeKuaidi100({ ...SUBSCRIPTION, phone }, dependencies(mock)))
        .code
    ).toBe("INVALID_INPUT");
    expect(mock).not.toHaveBeenCalled();
  });
  it.each(["13800138000-1234", " (0123) 4567-8901 "])(
    "does not return raw formatted phone %s",
    async phone => {
      const result = await queryKuaidi100(
        { ...INPUT, phone },
        dependencies(
          responseMock(
            success({
              data: [{ ...record, context: `电话：${phone}` }],
            })
          )
        )
      );
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toContain(phone);
      expect(JSON.stringify(result)).not.toContain("13800138000");
      expect(JSON.stringify(result)).not.toContain("012345678901");
    }
  );
  it("does not treat prototype keys as logistics state labels", () => {
    expect(getLogisticsStateLabel("constructor")).toBe("物流状态待确认");
    expect(getLogisticsStateLabel("__proto__")).toBe("物流状态待确认");
  });
});
