import { describe, it, expect } from "vitest";
import {
  pauseSession,
  isSessionPaused,
  resetSession,
  assertSessionActive,
} from "./session-guard.js";

describe("session-guard", () => {
  it("isSessionPaused returns false for a fresh accountId", () => {
    expect(isSessionPaused("fresh-account-1")).toBe(false);
  });

  it("isSessionPaused returns true after pauseSession", () => {
    const id = "pause-test-1";
    pauseSession(id);
    expect(isSessionPaused(id)).toBe(true);
    // cleanup
    resetSession(id);
  });

  it("resetSession restores isSessionPaused to false", () => {
    const id = "reset-test-1";
    pauseSession(id);
    expect(isSessionPaused(id)).toBe(true);
    resetSession(id);
    expect(isSessionPaused(id)).toBe(false);
  });

  it("resetSession on never-paused account does not throw", () => {
    expect(() => resetSession("never-paused-1")).not.toThrow();
  });

  it("assertSessionActive does not throw when session is active", () => {
    expect(() => assertSessionActive("active-account-1")).not.toThrow();
  });

  it("assertSessionActive throws when session is paused", () => {
    const id = "assert-paused-1";
    pauseSession(id);
    expect(() => assertSessionActive(id)).toThrow(
      `session paused for accountId=${id}, please re-login`,
    );
    // cleanup
    resetSession(id);
  });

  it("assertSessionActive does not throw after reset", () => {
    const id = "assert-reset-1";
    pauseSession(id);
    resetSession(id);
    expect(() => assertSessionActive(id)).not.toThrow();
  });

  it("different accountIds do not affect each other", () => {
    const idA = "isolated-a";
    const idB = "isolated-b";
    pauseSession(idA);
    expect(isSessionPaused(idA)).toBe(true);
    expect(isSessionPaused(idB)).toBe(false);
    expect(() => assertSessionActive(idB)).not.toThrow();
    // cleanup
    resetSession(idA);
  });

  it("pausing the same account twice is idempotent", () => {
    const id = "double-pause-1";
    pauseSession(id);
    pauseSession(id);
    expect(isSessionPaused(id)).toBe(true);
    resetSession(id);
    expect(isSessionPaused(id)).toBe(false);
  });
});
