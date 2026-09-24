# Noridoc: core

Path: @/src/core

### Overview

- Owns credential state, HTTP reads, structured output, typed failures, and mutation safety.
- Defines cross-cutting invariants used by every command family.

### How it fits into the larger codebase

- Authenticated clients resolve and redact Playwright storage state through this layer.
- Public clients reuse the rate-limit-aware JSON transport.
- Executors call confirmation and dry-run helpers before effects.

### Core Implementation

- Storage state may come from a default owner-only file, an explicit path, or a named base64 environment handoff.
- HTTP errors preserve status and retry safety without exposing credentials.
- Public GETs retry network errors, 5xx responses, and Cloudflare challenges (`403` + `cf-mitigated: challenge`) with exponential backoff (`NORI_SUBSTACK_HTTP_RETRIES`, default 2; `NORI_SUBSTACK_HTTP_RETRY_DELAY_MS`, default 5000). A challenge that outlasts the retries surfaces as the retry-safe `CLOUDFLARE_CHALLENGE` error.
- JSON output uses stable success/error envelopes.

### Things to Know

- Storage-state files must remain mode `0600`.
- Only session cookies are forwarded to authenticated requests.
- Non-idempotent requests are never blindly retried.
- A Cloudflare challenge is an IP-level block on the calling machine, not an auth or endpoint failure; the CLI reports it and never tries to solve or bypass it.

Created and maintained by Nori.
