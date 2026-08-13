---
name: Antigravity CLI environment setup
description: Persistent CLI installation and shell configuration in the Replit terminal environment.
---

The managed shell startup file is immutable, and home-directory installs can disappear after an environment restart. Keep the Antigravity binary, launcher, and settings under the workspace; expose the launcher through the workspace's existing PATH directory. The launcher should recreate the documented config-path link and add `--sandbox`, while `toolPermission: proceed-in-sandbox` enables autonomous actions only within the sandbox. Keep explicit denies for destructive commands as defense in depth.

**Why:** The official installer can checksum and place the binary but cannot edit the managed bashrc, and unrestricted always-proceed permissions would expose the workspace and environment to unnecessary risk. Workspace storage is the durable location.

**How to apply:** When maintaining this setup, preserve the workspace-local binary/config, launcher-first PATH resolution, lowercase `agy` command, and sandbox-scoped permission policy.
