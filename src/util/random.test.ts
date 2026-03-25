import { describe, it, expect } from "vitest";
import { generateId, tempFileName } from "./random.js";

describe("generateId", () => {
  it("starts with the given prefix followed by colon", () => {
    const id = generateId("msg");
    expect(id.startsWith("msg:")).toBe(true);
  });

  it("matches expected format: prefix:timestamp-hex", () => {
    const id = generateId("test");
    // prefix:digits-8hexchars
    expect(id).toMatch(/^test:\d+-[0-9a-f]{8}$/);
  });

  it("generates unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateId("u")));
    expect(ids.size).toBe(20);
  });

  it("works with empty prefix", () => {
    const id = generateId("");
    expect(id).toMatch(/^:\d+-[0-9a-f]{8}$/);
  });
});

describe("tempFileName", () => {
  it("starts with the given prefix", () => {
    const name = tempFileName("img", ".png");
    expect(name.startsWith("img-")).toBe(true);
  });

  it("ends with the given extension", () => {
    const name = tempFileName("img", ".png");
    expect(name.endsWith(".png")).toBe(true);
  });

  it("matches expected format: prefix-timestamp-hex.ext", () => {
    const name = tempFileName("file", ".txt");
    expect(name).toMatch(/^file-\d+-[0-9a-f]{8}\.txt$/);
  });

  it("generates unique values on successive calls", () => {
    const names = new Set(Array.from({ length: 20 }, () => tempFileName("f", ".tmp")));
    expect(names.size).toBe(20);
  });

  it("handles extension without leading dot", () => {
    const name = tempFileName("audio", "wav");
    expect(name).toMatch(/^audio-\d+-[0-9a-f]{8}wav$/);
  });
});
