import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("./auth/accounts.js", () => ({
  setStateDir: vi.fn(),
  listIndexedWeixinAccountIds: vi.fn().mockReturnValue([]),
  resolveWeixinAccount: vi.fn().mockReturnValue({
    accountId: "acc-1",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    token: "tok-1",
    configured: true,
    userId: "user-1",
  }),
  saveWeixinAccount: vi.fn(),
  registerWeixinAccountId: vi.fn(),
  removeWeixinAccount: vi.fn(),
  normalizeAccountId: vi.fn((id: string) => id.replace(/[@.]/g, "-")),
  DEFAULT_BASE_URL: "https://ilinkai.weixin.qq.com",
}));

vi.mock("./storage/sync-buf.js", () => ({
  setSyncStateDir: vi.fn(),
}));

vi.mock("./api/api.js", () => ({
  setChannelVersion: vi.fn(),
  sendTyping: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./api/config-cache.js", () => {
  return {
    WeixinConfigManager: class MockWeixinConfigManager {
      getForUser = vi.fn().mockResolvedValue({ typingTicket: "" });
    },
  };
});

vi.mock("./api/session-guard.js", () => ({
  resetSession: vi.fn(),
  isSessionPaused: vi.fn().mockReturnValue(false),
  pauseSession: vi.fn(),
}));

vi.mock("./messaging/inbound.js", () => ({
  setContextToken: vi.fn(),
  getContextToken: vi.fn().mockReturnValue(undefined),
}));

vi.mock("./messaging/send.js", () => ({
  sendMessageWeixin: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
  markdownToPlainText: vi.fn((text: string) => `plain:${text}`),
}));

vi.mock("./messaging/send-media.js", () => ({
  sendWeixinMediaFile: vi.fn().mockResolvedValue({ messageId: "media-1" }),
}));

vi.mock("./media/media-download.js", () => ({
  cleanupTempMedia: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./poll/poll-loop.js", () => ({
  startPollLoop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./auth/login-qr.js", () => ({
  startWeixinLoginWithQr: vi.fn().mockResolvedValue({
    qrcodeUrl: "https://login.weixin.qq.com/qr/test",
    message: "scan to login",
    sessionKey: "sess-key-1",
  }),
  waitForWeixinLogin: vi.fn().mockResolvedValue({ connected: false }),
  DEFAULT_ILINK_BOT_TYPE: "3",
}));

import {
  listIndexedWeixinAccountIds,
  resolveWeixinAccount,
  setStateDir,
  removeWeixinAccount,
} from "./auth/accounts.js";
import { setSyncStateDir } from "./storage/sync-buf.js";
import { getContextToken } from "./messaging/inbound.js";
import { sendMessageWeixin, markdownToPlainText } from "./messaging/send.js";
import { sendWeixinMediaFile } from "./messaging/send-media.js";
import { cleanupTempMedia } from "./media/media-download.js";
import { startPollLoop } from "./poll/poll-loop.js";
import { startWeixinLoginWithQr } from "./auth/login-qr.js";
import { WeixinBotClient } from "./client.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset defaults
  vi.mocked(listIndexedWeixinAccountIds).mockReturnValue([]);
  vi.mocked(getContextToken).mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// constructor
// ---------------------------------------------------------------------------

describe("constructor", () => {
  it("uses default config values", () => {
    const client = new WeixinBotClient();
    expect(client.config.clientIdPrefix).toBe("weixin-bot");
    expect(client.config.stateDir).toContain(".weixin-bot");
    expect(setStateDir).toHaveBeenCalled();
    expect(setSyncStateDir).toHaveBeenCalled();
  });

  it("applies custom config", () => {
    const client = new WeixinBotClient({
      stateDir: "/custom/state",
      tempDir: "/custom/temp",
      clientIdPrefix: "my-bot",
    });
    expect(client.config.stateDir).toBe("/custom/state");
    expect(client.config.tempDir).toBe("/custom/temp");
    expect(client.config.clientIdPrefix).toBe("my-bot");
    expect(setStateDir).toHaveBeenCalledWith("/custom/state");
    expect(setSyncStateDir).toHaveBeenCalledWith("/custom/state");
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe("getStatus", () => {
  it("returns disconnected status before start", () => {
    const client = new WeixinBotClient();
    const status = client.getStatus();
    expect(status.connected).toBe(false);
    expect(status.pollLoopRunning).toBe(false);
    expect(status.accountId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

describe("start", () => {
  it("returns false when no accounts registered", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue([]);
    const client = new WeixinBotClient();
    const result = await client.start();
    expect(result).toBe(false);
  });

  it("returns false when account is not configured", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
      configured: false,
    });
    const client = new WeixinBotClient();
    const result = await client.start();
    expect(result).toBe(false);
  });

  it("returns false when account has no userId", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
      token: "tok",
      configured: true,
      // no userId
    });
    const client = new WeixinBotClient();
    const result = await client.start();
    expect(result).toBe(false);
  });

  it("returns true and starts poll loop with configured account", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
      token: "tok-1",
      configured: true,
      userId: "user-1",
    });

    const client = new WeixinBotClient();
    const result = await client.start();
    expect(result).toBe(true);
    expect(startPollLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://ilinkai.weixin.qq.com",
        accountId: "acc-1",
        allowedUserId: "user-1",
      }),
    );
  });

  it("uses provided accountId instead of first registered", async () => {
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "specific-acc",
      baseUrl: "https://example.com",
      cdnBaseUrl: "https://cdn.example.com",
      token: "tok",
      configured: true,
      userId: "uid",
    });

    const client = new WeixinBotClient();
    const result = await client.start("specific-acc");
    expect(result).toBe(true);
    expect(resolveWeixinAccount).toHaveBeenCalledWith("specific-acc");
  });
});

// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------

describe("sendText", () => {
  async function startedClient() {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://cdn.example.com",
      token: "tok",
      configured: true,
      userId: "uid",
    });
    const client = new WeixinBotClient();
    await client.start();
    return client;
  }

  it("throws when not started", async () => {
    const client = new WeixinBotClient();
    await expect(client.sendText("chat1", "hi")).rejects.toThrow("not started");
  });

  it("throws when no contextToken", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue(undefined);
    await expect(client.sendText("chat1", "hi")).rejects.toThrow("no contextToken");
  });

  it("converts markdown to plain text by default", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    await client.sendText("chat1", "**bold**");

    expect(markdownToPlainText).toHaveBeenCalledWith("**bold**");
    expect(sendMessageWeixin).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "plain:**bold**", // mock returns "plain:" prefix
      }),
    );
  });

  it("skips markdown conversion with raw=true", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    await client.sendText("chat1", "**raw**", { raw: true });

    expect(markdownToPlainText).not.toHaveBeenCalled();
    expect(sendMessageWeixin).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "**raw**",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// sendMedia
// ---------------------------------------------------------------------------

describe("sendMedia", () => {
  async function startedClient() {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://cdn.example.com",
      token: "tok",
      configured: true,
      userId: "uid",
    });
    const client = new WeixinBotClient();
    await client.start();
    return client;
  }

  it("throws when not started", async () => {
    const client = new WeixinBotClient();
    await expect(client.sendMedia("chat1", "/path/file.jpg")).rejects.toThrow("not started");
  });

  it("calls sendWeixinMediaFile with correct params", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    await client.sendMedia("chat1", "/path/file.jpg", "**caption**");

    expect(sendWeixinMediaFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "/path/file.jpg",
        to: "chat1",
        text: "plain:**caption**", // caption goes through markdownToPlainText
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

describe("stop", () => {
  it("resets status after stop", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://cdn.example.com",
      token: "tok",
      configured: true,
      userId: "uid",
    });
    const client = new WeixinBotClient();
    await client.start();
    client.stop();

    const status = client.getStatus();
    expect(status.connected).toBe(false);
    expect(status.pollLoopRunning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe("logout", () => {
  it("calls stop and removeWeixinAccount", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["acc-1"]);
    vi.mocked(resolveWeixinAccount).mockReturnValue({
      accountId: "acc-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://cdn.example.com",
      token: "tok",
      configured: true,
      userId: "uid",
    });
    const client = new WeixinBotClient();
    await client.start();
    await client.logout();

    expect(removeWeixinAccount).toHaveBeenCalledWith("acc-1");
    expect(client.getStatus().connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listAccounts
// ---------------------------------------------------------------------------

describe("listAccounts", () => {
  it("delegates to listIndexedWeixinAccountIds", () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue(["a1", "a2"]);
    const client = new WeixinBotClient();
    expect(client.listAccounts()).toEqual(["a1", "a2"]);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe("login", () => {
  it("returns QrLoginResult with qrcodeUrl and sessionKey", async () => {
    const client = new WeixinBotClient();
    const result = await client.login();

    expect(result.qrcodeUrl).toBe("https://login.weixin.qq.com/qr/test");
    expect(result.sessionKey).toBe("sess-key-1");
    expect(result.message).toBe("scan to login");
    expect(startWeixinLoginWithQr).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cleanupTempMedia
// ---------------------------------------------------------------------------

describe("cleanupTempMedia", () => {
  it("delegates to cleanupTempMedia with tempDir", async () => {
    const client = new WeixinBotClient({ tempDir: "/my/temp" });
    await client.cleanupTempMedia();
    expect(cleanupTempMedia).toHaveBeenCalledWith("/my/temp");
  });
});
