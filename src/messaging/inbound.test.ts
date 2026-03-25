import { describe, it, expect } from "vitest";
import {
  isMediaItem,
  bodyFromItemList,
  setContextToken,
  getContextToken,
} from "./inbound.js";
import { MessageItemType } from "../api/types.js";
import type { MessageItem } from "../api/types.js";

describe("isMediaItem", () => {
  it("returns true for IMAGE (type 2)", () => {
    expect(isMediaItem({ type: MessageItemType.IMAGE })).toBe(true);
  });

  it("returns true for VIDEO (type 5)", () => {
    expect(isMediaItem({ type: MessageItemType.VIDEO })).toBe(true);
  });

  it("returns true for FILE (type 4)", () => {
    expect(isMediaItem({ type: MessageItemType.FILE })).toBe(true);
  });

  it("returns true for VOICE (type 3)", () => {
    expect(isMediaItem({ type: MessageItemType.VOICE })).toBe(true);
  });

  it("returns false for TEXT (type 1)", () => {
    expect(isMediaItem({ type: MessageItemType.TEXT })).toBe(false);
  });

  it("returns false for NONE (type 0)", () => {
    expect(isMediaItem({ type: MessageItemType.NONE })).toBe(false);
  });

  it("returns false for undefined type", () => {
    expect(isMediaItem({})).toBe(false);
  });
});

describe("bodyFromItemList", () => {
  it("returns empty string for undefined item list", () => {
    expect(bodyFromItemList(undefined)).toBe("");
  });

  it("returns empty string for empty item list", () => {
    expect(bodyFromItemList([])).toBe("");
  });

  it("extracts plain text from TEXT item", () => {
    const items: MessageItem[] = [
      { type: MessageItemType.TEXT, text_item: { text: "Hello, world!" } },
    ];
    expect(bodyFromItemList(items)).toBe("Hello, world!");
  });

  it("extracts text from first matching TEXT item", () => {
    const items: MessageItem[] = [
      { type: MessageItemType.TEXT, text_item: { text: "First" } },
      { type: MessageItemType.TEXT, text_item: { text: "Second" } },
    ];
    expect(bodyFromItemList(items)).toBe("First");
  });

  it("returns empty string when TEXT item has no text_item", () => {
    const items: MessageItem[] = [
      { type: MessageItemType.TEXT },
    ];
    expect(bodyFromItemList(items)).toBe("");
  });

  it("returns empty string when text_item.text is null", () => {
    const items: MessageItem[] = [
      { type: MessageItemType.TEXT, text_item: { text: undefined } },
    ];
    expect(bodyFromItemList(items)).toBe("");
  });

  // --- Quoted text messages (ref_msg with text) ---
  it("includes quoted text reference with title", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "My reply" },
        ref_msg: {
          title: "Original sender",
          message_item: {
            type: MessageItemType.TEXT,
            text_item: { text: "Original message" },
          },
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe(
      "[引用: Original sender | Original message]\nMy reply",
    );
  });

  it("includes quoted text reference with title only (no message_item body)", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "Reply" },
        ref_msg: {
          title: "Sender name",
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe("[引用: Sender name]\nReply");
  });

  it("includes quoted text reference with message_item only (no title)", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "Reply" },
        ref_msg: {
          message_item: {
            type: MessageItemType.TEXT,
            text_item: { text: "Quoted text" },
          },
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe("[引用: Quoted text]\nReply");
  });

  // --- Quoted media messages ---
  it("returns only current text when quoting a media (IMAGE) message", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "Check this image" },
        ref_msg: {
          title: "Photo",
          message_item: {
            type: MessageItemType.IMAGE,
            image_item: { url: "https://example.com/img.jpg" },
          },
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe("Check this image");
  });

  it("returns only current text when quoting a VIDEO message", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "About this video" },
        ref_msg: {
          message_item: { type: MessageItemType.VIDEO },
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe("About this video");
  });

  it("returns only current text when quoting a FILE message", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "See attached" },
        ref_msg: {
          message_item: { type: MessageItemType.FILE },
        },
      },
    ];
    expect(bodyFromItemList(items)).toBe("See attached");
  });

  // --- Voice to text ---
  it("extracts voice-to-text from VOICE item", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.VOICE,
        voice_item: { text: "This is a voice message transcription" },
      },
    ];
    expect(bodyFromItemList(items)).toBe("This is a voice message transcription");
  });

  it("returns empty string for VOICE item without text", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.VOICE,
        voice_item: { encode_type: 6 },
      },
    ];
    expect(bodyFromItemList(items)).toBe("");
  });

  // --- Mixed items: text takes priority over voice ---
  it("returns text from TEXT item even if VOICE item follows", () => {
    const items: MessageItem[] = [
      { type: MessageItemType.TEXT, text_item: { text: "Text first" } },
      { type: MessageItemType.VOICE, voice_item: { text: "Voice second" } },
    ];
    expect(bodyFromItemList(items)).toBe("Text first");
  });

  // --- ref_msg with empty parts ---
  it("returns plain text when ref_msg has no title and no message_item", () => {
    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text: "Just a reply" },
        ref_msg: {},
      },
    ];
    expect(bodyFromItemList(items)).toBe("Just a reply");
  });
});

describe("setContextToken / getContextToken", () => {
  it("returns correct token after set", () => {
    setContextToken("chat-ct-1", "token-abc");
    expect(getContextToken("chat-ct-1")).toBe("token-abc");
  });

  it("overwrites previous value on second set", () => {
    setContextToken("chat-ct-2", "token-first");
    setContextToken("chat-ct-2", "token-second");
    expect(getContextToken("chat-ct-2")).toBe("token-second");
  });

  it("returns undefined for never-set chatId", () => {
    expect(getContextToken("chat-ct-never-set")).toBeUndefined();
  });

  it("different chatIds are independent", () => {
    setContextToken("chat-ct-3a", "token-a");
    setContextToken("chat-ct-3b", "token-b");
    expect(getContextToken("chat-ct-3a")).toBe("token-a");
    expect(getContextToken("chat-ct-3b")).toBe("token-b");
  });
});
