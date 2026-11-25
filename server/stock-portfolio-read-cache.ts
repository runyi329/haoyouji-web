/** Process-local SELECT/derived singleflight. Never share transaction snapshots across executors. */
export class StockPortfolioReadCache<T> {
  private executors = new WeakMap<object, Map<string, { revision: string; until: number; pending: boolean; promise: Promise<T> }>>();
  constructor(private readonly ttlMs = 15_000) {}
  clear(): void { this.executors = new WeakMap(); }
  read(executor: object, scope: string, revision: string, load: () => Promise<T>): Promise<T> {
    let entries = this.executors.get(executor);
    if (!entries) { entries = new Map(); this.executors.set(executor, entries); }
    const saved = entries.get(scope);
    if (saved?.revision === revision && (saved.pending || saved.until > Date.now())) return saved.promise;
    const entry = { revision, until: 0, pending: true, promise: Promise.resolve().then(load) };
    entries.set(scope, entry);
    void entry.promise.then(() => {
      entry.pending = false;
      entry.until = Date.now() + this.ttlMs;
    }, () => { if (entries!.get(scope) === entry) entries!.delete(scope); });
    return entry.promise;
  }
}
