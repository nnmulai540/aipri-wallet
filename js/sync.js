// パソコン ⇔ iPhone の同期。自分の「非公開」GitHub リポジトリに data.json を1つ置き、両方の端末から読み書きする。
// QRはカードそのもの（読めば誰でも使える）なので、公開リポジトリには絶対に置かないこと。
// トークンはその端末の IndexedDB（kv 'sync'）にだけ保存し、バックアップにも入れない。
import { db, exportBackup, getDeleted, setDeleted, getPlaylist, setPlaylist, rememberFriendName, textToBlobs } from './db.js';

const FILE = 'data.json';
export const DEFAULT_REPO = 'nnmulai540/aipri-wallet-data';

export const getSyncConfig = async () => (await db.get('kv', 'sync')) || null;
export async function setSyncConfig(patch) {
  const cfg = { repo: DEFAULT_REPO, ...((await getSyncConfig()) || {}), ...patch };
  await db.put('kv', cfg, 'sync');
  return cfg;
}
export const syncReady = (cfg) => !!(cfg?.repo && cfg?.token);

async function gh(cfg, method, path, { accept = 'application/vnd.github+json', body } = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path ? '/' + path : ''}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('トークンがちがうか、期限が切れているみたい');
  if (res.status === 403) throw new Error('トークンにこのリポジトリを読み書きする権限がないみたい');
  return res;
}

// GitHub 上の data.json を読む。まだ無ければ { data: null, sha: null }
async function pull(cfg) {
  const meta = await gh(cfg, 'GET', `contents/${FILE}`);
  if (meta.status === 404) {
    // ファイルが無いのか、リポジトリが見えないのかを区別する
    if ((await gh(cfg, 'GET', '')).status === 404) throw new Error('リポジトリが見つからないよ（名前かトークンの対象を確認してね）');
    return { data: null, sha: null };
  }
  if (!meta.ok) throw new Error(`GitHub から読めなかったよ（${meta.status}）`);
  const { sha } = await meta.json();
  // 中身はその版（sha）を名指しで取る。ファイル名で取るとキャッシュで1つ前の版が返ることがあり、
  // そのまま書き戻すと、ほかの端末の変更を上書きしてしまうため
  const raw = await gh(cfg, 'GET', `git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json' });
  if (!raw.ok) throw new Error(`GitHub から読めなかったよ（${raw.status}）`);
  return { data: JSON.parse(await raw.text()), sha };
}

const toBase64 = (text) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',', 2)[1]);
  r.readAsDataURL(new Blob([text], { type: 'application/json' }));
});

// 書き込む。ほかの端末が先に書いていた（sha が古い）ときは false
async function push(cfg, text, sha) {
  const res = await gh(cfg, 'PUT', `contents/${FILE}`, {
    body: { message: `同期 ${new Date().toISOString()}`, content: await toBase64(text), ...(sha ? { sha } : {}) },
  });
  if (res.status === 409 || res.status === 422) return false;
  if (!res.ok) throw new Error(`GitHub に書けなかったよ（${res.status}）`);
  return true;
}

// GitHub 側のデータを端末に取り込む。同じ id は更新日時が新しい方、消したもの（deleted）は消した時刻が新しければ消す
async function mergeIn(data) {
  const stat = { added: 0, updated: 0, removed: 0 };
  const deleted = await getDeleted();
  for (const [id, t] of Object.entries(data.deleted || {})) if (!(deleted[id] >= t)) deleted[id] = t;

  for (const remoteIt of data.items || []) {
    const it = { ...remoteIt }; // 元のデータは後で「変わったか」の比較に使うので書きかえない
    if (deleted[it.id] >= (it.updatedAt || 0)) continue;
    const cur = await db.get('items', it.id);
    if (cur && (cur.updatedAt || 0) >= (it.updatedAt || 0)) continue;
    await textToBlobs(it);
    await db.put('items', it);
    stat[cur ? 'updated' : 'added']++;
  }
  const gone = new Set();
  for (const it of await db.all('items')) {
    if (deleted[it.id] >= (it.updatedAt || 0)) { await db.del('items', it.id); gone.add(it.id); stat.removed++; }
  }
  await setDeleted(deleted);

  for (const s of data.saves || []) {
    const cur = await db.get('saves', s.slot);
    if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) { await db.put('saves', s); stat.updated++; }
  }
  // プレイリストは端末ごと（その日の並び）なので同期しない。消えたコーデだけ外す
  if (gone.size) await setPlaylist((await getPlaylist()).filter((id) => !gone.has(id)));
  for (const n of [...(data.friendNames || [])].reverse()) await rememberFriendName(n);
  return stat;
}

// 送る中身。設定（一覧の見た目など）とプレイリストは端末ごとなので送らない
async function payload() {
  const { settings, exportedAt, playlist, ...rest } = await exportBackup();
  return { ...rest, deleted: await getDeleted() };
}
const sameData = (a, b) => {
  if (!a) return false;
  const { exportedAt, ...x } = a;
  return JSON.stringify(x) === JSON.stringify(b);
};

let running = null;
// 同期する。戻り値 { added, updated, removed, pushed }
export function syncNow() {
  // 二重に押されたり、起動時の自動同期と重なったりしても1回にまとめる
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}
async function doSync() {
  const cfg = await getSyncConfig();
  if (!syncReady(cfg)) throw new Error('せってい で GitHub のトークンを入れてね');
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await pull(cfg);
    const stat = remote.data ? await mergeIn(remote.data) : { added: 0, updated: 0, removed: 0 };
    const out = await payload();
    let pushed = false;
    if (!sameData(remote.data, out)) {
      if (!(await push(cfg, JSON.stringify({ ...out, exportedAt: new Date().toISOString() }), remote.sha))) continue; // 先を越されたので読み直す
      pushed = true;
    }
    await setSyncConfig({ lastSyncAt: Date.now() });
    return { ...stat, pushed };
  }
  throw new Error('ほかの端末と同時に同期していたみたい。もう一度おしてね');
}
