// ⑬ コーデ名をえらぶ（下から出るシート）
// 候補：公式カタログ（フェーズ2で取り込み）＋ これまでに登録したコーデ名。リストにないときは自由入力
import { db } from '../db.js';
import { h, icon, openSheet } from '../ui.js';

async function candidates() {
  const map = new Map();
  // フェーズ2で kv 'catalog' に公式リスト [{id, name, dan}] が入る予定
  for (const c of (await db.get('kv', 'catalog'))?.items || []) {
    map.set(c.name, { name: c.name, dan: c.dan, catalogId: c.id, nameSource: 'catalog' });
  }
  for (const it of await db.all('items')) {
    for (const [name, src] of [[it.name, it.nameSource], [it.coordName, it.coordNameSource]]) {
      if (name && !map.has(name)) map.set(name, { name, dan: it.dan, catalogId: it.catalogId, nameSource: src || 'free' });
    }
  }
  return [...map.values()];
}

// 戻り値: { name, nameSource, catalogId, dan } / キャンセル時 null
export async function openPicker({ current = '', title = 'コーデ名をえらぶ' } = {}) {
  const all = await candidates();
  const dans = [...new Set(all.map((c) => c.dan).filter(Boolean))].sort((a, b) => b - a);
  return new Promise((resolve) => {
    let q = current || '';
    let dan = 'all';
    let sel = all.find((c) => c.name === current) || null;
    let free = all.length === 0; // 候補が無いときは最初から自由入力
    let done = false;

    const list = h('div', { class: 'list' });
    const chips = h('div', { class: 'chips' });
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
      chips.classList.toggle('hidden', free || dans.length === 0);
      chips.replaceChildren(...[['all', 'ぜんぶ'], ...dans.map((d) => [d, `${d}だん`])].map(([k, l]) =>
        h('button', { class: 'chip' + (dan === k ? ' on' : ''), onclick: () => { dan = k; draw(); } }, l)));
      list.classList.toggle('hidden', free);
      note.textContent = free
        ? '入力した名前は、つぎからリストにも出てくるよ'
        : (all.some((c) => c.nameSource === 'catalog') ? '' : '公式リストはまだ取り込まれていないので、登録したことのある名前だけが出るよ');
      freeLink.textContent = free ? 'リストからえらぶ' : 'リストにないときは じぶんで入力する';
      freeLink.classList.toggle('hidden', all.length === 0);
      input.placeholder = free ? 'コーデ名を入力' : 'なまえでさがす';
      if (free) return;
      const rows = all
        .filter((c) => (dan === 'all' || c.dan === dan) && (!q || c.name.includes(q)))
        .slice(0, 100)
        .map((c) => h('button', { class: 'pick-row' + (sel === c ? ' on' : ''), onclick: () => { sel = c; draw(); } },
          h('div', { class: 'body' },
            h('div', { class: 'name' + (c.nameSource === 'catalog' ? '' : ' free-font') }, highlight(c.name)),
            c.dan ? h('div', { class: 'meta' }, `${c.dan}だん`) : null),
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
      chips, note, list, freeLink,
      h('button', { class: 'btn primary block', onclick: decide }, 'これにする'),
    ));
    // 背景タップで閉じたとき
    const obs = new MutationObserver(() => { if (!done && !document.querySelector('.backdrop')) { obs.disconnect(); resolve(null); } });
    obs.observe(document.getElementById('overlay-root'), { childList: true });
    setTimeout(() => input.focus(), 50);
  });
}
