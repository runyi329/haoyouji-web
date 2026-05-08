import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import "./styles/red-white-dual-engine.css";
import { restoreToken } from "@/lib/tokenStorage";

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

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  // token 过期或失效，提示用户并跳转到登录页
  const loginUrl = getLoginUrl();
  if (window.location.pathname !== loginUrl) {
    console.log('[Auth] Token 失效，跳转登录页');
    toast.error('登录已过期，请重新登录', { duration: 3000 });
    setTimeout(() => {
      window.history.pushState(null, '', loginUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 1500);
  }
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        // 从 localStorage 读取最新登录的 token（restoreToken 已在启动时写入）
        const token = localStorage.getItem('auth-token');
        const headers = new Headers(init?.headers);

        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          // 顺便同步到 Cookie，保持三层一致
          try {
            document.cookie = `app_session_id=${token}; path=/; max-age=${365 * 24 * 60 * 60}`;
          } catch (e) {}
        }

        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
          cache: "no-store",
        });
      },
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
  // 尝试从三层存储中恢复 token
  const recovered = await restoreToken();
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

// 注册 Service Worker 支持 PWA 功能
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker 注册成功:', registration.scope);
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
  });
}
