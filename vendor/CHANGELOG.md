## 2.1.3

### Added

- **`iLink-App-Id` / `iLink-App-ClientVersion` HTTP headers**: all API requests now send these headers, read from `package.json` fields `ilink_appid` and `version` (encoded as uint32 `0x00MMNNPP`). A new `buildCommonHeaders()` helper consolidates shared headers for both GET and POST paths.
- **`apiGetFetch()`**: new GET fetch wrapper (timeout + abort) used by QR login flows; mirrors `apiPostFetch()`.
- **`upload_full_url` field on `GetUploadUrlResp`**: server can now return a pre-built CDN upload URL; client uses it directly when present, falling back to the existing `upload_param`-based URL construction.
- **`full_url` field on media items**: server can return a pre-built CDN download URL for image, voice, file, and video items; used directly when present, with fallback controlled by `ENABLE_CDN_URL_FALLBACK`.
- **`ENABLE_CDN_URL_FALLBACK` flag** (`cdn-url.ts`): controls whether client-side CDN URL construction is allowed as fallback when `full_url` is absent.
- **`scaned_but_redirect` QR status + IDC redirect support**: QR polling now handles the new `scaned_but_redirect` status; switches the polling base URL to `redirect_host` for cross-datacenter logins.
- **`StreamingMarkdownFilter`** (`src/messaging/markdown-filter.ts`): new character-level streaming state machine that strips unsupported Markdown syntax (fenced code blocks, inline code, images, strikethrough, bold/italic, tables) with minimal lookahead, replacing the previous regex-based `markdownToPlainText`.
- **`channelConfigUpdatedAt` config field**: ISO 8601 timestamp written to `openclaw.json` on every successful QR login, replacing the former `accounts: {}` placeholder write. Added to `WeixinConfigSchema`.
- **Fixed QR base URL** (`https://ilinkai.weixin.qq.com`): QR code fetching and status polling now always use this fixed URL, removing the requirement for `apiBaseUrl` to be configured before login.
- **`ilink_appid: "bot"` in `package.json`**: provides the app identifier read by `api.ts`.

### Changed

- **`apiFetch()` renamed to `apiPostFetch()`**: all POST call sites updated accordingly.
- **`triggerWeixinChannelReload()`**: now unconditionally writes `channelConfigUpdatedAt` instead of conditionally writing an empty `accounts: {}` placeholder; comment and logic updated.
- **QR polling network errors treated as "wait"**: gateway timeouts (e.g. Cloudflare 524) and other transient network errors during `pollQRStatus` now return `{ status: "wait" }` instead of throwing, allowing automatic retry.
- **Markdown filtering switched to `StreamingMarkdownFilter`**: `process-message.ts` now instantiates `StreamingMarkdownFilter` instead of calling `markdownToPlainText`; `send.ts` re-exports `StreamingMarkdownFilter`.
- **Block streaming disabled for quoted-message replies**: `disableBlockStreaming` is now `true` when processing replies to quoted messages.
- **Uninstall command updated in docs**: README now shows `openclaw plugins uninstall @tencent-weixin/openclaw-weixin` (was `openclaw openclaw-weixin uninstall`).
- **Compat error message updated**: upgrade hint now references `npx @tencent-weixin/openclaw-weixin-cli install` instead of `openclaw plugins install @tencent-weixin/openclaw-weixin@legacy`.
- **`MEDIA:` directive prompt rule added**: channel system prompt now instructs the model that `MEDIA:` tags must appear on their own line.
- **Removed `peerDependencies`**: `openclaw >=2026.3.22` peer dep dropped from `package.json`.
- **Debug log no longer leaks `OPENCLAW_STATE_DIR`**: env var removed from the debug-check log line.

### Removed

- **`src/log-upload.ts`** and the `openclaw openclaw-weixin logs-upload` CLI subcommand: log upload functionality and its `logUploadUrl` config field have been removed entirely.
- **`markdownToPlainText()` function** (`send.ts`): replaced by `StreamingMarkdownFilter`; `stripMarkdown` from `openclaw/plugin-sdk/text-runtime` no longer imported.
- **CLI registration in plugin entry** (`index.ts`): `registerWeixinCli` call and `registrationMode` guard removed.

## 2.0.1

### Added

- **Host compatibility check** (`src/compat.ts`): new `assertHostCompatibility()` guard called at plugin `register()` time; throws a descriptive error when the running OpenClaw version is below `>=2026.3.22`.
- **`openclaw.plugin.json` version field**: manifest now declares `"version": "2.0.0"`.
- **`peerDependencies`**: `openclaw >=2026.3.22` added; `minHostVersion` enforcement added to install config.
- **Context token disk persistence**: context tokens are now written to `accounts/{accountId}.context-tokens.json` and restored on gateway start (`restoreContextTokens`), so conversation context survives restarts.
- **`findAccountIdsByContextToken()`**: looks up which registered accounts have an active session with a given recipient — used to auto-resolve sender account for cron deliveries.
- **`resolveOutboundAccountId()`**: automatically selects the correct bot account for outbound messages when `accountId` is not explicitly provided; throws a clear error on ambiguity.
- **`unregisterWeixinAccountId()`**: removes an account from the persistent index file.
- **`clearStaleAccountsForUserId()`**: after a successful QR login, removes other accounts that share the same WeChat `userId`, preventing ambiguous contextToken matches.
- **`clearContextTokensForAccount()`**: clears in-memory and on-disk context tokens for a given account.
- **`blockStreaming` capability + coalesce defaults**: channel now declares `blockStreaming: true` with `minChars: 200` / `idleMs: 3000` defaults.
- **`openclaw openclaw-weixin uninstall` CLI subcommand**: removes the channel config section and then runs `openclaw plugins uninstall`.
- **QR code fallback UX**: improved messages guide users to open the URL in a browser when the terminal QR render fails (messages now in Chinese).
- **README**: added Compatibility table, Uninstall section, and Troubleshooting section.

### Changed

- **`openclaw/plugin-sdk` imports split into subpaths**: e.g. `openclaw/plugin-sdk/core`, `openclaw/plugin-sdk/account-id`, `openclaw/plugin-sdk/channel-config-schema`, `openclaw/plugin-sdk/infra-runtime`, etc. Required by OpenClaw ≥2026.3.22 SDK restructure.
- **`triggerWeixinChannelReload()`**: changed from a no-op stub to a real implementation that writes the `channels.openclaw-weixin.accounts` section to `openclaw.json` before signalling a reload.
- **`loadConfigRouteTag()`**: config section is now cached after first read to avoid repeated file I/O.
- **`clearWeixinAccount()`**: now also removes `{accountId}.sync.json`, `{accountId}.context-tokens.json`, and the `allowFrom` credentials file (previously only removed `{accountId}.json`).
- **Temp/log directory**: all hardcoded `/tmp/openclaw` paths replaced with `resolvePreferredOpenClawTmpDir()` from the SDK.
- **`redactBody()`**: now redacts values of sensitive JSON fields (`context_token`, `bot_token`, `token`, `authorization`) before truncating.
- **Cron delivery hint**: updated to require both `delivery.to` and `delivery.accountId` for multi-account setups.
- **Plugin entry**: `register()` now respects `registrationMode` — skips CLI registration when not in full mode.
- **`sendText` / `sendMedia`**: auto-resolve `accountId` via `resolveOutboundAccountId()` when caller does not provide one.
- **Send success log level**: upgraded from `debug` to `info`.

### Fixed

- Missing `contextToken` no longer causes a hard throw and message refusal; messages are now sent without context (with a warning), matching server-side handling that tolerates missing tokens.
- Error-notice handler no longer silently swallows errors when `contextToken` is absent.
