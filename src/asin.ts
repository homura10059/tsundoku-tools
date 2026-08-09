// 商品スナップショットを run をまたいで紐づけるためのキー抽出。
//
// Amazon の商品URLは /dp/{10桁ASIN} または /gp/product/{10桁ASIN} の形式に
// ASIN を含む。トラッキングパラメータやタイトルスラッグが混ざっていても
// ASIN 自体は不変なので、これを商品の同一性キーとして使う。
// ASIN が抽出できない場合（ウィッシュリストURL等）はクエリ文字列を落とした
// URL をキーとして使う。
//
// new URL() は使わない。不正な文字列を渡されても例外を投げないようにする
// ため（crawler.ts の正規表現ベースの解析スタイルに合わせている）。
const ASIN_PATTERN = /\/(?:dp|gp\/product)\/([A-Za-z0-9]{10})(?:[/?#]|$)/;

export function extractItemKey(url: string): string {
  const match = url.match(ASIN_PATTERN);
  if (match) {
    return match[1].toUpperCase();
  }
  return url.split("?")[0];
}
