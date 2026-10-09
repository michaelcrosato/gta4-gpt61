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
