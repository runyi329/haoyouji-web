import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AdminLogisticsFeedback, AdminLogisticsHealth, LogisticsDetails, LogisticsRecord } from "../shared/miban-logistics";
import { getLogisticsStateLabel } from "../shared/miban-logistics";
import {
  getLogisticsFeedbackMapping,
  queryKuaidi100,
  resolveCarrierCode,
  subscribeKuaidi100,
  verifyKuaidi100Callback,
  type ProviderResult,
} from "./miban-logistics-provider";

export const LOGISTICS_MIN_INTERVAL_MS = 30 * 60 * 1000;
export const LOGISTICS_CALLBACK_MAX_BYTES = 128 * 1024;
const HEX_ID = /^[a-f0-9]{64}$/;
const UNAVAILABLE = "物流服务暂不可用，请稍后重试";
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
// Dedicated domain-separated lock/file: never shares a shipment lock or scans shipment caches.
const HEALTH_ID = hash("miban-logistics:administrator-health:v1");
const HEALTH_SUFFIX = ".health.json";
const HEALTH_WARNING = "物流健康记录存储暂不可用，反馈可能不完整；余额仍未知";
interface HealthSnapshot {
  version: 1;
  lastQuery: AdminLogisticsFeedback | null;
  lastSubscription: AdminLogisticsFeedback | null;
  lastCallback: AdminLogisticsFeedback | null;
  recent: AdminLogisticsFeedback[];
}
const emptyHealth = (): HealthSnapshot => ({ version: 1, lastQuery: null, lastSubscription: null, lastCallback: null, recent: [] });
const lastField = (operation: AdminLogisticsFeedback["operation"]) => operation === "query" ? "lastQuery" : operation === "subscription" ? "lastSubscription" : "lastCallback";
function appendHealth(snapshot: HealthSnapshot, feedback: AdminLogisticsFeedback): HealthSnapshot {
  const field = lastField(feedback.operation);
  return { ...snapshot, [field]: !snapshot[field] || feedback.at >= snapshot[field]!.at ? feedback : snapshot[field],
    recent: [...snapshot.recent, feedback].sort((a, b) => a.at.localeCompare(b.at)).slice(-30) };
}
function mergeHealth(persisted: HealthSnapshot, pending: HealthSnapshot): HealthSnapshot {
  const merged = { ...persisted, recent: [...persisted.recent, ...pending.recent].sort((a, b) => a.at.localeCompare(b.at)).slice(-30) };
  for (const field of ["lastQuery", "lastSubscription", "lastCallback"] as const) {
    const candidate = pending[field];
    if (candidate && (!merged[field] || candidate.at >= merged[field]!.at)) merged[field] = candidate;
  }
  return merged;
}

export interface ShipmentLogisticsInput {
  trackingCompany: string;
  trackingNo: string;
  phone?: string;
}
export interface LogisticsConfiguration {
  queryConfigured: boolean;
  /** Explicit server-side opt-in; a valid callbackUrl is also required. */
  subscriptionEnabled: boolean;
  /** Fixed server configuration only, never supplied by a shipment/client. */
  callbackUrl?: string;
}
export interface LogisticsConfigurationStatus {
  queryConfigured: boolean;
  subscriptionEnabled: boolean;
  callbackConfigured: boolean;
}
export interface LogisticsServiceOptions {
  provider?: Partial<{
    resolveCarrierCode: typeof resolveCarrierCode;
    queryKuaidi100: (input: { carrierCode: string; trackingNo: string; phone?: string }) => Promise<ProviderResult>;
    subscribeKuaidi100: (input: { carrierCode: string; trackingNo: string; phone?: string; callbackUrl: string; salt: string }) => Promise<{ ok: boolean; code: string; message: string }>;
    verifyKuaidi100Callback: typeof verifyKuaidi100Callback;
  }>;
  clock?: () => number | Date;
  storageDir?: string;
  config?: LogisticsConfiguration | (() => LogisticsConfiguration);
}

type SubscriptionStatus = LogisticsDetails["subscriptionStatus"];
interface CacheEntry {
  version: 1;
  carrierCode: string;
  trackingNo: string;
  state: string | null;
  records: LogisticsRecord[];
  updatedAt: string | null;
  source: LogisticsDetails["source"];
  lastQueryAttemptAt: number | null;
  queryPhoneHash: string | null;
  queryError: string | null;
  queryCode?: string | null;
  subscription: {
    status: SubscriptionStatus;
    salt: string | null;
    lastAttemptAt: number | null;
    phoneHash: string | null;
    message: string | null;
    code?: string | null;
  };
  lastCallbackDigest: string | null;
  callbackDigests: string[];
}
interface Shipment {
  trackingCompany: string;
  trackingNo: string;
  carrierCode: string;
  id: string;
  phone?: string;
  phoneHash: string;
}

function runtimeConfiguration(): LogisticsConfiguration {
  return {
    queryConfigured: Boolean(process.env.KUAIDI100_KEY?.trim() && process.env.KUAIDI100_CUSTOMER?.trim()),
    subscriptionEnabled: process.env.KUAIDI100_SUBSCRIPTION_ENABLED === "true",
    callbackUrl: process.env.KUAIDI100_CALLBACK_URL,
  };
}

/** Only fixed HTTPS callbacks are allowed, matching the provider's subscription policy. */
function callbackBase(value: string | undefined): URL | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url : null;
  } catch { return null; }
}

function recordTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, s] = match.map(Number);
  if (y < 1970 || y > 9999) return null;
  const ms = Date.UTC(y, m - 1, d, h, min, s);
  const date = new Date(ms);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d &&
    date.getUTCHours() === h && date.getUTCMinutes() === min && date.getUTCSeconds() === s ? ms : null;
}
function latestTime(records: LogisticsRecord[]): number {
  return Math.max(-Infinity, ...records.map(record => recordTime(record.time) ?? -Infinity));
}
function safeText(value: string, phone?: string): string {
  const text = phone ? value.split(phone).join("[电话已隐藏]") : value;
  return text.replace(/(?:\+?86[-\s]?)?\d(?:[-\s]?\d){6,14}/g, "[电话已隐藏]");
}
function parseRecords(value: unknown, phone?: string): LogisticsRecord[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const records: LogisticsRecord[] = [];
  for (const item of value) {
    if (!isObject(item) || typeof item.time !== "string" || recordTime(item.time) === null ||
        (item.ftime !== undefined && (typeof item.ftime !== "string" || recordTime(item.ftime) === null)) ||
        typeof item.context !== "string" || !item.context || item.context.length > 4096 ||
        (item.status !== undefined && (typeof item.status !== "string" || item.status.length > 128))) return null;
    records.push({
      time: typeof item.ftime === "string" ? item.ftime : item.time,
      context: safeText(item.context, phone),
      ...(typeof item.status === "string" ? { status: safeText(item.status, phone) } : {}),
    });
  }
  return records.sort((a, b) => recordTime(b.time)! - recordTime(a.time)!);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizedPhone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const text = value.normalize("NFKC").trim();
  const virtual = /^1[3-9]\d{9}-(\d{4})$/.exec(text);
  if (virtual) return virtual[1];
  const digits = /^[\d\s()-]+$/.test(text) ? text.replace(/[\s()-]/g, "") : text;
  return /^\d{4,16}$/.test(digits) ? digits : undefined;
}
function freshEntry(shipment: Shipment): CacheEntry {
  return {
    version: 1, carrierCode: shipment.carrierCode, trackingNo: shipment.trackingNo,
    state: null, records: [], updatedAt: null, source: null,
    lastQueryAttemptAt: null, queryPhoneHash: null, queryError: null, queryCode: null,
    subscription: { status: "disabled", salt: null, lastAttemptAt: null, phoneHash: null, message: null, code: null },
    lastCallbackDigest: null,
    callbackDigests: [],
  };
}

/** No database dependencies: carrier delivery never confirms an order or changes a wallet. */
export function createLogisticsService(options: LogisticsServiceOptions = {}) {
  const provider = { resolveCarrierCode, queryKuaidi100, subscribeKuaidi100, verifyKuaidi100Callback, ...options.provider };
  const now = () => {
    const value = options.clock?.() ?? Date.now();
    const ms = value instanceof Date ? value.getTime() : value;
    if (!Number.isFinite(ms)) throw new Error("Invalid logistics clock");
    return ms;
  };
  const storageDir = resolve(options.storageDir || process.env.MIBAN_LOGISTICS_CACHE_DIR || join(homedir(), ".local/share/haoyouji/miban-logistics"));
  const configuration = () => typeof options.config === "function" ? options.config() : options.config ?? runtimeConfiguration();
  const flights = new Map<string, Promise<LogisticsDetails>>();
  let pendingHealth = emptyHealth();
  let storageWarning: string | null = null;

  function getLogisticsConfigurationStatus(): LogisticsConfigurationStatus {
    const config = configuration();
    const callbackConfigured = Boolean(callbackBase(config.callbackUrl));
    return { queryConfigured: config.queryConfigured === true, subscriptionEnabled: config.subscriptionEnabled === true && callbackConfigured, callbackConfigured };
  }
  async function ensureDirectory() {
    await mkdir(storageDir, { recursive: true, mode: 0o700 });
    await chmod(storageDir, 0o700);
  }
  function filePath(id: string, suffix: string) {
    if (!HEX_ID.test(id)) throw new Error("Invalid shipment cache id");
    return join(storageDir, `${id}${suffix}`);
  }
  async function readCache(id: string): Promise<CacheEntry | null> {
    let text: string;
    try {
      const file = await open(filePath(id, ".json"), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { text = await file.readFile("utf8"); } finally { await file.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    // Fail closed on corrupt storage instead of bypassing persisted attempt limits.
    const value: unknown = JSON.parse(text);
    if (!isObject(value) || value.version !== 1 || typeof value.carrierCode !== "string" ||
        typeof value.trackingNo !== "string" || hash(value.carrierCode + value.trackingNo) !== id ||
        !isObject(value.subscription) || !["disabled", "pending", "active", "shutdown", "abort", "error"].includes(String(value.subscription.status)) ||
        (value.state !== null && (typeof value.state !== "string" || !/^\d{1,4}$/.test(value.state))) ||
        parseRecords(value.records) === null ||
        (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)))) ||
        ![null, "query", "push"].includes(value.source as null | string) ||
        ![value.lastQueryAttemptAt, value.subscription.lastAttemptAt].every(t => t === null || typeof t === "number" && Number.isFinite(t)) ||
        ![value.queryPhoneHash, value.subscription.phoneHash, value.lastCallbackDigest].every(t => t === null || typeof t === "string" && HEX_ID.test(t)) ||
        (value.callbackDigests !== undefined && (!Array.isArray(value.callbackDigests) || value.callbackDigests.length > 128 ||
          !value.callbackDigests.every(digest => typeof digest === "string" && HEX_ID.test(digest)))) ||
        ![value.queryError, value.subscription.message].every(t => t === null || typeof t === "string") ||
        ![value.queryCode, value.subscription.code].every(t => t === undefined || t === null || typeof t === "string" && t.length <= 32 && /^[A-Za-z0-9_]+$/.test(t)) ||
        !(value.subscription.salt === null || typeof value.subscription.salt === "string" && HEX_ID.test(value.subscription.salt))) {
      throw new Error("Invalid logistics cache");
    }
    value.callbackDigests ??= [];
    return value as unknown as CacheEntry;
  }
  async function writeJson(id: string, suffix: string, value: CacheEntry | HealthSnapshot) {
    const temporary = filePath(id, `.${randomBytes(16).toString("hex")}.tmp`);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(temporary, "wx", 0o600);
      await file.writeFile(JSON.stringify(value) + "\n", "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporary, filePath(id, suffix));
      // Flush the rename before acknowledging a callback.
      const directory = await open(storageDir, constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
    } finally {
      await file?.close();
      await rm(temporary, { force: true });
    }
  }
  const writeCache = (id: string, entry: CacheEntry) => writeJson(id, ".json", entry);

  function healthStorageFailure() {
    if (!storageWarning) console.warn("[miban-logistics] administrator health storage unavailable");
    storageWarning = HEALTH_WARNING; // Never log error objects, paths, vendor messages or credentials.
  }
  function parseFeedback(value: unknown, operation?: AdminLogisticsFeedback["operation"]): AdminLogisticsFeedback | null {
    if (!isObject(value) || !["query", "subscription", "callback"].includes(String(value.operation)) ||
        operation && value.operation !== operation || typeof value.code !== "string" ||
        typeof value.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.at) || !Number.isFinite(Date.parse(value.at)) ||
        typeof value.carrierCode !== "string" || resolveCarrierCode(value.carrierCode) !== value.carrierCode ||
        typeof value.trackingNoMasked !== "string" || !/^\*{4}[A-Za-z0-9-]{1,4}$/.test(value.trackingNoMasked)) return null;
    const op = value.operation as AdminLogisticsFeedback["operation"];
    const mapping = getLogisticsFeedbackMapping(op, value.code);
    if (mapping.code !== value.code || value.category !== mapping.category || value.message !== mapping.message) return null;
    // Reconstruct the DTO rather than forwarding unknown or secret fields from disk.
    return { operation: op, ...mapping, at: value.at, carrierCode: value.carrierCode, trackingNoMasked: value.trackingNoMasked };
  }
  async function readHealth(): Promise<HealthSnapshot> {
    let text: string;
    try {
      const file = await open(filePath(HEALTH_ID, HEALTH_SUFFIX), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await file.stat()).isFile() || (await file.stat()).size > 64 * 1024) throw new Error("Invalid logistics health size");
        text = await file.readFile("utf8");
      } finally { await file.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHealth();
      throw error;
    }
    const value: unknown = JSON.parse(text);
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.recent) || value.recent.length > 30) throw new Error("Invalid logistics health");
    const snapshot = emptyHealth();
    for (const op of ["query", "subscription", "callback"] as const) {
      const field = lastField(op);
      if (value[field] === null) continue;
      const feedback = parseFeedback(value[field], op);
      if (!feedback) throw new Error("Invalid logistics health feedback");
      snapshot[field] = feedback;
    }
    for (const item of value.recent) {
      const feedback = parseFeedback(item);
      if (!feedback) throw new Error("Invalid logistics health feedback");
      snapshot.recent.push(feedback);
    }
    return snapshot;
  }
  async function recordFeedback(operation: AdminLogisticsFeedback["operation"], code: unknown, shipment: Pick<Shipment, "carrierCode" | "trackingNo">) {
    let feedback: AdminLogisticsFeedback | undefined;
    try {
      // Use the real allowlist, not an injected resolver or any arbitrary carrier/provider text.
      const carrierCode = resolveCarrierCode(shipment.carrierCode);
      if (!carrierCode || !/^[A-Za-z0-9-]{1,64}$/.test(shipment.trackingNo)) return;
      feedback = { operation, ...getLogisticsFeedbackMapping(operation, code), at: new Date(now()).toISOString(), carrierCode, trackingNoMasked: `****${shipment.trackingNo.slice(-4)}` };
      await withShipmentLock(HEALTH_ID, async () => {
        const snapshot = appendHealth(mergeHealth(await readHealth(), pendingHealth), feedback!);
        await writeJson(HEALTH_ID, HEALTH_SUFFIX, snapshot);
        pendingHealth = emptyHealth();
        storageWarning = null;
      });
    } catch {
      if (feedback) pendingHealth = appendHealth(pendingHealth, feedback);
      healthStorageFailure();
    }
  }
  async function getLogisticsServiceHealth(): Promise<AdminLogisticsHealth> {
    let snapshot = emptyHealth();
    try { snapshot = mergeHealth(await readHealth(), pendingHealth); }
    catch { snapshot = pendingHealth; healthStorageFailure(); } // Unreadable disk history is unknown; only locally observed attempts remain.
    return {
      ...getLogisticsConfigurationStatus(), balanceStatus: "unknown",
      lastQuery: snapshot.lastQuery && { ...snapshot.lastQuery },
      lastSubscription: snapshot.lastSubscription && { ...snapshot.lastSubscription },
      lastCallback: snapshot.lastCallback && { ...snapshot.lastCallback },
      recent: snapshot.recent.map(feedback => ({ ...feedback })), storageWarning, checkedAt: new Date(now()).toISOString(),
    };
  }

  /** mkdir lock works across service instances/processes on a single host. Live owners are never evicted by age. */
  async function withShipmentLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    await ensureDirectory();
    const lock = filePath(id, ".lock");
    const ownerPath = join(lock, "owner.json");
    const token = randomBytes(16).toString("hex");
    const deadline = Date.now() + 25_000;
    for (;;) {
      try {
        await mkdir(lock, { mode: 0o700 });
        try {
          const owner = await open(ownerPath, "wx", 0o600);
          try { await owner.writeFile(JSON.stringify({ pid: process.pid, token })); } finally { await owner.close(); }
        } catch (error) { await rm(lock, { recursive: true, force: true }); throw error; }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const owner = JSON.parse(await readFile(ownerPath, "utf8")) as { pid?: number; token?: string };
          if (Number.isSafeInteger(owner.pid) && owner.pid! > 0) {
            try { process.kill(owner.pid!, 0); } catch (pidError) {
              if ((pidError as NodeJS.ErrnoException).code === "ESRCH") {
                // A separate recovery mutex prevents two waiters from removing a newly acquired lock.
                const recovery = filePath(id, ".recovery");
                try {
                  await mkdir(recovery, { mode: 0o700 });
                  try {
                    const current = JSON.parse(await readFile(ownerPath, "utf8")) as { token?: string };
                    if (current.token === owner.token) await rm(lock, { recursive: true, force: true });
                  } finally { await rm(recovery, { recursive: true, force: true }); }
                } catch (recoveryError) {
                  if (!["EEXIST", "ENOENT"].includes((recoveryError as NodeJS.ErrnoException).code ?? "")) throw recoveryError;
                }
              }
            }
          }
        } catch (ownerError) {
          if ((ownerError as NodeJS.ErrnoException).code !== "ENOENT") throw ownerError;
          // An interrupted creation without an owner cannot be held by a live operation.
          try {
            if (Date.now() - (await stat(lock)).mtimeMs > 30_000) {
              const recovery = filePath(id, ".recovery");
              await mkdir(recovery, { mode: 0o700 });
              try {
                try { await stat(ownerPath); } catch (missingOwner) {
                  if ((missingOwner as NodeJS.ErrnoException).code !== "ENOENT") throw missingOwner;
                  if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true });
                }
              } finally { await rm(recovery, { recursive: true, force: true }); }
            }
          } catch (statError) { if (!["ENOENT", "EEXIST"].includes((statError as NodeJS.ErrnoException).code ?? "")) throw statError; }
        }
        if (Date.now() >= deadline) throw new Error("Logistics shipment is busy; retry later");
        await sleep(20);
      }
    }
    try { return await action(); }
    finally {
      const owner = JSON.parse(await readFile(ownerPath, "utf8")) as { token?: string };
      if (owner.token === token) await rm(lock, { recursive: true, force: true });
    }
  }

  function inputShipment(input: ShipmentLogisticsInput): Shipment | LogisticsDetails {
    const trackingCompany = typeof input.trackingCompany === "string" ? input.trackingCompany.trim() : "";
    const trackingNo = typeof input.trackingNo === "string" ? input.trackingNo.trim() : "";
    const carrierCode = provider.resolveCarrierCode(trackingCompany);
    const message = !trackingNo ? "暂无运单号，请联系商家核对发货信息" : !/^[A-Za-z0-9-]{1,64}$/.test(trackingNo) ?
      "运单号格式不正确，请联系商家核对" : !carrierCode ? "暂不支持该快递公司，请联系商家核对" : null;
    if (message || !carrierCode) return {
      trackingCompany, trackingNo, carrierCode, state: null, stateLabel: getLogisticsStateLabel(null), records: [],
      updatedAt: null, source: null, stale: true, message, subscriptionStatus: "disabled", canRetryAt: null,
    };
    const phone = normalizedPhone(input.phone);
    return { trackingCompany, trackingNo, carrierCode, id: hash(carrierCode + trackingNo), ...(phone ? { phone } : {}), phoneHash: hash(phone ?? "") };
  }
  function details(shipment: Shipment, entry: CacheEntry, messageOverride?: string): LogisticsDetails {
    const time = now();
    const enabled = getLogisticsConfigurationStatus().subscriptionEnabled;
    const queryRetry = entry.lastQueryAttemptAt === null || entry.state === "3" ? null : entry.lastQueryAttemptAt + LOGISTICS_MIN_INTERVAL_MS;
    const subscriptionRetry = enabled && ["error", "abort", "pending"].includes(entry.subscription.status) && entry.subscription.lastAttemptAt !== null ?
      entry.subscription.lastAttemptAt + LOGISTICS_MIN_INTERVAL_MS : null;
    const retries = [queryRetry, subscriptionRetry].filter((t): t is number => t !== null && t > time);
    return {
      trackingCompany: shipment.trackingCompany, trackingNo: shipment.trackingNo, carrierCode: shipment.carrierCode,
      state: entry.state, stateLabel: getLogisticsStateLabel(entry.state), records: entry.records.map(record => ({ ...record })),
      updatedAt: entry.updatedAt, source: entry.source,
      stale: entry.state !== "3" && (!entry.updatedAt || Boolean(entry.queryError) || time - Date.parse(entry.updatedAt) >= LOGISTICS_MIN_INTERVAL_MS),
      message: messageOverride ?? entry.queryError ?? (enabled ? entry.subscription.message : null),
      subscriptionStatus: enabled ? entry.subscription.status : "disabled",
      canRetryAt: retries.length ? new Date(Math.max(...retries)).toISOString() : null,
    };
  }
  function applyData(entry: CacheEntry, state: string | null, records: LogisticsRecord[], source: "query" | "push") {
    if (!records.length || entry.state === "3" && state !== "3" || latestTime(records) < latestTime(entry.records)) return false;
    entry.state = state;
    entry.records = records;
    entry.updatedAt = new Date(now()).toISOString();
    entry.source = source;
    entry.queryError = null;
    return true;
  }

  async function getShipmentLogistics(input: ShipmentLogisticsInput): Promise<LogisticsDetails> {
    const shipment = inputShipment(input);
    if (!("id" in shipment)) return shipment;
    // Merge identical double-clicks, without using/persisting the actual phone in an identity key.
    const flightKey = `${shipment.id}:${shipment.phoneHash}`;
    const existing = flights.get(flightKey);
    if (existing) return existing;
    const operation = withShipmentLock(shipment.id, async () => {
      const entry = await readCache(shipment.id) ?? freshEntry(shipment);
      if (entry.state === "3") return details(shipment, entry);
      if (entry.lastQueryAttemptAt !== null && now() < entry.lastQueryAttemptAt + LOGISTICS_MIN_INTERVAL_MS) return details(shipment, entry);
      if (!entry.queryError && entry.updatedAt && now() < Date.parse(entry.updatedAt) + LOGISTICS_MIN_INTERVAL_MS &&
          (entry.queryPhoneHash ?? entry.subscription.phoneHash) === shipment.phoneHash) return details(shipment, entry);
      if (!getLogisticsConfigurationStatus().queryConfigured) return details(shipment, entry, "物流服务暂未配置，请联系商家");
      entry.lastQueryAttemptAt = now();
      entry.queryPhoneHash = shipment.phoneHash;
      // Persist before making any request: even a crash/network error consumes the 30-minute window.
      entry.queryError = UNAVAILABLE;
      await writeCache(shipment.id, entry);
      let result: ProviderResult;
      try { result = await provider.queryKuaidi100({ carrierCode: shipment.carrierCode, trackingNo: shipment.trackingNo, ...(shipment.phone ? { phone: shipment.phone } : {}) }); }
      catch { result = { ok: false, code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE, state: null, records: [] }; }
      const records = result.ok ? parseRecords(result.records, shipment.phone) : null;
      const validSuccess = result.ok && result.code === "200" && records?.length && result.state !== null && /^\d{1,4}$/.test(result.state);
      const feedback = getLogisticsFeedbackMapping("query", validSuccess ? "200" : result.ok || result.code === "200" ? "INVALID_RESPONSE" : result.code);
      await recordFeedback("query", feedback.code, shipment);
      if (validSuccess) {
        // Re-read while locked. Callback writers obey the same lock; older nodes cannot replace newer records.
        const current = await readCache(shipment.id) ?? entry;
        current.lastQueryAttemptAt = entry.lastQueryAttemptAt;
        current.queryPhoneHash = entry.queryPhoneHash;
        current.queryCode = feedback.code;
        applyData(current, result.state, records!, "query");
        current.queryError = null;
        await writeCache(shipment.id, current);
        return details(shipment, current);
      }
      entry.queryCode = feedback.code;
      entry.queryError = feedback.message;
      await writeCache(shipment.id, entry);
      return details(shipment, entry);
    });
    flights.set(flightKey, operation);
    try { return await operation; } finally { flights.delete(flightKey); }
  }

  async function subscribeShipmentLogistics(input: ShipmentLogisticsInput): Promise<LogisticsDetails> {
    const shipment = inputShipment(input);
    if (!("id" in shipment)) return shipment;
    const config = configuration();
    const base = callbackBase(config.callbackUrl);
    if (config.subscriptionEnabled !== true || !base) {
      // No provider call, salt creation, or state mutation when disabled.
      const entry = await readCache(shipment.id) ?? freshEntry(shipment);
      return { ...details(shipment, entry), subscriptionStatus: "disabled" };
    }
    return withShipmentLock(shipment.id, async () => {
      const entry = await readCache(shipment.id) ?? freshEntry(shipment);
      const subscription = entry.subscription;
      const samePhone = subscription.phoneHash === shipment.phoneHash;
      if (entry.state === "3" || samePhone && ["active", "shutdown"].includes(subscription.status)) return details(shipment, entry);
      if (subscription.lastAttemptAt !== null && now() < subscription.lastAttemptAt + LOGISTICS_MIN_INTERVAL_MS) return details(shipment, entry);
      subscription.salt ??= randomBytes(32).toString("hex");
      subscription.lastAttemptAt = now();
      subscription.phoneHash = shipment.phoneHash;
      subscription.status = "pending";
      subscription.message = "物流订阅处理中，请稍后查看";
      await writeCache(shipment.id, entry);
      base.searchParams.set("id", shipment.id);
      let result: { ok: boolean; code: string; message: string };
      try {
        result = await provider.subscribeKuaidi100({
          carrierCode: shipment.carrierCode, trackingNo: shipment.trackingNo,
          ...(shipment.phone ? { phone: shipment.phone } : {}), callbackUrl: base.toString(), salt: subscription.salt,
        });
      } catch { result = { ok: false, code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE }; }
      const feedback = getLogisticsFeedbackMapping("subscription", result.ok && result.code === "200" ? "200" : result.ok || result.code === "200" ? "INVALID_RESPONSE" : result.code);
      await recordFeedback("subscription", feedback.code, shipment);
      subscription.code = feedback.code;
      subscription.status = feedback.code === "200" || feedback.code === "501" ? "active" : "error";
      subscription.message = feedback.message;
      await writeCache(shipment.id, entry);
      return details(shipment, entry);
    });
  }

  /** false = rejected, true = authenticated and durably persisted; storage failures throw for HTTP 500. */
  async function acceptLogisticsCallback(input: { id: string; param: string; sign: string }): Promise<boolean> {
    if (typeof input.id !== "string" || !HEX_ID.test(input.id) || typeof input.param !== "string" || !input.param ||
        Buffer.byteLength(input.param, "utf8") > LOGISTICS_CALLBACK_MAX_BYTES || typeof input.sign !== "string" || !/^[a-fA-F0-9]{32}$/.test(input.sign)) return false;
    // Fast unauthenticated rejection does not create cache directories/locks or write anything.
    const initial = await readCache(input.id);
    if (!initial?.subscription.salt || !provider.verifyKuaidi100Callback(input.param, input.sign, initial.subscription.salt)) return false;
    let body: unknown;
    try { body = JSON.parse(input.param); } catch { return false; }
    if (!isObject(body) || !["polling", "updateall", "shutdown", "abort"].includes(String(body.status)) ||
        typeof body.status !== "string" || (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 2048)) || !isObject(body.lastResult)) return false;
    const result = body.lastResult;
    if (result.com !== initial.carrierCode || result.nu !== initial.trackingNo ||
        typeof result.status !== "string" || !/^\d{3}$/.test(result.status) ||
        (result.state !== undefined && result.state !== null && (typeof result.state !== "string" || !/^\d{1,4}$/.test(result.state)))) return false;
    const records = parseRecords(result.data ?? []);
    if (records === null || body.status !== "abort" && (result.status !== "200" || typeof result.state !== "string")) return false;
    const digest = hash(input.param);
    return withShipmentLock(input.id, async () => {
      const entry = await readCache(input.id);
      if (!entry?.subscription.salt || !provider.verifyKuaidi100Callback(input.param, input.sign, entry.subscription.salt) ||
          result.com !== entry.carrierCode || result.nu !== entry.trackingNo) return false;
      if (entry.lastCallbackDigest === digest || entry.callbackDigests.includes(digest)) return true;
      const isOlder = records.length > 0 && latestTime(records) < latestTime(entry.records);
      if (!isOlder) {
        if (body.status !== "abort") applyData(entry, typeof result.state === "string" ? result.state : null, records, "push");
        if (body.status === "abort") {
          entry.subscription.status = "abort";
          entry.subscription.lastAttemptAt = now();
          entry.subscription.message = "物流订阅已中止，请联系商家核对后重试";
        } else if (body.status === "shutdown") {
          entry.subscription.status = "shutdown";
          entry.subscription.message = null;
        } else if (!["shutdown", "abort"].includes(entry.subscription.status)) {
          entry.subscription.status = "active";
          entry.subscription.message = null;
        }
      }
      entry.lastCallbackDigest = digest;
      entry.callbackDigests = [...entry.callbackDigests.slice(-127), digest];
      await writeCache(input.id, entry);
      // Only authenticated and durably persisted callbacks enter telemetry; replays do not.
      await recordFeedback("callback", body.status === "abort" ? "ABORT" : "200", entry);
      return true;
    });
  }

  return { getShipmentLogistics, subscribeShipmentLogistics, acceptLogisticsCallback, getLogisticsConfigurationStatus, getLogisticsServiceHealth };
}

// Lazy singleton: importing this module performs no request, filesystem write, or credential lookup.
let runtimeService: ReturnType<typeof createLogisticsService> | undefined;
const runtime = () => runtimeService ??= createLogisticsService();
export const getShipmentLogistics = (input: ShipmentLogisticsInput) => runtime().getShipmentLogistics(input);
export const subscribeShipmentLogistics = (input: ShipmentLogisticsInput) => runtime().subscribeShipmentLogistics(input);
export const acceptLogisticsCallback = (input: { id: string; param: string; sign: string }) => runtime().acceptLogisticsCallback(input);
export const getLogisticsConfigurationStatus = () => runtime().getLogisticsConfigurationStatus();
export const getLogisticsServiceHealth = (): Promise<AdminLogisticsHealth> => runtime().getLogisticsServiceHealth();
