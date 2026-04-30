async function hmacSign(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateState(secret: string): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const sig = await hmacSign(secret, nonce);
  return `${nonce}.${sig}`;
}

export async function verifyState(state: string, secret: string): Promise<boolean> {
  const dot = state.indexOf(".");
  if (dot === -1) return false;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!nonce || !sig) return false;
  const expected = await hmacSign(secret, nonce);
  return expected === sig;
}
