import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "ai-stock-favorites:v1:user:";
const CHANGE_EVENT = "ai-stock-favorites:changed";
const CODE_PATTERN = /^\d{6}\.(SH|SZ|BJ)$/;
const MAX_FAVORITES = 2000;
const MAX_STORED_LENGTH = 64 * 1024;
const EMPTY_CODES: ReadonlySet<string> = new Set<string>();

type Snapshot = {
  key: string | null;
  favoriteCodes: ReadonlySet<string>;
  ready: boolean;
};

function emptySnapshot(key: string | null): Snapshot {
  return { key, favoriteCodes: EMPTY_CODES, ready: false };
}

function isStockCode(value: unknown): value is string {
  return typeof value === "string" && value.length === 9 && CODE_PATTERN.test(value);
}

function readSnapshot(key: string): Snapshot {
  let raw: string | null;
  try {
    if (typeof window === "undefined") return emptySnapshot(key);
    raw = window.localStorage.getItem(key);
  } catch {
    return emptySnapshot(key);
  }

  const favoriteCodes = new Set<string>();
  // 坏数据只在读取时过滤，不因挂载/登录自动重写本机配置。
  if (raw && raw.length <= MAX_STORED_LENGTH) {
    try {
      const values: unknown = JSON.parse(raw);
      if (Array.isArray(values)) {
        for (const value of values) {
          if (isStockCode(value)) favoriteCodes.add(value);
          if (favoriteCodes.size >= MAX_FAVORITES) break;
        }
      }
    } catch {
      // 损坏的 JSON 视为空收藏；存储本身仍然可用。
    }
  }
  return { key, favoriteCodes, ready: true };
}

/** 登录用户的本机收藏；不调用接口、不写生产数据库。 */
export function useAIStockFavorites(userId?: number | null): {
  favoriteCodes: ReadonlySet<string>;
  toggleFavorite: (tsCode: string) => boolean;
  ready: boolean;
} {
  const key =
    typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0
      ? `${KEY_PREFIX}${userId}`
      : null;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(null));

  useEffect(() => {
    if (!key || typeof window === "undefined") {
      setSnapshot(emptySnapshot(key));
      return;
    }

    const refresh = () => setSnapshot(readSnapshot(key));
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        // 隐私设置可能在订阅后变化，refresh 会安全处理读取失败。
      }
      refresh();
    };

    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const toggleFavorite = useCallback((tsCode: string): boolean => {
    if (!key || !isStockCode(tsCode) || typeof window === "undefined") return false;
    // 每次点击重读，避免同页多个实例或跨标签页基于旧 Set 覆盖数据。
    const current = readSnapshot(key);
    if (!current.ready) return false;
    const next = new Set(current.favoriteCodes);
    if (next.has(tsCode)) {
      next.delete(tsCode);
    } else {
      if (next.size >= MAX_FAVORITES) return false;
      next.add(tsCode);
    }
    try {
      window.localStorage.setItem(key, JSON.stringify([...next].sort()));
    } catch {
      // 配额/权限失败不更新内存，不向 UI 返回虚假成功。
      return false;
    }
    setSnapshot({ key, favoriteCodes: next, ready: true });
    window.dispatchEvent(new CustomEvent<string>(CHANGE_EVENT, { detail: key }));
    return true;
  }, [key]);

  // 在新用户 effect 执行前也不暴露上一用户的收藏。
  const visible = key && snapshot.key === key ? snapshot : emptySnapshot(key);
  return { favoriteCodes: visible.favoriteCodes, toggleFavorite, ready: visible.ready };
}
