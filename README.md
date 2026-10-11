# LOWLIGHT — Harbor City

Project repository for [michaelcrosato/gta4-gpt61](https://github.com/michaelcrosato/gta4-gpt61).
An original urban crime drama built on the supplied my-3d2dge engine. Mara Voss,
a former relief driver, arrives in Harbor City looking for honest work and finds
a city that keeps its debts better than its promises.

## Status

LOWLIGHT is in development. New Game plays the first three of twenty authored
first-arc missions — **Night Crossing**, **Late Meter** and **Two Seats Open** —
through the physical simulation. The other seventeen are authored but not yet
integrated, and the full scope is ninety source-mapped missions plus the city,
side content and multiplayer described in the
[original brief](docs/brief.md) and [production plan](docs/production-plan.md).
Legacy saves also keep four original onboarding jobs.

No source mission has completion credit yet. The
[verification record](docs/verification.md) lists the evidence for each release,
its fixture boundaries and the retained failures. The
[source research](docs/research/story-scope.md) holds the story catalogue.

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
For melee, select fists or a tool with Q, hold right mouse to guard, then use F
to counter or Z to disarm after a block. On touch, open MORE ACTIONS for GUARD
and DISARM.

Progress and preferences are saved in the browser on this device. Gameplay needs
no account or network service.

## What is in the build

### Harbor City

The exterior world contains 65 original neighborhoods and 194 site addresses
across five districts, with coastal landforms, graded bridges and road bores,
swimming, regional traffic and persistent populations. Ground/map tiles and
visible building textures use bounded caches, and city generation caches static
road bounds and rail construction to shorten startup.

### Interiors

Eight rooms share the game's combat, doors, destructible props, persistent
occupants and saves: Voss Dispatch, Saira’s Garage, The Lantern, Blue Hour Lanes,
Dockside Rooms, the Old Quay impound annex, Tess’s flat and Pier Goods. Indoor
witnesses report the exterior entrance. The garage has a paid tools counter and
a repair bay where vehicles keep their momentum, the bar serves paid drinks, and
the lanes offer paid bowling and food.

### Harbor Metro

Four services run across 26 station complexes with 56 directional stop roles,
phone destinations, boarding/alighting, fares, signals and saved journeys.
Dispatch checks reservations against each train's full swept body and grants a
waiting request only when its complete resource bundle is free. Saves from 0.6
in which every train was held resume without resetting the fleet.

### Combat, police and activities

There are 17 weapon roles, physical explosives/fire, melee guard/counters/disarms,
crouch/cover and vault/climb controls. Police escalate through six levels with
actual pursuits, roadblocks, arrest and airborne search. Blue Hour Lanes,
The Lantern, Saltworks Billiards and Night Owl Arcade offer full bowling,
301 darts, eight-ball and STACKLIGHT matches.

### Campaign

- **Night Crossing.** Mara arrives on a physical ferry, reunites with Felix,
  drives their shared taxi through a stopped driving lesson, and reaches
  Dockside Rooms. The shelter has a required conversation choice, owned outfits,
  finite meals, a physical save desk and a six-hour rest. Companions walk,
  board, ride, exit and take damage in the shared simulation; checkpoints
  restore that world.
- **Late Meter.** Felix then travels to Voss Dispatch. Bring a working taxi to
  its rank and speak to him inside. Drive him to the impound annex, identify the
  collector’s jacket and clipboard, and use the phone’s contact list to deliver
  a timed warning while people and vehicles keep moving. The collector drives
  his own car and follows real roads and last sightings; break the pursuit and
  return Felix and the taxi to dispatch. Harming the clerk or patrol can
  interrupt the job.
- **Two Seats Open.** Speak to Felix inside dispatch again. Guard Dax’s blade
  attack and disarm him; his wrist injury, bandage and both collectors’ retreat
  persist in saves. Felix rides along while Nadia and Tess fill the remaining
  seats. Deliver Tess through her doorway and Nadia into dispatch, then choose
  one of three original outfits at Pier Goods with the single co-op voucher.
  Bea and Felix must be present for the final conversation.

Leaving an interrupted mission keeps its checkpoints; the phone and journal
offer an explicit retry or full restart after Continue.

### Saves and compatibility

Failed storage writes preserve the previous save and earn no save credit.
Legacy saves still Continue, including the four onboarding jobs. Metro saves use
a portable topology signature across browser engines. Known 0.5 and 0.6
campaign saves keep their progress and receipt identities when unplayed mission
content changes; unknown versions or changed owned missions are rejected rather
than silently replacing progress. Known old saves migrate their fleet, occupied
resources and supported bodies without resetting clocks, fares or story.

## Known limitations

- The wider public headroom rebuild is open. Dispatch and Tess’s street have
  calibrated body/ceiling checks and rebuilt rail spans, but other low decks,
  bridges and underground chambers are not certified for full standing access.
  Some of those routes can reject a full-height body during Two Seats Open and
  its approach.
- Seventeen authored first-arc missions still need physical integration.
- The first three missions have production-input checks, not a full natural
  browser playthrough, and the four onboarding jobs have not been completed in
  one natural input run.
- Sustained gameplay and real-device (including iOS Safari) performance remain
  release gates.

## Development checks

These mirror CI (`.github/workflows/ci.yml`):

```sh
git diff --check
python3 -m unittest discover -s tests -v
node --check my-3d2dge.js
npm run check
npm run format:check
npm test
npm run scope
npm run build
for script in .githooks/post-commit scripts/setup-local.sh scripts/setup-github.sh; do
  sh -n "$script"
done
```

`npm run format` formats game source and tooling; it preserves the supplied
engine source layout. `npm run scope` reports the source catalogue separately
from the implemented content and never treats planned content as delivered.
`npm run build` writes a static site to `dist/`; serve it with
`LOWLIGHT_ROOT=dist PORT=5174 npm run dev`.

### Browser checks

With Playwright installed (`requirements-dev.txt`), these scripts drive Chromium,
Firefox and WebKit against a running server. Reports and screenshots go to
`/tmp`, and each script exits with failure if a check fails. Pass `--url` to
target a different server.

| Script                              | Covers                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `browser-smoke.py`                  | Controls and interface from canonical New Game, plus legacy Continue; iPhone profiles   |
| `browser-save-portability.py`       | UI saves moved between engines                                                          |
| `browser-campaign-interruption.py`  | Failure, leaving, save/Continue and explicit story recovery                             |
| `browser-activities.py`             | Activities, shops and traversal; iPhone profiles                                        |
| `browser-interiors.py`              | Room controls and paid services                                                         |
| `browser-map.py`                    | Native canvas and map controls                                                          |
| `browser-city.py`                   | City raster and layer rendering                                                         |
| `browser-rail.py`                   | Boarding, travel, save/Continue and alighting (desktop profiles)                        |
| `browser-rail-ui.py`                | Metro interface                                                                         |
| `browser-late-meter.py`             | Late Meter warning UI; needs `--source-root`, `--warn-save` and `--fixture-report`      |
| `browser-rail-recovery.py`          | Continuing a held-fleet 0.6 save; needs `--source-root` and `--save`                    |
| `browser-startup.py`                | Paired startup timing against `--baseline` (another server URL)                         |
| `browser-opening.py`                | The four onboarding jobs; legacy only, it needs a build whose New Game starts First Shift |

Run them as, for example, `python3 tests/browser-smoke.py --url http://localhost:5173/`.
The activity, city/map, interior and rail scripts declare legacy-mode save
baselines and venue, budget, geography or platform fixtures to isolate their
regression contracts; the canonical New Game is checked separately. None of
these replaces a natural playthrough from a clean save, and short automated
frame samples do not establish sustained or real-device performance. See
[verification boundaries and evidence](docs/verification.md) and
[AGENTS.md](AGENTS.md) for the viewport and device tools.

## Deploy on Vercel

Import this repository with its root directory set to `./` and use the
**Other** framework preset. The checked-in `vercel.json` selects
`npm ci --ignore-scripts --omit=dev`, `npm run build` and the `dist` output
directory. No environment variables or server functions are needed.

The build copies only public game files, in parallel. The entry page preloads
the engine and game module. Browsers revalidate the unversioned files on reload,
while the CDN can cache them between deployments; this avoids retaining old game
code after an update. Vercel also provides
[automatic compression](https://vercel.com/docs/how-vercel-cdn-works/compression).
The [cache configuration](https://vercel.com/docs/caching/cache-control-headers)
is version-controlled with the game. Saves remain local to the browser and
deployment origin.

## Contributor setup and publishing

Requires Git, [GitHub CLI](https://cli.github.com/), and Python 3.11 or newer on
Linux, WSL, or macOS. Authenticate with `gh auth login`, then run:

```sh
git clone https://github.com/michaelcrosato/gta4-gpt61.git
cd gta4-gpt61
./scripts/setup-local.sh
```

The setup installs repository-local hooks, the `git publish` alias, automatic
fetch pruning, and fast-forward-only pulls. Run it once in each new clone.

Every commit on a named branch then pushes its committed snapshot to
`publish/<local-branch>`, creates or updates a pull request into `main`, and
enables auto-merge. GitHub waits for the required `Repository checks` CI job,
merges, and deletes the remote publication branch. Local files, your index, and
your checked-out branch are left untouched. Commits on local `main` also follow
this PR workflow; the hook never pushes directly to GitHub's protected `main`.
Commits made on a detached HEAD, such as during a rebase, are not published
automatically.

A failed push or check leaves your commit saved locally. Resolve the reported
problem and retry:

```sh
git publish                 # Push/update the PR and queue its merge
git publish --wait          # Also wait up to 25 minutes; stops early if checks fail
git pull --ff-only          # Update local main after its PR has merged
```

When using a local working branch, switch to `main` before pulling. Once its
commits are on `main`, delete that local branch with `git branch -d <branch>`.
Merge commits preserve local commit ancestry so repeated commits from the same
branch work after the remote branch is deleted. Publication never rewrites
remote history, so add a new commit rather than amending one that is already
published.

Publishing requires write access to this repository. Other contributors can
push to their forks and open PRs using GitHub's normal workflow; public
contributions are not automatically approved or merged. See
[CONTRIBUTING.md](CONTRIBUTING.md).

```sh
SKIP_AUTO_PUBLISH=1 git commit -m "Keep this commit local for now"
git config --local repo.autoPublish false   # Disable the hook's publication
git config --local repo.autoPublish true    # Enable it again
```

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
versioned inputs are [.github/repository-settings.json](.github/repository-settings.json),
[.github/branch-protection.json](.github/branch-protection.json) and
[.github/actions-permissions.json](.github/actions-permissions.json).

## License

No license has been selected for this project's original code yet. The supplied
engine retains its upstream MIT license in [LICENSES/my-3d2dge.txt](LICENSES/my-3d2dge.txt).
