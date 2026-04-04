# 变更日志

[English](CHANGELOG.md)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 格式。

## 2.1.6

### 新增

- **`iLink-App-Id` / `iLink-App-ClientVersion` 请求头：** 所有 API 请求（GET 和 POST）统一附带这两个头，值分别取自 `package.json` 的 `ilink_appid` 字段与 `version`。
- **`apiGetFetch`：** 新增 GET 请求封装（与 `apiPostFetch` 对称），携带公共请求头并支持可选超时；QR 登录流程已改用此接口。
- **`package.json` 新增 `ilink_appid: "bot"`：** 为 app-id 请求头提供来源，避免源码硬编码。
- **CDN 完整 URL 支持：** `getUploadUrl` 可返回 `upload_full_url`；上传与下载均优先使用服务端直接提供的完整 URL，客户端拼接作为回退。新增 `ENABLE_CDN_URL_FALLBACK` 开关控制回退行为。
- **媒体消息 `full_url` 字段：** 图片、语音、文件、视频消息新增可选 `full_url`；媒体下载优先使用该字段，无则回退到 `encrypt_query_param` 拼接。
- **`scaned_but_redirect` 扫码状态：** 登录轮询新增 IDC 重定向处理，收到该状态后自动将轮询地址切换至 `redirect_host` 并继续。
- **`channelConfigUpdatedAt` 配置字段：** 每次登录成功后写入 ISO 8601 时间戳，替代原先有条件写入空 `accounts: {}` 占位的逻辑。
- **系统提示新规则：** `MEDIA:` 指令必须独占一行（不可与其他文本同行）。

### 变更

- **扫码登录使用固定 base URL：** `fetchQRCode` 与首次轮询固定使用 `https://ilinkai.weixin.qq.com`，发起登录不再要求配置 `apiBaseUrl`。
- **QR 轮询网络错误 → `wait`：** `pollQRStatus` 遇到网络或网关错误（如 Cloudflare 524）时，返回 `{status: "wait"}` 继续重试，不再抛出异常。
- **`triggerWeixinChannelReload` 无条件写入：** 移除原先"只在 section 缺失或为空时才写入"的条件判断，每次登录成功均更新 `channelConfigUpdatedAt`。
- **多账号隔离配置项：** README 文档从 `agents.mode per-channel-per-peer` 更新为 `session.dmScope per-account-channel-peer`。
- **兼容性错误提示：** 移除硬编码的 `PLUGIN_VERSION` 常量；回退安装命令改为 `npx @tencent-weixin/openclaw-weixin-cli install`。

### 移除

- **`peerDependencies`**（`openclaw >= 2026.3.22`）从 `package.json` 中移除。
- **`logUploadUrl` 配置字段** 被 `channelConfigUpdatedAt` 取代。

## [2.1.4] - 2026-04-03

### 变更

- **扫码登录：** 移除 `get_bot_qrcode` 的客户端超时，请求不再因固定时限被 abort（仍受服务端与网络栈限制）。

## [2.1.3] - 2026-04-02

### 新增

- **`StreamingMarkdownFilter`**（`src/messaging/markdown-filter.ts`）：外发文本由原先 `markdownToPlainText` 整段剥离 Markdown，改为流式逐字符过滤；**对 Markdown 从完全不支持变为部分支持**。

### 变更

- **外发文本：** `process-message` 在每次 `deliver` 时用 `StreamingMarkdownFilter`（`feed` / `flush`）处理回复，替代 `markdownToPlainText`。

### 移除

- 从 `src/messaging/send.ts` 删除 **`markdownToPlainText`**（相关用例从 `send.test.ts` 迁至 `markdown-filter.test.ts`）。

## [2.1.2] - 2026-04-02

### 变更

- **登录后配置刷新：** 每次微信登录成功后，在 `openclaw.json` 中更新 `channels.openclaw-weixin.channelConfigUpdatedAt`（ISO 8601），让网关从磁盘重新加载配置；不再写入空的 `accounts: {}` 占位。
- **扫码登录：** `get_bot_qrcode` 客户端超时由 5s 调整为 10s。
- **文档：** 卸载说明改为使用 `openclaw plugins uninstall @tencent-weixin/openclaw-weixin`，与插件 CLI 一致。
- **日志：** `debug-check` 日志不再输出 `stateDir` / `OPENCLAW_STATE_DIR`。

### 移除

- **`openclaw-weixin` 子命令**（删除 `src/weixin-cli.ts` 及 `index.ts` 中的注册）。请使用宿主自带的 `openclaw plugins uninstall …` 卸载流程。

### 修复

- 解决在 **OpenClaw 2026.3.31 及更新版本**上安装插件时出现的 **dangerous code pattern** 提示（宿主插件安装 / 静态检查）。
