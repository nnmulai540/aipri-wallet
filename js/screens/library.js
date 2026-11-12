// ④ 一覧（ならべる=3列 / リスト=1列 は設定で切り替え）。タップでQR表示、長押しで詳細・編集
import { db, getSettings } from '../db.js';
import { partLabel } from '../qr.js';
import { h, icon, go, header, thumb, onPress, nameClass, danFilter, LIST_TITLE } from '../ui.js';
import { danLabel, preloadCatalogImgs } from '../catalog.js';

export default async function library(ctx) {
  const kind = ctx.query.kind || 'coord';
  const settings = await getSettings();
  const all = (await db.all('items')).filter((it) => it.kind === kind).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  await preloadCatalogImgs(kind === 'friend' ? [] : all.map((it) => it.catalogId));

  let favOnly = false;
  let q = '';
  const body = h('div');
  const searchBox = h('div', { class: 'search hidden' },
    icon('search'),
    h('input', { type: 'search', placeholder: 'なまえでさがす', 'aria-label': 'なまえでさがす', oninput: (e) => { q = e.target.value.trim(); draw(); } }));

  // シリーズ・だん の絞り込みに、おきにいりだけ表示（ハート）を重ねがけできる
  const filter = danFilter(all, () => draw(), {
    extra: () => h('button', { class: 'chip' + (favOnly ? ' on' : ''), 'aria-label': 'おきにいり', 'aria-pressed': String(favOnly),
      onclick: () => { favOnly = !favOnly; filter.redraw(); draw(); } }, icon('heart', 'style="color:var(--pink)"')),
  });

  async function toggleFav(it, btn) {
    it.favorite = !it.favorite;
    it.updatedAt = Date.now();
    await db.put('items', it);
    btn.replaceChildren(icon(it.favorite ? 'heart' : 'heartLine'));
    if (favOnly) draw();
  }
  const favBtn = (it) => {
    const b = h('button', { class: 'fav-btn', 'aria-label': 'おきにいり', 'aria-pressed': String(!!it.favorite) }, icon(it.favorite ? 'heart' : 'heartLine'));
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(it, b); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  };
  const partsText = (it) => (it.qrs || []).map((x) => partLabel(x.part)).join(' / ');

  function draw() {
    let list = all.filter(filter.test);
    if (favOnly) list = list.filter((it) => it.favorite);
    if (q) list = list.filter((it) => (it.name || '').includes(q) || (it.friendName || '').includes(q));

    if (!list.length) {
      body.replaceChildren(h('div', { class: 'empty' },
        all.length ? 'みつからなかったよ' : 'まだ登録がないよ',
        all.length ? null : h('button', { class: 'btn pink', onclick: () => go('/register?kind=' + kind) }, icon('plus'), 'QRをとりこむ')));
      return;
    }
    if (settings.libraryView === 'list') {
      body.replaceChildren(h('div', { class: 'lib-list' }, list.map((it, i) => {
        const row = h('div', { class: 'lib-row' },
          thumb(it, i),
          h('div', { class: 'body' },
            h('div', { class: 'name ' + nameClass(it) }, it.name || '（なまえなし）'),
            h('div', { class: 'meta' }, [danLabel(it) || null, kind === 'friend' ? it.friendName : null, partsText(it)].filter(Boolean).join('　')),
            h('button', { class: 'btn primary', onclick: (e) => { e.stopPropagation(); go('/view?item=' + it.id); } }, 'QRコードを表示')),
          favBtn(it));
        onPress(row, { long: () => go('/item/' + it.id) });
        return row;
      })));
    } else {
      body.replaceChildren(h('div', { class: 'lib-grid' }, list.map((it, i) => {
        const t = thumb(it, i);
        t.append(favBtn(it));
        const card = h('div', { class: 'lib-card', role: 'button', tabindex: '0' }, t,
          h('div', { class: 'name ' + nameClass(it) }, kind === 'friend' && it.friendName ? it.friendName : it.name || '（なまえなし）'));
        onPress(card, { tap: () => go('/view?item=' + it.id), long: () => go('/item/' + it.id) });
        return card;
      })));
    }
  }

  draw();
  return h('div', { class: 'screen' },
    header({
      title: LIST_TITLE[kind] || 'いちらん',
      right: [
        h('button', { class: 'icon-btn', 'aria-label': 'さがす', onclick: () => { searchBox.classList.toggle('hidden'); searchBox.querySelector('input').focus(); } }, icon('search')),
        h('button', { class: 'icon-btn pink', 'aria-label': 'QRを登録', onclick: () => go('/register?kind=' + kind) }, icon('plus')),
      ],
    }),
    searchBox,
    filter.el,
    h('p', { class: 'hint' }, settings.libraryView === 'list' ? '長押しでへんしゅう' : 'タップでQRを表示・長押しでへんしゅう'),
    body,
  );
}
