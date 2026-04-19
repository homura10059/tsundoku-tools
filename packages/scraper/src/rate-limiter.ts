type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const realClock: Clock = {
  now: Date.now.bind(Date),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export class RateLimiter {
  private readonly minIntervalMs: number;
  private lastRequestAt: number | null = null;
  private readonly clock: Clock;

  constructor(requestsPerSecond: number, clock: Clock = realClock) {
    this.minIntervalMs = 1000 / requestsPerSecond;
    this.clock = clock;
  }

  async acquire(): Promise<void> {
    if (this.lastRequestAt !== null) {
      const now = this.clock.now();
      const elapsed = now - this.lastRequestAt;
      if (elapsed < this.minIntervalMs) {
        await this.clock.sleep(this.minIntervalMs - elapsed);
      }
    }
    this.lastRequestAt = this.clock.now();
  }
}
