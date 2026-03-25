import { describe, it, expect } from "vitest";
import {
  getMimeFromFilename,
  getExtensionFromMime,
  getExtensionFromBuffer,
  getExtensionFromContentTypeOrUrl,
} from "./mime.js";

describe("getMimeFromFilename", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(getMimeFromFilename("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getMimeFromFilename("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getMimeFromFilename("screenshot.png")).toBe("image/png");
  });

  it("returns application/pdf for .pdf", () => {
    expect(getMimeFromFilename("document.pdf")).toBe("application/pdf");
  });

  it("returns video/mp4 for .mp4", () => {
    expect(getMimeFromFilename("clip.mp4")).toBe("video/mp4");
  });

  it("returns audio/mpeg for .mp3", () => {
    expect(getMimeFromFilename("song.mp3")).toBe("audio/mpeg");
  });

  it("returns text/plain for .txt", () => {
    expect(getMimeFromFilename("notes.txt")).toBe("text/plain");
  });

  it("returns application/zip for .zip", () => {
    expect(getMimeFromFilename("archive.zip")).toBe("application/zip");
  });

  it("handles uppercase extensions via path.extname + toLowerCase", () => {
    expect(getMimeFromFilename("PHOTO.JPG")).toBe("image/jpeg");
  });

  it("returns application/octet-stream for unknown extension", () => {
    expect(getMimeFromFilename("data.xyz")).toBe("application/octet-stream");
  });

  it("returns application/octet-stream for file with no extension", () => {
    expect(getMimeFromFilename("Makefile")).toBe("application/octet-stream");
  });
});

describe("getExtensionFromMime", () => {
  it("returns .jpg for image/jpeg", () => {
    expect(getExtensionFromMime("image/jpeg")).toBe(".jpg");
  });

  it("returns .jpg for image/jpg (alias)", () => {
    expect(getExtensionFromMime("image/jpg")).toBe(".jpg");
  });

  it("returns .png for image/png", () => {
    expect(getExtensionFromMime("image/png")).toBe(".png");
  });

  it("returns .pdf for application/pdf", () => {
    expect(getExtensionFromMime("application/pdf")).toBe(".pdf");
  });

  it("returns .mp4 for video/mp4", () => {
    expect(getExtensionFromMime("video/mp4")).toBe(".mp4");
  });

  it("returns .txt for text/plain", () => {
    expect(getExtensionFromMime("text/plain")).toBe(".txt");
  });

  it("strips parameters before lookup (image/jpeg; charset=utf-8)", () => {
    expect(getExtensionFromMime("image/jpeg; charset=utf-8")).toBe(".jpg");
  });

  it("strips parameters before lookup (text/plain; charset=us-ascii)", () => {
    expect(getExtensionFromMime("text/plain; charset=us-ascii")).toBe(".txt");
  });

  it("handles uppercase MIME by lowercasing", () => {
    expect(getExtensionFromMime("IMAGE/PNG")).toBe(".png");
  });

  it("returns .bin for unknown MIME type", () => {
    expect(getExtensionFromMime("application/x-unknown")).toBe(".bin");
  });

  it("returns .bin for empty string", () => {
    expect(getExtensionFromMime("")).toBe(".bin");
  });
});

describe("getExtensionFromBuffer", () => {
  it("detects JPEG (FF D8 FF)", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(getExtensionFromBuffer(buf)).toBe(".jpg");
  });

  it("detects PNG (89 50 4E 47)", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(getExtensionFromBuffer(buf)).toBe(".png");
  });

  it("detects GIF (47 49 46 38)", () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(getExtensionFromBuffer(buf)).toBe(".gif");
  });

  it("detects BMP (42 4D)", () => {
    const buf = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
    expect(getExtensionFromBuffer(buf)).toBe(".bmp");
  });

  it("detects WebP (RIFF...WEBP)", () => {
    // RIFF????WEBP
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(getExtensionFromBuffer(buf)).toBe(".webp");
  });

  it("returns default extension when buffer is too short (< 4 bytes)", () => {
    const buf = Buffer.from([0x00, 0x01]);
    // Prove it's the early-return path, not magic-byte detection
    expect(getExtensionFromBuffer(buf, ".bin")).toBe(".bin");
  });

  it("returns custom default extension when buffer is too short", () => {
    const buf = Buffer.from([0x00]);
    expect(getExtensionFromBuffer(buf, ".png")).toBe(".png");
  });

  it("returns default extension for unknown magic bytes", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(getExtensionFromBuffer(buf)).toBe(".jpg");
  });

  it("returns custom default extension for unknown magic bytes", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(getExtensionFromBuffer(buf, ".bin")).toBe(".bin");
  });

  it("returns default for empty buffer", () => {
    const buf = Buffer.alloc(0);
    expect(getExtensionFromBuffer(buf)).toBe(".jpg");
  });
});

describe("getExtensionFromContentTypeOrUrl", () => {
  it("prioritizes Content-Type over URL", () => {
    expect(
      getExtensionFromContentTypeOrUrl("image/png", "https://example.com/photo.jpg"),
    ).toBe(".png");
  });

  it("falls back to URL extension when Content-Type is unknown", () => {
    expect(
      getExtensionFromContentTypeOrUrl("application/x-unknown", "https://example.com/file.pdf"),
    ).toBe(".pdf");
  });

  it("falls back to URL extension when Content-Type is null", () => {
    expect(
      getExtensionFromContentTypeOrUrl(null, "https://example.com/archive.zip"),
    ).toBe(".zip");
  });

  it("returns .bin when both Content-Type and URL extension are unknown", () => {
    expect(
      getExtensionFromContentTypeOrUrl("application/x-unknown", "https://example.com/data"),
    ).toBe(".bin");
  });

  it("returns .bin when Content-Type is null and URL has unknown extension", () => {
    expect(
      getExtensionFromContentTypeOrUrl(null, "https://example.com/file.xyz"),
    ).toBe(".bin");
  });

  it("handles Content-Type with parameters", () => {
    expect(
      getExtensionFromContentTypeOrUrl("image/jpeg; charset=utf-8", "https://example.com/x"),
    ).toBe(".jpg");
  });

  it("throws on invalid URL when Content-Type does not resolve", () => {
    expect(() =>
      getExtensionFromContentTypeOrUrl(null, "not-a-valid-url"),
    ).toThrow();
  });

  it("throws on invalid URL when Content-Type maps to .bin", () => {
    expect(() =>
      getExtensionFromContentTypeOrUrl("application/x-unknown", ":::invalid"),
    ).toThrow();
  });
});
