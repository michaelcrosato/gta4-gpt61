# LOWLIGHT production plan

Status: in development. The user's full brief in [brief.md](brief.md) remains
active. The current playable build is an opening foundation, not the final game.

## Identity and design

LOWLIGHT takes place in Harbor City. Its protagonist, Mara Voss, is a former
disaster-relief driver arriving after coastal civil unrest in a city that turns
public emergencies into private fortunes. Family, neighborhood businesses, city
contractors, and a reconstruction authority pull her in different directions.
The central conflict is who gets to decide what rebuilding means, and who must pay
for it.

The city comprises Breakwater, Saint Brigid, Glassward, The Narrows, and Ironhaven.
These need different street geometry, architecture, residents, landmarks,
transport, interiors, lighting, traffic, sound, and mission opportunities. The
current exterior world has 65 original neighborhood layouts, coastal landforms,
194 site addresses, graded crossings, and district populations. Four local
interiors and four Metro services now have runtime implementations. The broader
interior inventory, station-access reconciliation, complete traversal/fleet
content, natural station-network travel and release-performance checks remain
required before the city can pass its production audit.

The visual direction uses procedural pixel geometry, rain-muted stone, warm
windows, cool streets, clear animation silhouettes, and restrained gold interface
accents. The perspective uses my-3d2dge's articulated characters and orthographic
city rendering. Art, characters, dialogue, names, music, and geography are
original. Source mechanics guide coverage; source dialogue and art are not used.

Movement, vehicle weight, firearms, cover, police search, and conversations must
work together in a continuous world. Saving should preserve a meaningful point
in an encounter; retrying should preserve player agency. Jobs and relationships
must offer distinct reasons to inhabit the city outside the campaign.

## Scope and traceability

- [Story research](research/story-scope.md) maps all 90 distinct source mission
  titles across both ending paths, plus shared-event variants and branch
  contracts. The original campaign requires individually authored scenes,
  objectives, encounters, locations, failure/retry behavior, and consequences.
- [Systems research](research/systems-scope.md) inventories side content,
  activities, weapons, vehicles, clothing, items, transport, economy, interfaces,
  relationships, and multiplayer. Every implementation must meet its functional
  acceptance requirements. An entry in a catalogue is not a playable feature.
- Original-release multiplayer remains in scope. The modern PC edition's removed
  multiplayer does not silently remove it from this project's requirements.
- Base GTA IV is the currently researched source. Its two expansion campaigns
  need a separate scope decision if the user intends Complete Edition; their
  appearance in wiki navigation is not counted as delivered content.
- Research gaps include complete minor/ambient/media character coverage, complete
  mission scene/dependency details, and several variant/route reconciliations.
  These gaps must be resolved before a full completeness audit can pass.

The four currently authored opening jobs are additional original onboarding
content. They do not collapse the 90 source-mapped campaign requirements into
four missions. None of those 90 records is claimed complete by this build.

The first 20 source-mapped original missions are individually authored in
[first-arc.js](../src/campaign/first-arc.js), with dialogue, routes, encounters,
branches, checkpoints, failure/retry rules and explicit missing-capability notes.
The [director](../src/campaign/director.js) handles deterministic progression,
observed conditions, choices, interruption/resumption and complete parent-world
save/checkpoint transactions. Night Crossing now has production physical
adapters and an input-driven completion regression; the other nineteen remain
`authored-unintegrated`. None has source completion credit. Missing physical
handlers remain unmet gates. Public Terminal (`LL-ST-022`) remains an explicit
out-of-pack prerequisite for Pressure Vessel; neither that mission nor other
missing mechanics is silently folded into a menu or discarded.

## Production stages

1. Establish the playable opening, simulation/save contracts, responsive
   interface, original art language, source catalogue, and verification pipeline.
2. Build the complete city and traversal: varied district maps, bridges, tunnels,
   elevated rail and subway, interiors, water and swimming, boats, motorcycles,
   helicopters, ladders, jumping/vaulting, cover, and traffic/pedestrian behaviors.
3. Complete weapons/items, vehicle models and physical distinctions, outfits,
   shops, pickups, services, phone/internet, emergency interactions, relationships,
   dates, and every required recreational activity.
4. Author and integrate the entire branching campaign. Every source-mapped
   mission needs a distinct original scenario, authored dialogue, objective
   sequence, encounter choreography, prerequisites, checkpoints, and consequence
   effects. Integrate each arc into the city and existing systems.
5. Author all side jobs, stranger encounters, wanted cases, circuits, contracts,
   vehicle commissions, collectibles, stunt locations, friends, and rewards.
   Recurring work must have the researched distinct routes/targets/content as
   well as repeatable systems.
6. Implement and validate all researched multiplayer modes, lobbies, joining,
   authority/synchronization, team rules, progression, configuration, reconnects,
   and representative multi-client matches. Simulated opponents alone do not
   prove working multiplayer.
7. Complete balancing, pacing, audio, animation, accessibility, performance,
   platform checks, campaign and side-content playthroughs, branch/save audits,
   release packaging, and the user's detailed final presentation.

These stages organize production. They do not narrow the final goal or provide
permission to stop after a slice.

## Current implementation and evidence

The 0.5 campaign integration makes Night Crossing the canonical New Game.
Its ferry/gangway and Dockside Rooms are original physical scenes added without
removing protected city geometry. Felix and Nadia are persistent named actors;
companions have actual foot paths, reserved passenger seats, vehicle injury,
portal transitions, death and abandonment. The ordered taxi route requires
living occupants and the real fairground stop. Cinematics move bodies through
collision, and skipping accelerates their movement rather than teleporting.
Dialogue needs actual presentation, and the shelter response is mandatory.

Home services use finite food, owned/equipped clothing and item ledgers.
The save tutorial requires a real candidate write, readback and commit; ordinary
autosave does not satisfy it. Interrupted meals/rest cannot grant completion.
Rest adds six calendar hours after its physical action completes without
advancing fleet physics by six hours. Checkpoints restore the parent world and
reset camera/input epochs. Save validation includes companion scene bounds.
Returning to free roam retains the interrupted run and its checkpoints through
saves. Phone/journal retry and full restart explicitly restore the chosen world;
opening a panel or continuing a save preserves the current free-roam state.
Metro topology signatures now tolerate only insignificant cross-engine numeric
rounding in metadata; physical geometry and changed-topology rejection remain
strict. Recognized older same-engine signatures migrate without discarding
reservations. Legacy saves retain the additional onboarding path.

A full Night Crossing production-input regression reaches all five stages and
services using normal simulation input plus explicit caption/choice orchestration
and a filesystem storage adapter. Browser checks separately cover genuine
arrival/boarding, choices, services, quota rejection, Continue and failure/retry.
Late-stage browser checks declare valid journey-save fixtures. These boundaries
do not establish a complete natural browser campaign playthrough, first-mission
release quality, all four additional jobs or any source-wide completion.

Implemented foundation: a continuous coastal exterior world across five
districts and 65 neighborhoods, with graded bridges and road bores, surface
swimming, spatial collision/sight queries, persistent regional populations,
and bounded ground/map/building caches; procedural buildings,
cars, and articulated character rendering; keyboard/gamepad/touch movement;
on-foot and vehicle collisions; 17 weapon roles with original equipment art,
finite supply/reloads, timed melee defense/counters/disarms, scoped vertical
gunfire, rockets, grenades, fire, and reusable/fragile street objects;
crouch, wall cover, jumping, vehicle/barrier vaults and ledge climbing;
traffic/pedestrians; six levels of witness-based police response with actual
road pursuits/interception, arrest/confiscation, tactical units, roof/air search,
roadblocks, last-known-location tracking and escape;
damage/armour/death/clinic recovery; food, weapons, armour, repair, and taxi
services; four authored opening assignments with 25 objectives; structured
in-progress saves; full bowling, 301 darts, eight-ball and STACKLIGHT rule/physics
matches with opponents and scene controls; title, pause, map/waypoint, journal,
settings, gear purchasing, and basic phone.

The 0.4 interior work adds four actual room layouts: Voss Dispatch, Saira’s
Garage, The Lantern and Blue Hour Lanes. Room-local combat, cover, doors,
destructible props, persistent NPC health/death, witness reporting at the
exterior entrance, portal return and local/exterior save ownership use the shared
simulation. Paid services include store-specific workshop tools, garage repair,
bar refreshments and bowling/food, with real stock, affordability and charges.
These four rooms do not satisfy the complete city interior inventory.

Harbor Metro now runs G1/G2 and C1/C2 through-services over 26 station complexes
and 56 directional stop roles. Its runtime includes moving train/rider bodies,
door boarding and alighting, served-destination phone selection, disclosed fares,
signal dispatch and save continuation. Train movement requires both compiled
physical clearance and dispatcher permission. The adopted chamber world passes
continuous full-consist checks on all four service circuits, shared-union terrain
checks and native rendering tests. Three-engine browser journeys verify real
boarding, movement, save/Continue and later-stop fares. They use disclosed
platform fixtures, not naturally reached stations or complete-network playthroughs.

The phone currently shows mission/contact information. It does not implement the
complete call, relationship, date, email, web, and multiplayer entry systems.
It now also exposes served Metro destinations. Likewise, the limited road
vehicle specifications, four assignments, exterior site geometry,
and synthesized background music are foundation evidence, not reference-wide
parity.

`npm test` verifies deterministic simulation, actual mission-stage transitions,
finite ammunition, wall obstruction, death/respawn, vehicle collision, police
escape, shop costs, taxi payment, and mid-mission save continuation. These are
system/contract tests, not a substitute for natural-control playthroughs.

The recorded interior activity regression passed 18/18 scenarios across three
engines, and the opening/control smoke regression passed Chromium, Firefox and
WebKit. Interior renderer/UI reports distinguish isolated room fixtures from
real keyboard, pointer and touch actions. Input-only opening runs retain genuine
pursuit deaths, clinic recovery and harness failures; natural completion of all
four jobs remains unproven.

The frozen 0.4 snapshot passes 487 JavaScript and 16 publication tests, plus
syntax, formatting, catalogue integrity, whitespace and build checks. Final
browser evidence includes all three rail journey engines, five rail UI profiles,
six interior profiles, 18 activity cases, three control-smoke engines, 36 city
scenes/raster comparisons and 48 viewport captures. The [verification record](verification.md)
retains fixtures, initial harness failures and corrected reruns; these checks
do not establish full-game completion or sustained real-device performance.

Browser checks use Chromium, Firefox, and WebKit; phone, tablet, desktop, and
ultrawide screenshots are reviewed separately. Reports stay under `/tmp`.
WebKit iPhone profiles approximate Safari; real iOS Safari is unavailable on
this machine. Performance and usability findings remain production work.

## Delivery gates

Full release requires source-mapped coverage at implementation and verification
level; completed city and campaign/side-content branches; real working required
systems and multiplayer; natural-input playthroughs; meaningful failure/retry and
save/load tests; original consistent content/art/audio; tested mobile, desktop,
gamepad, and browser behavior; acceptable performance; and a final report that
honestly explains design choices, time allocation, and limitations.

No goal completion or finished-game claim is appropriate while any requested
content, feature, branch, mode, character inventory, or verification gate remains
missing or unproved.
