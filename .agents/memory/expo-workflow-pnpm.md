---
name: Expo workflow package manager
description: Node and package-manager constraint for the imported Expo frontend.
---

The imported frontend runs on Node 20. The system pnpm is compatible, but a local pnpm 11 shim can be left behind by package installation and then fail on `node:sqlite`. The Expo workflow should use the system pnpm and invoke the installed Expo binary directly rather than `pnpm exec`.

**Why:** The local shim targets Node 22+, so workflows can fail before Metro starts even when all frontend dependencies are installed.

**How to apply:** Keep the root workflow on the Node 20-compatible system pnpm path and avoid adding pnpm as an application dependency.