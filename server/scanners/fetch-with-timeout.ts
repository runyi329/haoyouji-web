export const DEFAULT_CHAIN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * 链节点/Indexer 请求必须有上限；超时会抛出明确异常，交由多链扫描器写入链级心跳，
 * 而不是无限占用扫描锁并让后续每分钟任务持续跳过。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_CHAIN_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`链节点请求超时（${Math.ceil(timeoutMs / 1000)}秒）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
