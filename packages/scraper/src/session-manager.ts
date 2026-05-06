import puppeteer, { type Browser, type BrowserWorker } from "@cloudflare/puppeteer";
import { type Logger, noopLogger } from "./logger.js";

export class BrowserSessionManager {
  private browser: Browser | null = null;

  constructor(private log: Logger = noopLogger) {}

  async acquire(binding: BrowserWorker): Promise<Browser> {
    if (this.browser?.connected) {
      this.log.debug("[SessionManager] Reusing connected browser");
      return this.browser;
    }

    try {
      const sessions = await puppeteer.sessions(binding);
      this.log.debug(`[SessionManager] Found ${sessions.length} existing session(s)`);
      const free = sessions.find((s) => !s.connectionId);
      if (free) {
        this.log.debug(`[SessionManager] Connecting to free session: ${free.sessionId}`);
        this.browser = await puppeteer.connect(binding, free.sessionId);
        this.log.debug("[SessionManager] Connected to existing session");
        return this.browser;
      }
      this.log.debug("[SessionManager] No free sessions found, launching new browser");
    } catch (err) {
      this.log.warn(
        `[SessionManager] Failed to list sessions: ${String(err)}, launching new browser`,
      );
    }

    this.browser = await puppeteer.launch(binding, { keep_alive: 600_000 });
    this.log.debug("[SessionManager] New browser launched");
    return this.browser;
  }

  async terminate(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
    }
  }
}
