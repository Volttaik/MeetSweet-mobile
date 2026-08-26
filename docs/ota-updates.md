# MeetSweet — GitHub-to-OTA Update System (EAS Update)

MeetSweet ships compatible JavaScript/asset changes over the air through
**Expo EAS Update**, so users don't have to download a new APK for every UI or
logic change. The GitHub repository is the source of truth for code; **EAS
Update is the only delivery mechanism** — the app never downloads anything from
GitHub directly.

## Architecture

```
Developer pushes compatible changes
        │
        ▼
MeetSweet GitHub repository — production branch (main)
        │
        ▼
GitHub Actions (.github/workflows/eas-update.yml)
        │  1. install deps (pnpm, frozen lockfile)
        │  2. fingerprint check: HEAD vs HEAD~1
        │     ├─ native runtime changed → ❌ "A new native build is required"
        │     └─ runtime unchanged   → ✅ continue
        │  3. point EAS channel "production" → EAS branch "main"
        │  4. eas update --branch main
        ▼
EAS Update (production channel)
        │
        ▼
Installed MeetSweet APK (built with the "production" profile)
        │  expo-updates checks for a compatible update on launch
        ▼
Download + apply update → relaunch → updated app
```

## Project facts

| Item | Value |
| --- | --- |
| Expo SDK | `~55.0.29` |
| `expo-updates` | `~55.0.28` (installed — native module, must be in the APK) |
| Runtime policy | `runtimeVersion: { "policy": "fingerprint" }` (in `app.json`) |
| EAS project ID | `655098fe-684b-4275-8650-a951cb856cc1` (owner `webcons-team`) |
| EAS Update URL | `https://u.expo.dev/655098fe-684b-4275-8650-a951cb856cc1` |
| Update check | `checkAutomatically: "ON_LOAD"`, `fallbackToCacheTimeout: 0` |
| Production channel | `production` (set in `eas.json` → build profile `production`) |
| Production EAS branch | `main` |
| Production git branch | `main` |
| App package / bundle id | `com.meetsweet.app` |

## Runtime strategy (fingerprint policy)

The native runtime is identified by an **Expo fingerprint** — a hash of the
native surface: `app.json` / `app.config.*`, `eas.json`, native folders
(`ios/`, `android/`, `plugins/`), `google-services.json`, and dependencies
(`package.json` + lockfile). JavaScript/TypeScript, styling, assets, and other
source files are **not** part of the fingerprint.

- **JS-only push → fingerprint unchanged → delivered OTA** to every installed
  APK that was built from the same runtime fingerprint.
- **Native push → fingerprint changes → the workflow refuses to publish** and
  reports that a new EAS build (new APK) is required.

An installed APK only ever downloads updates whose fingerprint matches the one
it was built with, so an incompatible update can never be applied to the wrong
build.

## GitHub Actions workflow

File: `.github/workflows/eas-update.yml` (repo root).

Triggers:

- `push` to `main` (paths-ignore: `docs/**`, `**/*.md`, `.github/**`)
- `workflow_dispatch` (manual run from the Actions tab)

Jobs:

1. **native-change-check** — computes the fingerprint at `HEAD` and `HEAD~1`
   (via `git worktree`) and fails the run with `::error::A new native build is
   required…` if they differ. No EXPO_TOKEN is needed for this job, but the
   secret is verified up front so failures are loud.
2. **publish-update** — runs after the check passes:
   - `eas channel:create production --non-interactive || true`
   - `eas channel:edit production --branch main --non-interactive`
   - `eas update --branch main --message "Production OTA: <sha> — <commit msg>" --non-interactive`

## Required GitHub Secrets

| Secret | Where to get it | Purpose |
| --- | --- | --- |
| `EXPO_TOKEN` | https://expo.dev/settings/access-tokens (account must have access to the project above) | Authenticates `eas` in CI |

No other secrets are used. Never commit a token, key, or password to the
repository.

## What can be delivered OTA (no new APK)

- React components and JS/TS logic
- Styling, colors, gradients, typography, spacing
- Navigation and screen changes
- Text/content changes
- Bug fixes in JS
- API/client integration changes that don't require new native code
- Adding assets that are bundled by Metro (images, fonts, sounds referenced
  from JS)
- New JS-only packages

## What requires a new EAS build (new APK)

- Adding/removing native dependencies (`expo-*` modules, `react-native-*`
  native libs) — including `expo-updates` itself (already included)
- Changes to `app.json` / `app.config.*` (plugins, permissions, icon, splash,
  `android.*`, `ios.*`, EAS config)
- Changes to `eas.json` (build profiles, channels)
- Changes in `ios/`, `android/`, or `plugins/`
- Changes to `google-services.json` / FCM configuration
- Expo SDK upgrades

The CI workflow blocks these from being published as OTA. Publish a new build
instead (see below).

## Deployment commands

### Publish an OTA update (automatic)

```bash
git push origin main
```

GitHub Actions does the rest. Verify it on the EAS dashboard
(`u.expo.dev` → project → Updates) or with:

```bash
eas branch:view main
```

### Publish an OTA update (manual)

```bash
# from MeetSweet-mobile/MeetSweet-mobile
eas update --branch main --message "Manual production update" --non-interactive
```

### Build a new APK (required after native changes)

```bash
# from MeetSweet-mobile/MeetSweet-mobile
eas build --profile production --platform android
```

The production profile embeds the `production` channel, so the new APK will
check the same channel for future OTA updates. After the new build is
installed, the fingerprint policy lets subsequent JS-only changes flow OTA
again.

## Rollback / recovery

A bad OTA can never "brick" the app: `expo-updates` keeps the previously
installed bundle and falls back to it if an update fails to download or apply.
To roll back a bad production update:

1. Identify the update group id: `eas branch:view main` (or the EAS dashboard).
2. Roll back to the last known-good update (git-style revert of the EAS branch):

   ```bash
   eas update:republish --group <update-group-id>
   ```

   Or republish the entire previous branch state:

   ```bash
   eas update:republish --branch main
   ```

3. Users who have not yet applied the bad update simply won't get it; users who
   did will pick up the republished (good) update on their next launch check.

To make an OTA-eligible hotfix: revert the bad commit on `main` and push — CI
publishes the corrected update.

## Identifying the runtime of an installed APK

- The EAS dashboard shows each build's runtime version; each published update
  shows the fingerprint it targets.
- Locally, compute the fingerprint for a checkout:

  ```bash
  cd MeetSweet-mobile/MeetSweet-mobile
  node -e "require('expo/fingerprint').createFingerprintAsync(process.cwd()).then(f => console.log(f.hash))"
  ```

- If a build's runtime fingerprint no longer matches the fingerprint of updates
  on the `production` channel, the APK was built from different native state —
  install a new build (fingerprint mismatch shows up in the app's logs as
  "no compatible update found").

## Troubleshooting

- **Workflow fails with "A new native build is required."** — the pushed commit
  changed the native runtime. Do not force the OTA; create a new APK with
  `eas build --profile production`. Re-run the workflow after the rebuild.
- **Workflow fails with "EXPO_TOKEN secret is not configured."** — add the
  `EXPO_TOKEN` repository secret (see above).
- **Update published but devices don't get it.** — check that the installed
  build was built with the `production` profile (channel `production`) and
  that the channel points at `main` (`eas channel:view production`). Confirm
  the build's runtime fingerprint matches the update's.
- **App stays on the old bundle after an update.** — `checkAutomatically` is
  `ON_LOAD`; updates apply on the next launch/relaunch, not mid-session. Open
  the app fresh (or relaunch after a prompt). Verify connectivity to
  `https://u.expo.dev/…`.
- **Update server unreachable.** — the app keeps working from its installed
  bundle; no user-visible failure beyond normal behavior.
- **`eas update` prompts for a project.** — run it from
  `MeetSweet-mobile/MeetSweet-mobile` (where `app.json` with
  `extra.eas.projectId` lives) and pass `--non-interactive`.
