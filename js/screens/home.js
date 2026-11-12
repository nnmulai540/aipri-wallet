// ① ホーム：セーブ1/2・きょうのプレイリスト・種類別ボタン・登録(+)
import { db, getPlaylist } from '../db.js';
import { h, icon, go, thumb, nameClass } from '../ui.js';

export default async function home() {
  const ids = await getPlaylist();
  const items = new Map((await db.all('items')).map((it) => [it.id, it]));
  const pl = ids.map((id) => items.get(id)).filter(Boolean);
  const saves = new Map((await db.all('saves')).map((x) => [x.slot, x]));
  const saveSub = (n) => (saves.get(n)?.charName ? h('small', { class: 'name' }, saves.get(n).charName) : h('small', {}, 'タップで表示'));

  const thumbs = pl.slice(0, 3).map((it, i) =>
    h('a', { class: 'pl-thumb', href: `#/view?play=1&i=${i}` },
      h('div', { class: 'img' }, thumb(it, i, { noImgText: false }), h('span', { class: 'num' }, i + 1)),
      h('span', { class: 'name ' + nameClass(it) }, it.name || '（なまえなし）')));
  thumbs.push(h('a', { class: 'pl-thumb add', href: '#/playlist' },
    h('div', { class: 'img' }, icon('plus', 'width="28" height="28"')), h('span', { class: 'name', style: 'text-align:center' }, pl.length > 3 ? `ほか${pl.length - 3}こ` : 'ついか')));

  return h('div', { class: 'screen' },
    h('header', { class: 'hdr' },
      h('div', { class: 'home-title' }, icon('heart'), h('h1', {}, 'アイプリウォレット')),
      h('button', { class: 'icon-btn', 'aria-label': 'せってい', onclick: () => go('/settings') }, icon('gear'))),

    h('h2', { class: 'sec-title' }, icon('star'), 'セーブコード'),
    h('div', { class: 'save-btns' },
      h('button', { class: 'save-btn s1', onclick: () => go('/save?slot=1') }, 'セーブ 1', saveSub(1)),
      h('button', { class: 'save-btn s2', onclick: () => go('/save?slot=2') }, 'セーブ 2', saveSub(2))),

    h('section', { class: 'card' },
      h('div', { class: 'pl-head' },
        h('h2', { class: 'sec-title', style: 'margin:0' }, icon('music'), 'きょうのプレイリスト'),
        h('a', { href: '#/playlist', style: 'font-size:15px' }, 'へんしゅう')),
      h('div', { class: 'pl-thumbs' }, thumbs),
      h('button', { class: 'btn primary block', disabled: pl.length === 0, onclick: () => go('/view?play=1') },
        icon('play'), pl.length ? 'はじめから表示する' : 'コーデをついかしてね')),

    h('div', { class: 'kind-btns' },
      h('button', { class: 'btn outline', onclick: () => go('/library?kind=coord') }, 'コーデ'),
      h('button', { class: 'btn outline', onclick: () => go('/library?kind=chance') }, 'チャンスコード'),
      h('button', { class: 'btn outline', onclick: () => go('/library?kind=friend') }, 'フレンドコード')),
    h('button', { class: 'link-btn pc-link', onclick: () => go('/register?pc=1') }, icon('upload'), 'パソコンでQR登録（画像をまとめて）'),

    h('button', { class: 'fab', 'aria-label': 'QRを登録', onclick: () => go('/register') }, icon('plus')),
  );
}
