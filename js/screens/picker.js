// ⑬ コーデ名をえらぶ（下から出るシート）
// 候補：公式カタログ（せってい で catalog.zip を取り込む）＋ これまでに登録したコーデ名。リストにないときは自由入力
import { db } from '../db.js';
import { h, icon, openSheet, thumb, danFilter } from '../ui.js';
import { danLabel, getCatalog } from '../catalog.js';

async function candidates() {
  const map = new Map();
  // 公式リストは品番ごとに出す（同じ名前でも別のだんの別コーデがあるので、だんと画像で見分けられるように）
  for (const c of (await getCatalog())?.items || []) {
    map.set('#' + c.id, { name: c.name, dan: c.dan, page: c.page, brand: c.brand, catalogId: c.id, nameSource: 'catalog' });
  }
  const catNames = new Set([...map.values()].map((c) => c.name));
  for (const it of await db.all('items')) {
    for (const [name, src] of [[it.name, it.nameSource], [it.coordName, it.coordNameSource]]) {
      if (name && !catNames.has(name) && !map.has(name)) map.set(name, { name, dan: it.dan, page: it.page, catalogId: it.catalogId, nameSource: src || 'free' });
    }
  }
  return [...map.values()];
}

// 戻り値: { name, nameSource, catalogId, dan, page } / キャンセル時 null
export async function openPicker({ current = '', catalogId = null, title = 'コーデ名をえらぶ' } = {}) {
  const all = await candidates();
  return new Promise((resolve) => {
    let q = current || '';
    let sel = all.find((c) => c.name === current && (!catalogId || c.catalogId === catalogId)) || null;
    let free = all.length === 0; // 候補が無いときは最初から自由入力
    let done = false;

    const list = h('div', { class: 'list' });
    const filter = danFilter(all, () => draw());
    const input = h('input', { type: 'text', enterkeyhint: 'done', value: q, placeholder: free ? 'コーデ名を入力' : 'なまえでさがす', 'aria-label': 'コーデ名',
      oninput: (e) => { q = e.target.value; if (!free) draw(); } });
    const clearBtn = h('button', { class: 'icon-btn', 'aria-label': 'けす', onclick: () => { q = ''; input.value = ''; draw(); input.focus(); } }, icon('close'));
    const freeLink = h('button', { class: 'link-btn' });
    const note = h('p', { class: 'muted', style: 'font-size:13px;margin:0' });

    function highlight(name) {
      if (!q || free) return name;
      const i = name.indexOf(q);
      if (i < 0) return name;
      return [name.slice(0, i), h('mark', {}, name.slice(i, i + q.length)), name.slice(i + q.length)];
    }
    function draw() {
      filter.el.classList.toggle('hidden', free || !all.some((c) => danLabel(c)));
      list.classList.toggle('hidden', free);
      note.textContent = free
        ? '入力した名前は、つぎからリストにも出てくるよ'
        : (all.some((c) => c.nameSource === 'catalog') ? '' : '公式リストはまだ取り込まれていないので、登録したことのある名前だけが出るよ');
      freeLink.textContent = free ? 'リストからえらぶ' : 'リストにないときは じぶんで入力する';
      freeLink.classList.toggle('hidden', all.length === 0);
      input.placeholder = free ? 'コーデ名を入力' : 'なまえでさがす';
      if (free) return;
      const rows = all
        .filter((c) => filter.test(c) && (!q || c.name.includes(q)))
        .slice(0, 100)
        .map((c, i) => h('button', { class: 'pick-row' + (sel === c ? ' on' : ''), onclick: () => { sel = c; draw(); } },
          c.catalogId ? thumb({ kind: 'coord', catalogId: c.catalogId }, i, { noImgText: false }) : null,
          h('div', { class: 'body' },
            h('div', { class: 'name' + (c.nameSource === 'catalog' ? '' : ' free-font') }, highlight(c.name)),
            danLabel(c) ? h('div', { class: 'meta' }, [danLabel(c), c.brand].filter(Boolean).join('・')) : null),
          h('span', { class: 'radio', 'aria-hidden': 'true' })));
      list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'みつからなかったよ')]));
    }
    freeLink.addEventListener('click', () => { free = !free; draw(); input.focus(); });

    function decide() {
      const name = q.trim();
      if (!free && sel) { finish(sel); return; }
      // リストで選んでいないときは、検索欄の文字をそのまま名前として使う
      if (!name) { input.focus(); return; }
      finish(all.find((c) => c.name === name) || { name, nameSource: 'free' });
    }
    function finish(v) { done = true; close(); resolve(v ? { ...v } : null); }

    draw();
    const close = openSheet(() => h('div', { style: 'display:flex;flex-direction:column;gap:12px;min-height:0;flex:1' },
      h('div', { class: 'hdr' },
        h('h2', { class: 'title' }, title),
        h('button', { class: 'icon-btn', 'aria-label': 'とじる', onclick: () => finish(null) }, icon('close'))),
      h('div', { class: 'search' }, icon('search'), input, clearBtn),
      filter.el, note, list, freeLink,
      h('button', { class: 'btn primary block', onclick: decide }, 'これにする'),
    ));
    // 背景タップで閉じたとき
    const obs = new MutationObserver(() => { if (!done && !document.querySelector('.backdrop')) { obs.disconnect(); resolve(null); } });
    obs.observe(document.getElementById('overlay-root'), { childList: true });
    setTimeout(() => input.focus(), 50);
  });
}
