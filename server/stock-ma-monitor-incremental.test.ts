import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deserialize } from "node:v8";
import {
  configureStockMAMonitorPersistence,
  getStockMAMonitor,
  getStockMAMonitorChartBase,
} from "./stock-ma-monitor";
import { openStockMACheckpointStore } from "./stock-ma-checkpoint-store";
import { STOCK_MA_ALGORITHM_VERSION } from "./stock-ma-incremental";
import type { StockComparisonDb } from "./stock-comparison";
import type { StockMAMonitorInput } from "../shared/stock-ma-monitor";

// Software-only SELECT adapter. Never imports DB boot/HTTP/collector or credentials.
type Row = Record<string, unknown> & { trade_date: string };
type Sample = {
  ts_code: string;
  name: string;
  list_status: string;
  rows: Row[];
};
const input: StockMAMonitorInput = {
  market: "all",
  periods: [5, 10, 20],
  page: 1,
  pageSize: 100,
  sort: "code",
};
const roots: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T08:00:00Z"));
});
afterEach(async () => {
  vi.useRealTimers();
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
function dates(n: number, end = "2026-11-06") {
  const result: string[] = [],
    d = new Date(`${end}T00:00:00Z`);
  while (result.length < n) {
    if (![0, 6].includes(d.getUTCDay()))
      result.unshift(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return result;
}
function sample(code = "600001.SH", n = 350): Sample {
  return {
    ts_code: code,
    name: `软件${code}`,
    list_status: "L",
    rows: dates(n).map((trade_date, i) => quote(trade_date, i)),
  };
}
function quote(trade_date: string, i: number): Row {
  const close = 10 + i / 10,
    vol = 100 + (i % 9) * 10;
  return {
    trade_date,
    open: close - 0.01,
    high: close + 1,
    low: close - 1,
    close,
    pre_close: close - 0.1,
    vol,
    amount: ((close - 0.05) * vol) / 10,
    pct_chg: 1.23,
  };
}
function adapter(samples: Sample[], marketDates?: string[]) {
  const state = {
    epoch: "2026-11-06T07:00:00Z",
    basicEpoch: "2026-11-06T06:00:00Z",
    stamp: "2026-11-06T07:00:00Z",
    fail: false,
    rawCount: 0,
    failRawAt: 0,
    unlocatable: false,
    onRaw: undefined as (() => void) | undefined,
  };
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error("non SELECT");
    let rows: unknown[];
    if (sql.includes("information_schema.TABLES")) {
      if (state.fail) throw new Error("software metadata failure");
      rows = [
        { table_name: "ts_daily", table_updated_at: state.epoch },
        { table_name: "ts_stock_basic", table_updated_at: state.basicEpoch },
      ];
    } else if (sql.includes("SELECT DISTINCT")) {
      rows = [
        ...new Set(
          marketDates ?? samples.flatMap(s => s.rows.map(r => r.trade_date))
        ),
      ]
        .filter(d => d <= params[0])
        .sort()
        .reverse()
        .slice(0, 350)
        .map(trade_date => ({ trade_date }));
    } else if (sql.includes("SELECT b.ts_code")) {
      rows = samples
        .filter(s => s.list_status === "L")
        .map(({ rows: _, ...s }) => s);
    } else if (sql.includes("AS row_count")) {
      const selected = new Set(params),
        grouped = new Map<
          string,
          { count: number; sum: bigint; xor: bigint }
        >();
      for (const s of samples)
        for (const r of s.rows)
          if (selected.has(r.trade_date)) {
            const group = grouped.get(r.trade_date) ?? {
              count: 0,
              sum: 0n,
              xor: 0n,
            };
            const digest = BigInt(
              "0x" +
                createHash("sha256")
                  .update(JSON.stringify([s.ts_code, r]))
                  .digest("hex")
                  .slice(0, 8)
            );
            group.count++;
            group.sum += digest;
            group.xor ^= digest;
            grouped.set(r.trade_date, group);
          }
      for (const d of marketDates ?? [])
        if (selected.has(d) && !grouped.has(d))
          grouped.set(d, { count: 1, sum: 1n, xor: 1n });
      rows = [...grouped]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([trade_date, g]) => ({
          trade_date,
          row_count: g.count,
          data_updated_at: state.stamp,
          data_checksum: String(g.sum),
          data_xor: String(g.xor),
        }));
    } else if (sql.includes("SELECT d.ts_code")) {
      state.rawCount++;
      if (state.rawCount === state.failRawAt)
        throw new Error("software second shard failure");
      const [start, end, ...rest] = params,
        selected = new Set(rest.filter(p => /^\d{8}$/.test(String(p)))),
        codes = new Set(rest.filter(p => /^\d{6}\.(SH|SZ)$/.test(String(p))));
      rows = samples
        .filter(s => codes.has(s.ts_code) && s.list_status === "L")
        .flatMap(s =>
          s.rows
            .filter(
              r =>
                r.trade_date >= start &&
                r.trade_date <= end &&
                selected.has(r.trade_date)
            )
            .map(r => ({ ...r, ts_code: s.ts_code }))
        );
      if (state.unlocatable && rows.length)
        rows.push({ ...(rows[0] as object), trade_date: "bad-date" });
      state.onRaw?.();
    } else throw new Error("unexpected software SQL");
    return [rows, []];
  });
  return { execute, state };
}
function rawCalls(db: ReturnType<typeof adapter>) {
  return db.execute.mock.calls.filter(([sql]) =>
    sql.includes("SELECT d.ts_code")
  );
}
function selectedDates(call: any) {
  return call[1].slice(2).filter((p: any) => /^\d{8}$/.test(String(p)));
}
function selectedCodes(call: any) {
  return call[1].filter((p: any) => /^\d{6}\.(SH|SZ)$/.test(String(p)));
}
async function setup(samples: Sample[], marketDates?: string[]) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "stock-ma-engine-"));
  roots.push(root);
  const options = { root, sourceIdentity: "software-source" };
  const db = adapter(samples, marketDates);
  configureStockMAMonitorPersistence(db, options);
  const first = await getStockMAMonitor(db, input);
  return { db, options, first };
}
function store(options: { root: string; sourceIdentity: string }) {
  return openStockMACheckpointStore({
    ...options,
    algorithmVersion: STOCK_MA_ALGORITHM_VERSION,
  });
}
async function drain(db: StockComparisonDb) {
  const reads = vi.spyOn(WeakMap.prototype, "get");
  try {
    await getStockMAMonitor(db, input);
    const i = reads.mock.calls.findIndex(([key]) => key === db);
    const cache = reads.mock.results[i]?.value as {
      sourceInFlight?: Map<string, Promise<unknown>>;
    };
    if (!cache?.sourceInFlight) throw new Error("software cache not observed");
    await Promise.all([...cache.sourceInFlight.values()]);
  } finally {
    reads.mockRestore();
  }
}
async function idle(
  options: { root: string; sourceIdentity: string },
  previousGeneration?: string
) {
  for (let i = 0; i < 500; i++) {
    await new Promise(resolve => setTimeout(resolve, 4));
    const head = await store(options).read();
    if (head && (!previousGeneration || head.generation !== previousGeneration))
      return head;
  }
  throw new Error("software checkpoint not published");
}
async function update(
  db: ReturnType<typeof adapter>,
  options: { root: string; sourceIdentity: string }
) {
  const prior = (await store(options).read())!;
  db.state.epoch = "2026-11-10T08:00:00Z";
  vi.setSystemTime(new Date("2026-11-10T09:00:00Z"));
  await drain(db);
  vi.setSystemTime(new Date("2026-11-10T09:02:00Z"));
  await drain(db);
  await idle(options, prior.generation);
  return getStockMAMonitor(db, input);
}
async function canon(
  samples: Sample[],
  periods = input.periods,
  marketDates?: string[]
) {
  return getStockMAMonitor(adapter(samples, marketDates), {
    ...input,
    periods,
  });
}
function comparable(result: Awaited<ReturnType<typeof getStockMAMonitor>>) {
  const { fetchedAt: _, coverageNote: __, ...rest } = result;
  return rest;
}
async function failedUpdate(
  db: ReturnType<typeof adapter>,
  options: { root: string; sourceIdentity: string }
) {
  db.state.epoch = "2026-11-10T08:00:00Z";
  vi.setSystemTime(new Date("2026-11-10T09:00:00Z"));
  await drain(db);
  vi.setSystemTime(new Date("2026-11-10T09:02:00Z"));
  await drain(db);
  return {
    head: await store(options).read(),
    result: await getStockMAMonitor(db, input),
  };
}

describe("explicit persistence incremental integration (software only)", () => {
  it("cold 64/1 bootstrap compact disk, default fixtures never configured, same-version/restart never raw", async () => {
    const samples = Array.from({ length: 65 }, (_, i) =>
      sample(`${600000 + i}.SH`)
    );
    const { db, options, first } = await setup(samples);
    expect(rawCalls(db).map(c => selectedCodes(c).length)).toEqual([64, 1]);
    const ownedStore = store(options);
    const head = (await ownedStore.read())!;
    for (const name of head.shardNames) {
      const shard = deserialize(
        Buffer.from(await ownedStore.readShard(head.generation, name))
      );
      expect(shard.length).toBeLessThanOrEqual(64);
      for (const s of shard) {
        expect(s.values.length).toBe(350 * 8);
        expect(s.flags.length).toBe(350);
        expect(s.states.length).toBe(525);
        expect(s).not.toHaveProperty("averages");
      }
    }
    configureStockMAMonitorPersistence(db, options);
    await getStockMAMonitor(db, input);
    expect(rawCalls(db)).toHaveLength(2);
    const restarted = adapter(samples);
    configureStockMAMonitorPersistence(restarted, options);
    const restored = await getStockMAMonitor(restarted, input);
    expect(restored.sourceVersion).toBe(first.sourceVersion);
    expect(restored.fetchedAt).toBe(first.fetchedAt);
    expect(restored.items).toEqual(first.items);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(rawCalls(restarted)).toHaveLength(0);
  });
  it("append one day matches full canonical all six presets, G and long lower-bound; repeat is idempotent", async () => {
    const s = sample(),
      { db, options } = await setup([s]);
    s.rows.push(quote("20261109", 350));
    const result = await update(db, options);
    expect(rawCalls(db)).toHaveLength(2);
    expect(selectedDates(rawCalls(db)[1])).toEqual(["20261109"]);
    for (const periods of [
      [5, 10, 20],
      [20, 30, 60],
      [60, 120, 250],
      [5, 10],
      [5, 20],
      [10, 20],
    ] as StockMAMonitorInput["periods"][]) {
      expect(
        comparable(await getStockMAMonitor(db, { ...input, periods }))
      ).toEqual(comparable(await canon([s], periods)));
    }
    expect(result.items[0].consecutiveDays).toBe(331);
    const head = (await store(options).read())!;
    await getStockMAMonitor(db, input);
    expect((await store(options).read())!.generation).toBe(head.generation);
    expect(rawCalls(db)).toHaveLength(2);
  });
  it("two missed days append in order, missing market day remains unknown, old halt K expires", async () => {
    const s = sample(),
      market = dates(350);
    s.rows = s.rows.slice(0, 30);
    const { db, options } = await setup([s], market);
    market.push("20261109", "20261110");
    const result = await update(db, options);
    expect(selectedDates(rawCalls(db).at(-1))).toEqual([
      "20261109",
      "20261110",
    ]);
    expect(comparable(result)).toEqual(
      comparable(await canon([s], input.periods, market))
    );
    const chart = await getStockMAMonitorChartBase(db, {
      tsCode: s.ts_code,
      periods: input.periods,
      asOf: result.asOf!,
      sourceVersion: result.sourceVersion!,
    });
    expect(chart.candles).toHaveLength(28);
    expect(chart.candles[0].date.replace(/-/g, "")).toBe(market[2]);
  });
  it("350-boundary reference break recovery and chart warmup masking equal full replay", async () => {
    const s = sample();
    s.rows[1].pre_close = Number(s.rows[0].close) - 1;
    const { db, options } = await setup([s]);
    s.rows.push(quote("20261109", 350));
    const result = await update(db, options);
    expect(result.items[0].consecutiveDays).toBe(331);
    expect(comparable(result)).toEqual(comparable(await canon([s])));
  });
  it.each(["amount", "close", "delete", "invalid-valid", "duplicate"])(
    "revision %s locates only genuinely affected stock and repairs previous-close dependency",
    async mode => {
      const a = sample(),
        b = sample("600002.SH"),
        market = dates(350);
      if (mode === "invalid-valid") a.rows[320].amount = null;
      const { db, options } = await setup([a, b], market);
      const date = market[320];
      if (mode === "amount")
        a.rows[320].amount = Number(a.rows[320].amount) + 0.1;
      if (mode === "close") a.rows[320].close = Number(a.rows[320].close) + 0.1;
      if (mode === "delete") a.rows.splice(320, 1);
      if (mode === "invalid-valid") a.rows[320] = quote(date, 320);
      if (mode === "duplicate") a.rows.push({ ...a.rows[320] });
      const result = await update(db, options);
      const calls = rawCalls(db);
      expect(calls).toHaveLength(3);
      expect(selectedDates(calls[1])).toEqual([date]);
      expect(selectedCodes(calls[1])).toEqual([a.ts_code, b.ts_code]);
      expect(selectedDates(calls[2])).toHaveLength(350);
      expect(selectedCodes(calls[2])).toEqual([a.ts_code]);
      expect(comparable(result)).toEqual(
        comparable(await canon([a, b], input.periods, market))
      );
    }
  );
  it("updated/name-only changes metadata without replay; new listing initializes singly and exit disappears from counts/chart", async () => {
    const a = sample(),
      b = sample("600002.SH"),
      samples = [a, b];
    const { db, options } = await setup(samples);
    a.name = "改名";
    a.rows[320].updated_at = "metadata-only";
    const renamed = await update(db, options);
    expect(rawCalls(db)).toHaveLength(2);
    expect(selectedDates(rawCalls(db)[1])).toHaveLength(1);
    expect(renamed.items.find(i => i.tsCode === a.ts_code)!.name).toBe("改名");
    a.list_status = "D";
    samples.push(sample("600003.SH"));
    db.state.basicEpoch = "2026-11-10T08:05:00Z";
    vi.setSystemTime(new Date("2026-11-10T09:05:00Z"));
    await drain(db);
    const prior = (await store(options).read())!.generation;
    vi.setSystemTime(new Date("2026-11-10T09:07:00Z"));
    await drain(db);
    await idle(options, prior);
    const changed = await getStockMAMonitor(db, input);
    expect(changed.items.map(i => i.tsCode)).toEqual([b.ts_code, "600003.SH"]);
    expect(selectedCodes(rawCalls(db).at(-1))).toEqual(["600003.SH"]);
    await expect(
      getStockMAMonitorChartBase(db, {
        tsCode: a.ts_code,
        asOf: changed.asOf!,
        sourceVersion: changed.sourceVersion!,
        periods: input.periods,
      })
    ).rejects.toThrow("not in");
  });
  it("source identity namespaces isolate checkpoints and future-cutoff restoration refuses before DB access", async () => {
    const s = sample(),
      { options } = await setup([s]);
    const other = adapter([sample("600002.SH")]);
    configureStockMAMonitorPersistence(other, {
      ...options,
      sourceIdentity: "another-software-source",
    });
    expect((await getStockMAMonitor(other, input)).items[0].tsCode).toBe(
      "600002.SH"
    );
    expect(rawCalls(other)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-06T06:00:00Z"));
    const future = adapter([s]);
    configureStockMAMonitorPersistence(future, options);
    await expect(getStockMAMonitor(future, input)).rejects.toThrow("cutoff");
    expect(future.execute).not.toHaveBeenCalled();
  });
  it("failure reading second incremental shard keeps cached old source and old committed pointer, restart restores old", async () => {
    const samples = Array.from({ length: 65 }, (_, i) =>
      sample(`${600000 + i}.SH`)
    );
    const { db, options, first } = await setup(samples),
      head = (await store(options).read())!;
    samples.forEach(s => s.rows.push(quote("20261109", 350)));
    db.state.failRawAt = db.state.rawCount + 2;
    const failed = await failedUpdate(db, options);
    expect(failed.head!.generation).toBe(head.generation);
    expect(failed.result.sourceVersion).toBe(first.sourceVersion);
    expect(failed.result.items).toEqual(first.items);
    expect(failed.result.coverageNote).toContain("检查失败");
    const restarted = adapter(samples);
    configureStockMAMonitorPersistence(restarted, options);
    expect((await getStockMAMonitor(restarted, input)).items).toEqual(
      first.items
    );
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(rawCalls(restarted)).toHaveLength(0);
  });
  it("same-second revision during repair is rejected by after fingerprint, staged writes never publish", async () => {
    const a = sample(),
      b = sample("600002.SH"),
      { db, options, first } = await setup([a, b]);
    const head = (await store(options).read())!;
    a.rows[320].amount = Number(a.rows[320].amount) + 0.1;
    db.state.onRaw = () => {
      db.state.onRaw = undefined;
      b.rows[320].amount = Number(b.rows[320].amount) + 0.2;
    };
    const failed = await failedUpdate(db, options);
    expect(failed.head!.generation).toBe(head.generation);
    expect(failed.result.sourceVersion).toBe(first.sourceVersion);
    expect(failed.result.items).toEqual(first.items);
    expect(failed.result.coverageNote).toContain("版本更新中");
  });
  it("corrupted committed shard fails closed on restart without treating it as successful empty source", async () => {
    const s = sample(),
      { options } = await setup([s]),
      head = (await store(options).read())!;
    const namespaces = await fs.readdir(options.root),
      namespace = namespaces[0];
    const file = path.join(
      options.root,
      namespace,
      head.generation,
      `shard-${head.shardNames[0]}.bin`
    );
    const bytes = await fs.readFile(file);
    bytes[20] ^= 1;
    await fs.writeFile(file, bytes);
    const restarted = adapter([s]);
    configureStockMAMonitorPersistence(restarted, options);
    await expect(getStockMAMonitor(restarted, input)).rejects.toThrow(
      "checkpoint"
    );
    expect(restarted.execute).not.toHaveBeenCalled();
  });
  it("unlocatable corrupt provenance triggers conservative stock repair next version, never permanent poison", async () => {
    const s = sample(),
      root = await fs.mkdtemp(path.join(tmpdir(), "stock-ma-poison-"));
    roots.push(root);
    const options = { root, sourceIdentity: "software-poison" },
      db = adapter([s]);
    db.state.unlocatable = true;
    configureStockMAMonitorPersistence(db, options);
    expect((await getStockMAMonitor(db, input)).excludedCount).toBe(1);
    db.state.unlocatable = false;
    s.name = "修复后的身份";
    const repaired = await update(db, options);
    expect(repaired.total).toBe(1);
    expect(selectedCodes(rawCalls(db).at(-1))).toEqual([s.ts_code]);
    expect(selectedDates(rawCalls(db).at(-1))).toHaveLength(350);
    expect(comparable(repaired)).toEqual(comparable(await canon([s])));
  });
  it("historical date deletion explicitly takes global bootstrap rather than pretending to append", async () => {
    const a = sample(),
      b = sample("600002.SH"),
      market = dates(350),
      { db, options } = await setup([a, b], market);
    market.splice(300, 1);
    a.rows.splice(300, 1);
    b.rows.splice(300, 1);
    const result = await update(db, options);
    expect(selectedDates(rawCalls(db).at(-1))).toHaveLength(349);
    expect(selectedCodes(rawCalls(db).at(-1))).toEqual([a.ts_code, b.ts_code]);
    expect(comparable(result)).toEqual(
      comparable(await canon([a, b], input.periods, market))
    );
  });
});
