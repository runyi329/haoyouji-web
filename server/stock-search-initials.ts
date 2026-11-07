type StockSearchDb = {
  execute(sql: string, params?: any[]): Promise<any>;
};

type StockInitials = { code: string; initials: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedIndex: { entries: StockInitials[]; expiresAt: number } | undefined;
let inFlight: Promise<StockInitials[]> | undefined;

async function buildIndex(db: StockSearchDb): Promise<StockInitials[]> {
  const result = await db.execute("SELECT ts_code, name FROM ts_stock_basic");
  // mysql2 returns [rows, fields]; also allow adapters that return rows directly.
  const rows = Array.isArray(result?.[0]) ? result[0] : result;
  if (!Array.isArray(rows)) {
    throw new Error("Invalid stock metadata result");
  }

  // Keep this import server-only: a historical client static import broke startup.
  const { pinyin } = await import("pinyin-pro");
  return rows.map((row): StockInitials => {
    if (typeof row?.ts_code !== "string" || typeof row?.name !== "string") {
      throw new Error("Invalid stock metadata row");
    }
    return {
      code: row.ts_code,
      initials: pinyin(row.name.normalize("NFKC"), {
        pattern: "first",
        toneType: "none",
        type: "array",
        nonZh: "consecutive",
      })
        .join("")
        .replace(/[^a-z]/gi, "")
        .toLowerCase(),
    };
  });
}

function getIndex(db: StockSearchDb): Promise<StockInitials[]> {
  if (cachedIndex && Date.now() < cachedIndex.expiresAt) {
    return Promise.resolve(cachedIndex.entries);
  }
  if (inFlight) return inFlight;

  cachedIndex = undefined;
  const pending = buildIndex(db)
    .then((entries) => {
      // A test reset must not allow an older build to repopulate the cache.
      if (inFlight === pending) {
        cachedIndex = { entries, expiresAt: Date.now() + CACHE_TTL_MS };
      }
      return entries;
    })
    .finally(() => {
      if (inFlight === pending) inFlight = undefined;
    });
  inFlight = pending;
  return pending;
}

/**
 * Supplement existing name/code LIKE searches with contiguous pinyin initials.
 * Only trimmed ASCII-letter keywords consult the shared ten-minute metadata index.
 * Database/import/index failures reject so callers can report a search error.
 */
export async function findStockCodesByInitials(
  db: { execute(sql: string, params?: any[]): Promise<any> },
  keyword: string,
): Promise<string[]> {
  const normalized = keyword.trim().toLowerCase();
  if (!/^[a-z]+$/.test(normalized)) return [];

  const entries = await getIndex(db);
  return [
    ...new Set(
      entries
        .filter((entry) => entry.initials.includes(normalized))
        .map((entry) => entry.code),
    ),
  ];
}

/** Test isolation only; does not cancel queries already in progress. */
export function resetStockSearchInitialsCacheForTests(): void {
  cachedIndex = undefined;
  inFlight = undefined;
}
