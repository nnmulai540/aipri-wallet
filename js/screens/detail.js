// ⑭ コーデの詳細・編集：名前の変更・おきにいり・QRごとのパーツ変更/削除・QRついか・表示・削除
import { db, deleteItem, rememberFriendName } from '../db.js';
import { loadImage, decodeCanvas, qrSvg, PARTS } from '../qr.js';
import { h, fill, icon, go, back, header, thumb, pickFile, toast, busy, nameClass, KIND } from '../ui.js';
import { openPicker } from './picker.js';
import { openRange } from './range.js';
import { danLabel } from '../catalog.js';

export default async function detail(ctx) {
  const it = await db.get('items', ctx.params.id);
  if (!it) return h('div', { class: 'screen' }, header({ title: 'みつからないよ' }), h('div', { class: 'empty' }, 'このデータは消されたみたい'));
  const root = h('div', { class: 'screen' });
  const saveIt = async () => { it.updatedAt = Date.now(); await db.put('items', it); };

  async function rename() {
    if (it.kind === 'friend') {
      const n = prompt('フレンドのなまえ', it.friendName || '');
      if (n == null || !n.trim()) return;
      it.friendName = it.name = n.trim();
      await rememberFriendName(it.friendName);
    } else {
      const v = await openPicker({ current: it.name || '', catalogId: it.catalogId });
      if (!v) return;
      Object.assign(it, { name: v.name, nameSource: v.nameSource, catalogId: v.catalogId, dan: v.dan, page: v.page });
    }
    await saveIt(); draw();
  }
  async function changeFriendCoord() {
    const v = await openPicker({ current: it.coordName || '', catalogId: it.catalogId });
    if (!v) return;
    Object.assign(it, { coordName: v.name, coordNameSource: v.nameSource, catalogId: v.catalogId, dan: v.dan, page: v.page });
    await saveIt(); draw();
  }

  async function addQr() {
    const file = await pickFile({ accept: 'image/*' });
    if (!file) return;
    const canvas = await busy('よみとり中…', () => loadImage(file));
    let recs = await busy('よみとり中…', () => decodeCanvas(canvas));
    const have = new Set(it.qrs.map((q) => q.text));
    recs = recs.filter((r) => !have.has(r.text));
    if (!recs.length) {
      // 自動で見つからない・全部登録済み → 範囲指定へ
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const url = URL.createObjectURL(blob);
      recs = (await openRange({ canvas, imgUrl: url, found: [] })).filter((r) => !have.has(r.text));
      URL.revokeObjectURL(url);
    }
    if (!recs.length) { toast('あたらしいQRは見つからなかったよ'); return; }
    for (const r of recs) it.qrs.push({ text: r.text, ec: r.ec, size: r.size, matrix: r.matrix, part: 'full' });
    await saveIt();
    toast(`${recs.length}こ ついかしたよ`);
    draw();
  }

  async function removeItem() {
    if (!confirm(`「${it.name || 'このデータ'}」をけす？（もとに戻せないよ）`)) return;
    await deleteItem(it.id);
    toast('けしたよ');
    back();
  }

  function draw() {
    const rows = it.qrs.map((q, i) => h('div', { class: 'qr-row' },
      h('button', { class: 'mini', 'aria-label': `QR ${i + 1} を表示`, onclick: () => go(`/view?item=${it.id}&q=${i}`) }, qrSvg(q, { quiet: 1, className: '' })),
      it.kind === 'coord'
        ? h('select', { class: 'select', 'aria-label': `QR ${i + 1} のパーツ`, onchange: async (e) => { q.part = e.target.value; await saveIt(); } },
          PARTS.map(([k, l]) => h('option', { value: k, selected: q.part === k ? 'selected' : null }, k === 'full' ? 'フルコーデ' : l)))
        : h('span', { style: 'flex:1' }, `QR ${i + 1}`),
      h('button', { class: 'del', 'aria-label': `QR ${i + 1} をけす`, onclick: async () => {
        if (it.qrs.length === 1) { toast('さいごの1つはけせないよ（コーデごとけしてね）'); return; }
        if (!confirm(`QR ${i + 1} をけす？`)) return;
        it.qrs.splice(i, 1); await saveIt(); draw();
      } }, icon('trash'))));

    const kv = (k, v, extra) => h('div', { class: 'kv' }, h('span', {}, k), h('span', {}, v, extra));
    fill(root, 
      header({
        title: it.name || '（なまえなし）', titleFree: nameClass(it) !== '',
        right: [h('button', { class: 'icon-btn', 'aria-label': 'なまえをかえる', onclick: rename }, icon('pencil'))],
      }),
      h('div', { class: 'card info' },
        thumb(it, 0),
        h('div', { class: 'rows' },
          kv('しゅるい', KIND[it.kind]),
          danLabel(it) ? kv('だん', danLabel(it)) : null,
          it.kind === 'friend' ? kv('コーデ', it.coordName || 'まだ', h('button', { class: 'link-btn', onclick: changeFriendCoord }, 'かえる')) : null,
          h('div', { class: 'spacer', style: 'min-height:12px' }),
          h('button', { class: 'fav-toggle', 'aria-pressed': String(!!it.favorite), onclick: async () => { it.favorite = !it.favorite; await saveIt(); draw(); } },
            icon(it.favorite ? 'heart' : 'heartLine'), it.favorite ? 'おきにいり' : 'おきにいりにする'))),
      h('h2', { class: 'sec-title' }, it.kind === 'coord' ? 'QRコードとパーツ' : 'QRコード'),
      ...rows,
      h('button', { class: 'add-dashed', onclick: addQr }, '＋ QRをついか'),
      h('button', { class: 'btn primary block', onclick: () => go('/view?item=' + it.id) }, icon('play'), 'QRコードを表示'),
      h('button', { class: 'danger-link', onclick: removeItem }, 'このコーデをけす'),
    );
  }
  draw();
  return root;
}
