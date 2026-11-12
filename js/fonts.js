// 見出しフォント（N-うたミン）は再配布禁止のため、アプリには同梱しない。
// ユーザーが自分で取り込んだファイルを IndexedDB に置き、FontFace API で読み込む。
import { db } from './db.js';

export async function loadHeadingFont() {
  try {
    const blob = await db.get('kv', 'headingFont');
    if (!blob) return false;
    const face = new FontFace('N-UtaMin', await blob.arrayBuffer(), { display: 'swap' });
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (e) {
    console.warn('見出しフォントの読み込みに失敗', e);
    return false;
  }
}
