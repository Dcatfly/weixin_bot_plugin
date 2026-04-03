## 2.1.4

### Added

- **`StreamingMarkdownFilter`** (`src/messaging/markdown-filter.ts`): streaming character-level state machine that strips unsupported Markdown on-the-fly; replaces whole-string `markdownToPlainText`. Markdown goes from effectively unsupported to partially supported.
- **`apiGetFetch()`**: new GET fetch wrapper (shared headers, optional timeout, unified error handling) used by QR login flow.
- **`iLink-App-Id` / `iLink-App-ClientVersion` headers**: read from `package.json` `ilink_appid` and `version` fields; included in all API requests.
- **Server-provided CDN URLs**: `upload_full_url` (upload) and `full_url` (download) fields added to API types; CDN upload/download now prefer these over client-constructed URLs when present.
- **`scaned_but_redirect` QR status**: new QR polling state that switches the polling base URL to the server-provided `redirect_host` (IDC redirect support).

### Changed

- **Outbound text path**: `process-message` uses `StreamingMarkdownFilter` (`feed`/`flush`) per delivery chunk instead of `markdownToPlainText`.
- **Config reload after login**: bumps `channels.openclaw-weixin.channelConfigUpdatedAt` (ISO 8601) in `openclaw.json` on each successful login, replacing the empty `accounts: {}` placeholder write.
- **QR login base URL**: `fetchQRCode` and QR refresh now always use the fixed URL `https://ilinkai.weixin.qq.com`; no longer requires `apiBaseUrl` to be set in channel config.
- **`get_bot_qrcode` timeout**: client-side timeout removed in 2.1.4 (request is no longer aborted on a fixed deadline; was increased from 5 s to 10 s in 2.1.2).
- **`get_qrcode_status` error handling**: network/gateway errors (e.g. Cloudflare 524) now treated as `wait` and retried silently instead of throwing.
- **`apiFetch` renamed to `apiPostFetch`** internally; all existing POST callers updated.
- **Config schema**: `logUploadUrl` field replaced by `channelConfigUpdatedAt`.
- **Compatibility error message**: no longer embeds a hard-coded `PLUGIN_VERSION` string or a legacy `@1.x` install command.
- **System prompt**: added instruction that `MEDIA:` directives must appear on their own line.

### Removed

- **`markdownToPlainText`** from `src/messaging/send.ts`; coverage moved to `markdown-filter.test.ts`.
- **`openclaw-weixin` CLI subcommands** (`src/log-upload.ts` and `registerCli` call in `index.ts`). Use `openclaw plugins uninstall @tencent-weixin/openclaw-weixin` instead.
- **`peerDependencies`** (`openclaw >=2026.3.22`) from `package.json`.
- **`PLUGIN_VERSION` constant** from `src/compat.ts`.

### Fixed

- QR login no longer fails with "No baseUrl configured" when `apiBaseUrl` is absent from channel config (uses fixed base URL).
- Resolved "dangerous code pattern" warning when installing the plugin on OpenClaw 2026.3.31+.

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
