export async function jitter(minMs = 1_000, maxMs = 3_000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}
