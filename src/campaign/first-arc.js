/**
 * LOWLIGHT campaign authoring pack. Night Crossing now has a partial physical
 * director/runtime integration; full release validation remains outstanding.
 * Every record retains AUTHORED / UNINTEGRATED and runtimeValidated:false;
 * the other nineteen missions have no registered physical handlers. Four prologue jobs are
 * additional onboarding and are deliberately absent from this source count.
 * Source facts are short indexed-page paraphrases; all dialogue, motivations,
 * route staging and outcomes below are original. No source dialogue or assets.
 * Predicate/action names are a declarative integration contract, not executable
 * simulation hooks. A director must reject unknown rules rather than skip them.
 */

const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const line = (speaker, text, when = 'always') => ({ speaker, text, when });
const rule = (type, details = {}) => ({ type, ...details });
const beat = (sourceBeat, stageIds, adaptation) => ({ sourceBeat, stageIds, adaptation });
const needs = (id, missionWork) => ({ id, missionWork });
const checkpoint = (id, afterStage, resumeStage, snapshot, note) => ({
  id,
  afterStage,
  resumeStage,
  snapshot,
  note,
});
const failure = (id, condition, resumeCheckpoint, dialogue) => ({
  id,
  condition,
  resumeCheckpoint,
  dialogue,
});
const stage = (id, type, scene, objective, completion, dialogue, detail = {}) => ({
  id,
  type,
  scene,
  objective,
  completion,
  dialogue,
  ...detail,
});

const SOURCES = [
  ['The Cousins Bellic', 'The_Cousins_Bellic'],
  ["It's Your Call", 'It%27s_Your_Call'],
  ["Three's a Crowd", 'Three%27s_a_Crowd'],
  ['First Date', 'First_Date_%28GTA_IV%29'],
  ['Bleed Out', 'Bleed_Out'],
  ['Easy Fare', 'Easy_Fare'],
  ['Jamaican Heat', 'Jamaican_Heat'],
  ['Concrete Jungle', 'Concrete_Jungle'],
  ['Bull in a China Shop', 'Bull_in_a_China_Shop'],
  ['Hung Out to Dry', 'Hung_Out_to_Dry'],
  ['Clean Getaway', 'Clean_Getaway'],
  ['Ivan the Not So Terrible', 'Ivan_the_Not_So_Terrible'],
  ['Uncle Vlad', 'Uncle_Vlad'],
  ['Crime and Punishment', 'Crime_and_Punishment'],
  ['Do You Have Protection?', 'Do_You_Have_Protection%3F'],
  ['Final Destination', 'Final_Destination'],
  ['No Love Lost', 'No_Love_Lost'],
  ['Rigged to Blow', 'Rigged_to_Blow_%28GTA_IV%29'],
  ['Shadow', 'Shadow'],
  ['The Master and the Molotov', 'The_Master_and_the_Molotov'],
];

const mission = (number, title, contact, body) => ({
  id: `LL-ST-${String(number).padStart(3, '0')}`,
  title,
  contact,
  source: {
    game: 'GTA IV base game',
    title: SOURCES[number - 1][0],
    url: `https://gta.fandom.com/wiki/${SOURCES[number - 1][1]}`,
    catalogue: 'docs/research/story-source-map.json',
    evidence: 'mission article and catalogue search-index excerpts; direct Fandom blocked',
    checkedOn: '2026-10-08',
    uncertainty:
      'Broad beats and noted alternatives verified; exact cinematic timing, every incidental line and all source edge failures remain unaudited.',
  },
  status: 'authored-unintegrated',
  runtimeValidated: false,
  sourceMissionCredit: 1,
  startStage: body.stages[0].id,
  commonFailures: ['player-dead', 'player-arrested'],
  retryPolicy: {
    choices: ['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'],
    preserve: ['prior-campaign-outcomes', 'settings', 'completed-onboarding'],
    restore:
      'Explicit checkpoint snapshot of mission actors, inventory, clocks, routes and choices.',
    money:
      'Checkpoint replay restores the checkpoint wallet; ordinary free-roam recovery retains clinic/arrest costs. No repeated reward or fee on Continue.',
    wanted:
      'Restore saved checkpoint heat and witnesses. Do not clear a live escape objective merely by loading.',
    unavailableCheckpoint:
      'Use the most recent committed checkpoint or implicit start if a failure names a checkpoint not yet reached in this attempt.',
    dialogue: [line('Mara', 'I need another way through this.')],
  },
  validationGates: [
    'All source beat records bound to actual director stages, with no unresolved capability skipped.',
    'Clean-save input-only route, combat and optional-branch playthroughs; fixtures reported separately.',
    'Death, arrest, abandonment and mission-specific failures tested at each applicable stage.',
    'Checkpoint/Continue preserves actors, routes, objective inventory, clocks, choices and reward idempotence.',
    'Dialogue, scene camera, animation, original sound, subtitles and all control modes reviewed.',
  ],
  ...body,
});

/** Supporting actors are original additions, not extra verified source characters. */
export const FIRST_ARC_SUPPORTING_CAST = freeze([
  { id: 'LL-ARC-YARA', name: 'Yara Fen', role: 'Impound clerk forced to sell expedited releases.' },
  {
    id: 'LL-ARC-REEVE',
    name: 'Reeve Holt',
    role: 'Repossession supervisor who prices coercion as a service.',
  },
  {
    id: 'LL-ARC-DAX',
    name: 'Dax Lorne',
    role: 'Holt collector; close melee fighter with a telescopic baton.',
  },
  {
    id: 'LL-ARC-PEL',
    name: 'Pel Sedge',
    role: 'Holt collector; surrounds targets rather than trading blows.',
  },
  {
    id: 'LL-ARC-NORA',
    name: 'Nora Keel',
    role: 'Relief archivist recovering evidence before an auction.',
  },
  {
    id: 'LL-ARC-BEA',
    name: 'Bea Marsh',
    role: 'Pier Goods owner protecting her shop and tenant payroll.',
  },
  {
    id: 'LL-ARC-LEON',
    name: 'Leon Pike',
    role: 'Cold-chain operator hiding medicine from a seizure order.',
  },
  {
    id: 'LL-ARC-MILO',
    name: 'Milo Ash',
    role: 'Lender employee using a disputed sedan as collateral.',
  },
  {
    id: 'LL-ARC-SEDGE',
    name: 'Cora Sedge',
    role: 'Corvus foreperson killed by Bran during Mara’s coercion.',
  },
  {
    id: 'LL-ARC-RHEA',
    name: 'Rhea Corvus',
    role: 'Bran’s adult niece; flood-control technician opposing his intimidation.',
  },
  {
    id: 'LL-ARC-ANSEL',
    name: 'Ansel Vale',
    role: 'Motorcycle courier carrying stolen gate schedules for Rhea.',
  },
  {
    id: 'LL-ARC-UNA',
    name: 'Una Flint',
    role: 'Canal battery runner; sells access without knowing who benefits.',
  },
  {
    id: 'LL-ARC-SOL',
    name: 'Sol Mercer',
    role: 'Counterfeit battery workshop boss exploiting emergency tenders.',
  },
  {
    id: 'LL-ARC-ARVEN',
    name: 'Arven Holt',
    role: 'Warehouse foreman caught between competing safety-equipment tenders.',
  },
  {
    id: 'LL-ARC-CELI',
    name: 'Celi Moor',
    role: 'Warehouse clerk whose tender ledger reveals the duplicated route fees.',
  },
  {
    id: 'LL-ARC-ORIN',
    name: 'Orin Vell',
    role: 'Warehouse enforcer wounded during Silas’s controlled-force collection.',
  },
  {
    id: 'LL-ARC-MIRA',
    name: 'Mira Shaw',
    role: 'Canal counterfeit supplier operating the stolen relief-stamp press.',
  },
  {
    id: 'LL-ARC-KIRO',
    name: 'Kiro Day',
    role: 'Canal battery assembler who removes original cell labels.',
  },
]);

/** Geometry proposals are requirements, never automatically spawned by this pack. */
export const FIRST_ARC_SCENES = freeze({
  'pier-berth': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC137' },
    title: 'Pier Eight temporary passenger berth',
    status:
      'constructed-core; passenger ferry, checked gangway/apron, duffel and taxi curb implemented in campaign/scenes.js',
    proposal:
      'A lit 90-by-130 pedestrian apron, mooring rail and accessible gangway; taxi curb separated from working cargo.',
  },
  dispatch: {
    anchor: { kind: 'service', id: 'felix-office' },
    existingRoom: 'voss-dispatch',
    catalogueCounterpart: 'LL-CITY-LOC161',
    status:
      'room, canonical companion proxy and Night Crossing route stop implemented; later dispatch handlers/catalogue address review pending',
  },
  'dockside-rooms': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC054' },
    status:
      'constructed-core; fifth real room, key/evidence, food, wardrobe, confirmed save and six-hour rest implemented',
    proposal:
      '240-by-220 walk-up with two beds, kettle, wardrobe, shelter ledger and a sheltered two-car curb; no luxury facade reveal copied from the source.',
  },
  'impound-counter': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC059' },
    status: 'exterior anchor exists; annex counter and lookout positions missing',
    proposal:
      'Public impound annex beside Old Quay Precinct, 180-by-220 counter interior; two visible approach streets and a taxi pickup bay.',
  },
  'quay-meeting': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC022' },
    status: 'exterior anchor exists; Quay House interior missing',
    proposal:
      '300-by-260 social cafe, counter booths and street-facing windows; Victor uses a rear insurance booth, never the live Lantern bar by silent substitution.',
  },
  'boardwalk-station': {
    anchor: { kind: 'station', id: 'LL-CITY-ST01' },
    status:
      'physical station access, rendered trains, boarding/fare/signal/save runtime implemented; campaign-specific pickup/date binding missing',
  },
  'brigid-station': {
    anchor: { kind: 'station', id: 'LL-CITY-ST04' },
    status:
      'physical upper/lower platform access and passenger runtime implemented; courier battle/escape choreography missing',
    proposal:
      'Street stair, elevator and track crossing safety interlocks; distinct platform approach, service footbridge and courier street exit.',
  },
  'tess-flat': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC174' },
    status: 'exterior anchor exists; character tenancy and interior missing',
    proposal:
      '220-by-200 temporary researcher flat; unopened survey kit hints at Tess’s cover without copying tagged furniture staging.',
  },
  'founders-clinic': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC083' },
    status: 'hospital exterior anchor exists; Felix discharge and medical passenger hook missing',
    proposal:
      'Street pickup bay outside the clinic, with a visible discharged Felix and sling; the hospital interior is not required for this pickup.',
  },
  'pier-goods': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC034' },
    status: 'apparel site exists; clothing store and breakable storefront missing',
    proposal:
      '260-by-220 workwear shop, changing booth, display window isolated from occupants and a street bin with safe throwable bottles.',
  },
  fairground: {
    anchor: { kind: 'site', id: 'LL-CITY-LOC131' },
    status:
      'Night Crossing muster sign/physical stopped-route observation implemented; cancelled screening/date event still missing',
  },
  lanes: {
    anchor: { kind: 'service', id: 'blue-hour-lanes' },
    existingRoom: 'blue-hour-lanes',
    status: 'room and bowling core implemented; companion/date binding missing',
  },
  'lantern-court': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC130' },
    status: 'promenade anchor exists; nearby basketball court is a required exterior addition',
    proposal:
      '90-by-150 fenced court off the promenade; two safe entrances, spectators flee toward the sea wall, collectors trap Felix at the far bench.',
  },
  'old-quay-works': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC181' },
    status: 'construction exterior exists; chase floors, ladders and roof collision missing',
    proposal:
      '320-by-420 multi-level parking/flood-defense frame: grade, 18-unit service landing, 36-unit deck, 54-unit crane walk and 72-unit roof; routes authored separately for Reeve and Ilan.',
  },
  'manifest-yard': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC137' },
    status: 'exterior anchor exists; bonded shed, objective cargo and patrol trigger missing',
    proposal:
      'A bonded shed away from passenger berth; archive crate, two lawful exits and real patrol sightlines.',
  },
  garage: {
    anchor: { kind: 'service', id: 'saira-shop' },
    existingRoom: 'saira-garage',
    catalogueCounterpart: 'LL-CITY-LOC044',
    status: 'repair room implemented; respray identity and campaign voucher missing',
  },
  'tomas-cafe': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC018' },
    status: 'exterior restaurant anchor exists; companion meeting/service hook missing',
  },
  'battery-exchange': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC175' },
    status: 'apartment anchor exists; alley, lookout and interior missing',
    proposal:
      'Outdoor L-shaped service yard with a 12-unit lookout landing, front exchange entrance, lateral cover and an independently visible roof attacker.',
  },
  'boiler-house': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC176' },
    status: 'derelict exterior exists; two-storey workshop interior missing',
    proposal:
      '360-by-300 workshop: stoop door, stair shooter, side window facing bench, connected kitchen/boiler rooms, generator crate and medical cabinet.',
  },
  'coldstore-front': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC158' },
    status: 'warehouse exterior exists; cold-store reception and rear escape route missing',
    proposal:
      'Small public laundry/refrigeration service counter in Canal Bottling Store; a rolling linen rack blocks pursuit briefly, rear van yard stays physically reachable.',
  },
  'vector-lockup': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC162' },
    status: 'workshop exterior exists; vehicle delivery bay and warehouse interior missing',
    proposal:
      '400-by-300 two-bay workshop with roller door, inspection pit and separated parts office; no replacement of actual live Saira room.',
  },
  'kiln-wash': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC049' },
    status: 'vehicle-wash catalogue exists; physical wash service missing',
    proposal:
      'One-way 54-by-160 washing bay, entrance stop signal, rinse pass and street exit; fee deducted once and paint evidence removed only at cycle completion.',
  },
  'saltgate-estate': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC166' },
    status: 'residence exterior exists; residence and basement interiors missing',
    proposal:
      'Main-floor 400-by-340 engineering office/kitchen; basement 360-by-280 coercion scene with loading exit, detention chairs and medical station.',
  },
  'dry-basin-yard': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC159' },
    status: 'warehouse exterior exists; cargo garage and demolition state missing',
    proposal:
      '500-by-460 evacuated contractor yard, drive-through garage, linked sentry/light breakers, evacuation muster board and blast-safe berm.',
  },
  'rook-store': {
    anchor: { kind: 'service', id: 'weapon-shop' },
    status: 'weapon service implemented; escorted story purchase binding missing',
  },
  'bellhaven-lot': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC125' },
    status: 'park exterior exists; biker meeting lot and moving encounter missing',
    proposal:
      'Gantry recreation lot with three approaches, disused repair stalls, motorcycle parking and protected civilian promenade.',
  },
  'furnace-factory': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC157' },
    status: 'factory exterior exists; hazardous truck/loading state missing',
  },
  'canal-stair': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC177' },
    status: 'tenement exterior exists; vertical circulation and supplier flat missing',
    proposal:
      'Ground, 18-unit and 36-unit landings with a continuous stair; supplier flat 320-by-240, breakable lock, workbenches and separate civilian rear room.',
  },
  'quay-exhibition': {
    anchor: { kind: 'site', id: 'LL-CITY-LOC028' },
    status: 'venue exterior exists; exhibition battle interior and roof missing',
    proposal:
      '520-by-640 converted cabaret/contractor exhibition: lobby, display floor, stage, kitchen passage, service alley, 18/36-unit stairs and 54-unit roof. Licensed facade remains Quay Cabaret.',
  },
});

export const FIRST_ARC_CAPABILITY_AUDIT = freeze({
  director: {
    status: 'foundation-implemented',
    evidence:
      'campaign/director.js implements graph/dialogue/choice/checkpoint transactions; runtime.js and parent-context.js bind actual Night Crossing observations/actions',
    work: 'The other nineteen authored missions need individual physical handlers, encounters and validation; unknown gates remain explicit. No source completion credit.',
  },
  driving: {
    status: 'foundation-implemented',
    evidence: 'simulation.js physical vehicles; terrain/navigation.js legal roads',
    work: 'Night Crossing has an ordered physical route and stop dwell. Later mission routes, adaptive pursuit/interception/replacement drivers and complete natural-input validation remain due.',
  },
  passengers: {
    status: 'foundation-implemented',
    evidence:
      'companions.js and campaign/physical-context.js provide persistent living/dead actors, real reserved/occupied seats, boarding/exit, follow/escort, failure grace and portal traversal',
    work: 'Bind each later pickup/outgoing group, companion combat behavior, dates and mission-specific separation/recovery outcomes.',
  },
  phone: {
    status: 'partial',
    evidence: 'game.js phone/journal dialogue UI',
    work: 'Contact calls, incoming timed warnings, muted phone fallback and deferred mission availability.',
  },
  interior: {
    status: 'partial',
    evidence:
      'Five real rooms share doors/combat/props/NPC persistence; campaign/scenes.js adds Dockside Rooms and its physical entrance',
    work: 'Build all explicit missing scenes/portals; multi-level collision, actors, cover and camera must use actual volumes.',
  },
  shelter: {
    status: 'foundation-implemented',
    evidence:
      'Dockside tenancy/key, physical parking, finite food/eating, candidate-write-confirmed save, pending bed action/calendar6h, wardrobe and evidence use actual saved ledgers',
    work: 'Additional residences, ownership/storage policies, later shelter consequences and complete natural-play validation remain due.',
  },
  clothing: {
    status: 'foundation-implemented',
    evidence:
      'wardrobe.js owns three original outfits/transactions; reachable shelter UI equips actual owned clothes, renderer appearance and Continue persist them',
    work: 'Retail clothing interiors, broader clothing inventory, changing rooms and the later mission voucher/buying objective remain missing.',
  },
  activities: {
    status: 'foundation-implemented',
    evidence: 'minigames.js and minigame-view.js full bowling/darts/pool/arcade',
    work: 'Companion bowling, date continuity, completion/quit dialogue and no win-only gate.',
  },
  friendship: {
    status: 'partial',
    evidence: 'Director choice/trust records persist; no full relationship/invitation scheduler',
    work: 'Boundaries, invitations, outings, benefits, relationship schedules and delayed callbacks remain missing.',
  },
  melee: {
    status: 'foundation-implemented',
    evidence: 'combat.js guard, counter and disarm; simulation.js melee',
    work: 'Named-target nonlethal surrender and contextual fight tutorials without invulnerability.',
  },
  firearms: {
    status: 'foundation-implemented',
    evidence: '17 combat weapon roles and live equipment shop',
    work: 'Companion AI, overwatch waves, intimidation aim ray and selective-injury hit regions.',
  },
  police: {
    status: 'foundation-implemented',
    evidence: 'Six-level pursuits, sight, last-seen search and arrest',
    work: 'Mission-specific witnesses, real exit validation and no scripted instant wanted clear.',
  },
  props: {
    status: 'partial',
    evidence:
      'combat.js throwable/destructible objects; Night Crossing has one authoritative physically carried/delivered duffel plus key/evidence receipts',
    work: 'Safe glass shards/storefront trigger, nonweapon pickups, door lock hit volume and inventory evidence.',
  },
  chase: {
    status: 'missing',
    evidence: 'Regional traffic exists; named adaptive chase routes not authored',
    work: 'Routed target AI, foot/car handoffs, last-seen grace, finite escape endpoints and recoverable vehicle availability.',
  },
  selectiveForce: {
    status: 'missing',
    evidence: 'Physical damage exists; no surrender/intimidation contract',
    work: 'Bounded compliant rams, fear, verified aim, localized injury and civilian survival conditions.',
  },
  rail: {
    status: 'foundation-implemented',
    evidence:
      'Four physical Metro services/26 station complexes/56 directional calls have access, native train rendering, boarding/alighting, fares, signals/clearance and saved journeys',
    work: 'Mission-specific courier/target AI, platform combat/escape choreography and remaining reference-wide transport validation are not implemented by the passenger foundation.',
  },
  wash: {
    status: 'missing',
    evidence: 'Five vehicle-wash catalogue sites only',
    work: 'Physical wash approach/cycle, legal fee, dirt/evidence state and original animation/audio.',
  },
  vertical: {
    status: 'partial',
    evidence: 'Terrain heights and low vault/climb exist',
    work: 'Continuous ladders, crane catwalks, authored rooftop gaps, ledge hangs, stairs and matching collision/camera.',
  },
  arrestBranch: {
    status: 'missing',
    evidence: 'Player arrest supported, NPC custody transfer not authored',
    work: 'Escort/rescue/custody resolution and saved witness safety outcomes.',
  },
  impersonation: {
    status: 'missing',
    evidence: 'Police car exists; no traffic stop inspection system',
    work: 'Siren command, deceleration/compliant curb stops, driver exit, cargo inspection and false-stop witnesses.',
  },
  motorcycles: {
    status: 'unverified',
    evidence: 'No playable two-wheel/biker chase proof in current runtime',
    work: 'Two-wheel steering/fall physics, helmet pose, mounted target AI and dismount combat.',
  },
  hazardousCargo: {
    status: 'missing',
    evidence: 'Physical explosives/fire implemented, bomb-truck objective absent',
    work: 'Impact-integrity gauge, planted charge, exit-safe remote trigger, evacuated blast and persistent rubble.',
  },
  tail: {
    status: 'missing',
    evidence: 'World sight queries exist; discreet courier controller absent',
    work: 'Suspicion/occlusion, distance grace, phone distraction, spotted alternate route and supplier discovery.',
  },
  cinematic: {
    status: 'foundation-implemented',
    evidence:
      'campaign/cinematics.js stages real collision-checked actor routes/cameras and accelerated consistent skips; subtitles.js saves actual presentation/duration/acknowledgment',
    work: 'Night Crossing ferry/home staging is integrated. The other nineteen missions need distinct scenes/outcomes, animation/audio production and natural-input validation.',
  },
});

export const FIRST_ARC_MISSIONS = freeze([
  mission(1, 'Night Crossing', 'LL-CHAR-002', {
    premise:
      'Mara steps off a relief ferry. Felix turns the ride home into an evacuation rehearsal, then admits that the co-op’s promised contracts have never been paid.',
    cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-CHAR-008'],
    dependencies: {
      all: [],
      availability:
        'True campaign arrival; narrative entry must precede or bridge existing tutorial jobs, never repeat their rewards.',
    },
    sourceBeats: [
      beat(
        'Ship arrival and cousin reunion',
        ['berth'],
        'A relief ferry and working cargo berth, with an original coastal evacuation history.',
      ),
      beat(
        'First passenger drive and city introduction',
        ['taxi', 'drill'],
        'An evacuation rehearsal teaches steering and neighborhood routes.',
      ),
      beat(
        'Modest home contradicts promised opportunity; safehouse and health tutorials',
        ['shelter', 'rest'],
        'Co-op bunk tenancy, parking and food rather than a copied apartment reveal.',
      ),
    ],
    stages: [
      stage(
        'berth',
        'scene',
        'pier-berth',
        'Meet Felix at the temporary passenger berth.',
        [rule('dialogue-finished')],
        [
          line(
            'Felix',
            'Mara! They told me the ferry was carrying equipment. I said my cousin counts.',
          ),
          line('Mara', 'Three crossings, one engine fire. Your directions were the easy part.'),
          line(
            'Felix',
            'Harbor City. We have work, a room, and streets that occasionally agree with the map.',
          ),
          line('Mara', 'You said a fleet.'),
          line(
            'Felix',
            'A fleet starts with one car. This one has survived every announcement of recovery.',
          ),
        ],
        {
          staging:
            'Felix carries Mara’s duffel to a lit curb; ferry workers continue moving behind them. No opening gunfight.',
        },
      ),
      stage(
        'taxi',
        'board',
        'pier-berth',
        'Take the wheel of Felix’s co-op Crownline with Felix seated beside you.',
        [rule('vehicle-boarded', { vehicle: 'arc-arrival-taxi', passengers: ['LL-CHAR-002'] })],
        [
          line('Felix', 'Left seat is yours. Pretend the meter works; the passengers usually do.'),
          line('Mara', 'Seat belt. I used to get paid to say that.'),
        ],
        {
          vehicle: {
            id: 'arc-arrival-taxi',
            role: 'taxi',
            seats: 4,
            ownership: 'cooperative',
            spawn: 'approved berth curb',
          },
          tutorial: ['steer', 'accelerate', 'brake', 'vehicle-health'],
        },
      ),
      stage(
        'drill',
        'drive-route',
        'dispatch',
        'Follow the evacuation signs to Voss Dispatch, stopping once at the promenade muster sign.',
        [
          rule('route-stops', {
            route: ['pier-berth', 'fairground', 'dispatch'],
            vehicle: 'arc-arrival-taxi',
            passengerAlive: 'LL-CHAR-002',
          }),
        ],
        [
          line(
            'Felix',
            'Yellow arrows mean the next flood assembly point. White arrows mean somebody sold advertising space.',
          ),
          line('Mara', 'That street is too narrow for the coaches on your plan.'),
          line('Felix', 'Tell the consultants. They charged us by the arrow.'),
          line('Mara', 'Who signs the actual evacuation routes?'),
          line('Felix', 'The same office that has owed us six months of driving.'),
        ],
        {
          route: {
            legs: [
              ['pier-berth', 'fairground'],
              ['fairground', 'dispatch'],
            ],
            solver: 'legal street route; no teleport',
            stops: [{ at: 'fairground', speedBelow: 5, seconds: 2 }],
            failureGraceSeconds: 25,
          },
          ambient: [
            line('Felix', 'The water is beautiful until you have to measure it against your door.'),
          ],
        },
      ),
      stage(
        'shelter',
        'walk-scene',
        'dockside-rooms',
        'Park in the sheltered co-op spaces and inspect the room Nadia arranged.',
        [
          rule('parked', { vehicle: 'arc-arrival-taxi', markedBay: true }),
          rule('scene-entered', { scene: 'dockside-rooms' }),
          rule('dialogue-finished'),
        ],
        [
          line('Nadia', 'I found you a clean bed. Felix supplied the grand description.'),
          line('Felix', 'The room was bigger in the photograph.'),
          line('Mara', 'A lock that works. That is already better than the ferry.'),
          line(
            'Nadia',
            'Then keep the spare key. Shelter should never depend on somebody answering a phone.',
          ),
          line(
            'Mara',
            'I came to find an old dispatch record. Work will keep me here long enough to look.',
          ),
        ],
        {
          props: ['duffel', 'shelter-key', 'unpaid-contract ledger'],
          onComplete: [rule('grant-key', { id: 'dockside-tenancy' })],
        },
      ),
      stage(
        'rest',
        'service-tutorial',
        'dockside-rooms',
        'Eat from the shared kettle table, save, and rest before your first shift.',
        [rule('food-used'), rule('shelter-save-confirmed'), rule('rest-completed', { hours: 6 })],
        [
          line('Felix', 'Tea, soup, sleep. Three things the city has not put on a finance plan.'),
          line('Mara', 'Give it a week.'),
          line('Nadia', 'Tomorrow you decide which promise to collect first.'),
        ],
        {
          onComplete: [
            rule('unlock', {
              ids: ['shelter-rest', 'cooperative-parking', 'LL-ST-002', 'first-shift'],
            }),
          ],
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'arrival',
        'berth',
        'taxi',
        ['wallet', 'arrival-taxi', 'Felix-seat', 'duffel'],
        'Restart at the curb without losing the ferry scene outcome.',
      ),
      checkpoint(
        'home',
        'shelter',
        'rest',
        ['tenancy-key', 'parked-taxi', 'wallet', 'health'],
        'Food and rest cannot multiply inventory or tutorial rewards.',
      ),
    ],
    failures: [
      failure('lost-nadia', rule('actor-dead', { actor: 'LL-CHAR-008' }), 'arrival', [
        line('Mara', 'Nadia was giving us a place to begin. We cannot leave her like this.'),
      ]),
      failure(
        'lost-felix',
        rule('passenger-dead-or-abandoned', { actor: 'LL-CHAR-002', grace: 25 }),
        'arrival',
        [line('Mara', 'Felix, stay with me. We are starting this ride again.')],
      ),
      failure(
        'taxi-lost',
        rule('required-vehicle-destroyed', { vehicle: 'arc-arrival-taxi' }),
        'arrival',
        [line('Felix', 'The co-op cannot afford a second first impression.')],
      ),
    ],
    choices: [
      {
        id: 'room-response',
        stage: 'shelter',
        options: [
          {
            id: 'thank-nadia',
            text: 'Thank Nadia for the practical help.',
            effects: [rule('trust', { actor: 'LL-CHAR-008', delta: 1 })],
          },
          {
            id: 'ask-contracts',
            text: 'Ask to see the unpaid contract ledger.',
            effects: [rule('evidence-note', { id: 'co-op-arrears' })],
          },
        ],
        outcome: 'Both grant shelter; dialogue and journal vary, neither suppresses the story.',
      },
    ],
    consequences: [
      'Mara has a persistent refuge, co-op parking and an original reason to investigate emergency dispatch.',
      'Existing four tutorial jobs can follow as additional work; they retain their independent IDs and source credit zero.',
    ],
    rewards: { cash: 0, unlocks: ['dockside-tenancy', 'LL-ST-002', 'additional-onboarding'] },
    requiredCapabilities: [
      needs('director', 'Arrival and onboarding handoff'),
      needs('passengers', 'Felix boards/rides/exits'),
      needs('shelter', 'Room, food, wardrobe and parking'),
      needs('cinematic', 'Ferry arrival and shelter reveal'),
      needs('interior', 'Dockside Rooms'),
    ],
  }),

  mission(2, 'Late Meter', 'LL-CHAR-002', {
    premise:
      'An impound release is Felix’s last chance to keep another taxi. Mara discovers that the same collectors who caused the seizure are selling access to the clerk.',
    cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-YARA', 'LL-ARC-REEVE'],
    dependencies: {
      all: ['LL-ST-001'],
      availability:
        'Felix’s first campaign dispatch request; onboarding jobs may be completed independently.',
    },
    sourceBeats: [
      beat(
        'Drive cousin to a backroom visit and wait as lookout',
        ['counter', 'lookout'],
        'Impound bargaining replaces gambling.',
      ),
      beat(
        'Recognize approaching collectors, phone warning and passenger escape',
        ['warn', 'extract', 'return'],
        'A timed contact warning keeps Felix from surrendering the co-op key.',
      ),
    ],
    stages: [
      stage(
        'counter',
        'escort-drive',
        'impound-counter',
        'Take Felix to the impound annex and park with a view of both approach streets.',
        [rule('passenger-delivered', { actor: 'LL-CHAR-002' }), rule('parked-in-lookout-bay')],
        [
          line('Felix', 'Yara can release the second taxi if I get there before the file closes.'),
          line('Mara', 'Files do not close. People close them.'),
          line('Felix', 'Then let me speak to the person. You watch the road.'),
        ],
        {
          passengers: ['LL-CHAR-002'],
          route: { from: 'dispatch', to: 'impound-counter', solver: 'legal-road' },
        },
      ),
      stage(
        'lookout',
        'observe',
        'impound-counter',
        'Watch the two collector approaches while Felix bargains inside.',
        [
          rule('identified-actor', {
            actor: 'LL-ARC-REEVE',
            evidence: ['grey tow jacket', 'co-op repossession clipboard'],
          }),
        ],
        [
          line(
            'Yara',
            'There are two invoices for the same release. I cannot erase either from here.',
          ),
          line('Felix', 'Then print them both. I want to know which thief has a printer.'),
        ],
        {
          encounter: {
            actors: [
              { id: 'LL-ARC-REEVE', start: 'east approach', destination: 'annex door' },
              { id: 'holt-collector-watch', start: 'north approach', destination: 'taxi curb' },
            ],
            observationWindowSeconds: 45,
            visibleClues: true,
          },
          tutorial: ['camera-look', 'phone-contact'],
        },
      ),
      stage(
        'warn',
        'timed-phone',
        'impound-counter',
        'Call Felix before Reeve reaches the annex door.',
        [rule('outgoing-call-delivered', { contact: 'LL-CHAR-002', topic: 'collector-warning' })],
        [
          line('Mara', 'Grey jacket, tow badge. He is bringing your file back to you.'),
          line('Felix', 'Yara, keep the papers. Mara, leave the engine running.'),
          line('Yara', 'I will send the duplicates to Nadia. Go.'),
        ],
        {
          clock: { seconds: 18, startsOn: 'collector-identification', pausesWithGame: true },
          wrongContact: 'Contact menu stays open with a clear retry cue; clock continues in-world.',
          onComplete: [rule('actor-route', { actor: 'LL-CHAR-002', to: 'taxi curb' })],
        },
      ),
      stage(
        'extract',
        'vehicle-escape',
        'impound-counter',
        'Let Felix board, then break the collectors’ sight without shooting the clerk or patrol.',
        [
          rule('passenger-boarded', { actor: 'LL-CHAR-002' }),
          rule('pursuit-broken', {
            group: 'holt-collectors',
            outsideLastSeen: true,
            unseenSeconds: 10,
          }),
        ],
        [
          {
            ...line('Reeve', 'That taxi is collateral. The man inside it is negotiable.'),
            when: rule('actor-alive', { actor: 'LL-ARC-REEVE' }),
          },
          line('Mara', 'Close the door, Felix.'),
          line('Felix', 'I am beginning to dislike expedited service.'),
        ],
        {
          encounter: { pursuerVehicle: 'holt-tow-sedan', armed: false, adaptiveRoute: true },
          escapeAdvice:
            'Show actual pursuer sight/last-seen cue; alleys provide physical cover, not an invisible completion circle.',
        },
      ),
      stage(
        'return',
        'drive-dialogue',
        'dispatch',
        'Return Felix and the surviving taxi to dispatch.',
        [rule('passenger-delivered', { actor: 'LL-CHAR-002' }), rule('dialogue-finished')],
        [
          line('Mara', 'You knew he might come.'),
          line(
            'Felix',
            'I thought if I could talk to the clerk first, the paper would protect us.',
          ),
          line('Mara', 'Paper only helps when somebody has to read it.'),
          line('Felix', 'Nadia will. She reads everything I would rather forget.'),
        ],
        { onComplete: [rule('evidence-note', { id: 'duplicate-impound-invoices' })] },
      ),
    ],
    checkpoints: [
      checkpoint(
        'annex',
        'counter',
        'lookout',
        ['taxi-pose', 'wallet', 'Felix-annex', 'collectors-approaches', 'warning-clock'],
        'Lookout replay always starts before collectors enter view.',
      ),
      checkpoint(
        'warned',
        'warn',
        'extract',
        ['warning-delivered', 'Felix-route', 'taxi-health', 'pursuer-pose'],
        'Do not respawn Felix in the taxi before he physically boards.',
      ),
    ],
    failures: [
      {
        id: 'protected-target-harmed',
        condition: {
          type: 'protected-target-harmed',
          actors: ['LL-ARC-YARA'],
          groups: ['police'],
          requiresPlayerAttribution: true,
          essentialActorDeath: ['LL-ARC-YARA'],
        },
        resumeCheckpoint: 'annex',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'Yara was trying to help us. We have to get through this without putting her or the patrol in the line of fire.',
            when: 'always',
          },
        ],
      },
      {
        id: 'lookout-timeout',
        condition: { type: 'lookout-timeout', seconds: 45 },
        resumeCheckpoint: 'annex',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'I lost the approaches. Felix, leave the papers and get somewhere safe.',
            when: 'always',
          },
        ],
      },
      {
        id: 'collector-at-door',
        condition: { type: 'collector-door-arrived', actor: 'LL-ARC-REEVE', beforeWarning: true },
        resumeCheckpoint: 'annex',
        dialogue: [
          {
            speaker: 'Mara',
            text: 'He reached the annex before the warning. We need to try the release again.',
            when: 'always',
          },
        ],
      },
      failure('warning-late', rule('clock-expired', { clock: 'warn' }), 'annex', [
        line('Felix', 'They have the key, Mara. Nadia will have to reopen the release.'),
      ]),
      failure(
        'lookout-spooked',
        rule('attack-before-warning', { group: 'holt-collectors' }),
        'annex',
        [
          line(
            'Yara',
            'They locked the annex. You made every person in here a hostage to your argument.',
          ),
        ],
      ),
      failure(
        'felix-or-car-lost',
        rule('escort-or-vehicle-lost', { actor: 'LL-CHAR-002', grace: 25 }),
        'warned',
        [line('Felix', 'I needed a ride out, not a place in another report.')],
      ),
    ],
    choices: [
      {
        id: 'warning-method',
        stage: 'warn',
        options: [
          { id: 'phone', text: 'Call Felix from the contact list.', effects: ['normal warning'] },
          {
            id: 'accessibility-hotkey',
            text: 'Use the displayed contact shortcut.',
            effects: ['same call and clock; available across keyboard/touch/controller'],
          },
        ],
        outcome: 'Equivalent accessible inputs, not separate story endings.',
      },
    ],
    consequences: [
      'Nadia receives duplicate impound invoices. Reeve recognizes Mara’s taxi.',
      'Phone contact and incoming call history become persistent.',
    ],
    rewards: { cash: 120, unlocks: ['LL-ST-003', 'contact-Felix'] },
    requiredCapabilities: [
      needs('phone', 'Timed warning/contact selection'),
      needs('chase', 'Tow crew sight-and-route pursuit'),
      needs('passengers', 'Boarding while pursued'),
      needs('interior', 'Annex window/door staging'),
      needs('director', 'Warning failure and checkpoint clocks'),
    ],
  }),

  mission(3, 'Two Seats Open', 'LL-CHAR-002', {
    premise:
      'Mara interrupts a second intimidation at dispatch, then collects Nadia and Tess from a closed rail entrance. A borrowed work outfit offers a small, chosen foothold in the city.',
    cast: [
      'LL-CHAR-001',
      'LL-CHAR-002',
      'LL-CHAR-008',
      'LL-CHAR-025',
      'LL-ARC-DAX',
      'LL-ARC-PEL',
      'LL-ARC-BEA',
    ],
    dependencies: { all: ['LL-ST-002'] },
    sourceBeats: [
      beat(
        'Cousin threatened with a blade; protagonist disarms the collector and injures his wrist',
        ['dispatch-threat'],
        'A controlled disarm establishes Mara’s relief-security training; two collectors retreat.',
      ),
      beat(
        'Two passengers collected at rail station and introduced; home drop',
        ['pickup', 'home'],
        'Nadia introduces survey researcher Tess.',
      ),
      beat(
        'First free clothing purchase',
        ['workwear'],
        'A co-op voucher buys a selected work outfit, with persistent appearance.',
      ),
    ],
    stages: [
      stage(
        'dispatch-threat',
        'melee-intervention',
        'dispatch',
        'Disarm Dax and force both collectors away from Felix without harming co-op workers.',
        [
          rule('disarmed', { actor: 'LL-ARC-DAX' }),
          rule('hostiles-retreated', { actors: ['LL-ARC-DAX', 'LL-ARC-PEL'] }),
        ],
        [
          line('Dax', 'Holt says the man who hides keys can work without hands.'),
          line('Mara', 'Put the blade down. There are people behind you.'),
          line('Pel', 'You think the counter makes this a public service?'),
          line('Mara', 'No. The people behind it do.'),
        ],
        {
          encounter: {
            combatMode: 'guard-counter-disarm',
            weapon: 'utility-blade',
            disarmInjury:
              'Dax’s wrist is injured in the counter, with original animation and a saved bandage on his later appearance.',
            lethalWeaponsDisabledByObjective: false,
            surrender: 'Dax disarmed and either collector staggered; both choose retreat',
            civilians: ['dispatch-workers'],
          },
          tutorial: ['guard', 'counter', 'disarm'],
        },
      ),
      stage(
        'pickup',
        'multi-passenger-pickup',
        'boardwalk-station',
        'Collect Nadia and Tess at the street entrance to Boardwalk station.',
        [rule('passengers-boarded', { actors: ['LL-CHAR-008', 'LL-CHAR-025'], seatsRequired: 3 })],
        [
          line(
            'Nadia',
            'The lift is shut and the stair is fenced. The announcement still says the train is on time.',
          ),
          line('Tess', 'I am Tess. I photograph drainage points. Glamorous work, if you like mud.'),
          line('Mara', 'Mud tells you more than a brochure.'),
          line('Nadia', 'See? You two can disappoint the same brochure together.'),
        ],
        {
          vehiclePolicy:
            'Any roadworthy four-seat car; co-op taxi offered, no named destroyed-car lock.',
          boarding: { stopSpeedBelow: 5, visibleActors: true, approachFromSidewalk: true },
        },
      ),
      stage(
        'home',
        'passenger-route',
        'tess-flat',
        'Take Tess home, then deliver Nadia to dispatch.',
        [
          rule('dropoffs-complete', {
            order: ['LL-CHAR-025', 'LL-CHAR-008'],
            scenes: ['tess-flat', 'dispatch'],
          }),
        ],
        [
          line('Tess', 'You drove relief routes before this?'),
          line('Mara', 'Whatever roads were still there.'),
          line('Tess', 'I would like to hear how you chose them.'),
          line('Mara', 'That depends on why you are asking.'),
          line('Nadia', 'Give her a quiet evening before you give her a questionnaire.'),
        ],
        {
          route: { stops: ['boardwalk-station', 'tess-flat', 'dispatch'], solver: 'legal-road' },
          onComplete: [rule('contact-added', { actor: 'LL-CHAR-025' })],
        },
      ),
      stage(
        'workwear',
        'clothing-service',
        'pier-goods',
        'Choose a work outfit using Nadia’s co-op voucher.',
        [
          rule('outfit-purchased', { payment: 'cooperative-voucher', store: 'pier-goods' }),
          rule('outfit-equipped'),
        ],
        [
          line('Bea', 'Nadia said you need something that dries before tomorrow.'),
          line('Mara', 'And does not announce where I have been.'),
          line('Bea', 'Then pick the pockets you need. The color is your business.'),
          line('Felix', 'You look employed. We should take a picture for the lender.'),
          line('Mara', 'We should pay Bea before we pay for another picture.'),
        ],
        {
          stock: ['slate-work-jacket', 'ochre-rain-shell', 'navy-coveralls'],
          voucher: { count: 1, amount: 'one listed starter outfit', consumedOnce: true },
          onComplete: [rule('unlock', { ids: ['LL-ST-004', 'LL-ST-005'] })],
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'pickup-ready',
        'dispatch-threat',
        'pickup',
        ['collector-retreat', 'wallet', 'taxi-availability', 'Nadia', 'Tess'],
        'Disarm remains acknowledged on retry; no permanent trust penalty for a failed attempt.',
      ),
      checkpoint(
        'outfit-ready',
        'home',
        'workwear',
        ['passenger-dropoffs', 'Tess-contact', 'voucher', 'wallet'],
        'No duplicate passenger introductions or voucher creation.',
      ),
    ],
    failures: [
      failure('civilian-harmed', rule('civilian-damaged-by-player'), 'start', [
        line('Felix', 'They came to frighten my drivers. You just finished the job for them.'),
      ]),
      failure(
        'passenger-lost',
        rule('passenger-dead-or-abandoned', { actors: ['LL-CHAR-008', 'LL-CHAR-025'], grace: 35 }),
        'pickup-ready',
        [line('Nadia', 'We needed two seats. Call when you can offer a safe ride.')],
      ),
    ],
    choices: [
      {
        id: 'outfit',
        stage: 'workwear',
        options: ['slate-work-jacket', 'ochre-rain-shell', 'navy-coveralls'].map((id) => ({
          id,
          text: id.replaceAll('-', ' '),
          effects: [rule('equip-outfit', { id })],
        })),
        outcome: 'Cosmetic identity persists across saves; none is a disguised story gate.',
      },
    ],
    consequences: [
      'Tess’s contact is unlocked without establishing automatic romance.',
      'Nadia’s free starter clothing voucher is consumed once; later purchases use money.',
    ],
    rewards: { cash: 0, unlocks: ['clothing-service', 'contact-Tess', 'LL-ST-004', 'LL-ST-005'] },
    requiredCapabilities: [
      needs('passengers', 'Two distinct seated NPCs and dropoffs'),
      needs('clothing', 'Three rendered original outfits and voucher'),
      needs('melee', 'Reliable nonlethal disarm/retreat'),
      needs('friendship', 'Contact and boundary flags'),
      needs('director', 'Outfit persistence'),
    ],
  }),

  mission(4, 'Small Hours', 'LL-CHAR-025', {
    premise:
      'Tess invites Mara to a community screening. A permit cancellation sends them bowling instead. Felix’s urgent call can interrupt the plan, and the game must respect both courses.',
    cast: ['LL-CHAR-001', 'LL-CHAR-025', 'LL-CHAR-002'],
    dependencies: {
      all: ['LL-ST-003'],
      availability:
        'Tess may call or Mara may initiate; Unpaid Interest can occur before, during the invitation, or after this outing.',
    },
    sourceBeats: [
      beat(
        'Invitation, cancelled attraction, companion bowling and home return',
        ['invite', 'screening', 'bowl', 'return'],
        'A closed community screening redirects the evening to an actual match.',
      ),
      beat(
        'Cousin rescue call can supersede outing; ignoring it yields hospital aftermath',
        ['urgent-call', 'return'],
        'Mission LL-ST-005 is deferred, never deleted; two authored aftermaths and a rescheduled invitation.',
      ),
      beat(
        'Relationship/friend outings introduced',
        ['boundaries'],
        'Consent and social contact, without automatic intimacy rewards.',
      ),
    ],
    stages: [
      stage(
        'invite',
        'phone-scene',
        'tess-flat',
        'Arrange the evening and collect Tess in a safe passenger vehicle.',
        [rule('invitation-accepted'), rule('passenger-boarded', { actor: 'LL-CHAR-025' })],
        [
          line(
            'Tess',
            'There is a public screening at the fairground. No questionnaire, I promise.',
          ),
          line('Mara', 'Does the film have a happy ending?'),
          line('Tess', 'I have not read the permit decision yet.'),
          line('Mara', 'That sounds more like the city than the film.'),
        ],
        { mayStartBy: ['incoming-contact-call', 'outgoing-contact-call'] },
      ),
      stage(
        'urgent-call',
        'branch-call',
        'tess-flat',
        'Answer Felix’s emergency and choose whether to go to him now.',
        [rule('branch-resolved', { choice: 'evening-priority' })],
        [
          line('Felix', 'Mara. Promenade court. Holt’s people have the gate.'),
          line('Mara', 'Are you hurt?'),
          line('Felix', 'Not enough for them, apparently.'),
          line('Tess', 'If somebody needs you, go. I can choose another evening.'),
        ],
        {
          enabledWhen: rule('mission-incomplete', { id: 'LL-ST-005' }),
          branches: [
            {
              choice: 'rescue-now',
              suspendMissionAt: 'screening',
              activate: 'LL-ST-005',
              effects: [
                rule('passenger-disembark', {
                  actor: 'LL-CHAR-025',
                  at: 'tess-flat',
                  waitForWalkHome: true,
                }),
                rule('queue-invitation', { actor: 'LL-CHAR-025', afterMission: 'LL-ST-005' }),
              ],
              resumption: 'New invitation at Tess’s flat after Felix reaches safety.',
            },
            {
              choice: 'keep-evening',
              next: 'screening',
              effects: [rule('flag', { id: 'felix-rescue-deferred', value: true })],
            },
          ],
          disabledNext: 'screening',
        },
      ),
      stage(
        'screening',
        'drive-scene',
        'fairground',
        'Reach the fairground and read the cancelled screening notice.',
        [
          rule('passenger-delivered', { actor: 'LL-CHAR-025' }),
          rule('notice-read', { id: 'screening-permit-cancelled' }),
        ],
        [
          line('Tess', 'The generators were approved. The audience apparently was not.'),
          line('Mara', 'Another permit office?'),
          line('Tess', 'A private events partner. They bought the right to say no.'),
          line('Mara', 'I am not spending the evening arguing with a fence.'),
          line('Tess', 'Then Blue Hour Lanes. You can argue with a ball instead.'),
        ],
        { route: { from: 'tess-flat', to: 'fairground', solver: 'legal-road' } },
      ),
      stage(
        'bowl',
        'companion-activity',
        'lanes',
        'Choose an empty lane and play bowling with Tess.',
        [
          rule('activity-resolved', {
            kind: 'bowling',
            opponent: 'LL-CHAR-025',
            outcomes: ['completed-match', 'quit-after-start'],
          }),
        ],
        [
          line('Tess', 'I warn you, my last team counted enthusiasm as a skill.'),
          line('Mara', 'My last team counted surviving the journey.'),
          line('Tess', 'Then we can both be beginners here.'),
          line('Mara', 'That would be useful.'),
        ],
        {
          activity: {
            kind: 'bowling',
            players: ['Mara', 'Tess'],
            frames: 10,
            fee: 10,
            sponsorIfUnaffordable: 'Tess offers, with no debt flag',
            aiSkill: 0.48,
            noVictoryRequired: true,
          },
          outcomeDialogue: {
            won: [line('Tess', 'I will measure the drainage. You can measure the pins.')],
            lost: [line('Mara', 'Good. Something in this city can still surprise me.')],
            quit: [
              line(
                'Tess',
                'We can leave a game unfinished. It does not make the whole evening a failure.',
              ),
            ],
          },
        },
      ),
      stage(
        'return',
        'drive-dialogue',
        'tess-flat',
        'Bring Tess home safely; hear the appropriate call about Felix.',
        [rule('passenger-delivered', { actor: 'LL-CHAR-025' }), rule('dialogue-finished')],
        [
          line(
            'Tess',
            'When you said an old dispatch record, did you mean the evacuation you drove?',
          ),
          line(
            'Mara',
            'One coach was sent onto a road that had already failed. Somebody changed the route after we left.',
          ),
          line('Tess', 'I am sorry.'),
          line('Mara', 'Ask me again when we know each other better.'),
          line('Tess', 'All right. Another evening, on your terms.'),
          line(
            'Felix',
            'Clinic says I can leave. You could collect me, if you have finished being elsewhere.',
            'felix-rescue-deferred',
          ),
        ],
        {
          onComplete: [
            rule('queue-mission', {
              id: 'LL-ST-005',
              variantWhen: 'felix-rescue-deferred',
              variant: 'clinic-after-evening',
            }),
          ],
        },
      ),
      stage(
        'boundaries',
        'relationship-choice',
        'tess-flat',
        'Choose how to keep in touch with Tess.',
        [rule('branch-resolved', { choice: 'tess-contact-boundary' })],
        [
          line('Tess', 'Coffee, a walk, another terrible score. An invitation is an invitation.'),
          line('Mara', 'Good. I have enough contracts.'),
        ],
        { onComplete: [rule('unlock', { ids: ['social-invitations'] })] },
      ),
    ],
    checkpoints: [
      checkpoint(
        'collected',
        'invite',
        'urgent-call',
        ['Tess-seat', 'car-health', 'wallet', 'Felix-event-pending'],
        'Rescue choice and suspension survive Continue.',
      ),
      checkpoint(
        'lane',
        'screening',
        'bowl',
        ['Tess-location', 'cancelled-notice', 'wallet', 'fee-receipt'],
        'A match snapshot resumes without another admission fee.',
      ),
      checkpoint(
        'drive-home',
        'bowl',
        'return',
        ['full-bowling-session-result', 'Tess-trust', 'fee', 'Felix-deferred-flag'],
        'A quit is not a bowling victory or cash reward.',
      ),
    ],
    failures: [
      failure(
        'outing-unsafe',
        rule('companion-hurt-or-spooked', {
          actor: 'LL-CHAR-025',
          triggers: ['player-attack', 'gunfire', 'repeated-dangerous-driving'],
        }),
        'collected',
        [line('Tess', 'Stop here. I wanted an evening, not another incident to document.')],
      ),
      failure('car-lost', rule('occupied-passenger-car-destroyed'), 'collected', [
        line('Mara', 'We will arrange a safe ride before we try again.'),
      ]),
    ],
    choices: [
      {
        id: 'evening-priority',
        stage: 'urgent-call',
        options: [
          {
            id: 'rescue-now',
            text: 'Help Felix now and reschedule with Tess.',
            effects: [rule('activate-mission', { id: 'LL-ST-005', variant: 'court-rescue' })],
          },
          {
            id: 'keep-evening',
            text: 'Continue the evening; collect Felix afterward.',
            effects: [
              rule('flag', { id: 'felix-rescue-deferred', value: true }),
              rule('trust', { actor: 'LL-CHAR-002', delta: -2 }),
            ],
          },
        ],
        outcome:
          'Both retain the entire LL-ST-005 mission, with a distinct aftermath and dialogue.',
      },
      {
        id: 'tess-contact-boundary',
        stage: 'boundaries',
        options: [
          {
            id: 'friends',
            text: 'Keep this as friendship.',
            effects: [rule('flag', { id: 'tess-relationship', value: 'friends' })],
          },
          {
            id: 'open-to-dates',
            text: 'Accept future dates without a promise.',
            effects: [rule('flag', { id: 'tess-relationship', value: 'open-to-dates' })],
          },
        ],
        outcome: 'Both preserve story contact; future invitations and personal dialogue vary.',
      },
    ],
    consequences: [
      'Tess’s investigation remains concealed. Mara has disclosed only the changed convoy route.',
      'Felix’s untreated court encounter or clinic recovery is a persistent branch, not a removed mission.',
    ],
    rewards: { cash: 0, unlocks: ['social-invitations', 'LL-ST-006 when LL-ST-005 also complete'] },
    requiredCapabilities: [
      needs('friendship', 'Date boundaries/invitation scheduling'),
      needs('activities', 'Ten-frame companion bowling and quit continuation'),
      needs('phone', 'Interrupt/defer calls'),
      needs('director', 'Suspend/resume and braided mission order'),
      needs('passengers', 'Tess fear and safe transport'),
    ],
  }),

  mission(5, 'Unpaid Interest', 'LL-CHAR-002', {
    premise:
      'Holt’s crew traps Felix at the promenade court. Mara breaks the collectors’ grip, pursues their supervisor and finds payroll evidence on an unfinished flood-defense deck.',
    cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-DAX', 'LL-ARC-PEL', 'LL-ARC-REEVE'],
    dependencies: {
      all: ['LL-ST-003'],
      availability:
        'Urgent-call branch from LL-ST-004 or Felix’s direct contact. Clinic aftermath if the call was deferred.',
    },
    sourceBeats: [
      beat(
        'Urgent cousin rescue; two melee attackers',
        ['court'],
        'Guard, dodge, counter and disarm protect a trapped civilian.',
      ),
      beat(
        'Fleeing supervisor car chase then interior knife confrontation',
        ['pursuit', 'deck', 'resolve'],
        'Reeve abandons the car in a parking frame and fights with a utility blade; his fall is physically staged.',
      ),
      beat(
        'Alternate hospital pickup if date came first; cousin return',
        ['clinic', 'return'],
        'Clinic costs/trust are saved and the collectors are still confronted later.',
      ),
    ],
    stages: [
      stage(
        'clinic',
        'variant-escort',
        'founders-clinic',
        'If you deferred Felix’s call, collect him from Founders Medical Center and hear where Reeve went.',
        [rule('passenger-collected', { actor: 'LL-CHAR-002', site: 'LL-CITY-LOC083' })],
        [
          line('Felix', 'They offered me a payment plan for the stitches. I almost laughed.'),
          line('Mara', 'I should have come.'),
          line(
            'Felix',
            'Then come now. Reeve took the drivers’ payroll book. He has gone back to the court.',
          ),
        ],
        {
          enabledWhen: rule('flag-is', { id: 'felix-rescue-deferred', value: true }),
          onComplete: [rule('flag', { id: 'felix-clinic-recovered', value: true })],
          disabledNext: 'court',
          route: { pickupSite: 'LL-CITY-LOC083', to: 'lantern-court' },
        },
      ),
      stage(
        'court',
        'melee-rescue',
        'lantern-court',
        'Defeat Dax and Pel using guard/counters; keep Felix and spectators safe.',
        [
          rule('hostiles-neutralized', {
            actors: ['LL-ARC-DAX', 'LL-ARC-PEL'],
            surrenderCounts: true,
          }),
          rule('actor-safe', { actor: 'LL-CHAR-002' }),
        ],
        [
          line('Pel', 'Holt keeps the book until everybody signs.'),
          line('Mara', 'Open the gate.'),
          line('Dax', 'You gave me trouble at the office.'),
          line('Mara', 'I gave you a chance to leave.'),
          line('Felix', 'Mara, behind you!'),
        ],
        {
          variantStaging: {
            immediate: 'Felix at court bench, collectors surround him',
            deferred:
              'Felix remains in parked car; collectors guard payroll book at the same court',
          },
          encounter: {
            actors: [
              { id: 'LL-ARC-DAX', weapon: 'baton', tactics: 'guard-break' },
              { id: 'LL-ARC-PEL', weapon: 'unarmed', tactics: 'flank-grapple' },
            ],
            neutralizedThreshold: 'unconscious or surrendered; no forced corpse',
            civilianExits: ['sea-wall gate', 'street gate'],
          },
        },
      ),
      stage(
        'pursuit',
        'car-chase',
        'old-quay-works',
        'Let Felix board, then follow Reeve’s red coupe to Old Quay Works.',
        [
          rule('target-arrived', { actor: 'LL-ARC-REEVE', scene: 'old-quay-works' }),
          rule('player-followed', { trackingGraceSeconds: 20 }),
        ],
        [
          line('Reeve', 'You want the book? Bring the car. I can repossess both.'),
          line('Felix', 'He drives like every corner belongs to him.'),
          line('Mara', 'Then we will let the corners disagree.'),
        ],
        {
          route: {
            from: 'lantern-court',
            to: 'old-quay-works',
            targetStyle: 'aggressive but traffic-collidable',
            failDistance: 220,
            graceSeconds: 20,
            targetNoTeleport: true,
          },
          playerVehicles:
            'Any healthy four-seat car; co-op replacement available through dispatch if destroyed before stage starts.',
          protect: ['LL-CHAR-002'],
        },
      ),
      stage(
        'deck',
        'foot-pursuit',
        'old-quay-works',
        'Leave Felix by the entrance, climb the service stair and catch Reeve above the unfinished bays.',
        [rule('actor-reached', { actor: 'LL-ARC-REEVE', floor: 36 })],
        [
          line('Felix', 'I am staying where the concrete is finished.'),
          line('Mara', 'Lock the doors. If I shout, call Nadia.'),
          line('Reeve', 'This deck was certified. Same office as your little co-op.'),
        ],
        {
          route: {
            mode: 'foot',
            ordered: ['grade service gate', '18-unit stair landing', '36-unit parking deck'],
            hazards: ['unfinished curb', 'open service shaft'],
          },
          target: { weapon: 'utility-blade', evadeUntil: 'deck confrontation' },
        },
      ),
      stage(
        'resolve',
        'melee-evidence',
        'old-quay-works',
        'Survive Reeve’s knife attack and recover the payroll book.',
        [
          rule('hostile-neutralized', { actor: 'LL-ARC-REEVE' }),
          rule('evidence-collected', { id: 'drivers-payroll-book' }),
        ],
        [
          line('Reeve', 'Nobody reads the signatures. They pay for the silence underneath.'),
          line('Mara', 'Whose silence?'),
          line('Reeve', 'Ask Senn. Ask the man who bought your cousin’s route.'),
        ],
        {
          encounter: {
            duel: 'counter/disarm or ordinary damage',
            staging:
              'Reeve backs across a broken edge during his final attack; fatal fall follows a real supported floor edge, not a menu execution.',
            allowPlayerNonlethal:
              'If disarmed before the edge, Reeve survives but escapes custody later; evidence and contractor threat remain.',
          },
          onComplete: [rule('evidence-note', { id: 'senn-payroll-connection' })],
        },
      ),
      stage(
        'return',
        'escort-drive',
        'dispatch',
        'Bring Felix and the payroll book back to dispatch.',
        [
          rule('passenger-delivered', { actor: 'LL-CHAR-002' }),
          rule('evidence-secured', { id: 'drivers-payroll-book' }),
        ],
        [
          line('Felix', 'I thought one bad contract would be smaller than losing the co-op.'),
          line('Mara', 'It brought them into every driver’s wages.'),
          line('Felix', 'Give the book to Nadia. I cannot read another name tonight.'),
          line('Mara', 'Then rest. Tomorrow we make it belong to the drivers again.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'court-ready',
        'clinic',
        'court',
        ['Felix-variant', 'clinic-receipt', 'wallet', 'court-actors'],
        'Direct rescue uses an equivalent start snapshot without a clinic fee.',
      ),
      checkpoint(
        'chase-ready',
        'court',
        'pursuit',
        ['court-outcome', 'Felix-health-seat', 'Reeve-car', 'player-car'],
        'Replacement rides are real boarded cars, not named-vehicle deadlocks.',
      ),
      checkpoint(
        'deck-entry',
        'pursuit',
        'deck',
        ['both-car-poses', 'Felix-safe', 'Reeve-foot-route', 'health-ammo'],
        'Restore Reeve before the stair, preserving player equipment at arrival.',
      ),
    ],
    failures: [
      failure(
        'felix-lost',
        rule('actor-dead-or-abandoned', { actor: 'LL-CHAR-002', grace: 30 }),
        'court-ready',
        [line('Mara', 'Felix! Nadia, send someone to the court.')],
      ),
      failure(
        'reeve-escaped',
        rule('target-lost', { actor: 'LL-ARC-REEVE', grace: 20 }),
        'chase-ready',
        [line('Felix', 'He has the names. We cannot let him sell them.')],
      ),
      failure(
        'book-destroyed',
        rule('objective-destroyed', { id: 'drivers-payroll-book' }),
        'deck-entry',
        [line('Mara', 'Without the names, we cannot undo what he signed.')],
      ),
    ],
    choices: [
      {
        id: 'reeve-outcome',
        stage: 'resolve',
        options: [
          {
            id: 'disarm-early',
            text: 'Counter and disarm him before the ledge.',
            effects: [rule('flag', { id: 'reeve-fate', value: 'survived' })],
          },
          {
            id: 'fatal-fall',
            text: 'Survive the fight as it reaches the broken edge.',
            effects: [rule('flag', { id: 'reeve-fate', value: 'dead' })],
          },
        ],
        outcome:
          'An original tactical outcome, additional to the mapped mandatory fight; both retain the payroll evidence and next arc.',
      },
    ],
    consequences: [
      'Felix’s date-deferred clinic variant is remembered in personal dialogue.',
      'Nadia receives the payroll book; Senn’s insurance scheme becomes a named lead.',
    ],
    rewards: { cash: 200, unlocks: ['LL-ST-006 when LL-ST-004 complete', 'Felix-outings'] },
    requiredCapabilities: [
      needs('melee', 'Two-person tutorial and knife disarm'),
      needs('chase', 'Car-to-foot pursuit handoff'),
      needs('passengers', 'Felix safely waits and rides'),
      needs('vertical', 'Real stairs/deck edge/fall'),
      needs('director', 'Clinic/date variants and evidence'),
      needs('cinematic', 'Original supported fall/rescue outcome'),
    ],
  }),

  mission(6, 'Unmarked Fare', 'LL-CHAR-002', {
    premise:
      'Nora Keel hires a taxi to recover a relief manifest before its bonded shed is emptied. A corrupt patrol treats the archive crate as contraband.',
    cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-ARC-NORA', 'saira-bell'],
    dependencies: { all: ['LL-ST-004', 'LL-ST-005'] },
    sourceBeats: [
      beat(
        'Passenger collected for yard retrieval; two-star police ambush',
        ['fare', 'retrieve', 'escape'],
        'Relief archive crate replaces stolen consumer electronics.',
      ),
      beat(
        'Wanted escape, repair/respray introduction and passenger delivery',
        ['garage', 'archive'],
        'Real loss of sight precedes a once-funded garage tutorial.',
      ),
    ],
    stages: [
      stage(
        'fare',
        'taxi-pickup',
        'dispatch',
        'Collect Nora Keel in a roadworthy taxi.',
        [rule('passenger-boarded', { actor: 'LL-ARC-NORA', vehicleRole: 'taxi' })],
        [
          line('Nora', 'Pier Eight. Shed C. They have marked the records for auction.'),
          line('Mara', 'Records of what?'),
          line(
            'Nora',
            'Every relief vehicle that entered this port. Including the ones the city says never arrived.',
          ),
          line('Felix', 'No meter on this one. Bring her back with the papers.'),
        ],
      ),
      stage(
        'retrieve',
        'cargo-pickup',
        'manifest-yard',
        'Wait for Nora to collect the sealed manifest crate, then let her return to the taxi.',
        [
          rule('cargo-loaded', { id: 'relief-manifest-crate' }),
          rule('passenger-boarded', { actor: 'LL-ARC-NORA' }),
        ],
        [
          line('Nora', 'There. I left a duplicate under the shelf years ago.'),
          line('Patrol', 'Step away from the archive. This is a secured seizure.'),
          line('Mara', 'The seizure notice is dated tomorrow.'),
          line('Nora', 'They always gave themselves time to make it legal.'),
        ],
        {
          staging:
            'Patrol enters by a real yard gate after Nora opens the crate locker; warning lights and vehicle movement precede pursuit.',
          onComplete: [rule('wanted-at-least', { level: 2, cause: 'contested archive seizure' })],
        },
      ),
      stage(
        'escape',
        'wanted-escape',
        'manifest-yard',
        'Keep Nora and the crate safe; break police sight and leave the active search perimeter.',
        [
          rule('wanted-zero'),
          rule('passenger-alive', { actor: 'LL-ARC-NORA' }),
          rule('cargo-intact', { id: 'relief-manifest-crate' }),
        ],
        [
          line(
            'Nora',
            'They only need to burn one box. We need to get it somewhere people can read it.',
          ),
          line(
            'Mara',
            'Watch the patrol lights. When they lose sight, we leave where they last saw us.',
          ),
        ],
        {
          tutorial: ['observed-versus-searching', 'last-seen-perimeter', 'concealment'],
          routePolicy: 'Open legal escape; no mandatory death funnel or scripted wanted reset.',
        },
      ),
      stage(
        'garage',
        'repair-tutorial',
        'garage',
        'Use Nora’s emergency voucher at Saira’s garage; inspect repair and respray options.',
        [rule('vehicle-service-completed', { repair: true, resprayTutorialViewed: true })],
        [
          line(
            'Saira',
            'An archivist in a taxi with patrol marks. Felix keeps finding economical work.',
          ),
          line('Nora', 'Emergency records fund. This receipt will be honest, at least.'),
          line(
            'Saira',
            'A new coat can confuse a plate reader. It cannot hide you from somebody watching the door.',
          ),
          line('Mara', 'Then we arrive after they stop watching.'),
        ],
        {
          fee: { payer: 'archive-emergency-voucher', amount: 120, once: true },
          entryAllowed: 'Only unseen, not observed by police; no magical repair immunity.',
          onComplete: [rule('unlock', { ids: ['repair-service', 'respray-service'] })],
        },
      ),
      stage(
        'archive',
        'passenger-delivery',
        'tomas-cafe',
        'Deliver Nora and the archive crate to the cafe’s community document room.',
        [
          rule('passenger-delivered', { actor: 'LL-ARC-NORA' }),
          rule('evidence-secured', { id: 'relief-manifest-crate' }),
        ],
        [
          line(
            'Nora',
            'I can copy the ledger here. Tomas has a generator that belongs to the neighborhood.',
          ),
          line('Mara', 'Look for a coach diverted after dispatch. Coastal route, six years ago.'),
          line(
            'Nora',
            'That request has come from other people. Not all of them wanted an answer.',
          ),
          line('Mara', 'Tell me before you give it to them.'),
        ],
        { onComplete: [rule('contact-added', { actor: 'LL-CHAR-003' })] },
      ),
    ],
    checkpoints: [
      checkpoint(
        'yard',
        'fare',
        'retrieve',
        ['Nora-seat', 'taxi-pose-health', 'crate-locker', 'wallet'],
        'Patrol event is pending, not already shooting on restore.',
      ),
      checkpoint(
        'garage-ready',
        'escape',
        'garage',
        ['wanted-zero', 'crate', 'Nora', 'taxi-health', 'voucher'],
        'Retain real escape result; voucher cannot multiply.',
      ),
      checkpoint(
        'archive-ready',
        'garage',
        'archive',
        ['service-receipt', 'crate', 'taxi', 'Nora'],
        'Continue charges no second service fee.',
      ),
    ],
    failures: [
      failure(
        'fare-lost',
        rule('passenger-dead-or-abandoned', { actor: 'LL-ARC-NORA', grace: 30 }),
        'yard',
        [line('Felix', 'Nora trusted a co-op driver. We need to be worth that.')],
      ),
      failure(
        'crate-lost',
        rule('objective-destroyed-or-left', { id: 'relief-manifest-crate' }),
        'yard',
        [line('Nora', 'Those are people’s names, Mara. Go back before they burn them.')],
      ),
    ],
    choices: [
      {
        id: 'respray',
        stage: 'garage',
        options: [
          {
            id: 'retain-coop-color',
            text: 'Repair and retain the taxi’s co-op colors.',
            effects: ['No new disguise; repair tutorial still complete'],
          },
          {
            id: 'temporary-slate',
            text: 'Use a temporary slate respray.',
            effects: [rule('vehicle-color', { id: 'current-taxi', color: 'slate' })],
          },
        ],
        outcome:
          'Original optional appearance; neither bypasses observed police or substitutes for escape.',
      },
    ],
    consequences: [
      'Nora begins investigating the altered evacuation dispatch.',
      'Repair/respray and legitimate optional taxi work are unlocked; Tomas becomes a contact.',
    ],
    rewards: { cash: 300, unlocks: ['LL-ST-007', 'LL-ST-009', 'taxi-fares', 'vehicle-services'] },
    requiredCapabilities: [
      needs('passengers', 'Nora walks/boards with archive crate'),
      needs('police', 'Yard patrol trigger and real escape'),
      needs('props', 'Serializable mission cargo'),
      needs('driving', 'Taxi service voucher'),
      needs('wash', 'Respray identity service distinct from car wash'),
      needs('director', 'Cargo and transaction persistence'),
    ],
  }),

  mission(7, 'After the Siren', 'LL-CHAR-003', {
    premise:
      'Tomas asks Mara to watch a generator exchange from a service landing. Three profiteers and a roof gunman turn the deal into an ambush.',
    cast: ['LL-CHAR-001', 'LL-CHAR-003', 'LL-ARC-SOL'],
    dependencies: { all: ['LL-ST-006'] },
    sourceBeats: [
      beat(
        'Companion pickup, handgun supply and elevated lookout',
        ['meet', 'landing'],
        'Protect a community generator exchange from a real vantage.',
      ),
      beat(
        'Three ground attackers plus rooftop threat; companion protection and return',
        ['ambush', 'return'],
        'Four distinct combat positions and extraction unlock Tomas’s delivery work.',
      ),
    ],
    stages: [
      stage(
        'meet',
        'escort-equipment',
        'tomas-cafe',
        'Meet Tomas, accept or inspect his loaned handgun, and drive him to the exchange.',
        [
          rule('companion-collected', { actor: 'LL-CHAR-003' }),
          rule('equipment-ready', { role: 'pistol', minimumRounds: 90 }),
        ],
        [
          line(
            'Tomas',
            'Two generators. Every shelter on the south route has already paid for them once.',
          ),
          line('Mara', 'Then why pay again?'),
          line('Tomas', 'Because people cannot charge an insulin fridge with a principle.'),
          line('Mara', 'I will watch the exchange. You choose when to leave.'),
          line('Tomas', 'Take this Pier Nine. Keep it down unless somebody makes that impossible.'),
        ],
        {
          equipment: {
            loanWeapon: 'pistol',
            rounds: 150,
            receipt: 'Tomas-loan',
            ownedEquivalentAllowed: true,
          },
          route: { from: 'tomas-cafe', to: 'battery-exchange' },
        },
      ),
      stage(
        'landing',
        'overwatch-position',
        'battery-exchange',
        'Climb the service landing and find a clear view of Tomas and the roofline.',
        [
          rule('position-held', { volume: '12-unit lookout landing', seconds: 2 }),
          rule('companion-at-exchange'),
        ],
        [
          line('Tomas', 'Do not stand over me. Let them think this is one foolish mechanic.'),
          line('Mara', 'You are making a persuasive case.'),
          line('Tomas', 'The foolishness is negotiable. The generators are not.'),
        ],
        {
          tutorial: ['aim', 'height-aware-sight', 'reload', 'ally-marker'],
          geometry: 'Landing has cover and two visible steps; no automatic camera teleport.',
        },
      ),
      stage(
        'ambush',
        'overwatch-combat',
        'battery-exchange',
        'Protect Tomas from the three yard attackers and the gunman on the roof.',
        [
          rule('hostiles-neutralized', { group: 'exchange-ambush', count: 4 }),
          rule('actor-alive', { actor: 'LL-CHAR-003' }),
        ],
        [
          line('Profiteer', 'Your tender was cancelled. Hand over the cash.'),
          line('Tomas', 'Then give me the cancellation in writing.'),
          line('Mara', 'Tomas, behind the generator! Roof on your left!'),
          line('Tomas', 'I see him. Keep that landing.'),
        ],
        {
          encounter: {
            waves: [
              {
                trigger: 'exchange price dispute',
                actors: [
                  { id: 'exchange-front', role: 'pistol', start: 'front alley' },
                  { id: 'exchange-flank', role: 'pistol', start: 'west corner' },
                  { id: 'exchange-loader', role: 'pistol', start: 'rear loading door' },
                ],
              },
              {
                trigger: 'first attacker neutralized or 8 seconds',
                actors: [{ id: 'exchange-roof', role: 'pistol', z: 30, start: 'opposite roof' }],
              },
            ],
            ally: { id: 'LL-CHAR-003', cover: 'generator crate', canBeDamaged: true },
            collateral: 'Housing occupants remain behind screened windows, not enemy targets.',
          },
        },
      ),
      stage(
        'return',
        'companion-extraction',
        'tomas-cafe',
        'Collect Tomas and return to the cafe after any police search is over.',
        [rule('passenger-delivered', { actor: 'LL-CHAR-003' }), rule('wanted-zero')],
        [
          line(
            'Tomas',
            'They took the generators out before we came. Empty housings, fresh paint.',
          ),
          line('Mara', 'Who knew the shelter would pay anyway?'),
          line(
            'Tomas',
            'A supplier at the boiler house. I hoped the people here were simply greedy.',
          ),
          line('Mara', 'It takes planning to sell nothing twice.'),
          line('Tomas', 'If you still want work, mine is moving things people actually need.'),
        ],
        { onComplete: [rule('unlock', { ids: ['Tomas-deliveries', 'LL-ST-008'] })] },
      ),
    ],
    checkpoints: [
      checkpoint(
        'lookout-ready',
        'meet',
        'landing',
        ['loan-weapon-ammo', 'Tomas-health', 'vehicle-pose', 'wallet'],
        'Never grants a second pistol/ammunition loan on restore.',
      ),
      checkpoint(
        'exchange-ready',
        'landing',
        'ambush',
        ['player-landing', 'Tomas-cover', 'four-hostile-spawns', 'ammo-health'],
        'Roof attacker cannot spawn inside the player’s cover volume.',
      ),
    ],
    failures: [
      failure('tomas-killed', rule('actor-dead', { actor: 'LL-CHAR-003' }), 'exchange-ready', [
        line('Mara', 'Tomas! Someone call the clinic!'),
      ]),
      failure(
        'abandoned-overwatch',
        rule('ally-abandoned-during-combat', { actor: 'LL-CHAR-003', grace: 20 }),
        'exchange-ready',
        [line('Tomas', 'Mara, I cannot watch four doors from one crate.')],
      ),
    ],
    choices: [
      {
        id: 'loan',
        stage: 'meet',
        options: [
          {
            id: 'loan-pier-nine',
            text: 'Accept Tomas’s pistol loan.',
            effects: [rule('loan-equipment', { role: 'pistol', rounds: 150 })],
          },
          {
            id: 'use-owned',
            text: 'Use an owned handgun with sufficient ammunition.',
            effects: ['Same combat, no redundant gun grant'],
          },
        ],
        outcome:
          'Both keep the firearm tutorial; restitution dialogue follows the inventory receipt.',
      },
    ],
    consequences: [
      'Mara learns the relief tender fraud involves counterfeit equipment.',
      'Tomas’s community delivery contact opens; no friend discount is granted before a relationship system exists.',
    ],
    rewards: { cash: 350, unlocks: ['LL-ST-008', 'Tomas-deliveries'] },
    requiredCapabilities: [
      needs('firearms', 'Four height-aware hostiles and ally cover AI'),
      needs('passengers', 'Tomas drive/exit/extract'),
      needs('vertical', 'Lookout landing and roof attacker'),
      needs('director', 'Equipment loan ledger'),
      needs('police', 'Natural shot witness/escape'),
    ],
  }),

  mission(8, 'Boiler Rooms', 'LL-CHAR-003', {
    premise:
      'A supplier offers replacement generators and instead tries to rob Tomas. The fleeing crew leads to a workshop where Mara must breach carefully and recover usable stock.',
    cast: ['LL-CHAR-001', 'LL-CHAR-003', 'LL-ARC-SOL'],
    dependencies: { all: ['LL-ST-007'] },
    sourceBeats: [
      beat(
        'Companion deals at front while player guards rear; three fleeing enemies',
        ['deal', 'rear', 'runners'],
        'A replacement-parts exchange becomes a coordinated robbery.',
      ),
      beat(
        'Regroup, second house approach, door cover, window shot, two interior enemies',
        ['regroup', 'breach', 'workshop'],
        'All four interior positions have collision/sight volumes; shotgun and medical pickup retained.',
      ),
      beat(
        'Companion return and next tail mission unlock',
        ['return'],
        'The supplier’s delivery runner becomes an investigative lead.',
      ),
    ],
    stages: [
      stage(
        'deal',
        'companion-drive',
        'battery-exchange',
        'Drive Tomas to the replacement-parts seller and let him enter by the front.',
        [rule('companion-entered', { actor: 'LL-CHAR-003', entrance: 'front' })],
        [
          line('Tomas', 'Sol says yesterday was a subcontractor’s mistake.'),
          line('Mara', 'A mistake with four guns.'),
          line(
            'Tomas',
            'I am not going in because I believe him. I am going in because the shelters still need power.',
          ),
        ],
      ),
      stage(
        'rear',
        'rear-guard',
        'battery-exchange',
        'Drive around to the rear alley and keep the exit vehicle available.',
        [rule('vehicle-positioned', { bay: 'rear-guard', engineReady: true })],
        [
          line('Tomas', 'Keep the car. If someone runs out with the payment, stop them.'),
          line('Mara', 'And if you run out?'),
          line('Tomas', 'Do not stop me.'),
        ],
        {
          route:
            'A physically drivable block loop connects front to rear; no turn through a solid building.',
        },
      ),
      stage(
        'runners',
        'moving-ambush',
        'battery-exchange',
        'Stop the three armed runners before they leave with Tomas’s payment.',
        [
          rule('hostiles-neutralized', { group: 'payment-runners', count: 3 }),
          rule('evidence-collected', { id: 'generator-payment-bag' }),
        ],
        [
          line('Tomas', 'No parts. They pulled a gun. Three are coming out your door.'),
          line('Runner', 'Get to the street!'),
          line('Mara', 'Drop the bag and you can stop running.'),
        ],
        {
          encounter: {
            actors: [
              {
                id: 'runner-bag',
                weapon: 'pistol',
                destination: 'street sedan',
                carries: 'generator-payment-bag',
              },
              { id: 'runner-left', weapon: 'pistol', destination: 'canal corner' },
              { id: 'runner-right', weapon: 'pistol', destination: 'street sedan' },
            ],
            surrenderCounts: true,
            vehicleOrFootCombatAllowed: true,
            escapeGraceSeconds: 20,
          },
        },
      ),
      stage(
        'regroup',
        'escort-escape',
        'boiler-house',
        'Collect Tomas, lose any witnessed wanted level, then reach the boiler-house supplier.',
        [
          rule('wanted-zero'),
          rule('companion-at-scene', { actor: 'LL-CHAR-003', scene: 'boiler-house' }),
        ],
        [
          line('Tomas', 'They called Sol before they tried it. He is at the boiler house.'),
          line('Mara', 'You are not going through another door alone.'),
          line('Tomas', 'Then teach me which side of the door belongs to us.'),
        ],
        { route: { from: 'battery-exchange', to: 'boiler-house' } },
      ),
      stage(
        'breach',
        'cover-breach',
        'boiler-house',
        'Take cover at the stoop; clear the stair gunman and the shotgun threat visible through the side window.',
        [rule('hostiles-neutralized', { actors: ['boiler-stair', 'boiler-window'] })],
        [
          line('Mara', 'Stay against the wall. Do not cross the doorway until we see the stair.'),
          line('Tomas', 'Window on the right. There is a workbench behind it.'),
          line('Mara', 'I have the angle. Keep the door covered.'),
        ],
        {
          encounter: {
            actors: [
              { id: 'boiler-stair', weapon: 'pistol', z: 18, cover: 'stair return' },
              { id: 'boiler-window', weapon: 'shotgun', cover: 'bench behind side window' },
            ],
            windowRayMustMatchCollision: true,
          },
          tutorial: ['cover-enter', 'peek', 'reposition-to-window'],
        },
      ),
      stage(
        'workshop',
        'interior-combat-recovery',
        'boiler-house',
        'Advance with Tomas, clear the two remaining workshop guards and inspect the generators.',
        [
          rule('hostiles-neutralized', { actors: ['boiler-kitchen', 'boiler-sol'] }),
          rule('cargo-identified', { id: 'working-generator-pair' }),
        ],
        [
          line('Sol', 'You are taking inventory from a licensed contractor.'),
          line('Tomas', 'Those licenses did not keep the lights on.'),
          line('Mara', 'Put the gun down. The machines are going back to the shelters.'),
          line(
            'Tomas',
            'Serial plates have been filed off. Somebody wanted them to disappear twice.',
          ),
        ],
        {
          encounter: {
            actors: [
              { id: 'boiler-kitchen', weapon: 'pistol', cover: 'kitchen half-wall' },
              { id: 'boiler-sol', cast: 'LL-ARC-SOL', weapon: 'pistol', cover: 'boiler manifold' },
            ],
            allyCanBeHurt: true,
          },
          pickups: [
            { id: 'boiler-shotgun', from: 'boiler-window', role: 'shotgun' },
            { id: 'boiler-medical-kit', at: 'kitchen table', optional: true },
          ],
          onComplete: [rule('evidence-note', { id: 'filed-generator-serials' })],
        },
      ),
      stage(
        'return',
        'companion-delivery',
        'tomas-cafe',
        'Bring Tomas and the recovered generator claim documents back to the cafe.',
        [
          rule('passenger-delivered', { actor: 'LL-CHAR-003' }),
          rule('evidence-secured', { id: 'generator-claim-documents' }),
        ],
        [
          line('Tomas', 'I will bring a proper flatbed. Today we keep the claim papers safe.'),
          line('Mara', 'Somebody still has to explain who gave Sol that license.'),
          line(
            'Tomas',
            'His runner takes batteries to a flat by the canal. Watch her, not the advertisement on the van.',
          ),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'rear-ready',
        'rear',
        'runners',
        ['guard-car', 'Tomas-front', 'runners', 'payment-bag', 'wallet'],
        'The three runners begin inside the actual rear door.',
      ),
      checkpoint(
        'house-ready',
        'regroup',
        'breach',
        ['Tomas-health', 'payment-bag', 'wanted-zero', 'player-ammo-health'],
        'The second battle is independently restartable.',
      ),
      checkpoint(
        'inside',
        'breach',
        'workshop',
        [
          'cleared-two-guards',
          'Tomas-pose',
          'remaining-two-guards',
          'shotgun-pickup',
          'health-ammo',
        ],
        'Clearance and optional pickups cannot respawn for farming.',
      ),
    ],
    failures: [
      failure(
        'payment-escaped',
        rule('objective-carrier-escaped', { id: 'runner-bag', grace: 20 }),
        'rear-ready',
        [line('Tomas', 'That payment came from people who cannot pay a third time.')],
      ),
      failure('companion-killed', rule('actor-dead', { actor: 'LL-CHAR-003' }), 'house-ready', [
        line('Mara', 'Tomas, stay down. I am coming.'),
      ]),
      failure(
        'generator-destroyed',
        rule('objective-destroyed', { id: 'working-generator-pair' }),
        'inside',
        [line('Mara', 'We came to restore power. Burning the machines restores nothing.')],
      ),
    ],
    choices: [
      {
        id: 'runner-force',
        stage: 'runners',
        options: [
          {
            id: 'accept-surrender',
            text: 'Accept any runner’s surrender.',
            effects: [rule('flag', { id: 'boiler-surviving-witness', value: true })],
          },
          {
            id: 'armed-resistance',
            text: 'Fight runners who keep shooting.',
            effects: ['Ordinary lethal combat; payment retrieval still required'],
          },
        ],
        outcome: 'Adds witness testimony if a real surrender occurs; does not skip either battle.',
      },
    ],
    consequences: [
      'The generators become a later logistics objective; no invisible cargo delivery is claimed.',
      'Serial filing links emergency contractors to inventory fraud; Second Shift becomes available in the parallel Tomas strand.',
    ],
    rewards: { cash: 450, unlocks: ['LL-ST-019', 'shotgun-role'] },
    requiredCapabilities: [
      needs('chase', 'Three armed runners and escape endpoints'),
      needs('interior', 'Stair/window/kitchen workshop'),
      needs('firearms', 'Companion cover and shotgun pickup'),
      needs('props', 'Payment/evidence/cargo safety'),
      needs('director', 'Two distinct battle checkpoints'),
    ],
  }),

  mission(9, 'Glass Tax', 'LL-CHAR-009', {
    premise:
      'Victor claims Bea’s protection premium is overdue. He wants a broken window to make his invoice persuasive; Bea has a receipt that proves the policy never existed.',
    cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-BEA', 'LL-CHAR-043'],
    dependencies: {
      all: ['LL-ST-006'],
      availability: 'Parallel Victor strand; Tomas’s later jobs are not artificial prerequisites.',
    },
    sourceBeats: [
      beat(
        'Debt order, taxi travel introduction and shopkeeper refusal',
        ['order', 'ride', 'ask'],
        'A fraudulent insurance levy targets the workwear store already visited.',
      ),
      beat(
        'Retrieve throwable object, break a window without killing owner and return payment',
        ['glass', 'receipt', 'return'],
        'A safe display pane and proof of fraud replace copied threats/dialogue.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contact-scene',
        'quay-meeting',
        'Hear Victor’s collection terms and take the written invoice.',
        [rule('objective-received', { id: 'senn-premium-invoice' })],
        [
          line(
            'Victor',
            'Your cousin keeps an expensive family. A small errand settles the account.',
          ),
          line('Mara', 'What account?'),
          line('Victor', 'Pier Goods. Bea pays to remain protected from interruption.'),
          line('Mara', 'And you are the interruption.'),
          line('Victor', 'I am the man who can explain it to an insurer.'),
        ],
      ),
      stage(
        'ride',
        'taxi-travel-tutorial',
        'pier-goods',
        'Reach Pier Goods; hail Amin’s taxi or use your own vehicle.',
        [rule('scene-reached', { scene: 'pier-goods' }), rule('taxi-ride-tutorial-viewed')],
        [
          line(
            'Amin',
            'Flag a car with an empty light. Tell us the destination before you insult the meter.',
          ),
          line('Mara', 'What if I drive myself?'),
          line('Amin', 'Then you can insult your own meter. It costs less.'),
        ],
        {
          transportOptions: ['hail/riding taxi with visible fare', 'player-driven car', 'walk'],
          tutorialNoForcedFee: true,
        },
      ),
      stage(
        'ask',
        'intimidation-dialogue',
        'pier-goods',
        'Show Bea the premium invoice and hear her refusal.',
        [rule('dialogue-finished')],
        [
          line('Bea', 'I paid for six months. The underwriter says there is no policy number.'),
          line('Mara', 'Victor sent me to collect.'),
          line(
            'Bea',
            'Then collect an answer. I have people changing clothes in here, not hostages.',
          ),
        ],
      ),
      stage(
        'glass',
        'object-throw',
        'pier-goods',
        'Pick up a street bottle and throw it through the empty display pane without hurting Bea or customers.',
        [
          rule('prop-collected', { id: 'street-bottle' }),
          rule('glass-broken-by-throw', { id: 'empty-display-pane' }),
        ],
        [
          line('Victor', 'A pane is cheaper than a premium. Show her the arithmetic.'),
          line('Mara', 'Everybody away from the display.'),
          line('Bea', 'So that is what your protection protects against.'),
        ],
        {
          props: [
            { id: 'street-bottle', material: 'glass', pickup: 'public bin' },
            { id: 'empty-display-pane', destructible: true, shardSafetyVolume: 'display bay only' },
          ],
          forbiddenSubstitutes: [
            'gunshot pane completion',
            'shopkeeper death',
            'menu acknowledge without physical throw',
          ],
          aimPreview: 'Real projectile arc and pane hit volume.',
        },
      ),
      stage(
        'receipt',
        'evidence-payment',
        'pier-goods',
        'Take Bea’s payment envelope and preserve the false-policy receipt she includes.',
        [rule('objective-received', { ids: ['premium-envelope', 'false-policy-receipt'] })],
        [
          line(
            'Bea',
            'Here. This pays the invoice. That slip proves he cannot sell what he broke.',
          ),
          line('Mara', 'I will keep a copy.'),
          line('Bea', 'Keep the original. I kept copies before you arrived.'),
        ],
      ),
      stage(
        'return',
        'contact-delivery',
        'quay-meeting',
        'Deliver the envelope to Victor without handing over Bea’s evidence.',
        [
          rule('payment-delivered', { id: 'premium-envelope' }),
          rule('evidence-retained', { id: 'false-policy-receipt' }),
        ],
        [
          line('Victor', 'See? An honest conversation.'),
          line('Mara', 'Nothing honest happened at that window.'),
          line('Victor', 'She paid. The city recognizes that kind of truth.'),
          line('Mara', 'Then it will recognize the receipt too.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'shop',
        'ride',
        'ask',
        ['invoice', 'wallet', 'taxi-fare-receipt', 'Bea-alive', 'unbroken-pane'],
        'Transport choice and its actual cost persist.',
      ),
      checkpoint(
        'throw-ready',
        'ask',
        'glass',
        ['customers-clear', 'bottle-available', 'pane-intact', 'player-health'],
        'No customers restore inside the shard-safe display.',
      ),
      checkpoint(
        'return-ready',
        'receipt',
        'return',
        ['envelope', 'false-receipt', 'broken-pane', 'wallet'],
        'Payment is not free-roam spending money and cannot be collected twice.',
      ),
    ],
    failures: [
      failure('shopkeeper-hurt', rule('protected-actor-hurt', { actor: 'LL-ARC-BEA' }), 'shop', [
        line('Mara', 'This was already wrong. Hurting Bea will not make it right.'),
      ]),
      failure('wrong-force', rule('pane-broken-with-firearm'), 'throw-ready', [
        line('Victor', 'I said a window. Now every shop on the block is calling the precinct.'),
      ]),
      failure('money-lost', rule('objective-missing', { id: 'premium-envelope' }), 'return-ready', [
        line('Victor', 'A collector who loses the collection is just another debtor.'),
      ]),
    ],
    choices: [
      {
        id: 'taxi-method',
        stage: 'ride',
        options: [
          {
            id: 'ride',
            text: 'Hire Amin’s taxi at the displayed fare.',
            effects: ['Actual boarding, travel, fare debit and skip-to-safe-arrival option'],
          },
          {
            id: 'self-travel',
            text: 'Travel yourself after viewing the taxi tutorial.',
            effects: ['No hired fare debit'],
          },
        ],
        outcome: 'Accessibility and travel choice retain the same physical throw/evidence mission.',
      },
    ],
    consequences: [
      'Bea remembers Mara’s participation; a later restitution contact requires an actual payment.',
      'False policy receipt is persistent reconstruction-corruption evidence.',
    ],
    rewards: { cash: 180, unlocks: ['LL-ST-010', 'taxi-rides'] },
    requiredCapabilities: [
      needs('props', 'Pickup, throw, glass shards and evidence envelope'),
      needs('selectiveForce', 'Store occupants clear before pane hit'),
      needs('passengers', 'Hired taxi travel'),
      needs('director', 'Payment custody, receipt/restitution flags'),
      needs('interior', 'Pier Goods storefront'),
    ],
  }),

  mission(10, 'Spin Cycle', 'LL-CHAR-009', {
    premise:
      'Leon operates a laundry counter over a refrigerated medicine store. Victor calls him a debtor; Leon thinks Mara has come to seize the medicines and flees in his delivery van.',
    cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-LEON'],
    dependencies: { all: ['LL-ST-009'] },
    sourceBeats: [
      beat(
        'Shop confrontation, thrown obstruction and rear van escape',
        ['order', 'counter', 'rear'],
        'A rolling linen rack blocks a physically traversable rear path.',
      ),
      beat(
        'Car pursuit and repeated nonlethal rams force surrender; driver and van must survive',
        ['pursuit', 'terms'],
        'A compliance meter measures controlled impacts separately from medicine/vehicle destruction; pre-spooking the van remains a failure.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contact-scene',
        'quay-meeting',
        'Take Victor’s demand to Leon at Canal Bottling Store.',
        [rule('objective-received', { id: 'leon-demand' })],
        [
          line('Victor', 'Pike has a van and an excellent excuse for every bill.'),
          line('Mara', 'What does he owe you?'),
          line('Victor', 'Access. Electricity. The privilege of keeping the shutter up.'),
          line('Mara', 'Those are three names for one threat.'),
        ],
      ),
      stage(
        'counter',
        'confrontation',
        'coldstore-front',
        'Enter through the public counter and speak to Leon.',
        [rule('dialogue-finished')],
        [
          line(
            'Leon',
            'If you are from the seizure office, tell them the insulin has already gone.',
          ),
          line('Mara', 'Senn sent me.'),
          line('Leon', 'Same office, different stationery.'),
          line('Mara', 'Leon, stop! We have not even spoken.'),
        ],
        {
          sceneAction:
            'Leon rolls a linen rack across the aisle and runs through the actual rear door.',
          precondition: 'Rear escape van remains undamaged/unoccupied before the confrontation.',
        },
      ),
      stage(
        'rear',
        'foot-to-vehicle',
        'coldstore-front',
        'Follow Leon into the yard and take an available healthy car.',
        [
          rule('vehicle-boarded', { role: 'road-car', minimumHealth: 35 }),
          rule('target-fleeing', { actor: 'LL-ARC-LEON' }),
        ],
        [
          line('Mara', 'He thinks I am taking the medicine.'),
          line('Victor', 'Then stop the van before he changes his mind about paying.'),
          line('Mara', 'I will stop him. I will not destroy what is inside.'),
        ],
        {
          playerCarSupply:
            'Two naturally parked accessible road cars plus the player’s surviving arrival car; never force a wrecked specific taxi.',
          targetVehicle: { id: 'pike-cold-van', cargo: 'medicine-stock', maxHealth: 100 },
        },
      ),
      stage(
        'pursuit',
        'controlled-ram-chase',
        'coldstore-front',
        'Use controlled side/rear bumps to make Leon stop; preserve him, his van and the medicine.',
        [
          rule('target-compliant', { actor: 'LL-ARC-LEON', pressureAtLeast: 100 }),
          rule('vehicle-health-at-least', { vehicle: 'pike-cold-van', value: 25 }),
          rule('cargo-intact', { id: 'medicine-stock' }),
        ],
        [
          line('Mara', 'Leon, pull over! I am not taking the stock!'),
          line('Leon', 'Everybody says that until the door is open.'),
          line('Mara', 'Then keep the door shut and talk to me.'),
        ],
        {
          chase: {
            loopScenes: ['coldstore-front', 'canal-stair', 'battery-exchange'],
            solver: 'legal-road',
            pressure: {
              moderateImpact: 25,
              closeSirenOrVoice: 5,
              heavyImpact: 'damage without safe pressure bonus',
            },
            surrenderAt: 100,
            escapeDistance: 250,
            escapeGrace: 25,
            hud: ['compliance', 'van-integrity', 'medicine-safe'],
          },
          noShortcut: 'Shooting driver/engine does not complete the controlled-force objective.',
        },
      ),
      stage(
        'terms',
        'roadside-dialogue',
        'coldstore-front',
        'Hear Leon’s evidence, agree a payment schedule and release him with the stock.',
        [
          rule('dialogue-finished'),
          rule('actor-released', { actor: 'LL-ARC-LEON', vehicle: 'pike-cold-van' }),
        ],
        [
          line(
            'Leon',
            'That refrigerator is on a private meter. Senn bought the debt from the city.',
          ),
          line(
            'Mara',
            'Give me the meter account. Pay what you can document, not what he invents.',
          ),
          line('Leon', 'He will call that theft.'),
          line('Mara', 'He already calls everything else protection.'),
          line('Victor', 'Did he get the message?'),
          line('Mara', 'He will pay an account that exists. Send me the number.'),
        ],
        { onComplete: [rule('evidence-note', { id: 'privatized-cold-chain-meter' })] },
      ),
    ],
    checkpoints: [
      checkpoint(
        'counter-ready',
        'order',
        'counter',
        ['demand', 'Leon-counter', 'undamaged-van', 'healthy-player-car-options', 'wallet'],
        'Target van tampering cannot survive a retry as an unwinnable setup.',
      ),
      checkpoint(
        'chase-ready',
        'rear',
        'pursuit',
        ['both-moving-vehicles', 'Leon-health', 'medicine-health', 'pressure-zero'],
        'Pressure, damage and route progress saved together; no instant compliance on load.',
      ),
    ],
    failures: [
      failure(
        'pre-spooked',
        rule('target-van-tampered-before-confrontation', { vehicle: 'pike-cold-van' }),
        'counter-ready',
        [line('Leon', 'I saw you at the van. The front door is not a trap I intend to stand in.')],
      ),
      failure(
        'driver-or-cargo-killed',
        rule('protected-object-lost', { ids: ['LL-ARC-LEON', 'pike-cold-van', 'medicine-stock'] }),
        'chase-ready',
        [line('Mara', 'The shelves will be empty because of us. That was never the job.')],
      ),
      failure(
        'van-escaped',
        rule('target-lost', { actor: 'LL-ARC-LEON', grace: 25 }),
        'chase-ready',
        [
          line(
            'Victor',
            'You let a refrigeration van outrun you. How will you phrase that on an invoice?',
          ),
        ],
      ),
    ],
    choices: [
      {
        id: 'payment-record',
        stage: 'terms',
        options: [
          {
            id: 'documented-payment',
            text: 'Record Leon’s documented payment schedule.',
            effects: [rule('flag', { id: 'leon-debt', value: 'documented' })],
          },
          {
            id: 'hold-for-review',
            text: 'Keep the account for Nadia to audit before paying.',
            effects: [
              rule('flag', { id: 'leon-debt', value: 'audit-pending' }),
              rule('trust', { actor: 'LL-CHAR-009', delta: -1 }),
            ],
          },
        ],
        outcome: 'Leon survives and leaves in both; later collection/restitution dialogue changes.',
      },
    ],
    consequences: [
      'The private cold-chain meter joins the fraud evidence.',
      'Leon remains an actual shop actor, with his van, rather than disappearing after a success menu.',
    ],
    rewards: { cash: 220, unlocks: ['LL-ST-011'] },
    requiredCapabilities: [
      needs('chase', 'Moving van and foot-to-car handoff'),
      needs('selectiveForce', 'Controlled impact compliance separate from damage'),
      needs('props', 'Linen obstruction and medicine cargo'),
      needs('interior', 'Counter/rear yard'),
      needs('director', 'Pre-spook failure and saved pressure'),
    ],
  }),
  mission(11, 'Clean Plate', 'LL-CHAR-009', {
    premise:
      'Victor sends Mara by rail to reclaim a lender’s sedan. Its owner disputes the repossession, and luminous inspection paint must be washed away before delivery.',
    cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-ARC-MILO'],
    dependencies: { all: ['LL-ST-010'] },
    sourceBeats: [
      beat(
        'Climb station, wait, ride train and steal identified silver car',
        ['brief', 'rail', 'identify', 'recover'],
        'Real platform access and a fare-paying ride connect two districts.',
      ),
      beat(
        'Owner alive, stunned or killed changes dialogue; car wash then lockup; damage-sensitive call',
        ['recover', 'wash', 'deliver', 'callback'],
        'Original repossession dispute has three witnessed force outcomes and an actual physical wash.',
      ),
    ],
    stages: [
      stage(
        'brief',
        'contact-scene',
        'quay-meeting',
        'Obtain the sedan’s registration and reach Boardwalk station.',
        [
          rule('objective-received', { id: 'silver-sedan-order' }),
          rule('scene-reached', { scene: 'boardwalk-station' }),
        ],
        [
          line(
            'Victor',
            'Milo Ash has a company car on a private lease. He forgot which side of that sentence matters.',
          ),
          line('Mara', 'Why send me on the train?'),
          line('Victor', 'Because I want one car brought back, not two left outside his door.'),
          line('Mara', 'What happens if his paperwork says the lease is paid?'),
          line('Victor', 'Paperwork is what I am paying you to stop discussing.'),
        ],
      ),
      stage(
        'rail',
        'train-journey',
        'brigid-station',
        'Reach the platform, wait for the correct train, ride to Brigid Market and exit onto the street.',
        [
          rule('rail-trip-completed', {
            fromStation: 'LL-CITY-ST01',
            toStation: 'LL-CITY-ST04',
            actualBoarding: true,
            actualDisembarkation: true,
          }),
        ],
        [
          line(
            'Station announcement',
            'Outer Line toward Brigid Market. Keep the boarding edge clear.',
          ),
          line('Mara', 'A timetable. Something here admits that people are waiting.'),
        ],
        {
          transit: {
            from: 'LL-CITY-ST01',
            to: 'LL-CITY-ST04',
            service: 'LL-CITY-SERVICE-01',
            farePolicy:
              'actual controller tariff; Victor advances the displayed fare once if needed',
            wrongTrain: 'May alight/transfer; not instant mission failure',
            requiredProof:
              'Actual rider pose follows moving train; reaching destination marker by car is insufficient.',
          },
        },
      ),
      stage(
        'identify',
        'vehicle-identification',
        'brigid-station',
        'Find the silver lender sedan and check its registration before taking it.',
        [rule('identified-vehicle', { vehicle: 'ash-silver-sedan', clue: 'registration-match' })],
        [
          line('Milo', 'That plate is my employer’s. The lease balance is mine.'),
          line('Mara', 'I have an order from Senn.'),
          line('Milo', 'He sold the same lease to two offices. Which one paid you?'),
        ],
        {
          vehicle: {
            id: 'ash-silver-sedan',
            role: 'compact',
            color: 'silver',
            dirt: 'luminous yard inspection paint',
            spawn: 'approved Brigid Market street bay',
          },
          witnesses: ['Milo', 'Milo-colleague'],
        },
      ),
      stage(
        'recover',
        'vehicle-recovery-choice',
        'brigid-station',
        'Recover the marked sedan; Milo’s actual condition changes the report.',
        [
          rule('vehicle-boarded', { vehicle: 'ash-silver-sedan' }),
          rule('owner-outcome-recorded', { actor: 'LL-ARC-MILO' }),
        ],
        [
          line('Mara', 'I am taking the car. Keep your receipts.'),
          line('Milo', 'Those receipts were supposed to keep my car.'),
          line('Victor', 'Have you got it?'),
          line('Mara', 'The car, yes. An uncontested debt, no.'),
        ],
        {
          encounter: {
            ownerOptions: [
              'talk while colleague distracted, board unlocked car',
              'counter/disarm owner’s attempted grab; nonlethal stun',
              'ordinary lethal attack with real police/witness consequences',
            ],
            colleagueResponse:
              'Foot pursuit if vehicle is taken by force; stops at a physical last-seen endpoint.',
          },
          onComplete: [
            rule('flag-from-actor', {
              id: 'milo-recovery-outcome',
              actor: 'LL-ARC-MILO',
              values: ['unhurt', 'stunned', 'dead'],
            }),
          ],
        },
      ),
      stage(
        'wash',
        'vehicle-wash',
        'kiln-wash',
        'Lose any active pursuit, then wash the inspection paint from the sedan at Kiln Row Wash.',
        [
          rule('wanted-zero'),
          rule('wash-cycle-completed', {
            vehicle: 'ash-silver-sedan',
            removes: 'inspection-paint',
          }),
        ],
        [
          line('Mara', 'The bonnet is covered in tracking paint.'),
          line('Victor', 'Kiln Row Wash. It cannot arrive looking like a disputed asset.'),
          line('Mara', 'It will still be one.'),
          line(
            'Wash attendant',
            'Stop at the red line. Engine off while the rails draw you through.',
          ),
        ],
        {
          route: {
            from: 'brigid-station',
            to: 'kiln-wash',
            solver: 'legal-road-and-open-crossings',
          },
          service: {
            fee: 15,
            missionAdvanceIfNeeded: true,
            cycleSeconds: 18,
            abort:
              'Retain paid receipt but repaint remains until an entire physical cycle completes.',
          },
        },
      ),
      stage(
        'deliver',
        'vehicle-delivery',
        'vector-lockup',
        'Park the washed sedan inside Vector Garage’s inspection bay and leave the keys.',
        [
          rule('vehicle-delivered', {
            vehicle: 'ash-silver-sedan',
            bay: 'inspection',
            minimumHealth: 10,
          }),
          rule('paint-removed', { vehicle: 'ash-silver-sedan' }),
        ],
        [
          line('Victor', 'He still breathing?', 'milo-recovery-outcome=unhurt'),
          line(
            'Mara',
            'Yes. Nobody needed to get hurt for a set of keys.',
            'milo-recovery-outcome=unhurt',
          ),
          line('Victor', 'He still breathing?', 'milo-recovery-outcome=stunned'),
          line(
            'Mara',
            'Yes. He will remember why his employer changed the locks.',
            'milo-recovery-outcome=stunned',
          ),
          line('Mara', 'Milo is dead. The lease is not.', 'milo-recovery-outcome=dead'),
          line(
            'Victor',
            'Then I have lost a payment and gained a car. An expensive choice.',
            'milo-recovery-outcome=dead',
          ),
        ],
        {
          onComplete: [
            rule('record-vehicle-condition', {
              id: 'sedan-delivery-condition',
              vehicle: 'ash-silver-sedan',
            }),
          ],
        },
      ),
      stage(
        'callback',
        'delayed-phone',
        'quay-meeting',
        'Hear Victor’s condition-sensitive call; record Milo’s lease discrepancy.',
        [
          rule('call-resolved', { topic: 'sedan-condition' }),
          rule('evidence-note', { id: 'double-sold-lease' }),
        ],
        [
          line(
            'Victor',
            'Clean bodywork. You have an eye for an asset.',
            'sedan-delivery-condition=undamaged',
          ),
          line(
            'Victor',
            'The paint is clean. The rest of it looks like an argument with a bridge.',
            'sedan-delivery-condition=damaged',
          ),
          line('Mara', 'Perhaps stop sending your assets into arguments.'),
          line('Victor', 'Come back. A depot employee has been reading the wrong files.'),
        ],
        {
          callDelay: {
            minimumWorldSeconds: 30,
            noRealTimeWaitingRequiredInTests:
              'test event scheduling separately; never fast-forward natural evidence',
          },
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'station-ready',
        'brief',
        'rail',
        ['registration-order', 'fare-advance-receipt', 'wallet', 'station-arrival'],
        'Rail save retains actual timetable, fare and rider identity.',
      ),
      checkpoint(
        'car-ready',
        'identify',
        'recover',
        ['identified-sedan', 'Milo-health', 'colleague-pose', 'player-inventory'],
        'Owner state restores before the force decision.',
      ),
      checkpoint(
        'wash-ready',
        'recover',
        'wash',
        ['Milo-outcome', 'sedan-pose-health-paint', 'wanted-state', 'wallet'],
        'A restore cannot wash off a police observation; escape remains real.',
      ),
      checkpoint(
        'lockup-ready',
        'wash',
        'deliver',
        ['wash-receipt', 'paint-removed', 'sedan-health', 'wallet'],
        'No second wash debit on Continue.',
      ),
    ],
    failures: [
      failure(
        'sedan-destroyed',
        rule('required-vehicle-destroyed', { vehicle: 'ash-silver-sedan' }),
        'car-ready',
        [line('Victor', 'A plate is not enough. I asked for the car attached to it.')],
      ),
      failure('wrong-car', rule('delivery-attempt-wrong-vehicle'), 'lockup-ready', [
        line(
          'Garage clerk',
          'Wrong registration. I am not signing a different theft into this bay.',
        ),
      ]),
    ],
    choices: [
      {
        id: 'owner-force',
        stage: 'recover',
        options: [
          {
            id: 'unhurt',
            text: 'Take the sedan while leaving Milo unhurt.',
            effects: ['actual unhurt actor condition'],
          },
          {
            id: 'stunned',
            text: 'Counter his grab and leave him alive.',
            effects: ['actual nonlethal actor condition'],
          },
          {
            id: 'dead',
            text: 'Use lethal violence, with witnesses and police consequences.',
            effects: ['actual actor death; no reward bonus'],
          },
        ],
        outcome:
          'Owner outcome and delivered condition independently affect callbacks and later neighborhood testimony.',
      },
    ],
    consequences: [
      'Milo’s lease discrepancy is added to Victor’s false-policy trail.',
      'Original car condition, owner outcome and fare/wash transactions persist.',
    ],
    rewards: { cash: 250, unlocks: ['LL-ST-012', 'rail-travel', 'vehicle-wash'] },
    requiredCapabilities: [
      needs('rail', 'Full station-platform-train-street trip'),
      needs('wash', 'Kiln Row physical wash and paint removal'),
      needs('selectiveForce', 'Owner unhurt/stunned/dead variants'),
      needs('phone', 'Delayed damage-sensitive callback'),
      needs('director', 'Registration, rider, fee and outcome snapshots'),
    ],
  }),

  mission(12, 'High Water Mark', 'LL-CHAR-009', {
    premise:
      'Victor brands Ilan a depot thief. Ilan flees through unfinished flood works carrying proof that workers have been made collateral; Mara decides whether to surrender him or protect his testimony.',
    cast: ['LL-CHAR-001', 'LL-CHAR-009', 'LL-CHAR-045'],
    dependencies: { all: ['LL-ST-011'] },
    sourceBeats: [
      beat(
        'Depot target flees by car to construction site',
        ['order', 'depot', 'road'],
        'Ilan carries workers’ deposit ledger rather than stealing a taxi.',
      ),
      beat(
        'Ladders, construction/crane climb, multiple rooftop jumps and hanging target',
        ['climb', 'roof-route', 'ledge'],
        'A flood-defense frame supplies actual continuous traversal and a rescueable ledge.',
      ),
      beat(
        'Kill/spare branch changes later street encounter',
        ['decision', 'capture', 'safe-passage'],
        'Original capture/protection branches preserve removal versus later witness availability, without copying an execution scene.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contact-scene',
        'quay-meeting',
        'Hear Victor’s claim and ask what Ilan took.',
        [rule('objective-received', { id: 'ilan-recovery-order' })],
        [
          line(
            'Victor',
            'Ilan Vale took a depot ledger. A foolish man imagines a book can negotiate.',
          ),
          line('Mara', 'Why not file a report?'),
          line(
            'Victor',
            'Because the report contains other people’s business. Bring him where he cannot interfere.',
          ),
          line('Mara', 'I will hear his business first.'),
        ],
      ),
      stage(
        'depot',
        'target-discovery',
        'dispatch',
        'Approach the co-op depot and identify Ilan’s blue utility coupe.',
        [rule('target-identified', { actor: 'LL-CHAR-045', vehicle: 'ilan-utility-coupe' })],
        [
          line('Ilan', 'Senn sent you. I copied nothing. Those deposits belong to the drivers.'),
          line('Mara', 'Then stop and tell me.'),
          line('Ilan', 'Everybody says that before they sell the answer.'),
        ],
        {
          staging:
            'Ilan visibly boards and pulls away; pursuit cannot start before an accessible player vehicle is present.',
        },
      ),
      stage(
        'road',
        'vehicle-pursuit',
        'old-quay-works',
        'Follow Ilan to Old Quay Works without destroying his car.',
        [rule('target-arrived', { actor: 'LL-CHAR-045', scene: 'old-quay-works' })],
        [
          line('Mara', 'He is going into the construction frame.'),
          line('Victor', 'It has many exits. Most are a long way down.'),
          line('Mara', 'You sound familiar with them.'),
        ],
        {
          route: {
            from: 'dispatch',
            to: 'old-quay-works',
            solver: 'legal-road',
            targetStopsAt: 'grade loading apron',
            targetNoTeleport: true,
          },
          lostDistance: 240,
          graceSeconds: 25,
        },
      ),
      stage(
        'climb',
        'vertical-pursuit',
        'old-quay-works',
        'Climb the two service ladders and crane access walk after Ilan.',
        [
          rule('traversal-sequence', {
            sequence: ['ladder-grade-to-18', 'ladder-18-to-36', 'crane-walk-to-54'],
          }),
        ],
        [
          line('Ilan', 'The inspector signed this before the ladder was bolted!'),
          line('Mara', 'Then stop making both of us test the signature.'),
          line('Ilan', 'I know where it holds. Keep up if you intend to listen.'),
        ],
        {
          traversal: {
            ladders: [
              { fromZ: 0, toZ: 18 },
              { fromZ: 18, toZ: 36 },
            ],
            craneWalkZ: 54,
            targetWaitsAtSafeBeat:
              'Brief credible hesitation at crane gate; not invulnerable rubber-banding.',
            tutorial: ['continuous-ladder', 'dismount-to-supported-floor'],
          },
        },
      ),
      stage(
        'roof-route',
        'rooftop-pursuit',
        'old-quay-works',
        'Cross the three roof gaps and reach Ilan at the failing parapet.',
        [
          rule('traversal-sequence', {
            sequence: ['roof-gap-one', 'roof-gap-two', 'roof-gap-three'],
          }),
          rule('target-hanging', { actor: 'LL-CHAR-045' }),
        ],
        [
          line('Mara', 'Ilan, the far roof has no rail!'),
          line('Ilan', 'That roof was a shelter plan once.'),
          line('Mara', 'Hold on. I can reach you.'),
        ],
        {
          traversal: {
            roofsZ: [54, 54, 48, 48],
            gapsUnits: [12, 15, 10],
            validLandingVolumesRequired: true,
            fallBelowRoof: 'Actual fall damage/clinic failure; never snap to a mission marker.',
            targetLedgeHang: true,
          },
        },
      ),
      stage(
        'ledge',
        'evidence-dialogue',
        'old-quay-works',
        'Reach Ilan’s handhold and hear what is in the ledger.',
        [rule('dialogue-finished')],
        [
          line(
            'Ilan',
            'He sold our deposits as security for his next contract. If the job fails, he takes our homes.',
          ),
          line('Mara', 'Pass me the ledger.'),
          line('Ilan', 'If you give me back to him, keep a copy. Make him admit we existed.'),
          line('Mara', 'You are not a document. Give me your other hand.'),
        ],
        {
          sceneAction:
            'Mara pulls Ilan onto a supported roof before the decision. No dialogue menu leaves him hanging indefinitely.',
        },
      ),
      stage(
        'decision',
        'branch-choice',
        'old-quay-works',
        'Choose whether to surrender Ilan to the investigators or get him to a safe address.',
        [rule('branch-resolved', { choice: 'ilan-disposition' })],
        [
          line('Ilan', 'The private investigators collect for Senn. They do not investigate him.'),
          line('Mara', 'And if I hide you?'),
          line('Ilan', 'I can trace the bonds he sold. I cannot do it from a cell.'),
        ],
        {
          branches: [
            { choice: 'capture', next: 'capture' },
            { choice: 'safe-passage', next: 'safe-passage' },
          ],
        },
      ),
      stage(
        'capture',
        'custody-escort',
        'old-quay-works',
        'Escort Ilan down the safe stair to the investigator van; retain the ledger copy.',
        [
          rule('custody-transferred', { actor: 'LL-CHAR-045' }),
          rule('evidence-retained', { id: 'workers-deposit-ledger' }),
        ],
        [
          line('Ilan', 'They will call me the thief so they never have to name the owner.'),
          line('Mara', 'Nadia gets the book. They will have to answer her.'),
          line(
            'Investigator',
            'You have completed the recovery. The witness is our responsibility now.',
          ),
          line('Mara', 'That is exactly what worries me.'),
        ],
        {
          enabledWhen: rule('choice-is', { id: 'ilan-disposition', value: 'capture' }),
          next: 'complete',
          onComplete: [
            rule('flag', { id: 'ilan_fate', value: 'detained' }),
            rule('flag', { id: 'ilan_later_street_encounter', value: false }),
          ],
        },
      ),
      stage(
        'safe-passage',
        'witness-escort',
        'dockside-rooms',
        'Escort Ilan off the roof and take him to Nadia’s protected address.',
        [rule('witness-delivered', { actor: 'LL-CHAR-045', protectedAddress: true })],
        [
          line('Mara', 'Nadia knows a room where your name is not the price of admission.'),
          line('Ilan', 'Tell Senn I went over the edge.'),
          line('Mara', 'I will tell him you cannot interfere. He can misunderstand it for once.'),
          line('Nadia', 'Keep the ledger dry. Keep the witness alive. We can work with the rest.'),
        ],
        {
          enabledWhen: rule('choice-is', { id: 'ilan-disposition', value: 'safe-passage' }),
          next: 'complete',
          onComplete: [
            rule('flag', { id: 'ilan_fate', value: 'protected' }),
            rule('flag', { id: 'ilan_later_street_encounter', value: true }),
            rule('queue-street-content', {
              id: 'LL-STREET-ILAN',
              status: 'required-unimplemented',
            }),
          ],
        },
      ),
      stage(
        'complete',
        'phone-report',
        'dispatch',
        'Report the disposition to Victor and secure the workers’ ledger.',
        [
          rule('evidence-secured', { id: 'workers-deposit-ledger' }),
          rule('call-resolved', { topic: 'ilan-report' }),
        ],
        [
          line('Victor', 'He will not be coming back?'),
          line('Mara', 'You will not see him at the depot.'),
          line('Victor', 'Excellent. That is the kind of certainty I buy.'),
          line('Mara', 'Then stop selling everyone else’s.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'construction',
        'road',
        'climb',
        ['Ilan-route', 'cars-parked', 'ledger-carried', 'health-equipment'],
        'Resume at ground before the first ladder, not on an unsupported air point.',
      ),
      checkpoint(
        'roofs',
        'climb',
        'roof-route',
        ['player-crane-walk', 'Ilan-first-roof', 'health', 'ledger'],
        'Both poses require supported geometry validation.',
      ),
      checkpoint(
        'rescued',
        'ledge',
        'decision',
        ['Ilan-on-roof', 'ledger-copy', 'choice-uncommitted', 'health'],
        'Replay may reconsider the choice until one branch is committed; Continue retains a committed branch.',
      ),
    ],
    failures: [
      failure('target-escaped', rule('target-lost', { actor: 'LL-CHAR-045', grace: 25 }), 'start', [
        line('Victor', 'He has a head start and your sympathy. Neither was in the order.'),
      ]),
      failure(
        'ilan-killed',
        rule('protected-actor-dead', { actor: 'LL-CHAR-045' }),
        'construction',
        [line('Mara', 'He was trying to show me the record. Now someone else will write it.')],
      ),
      failure(
        'witness-left',
        rule('escort-abandoned', { actor: 'LL-CHAR-045', grace: 30 }),
        'rescued',
        [line('Ilan', 'You pulled me up to leave me here?')],
      ),
    ],
    choices: [
      {
        id: 'ilan-disposition',
        stage: 'decision',
        options: [
          {
            id: 'capture',
            text: 'Surrender Ilan and retain his evidence.',
            effects: [
              rule('flag', { id: 'ilan_fate', value: 'detained' }),
              rule('disable-street-content', { id: 'LL-STREET-ILAN' }),
            ],
          },
          {
            id: 'safe-passage',
            text: 'Protect Ilan and let him trace the bonds.',
            effects: [
              rule('flag', { id: 'ilan_fate', value: 'protected' }),
              rule('unlock-street-content', { id: 'LL-STREET-ILAN', notImplemented: true }),
            ],
          },
        ],
        outcome:
          'Both have full escort resolutions; later witness availability and testimony differ. This is an original counterpart to the source removal/survival branch, not a claim to reproduce its exact kill option.',
      },
    ],
    consequences: [
      'ilan_fate and later street eligibility must survive the following displacement arc.',
      'Worker deposits provide the concrete reason Nadia challenges Victor.',
    ],
    rewards: {
      cash: 300,
      unlocks: ['LL-ST-013'],
      branchUnlocks: { 'safe-passage': ['LL-STREET-ILAN'] },
    },
    requiredCapabilities: [
      needs('vertical', 'Two ladders/crane/three gaps/ledge rescue'),
      needs('chase', 'Car-to-roof pursuit'),
      needs('arrestBranch', 'Custody versus protected witness escort'),
      needs('director', 'Persistent Ilan branch and future street hook'),
      needs('interior', 'Construction multi-floor collision'),
    ],
  }),

  mission(13, 'Premium Due', 'LL-CHAR-002', {
    premise:
      'Nadia finds that Victor sold the co-op drivers’ identities into demolition permits. Felix wants his signatures back; Mara follows the broker to the waterfront before he can destroy the record.',
    cast: ['LL-CHAR-001', 'LL-CHAR-002', 'LL-CHAR-008', 'LL-CHAR-009'],
    dependencies: { all: ['LL-ST-012'] },
    sourceBeats: [
      beat(
        'Family crisis, bar confrontation and two guards',
        ['records', 'cafe', 'guards'],
        'Identity exploitation replaces the source affair motive.',
      ),
      beat(
        'Antagonist vehicle escape, crashed car, waterfront foot pursuit and consequential death',
        ['road', 'waterfront', 'confront'],
        'Victor tries to burn the ledger and attacks Mara; lethal resistance ends his leverage.',
      ),
      beat(
        'Protagonist reveals past search to cousin after killing',
        ['confession'],
        'Mara explains the falsified evacuation dispatch in wholly original dialogue.',
      ),
    ],
    stages: [
      stage(
        'records',
        'family-scene',
        'dispatch',
        'Read Nadia’s permit comparison with Felix.',
        [
          rule('evidence-compared', {
            ids: ['workers-deposit-ledger', 'false-policy-receipt', 'duplicate-impound-invoices'],
          }),
        ],
        [
          line(
            'Nadia',
            'These demolition crews do not exist. Every signature belongs to one of our drivers.',
          ),
          line('Felix', 'I signed a transport guarantee. Not this.'),
          line('Mara', 'Victor sold people as a list of permissions.'),
          line('Felix', 'Then we get the list back before the permits become a crime scene.'),
        ],
      ),
      stage(
        'cafe',
        'escort-confrontation',
        'quay-meeting',
        'Take Felix to Quay House and confront Victor about the forged worker permits.',
        [rule('dialogue-finished'), rule('actor-fleeing', { actor: 'LL-CHAR-009' })],
        [
          line('Victor', 'You both look uninsurable.'),
          line('Mara', 'Cancel the forged crew permits. Give Nadia the originals.'),
          line(
            'Victor',
            'A driver’s name is worth more on a form than in a cab. I improved your business.',
          ),
          line('Felix', 'You made my drivers liable for buildings they have never seen.'),
          line('Victor', 'Then they had better hope the buildings stay up.'),
        ],
        {
          staging:
            'Victor signals two guards and leaves through a rear door into a waiting coupe; Felix moves into real booth cover.',
        },
      ),
      stage(
        'guards',
        'interior-combat',
        'quay-meeting',
        'Defeat Victor’s two armed guards while protecting Felix and cafe staff.',
        [
          rule('hostiles-neutralized', { actors: ['senn-door-guard', 'senn-booth-guard'] }),
          rule('actor-alive', { actor: 'LL-CHAR-002' }),
        ],
        [
          line('Mara', 'Everyone behind the counter. Felix, stay down.'),
          line('Guard', 'The contract says you leave him alone.'),
          line('Mara', 'Your contract has run out of witnesses.'),
        ],
        {
          encounter: {
            actors: [
              { id: 'senn-door-guard', weapon: 'pistol', cover: 'door return' },
              { id: 'senn-booth-guard', weapon: 'baton', tactics: 'close rush' },
            ],
            civiliansFlee: 'front service gate',
            companionCover: 'booth wall',
          },
        },
      ),
      stage(
        'road',
        'car-pursuit',
        'pier-berth',
        'Collect Felix and follow Victor’s coupe to the Pier Eight seawall.',
        [
          rule('target-stopped', { actor: 'LL-CHAR-009', reason: 'failed-yard-barrier-turn' }),
          rule('player-followed', { grace: 20 }),
        ],
        [
          line('Felix', 'He still has the originals!'),
          line('Mara', 'We follow. Do not shoot out of the window.'),
          line(
            'Victor',
            'There is no case without a record. You should have accepted the improvements.',
          ),
        ],
        {
          route: {
            from: 'quay-meeting',
            to: 'pier-berth',
            solver: 'legal-road',
            targetCrash:
              'Physical collision with a closed cargo barrier at the approved endpoint; no wreck teleported in.',
            targetCanBeStoppedEarlier:
              'Then waterfront confrontation relocates to a validated nearby safe volume with the same evidence/battle.',
          },
        },
      ),
      stage(
        'waterfront',
        'foot-interception',
        'pier-berth',
        'Leave Felix at the car and stop Victor reaching the water with the permit folder.',
        [
          rule('target-intercepted', { actor: 'LL-CHAR-009' }),
          rule('objective-intact', { id: 'forged-permit-originals' }),
        ],
        [
          line('Felix', 'He is running for the ladder!'),
          line('Mara', 'Stay at the car. Call Nadia and tell her we have the folder.'),
          line('Victor', 'Nobody owns what is already under water.'),
        ],
        {
          route: ['damaged coupe', 'cargo fence opening', 'seawall service ladder top'],
          timer: { seconds: 45, fail: 'folder thrown irretrievably into channel' },
        },
      ),
      stage(
        'confront',
        'antagonist-fight',
        'pier-berth',
        'Recover the permit folder and survive Victor’s armed attack.',
        [
          rule('actor-dead', { actor: 'LL-CHAR-009' }),
          rule('evidence-collected', { id: 'forged-permit-originals' }),
        ],
        [
          line('Mara', 'Leave the folder. You can still answer for it.'),
          line('Victor', 'Answer to whom? The office that bought it?'),
          line('Mara', 'The people whose names you stole.'),
          line('Victor', 'Names are replaceable. You are about to find out.'),
        ],
        {
          encounter: {
            actor: 'LL-CHAR-009',
            weapon: 'pistol',
            action:
              'Throws the folder into reachable quay-side cover and draws; actual damaging combat determines death.',
            noExecutionMenu: true,
            lethalStoryOutcome: true,
          },
          aftermath:
            'Mara checks the folder for a burn/soak mark; Felix hears the shot from the car. Original fatal encounter is not optional cosmetic text.',
        },
      ),
      stage(
        'confession',
        'family-aftermath',
        'dispatch',
        'Return with Felix, give Nadia the original permits and explain why Mara recognizes falsified dispatches.',
        [
          rule('passenger-delivered', { actor: 'LL-CHAR-002' }),
          rule('evidence-secured', { id: 'forged-permit-originals' }),
          rule('dialogue-finished'),
        ],
        [
          line('Felix', 'I asked you to drive, Mara. Not become the answer to every threat.'),
          line(
            'Mara',
            'A dispatcher changed a road on the night my convoy left. We trusted the signed sheet.',
          ),
          line('Felix', 'Is that why you came?'),
          line(
            'Mara',
            'Someone in this port bought the dispatch archive. I wanted work while I found out who.',
          ),
          line('Nadia', 'Then we find the buyer without giving them more names to bury.'),
          line('Mara', 'Victor worked for Corvus. He said the office already bought the folder.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'cafe-entry',
        'records',
        'cafe',
        ['Felix', 'evidence-comparison', 'player-vehicle', 'health-ammo'],
        'Restore before guards activate.',
      ),
      checkpoint(
        'chase-ready',
        'guards',
        'road',
        ['Felix-health', 'Victor-moving-coupe', 'player-car', 'health-ammo'],
        'Pursuit routes cannot advance while replay menu is open.',
      ),
      checkpoint(
        'quay',
        'road',
        'waterfront',
        ['Victor-foot-start', 'Felix-safe-car', 'folder', 'timer', 'health-ammo'],
        'Folder timer begins only when the player regains control.',
      ),
    ],
    failures: [
      failure(
        'felix-harmed',
        rule('protected-actor-dead', { actor: 'LL-CHAR-002' }),
        'cafe-entry',
        [line('Mara', 'Felix! I brought you here. Stay with me.')],
      ),
      failure(
        'victor-escaped',
        rule('target-lost', { actor: 'LL-CHAR-009', grace: 20 }),
        'chase-ready',
        [line('Nadia', 'He can forge copies all night if we never get the originals.')],
      ),
      failure(
        'permits-lost',
        rule('objective-destroyed', { id: 'forged-permit-originals' }),
        'quay',
        [line('Mara', 'The names are gone. We need to get there before he reaches the ladder.')],
      ),
    ],
    choices: [
      {
        id: 'confession-depth',
        stage: 'confession',
        options: [
          {
            id: 'name-convoy',
            text: 'Tell Felix the convoy’s date and dispatch office.',
            effects: [rule('flag', { id: 'felix-knows-convoy', value: true })],
          },
          {
            id: 'keep-date-private',
            text: 'Explain the falsification while keeping the date private.',
            effects: [rule('flag', { id: 'felix-knows-convoy', value: false })],
          },
        ],
        outcome:
          'Felix knows Mara’s purpose in both; later search dialogue differs. Victor’s fatal battle and Corvus retaliation remain.',
      },
    ],
    consequences: [
      'Victor is dead; his employer escalates the coercion. Quay House staff remember the violence.',
      'The original evacuation question becomes explicit and persists into both eventual ending routes.',
    ],
    rewards: {
      cash: 0,
      unlocks: ['LL-ST-014'],
      flags: ['victor-dead', 'mara-past-search-revealed'],
    },
    requiredCapabilities: [
      needs('interior', 'Cafe battle and civilian escape'),
      needs('chase', 'Coupe/crash/foot interception'),
      needs('passengers', 'Felix protected through combat and return'),
      needs('props', 'Folder timer and custody'),
      needs('cinematic', 'Consequential death/family aftermath'),
      needs('director', 'Fatal story state and source arc handoff'),
    ],
  }),

  mission(14, 'Borrowed Authority', 'LL-CHAR-010', {
    premise:
      'Bran Corvus abducts Mara and Felix over Victor’s death. His violent coercion ends with a demand: steal a patrol car and find a relief crate hidden among three moving vans.',
    cast: [
      'LL-CHAR-001',
      'LL-CHAR-002',
      'LL-CHAR-004',
      'LL-CHAR-010',
      'LL-ARC-SEDGE',
      'LL-CHAR-048',
    ],
    dependencies: { all: ['LL-ST-013'] },
    sourceBeats: [
      beat(
        'Abduction, bound cousins, employer kills subordinate and wounds cousin',
        ['abduction', 'coercion'],
        'A contractor basement makes Bran’s unpredictability physically consequential.',
      ),
      beat(
        'Acquire police car, siren-stop three candidate vans, inspect cargo before shooting; correct van guarded',
        ['patrol', 'stops', 'crate'],
        'A relief equipment crate replaces televisions; first inspected van is never correct.',
      ),
      beat(
        'Deliver stolen van and hear cousin recovery call',
        ['deliver', 'recovery'],
        'Silas mediates injury and secures Bran’s new worker.',
      ),
    ],
    stages: [
      stage(
        'abduction',
        'scripted-scene',
        'saltgate-estate',
        'Attend the requested settlement meeting with Felix; survive the abduction scene.',
        [rule('scene-resolved', { id: 'corvus-abduction' })],
        [
          line('Felix', 'The message says someone can cancel the forged permits.'),
          line('Mara', 'Who sent it?'),
          line('Felix', 'Corvus’s office. They already know where we park.'),
          line('Cora', 'Hands visible. Your settlement is downstairs.'),
          line('Mara', 'That word is doing a lot of work.'),
        ],
        {
          staging:
            'Named contractor crew surround the meeting bay, confiscate carried weapons into a recoverable locker and bind both cousins; skip must produce the same actor/inventory state, no hidden player-health cheat.',
          weaponsReturn: 'Exit locker restores owned inventory exactly once.',
        },
      ),
      stage(
        'coercion',
        'scripted-scene',
        'saltgate-estate',
        'Hear Bran’s demand and Silas’s conditions for Felix’s treatment.',
        [rule('dialogue-finished'), rule('inventory-returned-from-locker')],
        [
          line(
            'Cora',
            'Senn used your permits to collateralize the drivers. They brought the originals.',
          ),
          line('Bran', 'You were paid to guard my name, not explain theirs.'),
          line('Silas', 'Bran. Put it down. Cora is on your payroll.'),
          line('Bran', 'Then she should have known what her advice cost.'),
          line('Felix', 'We did not know who bought the forms!'),
          line('Bran', 'You know now.'),
          line(
            'Silas',
            'Mara, there are three relief vans crossing the basin. One has our control crate. Bring it here. I will keep Felix alive.',
          ),
          line('Mara', 'If he dies, you will need a different kind of contractor.'),
        ],
        {
          sceneAction:
            'Bran shoots Cora fatally, then shoots Felix’s shoulder when he intervenes. Silas stops the assault and opens Mara’s restraint; the medical actor applies an actual injury state to Felix.',
          treatment:
            'Felix is a scene-local wounded protected actor; recovery is a saved storyline event, not a player clinic teleport.',
        },
      ),
      stage(
        'patrol',
        'police-vehicle-acquisition',
        'impound-counter',
        'Take the unattended patrol car at the annex after its officer responds to a real call.',
        [rule('vehicle-boarded', { vehicle: 'annex-patrol', role: 'police' })],
        [
          line('Silas', 'Use the siren, not the gun. Van drivers understand a uniformed car.'),
          line('Mara', 'And real patrol?'),
          line('Silas', 'They understand theft. Do not let them watch you take it.'),
        ],
        {
          staging:
            'Officer exits at an authored dispatch event and follows a walkable response route; car remains theft-witnessable. Alternative real police car allowed after identity check.',
          tutorial: ['police-siren', 'traffic-stop-command'],
        },
      ),
      stage(
        'stops',
        'traffic-stop-inspection',
        'dry-basin-yard',
        'Use the siren to pull over candidate vans; inspect their cargo before deciding which to take.',
        [rule('cargo-identified', { id: 'corvus-control-crate', validInspection: true })],
        [
          line('Driver', 'Is this about the manifest? The depot said the route was cleared.'),
          line('Mara', 'Stop at the curb and open the cargo doors.'),
          line('Empty driver', 'Filters. Six pallets of filters. Check the seal and let me go.'),
          line('Mara', 'The seal matches. Leave when I return to the car.'),
          line(
            'Crate driver',
            'That case belongs to Cobalt Freight. You are not the patrol we paid for.',
          ),
        ],
        {
          candidates: [
            {
              id: 'relief-van-a',
              cargoRole: 'filters',
              routeScenes: ['manifest-yard', 'dry-basin-yard'],
            },
            {
              id: 'relief-van-b',
              cargoRole: 'pumps-or-control-crate',
              routeScenes: ['dry-basin-yard', 'coldstore-front'],
            },
            {
              id: 'relief-van-c',
              cargoRole: 'pumps-or-control-crate',
              routeScenes: ['coldstore-front', 'manifest-yard'],
            },
          ],
          selection:
            'First actual inspected van is empty; a saved seeded second/third selection holds the correct crate. Inspection changes no NPC identity on release.',
          clock: {
            seconds: 420,
            startsOn: 'first-siren-stop',
            stopWhileGamePaused: true,
            tuning: 'Original deadline; requires natural route validation.',
          },
          stopRules: {
            sirenRange: 65,
            playerBehindTarget: true,
            targetCurbDeceleration: true,
            playerExitAfterStop: true,
            driverAndGuardVisible: true,
          },
        },
      ),
      stage(
        'crate',
        'guarded-van-theft',
        'dry-basin-yard',
        'Survive the crate van’s armed guard, then take the inspected van with its cargo intact.',
        [
          rule('guard-neutralized', { id: 'crate-van-guard' }),
          rule('vehicle-boarded', { vehicle: 'identified-crate-van' }),
          rule('cargo-intact', { id: 'corvus-control-crate' }),
        ],
        [
          line('Guard', 'Cobalt bought this cargo and the police route with it.'),
          line('Mara', 'Then your invoice can explain why you are pointing that at me.'),
          line('Silas', 'Take the van. Do not open the case.'),
        ],
        {
          encounter: {
            id: 'crate-van-guard',
            weapon: 'pistol',
            startsOnlyAfter: 'completed cargo inspection',
            driverCanSurrender: true,
          },
          sourceFailureCounterpart:
            'Attacking a candidate driver/guard before cargo inspection fails the identification job, even if it happens to be the right van.',
        },
      ),
      stage(
        'deliver',
        'cargo-delivery',
        'vector-lockup',
        'Lose any active wanted search and deliver the crate van to the designated lockup.',
        [
          rule('wanted-zero'),
          rule('vehicle-delivered', { vehicle: 'identified-crate-van' }),
          rule('cargo-secured', { id: 'corvus-control-crate' }),
        ],
        [
          line('Mara', 'The van is inside. How is Felix?'),
          line('Silas', 'The shoulder wound is clean. The fear is more difficult to invoice.'),
          line('Mara', 'Do not invoice either to him.'),
          line('Silas', 'I will talk to Bran. You have made yourself useful.'),
        ],
      ),
      stage(
        'recovery',
        'phone-aftermath',
        'dispatch',
        'Speak to Felix after his release and register Bran’s contact.',
        [rule('call-resolved', { topic: 'Felix-recovery' })],
        [
          line('Felix', 'They gave me a sling and a form promising not to discuss the sling.'),
          line('Mara', 'Did you sign it?'),
          line('Felix', 'Nadia signed the discharge. She took the other form away.'),
          line('Mara', 'Good. Stay with her.'),
          line('Felix', 'Silas said you have work now. That is how they said it. Work.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'released',
        'coercion',
        'patrol',
        ['Felix-injury', 'Cora-dead', 'owned-inventory-return', 'wallet', 'van-selection-seed'],
        'Cutscene skip/retry must never duplicate confiscated weapons.',
      ),
      checkpoint(
        'patrol-ready',
        'patrol',
        'stops',
        [
          'patrol-identity-pose',
          'three-van-routes-cargo',
          'inspection-history',
          'deadline',
          'wanted',
        ],
        'Cargo identity and first-empty constraint persist across Continue.',
      ),
      checkpoint(
        'identified',
        'stops',
        'crate',
        ['correct-van-curb-pose', 'cargo-inspection', 'guard-pose', 'deadline', 'health-ammo'],
        'Guard never fires before control returns and inspection is recorded.',
      ),
    ],
    failures: [
      failure('uninspected-attack', rule('candidate-harmed-before-inspection'), 'patrol-ready', [
        line(
          'Silas',
          'You have attacked a relief driver without even knowing which case he carries.',
        ),
      ]),
      failure(
        'shipment-expired',
        rule('candidate-cargo-reached-unrecoverable-destination-or-clock-expired'),
        'patrol-ready',
        [line('Silas', 'The case has crossed into bonded custody. Bran will not enjoy the delay.')],
      ),
      failure('cargo-van-lost', rule('required-cargo-vehicle-destroyed'), 'identified', [
        line('Mara', 'The case is burning. We need another approach before I take the van.'),
      ]),
    ],
    choices: [
      {
        id: 'empty-driver-treatment',
        stage: 'stops',
        options: [
          {
            id: 'explain',
            text: 'Release inspected empty vans with an explanation.',
            effects: [rule('flag', { id: 'relief-drivers-warned', value: true })],
          },
          {
            id: 'silent-release',
            text: 'Return to the patrol car without naming Bran.',
            effects: [rule('flag', { id: 'relief-drivers-warned', value: false })],
          },
        ],
        outcome:
          'Candidate inspection order is player-driven; released drivers resume their same routes and identities.',
      },
    ],
    consequences: [
      'Bran’s violence, Cora’s death and Felix’s injury are persistent.',
      'Mara now holds a contractor contact under coercion; Cobalt Freight sees an apparent police theft.',
    ],
    rewards: {
      cash: 400,
      unlocks: ['LL-ST-015'],
      flags: ['Felix-shoulder-injury', 'Corvus-coercion'],
    },
    requiredCapabilities: [
      needs('cinematic', 'Abduction/restraint/shooting/skip state'),
      needs('impersonation', 'Siren stops, curb compliance and cargo checks'),
      needs('chase', 'Three simultaneous named van routes'),
      needs('props', 'Crate and confiscation locker'),
      needs('director', 'First-empty selection and injured Felix recovery'),
      needs('police', 'Legitimate theft/witness heat'),
    ],
  }),

  mission(15, 'Safety Margin', 'LL-CHAR-010', {
    premise:
      'Bran demands a warehouse debtor’s death. Silas instead directs controlled intimidation, revealing his preference for recoverable assets while Mara buys the compact weapon he recommends.',
    cast: [
      'LL-CHAR-001',
      'LL-CHAR-004',
      'LL-CHAR-010',
      'LL-ARC-ARVEN',
      'LL-ARC-CELI',
      'LL-ARC-ORIN',
    ],
    dependencies: { all: ['LL-ST-014'] },
    sourceBeats: [
      beat(
        'Unstable patron demands killing; companion argues for restraint',
        ['order', 'drive'],
        'The disputed warehouse holds safety equipment rather than a copied adult-business scene.',
      ),
      beat(
        'Aim at debtors and selectively wound one resistant actor without killing',
        ['aim', 'selective-shot', 'release'],
        'Verified aim ray and leg injury are real mechanics, not a choice label.',
      ),
      beat(
        'Companion takes player to gun shop for compact automatic weapon, then home',
        ['shop', 'return'],
        'Actual shop transaction, original weapon, funded receipt and persistence.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contractor-scene',
        'saltgate-estate',
        'Hear Bran’s warehouse order and leave with Silas.',
        [rule('companion-collected', { actor: 'LL-CHAR-004' })],
        [
          line('Bran', 'The warehouse has paid Cobalt instead of me. Close it.'),
          line('Mara', 'Close the account or the building?'),
          line('Bran', 'Whichever keeps them from making the mistake again.'),
          line('Silas', 'We can collect without removing everyone who can pay.'),
          line('Bran', 'Then make your lesson memorable.'),
        ],
      ),
      stage(
        'drive',
        'companion-drive',
        'vector-lockup',
        'Take Silas to the warehouse safety-equipment counter.',
        [rule('companion-at-scene', { actor: 'LL-CHAR-004', scene: 'vector-lockup' })],
        [
          line(
            'Silas',
            'Bran confuses fear with agreement. Fear stops working when it has nothing left to lose.',
          ),
          line('Mara', 'You waited to explain that until we were outside.'),
          line('Silas', 'It works better without his interruption.'),
        ],
      ),
      stage(
        'aim',
        'aim-intimidation',
        'vector-lockup',
        'Keep your weapon trained on the foreman until he presents the safety-tender ledger; keep the clerk alive.',
        [
          rule('aim-held', { actor: 'warehouse-foreman', rayVisible: true, seconds: 3 }),
          rule('ledger-presented', { id: 'safety-tender-ledger' }),
        ],
        [
          line('Arven', 'We paid the route office. Cobalt said Corvus lost the tender.'),
          line('Silas', 'Open your book. We will settle the difference.'),
          line(
            'Mara',
            'Hands where I can see them. Nobody behind the counter moves toward a weapon.',
          ),
          line('Celi', 'The book is in the drawer. I can open it slowly.'),
        ],
        {
          encounter: {
            castBindings: {
              'warehouse-foreman': 'LL-ARC-ARVEN',
              'warehouse-clerk': 'LL-ARC-CELI',
              'warehouse-enforcer': 'LL-ARC-ORIN',
            },
            civilians: ['warehouse-clerk', 'warehouse-loader'],
            resistantActor: 'warehouse-enforcer',
            aimTargets: ['warehouse-foreman', 'warehouse-enforcer', 'warehouse-loader'],
            noArbitraryFearTickWithoutAim: true,
          },
        },
      ),
      stage(
        'selective-shot',
        'localized-injury',
        'vector-lockup',
        'Stop the armed enforcer with a controlled leg shot; do not kill him or the staff.',
        [
          rule('localized-injury', { actor: 'warehouse-enforcer', hitRegion: 'leg', alive: true }),
          rule('hostile-disarmed', { actor: 'warehouse-enforcer' }),
        ],
        [
          line('Orin', 'You do not take that ledger out of here.'),
          line('Silas', 'The leg, Mara. We need the answer alive.'),
          line('Mara', 'Put it down. You have seen what I am aiming at.'),
          line('Orin', 'All right! Keep it away from me!'),
        ],
        {
          hitVolumes: {
            leg: 'Distinct live limb region, generous readable target assistance for all controls',
            torso: 'Normal physical damage; killing fails',
            environment: 'May fire a warning shot but it does not count as the localized injury',
          },
          afterHit:
            'Visible drop of weapon, injured kneel and clinic assistance call; no invulnerable leg-health fiction.',
        },
      ),
      stage(
        'release',
        'ledger-resolution',
        'vector-lockup',
        'Collect the ledger copy, arrange medical help and release the warehouse staff.',
        [
          rule('evidence-collected', { id: 'safety-tender-ledger' }),
          rule('injured-actor-care-arranged'),
          rule('civilians-released'),
        ],
        [
          line('Arven', 'You have the book. We can pay one of you, not both.'),
          line('Mara', 'The city has already paid for every mask in this room.'),
          line('Silas', 'The right to deliver them is separate.'),
          line('Mara', 'That is a convenient separation.'),
          line('Silas', 'Convenience is most of my job.'),
        ],
      ),
      stage(
        'shop',
        'escorted-purchase',
        'rook-store',
        'Go with Silas to Rook and purchase or equip the approved compact SMG.',
        [
          rule('owned-equipped-weapon-role', { role: 'compact-smg' }),
          rule('story-purchase-receipt', { id: 'Silas-equipment-advance' }),
        ],
        [
          line('Silas', 'Bran has financed your equipment. A compact automatic, not a siege.'),
          line(
            'Shopkeeper',
            'Here is the Wren. Price is on the card. Ammunition is a separate receipt.',
          ),
          line('Mara', 'Put the payer on it too.'),
          line('Silas', 'You do like records.'),
          line('Mara', 'I like to know who claims to own my hands.'),
        ],
        {
          service: {
            itemRole: 'compact-smg',
            allowance:
              'Exact displayed item price credited as a one-use employer equipment voucher',
            ifAlreadyOwned: 'Equip existing weapon; convert no unused allowance into cash.',
            ammunition:
              'One displayed basic pack included and recorded; further packs ordinary purchases.',
          },
        },
      ),
      stage(
        'return',
        'companion-report',
        'saltgate-estate',
        'Return Silas to Bran and report the warehouse resolution.',
        [rule('passenger-delivered', { actor: 'LL-CHAR-004' }), rule('dialogue-finished')],
        [
          line('Bran', 'Is the warehouse closed?'),
          line(
            'Silas',
            'The payment is coming. Their foreman has understood the margin for error.',
          ),
          line(
            'Mara',
            'The staff are alive. They will need a route that does not change owners every morning.',
          ),
          line('Bran', 'You concern yourself with the wrong part of a contract.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'warehouse',
        'drive',
        'aim',
        ['Silas-pose', 'staff-health', 'enforcer-weapon', 'player-ammo', 'wallet'],
        'Aim must be reacquired after resume; no unseen completion tick.',
      ),
      checkpoint(
        'shot-ready',
        'aim',
        'selective-shot',
        ['foreman-compliance', 'clerk-safe', 'enforcer-hit-volumes', 'ledger', 'ammo-health'],
        'Restores before lethal failure; region/hit feedback must remain readable.',
      ),
      checkpoint(
        'store-ready',
        'release',
        'shop',
        ['witnesses-released', 'enforcer-injury-care', 'ledger-copy', 'one-use-voucher'],
        'Continue and owned weapons cannot double the employer allowance.',
      ),
    ],
    failures: [
      failure(
        'wrong-victim',
        rule('protected-actor-dead', {
          actors: [
            'warehouse-foreman',
            'warehouse-clerk',
            'warehouse-loader',
            'warehouse-enforcer',
          ],
        }),
        'warehouse',
        [line('Silas', 'We needed a payment and an explanation. Dead staff give us neither.')],
      ),
      failure(
        'silas-lost',
        rule('companion-dead-or-abandoned', { actor: 'LL-CHAR-004', grace: 30 }),
        'warehouse',
        [line('Silas', 'We are supposed to be negotiating together. Where are you?')],
      ),
    ],
    choices: [
      {
        id: 'medical-cost',
        stage: 'release',
        options: [
          {
            id: 'employer',
            text: 'Charge medical transport to Bran’s tender account.',
            effects: [rule('flag', { id: 'warehouse-medical-payer', value: 'Corvus' })],
          },
          {
            id: 'personal',
            text: 'Pay the disclosed transport cost yourself.',
            effects: [
              rule('pay', { amount: 40 }),
              rule('flag', { id: 'warehouse-medical-payer', value: 'Mara' }),
            ],
          },
        ],
        outcome:
          'Medical help arrives in both; personal choice appears only with sufficient cash and is never a hidden success gate.',
      },
    ],
    consequences: [
      'Silas’s asset-preservation motive is visible before his betrayal.',
      'Safety tender evidence, wounded enforcer and compact SMG receipt persist.',
    ],
    rewards: { cash: 450, unlocks: ['LL-ST-016', 'compact-smg-role'] },
    requiredCapabilities: [
      needs('selectiveForce', 'Real aim intimidation and nonfatal leg hit region'),
      needs('passengers', 'Silas escorted shop trip'),
      needs('firearms', 'Compact weapon role/shop transaction'),
      needs('director', 'Voucher, care and evidence'),
      needs('interior', 'Warehouse counter and visible staff'),
    ],
  }),

  mission(16, 'Last Platform', 'LL-CHAR-010', {
    premise:
      'Bran blames Marek Cobalt for leaking a cargo schedule. Silas warns that attacking him will start a freight war; Mara meets an armed courier on the upper rail platform.',
    cast: ['LL-CHAR-001', 'LL-CHAR-004', 'LL-CHAR-010', 'LL-CHAR-049', 'LL-CHAR-048'],
    dependencies: { all: ['LL-ST-015'] },
    sourceBeats: [
      beat(
        'Patron accuses rival’s son; adviser objects; rail-platform target and guard',
        ['order', 'station', 'platform'],
        'A freight heir is blamed for the falsified control-crate schedule.',
      ),
      beat(
        'Target can be killed on platform or flee across tracks to car, requiring chase',
        ['platform', 'tracks', 'car', 'aftermath'],
        'Both battle routes have real geometry and distinct dialogue; no immediate win after a waypoint.',
      ),
      beat(
        'Retaliation and wider contact unlock',
        ['aftermath'],
        'Cobalt feud and Public Terminal LL-ST-022 unlock remain in the graph.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contractor-scene',
        'saltgate-estate',
        'Hear Bran’s accusation and Silas’s warning.',
        [rule('dialogue-finished')],
        [
          line(
            'Bran',
            'Marek sold the control-crate schedule. Cobalt’s son thinks a surname makes him untouchable.',
          ),
          line(
            'Silas',
            'We do not know who altered the schedule. Killing the courier closes the question, not the leak.',
          ),
          line('Bran', 'Then leave the question with me.'),
          line('Mara', 'If he has the schedule, I will get it.'),
          line('Bran', 'And make sure he does not sell another.'),
        ],
      ),
      stage(
        'station',
        'station-access',
        'brigid-station',
        'Reach Brigid Market’s upper platform and identify Marek and his escort.',
        [
          rule('scene-volume-reached', { volume: 'upper-platform', z: 22 }),
          rule('actor-identified', { actor: 'LL-CHAR-049' }),
        ],
        [
          line('Marek', 'You are the driver who wore a police car to take our crate.'),
          line('Mara', 'Show me the cargo schedule.'),
          line('Marek', 'Ask the man who gave you the car.'),
        ],
        {
          traversal:
            'Actual stair/elevator to upper platform; passenger crowd evacuates through marked access.',
          targets: [
            { id: 'LL-CHAR-049', clue: 'Cobalt cargo case' },
            { id: 'marek-escort', clue: 'freight guard insignia' },
          ],
        },
      ),
      stage(
        'platform',
        'platform-combat',
        'brigid-station',
        'Survive the escort’s attack and stop Marek before he escapes with the schedule.',
        [
          rule('guard-neutralized', { id: 'marek-escort' }),
          rule('branch-outcome-recorded', { values: ['Marek-stopped-on-platform', 'Marek-fled'] }),
        ],
        [
          line('Escort', 'Nobody takes the case. Clear the platform.'),
          line('Mara', 'Everybody off the edge!'),
          line('Marek', 'Bran is burning his own evidence. Tell him that if you live.'),
        ],
        {
          encounter: {
            guardWeapon: 'compact-smg',
            targetWeapon: 'pistol',
            targetRunsAfter: 'guard draws or initial damage',
            targetCanBeKilledHere: true,
            civilians:
              'Real crowd flight, protected by normal collision/cover, not invisible despawn.',
          },
          branches: [
            {
              when: rule('actor-dead', { actor: 'LL-CHAR-049' }),
              next: 'aftermath',
              collect: 'cargo-schedule',
              effects: [rule('flag', { id: 'Marek-fled', value: false })],
            },
            {
              when: rule('actor-reached', { actor: 'LL-CHAR-049', volume: 'service-footbridge' }),
              next: 'tracks',
              effects: [rule('flag', { id: 'Marek-fled', value: true })],
            },
          ],
        },
      ),
      stage(
        'tracks',
        'track-pursuit',
        'brigid-station',
        'Cross by the service footbridge and follow Marek down the far station exit.',
        [rule('player-reached', { volume: 'far-street-exit' })],
        [
          line('Mara', 'Marek, leave the case!'),
          line('Marek', 'You need to learn which way these trains run!'),
        ],
        {
          enabledWhen: rule('flag-is', { id: 'Marek-fled', value: true }),
          traversal: {
            sourceCounterpart: 'Dangerous track crossing escape',
            originalRoute:
              'An operational service crossing/footbridge with actual trains underneath; exposed rail shortcut remains physically dangerous.',
            noAutomaticTrainFreeze: true,
            targetVehicle: 'Cobalt-station-sedan',
          },
        },
      ),
      stage(
        'car',
        'target-car-chase',
        'brigid-station',
        'Take an available vehicle and stop Marek’s sedan before it enters Cobalt’s secured yard.',
        [
          rule('actor-dead', { actor: 'LL-CHAR-049' }),
          rule('evidence-collected', { id: 'cargo-schedule' }),
        ],
        [
          line('Silas', 'Mara, do you still have a choice?'),
          line('Mara', 'He opened fire. He is heading for a freight gate.'),
          line('Silas', 'Then Bran has already made the choice expensive.'),
        ],
        {
          enabledWhen: rule('flag-is', { id: 'Marek-fled', value: true }),
          chase: {
            from: 'brigid-station',
            to: 'bellhaven-lot',
            terminal: 'Cobalt security road',
            routeSolver: 'legal-road',
            canDisableCar: true,
            dismountedFinalResistance: 'Marek takes actual cover and continues armed combat.',
            lossGrace: 25,
          },
        },
      ),
      stage(
        'aftermath',
        'phone-evidence',
        'dispatch',
        'Recover Marek’s schedule and hear the fallout from Bran and Silas.',
        [
          rule('evidence-secured', { id: 'cargo-schedule' }),
          rule('call-resolved', { topic: 'Cobalt-retaliation' }),
        ],
        [
          line('Bran', 'My port has become quieter.'),
          line('Mara', 'His schedule was changed after he signed it.'),
          line('Bran', 'Then he should have read it again.'),
          line(
            'Silas',
            'Idris Cobalt will not read it that way. Be careful who offers to repair this.',
          ),
          line(
            'Felix',
            'Nadia found a public terminal that can read the document stamps. Meet her when you can.',
          ),
        ],
        {
          onComplete: [
            rule('unlock', { ids: ['LL-ST-017', 'LL-ST-022'] }),
            rule('flag', { id: 'cobalt-feud', value: true }),
          ],
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'platform-ready',
        'station',
        'platform',
        ['Marek', 'escort', 'civilian-routes', 'train-timetable', 'player-health-ammo'],
        'Crowd/rail traffic remain deterministic and supported, not cleared from the scene.',
      ),
      checkpoint(
        'street-chase',
        'tracks',
        'car',
        ['Marek-sedan', 'player-vehicle-options', 'schedule', 'target-route'],
        'Only exists if target genuinely fled the platform.',
      ),
    ],
    failures: [
      failure(
        'target-escaped',
        rule('target-reached-secured-destination-or-lost', { actor: 'LL-CHAR-049', grace: 25 }),
        'street-chase',
        [line('Bran', 'He is behind Cobalt’s gates. Do not ask me to call them for you.')],
      ),
      failure(
        'schedule-lost',
        rule('objective-destroyed', { id: 'cargo-schedule' }),
        'platform-ready',
        [line('Mara', 'Without the schedule, this is only Bran’s accusation and another body.')],
      ),
    ],
    choices: [
      {
        id: 'combat-route',
        stage: 'platform',
        options: [
          {
            id: 'platform-stop',
            text: 'Stop Marek during the platform fight.',
            effects: [rule('flag', { id: 'marek-battle-route', value: 'platform' })],
          },
          {
            id: 'pursuit-stop',
            text: 'Follow his rail/street escape and stop him later.',
            effects: [rule('flag', { id: 'marek-battle-route', value: 'pursuit' })],
          },
        ],
        outcome:
          'Emergent combat branches; player actions, not a menu, select them. Both recover the schedule and cause the freight feud.',
      },
    ],
    consequences: [
      'Marek’s death escalates the conflict with Idris Cobalt.',
      'Public Terminal is a separate full mission LL-ST-022, required before Pressure Vessel; it is not folded into an email popup here.',
    ],
    rewards: {
      cash: 600,
      unlocks: ['LL-ST-017', 'LL-ST-022'],
      flags: ['cobalt-feud', 'marek-dead'],
    },
    requiredCapabilities: [
      needs('rail', 'Real platform/track traffic and station exit'),
      needs('vertical', 'Upper platform stair/service crossing'),
      needs('chase', 'Target foot-to-sedan alternative'),
      needs('firearms', 'Crowded station fight'),
      needs('director', 'Emergent route and outside-pack unlock'),
      needs('phone', 'Evidence/retaliation calls'),
    ],
  }),

  mission(17, 'Chain Reaction', 'LL-CHAR-010', {
    premise:
      'Rhea Corvus has hired Ansel, a biker courier, to disclose unsafe floodgate schedules. Bran calls it a code theft and orders Mara to stop him before the riders meet.',
    cast: ['LL-CHAR-001', 'LL-CHAR-010', 'LL-ARC-RHEA', 'LL-ARC-ANSEL'],
    dependencies: { all: ['LL-ST-016'] },
    sourceBeats: [
      beat(
        'Patron’s family dispute and biker target',
        ['order', 'meet'],
        'Adult engineer niece defies contractor control over safety testimony; no copied romance/daughter scene.',
      ),
      beat(
        'Motorcycle target chase with rider reinforcements then park firefight',
        ['ride', 'riders', 'lot', 'report'],
        'Actual two-wheel pursuit, three reinforcing riders and a dismounted terminal battle.',
      ),
    ],
    stages: [
      stage(
        'order',
        'contractor-scene',
        'saltgate-estate',
        'Hear Bran’s claim about stolen floodgate access schedules.',
        [rule('objective-received', { id: 'gate-schedule-recovery' })],
        [
          line('Bran', 'My niece handed access schedules to a courier with a club patch.'),
          line('Mara', 'Why would your engineer do that?'),
          line('Bran', 'Because she mistakes a family name for permission to embarrass it.'),
          line('Mara', 'You hired her to certify the gates.'),
          line('Bran', 'I hired her to certify them open.'),
        ],
      ),
      stage(
        'meet',
        'courier-confrontation',
        'brigid-station',
        'Find Rhea and Ansel at the service-road meeting point.',
        [rule('target-fleeing', { actor: 'LL-ARC-ANSEL' }), rule('schedule-transfer-seen')],
        [
          line('Rhea', 'The opening sequence is unsafe. He changed the pressure limits.'),
          line('Mara', 'Then send the test record, not just the keys.'),
          line('Ansel', 'It is on this drive. Three people get a copy before anyone burns it.'),
          line('Bran on phone', 'Stop the rider, Mara. You were not hired to hold a hearing.'),
          line('Rhea', 'If you stop him, read it first.'),
        ],
        {
          staging:
            'Ansel mounts and accelerates a visible motorcycle; a second functional bike is parked with a spoken offer from Rhea.',
          protect: ['LL-ARC-RHEA'],
        },
      ),
      stage(
        'ride',
        'motorcycle-pursuit',
        'bellhaven-lot',
        'Mount the available motorcycle and follow Ansel toward Bellhaven Gantry Park.',
        [
          rule('mounted-pursuit-route', {
            target: 'LL-ARC-ANSEL',
            playerVehicleRole: 'motorcycle',
            minimumRouteLegs: 2,
          }),
        ],
        [
          line('Mara', 'Ansel, let me see the pressure test!'),
          line('Ansel', 'Corvus sees documents by setting fire to them. Keep your distance!'),
        ],
        {
          vehicle: {
            role: 'motorcycle',
            mechanics: ['lean-steering', 'braking', 'rider-fall', 'remount'],
          },
          route: {
            from: 'brigid-station',
            to: 'bellhaven-lot',
            via: 'two Bellhaven public road segments',
            targetSpeed: 'Fast but corners and traffic constrain it.',
            lossDistance: 270,
            graceSeconds: 25,
          },
        },
      ),
      stage(
        'riders',
        'moving-reinforcement',
        'bellhaven-lot',
        'Stay with Ansel as three riders join him; avoid the public promenade.',
        [
          rule('reinforcement-arrival-recorded', { count: 3 }),
          rule('target-at-terminal-lot', { actor: 'LL-ARC-ANSEL' }),
        ],
        [
          line('Rider', 'That is Corvus’s driver. Take him to the stalls.'),
          line('Mara', 'You are putting the whole park between him and a gun.'),
          line('Ansel', 'Then leave the gun outside it.'),
        ],
        {
          encounter: {
            mountedActors: ['gantry-rider-one', 'gantry-rider-two', 'gantry-rider-three'],
            joinTriggers: ['crossing one', 'repair-stall approach'],
            targetAdaptsToBlockedRoad: true,
            playerCanBrakeAndRecover: true,
          },
        },
      ),
      stage(
        'lot',
        'biker-firefight',
        'bellhaven-lot',
        'Survive the riders’ ambush, stop Ansel’s armed resistance and recover the drive.',
        [
          rule('hostiles-neutralized', {
            actors: ['gantry-rider-one', 'gantry-rider-two', 'gantry-rider-three', 'LL-ARC-ANSEL'],
          }),
          rule('evidence-collected', { id: 'gate-pressure-drive' }),
        ],
        [
          line('Mara', 'Do not shoot. Rhea sent this for a reason.'),
          line('Rider', 'He ordered Marek dead and sent you for the next name.'),
          line('Ansel', 'Get behind the stall!'),
          line('Mara', 'The drive stays out of this. Leave it on the bench.'),
        ],
        {
          encounter: {
            dismounts: 'Actual braking/parking and transition into repair-stall cover',
            weapons: ['pistol', 'compact-smg', 'pistol', 'pistol'],
            targetOutcome: 'Ansel dies in armed resistance; civilian Rhea is not a hidden target.',
            cover: ['repair stall masonry', 'gantry footings', 'parked bikes'],
            civiliansExit: 'promenade away from stalls',
          },
        },
      ),
      stage(
        'report',
        'evidence-report',
        'saltgate-estate',
        'Retain a copy of the unsafe pressure test and return the recovered schedule drive to Bran.',
        [
          rule('evidence-copied', { id: 'gate-pressure-drive' }),
          rule('objective-delivered', { id: 'gate-schedule-drive' }),
        ],
        [
          line('Bran', 'Is my niece’s courier finished?'),
          line('Mara', 'The rider is dead. The pressure limits are wrong.'),
          line('Bran', 'You drive. She calculates. I decide which error we can afford.'),
          line('Mara', 'You have decided who pays for every one.'),
          line(
            'Rhea by message',
            'You recovered the drive. Please do not let that be the last place the test exists.',
          ),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'courier-ready',
        'order',
        'meet',
        ['Rhea', 'Ansel-drive-bike', 'player-bike', 'wallet'],
        'Both motorcycles are accessible; never restore an already-destroyed offered bike.',
      ),
      checkpoint(
        'mounted',
        'meet',
        'ride',
        ['Ansel-route', 'player-bike', 'Rhea-safe', 'drive', 'health-equipment'],
        'Rider falls remain recoverable until the target genuinely escapes.',
      ),
      checkpoint(
        'lot-ready',
        'riders',
        'lot',
        ['four-biker-poses', 'bikes', 'civilians-exits', 'health-ammo', 'drive'],
        'Dismount and cover positions cannot overlap collision props.',
      ),
    ],
    failures: [
      failure(
        'courier-escaped',
        rule('target-lost', { actor: 'LL-ARC-ANSEL', grace: 25 }),
        'mounted',
        [
          line(
            'Bran',
            'The courier has a city full of people willing to listen. I wanted one willing to stop him.',
          ),
        ],
      ),
      failure(
        'rhea-hurt',
        rule('protected-actor-harmed', { actor: 'LL-ARC-RHEA' }),
        'courier-ready',
        [
          line(
            'Mara',
            'She was trying to prevent a failure. I will not turn her into another one.',
          ),
        ],
      ),
      failure(
        'drive-burned',
        rule('objective-destroyed', { id: 'gate-pressure-drive' }),
        'lot-ready',
        [line('Mara', 'That test was the only thing here worth protecting.')],
      ),
    ],
    choices: [
      {
        id: 'test-recipient',
        stage: 'report',
        options: [
          {
            id: 'nadia',
            text: 'Give Nadia the copied pressure test.',
            effects: [rule('flag', { id: 'pressure-test-custodian', value: 'Nadia' })],
          },
          {
            id: 'tomas',
            text: 'Give Tomas the copy for an independent engineering check.',
            effects: [rule('flag', { id: 'pressure-test-custodian', value: 'Tomas' })],
          },
        ],
        outcome:
          'Both preserve the safety evidence; later interpretation/callback scene changes. Bran receives the schedule drive but not the sole copy.',
      },
    ],
    consequences: [
      'Rhea’s resistance and Ansel’s death expose the human cost of Bran’s safety regime.',
      'A copied pressure test is a durable original clue for the commissioning finale.',
    ],
    rewards: { cash: 650, unlocks: ['LL-ST-018 when LL-ST-022 complete'] },
    requiredCapabilities: [
      needs('motorcycles', 'Real mounted pursuit/falls/recovery and rider AI'),
      needs('chase', 'Three mounted reinforcements and terminal dismount'),
      needs('firearms', 'Park battle and civilian paths'),
      needs('director', 'Drive duplication is a narrative copy, never a farming pickup'),
      needs('cinematic', 'Family-engineering conflict'),
    ],
  }),

  mission(18, 'Pressure Vessel', 'LL-CHAR-010', {
    premise:
      'Bran calls a loaded truck obsolete equipment for disposal. Edda’s warning and a leaking detonator reveal its real purpose: destroying Cobalt’s evacuated contractor yard.',
    cast: ['LL-CHAR-001', 'LL-CHAR-010', 'LL-CHAR-026', 'LL-CHAR-002'],
    dependencies: {
      all: ['LL-ST-017', 'LL-ST-022'],
      externalToPack: ['LL-ST-022'],
      reason:
        'Public Terminal authenticates the disposal authorization; source counterpart also requires Logging On. Do not silently remove this outside-pack mission.',
    },
    sourceBeats: [
      beat(
        'Patron’s spouse discusses domestic/moral cost before misleading truck order',
        ['edda', 'order'],
        'Engineer Edda questions the way Bran turns compliance into ownership.',
      ),
      beat(
        'Factory pickup; explosive truck integrity and cautious drive',
        ['truck', 'route'],
        'A live impact gauge and real bridge route preserve hazardous cargo tension.',
      ),
      beat(
        'Park inside garage, trigger explosive, escape area; permanent destroyed garage and incidental cousin call',
        ['arm', 'retreat', 'detonate', 'escape'],
        'Evacuation must be verified before a safe remote detonation; rubble persists.',
      ),
    ],
    stages: [
      stage(
        'edda',
        'residence-scene',
        'saltgate-estate',
        'Speak with Edda while Bran’s office prepares the disposal papers.',
        [rule('dialogue-finished')],
        [
          line(
            'Edda',
            'I designed the gate controller. He put my name on every pressure limit he changed.',
          ),
          line('Mara', 'Why stay in the office?'),
          line(
            'Edda',
            'Because if I leave, the next signature will be somebody who never saw the water.',
          ),
          line('Mara', 'I signed a route once because I could not imagine anyone changing it.'),
          line('Edda', 'Then you know certainty is not the same thing as care.'),
        ],
      ),
      stage(
        'order',
        'contractor-order',
        'saltgate-estate',
        'Take Bran’s authenticated disposal order to the Furnace factory.',
        [rule('objective-received', { id: 'authenticated-disposal-order' })],
        [
          line('Bran', 'A truck of obsolete equipment. Dry Basin has offered to accept it.'),
          line('Mara', 'Offered in writing?'),
          line('Bran', 'The terminal authenticated the form. You have your precious record.'),
          line('Edda', 'Read the load label before you start the engine.'),
          line('Bran', 'It is a disposal run, not a lecture.'),
        ],
        { route: { from: 'saltgate-estate', to: 'furnace-factory', solver: 'legal-city-road' } },
      ),
      stage(
        'truck',
        'hazardous-vehicle-pickup',
        'furnace-factory',
        'Inspect and board the loaded flatbed; recognize the demolition circuit.',
        [
          rule('vehicle-boarded', { vehicle: 'pressure-flatbed' }),
          rule('hazard-identified', { id: 'loaded-demolition-circuit' }),
        ],
        [
          line('Mara', 'These are not obsolete parts. That is a demolition receiver.'),
          line('Bran', 'Then drive it as if the equipment has value.'),
          line('Mara', 'Is the yard empty?'),
          line('Bran', 'The disposal permit says it is.'),
          line('Mara', 'I will check before I turn anything on.'),
        ],
        {
          vehicle: {
            id: 'pressure-flatbed',
            role: 'heavy-truck',
            cargo: 'sealed-demolition-charge',
            integrity: 100,
            lowIntegrityWarningAt: 45,
            criticalAt: 20,
          },
          hud: ['truck-integrity', 'impact-warning', 'destination-evacuation-status'],
          handling: 'Ordinary truck inertia and collision, never an on-rails movie.',
        },
      ),
      stage(
        'route',
        'hazardous-drive',
        'dry-basin-yard',
        'Drive the flatbed to Dry Basin without exhausting the cargo integrity gauge.',
        [
          rule('vehicle-at-scene', { vehicle: 'pressure-flatbed', scene: 'dry-basin-yard' }),
          rule('integrity-positive', { vehicle: 'pressure-flatbed' }),
        ],
        [
          line('Felix', 'Mara, Nadia found a discount dinner. Want a ride?'),
          line('Mara', 'I am carrying a demolition circuit across the city.'),
          line(
            'Felix',
            'Then I will leave the reservation open. Call me when your work stops sounding like a warning label.',
          ),
          line('Mara', 'Read every label they give you, Felix.'),
        ],
        {
          route: {
            from: 'furnace-factory',
            to: 'dry-basin-yard',
            solver: 'legal open heavy-vehicle route via graded crossings',
            exclude: ['broken crossing', 'stairs', 'rail decks', 'unrated pedestrian alleys'],
            auditRequired:
              'Validate actual bridge/turn clearances and traffic before any runtime mission claim.',
          },
          hazard: {
            ordinaryMinorBumpLoss: 3,
            hardImpactLoss: 'proportional to real collision impulse',
            criticalWarning: 'audible receiver alarm plus subtitle/gauge pulse',
            simulationPausedDuringMenus: true,
          },
          phone:
            'Optional answer or accessible subtitle summary; driving input remains owned by the game.',
        },
      ),
      stage(
        'arm',
        'park-verify-arm',
        'dry-basin-yard',
        'Park inside the garage, verify the muster board and send the final worker outside before arming.',
        [
          rule('vehicle-parked-inside', {
            vehicle: 'pressure-flatbed',
            garage: 'demolition-bay',
            speedBelow: 2,
          }),
          rule('evacuation-verified', { civiliansRemaining: 0 }),
          rule('charge-armed'),
        ],
        [
          line('Worker', 'They told us disposal after the shift. We are still here.'),
          line('Mara', 'Get everyone past the berm. Nobody returns for a tool.'),
          line('Bran', 'The authorization says vacant.'),
          line('Mara', 'I am standing here. The authorization is lying.'),
        ],
        {
          originalAdditionalObjective:
            'Real civilian evacuation before the source-equivalent detonation; adds substance rather than replacing careful driving.',
          arming:
            'Visible receiver at driver-side exit; no touch prompt until truck stationary and muster verified.',
        },
      ),
      stage(
        'retreat',
        'blast-distance',
        'dry-basin-yard',
        'Leave the truck and reach the blast-safe berm with the remote trigger.',
        [
          rule('player-in-safe-volume', { volume: 'yard-blast-berm' }),
          rule('all-civilians-in-safe-volume'),
        ],
        [
          line('Mara', 'Everybody down behind the wall. Hands over your ears.'),
          line('Worker', 'They will say we abandoned the yard.'),
          line('Mara', 'Then tell them I made you. Keep the names on that muster sheet.'),
        ],
        {
          range:
            'Safe volume and line-of-blast tested against authored charge radius; no invisible off-screen immunity.',
        },
      ),
      stage(
        'detonate',
        'remote-detonation',
        'dry-basin-yard',
        'Activate the remote only after everyone is clear; witness the physical demolition.',
        [
          rule('charge-detonated-by-player'),
          rule('garage-destroyed', { id: 'dry-basin-demolition-bay' }),
        ],
        [
          line('Mara', 'The yard is clear. I am ending the load here.'),
          line('Bran', 'Good. Cobalt can tender for his own reconstruction.'),
          line('Mara', 'This was never a disposal contract.'),
        ],
        {
          action:
            'Actual remote input invokes existing physical explosive/fire volumes with authored structure damage; original art/audio required.',
          persistentWorldPatch: {
            id: 'dry-basin-yard-demolished',
            rubble: true,
            closedBay: true,
            dateRecorded: true,
          },
        },
      ),
      stage(
        'escape',
        'area-and-wanted-escape',
        'dispatch',
        'Leave the blast cordon, lose any active police search and preserve the muster sheet.',
        [
          rule('outside-blast-cordon'),
          rule('wanted-zero'),
          rule('evidence-secured', { id: 'yard-evacuation-muster' }),
        ],
        [
          line('Edda', 'The alarms reached my office. Tell me there were no workers.'),
          line('Mara', 'There were. They are outside now.'),
          line('Edda', 'He will call that a successful calculation.'),
          line('Mara', 'Nadia gets the muster sheet before he edits it.'),
        ],
      ),
    ],
    checkpoints: [
      checkpoint(
        'truck-ready',
        'order',
        'truck',
        ['disposal-authentication', 'truck-charge-integrity', 'wallet', 'Edda-dialogue'],
        'No claim this mission is available until separate LL-ST-022 is integrated and complete.',
      ),
      checkpoint(
        'yard-ready',
        'route',
        'arm',
        ['truck-position-integrity', 'charge-unarmed', 'workers', 'muster', 'wanted'],
        'Retains damage and workers; never auto-certifies an occupied yard as vacant.',
      ),
      checkpoint(
        'armed',
        'arm',
        'retreat',
        ['armed-charge', 'remote', 'worker-routes', 'truck', 'muster'],
        'Mid-arming Continue must neither detonate twice nor lose the remote.',
      ),
      checkpoint(
        'blast-ready',
        'retreat',
        'detonate',
        ['player-safe', 'civilians-safe', 'charge-armed', 'muster'],
        'Safe volume verified again before trigger, including after restore.',
      ),
    ],
    failures: [
      failure(
        'truck-lost',
        rule('truck-destroyed-or-abandoned', { vehicle: 'pressure-flatbed', grace: 30 }),
        'truck-ready',
        [line('Mara', 'Stop the road. Nobody approaches that load.')],
      ),
      failure(
        'integrity-exhausted',
        rule('cargo-integrity-zero', { vehicle: 'pressure-flatbed' }),
        'truck-ready',
        [line('Receiver warning', 'Circuit unstable. Clear the vehicle.')],
      ),
      failure('occupied-blast', rule('player-detonates-with-person-in-blast-volume'), 'armed', [
        line('Mara', 'The permit was a lie. I cannot make it true by leaving people inside.'),
      ]),
      failure(
        'muster-lost',
        rule('objective-destroyed', { id: 'yard-evacuation-muster' }),
        'yard-ready',
        [line('Edda', 'Keep their names. Otherwise the vacant-yard record wins.')],
      ),
    ],
    choices: [
      {
        id: 'evacuation-record',
        stage: 'escape',
        options: [
          {
            id: 'public-copy',
            text: 'Give Nadia the signed muster sheet for public release.',
            effects: [rule('flag', { id: 'yard-evacuation-evidence', value: 'public' })],
          },
          {
            id: 'protected-copy',
            text: 'Preserve worker identities while giving Nora a protected copy.',
            effects: [rule('flag', { id: 'yard-evacuation-evidence', value: 'protected' })],
          },
        ],
        outcome:
          'Both prove the yard was occupied; public exposure and worker privacy change later testimony.',
      },
    ],
    consequences: [
      'Dry Basin garage remains physically destroyed in free roam and future saves.',
      'Cobalt’s contractor feud escalates; Edda and Mara know Bran forged a vacant-yard permit.',
    ],
    rewards: {
      cash: 900,
      unlocks: ['LL-ST-020', 'LL-ST-023'],
      worldPatches: ['dry-basin-yard-demolished'],
    },
    requiredCapabilities: [
      needs('hazardousCargo', 'Impact integrity, arming, safe remote blast and rubble'),
      needs('driving', 'Heavy vehicle real cross-city route'),
      needs('passengers', 'Worker evacuation paths, not numeric vacancy switch'),
      needs('props', 'Muster evidence'),
      needs('phone', 'Incidental cousin call'),
      needs('director', 'LL-ST-022 dependency and persistent world patch'),
    ],
  }),

  mission(19, 'Second Shift', 'LL-CHAR-003', {
    premise:
      'Tomas follows counterfeit battery deliveries to a canal supplier. Mara must identify the destination before confronting the runner, with different doors and tactics if she is spotted.',
    cast: ['LL-CHAR-001', 'LL-CHAR-003', 'LL-ARC-UNA', 'LL-ARC-MIRA', 'LL-ARC-KIRO', 'LL-CHAR-002'],
    dependencies: {
      all: ['LL-ST-008'],
      availability:
        'Parallel Tomas investigation, independent of Bran’s mission order; required before LL-ST-021 later.',
    },
    sourceBeats: [
      beat(
        'Foot tail identifies supplier; phone interruption may alert runner',
        ['brief', 'identify', 'tail', 'phone'],
        'Battery courier Una changes suspicion through actual sight, spacing and distraction.',
      ),
      beat(
        'Unspotted unlocked apartment versus spotted locked-door breach',
        ['stairs', 'entry'],
        'Both lead to a full supplier battle; lock is a real shootable volume in the spotted path.',
      ),
      beat(
        'Courier/suppliers fight; premature courier harm or lost tail fails; friendship unlock',
        ['suppliers', 'report'],
        'Evidence and Tomas social contact require completing the investigation, not killing one runner early.',
      ),
    ],
    stages: [
      stage(
        'brief',
        'contact-scene',
        'tomas-cafe',
        'Ask Tomas about counterfeit battery markings and the courier’s delivery time.',
        [rule('objective-received', { id: 'counterfeit-battery-clue' })],
        [
          line(
            'Tomas',
            'The replacement packs die under load. Somebody replaced the cells and kept the relief stamp.',
          ),
          line('Mara', 'Where do they assemble them?'),
          line(
            'Tomas',
            'Una carries the returns up the canal stair. Follow her until she puts them down. Do not make her choose a new address.',
          ),
        ],
      ),
      stage(
        'identify',
        'courier-observation',
        'canal-stair',
        'Identify Una at the supply curb by the blue battery sling.',
        [rule('actor-identified', { actor: 'LL-ARC-UNA', clue: 'blue battery sling' })],
        [
          line('Una', 'Another return? Tell them it was tested before it left.'),
          line('Resident', 'Tell them my lift stopped between floors.'),
          line('Mara', 'Blue sling. Relief stamp. I have her.'),
        ],
        {
          startPlacement:
            'A required approved sidewalk approach 180–240 units from Canal Tenement Stair; exact collision-tested coordinates must be authored, not inferred from the site center.',
        },
      ),
      stage(
        'tail',
        'discreet-foot-tail',
        'canal-stair',
        'Follow Una on foot without hurting her; keep her visible often enough to identify her supplier.',
        [
          rule('target-at-supplier-building', { actor: 'LL-ARC-UNA' }),
          rule('supplier-location-discovered'),
        ],
        [
          line('Una', 'You there again? Keep walking.', 'courier-suspicion>=50'),
          line(
            'Mara',
            'She has noticed me. Stay with the route, not on her heels.',
            'courier-spotted',
          ),
          line(
            'Mara',
            'She is checking the next corner. Wait for the sightline to close.',
            'courier-unspotted',
          ),
        ],
        {
          tail: {
            comfortableDistance: [35, 100],
            suspicionFrom: [
              'visible close following',
              'weapon aimed',
              'sprinting at courier',
              'loud phone within earshot',
            ],
            suspicionFallsWhen: 'Real wall/door occlusion at a viable route distance',
            spottedAt: 100,
            spottedAlternate:
              'Una runs a longer stair approach but still leads to the supplier if tracked',
            lostGraceSeconds: 30,
            doNotDamageTargetBeforeReveal: true,
            footRoute: [
              'delivery curb',
              'tenement side walk',
              'laundry service corner',
              'canal stair front',
            ],
          },
        },
      ),
      stage(
        'phone',
        'tail-distraction-event',
        'canal-stair',
        'Handle Felix’s optional call while keeping the courier’s route.',
        [rule('phone-distraction-resolved')],
        [
          line(
            'Felix',
            'Nadia says I should walk more. You know any streets that do not end in paperwork?',
          ),
          line('Mara', 'I am following a battery courier. Quietly.'),
          line('Felix', 'That is not a recommendation I can put on a map.'),
          line('Mara', 'I will call you back when this street has an answer.'),
        ],
        {
          concurrentWith: 'tail',
          scheduling:
            'At the laundry corner, before supplier reveal; not a second serial tail run.',
          answer:
            'Speaker/handset near Una contributes a readable suspicion cue; silent decline does not.',
          mutedPhone: 'Text notification preserves the optional event without unavoidable noise.',
        },
      ),
      stage(
        'stairs',
        'vertical-follow',
        'canal-stair',
        'Follow Una up the physical tenement stairs to the supplier’s landing.',
        [rule('player-at-supplier-landing', { z: 36 }), rule('courier-entered-supplier-flat')],
        [
          line('Una', 'Return packs. Somebody followed me.', 'courier-spotted'),
          line(
            'Una',
            'Return packs. Three more failures on the lift circuit.',
            'courier-unspotted',
          ),
        ],
        {
          traversal: ['ground vestibule', '18-unit landing', '36-unit supplier landing'],
          civilianRoom: 'Separate rear residential door, not an enemy funnel.',
        },
      ),
      stage(
        'entry',
        'conditional-door-entry',
        'canal-stair',
        'Enter the supplier flat; breach the locked door only if Una warned them.',
        [rule('supplier-door-opened', { mode: 'unlocked-or-lock-destroyed' })],
        [
          line('Mira', 'Who is that? You brought an inspector?', 'courier-unspotted'),
          line('Una', 'I did not see anyone.', 'courier-unspotted'),
          line('Kiro', 'Hold the door. We move the stamps out the back.', 'courier-spotted'),
          line('Mara', 'Leave the stamps and put your weapons down.'),
        ],
        {
          branches: [
            {
              when: rule('flag-is', { id: 'courier-spotted', value: false }),
              door: 'unlocked',
              enemies: 'surprised behind workshop benches',
            },
            {
              when: rule('flag-is', { id: 'courier-spotted', value: true }),
              door: 'locked',
              requiredAction: 'Physical shot at lock hit volume or owned breaching tool',
              enemies: 'prepared workshop cover; no extra enemies replacing the base battle',
            },
          ],
        },
      ),
      stage(
        'suppliers',
        'apartment-firefight',
        'canal-stair',
        'Survive Una and the two armed suppliers, preserving the relief-stamp press and returned battery labels.',
        [
          rule('hostiles-neutralized', {
            actors: ['LL-ARC-UNA', 'canal-supplier-one', 'canal-supplier-two'],
            surrenderCounts: true,
          }),
          rule('evidence-collected', {
            ids: ['counterfeit-relief-stamp', 'battery-return-labels'],
          }),
        ],
        [
          line('Mira', 'The packs passed inspection. The stamp says so.'),
          line('Mara', 'The lift says otherwise.'),
          line('Una', 'I only delivered them!'),
          line('Mara', 'Then put the gun down and tell Tomas where the cells went.'),
        ],
        {
          encounter: {
            actors: [
              { id: 'LL-ARC-UNA', weapon: 'pistol', maySurrender: true },
              {
                id: 'canal-supplier-one',
                cast: 'LL-ARC-MIRA',
                weapon: 'compact-smg',
                cover: 'battery bench',
              },
              {
                id: 'canal-supplier-two',
                cast: 'LL-ARC-KIRO',
                weapon: 'pistol',
                cover: 'stamp cabinet',
              },
            ],
            civilianRearRoom:
              'Closed and clearly labeled; shots through it have ordinary consequences.',
            clues: ['stolen relief-stamp press', 'return labels with Corvus tender numbers'],
          },
        },
      ),
      stage(
        'report',
        'contact-evidence',
        'tomas-cafe',
        'Bring the returned labels to Tomas and arrange the next safe deliveries.',
        [
          rule('evidence-secured', { ids: ['counterfeit-relief-stamp', 'battery-return-labels'] }),
          rule('dialogue-finished'),
        ],
        [
          line(
            'Tomas',
            'The tender numbers are Corvus’s. That ties the broken machines to the same office.',
          ),
          line('Mara', 'Una may have a list of the deliveries.', 'Una-survived'),
          line('Mara', 'We have the labels. No courier left to explain them.', 'Una-dead'),
          line(
            'Tomas',
            'Then we keep every one. When you want an evening that does not involve a crate, call me.',
          ),
          line('Mara', 'I may take you up on that.'),
        ],
        {
          onComplete: [
            rule('unlock', { ids: ['Tomas-outings', 'Tomas-delivery-strand-complete'] }),
          ],
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'tail-ready',
        'identify',
        'tail',
        ['Una-route-start', 'player-sidewalk', 'suspicion', 'phone-event', 'wallet'],
        'Phone event and concurrent tail tick once each; never skip a route by serial-stage progression.',
      ),
      checkpoint(
        'landing',
        'stairs',
        'entry',
        ['Una-inside', 'spotted-flag', 'door-state', 'supplier-poses', 'health-ammo'],
        'Door and enemy preparation stay coupled to the actual spotted branch.',
      ),
      checkpoint(
        'flat-open',
        'entry',
        'suppliers',
        ['open-door-lock-health', 'three-hostiles', 'civilian-room', 'evidence', 'ammo'],
        'Broken lock remains broken; evidence appears only where it physically was.',
      ),
    ],
    failures: [
      failure(
        'courier-hurt-early',
        rule('target-hurt-before-supplier-discovery', { actor: 'LL-ARC-UNA' }),
        'tail-ready',
        [
          line(
            'Tomas',
            'One courier is not the workshop. We needed the address before the argument.',
          ),
        ],
      ),
      failure(
        'courier-lost',
        rule('tail-target-lost', { actor: 'LL-ARC-UNA', grace: 30 }),
        'tail-ready',
        [line('Mara', 'I lost the blue sling. We need another return run.')],
      ),
      failure(
        'labels-burned',
        rule('objective-destroyed', { id: 'battery-return-labels' }),
        'flat-open',
        [
          line(
            'Tomas',
            'The failed packs already lost their marks. Do not lose the people’s return labels too.',
          ),
        ],
      ),
    ],
    choices: [
      {
        id: 'tail-detection',
        stage: 'tail',
        options: [
          {
            id: 'unspotted',
            text: 'Maintain distance and use genuine occlusion.',
            effects: [rule('flag', { id: 'courier-spotted', value: false })],
          },
          {
            id: 'spotted',
            text: 'Recover the trail after Una spots you.',
            effects: [rule('flag', { id: 'courier-spotted', value: true })],
          },
        ],
        outcome:
          'Actual behavior selects door/preparation branch; detection is recoverable, early harm or a lost address is not.',
      },
      {
        id: 'courier-surrender',
        stage: 'suppliers',
        options: [
          {
            id: 'accept',
            text: 'Accept Una’s surrender if she drops the pistol.',
            effects: [rule('flag', { id: 'Una-survived', value: true })],
          },
          {
            id: 'armed-combat',
            text: 'Defend yourself while she remains armed.',
            effects: ['Actual health/death outcome recorded'],
          },
        ],
        outcome:
          'Survival adds testimony; all supplier combat positions and evidence objectives remain.',
      },
    ],
    consequences: [
      'Tomas’s parallel strand has an authenticated Corvus supply link, needed for the betrayal mission LL-ST-021.',
      'Courier detection, survival and friendship eligibility persist independently.',
    ],
    rewards: { cash: 500, unlocks: ['Tomas-outings', 'LL-ST-021 when LL-ST-020 complete'] },
    requiredCapabilities: [
      needs('tail', 'Real suspicion/occlusion and recoverable spotted route'),
      needs('phone', 'Optional concurrent distraction'),
      needs('vertical', 'Tenement stairs'),
      needs('props', 'Conditional shootable lock and labels'),
      needs('friendship', 'Tomas social unlock'),
      needs('director', 'Concurrent stage/event semantics, no generic serial shortcut'),
    ],
  }),

  mission(20, "Foreman's Fall", 'LL-CHAR-004', {
    premise:
      'Silas offers to stop Bran’s freight war by taking the contractor out of his shuttered exhibition hall. Mara fights through the building and reaches a roof where Bran tries to erase the office archive.',
    cast: ['LL-CHAR-001', 'LL-CHAR-004', 'LL-CHAR-010', 'LL-CHAR-026'],
    dependencies: {
      all: ['LL-ST-018'],
      availability:
        'Silas initiates by call. LL-ST-019 remains a separate required strand for next mission LL-ST-021.',
    },
    sourceBeats: [
      beat(
        'Adviser orders patron death for faction peace; armor message before club entry',
        ['meeting', 'arrival', 'armor'],
        'Silas uses a contractor exhibition rather than copied nightclub fiction; armor appears only after a visible arrival event.',
      ),
      beat(
        'Large main-room battle, fleeing boss, rear rooms/alley stairs and roof fight',
        ['hall', 'backstage', 'stairs', 'roof'],
        'All encounter spaces and waves are authored, including a real multi-floor pursuit.',
      ),
      beat(
        'Boss warns adviser betrayal; fatal rooftop confrontation and follow-up call',
        ['archive', 'roof', 'report'],
        'Bran names altered custody records and attacks; original archive evidence makes the warning concrete.',
      ),
      beat(
        'No monetary reward; incendiary access and betrayal mission conditional on companion strand',
        ['report'],
        'LL-ST-021 requires this mission plus LL-ST-019; earned equipment unlock does not imply implemented future content.',
      ),
    ],
    stages: [
      stage(
        'meeting',
        'adviser-scene',
        'quay-meeting',
        'Meet Silas and hear his proposal to end Bran’s escalating feud.',
        [rule('dialogue-finished')],
        [
          line('Silas', 'Cobalt wants the demolition answered. Bran wants a larger demolition.'),
          line('Mara', 'And you want the office between them.'),
          line('Silas', 'I want a city in which every shipment does not arrive with a body.'),
          line('Mara', 'You were beside him when he shot Felix.'),
          line(
            'Silas',
            'And beside Felix when he needed treatment. There will be no third position if Bran keeps signing orders.',
          ),
          line('Mara', 'Where is Edda?'),
          line('Silas', 'Away from the hall. I made certain of that.'),
        ],
      ),
      stage(
        'arrival',
        'exhibition-approach',
        'quay-exhibition',
        'Reach Quay Cabaret’s contractor exhibition and watch Bran enter through the service gate.',
        [rule('arrival-scene-seen', { actor: 'LL-CHAR-010' })],
        [
          line(
            'Bran',
            'No staff after close. No press. If Cobalt wants a meeting, he can bring a crane.',
          ),
          line('Mara', 'The service gate is still open.'),
          line(
            'Silas by message',
            'There is a protective vest by the transformer recess. Use it if you need it.',
          ),
        ],
        {
          staging:
            'Bran’s sedan parks, he walks inside and guards close the service gate. The later armor pickup is not pre-spawned at every visit.',
          weather:
            'Original advancing coastal squall with legible combat lighting; no source music or assets.',
        },
      ),
      stage(
        'armor',
        'optional-armor-pickup',
        'quay-exhibition',
        'Collect the vest behind the transformer recess, or proceed with your existing armor.',
        [
          rule('optional-pickup-resolved', {
            id: 'silas-hall-vest',
            outcomes: ['collected', 'declined', 'already-armored'],
          }),
        ],
        [
          line('Mara', 'A vest and a plan. You have had time to arrange both.'),
          line('Silas', 'I have had time to worry. They are different costs.'),
        ],
        {
          pickup: {
            id: 'silas-hall-vest',
            armor: 100,
            enabledAfter: 'arrival',
            ifArmorFull: 'May leave pickup; no duplicate armor inventory or sale value.',
            visibleMarker: true,
          },
        },
      ),
      stage(
        'hall',
        'large-interior-combat',
        'quay-exhibition',
        'Fight through the lobby and display hall while Bran retreats toward the stage.',
        [
          rule('encounter-cleared', { group: 'exhibition-front' }),
          rule('boss-at-service-exit', { actor: 'LL-CHAR-010' }),
        ],
        [
          line('Bran', 'Silas has sent a driver to negotiate?'),
          line('Mara', 'Stop signing people into your disasters.'),
          line('Bran', 'Every road here needed somebody willing to make a decision.'),
          line('Mara', 'You keep deciding other people are expendable.'),
          line('Guard', 'Close the partition! He is going out the back!'),
        ],
        {
          encounter: {
            waves: [
              {
                trigger: 'Mara enters lobby',
                actors: [
                  { id: 'hall-door-left', weapon: 'pistol', cover: 'ticket desk' },
                  { id: 'hall-door-right', weapon: 'pistol', cover: 'entry partition' },
                ],
              },
              {
                trigger: 'front cleared and display aisle entered',
                actors: [
                  {
                    id: 'hall-display-north',
                    weapon: 'compact-smg',
                    cover: 'pump demonstration wall',
                  },
                  { id: 'hall-display-south', weapon: 'shotgun', cover: 'stage apron' },
                  { id: 'hall-gallery', weapon: 'pistol', z: 18, cover: 'gallery parapet' },
                ],
              },
            ],
            boss: {
              id: 'LL-CHAR-010',
              behavior:
                'Fires from stage cover and retreats through actual rear passage after hall pressure rises.',
              prematureDeath:
                'If ordinary combat kills Bran early, preserve the archive/roof route through a triggered final archive guard; do not mark the whole mission complete at stage one.',
            },
            cover:
              'Original display machines sized to physical ray/collision volumes, not decoration-only meshes.',
          },
        },
      ),
      stage(
        'backstage',
        'rear-combat-pursuit',
        'quay-exhibition',
        'Follow Bran through the kitchen passage and clear the service alley guards.',
        [rule('encounter-cleared', { group: 'exhibition-rear' }), rule('player-at-service-stair')],
        [
          line('Bran', 'You think the tender dies with the man who signs it?'),
          line('Mara', 'I think the people on the forms get to stop being your equipment.'),
          line('Bran', 'Then ask Silas who moved the archive. Ask him before he moves you.'),
        ],
        {
          encounter: {
            actors: [
              { id: 'hall-kitchen', weapon: 'shotgun', cover: 'masonry kitchen return' },
              { id: 'hall-alley-one', weapon: 'pistol', cover: 'loading bin' },
              { id: 'hall-alley-two', weapon: 'compact-smg', cover: 'stair base' },
            ],
            escapeRoute: ['rear service door', 'kitchen passage', 'service alley', 'stair base'],
          },
          alternateDialogue: [
            line(
              'Archive guard',
              'Quinn moved the originals already. Corvus only kept the access copy.',
              'Bran-dead-before-roof',
            ),
          ],
        },
      ),
      stage(
        'stairs',
        'vertical-combat',
        'quay-exhibition',
        'Climb the service stairs, clear the landing guard and reach the archive roof.',
        [rule('guard-neutralized', { id: 'hall-stair-guard' }), rule('player-at-roof', { z: 54 })],
        [
          line('Mara', 'Edda, the hall has an archive relay. Who controls it?'),
          line(
            'Edda',
            'Bran can erase the local copy. The custody register was transferred last month.',
          ),
          line('Mara', 'To whom?'),
          line('Edda', 'Quinn Risk Management. I thought you knew.'),
        ],
        {
          traversal: {
            supportedFloors: [0, 18, 36, 54],
            continuousStairs: true,
            landingGuard: { id: 'hall-stair-guard', weapon: 'pistol', z: 36, cover: 'stair wall' },
            noElevatorShortcut:
              'Roof access is the authored stair pursuit, not a teleport interaction.',
          },
        },
      ),
      stage(
        'archive',
        'roof-evidence',
        'quay-exhibition',
        'Disable the archive erasure relay and preserve its custody register.',
        [
          rule('relay-disabled', { id: 'archive-erasure-relay' }),
          rule('evidence-collected', { id: 'quinn-custody-register' }),
        ],
        [
          line(
            'Bran',
            'He owns the archive. Your convoy, the permits, every inconvenient signature.',
            'Bran-alive',
          ),
          line('Mara', 'And you kept signing them.', 'Bran-alive'),
          line(
            'Bran',
            'Because I knew what I was buying. He lets you call it a favor.',
            'Bran-alive',
          ),
          line(
            'Mara',
            'Quinn has custody. That is why every road leads through his office.',
            'Bran-dead-before-roof',
          ),
        ],
        {
          action:
            'An actual roof cabinet interaction disables the erasure circuit while a live target has sight; progress stops on damage, saved erasure clock never resets for free.',
          clock: { seconds: 90, startsOn: 'roof access', pausesWithGame: true },
          ifBranAlreadyDead: 'Final archive guard is the armed defender; register still required.',
        },
      ),
      stage(
        'roof',
        'fatal-rooftop-combat',
        'quay-exhibition',
        'Survive Bran’s final armed attack and leave the archive register intact.',
        [
          rule('actor-dead', { actor: 'LL-CHAR-010' }),
          rule('evidence-intact', { id: 'quinn-custody-register' }),
          rule('conditional-hostile-neutralized', {
            actor: 'roof-archive-guard',
            enabledWhen: 'Bran-dead-before-roof',
          }),
        ],
        [
          line(
            'Bran',
            'If you take that register, Quinn will give you the next disposal order.',
            'Bran-alive',
          ),
          line('Mara', 'Then I will read who signed it.', 'Bran-alive'),
          line('Bran', 'You will read it from underneath.', 'Bran-alive'),
        ],
        {
          encounter: {
            actor: 'LL-CHAR-010',
            weapon: 'pistol',
            tactics:
              'Shoots from relay plinth, then rushes along roof parapet; real combat death/fall, no copied execution animation.',
            roofHasGuardrailsExcept:
              'One authored damaged service edge, visible and physically collidable.',
            replacementGuard: {
              id: 'roof-archive-guard',
              weapon: 'pistol',
              enabledWhen: 'Bran-dead-before-roof',
              trigger:
                'Bran dies before roof; record flag and activate this existing scheduled defender at the roof relay.',
            },
            ifAlreadyDead:
              'Combat completion condition is satisfied only after archive guard is neutralized; no boss respawn.',
          },
          originalAdditionalObjective:
            'Archive preservation concretizes the source warning and feeds the upcoming betrayal.',
        },
      ),
      stage(
        'report',
        'adviser-call-aftermath',
        'dispatch',
        'Tell Silas Bran is dead and secure the custody register with an independent contact.',
        [
          rule('call-resolved', { topic: 'Bran-death' }),
          rule('evidence-secured', { id: 'quinn-custody-register' }),
        ],
        [
          line('Silas', 'Is it over?'),
          line('Mara', 'Bran is dead. The archive is not.'),
          line('Silas', 'Good. Records will be useful when we settle the damage.'),
          line('Mara', 'His custody register says you already own them.'),
          line(
            'Silas',
            'I manage risk, Mara. Sometimes that means keeping the records away from a man who will burn them.',
          ),
          line('Mara', 'I am keeping this one away from both of you.'),
          line(
            'Tomas',
            'Bring it here. We have copies of the battery labels. We will see which numbers agree.',
            'LL-ST-019-complete',
          ),
          line(
            'Nadia',
            'Keep the original. Tomas is still tracing the supply records; do not let Quinn rush the comparison.',
            'LL-ST-019-incomplete',
          ),
        ],
        {
          onComplete: [
            rule('unlock-weapon-role', { role: 'incendiary-bottle' }),
            rule('unlock-when', { id: 'LL-ST-021', all: ['LL-ST-020', 'LL-ST-019'] }),
          ],
        },
      ),
    ],
    checkpoints: [
      checkpoint(
        'hall-ready',
        'armor',
        'hall',
        [
          'Bran-inside',
          'vest-picked-or-declined',
          'front-guards',
          'player-health-armor-ammo',
          'weather',
        ],
        'A declined/collected vest never duplicates through retry.',
      ),
      checkpoint(
        'rear-ready',
        'hall',
        'backstage',
        ['Bran-life-and-route', 'cleared-front', 'rear-guards', 'health-ammo', 'roof-register'],
        'Early boss death stays dead; alternate archive defender preserves the complete traversal.',
      ),
      checkpoint(
        'stairs-ready',
        'backstage',
        'stairs',
        ['cleared-rear', 'Bran-or-archive-guard', 'stair-guard', 'health-ammo'],
        'Remaining guards restore outside collision walls.',
      ),
      checkpoint(
        'roof-ready',
        'stairs',
        'archive',
        [
          'supported-player-roof',
          'relay-clock',
          'Bran-life',
          'archive-guard',
          'register',
          'ammo-health',
        ],
        'Deadline begins when control returns; Continue preserves elapsed erasure time.',
      ),
    ],
    failures: [
      failure('archive-erased', rule('clock-expired', { clock: 'archive-erasure' }), 'roof-ready', [
        line('Mara', 'The local copy is gone. We need to reach the relay before he finishes.'),
      ]),
      failure(
        'register-destroyed',
        rule('objective-destroyed', { id: 'quinn-custody-register' }),
        'roof-ready',
        [line('Mara', 'The warning meant nothing if I cannot show who owns the record.')],
      ),
      failure(
        'boss-escaped',
        rule('boss-left-authored-roof-exit', { actor: 'LL-CHAR-010', grace: 20 }),
        'stairs-ready',
        [line('Silas', 'If he leaves the hall, he will start another contract before morning.')],
      ),
    ],
    choices: [
      {
        id: 'armor-use',
        stage: 'armor',
        options: [
          {
            id: 'collect',
            text: 'Take Silas’s offered vest.',
            effects: ['Actual pickup and armor amount'],
          },
          {
            id: 'decline',
            text: 'Keep your existing protection and leave the vest.',
            effects: ['No hidden defense bonus or cash substitute'],
          },
        ],
        outcome: 'Both play the full battle; offered protection is a real optional pickup.',
      },
      {
        id: 'register-custodian',
        stage: 'report',
        options: [
          {
            id: 'nadia',
            text: 'Give Nadia the original custody register.',
            effects: [rule('flag', { id: 'custody-register-holder', value: 'Nadia' })],
          },
          {
            id: 'nora',
            text: 'Give Nora the original for archive authentication.',
            effects: [rule('flag', { id: 'custody-register-holder', value: 'Nora' })],
          },
        ],
        outcome:
          'Independent custody persists; neither trusts Silas with the only copy. Future betrayal dialogue changes.',
      },
    ],
    consequences: [
      'Bran is permanently dead. Edda’s engineering testimony and Silas’s archive custody become live leads.',
      'Bad Receipts LL-ST-021 requires the separately completed Second Shift; forthcoming betrayal is not an ending popup in this mission.',
    ],
    rewards: {
      cash: 0,
      unlocks: ['incendiary-bottle-role', 'LL-ST-021 when LL-ST-019 complete'],
      flags: ['bran-dead', 'quinn-custody-discovered'],
    },
    requiredCapabilities: [
      needs('interior', 'Large exhibition/lobby/stage/kitchen/alley/roof'),
      needs('vertical', 'Actual three-level service stairs and roof edge'),
      needs(
        'firearms',
        'Nine guards plus boss or replacement archive defender; height-aware cover',
      ),
      needs('props', 'Optional armor, erasure relay and register'),
      needs('cinematic', 'Adviser meeting and original rooftop outcome'),
      needs('director', 'Early boss death alternative, clock and parallel strand gate'),
    ],
  }),
]);

export const FIRST_ARC_MANIFEST = freeze({
  id: 'lowlight-first-arc',
  schemaVersion: 1,
  status: 'authored-unintegrated',
  sourceMissionRange: ['LL-ST-001', 'LL-ST-020'],
  expectedSourceMissionCount: 20,
  implementationClaim:
    'Partial Night Crossing integration through the real director/physical adapters, companions, ferry/home scenes, shelter ledgers and frontend. The other nineteen missions remain unintegrated; all records retain runtimeValidated:false and earn no source completion credit.',
  additionalOnboardingIds: ['first-shift', 'collection-day', 'cold-freight', 'glass-house'],
  additionalOnboardingSourceCredit: 0,
  dependencyPolicy:
    'Authored original graph; catalogue order is not chronology. Out-of-pack dependencies remain explicit.',
  stagePolicy:
    'Default next is the next enabled serial stage; branch targets override it only after all completion rules pass. Unknown predicates/actions/capabilities block integration.',
  concurrentStagePolicy:
    'A stage with concurrentWith is an event running alongside that named stage, excluded from the serial successor order. Its completion must be resolved before the owner stage completes; it cannot rerun the tail or teleport its target.',
  checkpointPolicy:
    'The implicit start checkpoint precedes stage one. Explicit checkpoints supplement it; replay rolls back only the named attempt, never prior completed missions.',
  scenePolicy:
    'Resolve actual anchor and collision/access volumes; proposals are not active WORLD objects. No marker relocation silently replaces missing geometry.',
  economyPolicy:
    'Reward amounts, original mission fees and clocks are authored tuning proposals. They require natural play/economy validation and are not asserted as source prices or balanced release values.',
  evidenceBoundary:
    'Source comparison relies on indexed articles because direct Fandom access was blocked. Incidental source cinematics/failure edge cases need further audit.',
  nextPack: 'LL-ST-021 and later, authored separately; all-source campaign remains incomplete.',
});
