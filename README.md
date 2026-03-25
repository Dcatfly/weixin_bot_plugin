# weixin-bot-plugin

WeChat Bot SDK for Node.js — send and receive WeChat messages via the iLink Bot API.

Built as a standalone, framework-agnostic library on top of `EventEmitter`. Generalized from the [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) plugin, with all framework coupling removed.

## Features

- QR code login with terminal display
- Long-polling message loop with auto-reconnect
- Send text and media (image / voice / video / file)
- Automatic Markdown → plain text conversion
- SILK voice transcoding (via `silk-wasm`)
- WeChat CDN upload / download with AES-ECB encryption
- Typing indicator support
- Session expiry detection and re-login flow

## Requirements

- Node.js ≥ 22

## Install

```bash
pnpm add weixin-bot-plugin
# or
npm install weixin-bot-plugin
```

## Quick Start

```typescript
import { WeixinBotClient } from "weixin-bot-plugin";
import type { InboundMessage } from "weixin-bot-plugin";

const bot = new WeixinBotClient();

// Register event listeners BEFORE login to avoid missing events
bot.on("loginSuccess", (accountId: string) => {
  console.log(`Logged in: ${accountId}`);
});

bot.on("message", async (msg: InboundMessage) => {
  console.log(`[${msg.chatId}] ${msg.text}`);

  // msg.mediaPath is set when the message contains media (image/voice/video/file)
  if (msg.mediaPath) {
    console.log(`Media: ${msg.mediaPath} (${msg.mediaType})`);
  }

  // Echo back — Markdown is auto-converted to plain text
  await bot.sendText(msg.chatId, `You said: ${msg.text}`);
});

bot.on("sessionExpired", (accountId: string) => {
  console.log(`Session expired: ${accountId}`);
  bot.login();  // re-login
});

bot.on("error", (err: Error) => {
  console.error("Bot error:", err);
});

// login() returns a QrLoginResult with the QR code for scanning
const qr = await bot.login();
// qr.qrcodeUrl  — QR code URL
// qr.qrAscii    — ASCII art for terminal display (requires qrcode-terminal)
// qr.message    — status message
// qr.sessionKey — login session identifier
if (qr.qrAscii) console.log(qr.qrAscii);
```

## API

### `new WeixinBotClient(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stateDir` | `string` | `~/.weixin-bot` | Account credentials and sync state (`os.homedir()` based) |
| `tempDir` | `string` | `<os.tmpdir()>/weixin-bot` | Temporary media files |
| `channelVersion` | `string` | — | API channel version override |
| `clientIdPrefix` | `string` | `"weixin-bot"` | Client ID prefix for message sending |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `login()` | `Promise<QrLoginResult>` | Start QR login flow. Auto-calls `start()` on success. |
| `logout()` | `Promise<void>` | Stop polling and remove account credentials. |
| `start(accountId?)` | `Promise<boolean>` | Start message polling. Called automatically after login. |
| `stop()` | `void` | Stop message polling and typing indicators. |
| `sendText(chatId, text, opts?)` | `Promise<void>` | Send text. Auto-converts Markdown unless `{ raw: true }`. |
| `sendMedia(chatId, filePath, caption?)` | `Promise<void>` | Send a media file (image, voice, video, file). |
| `startTyping(chatId)` | `void` | Show typing indicator (repeats every 5s). |
| `stopTyping(chatId)` | `void` | Cancel typing indicator. |
| `getStatus()` | `ConnectionStatus` | Return current connection status. |
| `listAccounts()` | `string[]` | List registered account IDs. |
| `cleanupTempMedia()` | `Promise<void>` | Remove temporary inbound media files. |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message` | `InboundMessage` | New message received |
| `loginSuccess` | `accountId: string` | QR login completed |
| `qrRefresh` | `{ qrcodeUrl, qrAscii? }` | QR code needs refresh |
| `sessionExpired` | `accountId: string` | Session expired (errcode -14) |
| `error` | `Error` | General error |

### `QrLoginResult`

```typescript
interface QrLoginResult {
  qrcodeUrl?: string;    // QR code URL for scanning
  qrAscii?: string;      // ASCII art for terminal (requires qrcode-terminal)
  message: string;        // status message from server
  sessionKey: string;     // login session identifier
}
```

### `InboundMessage`

```typescript
interface InboundMessage {
  chatId: string;        // iLink user ID (sender & reply target for sendText/sendMedia)
  text: string;          // extracted plain text
  raw: WeixinMessage;    // full protocol message
  media?: InboundMediaResult;
  mediaPath?: string;    // downloaded media file path (auto-decrypted)
  mediaType?: string;    // MIME type (e.g. "image/jpeg", "audio/wav")
}
```

### `ConnectionStatus`

```typescript
interface ConnectionStatus {
  connected: boolean;        // true when poll loop is running with a valid account
  accountId?: string;        // current account ID
  userId?: string;           // WeChat user ID
  sessionPaused: boolean;    // true after session expiry (errcode -14)
  lastInboundAt?: number;    // timestamp of last received message
  pollLoopRunning: boolean;  // poll loop active
}
```

## Scripts

```bash
pnpm build       # Build to dist/ (ESM, minified, with .d.ts)
pnpm typecheck   # Type check without emitting
pnpm dev         # Watch mode
```

## Architecture

```
src/
├── index.ts          # Public exports
├── client.ts         # WeixinBotClient (EventEmitter facade)
├── poll/             # Long-polling loop (callback-driven)
├── api/              # iLink Bot API layer (HTTP)
├── auth/             # Account storage + QR login
├── cdn/              # WeChat CDN encrypt/decrypt/upload
├── media/            # Media download, MIME detection, SILK transcoding
├── messaging/        # Message parsing (inbound) + sending (text/media)
├── storage/          # Sync checkpoint persistence
└── util/             # Logger (stderr), ID generation, redaction
```

The [`vendor/`](vendor/) directory contains the original `@tencent-weixin/openclaw-weixin` v1.0.2 source for reference. See [CLAUDE.md](CLAUDE.md) for details on the generalization.

## License

MIT
