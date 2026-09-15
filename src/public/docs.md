# Noridoc: public

Path: @/src/public

### Overview

- Owns credential-free normalization of public Substack posts and Notes.
- Produces versioned, source-neutral artifacts for trigger and destination-CLI composition.

### How it fits into the larger codebase

- Receives public API payloads from the public client.
- Is called only by public export command handlers.
- Keeps Substack document shapes outside destination CLIs such as `nori-twitter`.
- Returns remote media references; destination CLIs materialize them when needed.

### Core Implementation

- Article export parses custom-domain `/p/<slug>` URLs, cleans subscription UI, and emits divider and image markers.
- Note export follows public profile cursors until a forced ID or lookback boundary is reached.
- Note filtering requires the requested author, a top-level feed entity, and either the time window or exact forced ID.
- Note artifacts advertise the `substack-mention-spans-v1` capability and retain explicit Substack mentions as optional structured UTF-16 spans while leaving visible text unchanged; plain names have no mention metadata.
- Article artifacts use `kind: "article"`; Note candidates use a source-neutral `kind: "posts"` collection.

### Things to Know

- Source text is preserved; platform mention provenance is carried beside the text, and punctuation, quotations, and whitespace are not silently rewritten.
- Forced Note IDs that cannot be found fail explicitly instead of producing a successful empty artifact.
- Post collections are ordered oldest first for deterministic approval and publishing workflows.
- Artifact `version` changes require coordinated consumer support.

Created and maintained by Nori.
