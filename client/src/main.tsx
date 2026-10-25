import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import "./styles/red-white-dual-engine.css";
import { restoreToken } from "@/lib/tokenStorage";
import { clearLedgerViewAsState } from "@/lib/authIdentity";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 0,
    },
  },
});

// 防抖锁：防止多个 API 同时失败时触发多次跳转（如 batch 请求中多个接口同时返回 401）。
// 还必须先二次核验 auth.me：某个页面级接口偶发 401 不等于当前登录会话已失效。
// 否则管理员在米伴等子项目切换路由时，会被一次背景请求错误直接带到登录页。
let _unauthorizedRedirectTimer: ReturnType<typeof setTimeout> | null = null;
let _sessionValidationInFlight: Promise<void> | null = null;

const cancelPendingUnauthorizedRedirect = () => {
  if (_unauthorizedRedirectTimer) {
    window.clearTimeout(_unauthorizedRedirectTimer);
    _unauthorizedRedirectTimer = null;
  }
};

// 登录成功后取消旧的“会话失效”延迟跳转，避免移动端请求竞态覆盖新会话。
if (typeof window !== "undefined") {
  window.addEventListener("haoyouji:session-restored", cancelPendingUnauthorizedRedirect);
}

const redirectToLogin = () => {
  if (typeof window === "undefined") return;

  const loginUrl = getLoginUrl();
  if (window.location.pathname === loginUrl || _unauthorizedRedirectTimer) return;

  console.log('[Auth] 会话已确认失效，跳转登录页');
  toast.error('登录已过期，请重新登录', { duration: 3000 });
  _unauthorizedRedirectTimer = setTimeout(() => {
    _unauthorizedRedirectTimer = null;
    // 登录失效后不能保留账本代看身份，否则重新登录仍会被旧用户视角覆盖。
    clearLedgerViewAsState();
    // 带上 from 参数，登录后跳回原页面（米拌等子项目登录后可返回）
    const from = encodeURIComponent(window.location.pathname);
    const loginWithFrom = `${loginUrl}?from=${from}`;
    window.history.pushState(null, '', loginWithFrom);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, 1500);
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
  if (_unauthorizedRedirectTimer || _sessionValidationInFlight) return;

  // protectedProcedure 可能因单次网络抖动、路由卸载时的旧请求或后台权限刷新而返回 401。
  // auth.me 是公开接口，会准确返回当前会话用户或 null；只有明确得到 null 才能登出。
  _sessionValidationInFlight = (async () => {
    try {
      const currentUser = await trpcClient.auth.me.query();
      if (currentUser) {
        cancelPendingUnauthorizedRedirect();
        console.warn('[Auth] 背景接口返回未授权，但当前会话仍有效；保留登录状态。');
        return;
      }
      redirectToLogin();
    } catch (validationError) {
      // 网络错误或临时服务异常时不能把用户误登出，保留当前会话，等待后续请求恢复。
      console.warn('[Auth] 会话二次核验未完成，暂不退出登录。', validationError);
    } finally {
      _sessionValidationInFlight = null;
    }
  })();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// 共享 fetch：注入 token / viewAs 头，供 batch 与非 batch 两条 link 复用。
// 热预览会使用临时 HTTPS 域名；部分移动 WebView 对相对 tRPC 地址的单独请求
// 会抛出 “The string did not match the expected pattern”。统一先解析成当前站点绝对地址。
const trpcEndpoint = typeof window === "undefined"
  ? "/api/trpc"
  : new URL("/api/trpc", window.location.origin).toString();

const trpcFetch: typeof globalThis.fetch = (input, init) => {
  // iOS / 微信 WebView 在进程恢复瞬间可能暂时拒绝 localStorage；此时继续
  // 使用 HttpOnly Cookie 认证，而不是让 fetch 在请求发出前直接失败。
  let rawToken: string | null = null;
  try {
    rawToken = localStorage.getItem('auth-token');
  } catch (error) {
    console.warn('[Auth] Unable to read local token; falling back to cookie session.', error);
  }
  // 只接受标准 JWT 格式（三段 base64url，不含控制字符/换行）
  const JWT_RE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*$/;
  const token = rawToken && JWT_RE.test(rawToken.trim()) ? rawToken.trim() : null;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    try {
      document.cookie = `app_session_id=${token}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
    } catch (e) {}
  }
  // 账本页切换到钱包/明细页时，旧页面的卸载清理可能会先移除 sessionStorage。
  // 因此优先使用 URL 中显式携带的 viewAs，确保 /wallet?viewAs=... 请求仍以被查看成员身份读取；
  // 服务端会再次校验真实管理员角色和目标用户，前端参数不能提升权限。
  let viewAsUserId: string | null = null;
  try {
    const urlViewAs = new URLSearchParams(window.location.search).get('viewAs');
    viewAsUserId = urlViewAs && /^\d+$/.test(urlViewAs) ? urlViewAs : sessionStorage.getItem('view-as-user-id');
  } catch {
    viewAsUserId = sessionStorage.getItem('view-as-user-id');
  }
  if (viewAsUserId && /^\d+$/.test(viewAsUserId)) {
    headers.set('x-view-as-user-id', viewAsUserId);
  }
  // 备注等关键写操作需要关联到当前浏览器访问会话。该 UUID 仅用作审计线索，
  // 不参与认证或授权；服务端仍会校验其归属的真实登录用户。
  try {
    let sessionOwnerId: string | null = null;
    if (token) {
      const payloadPart = token.split('.')[1];
      const encodedPayload = payloadPart ? payloadPart.replace(/-/g, '+').replace(/_/g, '/') : '';
      const payload = encodedPayload ? JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '='))) : null;
      const userId = Number(payload?.userId ?? payload?.sub ?? 0);
      if (Number.isInteger(userId) && userId > 0) sessionOwnerId = String(userId);
    }
    if (!sessionOwnerId && viewAsUserId && /^\d+$/.test(viewAsUserId)) sessionOwnerId = viewAsUserId;
    const informationSession = sessionOwnerId
      ? sessionStorage.getItem(`haoyouji-information-collection-session:${sessionOwnerId}`)
      : null;
    if (informationSession && /^[A-Za-z0-9-]{12,96}$/.test(informationSession)) {
      headers.set('x-information-collection-session', informationSession);
    }
  } catch (e) {}
  // 牙伴多门店：注入当前选中门店 tenant_id（首页切店时写入 localStorage）
  // 后端据此隔离顾客等业务数据；未设置时后端回退到用户的默认门店
  try {
    const curTenant = localStorage.getItem('yaban_current_tenant');
    if (curTenant && /^\d+$/.test(curTenant)) {
      headers.set('x-yaban-tenant', curTenant);
    }
  } catch (e) {}
  const resolvedInput = typeof input === "string" && input.startsWith("/") && typeof window !== "undefined"
    ? new URL(input, window.location.origin).toString()
    : input;
  return globalThis.fetch(resolvedInput, {
    ...(init ?? {}),
    headers,
    credentials: "include",
    cache: "no-store",
  });
};

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      // 影像上传等大体积请求不走 batch，避免多条合并后超体积导致整批失败。
      // 股票账户页在移动热预览中也单独请求，避免 WebView 解析合并请求 URL 时失败。
      // 共同拥有者订单保存也必须独立发出：编辑页同时有行情、担保和成员读取请求，
      // 手机 WebView 若把保存与任一慢查询合并，会一直停在“提交中”且保存请求根本未到达服务端。
      condition(op) {
        return op.path === "ledger.funderUpdateParticipantOrder"
          || op.path === "ledger.t0CreatePayoutLog"
          || op.path === "ledger.t0UpdatePayoutLog"
          || op.path === "ledger.t0DeletePayoutLog"
          || op.path === "yabanCustomer.uploadMedia"
          || op.path === "ledger.getStockTagPortfolio"
          || op.path === "ledger.getStockTagPublicPortfolio"
          || op.path === "ledger.getMyStockTagParticipantPortfolio"
          || op.path === "ledger.getStockTagDailySnapshots"
          || op.path === "ledger.getStockLotParticipationMatrix";
      },
      true: httpLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch }),
      false: httpBatchLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch }),
    }),
  ],
});

/**
 * 启动流程：
 * 1. 先执行三层 token 恢复（localStorage → Cookie → IndexedDB）
 * 2. 恢复完成后再挂载 React，确保 tRPC 第一个请求就能携带正确的 token
 *
 * 解决微信安卓 WebView 上滑关闭后 localStorage 被清空的问题
 */
async function bootstrap() {
  // 尝试从三层存储中恢复 token。个别移动 WebView 的 IndexedDB 可能长期不回调，
  // 不能因此阻塞整站 React 挂载；本地与 Cookie 恢复本身是同步路径，超时后直接继续。
  const recovered = await Promise.race<string | null>([
    restoreToken().catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2_500)),
  ]);
  if (recovered) {
    console.log('[Auth] Token 恢复成功，无需重新登录');
  } else {
    console.log('[Auth] 未找到有效 token，需要登录');
  }

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <App />
      </trpc.Provider>
    </QueryClientProvider>
  );
}

bootstrap();

// PWA 仅在生产环境启用；开发环境自动清理旧缓存，避免调试时持续加载旧代码。
// 稳定预览同样清理 Service Worker：其接管页面时会主动导航，可能打断图片选择或表单填写。
const isStablePreview = import.meta.env.VITE_MANUS_STABLE_PREVIEW === 'true';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD && !isStablePreview) {
      let refreshingForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshingForUpdate) return;
        refreshingForUpdate = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('[PWA] Service Worker 注册成功:', registration.scope);
          void registration.update();
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] 新版本可用，刷新页面以更新');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[PWA] Service Worker 注册失败:', error);
        });
      return;
    }

    // 本地开发：注销当前域名的旧 Service Worker，并只清理脉动自己的 PWA 缓存。
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    );
    if ('caches' in window) {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('maidong-cache-'))
            .map((key) => caches.delete(key))
        )
      );
    }
  });
}
