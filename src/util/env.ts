export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

// カンマ区切りの文字列を URL 配列に分割する。各要素の前後の空白は除去し、
// 連続カンマ・末尾カンマなどで生まれる空要素は取り除く。
export function parseUrlList(raw: string): string[] {
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
}

export function requireEnvList(key: string): string[] {
  const raw = requireEnv(key);
  const urls = parseUrlList(raw);
  if (urls.length === 0) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return urls;
}
