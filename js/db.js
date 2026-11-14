// IndexedDB の小さなラッパー。データはすべてこの iPhone(ブラウザ) の中だけに保存する。
//   items : 登録したQR（コーデ/チャンス/フレンド）。1件に QR を1〜3個持つ
//   saves : セーブコード（slot 1 / 2）
//   kv    : 設定・プレイリスト・フレンド名の記憶・フォント・公式コーデリスト(catalog)など
//   catimg: 公式コーデ画像（カタログの id → Blob）。catalog.zip から取り込む
const DB_NAME = 'aipri-wallet';
const DB_VER = 2; // 2: catimg を追加
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves', { keyPath: 'slot' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('catimg')) d.createObjectStore('catimg');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  put: async (store, val, key) => {
    if (store === 'items') await detachBlobs(val);
    return tx(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key)));
  },
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  // [key, val] の組をまとめて1回のトランザクションで書く（カタログ画像 1000 枚など）
  putAll: (store, pairs) => tx(store, 'readwrite', (s) => { for (const [k, v] of pairs) s.put(v, k); }),
};

// iPhone(Safari) では、IndexedDB から読んだ Blob は保存ファイルへの参照になっていて、
// それをそのまま同じレコードに書き戻すと元ファイルが消され、画像が壊れる（フレンドのコーデ名を変えると写真が消えた）。
// 書く前に中身をメモリに読み込んだ新しい Blob に置きかえる。もう壊れているものは外す
async function detachBlobs(it) {
  for (const k of ['image', 'photo']) {
    if (!(it?.[k] instanceof Blob)) continue;
    try { it[k] = new Blob([await it[k].arrayBuffer()], { type: it[k].type }); } catch { delete it[k]; }
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- 設定 ----
const DEFAULT_SETTINGS = { libraryView: 'grid', brightHint: true, keepAwake: true };
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await db.get('kv', 'settings')) || {}) };
}
export async function setSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await db.put('kv', s, 'settings');
  return s;
}

// ---- プレイリスト（items の id の並び） ----
export async function getPlaylist() {
  const ids = (await db.get('kv', 'playlist')) || [];
  return ids;
}
export const setPlaylist = (ids) => db.put('kv', ids, 'playlist');

// ---- 一度入力したフレンド名を覚えておく（登録時にリストから選べるように） ----
export async function getFriendNames() {
  return (await db.get('kv', 'friendNames')) || [];
}
export async function rememberFriendName(name) {
  name = (name || '').trim();
  if (!name) return;
  const list = (await getFriendNames()).filter((n) => n !== name);
  list.unshift(name);
  await db.put('kv', list.slice(0, 200), 'friendNames');
}

// ---- 消したコーデの記録（id → 消した時刻）。同期のとき、ほかの端末でも消すために使う ----
export const getDeleted = async () => (await db.get('kv', 'deleted')) || {};
export const setDeleted = (m) => db.put('kv', m, 'deleted');
export async function deleteItem(id) {
  await db.del('items', id);
  await setDeleted({ ...(await getDeleted()), [id]: Date.now() });
  await setPlaylist((await getPlaylist()).filter((x) => x !== id));
}

// ---- 保存領域を消されにくくする（iOS のストレージ整理対策） ----
export async function requestPersist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* 未対応なら何もしない */ }
}

// ---- バックアップ（書き出し／読み込み）。パソコン⇔スマホの受け渡しにも使う ----
// 壊れた Blob（上の Safari の件）は読めないので null を返す（止まらないように）
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
export const dataURLToBlob = async (u) => (await fetch(u)).blob();
// items の中の画像（コーデの縮小画像 image・フレンドの写真 photo）を JSON にできる形と Blob の間で変換する
const BLOB_FIELDS = ['image', 'photo'];
export async function blobsToText(it) {
  for (const k of BLOB_FIELDS) {
    if (!(it[k] instanceof Blob)) continue;
    const u = await blobToDataURL(it[k]);
    if (u) it[k] = u; else delete it[k];
  }
}
export async function textToBlobs(it) {
  for (const k of BLOB_FIELDS) if (typeof it[k] === 'string' && it[k].startsWith('data:')) it[k] = await dataURLToBlob(it[k]);
}

export async function exportBackup() {
  const items = await db.all('items');
  for (const it of items) await blobsToText(it);
  return {
    app: 'aipri-wallet', format: 1, exportedAt: new Date().toISOString(),
    items,
    saves: await db.all('saves'),
    playlist: await getPlaylist(),
    friendNames: await getFriendNames(),
    settings: await getSettings(),
  };
}

// 既存データに「追加・上書き」する。同じ id は更新日時が新しい方を残す
export async function importBackup(data) {
  if (!data || data.app !== 'aipri-wallet') throw new Error('アイプリウォレットのバックアップファイルではないみたい');
  let added = 0, updated = 0;
  for (const it of data.items || []) {
    await textToBlobs(it);
    const cur = await db.get('items', it.id);
    if (!cur) { await db.put('items', it); added++; }
    else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) { await db.put('items', it); updated++; }
  }
  for (const s of data.saves || []) {
    const cur = await db.get('saves', s.slot);
    if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) await db.put('saves', s);
  }
  // プレイリストは今のものが空のときだけ取り込む（今日の並びを壊さないため）
  if ((await getPlaylist()).length === 0 && Array.isArray(data.playlist)) await setPlaylist(data.playlist);
  for (const n of [...(data.friendNames || [])].reverse()) await rememberFriendName(n);
  return { added, updated };
}
