# weixin-bot-plugin

微信 Bot SDK — 通过 iLink Bot API 实现微信消息收发的 Node.js 库。

基于 `EventEmitter` 构建，无框架依赖，可在任何 JS/TS 项目中使用。从 [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 插件泛化而来，移除了所有框架耦合。

## 功能

- 终端扫码登录
- 长轮询消息循环，自动重连
- 发送文本和媒体（图片 / 语音 / 视频 / 文件）
- 自动 Markdown → 纯文本转换
- SILK 语音转码（通过 `silk-wasm`）
- 微信 CDN 上传下载及 AES-ECB 加解密
- 输入状态指示器
- 会话过期检测与重新登录

## 环境要求

- Node.js ≥ 22

## 安装

```bash
pnpm add weixin-bot-plugin
# 或
npm install weixin-bot-plugin
```

## 快速开始

```typescript
import { WeixinBotClient } from "weixin-bot-plugin";
import type { InboundMessage } from "weixin-bot-plugin";

const bot = new WeixinBotClient();

// 先注册事件监听器，再登录，避免丢失事件
bot.on("loginSuccess", (accountId: string) => {
  console.log(`登录成功: ${accountId}`);
});

bot.on("message", async (msg: InboundMessage) => {
  console.log(`[${msg.chatId}] ${msg.text}`);

  // msg.mediaPath 在消息包含媒体（图片/语音/视频/文件）时有值
  if (msg.mediaPath) {
    console.log(`媒体文件: ${msg.mediaPath} (${msg.mediaType})`);
  }

  // 回复消息 — Markdown 自动转为纯文本
  await bot.sendText(msg.chatId, `你说的是: ${msg.text}`);
});

bot.on("sessionExpired", (accountId: string) => {
  console.log(`会话已过期: ${accountId}`);
  bot.login();  // 重新登录
});

bot.on("error", (err: Error) => {
  console.error("Bot 错误:", err);
});

// login() 返回 QrLoginResult，包含扫码所需的二维码
const qr = await bot.login();
// qr.qrcodeUrl  — 二维码 URL
// qr.qrAscii    — 终端 ASCII 图（需要 qrcode-terminal）
// qr.message    — 状态消息
// qr.sessionKey — 登录会话标识
if (qr.qrAscii) console.log(qr.qrAscii);
```

## API

### `new WeixinBotClient(config?)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `stateDir` | `string` | `~/.weixin-bot` | 账户凭证和同步状态存储目录（基于 `os.homedir()`） |
| `tempDir` | `string` | `<os.tmpdir()>/weixin-bot` | 临时媒体文件目录 |
| `channelVersion` | `string` | — | API channel version 覆盖 |
| `clientIdPrefix` | `string` | `"weixin-bot"` | 消息发送时的客户端 ID 前缀 |

### 方法

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `login()` | `Promise<QrLoginResult>` | 发起扫码登录，成功后自动调用 `start()` |
| `logout()` | `Promise<void>` | 停止轮询并移除账户凭证 |
| `start(accountId?)` | `Promise<boolean>` | 启动消息轮询（登录成功后自动调用） |
| `stop()` | `void` | 停止消息轮询和输入状态指示器 |
| `sendText(chatId, text, opts?)` | `Promise<void>` | 发送文本，默认 Markdown 转纯文本，`{ raw: true }` 跳过 |
| `sendMedia(chatId, filePath, caption?)` | `Promise<void>` | 发送媒体文件（图片、语音、视频、文件） |
| `startTyping(chatId)` | `void` | 显示输入状态（每 5 秒重复） |
| `stopTyping(chatId)` | `void` | 取消输入状态 |
| `getStatus()` | `ConnectionStatus` | 返回当前连接状态 |
| `listAccounts()` | `string[]` | 列出已注册的账户 ID |
| `cleanupTempMedia()` | `Promise<void>` | 清理临时媒体文件 |

### 事件

| 事件 | 载荷 | 触发时机 |
|------|------|----------|
| `message` | `InboundMessage` | 收到新消息 |
| `loginSuccess` | `accountId: string` | 扫码登录成功 |
| `qrRefresh` | `{ qrcodeUrl, qrAscii? }` | 二维码需要刷新 |
| `sessionExpired` | `accountId: string` | 会话过期（errcode -14） |
| `error` | `Error` | 一般错误 |

### `QrLoginResult`

```typescript
interface QrLoginResult {
  qrcodeUrl?: string;    // 扫码 URL
  qrAscii?: string;      // 终端 ASCII 图（需要 qrcode-terminal）
  message: string;        // 服务器状态消息
  sessionKey: string;     // 登录会话标识
}
```

### `InboundMessage`

```typescript
interface InboundMessage {
  chatId: string;        // iLink 用户 ID（发送者，同时也是 sendText/sendMedia 的回复目标）
  text: string;          // 提取的纯文本
  raw: WeixinMessage;    // 完整协议消息
  media?: InboundMediaResult;
  mediaPath?: string;    // 已下载的媒体文件路径（自动解密）
  mediaType?: string;    // MIME 类型（如 "image/jpeg"、"audio/wav"）
}
```

### `ConnectionStatus`

```typescript
interface ConnectionStatus {
  connected: boolean;        // 轮询循环运行中且账户有效时为 true
  accountId?: string;        // 当前账户 ID
  userId?: string;           // 微信用户 ID
  sessionPaused: boolean;    // 会话过期后为 true（errcode -14）
  lastInboundAt?: number;    // 最后收到消息的时间戳
  pollLoopRunning: boolean;  // 轮询循环是否活跃
}
```

## 脚本

```bash
pnpm build       # 构建到 dist/（ESM，minified，含 .d.ts）
pnpm typecheck   # 类型检查
pnpm test        # 运行所有测试（Vitest）
pnpm test:watch  # 测试监听模式
pnpm dev         # 构建监听模式
```

## 项目结构

```
src/
├── index.ts          # 公共导出
├── client.ts         # WeixinBotClient 门面类（EventEmitter）
├── poll/             # 长轮询循环（回调驱动）
├── api/              # iLink Bot API 通信层（HTTP）
├── auth/             # 账号存储 + 扫码登录
├── cdn/              # 微信 CDN 加解密上传下载
├── media/            # 媒体下载、MIME 判断、SILK 转码
├── messaging/        # 消息解析（入站）+ 发送（文本/媒体）
├── storage/          # 同步断点持久化
└── util/             # 日志（stderr）、ID 生成、脱敏
```

[`vendor/`](vendor/) 目录保存了 `@tencent-weixin/openclaw-weixin` v1.0.2 的原始源码供参考。泛化细节见 [CLAUDE.md](CLAUDE.md)。

## 许可证

MIT
