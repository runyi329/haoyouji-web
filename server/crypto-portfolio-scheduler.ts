/** 应用拥有的37号数字币调度；只在原应用启动后显式开启，无模块导入副作用。 */
import { publishCryptoPortfolioSnapshots, refreshCryptoPortfolioIntradaySnapshots, type CryptoPortfolioPublicationResult } from './crypto-portfolio-settlement';
import { warmAllStockTagCalendarResults } from './ledger-stock-portfolio';
import { cryptoPortfolioBeijingDate, cryptoPortfolioCandidateDates, cryptoPortfolioCutoffAt, millisecondsUntilNextCryptoPortfolioClose } from '../shared/crypto-portfolio-policy';

const LIVE_INTERVAL_MS = 5_000;
const RETRY_INTERVAL_MS = 5 * 60 * 1_000;
const RETRY_WINDOW_MS = 3 * 60 * 60 * 1_000;
const MAX_RETRY_ATTEMPTS = RETRY_WINDOW_MS / RETRY_INTERVAL_MS;
const MAX_FAILURE_DIAGNOSTICS = 64;
let liveTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let liveInFlight = false;
let closeInFlight = false;
let retryState: { date: string; attempts: number } | null = null;
let diagnosticDate = '';
const failureDiagnostics = new Set<string>();

/** No raw exceptions/payloads/credentials; at most 64 distinct bounded records per Beijing day.
 * Repeated same scope/date/reason/missing-symbol failures are intentionally silent.
 */
function warnFailure(failure: { categoryId: number | null; snapshotDate: string; reason: string; missingSymbols?: string[] }): void {
  const today = cryptoPortfolioBeijingDate();
  if (diagnosticDate !== today) { diagnosticDate = today; failureDiagnostics.clear(); }
  const diagnostic = { scope: { ledgerId: 37, categoryId: failure.categoryId }, date: failure.snapshotDate,
    reason: failure.reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80),
    missingSymbols: Array.from(new Set((failure.missingSymbols ?? []).filter(s => typeof s === 'string').map(s => s.slice(0, 64)))).sort().slice(0, 20) };
  const key = JSON.stringify(diagnostic);
  if (failureDiagnostics.has(key) || failureDiagnostics.size >= MAX_FAILURE_DIAGNOSTICS) return;
  failureDiagnostics.add(key);
  console.warn('[37数字币日结] 未发布，保留缺证据状态', diagnostic);
}
function diagnoseResult(result: CryptoPortfolioPublicationResult, snapshotDate: string): void {
  for (const failure of (result.failures ?? []).slice(0, MAX_FAILURE_DIAGNOSTICS)) {
    warnFailure({ categoryId: Number.isSafeInteger(failure.categoryId) ? failure.categoryId : null,
      snapshotDate, reason: failure.reason, missingSymbols: failure.missingSymbols });
  }
  // A skipped return without per-category evidence must not disappear silently.
  if (result.skipped > 0 && !result.failures?.length) warnFailure({ categoryId: null, snapshotDate, reason: 'publication_skipped_without_reason' });
}

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
      let failed = false;
      try {
        const result = await publishCryptoPortfolioSnapshots({ snapshotDate });
        diagnoseResult(result, snapshotDate);
        // Activation-date skips without failures need no retry; explicit category failures do.
        failed = !!result.failures?.length;
        // 缺价、缺FX不算发布成功；只在真实新增日结后刷新派生缓存。
        if (result.published > 0) {
          try { await warmAllStockTagCalendarResults(); }
          catch { warnFailure({ categoryId: null, snapshotDate, reason: 'derived_cache_warm_failed' }); }
        }
      } catch {
        failed = true;
        warnFailure({ categoryId: null, snapshotDate, reason: 'publication_failed' });
      }
      if (failed) scheduleRetry(snapshotDate);
      else if (retryState?.date === snapshotDate && retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    }
  } finally { closeInFlight = false; }
}

function scheduleRetry(date: string): void {
  const now = Date.now();
  const cutoff = cryptoPortfolioCutoffAt(date).getTime();
  if (retryTimer || cryptoPortfolioBeijingDate() !== date || now < cutoff || now + RETRY_INTERVAL_MS > cutoff + RETRY_WINDOW_MS) return;
  if (retryState?.date !== date) retryState = { date, attempts: 0 };
  if (retryState.attempts >= MAX_RETRY_ATTEMPTS) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (cryptoPortfolioBeijingDate() !== date || Date.now() > cutoff + RETRY_WINDOW_MS || retryState?.date !== date) return;
    retryState.attempts++;
    // Only another failure schedules the next attempt; success/immutable short-circuit stops.
    void runCryptoPortfolioCloseCandidates(new Date(), date);
  }, RETRY_INTERVAL_MS);
  retryTimer.unref?.();
}

function scheduleDaily(): void {
  dailyTimer = setTimeout(() => {
    dailyTimer = null;
    const date = cryptoPortfolioBeijingDate();
    // 即使事件循环延迟，publisher只能读取目标截止时点的历史证据，不能拿现在的价格倒填。
    void runCryptoPortfolioCloseCandidates(new Date(), date);
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
  void runCryptoPortfolioCloseCandidates();
}
