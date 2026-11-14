// 画面づくりの共通部品。ユーザーの入力した文字は必ず textContent 経由で入れる（innerHTML に入れない）
import { SERIES, seriesOf, cachedCatalogImg, catalogImg } from './catalog.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
// 中身を入れかえる（配列・null をまとめて扱える replaceChildren）
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// 線のアイコン（固定の文字列なので innerHTML でOK）
const P = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h4v-6h4v6h4V10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z" fill="#FFC94D" stroke="none"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3.1 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.8 0 6 3.9 4.5 7.3C19.5 16.4 12 21 12 21z" fill="currentColor" stroke="none"/>',
  heartLine: '<path d="M12 20s-7.2-4.4-9.2-8.8C1.4 8 3.4 4.8 6.9 4.8c2 0 3.5 1.1 5.1 3 1.6-1.9 3.1-3 5.1-3 3.5 0 5.5 3.2 4.1 6.4C19.2 15.6 12 20 12 20z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  dress: '<path d="M9 3l3 2 3-2 2 4-2 2 4 12H5l4-12-2-2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2"/>',
  grip: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-3.7L4 9M4 4v5h5M4 13a8 8 0 0 0 14.7 3.7L20 15M20 20v-5h-5"/>',
  undo: '<path d="M4 4v6h6"/><path d="M4.5 14a8 8 0 1 0 2-8.5L4 10"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};
export function icon(name, extra = '') {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] || ''}</svg>`;
  return span.firstChild;
}

// ---- 画面遷移 ----
export const go = (path) => { location.hash = '#' + path; };
export const back = () => { if (history.length > 1) history.back(); else go('/'); };

// ヘッダー：もどる(または閉じる)・タイトル・右側のボタン・ホーム
export function header({ title, sub, backIcon = 'back', onBack = back, right = [], home = true, center = false, titleFree = false }) {
  const titleEl = sub
    ? h('div', { class: 'title-wrap' }, h('div', { class: 'sub' }, sub), h('h1', { class: 'title' + (titleFree ? ' free-font' : '') }, title))
    : h('h1', { class: 'title' + (center ? ' center' : '') + (titleFree ? ' free-font' : '') }, title);
  return h('header', { class: 'hdr' },
    h('button', { class: 'icon-btn', 'aria-label': backIcon === 'close' ? 'とじる' : 'もどる', onclick: onBack }, icon(backIcon)),
    titleEl,
    ...right,
    home ? h('button', { class: 'icon-btn', 'aria-label': 'ホーム', onclick: () => go('/') }, icon('home')) : null,
  );
}

// ---- トースト・処理中表示 ----
let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
export async function busy(msg, fn) {
  const el = h('div', { class: 'busy' }, msg);
  document.body.append(el);
  try { return await fn(); } finally { el.remove(); }
}

// ---- ファイル選択（画像・カメラ・JSON・フォント） ----
export function pickFile({ accept = 'image/*', capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    // display:none だと iPhone で選択メニューが開かないことがあるので、画面の外に置いて見えなくする
    const input = h('input', { type: 'file', accept, capture: capture ? 'environment' : null, multiple: multiple || null, style: 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0' });
    input.addEventListener('change', () => { resolve(multiple ? [...input.files] : input.files[0] || null); input.remove(); });
    // キャンセル時に change が来ないブラウザがあるが、その場合は何もしないだけなので問題ない
    document.body.append(input);
    input.click();
  });
}

// タップで直接ひらくファイル選択ボタン（label の中に本物の input）。iPhone ではこれがいちばん確実
export function fileButton({ cls = 'btn', label, accept = 'image/*', capture = false, multiple = false, onFiles }) {
  const input = h('input', { type: 'file', accept, capture: capture ? 'environment' : null, multiple: multiple || null, class: 'drop-input',
    onchange: () => { const fs = [...input.files]; input.value = ''; if (fs.length) onFiles(fs); } });
  return h('label', { class: cls + ' file-btn', role: 'button' }, input, label);
}

// ---- 長押し（一覧で長押し → 詳細・編集） ----
export function onPress(el, { tap, long }) {
  let timer, longFired = false, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    longFired = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { longFired = true; navigator.vibrate?.(15); long?.(); }, 500);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', (e) => { if (longFired) { e.preventDefault(); e.stopPropagation(); return; } tap?.(e); });
}

// ---- コーデ画像（無ければ「画像なし」） ----
export const BG = ['#FFE0EE', '#DFF0FF', '#EDE3FF', '#DDF6EF', '#FFF4D6'];
const urlCache = new WeakMap();
export function blobUrl(blob) {
  if (!(blob instanceof Blob)) return null;
  if (!urlCache.has(blob)) urlCache.set(blob, URL.createObjectURL(blob));
  return urlCache.get(blob);
}
// フレンドの写真：たて長・よこ長どちらも枠に全体をおさめ（contain）、すき間には同じ写真をぼかして敷く
export function photoBox(blobOrSrc, alt = '') {
  const src = typeof blobOrSrc === 'string' ? blobOrSrc : blobUrl(blobOrSrc);
  return h('div', { class: 'photo-box' },
    h('img', { class: 'blur', src, alt: '', 'aria-hidden': 'true' }),
    h('img', { class: 'main', src, alt }));
}

export function thumb(item, idx = 0, { noImgText = true } = {}) {
  if (item?.kind === 'friend' && item.photo instanceof Blob) {
    const el = photoBox(item.photo);
    el.classList.add('thumb');
    return el;
  }
  // 公式リストのコーデなら公式の全身画像を優先。フレンドは本人の写真（取り込んだ画像）を優先
  const catId = item?.kind !== 'friend' ? item?.catalogId : null;
  const own = blobUrl(item?.image);
  const make = (src) => {
    if (src) return h('div', { class: 'thumb', style: `background:${BG[idx % BG.length]}` }, h('img', { src, alt: '', loading: 'lazy' }));
    if (noImgText) return h('div', { class: 'thumb noimg' }, icon('dress', 'class="dress"'), '画像なし');
    return h('div', { class: 'thumb', style: `background:${BG[idx % BG.length]}` }, icon('dress', 'class="dress"'));
  };
  const hit = cachedCatalogImg(catId);
  if (!catId || hit !== undefined) return make(hit || own);
  // まだ読んでいない公式画像は、あとから差しかえる
  const el = make(own);
  catalogImg(catId).then((src) => { if (src) el.replaceWith(make(src)); });
  return el;
}

// 一覧・コーデ名えらびの絞り込み：シリーズ（2種類以上あるときだけ）と だん のプルダウンを横に1段。
// （チップを並べると画面がせまくなるので、プルダウンにしている）
// 絞り込みが変わると onChange() を呼ぶ。test(it) で当てはまるか判定する。extra() はその下の行に足すチップ
export function danFilter(list, onChange, { extra = null } = {}) {
  const st = { series: 'all', dan: 'all' };
  const seriesHere = SERIES.filter(([k]) => list.some((it) => seriesOf(it) === k));
  const el = h('div', { class: 'dan-filter' });
  const select = (label, value, opts, set) => h('select', { class: 'select', 'aria-label': label,
    onchange: (e) => { set(e.target.value); draw(); onChange(); } },
    opts.map(([v, l]) => h('option', { value: v, selected: String(value) === String(v) ? 'selected' : null }, l)));
  function draw() {
    const inSeries = list.filter((it) => st.series === 'all' || seriesOf(it) === st.series);
    const dans = [...new Set(inSeries.map((it) => it.dan).filter(Boolean))].sort((a, b) => b - a);
    if (st.dan !== 'all' && !dans.includes(st.dan)) st.dan = 'all';
    const more = extra ? [extra()].flat(Infinity).filter(Boolean) : [];
    fill(el,
      h('div', { class: 'dan-selects' },
        seriesHere.length > 1 ? select('シリーズ', st.series, [['all', 'シリーズ：ぜんぶ'], ...seriesHere], (v) => { st.series = v; }) : null,
        dans.length ? select('だん', st.dan, [['all', 'だん：ぜんぶ'], ...dans.map((d) => [d, `${d}だん`])], (v) => { st.dan = v === 'all' ? 'all' : Number(v); }) : null),
      more.length ? h('div', { class: 'chips' }, more) : null);
  }
  draw();
  return {
    el, redraw: draw,
    test: (it) => (st.series === 'all' || seriesOf(it) === st.series) && (st.dan === 'all' || it.dan === st.dan),
  };
}

// 名前の表示：公式リストから選んだ名前だけ見出しフォント(うたミン)、自由入力は本文フォント
export const nameClass = (item) => (item?.nameSource === 'catalog' ? '' : 'free-font');

export const KIND = { coord: 'コーデ', chance: 'チャンス', friend: 'フレンド', save: 'セーブ' };
export const LIST_TITLE = { coord: 'コーデいちらん', chance: 'チャンスコード', friend: 'フレンドコード' };

export const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

// ---- 全画面オーバーレイ・下から出るシート ----
export function openOverlay(build) {
  const root = document.getElementById('overlay-root');
  const wrap = h('div', { class: 'fullover' });
  const close = () => wrap.remove();
  wrap.append(build(close));
  root.append(wrap);
  return close;
}
export function openSheet(build) {
  const root = document.getElementById('overlay-root');
  const bd = h('div', { class: 'backdrop' });
  const close = () => bd.remove();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  sheet.append(h('div', { class: 'grab' }), build(close));
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  bd.append(sheet);
  root.append(bd);
  return close;
}

// QR表示中は画面を消さない（Screen Wake Lock。iOS 16.4+ / ホーム画面アプリは 18.4+）
let wakeLock = null;
let wantAwake = false;
// アプリを一度裏に回すとロックが外れるので、戻ってきたら取り直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) keepAwake(true);
});
export async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* 未対応・バックグラウンド時は無視 */ }
}
