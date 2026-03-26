import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  setStateDir,
  normalizeAccountId,
  saveWeixinAccount,
  loadWeixinAccount,
  registerWeixinAccountId,
  listIndexedWeixinAccountIds,
  removeWeixinAccount,
  resolveWeixinAccount,
  DEFAULT_BASE_URL,
} from "./accounts.js";
import { setSyncStateDir } from "../storage/sync-buf.js";

describe("accounts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weixin-test-"));
    setStateDir(tmpDir);
    setSyncStateDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("normalizeAccountId", () => {
    it("replaces @ and . with -", () => {
      expect(normalizeAccountId("user@weixin.com")).toBe("user-weixin-com");
    });
  });

  describe("save + load", () => {
    it("round-trip returns the same data", () => {
      saveWeixinAccount("test", { token: "abc", baseUrl: "https://example.com" });
      const data = loadWeixinAccount("test");

      expect(data).not.toBeNull();
      expect(data!.token).toBe("abc");
      expect(data!.baseUrl).toBe("https://example.com");
    });

    it("merges fields across multiple saves", () => {
      saveWeixinAccount("test", { token: "abc" });
      saveWeixinAccount("test", { baseUrl: "https://example.com" });

      const data = loadWeixinAccount("test");
      expect(data).not.toBeNull();
      expect(data!.token).toBe("abc");
      expect(data!.baseUrl).toBe("https://example.com");
    });

    it("clears userId when saved with empty string", () => {
      saveWeixinAccount("test", { token: "t", userId: "initial" });
      const before = loadWeixinAccount("test");
      expect(before!.userId).toBe("initial");

      saveWeixinAccount("test", { userId: "" });
      const after = loadWeixinAccount("test");
      expect(after!.userId).toBeUndefined();
    });
  });

  describe("load", () => {
    it("returns null when account does not exist", () => {
      const data = loadWeixinAccount("nonexistent");
      expect(data).toBeNull();
    });
  });

  describe("register + list", () => {
    it("registers and lists account IDs without duplicates", () => {
      registerWeixinAccountId("acct-1");
      registerWeixinAccountId("acct-2");
      registerWeixinAccountId("acct-1"); // duplicate

      const ids = listIndexedWeixinAccountIds();
      expect(ids).toEqual(["acct-1", "acct-2"]);
    });
  });

  describe("remove", () => {
    it("removes account so load returns null and list excludes it", () => {
      saveWeixinAccount("acct-rm", { token: "x" });
      registerWeixinAccountId("acct-rm");

      removeWeixinAccount("acct-rm");

      expect(loadWeixinAccount("acct-rm")).toBeNull();
      expect(listIndexedWeixinAccountIds()).not.toContain("acct-rm");
    });

    it("removes context-tokens file when present", () => {
      saveWeixinAccount("acct-rm-ctx", { token: "x" });
      registerWeixinAccountId("acct-rm-ctx");

      // Create a context-tokens file manually
      const ctxFile = path.join(tmpDir, "accounts", "acct-rm-ctx.context-tokens.json");
      fs.writeFileSync(ctxFile, JSON.stringify({ "chat-1": "tok-1" }));
      expect(fs.existsSync(ctxFile)).toBe(true);

      removeWeixinAccount("acct-rm-ctx");

      expect(fs.existsSync(ctxFile)).toBe(false);
      expect(loadWeixinAccount("acct-rm-ctx")).toBeNull();
      expect(listIndexedWeixinAccountIds()).not.toContain("acct-rm-ctx");
    });
  });

  describe("resolveWeixinAccount", () => {
    it("returns defaults when no data exists", () => {
      const resolved = resolveWeixinAccount("fresh");

      expect(resolved.accountId).toBe("fresh");
      expect(resolved.configured).toBe(false);
      expect(resolved.baseUrl).toBe(DEFAULT_BASE_URL);
      expect(resolved.token).toBeUndefined();
      expect(resolved.userId).toBeUndefined();
    });
  });
});
