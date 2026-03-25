import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WeixinConfigManager } from "./config-cache.js";

// Mock the getConfig function from api.js
vi.mock("./api.js", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "./api.js";

const mockedGetConfig = vi.mocked(getConfig);
const BASE_URL = "https://ilinkai.weixin.qq.com";
const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  mockedGetConfig.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WeixinConfigManager", () => {
  it("calls getConfig on first getForUser and returns typingTicket", async () => {
    mockedGetConfig.mockResolvedValue({ ret: 0, typing_ticket: "ticket-abc" });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL, token: "tk" }, noop);
    const config = await mgr.getForUser("user1", "ctx-token");

    expect(config.typingTicket).toBe("ticket-abc");
    expect(mockedGetConfig).toHaveBeenCalledOnce();
    expect(mockedGetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: BASE_URL,
        token: "tk",
        ilinkUserId: "user1",
        contextToken: "ctx-token",
      }),
    );
  });

  it("returns cached config on second immediate call (cache hit)", async () => {
    mockedGetConfig.mockResolvedValue({ ret: 0, typing_ticket: "ticket-1" });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);
    await mgr.getForUser("user1");
    await mgr.getForUser("user1");

    // getConfig called only once because cache is still valid
    expect(mockedGetConfig).toHaveBeenCalledOnce();
  });

  it("returns empty typingTicket when API returns ret !== 0", async () => {
    mockedGetConfig.mockResolvedValue({ ret: -1, errmsg: "error" });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);
    const config = await mgr.getForUser("user1");

    expect(config.typingTicket).toBe("");
  });

  it("returns empty typingTicket when API throws", async () => {
    mockedGetConfig.mockRejectedValue(new Error("network"));

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);
    const config = await mgr.getForUser("user1");

    expect(config.typingTicket).toBe("");
  });

  it("retries after initial delay of 2s on first failure", async () => {
    mockedGetConfig
      .mockResolvedValueOnce({ ret: -1 })                        // first call: fail
      .mockResolvedValueOnce({ ret: 0, typing_ticket: "ok" });   // second call: success

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);

    // First call fails
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(1);

    // Immediately retry: still within 2s, should use cache (empty)
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(1);

    // Advance past 2s retry delay
    vi.advanceTimersByTime(2_001);
    const config = await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(2);
    expect(config.typingTicket).toBe("ok");
  });

  it("doubles retry delay on consecutive failures (exponential backoff)", async () => {
    mockedGetConfig.mockResolvedValue({ ret: -1 });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);

    // First failure → nextFetchAt = now + 2s
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(1);

    // Advance 2s → second failure → nextFetchAt = now + 4s
    vi.advanceTimersByTime(2_001);
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(2);

    // Advance 4s → third failure → nextFetchAt = now + 8s
    vi.advanceTimersByTime(4_001);
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(3);

    // Advance only 4s (not 8s) → should still be cached
    vi.advanceTimersByTime(4_000);
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(3); // no new call

    // Advance remaining 4s → should retry
    vi.advanceTimersByTime(4_001);
    await mgr.getForUser("user1");
    expect(mockedGetConfig).toHaveBeenCalledTimes(4);
  });

  it("resets retry delay after successful recovery", async () => {
    mockedGetConfig
      .mockResolvedValueOnce({ ret: -1 })                              // fail
      .mockResolvedValueOnce({ ret: 0, typing_ticket: "recovered" });  // success

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);

    // First call fails
    await mgr.getForUser("user1");

    // Advance past 2s retry → succeeds
    vi.advanceTimersByTime(2_001);
    const config = await mgr.getForUser("user1");
    expect(config.typingTicket).toBe("recovered");

    // retryDelayMs was reset to 2s (CONFIG_CACHE_INITIAL_RETRY_MS) by success.
    // On next failure, it doubles to 4s (prevDelay * 2).
    // This verifies retryDelayMs was reset: if it hadn't been,
    // it would be 4s (from first failure doubling), then 8s.
    mockedGetConfig.mockResolvedValue({ ret: -1 });

    // Advance past the TTL (up to 24h) to force a new fetch
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    await mgr.getForUser("user1"); // fails → nextDelay = min(2s * 2, 1h) = 4s

    // Advance 4s → should retry (proves retryDelayMs was reset to 2s, not stuck at 4s+)
    vi.advanceTimersByTime(4_001);
    mockedGetConfig.mockResolvedValue({ ret: 0, typing_ticket: "again" });
    const config2 = await mgr.getForUser("user1");
    expect(config2.typingTicket).toBe("again");
  });

  it("uses separate cache entries per user", async () => {
    mockedGetConfig
      .mockResolvedValueOnce({ ret: 0, typing_ticket: "t1" })
      .mockResolvedValueOnce({ ret: 0, typing_ticket: "t2" });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);

    const c1 = await mgr.getForUser("user1");
    const c2 = await mgr.getForUser("user2");

    expect(c1.typingTicket).toBe("t1");
    expect(c2.typingTicket).toBe("t2");
    expect(mockedGetConfig).toHaveBeenCalledTimes(2);
  });

  it("handles missing typing_ticket in response", async () => {
    mockedGetConfig.mockResolvedValue({ ret: 0 });

    const mgr = new WeixinConfigManager({ baseUrl: BASE_URL }, noop);
    const config = await mgr.getForUser("user1");

    expect(config.typingTicket).toBe("");
  });
});
