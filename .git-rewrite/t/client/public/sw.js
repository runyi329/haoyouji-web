// Service Worker for 脉动 PWA
// 版本号：每次更新 SW 时需要修改此版本号以触发更新
const CACHE_VERSION = 'v2.2.0';
const CACHE_NAME = `maidong-cache-${CACHE_VERSION}`;

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
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 立即接管所有页面
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

  // index.html 和 / 路径：永远走网络，绝不缓存（防止部署后旧缓存导致白屏）
  if (NO_CACHE_PATHS.includes(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          // 网络完全断开时才用缓存兜底
          return caches.match(request);
        })
    );
    return;
  }

  // 静态资源：网络优先，失败时使用缓存（确保用户总是看到最新内容）
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 只缓存成功的 GET 请求（不缓存 HTML 文件）
        if (request.method === 'GET' && response.status === 200 && !url.pathname.endsWith('.html')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败时，尝试从缓存读取
        return caches.match(request);
      })
  );
});

// 消息事件：支持手动触发缓存更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
