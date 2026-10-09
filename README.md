# LOWLIGHT — Harbor City

Project repository for [michaelcrosato/gta4-gpt61](https://github.com/michaelcrosato/gta4-gpt61).
An original urban crime drama built on the supplied my-3d2dge engine. Mara Voss,
a former relief driver, arrives in Harbor City looking for honest work and finds
a city that keeps its debts better than its promises.

**Development status:** the playable opening is implemented. The complete
campaign and reference-wide content/feature scope remain in development. See the
[original brief](docs/brief.md), [production plan](docs/production-plan.md), and
[source research](docs/research/story-scope.md).

## Play locally

Requires Node.js 22 or newer. The game has no third-party runtime dependencies.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://localhost:5173. Use WASD/arrows to move, E to interact/enter a vehicle,
Shift to sprint/brake, mouse/click to aim/fire, R to reload, M for the city map,
T for the phone, and Escape to pause. Touch controls and gamepads are supported.
The menu includes full controls, audio/camera settings, and continue/save support.

The 0.3 build expands the exterior world to 65 original neighborhoods and 194
site addresses, with coastal landforms, graded bridges and road bores, swimming,
regional traffic, and persistent populations. Ground/map tiles and visible
building textures use bounded caches. Interiors, train operation, boats and
other full-city content remain in development.

The combat and activity foundation includes 17 weapon roles, physical explosives/fire, melee
guard/counters/disarms, crouch/cover and vault/climb controls. Police escalate
through six levels with actual pursuits, roadblocks, arrest and airborne search.
Blue Hour Lanes, The Lantern, Saltworks Billiards and Night Owl Arcade offer full
bowling, 301 darts, eight-ball and STACKLIGHT matches. The complete campaign,
city, side content and multiplayer remain in production.

```sh
npm run check
npm run format:check
npm test
npm run scope
npm run build
LOWLIGHT_ROOT=dist PORT=5174 npm run dev
```

The build is a static site in `dist/`. Progress and preferences are saved in the
browser on this device; no account or network service is required for gameplay.

`npm run format` formats game source and tooling; it preserves the supplied
engine source layout. `npm run scope` reports the source catalogue separately
from the implemented opening, and does not treat planned content as delivered.

With Playwright installed (`requirements-dev.txt`), run browser control and
save/continue regression checks against the development server:

```sh
python3 tests/browser-smoke.py --url http://localhost:5173/
python3 tests/browser-activities.py --url http://localhost:5173/
python3 tests/browser-map.py --url http://localhost:5173/
python3 tests/browser-city.py --url http://localhost:5173/
```

This runs Chromium, Firefox, and a WebKit iPhone profile. Reports and screenshots
go to `/tmp`, and the script exits with failure if a control or browser check
fails. It verifies the opening and interface, not the complete campaign. See
[verification boundaries and evidence](docs/verification.md).
The activity and city/map scripts declare their venue, budget, late-game,
and geography fixtures;
its checks do not replace a natural playthrough from a clean save.

## Setup

Requires Git, [GitHub CLI](https://cli.github.com/), and Python 3.11 or newer on
Linux, WSL, or macOS. Authenticate with `gh auth login`, then run:

```sh
git clone https://github.com/michaelcrosato/gta4-gpt61.git
cd gta4-gpt61
./scripts/setup-local.sh
```

The setup installs repository-local hooks, the `git publish` alias, automatic
fetch pruning, and fast-forward-only pulls. Run it once in each new clone.

## Commit and publish

```sh
git add <files>
git commit -m "Describe the change"
```

Every commit automatically pushes its committed snapshot to
`publish/<local-branch>`, creates or updates a pull request into `main`, and
enables auto-merge. GitHub waits for the required `Repository checks` CI job,
merges, and deletes the remote publication branch. Local files, your index, and
your checked-out branch are left untouched. Commits on local `main` also follow
this PR workflow; the hook never pushes directly to GitHub's protected `main`.

Publishing takes a few network requests during the commit. CI and merging happen
on GitHub after the commit command returns. A failed push or check leaves your
commit saved locally. Resolve the reported problem and retry:

```sh
git publish                 # Push/update the PR and queue its merge
git publish --wait          # Also wait up to 10 minutes for the merge
git pull --ff-only          # Update local main after its PR has merged
```

When using a local working branch, switch to `main` before pulling. Once its
commits are on `main`, delete that local branch with `git branch -d <branch>`.
GitHub retains merged PR records; branch deletion is the automatic cleanup.
Merge commits preserve local commit ancestry so repeated commits from the same
branch work after the remote branch is deleted.

Publishing requires write access to this repository and a named local branch.
Other contributors can push to their forks and open PRs using GitHub's normal
workflow. Public contributions are not automatically approved or merged.

```sh
SKIP_AUTO_PUBLISH=1 git commit -m "Keep this commit local for now"
git config --local repo.autoPublish false   # Disable the hook's publication
git config --local repo.autoPublish true    # Enable it again
```

## Verification

```sh
python3 -m unittest discover -s tests -v
npm run check
npm test
npm run build
git diff --check
for script in .githooks/post-commit scripts/setup-local.sh scripts/setup-github.sh; do
  bash -n "$script"
done
```

CI runs the publication tests and JavaScript/shell syntax and whitespace checks
on PRs and `main`.
CI also builds the static game and runs the simulation tests. See
[AGENTS.md](AGENTS.md) for UI verification tools.

## Repository maintenance

The repository has issue forms, a PR template, code ownership, editor and Git
formatting rules, and [contribution](CONTRIBUTING.md) and [security](SECURITY.md)
guidance. Actions are pinned to verified release commits and updated weekly by
Dependabot. CI uses read-only permissions and does not need repository secrets.

`main` requires a PR, passing CI from GitHub Actions, and resolved conversations.
Protection also applies to administrators; force pushes and deletion are
disabled. Independent approval is not required for the owner's automatic commit
workflow. Secret scanning, push protection, Dependabot alerts/security fixes, and
private vulnerability reporting are enabled.

An administrator can reapply settings with `./scripts/setup-github.sh`. Its
versioned inputs are [.github/repository-settings.json](.github/repository-settings.json)
and [.github/branch-protection.json](.github/branch-protection.json).

No license has been selected for this project's original code yet. The supplied
engine retains its upstream MIT license in [LICENSES/my-3d2dge.txt](LICENSES/my-3d2dge.txt).
