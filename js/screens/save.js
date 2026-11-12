// ⑪ セーブコード：セーブ1/2 のタブ・QR・あたらしいセーブにおきかえる
import { db, getSettings } from '../db.js';
import { loadImage, decodeCanvas, qrSvg } from '../qr.js';
import { h, fill, icon, header, pickFile, toast, busy, keepAwake, fmtDate } from '../ui.js';
import { openRange } from './range.js';

export default async function save(ctx) {
  let slot = ctx.query.slot === '2' ? 2 : 1;
  const settings = await getSettings();
  if (settings.keepAwake) keepAwake(true);
  ctx.onLeave = () => keepAwake(false);
  const root = h('div', { class: 'screen' });

  async function replace() {
    const file = await pickFile({ accept: 'image/*' });
    if (!file) return;
    const canvas = await busy('よみとり中…', () => loadImage(file));
    let recs = await busy('よみとり中…', () => decodeCanvas(canvas));
    if (!recs.length) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const url = URL.createObjectURL(blob);
      recs = await openRange({ canvas, imgUrl: url, found: [] });
      URL.revokeObjectURL(url);
    }
    if (!recs.length) { toast('QRが見つからなかったよ'); return; }
    if (recs.length > 1) toast('QRがいくつかあったので、1つめを使ったよ');
    const cur = await db.get('saves', slot);
    if (cur?.qr && cur.qr.text === recs[0].text) { toast('いまと同じセーブコードだよ'); return; }
    if (cur?.qr && !confirm(`セーブ${slot} をあたらしいQRにおきかえる？`)) return;
    const { text, ec, size, matrix } = recs[0];
    // キャラの名前はおきかえても引きつぐ
    await db.put('saves', { slot, charName: cur?.charName || '', qr: { text, ec, size, matrix, part: 'full' }, updatedAt: Date.now() });
    toast(`セーブ${slot} をおきかえたよ`);
    draw();
  }

  // キャラの名前（自由入力なので本文フォント）。入力欄からフォーカスが外れたら保存
  async function saveName(name) {
    const cur = (await db.get('saves', slot)) || { slot, qr: null, updatedAt: 0 };
    name = name.trim();
    if ((cur.charName || '') === name) return;
    await db.put('saves', { ...cur, charName: name });
    toast(name ? `セーブ${slot} を「${name}」にしたよ` : 'なまえをけしたよ');
    draw();
  }

  async function draw() {
    const all = await db.all('saves');
    const cur = all.find((x) => x.slot === slot);
    const nameOf = (s) => all.find((x) => x.slot === s)?.charName || '';
    fill(root,
      header({ title: 'セーブコード', backIcon: 'close', center: true }),
      h('div', { class: 'seg' }, [1, 2].map((s) =>
        h('button', { class: slot === s ? 'on' : '', onclick: () => { slot = s; history.replaceState(null, '', `#/save?slot=${s}`); draw(); } },
          `セーブ ${s}`, nameOf(s) ? h('span', { class: 'seg-sub' }, nameOf(s)) : null))),
      h('div', { class: 'char-row' },
        h('label', { for: 'char-name' }, 'キャラ'),
        h('input', { id: 'char-name', class: 'text-input', value: cur?.charName || '', placeholder: 'キャラのなまえをつける', autocomplete: 'off', enterkeyhint: 'done',
          onchange: (e) => saveName(e.target.value),
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
      cur?.qr
        ? h('div', { class: 'qr-card' }, qrSvg(cur.qr, { label: `セーブ${slot} のQRコード` }), h('span', { class: 'cap' }, `さいごにおきかえた日 ${fmtDate(cur.updatedAt)}`))
        : h('div', { class: 'card empty' }, `セーブ${slot} はまだ登録されていないよ`),
      h('button', { class: 'btn outline block', onclick: replace }, icon('refresh'), cur?.qr ? 'あたらしいセーブにおきかえる' : 'セーブコードを登録する'),
      h('div', { class: 'note' }, icon('sun'), h('span', {}, 'プレイのあとは 新しいセーブコードに', h('br'), 'おきかえるのをわすれずに')),
    );
  }
  await draw();
  return root;
}
