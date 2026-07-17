# Noridoc: commands

Path: @/src/commands

### Overview

- Defines the recursive CLI contract and dispatches every command family.
- Implements public, authenticated, verified endpoint, browser-auth, and media workflows.

### How it fits into the larger codebase

- Receives parsed Commander options from the program and calls clients or browser helpers.
- Uses core safety policies before any mutation.
- Returns raw service data to the output layer rather than printing directly.

### Core Implementation

- Declarative specifications centralize names, descriptions, required options, defaults, and confirmation flags.
- The top-level router keeps credential-free commands on the public path.
- Dedicated handlers own state import/export, publishing, Notes transformations, and multipart audio upload.

### Things to Know

- Add source-aware help for every new operation.
- Keep options flag-driven and single-shot; do not add prompts, spinners, or color.
- Undocumented endpoint handlers should fail explicitly on drift and must not infer success.

Created and maintained by Nori.
