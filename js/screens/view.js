// ② QR表示：コーデ1件、またはプレイリストを順番に。スワイプ／まえ・つぎ で切り替え
//   チャンスコード（⑦）：「ゲットした部位」をタップで記録
//   フレンド（⑨）：なまえ・写真・QR・コーデ名。おそろいのコーデ／フレンドへ行き来できる
import { db, getPlaylist, getSettings } from '../db.js';
import { qrSvg, partLabel } from '../qr.js';
import { h, fill, icon, go, back, header, keepAwake, thumb, photoBox, toast, KIND } from '../ui.js';
import { openPicker } from './picker.js';

// チャンスコードでもらえる部位（ゲーム内で3部位に変換されるので、トップス・ボトムスは使わない）
export const CHANCE_PARTS = [['acce', 'アクセ'], ['onepiece', 'ワンピ'], ['shoes', 'シューズ']];

// おなじコーデか：公式リストの id が両方あれば id で、なければ名前（全角半角・空白の違いは無視）で比べる
const norm = (s) => (s || '').normalize('NFKC').replace(/\s+/g, '');
export function sameCoord(coord, friend) {
  if (coord.catalogId && friend.catalogId) return coord.catalogId === friend.catalogId;
  return !!friend.coordName && norm(friend.coordName) === norm(coord.name);
}

export default async function view(ctx) {
  const settings = await getSettings();
  const play = ctx.query.play === '1';
  let items;
  const allItems = await db.all('items');
  if (play) {
    const map = new Map(allItems.map((it) => [it.id, it]));
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
  const saveIt = async (it) => { it.updatedAt = Date.now(); await db.put('items', it); };

  // ⑦ ゲットした部位（タップで記録・もう一度タップで取り消し）
  function chanceParts(it) {
    const got = new Set(it.got || []);
    return h('section', { class: 'card got-sec' },
      h('div', { class: 'got-head' }, h('h2', { class: 'sec-title', style: 'margin:0' }, 'ゲットした部位'),
        h('span', { class: 'muted' }, got.size === CHANCE_PARTS.length ? 'コンプリート！' : 'タップしてきろく')),
      h('div', { class: 'got-btns' }, CHANCE_PARTS.map(([k, l]) => h('button', {
        class: 'got-btn' + (got.has(k) ? ' on' : ''), 'aria-pressed': String(got.has(k)),
        onclick: async () => {
          if (got.has(k)) got.delete(k); else got.add(k);
          it.got = CHANCE_PARTS.map(([x]) => x).filter((x) => got.has(x));
          await saveIt(it); draw();
        },
      }, got.has(k) ? icon('check') : h('span', { class: 'ring' }), l))));
  }

  // ② おそろいのフレンド（おなじコーデを登録したフレンド）
  function matchFriends(it) {
    const fs = allItems.filter((f) => f.kind === 'friend' && sameCoord(it, f));
    if (!fs.length) return null;
    return h('section', { class: 'card osoroi' },
      h('span', { class: 'muted', style: 'font-size:12px' }, 'おそろいのフレンド'),
      h('div', { class: 'osoroi-list' }, fs.map((f, i) => h('button', { class: 'osoroi-btn', onclick: () => go('/view?item=' + f.id) },
        thumb(f, i, { noImgText: false }), h('span', { class: 'free-font' }, f.friendName || f.name || ''), icon('next')))));
  }

  // ⑨ フレンドカード
  function drawFriend(it) {
    const rec = (it.qrs || [])[0];
    const coord = allItems.find((c) => c.kind === 'coord' && sameCoord(c, it));
    fill(root,
      header({
        backIcon: 'close', sub: 'フレンドコード', title: it.friendName || it.name || '（なまえなし）', titleFree: true,
        right: [h('button', { class: 'icon-btn', 'aria-label': 'へんしゅう', onclick: () => go('/item/' + it.id) }, icon('pencil'))],
      }),
      h('div', { class: 'qr-card friend-card' },
        it.photo ? photoBox(it.photo, `${it.friendName || ''}の写真`) : null,
        rec ? qrSvg(rec, { label: `${it.friendName || ''} のフレンドコード` }) : h('div', { class: 'empty' }, 'QRがないよ')),
      h('div', { class: 'card coord-row' },
        h('span', { class: 'muted', style: 'font-size:12px' }, 'コーデ'),
        h('span', { class: 'val ' + (it.coordNameSource === 'catalog' ? 'head-font' : 'free-font') }, it.coordName || 'まだ'),
        h('button', { class: 'chip', onclick: async () => {
          const v = await openPicker({ current: it.coordName || '', catalogId: it.catalogId });
          if (!v) return;
          Object.assign(it, { coordName: v.name, coordNameSource: v.nameSource, catalogId: v.catalogId, dan: v.dan, page: v.page });
          await saveIt(it); toast('コーデをかえたよ'); drawFriend(it);
        } }, it.coordName ? 'かえる' : 'とうろく')),
      coord ? h('button', { class: 'btn primary block', onclick: () => go('/view?item=' + coord.id) }, icon('qr'), 'おそろいのコーデQRへ') : null,
      settings.brightHint ? h('div', { class: 'note' }, icon('sun'), h('span', {}, '画面の明るさを最大にしてね')) : null,
    );
  }

  function draw() {
    const { it, ii, qi } = steps[idx];
    if (it.kind === 'friend' && !play) { drawFriend(it); return; }
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
      it.kind === 'chance' ? chanceParts(it) : null,
      it.kind === 'coord' ? matchFriends(it) : null,
      // コーデ・チャンスコードは、どのコーデかを確かめられるよう小さく画像を添える（QRより下なので読み取りの邪魔にならない）
      (it.kind === 'coord' || it.kind === 'chance') && (it.catalogId || it.image)
        ? h('div', { class: 'qr-coord' }, thumb(it, ii, { noImgText: false }))
        : null,
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
