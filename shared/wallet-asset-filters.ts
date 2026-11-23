import { AI_WALLET_SETTLEMENT_ASSETS } from "./ai-wallet-assets";

export type WalletAssetFilterCategory = "all" | "digital" | "stable" | "cny";

/** Historical missing currency and U are USDT; RMB/人民币 are CNY. */
export function normalizeWalletAssetCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code || code === "U") return "USDT";
  if (code === "RMB" || code === "人民币") return "CNY";
  return code;
}

/** The existing stable account is USDT only; securities/commodities stay digital. */
export function getWalletAssetCategory(value: unknown): "digital" | "stable" | "cny" {
  const code = normalizeWalletAssetCode(value);
  if (code === "USDT") return "stable";
  if (code === "CNY") return "cny";
  return "digital";
}

function isAllAssetCode(assetCode: string): boolean {
  return assetCode.trim().toLowerCase() === "all";
}

export function matchesWalletAssetFilter(
  code: unknown,
  category: WalletAssetFilterCategory = "all",
  assetCode: string = "all",
): boolean {
  return (category === "all" || getWalletAssetCategory(code) === category)
    && (isAllAssetCode(assetCode) || normalizeWalletAssetCode(code) === normalizeWalletAssetCode(assetCode));
}

export function getWalletAssetFilterLabel(
  category: WalletAssetFilterCategory,
  assetCode: string,
): string {
  if (!isAllAssetCode(assetCode)) {
    const code = normalizeWalletAssetCode(assetCode);
    return code === "CNY" ? "人民币" : code;
  }
  return { all: "全部币种", digital: "数字币", stable: "稳定币", cny: "人民币" }[category];
}

/** Adds only codes actually supplied by holdings/history; never creates a ledger. */
export function getWalletAssetFilterCodes(extraCodes: readonly unknown[] = []): string[] {
  const codes = new Set<string>(["USDT", "CNY", ...AI_WALLET_SETTLEMENT_ASSETS]);
  for (const value of extraCodes) {
    if (value == null || String(value).trim() === "") continue;
    codes.add(normalizeWalletAssetCode(value));
  }
  return Array.from(codes);
}

export function buildWalletAssetFilterSql(
  column: "wallet_event.currency" | "bh.currency",
  input: { assetCategory?: WalletAssetFilterCategory; assetCode?: string },
): { parts: string[]; values: string[] } {
  // Guard at runtime too: callers cannot turn a cast column name into SQL.
  if (column !== "wallet_event.currency" && column !== "bh.currency") {
    throw new Error("Unsupported wallet asset filter column");
  }
  // MySQL 8 whitespace trimming also handles tabs/newlines in legacy currency values.
  const codeSql = `UPPER(REGEXP_REPLACE(COALESCE(${column}, ''), '^[[:space:]]+|[[:space:]]+$', ''))`;
  const stableAliases = ["", "U", "USDT"];
  const cnyAliases = ["CNY", "RMB", "人民币"];
  const parts: string[] = [];
  const values: string[] = [];
  const membership = (aliases: string[], exclude = false) => {
    parts.push(`${codeSql} ${exclude ? "NOT IN" : "IN"} (${aliases.map(() => "?").join(", ")})`);
    values.push(...aliases);
  };

  switch (input.assetCategory ?? "all") {
    case "stable": membership(stableAliases); break;
    case "cny": membership(cnyAliases); break;
    case "digital": membership([...stableAliases, ...cnyAliases], true); break;
  }
  if (input.assetCode !== undefined && !isAllAssetCode(input.assetCode)) {
    const assetCode = normalizeWalletAssetCode(input.assetCode);
    if (assetCode === "USDT") membership(stableAliases);
    else if (assetCode === "CNY") membership(cnyAliases);
    else {
      parts.push(`${codeSql} = ?`);
      values.push(assetCode);
    }
  }
  return { parts, values };
}
