// server/deribit-public-transport.ts
import https from "node:https";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
var HOST = "www.deribit.com";
var PROVIDERS = [
  { hostname: "dns.alidns.com", path: `/resolve?name=${HOST}&type=A` },
  { hostname: "cloudflare-dns.com", path: `/dns-query?name=${HOST}&type=A` }
];
var DNS_MS = 2500;
var API_MS = 3500;
var TOTAL_MS = 12e3;
var DNS_LIMIT = 64 * 1024;
var QUOTE_LIMIT = 128 * 1024;
var LIST_LIMIT = 16 * 1024 * 1024;
var DeribitTransportError = class extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.name = "DeribitTransportError";
  }
};
var error = (code, retryable = false) => new DeribitTransportError(code, retryable);
var PublicAgent = class extends https.Agent {
  getName(options) {
    return `${super.getName(options)}:${options.transportAddress ?? "system"}`;
  }
};
function publicIPv4(value) {
  if (typeof value !== "string" || isIP(value) !== 4) return false;
  const [a, b, c] = value.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
}
function dnsName(value) {
  if (typeof value !== "string") throw error("DERIBIT_DNS_INVALID");
  const name = value.toLowerCase().replace(/\.$/, "");
  if (name.length > 253 || !name.includes(".") || isIP(name) || !name.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw error("DERIBIT_DNS_INVALID");
  }
  return name;
}
function parseDNS(json) {
  const question = Array.isArray(json?.Question) ? json.Question : [json?.Question];
  if (!json || json.Status !== 0 || question.length !== 1 || question[0]?.type !== 1 || dnsName(question[0]?.name) !== HOST || !Array.isArray(json.Answer) || !json.Answer.length || json.Answer.length > 64) {
    throw error("DERIBIT_DNS_INVALID");
  }
  const aliases = /* @__PURE__ */ new Map();
  const records = json.Answer.map((record) => {
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
  const chain = /* @__PURE__ */ new Set();
  let terminal = HOST;
  while (true) {
    if (chain.has(terminal)) throw error("DERIBIT_DNS_INVALID");
    chain.add(terminal);
    const target = aliases.get(terminal);
    if (!target) break;
    terminal = target;
  }
  if (records.some((r) => !chain.has(r.owner) || r.type === 1 && r.owner !== terminal)) {
    throw error("DERIBIT_DNS_INVALID");
  }
  const addresses = [...new Set(records.filter((r) => r.type === 1).map((r) => r.data))];
  if (!addresses.length) throw error("DERIBIT_DNS_INVALID");
  return { addresses: addresses.slice(0, 2), ttl: Math.min(300, ...records.map((r) => r.ttl)) };
}
function validInstrument(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = /^(BTC|ETH)-(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})-(\d{1,9}(?:\.\d{1,8})?)-(C|P)$/.exec(value);
  if (!match || Number(match[5]) <= 0) return false;
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[3]);
  const date = new Date(Date.UTC(2e3 + Number(match[4]), month, Number(match[2])));
  return date.getUTCMonth() === month && date.getUTCDate() === Number(match[2]);
}
function createDeribitPublicTransport(deps = {}) {
  const get = deps.get ?? ((options, callback) => https.get(options, callback));
  const now = deps.now ?? (() => performance.now());
  const agent = new PublicAgent({ keepAlive: true, family: 4, maxSockets: 8, maxTotalSockets: 8, maxFreeSockets: 2 });
  let cache;
  let resolving;
  function requestJSON(options, limit, duration, deadline) {
    return new Promise((resolve, reject) => {
      let request, response, settled = false;
      const remaining = Math.min(duration, deadline - now());
      const requestDeadline = now() + remaining;
      if (remaining <= 0) return reject(error("DERIBIT_TIMEOUT"));
      const finish = (failure, json, age = 0) => {
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
        request = get({
          ...options,
          method: "GET",
          port: 443,
          family: 4,
          agent,
          servername: options.hostname,
          rejectUnauthorized: true,
          headers: { Host: options.hostname, Accept: "application/json, application/dns-json" }
        }, (res) => {
          response = res;
          res.on("error", () => finish(error("DERIBIT_BODY_ERROR")));
          res.on("aborted", () => finish(error("DERIBIT_BODY_ERROR")));
          res.on("close", () => {
            if (!res.complete) finish(error("DERIBIT_BODY_ERROR"));
          });
          if (settled) {
            res.destroy();
            return;
          }
          if (now() >= requestDeadline) return finish(error("DERIBIT_TIMEOUT"));
          if (res.statusCode !== 200) return finish(error("DERIBIT_HTTP_ERROR"));
          if (!/^application\/(?:json|dns-json)(?:\s*;|$)/i.test(String(res.headers["content-type"] ?? ""))) {
            return finish(error("DERIBIT_NON_JSON"));
          }
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
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
              finish(void 0, json, Number.isFinite(age) && age >= 0 ? age : 0);
            } catch {
              finish(error("DERIBIT_INVALID_JSON"));
            }
          });
        });
        request.on("error", () => finish(error(response ? "DERIBIT_BODY_ERROR" : "DERIBIT_NETWORK", !response)));
        if (settled) request.destroy();
      } catch {
        finish(error("DERIBIT_NETWORK", true));
      }
    });
  }
  async function resolveAddresses() {
    if (cache && now() < cache.expires) return cache.addresses;
    if (resolving) return resolving;
    resolving = (async () => {
      for (const provider of PROVIDERS) {
        const started = now();
        try {
          const { json, age } = await requestJSON(provider, DNS_LIMIT, DNS_MS, started + DNS_MS);
          const parsed = parseDNS(json);
          cache = { addresses: parsed.addresses, expires: started + Math.max(0, parsed.ttl - age) * 1e3 };
          return parsed.addresses;
        } catch {
        }
      }
      return void 0;
    })();
    try {
      return await resolving;
    } finally {
      resolving = void 0;
    }
  }
  function bounded(promise, deadline) {
    return new Promise((resolve, reject) => {
      const remaining = deadline - now();
      if (remaining <= 0) return reject(error("DERIBIT_TIMEOUT"));
      const timer = setTimeout(() => reject(error("DERIBIT_TIMEOUT")), remaining);
      promise.then((value) => {
        clearTimeout(timer);
        resolve(value);
      }, (failure) => {
        clearTimeout(timer);
        reject(failure);
      });
    });
  }
  async function call(path, limit) {
    const deadline = now() + TOTAL_MS;
    const addresses = await bounded(resolveAddresses(), deadline);
    for (const address of addresses ?? [void 0]) {
      const options = { hostname: HOST, path, transportAddress: address };
      if (address) {
        options.lookup = (_hostname, _options, callback) => callback(null, address, 4);
      }
      try {
        return (await requestJSON(options, limit, API_MS, deadline)).json;
      } catch (failure) {
        if (!(failure instanceof DeribitTransportError) || !failure.retryable || address === addresses?.at(-1) || now() >= deadline) throw failure;
      }
    }
    throw error("DERIBIT_NETWORK");
  }
  return {
    getDeribitOptionOrderBook(instrumentName) {
      if (!validInstrument(instrumentName)) return Promise.reject(error("DERIBIT_INVALID_INSTRUMENT"));
      return call(`/api/v2/public/get_order_book?instrument_name=${encodeURIComponent(instrumentName)}&depth=1`, QUOTE_LIMIT);
    },
    getDeribitOptionInstruments(currency) {
      if (currency !== "BTC" && currency !== "ETH") return Promise.reject(error("DERIBIT_INVALID_CURRENCY"));
      return call(`/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`, LIST_LIMIT);
    }
  };
}
var production = createDeribitPublicTransport();
var getDeribitOptionOrderBook = production.getDeribitOptionOrderBook;
var getDeribitOptionInstruments = production.getDeribitOptionInstruments;
export {
  DeribitTransportError,
  createDeribitPublicTransport,
  getDeribitOptionInstruments,
  getDeribitOptionOrderBook
};

import traceHttps from 'node:https';
const tracedTransport = createDeribitPublicTransport({get(options, callback) {
  const started = Date.now();
  console.log(JSON.stringify({label:'trace_request',host:options.hostname,address:options.transportAddress,family:options.family,sni:options.servername}));
  const request = traceHttps.get(options, response => {
    console.log(JSON.stringify({label:'trace_response',host:options.hostname,http:response.statusCode,type:response.headers['content-type'],elapsedMs:Date.now()-started}));
    if (options.hostname !== 'www.deribit.com') {
      let text='';
      response.on('data', b=>{if(text.length<65536)text+=b;});
      response.on('end',()=>{try{const data=JSON.parse(text);console.log(JSON.stringify({label:'trace_dns_schema',host:options.hostname,Status:data.Status,Question:data.Question,Answer:data.Answer}));}catch{}});
    }
    callback(response);
  });
  request.on('error', error => console.log(JSON.stringify({label:'trace_error',host:options.hostname,code:error.code,elapsedMs:Date.now()-started})));
  return request;
}});
const contract = 'ETH-25JUN27-1700-C';
function assertQuote(data) {
  const q = data?.result;
  if (data?.error || q?.instrument_name !== contract || !(q.mark_price > 0) || !(q.index_price > 0) || !(q.timestamp > 0) || Math.abs(Date.now()-q.timestamp) > 60000) {
    throw new Error('Official June quote identity/value/freshness validation failed');
  }
  return q;
}
const start = Date.now();
const first = assertQuote(await tracedTransport.getDeribitOptionOrderBook(contract));
console.log(JSON.stringify({label:'actual_helper_june_first',elapsedMs:Date.now()-start,instrument:first.instrument_name,markNative:first.mark_price,indexUsd:first.index_price,timestamp:first.timestamp}));
await new Promise(resolve => setTimeout(resolve, 1200));
const second = assertQuote(await tracedTransport.getDeribitOptionOrderBook(contract));
if (second.timestamp <= first.timestamp) throw new Error('Second official quote was not refreshed');
console.log(JSON.stringify({label:'actual_helper_june_second',instrument:second.instrument_name,markNative:second.mark_price,indexUsd:second.index_price,timestamp:second.timestamp,updated:true}));
const directory = await tracedTransport.getDeribitOptionInstruments('ETH');
if (directory?.error || !Array.isArray(directory?.result) || !directory.result.length) throw new Error('Official directory missing');
const june = directory.result.find(row => row.instrument_name === contract);
if (!june || june.kind !== 'option' || june.strike !== 1700 || june.expiration_timestamp !== 1813910400000) throw new Error('June directory identity did not match');
if (directory.result.some(row => typeof row.instrument_name !== 'string' || !row.instrument_name.startsWith('ETH-') || row.kind !== 'option' || !Number.isFinite(row.expiration_timestamp) || !Number.isFinite(row.strike))) throw new Error('Directory contains malformed/mixed-currency data');
console.log(JSON.stringify({label:'actual_helper_eth_directory',rows:directory.result.length,juneExists:true,strike:june.strike,expiration:june.expiration_timestamp}));
