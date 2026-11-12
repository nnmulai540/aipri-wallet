// ③ QRをとりこむ：画像（配布画像・カードの直撮り）→ 自動でQRを全部さがす → パーツ振り分け → 種類・名前 → ほぞん
// ⑰ パソコンでQR登録（?pc=1）：同じ処理を3列で。画像をまとめてドラッグ → 1まいずつ ほぞんして つぎへ／スキップ
import { db, uid, getFriendNames, rememberFriendName } from '../db.js';
import { loadImage, decodeCanvas, guessParts, makeThumb, PARTS } from '../qr.js';
import { h, fill, icon, header, pickFile, toast, busy, KIND } from '../ui.js';
import { syncNow, getSyncConfig, syncReady } from '../sync.js';
import { openRange } from './range.js';
import { openPicker } from './picker.js';

// すでに登録済みのQR（中身 → 登録名）。二重登録に気づけるように
async function knownTexts() {
  const m = new Map();
  for (const it of await db.all('items')) for (const q of it.qrs || []) m.set(q.text, it.name || KIND[it.kind]);
  for (const s of await db.all('saves')) if (s.qr) m.set(s.qr.text, `セーブ${s.slot}`);
  return m;
}

export default async function register(ctx) {
  const st = {
    kind: ['coord', 'chance', 'friend', 'save'].includes(ctx.query.kind) ? ctx.query.kind : 'coord',
    canvas: null, imgUrl: null, recs: [], tried: false,
    coord: null,        // { name, nameSource, catalogId, dan, page }
    friendName: '',
    slot: 1,
    charName: null,     // null = 今の名前のまま
  };
  let known = await knownTexts();
  const friendNames = await getFriendNames();
  let saveNames = {};
  const loadSaveNames = async () => { saveNames = Object.fromEntries((await db.all('saves')).map((x) => [x.slot, x.charName || ''])); };
  await loadSaveNames();
  const pc = ctx.query.pc === '1';
  const root = h('div', { class: 'screen' + (pc ? ' pc' : '') });
  let alive = true;
  ctx.onLeave = () => { alive = false; if (st.imgUrl) URL.revokeObjectURL(st.imgUrl); };

  async function load(capture) {
    const file = await pickFile({ accept: 'image/*', capture });
    if (!file) return;
    await loadFile(file);
  }
  // cached: 先に読んであった結果（パソコンのまとめ読み）。あれば読み直さない
  async function loadFile(file, cached = null) {
    await busy('よみとり中…', async () => {
      const canvas = await loadImage(file);
      const recs = cached ? cached.map((r) => ({ ...r })) : await decodeCanvas(canvas);
      if (st.imgUrl) URL.revokeObjectURL(st.imgUrl);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      Object.assign(st, { canvas, imgUrl: URL.createObjectURL(blob), recs: [], tried: true });
      addRecs(recs);
    });
    draw();
  }
  function addRecs(recs) {
    const all = [...st.recs, ...recs];
    // パーツは毎回、全体の位置関係から推定し直す（手で直したものは残す）
    const guessed = guessParts(all);
    all.forEach((r, i) => { if (!r.partFixed) r.part = guessed[i]; r.dupOf = known.get(r.text) || null; });
    st.recs = all;
  }
  async function range() {
    if (!st.canvas) return;
    const fresh = await openRange({ canvas: st.canvas, imgUrl: st.imgUrl, found: st.recs });
    if (fresh.length) { addRecs(fresh); draw(); }
  }

  // ---- パソコン：まとめて読み込む画像の列 ----
  const queue = [];   // { file, status: 'wait'|'done'|'skip', recs: null|[] }
  let qi = -1;
  let scanning = false;
  const listEl = h('div', { class: 'pc-files' });
  async function addFiles(files) {
    files = files.filter((f) => f && f.type.startsWith('image/'));
    if (!files.length) return;
    const first = queue.length;
    queue.push(...files.map((file) => ({ file, status: 'wait', recs: null })));
    if (qi < 0) await openQueue(first); else drawList();
    scanAll();
  }
  // 残りの画像も裏で読んで、左の一覧に「QR nこ見つかった」を出す
  async function scanAll() {
    if (scanning) return;
    scanning = true;
    for (const q of queue) {
      if (!alive) break;
      if (q.recs) continue;
      try { q.recs = await decodeCanvas(await loadImage(q.file)); } catch { q.recs = []; }
      drawList();
    }
    scanning = false;
  }
  async function openQueue(i) {
    qi = i;
    const q = queue[i];
    Object.assign(st, { coord: null, friendName: '', charName: null });
    await loadFile(q.file, q.recs);
    q.recs = q.recs || st.recs.map((r) => ({ ...r }));
  }
  async function nextInQueue(status) {
    if (qi >= 0) queue[qi].status = status;
    const order = [...queue.keys()].slice(qi + 1).concat([...queue.keys()].slice(0, qi + 1));
    const n = order.find((i) => queue[i].status === 'wait');
    if (n === undefined) {
      if (st.imgUrl) URL.revokeObjectURL(st.imgUrl);
      Object.assign(st, { canvas: null, imgUrl: null, recs: [], tried: false });
      qi = -1;
      draw();
      // ぜんぶ終わったら、同期の設定があればそのままスマホへ送る
      if (syncReady(await getSyncConfig())) syncBtn.click();
      else toast('ぜんぶおわったよ');
      return;
    }
    await openQueue(n);
  }
  function drawList() {
    const thumbUrl = (q) => (q.url ||= URL.createObjectURL(q.file));
    fill(listEl, queue.map((q, i) => h('button', { class: 'pc-file' + (i === qi ? ' on' : '') + (q.status !== 'wait' ? ' fin' : ''), onclick: () => openQueue(i) },
      h('img', { src: thumbUrl(q), alt: '' }),
      h('span', { class: 'body' },
        h('span', { class: 'fname' }, q.file.name),
        h('span', { class: 'fmeta' + (q.recs && !q.recs.length ? ' warn' : '') },
          q.status === 'done' ? 'ほぞんしたよ' : q.status === 'skip' ? 'スキップ'
            : !q.recs ? 'よみとり中…' : q.recs.length ? `QR ${q.recs.length}こ見つかった` : '見つからなかった')))));
  }
  const dropZone = h('div', { class: 'drop' },
    icon('upload', 'width="28" height="28"'),
    h('span', {}, '画像をここにドラッグ'),
    h('small', {}, 'まとめて何まいでもOK'),
    h('button', { class: 'btn pink', onclick: async () => addFiles((await pickFile({ accept: 'image/*', multiple: true })) || []) }, 'ファイルをえらぶ'));
  if (pc) {
    // 画面のどこに落としても受け取る
    root.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('over'); });
    root.addEventListener('dragleave', (e) => { if (e.target === dropZone) dropZone.classList.remove('over'); });
    root.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  }
  const syncBtn = h('button', { class: 'btn outline', style: 'min-height:40px;padding:0 14px;font-size:14px', onclick: async () => {
    try {
      const r = await busy('同期中…', syncNow);
      toast(r.added || r.updated || r.removed ? `同期したよ（ついか ${r.added}・こうしん ${r.updated}・けした ${r.removed}）` : '同期したよ');
    } catch (e) { toast(e.message || '同期できなかったよ'); }
  } }, icon('refresh'), '同期');

  function previewCard() {
    if (!st.canvas) {
      if (pc) {
        return h('div', { class: 'card empty', style: 'padding:28px 16px' },
          icon('image', 'width="40" height="40" style="color:var(--line2)"'),
          h('span', {}, queue.length ? 'ぜんぶおわったよ。つづけるときは画像をドラッグしてね' : '左に画像をドラッグしてね'));
      }
      return h('div', { class: 'card empty', style: 'padding:28px 16px' },
        icon('image', 'width="40" height="40" style="color:var(--line2)"'),
        h('span', {}, '配布されている画像や、カードを撮った写真をえらんでね'),
        h('span', { style: 'font-size:12px' }, '1まいの画像にQRがいくつあっても、ぜんぶ見つけるよ'));
    }
    const W = st.canvas.width, H = st.canvas.height;
    const boxes = st.recs.map((r, i) => h('div', {
      class: 'box',
      style: `left:${(r.box.x / W) * 100}%;top:${(r.box.y / H) * 100}%;width:${(r.box.w / W) * 100}%;height:${(r.box.h / H) * 100}%`,
    }, i + 1));
    const n = st.recs.length;
    return h('div', { class: 'card preview' },
      h('div', { class: 'pimg' }, h('img', { src: st.imgUrl, alt: '取り込んだ画像' }), boxes),
      h('div', { class: 'pinfo' },
        n ? h('span', { class: 'badge-ok' }, icon('check'), `${n}こ 見つかったよ`) : h('span', { class: 'badge-warn' }, icon('warn'), '見つからなかった'),
        h('span', {}, n ? '足りないときは' : 'QRのところを', h('br'), pc ? 'マウスでかこんでね' : '画像を指でかこんでね'),
        h('button', { class: 'link-btn', style: 'padding-left:0', onclick: range }, 'はんいを指定する')));
  }

  function partRows() {
    if (!st.recs.length) return null;
    const rows = st.recs.map((r, i) => h('div', {},
      h('div', { class: 'part-row' },
        h('span', { class: 'n' }, i + 1),
        st.kind === 'coord'
          ? h('div', { class: 'opts' }, PARTS.map(([k, l]) => h('button', {
            class: 'chip soft' + (r.part === k ? ' on' : ''),
            onclick: () => { r.part = k; r.partFixed = true; draw(); },
          }, l)))
          : h('span', { style: 'flex:1;font-size:14px' }, `QR ${i + 1}`),
        h('button', { class: 'icon-btn', style: 'background:none;color:var(--sub)', 'aria-label': `QR ${i + 1} をはずす`, onclick: () => { st.recs.splice(i, 1); draw(); } }, icon('close'))),
      r.dupOf ? h('div', { class: 'dup' }, `※ このQRは「${r.dupOf}」でもう登録されているよ`) : null));
    return [h('h2', { class: 'sec-title' }, st.kind === 'coord' ? 'パーツのふりわけ' : '見つかったQR'), ...rows];
  }

  function nameField() {
    const coordBtn = (label, val) => h('div', { class: 'search name-btn', role: 'button', tabindex: '0', onclick: async () => {
      const v = await openPicker({ current: val?.name || '', catalogId: val?.catalogId });
      if (v) { st.coord = v; draw(); }
    } },
      icon('search'),
      h('span', { class: 'val' + (val ? (val.nameSource === 'catalog' ? ' head-font' : '') : ' placeholder') }, val?.name || label),
      h('span', { class: 'icon-btn', 'aria-hidden': 'true' }, icon('grip')));

    if (st.kind === 'save') {
      return [h('p', { class: 'field-label' }, 'どっちのセーブ？'),
        h('div', { class: 'two-btns' }, [1, 2].map((s) =>
          h('button', { class: 'chip' + (st.slot === s ? ' on' : ''), style: 'justify-content:center', onclick: () => { st.slot = s; st.charName = null; draw(); } }, `セーブ ${s}`))),
        h('label', { class: 'field-label', for: 'char-name' }, 'キャラのなまえ（あとでもOK）'),
        h('input', { id: 'char-name', class: 'text-input', value: st.charName ?? saveNames[st.slot] ?? '', placeholder: 'キャラのなまえ', autocomplete: 'off',
          oninput: (e) => { st.charName = e.target.value; } })];
    }
    if (st.kind === 'friend') {
      const dl = h('datalist', { id: 'friend-names' }, friendNames.map((n) => h('option', { value: n })));
      return [
        h('label', { class: 'field-label', for: 'fname' }, 'なまえ'),
        h('input', { id: 'fname', class: 'text-input', list: 'friend-names', value: st.friendName, placeholder: 'フレンドのなまえ', autocomplete: 'off',
          oninput: (e) => { st.friendName = e.target.value; } }),
        dl,
        friendNames.length ? h('div', { class: 'chips' }, friendNames.slice(0, 8).map((n) =>
          h('button', { class: 'chip' + (st.friendName === n ? ' on' : ''), onclick: () => { st.friendName = n; draw(); } }, n))) : null,
        h('p', { class: 'field-label' }, 'コーデ名（あとでもOK）'),
        coordBtn('コーデ名をえらぶ', st.coord),
      ];
    }
    return [h('p', { class: 'field-label' }, 'コーデ名（リストからえらぶ）'), coordBtn('コーデ名をえらぶ', st.coord)];
  }

  async function save() {
    if (!st.recs.length) { toast('まだQRがないよ'); return; }
    const qrs = st.recs.map(({ text, ec, size, matrix, part }) => ({ text, ec, size, matrix, part: st.kind === 'coord' ? part : 'full' }));
    const now = Date.now();
    if (st.kind === 'save') {
      const cur = await db.get('saves', st.slot);
      if (cur?.qr && !confirm(`セーブ${st.slot} をこのQRにおきかえる？`)) return;
      const charName = (st.charName ?? cur?.charName ?? '').trim();
      await db.put('saves', { slot: st.slot, charName, qr: qrs[0], updatedAt: now });
      toast(`セーブ${st.slot} をほぞんしたよ`);
    } else {
      if (st.kind === 'friend' && !st.friendName.trim()) { toast('フレンドのなまえを入れてね'); return; }
      if (st.kind !== 'friend' && !st.coord && !confirm('コーデ名がまだだけど、ほぞんする？')) return;
      const item = {
        id: uid(), kind: st.kind, favorite: false, createdAt: now, updatedAt: now, qrs,
        image: await makeThumb(st.canvas),
      };
      if (st.kind === 'friend') {
        item.friendName = st.friendName.trim();
        item.name = item.friendName;
        item.nameSource = 'free';
        if (st.coord) Object.assign(item, { coordName: st.coord.name, coordNameSource: st.coord.nameSource, catalogId: st.coord.catalogId, dan: st.coord.dan, page: st.coord.page });
        await rememberFriendName(item.friendName);
      } else if (st.coord) {
        Object.assign(item, { name: st.coord.name, nameSource: st.coord.nameSource, catalogId: st.coord.catalogId, dan: st.coord.dan, page: st.coord.page });
      }
      await db.put('items', item);
      toast('ほぞんしたよ');
    }
    // 続けて次の画像を登録できるように、種類だけ残してリセット
    known = await knownTexts();
    if (st.imgUrl) URL.revokeObjectURL(st.imgUrl);
    Object.assign(st, { canvas: null, imgUrl: null, recs: [], tried: false, coord: null, friendName: '', charName: null });
    await loadSaveNames();
    if (st.kind === 'friend') friendNames.splice(0, friendNames.length, ...(await getFriendNames()));
    if (pc && qi >= 0) { await nextInQueue('done'); return; }
    draw();
    window.scrollTo(0, 0);
  }

  function draw() {
    if (pc) { drawPc(); return; }
    fill(root, 
      header({ title: 'QRをとりこむ' }),
      h('div', { class: 'two-btns' },
        h('button', { class: 'btn pink', onclick: () => load(false) }, '画像からえらぶ'),
        h('button', { class: 'btn outline', onclick: () => load(true) }, 'カメラでとる')),
      previewCard(),
      partRows(),
      h('h2', { class: 'sec-title' }, 'しゅるい'),
      h('div', { class: 'kind-chips' }, ['coord', 'chance', 'friend', 'save'].map((k) =>
        h('button', { class: 'chip' + (st.kind === k ? ' on' : ''), onclick: () => { st.kind = k; draw(); } }, KIND[k]))),
      nameField(),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn primary block', disabled: !st.recs.length, onclick: save }, 'ほぞんする'),
    );
  }
  function drawPc() {
    drawList();
    const left = queue.filter((q) => q.status === 'wait').length;
    fill(root,
      header({
        title: 'パソコンでQR登録',
        right: [
          queue.length ? h('span', { class: 'pc-count' }, qi >= 0 ? `${queue.length}まい中 ${qi + 1}まいめ` : `のこり ${left}まい`) : null,
          syncBtn,
        ],
      }),
      h('div', { class: 'pc-grid' },
        h('div', { class: 'pc-col' }, dropZone, listEl),
        h('div', { class: 'pc-col' }, previewCard()),
        h('div', { class: 'pc-col card' },
          h('h2', { class: 'sec-title', style: 'margin:0' }, 'しゅるい'),
          h('div', { class: 'kind-chips' }, ['coord', 'chance', 'friend', 'save'].map((k) =>
            h('button', { class: 'chip' + (st.kind === k ? ' on' : ''), onclick: () => { st.kind = k; draw(); } }, KIND[k]))),
          nameField(),
          partRows(),
          h('div', { class: 'two-btns' },
            h('button', { class: 'btn outline', disabled: qi < 0, onclick: () => nextInQueue('skip') }, 'スキップ'),
            h('button', { class: 'btn primary', disabled: !st.recs.length, onclick: save }, 'ほぞんして つぎへ')))),
    );
  }
  draw();
  // 同期の設定がまだなら、パソコン画面で教える
  if (pc) getSyncConfig().then((c) => { if (!syncReady(c)) syncBtn.title = 'せってい で GitHub のトークンを入れると同期できるよ'; });
  return root;
}
