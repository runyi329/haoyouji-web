import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createLogisticsService, LOGISTICS_MIN_INTERVAL_MS } from "./miban-logistics";
import type { AdminLogisticsFeedback } from "../shared/miban-logistics";
import type { ProviderResult } from "./miban-logistics-provider";

// Offline-only provider fixtures. All real fetches are denied; no database imports.
const shipment = { trackingCompany: "顺丰速运", trackingNo: "SF1234567890", phone: "13800138000" };
const id = createHash("sha256").update("shunfeng" + shipment.trackingNo).digest("hex");
const healthId = createHash("sha256").update("miban-logistics:administrator-health:v1").digest("hex");
const healthName = `${healthId}.health.json`;
const config = { queryConfigured: true, subscriptionEnabled: true, callbackUrl: "https://offline.invalid/callback" };
const record = { time: "2026-11-27 10:00:00", context: "离线运输测试" };
const ok: ProviderResult = { ok: true, code: "200", message: "PRIVATE_RAW_SUCCESS", state: "0", records: [record] };
const failed = (code: string): ProviderResult => ({ ok: false, code, message: "PRIVATE_RAW_KEY_CUSTOMER_PHONE_SALT", state: null, records: [] });
const exec = promisify(execFile);
let dir: string;
let time: number;
let query: ReturnType<typeof vi.fn<(input: unknown) => Promise<ProviderResult>>>;
let subscribe: ReturnType<typeof vi.fn<(input: unknown) => Promise<{ ok: boolean; code: string; message: string }>>>;
function service(configuration = config) {
  return createLogisticsService({ storageDir: dir, clock: () => time, config: configuration,
    provider: { queryKuaidi100: query, subscribeKuaidi100: subscribe } });
}
async function cache() { return JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")); }
async function signedCallback(status = "polling", extra: Record<string, unknown> = {}) {
  const salt = (await cache()).subscription.salt;
  const param = JSON.stringify({ status, message: "PRIVATE_RAW_CALLBACK_PHONE_KEY_CUSTOMER_SALT", lastResult: {
    com: "shunfeng", nu: shipment.trackingNo, status: status === "abort" ? "400" : "200",
    state: "0", data: status === "abort" ? [] : [record], ...extra,
  } });
  return { id, param, sign: createHash("md5").update(param + salt).digest("hex") };
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "miban-health-offline-"));
  time = Date.parse("2026-11-27T02:00:00Z");
  query = vi.fn(async () => ok);
  subscribe = vi.fn(async () => ({ ok: true, code: "200", message: "PRIVATE_RAW_SUBSCRIPTION" }));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real provider requests forbidden"); }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("administrator logistics telemetry", () => {
  it("reports truthful empty history and unknown balance without provider calls, writes or cache scanning", async () => {
    await writeFile(join(dir, `${id}.json`), "corrupt legacy shipment cache");
    const result = await service().getLogisticsServiceHealth();
    expect(result).toEqual({ queryConfigured: true, subscriptionEnabled: true, callbackConfigured: true,
      balanceStatus: "unknown", lastQuery: null, lastSubscription: null, lastCallback: null, recent: [],
      storageWarning: null, checkedAt: new Date(time).toISOString() });
    expect(query).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([`${id}.json`]);
  });
  it("records actual query success only once, survives restart, and preserves 600/700 permissions", async () => {
    const instance = service();
    const customer = await instance.getShipmentLogistics(shipment);
    const first = await instance.getLogisticsServiceHealth();
    expect(first.lastQuery).toEqual({ operation: "query", code: "200", category: "success", message: "物流查询成功",
      at: new Date(time).toISOString(), carrierCode: "shunfeng", trackingNoMasked: "****7890" });
    expect(first.lastSubscription).toBeNull();
    expect(first.lastCallback).toBeNull();
    expect(first.recent).toHaveLength(1);
    expect(first.balanceStatus).toBe("unknown");
    expect(JSON.stringify(customer)).not.toMatch(/lastQuery|balanceStatus|trackingNoMasked|category/);
    time += 60_000;
    await instance.getShipmentLogistics(shipment);
    await service().getShipmentLogistics(shipment);
    expect((await service().getLogisticsServiceHealth()).lastQuery).toEqual(first.lastQuery);
    expect((await service().getLogisticsServiceHealth()).recent).toEqual(first.recent);
    expect(query).toHaveBeenCalledTimes(1);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, healthName))).mode & 0o777).toBe(0o600);
    const mutable = await instance.getLogisticsServiceHealth();
    mutable.lastQuery!.message = "MUTATED";
    mutable.recent[0].message = "MUTATED";
    expect((await instance.getLogisticsServiceHealth()).lastQuery!.message).toBe("物流查询成功");
  });
  it.each([
    ["601", "quota"], ["408", "phone"], ["400", "invalid_request"], ["500", "no_data"],
    ["501", "provider"], ["503", "authorization"], ["504", "rate_limit"],
  ])("records query %s safely without treating cache hits as recovery", async (code, category) => {
    query.mockResolvedValue(failed(code));
    const instance = service();
    await instance.getShipmentLogistics(shipment);
    expect((await instance.getLogisticsServiceHealth()).lastQuery).toMatchObject({ code, category });
    time += 1000;
    await service().getShipmentLogistics({ ...shipment, phone: "13900139000" });
    expect((await service().getLogisticsServiceHealth()).recent).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await instance.getLogisticsServiceHealth())).not.toContain("PRIVATE_RAW");
  });
  it.each([["501", "duplicate"], ["500", "provider"], ["600", "authorization"], ["601", "quota"], ["702", "invalid_request"]])(
    "records subscription %s independently and keeps ambiguous codes out of quota", async (code, category) => {
      subscribe.mockResolvedValue({ ok: false, code, message: "PRIVATE_RAW_KEY_CUSTOMER_PHONE_SALT" });
      const instance = service();
      const result = await instance.subscribeShipmentLogistics(shipment);
      const health = await instance.getLogisticsServiceHealth();
      expect(health.lastSubscription).toMatchObject({ operation: "subscription", code, category });
      expect(health.lastQuery).toBeNull();
      expect(health.lastCallback).toBeNull();
      expect(health.balanceStatus).toBe("unknown");
      if (code === "501") {
        expect(result).toMatchObject({ subscriptionStatus: "active", message: "物流重复订阅，尚未验证本站回调是否正常" });
        time += LOGISTICS_MIN_INTERVAL_MS;
        await service().subscribeShipmentLogistics(shipment);
        expect(subscribe).toHaveBeenCalledTimes(1);
      }
      expect(JSON.stringify(health)).not.toContain("PRIVATE_RAW");
    }
  );
  it("distinguishes accepted submission from a verified callback and records durable abort", async () => {
    const instance = service();
    await instance.subscribeShipmentLogistics(shipment);
    const submitted = await instance.getLogisticsServiceHealth();
    expect(submitted.lastSubscription).toMatchObject({ code: "200", category: "success" });
    expect(submitted.lastSubscription!.message).toContain("尚未确认收到推送");
    expect(submitted.lastCallback).toBeNull();
    const callback = await signedCallback();
    time += 1000;
    expect(await instance.acceptLogisticsCallback(callback)).toBe(true);
    const pushed = await instance.getLogisticsServiceHealth();
    expect(pushed.lastCallback).toMatchObject({ operation: "callback", code: "200", category: "success", at: new Date(time).toISOString() });
    expect(pushed.lastSubscription).toEqual(submitted.lastSubscription);
    time += 1000;
    expect(await service().acceptLogisticsCallback(callback)).toBe(true);
    expect((await service().getLogisticsServiceHealth()).recent).toEqual(pushed.recent);
    time += 1000;
    expect(await instance.acceptLogisticsCallback(await signedCallback("abort"))).toBe(true);
    expect((await service().getLogisticsServiceHealth()).lastCallback).toMatchObject({ code: "ABORT", category: "aborted" });
  });
  it("does not expand unauthenticated or invalid callback attacks into health writes", async () => {
    const instance = service();
    await instance.subscribeShipmentLogistics(shipment);
    const before = await readFile(join(dir, healthName), "utf8");
    const callback = await signedCallback();
    expect(await instance.acceptLogisticsCallback({ ...callback, sign: "0".repeat(32) })).toBe(false);
    expect(await instance.acceptLogisticsCallback({ ...callback, id: "a".repeat(64) })).toBe(false);
    expect(await instance.acceptLogisticsCallback(await signedCallback("polling", { nu: "OTHER" }))).toBe(false);
    expect(await instance.acceptLogisticsCallback(await signedCallback("polling", { data: [{}] }))).toBe(false);
    expect(await readFile(join(dir, healthName), "utf8")).toBe(before);
  });
  it("bounds recent to 30 while retaining each independent last after its event is trimmed", async () => {
    const instance = service();
    await instance.subscribeShipmentLogistics(shipment);
    await instance.acceptLogisticsCallback(await signedCallback());
    const saved = await instance.getLogisticsServiceHealth();
    for (let i = 0; i < 35; i++) {
      time += 1000;
      await instance.getShipmentLogistics({ ...shipment, trackingNo: `SF-OFFLINE-${i}` });
    }
    const health = await service().getLogisticsServiceHealth();
    expect(health.recent).toHaveLength(30);
    expect(health.recent.every(item => item.operation === "query")).toBe(true);
    expect(health.lastSubscription).toEqual(saved.lastSubscription);
    expect(health.lastCallback).toEqual(saved.lastCallback);
    expect(health.lastQuery!.trackingNoMasked).toBe("****E-34");
    expect(JSON.parse(await readFile(join(dir, healthName), "utf8")).recent).toHaveLength(30);
  });
  it("serializes concurrent independent shipments from multiple service instances without lost events", async () => {
    const instances = [service(), service(), service()];
    await Promise.all(Array.from({ length: 18 }, (_, i) => instances[i % 3].getShipmentLogistics({ ...shipment, trackingNo: `SF-CONCURRENT-${i}` })));
    const health = await service().getLogisticsServiceHealth();
    expect(health.recent).toHaveLength(18);
    expect(new Set(health.recent.map(item => item.trackingNoMasked)).size).toBe(18);
    expect(query).toHaveBeenCalledTimes(18);
    expect((await readdir(dir)).some(name => name.endsWith(".lock") || name.endsWith(".tmp"))).toBe(false);
  });
  it("does not replace a later independent last with an older concurrent result", async () => {
    const later = createLogisticsService({ storageDir: dir, config, clock: () => time + 10_000, provider: { queryKuaidi100: query } });
    await later.getShipmentLogistics({ ...shipment, trackingNo: "SF-LATER" });
    await service().getShipmentLogistics({ ...shipment, trackingNo: "SF-OLDER" });
    const health = await service().getLogisticsServiceHealth();
    expect(health.lastQuery!.trackingNoMasked).toBe("****ATER");
    expect(health.recent.map(item => item.trackingNoMasked)).toEqual(["****LDER", "****ATER"]);
  });
  it("shares the dedicated health lock across actual Node processes with different shipment locks", async () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "server/miban-logistics.ts")).href;
    const code = (trackingNo: string) => `
      import { createLogisticsService } from ${JSON.stringify(moduleUrl)};
      const instance = createLogisticsService({ storageDir: ${JSON.stringify(dir)}, config: { queryConfigured: true, subscriptionEnabled: false },
        provider: { queryKuaidi100: async () => { await new Promise(done => setTimeout(done, 80)); return ${JSON.stringify(ok)}; } } });
      await instance.getShipmentLogistics({ trackingCompany: '顺丰速运', trackingNo: ${JSON.stringify(trackingNo)} });
    `;
    await Promise.all(["SF-PROCESS-A", "SF-PROCESS-B", "SF-PROCESS-C"].map(number => exec(process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code(number)], { cwd: process.cwd(), timeout: 15_000 })));
    const health = await service().getLogisticsServiceHealth();
    expect(health.recent).toHaveLength(3);
    expect(new Set(health.recent.map(item => item.trackingNoMasked)).size).toBe(3);
    expect((await readdir(dir)).filter(name => name.endsWith(".lock"))).toEqual([]);
  }, 20_000);
  it("stores neither raw messages, whole tracking numbers, phone, key, customer nor subscription salts", async () => {
    query.mockResolvedValue(failed("PRIVATE_SECRET_CODE"));
    subscribe.mockResolvedValue({ ok: false, code: "600", message: "PRIVATE_RAW_KEY_CUSTOMER_PHONE_SALT" });
    const instance = service();
    await instance.getShipmentLogistics(shipment);
    await instance.subscribeShipmentLogistics(shipment);
    const salt = (await cache()).subscription.salt;
    const text = await readFile(join(dir, healthName), "utf8");
    for (const secret of [shipment.trackingNo, shipment.phone, salt, "PRIVATE_RAW", "PRIVATE_SECRET_CODE", "callbackUrl", "phoneHash", "salt"]) expect(text).not.toContain(secret);
    expect(JSON.parse(text).lastQuery.code).toBe("UNKNOWN");
    expect((await cache()).queryCode).toBe("UNKNOWN");
    expect((await cache()).subscription.code).toBe("600");
    expect((await instance.getLogisticsServiceHealth()).recent.every(item => item.carrierCode === "shunfeng")).toBe(true);
  });
  it("reads legacy JSON without code fields without synthesizing health or bypassing persisted limits", async () => {
    const instance = service();
    await instance.getShipmentLogistics(shipment);
    await instance.subscribeShipmentLogistics(shipment);
    const legacy = await cache();
    delete legacy.queryCode;
    delete legacy.subscription.code;
    delete legacy.callbackDigests;
    await writeFile(join(dir, `${id}.json`), JSON.stringify(legacy));
    await rm(join(dir, healthName));
    time += 1000;
    await service().getShipmentLogistics(shipment);
    await service().subscribeShipmentLogistics(shipment);
    expect(query).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(await service().getLogisticsServiceHealth()).toMatchObject({ lastQuery: null, lastSubscription: null, lastCallback: null, recent: [], balanceStatus: "unknown" });
  });
  it("does not use an injected unsafe carrier resolver for persisted health", async () => {
    const instance = createLogisticsService({ storageDir: dir, clock: () => time, config,
      provider: { queryKuaidi100: query, resolveCarrierCode: () => "PRIVATE_CARRIER_SECRET" } });
    await instance.getShipmentLogistics(shipment);
    expect((await instance.getLogisticsServiceHealth()).recent).toEqual([]);
    expect(await readdir(dir)).not.toContain(healthName);
  });
});

describe("health failure isolation and unknown state", () => {
  it("does not turn successful query, subscription or valid callback into a failure when health rename fails", async () => {
    const logger = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await mkdir(join(dir, healthName)); // Real filesystem injection: rename cannot replace a directory.
    const instance = service();
    expect(await instance.getShipmentLogistics(shipment)).toMatchObject({ source: "query", state: "0" });
    expect((await instance.subscribeShipmentLogistics(shipment)).subscriptionStatus).toBe("active");
    expect(await instance.acceptLogisticsCallback(await signedCallback())).toBe(true);
    expect((await cache()).source).toBe("push");
    const health = await instance.getLogisticsServiceHealth();
    expect(health.storageWarning).toContain("暂不可用");
    expect(health.balanceStatus).toBe("unknown");
    expect(health.lastQuery).toMatchObject({ category: "success" });
    expect(health.lastSubscription).toMatchObject({ category: "success" });
    expect(health.lastCallback).toMatchObject({ category: "success" });
    expect(health.recent).toHaveLength(3);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/SF123|138001|PRIVATE_RAW|EISDIR|salt/);
    const restarted = await service().getLogisticsServiceHealth();
    expect(restarted).toMatchObject({ lastQuery: null, lastSubscription: null, lastCallback: null, recent: [], balanceStatus: "unknown" });
    expect(restarted.storageWarning).not.toBeNull();
    await rm(join(dir, healthName), { recursive: true });
    time += LOGISTICS_MIN_INTERVAL_MS;
    await instance.getShipmentLogistics(shipment);
    const recovered = await service().getLogisticsServiceHealth();
    expect(recovered.storageWarning).toBeNull();
    expect(recovered.recent).toHaveLength(4);
    expect(recovered.lastCallback).toEqual(health.lastCallback);
  });
  it("still rejects a callback whose business cache cannot persist and does not append callback feedback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const instance = service();
    await instance.subscribeShipmentLogistics(shipment);
    const callback = await signedCallback();
    const before = await instance.getLogisticsServiceHealth();
    const cachePath = join(dir, `${id}.json`);
    await rm(cachePath);
    await mkdir(cachePath);
    await expect(instance.acceptLogisticsCallback(callback)).rejects.toThrow();
    const after = await instance.getLogisticsServiceHealth();
    expect(after.lastCallback).toBeNull();
    expect(after.recent).toEqual(before.recent);
  });
  it.each(["invalid-json", JSON.stringify({ version: 1, recent: [] }), "x".repeat(70 * 1024)])("returns unknown and warning on invalid health file instead of throwing", async text => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await writeFile(join(dir, healthName), text, { mode: 0o600 });
    const health = await service().getLogisticsServiceHealth();
    expect(health).toMatchObject({ balanceStatus: "unknown", lastQuery: null, lastSubscription: null, lastCallback: null, recent: [] });
    expect(health.storageWarning).not.toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("refuses symlink health storage without reading its contents", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const secret = join(dir, "private-source.txt");
    await writeFile(secret, "PRIVATE_HEALTH_SOURCE");
    await symlink(secret, join(dir, healthName));
    const health = await service().getLogisticsServiceHealth();
    expect(health.lastQuery).toBeNull();
    expect(health.storageWarning).not.toBeNull();
    expect(JSON.stringify(health)).not.toContain("PRIVATE_HEALTH_SOURCE");
  });
  it("rejects stored category/message/code/carrier injection and strips unknown metadata", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const instance = service();
    await instance.getShipmentLogistics(shipment);
    const snapshot = JSON.parse(await readFile(join(dir, healthName), "utf8"));
    const valid = structuredClone(snapshot);
    snapshot.lastQuery.privateSecret = "PRIVATE_METADATA";
    snapshot.recent[0].privateSecret = "PRIVATE_METADATA";
    await writeFile(join(dir, healthName), JSON.stringify(snapshot));
    expect(JSON.stringify(await service().getLogisticsServiceHealth())).not.toContain("PRIVATE_METADATA");
    for (const changed of [
      { message: "PRIVATE_MESSAGE" }, { category: "quota" }, { code: "PRIVATE_CODE" },
      { carrierCode: "PRIVATE_CARRIER" }, { trackingNoMasked: shipment.trackingNo }, { operation: "callback" },
    ]) {
      const corrupt = structuredClone(valid);
      Object.assign(corrupt.lastQuery as AdminLogisticsFeedback, changed);
      await writeFile(join(dir, healthName), JSON.stringify(corrupt));
      const health = await service().getLogisticsServiceHealth();
      expect(health.lastQuery).toBeNull();
      expect(health.storageWarning).not.toBeNull();
      expect(JSON.stringify(health)).not.toMatch(/PRIVATE_|SF1234567890/);
    }
  });
});
