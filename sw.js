/* Service Worker — 离线可用 + 发版可更新
   策略：
   - 导航请求：network-first（保证新版本 HTML 及时生效，离线回退缓存页面）
   - 静态资源：network-first + 缓存回退（在线时永远拿最新代码，离线时用缓存兜底）
     ※ 不能用纯 cache-first：缓存名固定时，发版后老客户端会一直加载旧 app.js
   - 缓存名随版本变化：activate 时清理旧缓存
   - 纪律：若改回 cache-first（或任何"优先读缓存"策略），必须同时 bump CACHE 名，否则复发 HTML 与 JS 版本错配 */
const CACHE = 'quit-tracker-v2';
const ASSETS = [
  './',
  './index.html',
  './src/app.js',
  './manifest.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // 只清理自己前缀的旧缓存：GitHub Pages 项目站共享 origin，
      // 无差别清理会删掉同 origin 其他项目（如 subscription-manager）的缓存
      Promise.all(keys.filter((k) => k.startsWith('quit-tracker-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 只接管同源请求；跨源交给浏览器默认行为
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (err) { sameOrigin = false; }
  if (!sameOrigin) return;

  if (req.mode === 'navigate') {
    // 导航请求：网络优先，保证新版本代码能及时生效；离线时回退缓存页面
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // 静态资源：网络优先 + 缓存回退（两者兼顾"更新生效"与"离线可用"）
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
