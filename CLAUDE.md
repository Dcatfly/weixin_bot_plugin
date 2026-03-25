# weixin-bot-plugin

微信 Bot SDK — 通过 iLink Bot API 实现微信消息收发，基于 EventEmitter 的通用库。

## 来源

`vendor/` 目录保存了 `@tencent-weixin/openclaw-weixin` 插件 v1.0.2 的原始源码（含 tgz 包）。
`src/` 基于 vendor 代码泛化而来，核心逻辑（API、CDN、认证、媒体、消息类型）几乎一致，
主要差异在集成层：

- **移除** OpenClaw 框架依赖（plugin-sdk、PluginRuntime、Zod 配置验证）
- **移除** 框架功能：slash-commands、debug-mode、error-notice、pairing、log-upload、monitor
- **新增** `WeixinBotClient`（EventEmitter 门面），替代 OpenClaw 的 ChannelPlugin 回调
- **新增** `poll-loop.ts` 回调驱动轮询，替代 vendor 的 `monitor.ts` 框架轮询
- **自实现** `stripMarkdown()`，原版从 `openclaw/plugin-sdk` 导入

修改 src 时可参考 vendor 对应文件了解原始意图。

## 命令

```bash
pnpm build         # tsup 打包（ESM，minified，含 .d.ts → dist/）
pnpm typecheck     # tsc --noEmit 类型检查（使用 tsconfig.build.json，排除测试文件）
pnpm test          # vitest run 运行所有测试
pnpm test:watch    # vitest watch 模式
pnpm dev           # tsup --watch 开发模式
```

## 架构

```
src/
├── index.ts          # barrel 导出
├── client.ts         # WeixinBotClient 门面类（EventEmitter）
├── poll/
│   └── poll-loop.ts  # getUpdates long-poll 循环（回调驱动）
├── api/              # iLink Bot API 通信层（HTTP POST/GET）
├── auth/             # 账号存储 + 扫码登录
├── cdn/              # 微信 CDN 加解密上传下载
├── media/            # 媒体下载解密、MIME 判断、SILK 语音转码
├── messaging/        # 消息解析（inbound）、发送（send/send-media）
├── storage/          # getUpdates 同步断点持久化
└── util/             # 日志（stderr）、ID 生成、脱敏
```

## 关键设计

- `WeixinBotClient` 是主入口，封装所有微信功能，通过 EventEmitter 推送事件
- 不依赖 MCP SDK 或任何 Claude Code 概念，可被任何 JS/TS 项目使用
- 存储路径通过 `WeixinBotConfig.stateDir` 配置，默认 `~/.weixin-bot/`
- 临时媒体文件通过 `WeixinBotConfig.tempDir` 配置
- `sendText()` 默认自动 Markdown → 纯文本转换，`raw: true` 跳过
- Typing 手动管理：调用方自行控制 `startTyping`/`stopTyping` 时机
- 登录两阶段：`login()` 返回 QR 码，后台轮询成功触发 `loginSuccess` 事件

## 注意事项

- 包管理器 pnpm，构建工具 tsup，target node22，ESM only
- 模块级 setter（`setStateDir`/`setSyncStateDir`）意味着同一进程只能有一个 `WeixinBotClient` 实例
- `contextToken` 由库内部自动管理（poll-loop 提取 → 内存缓存 → 发送时携带）
- session 过期（errcode -14）触发 `sessionExpired` 事件，需调用方重新 login
- `silk-wasm` 是可选依赖，SILK 转码失败时优雅降级为原始格式

## 代码风格

- ESM 相对导入带 `.js` 后缀：`import { logger } from "../util/logger.js"`
- Node 内置模块用 `node:` 前缀：`import os from "node:os"`
- 私有变量 `_` 前缀，类型用 `Params`/`Options`/`Result` 后缀
- 测试框架 Vitest，测试文件与源码同级放置（`*.test.ts`）
- 测试中显式 `import { describe, it, expect } from "vitest"`，不使用全局注入
- `tsconfig.build.json` 排除测试文件，`tsconfig.json` 保留（IDE 支持）

## 环境变量

- `LOG_LEVEL` — debug/info/warn/error，默认 info

## 事件（WeixinBotEvents）

| 事件 | 载荷 | 触发时机 |
|------|------|----------|
| `message` | `InboundMessage` | 收到新消息 |
| `loginSuccess` | `accountId: string` | QR 扫码登录成功 |
| `qrRefresh` | `{ qrcodeUrl, qrAscii? }` | QR 码需要刷新 |
| `sessionExpired` | `accountId: string` | 会话过期（errcode -14） |
| `error` | `Error` | 一般错误 |
