import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  setSyncStateDir,
  getSyncBufFilePath,
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
} from "./sync-buf.js";

describe("sync-buf", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weixin-test-"));
    setSyncStateDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("save + load round-trip returns the same value", () => {
    const filePath = getSyncBufFilePath("account-1");
    const buf = "some-opaque-buffer-string-12345";

    saveGetUpdatesBuf(filePath, buf);
    const loaded = loadGetUpdatesBuf(filePath);

    expect(loaded).toBe(buf);
  });

  it("load returns undefined when file does not exist", () => {
    const filePath = getSyncBufFilePath("nonexistent-account");
    const loaded = loadGetUpdatesBuf(filePath);

    expect(loaded).toBeUndefined();
  });

  it("getSyncBufFilePath returns correct path format", () => {
    const accountId = "my-account";
    const filePath = getSyncBufFilePath(accountId);

    expect(filePath).toBe(path.join(tmpDir, "sync", `${accountId}.sync.json`));
  });
});
