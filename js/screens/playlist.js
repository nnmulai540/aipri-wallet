// ⑫ プレイリスト：ぜんぶの並びを見る。名前を押すとそこからQR表示・並べかえ（≡をドラッグ）・外す（×）・コーデをついか（ふだんはたたむ）
import { db, getPlaylist, setPlaylist } from '../db.js';
import { partLabel } from '../qr.js';
import { h, fill, icon, go, header, thumb, nameClass, toast } from '../ui.js';

export default async function playlist(ctx) {
  const items = (await db.all('items')).filter((it) => it.kind !== 'save').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const map = new Map(items.map((it) => [it.id, it]));
  let ids = (await getPlaylist()).filter((id) => map.has(id));
  let q = '';
  let addOpen = ids.length === 0; // 空っぽのときは最初から開いておく
  let undoTimer = null;
  const root = h('div', { class: 'screen' });
  const rowsBox = h('div', { class: 'pl-rows' });
  const addBox = h('div', { class: 'add-grid' });
  const addSec = h('div', { class: 'add-sec' });
  const undoBar = h('div', { class: 'undo-bar', role: 'status' });

  const commit = async () => { await setPlaylist(ids); };
  const parts = (it) => (it.qrs || []).map((x) => (it.qrs.length === 1 && x.part === 'full' ? 'フルコーデ' : partLabel(x.part))).join(' / ');

  function drawRows() {
    if (!ids.length) {
      rowsBox.replaceChildren(h('div', { class: 'card empty' }, 'まだ空っぽだよ。下からコーデをついかしてね'));
      return;
    }
    rowsBox.replaceChildren(...ids.map((id, i) => {
      const it = map.get(id);
      const grip = h('button', { class: 'grip', 'aria-label': 'ドラッグで並べかえ' }, icon('grip'));
      const row = h('div', { class: 'pl-row', 'data-id': id },
        h('span', { class: 'n' }, i + 1),
        // サムネと名前のところを押すと、このコーデからQR表示（そのあとは続きを順番に）
        h('button', { class: 'open', 'aria-label': `${it.name || ''} のQRを表示`, onclick: () => go(`/view?play=1&i=${i}`) },
          thumb(it, i, { noImgText: false }),
          h('div', { class: 'body' },
            h('div', { class: 'name ' + nameClass(it) }, it.name || '（なまえなし）'),
            h('div', { class: 'meta' }, parts(it)))),
        h('button', { class: 'x', 'aria-label': 'はずす', onclick: () => remove(id) }, icon('close')),
        grip);
      dragSort(grip, row);
      return row;
    }));
  }

  // ゲーム中の押しまちがいに備えて、外したあと少しのあいだ「もどす」を出す
  async function remove(id) {
    const at = ids.indexOf(id);
    ids = ids.filter((x) => x !== id);
    await commit(); drawRows(); drawAdd();
    const name = map.get(id)?.name || '（なまえなし）';
    fill(undoBar, h('span', {}, `「${name}」をはずしたよ`),
      h('button', { class: 'chip', onclick: async () => {
        if (!ids.includes(id)) ids.splice(Math.min(at, ids.length), 0, id);
        await commit(); drawRows(); drawAdd(); hideUndo();
      } }, icon('undo'), 'もどす'));
    undoBar.classList.add('show');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 5000);
  }
  function hideUndo() { clearTimeout(undoTimer); undoBar.classList.remove('show'); }

  // ≡ を押したまま上下に動かすと並べかわる。DOM を直接入れかえ、指を離したら保存
  function dragSort(grip, row) {
    let startY = 0;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      startY = e.clientY;
      row.classList.add('dragging');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!row.classList.contains('dragging')) return;
      row.style.transform = `translateY(${e.clientY - startY}px)`;
      const prev = row.previousElementSibling, next = row.nextElementSibling;
      if (prev && e.clientY < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
        rowsBox.insertBefore(row, prev); startY -= prev.offsetHeight + 10; row.style.transform = `translateY(${e.clientY - startY}px)`;
      } else if (next && e.clientY > next.getBoundingClientRect().top + next.offsetHeight / 2) {
        rowsBox.insertBefore(next, row); startY += next.offsetHeight + 10; row.style.transform = `translateY(${e.clientY - startY}px)`;
      }
    });
    const end = async () => {
      if (!row.classList.contains('dragging')) return;
      row.classList.remove('dragging');
      row.style.transform = '';
      ids = [...rowsBox.children].map((el) => el.dataset.id);
      await commit();
      drawRows();
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  function drawAdd() {
    const list = items.filter((it) => !q || (it.name || '').includes(q));
    addBox.replaceChildren(...(list.length ? list : []).map((it, i) => {
      const added = ids.includes(it.id);
      const t = thumb(it, i, { noImgText: false });
      t.append(added
        ? h('span', { class: 'added' }, 'ついか済み')
        : h('button', { class: 'plus', 'aria-label': `${it.name || ''} をついか`, onclick: async () => { ids.push(it.id); await commit(); drawRows(); drawAdd(); } }, icon('plus')));
      return h('div', { class: 'add-card' + (added ? ' is-added' : '') }, t, h('span', { class: 'name ' + nameClass(it) }, it.name || '（なまえなし）'));
    }));
    if (!list.length) addBox.replaceChildren(h('div', { class: 'empty', style: 'grid-column:1/-1' }, items.length ? 'みつからなかったよ' : 'まだ登録がないよ'));
  }

  // 「コーデをついか」はふだんたたんでおき、押したときだけ検索と一覧を出す
  function drawAddSec() {
    fill(addSec,
      h('button', { class: 'add-toggle', 'aria-expanded': String(addOpen), onclick: () => { addOpen = !addOpen; drawAddSec(); } },
        icon(addOpen ? 'close' : 'plus'), addOpen ? 'ついかをとじる' : 'コーデをついか'),
      addOpen ? [
        h('div', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'なまえでさがす', 'aria-label': 'なまえでさがす', value: q, oninput: (e) => { q = e.target.value.trim(); drawAdd(); } })),
        addBox,
      ] : null);
  }

  drawRows();
  drawAdd();
  drawAddSec();
  ctx.onLeave = () => clearTimeout(undoTimer);
  root.append(
    header({
      title: 'プレイリスト',
      right: [h('button', { class: 'chip', onclick: async () => {
        if (!ids.length || !confirm('ぜんぶ外す？')) return;
        ids = []; await commit(); drawRows(); drawAdd();
      } }, 'ぜんぶ外す')],
    }),
    rowsBox,
    addSec,
    undoBar,
    h('div', { class: 'sticky-bottom' },
      h('button', { class: 'btn primary block', onclick: () => (ids.length ? go('/view?play=1') : toast('コーデをついかしてね')) }, icon('play'), 'はじめから表示する')),
  );
  return root;
}
