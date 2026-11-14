// QRの読み取り（zxing-wasm）と表示用SVGの作成。
// 方針：読み取ったときの白黒の並び(matrix)をそのまま保存し、表示時に真っ白な背景で描き直す。
//       中身だけから作り直すとマスク模様が元と変わるので、元と同一のQRを出せるようにしている。
import qrcode from '../vendor/qrcode.mjs';

const Z = globalThis.ZXingWASM;
let ready;
function ensureReader() {
  if (!ready) {
    ready = Z.prepareZXingModule({
      // wasm は CDN ではなく同梱ファイルから読む（オフライン対応）
      overrides: { locateFile: (p, prefix) => (p.endsWith('.wasm') ? new URL('../vendor/zxing_reader.wasm', import.meta.url).href : prefix + p) },
      fireImmediately: true,
    });
  }
  return ready;
}
export const warmUp = () => ensureReader().catch(() => {});

const BASE_OPTS = { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 10 };

// ---- matrix を小さな文字列にして保存（1モジュール=1bit → base64） ----
function packSymbol(sym) {
  const n = sym.width * sym.height;
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) if (sym.data[i] === 0) bytes[i >> 3] |= 1 << (i & 7); // 0 = 黒
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unpack(b64, size) {
  const bin = atob(b64);
  const dark = new Array(size * size);
  for (let i = 0; i < size * size; i++) dark[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return dark;
}

function toRecord(r, ox = 0, oy = 0, scale = 1) {
  const p = r.position;
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
  const x = Math.min(...xs), y = Math.min(...ys);
  const hasSym = r.symbol && r.symbol.width > 0 && r.symbol.width === r.symbol.height;
  return {
    text: r.text,
    ec: r.ecLevel || 'L',
    size: hasSym ? r.symbol.width : 0,
    matrix: hasSym ? packSymbol(r.symbol) : '',
    // 元画像上の位置（パーツの自動振り分けと、枠の表示に使う）
    box: { x: ox + x / scale, y: oy + y / scale, w: (Math.max(...xs) - x) / scale, h: (Math.max(...ys) - y) / scale },
  };
}

function dedupe(recs) {
  const seen = new Set();
  return recs.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)));
}

// ---- 画像の読み込み ----
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const max = 2400; // 大きすぎる写真は縮小（読み取り速度のため）
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const getData = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

// 白黒をくっきりさせる前処理（直撮りの反射・薄いQR向け）
function enhance(src, mode) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const g = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  let lo = 255, hi = 0;
  const hist = new Array(256).fill(0);
  for (const v of g) { hist[v]++; }
  // 上下1%を切り捨ててコントラストを広げる
  let acc = 0; const cut = g.length * 0.01;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  let th = 128;
  if (mode === 'otsu') th = otsu(hist, g.length, lo, range);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((g[j] - lo) * 255) / range;
    if (mode === 'otsu') v = v >= th ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}
function otsu(hist, total, lo, range) {
  // ヒストグラムをコントラスト調整後の値に写してから大津の二値化
  const h = new Array(256).fill(0);
  hist.forEach((n, v) => { const t = Math.max(0, Math.min(255, Math.round(((v - lo) * 255) / range))); h[t] += n; });
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += h[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * h[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = t; }
  }
  return th;
}
function scaled(src, s) {
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = s < 1;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// 画像全体からQRを探す。見つからなければ前処理を変えて再挑戦
export async function decodeCanvas(canvas) {
  await ensureReader();
  const tries = [
    () => [canvas, BASE_OPTS],
    () => [enhance(canvas, 'stretch'), BASE_OPTS],
    () => [enhance(canvas, 'otsu'), { ...BASE_OPTS, binarizer: 'GlobalHistogram' }],
    () => (Math.max(canvas.width, canvas.height) < 1200 ? [scaled(canvas, 2), BASE_OPTS] : null),
  ];
  for (const t of tries) {
    const v = t();
    if (!v) continue;
    const [c, opts] = v;
    const s = c.width / canvas.width;
    const rs = (await Z.readBarcodes(getData(c), opts)).filter((r) => r.isValid && r.text);
    if (rs.length) return dedupe(rs.map((r) => toRecord(r, 0, 0, s)));
  }
  return [];
}

// 指定した範囲だけを切り出して、拡大・補正しながら読む（範囲指定用）
export async function decodeRegion(canvas, rect) {
  await ensureReader();
  const pad = Math.max(rect.w, rect.h) * 0.08;
  const x = Math.max(0, Math.floor(rect.x - pad)), y = Math.max(0, Math.floor(rect.y - pad));
  const w = Math.min(canvas.width - x, Math.ceil(rect.w + pad * 2)), h = Math.min(canvas.height - y, Math.ceil(rect.h + pad * 2));
  if (w < 8 || h < 8) return [];
  const crop = document.createElement('canvas');
  crop.width = w; crop.height = h;
  crop.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const s = Math.max(1, 900 / Math.max(w, h));
  const big = s > 1 ? scaled(crop, s) : crop;
  const variants = [
    [big, BASE_OPTS],
    [enhance(big, 'stretch'), BASE_OPTS],
    [enhance(big, 'otsu'), { ...BASE_OPTS, binarizer: 'GlobalHistogram' }],
    [enhance(big, 'stretch'), { ...BASE_OPTS, binarizer: 'FixedThreshold' }],
    [crop, BASE_OPTS],
  ];
  for (const [c, opts] of variants) {
    const k = c.width / w;
    const rs = (await Z.readBarcodes(getData(c), opts)).filter((r) => r.isValid && r.text);
    if (rs.length) return dedupe(rs.map((r) => toRecord(r, x, y, k)));
  }
  return [];
}

// ---- パーツの自動振り分け（配布画像の配置：上から アクセ / ワンピース / シューズ。
//      4つあるとき＝プリマジなどトップスとボトムスが分かれているコーデは アクセ / トップス / ボトムス / シューズ） ----
export function guessParts(recs) {
  if (recs.length === 1) return ['full'];
  const order = recs.map((r, i) => [r.box.y + r.box.h / 2, i]).sort((a, b) => a[0] - b[0]).map((v) => v[1]);
  const seq = recs.length >= 4 ? ['acce', 'tops', 'bottoms', 'shoes'] : ['acce', 'onepiece', 'shoes'];
  const parts = new Array(recs.length).fill('full');
  order.forEach((idx, rank) => { parts[idx] = seq[rank] || 'full'; });
  return parts;
}

export const PARTS = [
  ['acce', 'アクセ'], ['onepiece', 'ワンピース'], ['tops', 'トップス'], ['bottoms', 'ボトムス'], ['shoes', 'シューズ'], ['full', 'フルコーデ'],
];
export const partLabel = (p) => (PARTS.find((x) => x[0] === p) || [, 'フルコーデ'])[1];

// ---- 表示用SVG（真っ白な背景・余白4モジュール） ----
export function qrSvg(rec, { quiet = 4, className = 'qr', label = 'QRコード' } = {}) {
  let size, isDark;
  if (rec.matrix && rec.size) {
    size = rec.size;
    const dark = unpack(rec.matrix, size);
    isDark = (r, c) => dark[r * size + c] === 1;
  } else {
    // matrix が無い場合だけ中身から作り直す
    const q = qrcode(0, rec.ec || 'L');
    q.addData(rec.text, /^[0-9A-Z $%*+\-./:]*$/.test(rec.text) ? 'Alphanumeric' : 'Byte');
    q.make();
    size = q.getModuleCount();
    isDark = (r, c) => q.isDark(r, c);
  }
  const n = size + quiet * 2;
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isDark(r, c)) continue;
      // 横に続く黒をまとめて1本の矩形にする（パスを短く）
      let run = 1;
      while (c + run < size && isDark(r, c + run)) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('class', className);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#FFFFFF');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000000');
  svg.append(bg, path);
  return svg;
}

// 一覧などで使う、元画像の縮小コピー（公式画像を取り込むまでの代わり）
export function makeThumb(canvas, maxW = 420) {
  const s = Math.min(1, maxW / canvas.width);
  const c = scaled(canvas, s);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
}

// ---- フレンドカードの写真の切り出し ----
// 公式のフレンドカード画像はレイアウトが決まっているので、読み取ったQRの位置と大きさ（s）から写真の枠を出す。
//   よこ長カード：QRは右側。写真はQRの左（左端 -2.31s・幅 1.69s・上端 +0.12s・高さ 1.08s）
//   たて長カード：QRは下側。写真はQRの上（左端 0・幅 1.0s・上端 -1.99s・高さ 1.56s）
// 見本カード2枚で測った値。保存のしかたで少しずれるので、まわりの白い余白を見て枠を合わせなおす
export function cropFriendPhoto(canvas, box) {
  const s = (box.w + box.h) / 2;
  const wide = box.x + box.w / 2 > canvas.width * 0.55;
  const est = wide
    ? { x: box.x - 2.31 * s, y: box.y + 0.12 * s, w: 1.69 * s, h: 1.08 * s }
    : { x: box.x, y: box.y - 1.99 * s, w: 1.0 * s, h: 1.56 * s };
  const r = refineRect(canvas, est, s * 0.15) || est;
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  const w = Math.min(canvas.width - x, Math.round(r.w)), h = Math.min(canvas.height - y, Math.round(r.h));
  if (w < 16 || h < 16) return null;
  // 大きすぎると同期のデータが重くなるので、長い辺 600px までに縮める
  const k = Math.min(1, 600 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return { canvas: c, wide: c.width > c.height };
}

// 見積もった枠のまわり（margin）で「白っぽくない画素が6割以上ある行・列」の範囲を写真とみなす。
// 見積もりから大きく外れたら（背景の模様にひっぱられたなど）使わない
function refineRect(canvas, est, margin) {
  const x0 = Math.max(0, Math.floor(est.x - margin)), y0 = Math.max(0, Math.floor(est.y - margin));
  const x1 = Math.min(canvas.width, Math.ceil(est.x + est.w + margin)), y1 = Math.min(canvas.height, Math.ceil(est.y + est.h + margin));
  const w = x1 - x0, h = y1 - y0;
  if (w < 16 || h < 16) return null;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = (j * w + i) * 4;
      if (Math.min(d[p], d[p + 1], d[p + 2]) < 200) { cols[i]++; rows[j]++; }
    }
  }
  const span = (arr, n) => {
    let a = -1, b = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i] > n * 0.6) { if (a < 0) a = i; b = i; }
    return a < 0 ? null : [a, b];
  };
  const cx = span(cols, h), cy = span(rows, w);
  if (!cx || !cy) return null;
  const r = { x: x0 + cx[0], y: y0 + cy[0], w: cx[1] - cx[0] + 1, h: cy[1] - cy[0] + 1 };
  const off = Math.abs(r.x - est.x) + Math.abs(r.y - est.y) + Math.abs(r.w - est.w) + Math.abs(r.h - est.h);
  return off < margin * 3 ? r : null;
}
