import { readFileSync } from "node:fs";
import type { Connection } from "mysql2/promise";
import { describe, expect, expectTypeOf, it } from "vitest";
import { mibanLimitedBrands, mibanLimitedAttentionSlugs } from "../shared/miban-limited-brand-config";
import {
  assertBrandAttentionInput,
  ensureBrandAttentionTables,
  readBrandAttention,
  recordBrandAttention,
  type BrandAttentionConnection,
} from "./miban-brand-attention";

// Offline unit fixture ONLY. No DB module, main backend, network, production API
// or real database is imported or executed. The shared store serializes fixture
// transactions to model isolation/rollback, not MySQL's full per-row lock engine.
// Atomic SQL and current/locking reads are checked separately below.
const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();
const uuid = (id: number) =>
  `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0")}`;
const slugs = mibanLimitedAttentionSlugs;
const previewSlugs = ["guizhou", "amway", "marykay", "nuskin", "jianghai"] as const;
// Spain is now an on-sale entrance, but keeps the same real attention contract.
const newlyTrackedSlugs = ["spain", ...previewSlugs] as const;
type Statement = { sql: string; params: unknown[]; inTransaction: boolean };
class MemoryDatabase {
  totalsExist = false;
  eventsExist = false;
  totals = new Map<string, unknown>();
  events = new Map<string, string>();
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    return release;
  }

  connect() {
    return new MemoryConnection(this);
  }
}

class MemoryConnection implements BrandAttentionConnection {
  statements: Statement[] = [];
  begun = 0;
  committed = 0;
  rolledBack = 0;
  failUpsertOnce = false;
  failCommitOnce = false;
  private snapshot?: {
    totals: Map<string, unknown>;
    events: Map<string, string>;
  };
  private release?: () => void;

  constructor(readonly db: MemoryDatabase) {}

  async beginTransaction(): Promise<void> {
    if (this.snapshot)
      throw new Error("Fixture connection already in transaction");
    this.release = await this.db.acquire();
    this.snapshot = {
      totals: new Map(this.db.totals),
      events: new Map(this.db.events),
    };
    this.begun += 1;
  }

  async commit(): Promise<void> {
    if (!this.snapshot) throw new Error("Fixture transaction missing");
    if (this.failCommitOnce) {
      this.failCommitOnce = false;
      throw new Error("Fixture commit failure");
    }
    this.committed += 1;
    this.finish();
  }

  async rollback(): Promise<void> {
    if (!this.snapshot) throw new Error("Fixture transaction missing");
    this.db.totals = this.snapshot.totals;
    this.db.events = this.snapshot.events;
    this.rolledBack += 1;
    this.finish();
  }

  private finish() {
    this.snapshot = undefined;
    this.release?.();
    this.release = undefined;
  }

  async execute(
    sql: string,
    params: unknown[] = []
  ): Promise<[unknown, unknown]> {
    const query = normalizeSql(sql);
    this.statements.push({
      sql: query,
      params: [...params],
      inTransaction: !!this.snapshot,
    });
    if ((query.match(/\?/g) ?? []).length !== params.length) {
      throw new Error(
        "Fixture requires parameterized SQL with matching bindings"
      );
    }
    const response = (value: unknown): [unknown, unknown] => [value, []];
    if (query.startsWith("CREATE TABLE IF NOT EXISTS ")) {
      if (this.snapshot) throw new Error("DDL must run before transaction");
      if (
        query.startsWith(
          "CREATE TABLE IF NOT EXISTS miban_brand_attention_totals ("
        )
      ) {
        this.db.totalsExist = true;
      } else if (
        query.startsWith(
          "CREATE TABLE IF NOT EXISTS miban_brand_attention_events ("
        )
      ) {
        this.db.eventsExist = true;
      } else throw new Error("Unexpected fixture table");
      return response({ affectedRows: 0 });
    }
    if (
      (query.includes("miban_brand_attention_totals") &&
        !this.db.totalsExist) ||
      (query.includes("miban_brand_attention_events") && !this.db.eventsExist)
    ) {
      throw Object.assign(new Error("Table does not exist"), {
        code: "ER_NO_SUCH_TABLE",
      });
    }
    if (
      query ===
      "INSERT IGNORE INTO miban_brand_attention_events (event_id, brand_slug, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
    ) {
      this.requireTransaction();
      const [eventId, brandSlug] = params as [string, string];
      if (this.db.events.has(eventId)) return response({ affectedRows: 0 });
      this.db.events.set(eventId, brandSlug);
      return response({ affectedRows: 1 });
    }
    if (
      query ===
      "INSERT INTO miban_brand_attention_totals (brand_slug, total_views) VALUES (?, 1) ON DUPLICATE KEY UPDATE total_views = total_views + 1"
    ) {
      this.requireTransaction();
      if (this.failUpsertOnce) {
        this.failUpsertOnce = false;
        throw new Error("Fixture counter write failure");
      }
      const brandSlug = params[0] as string;
      this.db.totals.set(
        brandSlug,
        BigInt(
          (this.db.totals.get(brandSlug) ?? 0) as string | number | bigint
        ) + 1n
      );
      return response({ affectedRows: 1 });
    }
    if (
      query ===
      "SELECT brand_slug FROM miban_brand_attention_events WHERE event_id = ? FOR SHARE"
    ) {
      this.requireTransaction();
      const brandSlug = this.db.events.get(params[0] as string);
      return response(
        brandSlug === undefined ? [] : [{ brand_slug: brandSlug }]
      );
    }
    if (
      query ===
      "SELECT CAST(total_views AS CHAR) AS total_views FROM miban_brand_attention_totals WHERE brand_slug = ? FOR UPDATE"
    ) {
      this.requireTransaction();
      const total = this.db.totals.get(params[0] as string);
      return response(
        total === undefined ? [] : [{ total_views: String(total) }]
      );
    }
    if (
      query ===
      `SELECT brand_slug, CAST(total_views AS CHAR) AS total_views FROM miban_brand_attention_totals WHERE brand_slug IN (${slugs.map(() => "?").join(", ")})`
    ) {
      return response(
        [...this.db.totals.entries()]
          .filter(([brandSlug]) => params.includes(brandSlug))
          .map(([brand_slug, total]) => ({
            brand_slug,
            total_views: String(total),
          }))
      );
    }
    throw new Error(`Unrecognized or non-atomic fixture SQL: ${query}`);
  }

  private requireTransaction() {
    if (!this.snapshot)
      throw new Error("Fixture write/locking read requires a transaction");
  }
}

async function fixture() {
  const db = new MemoryDatabase();
  const connection = db.connect();
  await ensureBrandAttentionTables(connection);
  connection.statements = [];
  return { db, connection };
}

function click(brandSlug: string, id: number) {
  return { brandSlug, eventId: uuid(id) };
}

describe("miban brand attention: offline transaction fixtures", () => {
  it("accepts a mysql2/promise dedicated physical connection structurally", () => {
    expectTypeOf<Connection>().toMatchTypeOf<BrandAttentionConnection>();
  });

  it("keeps the six entrances and adds Spain once before attention-only previews", () => {
    expect(mibanLimitedBrands.map(brand => brand.slug)).toEqual([
      "herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang", "wangka",
      "spain",
    ]);
    expect(mibanLimitedBrands.every(brand => brand.status === "on_sale")).toBe(true);
    expect(mibanLimitedBrands.filter(brand => String(brand.slug) === "spain")).toHaveLength(1);
    expect(mibanLimitedBrands.find(brand => String(brand.slug) === "spain")).toMatchObject({
      slug: "spain", brand: "西班牙", status: "on_sale",
    });
    expect(slugs).toEqual([
      ...mibanLimitedBrands.map(brand => brand.slug), ...previewSlugs,
    ]);
    expect(slugs.filter(slug => slug === "spain")).toHaveLength(1);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("starts at real zero for twelve attention brands, in registry order, with integer counts", async () => {
    const { db, connection } = await fixture();
    const values = await readBrandAttention(connection);
    expect(slugs).toEqual([
      "herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang", "wangka",
      "spain", "guizhou", "amway", "marykay", "nuskin", "jianghai",
    ]);
    expect(values).toEqual(
      slugs.map(brandSlug => ({ brandSlug, viewCount: 0 }))
    );
    expect(values.every(row => Number.isSafeInteger(row.viewCount))).toBe(true);
    expect(db.totals.size).toBe(0);
    expect(db.events.size).toBe(0);
    expect(connection.statements).toHaveLength(1);
    expect(connection.statements[0].sql).toMatch(/^SELECT /);
  });

  it.each(newlyTrackedSlugs)("first reads %s as zero without creating historical totals or events", async brandSlug => {
    const { db, connection } = await fixture();
    db.totals.set("wangka", "7");
    const values = await readBrandAttention(connection);
    expect(values.find(value => value.brandSlug === brandSlug)).toEqual({
      brandSlug, viewCount: 0,
    });
    expect(values[0]).toEqual({ brandSlug: "wangka", viewCount: 7 });
    expect(values).toHaveLength(slugs.length);
    expect(db.totals.has(brandSlug)).toBe(false);
    expect(db.events.size).toBe(0);
    expect(connection.statements).toHaveLength(1);
    expect(connection.statements[0].sql).toMatch(/^SELECT /);
    expect(connection.statements[0].params).toEqual(slugs);
  });

  it.each(newlyTrackedSlugs)("counts a real %s click once, deduplicates retries and accumulates fresh events", async brandSlug => {
    const { db, connection } = await fixture();
    const firstClick = click(brandSlug, 1);
    expect(() => assertBrandAttentionInput(firstClick)).not.toThrow();
    expect(await recordBrandAttention(connection, firstClick)).toEqual({
      brandSlug, viewCount: 1, counted: true,
    });
    expect(await recordBrandAttention(connection, firstClick)).toEqual({
      brandSlug, viewCount: 1, counted: false,
    });
    for (let id = 2; id <= 4; id += 1) {
      expect(await recordBrandAttention(connection, click(brandSlug, id))).toEqual({
        brandSlug, viewCount: id, counted: true,
      });
    }
    expect(await recordBrandAttention(connection, firstClick)).toEqual({
      brandSlug, viewCount: 4, counted: false,
    });
    expect(db.events.size).toBe(4);
    expect(db.totals.size).toBe(1);
    expect(db.totals.get(brandSlug)).toBe(4n);
    expect(connection.statements.filter(statement => statement.sql.includes("total_views + 1"))).toHaveLength(4);
    const values = await readBrandAttention(connection);
    expect(values[0]).toEqual({ brandSlug, viewCount: 4 });
    expect(values).toHaveLength(slugs.length);
    expect(values.slice(1).every(value => value.viewCount === 0)).toBe(true);
  });

  it("counts repeated real clicks by the same person using fresh per-click UUIDs", async () => {
    const { db, connection } = await fixture();
    for (let id = 1; id <= 3; id += 1) {
      expect(
        await recordBrandAttention(connection, click("herbalife", id))
      ).toEqual({
        brandSlug: "herbalife",
        viewCount: id,
        counted: true,
      });
    }
    expect(db.events.size).toBe(3);
    expect((await readBrandAttention(connection))[0].viewCount).toBe(3);
    expect(connection.committed).toBe(3);
  });

  it("counts retries of the same event once and returns the current total", async () => {
    const { db, connection } = await fixture();
    const input = click("fruits", 1);
    expect((await recordBrandAttention(connection, input)).counted).toBe(true);
    expect(await recordBrandAttention(connection, input)).toEqual({
      brandSlug: "fruits",
      viewCount: 1,
      counted: false,
    });
    await recordBrandAttention(connection, click("fruits", 2));
    expect(await recordBrandAttention(connection, input)).toEqual({
      brandSlug: "fruits",
      viewCount: 2,
      counted: false,
    });
    expect(db.events.size).toBe(2);
    expect(db.totals.get("fruits")).toBe(2n);
  });

  it("normalizes UUID case so casing cannot bypass deduplication", async () => {
    const { db, connection } = await fixture();
    const input = click("herbalife", 0xabc);
    await recordBrandAttention(connection, input);
    expect(
      (
        await recordBrandAttention(connection, {
          ...input,
          eventId: input.eventId.toUpperCase(),
        })
      ).counted
    ).toBe(false);
    expect(db.events.size).toBe(1);
  });

  it.each([
    "unknown",
    "majiayou",
    "Herbalife",
    "",
    " fruits",
    "fruits' OR 1=1 --",
  ])("rejects invalid brand %j before any SQL/transaction", async brandSlug => {
    const connection = new MemoryDatabase().connect();
    const input = click(brandSlug, 1);
    expect(() => assertBrandAttentionInput(input)).toThrow(/brandSlug/);
    await expect(recordBrandAttention(connection, input)).rejects.toThrow(
      /brandSlug/
    );
    expect(connection.statements).toEqual([]);
    expect(connection.begun).toBe(0);
  });

  it.each([
    "",
    "not-a-uuid",
    "00000000000040008000000000000001",
    "00000000-0000-0000-0000-000000000000",
    "00000000-0000-4000-7000-000000000001",
    "00000000-0000-9000-8000-000000000001",
    uuid(1) + " ",
    uuid(1) + "' --",
  ])("rejects invalid UUID %j before SQL/transaction", async eventId => {
    const connection = new MemoryDatabase().connect();
    const input = { brandSlug: "fruits", eventId };
    expect(() => assertBrandAttentionInput(input)).toThrow(/UUID/);
    await expect(recordBrandAttention(connection, input)).rejects.toThrow(
      /UUID/
    );
    expect(connection.statements).toEqual([]);
    expect(connection.begun).toBe(0);
  });

  it.each([
    null,
    undefined,
    1,
    "fruits",
    {},
    { brandSlug: "fruits" },
    { brandSlug: "fruits", eventId: 1 },
  ])("pure validator rejects malformed input %j", input => {
    expect(() => assertBrandAttentionInput(input)).toThrow();
  });

  it("rejects the same event UUID changing brand without incrementing either total", async () => {
    const { db, connection } = await fixture();
    await recordBrandAttention(connection, click("herbalife", 1));
    await expect(
      recordBrandAttention(connection, click("fruits", 1))
    ).rejects.toThrow(/another brand/);
    expect(db.events.get(uuid(1))).toBe("herbalife");
    expect(db.totals.get("herbalife")).toBe(1n);
    expect(db.totals.has("fruits")).toBe(false);
    expect(connection.rolledBack).toBe(1);
    expect(
      (await recordBrandAttention(connection, click("herbalife", 1))).counted
    ).toBe(false);
  });

  it("reads descending counts with deterministic original-order ties, excluding unknown rows", async () => {
    const { db, connection } = await fixture();
    // Deliberately different insertion order than mibanLimitedAttentionSlugs.
    db.totals.set("fruits", "5");
    db.totals.set("lingchuang", "9");
    db.totals.set("herbalife", "5");
    db.totals.set("unknown", "999");
    const values = await readBrandAttention(connection);
    expect(values).toEqual([
      { brandSlug: "lingchuang", viewCount: 9 },
      { brandSlug: "herbalife", viewCount: 5 },
      { brandSlug: "fruits", viewCount: 5 },
      { brandSlug: "tuoquetang", viewCount: 0 },
      { brandSlug: "midaniang", viewCount: 0 },
      { brandSlug: "wangka", viewCount: 0 },
      { brandSlug: "spain", viewCount: 0 },
      { brandSlug: "guizhou", viewCount: 0 },
      { brandSlug: "amway", viewCount: 0 },
      { brandSlug: "marykay", viewCount: 0 },
      { brandSlug: "nuskin", viewCount: 0 },
      { brandSlug: "jianghai", viewCount: 0 },
    ]);
    expect(values.every(row => Number.isSafeInteger(row.viewCount))).toBe(true);
    expect(connection.statements[0].params).toEqual(slugs);
  });

  it.each(["midaniang", "wangka"])("counts the %s entrance and deduplicates a retried click", async brandSlug => {
    const { connection } = await fixture();
    const input = click(brandSlug, 1);
    expect(await recordBrandAttention(connection, input)).toEqual({
      brandSlug, viewCount: 1, counted: true,
    });
    expect(await recordBrandAttention(connection, input)).toEqual({
      brandSlug, viewCount: 1, counted: false,
    });
    const values = await readBrandAttention(connection);
    expect(values[0]).toEqual({ brandSlug, viewCount: 1 });
    expect(values).toHaveLength(slugs.length);
    expect(values.slice(1).every(row => row.viewCount === 0)).toBe(true);
  });

  it("propagates missing-table errors instead of reporting fabricated zero history", async () => {
    const connection = new MemoryDatabase().connect();
    await expect(readBrandAttention(connection)).rejects.toMatchObject({
      code: "ER_NO_SUCH_TABLE",
    });
    await expect(
      recordBrandAttention(connection, click("fruits", 1))
    ).rejects.toMatchObject({ code: "ER_NO_SUCH_TABLE" });
    expect(connection.rolledBack).toBe(1);
    expect(
      connection.statements.every(query => !query.sql.startsWith("CREATE"))
    ).toBe(true);
  });

  it("ensures two InnoDB tables idempotently without seeding/resetting history or personal columns", async () => {
    const { db, connection } = await fixture();
    await recordBrandAttention(connection, click("fruits", 1));
    connection.statements = [];
    await ensureBrandAttentionTables(connection);
    await ensureBrandAttentionTables(connection);
    expect(db.totals.get("fruits")).toBe(1n);
    expect(db.events.size).toBe(1);
    expect(connection.statements).toHaveLength(4);
    for (const query of connection.statements) {
      expect(query.inTransaction).toBe(false);
      expect(query.sql).toMatch(/^CREATE TABLE IF NOT EXISTS/);
      expect(query.sql).toMatch(/ENGINE=InnoDB$/);
      expect(query.sql).not.toMatch(
        /\b(user_id|device_id|ip_address|session_id)\b/i
      );
    }
    expect(connection.statements[0].sql).toContain(
      "total_views BIGINT UNSIGNED"
    );
    expect(connection.statements[1].sql).toContain("event_id CHAR(36)");
    expect(connection.statements[1].sql).toContain(
      "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
    );
    expect(connection.statements[1].sql).toContain("stored internally in UTC");
    const migration = readFileSync(
      new URL(
        "../scripts/migrations/miban-brand-attention.sql",
        import.meta.url
      ),
      "utf8"
    )
      .replace(/^--.*$/gm, "")
      .split(";")
      .map(normalizeSql)
      .filter(Boolean);
    expect(migration).toEqual(
      connection.statements.slice(0, 2).map(query => query.sql)
    );
  });

  it("uses INSERT IGNORE plus atomic SQL increment before any counter SELECT, all in one transaction", async () => {
    const { connection } = await fixture();
    await recordBrandAttention(connection, click("lingchuang", 1));
    expect(connection.statements).toHaveLength(3);
    expect(connection.statements[0].sql).toMatch(
      /^INSERT IGNORE INTO .*events/
    );
    expect(connection.statements[0].params).toEqual([uuid(1), "lingchuang"]);
    expect(connection.statements[1].sql).toContain(
      "ON DUPLICATE KEY UPDATE total_views = total_views + 1"
    );
    expect(connection.statements[1].params).toEqual(["lingchuang"]);
    expect(connection.statements[2].sql).toMatch(/^SELECT .*FOR UPDATE$/);
    expect(connection.statements.every(query => query.inTransaction)).toBe(
      true
    );
    expect(connection.begun).toBe(1);
    expect(connection.committed).toBe(1);
    expect(connection.rolledBack).toBe(0);
    connection.statements = [];
    await recordBrandAttention(connection, click("lingchuang", 1));
    expect(connection.statements[1].sql).toMatch(
      /WHERE event_id = \? FOR SHARE$/
    );
    expect(
      connection.statements.some(query => query.sql.includes("total_views + 1"))
    ).toBe(false);
  });

  it("handles many concurrent independent clicks and retries without losing increments in the shared transaction fixture", async () => {
    const { db, connection } = await fixture();
    const totalClicks = slugs.length * 12;
    const inputs = Array.from({ length: totalClicks }, (_, index) =>
      click(slugs[index % slugs.length], index + 1)
    );
    const results = await Promise.all(
      inputs.flatMap(input => [
        recordBrandAttention(db.connect(), input),
        recordBrandAttention(db.connect(), input),
      ])
    );
    expect(results.filter(result => result.counted)).toHaveLength(totalClicks);
    expect(db.events.size).toBe(totalClicks);
    expect(await readBrandAttention(connection)).toEqual(
      slugs.map(brandSlug => ({ brandSlug, viewCount: 12 }))
    );
  });

  it("concurrent same-event different-brand requests commit one winner and reject the other", async () => {
    const { db, connection } = await fixture();
    const results = await Promise.allSettled([
      recordBrandAttention(db.connect(), click("herbalife", 1)),
      recordBrandAttention(db.connect(), click("fruits", 1)),
    ]);
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    expect(db.events.size).toBe(1);
    expect(
      (await readBrandAttention(connection)).reduce(
        (sum, row) => sum + row.viewCount,
        0
      )
    ).toBe(1);
  });

  it.each(["counter", "commit"])(
    "rolls event and total back together on %s failure, allowing safe retry",
    async failure => {
      const { db, connection } = await fixture();
      if (failure === "counter") connection.failUpsertOnce = true;
      else connection.failCommitOnce = true;
      const input = click("tuoquetang", 1);
      await expect(recordBrandAttention(connection, input)).rejects.toThrow(
        /Fixture/
      );
      expect(connection.rolledBack).toBe(1);
      expect(db.events.size).toBe(0);
      expect(db.totals.size).toBe(0);
      expect(await recordBrandAttention(connection, input)).toEqual({
        brandSlug: "tuoquetang",
        viewCount: 1,
        counted: true,
      });
    }
  );

  it("rejects inconsistent stored events rather than faking a missing total", async () => {
    const { db, connection } = await fixture();
    db.events.set(uuid(1), "fruits");
    await expect(
      recordBrandAttention(connection, click("fruits", 1))
    ).rejects.toThrow(/total is missing/);
    expect(connection.rolledBack).toBe(1);
    expect(db.totals.size).toBe(0);
  });

  it.each(["-1", "1.2", "NaN", "9007199254740992", "18446744073709551615"])(
    "rejects invalid/unsafe stored count %j instead of rounding/faking it",
    async total => {
      const { db, connection } = await fixture();
      db.totals.set("fruits", total);
      await expect(readBrandAttention(connection)).rejects.toThrow(/count/i);
    }
  );

  it("returns the maximum exact JS integer and rolls back a next increment instead of rounding", async () => {
    const { db, connection } = await fixture();
    db.totals.set("fruits", String(Number.MAX_SAFE_INTEGER));
    expect((await readBrandAttention(connection))[0].viewCount).toBe(
      Number.MAX_SAFE_INTEGER
    );
    await expect(
      recordBrandAttention(connection, click("fruits", 1))
    ).rejects.toThrow(/safe integer/);
    expect(db.events.size).toBe(0);
    expect(db.totals.get("fruits")).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("storage module has only the side-effect-free whitelist import, no db/router/network bootstrap", () => {
    const source = readFileSync(
      new URL("./miban-brand-attention.ts", import.meta.url),
      "utf8"
    );
    const imports = [...source.matchAll(/^import .* from "([^"]+)";/gm)].map(
      match => match[1]
    );
    expect(imports).toEqual(["../shared/miban-limited-brand-config"]);
    expect(source).not.toMatch(
      /\b(getDb|fetch|setInterval|setTimeout|createConnection|createPool)\s*\(/
    );
  });
});
