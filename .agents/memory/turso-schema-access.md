---
name: Turso schema access
description: How this project accesses its external LibSQL/Turso database during setup and migrations
---

Use the project's secure `TURSO_DATABASE_URL` environment value and `TURSO_AUTH_TOKEN` secret with Turso's HTTPS `/v2/pipeline` endpoint. Convert a `libsql:` URL to `https:` before appending `/v2/pipeline`; send pipeline requests with `requests: [{ type: "execute", stmt: { sql } }]`.

**Why:** No Turso or LibSQL Replit connector is available in this project, and Turso's pipeline endpoint rejects the generic batch shape.

**How to apply:** Inspect the live SQLite schema with `sqlite_master` and `PRAGMA table_info(...)` before applying migrations. Never print the URL or token.