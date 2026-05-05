import type { ActiveSession, Browser, BrowserWorker } from "@cloudflare/puppeteer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserSessionManager } from "./session-manager.js";

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    sessions: vi.fn(),
    connect: vi.fn(),
    launch: vi.fn(),
  },
}));

const mockBinding = {} as BrowserWorker;

function makeBrowser(connected = true): Browser {
  return {
    connected,
    close: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn(),
  } as unknown as Browser;
}

function makeSession(sessionId: string, connectionId?: string): ActiveSession {
  return { sessionId, startTime: Date.now(), connectionId };
}

let puppeteer: {
  sessions: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  launch: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  const mod = await import("@cloudflare/puppeteer");
  puppeteer = mod.default as unknown as typeof puppeteer;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("BrowserSessionManager.acquire", () => {
  it("reuses an existing free session when one is available", async () => {
    const existingBrowser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([makeSession("sess-abc")]);
    puppeteer.connect.mockResolvedValue(existingBrowser);

    const mgr = new BrowserSessionManager();
    const browser = await mgr.acquire(mockBinding);

    expect(puppeteer.connect).toHaveBeenCalledWith(mockBinding, "sess-abc");
    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(browser).toBe(existingBrowser);
  });

  it("skips sessions that are already connected (connectionId set)", async () => {
    const newBrowser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([makeSession("sess-taken", "conn-1")]);
    puppeteer.launch.mockResolvedValue(newBrowser);

    const mgr = new BrowserSessionManager();
    const browser = await mgr.acquire(mockBinding);

    expect(puppeteer.connect).not.toHaveBeenCalled();
    expect(puppeteer.launch).toHaveBeenCalledWith(mockBinding, { keep_alive: 600_000 });
    expect(browser).toBe(newBrowser);
  });

  it("launches a new session when no sessions exist", async () => {
    const newBrowser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([]);
    puppeteer.launch.mockResolvedValue(newBrowser);

    const mgr = new BrowserSessionManager();
    const browser = await mgr.acquire(mockBinding);

    expect(puppeteer.connect).not.toHaveBeenCalled();
    expect(puppeteer.launch).toHaveBeenCalledWith(mockBinding, { keep_alive: 600_000 });
    expect(browser).toBe(newBrowser);
  });

  it("falls back to launch when puppeteer.sessions() throws", async () => {
    const newBrowser = makeBrowser();
    puppeteer.sessions.mockRejectedValue(new Error("sessions unavailable"));
    puppeteer.launch.mockResolvedValue(newBrowser);

    const mgr = new BrowserSessionManager();
    const browser = await mgr.acquire(mockBinding);

    expect(puppeteer.launch).toHaveBeenCalledWith(mockBinding, { keep_alive: 600_000 });
    expect(browser).toBe(newBrowser);
  });

  it("falls back to launch when puppeteer.connect() throws", async () => {
    const newBrowser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([makeSession("sess-dead")]);
    puppeteer.connect.mockRejectedValue(new Error("session expired"));
    puppeteer.launch.mockResolvedValue(newBrowser);

    const mgr = new BrowserSessionManager();
    const browser = await mgr.acquire(mockBinding);

    expect(puppeteer.launch).toHaveBeenCalledWith(mockBinding, { keep_alive: 600_000 });
    expect(browser).toBe(newBrowser);
  });

  it("returns the same browser without re-acquiring when already connected", async () => {
    const existingBrowser = makeBrowser(true);
    puppeteer.sessions.mockResolvedValue([makeSession("sess-abc")]);
    puppeteer.connect.mockResolvedValue(existingBrowser);

    const mgr = new BrowserSessionManager();
    await mgr.acquire(mockBinding);
    await mgr.acquire(mockBinding);

    expect(puppeteer.sessions).toHaveBeenCalledTimes(1);
    expect(puppeteer.connect).toHaveBeenCalledTimes(1);
  });
});

describe("BrowserSessionManager.terminate", () => {
  it("closes the browser", async () => {
    const browser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([]);
    puppeteer.launch.mockResolvedValue(browser);

    const mgr = new BrowserSessionManager();
    await mgr.acquire(mockBinding);
    await mgr.terminate();

    expect(browser.close).toHaveBeenCalled();
  });

  it("is a no-op when no browser has been acquired", async () => {
    const mgr = new BrowserSessionManager();
    await expect(mgr.terminate()).resolves.toBeUndefined();
  });
});

describe("BrowserSessionManager.disconnect", () => {
  it("disconnects without closing the session", async () => {
    const browser = makeBrowser();
    puppeteer.sessions.mockResolvedValue([]);
    puppeteer.launch.mockResolvedValue(browser);

    const mgr = new BrowserSessionManager();
    await mgr.acquire(mockBinding);
    await mgr.disconnect();

    expect(browser.disconnect).toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("is a no-op when no browser has been acquired", async () => {
    const mgr = new BrowserSessionManager();
    await expect(mgr.disconnect()).resolves.toBeUndefined();
  });
});
