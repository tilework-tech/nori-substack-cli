# Noridoc: browser

Path: @/src/browser

### Overview

- Captures Substack browser storage state over Chromium CDP.
- Hosts a human-driven Substack sign-in through an existing noVNC stack.

### How it fits into the larger codebase

- Auth commands call this layer without requiring an existing authenticated state.
- Captured state is validated and persisted through the core authentication module.
- Hosted browser processes are tracked in an owner-local state file for idempotent stop/reuse behavior.

### Core Implementation

- Chromium discovery honors explicit and environment-configured executables before searching Playwright caches.
- Capture verifies a Substack session cookie before writing credential state.
- The host starts a virtual display, window manager, VNC bridge, websockify, and headful Chromium as detached processes.

### Things to Know

- This layer orchestrates system dependencies but never installs them.
- Captchas and account challenges remain human responsibilities.
- Host commands return immediately and must not poll for the human to finish signing in.

Created and maintained by Nori.
