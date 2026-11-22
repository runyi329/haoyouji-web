import https, { type RequestOptions } from "node:https";
import { type ClientRequest, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";

const HOST = "www.deribit.com";
const PROVIDERS = [
  { hostname: "dns.alidns.com", path: `/resolve?name=${HOST}&type=A` },
  { hostname: "cloudflare-dns.com", path: `/dns-query?name=${HOST}&type=A` },
] as const;
const DNS_MS = 2500, API_MS = 3500, TOTAL_MS = 12000;
const DNS_LIMIT = 64 * 1024, QUOTE_LIMIT = 128 * 1024, LIST_LIMIT = 16 * 1024 * 1024;
type Options = RequestOptions & { transportAddress?: string };
type Get = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
export class DeribitTransportError extends Error {
  constructor(public readonly code: string, public readonly retryable = false) {
    super(code);
    this.name = "DeribitTransportError";
  }
}
const error = (code: string, retryable = false) => new DeribitTransportError(code, retryable);
// Separate pools for DNS answers: a cached socket must not silently defeat address failover.
class PublicAgent extends https.Agent {
  override getName(options: Options): string {
    return `${super.getName(options)}:${options.transportAddress ?? "system"}`;
  }
}
function publicIPv4(value: unknown): value is string {
  if (typeof value !== "string" || isIP(value) !== 4) return false;
  const [a, b, c] = value.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 ||
      (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
function dnsName(value: unknown): string {
  if (typeof value !== "string") throw error("DERIBIT_DNS_INVALID");
  const name = value.toLowerCase().replace(/\.$/, "");
  if (name.length > 253 || !name.includes(".") || isIP(name) ||
    !name.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw error("DERIBIT_DNS_INVALID");
  }
  return name;
}
function parseDNS(json: any): { addresses: string[]; ttl: number } {
  // AliDNS uses a single Question object; Cloudflare uses a one-element array.
  // Both are real JSON DNS schemas, and both must match our fixed host and A query.
  const question = Array.isArray(json?.Question) ? json.Question : [json?.Question];
  if (!json || json.Status !== 0 || question.length !== 1 ||
    question[0]?.type !== 1 || dnsName(question[0]?.name) !== HOST ||
    !Array.isArray(json.Answer) || !json.Answer.length || json.Answer.length > 64) {
    throw error("DERIBIT_DNS_INVALID");
  }
  const aliases = new Map<string, string>();
  const records = json.Answer.map((record: any) => {
    const owner = dnsName(record?.name);
    if (!Number.isInteger(record.TTL) || record.TTL < 0 || ![1, 5].includes(record.type)) {
      throw error("DERIBIT_DNS_INVALID");
    }
    if (record.type === 5) {
      if (aliases.has(owner)) throw error("DERIBIT_DNS_INVALID");
      aliases.set(owner, dnsName(record.data));
    } else if (!publicIPv4(record.data)) throw error("DERIBIT_DNS_INVALID");
    return { owner, type: record.type, data: record.data, ttl: record.TTL };
  });
  const chain = new Set<string>();
  let terminal = HOST;
  while (true) {
    if (chain.has(terminal)) throw error("DERIBIT_DNS_INVALID");
    chain.add(terminal);
    const target = aliases.get(terminal);
    if (!target) break;
    terminal = target;
  }
  if (records.some((r: any) => !chain.has(r.owner) || (r.type === 1 && r.owner !== terminal))) {
    throw error("DERIBIT_DNS_INVALID");
  }
  const addresses = Array.from(new Set<string>(records.filter((r: any) => r.type === 1).map((r: any) => r.data)));
  if (!addresses.length) throw error("DERIBIT_DNS_INVALID");
  return { addresses: addresses.slice(0, 2), ttl: Math.min(300, ...records.map((r: any) => r.ttl)) };
}
function validInstrument(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = /^(BTC|ETH)-(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})-(\d{1,9}(?:\.\d{1,8})?)-(C|P)$/.exec(value);
  if (!match || Number(match[5]) <= 0) return false;
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[3]);
  const date = new Date(Date.UTC(2000 + Number(match[4]), month, Number(match[2])));
  return date.getUTCMonth() === month && date.getUTCDate() === Number(match[2]);
}
function bootstrapAddresses(value: any, wallTime: number): string[] {
  if (!value || value.hostname !== HOST || value.kind !== "deployment_dns_tls_validated" ||
    !Number.isFinite(value.resolvedAt) || value.resolvedAt <= 0 || value.resolvedAt > wallTime + 60000 ||
    !Array.isArray(value.addresses) || !value.addresses.length || value.addresses.length > 2 ||
    !value.addresses.every(publicIPv4) || (value.expiresAt !== undefined &&
      (!Number.isFinite(value.expiresAt) || value.expiresAt < value.resolvedAt))) return [];
  // These timestamps describe DNS provenance only, never a quote or a quote expiry.
  return Array.from(new Set<string>(value.addresses));
}
function deploymentBootstrap(): unknown {
  try {
    const text = readFileSync(new URL("./deribit-dns-bootstrap.json", import.meta.url), "utf8");
    return text.length <= DNS_LIMIT ? JSON.parse(text) : undefined;
  } catch { return undefined; } // Missing/invalid local build artifact is optional and silent.
}
function validRPCResult(json: any, instrumentName?: string): boolean {
  return json?.jsonrpc === "2.0" && !Object.prototype.hasOwnProperty.call(json, "error") &&
    Object.prototype.hasOwnProperty.call(json, "result") && json.result !== null &&
    (instrumentName ? json.result.instrument_name === instrumentName : Array.isArray(json.result));
}

/** Dependency seam for offline tests. Importing this module never sends a request. */
export function createDeribitPublicTransport(deps: { get?: Get; now?: () => number; wallNow?: () => number; bootstrap?: unknown } = {}) {
  const get: Get = deps.get ?? ((options, callback) => https.get(options, callback));
  const now = deps.now ?? (() => performance.now());
  const agent = new PublicAgent({ keepAlive: true, family: 4, maxSockets: 8, maxTotalSockets: 8, maxFreeSockets: 2 });
  let cache: { addresses: string[]; expires: number } | undefined;
  let resolving: Promise<string[] | undefined> | undefined;
  let connectionHints = bootstrapAddresses(deps.bootstrap, (deps.wallNow ?? Date.now)());

  function requestJSON(options: Options, limit: number, duration: number, deadline: number): Promise<{ json: unknown; age: number }> {
    return new Promise((resolve, reject) => {
      let request: ClientRequest | undefined, response: IncomingMessage | undefined, settled = false;
      const remaining = Math.min(duration, deadline - now());
      const requestDeadline = now() + remaining;
      if (remaining <= 0) return reject(error("DERIBIT_TIMEOUT"));
      const finish = (failure?: DeribitTransportError, json?: unknown, age = 0) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (failure) {
          response?.destroy();
          request?.destroy();
          reject(failure);
        } else resolve({ json, age });
      };
      const timer = setTimeout(() => finish(error("DERIBIT_TIMEOUT", !response)), remaining);
      try {
        request = get({ ...options, method: "GET", port: 443, family: 4, agent,
          servername: options.hostname as string, rejectUnauthorized: true,
          headers: { Host: options.hostname as string, Accept: "application/json, application/dns-json" },
        }, res => {
          response = res;
          res.on("error", () => finish(error("DERIBIT_BODY_ERROR")));
          res.on("aborted", () => finish(error("DERIBIT_BODY_ERROR")));
          res.on("close", () => { if (!res.complete) finish(error("DERIBIT_BODY_ERROR")); });
          if (settled) { res.destroy(); return; }
          if (now() >= requestDeadline) return finish(error("DERIBIT_TIMEOUT"));
          if (res.statusCode !== 200) return finish(error("DERIBIT_HTTP_ERROR"));
          if (!/^application\/(?:json|dns-json)(?:\s*;|$)/i.test(String(res.headers["content-type"] ?? ""))) {
            return finish(error("DERIBIT_NON_JSON"));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            if (settled) return;
            if (now() >= requestDeadline) return finish(error("DERIBIT_TIMEOUT"));
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > limit) return finish(error("DERIBIT_BODY_LIMIT"));
            chunks.push(buffer);
          });
          res.on("end", () => {
            if (settled) return;
            if (now() >= requestDeadline) return finish(error("DERIBIT_TIMEOUT"));
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (now() >= requestDeadline) return finish(error("DERIBIT_TIMEOUT"));
              const age = Number(res.headers.age ?? 0);
              finish(undefined, json, Number.isFinite(age) && age >= 0 ? age : 0);
            } catch { finish(error("DERIBIT_INVALID_JSON")); }
          });
        });
        request.on("error", () => finish(error(response ? "DERIBIT_BODY_ERROR" : "DERIBIT_NETWORK", !response)));
        if (settled) request.destroy();
      } catch { finish(error("DERIBIT_NETWORK", true)); }
    });
  }
  async function resolveAddresses(deadline: number): Promise<string[] | undefined> {
    if (cache && now() < cache.expires) return cache.addresses;
    if (resolving) return resolving;
    resolving = (async () => {
      for (const provider of PROVIDERS) {
        const started = now();
        if (started >= deadline) throw error("DERIBIT_TIMEOUT");
        try {
          const { json, age } = await requestJSON(provider, DNS_LIMIT, DNS_MS, Math.min(started + DNS_MS, deadline));
          const parsed = parseDNS(json);
          cache = { addresses: parsed.addresses, expires: started + Math.max(0, parsed.ttl - age) * 1000 };
          return parsed.addresses;
        } catch { /* Only the next fixed provider is permitted; never expose DNS/URL details. */ }
      }
      return undefined; // Bounded normal system DNS HTTPS fallback, not an IP pin.
    })();
    try { return await resolving; } finally { resolving = undefined; }
  }
  function bounded<T>(promise: Promise<T>, deadline: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const remaining = deadline - now();
      if (remaining <= 0) return reject(error("DERIBIT_TIMEOUT"));
      const timer = setTimeout(() => reject(error("DERIBIT_TIMEOUT")), remaining);
      promise.then(value => { clearTimeout(timer); resolve(value); }, failure => { clearTimeout(timer); reject(failure); });
    });
  }
  async function call(path: string, limit: number, instrumentName?: string): Promise<unknown> {
    const deadline = now() + TOTAL_MS;
    const attempted = new Set<string | undefined>();
    let lastFailure = error("DERIBIT_NETWORK");
    async function attempt(addresses: (string | undefined)[], refreshDNS = false): Promise<{ json: unknown } | undefined> {
      for (const address of addresses) {
        if (attempted.has(address)) continue;
        if (now() >= deadline) throw error("DERIBIT_TIMEOUT");
        if (attempted.size >= 4) break;
        attempted.add(address);
        const options: Options = { hostname: HOST, path, transportAddress: address };
        if (address) {
          // Only the TCP destination changes; official hostname/Host/SNI/TLS stay fixed.
          options.lookup = (_hostname, _options, callback) => callback(null, address, 4);
        }
        try {
          const { json } = await requestJSON(options, limit, API_MS, deadline);
          if (address && validRPCResult(json, instrumentName)) {
            connectionHints = [address, ...connectionHints.filter(hint => hint !== address)].slice(0, 2);
            // Refresh an existing DNS cache at real TTL without blocking fresh HTTPS prices.
            // A deployment seed needs no DNS at all until its connection fails.
            if (refreshDNS && cache) void resolveAddresses(deadline).catch(() => {});
          }
          return { json };
        } catch (failure) {
          if (!(failure instanceof DeribitTransportError) || !failure.retryable) throw failure;
          lastFailure = failure;
          connectionHints = connectionHints.filter(hint => hint !== address);
        }
      }
      return undefined;
    }
    try {
      if (connectionHints.length) {
        const result = await attempt(connectionHints.slice(), true);
        if (result) return result.json;
        cache = undefined; // Failed hints must not be immediately recycled from an old DNS cache.
      }
      const addresses = await bounded(resolveAddresses(deadline), deadline);
      const result = await attempt(addresses ?? [undefined]);
      if (result) return result.json;
      if (now() >= deadline) throw error("DERIBIT_TIMEOUT");
      throw lastFailure;
    } catch (failure) {
      cache = undefined;
      throw failure;
    }
  }
  return {
    getDeribitOptionOrderBook(instrumentName: string): Promise<unknown> {
      if (!validInstrument(instrumentName)) return Promise.reject(error("DERIBIT_INVALID_INSTRUMENT"));
      return call(`/api/v2/public/get_order_book?instrument_name=${encodeURIComponent(instrumentName)}&depth=1`, QUOTE_LIMIT, instrumentName);
    },
    getDeribitOptionInstruments(currency: "BTC" | "ETH"): Promise<unknown> {
      if (currency !== "BTC" && currency !== "ETH") return Promise.reject(error("DERIBIT_INVALID_CURRENCY"));
      return call(`/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`, LIST_LIMIT);
    },
  };
}
const production = createDeribitPublicTransport({ bootstrap: deploymentBootstrap() });
export const getDeribitOptionOrderBook = production.getDeribitOptionOrderBook;
export const getDeribitOptionInstruments = production.getDeribitOptionInstruments;
