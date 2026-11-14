// オフラインでも即起動できるよう、アプリ本体を事前キャッシュする。
// ファイルを変更したら VERSION を上げること（古いキャッシュが消えて更新される）。
const VERSION = 'v12';
const SHELL = `shell-${VERSION}`;
// 同梱フォント（合計 8MB 近い）は使ったときにだけ取り、本体とは別のキャッシュに置いて版を上げても消さない
const FONTS = 'fonts-v2';

const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/qr.js', 'js/ui.js', 'js/fonts.js', 'js/catalog.js', 'js/sync.js',
  'js/screens/home.js', 'js/screens/library.js', 'js/screens/detail.js',
  'js/screens/view.js', 'js/screens/register.js', 'js/screens/range.js',
  'js/screens/picker.js', 'js/screens/save.js', 'js/screens/playlist.js',
  'js/screens/settings.js',
  'vendor/zxing-reader.js', 'vendor/zxing_reader.wasm', 'vendor/qrcode.mjs',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.origin !== location.origin) return;

  // 同梱フォントは一度読んだらキャッシュ優先（ゲーセンで電波がなくても表示できるように）
  if (url.pathname.includes('/fonts/') && url.pathname.endsWith('.woff2')) {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  // アプリ本体はキャッシュ優先。画面遷移(#付き)は index.html を返す
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match('index.html');
      return fetch(e.request);
    })
  );
});
