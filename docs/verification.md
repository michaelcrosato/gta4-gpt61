# Verification evidence and remaining gates

LOWLIGHT is in development against the full [game brief](brief.md) and
[production plan](production-plan.md). The current build contains four original
opening assignments with 25 stages. Those assignments are independent onboarding
content; they do not implement or certify the 90 source-mapped story mission
requirements. The systems catalogue contains 869 requirements, all currently
`planned`, with 17 explicit research gaps. The story map also retains eight open
research items and 51 planned notable-character records. The separate
[city catalogue](research/city-scope.md) adds 425 planned requirements and 12
open research gates, including 65 area identities and 26 operating station
complexes. City catalogue records are requirements and research candidates;
their presence does not establish produced buildings, working transit or
source-wide city coverage.

## Repeatable local checks

```sh
npm test
python3 -m unittest discover -s tests -v
npm run check
npm run build
node scripts/scope-status.mjs
node scripts/scope-status.mjs --json
node scripts/scope-status.mjs --require-verified
git diff --check
```

The current complete JavaScript test run passed **165 tests**: 21 simulation,
23 combat, 31 police, 36 minigame, 25 activity-save, three interaction,
10 road-routing, 10 engine pixel-clipping, and six static floor-cache checks.
The repository
publication suite passed **16 Python tests**. Simulation tests exercise movement,
vehicle entry/driving/collision, finite ammunition, reloads, blocked gunfire,
police search/escape, damage/death/recovery, mission prerequisites and staged
objectives, service transactions, taxi jobs, failure/retry and save restoration.
Navigation tests cover legal routes, crossings, projection, disconnected roads
and deterministic geometry. Engine tests compare visible pixels and exercise
dithering, transparency, GPU material paths, transforms, effects, actor wrappers
and very large offscreen polygon handling.

Native Chromium and WebKit comparisons of the cached and live procedural floor
covered two projections and three camera positions, including a world boundary.
All 12 comparisons showed zero differing RGBA bytes. These tests validate their
specific contracts. They do not establish finished
city production, campaign breadth, natural-control difficulty, multiplayer or
source-wide parity. `npm run build` and `npm run check` remain required delivery
checks; their existence in this command list is not a recorded passing result.

## Scope-status tool

The tool reads the actual story, systems and
[city source-map JSON](research/city-source-map.json), then imports `MISSIONS`
from [simulation.js](../src/simulation.js). It reports planned, implemented and
verified claims separately for 90 story missions, 869 systems requirements,
425 city requirements and 51 notable characters. City subinventory counts
include 65 areas, 26 operating station complexes, eight rail service labels,
four directional through-services and 194 selected place/service roles. These
are separate audit collections, with several roles sharing physical places;
they are not a summed unique-building count.

Runtime mission IDs, titles, stage counts and stage types remain separate. New
combat, minigame or city code does not automatically implement or verify a full
source-map row. The tool never infers source coverage from counts, code presence
or similar titles.

It checks unique IDs and story titles, declared inventory counts, source/contact
references, acceptance profiles, known statuses and runtime stage metadata.
City checks also resolve neighbourhood/endpoint links, station calls, route
segments, service handoffs and links to existing systems records.
Counts are checked against the files' own declarations; shrinking below the
90-story/869-system/425-city baseline requires explicit scope reconciliation.
The initial city area, station and service inventories also have lower bounds
so a different category cannot quietly replace missing transport/geography.
Inventory growth is reported for review. SHA-256 fingerprints identify the input
maps, including the city file, and the simulation module used for each report.

Metadata-only fixtures reject city count mismatches, global ID collisions,
unresolved source/profile/neighbourhood/station references, regional count
contradictions, silent inventory shrinkage and unsupported verification claims.
Separate fixtures demonstrate that unverified city records and open city
research gates each independently keep source coverage unfinished. The tests use
in-memory copies; no source-map statuses are changed and no gameplay acceptance
is inferred from those fixtures.

Future `implemented` records need `implementation_refs`, containing existing
repository-relative paths or objects with a `path` field. Future `verified`
records additionally need `verification_evidence` objects with an existing
repository-relative `path`, a `build` or `revision` identifier, and a nonempty
`criteria` array identifying what was exercised. This structural check does not
read an evidence file and certify its claims; reviewers still need to assess the
actual gameplay, build identity, assets, failures and acceptance coverage.

Exit codes have limited meaning:

- `0`: catalogue metadata is internally consistent.
- `1`: files are malformed, references/counts are inconsistent, statuses are
  unknown or an implementation/verification claim lacks required references.
- `2` with `--require-verified`: source records or research gaps remain
  unfinished, including the city requirements and its 12 open research gates.
  This is the expected result for the current build.

No exit code certifies a finished game. A report in which every record claims
verification still requires the full release audit in the production plan.
Branch variants, source inventory gaps, quality, authored breadth, accessibility,
platform behaviour and genuine playthrough evidence remain necessary.
The [city research gates](research/city-scope.md#production-and-remaining-research)
retain unresolved interior instances, portals, site/access classifications,
placement inventories and physical scene reconciliation. They remain part of
the completion pipeline even when a runtime city preview or isolated minigame
passes its own checks.

## Browser and viewport evidence

The baseline title and opening-game matrices each captured 24 device/engine
combinations across 14 viewport sizes. Their **48 combined captures** covered
small phones, foldable, tablets, desktop and ultrawide sizes using Chromium,
Firefox and WebKit. The baseline reports recorded no horizontal overflow,
console/page errors, failed requests or unsuccessful page responses. Screenshots
and contact sheets were reviewed separately.

The corresponding transient evidence is
[/tmp/lowlight-title-matrix/report.json](/tmp/lowlight-title-matrix/report.json)
and [/tmp/lowlight-game-matrix/report.json](/tmp/lowlight-game-matrix/report.json).
These captures precede the latest interface and rendering revisions, so they
establish a baseline. Fresh captures and visual review of the changed screens
are required before treating the current build as free of viewport regressions.
Reports stay outside the repository.

The opening build was subsequently recaptured after the touch-control, map,
focus, and rendering revisions. Its title and gameplay matrices again produced
**48 clean captures**, with no recorded overflow, console/page errors, or failed
requests. All screenshots were inspected in contact sheets, with phone screens
also inspected at full size. Current reports are
[/tmp/lowlight-title-final-matrix/report.json](/tmp/lowlight-title-final-matrix/report.json)
and [/tmp/lowlight-game-final-matrix/report.json](/tmp/lowlight-game-final-matrix/report.json).
The directory label describes the final opening-build capture in this iteration;
it does not identify a finished-game release.

Natural browser-input checks were performed in Chromium and Firefox desktop and
a WebKit phone profile. Their records cover title controls/credits, new-game
onboarding, dialogue continuation, taxi entry/driving, pause/map, settings,
phone and save/continue behaviour. Touch follow-up checks exercised a real
joystick drag and release, touch dialogue/use, save restoration and keyboard map
placement. These are bounded interface/opening checks, not complete natural
playthroughs of all four jobs.

Evidence lives under [/tmp/lowlight-qa](/tmp/lowlight-qa). The durable
[browser-smoke.py](../tests/browser-smoke.py) subsequently passed Chromium,
Firefox, and a WebKit iPhone profile on the revised opening build. Current
reports are under [/tmp/lowlight-qa/release-final](/tmp/lowlight-qa/release-final).
They verify native Enter menus, immediate dialog-close/Escape races, resumed
W/E control after map/save/phone/journal, touch USE and LOAD, road-snapped keyboard
waypoints, settings and save/continue persistence, and virtual controller
confirmation/cancellation, menu navigation, map, phone, sliders and selects.
There were no recorded browser/console/engine errors or horizontal overflow.
The earlier focused-map Escape failure was specifically retested and corrected.
Future interface changes still require these regression checks.

Touch reload uses a declared ammunition fixture; controller checks simulate the
Gamepad API. These do not prove physical controller hardware compatibility.
The genuine movement checks read debug state for assertions but do not relocate
the player or vehicle.

Real iOS Safari is unavailable on this machine. WebKit with iPhone profiles is
the closest automated check and does not prove identical behaviour on a real
iPhone or its hardware.

## Mission contracts versus natural play

The browser contract report exercised all 25 opening stages, completed the four
assignment records and observed combat/escape transitions without recorded
engine or page errors. Its test type explicitly reads **“scripted debug-position
contract; not natural playthrough.”** It relocated the player or mission vehicle
between objectives. The result proves that selected stage transitions, combat,
pursuit loss and rewards can resolve in that script; it does not prove ordinary
driving routes, encounter approach, campaign pacing or natural difficulty.

See [/tmp/lowlight-qa/contracts-report.json](/tmp/lowlight-qa/contracts-report.json).
Required follow-up is normal-input play through the complete opening, including
travel, combat, target recognition, deadline handling, failure/retry and saving
at significant boundaries. Full source-mapped campaign branches and all side
content require their own individual gameplay audits later.

## Accessibility and performance boundary

The baseline mobile Lighthouse audit of the **title page** reported performance
**87**, accessibility **100**, best practices **100** and SEO **100**, with no
run warnings. See [/tmp/lowlight-lighthouse.json](/tmp/lowlight-lighthouse.json).
These title-page results do not certify the canvas gameplay's accessibility or
sustained rendering speed. Screen changes require a fresh audit and keyboard,
focus, text, touch-target and reduced-motion review.

A measured WebKit phone gameplay sample before optimization produced **10.26
actual FPS**, despite a higher internal FPS indicator. The wall-clock
measurement is the relevant observation. An intermediate follow-up artifact
reports **25.11 actual FPS** over only 39 frames and 1.553 seconds. This short
sample demonstrates a measured improvement but is insufficient for a release
performance claim or proof of the latest rendering changes.

After adding projected static-floor caching, an isolated default-city-camera,
rain-enabled WebKit phone sample measured **34.09 actual FPS**, mean render time
**10.5 ms**, and mean update time **0.525 ms**. It covered 39 intervals over
1.144 seconds, with a 250 by 445 internal picture and 750 by 1334 output at DPR 2.
This is a short measured improvement of about 3.3 times the initial sample.
Sustained busy-street and combat performance remain a release gate.

The artifacts are `webkit-actual-fps-before.json` and `webkit-actual-fps.json`
under [/tmp/lowlight-qa](/tmp/lowlight-qa). Final benchmarking remains open:
remeasure the current build for sustained intervals in representative driving,
combat, rain, busy streets and multiple camera/quality settings. Inspect frame
times, visual equivalence and battery/thermal-sensitive behaviour on the target
profiles; confirm optimization does not change simulation pace or controls.

## Full-game verification remains open

The source campaign, full city/interior inventory, movement breadth, fleet and
equipment breadth, relationships/dates, complete minigames, authored side
content, transit, collectible/stunt placements, performed media and real online
multiplayer remain unfinished or unverified. The current basic phone does not
establish the required calling, relationship, email, web or multiplayer systems.

The user's goal cannot be cleared by these tests, screenshots, catalogue counts
or the opening foundation. The full [systems source map](research/systems-scope.md),
[story source map](research/story-scope.md),
[city source map and research gates](research/city-scope.md), story branches,
individual acceptance criteria and final production gates must be satisfied and
inspected against actual completed gameplay.

## Core-system expansion checks

The 0.2 core build adds 17 weapon roles, physical ordnance and fire, timed melee
defense/counter/disarm, crouch/cover/jump/vault/climb, and six police response
levels. Tests exercise witness reports, physical arrest/confiscation, road
navigation/interception, armor, vertical gunfire, genuine airborne destruction
and falling cleanup, and saved search state. The complete fleet, interiors,
campaign and city remain unfinished.

Bowling uses full ten-frame scoring and physical pinfall; darts uses 301 and
double checkout; pool uses physical balls and legal eight-ball rules; STACKLIGHT
uses falling pairs, clusters, charges, powers, palette progression and losses.
Activity saves preserve actual intermediate, abandoned and finished states,
including valid negative coordinates and airborne/off-table balls.

[browser-activities.py](../tests/browser-activities.py) passed 18 scenarios
across Chromium, Firefox and WebKit. Its report declares venue relocation,
a cleared intro assignment, budgets, and late-state scoring fixtures. Actions
after setup use real DOM, keyboard, pointer/touch inputs. It verifies fees,
immediate money feedback, controls, physics/scoring, abort accounting, pool
payout, mid-physics Continue without a duplicate fee, purchasing/equipping, and
movement controls. This does not prove normal campaign access to every venue.
Reports and inspected images are under
[/tmp/lowlight-activities-qa/release](/tmp/lowlight-activities-qa/release).

Equipment fixtures granted/resupplied each weapon, then issued genuine attack
inputs. All 17 attacks recorded in Chromium and WebKit without engine/browser
errors; equipment images were inspected. Other fixtures forced each wanted
level and observed real response populations, vehicles and aircraft without
render errors in both engines. These are bounded visual/interface checks, not
clean-save acquisition or campaign proof. Artifacts are
[/tmp/lowlight-weapons-qa](/tmp/lowlight-weapons-qa) and
[/tmp/lowlight-police-visuals](/tmp/lowlight-police-visuals).

The 0.2 core gameplay matrix additionally captured 24 device/engine combinations
across the same 14 viewport sizes, with no overflow, browser errors or failed
requests. Current report: [/tmp/lowlight-core-matrix/report.json](/tmp/lowlight-core-matrix/report.json).
The activity Continue cases were rerun after strict save validation was wired
in; all three engines resumed real mid-roll snapshots without another fee.
Those reports are under
[/tmp/lowlight-activities-qa/validation-save-only](/tmp/lowlight-activities-qa/validation-save-only).
