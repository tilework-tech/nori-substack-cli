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
- JSON output uses stable success/error envelopes.

### Things to Know

- Storage-state files must remain mode `0600`.
- Only session cookies are forwarded to authenticated requests.
- Non-idempotent requests are never blindly retried.

Created and maintained by Nori.
