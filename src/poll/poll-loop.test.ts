import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GetUpdatesResp } from "../api/types.js";
import { MessageItemType } from "../api/types.js";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("../api/api.js", () => ({
  getUpdates: vi.fn(),
}));

vi.mock("../media/media-download.js", () => ({
  downloadMediaFromItem: vi.fn().mockResolvedValue({}),
}));

vi.mock("../storage/sync-buf.js", () => ({
  getSyncBufFilePath: vi.fn().mockReturnValue("/tmp/sync/test.sync.json"),
  loadGetUpdatesBuf: vi.fn().mockReturnValue(undefined),
  saveGetUpdatesBuf: vi.fn(),
  setSyncStateDir: vi.fn(),
}));

// Keep real implementations for bodyFromItemList and isMediaItem, only spy setContextToken
vi.mock("../messaging/inbound.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../messaging/inbound.js")>();
  return {
    ...actual,
    setContextToken: vi.fn(),
  };
});

import { getUpdates } from "../api/api.js";
import { downloadMediaFromItem } from "../media/media-download.js";
import { saveGetUpdatesBuf } from "../storage/sync-buf.js";
import { setContextToken } from "../messaging/inbound.js";
import { startPollLoop } from "./poll-loop.js";
import type { PollLoopCallbacks, InboundMessage } from "./poll-loop.js";

const mockedGetUpdates = vi.mocked(getUpdates);
const mockedDownloadMedia = vi.mocked(downloadMediaFromItem);
const mockedSaveGetUpdatesBuf = vi.mocked(saveGetUpdatesBuf);
const mockedSetContextToken = vi.mocked(setContextToken);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "test-account";
const ALLOWED_USER = "allowed-user-123";
const BASE_URL = "https://ilinkai.weixin.qq.com";
const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

function makeCallbacks(): PollLoopCallbacks & {
  messages: InboundMessage[];
  sessionExpired: string[];
  statusChanges: boolean[];
} {
  const messages: InboundMessage[] = [];
  const sessionExpired: string[] = [];
  const statusChanges: boolean[] = [];
  return {
    messages,
    sessionExpired,
    statusChanges,
    onMessage: vi.fn(async (msg) => { messages.push(msg); }),
    onSessionExpired: vi.fn(async (id) => { sessionExpired.push(id); }),
    onStatusChange: vi.fn((running) => { statusChanges.push(running); }),
  };
}

function makeTextMsg(text: string, fromUserId = ALLOWED_USER, contextToken?: string): GetUpdatesResp {
  return {
    ret: 0,
    msgs: [{
      from_user_id: fromUserId,
      item_list: [{ type: MessageItemType.TEXT, text_item: { text } }],
      context_token: contextToken ?? "ctx-tok-1",
    }],
    get_updates_buf: "buf-1",
  };
}

function defaultPollOpts(ctrl: AbortController, callbacks: PollLoopCallbacks) {
  return {
    baseUrl: BASE_URL,
    cdnBaseUrl: CDN_BASE_URL,
    token: "tok",
    accountId: ACCOUNT_ID,
    allowedUserId: ALLOWED_USER,
    abortSignal: ctrl.signal,
    callbacks,
    tempDir: "/tmp/weixin-test",
  };
}

/**
 * Run poll loop: first getUpdates returns the given response,
 * then abort synchronously so the while-loop exits on next iteration check.
 */
async function runOnce(
  callbacks: PollLoopCallbacks,
  resp: GetUpdatesResp,
) {
  const ctrl = new AbortController();
  let callCount = 0;
  mockedGetUpdates.mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      return resp;
    }
    // Abort before the second call returns, so the loop exits
    ctrl.abort();
    throw new Error("aborted");
  });

  await startPollLoop(defaultPollOpts(ctrl, callbacks)).catch(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startPollLoop", () => {
  it("delivers normal text message via onMessage callback", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, makeTextMsg("hello"));

    expect(cbs.onMessage).toHaveBeenCalledOnce();
    expect(cbs.messages[0].chatId).toBe(ALLOWED_USER);
    expect(cbs.messages[0].text).toBe("hello");
    expect(cbs.messages[0].raw).toBeDefined();
  });

  it("filters out messages from non-allowed users", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, makeTextMsg("spam", "other-user"));

    expect(cbs.onMessage).not.toHaveBeenCalled();
  });

  it("triggers onSessionExpired on errcode -14", async () => {
    const cbs = makeCallbacks();
    const ctrl = new AbortController();
    mockedGetUpdates.mockResolvedValueOnce({ ret: 0, errcode: -14, errmsg: "session expired" });

    await startPollLoop(defaultPollOpts(ctrl, cbs));

    expect(cbs.onSessionExpired).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("triggers onSessionExpired on ret -14", async () => {
    const cbs = makeCallbacks();
    const ctrl = new AbortController();
    mockedGetUpdates.mockResolvedValueOnce({ ret: -14, errmsg: "session expired" });

    await startPollLoop(defaultPollOpts(ctrl, cbs));

    expect(cbs.onSessionExpired).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("exits on abort signal", async () => {
    const cbs = makeCallbacks();
    const ctrl = new AbortController();

    mockedGetUpdates.mockImplementation(() => {
      ctrl.abort();
      return Promise.resolve({ ret: 0, msgs: [] });
    });

    await startPollLoop(defaultPollOpts(ctrl, cbs)).catch(() => {});

    expect(cbs.statusChanges).toContain(false);
  });

  it("persists get_updates_buf via saveGetUpdatesBuf", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [],
      get_updates_buf: "new-sync-buf",
    });

    expect(mockedSaveGetUpdatesBuf).toHaveBeenCalledWith(
      expect.any(String),
      "new-sync-buf",
    );
  });

  it("caches context_token via setContextToken", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, makeTextMsg("hi", ALLOWED_USER, "my-ctx-token"));

    expect(mockedSetContextToken).toHaveBeenCalledWith(ALLOWED_USER, "my-ctx-token");
  });

  it("sets text to [媒体消息] when item_list text is empty", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{ type: MessageItemType.IMAGE, image_item: { media: { encrypt_query_param: "ep" } } }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(cbs.messages[0].text).toBe("[媒体消息]");
  });

  it("downloads IMAGE media when encrypt_query_param is present", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({ decryptedPicPath: "/tmp/pic.jpg" });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.IMAGE,
          image_item: { media: { encrypt_query_param: "enc-param" } },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(mockedDownloadMedia).toHaveBeenCalledOnce();
    expect(cbs.messages[0].mediaPath).toBe("/tmp/pic.jpg");
    expect(cbs.messages[0].mediaType).toBe("image/*");
  });

  it("downloads ref media when no main media", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({ decryptedPicPath: "/tmp/ref-pic.jpg" });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.TEXT,
          text_item: { text: "check this" },
          ref_msg: {
            message_item: {
              type: MessageItemType.IMAGE,
              image_item: { media: { encrypt_query_param: "ref-ep" } },
            },
          },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(mockedDownloadMedia).toHaveBeenCalledOnce();
    expect(cbs.messages[0].mediaPath).toBe("/tmp/ref-pic.jpg");
  });

  it("does not download VOICE with text (voice-to-text)", async () => {
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.VOICE,
          voice_item: {
            text: "voice transcription",
            media: { encrypt_query_param: "voice-ep" },
          },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    // findMediaItem excludes VOICE with text
    expect(mockedDownloadMedia).not.toHaveBeenCalled();
    expect(cbs.messages[0].text).toBe("voice transcription");
  });

  it("reports onStatusChange(true) at start", async () => {
    const cbs = makeCallbacks();
    const ctrl = new AbortController();
    ctrl.abort(); // abort immediately

    mockedGetUpdates.mockRejectedValue(new Error("aborted"));

    await startPollLoop(defaultPollOpts(ctrl, cbs)).catch(() => {});

    expect(cbs.statusChanges[0]).toBe(true);
  });

  it("prioritizes decryptedPicPath over other media paths", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({
      decryptedPicPath: "/tmp/pic.jpg",
      decryptedVideoPath: "/tmp/video.mp4",
    });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.IMAGE,
          image_item: { media: { encrypt_query_param: "ep" } },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(cbs.messages[0].mediaPath).toBe("/tmp/pic.jpg");
    expect(cbs.messages[0].mediaType).toBe("image/*");
  });

  it("prioritizes decryptedVideoPath over file and voice paths", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({
      decryptedVideoPath: "/tmp/video.mp4",
      decryptedFilePath: "/tmp/file.pdf",
      decryptedVoicePath: "/tmp/voice.wav",
    });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.VIDEO,
          video_item: { media: { encrypt_query_param: "ep" } },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(cbs.messages[0].mediaPath).toBe("/tmp/video.mp4");
    expect(cbs.messages[0].mediaType).toBe("video/mp4");
  });

  it("prioritizes decryptedFilePath over voice path", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({
      decryptedFilePath: "/tmp/doc.pdf",
      fileMediaType: "application/pdf",
      decryptedVoicePath: "/tmp/voice.wav",
      voiceMediaType: "audio/wav",
    });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.FILE,
          file_item: { media: { encrypt_query_param: "ep" } },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(cbs.messages[0].mediaPath).toBe("/tmp/doc.pdf");
    expect(cbs.messages[0].mediaType).toBe("application/pdf");
  });

  it("uses voicePath when it is the only media result", async () => {
    mockedDownloadMedia.mockResolvedValueOnce({
      decryptedVoicePath: "/tmp/voice.wav",
      voiceMediaType: "audio/wav",
    });
    const cbs = makeCallbacks();
    await runOnce(cbs, {
      ret: 0,
      msgs: [{
        from_user_id: ALLOWED_USER,
        item_list: [{
          type: MessageItemType.VOICE,
          voice_item: { media: { encrypt_query_param: "ep" } },
        }],
        context_token: "ctx",
      }],
      get_updates_buf: "buf",
    });

    expect(cbs.messages[0].mediaPath).toBe("/tmp/voice.wav");
    expect(cbs.messages[0].mediaType).toBe("audio/wav");
  });

  it("updates longpolling timeout from server response", async () => {
    const ctrl = new AbortController();
    let capturedTimeoutMs: number | undefined;
    let callCount = 0;

    mockedGetUpdates.mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return { ret: 0, msgs: [], get_updates_buf: "b", longpolling_timeout_ms: 60000 };
      }
      // Capture the timeout from the second call, then abort
      capturedTimeoutMs = params.timeoutMs;
      ctrl.abort();
      throw new Error("aborted");
    });

    const cbs = makeCallbacks();
    await startPollLoop(defaultPollOpts(ctrl, cbs)).catch(() => {});

    expect(capturedTimeoutMs).toBe(60000);
  });

  describe("backoff behavior", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries with backoff on API error (ret !== 0)", async () => {
      const ctrl = new AbortController();
      let callCount = 0;

      mockedGetUpdates.mockImplementation(async () => {
        callCount++;
        if (callCount > 3) {
          ctrl.abort();
          throw new Error("aborted");
        }
        return { ret: -1, errmsg: "error" };
      });

      const cbs = makeCallbacks();
      const loopPromise = startPollLoop(defaultPollOpts(ctrl, cbs)).catch(() => {});

      // Advance through sleep(2s) x3 retries + sleep(30s) backoff
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000);
      }
      await loopPromise;

      // 3 failures + 1 abort trigger = 4 calls
      expect(callCount).toBe(4);
    });

    it("retries with backoff on thrown exception", async () => {
      const ctrl = new AbortController();
      let callCount = 0;

      mockedGetUpdates.mockImplementation(async () => {
        callCount++;
        if (callCount > 3) {
          ctrl.abort();
          throw new Error("aborted");
        }
        throw new Error("network failure");
      });

      const cbs = makeCallbacks();
      const loopPromise = startPollLoop(defaultPollOpts(ctrl, cbs)).catch(() => {});

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000);
      }
      await loopPromise;

      // 3 failures + 1 abort trigger = 4 calls
      expect(callCount).toBe(4);
    });
  });
});
