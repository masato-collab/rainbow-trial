/* ==========================================================================
 * Rainbow Trial — service-worker.js
 *
 * キャッシュ戦略: Cache First, Network Fallback
 *   - 初回 install でアプリの主要ファイル一式をプリキャッシュ
 *   - navigate 以外は cache-first、miss したら fetch してキャッシュ追加
 *   - navigate リクエストは network-first → fallback は index.html → さらに失敗で offline.html
 *
 * 通知:
 *   - postMessage 経由でクライアントから「通知表示」「スケジュール」を受け付ける
 *   - notificationclick では対応シグナル詳細画面を開くよう index.html に遷移
 *
 * バージョン管理:
 *   - CACHE_NAME を変更すると古いキャッシュを activate で一掃
 * ========================================================================== */

const CACHE_VERSION = 'v5.9.1-20260416-install-handler-labels';
const CACHE_NAME    = 'rainbow-trial-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  'index.html',
  'welcome.html',
  'offline.html',
  '404.html',
  'manifest.json',
  'css/style.css',
  'css/components.css',
  'css/chart.css',
  'js/app.js',
  'js/storage.js',
  'js/game-state.js',
  'js/notifications.js',
  'js/signals.js',
  'css/install.css',
  'js/device-detect.js',
  'js/home-install.js',
  'js/install-detector.js',
  'js/install-handler.js',
  'js/install-modal.js',
  'js/install-banner.js',
  'js/judgment.js',
  'js/chart.js',
  'js/trade.js',
  'data/scenarios.js',
  'data/scenario-templates.js',
  'data/price-baselines.json',
  'data/master-messages.js',
  'data/members-feed.js',
  'css/phase4.css',
  'css/finale.css',
  'js/master-message.js',
  'js/members-feed.js',
  'js/result-card.js',
  'js/final-screen.js',
  'js/phase4-hooks.js',
  'assets/master/hikari-avatar.svg',
  'terms.html',
  'privacy.html',
  'assets/logo.svg',
  'assets/favicon.svg',
  'assets/favicon-alert.svg',
  'assets/og-image.svg',
  'assets/icons/icon-72.png',
  'assets/icons/icon-96.png',
  'assets/icons/icon-128.png',
  'assets/icons/icon-144.png',
  'assets/icons/icon-152.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-384.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-192.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon-180.png'
];

/* ==========================================================================
   install: プリキャッシュ
   ========================================================================== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 個別 add で失敗しても続行(404 等に耐性)
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((e) => {
            console.warn('[SW] precache skip:', url, e.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ==========================================================================
   activate: 古いバージョンのキャッシュを削除
   ========================================================================== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k === CACHE_NAME ? null : caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ==========================================================================
   fetch: navigate / static で戦略を分ける
   ========================================================================== */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 外部ドメインは素通し(CoinGecko など)
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigateFallback(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    // 画像なら透明 PNG でフォールバック
    if (req.destination === 'image') {
      return new Response(
        Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), c => c.charCodeAt(0)),
        { headers: { 'Content-Type': 'image/png' } }
      );
    }
    throw e;
  }
}

async function navigateFallback(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (e) {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match('index.html');
    if (hit) return hit;
    const offline = await cache.match('offline.html');
    return offline || new Response('Offline', { status: 503 });
  }
}

/* ==========================================================================
   クライアント → SW: postMessage で通知要求を受ける
   payload 例:
     { type: 'show-notification', title, body, tag, data, icon, badge }
   ========================================================================== */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-notification') {
    const title = data.title || '🌈 Rainbow Trial';
    const options = {
      body:  data.body  || '',
      icon:  data.icon  || 'assets/icons/icon-192.png',
      badge: data.badge || 'assets/icons/icon-72.png',
      tag:   data.tag   || ('rainbow-' + Date.now()),
      data:  data.data  || {},
      vibrate: data.vibrate || undefined,
      requireInteraction: !!data.requireInteraction,
      silent: !!data.silent
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } else if (data.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

/* ==========================================================================
   notificationclick: 該当シグナル詳細画面を開く
   ========================================================================== */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || 'index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 既にアプリが開いていればフォーカス + 該当シグナルを開くメッセージ送信
      for (const c of clients) {
        if (c.url.includes(self.location.origin)) {
          c.focus();
          c.postMessage({ type: 'notification-click', signalId: data.signalId || null, url: targetUrl });
          return;
        }
      }
      // 開いていなければ新規タブ
      return self.clients.openWindow(targetUrl);
    })
  );
});
