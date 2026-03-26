import { describe, it, expect, vi, beforeEach } from "vitest";
import { markdownToPlainText } from "./send.js";

// ---------------------------------------------------------------------------
// Mocks for send function tests
// ---------------------------------------------------------------------------

vi.mock("../api/api.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../util/random.js", () => ({
  generateId: vi.fn(),
}));

import { sendMessage as sendMessageApi } from "../api/api.js";
import { generateId } from "../util/random.js";
import {
  sendMessageWeixin,
  sendMediaItems,
  sendImageMessageWeixin,
  sendVideoMessageWeixin,
  sendFileMessageWeixin,
} from "./send.js";
import { MessageItemType, MessageType, MessageState } from "../api/types.js";
import type { MessageItem } from "../api/types.js";
import type { UploadedFileInfo } from "../cdn/upload.js";

describe("markdownToPlainText", () => {
  // --- Code blocks ---
  it("strips code block fences and keeps content", () => {
    const input = "```\nconsole.log('hi');\n```";
    expect(markdownToPlainText(input)).toBe("console.log('hi');");
  });

  it("strips code block fences with language identifier", () => {
    const input = "```typescript\nconst x: number = 1;\n```";
    expect(markdownToPlainText(input)).toBe("const x: number = 1;");
  });

  it("strips code block fences with language identifier (python)", () => {
    const input = "```python\ndef foo():\n    return 42\n```";
    expect(markdownToPlainText(input)).toBe("def foo():\n    return 42");
  });

  // --- Images ---
  it("removes images entirely", () => {
    const input = "Check this: ![alt text](https://example.com/img.png) end";
    expect(markdownToPlainText(input)).toBe("Check this:  end");
  });

  it("removes images with empty alt text", () => {
    const input = "![](https://example.com/img.png)";
    expect(markdownToPlainText(input)).toBe("");
  });

  // --- Links ---
  it("keeps link display text, removes URL", () => {
    const input = "Visit [Google](https://google.com) for search.";
    expect(markdownToPlainText(input)).toBe("Visit Google for search.");
  });

  it("handles multiple links", () => {
    const input = "[A](http://a.com) and [B](http://b.com)";
    expect(markdownToPlainText(input)).toBe("A and B");
  });

  // --- Tables ---
  it("converts table rows: strips pipes, joins cells with double space", () => {
    const input = "| Name | Age |\n|------|-----|\n| Alice | 30 |";
    expect(markdownToPlainText(input)).toBe("Name  Age\n\nAlice  30");
  });

  it("removes separator rows from tables", () => {
    const input = "|:---|:---:|---:|";
    expect(markdownToPlainText(input)).toBe("");
  });

  // --- Bold ---
  it("strips bold (double asterisks)", () => {
    expect(markdownToPlainText("This is **bold** text")).toBe("This is bold text");
  });

  it("strips bold (double underscores)", () => {
    expect(markdownToPlainText("This is __bold__ text")).toBe("This is bold text");
  });

  // --- Italic ---
  it("strips italic (single asterisk)", () => {
    expect(markdownToPlainText("This is *italic* text")).toBe("This is italic text");
  });

  it("strips italic (single underscore)", () => {
    expect(markdownToPlainText("This is _italic_ text")).toBe("This is italic text");
  });

  // --- Strikethrough ---
  it("strips strikethrough", () => {
    expect(markdownToPlainText("This is ~~deleted~~ text")).toBe("This is deleted text");
  });

  // --- Headings ---
  it("strips h1 heading marker", () => {
    expect(markdownToPlainText("# Title")).toBe("Title");
  });

  it("strips h3 heading marker", () => {
    expect(markdownToPlainText("### Subtitle")).toBe("Subtitle");
  });

  it("strips h6 heading marker", () => {
    expect(markdownToPlainText("###### Deep heading")).toBe("Deep heading");
  });

  // --- Blockquotes ---
  it("strips blockquote marker", () => {
    expect(markdownToPlainText("> This is quoted")).toBe("This is quoted");
  });

  it("strips blockquote marker with no space after >", () => {
    expect(markdownToPlainText(">No space")).toBe("No space");
  });

  // --- Inline code ---
  it("strips inline code backticks", () => {
    expect(markdownToPlainText("Use `console.log()` for debugging")).toBe(
      "Use console.log() for debugging",
    );
  });

  // --- Horizontal rules ---
  it("removes horizontal rule (---)", () => {
    expect(markdownToPlainText("Above\n---\nBelow")).toBe("Above\n\nBelow");
  });

  it("removes horizontal rule (***)", () => {
    expect(markdownToPlainText("Above\n***\nBelow")).toBe("Above\n\nBelow");
  });

  it("removes horizontal rule (___)", () => {
    expect(markdownToPlainText("Above\n___\nBelow")).toBe("Above\n\nBelow");
  });

  // --- Multiple blank lines ---
  it("collapses 3+ newlines to double newline", () => {
    expect(markdownToPlainText("A\n\n\n\nB")).toBe("A\n\nB");
  });

  // --- Code blocks: fences are stripped, but content is NOT protected from stripMarkdown ---
  it("strips code fences and also applies inline markdown stripping to content", () => {
    // Implementation detail: markdownToPlainText strips fences first,
    // then stripMarkdown runs on the entire result including former code block content
    const input = "```\n**bold** and *italic*\n```";
    expect(markdownToPlainText(input)).toBe("bold and italic");
  });

  it("preserves code content that does not match markdown patterns", () => {
    // /#{1,6}/g does not match the heading regex (^#{1,6}\s+), so it survives stripMarkdown
    const input = "```js\nconst re = /#{1,6}/g;\n```";
    expect(markdownToPlainText(input)).toBe("const re = /#{1,6}/g;");
  });

  // --- Mixed scenario ---
  it("handles mixed markdown content", () => {
    const input = [
      "# Welcome",
      "",
      "This is **important** and *useful*.",
      "",
      "```python",
      "print('hello')",
      "```",
      "",
      "Visit [docs](https://docs.example.com) for more.",
      "",
      "> A wise quote",
      "",
      "---",
      "",
      "End of document.",
    ].join("\n");

    const result = markdownToPlainText(input);
    expect(result).toContain("Welcome");
    expect(result).toContain("important");
    expect(result).toContain("useful");
    expect(result).toContain("print('hello')");
    expect(result).toContain("Visit docs for more.");
    expect(result).toContain("A wise quote");
    expect(result).toContain("End of document.");
    expect(result).not.toContain("**");
    expect(result).not.toContain("```");
    expect(result).not.toContain("](");
    expect(result).not.toContain("---");
  });

  // --- Plain text passthrough ---
  it("passes through plain text unchanged", () => {
    const input = "This is plain text with no markdown.";
    expect(markdownToPlainText(input)).toBe(input);
  });

  it("passes through empty string", () => {
    expect(markdownToPlainText("")).toBe("");
  });

  it("passes through whitespace-only after trim", () => {
    expect(markdownToPlainText("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Send function tests
// ---------------------------------------------------------------------------

describe("send functions", () => {
  const BASE_OPTS = {
    baseUrl: "https://ilinkai.weixin.qq.com",
    token: "test-token",
    contextToken: "ctx-tok-1",
  };

  const UPLOADED: UploadedFileInfo = {
    filekey: "fk-123",
    downloadEncryptedQueryParam: "enc_query_param_abc",
    aeskey: "0123456789abcdef0123456789abcdef", // 32 hex chars = 16 bytes
    fileSize: 1024,
    fileSizeCiphertext: 1040,
  };

  let idCounter: number;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    vi.mocked(generateId).mockImplementation(
      (prefix: string) => `${prefix}:mock-id-${++idCounter}`,
    );
  });

  // -------------------------------------------------------------------------
  // sendMessageWeixin
  // -------------------------------------------------------------------------

  describe("sendMessageWeixin", () => {
    it("warns but still sends when contextToken is missing", async () => {
      const result = await sendMessageWeixin({
        to: "user-1",
        text: "hello",
        opts: { baseUrl: BASE_OPTS.baseUrl, token: BASE_OPTS.token },
      });
      expect(sendMessageApi).toHaveBeenCalledOnce();
      expect(result.messageId).toBeTruthy();
    });

    it("sends correct payload with text message", async () => {
      const result = await sendMessageWeixin({
        to: "user-1",
        text: "hello world",
        opts: BASE_OPTS,
      });

      expect(sendMessageApi).toHaveBeenCalledOnce();
      const call = vi.mocked(sendMessageApi).mock.calls[0][0];
      expect(call.baseUrl).toBe(BASE_OPTS.baseUrl);
      expect(call.token).toBe(BASE_OPTS.token);

      const msg = call.body.msg!;
      expect(msg.to_user_id).toBe("user-1");
      expect(msg.from_user_id).toBe("");
      expect(msg.message_type).toBe(MessageType.BOT);
      expect(msg.message_state).toBe(MessageState.FINISH);
      expect(msg.context_token).toBe("ctx-tok-1");
      expect(msg.item_list).toHaveLength(1);
      expect(msg.item_list![0].type).toBe(MessageItemType.TEXT);
      expect(msg.item_list![0].text_item!.text).toBe("hello world");

      expect(result.messageId).toMatch(/^weixin-bot:mock-id-/);
    });

    it("sends undefined item_list when text is empty", async () => {
      await sendMessageWeixin({
        to: "user-1",
        text: "",
        opts: BASE_OPTS,
      });

      const msg = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
      expect(msg.item_list).toBeUndefined();
    });

    it("uses custom clientIdPrefix", async () => {
      await sendMessageWeixin({
        to: "user-1",
        text: "hi",
        opts: { ...BASE_OPTS, clientIdPrefix: "custom" },
      });

      expect(generateId).toHaveBeenCalledWith("custom");
    });

    it("propagates sendMessageApi errors", async () => {
      const apiError = new Error("network failure");
      vi.mocked(sendMessageApi).mockRejectedValueOnce(apiError);

      await expect(
        sendMessageWeixin({ to: "user-1", text: "hi", opts: BASE_OPTS }),
      ).rejects.toThrow("network failure");
    });
  });

// ---------------------------------------------------------------------------
// sendMediaItems
// ---------------------------------------------------------------------------

describe("sendMediaItems", () => {
  const mediaItem: MessageItem = {
    type: MessageItemType.IMAGE,
    image_item: { mid_size: 1040 },
  };

  it("sends only mediaItem when text is empty and returns its clientId", async () => {
    const result = await sendMediaItems({
      to: "user-1",
      text: "",
      mediaItem,
      opts: BASE_OPTS,
      label: "test",
    });

    expect(sendMessageApi).toHaveBeenCalledOnce();
    const msg = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
    expect(msg.item_list).toHaveLength(1);
    expect(msg.item_list![0].type).toBe(MessageItemType.IMAGE);
    expect(result.messageId).toBe(msg.client_id);
  });

  it("sends text and mediaItem as separate requests", async () => {
    await sendMediaItems({
      to: "user-1",
      text: "caption text",
      mediaItem,
      opts: BASE_OPTS,
      label: "test",
    });

    expect(sendMessageApi).toHaveBeenCalledTimes(2);

    // First call: TEXT item
    const msg1 = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
    expect(msg1.item_list![0].type).toBe(MessageItemType.TEXT);
    expect(msg1.item_list![0].text_item!.text).toBe("caption text");

    // Second call: media item
    const msg2 = vi.mocked(sendMessageApi).mock.calls[1][0].body.msg!;
    expect(msg2.item_list![0].type).toBe(MessageItemType.IMAGE);
  });

  it("uses independent clientId for each request", async () => {
    await sendMediaItems({
      to: "user-1",
      text: "caption",
      mediaItem,
      opts: BASE_OPTS,
      label: "test",
    });

    const clientId1 = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!.client_id;
    const clientId2 = vi.mocked(sendMessageApi).mock.calls[1][0].body.msg!.client_id;
    expect(clientId1).not.toBe(clientId2);
  });

  it("returns last clientId as messageId", async () => {
    const result = await sendMediaItems({
      to: "user-1",
      text: "caption",
      mediaItem,
      opts: BASE_OPTS,
      label: "test",
    });

    const lastClientId = vi.mocked(sendMessageApi).mock.calls[1][0].body.msg!.client_id;
    expect(result.messageId).toBe(lastClientId);
  });

  it("propagates errors from sendMessageApi", async () => {
    vi.mocked(sendMessageApi).mockRejectedValueOnce(new Error("send failed"));

    await expect(
      sendMediaItems({
        to: "user-1",
        text: "",
        mediaItem,
        opts: BASE_OPTS,
        label: "test",
      }),
    ).rejects.toThrow("send failed");
  });
});

// ---------------------------------------------------------------------------
// sendImageMessageWeixin
// ---------------------------------------------------------------------------

describe("sendImageMessageWeixin", () => {
  it("warns but still sends when contextToken is missing", async () => {
    const result = await sendImageMessageWeixin({
      to: "user-1",
      text: "",
      uploaded: UPLOADED,
      opts: { baseUrl: BASE_OPTS.baseUrl, token: BASE_OPTS.token },
    });
    expect(sendMessageApi).toHaveBeenCalled();
    expect(result.messageId).toBeTruthy();
  });

  it("constructs correct image_item and delegates to sendMessageApi", async () => {
    await sendImageMessageWeixin({
      to: "user-1",
      text: "",
      uploaded: UPLOADED,
      opts: BASE_OPTS,
    });

    expect(sendMessageApi).toHaveBeenCalled();
    const msg = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
    const imageItem = msg.item_list![0];

    expect(imageItem.type).toBe(MessageItemType.IMAGE);
    expect(imageItem.image_item!.media!.encrypt_query_param).toBe("enc_query_param_abc");
    expect(imageItem.image_item!.media!.aes_key).toBe(
      Buffer.from(UPLOADED.aeskey).toString("base64"),
    );
    expect(imageItem.image_item!.media!.encrypt_type).toBe(1);
    expect(imageItem.image_item!.mid_size).toBe(1040);
  });

  it("sends text caption as separate request before image", async () => {
    await sendImageMessageWeixin({
      to: "user-1",
      text: "check this image",
      uploaded: UPLOADED,
      opts: BASE_OPTS,
    });

    expect(sendMessageApi).toHaveBeenCalledTimes(2);
    const firstItem = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!.item_list![0];
    expect(firstItem.type).toBe(MessageItemType.TEXT);
  });
});

// ---------------------------------------------------------------------------
// sendVideoMessageWeixin
// ---------------------------------------------------------------------------

describe("sendVideoMessageWeixin", () => {
  it("warns but still sends when contextToken is missing", async () => {
    const result = await sendVideoMessageWeixin({
      to: "user-1",
      text: "",
      uploaded: UPLOADED,
      opts: { baseUrl: BASE_OPTS.baseUrl, token: BASE_OPTS.token },
    });
    expect(sendMessageApi).toHaveBeenCalled();
    expect(result.messageId).toBeTruthy();
  });

  it("constructs correct video_item", async () => {
    await sendVideoMessageWeixin({
      to: "user-1",
      text: "",
      uploaded: UPLOADED,
      opts: BASE_OPTS,
    });

    const msg = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
    const videoItem = msg.item_list![0];

    expect(videoItem.type).toBe(MessageItemType.VIDEO);
    expect(videoItem.video_item!.media!.encrypt_query_param).toBe("enc_query_param_abc");
    expect(videoItem.video_item!.media!.aes_key).toBe(
      Buffer.from(UPLOADED.aeskey).toString("base64"),
    );
    expect(videoItem.video_item!.media!.encrypt_type).toBe(1);
    expect(videoItem.video_item!.video_size).toBe(1040);
  });
});

// ---------------------------------------------------------------------------
// sendFileMessageWeixin
// ---------------------------------------------------------------------------

describe("sendFileMessageWeixin", () => {
  it("warns but still sends when contextToken is missing", async () => {
    const result = await sendFileMessageWeixin({
      to: "user-1",
      text: "",
      fileName: "doc.pdf",
      uploaded: UPLOADED,
      opts: { baseUrl: BASE_OPTS.baseUrl, token: BASE_OPTS.token },
    });
    expect(sendMessageApi).toHaveBeenCalled();
    expect(result.messageId).toBeTruthy();
  });

  it("constructs correct file_item with fileName and len as string", async () => {
    await sendFileMessageWeixin({
      to: "user-1",
      text: "",
      fileName: "report.pdf",
      uploaded: UPLOADED,
      opts: BASE_OPTS,
    });

    const msg = vi.mocked(sendMessageApi).mock.calls[0][0].body.msg!;
    const fileItem = msg.item_list![0];

    expect(fileItem.type).toBe(MessageItemType.FILE);
    expect(fileItem.file_item!.media!.encrypt_query_param).toBe("enc_query_param_abc");
    expect(fileItem.file_item!.media!.aes_key).toBe(
      Buffer.from(UPLOADED.aeskey).toString("base64"),
    );
    expect(fileItem.file_item!.media!.encrypt_type).toBe(1);
    expect(fileItem.file_item!.file_name).toBe("report.pdf");
    expect(fileItem.file_item!.len).toBe("1024");
  });
});
}); // end describe("send functions")
