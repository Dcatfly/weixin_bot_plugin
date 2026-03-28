## 2.1.1

### 新增

- **`iLink-App-Id` / `iLink-App-ClientVersion` 请求头**：所有对外 API 请求现在携带这两个头，分别来自 `package.json` 中新增的 `ilink_appid` 字段和版本号编码（`0x00MMNNPP` 格式）。
- **`apiGetFetch()`**：新增带超时和 AbortController 的 GET 请求封装，用于二维码相关接口，替代 `login-qr.ts` 中的原始 `fetch()` 调用。
- **`buildCommonHeaders()`**：内部辅助函数，统一管理 GET/POST 共享请求头（`iLink-App-Id`、`iLink-App-ClientVersion`、`SKRouteTag`）。
- **服务端直接下发 CDN URL（`upload_full_url` / `full_url`）**：`GetUploadUrlResp` 新增 `upload_full_url`，媒体对象新增 `full_url`；有值时直接使用，无需客户端拼接 URL。
- **`ENABLE_CDN_URL_FALLBACK` 开关**（`cdn-url.ts`）：控制服务端未返回 `full_url` 时是否回退到客户端拼接 URL。
- **二维码登录 IDC 跳转支持**：新增 `scaned_but_redirect` 状态和 `redirect_host` 字段，轮询时自动切换到目标 IDC 的接口地址。
- **二维码固定 Base URL**（`https://ilinkai.weixin.qq.com`）：获取二维码不再依赖用户预配置的 `baseUrl`。
- **`ilink_appid: "bot"`** 字段写入 `package.json`。
- **MEDIA: 指令换行规范**：channel 系统提示中新增规则——MEDIA: 标签必须单独成行，不能与其他文字内联。

### 变更

- **`apiFetch()` 重命名为 `apiPostFetch()`**：内部重命名，所有 POST 调用点同步更新。
- **`readChannelVersion()` 替换为 `readPackageJson()`**：升级为全量读取 `package.json`，支持同时提取 `ilink_appid` 和 `version`。
- **二维码轮询错误处理优化**：网络/网关错误（如 Cloudflare 524）不再抛异常，改为返回 `{ status: "wait" }` 并继续轮询。
- **`src/log-upload.ts` 替换为 `src/weixin-cli.ts`**：CLI 注册逻辑拆出独立文件，日志上传子命令已移除（见"移除"）。
- **宿主升级提示更新**：版本不兼容时的错误提示改为引导用户执行 `npx @tencent-weixin/openclaw-weixin-cli install`。

### 移除

- **`logs-upload` CLI 子命令**：插件内的日志文件上传功能已删除。
- **`logUploadUrl` 配置字段**：从 `WeixinConfigSchema` 中移除。
- **`peerDependencies`**（`openclaw >=2026.3.22`）：从 `package.json` 中移除。

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
