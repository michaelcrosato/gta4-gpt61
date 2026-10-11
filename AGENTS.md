# Repository instructions

Read README.md and CONTRIBUTING.md before changing the repository. Keep changes
focused and use the existing stack: plain ES modules, Node.js tooling and no
third-party runtime dependencies.

## Delivery workflow

- Complete and verify the requested work, then commit it. The installed
  post-commit hook automatically pushes a snapshot, opens or updates a PR,
  and enables merging after required checks pass.
- Run `git publish --wait` and inspect the PR/checks to verify delivery. Fix
  failed checks or conflicts and retry; never bypass branch protection.
- After merging, switch to `main`, pull with `--ff-only`, and delete a merged
  local working branch with `git branch -d`. GitHub deletes remote publication
  branches automatically. Do not delete unrelated or unmerged work.
- If this clone has no hooks installed, run `./scripts/setup-local.sh` first.
  Never commit credentials, dependency directories, or generated reports.
- Add meaningful checks appropriate to a change; run the README verification
  commands and relevant application tests. Keep lockfiles tracked.

## Testing toolkit on this machine (WSL2, Ubuntu 26.04)

Cross-browser, mobile, and viewport tools are installed machine-wide. When you
build or change UI, check small phones, tablets, wide screens, and WebKit
(Safari's engine). Full cheatsheet: `~/dev/TESTING-TOOLKIT.md`.

- `viewport-matrix <url>` screenshots 14 phone/foldable/tablet/desktop viewports
  (iPhone SE through 21:9 ultrawide). iOS runs WebKit, Android runs Chromium, and
  desktop runs Chromium, WebKit, and Firefox. It flags horizontal overflow with
  the offending element and console/JS errors, then writes PNGs, `index.html`,
  and `report.json` to `/tmp/viewport-matrix/<timestamp>`. Use `-o DIR` to
  override; never write reports into the repository. Inspect the PNGs yourself.
  Options: `--only phone,foldable,tablet,desktop`, `--engines webkit`,
  `--all-engines`, `--devices "iPhone SE (3rd gen),Galaxy Z Fold 7"`,
  `--full-page`, and `--dpr1`.
- Playwright 1.63 and Chromium, Firefox, and WebKit are already downloaded.
  Example: `playwright screenshot --device="iPhone 17 Pro" URL out.png`.
  Keep `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` (set in `~/.bashrc`).
  Do not run `playwright install-deps`: it fails on 26.04 and nothing is missing.
- `lighthouse <url>` audits mobile performance, accessibility, and best
  practices. Use `--preset=desktop` for desktop and
  `--output=json --output-path=...` for machine-readable results.
- `android-web <url> [Pixel_10|Pixel_10_Pro_Fold|Pixel_Tablet|Resizable]` opens
  real Chrome on an Android 17 emulator, with localhost ports forwarded.
  `adb`, `emulator`, and `scrcpy` are on PATH; `ANDROID_HOME=~/Android/Sdk`.
- `phone-preview <port>` creates a public Cloudflare tunnel and QR code.
  Only run it when the user asks.
- `shot-scraper`, `browser-sync`, `mkcert`, and `cloudflared` are available.
- Real iOS Safari is unavailable. WebKit with iPhone profiles is the closest
  automated check; say so when it matters.
