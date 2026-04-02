## 2.1.3

### 新增

- **`iLink-App-Id` / `iLink-App-ClientVersion` HTTP 请求头**：所有 API 请求现在自动携带这两个头，值分别来自 `package.json` 的 `ilink_appid` 字段和 `version` 字段（版本号编码为 uint32 `0x00MMNNPP`）。新增 `buildCommonHeaders()` 辅助函数统一构建 GET/POST 共用头。
- **`apiGetFetch()`**：新增 GET 请求封装（含超时与 AbortController），用于二维码登录流程，与 `apiPostFetch()` 对称。
- **`GetUploadUrlResp.upload_full_url` 字段**：服务端可直接返回完整 CDN 上传 URL；有则优先使用，否则回退至原有 `upload_param` 拼接方式。
- **媒体对象 `full_url` 字段**：图片、语音、文件、视频消息项的媒体对象新增 `full_url`，服务端有返回时直接用于 CDN 下载，是否允许回退由 `ENABLE_CDN_URL_FALLBACK` 控制。
- **`ENABLE_CDN_URL_FALLBACK` 标志**（`cdn-url.ts`）：控制 `full_url` 缺失时是否允许客户端自行拼接 CDN 下载 URL。
- **`scaned_but_redirect` 扫码状态 + IDC 跨机房重定向**：二维码轮询现在处理新的 `scaned_but_redirect` 状态，并将后续轮询切换到 `redirect_host` 指定的地址，支持跨机房登录。
- **`StreamingMarkdownFilter`**（`src/messaging/markdown-filter.ts`）：新增字符级流式状态机，按流式方式剥离 Markdown 语法（代码块、行内代码、图片、删除线、粗/斜体、表格），最小化预读量，取代原有基于正则的 `markdownToPlainText`。
- **`channelConfigUpdatedAt` 配置字段**：每次扫码登录成功后写入 ISO 8601 时间戳到 `openclaw.json`，替代原先写入空 `accounts: {}` 占位符的做法；已加入 `WeixinConfigSchema`。
- **固定二维码请求地址**（`https://ilinkai.weixin.qq.com`）：获取和轮询二维码状态始终使用该固定地址，登录前不再要求配置 `apiBaseUrl`。
- **`package.json` 新增 `ilink_appid: "bot"` 字段**：供 `api.ts` 读取应用标识。

### 变更

- **`apiFetch()` 重命名为 `apiPostFetch()`**：所有 POST 调用点同步更新。
- **`triggerWeixinChannelReload()` 逻辑调整**：改为无条件写入 `channelConfigUpdatedAt`，不再条件性地写入空 `accounts: {}` 占位符。
- **二维码轮询网络错误视为等待**：`pollQRStatus` 遇到网关超时（如 Cloudflare 524）等网络错误时，现在返回 `{ status: "wait" }` 而非抛出异常，自动重试。
- **Markdown 过滤改用 `StreamingMarkdownFilter`**：`process-message.ts` 改为实例化 `StreamingMarkdownFilter`；`send.ts` 重新导出该类。
- **引用消息回复关闭块式流式输出**：处理引用消息回复时 `disableBlockStreaming` 改为 `true`。
- **文档中卸载命令更新**：README 现在展示 `openclaw plugins uninstall @tencent-weixin/openclaw-weixin`（原为 `openclaw openclaw-weixin uninstall`）。
- **兼容性错误提示更新**：旧版宿主升级提示改为 `npx @tencent-weixin/openclaw-weixin-cli install`。
- **新增 `MEDIA:` 指令提示规则**：Channel 系统 prompt 要求模型将 `MEDIA:` 标签单独放一行。
- **移除 `peerDependencies`**：`openclaw >=2026.3.22` 的 peer 依赖从 `package.json` 中删除。
- **Debug 日志不再泄露 `OPENCLAW_STATE_DIR`**：环境变量从 debug-check 日志中移除。

### 移除

- **`src/log-upload.ts`** 及 `openclaw openclaw-weixin logs-upload` CLI 子命令：日志上传功能及对应的 `logUploadUrl` 配置字段已全部删除。
- **`markdownToPlainText()` 函数**（`send.ts`）：由 `StreamingMarkdownFilter` 取代；`openclaw/plugin-sdk/text-runtime` 的 `stripMarkdown` 不再被导入。
- **插件入口 CLI 注册**（`index.ts`）：移除 `registerWeixinCli` 调用及 `registrationMode` 判断逻辑。

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
