import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getUpdates,
  getUploadUrl,
  sendMessage,
  getConfig,
  sendTyping,
  buildBaseInfo,
} from "./api.js";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchError(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

const BASE = "https://ilinkai.weixin.qq.com";
const TOKEN = "test-token-123";

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOk({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: extract the request info from mock fetch calls
// ---------------------------------------------------------------------------

function lastFetchCall() {
  const fn = globalThis.fetch as ReturnType<typeof vi.fn>;
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1];
  return { url: url as string, init: init as RequestInit };
}

// ---------------------------------------------------------------------------
// buildBaseInfo
// ---------------------------------------------------------------------------

describe("buildBaseInfo", () => {
  it("returns object with channel_version string", () => {
    const info = buildBaseInfo();
    expect(info).toHaveProperty("channel_version");
    expect(typeof info.channel_version).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// getUpdates
// ---------------------------------------------------------------------------

describe("getUpdates", () => {
  it("parses normal JSON response", async () => {
    const mockResp = { ret: 0, msgs: [{ message_id: 1 }], get_updates_buf: "buf123" };
    vi.stubGlobal("fetch", mockFetchOk(mockResp));

    const resp = await getUpdates({ baseUrl: BASE, token: TOKEN, get_updates_buf: "prev" });
    expect(resp.ret).toBe(0);
    expect(resp.msgs).toHaveLength(1);
    expect(resp.get_updates_buf).toBe("buf123");
  });

  it("sends POST to correct endpoint", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE, token: TOKEN });

    const { url, init } = lastFetchCall();
    expect(url).toContain("ilink/bot/getupdates");
    expect(init.method).toBe("POST");
  });

  it("includes base_info and get_updates_buf in body", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE, token: TOKEN, get_updates_buf: "mybuf" });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.get_updates_buf).toBe("mybuf");
    expect(body.base_info).toBeDefined();
    expect(body.base_info.channel_version).toBeDefined();
  });

  it("defaults get_updates_buf to empty string", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.get_updates_buf).toBe("");
  });

  it("returns empty response on AbortError (timeout)", async () => {
    const abortErr = new DOMException("signal is aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    const resp = await getUpdates({ baseUrl: BASE, get_updates_buf: "prevbuf" });
    expect(resp.ret).toBe(0);
    expect(resp.msgs).toEqual([]);
    expect(resp.get_updates_buf).toBe("prevbuf");
  });

  it("throws on HTTP non-200", async () => {
    vi.stubGlobal("fetch", mockFetchError(500, "Internal Server Error"));
    await expect(getUpdates({ baseUrl: BASE })).rejects.toThrow("500");
  });

  it("throws on non-abort errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));
    await expect(getUpdates({ baseUrl: BASE })).rejects.toThrow("network failure");
  });
});

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  it("sends POST to sendmessage endpoint", async () => {
    vi.stubGlobal("fetch", mockFetchOk({}));
    await sendMessage({
      baseUrl: BASE,
      token: TOKEN,
      body: { msg: { to_user_id: "user1", item_list: [] } },
    });

    const { url, init } = lastFetchCall();
    expect(url).toContain("ilink/bot/sendmessage");
    expect(init.method).toBe("POST");
  });

  it("includes base_info in request body", async () => {
    vi.stubGlobal("fetch", mockFetchOk({}));
    await sendMessage({
      baseUrl: BASE,
      body: { msg: { to_user_id: "u" } },
    });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.base_info).toBeDefined();
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", mockFetchError(400, "Bad Request"));
    await expect(
      sendMessage({ baseUrl: BASE, body: { msg: { to_user_id: "u" } } }),
    ).rejects.toThrow("400");
  });
});

// ---------------------------------------------------------------------------
// getConfig
// ---------------------------------------------------------------------------

describe("getConfig", () => {
  it("parses typing_ticket from response", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0, typing_ticket: "ticket123" }));

    const resp = await getConfig({
      baseUrl: BASE,
      token: TOKEN,
      ilinkUserId: "user1",
      contextToken: "ctx",
    });
    expect(resp.typing_ticket).toBe("ticket123");
    expect(resp.ret).toBe(0);
  });

  it("sends ilink_user_id and context_token in body", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getConfig({
      baseUrl: BASE,
      ilinkUserId: "uid",
      contextToken: "ctk",
    });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.ilink_user_id).toBe("uid");
    expect(body.context_token).toBe("ctk");
  });
});

// ---------------------------------------------------------------------------
// sendTyping
// ---------------------------------------------------------------------------

describe("sendTyping", () => {
  it("sends POST to sendtyping endpoint", async () => {
    vi.stubGlobal("fetch", mockFetchOk({}));
    await sendTyping({
      baseUrl: BASE,
      token: TOKEN,
      body: { ilink_user_id: "user1", typing_ticket: "tk", status: 1 },
    });

    const { url } = lastFetchCall();
    expect(url).toContain("ilink/bot/sendtyping");
  });

  it("includes typing body fields", async () => {
    vi.stubGlobal("fetch", mockFetchOk({}));
    await sendTyping({
      baseUrl: BASE,
      body: { ilink_user_id: "u1", typing_ticket: "t1", status: 2 },
    });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.ilink_user_id).toBe("u1");
    expect(body.typing_ticket).toBe("t1");
    expect(body.status).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getUploadUrl
// ---------------------------------------------------------------------------

describe("getUploadUrl", () => {
  it("sends correct params and parses response", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ upload_param: "up1", thumb_upload_param: "th1" }));

    const resp = await getUploadUrl({
      baseUrl: BASE,
      token: TOKEN,
      filekey: "fk1",
      media_type: 1,
      to_user_id: "u1",
      rawsize: 1024,
      rawfilemd5: "md5",
      filesize: 1040,
    });
    expect(resp.upload_param).toBe("up1");
    expect(resp.thumb_upload_param).toBe("th1");
  });

  it("includes all params in request body", async () => {
    vi.stubGlobal("fetch", mockFetchOk({}));
    await getUploadUrl({
      baseUrl: BASE,
      filekey: "fk",
      media_type: 2,
      to_user_id: "u",
      rawsize: 100,
      rawfilemd5: "abc",
      filesize: 112,
      thumb_rawsize: 50,
      thumb_rawfilemd5: "def",
      thumb_filesize: 64,
      no_need_thumb: false,
      aeskey: "key123",
    });

    const { init } = lastFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.filekey).toBe("fk");
    expect(body.media_type).toBe(2);
    expect(body.to_user_id).toBe("u");
    expect(body.aeskey).toBe("key123");
    expect(body.base_info).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Headers & URL formatting (indirect tests via mock fetch)
// ---------------------------------------------------------------------------

describe("request headers and URL", () => {
  it("includes Authorization header when token is provided", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE, token: "my-token" });

    const { init } = lastFetchCall();
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer my-token");
  });

  it("omits Authorization header when no token", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE });

    const { init } = lastFetchCall();
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("includes Content-Type and X-WECHAT-UIN headers", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: BASE });

    const { init } = lastFetchCall();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-WECHAT-UIN"]).toBeDefined();
    expect(headers["X-WECHAT-UIN"].length).toBeGreaterThan(0);
  });

  it("handles baseUrl with trailing slash", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: "https://example.com/" });

    const { url } = lastFetchCall();
    expect(url).toBe("https://example.com/ilink/bot/getupdates");
  });

  it("handles baseUrl without trailing slash", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ ret: 0 }));
    await getUpdates({ baseUrl: "https://example.com" });

    const { url } = lastFetchCall();
    expect(url).toBe("https://example.com/ilink/bot/getupdates");
  });
});
