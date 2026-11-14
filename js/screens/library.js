// ④ 一覧（ならべる=3列 / リスト=1列 は設定で切り替え）。タップでQR表示、長押しで詳細・編集
//   チャンスコード（⑥）はゲットした部位つきの1列、フレンド（⑧）は写真つきの2列で、見た目の設定にはよらない
import { db, getSettings, setSettings } from '../db.js';
import { partLabel } from '../qr.js';
import { h, icon, go, header, thumb, onPress, nameClass, danFilter, LIST_TITLE } from '../ui.js';
import { CHANCE_PARTS } from './view.js';
import { danLabel, preloadCatalogImgs, seriesOf, getCatalog, SERIES } from '../catalog.js';

export default async function library(ctx) {
  const kind = ctx.query.kind || 'coord';
  const settings = await getSettings();
  const all = (await db.all('items')).filter((it) => it.kind === kind);
  await preloadCatalogImgs(kind === 'friend' ? [] : all.map((it) => it.catalogId));

  // ---- ならびかえ（えらんだものは設定に覚えておく） ----
  const SORTS = [['new', '登録した順（あたらしい）'], ['old', '登録した順（ふるい）'], ['name', 'なまえ順'], ['dan', 'シリーズ・だん順']];
  let sort = SORTS.some(([k]) => k === settings.librarySort) ? settings.librarySort : 'new';
  const collator = new Intl.Collator('ja');
  const label = (it) => (kind === 'friend' ? it.friendName || it.name : it.name) || '';
  // シリーズ・だん順：シリーズは絞り込みのチップと同じ順、だんは高い順、同じだんの中は公式リストにのっている順
  const catIndex = new Map(((await getCatalog())?.items || []).map((c, i) => [c.id, i]));
  const seriesRank = (it) => { const i = SERIES.findIndex(([k]) => k === seriesOf(it)); return i < 0 ? SERIES.length : i; };
  const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const compare = {
    new: byNew,
    old: (a, b) => -byNew(a, b),
    name: (a, b) => collator.compare(label(a), label(b)) || byNew(a, b),
    dan: (a, b) => seriesRank(a) - seriesRank(b) || (b.dan || 0) - (a.dan || 0)
      || (catIndex.get(a.catalogId) ?? 1e9) - (catIndex.get(b.catalogId) ?? 1e9) || collator.compare(label(a), label(b)),
  };
  const sortSel = h('select', { class: 'select sort-select', 'aria-label': 'ならびかえ',
    onchange: async (e) => { sort = e.target.value; draw(); await setSettings({ librarySort: sort }); } },
    SORTS.map(([k, l]) => h('option', { value: k, selected: sort === k ? 'selected' : null }, l)));

  let favOnly = false;
  let used = 'all'; // チャンスコード：all / not（まだつかってない）/ used（つかった）
  let q = '';
  const body = h('div');
  const searchBox = h('div', { class: 'search hidden' },
    icon('search'),
    h('input', { type: 'search', placeholder: 'なまえでさがす', 'aria-label': 'なまえでさがす', oninput: (e) => { q = e.target.value.trim(); draw(); } }));

  // シリーズ・だん の絞り込みに、おきにいりだけ表示（ハート）を重ねがけできる
  const filter = danFilter(all, () => draw(), {
    extra: () => [
      h('button', { class: 'chip' + (favOnly ? ' on' : ''), 'aria-label': 'おきにいり', 'aria-pressed': String(favOnly),
        onclick: () => { favOnly = !favOnly; filter.redraw(); draw(); } }, icon('heart', 'style="color:var(--pink)"')),
      // チャンスコード：まだつかってない／つかった（もう一度押すと解除）
      kind === 'chance' ? [['not', 'まだ'], ['used', 'つかった']].map(([k, l]) =>
        h('button', { class: 'chip' + (used === k ? ' on' : ''), 'aria-pressed': String(used === k),
          onclick: () => { used = used === k ? 'all' : k; filter.redraw(); draw(); } }, l)) : null,
    ],
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
    let list = all.filter(filter.test).sort(compare[sort]);
    if (favOnly) list = list.filter((it) => it.favorite);
    if (q) list = list.filter((it) => [it.name, it.friendName, it.coordName].some((s) => (s || '').includes(q)));
    if (kind === 'chance' && used !== 'all') list = list.filter((it) => (used === 'used') === !!(it.got || []).length);

    if (!list.length) {
      body.replaceChildren(h('div', { class: 'empty' },
        all.length ? 'みつからなかったよ' : 'まだ登録がないよ',
        all.length ? null : h('button', { class: 'btn pink', onclick: () => go('/register?kind=' + kind) }, icon('plus'), 'QRをとりこむ')));
      return;
    }
    if (kind === 'chance') {
      body.replaceChildren(h('div', { class: 'lib-list' }, list.map((it, i) => {
        const got = new Set(it.got || []);
        const row = h('div', { class: 'lib-row chance-row', role: 'button', tabindex: '0' },
          thumb(it, i),
          h('div', { class: 'body' },
            h('div', { class: 'name-line' },
              h('div', { class: 'name ' + nameClass(it) }, it.name || '（なまえなし）'),
              got.size === CHANCE_PARTS.length ? h('span', { class: 'badge-comp' }, 'コンプリート') : !got.size ? h('span', { class: 'badge-yet' }, 'まだ') : null),
            h('div', { class: 'meta' }, got.size ? 'ゲットした部位' : 'まだつかってないよ'),
            h('div', { class: 'got-chips' }, CHANCE_PARTS.map(([k, l]) => h('span', { class: 'got-chip' + (got.has(k) ? ' on' : '') }, got.has(k) ? icon('check') : null, l)))),
          favBtn(it));
        onPress(row, { tap: () => go('/view?item=' + it.id), long: () => go('/item/' + it.id) });
        return row;
      })));
    } else if (kind === 'friend') {
      body.replaceChildren(h('div', { class: 'friend-grid' }, list.map((it, i) => {
        const t = thumb(it, i);
        t.append(favBtn(it));
        const card = h('div', { class: 'friend-item', role: 'button', tabindex: '0' }, t,
          h('span', { class: 'fname free-font' }, it.friendName || it.name || '（なまえなし）'),
          it.coordName
            ? h('span', { class: 'coord-chip ' + (it.coordNameSource === 'catalog' ? 'head-font' : 'free-font') }, it.coordName)
            : h('span', { class: 'coord-chip none' }, '＋ コーデをとうろく'));
        onPress(card, { tap: () => go('/view?item=' + it.id), long: () => go('/item/' + it.id) });
        return card;
      })));
    } else if (settings.libraryView === 'list') {
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
    h('div', { class: 'sort-row' },
      h('p', { class: 'hint' }, settings.libraryView === 'list' && kind === 'coord' ? '長押しでへんしゅう' : 'タップでQRを表示・長押しでへんしゅう'),
      sortSel),
    body,
  );
}
