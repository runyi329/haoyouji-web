import type mysql from "mysql2/promise";

// Key by the physical pool, not getDbConnection's per-call compatibility proxy.
// Weak keys allow retired pools and their AI-module caches to be collected.
const poolExecutors = new WeakMap<mysql.Pool, mysql.Connection>();
const noOpEnd = async (): Promise<void> => undefined;

/** AI read executor only; does not acquire, release or close a pool connection. */
export function getStockMarketExecutor(
  pool: mysql.Pool | null,
  fallbackConnection: mysql.Connection | null,
): mysql.Connection | null {
  // Preserve legacy/non-pooled adapters verbatim, including null.
  if (!pool) return fallbackConnection;

  let executor = poolExecutors.get(pool);
  if (!executor) {
    executor = new Proxy(pool, {
      get(target, property) {
        if (property === "end") return noOpEnd;
        // mysql2 query/execute and accessor properties must receive the real pool.
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as mysql.Connection;
    poolExecutors.set(pool, executor);
  }
  return executor;
}
