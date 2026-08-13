---
name: Antigravity CLI environment setup
description: Persistent CLI installation and shell configuration in the Replit terminal environment.
---

The managed shell startup file is immutable; persistent user shell changes belong in `$HOME/.config/bashrc` and/or `$HOME/.profile`. The Antigravity CLI is safest to launch through a persistent wrapper that adds `--sandbox`, while `toolPermission: proceed-in-sandbox` enables autonomous actions only within the sandbox. Keep explicit denies for destructive commands as defense in depth.

**Why:** The official installer can place the binary successfully but cannot edit the managed bashrc, and unrestricted always-proceed permissions would expose the workspace and environment to unnecessary risk.

**How to apply:** When maintaining this setup, preserve the wrapper-first PATH order, the global Antigravity settings location, and the sandbox-scoped permission policy.
