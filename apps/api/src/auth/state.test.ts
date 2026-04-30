import { describe, expect, it } from "vitest";
import { generateState, verifyState } from "./state.js";

const SECRET = "test-secret-key-32-bytes-minimum!";

describe("generateState", () => {
  it("returns a non-empty string", async () => {
    const state = await generateState(SECRET);
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);
  });

  it("returns different values each call", async () => {
    const a = await generateState(SECRET);
    const b = await generateState(SECRET);
    expect(a).not.toBe(b);
  });
});

describe("verifyState", () => {
  it("returns true for a valid state", async () => {
    const state = await generateState(SECRET);
    const valid = await verifyState(state, SECRET);
    expect(valid).toBe(true);
  });

  it("returns false when secret is wrong", async () => {
    const state = await generateState(SECRET);
    const valid = await verifyState(state, "wrong-secret");
    expect(valid).toBe(false);
  });

  it("returns false for a tampered state", async () => {
    const state = await generateState(SECRET);
    const tampered = `${state.slice(0, -4)}xxxx`;
    const valid = await verifyState(tampered, SECRET);
    expect(valid).toBe(false);
  });

  it("returns false for an empty string", async () => {
    const valid = await verifyState("", SECRET);
    expect(valid).toBe(false);
  });
});
