# Noridoc: nori-substack-cli

Path: @/

### Overview

- Provides a non-interactive, JSON-first CLI for authenticated and unauthenticated Substack workflows.
- Owns Substack retrieval and normalization for versioned, source-neutral Article and post artifacts.
- Combines public RSS/JSON reads, the official developer-token lookup, cookie-authenticated web endpoints, and human-assisted browser authentication.

### How it fits into the larger codebase

- Follows the Nori agentic CLI contract vendored under `@/.claude/skills`.
- Gives triggers portable artifacts while leaving destination selection, approval, deduplication, and publishing outside this CLI.
- Is installable directly from the private GitHub repository and bundles both compiled JavaScript and TypeScript source.
- Uses Substack publication hosts for publication-scoped operations and the account host for global reader/profile operations.
- Treats Playwright storage state as the authenticated credential boundary.

### Core Implementation

- Public post and Note exports preserve source copy, structural markers, remote media, and canonical metadata without loading credentials.
- Commander builds the recursive command tree from declarative family and operation specifications.
- Public and authenticated executors route into separate clients; multi-step media and browser-auth flows have dedicated handlers.
- All output passes through structured JSON/text writers and all errors use stable typed envelopes.
- Mutations are gated by explicit confirmation, with dry-run support for content-changing workflows.

### Things to Know

- Compiled `dist/` is tracked and CI verifies it matches source so Git consumers never need the TypeScript toolchain.
- Most authenticated Substack endpoints are undocumented and can drift independently of this package.
- Public operations intentionally bypass storage-state resolution.
- The hosted authentication bridge orchestrates existing system browser/VNC tools and never installs them.
- Tests use real local HTTP and filesystem boundaries; live Substack mutations are excluded by default.

Created and maintained by Nori.
