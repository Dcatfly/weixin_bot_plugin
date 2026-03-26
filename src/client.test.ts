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
  setContextTokenStateDir: vi.fn(),
  restoreContextTokens: vi.fn(),
  clearContextTokensForAccount: vi.fn(),
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
  saveWeixinAccount,
  registerWeixinAccountId,
} from "./auth/accounts.js";
import { setSyncStateDir } from "./storage/sync-buf.js";
import { setChannelVersion, sendTyping } from "./api/api.js";
import { resetSession, isSessionPaused, pauseSession } from "./api/session-guard.js";
import { setContextTokenStateDir, restoreContextTokens, clearContextTokensForAccount, getContextToken } from "./messaging/inbound.js";
import { sendMessageWeixin, markdownToPlainText } from "./messaging/send.js";
import { sendWeixinMediaFile } from "./messaging/send-media.js";
import { cleanupTempMedia } from "./media/media-download.js";
import { startPollLoop } from "./poll/poll-loop.js";
import { startWeixinLoginWithQr, waitForWeixinLogin } from "./auth/login-qr.js";
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

  it("warns but still sends when no contextToken", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue(undefined);
    await client.sendText("chat1", "hi");
    expect(sendMessageWeixin).toHaveBeenCalledOnce();
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

    expect(clearContextTokensForAccount).toHaveBeenCalledWith("acc-1");
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

// ---------------------------------------------------------------------------
// Shared helper for tests below
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// constructor — channelVersion
// ---------------------------------------------------------------------------

describe("constructor channelVersion", () => {
  it("calls setChannelVersion when channelVersion is provided", () => {
    new WeixinBotClient({ channelVersion: "custom-v1.2.3" });
    expect(setChannelVersion).toHaveBeenCalledWith("custom-v1.2.3");
  });

  it("does not call setChannelVersion when channelVersion is omitted", () => {
    new WeixinBotClient();
    expect(setChannelVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// poll-loop callbacks
// ---------------------------------------------------------------------------

describe("poll-loop callbacks", () => {
  function getPollCallbacks() {
    const pollOpts = vi.mocked(startPollLoop).mock.calls[0][0];
    return pollOpts.callbacks;
  }

  it("onMessage updates lastInboundAt and emits message", async () => {
    const client = await startedClient();
    const msgListener = vi.fn();
    client.on("message", msgListener);

    const callbacks = getPollCallbacks();
    const msg = {
      chatId: "user-123",
      text: "hello",
      raw: { context_token: "ctx-789" },
    };
    await callbacks.onMessage(msg as any);

    expect(msgListener).toHaveBeenCalledWith(msg);
    expect(client.getStatus().lastInboundAt).toBeDefined();
  });

  it("onSessionExpired pauses session, emits event, stops polling", async () => {
    const client = await startedClient();
    const expiredListener = vi.fn();
    client.on("sessionExpired", expiredListener);

    const callbacks = getPollCallbacks();
    await callbacks.onSessionExpired("acc-1");

    expect(pauseSession).toHaveBeenCalledWith("acc-1");
    expect(expiredListener).toHaveBeenCalledWith("acc-1");
    expect(client.getStatus().pollLoopRunning).toBe(false);
  });

  it("onStatusChange updates pollLoopRunning and derived connected", async () => {
    const client = await startedClient();
    const callbacks = getPollCallbacks();

    callbacks.onStatusChange(true);
    expect(client.getStatus().pollLoopRunning).toBe(true);
    expect(client.getStatus().connected).toBe(true);

    callbacks.onStatusChange(false);
    expect(client.getStatus().pollLoopRunning).toBe(false);
    expect(client.getStatus().connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// poll-loop error handling
// ---------------------------------------------------------------------------

describe("poll-loop error handling", () => {
  it("emits error event when startPollLoop rejects", async () => {
    vi.mocked(startPollLoop).mockRejectedValueOnce(new Error("poll crash"));

    // Register listener BEFORE start() so it catches the error
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
    const errorListener = vi.fn();
    client.on("error", errorListener);

    await client.start();
    // Wait for the .catch() microtask to execute
    await new Promise((r) => setTimeout(r, 0));

    expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
    expect(errorListener.mock.calls[0][0].message).toBe("poll crash");
    expect(client.getStatus().pollLoopRunning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// login success flow
// ---------------------------------------------------------------------------

describe("login success flow", () => {
  it("saves account and starts polling on successful login", async () => {
    vi.mocked(waitForWeixinLogin).mockResolvedValueOnce({
      connected: true,
      accountId: "user@wechat.com",
      botToken: "new-token",
      baseUrl: "https://api.weixin.qq.com",
      userId: "userid-123",
    } as any);

    const client = new WeixinBotClient();
    const loginSuccessListener = vi.fn();
    client.on("loginSuccess", loginSuccessListener);

    await client.login();
    await new Promise((r) => setTimeout(r, 0));

    expect(saveWeixinAccount).toHaveBeenCalledWith(
      "user-wechat-com",
      expect.objectContaining({
        token: "new-token",
        baseUrl: "https://api.weixin.qq.com",
        userId: "userid-123",
      }),
    );
    expect(registerWeixinAccountId).toHaveBeenCalledWith("user-wechat-com");
    expect(resetSession).toHaveBeenCalledWith("user-wechat-com");
    expect(loginSuccessListener).toHaveBeenCalledWith("user-wechat-com");
  });

  it("returns qrAscii as string when qrcode-terminal is available", async () => {
    const client = new WeixinBotClient();
    const result = await client.login();

    expect(result.qrcodeUrl).toBe("https://login.weixin.qq.com/qr/test");
    // qrcode-terminal is installed, so qrAscii should be a rendered string
    expect(typeof result.qrAscii).toBe("string");
    expect(result.qrAscii!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// login error handling
// ---------------------------------------------------------------------------

describe("login error handling", () => {
  it("emits error event when waitForWeixinLogin rejects", async () => {
    vi.mocked(waitForWeixinLogin).mockRejectedValueOnce(
      new Error("QR fetch failed"),
    );

    const client = new WeixinBotClient();
    const errorListener = vi.fn();
    client.on("error", errorListener);

    await client.login();
    await new Promise((r) => setTimeout(r, 0));

    expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
    expect(saveWeixinAccount).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onQrRefresh callback
// ---------------------------------------------------------------------------

describe("onQrRefresh callback", () => {
  it("emits qrRefresh event when QR code is refreshed", async () => {
    vi.mocked(waitForWeixinLogin).mockImplementationOnce(
      async ({ onQrRefresh }: any) => {
        if (onQrRefresh) await onQrRefresh("https://new-qr-url");
        return { connected: false, message: "" };
      },
    );

    const client = new WeixinBotClient();
    const refreshListener = vi.fn();
    client.on("qrRefresh", refreshListener);

    await client.login();
    await new Promise((r) => setTimeout(r, 0));

    expect(refreshListener).toHaveBeenCalledWith(
      expect.objectContaining({ qrcodeUrl: "https://new-qr-url" }),
    );
  });
});

// ---------------------------------------------------------------------------
// sendMedia — additional coverage
// ---------------------------------------------------------------------------

describe("sendMedia additional", () => {
  it("warns but still sends when no contextToken", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue(undefined);

    await client.sendMedia("chat1", "/path/file.jpg");
    expect(sendWeixinMediaFile).toHaveBeenCalledOnce();
  });

  it("passes empty string when no caption", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    await client.sendMedia("chat1", "/path/file.jpg");

    expect(markdownToPlainText).not.toHaveBeenCalled();
    expect(sendWeixinMediaFile).toHaveBeenCalledWith(
      expect.objectContaining({ text: "" }),
    );
  });
});

// ---------------------------------------------------------------------------
// startTyping / stopTyping
// ---------------------------------------------------------------------------

describe("startTyping / stopTyping", () => {
  it("sends typing indicator when typingTicket is available", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    // Override configManager mock to return a typingTicket
    (client as any).configManager.getForUser.mockResolvedValue({
      typingTicket: "ticket-abc",
    });

    client.startTyping("chat1");
    // Flush async promise chain
    await new Promise((r) => setTimeout(r, 0));

    expect(sendTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          ilink_user_id: "chat1",
          typing_ticket: "ticket-abc",
          status: 1, // TypingStatus.TYPING
        }),
      }),
    );
  });

  it("does not send typing when typingTicket is empty", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    // Default mock returns empty typingTicket
    (client as any).configManager.getForUser.mockResolvedValue({
      typingTicket: "",
    });

    client.startTyping("chat1");
    await new Promise((r) => setTimeout(r, 0));

    expect(sendTyping).not.toHaveBeenCalled();
  });

  it("does not send typing when not started", () => {
    const client = new WeixinBotClient();
    client.startTyping("chat1");
    // No error, just early return
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it("stopTyping clears timer and sends cancel status", async () => {
    const client = await startedClient();
    vi.mocked(getContextToken).mockReturnValue("ctx-tok");

    (client as any).configManager.getForUser.mockResolvedValue({
      typingTicket: "ticket-abc",
    });

    client.startTyping("chat1");
    await new Promise((r) => setTimeout(r, 0));

    vi.mocked(sendTyping).mockClear();

    client.stopTyping("chat1");
    await new Promise((r) => setTimeout(r, 0));

    expect(sendTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          status: 2, // TypingStatus.CANCEL
        }),
      }),
    );
  });

  it("stopTyping does nothing when no active typing", async () => {
    const client = await startedClient();
    client.stopTyping("chat-no-typing");
    expect(sendTyping).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getStatus — sessionPaused
// ---------------------------------------------------------------------------

describe("getStatus sessionPaused", () => {
  it("returns sessionPaused=true when session is paused", async () => {
    const client = await startedClient();
    vi.mocked(isSessionPaused).mockReturnValue(true);

    expect(client.getStatus().sessionPaused).toBe(true);
  });

  it("returns sessionPaused=false before start", () => {
    const client = new WeixinBotClient();
    expect(client.getStatus().sessionPaused).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// logout — no accounts
// ---------------------------------------------------------------------------

describe("logout no accounts", () => {
  it("does not call removeWeixinAccount when no accounts registered", async () => {
    vi.mocked(listIndexedWeixinAccountIds).mockReturnValue([]);
    const client = new WeixinBotClient();
    await client.logout();
    expect(removeWeixinAccount).not.toHaveBeenCalled();
  });
});
