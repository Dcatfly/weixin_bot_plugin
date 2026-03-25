import { logger } from "../util/logger.js";

export const SESSION_EXPIRED_ERRCODE = -14;

const pausedAccounts = new Set<string>();

export function pauseSession(accountId: string): void {
  pausedAccounts.add(accountId);
  logger.info(`session-guard: paused accountId=${accountId}, waiting for manual re-login`);
}

export function isSessionPaused(accountId: string): boolean {
  return pausedAccounts.has(accountId);
}

export function resetSession(accountId: string): void {
  pausedAccounts.delete(accountId);
  logger.info(`session-guard: reset accountId=${accountId}`);
}

export function assertSessionActive(accountId: string): void {
  if (isSessionPaused(accountId)) {
    throw new Error(`session paused for accountId=${accountId}, please re-login`);
  }
}
