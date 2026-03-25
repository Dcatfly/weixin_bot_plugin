import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";

import {
  setStateDir,
  listIndexedWeixinAccountIds,
  resolveWeixinAccount,
  saveWeixinAccount,
  registerWeixinAccountId,
  removeWeixinAccount,
  normalizeAccountId,
  DEFAULT_BASE_URL,
} from "./auth/accounts.js";
import type { ResolvedWeixinAccount } from "./auth/accounts.js";
import {
  startWeixinLoginWithQr,
  waitForWeixinLogin,
  DEFAULT_ILINK_BOT_TYPE,
} from "./auth/login-qr.js";
import { setSyncStateDir } from "./storage/sync-buf.js";
import { setChannelVersion, sendTyping } from "./api/api.js";
import { WeixinConfigManager } from "./api/config-cache.js";
import { resetSession, isSessionPaused, pauseSession } from "./api/session-guard.js";
import { TypingStatus } from "./api/types.js";
import { setContextToken, getContextToken } from "./messaging/inbound.js";
import { sendMessageWeixin, markdownToPlainText } from "./messaging/send.js";
import { sendWeixinMediaFile } from "./messaging/send-media.js";
import { cleanupTempMedia } from "./media/media-download.js";
import { startPollLoop } from "./poll/poll-loop.js";
import type { InboundMessage } from "./poll/poll-loop.js";
import { logger } from "./util/logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WeixinBotConfig {
  stateDir?: string;
  tempDir?: string;
  channelVersion?: string;
  clientIdPrefix?: string;
}

export interface QrLoginResult {
  qrcodeUrl?: string;
  qrAscii?: string;
  message: string;
  sessionKey: string;
}

export interface ConnectionStatus {
  connected: boolean;
  accountId?: string;
  userId?: string;
  sessionPaused: boolean;
  lastInboundAt?: number;
  pollLoopRunning: boolean;
}

// ---------------------------------------------------------------------------
// Internal resolved config
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  stateDir: string;
  tempDir: string;
  channelVersion?: string;
  clientIdPrefix: string;
}

// ---------------------------------------------------------------------------
// Typing state entry
// ---------------------------------------------------------------------------

interface TypingEntry {
  timer: ReturnType<typeof setInterval>;
  chatId: string;
}

// ---------------------------------------------------------------------------
// Typed events
// ---------------------------------------------------------------------------

export interface WeixinBotEvents {
  message: [msg: InboundMessage];
  loginSuccess: [accountId: string];
  qrRefresh: [info: { qrcodeUrl: string; qrAscii?: string }];
  sessionExpired: [accountId: string];
  error: [err: Error];
}

export interface WeixinBotClient {
  on<K extends keyof WeixinBotEvents>(event: K, listener: (...args: WeixinBotEvents[K]) => void): this;
  once<K extends keyof WeixinBotEvents>(event: K, listener: (...args: WeixinBotEvents[K]) => void): this;
  emit<K extends keyof WeixinBotEvents>(event: K, ...args: WeixinBotEvents[K]): boolean;
  off<K extends keyof WeixinBotEvents>(event: K, listener: (...args: WeixinBotEvents[K]) => void): this;
  removeAllListeners<K extends keyof WeixinBotEvents>(event?: K): this;
}

// ---------------------------------------------------------------------------
// WeixinBotClient
// ---------------------------------------------------------------------------

export class WeixinBotClient extends EventEmitter {
  readonly config: ResolvedConfig;

  private currentAccount?: ResolvedWeixinAccount;
  private pollAbortController?: AbortController;
  private lastInboundAt?: number;
  private pollLoopRunning = false;
  private typingStates = new Map<string, TypingEntry>();
  private configManager?: WeixinConfigManager;

  constructor(config?: WeixinBotConfig) {
    super();

    const stateDir = config?.stateDir ?? path.join(os.homedir(), ".weixin-bot");
    const tempDir = config?.tempDir ?? path.join(os.tmpdir(), "weixin-bot");
    const clientIdPrefix = config?.clientIdPrefix ?? "weixin-bot";

    this.config = {
      stateDir,
      tempDir,
      channelVersion: config?.channelVersion,
      clientIdPrefix,
    };

    setStateDir(stateDir);
    setSyncStateDir(stateDir);

    if (config?.channelVersion) {
      setChannelVersion(config.channelVersion);
    }
  }

  // -----------------------------------------------------------------------
  // start / stop
  // -----------------------------------------------------------------------

  async start(accountId?: string): Promise<boolean> {
    if (!accountId) {
      const ids = listIndexedWeixinAccountIds();
      if (ids.length === 0) {
        logger.warn("WeixinBotClient.start: no registered accounts found");
        return false;
      }
      accountId = ids[0];
    }

    const account = resolveWeixinAccount(accountId);
    if (!account.configured || !account.userId) {
      logger.warn(
        `WeixinBotClient.start: account ${accountId} not configured or missing userId`,
      );
      return false;
    }

    this.currentAccount = account;

    this.configManager = new WeixinConfigManager(
      { baseUrl: account.baseUrl, token: account.token },
      (msg) => logger.info(msg),
    );

    this.pollAbortController = new AbortController();

    const pollOpts = {
      baseUrl: account.baseUrl,
      cdnBaseUrl: account.cdnBaseUrl,
      token: account.token,
      accountId: account.accountId,
      allowedUserId: account.userId,
      abortSignal: this.pollAbortController.signal,
      tempDir: this.config.tempDir,
      callbacks: {
        onMessage: async (msg: InboundMessage) => {
          setContextToken(msg.chatId, msg.raw.context_token!);
          this.lastInboundAt = Date.now();
          this.emit("message", msg);
        },
        onSessionExpired: async (expiredAccountId: string) => {
          pauseSession(expiredAccountId);
          this.stopAllTyping();
          this.pollLoopRunning = false;
          this.emit("sessionExpired", expiredAccountId);
        },
        onStatusChange: (running: boolean) => {
          this.pollLoopRunning = running;
        },
      },
    };

    // startPollLoop is an infinite loop; do not await it
    startPollLoop(pollOpts).catch((err) => {
      logger.error(`WeixinBotClient: poll-loop error: ${String(err)}`);
      this.pollLoopRunning = false;
      this.emit("error", err);
    });

    return true;
  }

  stop(): void {
    this.pollAbortController?.abort();
    this.stopAllTyping();
    this.pollLoopRunning = false;
    this.currentAccount = undefined;
  }

  // -----------------------------------------------------------------------
  // login / logout
  // -----------------------------------------------------------------------

  async login(): Promise<QrLoginResult> {
    const apiBaseUrl = this.currentAccount?.baseUrl ?? DEFAULT_BASE_URL;

    const startResult = await startWeixinLoginWithQr({
      apiBaseUrl,
      botType: DEFAULT_ILINK_BOT_TYPE,
    });

    let qrAscii: string | undefined;
    if (startResult.qrcodeUrl) {
      try {
        const qrTerminal = await import("qrcode-terminal");
        qrAscii = await new Promise<string>((resolve) => {
          (qrTerminal as any).generate(
            startResult.qrcodeUrl,
            { small: true },
            (ascii: string) => resolve(ascii),
          );
        });
      } catch {
        // qrcode-terminal not available; skip ASCII rendering
      }
    }

    const { sessionKey } = startResult;

    // Background IIFE: wait for login confirmation
    (async () => {
      try {
        const waitResult = await waitForWeixinLogin({
          sessionKey,
          apiBaseUrl,
          timeoutMs: 480_000,
          onQrRefresh: async (url) => {
            let ascii: string | undefined;
            try {
              const qrTerminal = await import("qrcode-terminal");
              ascii = await new Promise<string>((resolve) => {
                (qrTerminal as any).generate(url, { small: true }, (a: string) => resolve(a));
              });
            } catch { /* qrcode-terminal not available */ }
            this.emit("qrRefresh", { qrcodeUrl: url, qrAscii: ascii });
          },
        });

        if (waitResult.connected && waitResult.accountId) {
          const normalizedId = normalizeAccountId(waitResult.accountId);
          saveWeixinAccount(normalizedId, {
            token: waitResult.botToken,
            baseUrl: waitResult.baseUrl,
            userId: waitResult.userId,
          });
          registerWeixinAccountId(normalizedId);
          resetSession(normalizedId);
          this.emit("loginSuccess", normalizedId);
          await this.start(normalizedId);
        }
      } catch (err) {
        logger.warn(`WeixinBotClient.login: waitForWeixinLogin failed: ${String(err)}`);
        this.emit("error", err as Error);
      }
    })();

    return {
      qrcodeUrl: startResult.qrcodeUrl,
      qrAscii,
      message: startResult.message,
      sessionKey,
    };
  }

  async logout(): Promise<void> {
    this.stop();

    const ids = listIndexedWeixinAccountIds();
    if (ids.length > 0) {
      const accountId = ids[0];
      removeWeixinAccount(accountId);
    }
  }

  // -----------------------------------------------------------------------
  // account listing
  // -----------------------------------------------------------------------

  listAccounts(): string[] {
    return listIndexedWeixinAccountIds();
  }

  // -----------------------------------------------------------------------
  // send text / media
  // -----------------------------------------------------------------------

  async sendText(
    chatId: string,
    text: string,
    opts?: { raw?: boolean },
  ): Promise<void> {
    if (!this.currentAccount) {
      throw new Error("WeixinBotClient: not started, call start() first");
    }

    const contextToken = getContextToken(chatId);
    if (!contextToken) {
      throw new Error(`WeixinBotClient.sendText: no contextToken for chatId=${chatId}`);
    }

    const finalText = opts?.raw !== true ? markdownToPlainText(text) : text;

    await sendMessageWeixin({
      to: chatId,
      text: finalText,
      opts: {
        baseUrl: this.currentAccount.baseUrl,
        token: this.currentAccount.token,
        contextToken,
        clientIdPrefix: this.config.clientIdPrefix,
      },
    });
  }

  async sendMedia(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    if (!this.currentAccount) {
      throw new Error("WeixinBotClient: not started, call start() first");
    }

    const contextToken = getContextToken(chatId);
    if (!contextToken) {
      throw new Error(`WeixinBotClient.sendMedia: no contextToken for chatId=${chatId}`);
    }

    const finalCaption = caption ? markdownToPlainText(caption) : "";

    await sendWeixinMediaFile({
      filePath,
      to: chatId,
      text: finalCaption,
      opts: {
        baseUrl: this.currentAccount.baseUrl,
        token: this.currentAccount.token,
        contextToken,
        clientIdPrefix: this.config.clientIdPrefix,
      },
      cdnBaseUrl: this.currentAccount.cdnBaseUrl,
    });
  }

  // -----------------------------------------------------------------------
  // typing indicators
  // -----------------------------------------------------------------------

  startTyping(chatId: string): void {
    this.stopTyping(chatId);

    if (!this.currentAccount || !this.configManager) return;

    const account = this.currentAccount;
    const configManager = this.configManager;

    configManager
      .getForUser(chatId, getContextToken(chatId))
      .then((config) => {
        if (!config.typingTicket) return;

        const typingTicket = config.typingTicket;

        // Send initial typing indicator
        sendTyping({
          baseUrl: account.baseUrl,
          token: account.token,
          body: {
            ilink_user_id: chatId,
            typing_ticket: typingTicket,
            status: TypingStatus.TYPING,
          },
        }).catch((err) => {
          logger.warn(`startTyping: initial send failed: ${String(err)}`);
        });

        // Repeat every 5 seconds
        const timer = setInterval(() => {
          sendTyping({
            baseUrl: account.baseUrl,
            token: account.token,
            body: {
              ilink_user_id: chatId,
              typing_ticket: typingTicket,
              status: TypingStatus.TYPING,
            },
          }).catch((err) => {
            logger.warn(`startTyping: interval send failed: ${String(err)}`);
          });
        }, 5000);

        this.typingStates.set(chatId, { timer, chatId });
      })
      .catch((err) => {
        logger.warn(`startTyping: getForUser failed: ${String(err)}`);
      });
  }

  stopTyping(chatId: string): void {
    const entry = this.typingStates.get(chatId);
    if (!entry) return;

    clearInterval(entry.timer);
    this.typingStates.delete(chatId);

    if (this.currentAccount && this.configManager) {
      const account = this.currentAccount;

      this.configManager
        .getForUser(chatId, getContextToken(chatId))
        .then((config) => {
          if (!config.typingTicket) return;
          sendTyping({
            baseUrl: account.baseUrl,
            token: account.token,
            body: {
              ilink_user_id: chatId,
              typing_ticket: config.typingTicket,
              status: TypingStatus.CANCEL,
            },
          }).catch((err) => {
            logger.warn(`stopTyping: send cancel failed: ${String(err)}`);
          });
        })
        .catch((err) => {
          logger.warn(`stopTyping: getForUser failed: ${String(err)}`);
        });
    }
  }

  private stopAllTyping(): void {
    for (const chatId of [...this.typingStates.keys()]) {
      this.stopTyping(chatId);
    }
  }

  // -----------------------------------------------------------------------
  // status
  // -----------------------------------------------------------------------

  getStatus(): ConnectionStatus {
    return {
      connected: this.pollLoopRunning && this.currentAccount != null,
      accountId: this.currentAccount?.accountId,
      userId: this.currentAccount?.userId,
      sessionPaused: this.currentAccount
        ? isSessionPaused(this.currentAccount.accountId)
        : false,
      lastInboundAt: this.lastInboundAt,
      pollLoopRunning: this.pollLoopRunning,
    };
  }

  // -----------------------------------------------------------------------
  // cleanup
  // -----------------------------------------------------------------------

  async cleanupTempMedia(): Promise<void> {
    return cleanupTempMedia(this.config.tempDir);
  }
}
