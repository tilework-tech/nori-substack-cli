# Noridoc: tests

Path: @/tests

### Overview

- Verifies the CLI as a black box through child processes, local HTTP servers, and temporary filesystems.
- Covers agentic help/errors, public/auth transport, endpoint mappings, media workflows, browser auth, safety, and packaging.

### How it fits into the larger codebase

- Exercises the same entrypoint installed by the package rather than importing internal implementation details.
- Local servers capture real methods, paths, query parameters, headers, bodies, and retry behavior.
- Packaging tests build and inspect the Git-installable artifact.

### Core Implementation

- Fixture storage states use non-production cookie values and temporary homes.
- Mutation tests assert that missing confirmation prevents network access.
- Public tests prove credential-free commands do not send cookies.

### Things to Know

- The extended endpoint matrix launches many CLI processes and has a larger test timeout by design.
- No default test changes third-party data or requires a live Substack account.
- Add live tests only behind explicit opt-in and a designated test publication.

Created and maintained by Nori.
