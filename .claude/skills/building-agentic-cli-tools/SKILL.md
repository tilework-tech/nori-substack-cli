---
name: building-agentic-cli-tools
description: Read this skill whenever you need to build a cli where the primary consumer is the agent.
---

# Design Principles

- Do not include colors, animations, spinners, or interactive prompts.
- Use a third-party library such as Commander for the command layer.
- Bare invocation and `--help` must explain the CLI, list commands, and show source locations.
- Subcommand help must explain every flag and show the corresponding source location.
- Mistaken input must show contextual help, a detailed error, a source location, and a Levenshtein suggestion.
- Prefer structured JSON output and single-shot, flag-driven commands for coding agents.
