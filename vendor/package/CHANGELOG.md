# Changelog

[简体中文](CHANGELOG.zh_CN.md)

This project follows the [Keep a Changelog](https://keepachangelog.com/) format.

## 2.1.6

### Added

- **`iLink-App-Id` / `iLink-App-ClientVersion` headers:** All API requests (GET and POST) now send these headers, populated from `package.json`'s `ilink_appid` field and `version` respectively.
- **`apiGetFetch`:** New shared GET fetch wrapper (mirrors `apiPostFetch`) with common headers and optional timeout; used by QR login flows.
- **`ilink_appid: "bot"` in `package.json`:** Supplies the app-id header value without hardcoding it in source.
- **CDN full-URL support:** `getUploadUrl` can return `upload_full_url`; upload and download paths accept a server-provided full URL and use it instead of client-side URL construction. `ENABLE_CDN_URL_FALLBACK` flag controls whether client-side construction is used when the full URL is absent.
- **`full_url` on media items:** Image, voice, file, and video messages now carry an optional `full_url` field; media download prefers it over building a URL from `encrypt_query_param`.
- **`scaned_but_redirect` QR status:** Login polling handles the new IDC-redirect status by switching the polling base URL to `redirect_host` and continuing seamlessly.
- **`channelConfigUpdatedAt` config field:** ISO 8601 timestamp written on every successful login (replaces the old conditional `accounts: {}` placeholder logic).
- **System prompt rule:** Added instruction that `MEDIA:` directives must appear on their own line.

### Changed

- **QR login uses fixed base URL:** `fetchQRCode` and initial poll always target `https://ilinkai.weixin.qq.com`; `apiBaseUrl` from config is no longer required to initiate login.
- **QR poll errors → `wait`:** Network and gateway errors (e.g. Cloudflare 524) during `pollQRStatus` now return `{status: "wait"}` and retry instead of throwing.
- **`triggerWeixinChannelReload` always writes:** The conditional guard (only write when section is absent/empty) was removed; every successful login bumps `channelConfigUpdatedAt`.
- **Multi-account isolation config key:** README updated from `agents.mode per-channel-per-peer` to `session.dmScope per-account-channel-peer`.
- **Compat error message:** Removed hardcoded `PLUGIN_VERSION`; updated fallback install command to `npx @tencent-weixin/openclaw-weixin-cli install`.

### Removed

- **`peerDependencies`** (`openclaw >= 2026.3.22`) removed from `package.json`.
- **`logUploadUrl` config field** replaced by `channelConfigUpdatedAt` in the config schema.

## [2.1.4] - 2026-04-03

### Changed

- **QR login:** Remove client-side timeout for `get_bot_qrcode`; the request is no longer aborted on a fixed deadline (server / stack limits still apply).

## [2.1.3] - 2026-04-02

### Added

- **`StreamingMarkdownFilter`** (`src/messaging/markdown-filter.ts`): outbound text no longer runs through whole-string `markdownToPlainText` stripping; a streaming character filter replaces it, so Markdown goes from **effectively unsupported** to **partially supported**.

### Changed

- **Outbound text path:** `process-message` uses `StreamingMarkdownFilter` (`feed` / `flush`) per deliver chunk instead of `markdownToPlainText`.

### Removed

- **`markdownToPlainText`** from `src/messaging/send.ts` (and its tests from `send.test.ts`); coverage moves to `markdown-filter.test.ts`.

## [2.1.2] - 2026-04-02

### Changed

- **Config reload after login:** On each successful Weixin login, bump `channels.openclaw-weixin.channelConfigUpdatedAt` (ISO 8601) in `openclaw.json` so the gateway reloads config from disk, instead of writing an empty `accounts: {}` placeholder.
- **QR login:** Increase client timeout for `get_bot_qrcode` from 5s to 10s.
- **Docs:** Uninstall instructions now use `openclaw plugins uninstall @tencent-weixin/openclaw-weixin` (aligned with the plugins CLI).
- **Logging:** `debug-check` log line no longer includes `stateDir` / `OPENCLAW_STATE_DIR`.

### Removed

- **`openclaw-weixin` CLI subcommands** (`src/weixin-cli.ts` and registration in `index.ts`). Use the host `openclaw plugins uninstall …` flow instead.

### Fixed

- Resolves the **dangerous code pattern** warning when installing the plugin on **OpenClaw 2026.3.31+** (host plugin install / static checks).
