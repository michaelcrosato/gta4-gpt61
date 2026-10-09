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

## Campaign integration checkpoint (0.5)

New Game now starts Night Crossing (`LL-ST-001`) on the original ferry scene.
The production runtime registers this mission explicitly; the other nineteen
authored definitions remain blocked by missing physical handlers. The full
ninety-mission requirement remains open, and the source catalogue claims no
new completion. The four existing jobs are separate additional onboarding.

The durable [campaign journey regression](../tests/campaign-journey.test.mjs)
uses real simulation movement, steering, braking and interaction inputs from a
clean canonical state. Caption presentation/acknowledgment and the explicit
room response use public UI APIs. A declared filesystem adapter performs actual
save write/readback/commit. The test assigns no actor positions, health, clock,
director stages or completion receipts. It verifies ferry/reunion, actual
driver/passenger seats, the ordered berth/fairground/dispatch route with a real
two-second stop, collision-valid parking, escort/portal entry, one duffel,
the mandatory response and both consequences, finite food, protected storage,
six-hour rest, idempotent completion and valid Continue. Its output explicitly
states that this is not a natural browser playthrough or release validation.

The retained development run at
[/tmp/lowlight-campaign-regression-i4gmiA/completion-report.json](/tmp/lowlight-campaign-regression-i4gmiA/completion-report.json)
completed at 245.2 simulation seconds with all three principal characters at
100 health, no deaths/wanted level and no off-road time or route discontinuity.
Its source hashes were unchanged during the run. Previous failed attempts
remain retained, including the genuine seated-passenger self-collision defect
which was corrected in the shared driving loop.

Browser development evidence is indexed in
[/tmp/lowlight-campaign-ui/ui-summary.json](/tmp/lowlight-campaign-ui/ui-summary.json).
Genuine New Game checks cover the ferry, manually presented captions, walking
to the driver door, real taxi boarding, healthy passenger travel and ordinary
save/Continue. Five desktop/phone/landscape/tablet profiles cover those controls;
the final explicit healthy-drive/hint check covers Chromium and WebKit.
Home checks use declared valid journey-save fixtures, followed by actual
choices, keyboard approaches, owned wardrobe, food, physical save and rest.
Chromium, Firefox and three WebKit home profiles passed their bounded workflows.
A one-shot storage quota rejection actually fired and preserved the previous
save and both receipt ledgers. Genuine unarmed attacks on Felix after a clean
arrival produced the native failure/retry flow; same-scene retry restored him
and cleared held controls. These development checks precede the final candidate
snapshot and do not prove a complete natural browser mission.

Named actors now share scene-filtered combat, vehicle injury and persistent
health/death. Nadia's death is an authored mission failure rather than a
conversation softlock. Direct jump/fire actions obey cinematic/service locks.
Restore rejects invalid exterior/local companion coordinates and heights.
Skipping a cinematic speeds up physical movement through collision; it does
not teleport actors or fabricate a completion receipt.

Metro topology encoding 2 canonicalizes only the signature's insignificant
derived numeric rounding. World geometry, clearance, reservations and changed
topology checks remain intact. Previously published same-engine signatures are
recognized and migrated. The [portable-save browser check](../tests/browser-save-portability.py)
writes campaign saves through New Game and the actual pause Save button, then
imports those bytes as disclosed storage fixtures for all nine browser pairs.
It also checks three same-engine legacy migrations. Working-tree attempts
retain rejections when authored content changed during the run; they are not
treated as final candidate passes.

The separately published 0.4.1 garage momentum correction is
[PR #9](https://github.com/michaelcrosato/gta4-gpt61/pull/9).
Its focused Chromium/WebKit reports at
[/tmp/lowlight-garage-hotfix-qa](/tmp/lowlight-garage-hotfix-qa)
declare damaged-vehicle setup before actual entry, then use ordinary driving,
paid $120 repair, door opening and physical reverse exit. Both pass. Natural
additional-onboarding attempts retain pursuit damage, van destruction, clinic
charges and retries; all four jobs in one natural run remain unproved.

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

The 0.2 core baseline JavaScript test run passed **165 tests**: 21 simulation,
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


## Expanded city integration (0.3)

The runtime now uses the original authored exterior blueprint: 65 neighborhoods
and 194 site addresses over a 12,000 by 10,000 world. These are playable exterior
geometry, rather than produced interior rooms or completed city audit records.
Source-map status stays `planned` until the complete acceptance contract for an
individual record has been implemented and reviewed. Station/platform/route
geometry is present, while trains, station transfers, boats, gondola operation,
tolls and site interiors remain unfinished.

Terrain uses exact landform/lake collision, indexed obstacles, three-dimensional
wall sight checks and tunnel space/earth blocking. Road topology is compiled
once per world/access mode, including real ramp/deck/bore grades. Cars and people
follow their own connected ground layer; cars remain behind visible bridge side
barriers, while a person leaving a span falls toward ground/water. Surface
swimming strokes consume stamina, idle floating restores it, weapon use is
blocked, and exhausted strokes cause damage.
Underwater diving is not implemented.

Regional traffic/pedestrian generation uses stable local seeds and identities.
Active/dormant body records preserve damage, theft and death across revisits and
saves. Legacy, nearby, occupied, stolen, owned, mission, police and reporting
bodies are protected from normal streaming removal. The active population
budgets are soft limits when gameplay protection requires retaining more bodies.
Ambient routes currently stay on local accessible ground streets; cross-city
traffic trips and elevated-road ambient traffic remain production work.

The added movement/runtime tests exercise a complete ascent/span/descent,
underpass separation, deck barriers and falling, jumping over a ramp, road bores
and solid earth, swimming permission, negative-height gunfire/saves, high-roof
aim/save bounds, physical pedestrian routes and population revisits. The
blueprint checks sample every car-accessible road at 21 points with the actual
terrain collision radius, preserve dry supply access, and require nonzero flat
spans/bores for each relevant crossing. These checks supplement individual
spatial/terrain/navigation/cache tests; they do not certify all source scenarios.

The natural opening driver is [browser-opening.py](../tests/browser-opening.py).
It reads state to choose browser inputs and never writes actor position, health,
money, inventory, wanted state, mission state, RNG or simulation clock. Earlier
recorded attempts completed First Shift and reached second-job combat, followed
by a real police-pursuit death. Those results are retained as partial progress,
not four-job completion. The driver permits normal clinic recovery and retry.

[Browser city checks](../tests/browser-city.py) compare cached and direct native
ground RGBA pixels, then capture declared exterior/deck/bore/lake fixtures.
[Browser map checks](../tests/browser-map.py) exercise native map geometry,
projection/waypoint alignment and layer-aware camera behavior. Geography fixtures
relocate the player or starter taxi and are explicitly separate from natural
travel and campaign playthrough evidence. Frame samples are short automated
measurements, rather than sustained real-device performance acceptance.


The integrated-city natural attempt additionally confirmed actual clinic recovery
after the second-job pursuit: the starter taxi was destroyed, Mara died, the
assignment failed, and the clinic charged $80 while restoring health to 100 and
clearing wanted attention. The driver then tried to reuse that destroyed taxi;
this is a harness limitation, not evidence that the game cannot accept a healthy
replacement vehicle. Four-job natural completion remains unproven at this point.

The city raster checker passed **36 native RGBA comparisons** (12 in each of
Chromium, Firefox and WebKit) and **27 declared scene captures** across the five
districts, opening, bridge, bore and lake. Cached/direct ground pixels matched
exactly. The control smoke check passed all three engines. Title and opening
matrices produced **48 clean captures** over 14 viewport sizes; PNGs were reviewed
in contact sheets, with small-phone portrait/landscape captures also inspected at
full size. Reports live under `/tmp/lowlight-city-qa/final`,
`/tmp/lowlight-city-smoke`, `/tmp/lowlight-city-title-matrix`, and
`/tmp/lowlight-city-game-matrix`. Subsequent touch conversation overlap repairs
receive focused recapture/checks before publication.

Short 1440 by 900 scene samples after lamp indexing measured approximately
60 frames/second in Chromium and Firefox and **21.6–34.8** in WebKit. Earlier
WebKit samples before that indexing measured 14.9–24.3. These are separate short
automated desktop samples; they do not establish phone, sustained-play or
physical Safari performance. WebKit performance is still a release gate.


The 0.3 city integration's complete JavaScript suite passed **278 tests**, and
the publication suite again passed **16 Python tests**. Syntax checks cover all
21 game modules; format, whitespace, catalogue-integrity and static-build checks
passed. The stricter source-completion audit still exits with its expected code
`2`: campaign, systems, city acceptance and research work remain unfinished.


Publication captures extended the city check to finance, coastal and civic
facades: **36 declared scenes** passed across the three engines, together with
the same **36 exact cached/direct ground comparisons**. Their report is under
`/tmp/lowlight-city-qa/publication`; the latest WebKit desktop frame sample range
was 20.7–33.6. The natural sports-coupe approach regression also passed through
real walking/E input after its driver threshold was corrected; it establishes
vehicle entry, not completion of the four opening assignments.


Touch layout repairs passed five profile checks across conversation, ordinary
play, the longest current objective with queued notices, and six-star HUD states.
Objective text, newest notifications, minimap and controls had no measured target
overlaps or page overflow. Tablet and wide ordinary layouts retained their prior
geometry. Reports/captures are under `/tmp/lowlight-touch-layout/after`; the
focused Chromium/Firefox/WebKit map regression passed after these repairs.
Real iOS Safari and physical device input remain outside this automated evidence.


The final gameplay matrix after the touch repairs again produced **24 clean
captures** over all 14 viewport sizes. Its contact sheet and small-phone
landscape PNG were inspected. The final control smoke check passed all three
engines. Reports are `/tmp/lowlight-city-game-publication-matrix` and
`/tmp/lowlight-city-smoke-publication`. The staged city snapshot independently
passed the 278-test JavaScript suite and 16 publication tests, plus syntax,
format, catalogue-integrity and build checks.

## Interiors and Metro checkpoint (0.4)

Four real local rooms are implemented: Voss Dispatch, Saira’s Garage, The
Lantern and Blue Hour Lanes. They use shared movement/combat, finite ammunition,
cover, doors and destructible prop collision rather than a room-only substitute
combat system. Room occupants have their own persistent health/death and scene
ownership; doors, prop damage, actors, vehicles and player position survive
revisits and whole-game saves. Indoor gunfire can damage an actual occupant and
enter the witness delay/dispatch pipeline at the room’s exterior entrance.
These are four produced spaces, not proof of the complete interior catalogue.

Services have real location-specific stock, costs and affordability checks.
Saira’s tools counter does not expose a fake ammunition catalogue; the working
vehicle repair bay charges $120 and repairs the actual admitted vehicle. The
Lantern charges $12 per drink, with health/intoxication effects; the lanes’ meal
costs $18 and bowling admission $10. Darts remains free. Repeated paid purchases
are real transactions, and unavailable attendants can prevent service.

The earlier isolated renderer report at
[/tmp/lowlight-interior-qa/report.json](/tmp/lowlight-interior-qa/report.json)
records 96 zero-difference native floor comparisons and four-room captures in
Chromium desktop and WebKit desktop/phone/tablet profiles. Its scope explicitly
uses local-room/garage fixtures and makes no natural-input gameplay claim.
The separate
[/tmp/lowlight-interior-ui-qa/report.json](/tmp/lowlight-interior-ui-qa/report.json)
records five desktop/phone/tablet/wide profile runs. Those checks declare venue,
local-counter/door approaches, budgets, cleared onboarding and vehicle fixtures,
then use actual keyboard, pointer, touch and button input for entry/exit,
scene-filtered aim/attack, map, journal, room save/Continue, paid stores, repair,
darts and bowling. The
[small-phone report](/tmp/lowlight-interior-ui-qa/small-phone-report.json) and
[input report](/tmp/lowlight-interior-ui-qa/input-report.json) retain heading,
joystick release and held-controller-neutral checks. Controller axes are mocked;
these are not physical-controller or real iOS Safari results.

The interior-aware activity regression passed **18/18 scenarios** across
Chromium, Firefox and WebKit. It combines real portals and keyboard room
approaches/exits with genuine activity controls, scoring/physics, fees, aborts
and mid-roll save/Continue. Venue relocation, budget, dart checkout, final-eight
and arcade overflow fixtures remain disclosed, so these are not clean-save full
matches or campaign access proof. Report:
[/tmp/lowlight-activities-interior-qa/report.json](/tmp/lowlight-activities-interior-qa/report.json).
The unchanged control smoke script also passed all **three engines** after the
interior integration; its genuine E onboarding, taxi driving, menus, maps,
phone, save/Continue, touch and virtual-controller records are at
[/tmp/lowlight-browser-smoke/20261009T044443Z/report.json](/tmp/lowlight-browser-smoke/20261009T044443Z/report.json).

Harbor Metro now has four runtime through-services: G1 Seaward Loop, G2 Landward
Loop, C1 Civic Canal Loop and C2 Canal Civic Loop. The topology contains **26
station complexes and 56 directional stop roles**, not 56 different stations.
The runtime includes moving train/rider geometry, door-aware boarding/alighting,
served-destination phone selection, actual fares, dispatch signals and saved
fleet/passenger state. A later-stop journey currently starts at a disclosed $2
fare and settles on alighting; boarding alone does not debit that fare.
The default movement guard composes compiled physical clearance with dispatcher
permission. The adopted world builds 10,818 bounded clearance chambers with graded floors
and roofs, native union boundary walls/cutaways, road-preserving supports,
canonical rails and two-car doors/windows/couplers. The full 68×20×16 consist
passes continuous swept-body checks through all 56 actual route legs, including
52 with bends, with dispatcher permission on all four complete service circuits.
No protected buildings or coast geometry are removed. Thirteen native rail
renderer tests verify layers, culling, shared boundaries, duplicates, doors and
exact projected/direct pixels. Fifteen rail terrain tests include 1,680 disk-union
queries, shared chamber/legacy tunnel joins, graded floors/roofs and continuous
sight; real narrow earth gaps remain blocked.

Before those final clearance/rendering edits, the
[rail browser script](../tests/browser-rail.py) passed Chromium, Firefox and
WebKit desktop. Its setup explicitly clears onboarding, relocates Mara to a
real physical platform and supplies health/$1000 budget fixtures. Subsequent E
boarding, phone destination selection, normal-clock movement, manual
save/Continue and later open-door E alighting use real browser inputs. All three
checks paid exactly $2 once ($1000 to $998), with no recorded engine/page errors;
all six moving/alighted screenshots were inspected. Aggregate report:
[/tmp/lowlight-rail-qa-current/report.json](/tmp/lowlight-rail-qa-current/report.json).
This does not prove natural street-to-platform access, every service circuit or
clean-save city/campaign travel. The
[runtime inventory](/tmp/lowlight-rail-qa-current/runtime-snapshot.json) records
source hashes and intervening clearance changes, so this earlier pass must not
be substituted for the final three-engine rerun.

Work-in-progress title and gameplay matrices each produced 24 clean captures
over 14 viewport sizes, including small phones, foldables, tablets, wide desktop
and WebKit. Representative phone portrait/landscape, tablet and ultrawide PNGs
were inspected; the reports recorded no horizontal overflow, console/page errors
or failed requests. Reports:
[/tmp/lowlight-rail-qa-current/viewports-title/report.json](/tmp/lowlight-rail-qa-current/viewports-title/report.json)
and
[/tmp/lowlight-rail-qa-current/viewports-game/report.json](/tmp/lowlight-rail-qa-current/viewports-game/report.json).
Source changed during this capture window; these are preliminary UI checks, not
verification of one final stable 0.4 snapshot.

The first 20 original source-mapped campaign missions and
[pure director](../src/campaign/director.js) are **authored-unintegrated**. They
have explicit scenes, dialogue, encounters, branches, failures/checkpoints,
capability gates and observed-condition/whole-state contracts. Synthetic
director fixtures test those contracts; they demonstrate no physical campaign
playthrough and earn no source completion credit. The four existing jobs remain
additional onboarding, and the retained input-only attempts still have not
completed all four naturally. Pursuit deaths, normal clinic charges/recovery
and harness failures remain valid evidence of partial attempts.

Performance remains a release gate. The cited smoke report’s short samples were
about 60 actual frames/second in Chromium/Firefox desktop and 38.6 in its WebKit
phone profile. These samples do not establish sustained interior/rail/full-city
performance, physical Safari performance or a balanced complete campaign.
The frozen staged application at `/tmp/lowlight-04-staged-jM6BpA65`, served on
localhost:5175, passed **487 JavaScript tests**, **16 publication tests**, syntax
checks over 35 game modules, formatting, catalogue integrity, whitespace and
static build checks. Source completion still fails its strict audit as expected;
the complete game remains unfinished.

Frozen city verification passed 36 scene captures and 36 exact cached/direct
RGBA comparisons across Chromium, WebKit and Firefox. Title and game matrices
each produced 24 clean captures over 14 viewport sizes (48 total), with no
overflow, page/console errors or failed requests. Phone portrait/landscape,
tablet, ultrawide, Android, opening, bridge, bore, finance and swimming PNGs were
inspected. Reports: `/tmp/lowlight-04-final-city`,
`/tmp/lowlight-04-final-title-matrix`, `/tmp/lowlight-04-final-game-matrix`.

Final rail journeys passed all three engines (12 grouped checks): normal
movement, manual save/Continue and later open-door alighting charge exactly $2
once ($1000 to $998). Five rail UI profiles passed real touch/E/menu input,
served-stop selection, unique upper/lower platform labels, target reachability,
and zero-stop $0 alighting. All 37 served HTML/CSS/JS hashes remained unchanged.
Reports: `/tmp/lowlight-04-final-rail-journeys/report.json` and
`/tmp/lowlight-04-final-rail-ui/report.json`. All six final moving/alighted PNGs
and representative phone/landscape/tablet/ultrawide UI images were inspected.

All six interior profiles passed 48 grouped controls/service/save checks;
small-phone paused shop cash agrees with the actual wallet. All 18 activity
cases passed in completed Chromium, WebKit and Firefox reports. The genuine
control smoke passed all three engines. Reports are
`/tmp/lowlight-04-final-interiors-adaptive/report.json`,
`/tmp/lowlight-04-final-activities-aggregate/report.json` and
`/tmp/lowlight-04-final-smoke-aggregate/report.json`. Failed preliminary
artifacts are retained. The first combined activity command ended with exit code 143 (SIGTERM)
after 14 printed PASS cases; its two completed engine reports and the full
six-case Firefox rerun make up the aggregate. A slow-frame portal input defect
was repaired in the simulation and retains a multi-step regression. The door
return assertion now compares the actual saved exterior entry pose instead of
a venue marker that can differ after genuine movement before entering. Browser harnesses now observe actual displacement,
door exit or braking thresholds instead of assuming fixed wall-time delays
always advance the same amount of simulation under concurrent QA load.

## Garage momentum correction (0.4.1)

Natural-control opening runs found that exterior background updates restored
an indoor car's pose but omitted its speed. The stored exterior speed was zero,
so every fixed step reset garage acceleration. The patch preserves the actual
local speed through that temporary context while retaining real wallet/health
changes. A multi-step regression now verifies sustained acceleration and travel.

The isolated patch passes 488 JavaScript tests, 16 publication tests, syntax,
formatting, whitespace and build checks. Chromium and WebKit checks used an
explicit damaged-owned-taxi fixture outside Saira's Garage, then genuine entry,
throttle to the bay, a $120 repair and physical door/reverse exit. No positions
or health were changed after room entry. The paid-repair and exterior-return
PNGs were reviewed. Reports: `/tmp/lowlight-garage-hotfix-qa/chromium` and
`/tmp/lowlight-garage-hotfix-qa/webkit`. These focused checks do not prove a
natural four-job or full-campaign playthrough; those remain separate work.

## Frozen campaign candidate checks (0.5)

The first frozen 0.5 candidate at `/tmp/lowlight-05-candidate-l81pig09`
passed **595 JavaScript tests**, **16 publication tests**, syntax, formatting,
scope integrity, whitespace and build checks. Its browser regressions passed
three canonical/legacy control engines, six interior profiles, eighteen activity
cases, three map engines, three actual Metro journeys, five home-service
profiles and all twelve portable-save cases (nine engine pairs plus three
recognized legacy migrations). Title/gameplay matrices produced **48 clean
captures across 14 viewport sizes**; all were inspected in contact sheets, with
the small WebKit phone also inspected at full size. The six Metro travel/exit
PNGs were reviewed. Reports are under `/tmp/lowlight-05-` with suffixes
`browser-smoke`, `interiors`, `activities`, `map`, `rail`, `campaign-home`,
`save-portability`, `viewports-title` and `viewports-game`. The exact 48 app-file
hashes are in `/tmp/lowlight-05-candidate-manifest.json`.

The subsequent failure-branch audit found a genuine progression blocker in
that candidate: Return to the City discarded the only arrival checkpoints;
Save/Continue then preserved an unfinished mission without a restart control.
The clean UI reproduction is retained at
[/tmp/lowlight-05-abandon-repro/report.json](/tmp/lowlight-05-abandon-repro/report.json).
The correction retains the interrupted run in the director's existing saved
suspended-run collection. Its explicit phone/journal retry/full-restart routes
restore actual checkpoints; leaving, saving and opening panels preserve
ordinary world costs and dead actors. Interrupted captions cannot continue
earning display time. Separate tests cover strict ownership, rollback and
actual world restoration. Final verification of this correction is recorded
separately from the initial candidate's passing workflows.

Natural legacy onboarding attempt 14 completed First Shift, Collection Day and
Cold Freight with zero deaths, then reached Glass House's final delivery stage
before a driver-only destroyed-car reentry mistake. Attempt 15 used a separately
retained temporary driver; it performed actual garage entry, paid $120 to repair
the living medicine van from 57.868 health to 190, then opened/reversed through
the physical exit. It subsequently incurred two real Glass House deaths, a clinic
charge and a failed retry. Both ran immutable published 0.4.1 on port 5176 with
no actor/health/ammunition/clock mutations. Reports and exact driver archives
remain at `/tmp/lowlight-opening-qa/14-context-aware-reentry` and
`/tmp/lowlight-opening-qa/15-optional-vehicle-foot-return`. These establish
bounded natural progress and repair behavior, not all-four or canonical
Night-Crossing-to-onboarding completion.

An isolated headless desktop arrival profile used 1440×900 at device scale 1
with genuine New Game and no world/actor/clock mutations. Chromium measured
59.4 FPS in the first five seconds, 59.6 in the next eight, and 60.0 after
settling at the first dialogue. WebKit measured 30.0, 27.9 and 27.6 respectively.
Settled mean update/render times were 1.82/4.48 ms in Chromium and 5.23/14.64 ms
in WebKit; both simulation clocks tracked wall time. Chromium startup sampling
attributed approximately 1.20 seconds to city generation, 0.97 to rail world
construction and 1.23 to rail renderer preparation. Rendering dominated its
later arrival sample. Source hashes stayed unchanged and browser errors were
absent. The [profile record](/tmp/lowlight-05-profile-candidate1/report.json)
retains raw profiles and timing limits. These bounded desktop samples identify
performance work; they do not establish acceptable sustained/mobile gameplay
or real Safari performance. WebKit performance remains a release gate.

The second frozen candidate at `/tmp/lowlight-05-candidate2-bb9bnbcj`
passed **604 JavaScript tests**, **16 publication tests**, syntax, formatting,
scope integrity and build checks. Its complete production-input mission record
is at `/tmp/lowlight-campaign-regression-d2Kb8P`; no first-arc content fingerprint
changed after candidate1. Only the director, runtime, simulation and UI changed
for the retained-interruption correction. Genuine unarmed-failure recovery
passed both modes on Chromium ultrawide, a small WebKit phone, WebKit tablet
and Firefox desktop. Each run preserved dead Felix through Return, panels,
actual save and Continue; only explicit retry/restart restored the world.

The short-landscape check first exposed feet hidden beneath captions, then a
real companion targeting defect: visible exterior companion bodies were omitted
from pointer picking. Candidate3 changes only that eligibility filter in
`game.js`; enemy autoaim remains independently filtered. Both WebKit landscape
recovery modes pass after the fix, as does an explicit visible-body aiming and
checkpoint-recovery check on Chromium ultrawide. The original failed reports
remain retained. Combined evidence covers both recovery modes across all five
profiles; recovery-panel PNGs were inspected. Reports are at
[/tmp/lowlight-05-recovery-ui](/tmp/lowlight-05-recovery-ui), with corrected runs in
`candidate3-landscape` and `candidate3-body-aim`. Candidate3 syntax, formatting
and build checks pass. Its exact app hashes are in
`/tmp/lowlight-05-candidate3-manifest.json`; no unrelated passing workflow was
repeated for the one-line eligibility change. Final Python harness formatting
and the legacy-driver fail-fast guard do not change successful gameplay inputs.

## City startup lookup correction (0.5.1)

City parcel allocation repeatedly rebuilt static road rectangles and scanned
every road. It now compiles each used padding once into the existing stable
spatial index. Queries retain original road order and apply the original strict
overlap check; the cached structures are private to generation. Roads finish
construction before these indexes are created.

The complete serialized city (919,848 bytes) and derived world (20,918,659 bytes)
match the unmodified 0.5 baseline exactly, including values, IDs and order.
Twelve new regressions also compare initial/240-step state and per-frame RNG
for five seeds in legacy and canonical-story modes. Legacy controls actually
move, sprint and fire four rounds; canonical controls retain the real cinematic
locks. The full candidate passes **616 JavaScript tests**, **16 publication
tests**, syntax, formatting, scope integrity, whitespace and build checks.

Six interleaved fresh Node processes per build measured median city-module
import at 1696→486 ms and simulation-module import at 3287→2253 ms. These are
fresh processes with ordinary filesystem caching, not cold OS-cache or browser
FPS measurements. Raw equivalence and timing evidence remains under
`/tmp/lowlight-next-performance/reports`; the test oracle is committed in
`tests/fixtures/city-startup-baseline.json`.

The durable [browser startup check](../tests/browser-startup.py) separately ran
three paired fresh browser contexts per build/engine, alternating order, at
1440×900 and device scale 1. The baseline was frozen published 0.5 on port 5179;
the optimized candidate was `/tmp/lowlight-051-candidate-3hsraoif` on port 5180.

| Engine | Baseline readiness | Optimized readiness | Reduction |
| --- | ---: | ---: | ---: |
| Chromium | 4012 ms | 3121 ms | 22.2% |
| WebKit | 4117 ms | 3700 ms | 10.1% |
| Firefox | 4153 ms | 3404 ms | 18.0% |

Complete world and initial-state hashes matched across both builds within each
engine; checked sources were unchanged throughout measurement. Startup samples
recorded no engine/page/console errors. Genuine New Game started Night Crossing
with all four actors/player healthy and no recorded engine/page errors or
overflow. All three arrival PNGs were inspected. Three actual 0.5 saves also
loaded and re-saved without changing player/companion state: a pre-service home
save, a completed arrival and a WebKit-generated interrupted save. Explicit
retry of the interrupted save restored its real checkpoint successfully.
Report: [/tmp/lowlight-051-browser-startup/report.json](/tmp/lowlight-051-browser-startup/report.json).
These bounded headless desktop measurements do not establish cold physical-device
startup, acceptable sustained/mobile FPS or real Safari behavior. No content,
save schema, geometry or source-completion claim changes with this patch.

## Late Meter physical integration (0.6 development)

Late Meter now has a composed production controller alongside Night Crossing.
The other eighteen first-arc missions remain gated. The new annex is a sixth
explicit room; its service glass/intercom, taxi bay, collector approaches,
clipboard review and driver approach preserve the pre-existing precinct and
city geometry. Removing only the declared additions reproduces the exact
20,918,659-byte prior world hash. Five legacy startup/control sequences retain
all their original snapshots and RNG traces; a separate reviewed oracle covers
the new story/phone state and appended world geometry.

The shared companion model now leases driver seat zero to an actual named body.
Validated commands run through the same physical steering/collision model before
seat/body synchronization, without copying NPC travel into Mara’s position or
statistics. Lost control causes real braking. Player entry waits for a living
named driver’s physical egress; a dead occupied seat remains occupied. Physical
corpse eviction and friendly hospitalization remain broader release work.

Committed attack and damage observations distinguish a miss from resolved harm,
retain real owner/armour/scene facts, and support protected-clerk/patrol failures.
The canonical clipboard has a native held/read pose, finite oriented collision,
actual damage/destruction/drop behavior and strict whole-save ownership checks.
Aiming at its thin dropped board exposed and corrected a muzzle-height slope
error and an earlier-contact-before-ground ordering error.

The phone uses a saved call owner, exact line/dial acknowledgment receipts and
the real warning clock. Incoming/fallback history cannot substitute for the
outgoing warning. Wrong contacts retain their retry cue/history without
rewinding the world or extending the deadline. The nonmodal panel preserves
world movement and offers keyboard, touch and controller inputs.

Strict content migration registers the exact published 0.5 authoring pack.
Every previously owned mission definition must remain identical, and every
stored physical checkpoint must validate. The current content fingerprint may
change while the immutable original receipt namespace remains intact. This
neither restores the live world nor invents completion, rewards or unlocks.
Unknown histories and changed owned mission definitions fail closed. Authentic
0.5 home and completed-arrival fixtures retain their provenance and compressed
source bytes under tests/fixtures.

The retained input investigation is at /tmp/lowlight-late-meter-journey. Run1
selected the home portal instead of the nearby taxi; its controller now walks
to a real vehicle prompt. Run2 exposed the optional First Shift prompt covering
the dispatch doorway; contextual office entry now remains reachable, and a
separate check preserves optional First Shift outside the doorway radius. Run3
correctly rejected a controller target inside the physical desk. Run4 delivered
the real warning and boarded Felix, then exposed a chase observation that
incorrectly expected queued controls to move the car immediately. The chase
now begins only after observed movement on a subsequent physical step.

Run5 completed all five stages from a declared production-valid completed
Night Crossing save. It used ordinary movement/driving/boarding, actual native
renderer clue proof and explicit public caption/phone inputs, with no later
actor, vehicle, world, director, health, inventory, receipt or clock edits.
Reeve physically took seat zero and drove; escape recorded 10.0167 unseen
seconds beyond the actual last-seen radius. Felix reached the dispatch office,
the original invoices entered inventory and exactly $120 was awarded. Existing
collision costs remained: taxi health 115.516 and Felix health 97.534. This is
Node input/presentation orchestration, not a natural complete browser run.
Final frozen UI/viewport verification and durable journey checks follow below.
The complete source scope, multiplayer, full audio and final polish remain open.

A subsequent full-height route audit also identified an existing Dispatch access
limit: its exterior doorway at (458, 700) is beneath a rail bed 18 units above
ground, while standing canonical companion bodies declare 30 units. Current foot movement tests
only feet at that point, so those completed routes do not establish correct head
clearance. The exact obstruction is retained in the next-arc geometry audit at
/tmp/lowlight-two-seats-scenes/reports/geometry-notes.md. Shared standing/crouched
clearance and a physically valid access repair are required before full-world
acceptance; the existing rail foundation must remain operable.

The durable journey regression now starts from the authenticated compressed
completed 0.5 fixture, executes 10,800 ordinary frames at 1/60 second for the
approved preparation cadence, then uses the 0.1-second route controller.
All five stages and all fifteen authored lines are checked, alongside actual
native clue frames, physical driver movement, escape, delivery, one $120 reward
and Continue without a repeated reward. Different immediate/preparation-cadence
controller attempts hit real traffic and remain retained; this one reproducible
scenario does not establish every route or a natural browser playthrough.

An additional actual-input combat probe exposed a second extraction lock when
Reeve died on foot after the warning, while the surviving watcher could not
drive. The vehicle threat now resolves from the designated driver’s actual
incapacity. The watcher still controls sight, and the same radius, ten-second
unseen period, surviving taxi/passenger and normal return requirements remain.
The fixed production-input regression preserves Reeve’s corpse through Continue;
it grants no completion or money before the actual return. The investigation at
/tmp/lowlight-reeve-foot-death retains interrupted/collateral attempts and the
clean sustained lock before the fix.

That probe also exposed an oversized projectile hitbox for seated companions.
The real seat body has radius 3, but bullets used the standing radius 9, allowing
an outward drive-by muzzle to hit Felix inside the taxi. The hit margin now
follows the actual body radius plus 2: standing bodies retain 9 and seated bodies
use 5. Actual boarding/fire regressions prove the outward shot reaches its
external target; an outside shooter can still hurt the seated friendly. No
friendly immunity was introduced.

Final local verification passes **856 JavaScript tests**, **16 publication
tests**, syntax, formatting, scope integrity and the static build. The complete
classic journey is included in that final suite at
/tmp/lowlight-06-final2-tests.tap. Public simulation probes also confirm a timed
failure, Return to the City, real serialized Continue, and both explicit retry
modes: the retained checkpoint restores lookout and full restart restores the
actual dispatch acceptance, with the original receipt namespace preserved.

Frozen candidate2 warning UI passes fifteen unique cases across Chromium
ultrawide, Firefox desktop, WebKit small-phone portrait/landscape and tablet.
The transparent combined report at
/tmp/lowlight-06-candidate2-warning-final/report.json comprises ten original
contact/timeout-retry passes and five save/Continue passes after correcting the
harness. A legitimate navigation autosave can produce later bytes than the
manual save; the corrected check verifies call/dial/index/acknowledgment,
recognition and nonrewound clock identity. Landscape SAVE is reached through
real Tab scrolling in the actual scrollable pause dialog. Original false harness
failures and both harness hashes remain retained; all app hashes match and both
runs report no source changes. All fifteen cases have no page/console/engine
errors or horizontal overflow, and representative PNGs were inspected.

The viewport matrix adds **24 clean captures** over fourteen phone, foldable,
tablet and desktop sizes, including WebKit and all three desktop engines, at
/tmp/lowlight-06-candidate2-viewports. Small-phone, landscape, tablet and ultrawide
PNGs were inspected. A virtual gamepad warning flow passes on Chromium; hardware
controllers and real iOS Safari were not tested. Subsequent changes from that
frozen app are limited to the completed-journal text, dead-driver extraction
outcome and seated projectile radius. The journal correction has separate normal
Continue/pause/journal passes in Chromium, Firefox and WebKit; the two combat
changes have actual-input regressions and the final full test suite. The final
source snapshot retains those exact differences in its manifest.
