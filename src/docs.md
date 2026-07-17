# Noridoc: src

Path: @/src

### Overview

- Contains the executable entrypoint and the CLI's command, transport, authentication, domain, and browser layers.
- Keeps public reads separate from credential-bearing operations.

### How it fits into the larger codebase

- The package build compiles this tree to `@/dist` while preserving it in the installable package for source-aware help.
- The entrypoint delegates to the command program, which routes to clients and core policies.
- Tests invoke the entrypoint as a child process to verify observable behavior.

### Core Implementation

- Command specifications describe the surface and options without interactive prompts.
- Executors implement direct reads, authenticated mutations, multi-step uploads, and auth lifecycle commands.
- Core modules own output, typed failures, state parsing, HTTP behavior, and safety gates.

### Things to Know

- Source paths are part of help and error output and should remain stable.
- Secrets must pass through the redaction boundary before reaching output.
- New mutations must require confirmation before filesystem or network effects.

Created and maintained by Nori.
