// 画面の切り替え（#/path?query 形式のハッシュルーター）と起動処理
import { requestPersist } from './db.js';
import { warmUp } from './qr.js';
import { keepAwake, toast } from './ui.js';
import { syncNow, getSyncConfig, syncReady } from './sync.js';
import { loadHeadingFont } from './fonts.js';
import home from './screens/home.js';
import library from './screens/library.js';
import detail from './screens/detail.js';
import view from './screens/view.js';
import register from './screens/register.js';
import save from './screens/save.js';
import playlist from './screens/playlist.js';
import settings from './screens/settings.js';

const routes = [
  ['/', home],
  ['/library', library],     // ?kind=coord|chance|friend
  ['/item/:id', detail],
  ['/view', view],           // ?item=<id>&q=<QR番号> または ?play=1
  ['/register', register],
  ['/save', save],           // ?slot=1|2
  ['/playlist', playlist],
  ['/settings', settings],
];

const app = document.getElementById('app');
let leave = null;
let seq = 0;

function match(path) {
  for (const [pattern, fn] of routes) {
    const pp = pattern.split('/'), xs = path.split('/');
    if (pp.length !== xs.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(xs[i])), true) : p === xs[i]))) return [fn, params];
  }
  return [home, {}];
}

async function render() {
  const my = ++seq;
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const [fn, params] = match(path || '/');
  const ctx = { params, query: Object.fromEntries(new URLSearchParams(qs || '')), onLeave: null, rerender: render };
  if (leave) { try { leave(); } catch { /* 画面の後片付け失敗は無視 */ } leave = null; }
  keepAwake(false);
  document.getElementById('toast').classList.remove('show');
  document.getElementById('overlay-root').replaceChildren();
  try {
    const el = await fn(ctx);
    if (my !== seq) return; // 途中で別の画面に移った
    app.replaceChildren(el);
    leave = ctx.onLeave;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    app.textContent = 'エラーが起きました: ' + e.message;
  }
}

window.addEventListener('hashchange', render);
render();
requestPersist();
loadHeadingFont();
// 読み取りエンジンを先に温めておく（初回の読み取りを速くする）
setTimeout(warmUp, 800);

// 同期の設定があれば、開いたときに裏で同期する。電波が無いとき（ゲーセン）は何もしない
async function autoSync() {
  if (!navigator.onLine || !syncReady(await getSyncConfig())) return;
  try {
    const r = await syncNow();
    if (r.added || r.updated || r.removed) {
      toast(`同期したよ（ついか ${r.added}・こうしん ${r.updated}・けした ${r.removed}）`);
      // QR表示中・登録中は画面を作り直さない（表示が止まらないように）
      const p = location.hash.slice(1).split('?')[0] || '/';
      if (p === '/' || p.startsWith('/library')) render();
    }
  } catch (e) { console.warn('自動同期に失敗', e); }
}
setTimeout(autoSync, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 登録失敗', e));
}
