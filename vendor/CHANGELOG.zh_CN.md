## 2.1.4

### 新增

- **`StreamingMarkdownFilter`**（`src/messaging/markdown-filter.ts`）：字符级流式状态机，逐字符过滤不支持的 Markdown 语法，替代原先的整段 `markdownToPlainText`。Markdown 支持程度从完全不支持升级为部分支持。
- **`apiGetFetch()`**：新增 GET 请求封装（统一请求头、可选超时、统一错误处理），供扫码登录流程使用。
- **`iLink-App-Id` / `iLink-App-ClientVersion` 请求头**：从 `package.json` 的 `ilink_appid` 和 `version` 字段读取，随所有 API 请求一并发送。
- **服务端直传 CDN URL**：API 类型新增 `upload_full_url`（上传）和 `full_url`（下载）字段；CDN 上传/下载优先使用服务端返回的完整 URL，无需客户端拼接。
- **`scaned_but_redirect` 扫码状态**：新增 QR 轮询状态，支持将轮询 base URL 切换至服务端返回的 `redirect_host`（IDC 跨机房重定向）。

### 变更

- **外发文本路径**：`process-message` 在每次 `deliver` 时改用 `StreamingMarkdownFilter`（`feed`/`flush`）处理回复，替代 `markdownToPlainText`。
- **登录后配置刷新**：每次微信登录成功后，在 `openclaw.json` 中更新 `channels.openclaw-weixin.channelConfigUpdatedAt`（ISO 8601），不再写入空的 `accounts: {}` 占位。
- **扫码登录 base URL**：`fetchQRCode` 及二维码刷新始终使用固定地址 `https://ilinkai.weixin.qq.com`，不再依赖 channel 配置中的 `apiBaseUrl`。
- **`get_bot_qrcode` 超时**：2.1.4 移除客户端超时（请求不再因固定时限被 abort）；2.1.2 曾将超时从 5 s 调整为 10 s。
- **`get_qrcode_status` 错误处理**：网络/网关错误（如 Cloudflare 524）现在静默返回 `wait` 状态继续轮询，不再向上抛出异常。
- **`apiFetch` 重命名为 `apiPostFetch`**，所有现有 POST 调用方同步更新。
- **配置 Schema**：`logUploadUrl` 字段替换为 `channelConfigUpdatedAt`。
- **兼容性错误提示**：不再硬编码 `PLUGIN_VERSION` 字符串或旧版 `@1.x` 安装命令。
- **系统提示词**：新增 `MEDIA:` 指令须单独成行的说明。

### 移除

- 从 `src/messaging/send.ts` 删除 **`markdownToPlainText`**，相关测试迁至 `markdown-filter.test.ts`。
- **`openclaw-weixin` CLI 子命令**（删除 `src/log-upload.ts` 及 `index.ts` 中的 `registerCli` 调用）。请改用 `openclaw plugins uninstall @tencent-weixin/openclaw-weixin`。
- 从 `package.json` 移除 **`peerDependencies`**（`openclaw >=2026.3.22`）。
- 从 `src/compat.ts` 移除 **`PLUGIN_VERSION` 常量**。

### 修复

- 扫码登录不再因 channel 配置缺少 `apiBaseUrl` 而报错"No baseUrl configured"（改用固定 base URL）。
- 解决在 OpenClaw 2026.3.31 及更新版本安装插件时出现的 **dangerous code pattern** 提示。

## 2.0.1

### 新增

- **宿主版本兼容性检查**（`src/compat.ts`）：在插件 `register()` 时调用 `assertHostCompatibility()`，若 OpenClaw 版本低于 `>=2026.3.22` 则抛出带有指引信息的错误。
- **`openclaw.plugin.json` 版本字段**：manifest 现在声明 `"version": "2.0.0"`。
- **`peerDependencies`**：新增 `openclaw >=2026.3.22`；安装配置中新增 `minHostVersion` 限制。
- **contextToken 磁盘持久化**：contextToken 现在写入 `accounts/{accountId}.context-tokens.json`，网关启动时自动恢复（`restoreContextTokens`），重启后不再丢失对话上下文。
- **`findAccountIdsByContextToken()`**：查询哪些已注册账号与目标收件人有活跃会话，用于定时任务投递时自动推断发送账号。
- **`resolveOutboundAccountId()`**：调用方未显式提供 `accountId` 时自动选择正确的 Bot 账号；多账号匹配时抛出明确错误。
- **`unregisterWeixinAccountId()`**：从持久化索引文件中移除账号。
- **`clearStaleAccountsForUserId()`**：扫码登录成功后，清理拥有相同 WeChat `userId` 的其他账号，防止 contextToken 匹配歧义。
- **`clearContextTokensForAccount()`**：同时清除指定账号的内存和磁盘 contextToken。
- **`blockStreaming` 能力 + 合并默认值**：Channel 现在声明 `blockStreaming: true`，并设置 `minChars: 200` / `idleMs: 3000` 合并参数。
- **`openclaw openclaw-weixin uninstall` CLI 子命令**：先清理配置文件中的 channel 配置节，再执行 `openclaw plugins uninstall`。
- **二维码降级提示优化**：终端无法渲染二维码时，引导用户用浏览器打开链接扫码（中文提示）。
- **README**：新增兼容性对照表、卸载章节和故障排查章节。

### 变更

- **`openclaw/plugin-sdk` 导入拆分为子路径**：如 `openclaw/plugin-sdk/core`、`openclaw/plugin-sdk/account-id`、`openclaw/plugin-sdk/channel-config-schema`、`openclaw/plugin-sdk/infra-runtime` 等，适配 OpenClaw ≥2026.3.22 SDK 结构调整。
- **`triggerWeixinChannelReload()`**：由空实现改为真实功能，在通知重载前将 `channels.openclaw-weixin.accounts` 写入 `openclaw.json`。
- **`loadConfigRouteTag()`**：配置节首次读取后缓存，避免重复 I/O。
- **`clearWeixinAccount()`**：现在同时删除 `{accountId}.sync.json`、`{accountId}.context-tokens.json` 和 `allowFrom` 授权文件（之前仅删除 `{accountId}.json`）。
- **临时目录/日志目录**：所有硬编码的 `/tmp/openclaw` 路径均改为调用 SDK 的 `resolvePreferredOpenClawTmpDir()`。
- **`redactBody()`**：在截断前先对敏感字段（`context_token`、`bot_token`、`token`、`authorization`）的值进行脱敏替换。
- **定时任务投递提示**：要求同时提供 `delivery.to` 和 `delivery.accountId`，适配多账号场景。
- **插件入口**：`register()` 现在检查 `registrationMode`，非 full 模式下跳过 CLI 注册等重型操作。
- **`sendText` / `sendMedia`**：调用方未提供 `accountId` 时，通过 `resolveOutboundAccountId()` 自动推断。
- **发送成功日志级别**：由 `debug` 提升为 `info`。

### 修复

- 缺少 `contextToken` 时不再硬抛错误并拒绝发送；改为打印 warning 后继续发送（与服务端容忍缺失 token 的行为一致）。
- 错误通知处理器不再因缺少 `contextToken` 而静默丢弃错误通知。
