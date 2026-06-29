/* NetScope Pro — Service Worker
 * デプロイ更新時は、この VERSION と index.html 内の2箇所
 *   <meta name="app-version" content="...">  /  const APP_VERSION='...'
 * を同じ値に更新してください（3箇所一致）。
 */
const VERSION = '2026.06.29.1';
const CACHE = 'netscope-' + VERSION;

// オフライン用に事前キャッシュするアプリシェル（相対パス＝サブパス配信でも動作）
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 旧バージョンのキャッシュを削除
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // バージョンチェック要求は常にネットワーク（キャッシュを介さない）
  if (url.includes('_vcheck=')) return;

  // クロスオリジン（外部API・CDN・フォント・地図タイル等）は一切介入しない。
  // ※ ホスト名（例: *.github.io）と外部APIのドメイン名が衝突しないよう、
  //   部分文字列ではなくオリジン一致で厳密に判定する。
  let sameOrigin = false;
  try { sameOrigin = new URL(url).origin === self.location.origin; } catch (_) {}
  if (!sameOrigin) return;

  // HTMLドキュメント（ナビゲーション）はネットワーク優先:
  // オンライン時は常に最新版を取得 → デプロイ更新が即反映。オフライン時のみキャッシュにフォールバック。
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true })
            .then(r => r || caches.match('./index.html'))
            .then(r => r || caches.match('./'))
        )
    );
    return;
  }

  // 同一オリジンの静的アセット（アイコン等）はキャッシュ優先 + 背景更新
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ページからの即時更新指示（任意）
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
