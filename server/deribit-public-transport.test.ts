import { EventEmitter } from "node:events";
import { type RequestOptions } from "node:https";
import { type ClientRequest, type IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeribitPublicTransport, DeribitTransportError } from "./deribit-public-transport";

const HOST = "www.deribit.com";
const IP1 = "104.18.5.240", IP2 = "104.18.4.240";
const INSTRUMENT = "ETH-25JUN27-1700-C";
const QUOTE = { jsonrpc: "2.0", result: { instrument_name: INSTRUMENT, mark_price: 0.1887, index_price: 1659.98 } };
const WALL_TIME = 1700000000000;
const seed = (addresses = [IP1, IP2]) => ({ hostname: HOST, addresses, resolvedAt: WALL_TIME, kind: "deployment_dns_tls_validated" });
const answer = (ttl = 60, addresses = [IP1, IP2]) => ({
  Status: 0, Question: [{ name: HOST + ".", type: 1 }],
  Answer: addresses.map(data => ({ name: HOST + ".", type: 1, TTL: ttl, data })),
});
type WireOptions = RequestOptions & { transportAddress?: string };
type Exchange = {
  options: WireOptions; request: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
  response?: EventEmitter & { destroy: ReturnType<typeof vi.fn>; complete: boolean };
};
type Reply = { json?: unknown; body?: string | Buffer; status?: number; type?: string; age?: string;
  delay?: number; chunks?: (string | Buffer)[]; noEnd?: boolean; connectionHang?: boolean; fail?: string };
function harness(handler: (exchange: Exchange, index: number) => Reply = () => ({}), bootstrap?: unknown) {
  const exchanges: Exchange[] = [];
  const get = vi.fn((options: RequestOptions, callback: (res: IncomingMessage) => void) => {
    const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    const exchange: Exchange = { options, request };
    exchanges.push(exchange);
    const reply = handler(exchange, exchanges.length - 1);
    const deliver = () => {
      if (request.destroy.mock.calls.length) return;
      if (reply.fail) { request.emit("error", Object.assign(new Error("secret URL query credentials"), { code: reply.fail })); return; }
      if (reply.connectionHang) return;
      const res = Object.assign(new EventEmitter(), {
        statusCode: reply.status ?? 200,
        headers: { "content-type": reply.type ?? "application/json", ...(reply.age ? { age: reply.age } : {}) },
        complete: false, destroy: vi.fn(),
      });
      exchange.response = res;
      callback(res as unknown as IncomingMessage);
      if (res.destroy.mock.calls.length) return;
      const body = reply.body ?? JSON.stringify(reply.json ?? (options.hostname === HOST ? QUOTE : answer()));
      for (const chunk of reply.chunks ?? [body]) {
        if (res.destroy.mock.calls.length) break;
        res.emit("data", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (!reply.noEnd && !res.destroy.mock.calls.length) { res.complete = true; res.emit("end"); res.emit("close"); }
    };
    if (reply.delay) setTimeout(deliver, reply.delay); else queueMicrotask(deliver);
    return request as unknown as ClientRequest;
  });
  const transport = createDeribitPublicTransport({ get, now: () => Date.now(), wallNow: () => WALL_TIME, bootstrap });
  return { transport, exchanges, get, dns: () => exchanges.filter(e => e.options.hostname !== HOST), api: () => exchanges.filter(e => e.options.hostname === HOST) };
}
const isAPI = (e: Exchange) => e.options.hostname === HOST;
async function rejected(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code, message: code });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("fixed Deribit public HTTPS GET", () => {
  it("imports and constructs without network; calls only fixed quote/catalogue paths", async () => {
    const h = harness();
    expect(h.get).not.toHaveBeenCalled();
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(QUOTE);
    await h.transport.getDeribitOptionInstruments("BTC");
    await h.transport.getDeribitOptionInstruments("ETH");
    expect(h.api().map(e => e.options.path)).toEqual([
      `/api/v2/public/get_order_book?instrument_name=${INSTRUMENT}&depth=1`,
      "/api/v2/public/get_instruments?currency=BTC&kind=option&expired=false",
      "/api/v2/public/get_instruments?currency=ETH&kind=option&expired=false",
    ]);
    expect(h.dns()).toHaveLength(1);
    expect(h.dns()[0].options).toMatchObject({ hostname: "dns.alidns.com", path: `/resolve?name=${HOST}&type=A` });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains hostname, Host/SNI/certificate checking/family4 and shares bounded keepAlive Agent", async () => {
    const h = harness();
    await Promise.all(Array.from({ length: 32 }, () => h.transport.getDeribitOptionOrderBook(INSTRUMENT)));
    expect(h.dns()).toHaveLength(1);
    const agent = h.api()[0].options.agent as any;
    expect(agent.keepAlive).toBe(true);
    expect(agent.options.family).toBe(4);
    expect(agent.maxSockets).toBeLessThanOrEqual(8);
    expect(agent.maxTotalSockets).toBeLessThanOrEqual(8);
    for (const { options } of h.exchanges) {
      expect(options).toMatchObject({ method: "GET", port: 443, family: 4, rejectUnauthorized: true, servername: options.hostname });
      expect(options.headers).toEqual({ Host: options.hostname, Accept: "application/json, application/dns-json" });
      expect(options.agent).toBe(agent);
      expect(options).not.toHaveProperty("auth");
    }
    const opts = h.api()[0].options;
    expect(opts.hostname).toBe(HOST);
    const cb = vi.fn();
    (opts.lookup as Function)(HOST, {}, cb);
    expect(cb).toHaveBeenCalledWith(null, IP1, 4);
    expect(agent.getName({ ...opts, transportAddress: IP1 })).not.toBe(agent.getName({ ...opts, transportAddress: IP2 }));
  });
  it.each(["ETIMEDOUT", "ECONNRESET", "CERT_HAS_EXPIRED"])("fails over at most two dynamic addresses on %s", async fail => {
    const h = harness(e => isAPI(e) && e.options.transportAddress === IP1 ? { fail } : {});
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(QUOTE);
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP2]);
    expect(h.api()[0].request.destroy).toHaveBeenCalledTimes(1);
  });
  it("never tries a third address and exposes only a safe transport code", async () => {
    const h = harness(e => isAPI(e) ? { fail: "ECONNRESET" } : { json: answer(60, [IP1, IP2, "8.8.8.8"]) });
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_NETWORK");
    expect(h.api()).toHaveLength(2);
  });
  it("tries only the second fixed DoH service before bounded system DNS fallback", async () => {
    const h = harness(e => !isAPI(e) ? { fail: "ECONNRESET" } : {});
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(QUOTE);
    expect(h.dns().map(e => [e.options.hostname, e.options.path])).toEqual([
      ["dns.alidns.com", `/resolve?name=${HOST}&type=A`],
      ["cloudflare-dns.com", `/dns-query?name=${HOST}&type=A`],
    ]);
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].options.lookup).toBeUndefined();
    expect(h.api()[0].options).toMatchObject({ hostname: HOST, family: 4, servername: HOST, rejectUnauthorized: true });
  });
  it("uses Cloudflare response dynamically if AliDNS fails", async () => {
    const h = harness(e => e.options.hostname === "dns.alidns.com" ? { status: 503 } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
    expect(h.api()[0].options.transportAddress).toBe(IP1);
  });
  it.each([301, 302, 307, 308, 400, 401, 404, 429, 500])("does not follow/retry HTTP %i across addresses", async status => {
    const h = harness(e => isAPI(e) ? { status } : {});
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_HTTP_ERROR");
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].response?.destroy).toHaveBeenCalledTimes(1);
  });
  it("returns API business errors unchanged to the caller without retry", async () => {
    const businessError = { jsonrpc: "2.0", error: { code: -32602, message: "invalid params" } };
    const h = harness(e => isAPI(e) ? { json: businessError } : {});
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(businessError);
    expect(h.api()).toHaveLength(1);
  });
  it.each(["text/html", "text/plain", ""])("rejects HTTP non-JSON content type %s", async type => {
    const h = harness(e => isAPI(e) ? { type } : {});
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_NON_JSON");
    expect(h.api()).toHaveLength(1);
  });
  it("rejects invalid JSON without cross-address retry", async () => {
    const h = harness(e => isAPI(e) ? { body: "not-json secret text" } : {});
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_INVALID_JSON");
    expect(h.api()).toHaveLength(1);
  });
  it.each(["https://evil.com", "ETH-25JUN27-1700-C&depth=999", "BTC-PERPETUAL", "ETH-31APR27-1700-C", "ETH-0JUN27-1700-C", "ETH-25JUN27-0-C", "eth-25JUN27-1700-C", "ETH-25JUN27-1700-X", "ETH-25JUN27-1700-C\n", null, 123])("rejects invalid instrument %s before DNS", async instrument => {
    const h = harness();
    await rejected(h.transport.getDeribitOptionOrderBook(instrument as string), "DERIBIT_INVALID_INSTRUMENT");
    expect(h.get).not.toHaveBeenCalled();
  });
  it.each(["btc", "USDC", "ETH&expired=true", null])("rejects invalid currency %s before DNS", async currency => {
    const h = harness();
    await rejected(h.transport.getDeribitOptionInstruments(currency as "ETH"), "DERIBIT_INVALID_CURRENCY");
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe("DoH validation, real TTL and request deduplication", () => {
  it("accepts actual AliDNS single Question object without using system DNS", async () => {
    const json = { ...answer(), Question: { name: HOST + '.', type: 1 } };
    const h = harness(e => !isAPI(e) ? { json } : {});
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(QUOTE);
    expect(h.dns()).toHaveLength(1);
    expect(h.api()[0].options.transportAddress).toBe(IP1);
  });
  it("deduplicates inflight DNS and expires at actual TTL, including wire elapsed time", async () => {
    const h = harness(e => !isAPI(e) ? { json: answer(2), delay: 500 } : {});
    const pending = Array.from({ length: 16 }, () => h.transport.getDeribitOptionOrderBook(INSTRUMENT));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(pending);
    expect(h.dns()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1499);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(1);
    const next = h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(1); // Still cached: request started before expiration.
    await next;
    const expired = h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(500);
    await expired;
    expect(h.dns()).toHaveLength(2);
  });
  it.each([{ ttl: 0, age: undefined, advance: 0 }, { ttl: 1000, age: undefined, advance: 300000 },
    { ttl: 60, age: "59", advance: 1000 }])("does not extend TTL, cap or upstream Age: %j", async ({ ttl, age, advance }) => {
    const h = harness(e => !isAPI(e) ? { json: answer(ttl), age } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(advance);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
  });
  it("accepts legitimate multi-hop CNAME chain and uses shortest chain TTL", async () => {
    const dns = { ...answer(), Answer: [
      { name: HOST + ".", type: 5, TTL: 1, data: "Alias.example.com." },
      { name: "alias.example.com", type: 5, TTL: 30, data: "target.example.com." },
      { name: "target.example.com", type: 1, TTL: 60, data: IP2 },
    ] };
    const h = harness(e => !isAPI(e) ? { json: dns } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.api()[0].options.transportAddress).toBe(IP2);
    await vi.advanceTimersByTimeAsync(1000);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
  });
  const badDNS = [
    { ...answer(), Status: 3 }, { ...answer(), Question: [{ name: "evil.example", type: 1 }] },
    { ...answer(), Question: [{ name: HOST, type: 28 }] }, { ...answer(), Question: [] },
    { ...answer(), Answer: [{ name: "evil.example", type: 1, TTL: 1, data: IP1 }] },
    { ...answer(), Answer: [{ name: HOST, type: 1, TTL: -1, data: IP1 }] },
    { ...answer(), Answer: [{ name: HOST, type: 28, TTL: 1, data: "::1" }] },
    { ...answer(), Answer: [{ name: HOST, type: 5, TTL: 1, data: "alias.example" }, { name: "alias.example", type: 5, TTL: 1, data: HOST }] },
    { ...answer(), Answer: [{ name: HOST, type: 5, TTL: 1, data: "alias.example" }, { name: HOST, type: 1, TTL: 1, data: IP1 }] },
    { ...answer(), Answer: [{ name: HOST, type: 5, TTL: 1, data: "alias.example" }, { name: "unrelated.example", type: 1, TTL: 1, data: IP1 }] },
    { ...answer(), Answer: [{ name: HOST, type: 5, TTL: 1, data: "alias.example" }, { name: HOST, type: 5, TTL: 1, data: "alias2.example" }] },
  ];
  it.each(badDNS)("rejects malformed Question/owner/TTL/CNAME before connection: %j", async json => {
    const h = harness(e => !isAPI(e) ? { json } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
    expect(h.api()[0].options.transportAddress).toBeUndefined();
  });
  it.each(["0.0.0.0", "10.1.2.3", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.0.0.1", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.19.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::1", "104.018.4.240", "bad-ip"])("rejects any unsafe A answer %s even alongside valid A", async address => {
    const h = harness(e => !isAPI(e) ? { json: answer(60, [IP1, address]) } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.api()[0].options.lookup).toBeUndefined();
    expect(h.dns()).toHaveLength(2);
  });
});

describe("hard deadlines, cleanup and byte limits", () => {
  it("bounds each DNS request at 2.5s and cleans stalled DNS response body before fallback", async () => {
    const h = harness(e => !isAPI(e) ? { body: "{", noEnd: true } : {});
    const promise = h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toEqual(QUOTE);
    expect(h.dns()).toHaveLength(2);
    for (const e of h.dns()) {
      expect(e.request.destroy).toHaveBeenCalledTimes(1);
      expect(e.response?.destroy).toHaveBeenCalledTimes(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds DNS connection hangs then succeeds through system resolver", async () => {
    const h = harness(e => !isAPI(e) ? { connectionHang: true } : {});
    const pending = h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual(QUOTE);
    expect(h.dns().every(e => e.request.destroy.mock.calls.length === 1)).toBe(true);
  });
  it("enforces the entire 12s DNS+connection deadline and only two API attempts", async () => {
    const h = harness(e => !isAPI(e) ? { delay: 2500, json: answer() } : { connectionHang: true });
    // AliDNS timer wins; Cloudflare arrives just before its deadline to supply addresses.
    const h2 = harness(e => e.options.hostname === "dns.alidns.com" ? { connectionHang: true } :
      !isAPI(e) ? { delay: 2499, json: answer() } : { connectionHang: true });
    const pending = h2.transport.getDeribitOptionOrderBook(INSTRUMENT);
    const assertion = rejected(pending, "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(11999);
    await assertion;
    expect(h2.api()).toHaveLength(2);
    expect(h2.api().every(e => e.request.destroy.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.get).not.toHaveBeenCalled();
  });
  it("includes slow API response bodies in 3.5s budget without address retry", async () => {
    const h = harness(e => isAPI(e) ? { body: "{", noEnd: true } : {});
    const pending = h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    const assertion = rejected(pending, "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(3500);
    await assertion;
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(h.api()[0].response?.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("includes delayed headers in the same per-API budget", async () => {
    const h = harness(e => isAPI(e) ? { delay: 3400, body: "{", noEnd: true } : {});
    const assertion = rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(3500);
    await assertion;
    expect(h.api()).toHaveLength(1);
  });
  it("checks absolute per-request deadline even before the delayed timer runs", async () => {
    const h = harness(e => isAPI(e) ? { body: "{}", noEnd: true } : {});
    const assertion = rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(3501); // Move clock without running timers: model event-loop delay.
    h.api()[0].response!.complete = true;
    h.api()[0].response!.emit("end");
    await assertion;
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("destroys a request on aborted body and does not retry after HTTP response", async () => {
    const h = harness(e => isAPI(e) ? { body: "{", noEnd: true } : {});
    const assertion = rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_BODY_ERROR");
    await vi.advanceTimersByTimeAsync(0);
    h.api()[0].response!.emit("aborted");
    await assertion;
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["quote", "catalogue"])("limits %s body across chunks and cleans both streams", async kind => {
    const limit = kind === "quote" ? 128 * 1024 : 16 * 1024 * 1024;
    const h = harness(e => isAPI(e) ? { chunks: [Buffer.alloc(limit), "x"], noEnd: true } : {});
    const promise = kind === "quote" ? h.transport.getDeribitOptionOrderBook(INSTRUMENT) : h.transport.getDeribitOptionInstruments("ETH");
    await rejected(promise, "DERIBIT_BODY_LIMIT");
    expect(h.api()).toHaveLength(1);
    expect(h.api()[0].response?.destroy).toHaveBeenCalledTimes(1);
    expect(h.api()[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows catalogue bodies larger than quote budget and exactly quote byte limit", async () => {
    const h = harness(e => isAPI(e) ? { body: JSON.stringify("x".repeat(128 * 1024 - 2)) } : {});
    await expect(h.transport.getDeribitOptionOrderBook(INSTRUMENT)).resolves.toHaveLength(128 * 1024 - 2);
    const large = harness(e => isAPI(e) ? { body: JSON.stringify("x".repeat(256 * 1024)) } : {});
    await expect(large.transport.getDeribitOptionInstruments("ETH")).resolves.toHaveLength(256 * 1024);
  });
  it("caps DNS body at 64KiB and uses only system DNS fallback when both providers overflow", async () => {
    const h = harness(e => !isAPI(e) ? { body: Buffer.alloc(64 * 1024 + 1), noEnd: true } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
    expect(h.dns().every(e => e.response?.destroy.mock.calls.length === 1)).toBe(true);
    expect(h.api()[0].options.lookup).toBeUndefined();
  });
  it("safe error contains no network query or environment information", () => {
    const failure = new DeribitTransportError("DERIBIT_NETWORK");
    expect(failure.message).toBe("DERIBIT_NETWORK");
    expect(failure.toString()).toBe("DeribitTransportError: DERIBIT_NETWORK");
  });
});

describe("deployment bootstrap and verified connection hints", () => {
  const NEW1 = "8.8.8.8", NEW2 = "1.1.1.1";
  it("uses a deployment seed without DNS and fetches a new official HTTPS book on every call", async () => {
    let count = 0;
    const h = harness(e => !isAPI(e) ? { json: answer(189, ["69.63.180.173"]) } : {
      json: { ...QUOTE, result: { ...QUOTE.result, mark_price: ++count / 10 } },
    }, seed());
    expect(h.get).not.toHaveBeenCalled();
    expect((await h.transport.getDeribitOptionOrderBook(INSTRUMENT) as typeof QUOTE).result.mark_price).toBe(0.1);
    await vi.advanceTimersByTimeAsync(300000);
    expect((await h.transport.getDeribitOptionOrderBook(INSTRUMENT) as typeof QUOTE).result.mark_price).toBe(0.2);
    expect(h.dns()).toHaveLength(0);
    expect(h.api()).toHaveLength(2);
    for (const { options } of h.api()) {
      expect(options).toMatchObject({ hostname: HOST, servername: HOST, rejectUnauthorized: true, method: "GET", transportAddress: IP1 });
      const callback = vi.fn();
      (options.lookup as Function)(HOST, {}, callback);
      expect(callback).toHaveBeenCalledWith(null, IP1, 4);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fails over from a bad seed to the second seed without relaxing TLS or querying DNS", async () => {
    const h = harness(e => e.options.transportAddress === IP1 ? { fail: "CERT_HAS_EXPIRED" } : {}, seed());
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP2, IP2]);
    expect(h.api().every(e => e.options.rejectUnauthorized === true && e.options.servername === HOST)).toBe(true);
    expect(h.dns()).toHaveLength(0);
  });
  it.each([undefined, null, {}, "bad-json", { ...seed(), hostname: "evil.example" },
    { ...seed(), kind: "untrusted" }, { ...seed(), resolvedAt: 0 }, { ...seed(), resolvedAt: "1700000000000" },
    { ...seed(), resolvedAt: Infinity }, { ...seed(), resolvedAt: WALL_TIME + 60001 },
    { ...seed(), addresses: [] }, seed([IP1, IP2, NEW1]), seed([IP1, "127.0.0.1"]),
    seed(["192.168.0.1"]), seed(["169.254.169.254"]), seed(["::1"]), seed(["bad-ip"]),
    { ...seed(), expiresAt: "tomorrow" }])("ignores invalid seed and retains normal DNS fallback: %j", async bootstrap => {
    const h = harness(() => ({}), bootstrap);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(1);
    expect(h.api()[0].options.transportAddress).toBe(IP1);
  });
  it("keeps old DNS timestamps separate from fresh quotes and does not reject an expired address hint", async () => {
    const h = harness(() => ({}), { ...seed(), resolvedAt: 1, expiresAt: 2 });
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(QUOTE);
    expect(h.dns()).toHaveLength(0);
  });
  it("replaces two failed hints with dynamic DNS candidates and never prioritizes failed hints again", async () => {
    const h = harness(e => !isAPI(e) ? { json: answer(60, [NEW1, NEW2]) } :
      [IP1, IP2].includes(e.options.transportAddress!) ? { fail: "ECONNRESET" } : {}, seed());
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP2, NEW1, NEW1]);
    expect(h.dns()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cannot overwrite a verified working hint with a legal but contaminated refreshed DNS answer", async () => {
    let dnsCount = 0;
    const h = harness(e => !isAPI(e) ? { json: answer(1, ++dnsCount === 1 ? [IP1, IP2] : ["69.63.180.173"]) } : {});
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(1000);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    await vi.advanceTimersByTimeAsync(0);
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT);
    expect(h.dns()).toHaveLength(2);
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP1, IP1]);
  });
  it.each([{ jsonrpc: "2.0", error: { code: -32602 } }, { result: QUOTE.result },
    { jsonrpc: "2.0", result: null }, { jsonrpc: "2.0", result: "not-a-book" },
    { jsonrpc: "2.0", result: { ...QUOTE.result, instrument_name: "ETH-25JUN27-1800-C" } }])("does not promote API error or unvalidated JSON to a verified hint: %j", async json => {
    const h = harness(e => isAPI(e) ? { json } : { json: answer(0, [IP1]) });
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(json);
    expect(await h.transport.getDeribitOptionOrderBook(INSTRUMENT)).toEqual(json);
    expect(h.dns()).toHaveLength(2);
    expect(h.api()).toHaveLength(2);
  });
  it.each([{ status: 429 }, { type: "text/html" }, { body: "not-json" },
    { json: { jsonrpc: "2.0", error: { code: -32602 } } }])("does not retry seed requests on HTTP/content/business failure: %j", async reply => {
    const h = harness(() => reply, seed());
    await h.transport.getDeribitOptionOrderBook(INSTRUMENT).catch(() => {});
    expect(h.api()).toHaveLength(1);
    expect(h.dns()).toHaveLength(0);
  });
  it("caps total candidates at four, invalidates failed DNS cache, and releases its DNS lock", async () => {
    let failed = true;
    const h = harness(e => !isAPI(e) ? { json: answer(60, [NEW1, NEW2]) } :
      failed ? { fail: "ECONNRESET" } : {}, seed());
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_NETWORK");
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP2, NEW1, NEW2]);
    expect(h.dns()).toHaveLength(1);
    failed = false;
    await Promise.all(Array.from({ length: 8 }, () => h.transport.getDeribitOptionOrderBook(INSTRUMENT)));
    expect(h.dns()).toHaveLength(2);
    expect(h.api().slice(4).every(e => e.options.transportAddress === NEW1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("deduplicates hints and skips DNS addresses already attempted without looping", async () => {
    const h = harness(e => isAPI(e) ? { fail: "ECONNRESET" } : { json: answer(60, [IP1, NEW1]) }, seed([IP1, IP1]));
    await rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_NETWORK");
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, NEW1]);
    expect(h.dns()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("deduplicates concurrent DNS after hint failures without caching books", async () => {
    const h = harness(e => !isAPI(e) ? { json: answer(60, [NEW1, NEW2]), delay: 500 } :
      [IP1, IP2].includes(e.options.transportAddress!) ? { fail: "ECONNRESET" } : {}, seed());
    const pending = Array.from({ length: 12 }, () => h.transport.getDeribitOptionOrderBook(INSTRUMENT));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(pending);
    expect(h.dns()).toHaveLength(1);
    expect(h.api().filter(e => e.options.transportAddress === NEW1)).toHaveLength(12);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds hint2 + DNS2 attempts to 12s and destroys the fourth stalled request", async () => {
    const h = harness(e => !isAPI(e) ? { json: answer(60, [NEW1, NEW2]) } : { connectionHang: true }, seed());
    const assertion = rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(11999);
    expect(h.api().map(e => e.options.transportAddress)).toEqual([IP1, IP2, NEW1, NEW2]);
    expect(h.api()[3].request.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(h.api().every(e => e.request.destroy.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start another DNS provider or API connection after hint failures exhaust the deadline", async () => {
    const h = harness(() => ({ connectionHang: true }), seed());
    const assertion = rejected(h.transport.getDeribitOptionOrderBook(INSTRUMENT), "DERIBIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(h.api()).toHaveLength(2);
    expect(h.dns()).toHaveLength(2);
    expect(h.exchanges.every(e => e.request.destroy.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
