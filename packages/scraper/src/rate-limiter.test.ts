import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

function makeClock(startTime = 0) {
  let t = startTime;
  const sleep = vi.fn((ms: number): Promise<void> => {
    t += ms;
    return Promise.resolve();
  });
  return {
    now: () => t,
    sleep,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("does not sleep on first acquire", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, clock);
    await limiter.acquire();
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("sleeps for the full interval on back-to-back acquires", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, clock); // 1000ms interval
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.sleep).toHaveBeenCalledWith(1000);
  });

  it("sleeps only for the remaining time when some has elapsed", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, clock); // 1000ms interval
    await limiter.acquire(); // t=0, lastRequestAt=0
    clock.advance(400); // t=400
    await limiter.acquire(); // elapsed=400, should sleep 600
    expect(clock.sleep).toHaveBeenCalledWith(600);
  });

  it("does not sleep when the full interval has already elapsed", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, clock); // 1000ms interval
    await limiter.acquire(); // t=0, lastRequestAt=0
    clock.advance(1000); // t=1000
    await limiter.acquire(); // elapsed=1000, no sleep needed
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("respects custom requestsPerSecond", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter(2, clock); // 500ms interval
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.sleep).toHaveBeenCalledWith(500);
  });
});
