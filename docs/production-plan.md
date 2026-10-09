# LOWLIGHT production plan

Status: in development. The user's full brief in [brief.md](brief.md) remains
active. The current playable build is an opening foundation, not the final game.

## Identity and design

LOWLIGHT takes place in Harbor City. Its protagonist, Mara Voss, is a former
disaster-relief driver returning to a city that turns public emergencies into
private fortunes. Family, neighborhood businesses, city contractors, and a
reconstruction authority pull her in different directions. The central conflict
is who gets to decide what rebuilding means, and who must pay for it.

The city comprises Breakwater, Saint Brigid, Glassward, The Narrows, and Ironhaven.
These need different street geometry, architecture, residents, landmarks,
transport, interiors, lighting, traffic, sound, and mission opportunities. The
current exterior world has 65 original neighborhood layouts, coastal landforms,
194 site addresses, graded crossings, and district populations. Interiors,
working transit and the complete traversal/fleet content are still required
before the city can pass its production audit.

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

The phone currently shows mission/contact information. It does not implement the
complete call, relationship, date, email, web, and multiplayer entry systems.
Likewise, five vehicle specifications, four assignments, exterior site geometry,
and synthesized background music are foundation evidence, not reference-wide
parity.

`npm test` verifies deterministic simulation, actual mission-stage transitions,
finite ammunition, wall obstruction, death/respawn, vehicle collision, police
escape, shop costs, taxi payment, and mid-mission save continuation. These are
system/contract tests, not a substitute for natural-control playthroughs.

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
