// Service Worker for 脉动 PWA
// 版本号：每次更新 SW 时需要修改此版本号以触发更新
// 热预览必须立刻拿到最新界面模块；版本变化会让已打开的手机页面主动更新工作线程。
const CACHE_VERSION = 'v2.3.6';
const CACHE_NAME = `maidong-cache-${CACHE_VERSION}`;
const IS_MANUS_PREVIEW = /\.manus\.computer$/i.test(self.location.hostname);

// 需要缓存的静态资源（不缓存 index.html，避免部署后旧缓存导致白屏）
const STATIC_CACHE_URLS = [
  '/manifest.json',
  '/maidong-hyy.png',
];

// 永远不缓存的路径（HTML 入口文件必须始终从网络获取最新版本）
const NO_CACHE_PATHS = ['/', '/index.html'];

// API 请求不缓存，始终走网络
const API_CACHE_URLS = [];

// 安装事件：缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[Service Worker] 安装中...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] 缓存静态资源');
      return cache.addAll(STATIC_CACHE_URLS);
    }).then(() => {
      // 强制激活新的 Service Worker
      return self.skipWaiting();
    })
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 激活中...', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('maidong-cache-') && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 接管后不强制 navigate：iPhone/PWA 在弱网、后台恢复或资源尚未到齐时
      // 被二次导航会放大白屏风险。当前页面继续稳定运行，下次正常打开再加载新版入口。
      return self.clients.claim();
    })
  );
});

// 请求拦截：网络优先策略（Network First）
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }

  // API 请求：始终走网络，不缓存（避免用户切换后返回旧用户数据）
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Manus 热链接用于实时验收，不能让 Safari/PWA 用离线资源覆盖最新的 Vite 模块。
  if (IS_MANUS_PREVIEW) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // SPA 任意深层地址都实际返回 index.html。此前只按 .html 后缀判断，导致
  // /p/... 之类的导航页被误写入 Cache Storage，网络短暂失败时又回退到旧 bundle。
  // 所有导航/HTML 请求都必须 network-only，绝不使用旧入口兜底。
  const isNavigationRequest =
    request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (isNavigationRequest || NO_CACHE_PATHS.includes(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          return new Response(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>脉动</title><body style="margin:0;background:#f4f6f8;color:#334155;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"><main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center"><section><h1 style="font-size:17px;margin:0 0 8px">页面暂时无法连接</h1><p style="font-size:14px;line-height:1.7;color:#64748b;margin:0">请检查网络后重新连接</p><button onclick="location.reload()" style="margin-top:18px;min-height:40px;padding:0 18px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:600">重新连接</button></section></main></body></html>`, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        })
    );
    return;
  }

  // 只有带内容哈希的构建资源和明确预缓存的图标可离线回退；业务路由、图片
  // 和其他同源响应均只走网络，避免跨版本数据或入口被旧缓存覆盖。
  const isCacheableStaticAsset =
    url.pathname.startsWith('/assets/') || STATIC_CACHE_URLS.includes(url.pathname);

  // 静态资源：网络优先，失败时使用缓存（确保用户总是看到最新内容）
  event.respondWith(
    fetch(request)
      .then((response) => {
        const cacheControl = response.headers.get('cache-control') || '';
        if (
          request.method === 'GET' &&
          response.status === 200 &&
          isCacheableStaticAsset &&
          !cacheControl.includes('no-store')
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        if (isCacheableStaticAsset) {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response('Network error', { status: 504, statusText: 'Gateway Timeout' });
          });
        }
        return new Response('Network unavailable', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// 消息事件：支持手动触发缓存更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
