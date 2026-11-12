// ⑯ はんいを指定：自動で見つからなかったQRを、指でかこむ／四角でえらぶ → その範囲だけ拡大・補正して読む
import { decodeRegion } from '../qr.js';
import { h, icon, openOverlay, toast, busy } from '../ui.js';

// canvas: 元画像, imgUrl: 表示用URL, found: すでに見つかっているQR（番号つきの枠で表示）
// 戻り値: 新しく読めたQRの配列（キャンセル時は []）
export function openRange({ canvas, imgUrl, found }) {
  return new Promise((resolve) => {
    let mode = 'lasso';
    let pts = [];          // 画面上の座標（inner 要素基準）
    let drawing = false;

    const img = h('img', { src: imgUrl, alt: '取り込んだ画像' });
    const cv = h('canvas');
    const inner = h('div', { class: 'range-inner' }, img, cv);
    const stage = h('div', { class: 'range-stage' }, inner);
    const seg = h('div', { class: 'seg' });

    const closeWith = (v) => { close(); resolve(v); };

    function layoutBoxes() {
      inner.querySelectorAll('.box').forEach((b) => b.remove());
      const sx = img.clientWidth / canvas.width, sy = img.clientHeight / canvas.height;
      found.forEach((r, i) => inner.append(h('div', {
        class: 'box',
        style: `left:${r.box.x * sx}px;top:${r.box.y * sy}px;width:${r.box.w * sx}px;height:${r.box.h * sy}px`,
      }, h('b', {}, i + 1))));
      const dpr = window.devicePixelRatio || 1;
      cv.width = img.clientWidth * dpr; cv.height = img.clientHeight * dpr;
      paint();
    }
    function paint() {
      const ctx = cv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (pts.length < 2) return;
      ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeStyle = '#E85A9B'; ctx.fillStyle = 'rgba(255,126,185,.18)';
      ctx.beginPath();
      if (mode === 'rect') {
        const [a, b] = [pts[0], pts[pts.length - 1]];
        ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      } else {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        if (!drawing) ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
    }
    const pos = (e) => { const r = inner.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drawing = true; pts = [pos(e)]; paint(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); if (mode === 'rect') pts[1] = p; else pts.push(p); paint(); });
    const end = () => { drawing = false; paint(); };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    function drawSeg() {
      seg.replaceChildren(
        h('button', { class: mode === 'lasso' ? 'on' : '', onclick: () => { mode = 'lasso'; pts = []; drawSeg(); paint(); } }, 'ゆびでかこむ'),
        h('button', { class: mode === 'rect' ? 'on' : '', onclick: () => { mode = 'rect'; pts = []; drawSeg(); paint(); } }, 'しかくでえらぶ'));
    }

    async function read() {
      if (pts.length < 2) { toast('QRのまわりをかこんでね'); return; }
      // かこんだ線の外接矩形 → 元画像の座標へ
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const k = canvas.width / img.clientWidth;
      const rect = { x: Math.min(...xs) * k, y: Math.min(...ys) * k, w: (Math.max(...xs) - Math.min(...xs)) * k, h: (Math.max(...ys) - Math.min(...ys)) * k };
      const recs = await busy('よみとり中…', () => decodeRegion(canvas, rect));
      const known = new Set(found.map((r) => r.text));
      const fresh = recs.filter((r) => !known.has(r.text));
      if (fresh.length) { toast(`${fresh.length}こ よめたよ`); closeWith(fresh); }
      else if (recs.length) toast('そのQRはもう見つかっているよ');
      else toast('よめなかった… QRがぜんぶ入るように、すこし大きめにかこんでね');
    }

    drawSeg();
    const close = openOverlay(() => h('div', { class: 'screen' },
      h('header', { class: 'hdr' },
        h('button', { class: 'icon-btn', 'aria-label': 'もどる', onclick: () => closeWith([]) }, icon('back')),
        h('h1', { class: 'title' }, 'はんいをしてい')),
      h('p', { style: 'margin:0;font-size:14px' }, '見つからなかったQRを 指でぐるっとかこんでね'),
      stage,
      h('div', { style: 'display:flex;gap:12px;align-items:center' }, seg,
        h('button', { class: 'icon-btn', style: 'width:56px;height:56px;border-radius:28px', 'aria-label': 'やりなおし', onclick: () => { pts = []; paint(); } }, icon('undo'))),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn primary block', onclick: read }, 'このはんいで よみとる'),
    ));
    if (img.complete) requestAnimationFrame(layoutBoxes); else img.addEventListener('load', layoutBoxes);
    window.addEventListener('resize', layoutBoxes, { once: true });
  });
}
