// 公式コーデリスト（scraper/make_catalog.py で作った catalog.zip）の取り込みと、だんの表示・コーデ画像の読み出し。
// 公式画像は公開ホスティングに置けないので、zip を端末に取り込んで IndexedDB（catimg）にだけ保存する。
import { db } from './db.js';

// ---- だんの表示 ----
// ページ名（'oa4' / 'ring6' / '6'）の頭がシリーズ。数字だけは最初の「ひみつのアイプリ」
export const SERIES = [['oa', 'おねがい'], ['ring', 'リング'], ['', 'ひみつ'], ['card', 'カード'], ['primagi', 'プリマジ']];
const SERIES_NAME = { oa: 'おねがい', ring: 'リング', '': '' };
// カードリストの、だんの無いページ（scraper/make_catalog.py の CARD_PAGES とそろえる）
// プリマジの章（page は 'pm-P01' など。scraper/make_catalog.py の PRIMAGI_PAGES とそろえる）
const PRIMAGI_PAGES = {
  P01: '第1章', P02: '第2章', P03: '第3章', P04: '第4章', P05: '第5章', P06: '第6章',
  '2P01': 'スタジオ第1・2章', '2P03': 'スタジオ第3・4章', '2P05': 'スタジオ第5・6章', '2P07': 'スタジオ第7・8章',
  '3P01': 'スタジオ第9章', '3P02': 'スタジオ第10章',
};
const primagiOf = (page) => (typeof page === 'string' && page.startsWith('pm-') ? page.slice(3) : null);
const CARD_PAGES = { special: 'スペシャル', gumi: 'グミ', millefeui: 'ミルフィー', spcardpack: 'SPカードパック', hspecial: 'ひみつスペシャル', hgumi: 'ひみつグミ', memorial: 'メモリアル' };

function splitPage(key) {
  const m = /^([a-z]*)(\d+)$/.exec(key || '');
  return m ? { series: m[1], dan: Number(m[2]) } : null;
}
// コーデ（またはカタログの1件）のシリーズ。page が無い古いデータで dan だけあるときは最初のシリーズ扱い
export const seriesOf = (it) => (primagiOf(it?.page) ? 'primagi' : CARD_PAGES[it?.page] ? 'card' : splitPage(it?.page)?.series ?? (it?.dan ? '' : null));
export function danLabel(it) {
  const pm = primagiOf(it?.page);
  if (pm) return `プリマジ${PRIMAGI_PAGES[pm] || pm}`;
  if (CARD_PAGES[it?.page]) return CARD_PAGES[it.page];
  const p = splitPage(it?.page);
  if (p) return `${SERIES_NAME[p.series] ?? p.series}${p.dan}だん`;
  return it?.dan ? `${it.dan}だん` : '';
}

// ---- コーデ画像 ----
// 一度読んだものは object URL で覚えておく（一覧を開き直しても速い）。無いものは null
const imgCache = new Map();
export const cachedCatalogImg = (id) => imgCache.get(id);
export async function catalogImg(id) {
  if (!id) return null;
  if (!imgCache.has(id)) {
    const blob = await db.get('catimg', id);
    imgCache.set(id, blob instanceof Blob ? URL.createObjectURL(blob) : null);
  }
  return imgCache.get(id);
}
// 一覧を描く前にまとめて読んでおく（画像が後からパラパラ出るのを防ぐ）
export const preloadCatalogImgs = (ids) => Promise.all([...new Set(ids.filter(Boolean))].map(catalogImg));

// ---- zip の展開（無圧縮と deflate だけ対応。make_catalog.py は無圧縮で作る） ----
async function readZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip ファイルではないみたい');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip がこわれているみたい');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    files.set(name, { method, data: buf.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async (name, type = '') => {
    const f = files.get(name);
    if (!f) return null;
    if (f.method === 0) return new Blob([f.data], { type });
    if (f.method === 8) return new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')), { headers: { 'content-type': type } }).blob();
    throw new Error('この zip の圧縮形式には対応していないよ');
  };
}

// catalog.zip を取り込む。前のカタログは丸ごと入れかえる。
// 戻り値: { count, images, linked }（linked = 自由入力の名前が公式リストと一致して結びつけたコーデ数）
export async function importCatalog(file) {
  const get = await readZip(file);
  const metaBlob = await get('catalog.json');
  const meta = metaBlob && JSON.parse(await metaBlob.text());
  if (meta?.app !== 'aipri-wallet-catalog') throw new Error('アイプリウォレットのカタログ（catalog.zip）ではないみたい');

  const imgs = [];
  for (const c of meta.items) {
    const b = c.img && (await get(c.img, 'image/webp'));
    if (b) imgs.push([c.id, b]);
  }
  await db.clear('catimg');
  await db.putAll('catimg', imgs);
  for (const u of imgCache.values()) if (u) URL.revokeObjectURL(u);
  imgCache.clear();

  const items = meta.items.map(({ id, name, page, dan, brand, star, parts, card }) => ({ id, name, page, dan, brand, star, parts, card }));
  await db.put('kv', { createdAt: meta.createdAt, importedAt: Date.now(), pages: meta.pages, items }, 'catalog');

  // 取り込む前に登録したコーデも、名前が公式リストと同じならカタログと結びつける（画像・だんが出るように）
  // 同じ名前が複数あるときは、リストの先頭（新しいシリーズ）のほうに結びつける
  const byName = new Map();
  for (const c of items) if (!byName.has(c.name)) byName.set(c.name, c);
  const byId = new Map(items.map((c) => [c.id, c]));
  let linked = 0;
  for (const it of await db.all('items')) {
    const isFriend = it.kind === 'friend';
    const name = isFriend ? it.coordName : it.name;
    const src = isFriend ? it.coordNameSource : it.nameSource;
    const c = (src === 'catalog' && byId.get(it.catalogId)) || byName.get(name);
    if (!c) continue;
    const patch = { catalogId: c.id, dan: c.dan, page: c.page, [isFriend ? 'coordNameSource' : 'nameSource']: 'catalog' };
    if (Object.entries(patch).every(([k, v]) => it[k] === v)) continue;
    if (src !== 'catalog') linked++;
    await db.put('items', { ...it, ...patch, updatedAt: Date.now() });
  }
  return { count: items.length, images: imgs.length, linked };
}

export const getCatalog = async () => (await db.get('kv', 'catalog')) || null;
