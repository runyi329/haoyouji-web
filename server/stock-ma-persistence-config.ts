import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type StockMAPersistenceOptions = {
  root: string;
  sourceIdentity: string;
};

type PersistenceEnv = Pick<
  NodeJS.ProcessEnv,
  "NODE_ENV" | "STOCK_MA_STATE_DIR" | "STOCK_MA_PERSISTENCE_DISABLED"
>;

/** Pure configuration only: no directory creation, database reads or secrets. */
export function stockMAPersistenceOptions(
  pool: unknown,
  env: PersistenceEnv = process.env,
  home: string = homedir()
): StockMAPersistenceOptions | null {
  if (env.STOCK_MA_PERSISTENCE_DISABLED === "1") return null;
  if (env.NODE_ENV !== "production" && !env.STOCK_MA_STATE_DIR) return null;
  const root =
    env.STOCK_MA_STATE_DIR || join(home, ".cache", "haoyouji-web", "stock-ma");
  if (!isAbsolute(root)) return null;
  // mysql2/promise's physical pool holds its non-secret source identity here.
  // Unknown/injected adapters must opt in explicitly at the monitor boundary;
  // never guess a production namespace from a global DATABASE_URL.
  const candidate = pool as {
    pool?: {
      config?: {
        connectionConfig?: {
          host?: unknown;
          port?: unknown;
          database?: unknown;
          socketPath?: unknown;
        };
      };
    };
  } | null;
  const config = candidate?.pool?.config?.connectionConfig;
  if (!config || typeof config.database !== "string" || !config.database)
    return null;
  const host = typeof config.host === "string" ? config.host : "";
  const socket = typeof config.socketPath === "string" ? config.socketPath : "";
  const port = config.port ?? 3306;
  if (
    (!host && !socket) ||
    !Number.isSafeInteger(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  )
    return null;
  const sourceIdentity = createHash("sha256")
    .update(
      JSON.stringify([
        "tushare-a-share-raw-ts_daily-v1",
        host,
        port,
        socket,
        config.database,
      ])
    )
    .digest("hex");
  return { root, sourceIdentity };
}
