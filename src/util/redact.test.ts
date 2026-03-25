import { describe, it, expect } from "vitest";
import { truncate, redactToken, redactBody, redactUrl } from "./redact.js";

describe("truncate", () => {
  it("returns empty string for undefined", () => {
    expect(truncate(undefined, 10)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("returns original string when within max length", () => {
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and appends length info when exceeding max", () => {
    expect(truncate("hello world", 5)).toBe("hello…(len=11)");
  });

  it("handles max = 0", () => {
    expect(truncate("abc", 0)).toBe("…(len=3)");
  });
});

describe("redactToken", () => {
  it("returns '(none)' for undefined", () => {
    expect(redactToken(undefined)).toBe("(none)");
  });

  it("returns '(none)' for empty string", () => {
    expect(redactToken("")).toBe("(none)");
  });

  it("masks short token that is within prefixLen", () => {
    expect(redactToken("abc")).toBe("****(len=3)");
    expect(redactToken("123456")).toBe("****(len=6)");
  });

  it("shows prefix and length for longer token", () => {
    expect(redactToken("abcdefghij")).toBe("abcdef…(len=10)");
  });

  it("respects custom prefixLen", () => {
    expect(redactToken("abcdefghij", 3)).toBe("abc…(len=10)");
    expect(redactToken("ab", 3)).toBe("****(len=2)");
  });
});

describe("redactBody", () => {
  it("returns '(empty)' for undefined", () => {
    expect(redactBody(undefined)).toBe("(empty)");
  });

  it("returns '(empty)' for empty string", () => {
    expect(redactBody("")).toBe("(empty)");
  });

  it("returns original body when within default maxLen", () => {
    const body = "a".repeat(200);
    expect(redactBody(body)).toBe(body);
  });

  it("truncates body exceeding default maxLen", () => {
    const body = "a".repeat(201);
    expect(redactBody(body)).toBe("a".repeat(200) + "…(truncated, totalLen=201)");
  });

  it("respects custom maxLen", () => {
    expect(redactBody("hello world", 5)).toBe("hello…(truncated, totalLen=11)");
  });
});

describe("redactUrl", () => {
  it("returns URL without query string as-is (origin + pathname)", () => {
    expect(redactUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("redacts query parameters", () => {
    expect(redactUrl("https://example.com/path?token=secret&key=value")).toBe(
      "https://example.com/path?<redacted>",
    );
  });

  it("handles URL with no pathname beyond root", () => {
    expect(redactUrl("https://example.com")).toBe("https://example.com/");
  });

  it("handles URL with only query string", () => {
    expect(redactUrl("https://example.com?secret=123")).toBe(
      "https://example.com/?<redacted>",
    );
  });

  it("falls back to truncate for invalid URL", () => {
    expect(redactUrl("not-a-url")).toBe("not-a-url");
  });

  it("truncates long invalid URL to 80 characters", () => {
    const longInvalid = "x".repeat(100);
    expect(redactUrl(longInvalid)).toBe("x".repeat(80) + "…(len=100)");
  });
});
