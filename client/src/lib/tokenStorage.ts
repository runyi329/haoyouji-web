/**
 * tokenStorage.ts
 * 三层 token 持久化存储工具
 *
 * 存储优先级（写入时三层同时写，读取时按优先级回退）：
 *   1. localStorage    — 最快，但微信 WebView 上滑关闭后可能被清空
 *   2. Cookie          — 中等，微信 WebView 关闭后也可能丢失
 *   3. IndexedDB       — 最持久，微信 WebView 上滑关闭后大概率保留
 *
 * 使用场景：解决微信安卓小程序 WebView 上滑关闭后需要重新登录的问题
 */

const IDB_DB_NAME = 'haoyouji_auth';
const IDB_STORE_NAME = 'tokens';
const IDB_KEY = 'auth_token';
const COOKIE_NAME = 'app_session_id';
const LS_KEY = 'auth-token';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// ─── IndexedDB 操作 ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetToken(): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSetToken(token: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(token, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // 静默失败，不影响主流程
  }
}

export async function idbClearToken(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // 静默失败
  }
}

// ─── Cookie 操作 ──────────────────────────────────────────────────

export function cookieGetToken(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)app_session_id=([^;]+)/);
    if (match && match[1]) {
      const val = decodeURIComponent(match[1]);
      return val.length > 10 ? val : null;
    }
  } catch {}
  return null;
}

export function cookieSetToken(token: string): void {
  try {
    document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${ONE_YEAR_SECONDS}`;
  } catch {}
}

export function cookieClearToken(): void {
  try {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch {}
}

// ─── 登录凭据持久化（用于"保存登录信息"功能）────────────────────────

const CRED_KEY = 'saved_credentials';

/**
 * 保存用户名和密码到 IndexedDB（用于自动登录）
 * 密码以 base64 简单混淆存储（非加密，仅防止肉眼直读）
 */
export async function saveCredentials(username: string, password: string): Promise<void> {
  try {
    const db = await openDB();
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ username, password }))));
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(encoded, CRED_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // 静默失败
  }
}

/**
 * 读取保存的登录凭据
 */
export async function getSavedCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(CRED_KEY);
      req.onsuccess = () => {
        if (!req.result) { resolve(null); return; }
        try {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(req.result))));
          resolve(decoded);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 清除保存的登录凭据（用户手动退出时调用）
 */
export async function clearCredentials(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(CRED_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // 静默失败
  }
}

// ─── 统一接口 ─────────────────────────────────────────────────────

/**
 * 保存 token 到三层存储（localStorage + Cookie + IndexedDB）
 * 登录成功后调用
 */
export async function saveToken(token: string): Promise<void> {
  // 1. localStorage（同步，最快）
  try { localStorage.setItem(LS_KEY, token); } catch {}
  // 2. Cookie（同步）
  cookieSetToken(token);
  // 3. IndexedDB（异步，最持久）
  await idbSetToken(token);
}

/**
 * 清除三层存储中的 token
 * 退出登录时调用
 */
export async function clearToken(): Promise<void> {
  try { localStorage.removeItem(LS_KEY); } catch {}
  cookieClearToken();
  await idbClearToken();
}

/**
 * 启动时恢复 token：
 * 如果 localStorage 没有 token，依次尝试 Cookie → IndexedDB 恢复
 * 恢复成功后同步写回所有层
 *
 * 注意：此函数是异步的，调用方需要 await 后再初始化 tRPC client
 */
export async function restoreToken(): Promise<string | null> {
  // 第一层：localStorage 已有，无需恢复
  try {
    const lsToken = localStorage.getItem(LS_KEY);
    if (lsToken && lsToken.length > 10) {
      // localStorage 有效，顺便同步到其他层
      cookieSetToken(lsToken);
      idbSetToken(lsToken); // 异步，不等待
      return lsToken;
    }
  } catch {}

  // 第二层：尝试从 Cookie 恢复
  const cookieToken = cookieGetToken();
  if (cookieToken) {
    console.log('[Auth] 从 Cookie 恢复 token 到 localStorage');
    try { localStorage.setItem(LS_KEY, cookieToken); } catch {}
    idbSetToken(cookieToken); // 异步，不等待
    return cookieToken;
  }

  // 第三层：尝试从 IndexedDB 恢复
  const idbToken = await idbGetToken();
  if (idbToken && idbToken.length > 10) {
    console.log('[Auth] 从 IndexedDB 恢复 token 到 localStorage 和 Cookie');
    try { localStorage.setItem(LS_KEY, idbToken); } catch {}
    cookieSetToken(idbToken);
    return idbToken;
  }

  // 三层都没有，需要重新登录
  return null;
}
