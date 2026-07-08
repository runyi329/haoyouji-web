/**
 * 前端直接调用 Deribit 公开 API 的 React Hooks
 * 不经过服务器，浏览器直连 Deribit（公开接口支持 CORS）
 * 静态数据作为兜底，网络请求完成后自动更新
 */
import { useState, useEffect, useRef } from 'react';
import {
  DERIBIT_EXPIRIES_BTC,
  DERIBIT_EXPIRIES_ETH,
  DERIBIT_STRIKES_BTC,
  DERIBIT_STRIKES_ETH,
  DeribitExpiry,
} from './deribitStaticData';

const DERIBIT_BASE = 'https://www.deribit.com/api/v2/public';
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ===== 内存缓存（避免同一会话重复请求）=====
const _expiryCache: Record<string, { expiries: DeribitExpiry[]; fetchedAt: number }> = {};
const _strikesCache: Record<string, { strikes: number[]; fetchedAt: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10分钟

function parseDeribitInstruments(instruments: any[], currency: string) {
  const now = Date.now();
  const tsSet = new Set<number>(instruments.map((i: any) => i.expiration_timestamp));
  const expiries: DeribitExpiry[] = Array.from(tsSet).sort((a, b) => a - b).map(ts => {
    const dt = new Date(ts);
    const dd = dt.getUTCDate();
    const mm = dt.getUTCMonth() + 1;
    const yyyy = dt.getUTCFullYear();
    const dateStr = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    const diffDays = Math.ceil((ts - now) / (1000 * 60 * 60 * 24));
    const deribitLabel = `${dd}${MONTHS[mm-1]}${String(yyyy).slice(2)}`;
    return { dateStr, diffDays, deribitLabel, ts };
  });

  const byExpiry: Record<string, Set<number>> = {};
  for (const inst of instruments) {
    const ts = inst.expiration_timestamp;
    const dt = new Date(ts);
    const dd = dt.getUTCDate();
    const mon = MONTHS[dt.getUTCMonth()];
    const yy = String(dt.getUTCFullYear()).slice(2);
    const label = `${dd}${mon}${yy}`;
    if (!byExpiry[label]) byExpiry[label] = new Set();
    byExpiry[label].add(inst.strike);
  }
  const strikesMap: Record<string, number[]> = {};
  for (const [key, set] of Object.entries(byExpiry)) {
    strikesMap[key] = Array.from(set).sort((a, b) => a - b);
  }
  return { expiries, strikesMap };
}

// ===== useDeribitExpiries：获取到期日列表 =====
export function useDeribitExpiries(currency: 'BTC' | 'ETH') {
  const staticExpiries = currency === 'ETH' ? DERIBIT_EXPIRIES_ETH : DERIBIT_EXPIRIES_BTC;
  const [expiries, setExpiries] = useState<DeribitExpiry[]>(staticExpiries);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const cacheKey = `expiries:${currency}`;
    const cached = _expiryCache[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setExpiries(cached.expiries);
      setFetchedAt(cached.fetchedAt);
      setIsLive(true);
      return;
    }

    let cancelled = false;
    fetch(`${DERIBIT_BASE}/get_instruments?currency=${currency}&kind=option&expired=false`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const instruments: any[] = data.result || [];
        if (instruments.length === 0) return;
        const { expiries: liveExpiries } = parseDeribitInstruments(instruments, currency);
        const now = Date.now();
        _expiryCache[cacheKey] = { expiries: liveExpiries, fetchedAt: now };
        // 同时更新行权价缓存
        const { strikesMap } = parseDeribitInstruments(instruments, currency);
        for (const [label, strikes] of Object.entries(strikesMap)) {
          _strikesCache[`strikes:${currency}:${label}`] = { strikes, fetchedAt: now };
        }
        setExpiries(liveExpiries);
        setFetchedAt(now);
        setIsLive(true);
      })
      .catch(() => {
        // 网络失败，保持静态数据
      });

    return () => { cancelled = true; };
  }, [currency]);

  return { expiries, fetchedAt, isLive };
}

// ===== useDeribitStrikes：获取指定到期日的行权价列表 =====
export function useDeribitStrikes(currency: 'BTC' | 'ETH', deribitLabel: string) {
  const staticMap = currency === 'ETH' ? DERIBIT_STRIKES_ETH : DERIBIT_STRIKES_BTC;
  const staticStrikes = deribitLabel ? (staticMap[deribitLabel] ?? []) : [];
  const [strikes, setStrikes] = useState<number[]>(staticStrikes);

  useEffect(() => {
    if (!deribitLabel) { setStrikes([]); return; }

    // 先用静态数据
    setStrikes(staticMap[deribitLabel] ?? []);

    const cacheKey = `strikes:${currency}:${deribitLabel}`;
    const cached = _strikesCache[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setStrikes(cached.strikes);
      return;
    }

    // 如果 expiries 缓存已有（说明刚拉过），直接从里面取
    const expiryCacheKey = `expiries:${currency}`;
    const expiryCache = _expiryCache[expiryCacheKey];
    if (expiryCache && Date.now() - expiryCache.fetchedAt < CACHE_TTL) {
      // 行权价缓存应该也已经写入了
      const sc = _strikesCache[cacheKey];
      if (sc) { setStrikes(sc.strikes); return; }
    }

    let cancelled = false;
    fetch(`${DERIBIT_BASE}/get_instruments?currency=${currency}&kind=option&expired=false`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const instruments: any[] = data.result || [];
        if (instruments.length === 0) return;
        const now = Date.now();
        const { strikesMap } = parseDeribitInstruments(instruments, currency);
        for (const [label, s] of Object.entries(strikesMap)) {
          _strikesCache[`strikes:${currency}:${label}`] = { strikes: s, fetchedAt: now };
        }
        const liveStrikes = strikesMap[deribitLabel] ?? [];
        setStrikes(liveStrikes);
      })
      .catch(() => {
        // 保持静态数据
      });

    return () => { cancelled = true; };
  }, [currency, deribitLabel]);

  return strikes;
}

// ===== useDeribitGreeks：获取期权希腊字母 =====
export interface DeribitGreeks {
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  markPrice: number | null;
}

export function useDeribitGreeks(instrumentName: string | null | undefined): DeribitGreeks {
  const empty: DeribitGreeks = { iv: null, delta: null, gamma: null, theta: null, vega: null, markPrice: null };
  const [greeks, setGreeks] = useState<DeribitGreeks>(empty);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!instrumentName) { setGreeks(empty); return; }

    const fetchGreeks = () => {
      fetch(`${DERIBIT_BASE}/get_order_book?instrument_name=${instrumentName}&depth=1`)
        .then(r => r.json())
        .then(data => {
          const result = data.result;
          if (!result) return;
          const g = result.greeks || {};
          setGreeks({
            iv: result.mark_iv ?? null,
            delta: g.delta ?? null,
            gamma: g.gamma ?? null,
            theta: g.theta ?? null,
            vega: g.vega ?? null,
            markPrice: result.mark_price ?? null,
          });
        })
        .catch(() => {});
    };

    fetchGreeks();
    timerRef.current = setInterval(fetchGreeks, 30000); // 每30秒刷新

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [instrumentName]);

  return greeks;
}
