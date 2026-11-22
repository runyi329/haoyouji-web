import { mibanLimitedBrands } from "../shared/miban-limited-brand-config";

/** A dedicated mysql2/promise connection; the caller owns its lifecycle. */
export interface BrandAttentionConnection {
  execute(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type BrandAttentionSlug = (typeof mibanLimitedBrands)[number]["slug"];
export interface BrandAttention {
  brandSlug: BrandAttentionSlug;
  viewCount: number;
}
export interface RecordBrandAttentionInput {
  brandSlug: string;
  /** Generate once per real click; preserve it for all retries of that click. */
  eventId: string;
}
export interface RecordBrandAttentionResult extends BrandAttention {
  counted: boolean;
}

const brandSlugs = mibanLimitedBrands.map(brand => brand.slug);
const brandWhitelist = new Set<string>(brandSlugs);
// RFC UUID versions 1–8 and RFC variant; normalize case before deduplication.
const eventUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createTotalsTable = `CREATE TABLE IF NOT EXISTS miban_brand_attention_totals (
  brand_slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  total_views BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB`;

const createEventsTable = `CREATE TABLE IF NOT EXISTS miban_brand_attention_events (
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  brand_slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'UTC instant: MySQL TIMESTAMP is stored internally in UTC'
) ENGINE=InnoDB`;

/**
 * Explicit, idempotent schema setup. No connections, queries or timers run on
 * import. Call before starting any transaction: MySQL DDL implicitly commits.
 * No historical counts are seeded, and no user/device/IP information is stored.
 */
export async function ensureBrandAttentionTables(
  connection: BrandAttentionConnection
): Promise<void> {
  await connection.execute(createTotalsTable);
  await connection.execute(createEventsTable);
}

function parseViewCount(value: unknown): number {
  // CAST(... AS CHAR) in every SELECT avoids mysql2's lossy BIGINT decoding.
  if (
    !(
      (typeof value === "string" && /^\d+$/.test(value)) ||
      (typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0) ||
      (typeof value === "bigint" && value >= 0n)
    )
  ) {
    throw new Error("Invalid stored brand attention count");
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(
      "Brand attention count exceeds the safe integer range"
    );
  }
  return count;
}

/** Pure validation, safe to call before opening a connection or ensuring tables. */
export function assertBrandAttentionInput(
  input: unknown
): asserts input is RecordBrandAttentionInput {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid brand attention input");
  }
  const candidate = input as Partial<RecordBrandAttentionInput>;
  if (
    typeof candidate.brandSlug !== "string" ||
    !brandWhitelist.has(candidate.brandSlug)
  ) {
    throw new Error("Invalid brand attention brandSlug");
  }
  if (
    typeof candidate.eventId !== "string" ||
    !eventUuidPattern.test(candidate.eventId)
  ) {
    throw new Error("Invalid brand attention eventId UUID");
  }
}

/**
 * Return exactly the configured whitelisted brands, descending by cumulative clicks;
 * equal counts retain mibanLimitedBrands order. Missing rows in an existing
 * table genuinely mean zero; missing tables/errors propagate, never fake data.
 * This function neither creates tables nor writes rows.
 */
export async function readBrandAttention(
  connection: BrandAttentionConnection
): Promise<BrandAttention[]> {
  const [result] = await connection.execute(
    `SELECT brand_slug, CAST(total_views AS CHAR) AS total_views
     FROM miban_brand_attention_totals
     WHERE brand_slug IN (${brandSlugs.map(() => "?").join(", ")})`,
    [...brandSlugs]
  );
  if (!Array.isArray(result))
    throw new Error("Invalid brand attention query result");
  const counts = new Map<string, number>();
  for (const row of result as Array<{
    brand_slug: string;
    total_views: unknown;
  }>) {
    if (brandWhitelist.has(row.brand_slug)) {
      counts.set(row.brand_slug, parseViewCount(row.total_views));
    }
  }
  // Array.sort is stable; mapping first establishes the original brand order.
  return brandSlugs
    .map(brandSlug => ({ brandSlug, viewCount: counts.get(brandSlug) ?? 0 }))
    .sort((left, right) => right.viewCount - left.viewCount);
}

/**
 * One real click = one fresh UUID, including repeat clicks by the same person.
 * An event and its atomic counter increment commit together on this connection.
 * Retrying the same UUID/brand returns counted:false; reusing it for a different
 * brand is rejected. Use a dedicated connection with no caller transaction;
 * ensure tables externally and end/release the connection in the caller.
 */
export async function recordBrandAttention(
  connection: BrandAttentionConnection,
  input: RecordBrandAttentionInput
): Promise<RecordBrandAttentionResult> {
  assertBrandAttentionInput(input);
  const brandSlug = input.brandSlug as BrandAttentionSlug;
  const eventId = input.eventId.toLowerCase();

  await connection.beginTransaction();
  try {
    // CURRENT_TIMESTAMP is deliberately used for TIMESTAMP: MySQL stores the
    // instant in UTC regardless of session timezone. UTC_TIMESTAMP() assigned
    // to TIMESTAMP in a non-UTC session would incorrectly shift that instant.
    const [insertResult] = await connection.execute(
      `INSERT IGNORE INTO miban_brand_attention_events (event_id, brand_slug, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [eventId, brandSlug]
    );
    const affectedRows = (insertResult as { affectedRows?: unknown } | null)
      ?.affectedRows;
    if (affectedRows !== 0 && affectedRows !== 1) {
      throw new Error("Invalid brand attention event insert result");
    }
    const counted = affectedRows === 1;
    if (counted) {
      // Never SELECT a counter then write a computed value: InnoDB locks this
      // single atomic upsert, preventing lost increments across connections.
      await connection.execute(
        `INSERT INTO miban_brand_attention_totals (brand_slug, total_views)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE total_views = total_views + 1`,
        [brandSlug]
      );
    } else {
      // Locking/current read sees the committed winning event even under
      // REPEATABLE READ. FOR SHARE avoids upgrading the duplicate-key shared
      // event lock to an exclusive lock when several retries arrive together.
      const [events] = await connection.execute(
        `SELECT brand_slug FROM miban_brand_attention_events
         WHERE event_id = ? FOR SHARE`,
        [eventId]
      );
      if (!Array.isArray(events) || events.length !== 1) {
        throw new Error("Brand attention event was not stored");
      }
      if ((events[0] as { brand_slug: string }).brand_slug !== brandSlug) {
        throw new Error(
          "Brand attention eventId already belongs to another brand"
        );
      }
    }

    const [totals] = await connection.execute(
      `SELECT CAST(total_views AS CHAR) AS total_views
       FROM miban_brand_attention_totals WHERE brand_slug = ? FOR UPDATE`,
      [brandSlug]
    );
    if (!Array.isArray(totals) || totals.length !== 1) {
      throw new Error("Brand attention total is missing for a stored event");
    }
    const viewCount = parseViewCount(
      (totals[0] as { total_views: unknown }).total_views
    );
    await connection.commit();
    return { brandSlug, viewCount, counted };
  } catch (error) {
    // Preserve the actual failure; the caller must discard/end a failed connection.
    try {
      await connection.rollback();
    } catch {
      // A disconnected connection can also fail rollback.
    }
    throw error;
  }
}
