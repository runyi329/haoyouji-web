/**
 * T+0 的 HTTP 摘要含大量可选 undefined 字段。superjson 为每个字段生成路径元数据，
 * 移动首屏会因此收到数 MB 的冗余 JSON。仅省略对象中的 undefined：
 * 保留 null/0/负数/日期/数组顺序与所有订单，不修改来源对象或财务计算输入。
 */
export function compactT0JournalResponse<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const visit = (input: unknown): unknown => {
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input)) return seen.get(input);
    if (Array.isArray(input)) {
      const result: unknown[] = [];
      seen.set(input, result);
      for (let index = 0; index < input.length; index++) {
        if (index in input) result[index] = visit(input[index]);
        else result.length = index + 1;
      }
      return result;
    }
    // 不将 Date、Buffer、Decimal 或其他专用对象转成普通对象。
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return input;
    const result: Record<string, unknown> = Object.create(prototype);
    seen.set(input, result);
    for (const [key, item] of Object.entries(input)) {
      if (item !== undefined) Object.defineProperty(result, key, {
        value: visit(item), enumerable: true, writable: true, configurable: true,
      });
    }
    return result;
  };
  return visit(value) as T;
}
