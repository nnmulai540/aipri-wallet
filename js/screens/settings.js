// ⑤ せってい：一覧の見た目・QR表示中のふるまい・バックアップ・見出しフォント・保存容量
import { db, getSettings, setSettings, exportBackup, importBackup } from '../db.js';
import { h, fill, icon, header, pickFile, toast, busy } from '../ui.js';
import { loadHeadingFont } from '../fonts.js';

export default async function settings() {
  let s = await getSettings();
  const root = h('div', { class: 'screen' });
  const usage = h('span', { class: 'muted' }, '…');
  navigator.storage?.estimate?.().then((e) => { usage.textContent = `${(e.usage / 1024 / 1024).toFixed(1)} MB 使用中`; }).catch(() => { usage.textContent = ''; });

  async function doExport() {
    const data = await busy('書き出し中…', exportBackup);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const d = new Date();
    const name = `aipri-wallet-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // iPhone では共有シート（AirDrop・ファイルに保存）を出す。使えなければダウンロード
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  async function doImport() {
    const file = await pickFile({ accept: 'application/json,.json' });
    if (!file) return;
    try {
      const r = await busy('読み込み中…', async () => importBackup(JSON.parse(await file.text())));
      toast(`読み込んだよ（ついか ${r.added}・こうしん ${r.updated}）`);
    } catch (e) {
      toast(e.message || '読み込めなかったよ');
    }
  }
  async function doFont() {
    const file = await pickFile({ accept: '.otf,.ttf,.woff,.woff2,font/*' });
    if (!file) return;
    await db.put('kv', file, 'headingFont');
    const ok = await loadHeadingFont();
    toast(ok ? '見出しフォントを取り込んだよ' : 'フォントを読み込めなかったよ');
    draw();
  }

  async function draw() {
    const hasFont = !!(await db.get('kv', 'headingFont'));
    const opt = (key, cls, label, desc) => h('button', { class: 'view-opt' + (s.libraryView === key ? ' on' : ''), 'aria-pressed': String(s.libraryView === key), onclick: async () => { s = await setSettings({ libraryView: key }); draw(); } },
      h('div', { class: `pv ${cls}` }, ...(cls === 'grid'
        ? ['#FFE0EE', '#DFF0FF', '#EDE3FF', '#DDF6EF', '#FFF4D6', '#FFE0EE'].map((c) => h('i', { style: `background:${c}` }))
        : ['#FF7EB9', '#FFC2DD', '#FF7EB9', '#FFC2DD'].map((c, i) => h('i', { style: `background:${c};width:${i % 2 ? 60 : 90}%` })))),
      h('span', { class: 'lbl' }, h('span', { class: 'radio', 'aria-hidden': 'true' }), label),
      h('span', { class: 'desc' }, desc));
    const check = (key, label, small) => h('label', { class: 'check-row' },
      h('span', {}, label, small ? h('small', {}, small) : null),
      h('input', { type: 'checkbox', checked: s[key], onchange: async (e) => { s = await setSettings({ [key]: e.target.checked }); } }));

    fill(root, 
      header({ title: 'せってい' }),
      h('section', { class: 'card' },
        h('h2', { class: 'sec-title', style: 'margin:0 0 12px' }, 'コーデいちらんの見た目'),
        h('div', { class: 'view-opts' }, opt('grid', 'grid', 'ならべる', '3列でたくさん見る'), opt('list', 'list', 'リスト', '1列でくわしく見る'))),
      h('section', { class: 'card' },
        h('h2', { class: 'sec-title', style: 'margin:0' }, 'QRを表示するとき'),
        // iPhone の Web アプリからは画面の明るさを変えられないため、案内を出す設定にしている
        check('brightHint', '明るさを上げる案内を出す', 'Webアプリでは明るさを自動で変えられないので、コントロールセンターで上げてね'),
        check('keepAwake', '表示中はスリープしない')),
      h('section', { class: 'card' },
        h('h2', { class: 'sec-title', style: 'margin:0 0 6px' }, 'データ'),
        h('p', { class: 'muted', style: 'font-size:13px;margin:0 0 12px;line-height:1.6' }, '機種変更のときや、パソコンで登録したものをスマホに送るときに使うよ。読み込むと、いまのデータに追加されるよ。'),
        h('div', { class: 'set-btns' },
          h('button', { class: 'btn outline block', onclick: doExport }, icon('download'), 'バックアップを書き出す'),
          h('button', { class: 'btn outline block', onclick: doImport }, icon('upload'), 'バックアップを読み込む')),
        h('p', { style: 'font-size:13px;margin:12px 0 0;text-align:right' }, usage)),
      h('section', { class: 'card' },
        h('h2', { class: 'sec-title', style: 'margin:0 0 6px' }, '見出しフォント'),
        h('p', { class: 'muted', style: 'font-size:13px;margin:0 0 12px;line-height:1.6' },
          hasFont ? 'N-うたミン を使っているよ。' : 'N-うたミン（.otf）を取り込むと、見出しがかわいくなるよ。フォントはこの端末の中だけに保存されるよ。'),
        h('button', { class: 'btn outline block', onclick: doFont }, hasFont ? 'フォントを取り込みなおす' : 'フォントを取り込む')),
    );
  }
  await draw();
  return root;
}
