// ② QR表示：コーデ1件、またはプレイリストを順番に。スワイプ／まえ・つぎ で切り替え
import { db, getPlaylist, getSettings } from '../db.js';
import { qrSvg, partLabel } from '../qr.js';
import { h, fill, icon, back, header, keepAwake, KIND } from '../ui.js';

export default async function view(ctx) {
  const settings = await getSettings();
  const play = ctx.query.play === '1';
  let items;
  if (play) {
    const map = new Map((await db.all('items')).map((it) => [it.id, it]));
    items = (await getPlaylist()).map((id) => map.get(id)).filter(Boolean);
  } else {
    const it = await db.get('items', ctx.query.item);
    items = it ? [it] : [];
  }
  // QR 1つ = 1ステップ。プレイリストでは「次のパーツ → 次のコーデ」と続けて進む
  const steps = [];
  items.forEach((it, ii) => (it.qrs || []).forEach((_, qi) => steps.push({ it, ii, qi })));
  if (!steps.length) {
    return h('div', { class: 'screen' }, header({ title: 'QR表示', backIcon: 'close' }), h('div', { class: 'empty' }, '表示できるQRがないよ'));
  }

  let idx = 0;
  if (ctx.query.i) idx = Math.max(0, steps.findIndex((s) => s.ii === Number(ctx.query.i)));
  if (ctx.query.q) idx = Math.max(0, steps.findIndex((s) => s.qi === Number(ctx.query.q)));

  if (settings.keepAwake) keepAwake(true);
  ctx.onLeave = () => keepAwake(false);

  const root = h('div', { class: 'screen' });
  function draw() {
    const { it, ii, qi } = steps[idx];
    const qrs = it.qrs || [];
    const rec = qrs[qi];
    const nxt = steps[idx + 1];
    let nextLabel = 'おわり';
    if (nxt) nextLabel = nxt.it === it ? `つぎ：${partLabel(nxt.it.qrs[nxt.qi].part)}` : 'つぎのコーデ';

    const card = h('div', { class: 'qr-card' },
      qrSvg(rec, { label: `${it.name || ''} ${partLabel(rec.part)} のQRコード` }),
      h('span', { class: 'cap' }, qrs.length > 1 ? partLabel(rec.part) : (KIND[it.kind] || '')));
    swipe(card, () => move(1), () => move(-1));

    fill(root, 
      header({
        backIcon: 'close',
        sub: play ? `プレイリスト ${ii + 1} / ${items.length}` : KIND[it.kind],
        title: it.kind === 'friend' && it.friendName ? it.friendName : it.name || '（なまえなし）',
        titleFree: it.nameSource !== 'catalog' || it.kind === 'friend',
      }),
      qrs.length > 1
        ? h('div', { class: 'part-tabs' }, qrs.map((x, k) =>
          h('button', { class: 'chip soft' + (k === qi ? ' on' : ''), onclick: () => { idx = steps.findIndex((s) => s.it === it && s.qi === k); draw(); } }, partLabel(x.part))))
        : null,
      card,
      qrs.length > 1 ? h('div', { class: 'dots', 'aria-hidden': 'true' }, qrs.map((_, k) => h('span', { class: k === qi ? 'on' : '' }))) : null,
      h('div', { class: 'nav-btns' },
        h('button', { class: 'btn outline', disabled: idx === 0, onclick: () => move(-1) }, icon('back'), 'まえ'),
        h('button', { class: 'btn primary', onclick: () => (nxt ? move(1) : back()) }, nextLabel, nxt ? icon('next') : null)),
      settings.brightHint
        ? h('div', { class: 'note' }, icon('sun'), h('span', {}, '画面の明るさを最大にしてね', settings.keepAwake ? h('br') : null, settings.keepAwake ? 'この画面のあいだはスリープしません' : null))
        : null,
    );
  }
  function move(d) {
    const n = idx + d;
    if (n < 0 || n >= steps.length) return;
    idx = n;
    draw();
  }
  draw();
  return root;
}

// 左右スワイプで前後に移動
function swipe(el, onLeft, onRight) {
  let sx = null, sy = 0;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
  });
  el.addEventListener('pointercancel', () => { sx = null; });
}
