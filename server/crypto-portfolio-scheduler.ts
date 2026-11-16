/** 应用拥有的37号数字币调度；只在原应用启动后显式开启，无模块导入副作用。 */
import { publishCryptoPortfolioSnapshots, refreshCryptoPortfolioIntradaySnapshots } from './crypto-portfolio-settlement';
import { warmAllStockTagCalendarResults } from './ledger-stock-portfolio';
import { cryptoPortfolioBeijingDate, cryptoPortfolioCandidateDates, cryptoPortfolioCutoffAt, millisecondsUntilNextCryptoPortfolioClose } from '../shared/crypto-portfolio-policy';

const LIVE_INTERVAL_MS = 5_000;
const RETRY_INTERVAL_MS = 5 * 60 * 1_000;
const RETRY_WINDOW_MS = 3 * 60 * 60 * 1_000;
let liveTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let liveInFlight = false;
let closeInFlight = false;

async function refreshLive(): Promise<void> {
  if (liveInFlight) return;
  liveInFlight = true;
  try {
    // 只跟踪37号已登记的数字币；不扫描整个交易所目录，不更改日历或钱包。
    await refreshCryptoPortfolioIntradaySnapshots();
  } catch {
    console.warn('[37数字币现货] 本轮实时取价不可用，保留缺价状态等待下一轮');
  } finally { liveInFlight = false; }
}

export async function runCryptoPortfolioCloseCandidates(now = new Date(), retryDate?: string): Promise<void> {
  if (closeInFlight) return;
  closeInFlight = true;
  try {
    const candidates = retryDate ? [retryDate] : cryptoPortfolioCandidateDates(now);
    for (const snapshotDate of candidates) {
      if (cryptoPortfolioCutoffAt(snapshotDate).getTime() > now.getTime()) continue;
      try {
        const result = await publishCryptoPortfolioSnapshots({ snapshotDate });
        // 缺价、缺FX不算发布成功；只在真实新增日结后刷新派生缓存。
        if (result.published > 0) await warmAllStockTagCalendarResults();
      } catch {
        console.warn(`[37数字币日结] ${snapshotDate}证据未齐，未写成功标记`);
      }
    }
  } finally { closeInFlight = false; }
}

function scheduleRetry(date: string): void {
  const now = Date.now();
  const cutoff = cryptoPortfolioCutoffAt(date).getTime();
  if (retryTimer || cryptoPortfolioBeijingDate() !== date || now < cutoff || now + RETRY_INTERVAL_MS > cutoff + RETRY_WINDOW_MS) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (cryptoPortfolioBeijingDate() !== date || Date.now() > cutoff + RETRY_WINDOW_MS) return;
    void runCryptoPortfolioCloseCandidates(new Date(), date).finally(() => scheduleRetry(date));
  }, RETRY_INTERVAL_MS);
  retryTimer.unref?.();
}

function scheduleDaily(): void {
  dailyTimer = setTimeout(() => {
    dailyTimer = null;
    const date = cryptoPortfolioBeijingDate();
    // 即使事件循环延迟，publisher只能读取目标截止时点的历史证据，不能拿现在的价格倒填。
    void runCryptoPortfolioCloseCandidates(new Date(), date).finally(() => scheduleRetry(date));
    scheduleDaily();
  }, millisecondsUntilNextCryptoPortfolioClose());
  dailyTimer.unref?.();
}

export function startCryptoPortfolioScheduler(): void {
  if (liveTimer || dailyTimer) return;
  void refreshLive();
  liveTimer = setInterval(() => { void refreshLive(); }, LIVE_INTERVAL_MS);
  liveTimer.unref?.();
  scheduleDaily();
  void runCryptoPortfolioCloseCandidates().finally(() => scheduleRetry(cryptoPortfolioBeijingDate()));
}
