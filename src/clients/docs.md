# Noridoc: clients

Path: @/src/clients

### Overview

- Provides credential-free public access and cookie-authenticated Substack requests.
- Preserves upstream response data for agent inspection.

### How it fits into the larger codebase

- Public commands use the RSS/JSON client without touching auth state.
- Authenticated command handlers use the storage-state-backed request client.
- Both clients convert transport failures into stable CLI errors.

### Core Implementation

- Public publication, post, comment, archive, profile, category, and search reads use direct fetches; publication metadata falls back to the public homepage preload when the former JSON endpoint is forbidden.
- RSS is normalized into publication metadata and item records.
- Authenticated requests attach only validated Substack session cookies and redact upstream error bodies.

### Things to Know

- Publication custom domains are supported by deriving endpoints from the supplied origin.
- Authenticated web endpoints are undocumented and should be verified when changed.

Created and maintained by Nori.
