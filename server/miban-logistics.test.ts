import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, rmSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createLogisticsService, LOGISTICS_CALLBACK_MAX_BYTES, LOGISTICS_MIN_INTERVAL_MS } from "./miban-logistics";
import { verifyKuaidi100Callback, type ProviderResult } from "./miban-logistics-provider";
import type { LogisticsRecord } from "../shared/miban-logistics";

// Local offline fixtures only. No orders/database imports and never a real provider/API call.
const shipment = { trackingCompany: "顺丰速运", trackingNo: "SF1234567890", phone: "13800138000" };
const id = createHash("sha256").update("shunfeng" + shipment.trackingNo).digest("hex");
const healthFile = createHash("sha256").update("miban-logistics:administrator-health:v1").digest("hex") + ".health.json";
const record = (time = "2026-11-27 10:00:00", context = "快件运输中"): LogisticsRecord => ({ time, context });
const success = (state = "0", records = [record()]): ProviderResult => ({ ok: true, code: "200", message: "成功", state, records });
const failure: ProviderResult = { ok: false, code: "408", message: "承运商电话验证未通过，请联系商家核对订单收件电话", state: null, records: [] };
const exec = promisify(execFile);

let dir: string;
let time: number;
let query: ReturnType<typeof vi.fn<(input: { carrierCode: string; trackingNo: string; phone?: string }) => Promise<ProviderResult>>>;
let subscribe: ReturnType<typeof vi.fn<(input: { carrierCode: string; trackingNo: string; phone?: string; callbackUrl: string; salt: string }) => Promise<{ ok: boolean; code: string; message: string }>>>;
const config = { queryConfigured: true, subscriptionEnabled: true, callbackUrl: "https://offline.invalid/api/miban/logistics/kuaidi100/callback?fixed=yes" };
function makeService(configuration = config) {
  return createLogisticsService({
    storageDir: dir, clock: () => time, config: configuration,
    provider: { queryKuaidi100: query, subscribeKuaidi100: subscribe, verifyKuaidi100Callback },
  });
}
async function cached() { return JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")); }
function callback(salt: string, overrides: Record<string, unknown> = {}, outer: Record<string, unknown> = {}) {
  const param = JSON.stringify({ status: "polling", lastResult: { com: "shunfeng", nu: shipment.trackingNo, status: "200", state: "0", data: [record()], ...overrides }, ...outer });
  return { id, param, sign: createHash("md5").update(param + salt).digest("hex").toUpperCase() };
}
async function subscribed() {
  const service = makeService();
  await service.subscribeShipmentLogistics(shipment);
  return { service, salt: (await cached()).subscription.salt as string };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "miban-logistics-offline-"));
  time = Date.parse("2026-11-27T02:00:00Z");
  query = vi.fn(async () => success());
  subscribe = vi.fn(async () => ({ ok: true, code: "200", message: "订阅成功" }));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real requests are forbidden in offline tests"); }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("shipment logistics cache and query isolation", () => {
  it("returns friendly input errors without any external call or cache write", async () => {
    const service = makeService();
    expect((await service.getShipmentLogistics({ ...shipment, trackingNo: "" })).message).toContain("暂无运单号");
    expect((await service.getShipmentLogistics({ ...shipment, trackingCompany: "不明快递" })).message).toContain("暂不支持");
    expect((await service.getShipmentLogistics({ ...shipment, trackingNo: "../../elsewhere" })).message).toContain("格式");
    expect(query).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("returns cold data, hot cached data, and restart data with Chinese carrier state", async () => {
    const service = makeService();
    const first = await service.getShipmentLogistics(shipment);
    expect(first).toMatchObject({ state: "0", stateLabel: "运输中", source: "query", stale: false, updatedAt: new Date(time).toISOString(), records: [record()] });
    time += 60_000;
    expect((await service.getShipmentLogistics(shipment)).updatedAt).toBe(first.updatedAt);
    expect((await makeService().getShipmentLogistics(shipment)).records).toEqual(first.records);
    expect(query).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, `${id}.json`))).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual([`${id}.json`, healthFile].sort());
  });
  it("keeps old records and successful updatedAt when refresh fails; failures consume half-hour windows", async () => {
    const service = makeService();
    const first = await service.getShipmentLogistics(shipment);
    time += LOGISTICS_MIN_INTERVAL_MS;
    query.mockResolvedValue(failure);
    const failed = await service.getShipmentLogistics(shipment);
    expect(failed).toMatchObject({ records: first.records, updatedAt: first.updatedAt, stale: true, message: failure.message });
    expect(failed.canRetryAt).toBe(new Date(time + LOGISTICS_MIN_INTERVAL_MS).toISOString());
    time += LOGISTICS_MIN_INTERVAL_MS - 1;
    expect((await makeService().getShipmentLogistics(shipment)).records).toEqual(first.records);
    expect(query).toHaveBeenCalledTimes(2);
    time += 1;
    await service.getShipmentLogistics(shipment);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("rate-limits cold failures and changed phones without persisting plaintext phone", async () => {
    query.mockResolvedValue(failure);
    const service = makeService();
    await service.getShipmentLogistics(shipment);
    await service.getShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(query).toHaveBeenCalledTimes(1);
    time += LOGISTICS_MIN_INTERVAL_MS;
    await makeService().getShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].phone).toBe("13900139000");
    const text = await readFile(join(dir, `${id}.json`), "utf8");
    expect(text).not.toContain(shipment.phone);
    expect(text).not.toContain("13900139000");
    expect((await cached()).queryPhoneHash).toBe(createHash("sha256").update("13900139000").digest("hex"));
  });
  it("normalizes server phone formatting and virtual-number suffixes without persisting either raw input", async () => {
    const service = makeService();
    await service.getShipmentLogistics({ ...shipment, phone: "13800138000-1234" });
    expect(query.mock.calls[0][0].phone).toBe("1234");
    time += LOGISTICS_MIN_INTERVAL_MS;
    await service.getShipmentLogistics({ ...shipment, phone: "(021) 1234 5678" });
    expect(query.mock.calls[1][0].phone).toBe("02112345678");
    const text = await readFile(join(dir, `${id}.json`), "utf8");
    expect(text).not.toContain("13800138000-1234");
    expect(text).not.toContain("02112345678");
  });
  it("redacts phones from records/errors and prevents thrown provider errors leaking or bypassing limits", async () => {
    query.mockResolvedValue(success("0", [record(undefined, `收件电话${shipment.phone}`)]));
    const service = makeService();
    await service.getShipmentLogistics(shipment);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).not.toContain(shipment.phone);
    time += LOGISTICS_MIN_INTERVAL_MS;
    query.mockRejectedValue(new Error(`sensitive failure ${shipment.phone}`));
    expect((await service.getShipmentLogistics(shipment)).message).toBe("物流服务暂不可用，请稍后重试");
    await makeService().getShipmentLogistics(shipment);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("coalesces double-clicks and serializes separate service instances", async () => {
    query.mockImplementation(async () => { await new Promise(done => setTimeout(done, 60)); return success(); });
    const service = makeService();
    const results = await Promise.all([service.getShipmentLogistics(shipment), service.getShipmentLogistics(shipment), makeService().getShipmentLogistics(shipment)]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(results.every(result => result.records.length === 1)).toBe(true);
    expect(await readdir(dir)).toEqual([`${id}.json`, healthFile].sort());
  });
  it("preserves signed terminal carrier state across refresh and restart", async () => {
    query.mockResolvedValue(success("3", [record(undefined, "已签收")]));
    const first = await makeService().getShipmentLogistics(shipment);
    time += 10 * LOGISTICS_MIN_INTERVAL_MS;
    query.mockResolvedValue(failure);
    expect(await makeService().getShipmentLogistics(shipment)).toMatchObject({ state: "3", stateLabel: "承运商已签收", stale: false, updatedAt: first.updatedAt });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("does not call query when server configuration is absent and exposes only configuration booleans", async () => {
    const service = makeService({ queryConfigured: false, subscriptionEnabled: false, callbackUrl: "" });
    expect((await service.getShipmentLogistics(shipment)).message).toContain("暂未配置");
    expect(query).not.toHaveBeenCalled();
    expect(service.getLogisticsConfigurationStatus()).toEqual({ queryConfigured: false, subscriptionEnabled: false, callbackConfigured: false });
    expect(makeService().getLogisticsConfigurationStatus()).toEqual({ queryConfigured: true, subscriptionEnabled: true, callbackConfigured: true });
  });
  it("fails closed on corrupt storage instead of silently bypassing rate limits", async () => {
    await writeFile(join(dir, `${id}.json`), "not-json", { mode: 0o600 });
    await expect(makeService().getShipmentLogistics(shipment)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("explicit subscription gating and retry", () => {
  it("never submits or creates salts when subscription is disabled, URL missing or unsafe", async () => {
    for (const configuration of [
      { ...config, subscriptionEnabled: false }, { ...config, callbackUrl: "" },
      { ...config, callbackUrl: "ftp://offline.invalid/callback" }, { ...config, callbackUrl: "https://user:pass@offline.invalid/callback" },
    ]) {
      expect((await makeService(configuration).subscribeShipmentLogistics(shipment)).subscriptionStatus).toBe("disabled");
    }
    expect(subscribe).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("disables HTTP callback configuration without submitting or creating subscription state", async () => {
    const service = makeService({ ...config, callbackUrl: "http://offline.invalid/api/miban/logistics/kuaidi100/callback" });
    expect(service.getLogisticsConfigurationStatus()).toEqual({ queryConfigured: true, subscriptionEnabled: false, callbackConfigured: false });
    expect((await service.subscribeShipmentLogistics(shipment)).subscriptionStatus).toBe("disabled");
    expect(subscribe).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });
  it("uses only configured callback base, cryptographic per-shipment salts, and no duplicate subscriptions", async () => {
    const service = makeService();
    await Promise.all([service.subscribeShipmentLogistics(shipment), makeService().subscribeShipmentLogistics(shipment)]);
    const result = await service.subscribeShipmentLogistics(shipment);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(result.subscriptionStatus).toBe("active");
    const sent = subscribe.mock.calls[0][0];
    const url = new URL(sent.callbackUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("offline.invalid");
    expect(url.searchParams.get("id")).toBe(id);
    expect(url.searchParams.get("fixed")).toBe("yes");
    expect(sent.salt).toMatch(/^[a-f0-9]{64}$/);
    expect((await cached()).subscription.salt).toBe(sent.salt);
    expect(JSON.stringify(result)).not.toContain(sent.salt);
    expect(JSON.stringify(result)).not.toContain(sent.callbackUrl);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).not.toContain(shipment.phone);
    await service.subscribeShipmentLogistics({ ...shipment, trackingNo: "SF999888777" });
    expect(subscribe.mock.calls[1][0].salt).not.toBe(sent.salt);
  });
  it("maps vendor duplicate code 501 to active without a second request", async () => {
    subscribe.mockResolvedValue({ ok: false, code: "501", message: "重复订阅" });
    expect(await makeService().subscribeShipmentLogistics(shipment)).toMatchObject({ subscriptionStatus: "active", message: "物流重复订阅，尚未验证本站回调是否正常" });
    time += LOGISTICS_MIN_INTERVAL_MS;
    await makeService().subscribeShipmentLogistics(shipment);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
  it("returns error without throwing shipping failure and persists retry across restarts/phone changes", async () => {
    subscribe.mockRejectedValue(new Error("offline failure"));
    const service = makeService();
    const result = await service.subscribeShipmentLogistics(shipment);
    expect(result.subscriptionStatus).toBe("error");
    expect(result.canRetryAt).toBe(new Date(time + LOGISTICS_MIN_INTERVAL_MS).toISOString());
    await makeService().subscribeShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(subscribe).toHaveBeenCalledTimes(1);
    time += LOGISTICS_MIN_INTERVAL_MS;
    subscribe.mockResolvedValue({ ok: true, code: "200", message: "成功" });
    expect((await makeService().subscribeShipmentLogistics({ ...shipment, phone: "13900139000" })).subscriptionStatus).toBe("active");
    expect(subscribe).toHaveBeenCalledTimes(2);
  });
  it("permits changed-phone revalidation only after the half-hour subscription window", async () => {
    const service = makeService();
    await service.subscribeShipmentLogistics(shipment);
    await service.subscribeShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(subscribe).toHaveBeenCalledTimes(1);
    time += LOGISTICS_MIN_INTERVAL_MS;
    await service.subscribeShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});

describe("authenticated push callbacks", () => {
  it.each(["polling", "updateall"])("rejects malicious signatures, unknown/path-traversal ids and oversized %s payloads without writing", async status => {
    const { service, salt } = await subscribed();
    const before = await readFile(join(dir, `${id}.json`), "utf8");
    const valid = callback(salt, {}, { status });
    expect(await service.acceptLogisticsCallback({ ...valid, sign: "0".repeat(32) })).toBe(false);
    expect(await service.acceptLogisticsCallback({ ...valid, sign: "x".repeat(32) })).toBe(false);
    expect(await service.acceptLogisticsCallback({ ...valid, id: "../attack" })).toBe(false);
    expect(await service.acceptLogisticsCallback({ ...valid, id: "a".repeat(64) })).toBe(false);
    expect(await service.acceptLogisticsCallback({ ...valid, param: "测".repeat(Math.ceil(LOGISTICS_CALLBACK_MAX_BYTES / 3)) })).toBe(false);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).toBe(before);
    expect(await readdir(dir)).toEqual([`${id}.json`, healthFile].sort());
  });
  it.each(["polling", "updateall"])("rejects correctly signed %s wrong shipments, malformed schema/status/timestamps or carrier switching", async status => {
    const { service, salt } = await subscribed();
    const before = await readFile(join(dir, `${id}.json`), "utf8");
    for (const input of [
      callback(salt, { nu: "SFOTHER" }, { status }), callback(salt, { com: "zhongtong" }, { status }),
      callback(salt, { status: "500" }, { status }), callback(salt, { status: 200 }, { status }), callback(salt, { state: "invalid" }, { status }),
      callback(salt, { data: [record("2026-02-30 10:00:00")] }, { status }), callback(salt, { data: [{}] }, { status }),
      callback(salt, {}, { status: "unexpected" }), callback(salt, {}, { status, lastResult: null }),
    ]) expect(await service.acceptLogisticsCallback(input)).toBe(false);
    const param = "{bad-json";
    expect(await service.acceptLogisticsCallback({ id, param, sign: createHash("md5").update(param + salt).digest("hex") })).toBe(false);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).toBe(before);
  });
  it.each(["polling", "updateall"])("persists %s before acknowledgment and duplicate callbacks are idempotent across restart", async status => {
    const { service, salt } = await subscribed();
    const input = callback(salt, { data: [record(undefined, "电话13800138000")], state: "5" }, { status });
    time += 1000;
    expect(await service.acceptLogisticsCallback(input)).toBe(true);
    const first = await cached();
    expect(first).toMatchObject({ state: "5", subscription: { status: "active" } });
    expect(first.source).toBe("push");
    expect(first.updatedAt).toBe(new Date(time).toISOString());
    expect(first.records[0].context).not.toContain(shipment.phone);
    const before = await readFile(join(dir, `${id}.json`), "utf8");
    time += 10_000;
    expect(await makeService().acceptLogisticsCallback(input)).toBe(true);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).toBe(before);
    expect((await stat(join(dir, `${id}.json`))).mode & 0o777).toBe(0o600);
  });
  it.each(["polling", "updateall"])("keeps non-adjacent %s replay callbacks idempotent without another disk write or updatedAt change", async status => {
    const { service, salt } = await subscribed();
    const a = callback(salt, {}, { status, message: "first" });
    const b = callback(salt, {}, { status, message: "second" });
    await service.acceptLogisticsCallback(a);
    time += 1000;
    await service.acceptLogisticsCallback(b);
    const before = await readFile(join(dir, `${id}.json`), "utf8");
    time += 1000;
    expect(await makeService().acceptLogisticsCallback(a)).toBe(true);
    expect(await readFile(join(dir, `${id}.json`), "utf8")).toBe(before);
  });
  it("serves fresh push data without querying again, but changed-phone verification remains rate-limited", async () => {
    const { service, salt } = await subscribed();
    await service.acceptLogisticsCallback(callback(salt));
    expect((await service.getShipmentLogistics(shipment)).source).toBe("push");
    expect(query).not.toHaveBeenCalled();
    await service.getShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect(query).toHaveBeenCalledTimes(1);
    await service.getShipmentLogistics({ ...shipment, phone: "13700137000" });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(["polling", "updateall"])("ignores out-of-order %s nodes and never regresses terminal state", async status => {
    const { service, salt } = await subscribed();
    const newer = callback(salt, { data: [record("2026-11-27 12:00:00", "已签收")], state: "3" }, { status: "shutdown" });
    expect(await service.acceptLogisticsCallback(newer)).toBe(true);
    const first = await cached();
    time += 10_000;
    expect(await service.acceptLogisticsCallback(callback(salt, { data: [record("2026-11-27 11:00:00")], state: "0" }, { status }))).toBe(true);
    expect(await service.acceptLogisticsCallback(callback(salt, { data: [record("2026-11-27 13:00:00")], state: "0" }, { status }))).toBe(true);
    expect(await cached()).toMatchObject({ state: "3", records: first.records, updatedAt: first.updatedAt, subscription: { status: "shutdown" } });
    expect((await service.getShipmentLogistics(shipment)).stale).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it("keeps records on abort and durably records shutdown", async () => {
    const { service, salt } = await subscribed();
    await service.acceptLogisticsCallback(callback(salt));
    const first = await cached();
    time += 1000;
    expect(await service.acceptLogisticsCallback(callback(salt, { status: "400", data: [], state: null }, { status: "abort" }))).toBe(true);
    expect(await cached()).toMatchObject({ records: first.records, updatedAt: first.updatedAt, subscription: { status: "abort", lastAttemptAt: time } });
    expect((await service.subscribeShipmentLogistics(shipment)).subscriptionStatus).toBe("abort");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(await service.acceptLogisticsCallback(callback(salt, { data: [record("2026-11-27 11:00:00")], state: "4" }, { status: "shutdown" }))).toBe(true);
    expect((await cached()).subscription.status).toBe("shutdown");
  });
  it("serializes in-flight query with callback, while an older subsequent query cannot overwrite push", async () => {
    const { service, salt } = await subscribed();
    let finish!: (result: ProviderResult) => void;
    let started!: () => void;
    const entered = new Promise<void>(done => { started = done; });
    query.mockImplementation(() => { started(); return new Promise(done => { finish = done; }); });
    const querying = service.getShipmentLogistics(shipment);
    await entered;
    const pushing = makeService().acceptLogisticsCallback(callback(salt, { data: [record("2026-11-27 12:00:00")], state: "5" }));
    finish(success());
    await querying;
    expect(await pushing).toBe(true);
    expect(await cached()).toMatchObject({ source: "push", state: "5", records: [record("2026-11-27 12:00:00")] });
    const first = await cached();
    time += LOGISTICS_MIN_INTERVAL_MS;
    query.mockResolvedValue(success());
    await service.getShipmentLogistics(shipment);
    expect(await cached()).toMatchObject({ source: "push", state: "5", records: first.records, updatedAt: first.updatedAt });
  });
  it("continues validating existing subscriptions when new subscriptions are disabled", async () => {
    const { salt } = await subscribed();
    const service = makeService({ ...config, subscriptionEnabled: false });
    expect(await service.acceptLogisticsCallback(callback(salt))).toBe(true);
    expect((await service.subscribeShipmentLogistics(shipment)).subscriptionStatus).toBe("disabled");
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
  it.each(["polling", "updateall"])("throws %s persistence failures so routes can respond HTTP 500 instead of acknowledging lost data", async status => {
    const { salt } = await subscribed();
    const cacheFile = join(dir, `${id}.json`);
    const service = createLogisticsService({ storageDir: dir, config,
      provider: { queryKuaidi100: query, subscribeKuaidi100: subscribe },
      clock: () => {
        // Inject a real filesystem failure after the locked cache read: atomic rename cannot replace a directory.
        rmSync(cacheFile);
        mkdirSync(cacheFile);
        return time;
      },
    });
    await expect(service.acceptLogisticsCallback(callback(salt, {}, { status }))).rejects.toMatchObject({ code: "EISDIR" });
    expect((await readdir(dir)).some(name => name.endsWith(".lock") || name.endsWith(".tmp"))).toBe(false);
  });
});

describe("single-host cross-process cache locks", () => {
  it("allows only one provider call across two independent Node processes", async () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "server/miban-logistics.ts")).href;
    const marker = join(dir, "offline-calls.txt");
    const code = `
      import { createLogisticsService } from ${JSON.stringify(moduleUrl)};
      import { appendFile } from 'node:fs/promises';
      const service = createLogisticsService({ storageDir: ${JSON.stringify(dir)}, config: { queryConfigured: true, subscriptionEnabled: false },
        provider: { queryKuaidi100: async () => {
          await appendFile(${JSON.stringify(marker)}, 'offline-fixture\\n');
          await new Promise(done => setTimeout(done, 200));
          return ${JSON.stringify(success())};
        }} });
      const result = await service.getShipmentLogistics(${JSON.stringify(shipment)});
      if (result.records.length !== 1) process.exit(2);
    `;
    await Promise.all([exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { cwd: process.cwd(), timeout: 15_000 }), exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { cwd: process.cwd(), timeout: 15_000 })]);
    expect((await readFile(marker, "utf8")).trim().split("\n")).toHaveLength(1);
    expect((await readdir(dir)).filter(name => name.endsWith(".lock"))).toEqual([]);
  }, 20_000);
  it("recovers a dead-process lock but never evicts live owners", async () => {
    // Linux PID is deliberately outside the valid pid_max range, so no real process is signaled.
    const lock = join(dir, `${id}.lock`);
    await mkdir(lock, { mode: 0o700 });
    await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, token: "dead-owner" }), { mode: 0o600 });
    expect((await makeService().getShipmentLogistics(shipment)).records).toEqual([record()]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual([`${id}.json`, healthFile].sort());
  });
});
