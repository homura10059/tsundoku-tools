import puppeteer, { type Browser, type BrowserWorker } from "@cloudflare/puppeteer";

export class BrowserSessionManager {
  private browser: Browser | null = null;

  async acquire(binding: BrowserWorker): Promise<Browser> {
    if (this.browser?.connected) return this.browser;

    try {
      const sessions = await puppeteer.sessions(binding);
      const free = sessions.find((s) => !s.connectionId);
      if (free) {
        this.browser = await puppeteer.connect(binding, free.sessionId);
        return this.browser;
      }
    } catch {
      // fall through to launch
    }

    this.browser = await puppeteer.launch(binding, { keep_alive: 600_000 });
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
