import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StockChartReadQueue,
  StockReadQueueError,
  waitForStockRead,
  STOCK_READ_QUEUE_LIMIT,
} from "./stock-chart-read-queue";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const pending = new Promise<T>(r => {
    resolve = r;
  });
  return { pending, resolve };
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}
const outcome = <T>(pending: Promise<T>) =>
  pending.catch(error => error as StockReadQueueError);

describe("有限单请求优先队列（没有真实IO）", () => {
  it("高优先抢占尚未启动的低优先，同级FIFO，执行中不抢占", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<string>();
    const order: string[] = [];
    const start = (label: string) => {
      order.push(label);
      return Promise.resolve(label);
    };
    const a = queue.enqueue(() => {
      order.push("active");
      return first.pending;
    });
    const b = queue.enqueue(() => start("low1"));
    const c = queue.enqueue(() => start("high1"), { priority: "high" });
    const d = queue.enqueue(() => start("low2"));
    const e = queue.enqueue(() => start("high2"), { priority: "high" });
    await flush();
    expect(order).toEqual(["active"]);
    first.resolve("active");
    await vi.runAllTimersAsync();
    await Promise.all([a, b, c, d, e]);
    expect(order).toEqual(["active", "high1", "high2", "low1", "low2"]);
  });

  it("共享排队任务被retain提升，不创建重复读取", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    const order: string[] = [];
    const a = queue.enqueue(() => first.pending);
    const b = queue.enqueue(async () => {
      order.push("earlier");
    });
    const target = vi.fn(async () => {
      order.push("target");
    });
    const c = queue.enqueue(target, { queueKey: "same-cost" });
    queue.retain("same-cost", { priority: "high" });
    first.resolve();
    await vi.runAllTimersAsync();
    await Promise.all([a, b, c]);
    expect(order).toEqual(["target", "earlier"]);
    expect(target).toHaveBeenCalledTimes(1);
  });

  it("25秒排队超时立即移除，活动读取后来完成也不得补跑", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    const a = outcome(queue.enqueue(() => first.pending));
    const abandoned = vi.fn(async () => "old");
    const b = outcome(queue.enqueue(abandoned));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await b).toMatchObject({ reason: "waiting" });
    expect(await a).toMatchObject({ reason: "timeout" });
    first.resolve();
    await vi.runAllTimersAsync();
    expect(abandoned).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["deadline", "signal"])("%s取消未启动任务，不补跑", async mode => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    const controller = new AbortController();
    const a = queue.enqueue(() => first.pending);
    const abandoned = vi.fn(async () => "old");
    const b = outcome(
      queue.enqueue(
        abandoned,
        mode === "deadline"
          ? { deadlineAt: 1000 }
          : { signal: controller.signal }
      )
    );
    await flush();
    if (mode === "signal") controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await b).toMatchObject({ reason: "deadline" });
    first.resolve();
    await vi.runAllTimersAsync();
    await a;
    expect(abandoned).not.toHaveBeenCalled();
  });

  it("一个订阅者取消不移除另一订阅者仍等待的同一读", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    const controller = new AbortController(),
      read = vi.fn(async () => "real");
    const a = queue.enqueue(() => first.pending);
    const b = queue.enqueue(read, {
      queueKey: "shared",
      signal: controller.signal,
    });
    queue.retain("shared", { priority: "high" });
    controller.abort();
    first.resolve();
    await vi.runAllTimersAsync();
    await a;
    expect(await b).toBe("real");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("活动读仅由15秒执行上限abort，订阅deadline不破坏共享结果", async () => {
    const queue = new StockChartReadQueue(),
      running = deferred<string>();
    const controller = new AbortController();
    let signal!: AbortSignal;
    const read = queue.enqueue(
      s => {
        signal = s;
        return running.pending;
      },
      { signal: controller.signal }
    );
    const subscriber = outcome(waitForStockRead(read, { deadlineAt: 1000 }));
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    expect(await subscriber).toMatchObject({ reason: "deadline" });
    expect(signal.aborted).toBe(false);
    running.resolve("shared success");
    expect(await read).toBe("shared success");
    await vi.runAllTimersAsync();
  });

  it("无视abort的超时读仍占用唯一实际IO槽，完成后再等待2200ms", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    let signal!: AbortSignal;
    const a = outcome(
      queue.enqueue(s => {
        signal = s;
        return first.pending;
      })
    );
    const starts: number[] = [];
    const b = queue.enqueue(async () => {
      starts.push(Date.now());
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await a).toMatchObject({ reason: "timeout" });
    expect(signal.aborted).toBe(true);
    expect(starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    first.resolve();
    await flush();
    await vi.advanceTimersByTimeAsync(2199);
    expect(starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([18_200]);
    await b;
  });

  it("同步throw也会释放槽且完成后2200ms才下一读", async () => {
    const queue = new StockChartReadQueue(),
      starts: number[] = [];
    const a = outcome(
      queue.enqueue(() => {
        throw new Error("injected");
      })
    );
    const b = queue.enqueue(async () => {
      starts.push(Date.now());
    });
    await vi.runAllTimersAsync();
    expect(await a).toBeInstanceOf(Error);
    await b;
    expect(starts).toEqual([2200]);
  });

  it("待执行队列上限200，溢出任务立即拒绝且无无限timer", async () => {
    const queue = new StockChartReadQueue(),
      first = deferred<void>();
    const a = outcome(queue.enqueue(() => first.pending));
    const reads = Array.from({ length: STOCK_READ_QUEUE_LIMIT }, () =>
      outcome(queue.enqueue(async () => "ok"))
    );
    const overflow = vi.fn(async () => "bad");
    expect(await outcome(queue.enqueue(overflow))).toMatchObject({
      reason: "busy",
    });
    await vi.runAllTimersAsync();
    await Promise.all([a, ...reads]);
    first.resolve();
    await vi.runAllTimersAsync();
    expect(overflow).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("已过期限/已abort的请求不入队", async () => {
    const queue = new StockChartReadQueue(),
      run = vi.fn(async () => 1);
    const controller = new AbortController();
    controller.abort();
    await expect(queue.enqueue(run, { deadlineAt: 0 })).rejects.toMatchObject({
      reason: "deadline",
    });
    await expect(
      queue.enqueue(run, { signal: controller.signal })
    ).rejects.toMatchObject({ reason: "deadline" });
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("派发时期限守卫（即使取消timer尚未执行）", () => {
  it("时钟已跨过deadline时，完成前读也不能派发过期排队任务", async () => {
    const queue = new StockChartReadQueue(),
      running = deferred<void>();
    const a = outcome(queue.enqueue(() => running.pending));
    const stale = vi.fn(async () => "stale");
    const b = outcome(queue.enqueue(stale, { deadlineAt: 1000 }));
    await flush();
    // Change wall clock without running the cancellation timer.
    vi.setSystemTime(2000);
    running.resolve();
    await flush();
    await vi.runAllTimersAsync();
    await a;
    expect(await b).toMatchObject({ reason: "deadline" });
    expect(stale).not.toHaveBeenCalled();
  });

  it("共享调用canStart已失效时派发拒绝；另一个普通订阅仍可保留读取", async () => {
    const queue = new StockChartReadQueue(),
      running = deferred<void>();
    let alive = true;
    const a = queue.enqueue(() => running.pending);
    const stale = vi.fn(async () => "stale");
    const b = outcome(queue.enqueue(stale, { canStart: () => alive }));
    const retained = vi.fn(async () => "retained");
    const c = queue.enqueue(retained, {
      queueKey: "shared",
      canStart: () => alive,
    });
    queue.retain("shared", { priority: "high" });
    alive = false;
    running.resolve();
    await vi.runAllTimersAsync();
    await a;
    expect(await b).toMatchObject({ reason: "deadline" });
    expect(await c).toBe("retained");
    expect(stale).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledTimes(1);
  });
});
