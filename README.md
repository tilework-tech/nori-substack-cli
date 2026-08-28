# nori-substack-cli

Agent-first CLI for reading and operating Substack. It combines stable public feeds and JSON endpoints with authenticated web endpoints backed by Playwright browser storage state.

The CLI is non-interactive, emits JSON by default, never uses color or spinners, and exposes source locations in recursive help.

## Install

Requires Node.js 18.18 or newer and access to the private Tilework Tech repository.

```bash
npm install -g git+ssh://git@github.com/tilework-tech/nori-substack-cli.git
nori-substack --version
```

Compiled `dist/` output is included, so Git installation does not require TypeScript or an install-time build. The package supports Node.js 18 and pins its HTML parser to a compatible release.

For development:

```bash
npm install
npm run compile
npm test
npm run lint
```

## Unauthenticated use

Public operations do not read credential state:

```bash
nori-substack publication get --url https://example.substack.com
nori-substack publication feed --url https://example.substack.com
nori-substack publication archive --publication-url https://example.substack.com
nori-substack post list --publication-url https://example.substack.com --limit 10
nori-substack post get --publication-url https://example.substack.com --post-id 123
nori-substack comment list --publication-url https://example.substack.com --post-id 123
nori-substack discover categories
nori-substack discover search --query "climate"
```

## Portable syndication exports

Substack retrieval and normalization belong in this CLI. Export commands produce versioned JSON that triggers and destination CLIs can consume without understanding Substack APIs or HTML.

Export a public post as an Article bundle:

```bash
nori-substack post export \
  --url https://example.substack.com/p/example-post \
  --output article.json
```

The bundle preserves source copy and includes the title, canonical URL, cleaned HTML, cover image, and inline images. Structural elements use portable markers such as `[[NORI_DIVIDER]]` and `[[NORI_IMAGE:0]]`.

Export recent top-level Notes from one author:

```bash
nori-substack note export \
  --user-id 9744387 \
  --lookback-hours 4 \
  --output notes.json
```

To select an approved older Note, add `--note-id <id>`; the author and top-level filters still apply while the lookback cutoff is bypassed. Notes are ordered oldest first and preserve text, quote blocks, links, remote images, IDs, and timestamps.

Example Article artifact:

```json
{
  "version": 1,
  "kind": "article",
  "title": "Example",
  "canonicalUrl": "https://example.substack.com/p/example",
  "html": "<p>Exact source copy</p>",
  "images": []
}
```

These commands only read Substack. Cross-platform selection, approval, deduplication, and publishing belong in the trigger or workflow that invokes the destination CLI.

## Authentication

Authenticated commands use Playwright storage state. The owner-only default location is:

```text
~/.local/share/noriagent/substack-storage-state.json
```

Import or export a state handoff:

```bash
nori-substack auth import --base64 "$STATE_B64" --confirm
nori-substack auth status
nori-substack auth export
```

The default environment handoff is `NORIAGENT_SUBSTACK_STORAGE_B64`. Override its name with `--state-env`, or use a specific file with `--state`.

For a human sign-in, `auth host` starts a headful Chromium/noVNC bridge when the runtime has Chromium, X11/VNC, websockify, and noVNC installed. It returns immediately with a gated URL. After the human signs in, capture the browser context:

```bash
nori-substack auth host --confirm
nori-substack auth capture --cdp http://127.0.0.1:9222 --confirm
nori-substack auth host --stop --confirm
```

## Authenticated command families

- `profile`: authenticated identity and public profile lookup
- `publication`: owned publications, search, settings, metadata updates, sections, pages, users, tags, and exports
- `post`: public posts and portable exports, drafts, create/update/delete, publish, schedule, and statistics
- `note`: feed, profiles, portable exports, details, drafts, create, reply, delete, and seen state
- `comment`: list, create, delete, react, unreact, and moderation metadata
- `reader`: inbox, feed, tabs, subscriptions, archives, activity, messages, unread counts, and blocked users
- `subscriber`: list, add, remove, and import status
- `recommendation`: list, search, suggestions, add/remove, relationships, and statistics
- `analytics`: summary, post, email, growth, network attribution, pledges, and timeseries
- `chat`: settings, list, scheduled posts, send, and delete
- `media`: image upload, complete audio upload/transcode, and audio status
- `live`: streams and eligible hosts
- `crosspost`: LinkedIn and YouTube authorization status

Run `nori-substack <family> --help` or `nori-substack <family> <operation> --help` for exact flags and source locations.

## Mutation safety

Every write requires `--confirm`. Content and publication updates that support previews accept `--dry-run`; dry runs require neither credentials nor network access. Publishing does not email subscribers unless `--send-email` is present.

Examples:

```bash
nori-substack post create \
  --publication-url https://example.substack.com \
  --data '{"draft_title":"Hello","draft_body":"<p>World</p>"}' \
  --dry-run

nori-substack post publish \
  --publication-url https://example.substack.com \
  --draft-id 123 \
  --confirm
```

## Output and errors

Successful JSON output uses an envelope:

```json
{"ok":true,"command":"publication.get","data":{}}
```

Errors go to stderr as structured JSON with stable codes, retry guidance, and credential redaction. Commander usage errors include the implementation source. Use `--format text` only when human-readable output is needed.

## Stability and limitations

Public RSS/JSON reads are the most stable surface. When Substack forbids the former public publication JSON endpoint, `publication get` extracts the same publication object from the public homepage preload. Most authenticated management commands call undocumented Substack web endpoints and may drift without notice; HTTP failures are returned explicitly rather than treated as success.

The CLI does not automate captchas, publication creation, magic-link email retrieval, or unmapped direct-message sending. Hosted auth orchestrates a browser for a human; it does not bypass challenges. Live mutation tests require a designated test publication and are intentionally not part of the default suite.

## Security

- Storage-state files are written with mode `0600`.
- Session cookies and storage-state values are redacted from errors and normal output.
- Public operations never require credentials.
- Non-idempotent writes are not automatically retried.
- Credential state, environment files, and package archives are excluded from Git; compiled `dist/` is intentionally tracked for Git consumers.

This repository is private and unlicensed (`UNLICENSED`).
