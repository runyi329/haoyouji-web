export type StockReadPriority = "high" | "low";
export type StockReadOptions = {
  priority?: StockReadPriority;
  deadlineAt?: number;
  signal?: AbortSignal;
  queueKey?: string;
  /** Internal shared-flight demand guard, rechecked at dispatch. */
  canStart?: () => boolean;
};
export const STOCK_READ_QUEUE_LIMIT = 200;
export const STOCK_READ_QUEUE_WAIT_MS = 25_000;
export const STOCK_READ_EXECUTION_MS = 15_000;
export const STOCK_READ_INTERVAL_MS = 2_200;

export class StockReadQueueError extends Error {
  constructor(readonly reason: "busy" | "waiting" | "deadline" | "timeout") {
    super(`Stock read ${reason}`);
  }
}

/** Wait bounds belong to each subscriber, not to the shared provider read. */
export function waitForStockRead<T>(
  pending: Promise<T>,
  options: StockReadOptions = {}
): Promise<T> {
  if (
    options.signal?.aborted ||
    (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)
  ) {
    // The underlying shared promise may reject later; an expired subscriber
    // still observes it to avoid an unhandled rejection, without cancelling IO.
    void pending.catch(() => undefined);
    return Promise.reject(new StockReadQueueError("deadline"));
  }
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () =>
      finish(() => reject(new StockReadQueueError("deadline")));
    const finish = (settle: () => void) => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      settle();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.deadlineAt !== undefined)
      timer = setTimeout(abort, Math.max(0, options.deadlineAt - Date.now()));
    pending.then(
      value => {
        if (
          options.signal?.aborted ||
          (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)
        )
          abort();
        else finish(() => resolve(value));
      },
      error => finish(() => reject(error))
    );
  });
}

type Task = {
  key?: string;
  priority: StockReadPriority;
  expiresAt: number;
  subscribers: Map<() => void, StockReadOptions>;
  run: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  expiry?: ReturnType<typeof setTimeout>;
};

/** No IO, retry, collector, persistent timer or scheduler. Only requested work.
 * Execution timeout releases the caller and aborts fetch, but holds the exclusive
 * slot until the ACTUAL fetch+JSON promise settles. An adapter ignoring abort
 * cannot create overlapping provider IO. Expired queued tasks are removed.
 * retain() lets singleflight joins promote/add demand without duplicating IO. */
export class StockChartReadQueue {
  private waiting: Task[] = [];
  private active: Task | undefined;
  private nextAllowedAt = 0;
  private wake: ReturnType<typeof setTimeout> | undefined;

  retain(key: string, options: StockReadOptions = {}): void {
    const task = this.waiting.find(task => task.key === key);
    if (!task) return; // Active reads always finish independently of subscribers.
    if (options.priority === "high") task.priority = "high";
    this.subscribe(task, options);
    this.pump();
  }

  enqueue<T>(
    run: (signal: AbortSignal) => Promise<T>,
    options: StockReadOptions = {}
  ): Promise<T> {
    if (
      options.signal?.aborted ||
      (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) ||
      options.canStart?.() === false
    )
      return Promise.reject(new StockReadQueueError("deadline"));
    if (this.waiting.length >= STOCK_READ_QUEUE_LIMIT)
      return Promise.reject(new StockReadQueueError("busy"));
    return new Promise<T>((resolve, reject) => {
      const task: Task = {
        key: options.queueKey,
        priority: options.priority ?? "low",
        expiresAt: Date.now() + STOCK_READ_QUEUE_WAIT_MS,
        subscribers: new Map(),
        run,
        resolve: value => resolve(value as T),
        reject,
      };
      this.waiting.push(task);
      task.expiry = setTimeout(
        () => this.remove(task, "waiting"),
        STOCK_READ_QUEUE_WAIT_MS
      );
      this.subscribe(task, options);
      this.pump();
    });
  }

  private subscribe(task: Task, options: StockReadOptions): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      task.subscribers.delete(cleanup);
    };
    const cancel = () => {
      cleanup();
      if (!task.subscribers.size) this.remove(task, "deadline");
    };
    task.subscribers.set(cleanup, options);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (
      options.signal?.aborted ||
      (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) ||
      options.canStart?.() === false
    )
      cancel();
    else if (options.deadlineAt !== undefined)
      timer = setTimeout(cancel, options.deadlineAt - Date.now());
  }

  private cleanup(task: Task): void {
    if (task.expiry !== undefined) clearTimeout(task.expiry);
    for (const cleanup of [...task.subscribers.keys()]) cleanup();
  }

  private remove(task: Task, reason: "deadline" | "waiting"): void {
    const index = this.waiting.indexOf(task);
    if (index < 0) return;
    this.waiting.splice(index, 1);
    this.cleanup(task);
    task.reject(new StockReadQueueError(reason));
    this.pump();
  }

  private pump(): void {
    if (this.wake !== undefined) {
      clearTimeout(this.wake);
      this.wake = undefined;
    }
    for (const task of [...this.waiting]) {
      if (Date.now() >= task.expiresAt) {
        this.waiting.splice(this.waiting.indexOf(task), 1);
        this.cleanup(task);
        task.reject(new StockReadQueueError("waiting"));
      }
    }
    // Timers may be delayed. Reject expired demand by wall clock at dispatch,
    // while leaving a shared cost task alive if a normal chart still needs it.
    for (const task of [...this.waiting]) {
      for (const [cleanup, options] of [...task.subscribers])
        if (
          options.signal?.aborted ||
          (options.deadlineAt !== undefined &&
            Date.now() >= options.deadlineAt) ||
          options.canStart?.() === false
        )
          cleanup();
      if (!task.subscribers.size) {
        this.waiting.splice(this.waiting.indexOf(task), 1);
        this.cleanup(task);
        task.reject(new StockReadQueueError("deadline"));
      }
    }
    if (this.active || !this.waiting.length) return;
    const gap = this.nextAllowedAt - Date.now();
    if (gap > 0) {
      this.wake = setTimeout(() => {
        this.wake = undefined;
        this.pump();
      }, gap);
      return;
    }
    const high = this.waiting.findIndex(task => task.priority === "high");
    const task = this.waiting.splice(high < 0 ? 0 : high, 1)[0];
    this.active = task;
    this.cleanup(task);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      task.reject(new StockReadQueueError("timeout"));
    }, STOCK_READ_EXECUTION_MS);
    Promise.resolve()
      .then(() => task.run(controller.signal))
      .then(task.resolve, task.reject)
      .finally(() => {
        clearTimeout(timeout);
        this.active = undefined;
        this.nextAllowedAt = Date.now() + STOCK_READ_INTERVAL_MS;
        this.pump();
      });
  }
}
